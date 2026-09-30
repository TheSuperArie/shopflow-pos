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

/** Running order number per network: 1001, 1002, ... */
export async function nextOrderNumber(tenantEmail) {
  try {
    const last = await base44.entities.SupplyOrder.filter({ tenant_email: tenantEmail }, '-created_date', 20);
    const max = last.reduce((m, o) => Math.max(m, parseInt(o.order_number, 10) || 0), 1000);
    return String(max + 1);
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
