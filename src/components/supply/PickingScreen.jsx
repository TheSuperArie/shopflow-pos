import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { ArrowRight, ScanLine, UserRound, CheckCircle2, Loader2, PackageCheck, AlertTriangle, Package } from 'lucide-react';
import { useScanDetector } from '@/hooks/useScanDetector';
import { fetchBranchCatalogRecords } from '@/lib/branchCatalog';
import {
  buildCatalogRows, lineQty, matchScannedCode, matchCartonCode, cartonLocation, compareCartonLocation,
  pickedPercent, isOverPicked, nowIso,
} from '@/lib/supplyOrders';
import { stockOps } from '@/lib/warehouseStock';
import { usePickAvailability } from '@/hooks/usePickAvailability';
import StockWarningDialog from '@/components/stock/StockWarningDialog';
import PickLineDialog from './PickLineDialog';
import PickerSelectDialog from './PickerSelectDialog';

/**
 * Warehouse picking: tap a line (or scan a product) → popup → type how many were packed → confirm.
 * Scanning a carton label opens the same popup with a whole carton counted; every further scan
 * of a carton of that size adds one more carton.
 * Confirmed lines move up to "בוצע" with picked qty and % of the order. Progress is saved on every
 * confirm, so a refresh or another tablet continues where it stopped.
 */
