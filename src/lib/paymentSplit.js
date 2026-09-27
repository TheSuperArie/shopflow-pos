/**
 * How much of a sale was paid by each method.
 * A split sale ('מזומן + אשראי') counts toward BOTH methods by its real portions,
 * so cash + credit always adds up to the total revenue.
 */
export const SPLIT_METHOD = 'מזומן + אשראי';

export const cashPortion = (sale) => {
  if (sale.payment_method === 'מזומן') return Number(sale.total) || 0;
  if (sale.payment_method === SPLIT_METHOD) return Number(sale.cash_amount) || 0;
  return 0;
};

export const creditPortion = (sale) => {
  if (sale.payment_method === 'אשראי') return Number(sale.total) || 0;
  if (sale.payment_method === SPLIT_METHOD) {
    const credit = Number(sale.credit_amount);
    return credit > 0 ? credit : Math.max(0, (Number(sale.total) || 0) - (Number(sale.cash_amount) || 0));
  }
  return 0;
};
