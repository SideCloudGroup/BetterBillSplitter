package httpapi

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/auth"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/model"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/money"
)

var currencyCodePattern = regexp.MustCompile(`^[a-z]{3}$`)

func (h *Handler) registerAdminRoutes(engine *gin.Engine) {
	group := engine.Group("/api/admin", h.AuthRequired(), h.AdminRequired())
	group.GET("", h.adminIndex)
	group.GET("/user", h.adminUsers)
	group.POST("/user/change-password", h.adminChangePassword)
	group.POST("/user/toggle-admin", h.adminToggleAdmin)
	group.GET("/party/:partyId/members", h.adminPartyMembers)
	group.POST("/party/members", h.adminGetPartyMembers)
	group.GET("/party", h.adminParties)
	group.GET("/currency/add-form", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{}}) })
	group.POST("/currency/add", h.adminAddCurrency)
	group.GET("/currency/edit-form", h.adminEditCurrencyForm)
	group.POST("/currency/edit", h.adminEditCurrency)
	group.DELETE("/currency/delete", h.adminDeleteCurrency)
	group.GET("/currencies", h.adminCurrencies)
	group.GET("/setting", h.adminSettings)
	group.POST("/setting", h.adminUpdateSettings)
}

func (h *Handler) adminIndex(c *gin.Context) {
	var totalUsers, adminUsers, totalItems, paidItems, totalParties, activeParties, activeUsers int64
	h.db.WithContext(c).Table(h.table("user")).Count(&totalUsers)
	h.db.WithContext(c).Table(h.table("user")).Where("is_admin=1").Count(&adminUsers)
	h.db.WithContext(c).Table(h.table("item")).Count(&totalItems)
	h.db.WithContext(c).Table(h.table("item")).Where("paid=1").Count(&paidItems)
	h.db.WithContext(c).Table(h.table("party")).Count(&totalParties)
	h.db.WithContext(c).Raw(fmt.Sprintf("SELECT COUNT(*) FROM (SELECT p.id FROM %s p JOIN %s pm ON p.id=pm.party_id GROUP BY p.id HAVING COUNT(pm.user_id)>1) active", h.table("party"), h.table("party_member"))).Scan(&activeParties)
	h.db.WithContext(c).Raw(fmt.Sprintf("SELECT COUNT(DISTINCT userid) FROM %s WHERE created_at>=?", h.table("item")), time.Now().AddDate(0, 0, -30)).Scan(&activeUsers)
	unpaidItems := totalItems - paidItems
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{
		"totalUsers": totalUsers, "adminUsers": adminUsers, "regularUsers": totalUsers - adminUsers,
		"totalItems": totalItems, "paidItems": paidItems, "unpaidItems": unpaidItems,
		"unpaidItemsPercentage": percentage(unpaidItems, totalItems), "totalParties": totalParties,
		"activeParties": activeParties, "activeUsers": activeUsers,
		"paymentCompletionRate": percentageNumber(paidItems, totalItems), "userActivityRate": percentageNumber(activeUsers, totalUsers), "partyActivityRate": percentageNumber(activeParties, totalParties),
	}})
}

func (h *Handler) adminUsers(c *gin.Context) {
	var users []struct {
		ID       uint64 `json:"id"`
		Username string `json:"username"`
		IsAdmin  bool   `gorm:"column:is_admin" json:"is_admin"`
	}
	if err := h.db.WithContext(c).Table(h.table("user")).Select("id,username,is_admin").Order("id").Scan(&users).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"users": users}})
}

type adminPasswordInput struct {
	UserID      uint64 `json:"user_id" form:"user_id"`
	NewPassword string `json:"new_password" form:"new_password"`
}

func (h *Handler) adminChangePassword(c *gin.Context) {
	var input adminPasswordInput
	if c.ShouldBind(&input) != nil || input.UserID == 0 || input.NewPassword == "" {
		legacyError(c, "参数不完整")
		return
	}
	if len(input.NewPassword) < 6 {
		legacyError(c, "密码长度至少6位")
		return
	}
	var count int64
	h.db.WithContext(c).Table(h.table("user")).Where("id=?", input.UserID).Count(&count)
	if count == 0 {
		legacyError(c, "用户不存在")
		return
	}
	hash, err := auth.HashPassword(input.NewPassword)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	if err := h.db.WithContext(c).Table(h.table("user")).Where("id=?", input.UserID).Update("password", hash).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "密码修改成功"})
}

type adminToggleInput struct {
	UserID     uint64 `json:"user_id" form:"user_id"`
	SetAsAdmin *bool  `json:"set_as_admin" form:"set_as_admin"`
}

