package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/model"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/money"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/settlement"
)

func (h *Handler) registerItemRoutes(group *gin.RouterGroup) {
	group.GET("", h.home)
	group.GET("/payment/party/:partyId", h.paymentByParty)
	group.GET("/payment", h.paymentList)
	group.GET("/item/add", h.itemAddData)
	group.POST("/item/add", h.addItem)
	group.GET("/item/party/:partyId", h.itemListByParty)
	group.POST("/item/:id", h.updateItemStatus)
	group.DELETE("/item/:id", h.deleteItem)
	group.GET("/item", h.itemList)
}

func (h *Handler) itemAddData(c *gin.Context) {
	user, _ := currentUser(c)
	var parties []struct {
		ID          uint64  `json:"id"`
		Name        string  `json:"name"`
		Description *string `json:"description"`
	}
	query := fmt.Sprintf("SELECT p.id,p.name,p.description FROM %s p JOIN %s pm ON p.id=pm.party_id WHERE pm.user_id=? AND p.archived_at IS NULL ORDER BY p.updated_at DESC", h.table("party"), h.table("party_member"))
	if err := h.db.WithContext(c).Raw(query, user.ID).Scan(&parties).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"parties": parties}})
}

type splitInput struct {
	UserID uint64      `json:"user_id"`
	Amount json.Number `json:"amount"`
}

func (h *Handler) addItem(c *gin.Context) {
	user, _ := currentUser(c)
	partyID, ok := parseUint(c.PostForm("party_id"))
	if !ok {
		legacyError(c, "请选择派对")
		return
	}
	description := strings.TrimSpace(c.PostForm("description"))
	unit := strings.ToLower(strings.TrimSpace(c.PostForm("unit")))
	if description == "" {
		legacyError(c, "描述不能为空")
		return
	}
	if unit == "" {
		legacyError(c, "单位不能为空")
		return
	}
	var party model.Party
	if err := h.db.WithContext(c).Table(h.table("party")).First(&party, partyID).Error; err != nil {
		legacyError(c, "派对不存在")
		return
	}
	if party.ArchivedAt != nil {
		legacyError(c, "该派对已归档，无法添加收款项")
		return
	}
	if !h.isPartyMember(c, party.ID, user.ID) {
		legacyError(c, "您不是该派对的成员")
		return
	}
	supported := decodeCurrencies(party)
	supportedSet := make(map[string]bool, len(supported))
	for _, code := range supported {
		supportedSet[strings.ToLower(code)] = true
	}
	if !supportedSet[unit] {
		legacyError(c, "该派对不支持此货币")
		return
	}

	type allocation struct {
		userID uint64
		amount string
	}
	allocations := make([]allocation, 0)
	if rawSplits := c.PostForm("splits"); rawSplits != "" {
		decoder := json.NewDecoder(strings.NewReader(rawSplits))
		decoder.UseNumber()
		var splits []splitInput
		if err := decoder.Decode(&splits); err != nil || len(splits) == 0 {
			legacyError(c, "分摊数据格式无效")
			return
		}
		seen := make(map[uint64]bool, len(splits))
		for index, split := range splits {
			amount, err := money.Parse(split.Amount.String())
			if split.UserID == 0 {
				legacyError(c, fmt.Sprintf("分摊第 %d 项用户无效", index+1))
				return
			}
			if err != nil || amount <= 0 {
				legacyError(c, fmt.Sprintf("分摊第 %d 项金额必须大于 0", index+1))
				return
			}
			if seen[split.UserID] {
				legacyError(c, "同一用户不能重复分摊")
				return
			}
			seen[split.UserID] = true
			allocations = append(allocations, allocation{split.UserID, amount.String()})
		}
	} else {
		var userIDs []uint64
		if err := json.Unmarshal([]byte(c.PostForm("users")), &userIDs); err != nil || len(userIDs) == 0 {
			legacyError(c, "用户不能为空")
			return
		}
		amount, err := money.Parse(c.PostForm("amount"))
		if err != nil || amount <= 0 {
			legacyError(c, "金额必须大于 0")
			return
		}
		seen := make(map[uint64]bool, len(userIDs))
		for _, userID := range userIDs {
			if userID == 0 || seen[userID] {
				legacyError(c, "用户无效或重复")
				return
			}
			seen[userID] = true
			allocations = append(allocations, allocation{userID, amount.String()})
		}
	}

	memberIDs := make([]uint64, 0, len(allocations))
	for _, allocation := range allocations {
		memberIDs = append(memberIDs, allocation.userID)
	}
	var memberCount int64
	h.db.WithContext(c).Table(h.table("party_member")).Where("party_id = ? AND user_id IN ?", party.ID, memberIDs).Count(&memberCount)
	if memberCount != int64(len(memberIDs)) {
		legacyError(c, "包含不属于该派对的用户")
		return
	}

	if unit != strings.ToLower(party.BaseCurrency) {
		rates, err := h.exchange.Rates(c, party.BaseCurrency)
		if err != nil || rates[unit] == "" {
			legacyError(c, "无法获取该货币的汇率信息")
			return
		}
		for index := range allocations {
			converted, err := money.ConvertToBaseCurrency(allocations[index].amount, rates[unit])
			if err != nil || converted <= 0 {
				legacyError(c, "无法获取该货币的汇率信息")
				return
			}
			allocations[index].amount = converted.String()
		}
	}
	location, _ := time.LoadLocation(party.Timezone)
	createdAt := time.Now()
	if location != nil {
		createdAt = createdAt.In(location)
	}
	err := h.db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		for _, allocation := range allocations {
			partyID := party.ID
			item := model.Item{UserID: allocation.userID, Description: description, CreatedAt: createdAt, Amount: allocation.amount, Paid: allocation.userID == user.ID, Initiator: user.ID, PartyID: &partyID}
			if err := tx.Table(h.table("item")).Create(&item).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "添加成功", "data": gin.H{"count": len(allocations)}})
}

