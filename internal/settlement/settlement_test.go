package settlement

import (
	"math/rand"
	"reflect"
	"testing"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/money"
)

func TestAggregateUnpaid(t *testing.T) {
	got, err := AggregateUnpaid([]Item{
		{UserID: 1, Initiator: 2, Amount: "10.50"},
		{UserID: 1, Initiator: 2, Amount: "5"},
		{UserID: 2, Initiator: 1, Amount: "3.25"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got[1][2].String() != "15.50" || got[2][1].String() != "3.25" {
		t.Fatalf("unexpected aggregation: %#v", got)
	}
}

func TestComputeLegacyCases(t *testing.T) {
	users := []User{{1, "alice"}, {2, "bob"}, {3, "carol"}}
	tests := []struct {
		name   string
		unpaid Unpaid
		want   Debts
	}{
		{
			name:   "simple debt",
			unpaid: Unpaid{1: {2: money.MustParse("100")}},
			want:   Debts{"alice": {"bob": money.MustParse("100")}},
		},
		{
			name: "mutual offset",
			unpaid: Unpaid{
				1: {2: money.MustParse("50")},
				2: {1: money.MustParse("30")},
			},
			want: Debts{"alice": {"bob": money.MustParse("20")}},
		},
		{
			name: "three users",
			unpaid: Unpaid{
				2: {1: money.MustParse("30")},
				3: {1: money.MustParse("20"), 2: money.MustParse("10")},
			},
			want: Debts{
				"bob":   {"alice": money.MustParse("20")},
				"carol": {"alice": money.MustParse("30")},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			optimized, _ := Compute(tt.unpaid, users)
			if !reflect.DeepEqual(optimized, tt.want) {
				t.Fatalf("got %#v, want %#v", optimized, tt.want)
			}
		})
	}
}

func TestOptimizationPreservesEveryNetBalance(t *testing.T) {
	users := []User{{1, "u1"}, {2, "u2"}, {3, "u3"}}
	unpaid := Unpaid{
		1: {2: money.MustParse("100"), 3: money.MustParse("25.50")},
		2: {1: money.MustParse("40"), 3: money.MustParse("10")},
		3: {1: money.MustParse("5")},
	}
	optimized, stage1 := Compute(unpaid, users)
	if !reflect.DeepEqual(netBalances(optimized), netBalances(stage1)) {
		t.Fatalf("net balances changed: optimized=%v stage1=%v", netBalances(optimized), netBalances(stage1))
	}
}

func TestRandomGraphsRemainConservativeAndBounded(t *testing.T) {
	rng := rand.New(rand.NewSource(20260812))
	for size := 2; size <= 20; size++ {
		users := make([]User, size)
		for i := range users {
			users[i] = User{ID: int64(i + 1), Username: "user-" + string(rune('A'+i))}
		}
		for iteration := 0; iteration < 200; iteration++ {
			unpaid := make(Unpaid)
			for i := range users {
				unpaid[users[i].ID] = make(map[int64]money.Amount)
				for j := range users {
					if i != j {
						unpaid[users[i].ID][users[j].ID] = money.Amount(rng.Intn(1_000_000))
					}
				}
			}
			optimized, stage1 := Compute(unpaid, users)
			if !reflect.DeepEqual(netBalances(optimized), netBalances(stage1)) {
				t.Fatalf("size=%d iteration=%d: balances changed", size, iteration)
			}
			if transfers(optimized) > size-1 {
				t.Fatalf("size=%d iteration=%d: got %d transfers, want <= %d", size, iteration, transfers(optimized), size-1)
			}
			for _, creditors := range optimized {
				for _, amount := range creditors {
					if amount <= 0 {
						t.Fatalf("non-positive transfer: %d", amount)
					}
				}
			}
		}
	}
}

func netBalances(debts Debts) map[string]money.Amount {
	result := make(map[string]money.Amount)
	for debtor, creditors := range debts {
		for creditor, amount := range creditors {
			result[debtor] -= amount
			result[creditor] += amount
		}
	}
	for name, amount := range result {
		if amount == 0 {
			delete(result, name)
		}
	}
	return result
}

func transfers(debts Debts) int {
	total := 0
	for _, creditors := range debts {
		total += len(creditors)
	}
	return total
}
