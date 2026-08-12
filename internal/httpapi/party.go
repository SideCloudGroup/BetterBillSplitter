package httpapi

import (
	"archive/zip"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/model"
)

func (h *Handler) registerPartyRoutes(group *gin.RouterGroup) {
	group.GET("/party/create", h.partyCreateData)
	group.GET("/party/join", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{}}) })
	group.POST("/party/join", h.joinParty)
	group.POST("/party/validate-timezone", h.validateTimezone)
	group.GET("/party/search-timezones", h.searchTimezones)
	group.POST("/party/currency-info", h.currencyInfo)
	group.GET("/party/:partyId/bestpay/download", h.downloadPartyBestPay)
	group.POST("/party/:partyId/bestpay/clear", h.clearPartyBestPay)
	group.GET("/party/:partyId/bestpay", h.partyBestPay)
	group.GET("/party/:partyId/items", h.partyItemList)
	group.GET("/party/:partyId/users", h.partyMembers)
	group.GET("/party/:partyId/info", h.partyInfo)
	group.GET("/party/:partyId/edit", h.partyEditData)
	group.POST("/party/:partyId/update", h.updateParty)
	group.POST("/party/:partyId/leave", h.leaveParty)
	group.DELETE("/party/:partyId/member/:userId", h.removePartyMember)
	group.POST("/party/:partyId/archive", h.archiveParty)
	group.GET("/party/:partyId/archive/download", h.downloadArchive)
	group.DELETE("/party/:partyId", h.deleteParty)
	group.GET("/party/:partyId", h.showParty)
	group.GET("/party", h.listParties)
	group.POST("/party", h.createParty)
}

func (h *Handler) archiveParty(c *gin.Context) {
	party, _, ok := h.ownerParty(c, false)
	if !ok {
		return
	}
	if party.ArchivedAt != nil {
		legacyError(c, "该派对已归档")
		return
	}
	payload, err := h.partyExport(c, party)
	if err != nil {
		legacyError(c, "生成归档快照失败，请重试")
		return
	}
	payload["snapshot_kind"] = "pre_archive"
	payload["party_id"] = party.ID
	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil || writeArchiveSnapshot(party.ID, encoded) != nil {
		legacyError(c, "生成归档快照失败，请重试")
		return
	}
	now := time.Now()
	err = h.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		var locked model.Party
		if err := tx.Table(h.table("party")).Clauses(clause.Locking{Strength: "UPDATE"}).First(&locked, party.ID).Error; err != nil {
			return err
		}
		if locked.ArchivedAt != nil {
			return fmt.Errorf("party already archived")
		}
		if err := tx.Table(h.table("item")).Where("party_id = ? AND paid = 0", party.ID).Update("paid", true).Error; err != nil {
			return err
		}
		return tx.Table(h.table("party")).Where("id = ?", party.ID).Update("archived_at", now).Error
	})
	if err != nil {
		legacyError(c, "归档失败："+err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "归档成功，即将下载归档前快照（含最优支付）", "download_url": fmt.Sprintf("/api/user/party/%d/archive/download", party.ID)})
}

