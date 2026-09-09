// Package migrate runs database migrations while remaining compatible with
// the schema table used by ThinkPHP's think-migration/Phinx integration.
package migrate

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

var identifierPattern = regexp.MustCompile(`^[A-Za-z0-9_]*$`)

type Migration struct {
	Version int64
	Name    string
	SQL     []string
}

type Runner struct {
	db           *sql.DB
	tablePrefix  string
	historyTable string
	migrations   []Migration
}

func New(db *sql.DB, tablePrefix, migrationTable string) (*Runner, error) {
	if db == nil {
		return nil, errors.New("migrate: nil database")
	}
	if migrationTable == "" {
		migrationTable = "migrations"
	}
	if !identifierPattern.MatchString(tablePrefix) || !identifierPattern.MatchString(migrationTable) {
		return nil, errors.New("migrate: table prefix and migration table must contain only letters, digits, or underscores")
	}
	return &Runner{
		db:           db,
		tablePrefix:  tablePrefix,
		historyTable: tablePrefix + migrationTable,
		migrations:   legacyMigrations(tablePrefix),
	}, nil
}

// Up applies pending migrations in creation-time order. Existing rows written
// by PHP are authoritative, so a deployed database never repeats them.
func (r *Runner) Up(ctx context.Context) error {
	if err := r.ensureHistoryTable(ctx); err != nil {
		return err
	}
	executed, err := r.executedVersions(ctx)
	if err != nil {
		return err
	}
	for _, migration := range r.migrations {
		if executed[migration.Version] {
			continue
		}
		if err := r.apply(ctx, migration); err != nil {
			return fmt.Errorf("migration %d %s: %w", migration.Version, migration.Name, err)
		}
	}
	return nil
}

func (r *Runner) ensureHistoryTable(ctx context.Context) error {
	query := fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
  version BIGINT NOT NULL,
  migration_name VARCHAR(100) NULL DEFAULT NULL,
  start_time TIMESTAMP NULL DEFAULT NULL,
  end_time TIMESTAMP NULL DEFAULT NULL,
  breakpoint TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, quote(r.historyTable))
	if _, err := r.db.ExecContext(ctx, query); err != nil {
		return fmt.Errorf("create compatible history table: %w", err)
	}
	return nil
}

func (r *Runner) executedVersions(ctx context.Context) (map[int64]bool, error) {
	rows, err := r.db.QueryContext(ctx, "SELECT version FROM "+quote(r.historyTable))
	if err != nil {
		return nil, fmt.Errorf("read migration history: %w", err)
	}
	defer rows.Close()
	executed := make(map[int64]bool)
	for rows.Next() {
		var version int64
		if err := rows.Scan(&version); err != nil {
			return nil, fmt.Errorf("scan migration history: %w", err)
		}
		executed[version] = true
	}
	return executed, rows.Err()
}

