package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/micoya/gocraft/cdao"
	"github.com/micoya/gocraft/cdao/gormx"
	_ "github.com/micoya/gocraft/cdao/provider/database"
	_ "github.com/micoya/gocraft/cdao/provider/redis"
	"github.com/micoya/gocraft/cdao/redisx"
	"github.com/micoya/gocraft/chttp"
	goconfig "github.com/micoya/gocraft/config"
	"gorm.io/gorm"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/appconfig"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/auth"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/currency"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/httpapi"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/migrate"
	"github.com/SideCloudGroup/BetterBillSplitter/internal/model"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := run(ctx); err != nil {
		slog.Error("application stopped", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	cfg, err := goconfig.Load[appconfig.Config](ctx, goconfig.WithEnvFile(".env"))
	if err != nil {
		return err
	}
	if cfg.DAO == nil || cfg.HTTPServer == nil {
		return errors.New("config: dao and http_server are required")
	}
	applyLegacyDatabaseEnv(cfg)
	applyLegacyAppEnv(cfg)
	if !cfg.App.Redis.Enabled {
		cfg.DAO.Redis = nil
	}

	dao, err := cdao.NewFromConfig(cfg.DAO)
	if err != nil {
		return err
	}
	if err := dao.Init(ctx); err != nil {
		return err
	}
	defer func() {
		closeCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := dao.Close(closeCtx); err != nil {
			slog.Error("close dao", "error", err)
		}
	}()

	gormDB := gormx.Must(dao)
	sqlDB, err := gormDB.DB()
	if err != nil {
		return fmt.Errorf("get database handle: %w", err)
	}
	runner, err := migrate.New(sqlDB, cfg.App.Database.TablePrefix, cfg.App.Database.MigrationTable)
	if err != nil {
		return err
	}
	if err := runner.Up(ctx); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}
	if len(os.Args) > 1 && (os.Args[1] == "createAdmin" || os.Args[1] == "create-admin") {
		if len(os.Args) != 4 {
			return errors.New("usage: better-bill-splitter createAdmin <username> <password>")
		}
		return createAdmin(ctx, gormDB, cfg.App.Database.TablePrefix, os.Args[2], os.Args[3])
	}

	server := chttp.New(chttp.WithServerConfig(cfg.HTTPServer))
	tokens, err := auth.NewTokenService(gormx.Must(dao), cfg.App.JWT, cfg.App.Database.TablePrefix)
	if err != nil {
		return err
	}
	exchange := currency.NewService(nil, cfg.App.Redis.KeyPrefix)
	if cfg.App.Redis.Enabled {
		exchange = currency.NewService(redisx.Must(dao), cfg.App.Redis.KeyPrefix)
	}
	api := httpapi.NewHandler(gormx.Must(dao), tokens, exchange, cfg.App)
	api.Register(server.Engine())
	server.Engine().GET("/", func(c *gin.Context) {
		c.File("public/spa/index.html")
	})
	server.Engine().Static("/assets", "public/spa/assets")
	server.Engine().StaticFile("/favicon.ico", "public/favicon.ico")
	server.Engine().StaticFile("/robots.txt", "public/robots.txt")
	server.Engine().NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"ret": 0, "msg": "接口不存在"})
			return
		}
		c.File("public/spa/index.html")
	})
	return server.Run(ctx)
}

func createAdmin(ctx context.Context, db *gorm.DB, prefix, username, password string) error {
	username = strings.TrimSpace(username)
	if len(username) < 3 || len(password) < 6 {
		return errors.New("username must have at least 3 characters and password at least 6")
	}
	var count int64
	if err := db.WithContext(ctx).Table(prefix+"user").Where("username = ?", username).Count(&count).Error; err != nil {
		return err
	}
	if count != 0 {
		return fmt.Errorf("user %q already exists", username)
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	user := model.User{Username: username, Password: hash, UUID: uuid.NewString(), Enable: true, IsAdmin: true}
	if err := db.WithContext(ctx).Table(prefix + "user").Create(&user).Error; err != nil {
		return err
	}
	fmt.Printf("administrator %s created (id=%d, uuid=%s)\n", user.Username, user.ID, user.UUID)
	return nil
}

func applyLegacyDatabaseEnv(cfg *goconfig.Config[appconfig.Config]) {
	dbCfg, ok := cfg.DAO.Database["default"]
	if !ok || dbCfg.DSN != "" {
		return
	}
	host := envOr("MARIADB_HOST", "127.0.0.1")
	port := envOr("MARIADB_PORT", "3306")
	database := os.Getenv("MARIADB_DATABASE")
	user := envOr("MARIADB_USER", "root")
	password := os.Getenv("MARIADB_PASSWORD")
	if database == "" {
		return
	}
	dbCfg.DSN = fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		url.QueryEscape(user), url.QueryEscape(password), host, port, strings.TrimSpace(database))
	cfg.DAO.Database["default"] = dbCfg
}

func applyLegacyAppEnv(cfg *goconfig.Config[appconfig.Config]) {
	if cfg.App.Timezone == "" {
		cfg.App.Timezone = envOr("APP_TIMEZONE", "Asia/Shanghai")
	}
	if cfg.App.JWT.Secret == "" {
		cfg.App.JWT.Secret = os.Getenv("JWT_SECRET")
	}
	if cfg.App.JWT.Issuer == "" {
		cfg.App.JWT.Issuer = os.Getenv("JWT_ISS")
	}
	if value := os.Getenv("JWT_ACCESS_TTL"); value != "" {
		if seconds, err := time.ParseDuration(value + "s"); err == nil {
			cfg.App.JWT.AccessTTL = seconds
		}
	}
	if value := os.Getenv("JWT_REFRESH_TTL"); value != "" {
		if seconds, err := time.ParseDuration(value + "s"); err == nil {
			cfg.App.JWT.RefreshTTL = seconds
		}
	}
	if value := os.Getenv("JWT_REFRESH_COOKIE_SECURE"); value != "" {
		if secure, err := strconv.ParseBool(value); err == nil {
			cfg.App.JWT.RefreshCookieSecure = secure
		}
	}
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
