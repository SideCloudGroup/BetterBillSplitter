package currency

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/money"
	"github.com/redis/go-redis/v9"
)

var testNow = time.Date(2026, 10, 16, 12, 0, 0, 0, time.UTC)

const validPayload = `{"date":"2026-10-16","cny":{"cny":1,"usd":0.137931,"jpy":20.123456,"btc":0.000001923456}}`

func newTestService(t *testing.T, handler http.HandlerFunc) *Service {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	s := NewService(nil, "test:")
	s.apiURL, s.fallbackURL = server.URL+"/{type}", ""
	s.now = func() time.Time { return testNow }
	return s
}

func TestRatesRealPayloadPrecisionAndCache(t *testing.T) {
	var calls atomic.Int32
	s := newTestService(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/cny" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		fmt.Fprint(w, validPayload)
	})
	ctx := context.Background()
	for i := 0; i < 2; i++ {
		rates, err := s.Rates(ctx, " CNY ")
		if err != nil {
			t.Fatal(err)
		}
		if rates["usd"] != "0.137931" || rates["jpy"] != "20.123456" || rates["cny"] != "1" || rates["btc"] != "0.000001923456" {
			t.Fatalf("unexpected rates: %#v", rates)
		}
		converted, err := money.ConvertToBaseCurrency("13.79", rates["usd"])
		if err != nil || converted.String() != "99.97" {
			t.Fatalf("conversion = %v, %v", converted, err)
		}
		rates["usd"] = "bad" // A caller cannot corrupt cached data.
	}
	if calls.Load() != 1 {
		t.Fatalf("API calls = %d, want 1", calls.Load())
	}
	status := s.Status(ctx, "cny")
	if status.UpdatedAt == nil || !status.UpdatedAt.Equal(testNow) || status.DataDate != "2026-10-16" || status.LastError != "" || status.Stale {
		t.Fatalf("unexpected status: %+v", status)
	}
}

func TestExpiryFailureAndRecovery(t *testing.T) {
	var fail atomic.Bool
	s := newTestService(t, func(w http.ResponseWriter, _ *http.Request) {
		if fail.Load() {
			http.Error(w, "unavailable", 503)
			return
		}
		fmt.Fprint(w, validPayload)
	})
	now := testNow
	s.now = func() time.Time { return now }
	ctx := context.Background()
	if _, err := s.Rates(ctx, "cny"); err != nil {
		t.Fatal(err)
	}
	now = now.Add(59 * time.Minute)
	if _, err := s.Rates(ctx, "cny"); err != nil {
		t.Fatal(err)
	}
	if !s.Status(ctx, "cny").UpdatedAt.Equal(testNow) {
		t.Fatal("cache hit reset the update time")
	}
	now = now.Add(2 * time.Minute)
	fail.Store(true)
	if rates, err := s.Rates(ctx, "cny"); err == nil || rates != nil {
		t.Fatal("expired rates must not be used after failure")
	}
	status := s.Status(ctx, "cny")
	if status.LastError == "" || !status.UpdatedAt.Equal(testNow) || !status.AttemptedAt.Equal(now) {
		t.Fatalf("lost failure history: %+v", status)
	}
	now = testNow.Add(25 * time.Hour)
	if !s.Status(ctx, "cny").Stale {
		t.Fatal("expected stale status after 24 hours")
	}
	fail.Store(false)
	if err := s.Refresh(ctx, "cny"); err != nil {
		t.Fatal(err)
	}
	status = s.Status(ctx, "cny")
	if status.LastError != "" || status.Stale || !status.UpdatedAt.Equal(now) {
		t.Fatalf("recovery did not clear error: %+v", status)
	}
}

func TestRatesFallback(t *testing.T) {
	var calls atomic.Int32
	s := newTestService(t, func(w http.ResponseWriter, _ *http.Request) { http.Error(w, "unavailable", 503) })
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { calls.Add(1); fmt.Fprint(w, validPayload) }))
	defer fallback.Close()
	s.fallbackURL = fallback.URL
	if _, err := s.Rates(context.Background(), "cny"); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 1 || s.Status(context.Background(), "cny").LastError != "" {
		t.Fatal("fallback should count as a successful refresh")
	}
}