type partyTotalRow struct {
	ID           uint64  `json:"id"`
	Name         string  `json:"name"`
	Description  *string `json:"description"`
	BaseCurrency string  `json:"base_currency"`
	TotalAmount  string  `json:"total_amount"`
}

func (h *Handler) paymentList(c *gin.Context) {
	h.partyTotals(c, "userid")
}

func (h *Handler) itemList(c *gin.Context) {
	h.partyTotals(c, "initiator")
}

func (h *Handler) partyTotals(c *gin.Context, roleColumn string) {
	user, _ := currentUser(c)
	if roleColumn != "userid" && roleColumn != "initiator" {
		legacyServiceError(c, fmt.Errorf("invalid role column"))
		return
	}
	query := fmt.Sprintf(`SELECT p.id,p.name,p.description,p.base_currency,COALESCE(SUM(i.amount),0) total_amount
FROM %s p JOIN %s pm ON p.id=pm.party_id
JOIN %s i ON i.party_id=p.id AND i.%s=? AND i.paid=0
WHERE pm.user_id=? AND p.archived_at IS NULL
GROUP BY p.id,p.name,p.description,p.base_currency ORDER BY p.updated_at DESC`, h.table("party"), h.table("party_member"), h.table("item"), roleColumn)
	var rows []partyTotalRow
	if err := h.db.WithContext(c).Raw(query, user.ID, user.ID).Scan(&rows).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	result := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		amount, err := money.Parse(row.TotalAmount)
		if err != nil || amount <= 0 {
			continue
		}
		result = append(result, gin.H{"id": row.ID, "name": row.Name, "description": stringValue(row.Description), "base_currency": row.BaseCurrency, "total_amount": amount.String(), "currency_symbol": h.currencySymbol(c, row.BaseCurrency)})
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"parties": result}})
}

