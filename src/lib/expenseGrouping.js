/** Classification of an expense into one of the three display sections. Display only — no automation. */
export const EXPENSE_TYPES = ['קבועה', 'חד פעמית'];

/**
 * Returns 'employee' | 'fixed' | 'onetime'.
 * "תשלומי עובדים" = only payments recorded on the employees page (employee_payment_id),
 * plus legacy "שכר עובדים" records with no employee_id. Expenses an employee records in
 * the staff portal (employee_id only) are regular branch expenses.
 */
export function classifyExpense(exp) {
  if (exp.employee_payment_id || (exp.category === 'שכר עובדים' && !exp.employee_id)) return 'employee';
  return exp.expense_type === 'קבועה' ? 'fixed' : 'onetime';
}

export function groupExpenses(expenses = []) {
  const groups = { fixed: [], onetime: [], employee: [] };
  expenses.forEach(e => groups[classifyExpense(e)].push(e));
  return groups;
}

export const sumExpenses = (list = []) => list.reduce((s, e) => s + (Number(e.amount) || 0), 0);