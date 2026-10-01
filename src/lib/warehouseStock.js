import { base44 } from '@/api/base44Client';
import { buildCatalogRows } from '@/lib/supplyOrders';

/**
 * Warehouse stock — kept per ORIGINAL network variant (ProductVariant created by the network owner),
 * or per warehouse-local product. Every change is recorded as a WarehouseStockMovement.
 */
export const MOVEMENT_TYPES = {
  RECEIPT: { label: 'קליטה', color: 'bg-green-100 text-green-700' },
  PICK: { label: 'ליקוט להזמנה', color: 'bg-indigo-100 text-indigo-700' },
  COUNT: { label: 'ספירת מלאי', color: 'bg-amber-100 text-amber-700' },
  ADJUST: { label: 'תיקון ידני', color: 'bg-gray-100 text-gray-700' },
};

export const stockKey = (r) => (r.variant_id ? `v:${r.variant_id}` : `l:${r.local_product_id}`);
const owner = (w) => ({ warehouse_id: w.id, tenant_email: w.tenant_email, station_email: w.station_email });

export const fetchWarehouseStock = (warehouseId) =>
  base44.entities.WarehouseStock.filter({ warehouse_id: warehouseId }, undefined, 5000);

export const fetchWarehouseMovements = (warehouseId, limit = 1000) =>
  base44.entities.WarehouseStockMovement.filter({ warehouse_id: warehouseId }, '-created_date', limit);

export const fetchLocalProducts = (warehouseId) =>
  base44.entities.WarehouseLocalProduct.filter({ warehouse_id: warehouseId }, '-created_date', 1000);

/** The network catalog = products the network owner created for his own branch (or unstamped). */
export async function fetchNetworkCatalogRows(tenantEmail) {
  if (!tenantEmail) return [];
  const [branches, variants, groups, categories] = await Promise.all([
    base44.entities.Branch.filter({ tenant_email: tenantEmail, station_email: tenantEmail }),
    base44.entities.ProductVariant.filter({ created_by: tenantEmail }, undefined, 5000),
    base44.entities.ProductGroup.filter({ created_by: tenantEmail }, undefined, 5000),
    base44.entities.Category.filter({ created_by: tenantEmail }, undefined, 2000),
  ]);
  const own = new Set(branches.map(b => b.id));
  const mine = (r) => !r.branch_id || own.has(r.branch_id);
  return buildCatalogRows(variants.filter(mine), groups.filter(mine), categories);
}

/**
 * Applies quantity changes and records one movement per change.
 * changes: [{ variant_id?, local_product_id?, delta, product_name, variant_label, category_name, sku }]
 * movement: shared movement fields (type, order_id, receipt_id, supplier_name, notes, performed_by...)
 */
export async function applyStockChanges(warehouse, changes, movement) {
  const real = changes.filter(c => Number(c.delta) !== 0 || movement.type === 'COUNT');
  if (!real.length) return;
  const stock = await fetchWarehouseStock(warehouse.id);
  const byKey = new Map(stock.map(s => [stockKey(s), s]));
  const date = new Date().toISOString();
  const movements = [];
  for (const c of real) {
    const delta = Number(c.delta);
    const existing = byKey.get(stockKey(c));
    let row;
    if (existing) {
      row = await base44.entities.WarehouseStock.update(existing.id, { qty: Number(existing.qty || 0) + delta });
      row = { ...existing, ...row, qty: Number(existing.qty || 0) + delta };
    } else {
      row = await base44.entities.WarehouseStock.create({
        ...owner(warehouse),
        variant_id: c.variant_id || null,
        local_product_id: c.local_product_id || null,
        product_name: c.product_name || '',
        variant_label: c.variant_label || '',
        category_name: c.category_name || '',
        sku: c.sku || '',
        qty: delta,
      });
    }
    byKey.set(stockKey(c), row);
    movements.push({
      ...owner(warehouse),
      ...movement,
      stock_id: row.id,
      variant_id: c.variant_id || null,
      local_product_id: c.local_product_id || null,
      product_name: c.product_name || row.product_name || '',
      variant_label: c.variant_label || row.variant_label || '',
      qty_change: delta,
      qty_after: row.qty,
      date,
    });
  }
  await base44.entities.WarehouseStockMovement.bulkCreate(movements);
}

/** Manual count / correction: sets the quantity to an exact value (recorded as the difference). */
export function setStockQty(warehouse, item, newQty, current, { type = 'COUNT', notes, performed_by }) {
  return applyStockChanges(warehouse, [{ ...item, delta: Number(newQty) - Number(current || 0) }], { type, notes, performed_by });
}

/**
 * Picking finished (also after "ערוך ליקוט"): deducts from warehouse stock only the difference
 * between picked_qty and what was already deducted for each line. Returns the items with
 * network_variant_id + warehouse_deducted stamped, and the stock changes to apply.
 */
export async function planPickDeduction(items) {
  const missing = items.filter(i => i.variant_id && !i.network_variant_id).map(i => i.variant_id);
  const variants = missing.length
    ? await base44.entities.ProductVariant.filter({ id: { $in: [...new Set(missing)] } }, undefined, 2000)
    : [];
  const sourceOf = new Map(variants.map(v => [v.id, v.source_id || v.id]));
  const changes = [];
  const nextItems = items.map(it => {
    if (!it.variant_id) return it;
    const networkId = it.network_variant_id || sourceOf.get(it.variant_id) || it.variant_id;
    const picked = Number(it.picked_qty || 0);
    const delta = picked - Number(it.warehouse_deducted || 0);
    if (delta !== 0) {
      changes.push({
        variant_id: networkId, delta: -delta,
        product_name: it.product_name, variant_label: it.variant_label, category_name: it.category_name, sku: it.sku,
      });
    }
    return { ...it, network_variant_id: networkId, warehouse_deducted: picked };
  });
  return { nextItems, changes };
}