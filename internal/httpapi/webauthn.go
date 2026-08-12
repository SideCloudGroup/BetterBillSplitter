package httpapi

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-webauthn/webauthn/protocol"
	gowebauthn "github.com/go-webauthn/webauthn/webauthn"
	"gorm.io/gorm"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/auth"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/model"
)

const webAuthnSessionTTL = 5 * time.Minute

func (h *Handler) webAuthn(c *gin.Context) (*gowebauthn.WebAuthn, error) {
	rpID := strings.TrimSpace(h.cfg.WebAuthn.RPID)
	host := c.Request.Host
	if parsed, _, err := net.SplitHostPort(host); err == nil {
		host = parsed
	}
	if rpID == "" {
		rpID = host
	}
	origins := h.cfg.WebAuthn.RPOrigins
	if len(origins) == 0 {
		scheme := "http"
		if c.Request.TLS != nil {
			scheme = "https"
		} else if forwarded := strings.TrimSpace(strings.Split(c.GetHeader("X-Forwarded-Proto"), ",")[0]); forwarded == "http" || forwarded == "https" {
			scheme = forwarded
		}
		origins = []string{scheme + "://" + c.Request.Host}
	}
	displayName := strings.TrimSpace(h.cfg.WebAuthn.DisplayName)
	if displayName == "" {
		displayName = h.setting(c, "general_name", "BetterBillSplitter")
	}
	return gowebauthn.New(&gowebauthn.Config{RPID: rpID, RPDisplayName: displayName, RPOrigins: origins})
}

func (h *Handler) webAuthnUser(c *gin.Context, user model.User, credentialType string) (auth.WebAuthnUser, []model.MFACredential, error) {
	var records []model.MFACredential
	if err := h.db.WithContext(c).Table(h.table("mfa_credential")).Where("userid = ? AND type = ?", user.ID, credentialType).Find(&records).Error; err != nil {
		return auth.WebAuthnUser{}, nil, err
	}
	credentials := make([]gowebauthn.Credential, 0, len(records))
	for _, record := range records {
		credential, err := auth.DecodeWebAuthnCredential(record.Body)
		if err != nil {
			return auth.WebAuthnUser{}, nil, err
		}
		credentials = append(credentials, credential)
	}
	return auth.WebAuthnUser{ID: []byte(user.UUID), Name: user.Username, Credentials: credentials}, records, nil
}

func (h *Handler) beginRegistration(c *gin.Context, credentialType string) {
	user, _ := currentUser(c)
	webUser, _, err := h.webAuthnUser(c, user, credentialType)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	wa, err := h.webAuthn(c)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	options := []gowebauthn.RegistrationOption{gowebauthn.WithConveyancePreference(protocol.PreferNoAttestation)}
	if credentialType == "passkey" {
		options = append(options,
			gowebauthn.WithResidentKeyRequirement(protocol.ResidentKeyRequirementRequired),
			gowebauthn.WithAuthenticatorSelection(protocol.AuthenticatorSelection{UserVerification: protocol.VerificationRequired}),
		)
	}
	creation, session, err := wa.BeginRegistration(webUser, options...)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	id, err := h.webSessions.Create(session, credentialType+"-register", user.ID, webAuthnSessionTTL)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "challenge_id": id, "publicKey": creation.Response})
}

func (h *Handler) passkeyRegisterChallenge(c *gin.Context) { h.beginRegistration(c, "passkey") }
func (h *Handler) fidoRegisterChallenge(c *gin.Context)    { h.beginRegistration(c, "fido") }

