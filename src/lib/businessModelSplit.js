/**
 * Splits network money between the two business models:
 * OWN_STOCK branches — line cost goes to the importer, (sale − cost) is private profit.
 * IMPORTER branches (default) — the whole sale belongs to the importer.
 */
export const isOwnStock = (branch) => branch?.business_model === 'OWN_STOCK';

const saleCost = (sale) =>
  (sale.items || []).reduce((s, i) => s + (Number(i.cost_price) || 0) * (Number(i.quantity) || 1), 0);

/** Which side an expense is charged to: { side: 'importer'|'private'|null, branch, networkLevel }. */
export function makeExpenseSide(branches, tenantEmail) {
  const byId = Object.fromEntries(branches.map(b => [b.id, b]));
  const byStation = Object.fromEntries(branches.map(b => [b.station_email, b]));
  return (e) => {
    if (e.network_level === true) {
      return { side: e.tenant_email === tenantEmail ? 'importer' : null, branch: null, networkLevel: true };
    }
    const b = byId[e.branch_id] || byStation[e.created_by] || null;
    if (!b && e.created_by !== tenantEmail) return { side: null, branch: null };
    return { side: isOwnStock(b) ? 'private' : 'importer', branch: b };
  };
}

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
  const sideOf = makeExpenseSide(branches, tenantEmail);
  expenses.forEach(e => {
    const amt = Number(e.amount) || 0;
    const { side } = sideOf(e);
    if (side === 'private') privateExp += amt; else if (side === 'importer') importerExp += amt;
  });

  return { total, importer, priv, importerExp, privateExp, missingCost };
}