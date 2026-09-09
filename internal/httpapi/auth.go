package httpapi

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
	"gorm.io/gorm"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/appconfig"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/auth"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/currency"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/ledger"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/model"
)

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

type Handler struct {
	db          *gorm.DB
	tokens      *auth.TokenService
	apiTokens   *auth.APITokenService
	ledger      *ledger.Service
	tickets     *auth.TicketStore
	challenges  *auth.ChallengeStore
	captchas    *auth.CaptchaStore
	webSessions *auth.WebAuthnSessionStore
	httpClient  *http.Client
	exchange    *currency.Service
	cfg         appconfig.Config
	tablePrefix string
}

func NewHandler(db *gorm.DB, tokens *auth.TokenService, exchange *currency.Service, cfg appconfig.Config) *Handler {
	return &Handler{
		db: db, tokens: tokens, apiTokens: auth.NewAPITokenService(db, cfg.Database.TablePrefix),
		ledger: ledger.New(db, cfg.Database.TablePrefix, exchange), tickets: auth.NewTicketStore(),
		challenges: auth.NewChallengeStore(), captchas: auth.NewCaptchaStore(), webSessions: auth.NewWebAuthnSessionStore(),
		httpClient: &http.Client{Timeout: 8 * time.Second}, exchange: exchange, cfg: cfg, tablePrefix: cfg.Database.TablePrefix,
	}
}

func (h *Handler) Register(engine *gin.Engine) {
	authGroup := engine.Group("/api/auth")
	authGroup.GET("/bootstrap", h.bootstrap)
	authGroup.POST("/login", h.login)
	authGroup.POST("/register", h.register)
	authGroup.POST("/refresh", h.refresh)
	authGroup.POST("/logout", h.logout)
	authGroup.POST("/mfa/totp", h.mfaTOTP)
	authGroup.GET("/webauthn/challenge", h.passkeyChallenge)
	authGroup.POST("/webauthn/verify", h.passkeyVerify)
	authGroup.POST("/mfa/fido/challenge", h.fidoChallenge)
	authGroup.POST("/mfa/fido/verify", h.fidoVerify)
	engine.GET("/captcha", h.numericCaptcha)

	userGroup := engine.Group("/api/user", h.AuthRequired())
	userGroup.POST("/logout", h.logout)
	userGroup.GET("/profile", h.profile)
	userGroup.POST("/profile", h.updateProfile)
	userGroup.GET("/totp_reg", h.totpRegisterRequest)
	userGroup.POST("/totp_reg", h.totpRegisterHandle)
	userGroup.DELETE("/totp_reg", h.totpDelete)
	userGroup.GET("/webauthn_reg", h.passkeyRegisterChallenge)
	userGroup.POST("/webauthn_reg", h.passkeyRegisterVerify)
	userGroup.DELETE("/webauthn_reg/:id", h.passkeyDelete)
	userGroup.GET("/fido_reg", h.fidoRegisterChallenge)
	userGroup.POST("/fido_reg", h.fidoRegisterVerify)
	userGroup.DELETE("/fido_reg/:id", h.fidoDelete)
	userGroup.GET("/tokens", h.listAPITokens)
	userGroup.POST("/tokens", h.createAPIToken)
	userGroup.DELETE("/tokens/:id", h.revokeAPIToken)
	h.registerPartyRoutes(userGroup)
	h.registerItemRoutes(userGroup)

	engine.GET("/api/party/invite/:code", h.previewInvite)
	h.registerAdminRoutes(engine)
	h.registerV1Routes(engine)
	h.registerMCP(engine)
}

