/** Classification of an expense into one of the three display sections. Display only — no automation. */
export const EXPENSE_TYPES = ['קבועה', 'חד פעמית'];

/** Returns 'employee' | 'fixed' | 'onetime'. Employee-related always wins. */
export function classifyExpense(exp) {
  if (exp.employee_payment_id || exp.employee_id || exp.category === 'שכר עובדים') return 'employee';
  return exp.expense_type === 'קבועה' ? 'fixed' : 'onetime';
}

export function groupExpenses(expenses = []) {
  const groups = { fixed: [], onetime: [], employee: [] };
  expenses.forEach(e => groups[classifyExpense(e)].push(e));
  return groups;
}

export const sumExpenses = (list = []) => list.reduce((s, e) => s + (Number(e.amount) || 0), 0);