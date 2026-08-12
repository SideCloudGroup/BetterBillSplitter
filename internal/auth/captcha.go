package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"sync"
	"time"
)

type captchaValue struct {
	answer    string
	expiresAt time.Time
}

// CaptchaStore keeps short-lived, one-use numeric CAPTCHA answers. The random
// identifier is held in an HttpOnly cookie; the answer never leaves the server.
type CaptchaStore struct {
	mu     sync.Mutex
	values map[string]captchaValue
}

func NewCaptchaStore() *CaptchaStore {
	return &CaptchaStore{values: make(map[string]captchaValue)}
}

func (s *CaptchaStore) Create(answer string, ttl time.Duration) (string, error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	id := hex.EncodeToString(raw)
	s.mu.Lock()
	s.values[id] = captchaValue{answer: answer, expiresAt: time.Now().Add(ttl)}
	s.mu.Unlock()
	return id, nil
}

// Verify consumes a challenge even when the supplied answer is wrong, which
// prevents brute force attempts against the same image.
func (s *CaptchaStore) Verify(id, answer string) bool {
	s.mu.Lock()
	value, ok := s.values[id]
	delete(s.values, id)
	s.mu.Unlock()
	if !ok || time.Now().After(value.expiresAt) || len(answer) != len(value.answer) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(answer), []byte(value.answer)) == 1
}