func TestRatesRejectsInvalidResponse(t *testing.T) {
	for _, body := range []string{
		`{"date":"2026-10-16","usd":{}}`,
		`{"date":"2026-10-16","cny":{}}`,
		`{"date":"2026-10-16","cny":{"usd":0,"jpy":-1}}`,
		`{"date":"2020-01-01","cny":{"usd":0.1}}`,
		`{"date":"2099-01-01","cny":{"usd":0.1}}`,
		`{"cny":{"usd":0.1}}`,
		`<html>upstream proxy failure</html>`,
	} {
		t.Run(body, func(t *testing.T) {
			s := newTestService(t, func(w http.ResponseWriter, _ *http.Request) { fmt.Fprint(w, body) })
			if _, err := s.Rates(context.Background(), "cny"); err == nil {
				t.Fatal("expected invalid response error")
			}
			status := s.Status(context.Background(), "cny")
			if status.UpdatedAt != nil || status.LastError == "" {
				t.Fatalf("unexpected failed status: %+v", status)
			}
		})
	}
}

func TestConcurrentRatesShareFetch(t *testing.T) {
	var calls atomic.Int32
	s := newTestService(t, func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		time.Sleep(20 * time.Millisecond)
		fmt.Fprint(w, validPayload)
	})
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.Rates(context.Background(), "cny"); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatalf("concurrent fetches = %d, want 1", calls.Load())
	}
}

// Exercise the actual Redis cache envelope without a network dependency. The
// hook only replaces Redis storage; HTTP fetches use real local HTTP servers.
type redisStorage struct {
	mu     sync.Mutex
	values map[string][]byte
}

func (r *redisStorage) DialHook(next redis.DialHook) redis.DialHook {
	return func(ctx context.Context, network, addr string) (net.Conn, error) { return next(ctx, network, addr) }
}
func (r *redisStorage) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return next
}
func (r *redisStorage) ProcessHook(_ redis.ProcessHook) redis.ProcessHook {
	return func(_ context.Context, cmd redis.Cmder) error {
		r.mu.Lock()
		defer r.mu.Unlock()
		key := cmd.Args()[1].(string)
		switch cmd.Name() {
		case "get":
			if value, ok := r.values[key]; ok {
				cmd.(*redis.StringCmd).SetVal(string(value))
				return nil
			}
			cmd.SetErr(redis.Nil)
			return redis.Nil
		case "set":
			if len(cmd.Args()) != 3 {
				return fmt.Errorf("diagnostic history must persist beyond the rates TTL: %v", cmd.Args())
			}
			r.values[key] = append([]byte(nil), cmd.Args()[2].([]byte)...)
			cmd.(*redis.StatusCmd).SetVal("OK")
			return nil
		default:
			return fmt.Errorf("unexpected Redis command: %s", cmd.Name())
		}
	}
}

