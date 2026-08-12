package auth

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

type MFATicket struct {
	UserID    uint64
	ExpiresAt time.Time
}

type TicketStore struct {
	mu      sync.Mutex
	tickets map[string]MFATicket
}

func NewTicketStore() *TicketStore { return &TicketStore{tickets: make(map[string]MFATicket)} }

func (s *TicketStore) Create(userID uint64, ttl time.Duration) (string, error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	ticket := hex.EncodeToString(raw)
	s.mu.Lock()
	s.tickets[ticket] = MFATicket{UserID: userID, ExpiresAt: time.Now().Add(ttl)}
	s.pruneLocked()
	s.mu.Unlock()
	return ticket, nil
}

func (s *TicketStore) Get(ticket string) (MFATicket, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	value, ok := s.tickets[ticket]
	if !ok || time.Now().After(value.ExpiresAt) {
		delete(s.tickets, ticket)
		return MFATicket{}, false
	}
	return value, true
}

func (s *TicketStore) Delete(ticket string) {
	s.mu.Lock()
	delete(s.tickets, ticket)
	s.mu.Unlock()
}

func (s *TicketStore) pruneLocked() {
	now := time.Now()
	for key, value := range s.tickets {
		if now.After(value.ExpiresAt) {
			delete(s.tickets, key)
		}
	}
}