func (r *Runner) apply(ctx context.Context, migration Migration) error {
	started := time.Now()
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, statement := range migration.SQL {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	insert := fmt.Sprintf("INSERT INTO %s (version, migration_name, start_time, end_time, breakpoint) VALUES (?, ?, ?, ?, 0)", quote(r.historyTable))
	if _, err := tx.ExecContext(ctx, insert, migration.Version, migration.Name, started, time.Now()); err != nil {
		return err
	}
	return tx.Commit()
}

func quote(identifier string) string {
	return "`" + identifier + "`"
}

func legacyMigrations(prefix string) []Migration {
	table := func(name string) string { return quote(prefix + name) }
	statements := func(sqlText string) []string {
		parts := strings.Split(sqlText, ";\n")
		result := make([]string, 0, len(parts))
		for _, part := range parts {
			if statement := strings.TrimSpace(part); statement != "" {
				result = append(result, statement)
			}
		}
		return result
	}

	return []Migration{
		{20240512222608, "Init", statements(fmt.Sprintf(`CREATE TABLE %s (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(128) NOT NULL,
  password VARCHAR(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE %s (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userid INT NOT NULL,
  description VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  amount DOUBLE(10,2) NOT NULL DEFAULT 0.00,
  paid TINYINT(1) NOT NULL DEFAULT 0,
  initiator INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, table("user"), table("item")))},
		{20241002123454, "UpdateAmountColumnType", []string{fmt.Sprintf("ALTER TABLE %s MODIFY amount DECIMAL(10,2) NOT NULL DEFAULT 0.00", table("item"))}},
		{20241008220049, "MfaSupport", statements(fmt.Sprintf(`CREATE TABLE %s (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userid INT NOT NULL,
  body TEXT NOT NULL,
  name VARCHAR(255) NULL DEFAULT NULL,
  rawid VARCHAR(255) NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME NULL DEFAULT NULL,
  type VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE %s ADD COLUMN uuid VARCHAR(36) NULL;
UPDATE %s SET uuid = UUID() WHERE uuid IS NULL OR uuid = '';
ALTER TABLE %s MODIFY uuid VARCHAR(36) NOT NULL`, table("mfa_credential"), table("user"), table("user"), table("user")))},
		{20250108084543, "UserStatus", []string{fmt.Sprintf("ALTER TABLE %s ADD COLUMN enable TINYINT(1) NOT NULL DEFAULT 1", table("user"))}},
		{20250819200000, "CreatePartyTables", statements(fmt.Sprintf(`CREATE TABLE %s (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  invite_code VARCHAR(32) NOT NULL,
  owner_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY invite_code (invite_code), KEY owner_id (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE %s (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  party_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY party_id_user_id (party_id, user_id), KEY party_id (party_id), KEY user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE %s ADD COLUMN party_id INT NULL DEFAULT NULL, ADD KEY party_id (party_id)`, table("party"), table("party_member"), table("item")))},
		{20250819200001, "Setting", statements(fmt.Sprintf(`CREATE TABLE %s (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  %s VARCHAR(255) NOT NULL,
  value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO %s (%s, value) VALUES ('general_enableRegister', '1'), ('general_name', '开派对咯')`, table("setting"), quote("key"), table("setting"), quote("key")))},
		{20250819200002, "AddIsAdminToUser", []string{fmt.Sprintf("ALTER TABLE %s ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0", table("user"))}},
		{20250819200003, "AddTimezoneToParty", []string{fmt.Sprintf("ALTER TABLE %s ADD COLUMN timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Shanghai'", table("party"))}},
		{20250820000000, "AddPartyCurrencies", []string{fmt.Sprintf("ALTER TABLE %s ADD COLUMN base_currency VARCHAR(10) NOT NULL DEFAULT 'cny', ADD COLUMN supported_currencies TEXT NULL", table("party"))}},
		{20250820122215, "CreateCurrenciesTable", statements(fmt.Sprintf(`CREATE TABLE %s (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(3) NOT NULL,
  name VARCHAR(50) NOT NULL,
  name_en VARCHAR(100) NULL,
  symbol VARCHAR(10) NOT NULL,
  decimal_places INT NOT NULL DEFAULT 2,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY code (code), KEY is_default (is_default), KEY is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO %s (code, name, name_en, symbol, decimal_places, is_default, is_active) VALUES
('cny','人民币','Chinese Yuan','¥',2,1,1),('usd','美元','US Dollar','$',2,0,1),
('eur','欧元','Euro','€',2,0,1),('gbp','英镑','British Pound','£',2,0,1),
('jpy','日元','Japanese Yen','¥',0,0,1),('hkd','港币','Hong Kong Dollar','HK$',2,0,1),
('twd','新台币','New Taiwan Dollar','NT$',2,0,1),('sgd','新加坡元','Singapore Dollar','S$',2,0,1)`, table("currencies"), table("currencies")))},
		{20260518120000, "AddArchivedAtToParty", []string{fmt.Sprintf("ALTER TABLE %s ADD COLUMN archived_at DATETIME NULL DEFAULT NULL, ADD KEY archived_at (archived_at)", table("party"))}},
		{20260518140000, "CreateRefreshTokensTable", []string{fmt.Sprintf(`CREATE TABLE %s (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  replaced_by INT NULL DEFAULT NULL,
  created_ip VARCHAR(45) NULL,
  user_agent VARCHAR(512) NULL,
  KEY user_id (user_id), UNIQUE KEY token_hash (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, table("refresh_tokens"))}},
		{20260519050950, "BuildIndex", statements(fmt.Sprintf(`ALTER TABLE %s ADD UNIQUE KEY uk_user_username (username), ADD UNIQUE KEY uk_user_uuid (uuid);
ALTER TABLE %s ADD UNIQUE KEY uk_setting_key (%s);
ALTER TABLE %s ADD KEY idx_mfa_userid_type (userid, type), ADD KEY idx_mfa_rawid_type (rawid, type);
ALTER TABLE %s ADD KEY idx_item_party_paid (party_id, paid), ADD KEY idx_item_party_userid_paid (party_id, userid, paid), ADD KEY idx_item_party_initiator_paid (party_id, initiator, paid), ADD KEY idx_item_userid_paid (userid, paid), ADD KEY idx_item_initiator_paid (initiator, paid), ADD KEY idx_item_created_at (created_at);
ALTER TABLE %s ADD KEY idx_party_owner_archived (owner_id, archived_at), ADD KEY idx_party_base_currency (base_currency);
ALTER TABLE %s ADD KEY idx_refresh_user_revoked (user_id, revoked_at), ADD KEY idx_refresh_expires_at (expires_at)`, table("user"), table("setting"), quote("key"), table("mfa_credential"), table("item"), table("party"), table("refresh_tokens")))},
		{20260909120000, "CreateAPITokensTable", []string{fmt.Sprintf(`CREATE TABLE %s (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(64) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  token_prefix VARCHAR(16) NOT NULL,
  expires_at DATETIME NULL,
  revoked_at DATETIME NULL,
  last_used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_ip VARCHAR(45) NULL,
  KEY user_id (user_id), UNIQUE KEY token_hash (token_hash), KEY idx_api_token_user_revoked (user_id, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, table("api_tokens"))}},
	}
}