func (h *Handler) adminToggleAdmin(c *gin.Context) {
	admin, _ := currentUser(c)
	var input adminToggleInput
	if c.ShouldBind(&input) != nil || input.UserID == 0 || input.SetAsAdmin == nil {
		legacyError(c, "参数不完整")
		return
	}
	if input.UserID == admin.ID {
		legacyError(c, "不能修改自己的管理员权限")
		return
	}
	result := h.db.WithContext(c).Table(h.table("user")).Where("id=?", input.UserID).Update("is_admin", *input.SetAsAdmin)
	if result.Error != nil {
		legacyServiceError(c, result.Error)
		return
	}
	if result.RowsAffected == 0 {
		legacyError(c, "用户不存在")
		return
	}
	action := "取消管理员权限"
	if *input.SetAsAdmin {
		action = "设为管理员"
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "用户权限已更新：" + action})
}

type adminPartyRow struct {
	model.Party
	MemberCount int64  `gorm:"column:member_count" json:"member_count"`
	TotalItems  int64  `gorm:"column:total_items" json:"total_items"`
	TotalAmount string `gorm:"column:total_amount" json:"total_amount"`
	PaidItems   int64  `gorm:"column:paid_items" json:"paid_items"`
	PaidAmount  string `gorm:"column:paid_amount" json:"paid_amount"`
}

func (h *Handler) adminParties(c *gin.Context) {
	query := fmt.Sprintf(`SELECT p.*,
(SELECT COUNT(*) FROM %s pm WHERE pm.party_id=p.id) member_count,
(SELECT COUNT(*) FROM %s i WHERE i.party_id=p.id) total_items,
(SELECT COALESCE(SUM(i.amount),0) FROM %s i WHERE i.party_id=p.id) total_amount,
(SELECT COUNT(*) FROM %s i WHERE i.party_id=p.id AND i.paid=1) paid_items,
(SELECT COALESCE(SUM(i.amount),0) FROM %s i WHERE i.party_id=p.id AND i.paid=1) paid_amount
FROM %s p ORDER BY p.id DESC`, h.table("party_member"), h.table("item"), h.table("item"), h.table("item"), h.table("item"), h.table("party"))
	var rows []adminPartyRow
	if err := h.db.WithContext(c).Raw(query).Scan(&rows).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	parties := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		total, _ := money.Parse(defaultDecimal(row.TotalAmount))
		paid, _ := money.Parse(defaultDecimal(row.PaidAmount))
		parties = append(parties, gin.H{"id": row.ID, "name": row.Name, "description": row.Description, "invite_code": row.InviteCode, "owner_id": row.OwnerID, "timezone": row.Timezone, "base_currency": row.BaseCurrency, "supported_currencies": row.SupportedCurrencies, "archived_at": row.ArchivedAt, "created_at": row.CreatedAt, "updated_at": row.UpdatedAt, "member_count": row.MemberCount, "total_items": row.TotalItems, "total_amount": total.String(), "paid_items": row.PaidItems, "paid_amount": paid.String(), "unpaid_items": row.TotalItems - row.PaidItems, "unpaid_amount": (total - paid).String(), "payment_completion_rate": percentage(row.PaidItems, row.TotalItems), "currency_symbol": h.currencySymbol(c, row.BaseCurrency)})
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"parties": parties}})
}

func (h *Handler) adminPartyMembers(c *gin.Context) {
	partyID, ok := parseID(c, "partyId")
	if !ok {
		return
	}
	var party model.Party
	if h.db.WithContext(c).Table(h.table("party")).First(&party, partyID).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"ret": 0, "msg": "派对不存在"})
		return
	}
	var members []struct {
		ID       uint64    `json:"id"`
		Username string    `json:"username"`
		IsOwner  int       `gorm:"column:is_owner" json:"is_owner"`
		JoinedAt time.Time `json:"joined_at"`
	}
	query := fmt.Sprintf("SELECT u.id,u.username,CASE WHEN p.owner_id=pm.user_id THEN 1 ELSE 0 END is_owner,pm.joined_at FROM %s pm JOIN %s u ON pm.user_id=u.id JOIN %s p ON pm.party_id=p.id WHERE pm.party_id=? ORDER BY pm.joined_at", h.table("party_member"), h.table("user"), h.table("party"))
	if err := h.db.WithContext(c).Raw(query, party.ID).Scan(&members).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	stats := h.partyStats(c, party.ID)
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"party": party, "members": members, "stats": stats, "currencySymbol": h.currencySymbol(c, party.BaseCurrency)}})
}

