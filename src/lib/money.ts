export function formatMoney(amount: number): string {
  return amount < 0 ? `-$${-amount}` : `$${amount}`;
}

export function sum(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}
