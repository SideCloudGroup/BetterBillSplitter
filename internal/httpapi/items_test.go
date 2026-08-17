package httpapi

import (
	"testing"
	"time"
)

func TestRecentActivityCutoffIsThirtyDays(t *testing.T) {
	now := time.Date(2026, time.August, 17, 12, 30, 0, 0, time.FixedZone("UTC+8", 8*60*60))
	want := time.Date(2026, time.July, 18, 12, 30, 0, 0, now.Location())
	if got := recentActivityCutoff(now); !got.Equal(want) {
		t.Fatalf("recent activity cutoff = %s, want %s", got, want)
	}
}
