package money

import "testing"

func TestConvertToBaseCurrencyMatchesBCMath(t *testing.T) {
	tests := []struct {
		name, amount, rate, want string
	}{
		{"same currency", "100", "1", "100.00"},
		{"usd to cny", "100", "7.25", "13.79"},
		{"repeating decimal", "10", "3", "3.33"},
		{"truncate not round", "1.999", "1", "1.99"},
		{"negative truncates toward zero", "-1.999", "1", "-1.99"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ConvertToBaseCurrency(tt.amount, tt.rate)
			if err != nil {
				t.Fatal(err)
			}
			if got.String() != tt.want {
				t.Fatalf("got %s, want %s", got, tt.want)
			}
		})
	}
}

func TestSumUsesFixedPoint(t *testing.T) {
	got, err := Sum("100", "20.45", "3", "0.009")
	if err != nil {
		t.Fatal(err)
	}
	if got.String() != "123.45" {
		t.Fatalf("got %s", got)
	}
}

func TestRejectsInvalidAndZeroRate(t *testing.T) {
	if _, err := Parse("not-money"); err == nil {
		t.Fatal("expected invalid decimal error")
	}
	if _, err := ConvertToBaseCurrency("1", "0"); err == nil {
		t.Fatal("expected zero exchange rate error")
	}
}
