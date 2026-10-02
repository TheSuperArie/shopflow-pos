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

export const fetchWarehouseReservations = (warehouseId) =>
  base44.entities.StockReservation.filter({ scope: 'WAREHOUSE', warehouse_id: warehouseId }, undefined, 5000);

export const newOpKey = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

/** Every stock change runs on the server (permission check, fresh quantities, one-time keys). */
export async function stockOps(action, payload) {
  try {
    const res = await base44.functions.invoke('stockOps', { action, ...payload });
    return res.data;
  } catch (err) {
    throw new Error(err?.data?.error || err?.message || 'השרת לא ענה');
  }
}