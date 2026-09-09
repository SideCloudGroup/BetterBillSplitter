package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/ledger"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/model"
)

const mcpProtocolVersion = "2026-07-28"

type partyIDArgs struct {
	PartyID uint64 `json:"party_id" jsonschema:"派对ID"`
}

type createItemArgs struct {
	PartyID     uint64              `json:"party_id" jsonschema:"派对ID"`
	Description string              `json:"description" jsonschema:"账目描述"`
	Currency    string              `json:"currency" jsonschema:"货币代码如cny"`
	Amount      string              `json:"amount,omitempty" jsonschema:"均摊时每人金额"`
	UserIDs     []uint64            `json:"user_ids,omitempty" jsonschema:"均摊付款人用户ID列表"`
	Splits      []ledger.SplitInput `json:"splits,omitempty" jsonschema:"按人指定金额"`
}

type updatePaidArgs struct {
	ID   uint64 `json:"id" jsonschema:"账目ID"`
	Paid bool   `json:"paid" jsonschema:"是否已付"`
}

func (h *Handler) registerMCP(engine *gin.Engine) {
	server := mcp.NewServer(&mcp.Implementation{Name: "better-bill-splitter", Version: "2.0.0"}, &mcp.ServerOptions{
		Instructions: "BetterBillSplitter 派对分账。使用 PAT Bearer 鉴权。只支持 MCP 协议 2026-07-28，无 session。",
		Capabilities: &mcp.ServerCapabilities{},
	})
	h.addMCPTools(server)
	inner := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server {
		return server
	}, &mcp.StreamableHTTPOptions{Stateless: true, JSONResponse: true})
	engine.Any("/mcp", h.PATRequired(), gin.WrapH(mcpProtocolGate{next: inner}))
}

func (h *Handler) addMCPTools(server *mcp.Server) {
	mcp.AddTool(server, &mcp.Tool{Name: "get_me", Description: "当前 PAT 对应用户"}, func(ctx context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, ledger.UserView, error) {
		user, err := requireMCPUser(ctx)
		if err != nil {
			return nil, ledger.UserView{}, err
		}
		return nil, h.ledger.Me(ctx, user), nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "list_parties", Description: "列出当前用户加入或拥有的派对"}, func(ctx context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, map[string]any, error) {
		user, err := requireMCPUser(ctx)
		if err != nil {
			return nil, nil, err
		}
		rows, err := h.ledger.ListParties(ctx, user)
		if err != nil {
			return nil, nil, err
		}
		return nil, map[string]any{"parties": rows}, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "get_party", Description: "获取派对详情"}, func(ctx context.Context, _ *mcp.CallToolRequest, in partyIDArgs) (*mcp.CallToolResult, map[string]any, error) {
		user, err := requireMCPUser(ctx)
		if err != nil {
			return nil, nil, err
		}
		row, err := h.ledger.GetParty(ctx, user, in.PartyID)
		if err != nil {
			return nil, nil, err
		}
		return nil, map[string]any{"party": row}, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "list_members", Description: "列出派对成员"}, func(ctx context.Context, _ *mcp.CallToolRequest, in partyIDArgs) (*mcp.CallToolResult, map[string]any, error) {
		user, err := requireMCPUser(ctx)
		if err != nil {
			return nil, nil, err
		}
		rows, err := h.ledger.ListMembers(ctx, user, in.PartyID)
		if err != nil {
			return nil, nil, err
		}
		return nil, map[string]any{"members": rows}, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "list_items", Description: "列出派对全部账目"}, func(ctx context.Context, _ *mcp.CallToolRequest, in partyIDArgs) (*mcp.CallToolResult, map[string]any, error) {
		user, err := requireMCPUser(ctx)
		if err != nil {
			return nil, nil, err
		}
		rows, err := h.ledger.ListItems(ctx, user, in.PartyID)
		if err != nil {
			return nil, nil, err
		}
		return nil, map[string]any{"items": rows}, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "create_item", Description: "在派对中创建分账账目。可按 user_ids+amount 均摊，或用 splits 指定每人金额。"}, func(ctx context.Context, _ *mcp.CallToolRequest, in createItemArgs) (*mcp.CallToolResult, map[string]any, error) {
		user, err := requireMCPUser(ctx)
		if err != nil {
			return nil, nil, err
		}
		count, err := h.ledger.CreateItem(ctx, user, in.PartyID, ledger.CreateItemInput{
			Description: in.Description, Currency: in.Currency, Amount: in.Amount, UserIDs: in.UserIDs, Splits: in.Splits,
		})
		if err != nil {
			return nil, nil, err
		}
		return nil, map[string]any{"count": count}, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "update_item_paid", Description: "由收款发起方标记账目已付或未付"}, func(ctx context.Context, _ *mcp.CallToolRequest, in updatePaidArgs) (*mcp.CallToolResult, map[string]any, error) {
		user, err := requireMCPUser(ctx)
		if err != nil {
			return nil, nil, err
		}
		if err := h.ledger.UpdateItemPaid(ctx, user, in.ID, in.Paid); err != nil {
			return nil, nil, err
		}
		return nil, map[string]any{"paid": in.Paid}, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "list_payments", Description: "列出当前用户在该派对的待付款"}, func(ctx context.Context, _ *mcp.CallToolRequest, in partyIDArgs) (*mcp.CallToolResult, map[string]any, error) {
		user, err := requireMCPUser(ctx)
		if err != nil {
			return nil, nil, err
		}
		rows, total, err := h.ledger.ListPayments(ctx, user, in.PartyID)
		if err != nil {
			return nil, nil, err
		}
		return nil, map[string]any{"items": rows, "total_amount": total}, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "get_settlement", Description: "计算派对未结清账目的最优支付方案"}, func(ctx context.Context, _ *mcp.CallToolRequest, in partyIDArgs) (*mcp.CallToolResult, ledger.SettlementView, error) {
		user, err := requireMCPUser(ctx)
		if err != nil {
			return nil, ledger.SettlementView{}, err
		}
		row, err := h.ledger.GetSettlement(ctx, user, in.PartyID)
		if err != nil {
			return nil, ledger.SettlementView{}, err
		}
		return nil, row, nil
	})
}

func requireMCPUser(ctx context.Context) (model.User, error) {
	user, ok := userFromContext(ctx)
	if !ok {
		return model.User{}, &ledger.Error{Status: 401, Message: "未授权"}
	}
	return user, nil
}

type mcpProtocolGate struct {
	next http.Handler
}

func (g mcpProtocolGate) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Mcp-Session-Id") != "" {
		http.Error(w, "MCP sessions are not supported", http.StatusBadRequest)
		return
	}
	if ver := r.Header.Get("MCP-Protocol-Version"); ver != "" && ver != mcpProtocolVersion {
		http.Error(w, "unsupported MCP protocol version", http.StatusBadRequest)
		return
	}
	if r.Method == http.MethodPost && r.Body != nil {
		body, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
		_ = r.Body.Close()
		if err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		var probe struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
		}
		if json.Unmarshal(body, &probe) == nil && probe.Method == "initialize" {
			id := probe.ID
			if len(id) == 0 {
				id = []byte("null")
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":` + string(id) + `,"error":{"code":-32022,"message":"Unsupported protocol version; use 2026-07-28"}}`))
			return
		}
	}
	g.next.ServeHTTP(w, r)
}
