package auth

import (
	"testing"
	"time"
)

func TestCaptchaStoreIsOneUse(t *testing.T) {
	store := NewCaptchaStore()
	id, err := store.Create("123456", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if !store.Verify(id, "123456") {
		t.Fatal("correct answer was rejected")
	}
	if store.Verify(id, "123456") {
		t.Fatal("challenge was accepted twice")
	}
}

func TestCaptchaStoreConsumesWrongAnswer(t *testing.T) {
	store := NewCaptchaStore()
	id, err := store.Create("123456", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if store.Verify(id, "000000") || store.Verify(id, "123456") {
		t.Fatal("wrong attempt did not consume challenge")
	}
}
