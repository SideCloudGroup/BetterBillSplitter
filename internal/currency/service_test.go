package currency

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestRatesRoundsLikeLegacyAndCaches(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"cny":{"usd":0.137931,"jpy":20.123456}}`))
	}))
	defer server.Close()
	service := NewService(nil, "test:")
	service.apiURL = server.URL + "/{type}"

	for i := 0; i < 2; i++ {
		rates, err := service.Rates(context.Background(), "CNY")
		if err != nil {
			t.Fatal(err)
		}
		if rates["usd"] != "0.1379" || rates["jpy"] != "20.1235" || rates["cny"] != "1.0000" {
			t.Fatalf("unexpected rates: %#v", rates)
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("API calls = %d, want 1", calls.Load())
	}
}

func TestRatesRejectsInvalidResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"usd":{}}`))
	}))
	defer server.Close()
	service := NewService(nil, "test:")
	service.apiURL = server.URL
	if _, err := service.Rates(context.Background(), "cny"); err == nil {
		t.Fatal("expected missing base error")
	}
}
