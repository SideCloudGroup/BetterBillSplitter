package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/auth"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/model"
)

type deviceView struct {
	ID        uint64     `json:"id"`
	Name      *string    `json:"name"`
	RawID     *string    `json:"rawid"`
	CreatedAt time.Time  `json:"created_at"`
	UsedAt    *time.Time `json:"used_at"`
	Type      string     `json:"type"`
}

func (h *Handler) profile(c *gin.Context) {
	user, _ := currentUser(c)
	var credentials []model.MFACredential
	_ = h.db.WithContext(c).Table(h.table("mfa_credential")).Where("userid = ?", user.ID).Find(&credentials).Error
	passkeys, totps, fidos := make([]deviceView, 0), make([]deviceView, 0), make([]deviceView, 0)
	for _, credential := range credentials {
		view := deviceView{credential.ID, credential.Name, credential.RawID, credential.CreatedAt, credential.UsedAt, credential.Type}
		switch credential.Type {
		case "passkey":
			passkeys = append(passkeys, view)
		case "totp":
			totps = append(totps, view)
		case "fido":
			fidos = append(fidos, view)
		}
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"user": user, "webauthn_devices": passkeys, "totp_devices": totps, "fido_devices": fidos}})
}

type profileRequest struct {
	Username        string `form:"username" json:"username"`
	CurrentPassword string `form:"current_password" json:"current_password"`
	NewPassword     string `form:"new_password" json:"new_password"`
	ConfirmPassword string `form:"confirm_password" json:"confirm_password"`
}

func (h *Handler) updateProfile(c *gin.Context) {
	user, _ := currentUser(c)
	var input profileRequest
	if err := c.ShouldBind(&input); err != nil {
		legacyError(c, "请求格式错误")
		return
	}
	input.Username = strings.TrimSpace(input.Username)
	changingPassword := input.CurrentPassword != "" || input.NewPassword != "" || input.ConfirmPassword != ""
	updates := make(map[string]any)
	if changingPassword {
		ok, err := auth.VerifyPassword(input.CurrentPassword, user.Password)
		if err != nil || !ok {
			legacyError(c, "当前密码不正确")
			return
		}
		if input.NewPassword == "" {
			legacyError(c, "请填写新密码")
			return
		}
		if input.NewPassword != input.ConfirmPassword {
			legacyError(c, "两次新密码不一致")
			return
		}
		if len(input.NewPassword) < 6 {
			legacyError(c, "新密码长度不能少于 6 位")
			return
		}
		hash, err := auth.HashPassword(input.NewPassword)
		if err != nil {
			legacyServiceError(c, err)
			return
		}
		updates["password"] = hash
	}
	if input.Username != "" && input.Username != user.Username {
		if len(input.Username) < 3 || !usernamePattern.MatchString(input.Username) {
			legacyError(c, "用户名格式无效")
			return
		}
		var count int64
		h.db.WithContext(c).Table(h.table("user")).Where("username = ? AND id <> ?", input.Username, user.ID).Count(&count)
		if count > 0 {
			legacyError(c, "用户名已存在")
			return
		}
		updates["username"] = input.Username
		user.Username = input.Username
	}
	if len(updates) > 0 {
		if err := h.db.WithContext(c).Table(h.table("user")).Where("id = ?", user.ID).Updates(updates).Error; err != nil {
			legacyServiceError(c, err)
			return
		}
	}
	message := "更新成功"
	if changingPassword {
		message = "密码已更新"
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": message, "user": gin.H{"id": user.ID, "username": user.Username, "is_admin": user.IsAdmin}})
}

func (h *Handler) totpRegisterRequest(c *gin.Context) {
	user, _ := currentUser(c)
	var count int64
	h.db.WithContext(c).Table(h.table("mfa_credential")).Where("userid = ? AND type = 'totp'", user.ID).Count(&count)
	if count > 0 {
		legacyError(c, "您已经注册过TOTP")
		return
	}
	key, err := totp.Generate(totp.GenerateOpts{Issuer: h.setting(c, "general_name", "BetterBillSplitter"), AccountName: user.Username, SecretSize: 20})
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	challengeID, err := h.challenges.Create(user.ID, key.Secret(), 5*time.Minute)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "请求成功", "challenge_id": challengeID, "url": key.URL(), "token": key.Secret()})
}

type totpRegisterInput struct {
	Code        string `form:"code" json:"code"`
	ChallengeID string `form:"challenge_id" json:"challenge_id"`
}

func (h *Handler) totpRegisterHandle(c *gin.Context) {
	user, _ := currentUser(c)
	var input totpRegisterInput
	if err := c.ShouldBind(&input); err != nil || input.Code == "" {
		legacyError(c, "验证码不能为空")
		return
	}
	secret, ok := h.challenges.Get(input.ChallengeID, user.ID)
	if !ok {
		legacyError(c, "验证码已过期，请刷新页面重试")
		return
	}
	valid, err := totp.ValidateCustom(input.Code, secret, time.Now().UTC(), totp.ValidateOpts{Period: 30, Skew: 1, Digits: otp.DigitsSix, Algorithm: otp.AlgorithmSHA1})
	if err != nil || !valid {
		legacyError(c, "验证码错误")
		return
	}
	body, _ := json.Marshal(map[string]string{"token": secret})
	name := "TOTP"
	credential := model.MFACredential{UserID: user.ID, Body: string(body), Name: &name, Type: "totp", CreatedAt: time.Now()}
	if err := h.db.WithContext(c).Table(h.table("mfa_credential")).Create(&credential).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	h.challenges.Delete(input.ChallengeID)
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "注册成功"})
}

func (h *Handler) totpDelete(c *gin.Context) {
	user, _ := currentUser(c)
	result := h.db.WithContext(c).Table(h.table("mfa_credential")).Where("userid = ? AND type = 'totp'", user.ID).Delete(&model.MFACredential{})
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
