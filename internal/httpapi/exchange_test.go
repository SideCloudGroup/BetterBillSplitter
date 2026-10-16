package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/appconfig"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/auth"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/currency"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/model"
)

// Every upstream request traverses the real HTTP client and JSON decoder, but
// goes to a local server. No test needs Internet, credentials, or a live DB.
// Tests using this helper must remain sequential: DefaultTransport is global.
type exchangeTestTransport struct {
	target *url.URL
	base   http.RoundTripper
}

func (tr exchangeTestTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL.Host != "cdn.jsdelivr.net" && req.URL.Host != "latest.currency-api.pages.dev" {
		return nil, fmt.Errorf("unexpected external request: %s", req.URL)
	}
	request := req.Clone(req.Context())
	request.URL.Scheme, request.URL.Host = tr.target.Scheme, tr.target.Host
	return tr.base.RoundTrip(request)
}

func localExchange(t *testing.T, handler http.HandlerFunc) *currency.Service {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	target, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	original := http.DefaultTransport
	http.DefaultTransport = exchangeTestTransport{target: target, base: original}
	t.Cleanup(func() { http.DefaultTransport = original })
	return currency.NewService(nil, "test:")
}

func exchangePayload(w http.ResponseWriter) {
	fmt.Fprintf(w, `{"date":%q,"cny":{"cny":1,"usd":0.137931}}`, time.Now().UTC().Format("2006-01-02"))
}

func exchangeTestHandler(t *testing.T, exchange *currency.Service) (*Handler, sqlmock.Sqlmock) {
	t.Helper()
	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { sqlDB.Close() })
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	cfg := appconfig.Config{JWT: appconfig.JWTConfig{Secret: "exchange-tests", AccessTTL: time.Minute, RefreshTTL: time.Hour}}
	cfg.Database.TablePrefix = "test_"
	tokens, err := auth.NewTokenService(db, cfg.JWT, cfg.Database.TablePrefix)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Error(err)
		}
	})
	gin.SetMode(gin.TestMode)
	return NewHandler(db, tokens, exchange, cfg), mock
}

func expectCurrencies(mock sqlmock.Sqlmock) {
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `test_currencies`")).
		WillReturnRows(sqlmock.NewRows([]string{"id", "code", "name", "symbol", "is_active"}).AddRow(1, "cny", "人民币", "¥", true))
}

func TestItemExchangeThroughBothHTTPEntrypoints(t *testing.T) {
	for _, entrypoint := range []string{"web", "v1"} {
		for _, scenario := range []struct {
			name, unit string
			splits     bool
			fail       bool
			amounts    []string
			calls      int32
		}{
			{name: "foreign currency", unit: "usd", amounts: []string{"99.97"}, calls: 1},
			{name: "custom split", unit: "usd", splits: true, amounts: []string{"99.97", "50.02"}, calls: 1},
			{name: "base currency bypasses upstream", unit: "cny", fail: true, amounts: []string{"13.79"}},
			{name: "both sources unavailable never writes", unit: "usd", fail: true, calls: 2},
			{name: "missing target rate never writes", unit: "jpy", calls: 1},
		} {
			t.Run(entrypoint+"/"+scenario.name, func(t *testing.T) {
				var calls atomic.Int32
				exchange := localExchange(t, func(w http.ResponseWriter, _ *http.Request) {
					calls.Add(1)
					if scenario.fail {
						http.Error(w, "unavailable", 503)
						return
					}
					exchangePayload(w)
				})
				h, mock := exchangeTestHandler(t, exchange)
				mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `test_party`")).WithArgs(9, 1).
					WillReturnRows(sqlmock.NewRows([]string{"id", "base_currency", "supported_currencies", "timezone"}).AddRow(9, "cny", `["cny","usd","jpy"]`, "UTC"))
				mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM `test_party_member`")).WithArgs(9, 1).
					WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
				if scenario.splits {
					mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM `test_party_member`")).WithArgs(9, 2, 3).
						WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))
				} else {
					mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM `test_party_member`")).WithArgs(9, 2).
						WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
				}
				success := len(scenario.amounts) > 0
				if success {
					mock.ExpectBegin()
					for i, amount := range scenario.amounts {
						mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `test_item`")).
							WithArgs(i+2, "dinner", sqlmock.AnyArg(), amount, false, 1, 9).WillReturnResult(sqlmock.NewResult(int64(i+1), 1))
					}
					mock.ExpectCommit()
				}
				engine := gin.New()
				engine.Use(func(c *gin.Context) { setRequestUser(c, model.User{ID: 1}) })
				var request *http.Request
				if entrypoint == "web" {
					engine.POST("/item", h.addItem)
					form := url.Values{"party_id": {"9"}, "description": {"dinner"}, "unit": {scenario.unit}, "amount": {"13.79"}, "users": {"[2]"}}
					if scenario.splits {
						form.Set("splits", `[{"user_id":2,"amount":"13.79"},{"user_id":3,"amount":"6.90"}]`)
					}
					request = httptest.NewRequest(http.MethodPost, "/item", strings.NewReader(form.Encode()))
					request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
				} else {
					engine.POST("/parties/:partyId/items", h.v1CreateItem)
					input := map[string]any{"description": "dinner", "currency": scenario.unit, "amount": "13.79", "user_ids": []int{2}}
					if scenario.splits {
						input["splits"] = []map[string]any{{"user_id": 2, "amount": "13.79"}, {"user_id": 3, "amount": "6.90"}}
					}
					body, err := json.Marshal(input)
					if err != nil {
						t.Fatal(err)
					}
					request = httptest.NewRequest(http.MethodPost, "/parties/9/items", strings.NewReader(string(body)))
					request.Header.Set("Content-Type", "application/json")
				}
				response := httptest.NewRecorder()
				engine.ServeHTTP(response, request)
				if success {
					if response.Code != 200 || !strings.Contains(response.Body.String(), fmt.Sprintf(`"count":%d`, len(scenario.amounts))) {
						t.Fatalf("unexpected success response: %d %s", response.Code, response.Body)
					}
				} else {
					wantCode := http.StatusOK
					if entrypoint == "v1" {
						wantCode = http.StatusBadRequest
					}
					if response.Code != wantCode {
						t.Fatalf("error status=%d, want %d: %s", response.Code, wantCode, response.Body)
					}
					if !strings.Contains(response.Body.String(), "无法获取该货币的汇率信息") {
						t.Fatalf("expected currency error: %d %s", response.Code, response.Body)
					}
				}
				if got := calls.Load(); got != scenario.calls {
					t.Fatalf("upstream calls = %d, want %d", got, scenario.calls)
				}
			})
		}
	}
}