func (h *Handler) itemListByParty(c *gin.Context) {
	party, user, ok := h.memberPartyByParam(c, "partyId")
	if !ok {
		return
	}
	var items []struct {
		ID          uint64    `json:"id"`
		Username    string    `json:"username"`
		Description string    `json:"description"`
		Amount      string    `json:"amount"`
		Paid        int       `json:"paid"`
		CreatedAt   time.Time `json:"created_at"`
	}
	query := fmt.Sprintf("SELECT i.id,u.username,i.description,i.amount,i.paid,i.created_at FROM %s i JOIN %s u ON i.userid=u.id WHERE i.party_id=? AND i.initiator=? ORDER BY i.paid,i.created_at DESC", h.table("item"), h.table("user"))
	if err := h.db.WithContext(c).Raw(query, party.ID, user.ID).Scan(&items).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	var total, paid, unpaid money.Amount
	for _, item := range items {
		amount, err := money.Parse(item.Amount)
		if err != nil {
			legacyServiceError(c, err)
			return
		}
		total += amount
		if item.Paid == 1 {
			paid += amount
		} else {
			unpaid += amount
		}
	}
	partyView := gin.H{"id": party.ID, "name": party.Name, "description": stringValue(party.Description), "base_currency": party.BaseCurrency, "currency_symbol": h.currencySymbol(c, party.BaseCurrency), "is_archived": party.ArchivedAt != nil}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"party": partyView, "items": items, "totalAmount": total.String(), "paidAmount": paid.String(), "unpaidAmount": unpaid.String()}})
}