export default function PickingScreen({ order, warehouse, onBack, onFinished }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // An order packed before stock was tracked: what was packed then counts as already deducted,
  // so editing it only changes the stock by the difference
  const legacyPacked = order.status === 'PACKED' && !order.pick_version && !order.stock_deducted;
  const [items, setItems] = useState(() => (order.items || []).map(i => (
    legacyPacked && i.warehouse_deducted == null ? { ...i, warehouse_deducted: Number(i.picked_qty || 0) } : { ...i }
  )));
  // Same version for every retry of "finish" from this screen → the deduction happens once
  const version = useRef((order.pick_version || 0) + 1);
  const availableFor = usePickAvailability(warehouse, order);
  const [stockWarn, setStockWarn] = useState(null); // { available, description, onConfirm }
  const [picker, setPicker] = useState(null); // chosen on entry every time
  const [active, setActive] = useState(null); // { index } | { extraRow }
  const [qty, setQty] = useState('');
  const [choices, setChoices] = useState(null); // several sizes matched one scan
  const [cartonSize, setCartonSize] = useState({}); // variant_id → shirts per carton (read from scanned labels)
  const [notes, setNotes] = useState(order.warehouse_notes || '');
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const snapshot = useRef('');

  // The branch catalog — only needed to recognise a scanned product that isn't in the order
  const { data: catalogRows = [] } = useQuery({
    queryKey: ['picking-branch-catalog', order.branch_id],
    queryFn: async () => {
      const [branch] = await base44.entities.Branch.filter({ id: order.branch_id });
      if (!branch) return [];
      const [variants, groups, categories] = await Promise.all([
        fetchBranchCatalogRecords(base44.entities.ProductVariant, branch),
        fetchBranchCatalogRecords(base44.entities.ProductGroup, branch),
        fetchBranchCatalogRecords(base44.entities.Category, branch),
      ]);
      return buildCatalogRows(variants, groups, categories);
    },
    staleTime: 600000,
  });

  // Carton number / carton barcode come from the branch catalog (order lines saved before they existed)
  const catalogById = new Map(catalogRows.map(r => [r.variant_id, r]));
  const withCatalog = (it) => {
    const c = catalogById.get(it.variant_id);
    return c ? { ...it, carton_number: c.carton_number, carton_barcode: c.carton_barcode, size: c.size } : it;
  };
  const locationOf = (it) => cartonLocation(withCatalog(it));

  const isDone = (it) => it.picked_qty != null;
  const done = items.map((it, index) => ({ it, index })).filter(x => isDone(x.it))
    .sort((a, b) => String(b.it.picked_at || '').localeCompare(String(a.it.picked_at || '')));
  // To pick: in the order the picker walks the warehouse — carton, then size (no carton → last)
  const todo = items.map((it, index) => ({ it, index })).filter(x => !isDone(x.it) && !x.it.extra)
    .sort((a, b) => compareCartonLocation(withCatalog(a.it), withCatalog(b.it)));
  const orderedUnits = items.reduce((s, i) => s + lineQty(i), 0);
  const pickedUnits = items.reduce((s, i) => s + Number(i.picked_qty || 0), 0);
  const orderLines = items.filter(i => !i.extra).length;
  const doneLines = items.filter(i => !i.extra && isDone(i)).length;

  const activeLine = active ? (active.extraRow || items[active.index]) : null;

  const persist = async (nextItems, extra = {}) => {
    setSaving(true);
    try {
      await base44.entities.SupplyOrder.update(order.id, { items: nextItems, ...extra });
      queryClient.invalidateQueries({ queryKey: ['supply-orders-warehouse'] });
      return true;
    } catch (err) {
      toast({ title: 'השמירה נכשלה — בדוק חיבור לאינטרנט', description: err?.message, variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openLine = (index) => {
    setChoices(null);
    setActive({ index });
    setQty(items[index].picked_qty != null ? String(items[index].picked_qty) : '');
  };

  const openExtra = (row) => {
    setChoices(null);
    // Already added as an extra line before? edit that one
    const existing = items.findIndex(i => i.variant_id === row.variant_id);
    if (existing >= 0) return openLine(existing);
    setActive({ extraRow: { ...row, extra: true, requested_qty: 0, qty: 0 } });
    setQty('');
    return undefined;
  };

  // Already deducted from the warehouse for this branch variant (server-side record, or legacy line field)
  const deductedFor = (line) => (order.stock_deducted
    ? Number(order.stock_deducted[line.variant_id] || 0)
    : Number(line.warehouse_deducted || 0));

  const confirm = async (qtyValue = qty) => {
    if (!activeLine) return;
    const n = Math.max(0, parseInt(qtyValue, 10) || 0);
    const act = active;
    const line = activeLine;
    // Packing more than is free in the warehouse → warn, the picker may still confirm
    if (line.variant_id && n > Number(line.picked_qty || 0)) {
      const need = n - deductedFor(line);
      const free = need > 0 ? await availableFor(line.variant_id).catch(() => Infinity) : Infinity;
      if (need > free) {
        setStockWarn({
          available: Math.max(0, free),
          description: `${line.product_name || ''} ${line.variant_label ? `· ${line.variant_label}` : ''}`,
          onConfirm: () => applyConfirm(n, act),
        });
        return;
      }
    }
    await applyConfirm(n, act);
  };

  const applyConfirm = async (n, act) => {
    let next;
    if (act.extraRow) {
      if (n === 0) { setActive(null); return; }
      next = [...items, { ...act.extraRow, picked_qty: n, picked_at: nowIso() }];
    } else {
      next = items.map((it, i) => (i === act.index ? { ...it, picked_qty: n, picked_at: nowIso() } : it));
    }
    setItems(next);
    setActive(null);
    setQty('');
    const ok = await persist(next);
    // Confirmed quantity is reserved in the warehouse (in the background — never blocks the picker)
    if (ok) {
      stockOps('pickReserve', { order_id: order.id })
        .then(() => queryClient.invalidateQueries({ queryKey: ['warehouse-reservations', warehouse.id] }))
        .catch(() => {});
    }
  };

  // ── Scanner ──
  // A carton label → the order line (or a catalog product not in the order) + shirts per carton
  const findCarton = (code) => {
    const inOrder = matchCartonCode(code, items.map((it, index) => ({ ...withCatalog(it), index })));
    if (inOrder.length === 1) return { index: inOrder[0].row.index, variant_id: inOrder[0].row.variant_id, units: inOrder[0].units };
    if (inOrder.length > 1) return null;
    const inCatalog = matchCartonCode(code, catalogRows);
    if (inCatalog.length === 1) return { extraRow: inCatalog[0].row, variant_id: inCatalog[0].row.variant_id, units: inCatalog[0].units };
    return null;
  };

  // One carton = its units (or 1 when the label doesn't say). Same line already open → one more carton.
  const addCarton = async (hit) => {
    const step = hit.units || 1;
    if (hit.units) setCartonSize(s => ({ ...s, [hit.variant_id]: hit.units }));
    const isOpen = active && (hit.extraRow
      ? active.extraRow?.variant_id === hit.variant_id
      : !active.extraRow && active.index === hit.index);
    if (isOpen) {
      setQty(q => String((parseInt(snapshot.current || q, 10) || 0) + step));
      return;
    }
    // A different line is open → save it first (if a qty was typed), like a product scan
    if (active && snapshot.current !== '') await confirm(snapshot.current);
    else if (active) setActive(null);
    if (hit.extraRow) {
      openExtra(hit.extraRow);
      setQty(String(step));
      return;
    }
    openLine(hit.index);
    setQty(String(Number(items[hit.index].picked_qty || 0) + step));
  };

  const handleScan = async (code) => {
    // Digits the scanner "typed" into the open popup are undone
    if (active) setQty(snapshot.current);
    const carton = findCarton(code);
    if (carton) return addCarton(carton);
    const inOrder = matchScannedCode(code, items.map((it, index) => ({ ...it, index })));
    const target = inOrder.length === 1 ? inOrder[0] : null;

    // Same product scanned again while its popup is open → +1
    if (active && target && !active.extraRow && target.index === active.index) {
      setQty(q => String((parseInt(snapshot.current || q, 10) || 0) + 1));
      return;
    }
    // A different product while a popup is open → save the current one first (if a qty was typed)
    if (active && snapshot.current !== '') await confirm(snapshot.current);
    else if (active) setActive(null);

    if (inOrder.length === 1) return openLine(inOrder[0].index);
    if (inOrder.length > 1) return setChoices(inOrder.map(r => ({ ...r, source: 'order' })));

    const inCatalog = matchScannedCode(code, catalogRows);
    if (inCatalog.length === 1) return openExtra(inCatalog[0]);
    if (inCatalog.length > 1) return setChoices(inCatalog.map(r => ({ ...r, source: 'catalog' })));
    toast({ title: `ברקוד לא נמצא: ${code}`, variant: 'destructive', duration: 2500 });
    return undefined;
  };

  useScanDetector({
    enabled: !!picker && !finishing,
    onScan: handleScan,
    onBurstStart: () => { snapshot.current = qty; },
    onKey: (k) => {
      if (!active) return;
      if (k === 'Enter') confirm();
      else if (k === 'Backspace') setQty(q => String(q || '').slice(0, -1));
      else if (/^\d$/.test(k)) setQty(q => `${q === '0' ? '' : q || ''}${k}`.slice(0, 5));
    },
  });

  const choosePicker = async (name) => {
    setPicker(name);
    const patch = { picker_name: name };
    if (order.status === 'SENT_TO_WAREHOUSE') {
      patch.status = 'PICKING';
      patch.picking_started_at = nowIso();
    }
    try {
      await base44.entities.SupplyOrder.update(order.id, patch);
      queryClient.invalidateQueries({ queryKey: ['supply-orders-warehouse'] });
    } catch { /* the picker name is saved again when the order is finished */ }
  };

  const finish = async () => {
    setFinishing(true);
    // Lines never confirmed are recorded as 0 packed
    const pickedItems = items.map(it => (it.picked_qty == null ? { ...it, picked_qty: 0 } : it));
    // The server saves the order, deducts only what wasn't deducted yet (safe for "ערוך ליקוט"),
    // and marks it deducted only after the stock was updated. A retry with the same version is applied once.
    try {
      const res = await stockOps('pickFinish', {
        order_id: order.id, items: pickedItems, notes: notes.trim(), picker, version: version.current,
      });
      setConfirmFinish(false);
      toast({ title: `הזמנה #${order.order_number} נארזה` });
      onFinished(res.order);
    } catch (err) {
      toast({
        title: 'סיום ההזמנה לא הושלם — לחצו שוב',
        description: `${err.message}. לחיצה חוזרת לא תוריד מלאי פעמיים.`,
        variant: 'destructive',
      });
    } finally {
      setFinishing(false);
      queryClient.invalidateQueries({ queryKey: ['supply-orders-warehouse'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-reservations'] });
    }
  };

  return (
    <div className="space-y-4 pb-10">
      {/* Header */}
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 text-base">
            <ArrowRight className="w-5 h-5" /> יציאה מליקוט
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-gray-900">{order.branch_name} · הזמנה #{order.order_number}</p>
          </div>
          {picker && (
            <button onClick={() => setPicker(null)} className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
              <UserRound className="w-4 h-4" /> {picker}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-3 py-1 text-green-700 font-medium">
            <ScanLine className="w-4 h-4" /> הסורק פעיל — סרוק מוצר, קרטון או לחץ על שורה
          </span>
          <span className="text-gray-600">שורות: <strong>{doneLines}/{orderLines}</strong></span>
          <span className="text-gray-600">יחידות: <strong>{pickedUnits}/{orderedUnits}</strong></span>
          {saving && <span className="flex items-center gap-1 text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> שומר…</span>}
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${orderLines ? (doneLines / orderLines) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Done */}
      {done.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-lg font-bold text-green-700"><CheckCircle2 className="w-5 h-5" /> בוצע ({done.length})</h3>
          <div className="rounded-2xl border bg-white divide-y">
            {done.map(({ it, index }) => {
              const pct = pickedPercent(it);
              const red = isOverPicked(it);
              return (
                <button key={`${it.variant_id}-${index}`} onClick={() => openLine(index)}
                  className={`w-full text-right grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-3 min-h-[60px] hover:bg-gray-50 ${red ? 'bg-red-50' : ''}`}>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{it.product_name} · {it.variant_label || '—'}</p>
                    <p className="text-xs text-gray-500 font-mono">{it.sku || '—'}{it.extra ? ' · לא בהזמנה' : ''}</p>
                  </div>
                  <span className="text-sm text-gray-500 text-center">הוזמן<br /><strong className="text-base text-gray-800">{lineQty(it)}</strong></span>
                  <span className={`text-sm text-center ${red ? 'text-red-600' : 'text-gray-500'}`}>לוקט<br /><strong className="text-base">{it.picked_qty}</strong></span>
                  <span className={`min-w-[64px] text-center rounded-xl px-2 py-1.5 text-base font-bold ${
                    red ? 'bg-red-100 text-red-700' : pct >= 100 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {pct == null ? '—' : `${pct}%`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* To pick */}
      <section className="space-y-2">
        <h3 className="text-lg font-bold text-gray-800">ללקט ({todo.length})</h3>
        {todo.length === 0 ? (
          <p className="rounded-2xl border bg-white py-8 text-center text-gray-400">כל השורות לוקטו 🎉</p>
        ) : (
          <div className="rounded-2xl border bg-white divide-y">
            {todo.map(({ it, index }) => (
              <button key={`${it.variant_id}-${index}`} onClick={() => openLine(index)}
                className="w-full text-right flex items-center gap-3 px-4 py-3 min-h-[68px] hover:bg-blue-50 active:bg-blue-100">
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-semibold text-gray-900 truncate">{it.product_name} · {it.variant_label || '—'}</p>
                  <p className="text-sm text-gray-500 font-mono">{it.sku || '—'}{it.category_name ? ` · ${it.category_name}` : ''}</p>
                </div>
                {locationOf(it) && (
                  <span className="flex items-center gap-1.5 rounded-xl bg-amber-50 border-2 border-amber-300 px-3 py-2 text-amber-900 text-lg font-bold shrink-0">
                    <Package className="w-5 h-5" /> {locationOf(it)}
                  </span>
                )}
                <span className="text-center rounded-xl bg-blue-50 px-4 py-2">
                  <span className="block text-xs text-blue-700">צריך</span>
                  <span className="block text-2xl font-bold text-blue-900">{lineQty(it)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Finish */}
      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <label className="text-base font-semibold text-gray-700">הערות לליקוט</label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="לדוגמה: חסר במחסן, יגיע בשבוע הבא" className="text-base" />
        {confirmFinish ? (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 space-y-3">
            {todo.length > 0 && (
              <p className="flex items-center gap-2 text-amber-800 font-medium">
                <AlertTriangle className="w-5 h-5" /> {todo.length} שורות לא לוקטו — יירשמו כ-0 שנארז.
              </p>
            )}
            <p className="text-gray-700">לסיים את ההזמנה? {pickedUnits} יחידות נארזו מתוך {orderedUnits}.</p>
            <div className="flex gap-2">
              <Button onClick={finish} disabled={finishing} className="h-12 px-6 text-base bg-green-600 hover:bg-green-700 gap-2">
                {finishing ? <Loader2 className="w-5 h-5 animate-spin" /> : <PackageCheck className="w-5 h-5" />} כן, סיים הזמנה
              </Button>
              <Button variant="outline" onClick={() => setConfirmFinish(false)} className="h-12 px-6 text-base">חזור</Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setConfirmFinish(true)} className="w-full h-14 text-lg gap-2 bg-green-600 hover:bg-green-700">
            <PackageCheck className="w-6 h-6" /> סיים הזמנה
          </Button>
        )}
      </section>

      {!picker && (
        <PickerSelectDialog warehouse={warehouse} current={order.picker_name} onSelect={choosePicker} onCancel={onBack} />
      )}

      {picker && choices && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
          <div className="w-full max-w-lg bg-white rounded-3xl p-5 space-y-3">
            <p className="text-xl font-bold">איזו מידה?</p>
            <div className="grid gap-2 max-h-[60vh] overflow-y-auto">
              {choices.map(c => (
                <button key={c.variant_id} onClick={() => (c.source === 'order' ? openLine(c.index) : openExtra(c))}
                  className="text-right rounded-2xl border-2 px-4 py-3 text-lg hover:border-blue-400">
                  <strong>{c.product_name}</strong> · {c.variant_label || '—'}
                  {c.source === 'catalog' && <span className="text-sm text-red-600"> (לא בהזמנה)</span>}
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={() => setChoices(null)} className="w-full h-12">ביטול</Button>
          </div>
        </div>
      )}

      {picker && activeLine && (
        <PickLineDialog
          line={activeLine}
          qty={qty}
          cartonSize={cartonSize[activeLine.variant_id]}
          cartonLocation={locationOf(activeLine)}
          onQtyChange={setQty}
          onConfirm={() => confirm()}
          onCancel={() => { setActive(null); setQty(''); }}
          saving={saving}
        />
      )}

      {stockWarn && (
        <StockWarningDialog
          available={stockWarn.available}
          description={stockWarn.description}
          onConfirm={() => { const fn = stockWarn.onConfirm; setStockWarn(null); fn(); }}
          onCancel={() => setStockWarn(null)}
        />
      )}
    </div>
  );
}