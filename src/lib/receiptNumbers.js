import { base44 } from '@/api/base44Client';

/** Running receipt numbers per branch / store: 1001, 1002, ... */
export const FIRST_RECEIPT_NUMBER = 1001;

const scopeOf = (sale, userEmail) => (sale?.branch_id
  ? { branch_id: sale.branch_id }
  : { station_email: sale?.station_email || userEmail });

// Old receipts used "YYMMDD-XXXX" — only plain numbers take part in the running count
const numeric = (r) => (/^\d+$/.test(String(r?.receipt_number || '')) ? parseInt(r.receipt_number, 10) : 0);

async function maxNumber(scope) {
  const last = await base44.entities.Receipt.filter(scope, '-created_date', 50);
  return last.reduce((m, r) => Math.max(m, numeric(r)), FIRST_RECEIPT_NUMBER - 1);
}

/**
 * The receipt of a sale. A sale gets one receipt number only — printing or sending again
 * reuses it. A new receipt takes the next running number of its branch.
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
  const n = (await maxNumber(scope)) + 1;
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
      const next = String((await maxNumber(scope)) + 1);
      await base44.entities.Receipt.update(receipt.id, { receipt_number: next });
      return { ...receipt, receipt_number: next };
    }
  } catch { /* the number stays as created */ }

  return receipt;
}