func (h *Handler) bootstrap(c *gin.Context) {
	driver := h.setting(c, "captcha_driver", "none")
	data := gin.H{"driver": driver, "general_name": h.setting(c, "general_name", "BetterBillSplitter")}
	if driver == "turnstile" || driver == "hcaptcha" || driver == "cap" {
		data["site_key"] = h.setting(c, "captcha_siteKey", "")
	}
	if driver == "cap" {
		data["cap_custom_url"] = h.setting(c, "captcha_customUrl", "")
	}
	if driver == "numeric" {
		data["captcha_image_url"] = "/captcha"
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": data})
}

type credentialsRequest struct {
	Username  string `form:"username" json:"username"`
	Password  string `form:"password" json:"password"`
	Captcha   string `form:"captcha" json:"captcha"`
	Turnstile string `form:"cf-turnstile-response" json:"cf-turnstile-response"`
	HCaptcha  string `form:"h-captcha-response" json:"h-captcha-response"`
	CapToken  string `form:"cap-token" json:"cap-token"`
}

func (h *Handler) login(c *gin.Context) {
	var input credentialsRequest
	if err := c.ShouldBind(&input); err != nil || len(input.Username) < 3 || len(input.Password) < 3 {
		legacyError(c, "用户名或密码格式错误")
		return
	}
	if !h.verifyCaptcha(c, input.Captcha, input.Turnstile, input.HCaptcha, input.CapToken) {
		legacyError(c, "验证码错误或已过期，请刷新页面后重试")
		return
	}
	var user model.User
	if err := h.db.WithContext(c).Table(h.table("user")).Where("username = ?", input.Username).First(&user).Error; err != nil {
		legacyError(c, "用户名或密码错误")
		return
	}
	ok, err := auth.VerifyPassword(input.Password, user.Password)
	if err != nil || !ok {
		legacyError(c, "用户名或密码错误")
		return
	}
	if !user.Enable {
		legacyError(c, "用户已被禁用，请联系管理员")
		return
	}
	method := h.mfaMethods(c, user.ID)
	if method["require"] {
		ticket, err := h.tickets.Create(user.ID, 5*time.Minute)
		if err != nil {
			legacyServiceError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "请完成二步认证", "mfa_required": true, "mfa_ticket": ticket, "method": method})
		return
	}
	h.respondWithTokens(c, user)
}

type registerRequest struct {
	Username        string `form:"username" json:"username"`
	Password        string `form:"password" json:"password"`
	ConfirmPassword string `form:"confirm_password" json:"confirm_password"`
	Captcha         string `form:"captcha" json:"captcha"`
	Turnstile       string `form:"cf-turnstile-response" json:"cf-turnstile-response"`
	HCaptcha        string `form:"h-captcha-response" json:"h-captcha-response"`
	CapToken        string `form:"cap-token" json:"cap-token"`
}

func (h *Handler) register(c *gin.Context) {
	if !parseBool(h.setting(c, "general_enableRegister", "1"), true) {
		legacyError(c, "注册功能已关闭")
		return
	}
	var input registerRequest
	if err := c.ShouldBind(&input); err != nil {
		legacyError(c, "请求格式错误")
		return
	}
	if input.Password != input.ConfirmPassword {
		legacyError(c, "两次密码不一致")
		return
	}
	if len(input.Username) < 3 || !usernamePattern.MatchString(input.Username) {
		legacyError(c, "用户名只能包含字母、数字、下划线和破折号，且不能少于3位")
		return
	}
	if len(input.Password) < 3 {
		legacyError(c, "密码长度不能少于3位")
		return
	}
	if !h.verifyCaptcha(c, input.Captcha, input.Turnstile, input.HCaptcha, input.CapToken) {
		legacyError(c, "验证码错误或已过期，请刷新页面后重试")
		return
	}
	var count int64
	h.db.WithContext(c).Table(h.table("user")).Where("username = ?", input.Username).Count(&count)
	if count != 0 {
		legacyError(c, "用户已存在")
		return
	}
	hash, err := auth.HashPassword(input.Password)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	user := model.User{Username: input.Username, Password: hash, UUID: uuid.NewString(), Enable: true}
	if err := h.db.WithContext(c).Table(h.table("user")).Create(&user).Error; err != nil {
		legacyError(c, "用户已存在")
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "注册成功"})
}

const captchaCookieName = "bbs_captcha"

