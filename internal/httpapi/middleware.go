package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/model"
)

const userContextKey = "authenticated_user"

type requestUserKey struct{}

func (h *Handler) AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "未授权"})
			return
		}
		userID, err := h.tokens.VerifyAccessToken(strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "令牌无效或已过期"})
			return
		}
		var user model.User
		if err := h.db.WithContext(c).Table(h.table("user")).First(&user, userID).Error; err != nil || !user.Enable {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"ok": false, "error": "用户不可用"})
			return
		}
		setRequestUser(c, user)
		c.Next()
	}
}

func (h *Handler) PATRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			c.Header("WWW-Authenticate", `Bearer realm="BetterBillSplitter"`)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "未授权"})
			return
		}
		plain := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
		user, err := h.apiTokens.Lookup(c, plain)
		if err != nil {
			c.Header("WWW-Authenticate", `Bearer realm="BetterBillSplitter"`)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "令牌无效或已过期"})
			return
		}
		setRequestUser(c, user)
		c.Next()
	}
}

func setRequestUser(c *gin.Context, user model.User) {
	c.Set(userContextKey, user)
	c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), requestUserKey{}, user))
}

func userFromContext(ctx context.Context) (model.User, bool) {
	user, ok := ctx.Value(requestUserKey{}).(model.User)
	return user, ok
}

func (h *Handler) AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := currentUser(c)
		if !ok || !user.IsAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"ok": false, "error": "需要管理员权限"})
			return
		}
		c.Next()
	}
}

func currentUser(c *gin.Context) (model.User, bool) {
	value, ok := c.Get(userContextKey)
	if !ok {
		return model.User{}, false
	}
	user, ok := value.(model.User)
	return user, ok
}