func (h *Handler) home(c *gin.Context) {
	user, _ := currentUser(c)
	var parties []struct {
		ID          uint64  `json:"id"`
		Name        string  `json:"name"`
		Description *string `json:"description"`
	}
	partyQuery := fmt.Sprintf("SELECT p.id,p.name,p.description FROM %s p JOIN %s pm ON p.id=pm.party_id WHERE pm.user_id=? ORDER BY p.updated_at DESC", h.table("party"), h.table("party_member"))
	if err := h.db.WithContext(c).Raw(partyQuery, user.ID).Scan(&parties).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	var aggregates struct {
		ItemsToPay       int64  `gorm:"column:items_to_pay"`
		ItemsCreated     int64  `gorm:"column:items_created"`
		UnpaidItems      int64  `gorm:"column:unpaid_items"`
		ReceivableItems  int64  `gorm:"column:receivable_items"`
		UnpaidAmount     string `gorm:"column:unpaid_amount"`
		ReceivableAmount string `gorm:"column:receivable_amount"`
	}
	aggregateQuery := fmt.Sprintf(`SELECT
SUM(CASE WHEN i.userid=? THEN 1 ELSE 0 END) items_to_pay,
SUM(CASE WHEN i.initiator=? THEN 1 ELSE 0 END) items_created,
SUM(CASE WHEN i.userid=? AND i.paid=0 THEN 1 ELSE 0 END) unpaid_items,
SUM(CASE WHEN i.initiator=? AND i.paid=0 THEN 1 ELSE 0 END) receivable_items,
COALESCE(SUM(CASE WHEN i.userid=? AND i.paid=0 THEN i.amount ELSE 0 END),0) unpaid_amount,
COALESCE(SUM(CASE WHEN i.initiator=? AND i.paid=0 THEN i.amount ELSE 0 END),0) receivable_amount
FROM %s i JOIN %s pm ON i.party_id=pm.party_id
WHERE pm.user_id=? AND (i.userid=? OR i.initiator=?)`, h.table("item"), h.table("party_member"))
	args := []any{user.ID, user.ID, user.ID, user.ID, user.ID, user.ID, user.ID, user.ID, user.ID}
	if err := h.db.WithContext(c).Raw(aggregateQuery, args...).Scan(&aggregates).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	unpaidAmount, _ := money.Parse(defaultDecimal(aggregates.UnpaidAmount))
	receivableAmount, _ := money.Parse(defaultDecimal(aggregates.ReceivableAmount))
	totalRelevant := aggregates.UnpaidItems + aggregates.ReceivableItems
	unpaidPercentage, receivablePercentage := "0.0", "0.0"
	if totalRelevant > 0 {
		unpaidPercentage = fmt.Sprintf("%.1f", float64(aggregates.UnpaidItems)*100/float64(totalRelevant))
		receivablePercentage = fmt.Sprintf("%.1f", float64(aggregates.ReceivableItems)*100/float64(totalRelevant))
	}
	stats := gin.H{
		"total_parties": len(parties), "total_unpaid_amount": unpaidAmount.String(), "total_receivable_amount": receivableAmount.String(),
		"total_items_created": aggregates.ItemsCreated, "total_items_to_pay": aggregates.ItemsToPay,
		"total_unpaid_items": aggregates.UnpaidItems, "total_receivable_items": aggregates.ReceivableItems,
		"total_amount": (unpaidAmount + receivableAmount).String(), "total_items": aggregates.ItemsCreated + aggregates.ItemsToPay,
		"total_all_items": totalRelevant, "unpaid_percentage": unpaidPercentage, "receivable_percentage": receivablePercentage,
	}
	var activities []struct {
		ID            uint64    `json:"id"`
		Description   string    `json:"description"`
		Amount        string    `json:"amount"`
		Paid          int       `json:"paid"`
		CreatedAt     time.Time `json:"created_at"`
		Initiator     uint64
		UserID        uint64 `gorm:"column:userid"`
		PartyID       uint64 `json:"party_id"`
		PartyName     string `json:"party_name"`
		BaseCurrency  string
		Timezone      string
		DebtorName    string
		InitiatorName string
	}
	activityQuery := fmt.Sprintf(`SELECT i.id,i.description,i.amount,i.paid,i.created_at,i.initiator,i.userid,p.id party_id,p.name party_name,p.base_currency,p.timezone,du.username debtor_name,iu.username initiator_name
FROM %s i JOIN %s p ON i.party_id=p.id JOIN %s pm ON i.party_id=pm.party_id
JOIN %s du ON i.userid=du.id JOIN %s iu ON i.initiator=iu.id
WHERE pm.user_id=? AND (i.initiator=? OR i.userid=?) AND NOT(i.initiator=? AND i.userid=?)
AND i.created_at>=?
ORDER BY i.created_at DESC LIMIT 20`, h.table("item"), h.table("party"), h.table("party_member"), h.table("user"), h.table("user"))
	activitySince := recentActivityCutoff(time.Now())
	if err := h.db.WithContext(c).Raw(activityQuery, user.ID, user.ID, user.ID, user.ID, user.ID, activitySince).Scan(&activities).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	recentActivity := make([]gin.H, 0, len(activities))
	for _, row := range activities {
		initiated := row.Initiator == user.ID
		counterparty := row.InitiatorName
		typeName := "assigned"
		if initiated {
			counterparty = row.DebtorName
			typeName = "initiated"
		}
		recentActivity = append(recentActivity, gin.H{"id": row.ID, "description": row.Description, "amount": row.Amount, "paid": row.Paid, "created_at": row.CreatedAt, "party_id": row.PartyID, "party_name": row.PartyName, "timezone": row.Timezone, "currency_symbol": h.currencySymbol(c, row.BaseCurrency), "type": typeName, "counterparty_name": counterparty})
	}
	var defaultCurrency model.Currency
	if h.db.WithContext(c).Table(h.table("currencies")).Where("is_default=1 AND is_active=1").First(&defaultCurrency).Error != nil {
		defaultCurrency = model.Currency{Code: "cny", Symbol: "¥"}
	}
	recent := parties
	if len(recent) > 5 {
		recent = recent[:5]
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"user": user, "parties": parties, "stats": stats, "recentParties": recent, "recentActivity": recentActivity, "currencySymbol": defaultCurrency.Symbol, "currencyCode": strings.ToUpper(defaultCurrency.Code)}})
}

const recentActivityWindow = 30 * 24 * time.Hour

func recentActivityCutoff(now time.Time) time.Time {
	return now.Add(-recentActivityWindow)
}

func defaultDecimal(value string) string {
	if value == "" {
		return "0"
	}
	return value
}

type itemRow struct {
	ID            uint64    `json:"id"`
	Description   string    `json:"description"`
	Amount        string    `json:"amount"`
	Paid          bool      `json:"paid"`
	CreatedAt     time.Time `json:"created_at"`
	UserID        uint64    `json:"userid"`
	Initiator     uint64    `json:"initiator"`
	PayerName     string    `json:"payer_name"`
	InitiatorName string    `json:"initiator_name"`
}