func (h *Handler) numericCaptcha(c *gin.Context) {
	answer := make([]byte, 6)
	for i := range answer {
		n, err := randInt(10)
		if err != nil {
			legacyServiceError(c, err)
			return
		}
		answer[i] = byte('0' + n)
	}
	id, err := h.captchas.Create(string(answer), 5*time.Minute)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	http.SetCookie(c.Writer, &http.Cookie{Name: captchaCookieName, Value: id, Path: "/", MaxAge: 300, HttpOnly: true, Secure: h.cfg.JWT.RefreshCookieSecure, SameSite: http.SameSiteLaxMode})
	// SVG avoids an image-processing dependency while remaining compatible with
	// the existing <img> based frontend. Random offsets impede trivial cropping.
	var digits strings.Builder
	for i, digit := range answer {
		y, _ := randInt(13)
		fmt.Fprintf(&digits, `<text x="%d" y="%d">%s</text>`, 16+i*24, 31+y, html.EscapeString(string(digit)))
	}
	svg := `<svg xmlns="http://www.w3.org/2000/svg" width="172" height="56" viewBox="0 0 172 56"><rect width="100%" height="100%" fill="#f5f5f5"/><path d="M2 42 L170 12 M3 17 L169 47" stroke="#b8b8b8"/><g fill="#262626" font-family="monospace" font-size="29" font-weight="700">` + digits.String() + `</g></svg>`
	c.Header("Cache-Control", "no-store, max-age=0")
	c.Data(http.StatusOK, "image/svg+xml; charset=utf-8", []byte(svg))
}

func randInt(limit int64) (int64, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(limit))
	if err != nil {
		return 0, err
	}
	return n.Int64(), nil
}

func (h *Handler) verifyCaptcha(c *gin.Context, numeric, turnstile, hcaptcha, capToken string) bool {
	driver := h.setting(c, "captcha_driver", "none")
	switch driver {
	case "", "none":
		return true
	case "numeric":
		id, err := c.Cookie(captchaCookieName)
		return err == nil && h.captchas.Verify(id, strings.TrimSpace(numeric))
	case "turnstile":
		return h.verifyFormCaptcha(c, "https://challenges.cloudflare.com/turnstile/v0/siteverify", turnstile)
	case "hcaptcha":
		return h.verifyFormCaptcha(c, "https://api.hcaptcha.com/siteverify", hcaptcha)
	case "cap":
		base := strings.TrimRight(h.setting(c, "captcha_customUrl", ""), "/")
		siteKey := url.PathEscape(h.setting(c, "captcha_siteKey", ""))
		if base == "" || siteKey == "" || capToken == "" {
			return false
		}
		payload, _ := json.Marshal(gin.H{"secret": h.setting(c, "captcha_siteSecret", ""), "response": capToken})
		req, err := http.NewRequestWithContext(c, http.MethodPost, base+"/"+siteKey+"/siteverify", strings.NewReader(string(payload)))
		if err != nil {
			return false
		}
		req.Header.Set("Content-Type", "application/json")
		return h.captchaResponseOK(req)
	default:
		return false
	}
}

func (h *Handler) verifyFormCaptcha(c *gin.Context, endpoint, response string) bool {
	if response == "" {
		return false
	}
	form := url.Values{"secret": {h.setting(c, "captcha_siteSecret", "")}, "response": {response}, "remoteip": {c.ClientIP()}}
	req, err := http.NewRequestWithContext(c, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return false
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return h.captchaResponseOK(req)
}

func (h *Handler) captchaResponseOK(req *http.Request) bool {
	resp, err := h.httpClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return false
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return false
	}
	var result struct {
		Success bool `json:"success"`
	}
	return json.Unmarshal(body, &result) == nil && result.Success
}

func (h *Handler) refresh(c *gin.Context) {
	plain, err := c.Cookie(h.cfg.JWT.RefreshCookieName)
	if err != nil || plain == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"ret": 0, "msg": "刷新失败"})
		return
	}
	result, err := h.tokens.RotateRefreshToken(c, plain, c.ClientIP(), c.GetHeader("User-Agent"))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"ret": 0, "msg": "刷新失败"})
		return
	}
	h.setRefreshCookie(c, result.PlainToken)
	c.JSON(http.StatusOK, tokenPayload(result.AccessToken, result.User, h.cfg.JWT.AccessTTL))
}

func (h *Handler) logout(c *gin.Context) {
	plain, _ := c.Cookie(h.cfg.JWT.RefreshCookieName)
	_ = h.tokens.RevokeRefreshToken(c, plain)
	h.clearRefreshCookie(c)
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "登出成功"})
}

type mfaRequest struct {
	Ticket string `form:"mfa_ticket" json:"mfa_ticket"`
	Code   string `form:"code" json:"code"`
}

