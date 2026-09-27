/**
 * Splits network money between the two business models:
 * OWN_STOCK branches — line cost goes to the importer, (sale − cost) is private profit.
 * IMPORTER branches (default) — the whole sale belongs to the importer.
 */
export const isOwnStock = (branch) => branch?.business_model === 'OWN_STOCK';

const saleCost = (sale) =>
  (sale.items || []).reduce((s, i) => s + (Number(i.cost_price) || 0) * (Number(i.quantity) || 1), 0);

export function splitByBusinessModel({ sales, expenses, branches, tenantEmail }) {
  const byId = Object.fromEntries(branches.map(b => [b.id, b]));
  const byStation = Object.fromEntries(branches.map(b => [b.station_email, b]));
  const branchOf = (r, creator) => byId[r.branch_id] || byStation[creator] || null;

  let total = 0, importer = 0, priv = 0, missingCost = 0;
  sales.forEach(s => {
    const t = Number(s.total) || 0;
    total += t;
    if (isOwnStock(branchOf(s, s.created_by))) {
      const cost = saleCost(s);
      importer += cost;
      priv += t - cost;
      if ((s.items || []).some(i => !(Number(i.cost_price) > 0))) missingCost += 1;
    } else {
      importer += t;
    }
  });

  let importerExp = 0, privateExp = 0;
  expenses.forEach(e => {
    const amt = Number(e.amount) || 0;
    if (e.network_level === true) { if (e.tenant_email === tenantEmail) importerExp += amt; return; }
    const b = branchOf(e, e.created_by);
    if (!b && e.created_by !== tenantEmail) return;
    if (isOwnStock(b)) privateExp += amt; else importerExp += amt;
  });

  return { total, importer, priv, importerExp, privateExp, missingCost };
}