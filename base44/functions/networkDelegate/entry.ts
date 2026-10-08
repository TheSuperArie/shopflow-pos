import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { delegateOwnerOf } from '../../shared/acting.ts';

/**
 * "Authorized network manager" — every data call of such an account comes here (the browser
 * routes it, see src/api/base44Client.js). The manager acts as the network owner, limited to what
 * the owner himself may see and change (the same rules as the owner's own row-level security):
 * records created by / stationed at / of the network of the owner.
 *
 *  whoami                                   → { ok, owner: <owner email> | null, email }
 *  filter  { entity, query, sort, limit, skip }
 *  list    { entity, sort, limit, skip }
 *  get     { entity, id }
 *  create  { entity, data }  /  bulkCreate { entity, rows }
 *  update  { entity, id, data }
 *  delete  { entity, id }
 *
 * Records the manager creates are made by the service account, so they carry acting_owner =
 * the owner (+ delegate_email) — the browser shows them as created by the owner, and owner
 * queries (created_by: owner) include them.
 */
const lc = (s) => String(s || '').trim().toLowerCase();

// Readable by every signed-in account anyway (open read rules) — no read scope
const OPEN_READ = new Set(['AppSettings', 'Branch', 'BranchProductVisibility']);
// Open write rules
const OPEN_WRITE = new Set(['BranchProductVisibility']);
// Never through here
const BLOCKED = new Set(['User', 'AccessRequest', 'AdminSecret', 'DevCodeAttempt', 'DeveloperSettings', 'TicketChat', 'UsageLog']);
// Same list as the browser's ownership stamping (src/lib/ownershipStamp.js)
const STAMPED = new Set([
  'Sale', 'Expense', 'Return', 'Credit', 'Category', 'ProductGroup', 'ProductVariant',
  'FlexibleVariant', 'VariantDimension', 'Supplier', 'SupplierOrder', 'SupplierPayment',
  'OrderTicket', 'StockRequest', 'StockUpdate', 'Receipt', 'CashCount', 'Product',
  'AppSettings', 'FixedExpenseTemplate', 'BranchVariantStock', 'OwnerWithdrawal',
]);

const httpError = (status, message) => Object.assign(new Error(message), { status });

/** The manager's own address anywhere in a query / data → the owner's. */
function swapEmail(value, from, to) {
  if (typeof value === 'string') return lc(value) === from ? to : value;
  if (Array.isArray(value)) return value.map(v => swapEmail(v, from, to));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, swapEmail(v, from, to)]));
  }
  return value;
}

/** created_by: X  →  created_by X  or  acting_owner X (records a manager created for X). */
function withActingOwner(q) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return q;
  const out = {};
  const extra = [];
  for (const [k, v] of Object.entries(q)) {
    if (k === '$and' || k === '$or' || k === '$nor') out[k] = Array.isArray(v) ? v.map(withActingOwner) : v;
    else if (k === 'created_by') extra.push({ $or: [{ created_by: v }, { acting_owner: v }] });
    else out[k] = v;
  }
  if (!extra.length) return out;
  const parts = [...(Object.keys(out).length ? [out] : []), ...extra];
  return parts.length === 1 ? parts[0] : { $and: parts };
}

const scopeOf = (owner) => ({
  $or: [
    { created_by: owner }, { acting_owner: owner },
    { station_email: owner }, { tenant_email: owner }, { warehouse_email: owner },
  ],
});
const inScope = (r, owner) => !!r && [r.created_by, r.acting_owner, r.station_email, r.tenant_email, r.warehouse_email]
  .some(e => lc(e) === owner);
// Writes: by the record's real ownership only (acting_owner is our own mark — never a reason to write)
const inWriteScope = (r, owner) => !!r && [r.created_by, r.station_email, r.tenant_email, r.warehouse_email]
  .some(e => lc(e) === owner);

