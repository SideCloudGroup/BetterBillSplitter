package currency

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

const defaultAPIURL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/{type}.json"

type cacheEntry struct {
	rates     map[string]string
	expiresAt time.Time
}

type Service struct {
	redis     *redis.Client
	keyPrefix string
	client    *http.Client
	apiURL    string
	now       func() time.Time
	mu        sync.RWMutex
	cache     map[string]cacheEntry
}

func NewService(redisClient *redis.Client, keyPrefix string) *Service {
	return &Service{
		redis: redisClient, keyPrefix: keyPrefix, client: &http.Client{Timeout: 15 * time.Second},
		apiURL: defaultAPIURL, now: time.Now, cache: make(map[string]cacheEntry),
	}
}

// Rates returns target-currency units per one base-currency unit. API values
// are normalized to four decimal places, matching the legacy PHP service.
func (s *Service) Rates(ctx context.Context, base string) (map[string]string, error) {
	base = strings.ToLower(strings.TrimSpace(base))
	if base == "" {
		return nil, errors.New("currency: base currency is empty")
	}
	if rates, ok := s.memoryGet(base); ok {
		return rates, nil
	}
	key := s.keyPrefix + "exchange:" + base
	if s.redis != nil {
		if encoded, err := s.redis.Get(ctx, key).Bytes(); err == nil {
			var rates map[string]string
			if json.Unmarshal(encoded, &rates) == nil {
				s.memorySet(base, rates)
				return clone(rates), nil
			}
		}
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.ReplaceAll(s.apiURL, "{type}", base), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/json")
	response, err := s.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("currency: fetch rates: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, response.Body)
		return nil, fmt.Errorf("currency: rate API returned HTTP %d", response.StatusCode)
	}
	var payload map[string]map[string]json.Number
	decoder := json.NewDecoder(io.LimitReader(response.Body, 4<<20))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return nil, fmt.Errorf("currency: decode rates: %w", err)
	}
	raw, ok := payload[base]
	if !ok {
		return nil, fmt.Errorf("currency: base %q missing from response", base)
	}
	rates := make(map[string]string, len(raw)+1)
	for code, number := range raw {
		value, err := number.Float64()
		if err != nil || value <= 0 {
			continue
		}
		rates[strings.ToLower(code)] = fmt.Sprintf("%.4f", value)
	}
	rates[base] = "1.0000"
	s.memorySet(base, rates)
	if s.redis != nil {
		if encoded, err := json.Marshal(rates); err == nil {
			_ = s.redis.Set(ctx, key, encoded, time.Hour).Err()
		}
	}
	return clone(rates), nil
}

func (s *Service) memoryGet(base string) (map[string]string, bool) {
	s.mu.RLock()
	entry, ok := s.cache[base]
	s.mu.RUnlock()
	if !ok || !entry.expiresAt.After(s.now()) {
		return nil, false
	}
	return clone(entry.rates), true
}

func (s *Service) memorySet(base string, rates map[string]string) {
	s.mu.Lock()
	s.cache[base] = cacheEntry{rates: clone(rates), expiresAt: s.now().Add(time.Hour)}
	s.mu.Unlock()
}

func clone(input map[string]string) map[string]string {
	result := make(map[string]string, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}