func (h *Handler) finishRegistration(c *gin.Context, credentialType string) {
	user, _ := currentUser(c)
	challengeID, name, ok := prepareWebAuthnRequest(c)
	if !ok {
		legacyError(c, "请求格式错误")
		return
	}
	session, ok := h.webSessions.Take(challengeID, credentialType+"-register", user.ID)
	if !ok {
		legacyError(c, "注册会话已过期，请重试")
		return
	}
	webUser, _, err := h.webAuthnUser(c, user, credentialType)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	wa, err := h.webAuthn(c)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	credential, err := wa.FinishRegistration(webUser, session.Data, c.Request)
	if err != nil {
		legacyError(c, "验证失败")
		return
	}
	body, rawID, err := auth.EncodeWebAuthnCredential(credential)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	name = strings.TrimSpace(name)
	var namePtr *string
	if name != "" {
		namePtr = &name
	}
	record := model.MFACredential{UserID: user.ID, Body: body, RawID: &rawID, Name: namePtr, CreatedAt: time.Now(), Type: credentialType}
	if err := h.db.WithContext(c).Table(h.table("mfa_credential")).Create(&record).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "注册成功"})
}

func (h *Handler) passkeyRegisterVerify(c *gin.Context) { h.finishRegistration(c, "passkey") }
func (h *Handler) fidoRegisterVerify(c *gin.Context)    { h.finishRegistration(c, "fido") }

func (h *Handler) passkeyChallenge(c *gin.Context) {
	wa, err := h.webAuthn(c)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	assertion, session, err := wa.BeginDiscoverableLogin(gowebauthn.WithUserVerification(protocol.VerificationRequired))
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	id, err := h.webSessions.Create(session, "passkey-login", 0, webAuthnSessionTTL)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "challenge_id": id, "publicKey": assertion.Response})
}

func (h *Handler) passkeyVerify(c *gin.Context) {
	challengeID, _, ok := prepareWebAuthnRequest(c)
	if !ok {
		legacyError(c, "请求格式错误")
		return
	}
	session, ok := h.webSessions.Take(challengeID, "passkey-login", 0)
	if !ok {
		legacyError(c, "登录会话已过期，请重试")
		return
	}
	wa, err := h.webAuthn(c)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	var loggedIn model.User
	webUser, credential, err := wa.FinishPasskeyLogin(func(rawID, userHandle []byte) (gowebauthn.User, error) {
		var record model.MFACredential
		encodedID := base64.RawURLEncoding.EncodeToString(rawID)
		if err := h.db.WithContext(c).Table(h.table("mfa_credential")).Where("rawid = ? AND type = 'passkey'", encodedID).First(&record).Error; err != nil {
			return nil, err
		}
		if err := h.db.WithContext(c).Table(h.table("user")).First(&loggedIn, record.UserID).Error; err != nil || !loggedIn.Enable {
			return nil, errors.New("user unavailable")
		}
		if !bytes.Equal(userHandle, []byte(loggedIn.UUID)) {
			return nil, errors.New("user handle mismatch")
		}
		loaded, _, err := h.webAuthnUser(c, loggedIn, "passkey")
		return loaded, err
	}, session.Data, c.Request)
	if err != nil || webUser == nil || credential == nil {
		legacyError(c, "通行密钥验证失败")
		return
	}
	if err := h.persistWebAuthnUse(c, loggedIn.ID, "passkey", credential); err != nil {
		legacyServiceError(c, err)
		return
	}
	h.respondWithTokens(c, loggedIn)
}

func (h *Handler) fidoChallenge(c *gin.Context) {
	var input struct {
		Ticket string `form:"mfa_ticket" json:"mfa_ticket"`
	}
	if err := c.ShouldBind(&input); err != nil {
		legacyError(c, "请求格式错误")
		return
	}
	ticket, ok := h.tickets.Get(input.Ticket)
	if !ok {
		legacyError(c, "登录会话已过期")
		return
	}
	var user model.User
	if err := h.db.WithContext(c).Table(h.table("user")).First(&user, ticket.UserID).Error; err != nil {
		legacyError(c, "用户不存在")
		return
	}
	webUser, _, err := h.webAuthnUser(c, user, "fido")
	if err != nil || len(webUser.Credentials) == 0 {
		legacyError(c, "您还没有注册FIDO设备")
		return
	}
	wa, err := h.webAuthn(c)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	assertion, session, err := wa.BeginLogin(webUser, gowebauthn.WithUserVerification(protocol.VerificationDiscouraged))
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	id, err := h.webSessions.Create(session, "fido-login", user.ID, webAuthnSessionTTL)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "challenge_id": id, "publicKey": assertion.Response})
}

