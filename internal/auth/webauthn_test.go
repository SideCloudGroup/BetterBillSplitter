package auth

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"testing"
	"time"

	gowebauthn "github.com/go-webauthn/webauthn/webauthn"
)

func TestDecodeLegacyPHPCredential(t *testing.T) {
	id := []byte{0xfb, 0xef, 0xff, 1}
	key := []byte{0xa5, 1, 2, 3, 4}
	body := fmt.Sprintf(`{"publicKeyCredentialId":%q,"type":"public-key","transports":["usb","nfc"],"attestationType":"none","trustPath":{"type":"Webauthn\\TrustPath\\EmptyTrustPath"},"aaguid":"00112233-4455-6677-8899-aabbccddeeff","credentialPublicKey":%q,"userHandle":"dXNlci11dWlk","counter":42,"backupEligible":true,"backupStatus":false,"uvInitialized":true}`,
		base64.RawURLEncoding.EncodeToString(id), base64.RawURLEncoding.EncodeToString(key))
	credential, err := DecodeWebAuthnCredential(body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(credential.ID, id) || !bytes.Equal(credential.PublicKey, key) {
		t.Fatal("legacy binary fields changed")
	}
	if credential.Authenticator.SignCount != 42 || !credential.Flags.BackupEligible || !credential.Flags.UserVerified {
		t.Fatalf("legacy metadata changed: %#v", credential)
	}
	if len(credential.Authenticator.AAGUID) != 16 || len(credential.Transport) != 2 {
		t.Fatal("legacy authenticator metadata was not preserved")
	}
}

func TestWebAuthnSessionIsOneUseAndBound(t *testing.T) {
	store := NewWebAuthnSessionStore()
	id, err := store.Create(&gowebauthn.SessionData{Challenge: "challenge"}, "fido-login", 7, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := store.Take(id, "fido-login", 8); ok {
		t.Fatal("session accepted for another user")
	}
	if _, ok := store.Take(id, "fido-login", 7); ok {
		t.Fatal("failed attempt did not consume session")
	}
}
