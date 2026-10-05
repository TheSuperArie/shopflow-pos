import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { parseServerDate } from '@/lib/serverDate';

/**
 * Supply flow: branch → network → warehouse → network → branch.
 * No money anywhere in this flow — quantities only.
 */
export const SUPPLY_STATUS = {
  SENT_TO_NETWORK:   { label: 'ממתינה לרשת',  color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  SENT_TO_WAREHOUSE: { label: 'נשלחה למחסן',  color: 'bg-blue-100 text-blue-800 border-blue-300' },
  PICKING:           { label: 'בליקוט',       color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  PACKED:            { label: 'נארזה במחסן',  color: 'bg-teal-100 text-teal-800 border-teal-300' },
  READY:             { label: 'מוכנה מהמחסן', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  SENT_TO_BRANCH:    { label: 'בדרך לסניף',   color: 'bg-purple-100 text-purple-800 border-purple-300' },
  RECEIVED:          { label: 'נקלטה בסניף',  color: 'bg-gray-100 text-gray-700 border-gray-300' },
  CANCELLED:         { label: 'בוטלה',        color: 'bg-red-100 text-red-700 border-red-300' },
};

export const nowIso = () => new Date().toISOString();

export const formatOrderDate = (value, withTime = false) => {
  const d = value ? parseServerDate(value) : null;
  return d ? format(d, withTime ? 'dd/MM/yy HH:mm' : 'dd/MM/yy') : '';
};

/** "15 / כחול / אמריקאי" — the dimension values of a variant. */
export const variantLabel = (variant) =>
  Object.values(variant?.dimensions || {})
    .filter(v => v !== null && v !== undefined && v !== '')
    .join(' / ');

/** The quantity a line currently stands at (a network edit wins over the branch request). */
export const lineQty = (item) => Number(item?.qty ?? item?.requested_qty ?? 0);

export const orderTotals = (items = []) => ({
  lines: items.length,
  units: items.reduce((s, i) => s + lineQty(i), 0),
});

/**
 * Running order number per network: 1001, 1002, ...
 * Computed on the server — a branch can only read its own orders, not the whole network's.
 */
export async function nextOrderNumber(tenantEmail) {
  try {
    const res = await base44.functions.invoke('supplyOps', { action: 'nextOrderNumber', tenant_email: tenantEmail });
    if (res.data?.order_number) return String(res.data.order_number);
    throw new Error('no number');
  } catch {
    return String(Date.now()).slice(-6);
  }
}

/** Joins the branch catalog into flat, sortable rows for the order table. */
export function buildCatalogRows(variants = [], groups = [], categories = []) {
  const groupById = new Map(groups.map(g => [g.id, g]));
  const catById = new Map(categories.map(c => [c.id, c]));
  return variants
    .map(v => {
      const group = groupById.get(v.group_id);
      if (!group || group.is_active === false) return null;
      const cat = catById.get(group.category_id);
      const parent = cat?.parent_id ? catById.get(cat.parent_id) : null;
      return {
        variant_id: v.id,
        group_id: v.group_id,
        sku: v.sku || '',
        barcode: v.barcode || '',
        group_barcode: group.barcode || '',
        carton_number: v.carton_number || '',
        carton_barcode: v.carton_barcode || '',
        product_name: group.name || '',
        variant_label: variantLabel(v),
        category_name: parent ? `${parent.name} › ${cat.name}` : (cat?.name || ''),
        branch_stock: Number(v.stock || 0),
      };
    })
    .filter(Boolean);
}

const collator = new Intl.Collator('he', { numeric: true, sensitivity: 'base' });

export function sortRows(rows, key, dir) {
  const mult = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    const primary = typeof x === 'number' && typeof y === 'number'
      ? x - y
      : collator.compare(String(x ?? ''), String(y ?? ''));
    if (primary !== 0) return primary * mult;
    // Readable tie-break: product, then its sizes
    return collator.compare(a.product_name, b.product_name) || collator.compare(a.variant_label, b.variant_label);
  });
}

/** Network display details shown at the bottom of every order. */
export async function fetchNetworkDetails(tenantEmail) {
  if (!tenantEmail) return null;
  const [settings] = await base44.entities.AppSettings.filter({ created_by: tenantEmail }, undefined, 1);
  return {
    name: settings?.network_name || settings?.store_name || 'הרשת',
    email: tenantEmail,
  };
}

/* ── Picking ── */

/** Barcode printed on the order document — prefixed so it never collides with a product SKU. */
export const orderBarcodeValue = (order) => `SO${order?.order_number || ''}`;

/** Percent of the ordered quantity that was picked (null when nothing was ordered). */
export const pickedPercent = (item) => {
  const q = lineQty(item);
  if (!q) return null;
  return Math.round((Number(item.picked_qty || 0) / q) * 100);
};

/** Picked more than ordered, or a line that wasn't in the order at all → shown in red. */
export const isOverPicked = (item) => !!item.extra || Number(item.picked_qty || 0) > lineQty(item);

/**
 * Same matching rules as the POS scanner: SKU or variant barcode (full, or last 4 digits),
 * then the product's general barcode (may match several sizes).
 * rows need: sku, barcode, group_barcode. Returns every matching row.
 */
export function matchScannedCode(code, rows = []) {
  const c = String(code || '').trim().toLowerCase();
  if (!c) return [];
  const eq = (v) => {
    const s = String(v || '').toLowerCase();
    return !!s && (s === c || s.slice(-4) === c);
  };
  const exact = rows.filter(r => eq(r.sku) || eq(r.barcode));
  if (exact.length) return exact;
  return rows.filter(r => eq(r.group_barcode));
}

/* ── Carton labels (as they come from the factory) ──
 * The label barcode = the shirt's SKU + "9" + units in the carton, zero-padded to 15 characters:
 *   1851S14 + 9 + 0000012  → 1851S1490000012  (12 shirts of 1851S14)
 *   14423511 + 9 + 000012  → 144235119000012  (12 shirts of 14423511)
 * A carton barcode saved on the variant (carton_barcode) always wins over the rule. */
export const CARTON_CODE_LENGTH = 15;

const cartonUnitsFor = (code, prefix) => {
  const p = String(prefix || '').trim().toLowerCase();
  if (!p || code.length <= p.length + 1 || !code.startsWith(p) || code[p.length] !== '9') return null;
  const rest = code.slice(p.length + 1);
  if (!/^\d+$/.test(rest)) return null;
  const units = parseInt(rest, 10);
  return units > 0 && units < 10000 ? units : null;
};

/**
 * Rows a scanned carton label belongs to → [{ row, units }] (units = shirts per carton, null if unknown).
 * Rows need: sku, barcode, carton_barcode. With the rule, the longest matching SKU wins
 * (so 1851S145's carton is never read as 1851S14).
 */
export function matchCartonCode(code, rows = []) {
  const c = String(code || '').trim().toLowerCase();
  if (!c) return [];
  const saved = rows.filter(r => r.carton_barcode && String(r.carton_barcode).trim().toLowerCase() === c);
  if (saved.length) {
    return saved.map(r => ({ row: r, units: cartonUnitsFor(c, r.sku) || cartonUnitsFor(c, r.barcode) }));
  }
  if (c.length !== CARTON_CODE_LENGTH) return [];
  let best = 0;
  let hits = [];
  rows.forEach(r => {
    [r.sku, r.barcode].forEach(prefix => {
      const units = cartonUnitsFor(c, prefix);
      if (!units) return;
      const len = String(prefix).trim().length;
      if (len > best) { best = len; hits = []; }
      if (len === best && !hits.some(h => h.row === r)) hits.push({ row: r, units });
    });
  });
  return hits;
}

/** "2 קרטונים + 6 בודדות" for a quantity, given the units per carton ('' when unknown). */
export function cartonBreakdown(units, perCarton) {
  const n = Math.max(0, Number(units) || 0);
  const size = Number(perCarton) || 0;
  if (!size) return '';
  const full = Math.floor(n / size);
  const rest = n % size;
  const parts = [];
  if (full) parts.push(full === 1 ? 'קרטון אחד' : `${full} קרטונים`);
  if (rest) parts.push(rest === 1 ? 'יחידה אחת' : `${rest} בודדות`);
  return parts.join(' + ') || '0';
}

/* ── Draft of the branch's next order (kept on the device until sent) ── */

export const supplyDraftKey = (branchId) => `supply-draft:${branchId}`;

/**
 * Adds quantities to the branch's unsent order draft (used from the inventory / shortages pages).
 * A size already in the draft keeps the larger of the two quantities.
 */
export function addToSupplyDraft(branchId, quantities) {
  const key = supplyDraftKey(branchId);
  let draft = { quantities: {}, notes: '' };
  try { draft = JSON.parse(localStorage.getItem(key) || 'null') || draft; } catch { /* corrupt draft → start fresh */ }
  const merged = { ...(draft.quantities || {}) };
  Object.entries(quantities).forEach(([id, qty]) => {
    if (qty > 0) merged[id] = Math.max(Number(merged[id] || 0), Number(qty));
  });
  localStorage.setItem(key, JSON.stringify({ ...draft, quantities: merged }));
  return Object.keys(quantities).length;
}
