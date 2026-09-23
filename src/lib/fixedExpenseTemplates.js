import { format } from 'date-fns';

/** { template_id: latest expense date recorded from it } */
export const lastUsedByTemplate = (expenses = []) => expenses.reduce((map, e) => {
  if (e.template_id && e.date && (!map[e.template_id] || e.date > map[e.template_id])) map[e.template_id] = e.date;
  return map;
}, {});

/** Form fields filled from a template — the amount stays editable before saving. */
export const templateToExpense = (t) => ({
  template_id: t.id,
  description: t.description || t.name,
  amount: t.default_amount,
  category: t.category,
  custom_category: t.custom_category || '',
  expense_type: 'קבועה',
});

export const isThisMonth = (date) => !!date && date.startsWith(format(new Date(), 'yyyy-MM'));