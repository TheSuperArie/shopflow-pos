import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * READ-ONLY feed for the owner's Google Chat bot ("קציר", Apps Script).
 * Called server-to-server with a shared key (header x-bot-key). The key lives in AdminSecret
 * (service-role only), row owner_email = '__bot_feed__', field admin_password.
 * Only the network of TENANT. Never writes anything.
 * Deliberately NOT included: employees, shifts, payments, expenses, cost prices / profit,
 * customer personal details (names, phones, emails), card / credit details.
 *
 *  { action: 'overview' }                                        → branches + warehouses of the network
 *  { action: 'sales',     from, to, branch? }                    → revenue / counts / cash-credit / per day / per hour / top items
 *  { action: 'stock',     query?, branch?, max_qty? }            → exact quantities in branch POS catalogs (+ free warehouse qty)
 *  { action: 'warehouse', query?, max_qty? }                     → exact warehouse quantities (qty, reserved, free)
 *  { action: 'supply',    days?, status?, branch? }              → supply orders (branch → network → warehouse → branch)
 *  { action: 'returns',   from, to, branch? }                    → returns / exchanges
 *
 * Dates are Israel calendar days 'YYYY-MM-DD'.
 */
const lc = (s) => String(s || '').trim().toLowerCase();
const ownedBy = (email) => ({ $or: [{ created_by: email }, { acting_owner: email }] });
const asOwnerRows = (rows) => (rows || []).map(r => (r && r.acting_owner ? { ...r, created_by: r.acting_owner } : r));
const FEED_ROW = '__bot_feed__';
const TENANT = 'tt0534168729@gmail.com';
const TZ = 'Asia/Jerusalem';
const DAY_MS = 86400000;
const PAGE = 5000;
const MAX_ROWS = 20000;
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
const tag = async (label, p) => { try { return await p; } catch (e) { throw Object.assign(new Error(`${label}: ${e?.message || e}`), { status: e?.status || e?.response?.status || 500 }); } };
const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (n) => Number(n) || 0;

