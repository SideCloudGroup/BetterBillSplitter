package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/appconfig"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/model"
)

var ErrInvalidRefreshToken = errors.New("invalid refresh token")

type TokenService struct {
	db          *gorm.DB
	cfg         appconfig.JWTConfig
	tablePrefix string
	now         func() time.Time
}

type RefreshResult struct {
	AccessToken string
	PlainToken  string
	User        model.User
}

func NewTokenService(db *gorm.DB, cfg appconfig.JWTConfig, tablePrefix ...string) (*TokenService, error) {
	if db == nil {
		return nil, errors.New("auth: nil database")
	}
	if cfg.Secret == "" {
		return nil, errors.New("auth: JWT secret is not configured")
	}
	if cfg.AccessTTL <= 0 || cfg.RefreshTTL <= 0 {
		return nil, errors.New("auth: token TTLs must be positive")
	}
	prefix := ""
	if len(tablePrefix) > 0 {
		prefix = tablePrefix[0]
	}
	return &TokenService{db: db, cfg: cfg, tablePrefix: prefix, now: time.Now}, nil
}

func (s *TokenService) IssueAccessToken(userID uint64) (string, error) {
	now := s.now()
	claims := jwt.RegisteredClaims{
		Subject:   fmt.Sprint(userID),
		IssuedAt:  jwt.NewNumericDate(now),
		NotBefore: jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.AccessTTL)),
		ID:        uuid.NewString(),
	}
	if s.cfg.Issuer != "" {
		claims.Issuer = s.cfg.Issuer
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims{RegisteredClaims: claims, Type: "access"})
	return token.SignedString([]byte(s.cfg.Secret))
}

func (s *TokenService) VerifyAccessToken(raw string) (uint64, error) {
	claims := new(accessClaims)
	options := []jwt.ParserOption{jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()})}
	if s.cfg.Issuer != "" {
		options = append(options, jwt.WithIssuer(s.cfg.Issuer))
	}
	token, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		return []byte(s.cfg.Secret), nil
	}, options...)
	if err != nil || !token.Valid || claims.Type != "access" {
		return 0, errors.New("invalid access token")
	}
	var userID uint64
	if _, err := fmt.Sscan(claims.Subject, &userID); err != nil || userID == 0 {
		return 0, errors.New("invalid access token subject")
	}
	return userID, nil
}

func (s *TokenService) CreateRefreshToken(ctx context.Context, userID uint64, ip, userAgent string) (string, model.RefreshToken, error) {
	return s.createRefreshToken(s.db.WithContext(ctx), userID, ip, userAgent)
}

func (s *TokenService) RotateRefreshToken(ctx context.Context, plain, ip, userAgent string) (*RefreshResult, error) {
	var result RefreshResult
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		hash := tokenHash(plain)
		var old model.RefreshToken
		if err := tx.Table(s.table("refresh_tokens")).Where("token_hash = ?", hash).First(&old).Error; err != nil {
			return ErrInvalidRefreshToken
		}
		now := s.now()
		if old.RevokedAt != nil || !old.ExpiresAt.After(now) {
			return ErrInvalidRefreshToken
		}
		claim := tx.Table(s.table("refresh_tokens")).Where("id = ? AND revoked_at IS NULL", old.ID).Updates(map[string]any{"revoked_at": now})
		if claim.Error != nil {
			return claim.Error
		}
		if claim.RowsAffected != 1 {
			return ErrInvalidRefreshToken
		}
		var user model.User
		if err := tx.Table(s.table("user")).First(&user, old.UserID).Error; err != nil || !user.Enable {
			return ErrInvalidRefreshToken
		}
		newPlain, row, err := s.createRefreshToken(tx, old.UserID, ip, userAgent)
		if err != nil {
			return err
		}
		if err := tx.Table(s.table("refresh_tokens")).Where("id = ?", old.ID).Update("replaced_by", row.ID).Error; err != nil {
			return err
		}
		access, err := s.IssueAccessToken(old.UserID)
		if err != nil {
			return err
		}
		result = RefreshResult{AccessToken: access, PlainToken: newPlain, User: user}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *TokenService) RevokeRefreshToken(ctx context.Context, plain string) error {
	if plain == "" {
		return nil
	}
	now := s.now()
	return s.db.WithContext(ctx).Table(s.table("refresh_tokens")).
		Where("token_hash = ? AND revoked_at IS NULL", tokenHash(plain)).
		Update("revoked_at", now).Error
}

func (s *TokenService) createRefreshToken(db *gorm.DB, userID uint64, ip, userAgent string) (string, model.RefreshToken, error) {
	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return "", model.RefreshToken{}, err
	}
	plain := hex.EncodeToString(random)
	if len(userAgent) > 512 {
		userAgent = userAgent[:512]
	}
	row := model.RefreshToken{
		UserID: userID, TokenHash: tokenHash(plain), ExpiresAt: s.now().Add(s.cfg.RefreshTTL),
		CreatedIP: stringPtr(ip), UserAgent: stringPtr(userAgent),
	}
	if err := db.Table(s.table("refresh_tokens")).Create(&row).Error; err != nil {
		return "", model.RefreshToken{}, err
	}
	return plain, row, nil
}

func (s *TokenService) table(name string) string { return s.tablePrefix + name }

func tokenHash(plain string) string {
	digest := sha256.Sum256([]byte(plain))
	return hex.EncodeToString(digest[:])
}

func stringPtr(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

type accessClaims struct {
	jwt.RegisteredClaims
	Type string `json:"typ"`
}