func TestRedisCacheRestoresOriginalTimestampAndFailureHistory(t *testing.T) {
	var calls atomic.Int32
	var fail atomic.Bool
	s := newTestService(t, func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		if fail.Load() {
			http.Error(w, "unavailable", 503)
			return
		}
		fmt.Fprint(w, validPayload)
	})
	storage := &redisStorage{values: make(map[string][]byte)}
	client := redis.NewClient(&redis.Options{Addr: "unused:6379"})
	client.AddHook(storage)
	defer client.Close()
	s.redis = client
	ctx := context.Background()
	if _, err := s.Rates(ctx, "cny"); err != nil {
		t.Fatal(err)
	}
	restored := NewService(client, "test:")
	restored.apiURL, restored.fallbackURL = s.apiURL, ""
	now := testNow.Add(50 * time.Minute)
	restored.now = func() time.Time { return now }
	if _, err := restored.Rates(ctx, "cny"); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 1 {
		t.Fatal("Redis hit unnecessarily fetched upstream")
	}
	if !restored.Status(ctx, "cny").UpdatedAt.Equal(testNow) {
		t.Fatal("Redis hit reset original timestamp")
	}
	now = testNow.Add(61 * time.Minute)
	fail.Store(true)
	if _, err := restored.Rates(ctx, "cny"); err == nil {
		t.Fatal("Redis hit extended freshness past one hour")
	}
	restarted := NewService(client, "test:")
	restarted.now = func() time.Time { return now }
	status := restarted.Status(ctx, "cny")
	if status.LastError == "" || !status.UpdatedAt.Equal(testNow) || !status.AttemptedAt.Equal(now) {
		t.Fatalf("history lost across restart: %+v", status)
	}
	// Corrupt and legacy values must trigger a fetch rather than become fresh.
	for _, data := range []string{`not-json`, `{"usd":"0.1379"}`} {
		storage.values["test:exchange:v2:cny"] = []byte(data)
		fresh := NewService(client, "test:")
		fresh.apiURL, fresh.fallbackURL, fresh.now = s.apiURL, "", s.now
		if _, err := fresh.Rates(ctx, "cny"); err == nil {
			t.Fatal("invalid Redis cache was accepted")
		}
	}
}

func TestTimeoutUsesFallback(t *testing.T) {
	s := newTestService(t, func(_ http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	})
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { fmt.Fprint(w, validPayload) }))
	defer fallback.Close()
	s.fallbackURL = fallback.URL
	s.client.Timeout = 200 * time.Millisecond
	if _, err := s.Rates(context.Background(), "cny"); err != nil {
		t.Fatal(err)
	}
}

func TestCacheAndWarningAgeBoundaries(t *testing.T) {
	var calls atomic.Int32
	s := newTestService(t, func(w http.ResponseWriter, _ *http.Request) { calls.Add(1); fmt.Fprint(w, validPayload) })
	now := testNow
	s.now = func() time.Time { return now }
	ctx := context.Background()
	if _, err := s.Rates(ctx, "cny"); err != nil {
		t.Fatal(err)
	}
	now = testNow.Add(time.Hour - time.Nanosecond)
	if _, err := s.Rates(ctx, "cny"); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 1 {
		t.Fatal("cache expired too early")
	}
	now = testNow.Add(time.Hour)
	if _, err := s.Rates(ctx, "cny"); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 2 {
		t.Fatal("cache was reused at the one-hour expiry boundary")
	}
	lastSuccess := now
	now = lastSuccess.Add(24 * time.Hour)
	if s.Status(ctx, "cny").Stale {
		t.Fatal("status became stale before exceeding 24 hours")
	}
	now = now.Add(time.Nanosecond)
	if !s.Status(ctx, "cny").Stale {
		t.Fatal("status is not stale after exceeding 24 hours")
	}
}

func TestCanceledCallerDoesNotCancelSharedFetch(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	finished := make(chan struct{})
	var releaseOnce sync.Once
	unblock := func() { releaseOnce.Do(func() { close(release) }) }
	s := newTestService(t, func(w http.ResponseWriter, r *http.Request) {
		close(started)
		select {
		case <-release:
			fmt.Fprint(w, validPayload)
		case <-r.Context().Done():
			t.Error("caller cancellation canceled shared HTTP request")
		}
		close(finished)
	})
	t.Cleanup(unblock)
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() { _, err := s.Rates(ctx, "cny"); result <- err }()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("fetch never started")
	}
	cancel()
	select {
	case err := <-result:
		if err != context.Canceled {
			t.Fatalf("canceled caller got %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("canceled caller did not return promptly")
	}
	unblock()
	select {
	case <-finished:
	case <-time.After(3 * time.Second):
		t.Fatal("shared HTTP request did not finish")
	}
	if _, err := s.Rates(context.Background(), "cny"); err != nil {
		t.Fatal(err)
	}
	if s.Status(context.Background(), "cny").LastError != "" {
		t.Fatal("caller cancellation was recorded as an upstream failure")
	}
}