func (h *Handler) fidoVerify(c *gin.Context) {
	raw, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		legacyError(c, "请求格式错误")
		return
	}
	var meta struct {
		Ticket      string `json:"mfa_ticket"`
		ChallengeID string `json:"challenge_id"`
	}
	if json.Unmarshal(raw, &meta) != nil || meta.Ticket == "" || meta.ChallengeID == "" {
		legacyError(c, "请求格式错误")
		return
	}
	ticket, ok := h.tickets.Get(meta.Ticket)
	if !ok {
		legacyError(c, "登录会话已过期")
		return
	}
	session, ok := h.webSessions.Take(meta.ChallengeID, "fido-login", ticket.UserID)
	if !ok {
		legacyError(c, "验证会话已过期，请重试")
		return
	}
	if !resetWebAuthnBody(c, raw) {
		legacyError(c, "请求格式错误")
		return
	}
	var user model.User
	if err := h.db.WithContext(c).Table(h.table("user")).First(&user, ticket.UserID).Error; err != nil || !user.Enable {
		legacyError(c, "用户不存在")
		return
	}
	webUser, _, err := h.webAuthnUser(c, user, "fido")
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	wa, err := h.webAuthn(c)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	credential, err := wa.FinishLogin(webUser, session.Data, c.Request)
	if err != nil {
		legacyError(c, "验证失败")
		return
	}
	if err := h.persistWebAuthnUse(c, user.ID, "fido", credential); err != nil {
		legacyServiceError(c, err)
		return
	}
	h.tickets.Delete(meta.Ticket)
	h.respondWithTokens(c, user)
}

func (h *Handler) persistWebAuthnUse(c *gin.Context, userID uint64, credentialType string, credential *gowebauthn.Credential) error {
	body, rawID, err := auth.EncodeWebAuthnCredential(credential)
	if err != nil {
		return err
	}
	now := time.Now()
	result := h.db.WithContext(c).Table(h.table("mfa_credential")).Where("userid = ? AND type = ? AND rawid = ?", userID, credentialType, rawID).Updates(map[string]any{"body": body, "used_at": now})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (h *Handler) passkeyDelete(c *gin.Context) { h.deleteWebAuthn(c, "passkey") }
func (h *Handler) fidoDelete(c *gin.Context)    { h.deleteWebAuthn(c, "fido") }

func (h *Handler) deleteWebAuthn(c *gin.Context, credentialType string) {
	user, _ := currentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		legacyError(c, "设备不存在")
		return
	}
	result := h.db.WithContext(c).Table(h.table("mfa_credential")).Where("id = ? AND userid = ? AND type = ?", id, user.ID, credentialType).Delete(&model.MFACredential{})
	if result.Error != nil {
		legacyServiceError(c, result.Error)
		return
	}
	if result.RowsAffected == 0 {
		legacyError(c, "设备不存在")
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "删除成功"})
}

func prepareWebAuthnRequest(c *gin.Context) (challengeID, name string, ok bool) {
	raw, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		return "", "", false
	}
	var payload map[string]json.RawMessage
	if json.Unmarshal(raw, &payload) != nil {
		return "", "", false
	}
	_ = json.Unmarshal(payload["challenge_id"], &challengeID)
	_ = json.Unmarshal(payload["name"], &name)
	if challengeID == "" || !resetWebAuthnBody(c, raw) {
		return "", "", false
	}
	return challengeID, name, true
}

func resetWebAuthnBody(c *gin.Context, raw []byte) bool {
	var payload map[string]json.RawMessage
	if json.Unmarshal(raw, &payload) != nil {
		return false
	}
	delete(payload, "challenge_id")
	delete(payload, "name")
	delete(payload, "mfa_ticket")
	clean, err := json.Marshal(payload)
	if err != nil {
		return false
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(clean))
	c.Request.ContentLength = int64(len(clean))
	return true
}
