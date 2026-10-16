package currency

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/singleflight"
)

const defaultAPIURL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/{type}.json"
const fallbackAPIURL = "https://latest.currency-api.pages.dev/v1/currencies/{type}.json"
const cacheTTL = time.Hour
const staleAfter = 24 * time.Hour
const maxDataAge = 48 * time.Hour

// UpdatedAt is the last successful fetch, never the time a cache was read.
type Status struct {
	UpdatedAt   *time.Time `json:"updated_at"`
	AttemptedAt *time.Time `json:"attempted_at"`
	DataDate    string     `json:"data_date"`
	LastError   string     `json:"last_error"`
	Stale       bool       `json:"stale"`
}

type cacheEntry struct {
	Rates map[string]string `json:"rates"`
	Status
}

type Service struct {
	redis       *redis.Client
	keyPrefix   string
	client      *http.Client
	apiURL      string
	fallbackURL string
	now         func() time.Time
	mu          sync.RWMutex
	cache       map[string]cacheEntry
	requests    singleflight.Group
}

func NewService(redisClient *redis.Client, keyPrefix string) *Service {
	return &Service{redis: redisClient, keyPrefix: keyPrefix, client: &http.Client{Timeout: 7 * time.Second},
		apiURL: defaultAPIURL, fallbackURL: fallbackAPIURL, now: time.Now, cache: make(map[string]cacheEntry)}
}

// Rates returns target-currency units per base-currency unit, retaining upstream
// precision. Expired rates are never used for new ledger items.
func (s *Service) Rates(ctx context.Context, base string) (map[string]string, error) {
	return s.rates(ctx, base, false)
}

func (s *Service) Refresh(ctx context.Context, base string) error {
	_, err := s.rates(ctx, base, true)
	return err
}

func (s *Service) rates(ctx context.Context, base string, force bool) (map[string]string, error) {
	base = strings.ToLower(strings.TrimSpace(base))
	if base == "" {
		return nil, errors.New("currency: base currency is empty")
	}
	s.mu.RLock()
	entry := s.cache[base]
	s.mu.RUnlock()
	if !force && s.fresh(entry) {
		return clone(entry.Rates), nil
	}
	entry = s.load(ctx, base)
	if !force && s.fresh(entry) {
		return clone(entry.Rates), nil
	}
	result := s.requests.DoChan(base, func() (any, error) {
		// Bound shared work independently of a caller disconnecting.
		fetchCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 16*time.Second)
		defer cancel()
		entry := s.load(fetchCtx, base)
		if !force && s.fresh(entry) {
			return entry.Rates, nil
		}
		var failures []error
		for _, url := range []string{s.apiURL, s.fallbackURL} {
			if url == "" {
				continue
			}
			rates, date, err := s.fetch(fetchCtx, url, base)
			if err != nil {
				failures = append(failures, err)
				continue
			}
			now := s.now().UTC()
			entry = cacheEntry{Rates: rates, Status: Status{UpdatedAt: &now, AttemptedAt: &now, DataDate: date}}
			s.save(fetchCtx, base, entry)
			return rates, nil
		}
		err := fmt.Errorf("currency: refresh failed: %w", errors.Join(failures...))
		now := s.now().UTC()
		entry.AttemptedAt, entry.LastError = &now, err.Error()
		s.save(fetchCtx, base, entry)
		return nil, err
	})
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case result := <-result:
		if result.Err != nil {
			return nil, result.Err
		}
		return clone(result.Val.(map[string]string)), nil
	}
}

func (s *Service) fetch(ctx context.Context, url, base string) (map[string]string, string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.ReplaceAll(url, "{type}", base), nil)
	if err != nil {
		return nil, "", err
	}
	request.Header.Set("Accept", "application/json")
	response, err := s.client.Do(request)
	if err != nil {
		return nil, "", fmt.Errorf("fetch rates: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("rate API returned HTTP %d", response.StatusCode)
	}
	// The root also contains a string date; decode the selected base separately.
	var payload map[string]json.RawMessage
	if err := json.NewDecoder(io.LimitReader(response.Body, 4<<20)).Decode(&payload); err != nil {
		return nil, "", fmt.Errorf("decode rates: %w", err)
	}
	var date string
	if err := json.Unmarshal(payload["date"], &date); err != nil {
		return nil, "", errors.New("rate API date missing or invalid")
	}
	dataTime, err := time.Parse("2006-01-02", date)
	if err != nil || s.now().Sub(dataTime) > maxDataAge || dataTime.After(s.now().Add(24*time.Hour)) {
		return nil, "", errors.New("rate API date invalid or older than 48 hours")
	}
	var raw map[string]json.Number
	if err := json.Unmarshal(payload[base], &raw); err != nil || len(raw) == 0 {
		return nil, "", fmt.Errorf("base %q missing or invalid in response", base)
	}
	rates := make(map[string]string, len(raw)+1)
	for code, number := range raw {
		value, ok := new(big.Rat).SetString(number.String())
		if !ok || value.Sign() <= 0 {
			continue
		}
		rates[strings.ToLower(code)] = number.String()
	}
	if len(rates) == 0 {
		return nil, "", errors.New("rate API returned no positive rates")
	}
	rates[base] = "1"
	return rates, date, nil
}

func (s *Service) fresh(entry cacheEntry) bool {
	return entry.UpdatedAt != nil && !entry.UpdatedAt.After(s.now()) && s.now().Sub(*entry.UpdatedAt) < cacheTTL && len(entry.Rates) > 0 && !s.dataStale(entry.DataDate)
}

func (s *Service) dataStale(date string) bool {
	t, err := time.Parse("2006-01-02", date)
	return err != nil || s.now().Sub(t) > maxDataAge
}

func (s *Service) Status(ctx context.Context, base string) Status {
	entry := s.load(ctx, strings.ToLower(strings.TrimSpace(base)))
	status := entry.Status
	status.Stale = status.UpdatedAt != nil && (s.now().Sub(*status.UpdatedAt) > staleAfter || s.dataStale(status.DataDate))
	return status
}

func (s *Service) load(ctx context.Context, base string) cacheEntry {
	s.mu.RLock()
	entry := s.cache[base]
	s.mu.RUnlock()
	if s.redis != nil {
		// Versioned envelope avoids treating old timestamp-less caches as fresh.
		if data, err := s.redis.Get(ctx, s.keyPrefix+"exchange:v2:"+base).Bytes(); err == nil {
			var shared cacheEntry
			if json.Unmarshal(data, &shared) == nil && (entry.AttemptedAt == nil || shared.AttemptedAt != nil && shared.AttemptedAt.After(*entry.AttemptedAt)) {
				entry = shared
				s.mu.Lock()
				current := s.cache[base]
				if current.AttemptedAt == nil || entry.AttemptedAt != nil && entry.AttemptedAt.After(*current.AttemptedAt) {
					s.cache[base] = entry
				} else {
					entry = current
				}
				s.mu.Unlock()
			}
		}
	}
	return entry
}

func (s *Service) save(ctx context.Context, base string, entry cacheEntry) {
	s.mu.Lock()
	s.cache[base] = entry
	s.mu.Unlock()
	if s.redis != nil {
		if encoded, err := json.Marshal(entry); err == nil {
			// Keep diagnostic history after rates expire, including across restarts.
			cacheCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Second)
			defer cancel()
			if err := s.redis.Set(cacheCtx, s.keyPrefix+"exchange:v2:"+base, encoded, 0).Err(); err != nil {
				slog.Warn("currency: could not persist exchange cache", "base", base, "error", err)
			}
		}
	}
}

func clone(input map[string]string) map[string]string {
	result := make(map[string]string, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}
