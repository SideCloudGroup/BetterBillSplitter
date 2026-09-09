package httpapi

import (
	_ "embed"
	"net/http"

	"github.com/gin-gonic/gin"
)

//go:embed openapi.json
var openAPISpec []byte

//go:embed swagger.html
var swaggerHTML []byte

func (h *Handler) serveOpenAPI(c *gin.Context) {
	c.Data(http.StatusOK, "application/json; charset=utf-8", openAPISpec)
}

func (h *Handler) serveSwagger(c *gin.Context) {
	c.Data(http.StatusOK, "text/html; charset=utf-8", swaggerHTML)
}
