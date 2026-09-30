import { base44 } from '@/api/base44Client';

/**
 * Receipt numbers: every branch has its own range, running inside it.
 *   branch 1 → 1001000, 1001001, ...   branch 2 → 2001000, ...   branch 3 → 3001000, ...
 * A branch's number (receipt_prefix) is its order of joining the network, saved on the branch
 * the first time it's needed so it never changes. A store without a network uses range 1.
 */
export const RANGE = 1000000;
export const RANGE_START = 1000;
export const rangeStart = (prefix) => prefix * RANGE + RANGE_START;

const scopeOf = (sale, userEmail) => (sale?.branch_id
  ? { branch_id: sale.branch_id }
  : { station_email: sale?.station_email || userEmail });

// Old receipts used "YYMMDD-XXXX" — only plain numbers take part in the running count
const numeric = (r) => (/^\d+$/.test(String(r?.receipt_number || '')) ? parseInt(r.receipt_number, 10) : 0);

async function branchPrefix(branchId) {
  if (!branchId) return 1;
  try {
    const branch = await base44.entities.Branch.get(branchId);
    if (!branch) return 1;
    if (Number(branch.receipt_prefix) > 0) return Number(branch.receipt_prefix);
    if (!branch.tenant_email) return 1;

    // Order of joining the network (branches that already have a number keep it)
    const all = await base44.entities.Branch.filter({ tenant_email: branch.tenant_email }, 'created_date', 500);
    const taken = new Set(all.map(b => Number(b.receipt_prefix)).filter(n => n > 0));
    let prefix = all.findIndex(b => b.id === branch.id) + 1 || all.length + 1;
    while (taken.has(prefix)) prefix += 1;
    try { await base44.entities.Branch.update(branch.id, { receipt_prefix: prefix }); } catch { /* computed again next time */ }
    return prefix;
  } catch {
    return 1;
  }
}

async function nextNumber(scope, prefix) {
  const last = await base44.entities.Receipt.filter(scope, '-created_date', 50);
  const start = rangeStart(prefix);
  // Continue inside this branch's own range
  const max = last.map(numeric).filter(n => n >= start && n < (prefix + 1) * RANGE).reduce((m, n) => Math.max(m, n), start - 1);
  return max + 1;
}

/**
 * The receipt of a sale. A sale gets one receipt number only — printing or sending again
 * reuses it. A new receipt takes the next number in its branch's range.
 *  fields: customer_name, customer_email, items, total, payment_method, ...
 */
export async function getOrCreateReceipt(sale, fields = {}, userEmail) {
  const [existing] = await base44.entities.Receipt.filter({ sale_id: sale.id }, 'created_date', 1);
  if (existing) {
    const patch = {};
    if (fields.customer_name && fields.customer_name !== existing.customer_name) patch.customer_name = fields.customer_name;
    if (fields.customer_email && fields.customer_email !== existing.customer_email) patch.customer_email = fields.customer_email;
    if (Object.keys(patch).length) {
      try { await base44.entities.Receipt.update(existing.id, patch); } catch { /* keep the old details */ }
    }
    return { ...existing, ...patch };
  }

  const scope = scopeOf(sale, userEmail);
  const prefix = await branchPrefix(sale.branch_id);
  const n = await nextNumber(scope, prefix);
  const receipt = await base44.entities.Receipt.create({
    ...fields,
    sale_id: sale.id,
    receipt_number: String(n),
    ...(sale.branch_id ? { branch_id: sale.branch_id } : {}),
    ...(scope.station_email ? { station_email: scope.station_email } : {}),
  });

  // Two registers took the same number at the same moment → the later one moves to the next free number
  try {
    const same = await base44.entities.Receipt.filter({ ...scope, receipt_number: String(n) }, 'created_date', 5);
    if (same.length > 1 && same[0].id !== receipt.id) {
      const next = String(await nextNumber(scope, prefix));
      await base44.entities.Receipt.update(receipt.id, { receipt_number: next });
      return { ...receipt, receipt_number: next };
    }
  } catch { /* the number stays as created */ }

  return receipt;
}