func (h *Handler) partyBestPay(c *gin.Context) {
	party, user, ok := h.memberPartyByParam(c, "partyId")
	if !ok {
		return
	}
	optimized, stage1, stats, err := h.partySettlement(c, party.ID)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"party": party, "bestPayAll": debtsJSON(stage1), "bestPayFinal": debtsJSON(optimized), "userStat": stats, "isOwner": party.OwnerID == user.ID, "currencySymbol": h.currencySymbol(c, party.BaseCurrency)}})
}

func (h *Handler) partySettlement(c *gin.Context, partyID uint64) (settlement.Debts, settlement.Debts, map[string]gin.H, error) {
	var memberRows []struct {
		ID       uint64
		Username string
	}
	query := fmt.Sprintf("SELECT u.id,u.username FROM %s pm JOIN %s u ON pm.user_id=u.id WHERE pm.party_id=? ORDER BY pm.id", h.table("party_member"), h.table("user"))
	if err := h.db.WithContext(c).Raw(query, partyID).Scan(&memberRows).Error; err != nil {
		return nil, nil, nil, err
	}
	users := make([]settlement.User, 0, len(memberRows))
	for _, row := range memberRows {
		users = append(users, settlement.User{ID: int64(row.ID), Username: row.Username})
	}
	var itemRows []struct {
		UserID    uint64 `gorm:"column:userid"`
		Initiator uint64
		Amount    string
	}
	if err := h.db.WithContext(c).Table(h.table("item")).Select("userid, initiator, amount").Where("party_id = ? AND paid = 0", partyID).Order("id").Scan(&itemRows).Error; err != nil {
		return nil, nil, nil, err
	}
	items := make([]settlement.Item, 0, len(itemRows))
	stats := make(map[string]gin.H, len(users))
	for _, user := range users {
		stats[user.Username] = gin.H{"in": "0.00", "out": "0.00"}
	}
	inTotals := make(map[int64]money.Amount)
	outTotals := make(map[int64]money.Amount)
	for _, row := range itemRows {
		amount, err := money.Parse(row.Amount)
		if err != nil {
			return nil, nil, nil, err
		}
		inTotals[int64(row.Initiator)] += amount
		outTotals[int64(row.UserID)] += amount
		items = append(items, settlement.Item{UserID: int64(row.UserID), Initiator: int64(row.Initiator), Amount: row.Amount})
	}
	for _, user := range users {
		stats[user.Username] = gin.H{"in": inTotals[user.ID].String(), "out": outTotals[user.ID].String()}
	}
	unpaid, err := settlement.AggregateUnpaid(items)
	if err != nil {
		return nil, nil, nil, err
	}
	optimized, stage1 := settlement.Compute(unpaid, users)
	return optimized, stage1, stats, nil
}

func debtsJSON(debts settlement.Debts) map[string]map[string]string {
	result := make(map[string]map[string]string, len(debts))
	for debtor, creditors := range debts {
		result[debtor] = make(map[string]string, len(creditors))
		for creditor, amount := range creditors {
			result[debtor][creditor] = amount.String()
		}
	}
	return result
}

func (h *Handler) downloadPartyBestPay(c *gin.Context) {
	party, _, ok := h.memberPartyByParam(c, "partyId")
	if !ok {
		return
	}
	payload, err := h.partyExport(c, party)
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		legacyServiceError(c, err)
		return
	}
	filename := fmt.Sprintf("party_bestpay_%d_%s.json", party.ID, time.Now().Format("20060102_150405"))
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Data(http.StatusOK, "application/json; charset=utf-8", encoded)
}

func (h *Handler) partyExport(c *gin.Context, party model.Party) (gin.H, error) {
	optimized, stage1, stats, err := h.partySettlement(c, party.ID)
	if err != nil {
		return nil, err
	}
	var items []itemRow
	query := fmt.Sprintf("SELECT i.id,i.description,i.amount,i.userid,i.initiator,i.paid,i.created_at,p.username payer_name,iu.username initiator_name FROM %s i JOIN %s p ON i.userid=p.id JOIN %s iu ON i.initiator=iu.id WHERE i.party_id=? ORDER BY i.id", h.table("item"), h.table("user"), h.table("user"))
	if err := h.db.WithContext(c).Raw(query, party.ID).Scan(&items).Error; err != nil {
		return nil, err
	}
	return gin.H{"party_name": party.Name, "party_description": stringValue(party.Description), "archived_at": party.ArchivedAt, "bestPayFinal": debtsJSON(optimized), "bestPayAll": debtsJSON(stage1), "userStat": stats, "items": items, "export_time": time.Now().Format("2006-01-02 15:04:05")}, nil
}

