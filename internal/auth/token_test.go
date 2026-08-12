package auth

import (
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/appconfig"
)

func TestAccessTokenRoundTripAndTypeValidation(t *testing.T) {
	sqlDB, _, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	service, err := NewTokenService(db, appconfig.JWTConfig{Secret: "test-secret-that-is-long-enough", AccessTTL: time.Minute, RefreshTTL: time.Hour, Issuer: "test"})
	if err != nil {
		t.Fatal(err)
	}
	raw, err := service.IssueAccessToken(42)
	if err != nil {
		t.Fatal(err)
	}
	got, err := service.VerifyAccessToken(raw)
	if err != nil || got != 42 {
		t.Fatalf("got user=%d err=%v", got, err)
	}
	if _, err := service.VerifyAccessToken(raw + "tampered"); err == nil {
		t.Fatal("tampered token was accepted")
	}
}
