import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { actingUser, ownedBy, asOwnerRows } from '../../shared/acting.ts';

/**
 * Reads of someone else's catalog, checked on the server — so the catalog tables themselves can be
 * locked to their owners (RLS) without breaking the three places that legitimately cross accounts:
 *
 *  networkCatalog { warehouse_id }               → the network owner's catalog, for the warehouse
 *                                                   account (or the owner) of that warehouse
 *  variantSources { warehouse_id, variant_ids }  → { id, source_id } of branch variants of the same
 *                                                   network, for picking availability
 *  sharedCatalog  { branch_id }                  → the records the network owner shared with this
 *                                                   branch (Branch.catalog_share), for its station
 *  warehouseFree  { branch_id, keys }            → free warehouse stock (stock − picking reservations)
 *                                                   of the network's warehouses, per network variant id,
 *                                                   for the branch's order screen (its station or the owner)
 */
const lc = (s) => String(s || '').toLowerCase();
const httpError = (status, message) => Object.assign(new Error(message), { status });

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    // An authorized network manager acts as the network owner
    const user = await actingUser(base44, await base44.auth.me());
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const me = lc(user.email);
    const isMe = (e) => !!e && lc(e) === me;
    const db = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    const loadWarehouse = async (id) => {
      if (!id) throw httpError(400, 'חסר מחסן');
      const [w] = await db.Warehouse.filter({ id }, undefined, 1);
      if (!w) throw httpError(404, 'המחסן לא נמצא');
      if (!isMe(w.station_email) && !isMe(w.tenant_email)) throw httpError(403, 'אין הרשאה למחסן הזה');
      if (!w.tenant_email) throw httpError(409, 'המחסן לא מחובר לרשת');
      return w;
    };

    const byIds = async (entity, ids) => {
      const list = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))];
      const out = [];
      for (let i = 0; i < list.length; i += 200) {
        out.push(...await entity.filter({ id: { $in: list.slice(i, i + 200) } }, undefined, 200));
      }
      return out;
    };

    if (action === 'networkCatalog') {
      const w = await loadWarehouse(body.warehouse_id);
      const t = w.tenant_email;
      const [branches, variants, groups, categories] = await Promise.all([
        db.Branch.filter({ tenant_email: t, station_email: t }, undefined, 50),
        db.ProductVariant.filter(ownedBy(t), undefined, 5000),
        db.ProductGroup.filter(ownedBy(t), undefined, 5000),
        db.Category.filter(ownedBy(t), undefined, 2000),
      ]);
      return Response.json({
        ok: true, own_branch_ids: branches.map(b => b.id),
        variants: asOwnerRows(variants), groups: asOwnerRows(groups), categories: asOwnerRows(categories),
      });
    }

    if (action === 'variantSources') {
      const w = await loadWarehouse(body.warehouse_id);
      const t = lc(w.tenant_email);
      const rows = asOwnerRows(await byIds(db.ProductVariant, (body.variant_ids || []).slice(0, 500)));
      const sources = rows
        .filter(v => lc(v.tenant_email) === t || lc(v.created_by) === t)
        .map(v => ({ id: v.id, source_id: v.source_id || null }));
      return Response.json({ ok: true, sources });
    }

    if (action === 'sharedCatalog') {
      if (!body.branch_id) throw httpError(400, 'חסר סניף');
      const [b] = await db.Branch.filter({ id: body.branch_id }, undefined, 1);
      if (!b) throw httpError(404, 'הסניף לא נמצא');
      if (!isMe(b.station_email)) throw httpError(403, 'רק חשבון הסניף קולט את הקטלוג שלו');
      const owner = lc(b.tenant_email);
      if (!owner) throw httpError(409, 'הסניף לא מחובר לרשת');
      const share = b.catalog_share || {};
      // Only records that really belong to this network's owner
      const ownerOnly = (rows) => asOwnerRows(rows).filter(r => lc(r.created_by) === owner || lc(r.tenant_email) === owner);
      const [categories, dimensions, groups, pv, fv] = await Promise.all([
        byIds(db.Category, share.category_ids),
        byIds(db.VariantDimension, share.dimension_ids),
        byIds(db.ProductGroup, share.group_ids),
        byIds(db.ProductVariant, share.pv_ids),
        byIds(db.FlexibleVariant, share.fv_ids),
      ]);
      return Response.json({
        ok: true,
        categories: ownerOnly(categories),
        dimensions: ownerOnly(dimensions),
        groups: ownerOnly(groups),
        pv: ownerOnly(pv),
        fv: ownerOnly(fv),
      });
    }

    if (action === 'warehouseFree') {
      if (!body.branch_id) throw httpError(400, 'חסר סניף');
      const [b] = await db.Branch.filter({ id: body.branch_id }, undefined, 1);
      if (!b) throw httpError(404, 'הסניף לא נמצא');
      if (!isMe(b.station_email) && !isMe(b.tenant_email)) throw httpError(403, 'אין הרשאה לסניף הזה');
      const owner = lc(b.tenant_email);
      if (!owner) return Response.json({ ok: true, has_warehouse: false, free: {} });
      const warehouses = (await db.Warehouse.filter({ tenant_email: b.tenant_email }, undefined, 20))
        .filter(w => w.status === 'ACTIVE' || (!w.status && w.is_active !== false));
      if (!warehouses.length) return Response.json({ ok: true, has_warehouse: false, free: {} });
      // Only the network owner's own catalog variants count as keys (the warehouse keeps stock per network
      // variant; branch copies are created by the branch accounts and point to them with source_id)
      const keyRows = asOwnerRows(await byIds(db.ProductVariant, (body.keys || []).slice(0, 5000)));
      const keys = keyRows.filter(v => lc(v.created_by) === owner).map(v => v.id);
      const free = Object.fromEntries(keys.map(k => [k, 0]));
      for (const w of warehouses) {
        const [stock, reserved] = await Promise.all([
          db.WarehouseStock.filter({ warehouse_id: w.id }, undefined, 5000),
          db.StockReservation.filter({ scope: 'WAREHOUSE', warehouse_id: w.id }, undefined, 5000),
        ]);
        stock.forEach(s => { if (s.variant_id && s.variant_id in free) free[s.variant_id] += Number(s.qty || 0); });
        reserved.forEach(r => {
          const k = r.item_key || r.variant_id;
          if (k && k in free) free[k] -= Number(r.qty || 0);
        });
      }
      Object.keys(free).forEach(k => { free[k] = Math.max(0, free[k]); });
      return Response.json({ ok: true, has_warehouse: true, free });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
}