func (h *Handler) clearPartyBestPay(c *gin.Context) {
	party, _, ok := h.ownerPartyByParam(c, "partyId")
	if !ok {
		return
	}
	if party.ArchivedAt != nil {
		legacyError(c, "已归档的派对无法清空记录")
		return
	}
	if err := h.db.WithContext(c).Table(h.table("item")).Where("party_id = ? AND paid = 0", party.ID).Update("paid", true).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "派对待支付记录已清空"})
}

func (h *Handler) partyItemList(c *gin.Context) {
	party, user, ok := h.memberPartyByParam(c, "partyId")
	if !ok {
		return
	}
	var rows []itemRow
	query := fmt.Sprintf("SELECT i.id,i.description,i.amount,i.paid,i.created_at,i.userid,i.initiator,p.username payer_name,iu.username initiator_name FROM %s i JOIN %s p ON i.userid=p.id JOIN %s iu ON i.initiator=iu.id WHERE i.party_id=? ORDER BY i.created_at DESC", h.table("item"), h.table("user"), h.table("user"))
	if err := h.db.WithContext(c).Raw(query, party.ID).Scan(&rows).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	type counters struct {
		total, unpaid, myInitiated, myPayment                         int
		totalAmount, unpaidAmount, myInitiatedAmount, myInitiatedOpen money.Amount
		myPaymentAmount                                               money.Amount
	}
	var stat counters
	items := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		amount, err := money.Parse(row.Amount)
		if err != nil {
			legacyServiceError(c, err)
			return
		}
		mineInitiated, minePayment := row.Initiator == user.ID, row.UserID == user.ID
		stat.total++
		stat.totalAmount += amount
		if !row.Paid {
			stat.unpaid++
			stat.unpaidAmount += amount
		}
		if mineInitiated {
			stat.myInitiated++
			stat.myInitiatedAmount += amount
			if !row.Paid {
				stat.myInitiatedOpen += amount
			}
		}
		if minePayment {
			stat.myPayment++
			if !row.Paid {
				stat.myPaymentAmount += amount
			}
		}
		items = append(items, gin.H{"id": row.ID, "description": row.Description, "amount": row.Amount, "paid": boolInt(row.Paid), "created_at": row.CreatedAt, "userid": row.UserID, "initiator": row.Initiator, "payer_name": row.PayerName, "initiator_name": row.InitiatorName, "is_my_initiation": mineInitiated, "is_my_payment": minePayment})
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"party": gin.H{"id": party.ID, "name": party.Name, "description": stringValue(party.Description), "timezone": party.Timezone, "currency_symbol": h.currencySymbol(c, party.BaseCurrency), "is_archived": party.ArchivedAt != nil}, "isOwner": party.OwnerID == user.ID, "items": items, "stats": gin.H{"total": stat.total, "unpaid": stat.unpaid, "my_initiated": stat.myInitiated, "my_payment": stat.myPayment, "total_amount": stat.totalAmount.String(), "unpaid_amount": stat.unpaidAmount.String(), "my_initiated_amount": stat.myInitiatedAmount.String(), "my_initiated_unpaid": stat.myInitiatedOpen.String(), "my_payment_amount": stat.myPaymentAmount.String()}}})
}

func (h *Handler) paymentByParty(c *gin.Context) {
	party, user, ok := h.memberPartyByParam(c, "partyId")
	if !ok {
		return
	}
	var items []struct {
		ID          uint64    `json:"id"`
		Username    string    `json:"username"`
		Description string    `json:"description"`
		Amount      string    `json:"amount"`
		Paid        bool      `json:"paid"`
		CreatedAt   time.Time `json:"created_at"`
	}
	query := fmt.Sprintf("SELECT i.id,u.username,i.description,i.amount,i.paid,i.created_at FROM %s i JOIN %s u ON i.initiator=u.id WHERE i.party_id=? AND i.userid=? AND i.paid=0 ORDER BY i.created_at DESC", h.table("item"), h.table("user"))
	if err := h.db.WithContext(c).Raw(query, party.ID, user.ID).Scan(&items).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	var total money.Amount
	for _, item := range items {
		amount, err := money.Parse(item.Amount)
		if err != nil {
			legacyServiceError(c, err)
			return
		}
		total += amount
	}
	partyView := gin.H{"id": party.ID, "name": party.Name, "description": stringValue(party.Description), "timezone": party.Timezone, "base_currency": party.BaseCurrency, "currency_symbol": h.currencySymbol(c, party.BaseCurrency)}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "data": gin.H{"party": partyView, "items": items, "totalAmount": total.String()}})
}