/** Shown to the browser as the owner's own record. */
const asOwner = (r) => (r && r.acting_owner ? { ...r, created_by: r.acting_owner } : r);

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const me = lc(user.email);
    const owner = await delegateOwnerOf(base44, me);

    if (body.op === 'whoami') return Response.json({ ok: true, owner, email: me });
    if (!owner) throw httpError(403, 'החשבון הזה אינו מנהל רשת מורשה');

    const name = String(body.entity || '');
    if (!/^\w+$/.test(name) || BLOCKED.has(name)) throw httpError(403, 'אין גישה לטבלה הזו');
    const db = base44.asServiceRole.entities;
    const entity = db[name];
    if (!entity) throw httpError(404, 'טבלה לא קיימת');

    const swap = (v) => swapEmail(v, me, owner);
    const readQuery = (q) => {
      const query = withActingOwner(swap(q || {}));
      if (OPEN_READ.has(name)) return query;
      return Object.keys(query).length ? { $and: [query, scopeOf(owner)] } : scopeOf(owner);
    };

    // Ownership stamping exactly as the owner's own browser would do it
    const branchCache = new Map();
    const stamp = async (data) => {
      const d = { ...swap(data || {}), acting_owner: owner, delegate_email: me };
      if (!STAMPED.has(name)) return d;
      let own;
      if (d.branch_id) {
        if (!branchCache.has(d.branch_id)) branchCache.set(d.branch_id, (await db.Branch.filter({ id: d.branch_id }, undefined, 1))[0] || null);
        const b = branchCache.get(d.branch_id);
        own = b ? { station_email: b.station_email || null, tenant_email: b.tenant_email || null } : { station_email: owner, tenant_email: owner };
      } else if (d.network_level === true) own = { station_email: null, tenant_email: owner };
      else own = { station_email: owner, tenant_email: owner };
      return { ...d, station_email: d.station_email || own.station_email, tenant_email: d.tenant_email || own.tenant_email };
    };
    const mayWrite = (r) => OPEN_WRITE.has(name) || inWriteScope(r, owner);
    const loadOne = async (id) => (await entity.filter({ id }, undefined, 1))[0] || null;

    switch (body.op) {
      case 'filter': {
        const rows = await entity.filter(readQuery(body.query), body.sort || undefined, body.limit || undefined, body.skip || undefined);
        return Response.json({ ok: true, data: rows.map(asOwner) });
      }
      case 'list': {
        const rows = await entity.filter(readQuery({}), body.sort || undefined, body.limit || undefined, body.skip || undefined);
        return Response.json({ ok: true, data: rows.map(asOwner) });
      }
      case 'get': {
        const r = await loadOne(body.id);
        if (!r || (!OPEN_READ.has(name) && !inScope(r, owner))) throw httpError(404, 'הרשומה לא נמצאה');
        return Response.json({ ok: true, data: asOwner(r) });
      }
      case 'create': {
        const data = await stamp(body.data);
        if (!mayWrite(data)) throw httpError(403, 'אין הרשאה ליצור רשומה מחוץ לרשת');
        return Response.json({ ok: true, data: asOwner(await entity.create(data)) });
      }
      case 'bulkCreate': {
        const rows = await Promise.all((body.rows || []).map(stamp));
        if (!rows.every(mayWrite)) throw httpError(403, 'אין הרשאה ליצור רשומה מחוץ לרשת');
        const created = await entity.bulkCreate(rows);
        return Response.json({ ok: true, data: (created || []).map(asOwner) });
      }
      case 'update': {
        const r = await loadOne(body.id);
        if (!r || !mayWrite(r)) throw httpError(403, 'אין הרשאה לעדכן את הרשומה');
        const data = swap(body.data || {});
        delete data.acting_owner; delete data.created_by; delete data.created_by_id;
        if (!mayWrite({ ...r, ...data })) throw httpError(403, 'אין הרשאה להוציא רשומה מהרשת');
        return Response.json({ ok: true, data: asOwner(await entity.update(body.id, data)) });
      }
      case 'delete': {
        const r = await loadOne(body.id);
        if (!r || !mayWrite(r)) throw httpError(403, 'אין הרשאה למחוק את הרשומה');
        await entity.delete(body.id);
        return Response.json({ ok: true, data: { id: body.id } });
      }
      default:
        throw httpError(400, 'Unknown op');
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
}
