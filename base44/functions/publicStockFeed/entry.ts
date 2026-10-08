import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * Feed for the separate public stock site ("מלאי תומכי תורה").
 * Called only server-to-server by that site, with a shared key (header x-feed-key). The key lives in
 * AdminSecret (service-role only), row owner_email = '__public_feed__', field admin_password.
 * It never returns quantities — only a status per item: in / low / out.
 *
 *  { action: 'branches' }                              → active branches of the network
 *  { action: 'catalog', branch_id, threshold }         → that branch's catalog (same records its POS shows)
 *                                                        with status per variant and sell price
 */
const lc = (s) => String(s || '').trim().toLowerCase();
// Same as shared/acting.ts (kept inline so this function deploys on its own)
const ownedBy = (email) => ({ $or: [{ created_by: email }, { acting_owner: email }] });
const asOwnerRows = (rows) => (rows || []).map(r => (r && r.acting_owner ? { ...r, created_by: r.acting_owner } : r));
const FEED_ROW = '__public_feed__';
// The network shown on the public site: תומכי תורה חדרי ביגוד
const TENANT = 'tt0534168729@gmail.com';
const httpError = (status, message) => Object.assign(new Error(message), { status });

const safeEqual = (a, b) => {
  const x = String(a || ''), y = String(b || '');
  if (!x || !y || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
};

const isLive = (b) => b && b.is_active !== false && (!b.status || b.status === 'ACTIVE');
const dedupe = (rows) => {
  const seen = new Set();
  return rows.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
};
const price = (n) => (Number(n) > 0 ? Math.round(Number(n) * 100) / 100 : null);

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const [cfg] = await db.AdminSecret.filter({ owner_email: FEED_ROW }, 'created_date', 1);
    const key = cfg?.admin_password;
    if (!key) throw httpError(503, 'הפיד לא מוגדר');
    if (!safeEqual(req.headers.get('x-feed-key'), key)) throw httpError(401, 'Unauthorized');

    const body = await req.json().catch(() => ({}));
    const branches = (await db.Branch.filter({ tenant_email: TENANT }, 'created_date', 100)).filter(isLive);

    if (body.action === 'branches') {
      return Response.json({
        ok: true,
        branches: branches.map(b => ({ id: b.id, name: String(b.name || '').trim(), address: b.address || '' })),
      });
    }

    if (body.action === 'catalog') {
      const branch = branches.find(b => b.id === body.branch_id);
      if (!branch) throw httpError(404, 'הסניף לא נמצא ברשת');
      const threshold = Math.max(1, Math.min(1000, Number(body.threshold) || 3));
      const station = lc(branch.station_email);

      // The POS catalog: the station's own records + records the network owner stamped for this branch.
      // Station records stamped for a different branch are not this branch's.
      const load = async (entity, sort) => {
        const [own, stamped] = await Promise.all([
          entity.filter(ownedBy(station), sort, 5000),
          entity.filter({ branch_id: branch.id }, sort, 5000),
        ]);
        return dedupe(asOwnerRows([...own, ...stamped]))
          .filter(r => !r.branch_id || r.branch_id === branch.id);
      };
      const [categories, groups, variants] = await Promise.all([
        load(db.Category, 'sort_order'),
        load(db.ProductGroup),
        load(db.ProductVariant),
      ]);

      const activeGroups = new Map(groups.filter(g => g.is_active !== false).map(g => [g.id, g]));
      const items = new Map();
      for (const v of variants) {
        const g = activeGroups.get(v.group_id);
        if (!g) continue;
        const stock = Number(v.stock) || 0;
        const dims = v.dimensions && typeof v.dimensions === 'object' ? v.dimensions : {};
        const label = Object.values(dims).map(x => String(x ?? '').trim()).filter(Boolean).join(' · ');
        const p = g.has_uniform_price !== false && Number(g.uniform_sell_price) > 0
          ? price(g.uniform_sell_price) : price(v.sell_price);
        if (!items.has(g.id)) items.set(g.id, []);
        items.get(g.id).push({
          id: v.id,
          l: label,
          s: stock <= 0 ? 'out' : stock < threshold ? 'low' : 'in',
          p,
        });
      }

      const coll = new Intl.Collator('he', { numeric: true });
      const products = [];
      for (const [gid, list] of items) {
        const g = activeGroups.get(gid);
        list.sort((a, b) => coll.compare(a.l, b.l));
        products.push({
          id: g.id,
          n: String(g.name || '').trim(),
          c: g.category_id || null,
          img: g.image_url || '',
          v: list,
        });
      }
      products.sort((a, b) => coll.compare(a.n, b.n));

      // Only categories that hold products (and their parents)
      const catById = new Map(categories.map(c => [c.id, c]));
      const used = new Set();
      for (const p of products) {
        let c = catById.get(p.c);
        let guard = 0;
        while (c && !used.has(c.id) && guard++ < 10) { used.add(c.id); c = catById.get(c.parent_id); }
      }
      const cats = categories
        .filter(c => used.has(c.id))
        .map(c => ({ id: c.id, n: String(c.name || '').trim(), p: c.parent_id || null, o: Number(c.sort_order) || 0 }));

      return Response.json({
        ok: true,
        branch: { id: branch.id, name: String(branch.name || '').trim(), address: branch.address || '' },
        threshold,
        generated_at: new Date().toISOString(),
        categories: cats,
        products,
      });
    }

    throw httpError(400, 'Unknown action');
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
}
