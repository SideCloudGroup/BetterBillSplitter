package auth

import "testing"

func TestVerifiesLegacyPHPArgon2idHash(t *testing.T) {
	const phpHash = "$argon2id$v=19$m=65536,t=4,p=1$R1A0WlhFTER1MW9ISzlRZw$xXd4P/daV3vJDWzLAVOQTPR20XpqLJ7cv8zssoW+Hrs"
	ok, err := VerifyPassword("correct horse battery staple", phpHash)
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("Go must verify hashes created by PHP PASSWORD_ARGON2ID")
	}
	ok, err = VerifyPassword("wrong", phpHash)
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("wrong password verified")
	}
}

func TestNewHashesRoundTrip(t *testing.T) {
	hash, err := HashPassword("new password")
	if err != nil {
		t.Fatal(err)
	}
	ok, err := VerifyPassword("new password", hash)
	if err != nil || !ok {
		t.Fatalf("round trip failed: ok=%v err=%v", ok, err)
	}
}
