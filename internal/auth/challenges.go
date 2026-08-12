package auth

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

type secretChallenge struct {
	UserID    uint64
	Secret    string
	ExpiresAt time.Time
}

type ChallengeStore struct {
	mu     sync.Mutex
	values map[string]secretChallenge
}

func NewChallengeStore() *ChallengeStore {
	return &ChallengeStore{values: make(map[string]secretChallenge)}
}

func (s *ChallengeStore) Create(userID uint64, secret string, ttl time.Duration) (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	id := hex.EncodeToString(raw)
	s.mu.Lock()
	s.values[id] = secretChallenge{UserID: userID, Secret: secret, ExpiresAt: time.Now().Add(ttl)}
	s.mu.Unlock()
	return id, nil
}

func (s *ChallengeStore) Get(id string, userID uint64) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	value, ok := s.values[id]
	if !ok || value.UserID != userID || time.Now().After(value.ExpiresAt) {
		delete(s.values, id)
		return "", false
	}
	return value.Secret, true
}

func (s *ChallengeStore) Delete(id string) {
	s.mu.Lock()
	delete(s.values, id)
	s.mu.Unlock()
}
