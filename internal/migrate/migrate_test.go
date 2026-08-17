package migrate

import (
	"context"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestLegacyVersionsMatchPHPFilenames(t *testing.T) {
	want := []int64{
		20240512222608, 20241002123454, 20241008220049, 20250108084543,
		20250819200000, 20250819200001, 20250819200002, 20250819200003,
		20250820000000, 20250820122215, 20260518120000, 20260518140000,
		20260519050950,
	}
	got := legacyMigrations("")
	if len(got) != len(want) {
		t.Fatalf("got %d migrations, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i].Version != want[i] {
			t.Fatalf("migration %d has version %d, want %d", i, got[i].Version, want[i])
		}
		if got[i].Name == "" || len(got[i].SQL) == 0 {
			t.Fatalf("migration %d is incomplete", want[i])
		}
	}
}

func TestUpTrustsExistingPHPHistory(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	runner, err := New(db, "bbs_", "migrations")
	if err != nil {
		t.Fatal(err)
	}
	runner.migrations = []Migration{
		{Version: 100, Name: "AlreadyRun", SQL: []string{"SHOULD NOT RUN"}},
		{Version: 101, Name: "NewGoMigration", SQL: []string{"ALTER SOMETHING"}},
	}

	mock.ExpectExec(regexp.QuoteMeta("CREATE TABLE IF NOT EXISTS `bbs_migrations` (")).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT version FROM `bbs_migrations`")).WillReturnRows(sqlmock.NewRows([]string{"version"}).AddRow(100))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("ALTER SOMETHING")).WillReturnResult(sqlmock.NewResult(0, 1))
	insertExpectation := mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `bbs_migrations` (version, migration_name, start_time, end_time, breakpoint) VALUES (?, ?, ?, ?, 0)"))
	insertExpectation.WithArgs(int64(101), "NewGoMigration", sqlmock.AnyArg(), sqlmock.AnyArg()).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if err := runner.Up(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestRejectsUnsafeTableIdentifiers(t *testing.T) {
	db, _, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := New(db, "bad-prefix;", "migrations"); err == nil {
		t.Fatal("expected unsafe prefix error")
	}
}