func (h *Handler) updateItemStatus(c *gin.Context) {
	user, _ := currentUser(c)
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	var item model.Item
	if err := h.db.WithContext(c).Table(h.table("item")).Where("id = ? AND initiator = ?", id, user.ID).First(&item).Error; err != nil {
		legacyError(c, "未找到指定项目")
		return
	}
	if item.PartyID == nil || !h.isPartyMember(c, *item.PartyID, user.ID) {
		legacyError(c, "您不是该派对的成员")
		return
	}
	var party model.Party
	if h.db.WithContext(c).Table(h.table("party")).First(&party, *item.PartyID).Error == nil && party.ArchivedAt != nil {
		legacyError(c, "该派对已归档，无法修改支付状态")
		return
	}
	paidRaw := c.PostForm("paid")
	if paidRaw == "" {
		var input struct {
			Paid any `json:"paid"`
		}
		_ = c.ShouldBindJSON(&input)
		paidRaw = fmt.Sprint(input.Paid)
	}
	paid, err := strconv.ParseBool(paidRaw)
	if err != nil {
		if paidRaw == "1" {
			paid = true
		} else if paidRaw != "0" {
			legacyError(c, "支付状态无效")
			return
		}
	}
	if err := h.db.WithContext(c).Table(h.table("item")).Where("id = ?", id).Update("paid", paid).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "更新成功"})
}

func (h *Handler) deleteItem(c *gin.Context) {
	user, _ := currentUser(c)
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	var item model.Item
	if err := h.db.WithContext(c).Table(h.table("item")).First(&item, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"ret": 0, "msg": "账目不存在"})
		return
	}
	if item.PartyID == nil {
		c.JSON(http.StatusNotFound, gin.H{"ret": 0, "msg": "账目所属派对不存在"})
		return
	}
	var party model.Party
	if h.db.WithContext(c).Table(h.table("party")).First(&party, *item.PartyID).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"ret": 0, "msg": "账目所属派对不存在"})
		return
	}
	if party.OwnerID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"ret": 0, "msg": "只有派对所有者可以删除账目"})
		return
	}
	if party.ArchivedAt != nil {
		legacyError(c, "已归档的派对无法删除账目")
		return
	}
	if err := h.db.WithContext(c).Table(h.table("item")).Where("id = ?", item.ID).Delete(&model.Item{}).Error; err != nil {
		legacyServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ret": 1, "msg": "账目已删除"})
}

func (h *Handler) memberPartyByParam(c *gin.Context, param string) (model.Party, model.User, bool) {
	user, _ := currentUser(c)
	id, ok := parseID(c, param)
	var party model.Party
	if !ok || h.db.WithContext(c).Table(h.table("party")).First(&party, id).Error != nil {
		if ok {
			c.JSON(http.StatusNotFound, gin.H{"ret": 0, "msg": "未找到派对或无权访问"})
		}
		return party, user, false
	}
	if !h.isPartyMember(c, party.ID, user.ID) {
		c.JSON(http.StatusNotFound, gin.H{"ret": 0, "msg": "未找到派对或无权访问"})
		return party, user, false
	}
	return party, user, true
}

func (h *Handler) ownerPartyByParam(c *gin.Context, param string) (model.Party, model.User, bool) {
	party, user, ok := h.memberPartyByParam(c, param)
	if !ok {
		return party, user, false
	}
	if party.OwnerID != user.ID {
		legacyError(c, "只有派对所有者可以清空记录")
		return party, user, false
	}
	return party, user, true
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
