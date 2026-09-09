package model

import "time"

type User struct {
	ID       uint64 `gorm:"primaryKey" json:"id"`
	Username string `gorm:"size:128;uniqueIndex:uk_user_username" json:"username"`
	Password string `gorm:"size:128" json:"-"`
	UUID     string `gorm:"size:36;uniqueIndex:uk_user_uuid" json:"-"`
	Enable   bool   `json:"-"`
	IsAdmin  bool   `gorm:"column:is_admin" json:"is_admin"`
}

func (User) TableName() string { return "user" }

type RefreshToken struct {
	ID         uint64     `gorm:"primaryKey"`
	UserID     uint64     `gorm:"column:user_id;index"`
	TokenHash  string     `gorm:"column:token_hash;size:64;uniqueIndex"`
	ExpiresAt  time.Time  `gorm:"column:expires_at"`
	RevokedAt  *time.Time `gorm:"column:revoked_at"`
	ReplacedBy *uint64    `gorm:"column:replaced_by"`
	CreatedIP  *string    `gorm:"column:created_ip;size:45"`
	UserAgent  *string    `gorm:"column:user_agent;size:512"`
}

func (RefreshToken) TableName() string { return "refresh_tokens" }

type APIToken struct {
	ID          uint64     `gorm:"primaryKey" json:"id"`
	UserID      uint64     `gorm:"column:user_id" json:"user_id"`
	Name        string     `json:"name"`
	TokenHash   string     `gorm:"column:token_hash" json:"-"`
	TokenPrefix string     `gorm:"column:token_prefix" json:"token_prefix"`
	ExpiresAt   *time.Time `gorm:"column:expires_at" json:"expires_at"`
	RevokedAt   *time.Time `gorm:"column:revoked_at" json:"revoked_at"`
	LastUsedAt  *time.Time `gorm:"column:last_used_at" json:"last_used_at"`
	CreatedAt   time.Time  `gorm:"column:created_at" json:"created_at"`
	CreatedIP   *string    `gorm:"column:created_ip" json:"-"`
}

func (APIToken) TableName() string { return "api_tokens" }

type Setting struct {
	ID    uint64 `gorm:"primaryKey"`
	Key   string `gorm:"column:key"`
	Value string `gorm:"column:value"`
}

func (Setting) TableName() string { return "setting" }

type MFACredential struct {
	ID        uint64     `gorm:"primaryKey"`
	UserID    uint64     `gorm:"column:userid"`
	Body      string     `gorm:"column:body"`
	Name      *string    `gorm:"column:name"`
	RawID     *string    `gorm:"column:rawid"`
	CreatedAt time.Time  `gorm:"column:created_at"`
	UsedAt    *time.Time `gorm:"column:used_at"`
	Type      string     `gorm:"column:type"`
}

func (MFACredential) TableName() string { return "mfa_credential" }

type Party struct {
	ID                  uint64     `gorm:"primaryKey" json:"id"`
	Name                string     `json:"name"`
	Description         *string    `json:"description"`
	InviteCode          string     `gorm:"column:invite_code" json:"invite_code"`
	OwnerID             uint64     `gorm:"column:owner_id" json:"owner_id"`
	Timezone            string     `json:"timezone"`
	BaseCurrency        string     `gorm:"column:base_currency" json:"base_currency"`
	SupportedCurrencies *string    `gorm:"column:supported_currencies" json:"supported_currencies"`
	ArchivedAt          *time.Time `gorm:"column:archived_at" json:"archived_at"`
	CreatedAt           time.Time  `gorm:"column:created_at" json:"created_at"`
	UpdatedAt           time.Time  `gorm:"column:updated_at" json:"updated_at"`
}

func (Party) TableName() string { return "party" }

type PartyMember struct {
	ID       uint64    `gorm:"primaryKey" json:"id"`
	PartyID  uint64    `gorm:"column:party_id" json:"party_id"`
	UserID   uint64    `gorm:"column:user_id" json:"user_id"`
	JoinedAt time.Time `gorm:"column:joined_at" json:"joined_at"`
}

func (PartyMember) TableName() string { return "party_member" }

type Currency struct {
	ID            uint64  `gorm:"primaryKey" json:"id"`
	Code          string  `json:"code"`
	Name          string  `json:"name"`
	NameEN        *string `gorm:"column:name_en" json:"name_en"`
	Symbol        string  `json:"symbol"`
	DecimalPlaces int     `gorm:"column:decimal_places" json:"decimal_places"`
	IsDefault     bool    `gorm:"column:is_default" json:"is_default"`
	IsActive      bool    `gorm:"column:is_active" json:"is_active"`
}

func (Currency) TableName() string { return "currencies" }

type Item struct {
	ID          uint64    `gorm:"primaryKey" json:"id"`
	UserID      uint64    `gorm:"column:userid" json:"userid"`
	Description string    `json:"description"`
	CreatedAt   time.Time `gorm:"column:created_at" json:"created_at"`
	Amount      string    `gorm:"column:amount" json:"amount"`
	Paid        bool      `json:"paid"`
	Initiator   uint64    `json:"initiator"`
	PartyID     *uint64   `gorm:"column:party_id" json:"party_id"`
}

func (Item) TableName() string { return "item" }
