package httpapi

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/ledger"
)

func (h *Handler) registerV1Routes(engine *gin.Engine) {
	engine.GET("/api/v1/openapi.json", h.serveOpenAPI)
	engine.GET("/api/v1/docs", h.serveSwagger)
	group := engine.Group("/api/v1", h.PATRequired())
	group.GET("/me", h.v1Me)
	group.GET("/parties", h.v1ListParties)
	group.GET("/parties/:partyId", h.v1GetParty)
	group.GET("/parties/:partyId/members", h.v1ListMembers)
	group.GET("/parties/:partyId/items", h.v1ListItems)
	group.POST("/parties/:partyId/items", h.v1CreateItem)
	group.GET("/parties/:partyId/payments", h.v1ListPayments)
	group.GET("/parties/:partyId/settlement", h.v1GetSettlement)
	group.PATCH("/items/:id", h.v1UpdateItem)
}

func v1OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": data})
}

func v1Fail(c *gin.Context, err error) {
	if e := ledger.AsError(err); e != nil {
		c.JSON(e.Status, gin.H{"ok": false, "error": e.Message})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": err.Error()})
}

func (h *Handler) v1Me(c *gin.Context) {
	user, _ := currentUser(c)
	v1OK(c, h.ledger.Me(c, user))
}

func (h *Handler) v1ListParties(c *gin.Context) {
	user, _ := currentUser(c)
	rows, err := h.ledger.ListParties(c, user)
	if err != nil {
		v1Fail(c, err)
		return
	}
	v1OK(c, gin.H{"parties": rows})
}

func (h *Handler) v1GetParty(c *gin.Context) {
	user, _ := currentUser(c)
	id, ok := parsePathID(c.Param("partyId"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "ID无效"})
		return
	}
	row, err := h.ledger.GetParty(c, user, id)
	if err != nil {
		v1Fail(c, err)
		return
	}
	v1OK(c, gin.H{"party": row})
}

func (h *Handler) v1ListMembers(c *gin.Context) {
	user, _ := currentUser(c)
	id, ok := parsePathID(c.Param("partyId"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "ID无效"})
		return
	}
	rows, err := h.ledger.ListMembers(c, user, id)
	if err != nil {
		v1Fail(c, err)
		return
	}
	v1OK(c, gin.H{"members": rows})
}

func (h *Handler) v1ListItems(c *gin.Context) {
	user, _ := currentUser(c)
	id, ok := parsePathID(c.Param("partyId"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "ID无效"})
		return
	}
	rows, err := h.ledger.ListItems(c, user, id)
	if err != nil {
		v1Fail(c, err)
		return
	}
	v1OK(c, gin.H{"items": rows})
}

func (h *Handler) v1CreateItem(c *gin.Context) {
	user, _ := currentUser(c)
	id, ok := parsePathID(c.Param("partyId"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "ID无效"})
		return
	}
	var input ledger.CreateItemInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "请求格式错误"})
		return
	}
	count, err := h.ledger.CreateItem(c, user, id, input)
	if err != nil {
		v1Fail(c, err)
		return
	}
	v1OK(c, gin.H{"count": count})
}

func (h *Handler) v1ListPayments(c *gin.Context) {
	user, _ := currentUser(c)
	id, ok := parsePathID(c.Param("partyId"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "ID无效"})
		return
	}
	rows, total, err := h.ledger.ListPayments(c, user, id)
	if err != nil {
		v1Fail(c, err)
		return
	}
	v1OK(c, gin.H{"items": rows, "total_amount": total})
}

func (h *Handler) v1GetSettlement(c *gin.Context) {
	user, _ := currentUser(c)
	id, ok := parsePathID(c.Param("partyId"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "ID无效"})
		return
	}
	row, err := h.ledger.GetSettlement(c, user, id)
	if err != nil {
		v1Fail(c, err)
		return
	}
	v1OK(c, row)
}

func (h *Handler) v1UpdateItem(c *gin.Context) {
	user, _ := currentUser(c)
	id, ok := parsePathID(c.Param("id"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "ID无效"})
		return
	}
	var input struct {
		Paid *bool `json:"paid"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.Paid == nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "请提供 paid"})
		return
	}
	if err := h.ledger.UpdateItemPaid(c, user, id, *input.Paid); err != nil {
		v1Fail(c, err)
		return
	}
	v1OK(c, gin.H{"paid": *input.Paid})
}

func parsePathID(value string) (uint64, bool) {
	id, err := strconv.ParseUint(value, 10, 64)
	return id, err == nil && id > 0
}