func (h *Handler) adminGetPartyMembers(c *gin.Context) {
	var input struct {
		PartyID uint64 `json:"party_id" form:"party_id"`
	}
	if c.ShouldBind(&input) != nil || input.PartyID == 0 {
		legacyError(c, "参数错误")
		return
	}
	var members []struct {
		ID       uint64 `json:"id"`
		Username string `json:"username"`
		IsOwner  int    `gorm:"column:is_owner" json:"is_owner"`
	}
	query := fmt.Sprintf("SELECT u.id,u.username,CASE WHEN p.owner_id=pm.user_id THEN 1 ELSE 0 END is_owner FROM %s pm JOIN %s u ON pm.user_id=u.id JOIN %s p ON pm.party_id=p.id WHERE pm.party_id=?", h.table("party_member"), h.table("user"), h.table("party"))
	h.db.WithContext(c).Raw(query, input.PartyID).Scan(&members)
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": members})
}

func (h *Handler) partyStats(c *gin.Context, partyID uint64) gin.H {
	var row struct {
		TotalItems  int64
		TotalAmount string
		PaidItems   int64
		PaidAmount  string
	}
	query := fmt.Sprintf("SELECT COUNT(*) total_items,COALESCE(SUM(amount),0) total_amount,COALESCE(SUM(CASE WHEN paid=1 THEN 1 ELSE 0 END),0) paid_items,COALESCE(SUM(CASE WHEN paid=1 THEN amount ELSE 0 END),0) paid_amount FROM %s WHERE party_id=?", h.table("item"))
	h.db.WithContext(c).Raw(query, partyID).Scan(&row)
	total, _ := money.Parse(defaultDecimal(row.TotalAmount))
	paid, _ := money.Parse(defaultDecimal(row.PaidAmount))
	return gin.H{"total_items": row.TotalItems, "total_amount": total.String(), "paid_items": row.PaidItems, "paid_amount": paid.String(), "unpaid_items": row.TotalItems - row.PaidItems, "unpaid_amount": (total - paid).String(), "payment_completion_rate": percentage(row.PaidItems, row.TotalItems)}
}

func (h *Handler) adminCurrencies(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"currencies": h.availableCurrencies(c)}})
}

type currencyInput struct {
	Code          string `json:"code" form:"code"`
	Name          string `json:"name" form:"name"`
	NameEN        string `json:"name_en" form:"name_en"`
	Symbol        string `json:"symbol" form:"symbol"`
	DecimalPlaces int    `json:"decimal_places" form:"decimal_places"`
}

func (h *Handler) bindCurrency(c *gin.Context) (currencyInput, bool) {
	var input currencyInput
	if c.ShouldBind(&input) != nil {
		legacyError(c, "请求格式错误")
		return input, false
	}
	input.Code = strings.ToLower(strings.TrimSpace(input.Code))
	input.Name, input.NameEN, input.Symbol = strings.TrimSpace(input.Name), strings.TrimSpace(input.NameEN), strings.TrimSpace(input.Symbol)
	if input.Code == "" || input.Name == "" || input.Symbol == "" {
		legacyError(c, "货币代码、名称和符号不能为空")
		return input, false
	}
	if !currencyCodePattern.MatchString(input.Code) {
		legacyError(c, "货币代码必须是3位小写字母")
		return input, false
	}
	if input.DecimalPlaces < 0 || input.DecimalPlaces > 8 {
		legacyError(c, "小数位必须在0到8之间")
		return input, false
	}
	if input.NameEN == "" {
		input.NameEN = input.Code
	}
	return input, true
}

func (h *Handler) adminAddCurrency(c *gin.Context) {
	input, ok := h.bindCurrency(c)
	if !ok {
		return
	}
	var count int64
	h.db.WithContext(c).Table(h.table("currencies")).Where("code=?", input.Code).Count(&count)
	if count > 0 {
		legacyError(c, "货币代码已存在")
		return
	}
	row := model.Currency{Code: input.Code, Name: input.Name, NameEN: &input.NameEN, Symbol: input.Symbol, DecimalPlaces: input.DecimalPlaces, IsActive: true}
	if err := h.db.WithContext(c).Table(h.table("currencies")).Create(&row).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "货币添加成功"})
}

func (h *Handler) adminEditCurrency(c *gin.Context) {
	input, ok := h.bindCurrency(c)
	if !ok {
		return
	}
	result := h.db.WithContext(c).Table(h.table("currencies")).Where("code=? AND is_active=1", input.Code).Updates(map[string]any{"name": input.Name, "name_en": input.NameEN, "symbol": input.Symbol, "decimal_places": input.DecimalPlaces})
	if result.Error != nil {
		legacyServiceError(c, result.Error)
		return
	}
	if result.RowsAffected == 0 {
		legacyError(c, "货币代码不存在")
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "货币更新成功"})
}

