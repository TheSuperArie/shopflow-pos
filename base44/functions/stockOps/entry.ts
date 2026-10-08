import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { actingUser } from '../../shared/acting.ts';

/**
 * All stock changes go through here (warehouse + POS):
 *  - the caller must own the warehouse / branch (station_email or tenant_email), else 403
 *  - every change reads the current quantity right before writing, and never goes below 0
 *  - every operation has a unique key (StockOperation). Lines already applied are skipped
 *    on a retry, so a double click / lost connection / resync never applies twice.
 */
const STALE_MS = 15 * 60 * 1000;

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    // An authorized network manager (מנהל רשת מורשה) acts as the network owner
    const user = await actingUser(base44, await base44.auth.me());
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const db = base44.asServiceRole.entities;
    const me = String(user.email || '').toLowerCase();
    const isMe = (e) => !!e && String(e).toLowerCase() === me;
    const now = () => new Date().toISOString();
    const first = async (entity, query) => (await entity.filter(query, undefined, 1))[0] || null;

    // ── Operation log (idempotency) ──
    const getOp = (key) => first(db.StockOperation, { op_key: key });
    const createOp = (key, kind, owner, payload) => db.StockOperation.create({
      op_key: key, kind, status: 'IN_PROGRESS', applied_lines: [], payload,
      tenant_email: owner.tenant_email || null, station_email: owner.station_email || null,
    });
    const isApplied = (op, line) => (op.applied_lines || []).includes(String(line));
    // Saves the line as applied together with the quantity that actually changed (in one write)
    const markLine = async (op, line, actual) => {
      op.applied_lines = [...(op.applied_lines || []), String(line)];
      const patch = { applied_lines: op.applied_lines };
      if (actual !== undefined) {
        op.payload = { ...(op.payload || {}), actual: { ...(op.payload?.actual || {}), [String(line)]: actual } };
        patch.payload = op.payload;
      }
      await db.StockOperation.update(op.id, patch);
    };
    const finishOp = (op) => db.StockOperation.update(op.id, { status: 'DONE' });
    // Two requests with the same key at the same moment (two tabs / two devices): both create an
    // operation, the earliest one wins and the other backs off with 409 — nothing is applied twice.
    const claimOp = async (key, kind, owner, payload) => {
      const mine = await createOp(key, kind, owner, payload);
      const all = await db.StockOperation.filter({ op_key: key }, 'created_date', 20);
      const winner = [...all].sort((a, b) =>
        String(a.created_date || '').localeCompare(String(b.created_date || '')) || String(a.id).localeCompare(String(b.id)))[0];
      if (winner && winner.id !== mine.id) {
        await db.StockOperation.delete(mine.id).catch(() => {});
        throw httpError(409, 'הפעולה כבר מתבצעת ממכשיר אחר — נסו שוב בעוד רגע');
      }
      return mine;
    };

    // ── Warehouse ──
    const loadWarehouse = async (id) => {
      if (!id) throw httpError(400, 'חסר מחסן');
      const w = await first(db.Warehouse, { id });
      if (!w || !(isMe(w.station_email) || isMe(w.tenant_email))) throw httpError(403, 'אין הרשאה למחסן הזה');
      return w;
    };
    const whOwner = (w) => ({ warehouse_id: w.id, tenant_email: w.tenant_email || null, station_email: w.station_email || null });

    // One stock line: reads the fresh row, writes, then records the movement right away
    const applyWarehouseLine = async (w, c, movement) => {
      const query = c.variant_id ? { warehouse_id: w.id, variant_id: c.variant_id } : { warehouse_id: w.id, local_product_id: c.local_product_id };
      const row = await first(db.WarehouseStock, query);
      const before = Number(row?.qty || 0);
      const after = c.set != null ? Math.max(0, Number(c.set)) : Math.max(0, before + Number(c.delta || 0));
      const change = after - before;
      let stockId = row?.id;
      if (row) {
        if (after !== Number(row.qty)) await db.WarehouseStock.update(row.id, { qty: after });
      } else {
        const created = await db.WarehouseStock.create({
          ...whOwner(w), variant_id: c.variant_id || null, local_product_id: c.local_product_id || null,
          product_name: c.product_name || '', variant_label: c.variant_label || '', category_name: c.category_name || '',
          sku: c.sku || '', qty: after,
        });
        stockId = created.id;
      }
      if (change !== 0 || movement.type === 'COUNT') {
        await db.WarehouseStockMovement.create({
          ...whOwner(w), ...movement, stock_id: stockId,
          variant_id: c.variant_id || null, local_product_id: c.local_product_id || null,
          product_name: c.product_name || row?.product_name || '', variant_label: c.variant_label || row?.variant_label || '',
          qty_change: change, qty_after: after, date: now(),
        });
      }
      return change;
    };

    // Branch variant → original network variant (source_id), aggregated per branch variant
    const pickLines = async (order, items) => {
      const byVariant = new Map();
      (items || []).forEach(it => {
        if (!it.variant_id) return;
        const l = byVariant.get(it.variant_id) || {
          k: it.variant_id, nid: it.network_variant_id || null, target: 0, itemsBase: 0,
          product_name: it.product_name, variant_label: it.variant_label, category_name: it.category_name, sku: it.sku,
        };
        l.target += Number(it.picked_qty || 0);
        l.itemsBase += Number(it.warehouse_deducted || 0);
        byVariant.set(it.variant_id, l);
      });
      const lines = [...byVariant.values()];
      const missing = lines.filter(l => !l.nid).map(l => l.k);
      if (missing.length) {
        const vs = await db.ProductVariant.filter({ id: { $in: missing } }, undefined, 2000);
        const src = new Map(vs.map(v => [v.id, v.source_id || v.id]));
        lines.forEach(l => { if (!l.nid) l.nid = src.get(l.k) || l.k; });
      }
      const ded = order.stock_deducted;
      lines.forEach(l => { l.base = ded ? Number(ded[l.k] || 0) : l.itemsBase; });
      return lines;
    };

    const syncOrderReservations = async (order, w, lines) => {
      const desired = new Map();
      lines.forEach(l => {
        const r = Math.max(0, l.target - l.base);
        if (r > 0) desired.set(l.nid, (desired.get(l.nid) || 0) + r);
      });
      const existing = await db.StockReservation.filter({ scope: 'WAREHOUSE', order_id: order.id }, undefined, 1000);
      for (const ex of existing) {
        if (!desired.has(ex.item_key)) await db.StockReservation.delete(ex.id);
        else {
          if (Number(ex.qty) !== desired.get(ex.item_key)) await db.StockReservation.update(ex.id, { qty: desired.get(ex.item_key), touched_at: now() });
          desired.delete(ex.item_key);
        }
      }
      for (const [key, qty] of desired) {
        await db.StockReservation.create({
          scope: 'WAREHOUSE', ...whOwner(w), order_id: order.id, item_key: key, variant_id: key, qty, touched_at: now(),
        });
      }
    };

    const loadOrder = async (id) => {
      const order = await first(db.SupplyOrder, { id });
      if (!order) throw httpError(404, 'ההזמנה לא נמצאה');
      const w = await loadWarehouse(order.warehouse_id);
      return { order, w };
    };

    // Runs (or resumes) the deduction of one picking version
    const runPick = async (order, w, version, items, extra) => {
      const key = `pick:${order.id}:${version}`;
      let op = await getOp(key);
      if (op?.status === 'DONE') return;
      if (!op) {
        const lines = await pickLines(order, items);
        await db.SupplyOrder.update(order.id, { ...extra, items, pick_version: version, stock_status: 'PENDING' });
        op = await claimOp(key, 'PICK', whOwner(w), { lines, picker: extra.picker_name || '' });
      }
      const lines = op.payload?.lines || [];
      for (const l of lines) {
        if (isApplied(op, l.k)) continue;
        const delta = l.target - l.base;
        let change = 0;
        if (delta !== 0) {
          change = await applyWarehouseLine(w, {
            variant_id: l.nid, delta: -delta, product_name: l.product_name, variant_label: l.variant_label,
            category_name: l.category_name, sku: l.sku,
          }, { type: 'PICK', order_id: order.id, order_number: order.order_number, performed_by: op.payload?.picker || '' });
        }
        // What really left the warehouse (stock never goes below 0)
        await markLine(op, l.k, l.base - change);
      }
      // Only now — after the stock was updated — the order is marked as deducted (actual quantities)
      const fresh = await first(db.SupplyOrder, { id: order.id });
      const deducted = { ...(fresh.stock_deducted || {}) };
      const actual = op.payload?.actual || {};
      lines.forEach(l => { deducted[l.k] = actual[l.k] ?? l.target; });
      await db.SupplyOrder.update(order.id, { stock_deducted: deducted, stock_status: 'DONE' });
      await finishOp(op);
      const left = await db.StockReservation.filter({ scope: 'WAREHOUSE', order_id: order.id }, undefined, 1000);
      for (const r of left) await db.StockReservation.delete(r.id);
    };

    // ── Branch / POS ──
    const branchScope = async (branchId) => {
      if (!branchId) return { branch_id: null, station_email: user.email, tenant_email: null };
      const b = await first(db.Branch, { id: branchId });
      if (!b || !(isMe(b.station_email) || isMe(b.tenant_email))) throw httpError(403, 'אין הרשאה לסניף הזה');
      return { branch_id: b.id, station_email: b.station_email, tenant_email: b.tenant_email || null };
    };

    const { action } = body;

    if (action === 'warehouseReceive' || action === 'warehouseCount') {
      const w = await loadWarehouse(body.warehouse_id);
      if (!body.op_key) throw httpError(400, 'חסר מפתח פעולה');
      const isCount = action === 'warehouseCount';
      const key = `${isCount ? 'count' : 'receive'}:${w.id}:${body.op_key}`;
      let op = await getOp(key);
      if (op?.status === 'DONE') return Response.json({ ok: true, already: true });
      const lines = isCount ? [body.item] : (body.lines || []);
      if (!op) op = await claimOp(key, isCount ? 'COUNT' : 'RECEIPT', whOwner(w), {});
      const meta = body.meta || {};
      for (let i = 0; i < lines.length; i++) {
        if (isApplied(op, i)) continue;
        const l = lines[i] || {};
        const change = isCount
          ? (body.type === 'ADJUST' ? { delta: Number(body.value) } : { set: Number(body.value) })
          : { delta: Math.max(0, Number(l.qty || 0)) };
        await applyWarehouseLine(w, { ...l, ...change }, isCount
          ? { type: body.type === 'ADJUST' ? 'ADJUST' : 'COUNT', notes: meta.notes || '', performed_by: meta.performed_by || '' }
          : { type: 'RECEIPT', receipt_id: body.op_key, supplier_name: meta.supplier_name || '', delivery_note: meta.delivery_note || '', notes: meta.notes || '', performed_by: meta.performed_by || '' });
        await markLine(op, i);
      }
      await finishOp(op);
      return Response.json({ ok: true });
    }

    if (action === 'pickReserve') {
      const { order, w } = await loadOrder(body.order_id);
      await syncOrderReservations(order, w, await pickLines(order, order.items));
      return Response.json({ ok: true });
    }

    if (action === 'pickFinish' || action === 'pickComplete') {
      let { order, w } = await loadOrder(body.order_id);
      // A previous version still waiting for its stock update is completed first
      if (order.stock_status === 'PENDING' && order.pick_version && (action === 'pickComplete' || order.pick_version !== body.version)) {
        await runPick(order, w, order.pick_version, order.items, {});
        order = await first(db.SupplyOrder, { id: order.id });
      }
      if (action === 'pickFinish') {
        const version = Number(body.version);
        if (!version) throw httpError(400, 'חסרה גרסת ליקוט');
        await runPick(order, w, version, body.items || [], {
          status: 'PACKED', ready_at: now(), warehouse_notes: body.notes || '', picker_name: body.picker || order.picker_name || '',
        });
      }
      return Response.json({ ok: true, order: await first(db.SupplyOrder, { id: order.id }) });
    }

    if (action === 'posCart') {
      const scope = await branchScope(body.branch_id);
      const device = String(body.device_id || '');
      if (!device) throw httpError(400, 'חסר מזהה מכשיר');
      const want = new Map();
      (body.items || []).slice(0, 300).forEach(it => {
        if (it.variant_id && Number(it.qty) > 0) want.set(it.variant_id, (want.get(it.variant_id) || 0) + Number(it.qty));
      });
      const all = await db.StockReservation.filter({ scope: 'BRANCH', station_email: scope.station_email }, undefined, 2000);
      const t = now();
      const staleBefore = Date.now() - STALE_MS;
      const jobs = [];
      all.forEach(r => {
        if (r.device_id === device) {
          if (!want.has(r.variant_id)) jobs.push(db.StockReservation.delete(r.id));
          else { jobs.push(db.StockReservation.update(r.id, { qty: want.get(r.variant_id), touched_at: t })); want.delete(r.variant_id); }
        } else if (!r.touched_at || new Date(r.touched_at).getTime() < staleBefore) {
          jobs.push(db.StockReservation.delete(r.id)); // abandoned cart / closed computer
        }
      });
      want.forEach((qty, variantId) => jobs.push(db.StockReservation.create({
        scope: 'BRANCH', ...scope, device_id: device, item_key: variantId, variant_id: variantId, qty, touched_at: t,
      })));
      await Promise.all(jobs);
      return Response.json({ ok: true });
    }

    if (action === 'posSale') {
      const csid = String(body.client_sale_id || '');
      if (!csid) throw httpError(400, 'חסר מזהה מכירה');
      const key = `sale:${csid}`;
      let op = await getOp(key);
      if (op?.status === 'DONE') return Response.json({ ok: true, already: true });
      const sale = await first(db.Sale, { client_sale_id: csid });
      if (!sale) throw httpError(404, 'המכירה לא נמצאה');
      if (!(sale.created_by_id === user.id || isMe(sale.station_email) || isMe(sale.tenant_email))) throw httpError(403, 'אין הרשאה למכירה הזו');
      // Branch sale: the caller must belong to that branch (403 otherwise), and only that branch's variants are deducted.
      // Single store: only variants the caller owns.
      const saleScope = sale.branch_id ? await branchScope(sale.branch_id) : null;
      // A branch sells both catalog copies stamped with its branch_id and products the branch's
      // own station account created itself (no branch_id, stamped with the station's email).
      const sameEmail = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
      const canDeduct = (v) => !!v && (saleScope
        ? (v.branch_id === saleScope.branch_id ||
           (!v.branch_id && (sameEmail(v.station_email, saleScope.station_email) || sameEmail(v.created_by, saleScope.station_email))))
        : (v.created_by_id === user.id || isMe(v.station_email) || isMe(v.tenant_email)));
      if (!op) op = await claimOp(key, 'SALE', { tenant_email: sale.tenant_email, station_email: sale.station_email || user.email }, { sale_id: sale.id });
      const items = sale.items || [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it?.variant_id || isApplied(op, i)) continue;
        const v = await first(db.ProductVariant, { id: it.variant_id });
        const allowed = canDeduct(v);
        let removed = 0;
        if (allowed) {
          const before = Number(v.stock || 0);
          const after = Math.max(0, before - Number(it.quantity || 0));
          removed = before - after; // actually deducted, never below 0
          if (after !== before) await db.ProductVariant.update(v.id, { stock: after });
        }
        await markLine(op, i, removed);
      }
      await finishOp(op);
      // The cart reservation of this computer turns into the deduction
      if (body.device_id) {
        const sold = new Set(items.map(i => i?.variant_id).filter(Boolean));
        const resScope = saleScope || (await branchScope(null));
        const mine = await db.StockReservation.filter({
          scope: 'BRANCH', device_id: String(body.device_id), station_email: resScope.station_email,
        }, undefined, 500);
        await Promise.all(mine.filter(r => sold.has(r.variant_id)).map(r => db.StockReservation.delete(r.id)));
      }
      return Response.json({ ok: true });
    }

    // ── Branch receiving (scan of the delivery sheet) ──
    // Adds what arrived to the branch stock (the stock the POS sells from). Runs in rounds of up to
    // max_lines lines; every line is recorded once added, so a retry / second device never adds twice.
    if (action === 'branchReceive') {
      const order = await first(db.SupplyOrder, { id: body.order_id });
      if (!order) throw httpError(404, 'ההזמנה לא נמצאה');
      let scope;
      if (order.branch_id) scope = await branchScope(order.branch_id);
      else if (isMe(order.station_email) || isMe(order.tenant_email)) {
        scope = { branch_id: null, station_email: order.station_email || user.email, tenant_email: order.tenant_email || null };
      } else throw httpError(403, 'אין הרשאה להזמנה הזו');

      const key = `branchReceive:${order.id}`;
      let op = await getOp(key);
      if (order.status === 'RECEIVED' || op?.status === 'DONE') return Response.json({ ok: true, done: true, already: true });
      if (!op && order.status !== 'SENT_TO_BRANCH') throw httpError(409, 'ההזמנה עוד לא נשלחה לסניף');

      const items = order.items || [];
      const sent = Array.isArray(body.lines) ? body.lines : [];
      if (sent.some((l, i) => l?.variant_id && items[i] && l.variant_id !== items[i].variant_id)) {
        throw httpError(409, 'ההזמנה השתנתה — סגרו ופתחו אותה מחדש');
      }
      const qtyOf = (i) => Math.max(0, Math.floor(Number(sent[i]?.received_qty ?? items[i]?.received_qty ?? items[i]?.picked_qty ?? 0))) || 0;

      if (!op) {
        op = await claimOp(key, 'RECEIPT', { tenant_email: order.tenant_email || null, station_email: order.station_email || scope.station_email },
          { order_id: order.id, received: items.map((_, i) => qtyOf(i)) });
      } else {
        // Resumed after an interruption: lines not added yet take the quantities sent now
        const received = items.map((_, i) => (isApplied(op, i) ? Number(op.payload?.received?.[i] || 0) : qtyOf(i)));
        op.payload = { ...(op.payload || {}), received };
        await db.StockOperation.update(op.id, { payload: op.payload });
      }

      const sameMail = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
      const inBranch = (v) => !!v && (scope.branch_id
        ? (v.branch_id === scope.branch_id ||
           (!v.branch_id && (sameMail(v.station_email, scope.station_email) || sameMail(v.created_by, scope.station_email))))
        : (v.created_by_id === user.id || isMe(v.station_email) || isMe(v.tenant_email) || sameMail(v.created_by, scope.station_email)));

      const received = op.payload?.received || [];
      const maxLines = Math.min(50, Math.max(1, Number(body.max_lines) || 25));
      let processed = 0;
      for (let i = 0; i < items.length; i++) {
        if (isApplied(op, i)) continue;
        if (processed >= maxLines) {
          return Response.json({ ok: true, done: false, applied: (op.applied_lines || []).length, total: items.length });
        }
        const it = items[i] || {};
        const qty = Number(received[i] || 0);
        let actual = 0;
        if (it.stock_applied) actual = qty; // already added by the older receiving screen (before it moved here)
        else if (qty > 0 && it.variant_id) {
          const v = await first(db.ProductVariant, { id: it.variant_id });
          if (inBranch(v)) {
            await db.ProductVariant.update(v.id, { stock: Number(v.stock || 0) + qty });
            actual = qty;
          } else {
            actual = null; // not in this branch's catalog — reported back, stock untouched
          }
        }
        await markLine(op, i, actual);
        processed += 1;
      }

      const actualBy = op.payload?.actual || {};
      const missing = [];
      const finalItems = items.map((it, i) => {
        const a = actualBy[String(i)];
        if (a === null) missing.push(`${it.product_name || ''} ${it.variant_label || ''}`.trim());
        return { ...it, received_qty: Number(received[i] || 0), stock_applied: a !== null };
      });
      await db.SupplyOrder.update(order.id, { items: finalItems, status: 'RECEIVED', received_at: now(), received_by: user.email || null });
      await finishOp(op);
      return Response.json({ ok: true, done: true, missing });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
}