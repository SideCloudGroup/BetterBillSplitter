// Package money implements the application's fixed two-decimal monetary rules.
// It deliberately truncates extra precision, matching PHP bcmath with scale=2.
package money

import (
	"errors"
	"fmt"
	"math/big"
	"strings"
)

const Scale int64 = 100

// Amount stores a monetary value as integer cents. This avoids binary
// floating-point drift in debt aggregation and settlement.
type Amount int64

func Parse(value string) (Amount, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, errors.New("money: empty amount")
	}
	rat, ok := new(big.Rat).SetString(value)
	if !ok {
		return 0, fmt.Errorf("money: invalid decimal %q", value)
	}
	return ratToAmount(rat)
}

func MustParse(value string) Amount {
	amount, err := Parse(value)
	if err != nil {
		panic(err)
	}
	return amount
}

// ConvertToBaseCurrency divides amount by exchangeRate and truncates the
// result to two decimals, exactly like bcdiv(amount, exchangeRate, 2).
func ConvertToBaseCurrency(amount, exchangeRate string) (Amount, error) {
	left, ok := new(big.Rat).SetString(strings.TrimSpace(amount))
	if !ok {
		return 0, fmt.Errorf("money: invalid amount %q", amount)
	}
	right, ok := new(big.Rat).SetString(strings.TrimSpace(exchangeRate))
	if !ok {
		return 0, fmt.Errorf("money: invalid exchange rate %q", exchangeRate)
	}
	if right.Sign() == 0 {
		return 0, errors.New("money: exchange rate must not be zero")
	}
	return ratToAmount(new(big.Rat).Quo(left, right))
}

func Sum(values ...string) (Amount, error) {
	var total Amount
	for _, value := range values {
		amount, err := Parse(value)
		if err != nil {
			return 0, err
		}
		total += amount
	}
	return total, nil
}

func (a Amount) String() string {
	negative := a < 0
	value := int64(a)
	if negative {
		value = -value
	}
	result := fmt.Sprintf("%d.%02d", value/Scale, value%Scale)
	if negative {
		return "-" + result
	}
	return result
}

func ratToAmount(value *big.Rat) (Amount, error) {
	scaled := new(big.Rat).Mul(value, big.NewRat(Scale, 1))
	cents := new(big.Int).Quo(scaled.Num(), scaled.Denom()) // toward zero, like bcmath
	if !cents.IsInt64() {
		return 0, errors.New("money: amount is outside int64 range")
	}
	return Amount(cents.Int64()), nil
}