func (h *Handler) mfaTOTP(c *gin.Context) {
	var input mfaRequest
	if err := c.ShouldBind(&input); err != nil {
		legacyError(c, "请求格式错误")
		return
	}
	ticket, ok := h.tickets.Get(input.Ticket)
	if !ok {
		legacyError(c, "登录会话已过期")
		return
	}
	var credential model.MFACredential
	if err := h.db.WithContext(c).Table(h.table("mfa_credential")).Where("userid = ? AND type = 'totp'", ticket.UserID).First(&credential).Error; err != nil {
		legacyError(c, "您还没有注册TOTP")
		return
	}
	var body struct {
		Token string `json:"token"`
	}
	if json.Unmarshal([]byte(credential.Body), &body) != nil || body.Token == "" {
		legacyError(c, "TOTP凭据无效")
		return
	}
	valid, err := totp.ValidateCustom(input.Code, body.Token, time.Now().UTC(), totp.ValidateOpts{Period: 30, Skew: 1, Digits: otp.DigitsSix, Algorithm: otp.AlgorithmSHA1})
	if err != nil || !valid {
		legacyError(c, "验证失败")
		return
	}
	var user model.User
	if err := h.db.WithContext(c).Table(h.table("user")).First(&user, ticket.UserID).Error; err != nil || !user.Enable {
		legacyError(c, "用户不存在")
		return
	}
	h.tickets.Delete(input.Ticket)
	h.respondWithTokens(c, user)
}

func (h *Handler) respondWithTokens(c *gin.Context, user model.User) {
	access, err := h.tokens.IssueAccessToken(user.ID)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	refresh, _, err := h.tokens.CreateRefreshToken(c, user.ID, c.ClientIP(), c.GetHeader("User-Agent"))
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	h.setRefreshCookie(c, refresh)
	payload := tokenPayload(access, user, h.cfg.JWT.AccessTTL)
	payload["msg"] = "登录成功"
	c.JSON(http.StatusOK, payload)
}

func tokenPayload(access string, user model.User, ttl time.Duration) gin.H {
	return gin.H{"ret": 1, "access_token": access, "expires_in": int64(ttl.Seconds()), "user": gin.H{"id": user.ID, "username": user.Username, "is_admin": user.IsAdmin}}
}

func (h *Handler) setRefreshCookie(c *gin.Context, value string) {
	http.SetCookie(c.Writer, &http.Cookie{Name: h.cfg.JWT.RefreshCookieName, Value: value, Path: h.cfg.JWT.RefreshCookiePath, MaxAge: int(h.cfg.JWT.RefreshTTL.Seconds()), Expires: time.Now().Add(h.cfg.JWT.RefreshTTL), HttpOnly: true, Secure: h.cfg.JWT.RefreshCookieSecure, SameSite: http.SameSiteLaxMode})
}

func (h *Handler) clearRefreshCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{Name: h.cfg.JWT.RefreshCookieName, Path: h.cfg.JWT.RefreshCookiePath, MaxAge: -1, Expires: time.Unix(1, 0), HttpOnly: true, Secure: h.cfg.JWT.RefreshCookieSecure, SameSite: http.SameSiteLaxMode})
}

func (h *Handler) setting(c *gin.Context, key, fallback string) string {
	var setting model.Setting
	err := h.db.WithContext(c).Table(h.table("setting")).Where("`key` = ?", key).First(&setting).Error
	if errors.Is(err, gorm.ErrRecordNotFound) || err != nil {
		return fallback
	}
	return setting.Value
}

func (h *Handler) mfaMethods(c *gin.Context, userID uint64) map[string]bool {
	var credentials []model.MFACredential
	_ = h.db.WithContext(c).Table(h.table("mfa_credential")).Select("type").Where("userid = ? AND type IN ?", userID, []string{"totp", "fido"}).Find(&credentials).Error
	result := map[string]bool{"require": len(credentials) > 0, "totp": false, "fido": false}
	for _, credential := range credentials {
		result[credential.Type] = true
	}
	return result
}

func (h *Handler) table(name string) string { return h.tablePrefix + name }

func legacyError(c *gin.Context, message string) {
	c.JSON(http.StatusOK, gin.H{"ret": 0, "msg": message})
}
func legacyServiceError(c *gin.Context, err error) {
	c.JSON(http.StatusServiceUnavailable, gin.H{"ret": 0, "msg": "服务配置错误：" + err.Error()})
}

func parseBool(value string, fallback bool) bool {
	parsed, err := strconv.ParseBool(strings.TrimSpace(value))
	if err != nil {
		return fallback
	}
	return parsed
}
