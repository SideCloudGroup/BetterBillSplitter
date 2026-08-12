package httpapi

import (
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/appconfig"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/auth"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/currency"
)

func TestRegisterAllRoutesDoesNotConflict(t *testing.T) {
	sqlDB, _, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	cfg := appconfig.Config{JWT: appconfig.JWTConfig{
		Secret: "route-test-secret", AccessTTL: time.Minute, RefreshTTL: time.Hour,
		RefreshCookieName: "refresh_token", RefreshCookiePath: "/api",
	}}
	tokens, err := auth.NewTokenService(db, cfg.JWT)
	if err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	NewHandler(db, tokens, currency.NewService(nil, "test:"), cfg).Register(engine)
	routes := make(map[string]bool)
	for _, route := range engine.Routes() {
		routes[route.Method+" "+route.Path] = true
	}
	expected := []string{
		"GET /captcha", "GET /api/auth/bootstrap", "POST /api/auth/login", "POST /api/auth/register",
		"POST /api/auth/refresh", "POST /api/auth/logout", "GET /api/auth/webauthn/challenge",
		"POST /api/auth/webauthn/verify", "POST /api/auth/mfa/totp", "POST /api/auth/mfa/fido/challenge",
		"POST /api/auth/mfa/fido/verify", "GET /api/party/invite/:code",
		"GET /api/user", "GET /api/user/payment/party/:partyId", "GET /api/user/payment",
		"GET /api/user/item/add", "POST /api/user/item/add", "GET /api/user/item/party/:partyId",
		"POST /api/user/item/:id", "DELETE /api/user/item/:id", "GET /api/user/item",
		"POST /api/user/logout", "GET /api/user/profile", "POST /api/user/profile",
		"GET /api/user/webauthn_reg", "POST /api/user/webauthn_reg", "DELETE /api/user/webauthn_reg/:id",
		"GET /api/user/totp_reg", "POST /api/user/totp_reg", "DELETE /api/user/totp_reg",
		"GET /api/user/fido_reg", "POST /api/user/fido_reg", "DELETE /api/user/fido_reg/:id",
		"GET /api/user/party/create", "GET /api/user/party/join", "POST /api/user/party/join",
		"GET /api/user/party/:partyId/users", "GET /api/user/party/:partyId/info",
		"GET /api/user/party/:partyId/edit", "POST /api/user/party/:partyId/update",
		"POST /api/user/party/:partyId/leave", "DELETE /api/user/party/:partyId/member/:userId",
		"POST /api/user/party/:partyId/archive", "GET /api/user/party/:partyId/archive/download",
		"POST /api/user/party/validate-timezone", "GET /api/user/party/search-timezones",
		"POST /api/user/party/currency-info", "GET /api/user/party/:partyId/bestpay/download",
		"POST /api/user/party/:partyId/bestpay/clear", "GET /api/user/party/:partyId/bestpay",
		"GET /api/user/party/:partyId/items", "DELETE /api/user/party/:partyId",
		"GET /api/user/party/:partyId", "GET /api/user/party", "POST /api/user/party",
		"GET /api/admin", "GET /api/admin/user", "POST /api/admin/user/change-password",
		"POST /api/admin/user/toggle-admin", "GET /api/admin/party/:partyId/members",
		"POST /api/admin/party/members", "GET /api/admin/party", "GET /api/admin/currency/add-form",
		"POST /api/admin/currency/add", "GET /api/admin/currency/edit-form", "POST /api/admin/currency/edit",
		"DELETE /api/admin/currency/delete", "GET /api/admin/currencies", "GET /api/admin/setting",
		"POST /api/admin/setting",
	}
	for _, route := range expected {
		if !routes[route] {
			t.Errorf("legacy API route is missing: %s", route)
		}
	}
}
