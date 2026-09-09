package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/model"
)

const (
	APITokenPrefix      = "bbs_"
	APITokenSecretBytes = 32
	MaxAPITokensPerUser = 20
	apiTokenPrefixLen   = 12
)

var (
	ErrAPITokenInvalid = errors.New("invalid api token")
	ErrAPITokenLimit   = errors.New("api token limit reached")
)

type APITokenService struct {
	db          *gorm.DB
	tablePrefix string
	now         func() time.Time
}

func NewAPITokenService(db *gorm.DB, tablePrefix string) *APITokenService {
	return &APITokenService{db: db, tablePrefix: tablePrefix, now: time.Now}
}

func (s *APITokenService) List(ctx context.Context, userID uint64) ([]model.APIToken, error) {
	var rows []model.APIToken
	err := s.db.WithContext(ctx).Table(s.table()).Where("user_id = ? AND revoked_at IS NULL", userID).Order("id DESC").Find(&rows).Error
	return rows, err
}

func (s *APITokenService) Create(ctx context.Context, userID uint64, name, ip string, expiresAt *time.Time) (plain string, row model.APIToken, err error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", model.APIToken{}, errors.New("token name is required")
	}
	if len(name) > 64 {
		name = name[:64]
	}
	var active int64
	if err := s.db.WithContext(ctx).Table(s.table()).Where("user_id = ? AND revoked_at IS NULL", userID).Count(&active).Error; err != nil {
		return "", model.APIToken{}, err
	}
	if active >= MaxAPITokensPerUser {
		return "", model.APIToken{}, ErrAPITokenLimit
	}
	secret := make([]byte, APITokenSecretBytes)
	if _, err := rand.Read(secret); err != nil {
		return "", model.APIToken{}, err
	}
	plain = APITokenPrefix + hex.EncodeToString(secret)
	row = model.APIToken{
		UserID:      userID,
		Name:        name,
		TokenHash:   tokenHash(plain),
		TokenPrefix: plain[:apiTokenPrefixLen],
		ExpiresAt:   expiresAt,
		CreatedAt:   s.now(),
		CreatedIP:   stringPtr(ip),
	}
	if err := s.db.WithContext(ctx).Table(s.table()).Create(&row).Error; err != nil {
		return "", model.APIToken{}, err
	}
	return plain, row, nil
}

func (s *APITokenService) Revoke(ctx context.Context, userID, tokenID uint64) error {
	now := s.now()
	res := s.db.WithContext(ctx).Table(s.table()).Where("id = ? AND user_id = ? AND revoked_at IS NULL", tokenID, userID).Update("revoked_at", now)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected != 1 {
		return ErrAPITokenInvalid
	}
	return nil
}

func (s *APITokenService) Lookup(ctx context.Context, plain string) (model.User, error) {
	plain = strings.TrimSpace(plain)
	if !strings.HasPrefix(plain, APITokenPrefix) {
		return model.User{}, ErrAPITokenInvalid
	}
	var row model.APIToken
	if err := s.db.WithContext(ctx).Table(s.table()).Where("token_hash = ?", tokenHash(plain)).First(&row).Error; err != nil {
		return model.User{}, ErrAPITokenInvalid
	}
	now := s.now()
	if row.RevokedAt != nil || (row.ExpiresAt != nil && !row.ExpiresAt.After(now)) {
		return model.User{}, ErrAPITokenInvalid
	}
	var user model.User
	if err := s.db.WithContext(ctx).Table(s.tablePrefix+"user").First(&user, row.UserID).Error; err != nil || !user.Enable {
		return model.User{}, ErrAPITokenInvalid
	}
	go s.touch(row.ID)
	return user, nil
}

func (s *APITokenService) touch(id uint64) {
	now := s.now()
	_ = s.db.Table(s.table()).Where("id = ?", id).Update("last_used_at", now).Error
}

func (s *APITokenService) table() string { return s.tablePrefix + "api_tokens" }
