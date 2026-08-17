package appconfig

import "time"

type Config struct {
	Timezone string         `mapstructure:"timezone"`
	Database DatabaseConfig `mapstructure:"database"`
	Redis    RedisConfig    `mapstructure:"redis"`
	JWT      JWTConfig      `mapstructure:"jwt"`
	WebAuthn WebAuthnConfig `mapstructure:"webauthn"`
}

type WebAuthnConfig struct {
	RPID        string   `mapstructure:"rp_id"`
	RPOrigins   []string `mapstructure:"rp_origins"`
	DisplayName string   `mapstructure:"display_name"`
}

type DatabaseConfig struct {
	TablePrefix    string `mapstructure:"table_prefix"`
	MigrationTable string `mapstructure:"migration_table"`
}

type RedisConfig struct {
	Enabled   bool   `mapstructure:"enabled"`
	KeyPrefix string `mapstructure:"key_prefix"`
}

type JWTConfig struct {
	Secret              string        `mapstructure:"secret"`
	AccessTTL           time.Duration `mapstructure:"access_ttl"`
	RefreshTTL          time.Duration `mapstructure:"refresh_ttl"`
	Issuer              string        `mapstructure:"issuer"`
	RefreshCookieName   string        `mapstructure:"refresh_cookie_name"`
	RefreshCookiePath   string        `mapstructure:"refresh_cookie_path"`
	RefreshCookieSecure bool          `mapstructure:"refresh_cookie_secure"`
}