// ---------- dates (server timestamps are UTC without "Z") ----------
const parseServer = (v) => {
  if (!v) return null;
  let s = String(v);
  if (s.length > 10 && !/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s += 'Z';
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayKey = (v) => { const d = parseServer(v); return d ? dayFmt.format(d) : null; };
const hourOf = (v) => { const d = parseServer(v); return d ? Number(hourFmt.format(d)) : null; };
const whenOf = (v) => { const d = parseServer(v); return d ? `${dayFmt.format(d)} ${timeFmt.format(d)}` : null; };
const today = () => dayFmt.format(new Date());
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const range = (body, defDays = 0) => {
  const to = isDay(body.to) ? body.to : today();
  const from = isDay(body.from) ? body.from
    : dayFmt.format(new Date(Date.parse(`${to}T12:00:00Z`) - defDays * DAY_MS));
  if (from > to) throw httpError(400, 'from אחרי to');
  if (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 400 * DAY_MS) throw httpError(400, 'טווח מקסימלי 400 ימים');
  // one extra day on each side absorbs the timezone; exact filtering happens by dayKey
  const q = {
    $gte: new Date(Date.parse(`${from}T00:00:00Z`) - DAY_MS).toISOString(),
    $lte: new Date(Date.parse(`${to}T23:59:59Z`) + DAY_MS).toISOString(),
  };
  return { from, to, q, inRange: (v) => { const k = dayKey(v); return !!k && k >= from && k <= to; } };
};

// Few, large pages, one after another — keeps the number of requests per call low
async function fetchAll(entity, query, sort = undefined) {
  const rows = [];
  for (let skip = 0; skip < MAX_ROWS; skip += PAGE) {
    const page = await entity.filter(query, sort, PAGE, skip);
    rows.push(...page);
    if (page.length < PAGE) return { rows: dedupe(rows), partial: false };
  }
  return { rows: dedupe(rows), partial: true };
}
async function byIds(entity, ids) {
  const list = [...new Set((ids || []).filter(Boolean).map(String))];
  const out = [];
  for (let i = 0; i < list.length; i += 200) out.push(...await entity.filter({ id: { $in: list.slice(i, i + 200) } }, undefined, 200));
  return out;
}

const labelOf = (dims) => {
  const d = dims && typeof dims === 'object' ? dims : {};
  return Object.entries(d)
    .map(([k, v]) => [String(k || '').trim(), String(v ?? '').trim()])
    .filter(([k, v]) => k && v)
    .map(([k, v]) => `${k} ${v}`).join(', ');
};
const matches = (text, query) => {
  const q = lc(query);
  if (!q) return true;
  const t = lc(text);
  return q.split(/\s+/).filter(Boolean).every(w => t.includes(w));
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const [cfg] = await tag('AdminSecret', db.AdminSecret.filter({ owner_email: FEED_ROW }, 'created_date', 1));
    const key = cfg?.admin_password;
    if (!key) throw httpError(503, 'הפיד לא מוגדר');
    if (!safeEqual(req.headers.get('x-bot-key'), key)) throw httpError(401, 'Unauthorized');

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    const allBranches = await tag('Branch', db.Branch.filter({ tenant_email: TENANT }, 'created_date', 100));
    const branches = allBranches.filter(isLive);
    const branchName = new Map(allBranches.map(b => [b.id, String(b.name || '').trim()]));
    const pickBranches = (wanted) => {
      if (!wanted) return branches;
      const w = lc(wanted);
      const found = branches.filter(b => b.id === wanted || lc(b.name).includes(w) || w.includes(lc(b.name)));
      if (!found.length) throw httpError(404, `סניף "${wanted}" לא נמצא. הסניפים: ${branches.map(b => b.name).join(', ')}`);
      return found;
    };
    const warehousesOf = async () => (await tag('Warehouse', db.Warehouse.filter({ tenant_email: TENANT }, undefined, 20)))
      .filter(w => w.status === 'ACTIVE' || (!w.status && w.is_active !== false));

    // ---------------------------------------------------------------- overview
    if (action === 'overview') {
      const warehouses = await warehousesOf();
      return Response.json({
        ok: true,
        today: today(),
        branches: branches.map(b => ({ id: b.id, name: String(b.name || '').trim(), address: b.address || '' })),
        warehouses: warehouses.map(w => ({ id: w.id, name: w.name || 'מחסן' })),
      });
    }

    // ---------------------------------------------------------------- sales
    if (action === 'sales') {
      const r = range(body, 0);
      const chosen = pickBranches(body.branch);
      const ids = chosen.map(b => b.id);
      const { rows, partial } = await tag('Sale', fetchAll(db.Sale, { created_date: r.q, branch_id: { $in: ids } }, '-created_date'));
      const sales = rows.filter(s => r.inRange(s.created_date));

      const cashOf = (s) => s.payment_method === 'מזומן' ? num(s.total) : s.payment_method === 'מזומן + אשראי' ? num(s.cash_amount) : 0;
      const creditOf = (s) => s.payment_method === 'אשראי' ? num(s.total)
        : s.payment_method === 'מזומן + אשראי' ? (num(s.credit_amount) > 0 ? num(s.credit_amount) : Math.max(0, num(s.total) - num(s.cash_amount))) : 0;

      const blank = () => ({ revenue: 0, sales: 0, items: 0, cash: 0, credit: 0, exchanges: 0 });
      const add = (t, s) => {
        t.revenue += num(s.total); t.sales += 1; t.cash += cashOf(s); t.credit += creditOf(s);
        if (s.is_exchange) t.exchanges += 1;
        for (const it of s.items || []) if (num(it.quantity) > 0) t.items += num(it.quantity);
      };
      const total = blank();
      const perBranch = new Map(chosen.map(b => [b.id, blank()]));
      const perDay = new Map();
      const perHour = new Map();
      const items = new Map();
      for (const s of sales) {
        add(total, s);
        add(perBranch.get(s.branch_id) || blank(), s);
        const k = dayKey(s.created_date);
        if (!perDay.has(k)) perDay.set(k, blank());
        add(perDay.get(k), s);
        const h = hourOf(s.created_date);
        perHour.set(h, (perHour.get(h) || 0) + 1);
        for (const it of s.items || []) {
          const q = num(it.quantity);
          if (q <= 0) continue;
          const id = it.variant_id || `free:${it.product_name}`;
          if (!items.has(id)) items.set(id, { variant_id: it.variant_id || null, name: String(it.product_name || '').trim(), qty: 0, revenue: 0 });
          const row = items.get(id);
          row.qty += q; row.revenue += q * num(it.sell_price);
        }
      }
      // size / variation labels + category for the top items
      const top = [...items.values()].sort((a, b) => b.qty - a.qty).slice(0, 40);
      const vrows = await tag('ProductVariant', byIds(db.ProductVariant, top.map(t => t.variant_id)));
      const vmap = new Map(vrows.map(v => [v.id, v]));
      const groups = await tag('ProductGroup', byIds(db.ProductGroup, vrows.map(v => v.group_id)));
      const gmap = new Map(groups.map(g => [g.id, g]));
      const cats = await tag('Category', byIds(db.Category, groups.map(g => g.category_id)));
      const cmap = new Map(cats.map(c => [c.id, String(c.name || '').trim()]));
      const fin = (t) => ({ ...t, revenue: round(t.revenue), cash: round(t.cash), credit: round(t.credit) });

      return Response.json({
        ok: true, from: r.from, to: r.to, partial,
        total: fin(total),
        by_branch: chosen.map(b => ({ branch: branchName.get(b.id), ...fin(perBranch.get(b.id)) })),
        by_day: [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, t]) => ({ day, ...fin(t) })),
        sales_by_hour: [...perHour.entries()].filter(([h]) => h != null).sort((a, b) => a[0] - b[0]).map(([hour, count]) => ({ hour, count })),
        top_items: top.map(t => {
          const v = vmap.get(t.variant_id);
          const g = v && gmap.get(v.group_id);
          return {
            product: (g && String(g.name || '').trim()) || t.name,
            category: (g && cmap.get(g.category_id)) || null,
            variant: v ? labelOf(v.dimensions) : '',
            qty: t.qty,
            revenue: round(t.revenue),
          };
        }),
        last_sales: sales.slice(0, 10).map(s => ({
          when: whenOf(s.created_date), branch: branchName.get(s.branch_id), total: round(s.total), method: s.payment_method,
          items: (s.items || []).map(i => `${String(i.product_name || '').trim()} x${num(i.quantity)}`).join('; '),
        })),
      });
    }

    // ---------------------------------------------------------------- warehouse helpers
    const warehouseState = async () => {
      const warehouses = await warehousesOf();
      const out = [];
      for (const w of warehouses) {
        const [stock, reserved] = await Promise.all([
          tag('WarehouseStock', fetchAll(db.WarehouseStock, { warehouse_id: w.id })),
          tag('StockReservation', fetchAll(db.StockReservation, { scope: 'WAREHOUSE', warehouse_id: w.id })),
        ]);
        const res = new Map();
        for (const r of reserved.rows) {
          const k = r.item_key || r.variant_id;
          if (k) res.set(k, (res.get(k) || 0) + num(r.qty));
        }
        for (const s of stock.rows) {
          const k = s.variant_id || s.local_product_id || s.id;
          const rq = res.get(k) || 0;
          out.push({
            warehouse: w.name || 'מחסן', key: s.variant_id || null,
            product: String(s.product_name || '').trim(), variant: String(s.variant_label || '').trim(),
            category: String(s.category_name || '').trim(), sku: s.sku || '',
            qty: num(s.qty), reserved: rq, free: Math.max(0, num(s.qty) - rq),
          });
        }
      }
      return { warehouses, rows: out };
    };

    // ---------------------------------------------------------------- stock (branches)
    if (action === 'stock') {
      const chosen = pickBranches(body.branch);
      const maxQty = body.max_qty === undefined || body.max_qty === null || body.max_qty === '' ? null : Number(body.max_qty);
      const query = String(body.query || '').trim();
      const wh = await warehouseState();
      const whFree = new Map();
      for (const r of wh.rows) if (r.key) whFree.set(r.key, (whFree.get(r.key) || 0) + r.free);

      const result = [];
      for (const branch of chosen) {
        const station = lc(branch.station_email);
        const load = async (entity, sort = undefined) => {
          const [own, stamped] = await Promise.all([
            fetchAll(entity, ownedBy(station), sort),
            fetchAll(entity, { branch_id: branch.id }, sort),
          ]);
          return dedupe(asOwnerRows([...own.rows, ...stamped.rows])).filter(r => !r.branch_id || r.branch_id === branch.id);
        };
        const [categories, groups, variants] = await Promise.all([load(db.Category), load(db.ProductGroup), load(db.ProductVariant)]);
        const cat = new Map(categories.map(c => [c.id, String(c.name || '').trim()]));
        const grp = new Map<string, any>(groups.filter(g => g.is_active !== false).map(g => [g.id, g]));
        let units = 0, sizes = 0, out = 0;
        const rows = [];
        for (const v of variants) {
          const g = grp.get(v.group_id);
          if (!g) continue;
          const stock = num(v.stock);
          sizes += 1; units += Math.max(0, stock); if (stock <= 0) out += 1;
          const product = String(g.name || '').trim();
          const category = cat.get(g.category_id) || '';
          const variant = labelOf(v.dimensions);
          if (!matches(`${category} ${product} ${variant} ${v.sku || ''}`, query)) continue;
          if (maxQty !== null && !(stock <= maxQty)) continue;
          const netKey = v.source_id || v.id;
          rows.push({
            category, product, variant, stock,
            warehouse_free: whFree.has(netKey) ? whFree.get(netKey) : null,
            carton: v.carton_number || undefined,
          });
        }
        const coll = new Intl.Collator('he', { numeric: true });
        rows.sort((a, b) => coll.compare(`${a.category} ${a.product} ${a.variant}`, `${b.category} ${b.product} ${b.variant}`));
        result.push({
          branch: branchName.get(branch.id),
          summary: { units_in_stock: units, sizes, sizes_out_of_stock: out },
          rows: rows.slice(0, 300), more_rows: Math.max(0, rows.length - 300),
        });
      }
      return Response.json({ ok: true, query, max_qty: maxQty, has_warehouse: wh.warehouses.length > 0, branches: result });
    }

    // ---------------------------------------------------------------- warehouse
    if (action === 'warehouse') {
      const query = String(body.query || '').trim();
      const maxQty = body.max_qty === undefined || body.max_qty === null || body.max_qty === '' ? null : Number(body.max_qty);
      const wh = await warehouseState();
      if (!wh.warehouses.length) return Response.json({ ok: true, has_warehouse: false, rows: [] });
      const all = wh.rows;
      const rows = all
        .filter(r => matches(`${r.category} ${r.product} ${r.variant} ${r.sku}`, query))
        .filter(r => maxQty === null || r.qty <= maxQty);
      const coll = new Intl.Collator('he', { numeric: true });
      rows.sort((a, b) => coll.compare(`${a.category} ${a.product} ${a.variant}`, `${b.category} ${b.product} ${b.variant}`));
      return Response.json({
        ok: true, has_warehouse: true, query, max_qty: maxQty,
        summary: {
          units: all.reduce((s, r) => s + Math.max(0, r.qty), 0),
          reserved_in_picking: all.reduce((s, r) => s + r.reserved, 0),
          lines: all.length, lines_out: all.filter(r => r.qty <= 0).length,
        },
        rows: rows.slice(0, 400).map(({ key, ...r }) => r), more_rows: Math.max(0, rows.length - 400),
      });
    }

    // ---------------------------------------------------------------- supply orders
    if (action === 'supply') {
      const days = Math.max(1, Math.min(365, Number(body.days) || 30));
      const since = new Date(Date.now() - (days + 1) * DAY_MS).toISOString();
      const ids = new Set(pickBranches(body.branch).map(b => b.id));
      const { rows } = await fetchAll(db.SupplyOrder, { tenant_email: TENANT, created_date: { $gte: since } }, '-created_date');
      const STATUS = {
        SENT_TO_NETWORK: 'ממתינה אצל הרשת', SENT_TO_WAREHOUSE: 'נשלחה למחסן', PICKING: 'בליקוט', PACKED: 'לוקטה, עוד לא נשלחה לרשת',
        READY: 'המחסן סיים ושלח לרשת', SENT_TO_BRANCH: 'בדרך לסניף', RECEIVED: 'נקלטה בסניף', CANCELLED: 'בוטלה',
      };
      const wantStatus = body.status ? String(body.status) : '';
      const list = rows
        .filter(o => !o.branch_id || ids.has(o.branch_id))
        .filter(o => !wantStatus || o.status === wantStatus || (STATUS[o.status] || '').includes(wantStatus))
        .slice(0, 60)
        .map(o => {
          const its = o.items || [];
          return {
            order: o.order_number || o.id, branch: o.branch_name || branchName.get(o.branch_id) || '',
            status: STATUS[o.status] || o.status, created: whenOf(o.created_date),
            sent_to_warehouse: whenOf(o.sent_to_warehouse_at), ready: whenOf(o.ready_at),
            sent_to_branch: whenOf(o.sent_to_branch_at), received: whenOf(o.received_at),
            picker: o.picker_name || undefined,
            lines: its.length,
            requested: its.reduce((s, i) => s + num(i.requested_qty), 0),
            ordered: its.reduce((s, i) => s + num(i.qty), 0),
            picked: its.reduce((s, i) => s + num(i.picked_qty), 0),
            received_qty: its.reduce((s, i) => s + num(i.received_qty), 0),
            notes: [o.branch_notes, o.network_notes, o.warehouse_notes].filter(Boolean).join(' | ') || undefined,
            items: its.slice(0, 60).map(i => `${String(i.product_name || '').trim()} ${String(i.variant_label || '').trim()}: ${num(i.qty)} (לוקט ${num(i.picked_qty)})`),
          };
        });
      return Response.json({ ok: true, days, count: list.length, orders: list });
    }

    // ---------------------------------------------------------------- returns
    if (action === 'returns') {
      const r = range(body, 30);
      const ids = pickBranches(body.branch).map(b => b.id);
      const { rows } = await fetchAll(db.Return, { created_date: r.q, branch_id: { $in: ids } }, '-created_date');
      const list = rows.filter(x => r.inRange(x.created_date));
      const sum = (f) => round(list.filter(f).reduce((s, x) => s + num(x.total_amount), 0));
      const name = (i) => `${String(i.product_name || i.name || '').trim()}${i.variant_label ? ' ' + i.variant_label : ''} x${num(i.quantity) || 1}`;
      return Response.json({
        ok: true, from: r.from, to: r.to, count: list.length,
        totals: {
          refund_money: sum(x => x.refund_method === 'החזר כספי'),
          credit_note: sum(x => x.refund_method === 'זיכוי'),
          exchanges: list.filter(x => x.refund_method === 'החלפה').length,
        },
        returns: list.slice(0, 60).map(x => ({
          when: whenOf(x.created_date), branch: branchName.get(x.branch_id) || '',
          method: x.refund_method, status: x.status, amount: round(x.total_amount), reason: x.reason || undefined,
          items: (x.items || []).map(name).join('; '),
          exchange_items: (x.exchange_items || []).map(name).join('; ') || undefined,
        })),
      });
    }

    throw httpError(400, 'Unknown action');
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
}
