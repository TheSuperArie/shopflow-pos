/**
 * Automatic ownership stamping (station_email / tenant_email) for every newly
 * created store record. Metadata only — never overrides values the caller set,
 * never adds branch_id, and never blocks a write if resolution fails.
 */
export const STAMPED_ENTITIES = new Set([
  'Sale', 'Expense', 'Return', 'Credit', 'Category', 'ProductGroup', 'ProductVariant',
  'FlexibleVariant', 'VariantDimension', 'Supplier', 'SupplierOrder', 'SupplierPayment',
  'OrderTicket', 'StockRequest', 'StockUpdate', 'Receipt', 'CashCount', 'Product',
  'AppSettings', 'FixedExpenseTemplate', 'BranchVariantStock', 'OwnerWithdrawal',
]);

const isActive = (b) => !b.status || b.status === 'ACTIVE';

export function createOwnershipResolver(client) {
  let ctxPromise = null;
  const branchById = new Map();

  const loadCtx = async () => {
    const me = await client.auth.me();
    const [stations, owned] = await Promise.all([
      client.entities.Branch.filter({ station_email: me.email }),
      client.entities.Branch.filter({ tenant_email: me.email }, undefined, 1),
    ]);
    const active = stations.filter(isActive);
    return { email: me.email, station: active.length === 1 ? active[0] : null, isMaster: owned.length > 0 };
  };

  const getBranch = async (id) => {
    if (!branchById.has(id)) branchById.set(id, client.entities.Branch.get(id).catch(() => null));
    return branchById.get(id);
  };

  return async function stamp(data) {
    if (!data || typeof data !== 'object') return data;
    try {
      if (!ctxPromise) ctxPromise = loadCtx().catch((e) => { ctxPromise = null; throw e; });
      const ctx = await ctxPromise;
      let own;
      const branch = data.branch_id ? await getBranch(data.branch_id) : null;
      if (branch) own = { station_email: branch.station_email || null, tenant_email: branch.tenant_email || null };
      else if (data.network_level === true) own = { station_email: null, tenant_email: ctx.email };
      else if (ctx.station) own = { station_email: ctx.station.station_email, tenant_email: ctx.station.tenant_email || null };
      else if (ctx.isMaster) own = { station_email: ctx.email, tenant_email: ctx.email };
      else own = { station_email: ctx.email, tenant_email: null };
      return {
        ...data,
        station_email: data.station_email || own.station_email,
        tenant_email: data.tenant_email || own.tenant_email,
      };
    } catch {
      return data;
    }
  };
}