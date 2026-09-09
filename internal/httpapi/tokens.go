package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/auth"
)

func (h *Handler) listAPITokens(c *gin.Context) {
	user, _ := currentUser(c)
	rows, err := h.apiTokens.List(c, user.ID)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"tokens": rows, "mcp_url": "/mcp", "openapi_url": "/api/v1/openapi.json", "docs_url": "/api/v1/docs"}})
}

func (h *Handler) createAPIToken(c *gin.Context) {
	user, _ := currentUser(c)
	var input struct {
		Name      string `json:"name" form:"name"`
		ExpiresAt string `json:"expires_at" form:"expires_at"`
	}
	_ = c.ShouldBind(&input)
	var expires *time.Time
	if raw := strings.TrimSpace(input.ExpiresAt); raw != "" {
		parsed, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			parsed, err = time.Parse("2006-01-02", raw)
		}
		if err != nil {
			legacyError(c, "过期时间格式无效")
			return
		}
		expires = &parsed
	}
	plain, row, err := h.apiTokens.Create(c, user.ID, input.Name, c.ClientIP(), expires)
	if errors.Is(err, auth.ErrAPITokenLimit) {
		legacyError(c, "令牌数量已达上限")
		return
	}
	if err != nil {
		legacyError(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "令牌已创建，请立即复制保存", "data": gin.H{"id": row.ID, "name": row.Name, "token": plain, "token_prefix": row.TokenPrefix, "expires_at": row.ExpiresAt, "created_at": row.CreatedAt}})
}

func (h *Handler) revokeAPIToken(c *gin.Context) {
	user, _ := currentUser(c)
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	if err := h.apiTokens.Revoke(c, user.ID, id); err != nil {
		legacyError(c, "令牌不存在或已撤销")
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "已撤销"})
}
