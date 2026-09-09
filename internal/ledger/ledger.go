package ledger

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/currency"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/model"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/money"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/settlement"
)

type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string { return e.Message }

func errBad(msg string) error       { return &Error{Status: 400, Message: msg} }
func errForbidden(msg string) error { return &Error{Status: 403, Message: msg} }
func errNotFound(msg string) error  { return &Error{Status: 404, Message: msg} }

func AsError(err error) *Error {
	var e *Error
	if errors.As(err, &e) {
		return e
	}
	return nil
}

type Service struct {
	db       *gorm.DB
	prefix   string
	exchange *currency.Service
}

func New(db *gorm.DB, prefix string, exchange *currency.Service) *Service {
	return &Service{db: db, prefix: prefix, exchange: exchange}
}

func (s *Service) table(name string) string { return s.prefix + name }

type UserView struct {
	ID       uint64 `json:"id"`
	Username string `json:"username"`
}

type PartyView struct {
	ID           uint64   `json:"id"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Timezone     string   `json:"timezone"`
	BaseCurrency string   `json:"base_currency"`
	Currencies   []string `json:"supported_currencies"`
	Archived     bool     `json:"archived"`
	Role         string   `json:"role"`
	OwnerID      uint64   `json:"owner_id"`
}

type MemberView struct {
	ID       uint64    `json:"id"`
	Username string    `json:"username"`
	JoinedAt time.Time `json:"joined_at"`
	IsOwner  bool      `json:"is_owner"`
}

type ItemView struct {
	ID            uint64    `json:"id"`
	Description   string    `json:"description"`
	Amount        string    `json:"amount"`
	Paid          bool      `json:"paid"`
	CreatedAt     time.Time `json:"created_at"`
	PayerID       uint64    `json:"payer_id"`
	PayerName     string    `json:"payer_name"`
	InitiatorID   uint64    `json:"initiator_id"`
	InitiatorName string    `json:"initiator_name"`
}

type SplitInput struct {
	UserID uint64 `json:"user_id" jsonschema:"付款人用户ID"`
	Amount string `json:"amount" jsonschema:"金额"`
}

type CreateItemInput struct {
	Description string       `json:"description"`
	Currency    string       `json:"currency"`
	Amount      string       `json:"amount"`
	UserIDs     []uint64     `json:"user_ids"`
	Splits      []SplitInput `json:"splits"`
}

type SettlementView struct {
	BestPayAll   map[string]map[string]string `json:"best_pay_all"`
	BestPayFinal map[string]map[string]string `json:"best_pay_final"`
	UserStat     map[string]UserStat          `json:"user_stat"`
}

type UserStat struct {
	In  string `json:"in"`
	Out string `json:"out"`
}

func (s *Service) Me(_ context.Context, user model.User) UserView {
	return UserView{ID: user.ID, Username: user.Username}
}

func (s *Service) ListParties(ctx context.Context, user model.User) ([]PartyView, error) {
	var owned, joined []model.Party
	if err := s.db.WithContext(ctx).Table(s.table("party")).Where("owner_id = ?", user.ID).Order("updated_at DESC").Find(&owned).Error; err != nil {
		return nil, err
	}
	join := fmt.Sprintf("JOIN %s pm ON %s.id = pm.party_id", s.table("party_member"), s.table("party"))
	if err := s.db.WithContext(ctx).Table(s.table("party")).Joins(join).Where("pm.user_id = ? AND "+s.table("party")+".owner_id <> ?", user.ID, user.ID).Select(s.table("party") + ".*").Order(s.table("party") + ".updated_at DESC").Find(&joined).Error; err != nil {
		return nil, err
	}
	out := make([]PartyView, 0, len(owned)+len(joined))
	for _, p := range owned {
		out = append(out, partyView(p, "owner"))
	}
	for _, p := range joined {
		out = append(out, partyView(p, "member"))
	}
	return out, nil
}

func (s *Service) GetParty(ctx context.Context, user model.User, partyID uint64) (PartyView, error) {
	party, err := s.memberParty(ctx, user.ID, partyID)
	if err != nil {
		return PartyView{}, err
	}
	role := "member"
	if party.OwnerID == user.ID {
		role = "owner"
	}
	return partyView(party, role), nil
}

func (s *Service) ListMembers(ctx context.Context, user model.User, partyID uint64) ([]MemberView, error) {
	party, err := s.memberParty(ctx, user.ID, partyID)
	if err != nil {
		return nil, err
	}
	var rows []struct {
		ID       uint64
		Username string
		JoinedAt time.Time `gorm:"column:joined_at"`
	}
	query := fmt.Sprintf("SELECT u.id, u.username, pm.joined_at FROM %s pm JOIN %s u ON pm.user_id=u.id WHERE pm.party_id=? ORDER BY pm.id", s.table("party_member"), s.table("user"))
	if err := s.db.WithContext(ctx).Raw(query, party.ID).Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]MemberView, 0, len(rows))
	for _, row := range rows {
		out = append(out, MemberView{ID: row.ID, Username: row.Username, JoinedAt: row.JoinedAt, IsOwner: row.ID == party.OwnerID})
	}
	return out, nil
}

func (s *Service) ListItems(ctx context.Context, user model.User, partyID uint64) ([]ItemView, error) {
	party, err := s.memberParty(ctx, user.ID, partyID)
	if err != nil {
		return nil, err
	}
	var rows []ItemView
	query := fmt.Sprintf("SELECT i.id,i.description,i.amount,i.paid,i.created_at,i.userid payer_id,p.username payer_name,i.initiator initiator_id,iu.username initiator_name FROM %s i JOIN %s p ON i.userid=p.id JOIN %s iu ON i.initiator=iu.id WHERE i.party_id=? ORDER BY i.created_at DESC", s.table("item"), s.table("user"), s.table("user"))
	if err := s.db.WithContext(ctx).Raw(query, party.ID).Scan(&rows).Error; err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []ItemView{}
	}
	return rows, nil
}

func (s *Service) ListPayments(ctx context.Context, user model.User, partyID uint64) ([]ItemView, string, error) {
	party, err := s.memberParty(ctx, user.ID, partyID)
	if err != nil {
		return nil, "", err
	}
	var rows []ItemView
	query := fmt.Sprintf("SELECT i.id,i.description,i.amount,i.paid,i.created_at,i.userid payer_id,u.username payer_name,i.initiator initiator_id,iu.username initiator_name FROM %s i JOIN %s iu ON i.initiator=iu.id JOIN %s u ON i.userid=u.id WHERE i.party_id=? AND i.userid=? AND i.paid=0 ORDER BY i.created_at DESC", s.table("item"), s.table("user"), s.table("user"))
	if err := s.db.WithContext(ctx).Raw(query, party.ID, user.ID).Scan(&rows).Error; err != nil {
		return nil, "", err
	}
	var total money.Amount
	for _, row := range rows {
		amount, err := money.Parse(row.Amount)
		if err != nil {
			return nil, "", err
		}
		total += amount
	}
	if rows == nil {
		rows = []ItemView{}
	}
	return rows, total.String(), nil
}

func (s *Service) CreateItem(ctx context.Context, user model.User, partyID uint64, input CreateItemInput) (int, error) {
	party, err := s.memberParty(ctx, user.ID, partyID)
	if err != nil {
		return 0, err
	}
	if party.ArchivedAt != nil {
		return 0, errForbidden("该派对已归档，无法添加收款项")
	}
	description := strings.TrimSpace(input.Description)
	unit := strings.ToLower(strings.TrimSpace(input.Currency))
	if description == "" {
		return 0, errBad("描述不能为空")
	}
	if unit == "" {
		return 0, errBad("货币不能为空")
	}
	supported := decodeCurrencies(party)
	okUnit := false
	for _, code := range supported {
		if strings.ToLower(code) == unit {
			okUnit = true
			break
		}
	}
	if !okUnit {
		return 0, errBad("该派对不支持此货币")
	}
	type allocation struct {
		userID uint64
		amount string
	}
	allocations := make([]allocation, 0)
	if len(input.Splits) > 0 {
		seen := map[uint64]bool{}
		for index, split := range input.Splits {
			amount, err := money.Parse(split.Amount)
			if split.UserID == 0 {
				return 0, errBad(fmt.Sprintf("分摊第 %d 项用户无效", index+1))
			}
			if err != nil || amount <= 0 {
				return 0, errBad(fmt.Sprintf("分摊第 %d 项金额必须大于 0", index+1))
			}
			if seen[split.UserID] {
				return 0, errBad("同一用户不能重复分摊")
			}
			seen[split.UserID] = true
			allocations = append(allocations, allocation{split.UserID, amount.String()})
		}
	} else {
		if len(input.UserIDs) == 0 {
			return 0, errBad("用户不能为空")
		}
		amount, err := money.Parse(input.Amount)
		if err != nil || amount <= 0 {
			return 0, errBad("金额必须大于 0")
		}
		seen := map[uint64]bool{}
		for _, userID := range input.UserIDs {
			if userID == 0 || seen[userID] {
				return 0, errBad("用户无效或重复")
			}
			seen[userID] = true
			allocations = append(allocations, allocation{userID, amount.String()})
		}
	}
	memberIDs := make([]uint64, 0, len(allocations))
	for _, a := range allocations {
		memberIDs = append(memberIDs, a.userID)
	}
	var memberCount int64
	s.db.WithContext(ctx).Table(s.table("party_member")).Where("party_id = ? AND user_id IN ?", party.ID, memberIDs).Count(&memberCount)
	if memberCount != int64(len(memberIDs)) {
		return 0, errBad("包含不属于该派对的用户")
	}
	if unit != strings.ToLower(party.BaseCurrency) {
		if s.exchange == nil {
			return 0, errBad("无法获取该货币的汇率信息")
		}
		rates, err := s.exchange.Rates(ctx, party.BaseCurrency)
		if err != nil || rates[unit] == "" {
			return 0, errBad("无法获取该货币的汇率信息")
		}
		for index := range allocations {
			converted, err := money.ConvertToBaseCurrency(allocations[index].amount, rates[unit])
			if err != nil || converted <= 0 {
				return 0, errBad("无法获取该货币的汇率信息")
			}
			allocations[index].amount = converted.String()
		}
	}
	location, _ := time.LoadLocation(party.Timezone)
	createdAt := time.Now()
	if location != nil {
		createdAt = createdAt.In(location)
	}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, a := range allocations {
			id := party.ID
			item := model.Item{UserID: a.userID, Description: description, CreatedAt: createdAt, Amount: a.amount, Paid: a.userID == user.ID, Initiator: user.ID, PartyID: &id}
			if err := tx.Table(s.table("item")).Create(&item).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return len(allocations), nil
}

func (s *Service) UpdateItemPaid(ctx context.Context, user model.User, itemID uint64, paid bool) error {
	var item model.Item
	if err := s.db.WithContext(ctx).Table(s.table("item")).Where("id = ? AND initiator = ?", itemID, user.ID).First(&item).Error; err != nil {
		return errNotFound("未找到指定项目")
	}
	if item.PartyID == nil {
		return errForbidden("您不是该派对的成员")
	}
	if !s.isMember(ctx, *item.PartyID, user.ID) {
		return errForbidden("您不是该派对的成员")
	}
	var party model.Party
	if s.db.WithContext(ctx).Table(s.table("party")).First(&party, *item.PartyID).Error == nil && party.ArchivedAt != nil {
		return errForbidden("该派对已归档，无法修改支付状态")
	}
	return s.db.WithContext(ctx).Table(s.table("item")).Where("id = ?", itemID).Update("paid", paid).Error
}

func (s *Service) GetSettlement(ctx context.Context, user model.User, partyID uint64) (SettlementView, error) {
	if _, err := s.memberParty(ctx, user.ID, partyID); err != nil {
		return SettlementView{}, err
	}
	var memberRows []struct {
		ID       uint64
		Username string
	}
	query := fmt.Sprintf("SELECT u.id,u.username FROM %s pm JOIN %s u ON pm.user_id=u.id WHERE pm.party_id=? ORDER BY pm.id", s.table("party_member"), s.table("user"))
	if err := s.db.WithContext(ctx).Raw(query, partyID).Scan(&memberRows).Error; err != nil {
		return SettlementView{}, err
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
	if err := s.db.WithContext(ctx).Table(s.table("item")).Select("userid, initiator, amount").Where("party_id = ? AND paid = 0", partyID).Order("id").Scan(&itemRows).Error; err != nil {
		return SettlementView{}, err
	}
	items := make([]settlement.Item, 0, len(itemRows))
	inTotals := make(map[int64]money.Amount)
	outTotals := make(map[int64]money.Amount)
	for _, row := range itemRows {
		amount, err := money.Parse(row.Amount)
		if err != nil {
			return SettlementView{}, err
		}
		inTotals[int64(row.Initiator)] += amount
		outTotals[int64(row.UserID)] += amount
		items = append(items, settlement.Item{UserID: int64(row.UserID), Initiator: int64(row.Initiator), Amount: row.Amount})
	}
	stats := make(map[string]UserStat, len(users))
	for _, u := range users {
		stats[u.Username] = UserStat{In: inTotals[u.ID].String(), Out: outTotals[u.ID].String()}
	}
	unpaid, err := settlement.AggregateUnpaid(items)
	if err != nil {
		return SettlementView{}, err
	}
	optimized, stage1 := settlement.Compute(unpaid, users)
	return SettlementView{BestPayAll: debtsMap(stage1), BestPayFinal: debtsMap(optimized), UserStat: stats}, nil
}

func (s *Service) memberParty(ctx context.Context, userID, partyID uint64) (model.Party, error) {
	var party model.Party
	if partyID == 0 || s.db.WithContext(ctx).Table(s.table("party")).First(&party, partyID).Error != nil {
		return party, errNotFound("派对不存在")
	}
	if !s.isMember(ctx, party.ID, userID) {
		return party, errForbidden("您不是该派对的成员")
	}
	return party, nil
}

func (s *Service) isMember(ctx context.Context, partyID, userID uint64) bool {
	var count int64
	s.db.WithContext(ctx).Table(s.table("party_member")).Where("party_id = ? AND user_id = ?", partyID, userID).Count(&count)
	return count > 0
}

func partyView(p model.Party, role string) PartyView {
	desc := ""
	if p.Description != nil {
		desc = *p.Description
	}
	return PartyView{
		ID: p.ID, Name: p.Name, Description: desc, Timezone: p.Timezone,
		BaseCurrency: p.BaseCurrency, Currencies: decodeCurrencies(p),
		Archived: p.ArchivedAt != nil, Role: role, OwnerID: p.OwnerID,
	}
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

func debtsMap(debts settlement.Debts) map[string]map[string]string {
	result := make(map[string]map[string]string, len(debts))
	for debtor, creditors := range debts {
		result[debtor] = make(map[string]string, len(creditors))
		for creditor, amount := range creditors {
			result[debtor][creditor] = amount.String()
		}
	}
	return result
}