func (h *Handler) adminEditCurrencyForm(c *gin.Context) {
	code := strings.ToLower(strings.TrimSpace(c.Query("code")))
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ret": 0, "msg": "货币代码不能为空"})
		return
	}
	var row model.Currency
	if h.db.WithContext(c).Table(h.table("currencies")).Where("code=? AND is_active=1", code).First(&row).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"ret": 0, "msg": "货币不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"currency": row}})
}

func (h *Handler) adminDeleteCurrency(c *gin.Context) {
	code := strings.ToLower(strings.TrimSpace(c.Query("code")))
	if code == "" {
		legacyError(c, "货币代码不能为空")
		return
	}
	var row model.Currency
	if h.db.WithContext(c).Table(h.table("currencies")).Where("code=? AND is_active=1", code).First(&row).Error != nil {
		legacyError(c, "货币代码不存在")
		return
	}
	if row.IsDefault {
		legacyError(c, "不能删除默认货币")
		return
	}
	var baseCount, supportedCount int64
	h.db.WithContext(c).Table(h.table("party")).Where("base_currency=?", code).Count(&baseCount)
	if baseCount > 0 {
		legacyError(c, fmt.Sprintf("该货币正在被 %d 个派对使用，无法删除", baseCount))
		return
	}
	h.db.WithContext(c).Table(h.table("party")).Where("supported_currencies LIKE ?", `%"`+code+`"%`).Count(&supportedCount)
	if supportedCount > 0 {
		legacyError(c, fmt.Sprintf("该货币正在被 %d 个派对支持，无法删除", supportedCount))
		return
	}
	if err := h.db.WithContext(c).Table(h.table("currencies")).Where("id=?", row.ID).Delete(&model.Currency{}).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "货币删除成功"})
}

var settingSchema = gin.H{
	"general": gin.H{
		"name":           gin.H{"type": "text", "name": "网站名称", "key": "general_name", "description": "显示在登录、注册等页面的站点标题"},
		"enableRegister": gin.H{"type": "switch", "name": "注册功能", "key": "general_enableRegister", "description": "是否允许用户注册"},
	},
	"captcha": gin.H{
		"driver":    gin.H{"type": "select", "name": "验证码驱动", "key": "captcha_driver", "description": "选择使用的验证码服务", "options": gin.H{"none": "禁用验证码", "numeric": "数字验证码", "turnstile": "Cloudflare Turnstile", "hcaptcha": "hCaptcha", "cap": "Cap"}},
		"customUrl": gin.H{"type": "text", "name": "自定义URL", "key": "captcha_customUrl", "description": "仅适用于 Cap"},
		"siteKey":   gin.H{"type": "text", "name": "Site Key", "key": "captcha_siteKey", "description": "Turnstile、hCaptcha、Cap 的公钥（前端可见）"},
		"secretKey": gin.H{"type": "text", "name": "Secret Key", "key": "captcha_siteSecret", "description": "对应服务的私钥，仅服务端校验时使用，请勿泄露"},
	},
}

var allowedSettingKeys = map[string]bool{"general_name": true, "general_enableRegister": true, "captcha_driver": true, "captcha_customUrl": true, "captcha_siteKey": true, "captcha_siteSecret": true}

func (h *Handler) adminSettings(c *gin.Context) {
	var rows []model.Setting
	h.db.WithContext(c).Table(h.table("setting")).Find(&rows)
	values := make(map[string]string, len(rows))
	for _, row := range rows {
		if allowedSettingKeys[row.Key] {
			values[row.Key] = row.Value
		}
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"settings": settingSchema, "settingData": values, "categories": []string{"general", "captcha"}}})
}

func (h *Handler) adminUpdateSettings(c *gin.Context) {
	var input map[string]any
	if c.ShouldBindJSON(&input) != nil || len(input) == 0 {
		legacyError(c, "参数为空")
		return
	}
	err := h.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		for key, raw := range input {
			if !allowedSettingKeys[key] {
				continue
			}
			value := fmt.Sprint(raw)
			if boolean, ok := raw.(bool); ok {
				if boolean {
					value = "1"
				} else {
					value = "0"
				}
			}
			var count int64
			tx.Table(h.table("setting")).Where("`key`=?", key).Count(&count)
			if count == 0 {
				if err := tx.Table(h.table("setting")).Create(&model.Setting{Key: key, Value: value}).Error; err != nil {
					return err
				}
			} else if err := tx.Table(h.table("setting")).Where("`key`=?", key).Update("value", value).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "设置已更新"})
}

func percentage(part, total int64) string {
	if total == 0 {
		return "0.0"
	}
	return fmt.Sprintf("%.1f", float64(part)*100/float64(total))
}
func percentageNumber(part, total int64) float64 {
	if total == 0 {
		return 0
	}
	return float64(int(float64(part)*1000/float64(total)+0.5)) / 10
}
