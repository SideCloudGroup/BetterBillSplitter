package auth

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	gowebauthn "github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
)

type WebAuthnUser struct {
	ID          []byte
	Name        string
	Credentials []gowebauthn.Credential
}

func (u WebAuthnUser) WebAuthnID() []byte                           { return u.ID }
func (u WebAuthnUser) WebAuthnName() string                         { return u.Name }
func (u WebAuthnUser) WebAuthnDisplayName() string                  { return u.Name }
func (u WebAuthnUser) WebAuthnCredentials() []gowebauthn.Credential { return u.Credentials }

type legacyCredential struct {
	PublicKeyCredentialID string   `json:"publicKeyCredentialId"`
	CredentialPublicKey   string   `json:"credentialPublicKey"`
	Transports            []string `json:"transports"`
	AttestationType       string   `json:"attestationType"`
	AAGUID                string   `json:"aaguid"`
	Counter               uint32   `json:"counter"`
	BackupEligible        *bool    `json:"backupEligible"`
	BackupStatus          *bool    `json:"backupStatus"`
	UVInitialized         *bool    `json:"uvInitialized"`
}

// DecodeWebAuthnCredential accepts both native Go records and the JSON emitted
// by web-auth/webauthn-framework used by the former PHP backend.
func DecodeWebAuthnCredential(body string) (gowebauthn.Credential, error) {
	var probe map[string]json.RawMessage
	if err := json.Unmarshal([]byte(body), &probe); err != nil {
		return gowebauthn.Credential{}, err
	}
	if _, ok := probe["id"]; ok {
		var credential gowebauthn.Credential
		if err := json.Unmarshal([]byte(body), &credential); err != nil {
			return credential, err
		}
		if len(credential.ID) == 0 || len(credential.PublicKey) == 0 {
			return credential, errors.New("webauthn credential is incomplete")
		}
		return credential, nil
	}
	var legacy legacyCredential
	if err := json.Unmarshal([]byte(body), &legacy); err != nil {
		return gowebauthn.Credential{}, err
	}
	id, err := decodeBase64(legacy.PublicKeyCredentialID)
	if err != nil {
		return gowebauthn.Credential{}, err
	}
	publicKey, err := decodeBase64(legacy.CredentialPublicKey)
	if err != nil {
		return gowebauthn.Credential{}, err
	}
	if len(id) == 0 || len(publicKey) == 0 {
		return gowebauthn.Credential{}, errors.New("legacy webauthn credential is incomplete")
	}
	transports := make([]protocol.AuthenticatorTransport, len(legacy.Transports))
	for i := range legacy.Transports {
		transports[i] = protocol.AuthenticatorTransport(legacy.Transports[i])
	}
	var aaguid []byte
	if parsed, parseErr := uuid.Parse(legacy.AAGUID); parseErr == nil {
		aaguid = parsed[:]
	}
	flags := protocol.FlagUserPresent
	if legacy.UVInitialized != nil && *legacy.UVInitialized {
		flags |= protocol.FlagUserVerified
	}
	if legacy.BackupEligible != nil && *legacy.BackupEligible {
		flags |= protocol.FlagBackupEligible
	}
	if legacy.BackupStatus != nil && *legacy.BackupStatus {
		flags |= protocol.FlagBackupState
	}
	return gowebauthn.Credential{
		ID: id, PublicKey: publicKey, AttestationType: legacy.AttestationType,
		Transport: transports, Flags: gowebauthn.NewCredentialFlags(flags),
		Authenticator: gowebauthn.Authenticator{AAGUID: aaguid, SignCount: legacy.Counter},
	}, nil
}

func EncodeWebAuthnCredential(credential *gowebauthn.Credential) (body, rawID string, err error) {
	encoded, err := json.Marshal(credential)
	if err != nil {
		return "", "", err
	}
	return string(encoded), base64.RawURLEncoding.EncodeToString(credential.ID), nil
}

func decodeBase64(value string) ([]byte, error) {
	encodings := []*base64.Encoding{base64.RawURLEncoding, base64.URLEncoding, base64.RawStdEncoding, base64.StdEncoding}
	for _, encoding := range encodings {
		if decoded, err := encoding.DecodeString(value); err == nil {
			return decoded, nil
		}
	}
	return nil, errors.New("invalid base64 credential value")
}

type WebAuthnSession struct {
	Data      gowebauthn.SessionData
	Kind      string
	UserID    uint64
	ExpiresAt time.Time
}

type WebAuthnSessionStore struct {
	mu     sync.Mutex
	values map[string]WebAuthnSession
}

func NewWebAuthnSessionStore() *WebAuthnSessionStore {
	return &WebAuthnSessionStore{values: make(map[string]WebAuthnSession)}
}

func (s *WebAuthnSessionStore) Create(data *gowebauthn.SessionData, kind string, userID uint64, ttl time.Duration) (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	id := hex.EncodeToString(raw)
	s.mu.Lock()
	s.values[id] = WebAuthnSession{Data: *data, Kind: kind, UserID: userID, ExpiresAt: time.Now().Add(ttl)}
	s.mu.Unlock()
	return id, nil
}

func (s *WebAuthnSessionStore) Take(id, kind string, userID uint64) (WebAuthnSession, bool) {
	s.mu.Lock()
	value, ok := s.values[id]
	delete(s.values, id)
	s.mu.Unlock()
	if !ok || value.Kind != kind || value.UserID != userID || time.Now().After(value.ExpiresAt) {
		return WebAuthnSession{}, false
	}
	return value, true
}
