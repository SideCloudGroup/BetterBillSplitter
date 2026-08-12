// Package settlement computes pairwise and netted debt transfers using exact
// fixed-point amounts.
package settlement

import (
	"fmt"

	"github.com/SideCloudGroup/BetterBillSplitter/internal/money"
)

type User struct {
	ID       int64
	Username string
}

type Item struct {
	UserID    int64
	Initiator int64
	Amount    string
}

type Debts map[string]map[string]money.Amount
type Unpaid map[int64]map[int64]money.Amount

func AggregateUnpaid(items []Item) (Unpaid, error) {
	result := make(Unpaid)
	for _, item := range items {
		amount, err := money.Parse(item.Amount)
		if err != nil {
			return nil, fmt.Errorf("aggregate item for user %d: %w", item.UserID, err)
		}
		if result[item.UserID] == nil {
			result[item.UserID] = make(map[int64]money.Amount)
		}
		result[item.UserID][item.Initiator] += amount
	}
	return result, nil
}

// Compute returns the netted transfer plan and the pairwise-offset stage.
// users is a slice rather than a map because the legacy PHP algorithm is
// insertion-order-sensitive; preserving query order keeps results stable.
func Compute(unpaid Unpaid, users []User) (optimized Debts, stage1 Debts) {
	stage1 = make(Debts)
	if len(users) == 0 {
		return make(Debts), stage1
	}
	for i, payer := range users {
		for j := i + 1; j < len(users); j++ {
			payee := users[j]
			diff := get(unpaid, payer.ID, payee.ID) - get(unpaid, payee.ID, payer.ID)
			switch {
			case diff > 0:
				add(stage1, payer.Username, payee.Username, diff)
			case diff < 0:
				add(stage1, payee.Username, payer.Username, -diff)
			}
		}
	}
	return Optimize(stage1, users), stage1
}

func Optimize(debts Debts, users []User) Debts {
	balances := make(map[string]money.Amount, len(users))
	for _, user := range users {
		balances[user.Username] = 0
	}
	for debtor, creditors := range debts {
		for creditor, amount := range creditors {
			balances[debtor] -= amount
			balances[creditor] += amount
		}
	}

	type entry struct {
		name   string
		amount money.Amount
	}
	creditors := make([]entry, 0)
	debtors := make([]entry, 0)
	for _, user := range users {
		balance := balances[user.Username]
		if balance > 0 {
			creditors = append(creditors, entry{user.Username, balance})
		} else if balance < 0 {
			debtors = append(debtors, entry{user.Username, -balance})
		}
	}

	result := make(Debts)
	for i, j := 0, 0; i < len(creditors) && j < len(debtors); {
		amount := creditors[i].amount
		if debtors[j].amount < amount {
			amount = debtors[j].amount
		}
		add(result, debtors[j].name, creditors[i].name, amount)
		creditors[i].amount -= amount
		debtors[j].amount -= amount
		if creditors[i].amount == 0 {
			i++
		}
		if debtors[j].amount == 0 {
			j++
		}
	}
	return result
}

func get(unpaid Unpaid, userID, initiator int64) money.Amount {
	if unpaid[userID] == nil {
		return 0
	}
	return unpaid[userID][initiator]
}

func add(debts Debts, debtor, creditor string, amount money.Amount) {
	if amount <= 0 {
		return
	}
	if debts[debtor] == nil {
		debts[debtor] = make(map[string]money.Amount)
	}
	debts[debtor][creditor] = amount
}