func TestAdminExchangeRefreshAndStatusRecovery(t *testing.T) {
	var fail atomic.Bool
	var calls atomic.Int32
	exchange := localExchange(t, func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		if fail.Load() {
			http.Error(w, "unavailable", 503)
			return
		}
		exchangePayload(w)
	})
	h, mock := exchangeTestHandler(t, exchange)
	engine := gin.New()
	engine.POST("/refresh", h.adminRefreshCurrency)
	engine.GET("/currencies", h.adminCurrencies)
	var previousSuccess *time.Time
	for _, failed := range []bool{false, true, false} {
		fail.Store(failed)
		expectCurrencies(mock)
		req := httptest.NewRequest(http.MethodPost, "/refresh", strings.NewReader(`{"code":" CNY "}`))
		req.Header.Set("Content-Type", "application/json")
		res := httptest.NewRecorder()
		engine.ServeHTTP(res, req)
		wantRet := 1
		if failed {
			wantRet = 0
		}
		if !strings.Contains(res.Body.String(), fmt.Sprintf(`"ret":%d`, wantRet)) {
			t.Fatalf("refresh: %s", res.Body)
		}
		beforeRead := calls.Load()
		expectCurrencies(mock)
		statusResponse := httptest.NewRecorder()
		engine.ServeHTTP(statusResponse, httptest.NewRequest(http.MethodGet, "/currencies", nil))
		var result struct {
			Ret  int `json:"ret"`
			Data struct {
				Statuses map[string]currency.Status `json:"exchange_status"`
			} `json:"data"`
		}
		if err := json.Unmarshal(statusResponse.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		status, exists := result.Data.Statuses["cny"]
		if result.Ret != 1 || !exists || status.UpdatedAt == nil || status.AttemptedAt == nil || status.DataDate == "" || (status.LastError != "") != failed {
			t.Fatalf("status mismatch: %s", statusResponse.Body)
		}
		if failed && !strings.Contains(status.LastError, "503") {
			t.Fatalf("missing failure detail: %+v", status)
		}
		if failed && (previousSuccess == nil || !status.UpdatedAt.Equal(*previousSuccess)) {
			t.Fatal("failed refresh replaced the last successful update time")
		}
		previousSuccess = status.UpdatedAt
		if calls.Load() != beforeRead {
			t.Fatal("reading admin status must not fetch rates")
		}
	}
	if calls.Load() != 4 {
		t.Fatalf("manual refresh did not bypass fresh cache: calls=%d", calls.Load())
	}
}

func TestAdminRefreshRejectsInvalidInputsAndUnavailableService(t *testing.T) {
	for _, tc := range []struct {
		body, message string
		query         bool
	}{
		{`{`, "参数格式错误", false},
		{`{"code":"xxx"}`, "货币不存在或未启用", true},
		{`{"code":"cny"}`, "汇率服务不可用", true},
	} {
		t.Run(tc.message, func(t *testing.T) {
			h, mock := exchangeTestHandler(t, nil)
			if tc.query {
				expectCurrencies(mock)
			}
			engine := gin.New()
			engine.POST("/refresh", h.adminRefreshCurrency)
			req := httptest.NewRequest(http.MethodPost, "/refresh", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			res := httptest.NewRecorder()
			engine.ServeHTTP(res, req)
			if !strings.Contains(res.Body.String(), tc.message) || !strings.Contains(res.Body.String(), `"ret":0`) {
				t.Fatalf("unexpected response: %s", res.Body)
			}
		})
	}
}

func TestAdminExchangeRoutesRequireAdmin(t *testing.T) {
	for _, path := range []string{"/api/admin/currencies", "/api/admin/currency/refresh"} {
		for _, loggedIn := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/loggedIn=%v", path, loggedIn), func(t *testing.T) {
				h, mock := exchangeTestHandler(t, nil)
				engine := gin.New()
				h.registerAdminRoutes(engine)
				method := http.MethodGet
				if strings.HasSuffix(path, "refresh") {
					method = http.MethodPost
				}
				req := httptest.NewRequest(method, path, strings.NewReader(`{"code":"cny"}`))
				req.Header.Set("Content-Type", "application/json")
				wantCode := http.StatusUnauthorized
				if loggedIn {
					token, err := h.tokens.IssueAccessToken(1)
					if err != nil {
						t.Fatal(err)
					}
					req.Header.Set("Authorization", "Bearer "+token)
					mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `test_user`")).WithArgs(1, 1).
						WillReturnRows(sqlmock.NewRows([]string{"id", "enable", "is_admin"}).AddRow(1, true, false))
					wantCode = http.StatusForbidden
				}
				res := httptest.NewRecorder()
				engine.ServeHTTP(res, req)
				if res.Code != wantCode {
					t.Fatalf("status=%d, want %d: %s", res.Code, wantCode, res.Body)
				}
			})
		}
	}
}