func (h *Handler) downloadArchive(c *gin.Context) {
	party, _, ok := h.memberPartyByParam(c, "partyId")
	if !ok {
		return
	}
	if party.ArchivedAt == nil {
		c.String(http.StatusNotFound, "仅已归档派对可下载归档快照")
		return
	}
	path := archiveSnapshotPath(party.ID)
	encoded, err := os.ReadFile(path)
	if err != nil {
		c.String(http.StatusNotFound, "归档快照不存在")
		return
	}
	suffix := party.ArchivedAt.Format("20060102_150405")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="party_archive_%d_%s.json"`, party.ID, suffix))
	c.Data(http.StatusOK, "application/json; charset=utf-8", encoded)
}

func writeArchiveSnapshot(partyID uint64, content []byte) error {
	directory := filepath.Join("data", "archive")
	if err := os.MkdirAll(directory, 0o750); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(directory, fmt.Sprintf("party_%d_*.tmp", partyID))
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer func() { _ = os.Remove(temporaryPath) }()
	if err := temporary.Chmod(0o640); err != nil {
		_ = temporary.Close()
		return err
	}
	if _, err := temporary.Write(content); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	target := archiveSnapshotPath(partyID)
	if err := os.Rename(temporaryPath, target); err == nil {
		return nil
	}
	if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
		return err
	}
	return os.Rename(temporaryPath, target)
}

func archiveSnapshotPath(partyID uint64) string {
	return filepath.Join("data", "archive", fmt.Sprintf("party_%d.json", partyID))
}

func (h *Handler) listParties(c *gin.Context) {
	user, _ := currentUser(c)
	var owned, joined []model.Party
	if err := h.db.WithContext(c).Table(h.table("party")).Where("owner_id = ?", user.ID).Order("updated_at DESC").Find(&owned).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	query := fmt.Sprintf("JOIN %s pm ON %s.id = pm.party_id", h.table("party_member"), h.table("party"))
	if err := h.db.WithContext(c).Table(h.table("party")).Joins(query).Where("pm.user_id = ? AND "+h.table("party")+".owner_id <> ?", user.ID, user.ID).Select(h.table("party") + ".*").Order(h.table("party") + ".updated_at DESC").Find(&joined).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"ownedParties": owned, "joinedParties": joined}})
}

func (h *Handler) previewInvite(c *gin.Context) {
	code := strings.TrimSpace(c.Param("code"))
	if code == "" {
		legacyError(c, "邀请码不能为空")
		return
	}
	var party model.Party
	if err := h.db.WithContext(c).Table(h.table("party")).Where("invite_code = ?", code).First(&party).Error; err != nil {
		legacyError(c, "邀请码无效")
		return
	}
	if party.ArchivedAt != nil {
		legacyError(c, "该派对已归档，无法加入")
		return
	}
	var memberCount int64
	h.db.WithContext(c).Table(h.table("party_member")).Where("party_id = ?", party.ID).Count(&memberCount)
	var owner model.User
	_ = h.db.WithContext(c).Table(h.table("user")).First(&owner, party.OwnerID).Error
	data := gin.H{"party_id": party.ID, "name": party.Name, "description": stringValue(party.Description), "member_count": memberCount, "base_currency": party.BaseCurrency, "currency_symbol": h.currencySymbol(c, party.BaseCurrency), "owner_username": owner.Username, "archived": false, "invite_code": party.InviteCode}
	if userID, ok := h.optionalUserID(c); ok {
		data["is_member"] = h.isPartyMember(c, party.ID, userID)
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": data})
}

func (h *Handler) optionalUserID(c *gin.Context) (uint64, bool) {
	header := c.GetHeader("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return 0, false
	}
	id, err := h.tokens.VerifyAccessToken(strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")))
	return id, err == nil
}

func (h *Handler) partyCreateData(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"currencies": h.availableCurrencies(c)}})
}

type partyInput struct {
	Name                string   `form:"name" json:"name"`
	Description         string   `form:"description" json:"description"`
	Timezone            string   `form:"timezone" json:"timezone"`
	BaseCurrency        string   `form:"base_currency" json:"base_currency"`
	SupportedCurrencies []string `form:"supported_currencies" json:"supported_currencies"`
}

func (h *Handler) createParty(c *gin.Context) {
	user, _ := currentUser(c)
	input, supported, ok := h.validatePartyInput(c)
	if !ok {
		return
	}
	code, err := h.uniqueInviteCode(c)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	description := input.Description
	encoded, _ := json.Marshal(supported)
	party := model.Party{Name: input.Name, Description: &description, InviteCode: code, OwnerID: user.ID, Timezone: input.Timezone, BaseCurrency: input.BaseCurrency, SupportedCurrencies: stringPtrHTTP(string(encoded))}
	err = h.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		if err := tx.Table(h.table("party")).Create(&party).Error; err != nil {
			return err
		}
		return tx.Table(h.table("party_member")).Create(&model.PartyMember{PartyID: party.ID, UserID: user.ID, JoinedAt: time.Now()}).Error
	})
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "派对创建成功", "party_id": party.ID})
}

func (h *Handler) validatePartyInput(c *gin.Context) (partyInput, []string, bool) {
	var input partyInput
	if err := c.ShouldBind(&input); err != nil {
		legacyError(c, "请求格式错误")
		return input, nil, false
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" {
		legacyError(c, "派对名称不能为空")
		return input, nil, false
	}
	if input.Timezone == "" {
		input.Timezone = "Asia/Shanghai"
	}
	if _, err := time.LoadLocation(input.Timezone); err != nil {
		legacyError(c, "无效的时区标识符："+input.Timezone)
		return input, nil, false
	}
	if input.BaseCurrency == "" {
		input.BaseCurrency = "cny"
	}
	available := h.availableCurrencies(c)
	if _, ok := available[input.BaseCurrency]; !ok {
		legacyError(c, "无效的基础货币")
		return input, nil, false
	}
	seen := make(map[string]bool)
	supported := make([]string, 0, len(input.SupportedCurrencies)+1)
	for _, code := range append(input.SupportedCurrencies, input.BaseCurrency) {
		code = strings.TrimSpace(strings.ToLower(code))
		if code == "" || seen[code] {
			continue
		}
		if _, ok := available[code]; !ok {
			legacyError(c, "无效的货币："+code)
			return input, nil, false
		}
		seen[code] = true
		supported = append(supported, code)
	}
	return input, supported, true
}

func (h *Handler) joinParty(c *gin.Context) {
	user, _ := currentUser(c)
	code := strings.TrimSpace(c.PostForm("invite_code"))
	if code == "" {
		var input struct {
			InviteCode string `json:"invite_code"`
		}
		_ = c.ShouldBindJSON(&input)
		code = strings.TrimSpace(input.InviteCode)
	}
	if code == "" {
		legacyError(c, "邀请码不能为空")
		return
	}
	var party model.Party
	if err := h.db.WithContext(c).Table(h.table("party")).Where("invite_code = ?", code).First(&party).Error; err != nil {
		legacyError(c, "邀请码无效")
		return
	}
	if party.ArchivedAt != nil {
		legacyError(c, "该派对已归档，无法加入")
		return
	}
	data := gin.H{"party_id": party.ID, "party_name": party.Name}
	if h.isPartyMember(c, party.ID, user.ID) {
		c.JSON(http.StatusOK, gin.H{"ret": 0, "msg": "您已经是该派对的成员", "data": data})
		return
	}
	member := model.PartyMember{PartyID: party.ID, UserID: user.ID, JoinedAt: time.Now()}
	if err := h.db.WithContext(c).Table(h.table("party_member")).Create(&member).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "成功加入派对：" + party.Name, "data": data})
}

func (h *Handler) partyEditData(c *gin.Context) {
	party, user, ok := h.ownerParty(c, false)
	if !ok {
		return
	}
	_ = user
	if party.ArchivedAt != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ret": 0, "msg": "已归档的派对无法编辑"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"party": party, "available_currencies": h.availableCurrencies(c), "current_supported_currencies": decodeCurrencies(party)}})
}

func (h *Handler) updateParty(c *gin.Context) {
	party, _, ok := h.ownerParty(c, false)
	if !ok {
		return
	}
	if party.ArchivedAt != nil {
		legacyError(c, "已归档的派对无法编辑")
		return
	}
	input, supported, ok := h.validatePartyInput(c)
	if !ok {
		return
	}
	encoded, _ := json.Marshal(supported)
	updates := map[string]any{"name": input.Name, "description": input.Description, "timezone": input.Timezone, "base_currency": input.BaseCurrency, "supported_currencies": string(encoded)}
	if err := h.db.WithContext(c).Table(h.table("party")).Where("id = ?", party.ID).Updates(updates).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "派对信息更新成功"})
}

func (h *Handler) partyMembers(c *gin.Context) {
	party, user, ok := h.memberParty(c)
	if !ok {
		return
	}
	var members []struct {
		ID       uint64 `json:"id"`
		Username string `json:"username"`
	}
	join := fmt.Sprintf("JOIN %s pm ON pm.user_id = %s.id", h.table("party_member"), h.table("user"))
	if err := h.db.WithContext(c).Table(h.table("user")).Joins(join).Where("pm.party_id = ?", party.ID).Select(h.table("user") + ".id, " + h.table("user") + ".username").Scan(&members).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "users": members, "is_owner": party.OwnerID == user.ID, "owner_id": party.OwnerID, "is_archived": party.ArchivedAt != nil})
}

func (h *Handler) partyInfo(c *gin.Context) {
	party, _, ok := h.memberParty(c)
	if !ok {
		return
	}
	var members []gin.H
	h.db.WithContext(c).Raw(fmt.Sprintf("SELECT u.id, u.username FROM %s pm JOIN %s u ON pm.user_id=u.id WHERE pm.party_id=?", h.table("party_member"), h.table("user")), party.ID).Scan(&members)
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"party": party, "members": members, "base_currency": party.BaseCurrency, "supported_currencies": decodeCurrencies(party), "all_currencies": h.availableCurrencies(c)}})
}

func (h *Handler) showParty(c *gin.Context) {
	party, user, ok := h.memberParty(c)
	if !ok {
		return
	}
	var members []gin.H
	h.db.WithContext(c).Raw(fmt.Sprintf("SELECT u.id, u.username, pm.joined_at FROM %s pm JOIN %s u ON pm.user_id=u.id WHERE pm.party_id=?", h.table("party_member"), h.table("user")), party.ID).Scan(&members)
	var rows []struct {
		ID            uint64 `json:"id"`
		Description   string `json:"description"`
		Amount        string `json:"amount"`
		Paid          bool   `json:"paid"`
		UserID        uint64 `json:"userid"`
		Initiator     uint64 `json:"initiator"`
		PayerName     string `json:"payer_name"`
		InitiatorName string `json:"initiator_name"`
	}
	h.db.WithContext(c).Raw(fmt.Sprintf("SELECT i.id,i.description,i.amount,i.paid,i.userid,i.initiator,p.username payer_name,iu.username initiator_name FROM %s i JOIN %s p ON i.userid=p.id JOIN %s iu ON i.initiator=iu.id WHERE i.party_id=?", h.table("item"), h.table("user"), h.table("user")), party.ID).Scan(&rows)
	items := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		items = append(items, gin.H{"id": row.ID, "description": row.Description, "amount": row.Amount, "paid": row.Paid, "userid": row.UserID, "initiator": row.Initiator, "payer_name": row.PayerName, "initiator_name": row.InitiatorName, "is_my_item": row.UserID == user.ID || row.Initiator == user.ID})
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"party": party, "members": members, "items": items, "isOwner": party.OwnerID == user.ID, "all_currencies": h.availableCurrencies(c), "currencySymbol": h.currencySymbol(c, party.BaseCurrency)}})
}

func (h *Handler) leaveParty(c *gin.Context) {
	party, user, ok := h.memberParty(c)
	if !ok {
		return
	}
	if party.OwnerID == user.ID {
		legacyError(c, "派对所有者不能退出，请删除派对")
		return
	}
	if h.unpaidCount(c, party.ID) > 0 {
		legacyError(c, "该派对中还有未支付项目，无法退出。请先处理完所有未支付项目后再退出。")
		return
	}
	if err := h.db.WithContext(c).Table(h.table("party_member")).Where("party_id = ? AND user_id = ?", party.ID, user.ID).Delete(&model.PartyMember{}).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "已退出派对"})
}

func (h *Handler) removePartyMember(c *gin.Context) {
	party, owner, ok := h.ownerParty(c, true)
	if !ok {
		return
	}
	memberID, ok := parseID(c, "userId")
	if !ok {
		return
	}
	if party.ArchivedAt != nil {
		legacyError(c, "已归档的派对无法移除成员")
		return
	}
	if memberID == owner.ID || memberID == party.OwnerID {
		legacyError(c, "不能移除派对所有者")
		return
	}
	if !h.isPartyMember(c, party.ID, memberID) {
		c.JSON(http.StatusNotFound, gin.H{"ret": 0, "msg": "该用户不是该派对的成员"})
		return
	}
	var related int64
	h.db.WithContext(c).Table(h.table("item")).Where("party_id = ? AND (initiator = ? OR userid = ?)", party.ID, memberID, memberID).Count(&related)
	if related > 0 {
		legacyError(c, "该成员存在支付/代付记录，无法移除")
		return
	}
	h.db.WithContext(c).Table(h.table("party_member")).Where("party_id = ? AND user_id = ?", party.ID, memberID).Delete(&model.PartyMember{})
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "已移除成员"})
}

func (h *Handler) deleteParty(c *gin.Context) {
	party, _, ok := h.ownerParty(c, false)
	if !ok {
		return
	}
	if party.ArchivedAt != nil {
		legacyError(c, "已归档的派对无法删除")
		return
	}
	if h.unpaidCount(c, party.ID) > 0 {
		legacyError(c, "该派对中还有未支付项目，无法删除。请先处理完所有未支付项目后再删除派对。")
		return
	}
	err := h.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		if err := tx.Table(h.table("party_member")).Where("party_id = ?", party.ID).Delete(&model.PartyMember{}).Error; err != nil {
			return err
		}
		if err := tx.Table(h.table("item")).Where("party_id = ?", party.ID).Delete(&model.Item{}).Error; err != nil {
			return err
		}
		return tx.Table(h.table("party")).Where("id = ?", party.ID).Delete(&model.Party{}).Error
	})
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "派对已删除"})
}

func (h *Handler) validateTimezone(c *gin.Context) {
	timezone := strings.TrimSpace(c.PostForm("timezone"))
	if timezone == "" {
		var input struct {
			Timezone string `json:"timezone"`
		}
		_ = c.ShouldBindJSON(&input)
		timezone = strings.TrimSpace(input.Timezone)
	}
	location, err := time.LoadLocation(timezone)
	if timezone == "" || err != nil {
		legacyError(c, "无效的时区标识符")
		return
	}
	now := time.Now().In(location)
	_, offsetSeconds := now.Zone()
	offset := fmt.Sprintf("%+03d:%02d", offsetSeconds/3600, abs(offsetSeconds%3600)/60)
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "时区有效", "timezone": timezone, "current_offset": offset, "is_dst": now.IsDST()})
}

func (h *Handler) searchTimezones(c *gin.Context) {
	query := strings.ToLower(strings.TrimSpace(c.Query("query")))
	if len(query) < 2 {
		legacyError(c, "搜索关键词至少2个字符")
		return
	}
	result := make([]string, 0, 20)
	for _, zone := range timezoneNames() {
		if strings.Contains(strings.ToLower(zone), query) {
			result = append(result, zone)
			if len(result) == 20 {
				break
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "timezones": result, "count": len(result)})
}

func (h *Handler) currencyInfo(c *gin.Context) {
	var input struct {
		Currencies []string `form:"currencies" json:"currencies"`
	}
	_ = c.ShouldBind(&input)
	available := h.availableCurrencies(c)
	result := make(map[string]string, len(input.Currencies))
	for _, code := range input.Currencies {
		if currency, ok := available[strings.ToLower(code)]; ok {
			result[code] = currency.Name + " (" + strings.ToUpper(code) + ")"
		} else {
			result[code] = strings.ToUpper(code)
		}
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "currency_info": result})
}

func (h *Handler) ownerParty(c *gin.Context, hideExistence bool) (model.Party, model.User, bool) {
	user, _ := currentUser(c)
	value := c.Param("id")
	if value == "" {
		value = c.Param("partyId")
	}
	id, ok := parseUint(value)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"ret": 0, "msg": "ID无效"})
		return model.Party{}, user, false
	}
	var party model.Party
	if !ok || h.db.WithContext(c).Table(h.table("party")).First(&party, id).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"ret": 0, "msg": "派对不存在"})
		return party, user, false
	}
	if party.OwnerID != user.ID {
		status := http.StatusForbidden
		message := "只有派对所有者可以操作"
		if hideExistence {
			message = "只有派对所有者可以移除成员"
		}
		c.JSON(status, gin.H{"ret": 0, "msg": message})
		return party, user, false
	}
	return party, user, true
}

func (h *Handler) memberParty(c *gin.Context) (model.Party, model.User, bool) {
	user, _ := currentUser(c)
	value := c.Param("partyId")
	if value == "" {
		value = c.Param("id")
	}
	id, ok := parseUint(value)
	var party model.Party
	if !ok || h.db.WithContext(c).Table(h.table("party")).First(&party, id).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"ret": 0, "msg": "派对不存在"})
		return party, user, false
	}
	if !h.isPartyMember(c, party.ID, user.ID) {
		c.JSON(http.StatusForbidden, gin.H{"ret": 0, "msg": "您不是该派对的成员"})
		return party, user, false
	}
	return party, user, true
}

func (h *Handler) isPartyMember(c *gin.Context, partyID, userID uint64) bool {
	var count int64
	h.db.WithContext(c).Table(h.table("party_member")).Where("party_id = ? AND user_id = ?", partyID, userID).Count(&count)
	return count > 0
}

func (h *Handler) unpaidCount(c *gin.Context, partyID uint64) int64 {
	var count int64
	h.db.WithContext(c).Table(h.table("item")).Where("party_id = ? AND paid = 0", partyID).Count(&count)
	return count
}

func (h *Handler) availableCurrencies(c *gin.Context) map[string]model.Currency {
	var rows []model.Currency
	_ = h.db.WithContext(c).Table(h.table("currencies")).Where("is_active = 1").Order("is_default DESC, code ASC").Find(&rows).Error
	result := make(map[string]model.Currency, len(rows))
	for _, row := range rows {
		display := row
		display.Code = strings.ToUpper(row.Code)
		result[strings.ToLower(row.Code)] = display
	}
	return result
}

func (h *Handler) currencySymbol(c *gin.Context, code string) string {
	var currency model.Currency
	if h.db.WithContext(c).Table(h.table("currencies")).Where("code = ? AND is_active = 1", strings.ToLower(code)).First(&currency).Error == nil {
		return currency.Symbol
	}
	return "¥"
}

func decodeCurrencies(party model.Party) []string {
	result := []string{party.BaseCurrency}
	if party.SupportedCurrencies != nil {
		var decoded []string
		if json.Unmarshal([]byte(*party.SupportedCurrencies), &decoded) == nil && len(decoded) > 0 {
			result = decoded
		}
	}
	found := false
	for _, code := range result {
		if code == party.BaseCurrency {
			found = true
		}
	}
	if !found {
		result = append(result, party.BaseCurrency)
	}
	return result
}

func (h *Handler) uniqueInviteCode(c *gin.Context) (string, error) {
	const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	for attempt := 0; attempt < 10; attempt++ {
		raw := make([]byte, 8)
		if _, err := rand.Read(raw); err != nil {
			return "", err
		}
		for i := range raw {
			raw[i] = alphabet[int(raw[i])%len(alphabet)]
		}
		code := string(raw)
		var count int64
		h.db.WithContext(c).Table(h.table("party")).Where("invite_code = ?", code).Count(&count)
		if count == 0 {
			return code, nil
		}
	}
	return "", fmt.Errorf("could not generate unique invite code")
}

func parseID(c *gin.Context, name string) (uint64, bool) {
	id, ok := parseUint(c.Param(name))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"ret": 0, "msg": "ID无效"})
	}
	return id, ok
}
func parseUint(value string) (uint64, bool) {
	var id uint64
	_, err := fmt.Sscan(value, &id)
	return id, err == nil && id > 0
}
func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
func stringPtrHTTP(value string) *string { return &value }
func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

func timezoneNames() []string {
	path := filepath.Join(runtime.GOROOT(), "lib", "time", "zoneinfo.zip")
	reader, err := zip.OpenReader(path)
	if err != nil {
		return []string{"Asia/Shanghai", "Asia/Hong_Kong", "Asia/Tokyo", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC"}
	}
	defer reader.Close()
	zones := make([]string, 0, len(reader.File))
	for _, file := range reader.File {
		name := file.Name
		if !strings.HasPrefix(name, "Etc/") && strings.Contains(name, "/") && !strings.HasPrefix(name, "posix/") && !strings.HasPrefix(name, "right/") {
			zones = append(zones, name)
		}
	}
	sort.Strings(zones)
	return zones
}
