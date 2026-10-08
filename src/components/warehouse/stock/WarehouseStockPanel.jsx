import React, { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import {
  Loader2, Search, LayoutGrid, Table2, Boxes, Package, Layers, Lock, PackageX, History, ScanLine, X, ArrowRight, Download, FileSpreadsheet,
} from 'lucide-react';
import { useWarehouseInventory } from '@/hooks/useWarehouseInventory';
import { useScanDetector } from '@/hooks/useScanDetector';
import { stockOps, newOpKey } from '@/lib/warehouseStock';
import { buildInventoryIndex } from '@/lib/inventory';
import { matchScannedCode, matchCartonCode } from '@/lib/supplyOrders';
import { downloadStockExcel } from '@/lib/stockExport';
import { CatalogTiles, TriCheck } from '@/components/inventory/InventoryTiles';
import BulkStockBar from '@/components/inventory/BulkStockBar';
import StockTable from './StockTable';
import WarehouseSizeTiles from './WarehouseSizeTiles';
import StockCountDialog, { countAfter, countFormValid } from './StockCountDialog';
import MovementsList from './MovementsList';

// Default = correction (+/-): adds to what's recorded. "ספירת מלאי" (replace) only after a warning in the dialog
const emptyForm = { mode: 'ADJUST', value: '', notes: '' };
const LOCAL_CAT = { id: '__wh_local__', name: 'מוצרי מחסן', sort_order: 99999 };
const PARALLEL = 5;
const sizeCollator = new Intl.Collator('he', { numeric: true });

/** The warehouse's shortage line for the Excel export (settings → "ייצוא חוסרים"; 0 = only sold out). */
const shortageThreshold = (warehouse) => Math.max(0, Number(warehouse?.shortage_threshold) || 0);

/** Excel file of every size at/below the shortage line, by carton. */
const exportShortages = (items, warehouse) => {
  const limit = shortageThreshold(warehouse);
  return downloadStockExcel(items.filter(i => i.qty <= limit), { fileTitle: 'חוסרים', place: warehouse?.name || 'מחסן', withReserved: true });
};

/**
 * Warehouse stock — the same square-tiles screen as the branches (category → product → sizes,
 * multi-select + bottom bar), plus a table view and the movements history.
 * The scanner is always on: a carton label adds a whole carton, a single shirt adds 1.
 * Every change goes through the server (stockOps) so picking reservations stay correct.
 * readOnly: the network owner's view — same tiles, no scanner, no selection, no editing.
 */
export default function WarehouseStockPanel({ warehouse, readOnly = false }) {
  const { items, groups, categories, isLoading } = useWarehouseInventory(warehouse);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState('stock');
  const [view, setView] = useState('tiles');
  const [path, setPath] = useState([]);
  const [productId, setProductId] = useState(null);
  const [search, setSearch] = useState('');
  const [onlyOut, setOnlyOut] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [openedByScan, setOpenedByScan] = useState(false);
  const [cartonSize, setCartonSize] = useState({}); // item key → shirts per carton (read from scanned labels)
  // item key → what was counted for it on this page so far, so returning to a size continues
  // from that number instead of starting over (and overwriting the earlier count)
  const [counted, setCounted] = useState({});
  const opKey = useRef(null); // one key per opened dialog — a retried save is applied once
  // What the qty box / search box held when a key burst began — a scan typed into them is undone
  const snapshot = useRef({ value: '', search: '' });
  const scanBusy = useRef(false); // a scan is saving the previous size — the next one waits

  // ── Tiles index: network catalog groups + one pseudo product per warehouse-only item ──
  const { index, itemByKey } = useMemo(() => {
    const known = new Set(groups.map(g => g.id));
    const extra = new Map();
    const variants = items.map(it => {
      let gid = it.group_id;
      if (!gid || !known.has(gid)) {
        gid = `__wh__:${it.product_name || 'מוצר'}`;
        if (!extra.has(gid)) extra.set(gid, { id: gid, name: it.product_name || 'מוצר', category_id: LOCAL_CAT.id });
      }
      return { id: it.key, group_id: gid, dimensions: { size: it.variant_label }, stock: it.qty, sku: it.sku };
    });
    return {
      index: buildInventoryIndex({
        categories: extra.size ? [...categories, LOCAL_CAT] : categories,
        groups: [...groups, ...extra.values()],
        variants,
        globalThreshold: 1, // the warehouse has no shortage threshold — only "out of stock" counts
      }),
      itemByKey: new Map(items.map(i => [i.key, i])),
    };
  }, [items, groups, categories]);

  const kpi = useMemo(() => ({
    units: items.reduce((s, i) => s + i.qty, 0),
    products: index.groupById.size,
    sizes: items.length,
    reserved: items.reduce((s, i) => s + (i.reserved || 0), 0),
    out: items.filter(i => i.qty <= 0).length,
  }), [items, index]);

  const onToggle = (ids, on) => {
    if (readOnly) return;
    setSelected(prev => {
      const next = new Set(prev);
      ids.forEach(id => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  };

  // ── Count window (one size) ──
  const openItem = (item, { add = 0, byScan = false } = {}) => {
    opKey.current = newOpKey();
    // Opens as an addition — an earlier count of this size is picked up only if the user switches to "ספירת מלאי"
    setForm({ ...emptyForm, value: add ? String(add) : '' });
    setOpenedByScan(byScan);
    setEditing(item);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['warehouse-stock', warehouse.id] });
    queryClient.invalidateQueries({ queryKey: ['warehouse-movements', warehouse.id] });
  };

  const itemPayload = (t) => ({
    variant_id: t.variant_id, local_product_id: t.local_product_id, product_name: t.product_name,
    variant_label: t.variant_label, category_name: t.category_name, sku: t.sku,
  });

  const save = async ({ type, newQty, notes }, target = editing) => {
    try {
      await stockOps('warehouseCount', {
        warehouse_id: warehouse.id, op_key: opKey.current, type,
        value: type === 'ADJUST' ? newQty - target.qty : newQty,
        item: itemPayload(target),
        meta: { notes, performed_by: 'מנהל המחסן' },
      });
      refresh();
      if (type === 'COUNT' || counted[target.key] != null) setCounted(c => ({ ...c, [target.key]: newQty }));
      toast({ title: `המלאי עודכן${target.variant_label ? ` · ${target.variant_label}` : ''} → ${newQty}` });
      setEditing(null);
      return true;
    } catch (e) {
      toast({ title: 'העדכון נכשל', description: e?.message, variant: 'destructive' });
      return false;
    }
  };

  // ── Bottom bar: add to / set the stock of every selected size ──
  const applyBulk = async (mode, value) => {
    const list = [...selected].map(k => itemByKey.get(k)).filter(Boolean);
    if (!list.length) return;
    setBusy(true);
    setProgress(0);
    let finished = 0;
    let failed = 0;
    for (let i = 0; i < list.length; i += PARALLEL) {
      const chunk = list.slice(i, i + PARALLEL);
      const results = await Promise.allSettled(chunk.map(t => stockOps('warehouseCount', {
        warehouse_id: warehouse.id, op_key: newOpKey(),
        type: mode === 'add' ? 'ADJUST' : 'COUNT',
        value: Number(value),
        item: itemPayload(t),
        meta: { notes: mode === 'add' ? 'הוספה לכמה מידות יחד' : 'קביעת כמות לכמה מידות יחד', performed_by: 'מנהל המחסן' },
      })));
      failed += results.filter(r => r.status === 'rejected').length;
      finished += chunk.length;
      setProgress(Math.round((finished / list.length) * 100));
    }
    refresh();
    setBusy(false);
    if (failed) {
      toast({ title: `${failed} מידות לא עודכנו — בדוק ונסה שוב`, variant: 'destructive' });
    } else {
      toast({ title: `המלאי עודכן (${list.length} מידות)` });
      setSelected(new Set());
    }
  };

  // ── Scanner: a carton label adds a whole carton, a single shirt adds 1 ──
  const addScanned = async (item, step, units) => {
    if (units) setCartonSize(s => ({ ...s, [item.key]: units }));
    if (editing && editing.key === item.key) {
      // Start from what the box held before the scanner typed into it
      setForm(f => ({ ...f, value: String((parseInt(snapshot.current.value ?? f.value, 10) || 0) + step) }));
      return;
    }
    // Another size is open → save its count first (if one was entered), then open this one
    if (editing) {
      const prev = { ...form, value: snapshot.current.value ?? form.value };
      if (countFormValid(prev)) {
        scanBusy.current = true;
        try {
          const ok = await save({ type: prev.mode, newQty: countAfter(editing, prev), notes: prev.notes.trim() }, editing);
          if (!ok) return;
        } finally {
          scanBusy.current = false;
        }
      } else {
        setEditing(null);
      }
    }
    openItem(item, { add: step, byScan: true });
  };

  const handleScan = (code) => {
    // Undo whatever the scanner typed into a focused box
    setSearch(snapshot.current.search);
    if (editing) setForm(f => ({ ...f, value: snapshot.current.value }));
    if (scanBusy.current) {
      toast({ title: 'רגע — שומר את המידה הקודמת', description: 'סרוק שוב בעוד שנייה', variant: 'destructive' });
      return;
    }
    const carton = matchCartonCode(code, items);
    if (carton.length === 1) return addScanned(carton[0].row, carton[0].units || 1, carton[0].units);
    const hits = matchScannedCode(code, items);
    if (hits.length === 1) return addScanned(hits[0], 1, null);
    if (hits.length > 1) {
      toast({ title: 'הברקוד מתאים לכמה מידות', description: 'לחץ על המידה הנכונה', variant: 'destructive' });
      return;
    }
    toast({ title: 'ברקוד לא נמצא', description: code, variant: 'destructive' });
  };

  useScanDetector({
    enabled: !readOnly && !!warehouse?.id && tab === 'stock',
    onScan: handleScan,
    onBurstStart: () => { snapshot.current = { value: form.value, search }; },
  });

  // ── What the tiles show ──
  const q = search.trim().toLowerCase();
  const filtering = !!q || onlyOut;
  const matches = (it) => (!onlyOut || it.qty <= 0) &&
    (!q || [it.product_name, it.variant_label, it.sku, it.barcode, it.carton_number && `קרטון ${it.carton_number}`]
      .some(x => String(x || '').toLowerCase().includes(q)));
  const sizesOf = (gid) => index.variantsOf(gid).map(v => itemByKey.get(v.id)).filter(Boolean)
    .sort((a, b) => sizeCollator.compare(a.variant_label || '', b.variant_label || ''));
  const openProduct = productId ? index.groupById.get(productId) : null;
  const selectedItems = [...selected].map(k => itemByKey.get(k)).filter(Boolean);

  if (isLoading) {
    return <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  const kpis = [
    { label: 'יחידות במלאי', value: kpi.units, icon: Boxes, tone: 'bg-gray-50 text-gray-800' },
    { label: 'מוצרים', value: kpi.products, icon: Package, tone: 'bg-gray-50 text-gray-800' },
    { label: 'מידות', value: kpi.sizes, icon: Layers, tone: 'bg-gray-50 text-gray-800' },
    { label: 'משוריין לליקוט', value: kpi.reserved, icon: Lock, tone: 'bg-indigo-50 text-indigo-800' },
    { label: 'אזלו', value: kpi.out, icon: PackageX, tone: 'bg-red-50 text-red-700', onClick: () => { setTab('stock'); setOnlyOut(true); setProductId(null); } },
  ];

  return (
    <div className={`space-y-5 ${readOnly ? '' : 'pb-28'}`} dir="rtl">
      {/* KPI squares */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {kpis.map(k => (
          <button key={k.label} onClick={k.onClick} disabled={!k.onClick}
            className={`aspect-square sm:aspect-auto sm:h-28 rounded-2xl border p-3 flex flex-col items-center justify-center gap-1 ${k.tone} ${k.onClick ? 'hover:shadow-md cursor-pointer' : 'cursor-default'}`}>
            <k.icon className="w-5 h-5 opacity-70" />
            <span className="text-2xl font-bold leading-none">{k.value.toLocaleString()}</span>
            <span className="text-xs opacity-80">{k.label}</span>
          </button>
        ))}
      </div>

      {/* Tabs (the network owner's screen has its own movements tab) */}
      {!readOnly && (
        <div className="flex border-b gap-1 overflow-x-auto">
          {[{ key: 'stock', label: 'מלאי', icon: Boxes }, { key: 'history', label: 'תנועות מלאי', icon: History }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap ${tab === t.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'history' && <MovementsList warehouseId={warehouse.id} />}

      {tab === 'stock' && (
        <div className="space-y-4">
          {!readOnly && (
            <p className="flex items-center gap-1.5 w-fit rounded-full bg-green-50 border border-green-200 px-3 py-1 text-sm text-green-700 font-medium">
              <ScanLine className="w-4 h-4" /> הסורק פעיל — סריקה פותחת את המידה: כל קרטון שנסרק מתווסף (חולצה = 1) על מה שרשום. להחלפת הכמות — "ספירת מלאי" בחלון
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder='חיפוש לפי מוצר, מידה, מק"ט או קרטון' className="pr-9" data-scan-capture />
            </div>
            <button onClick={() => setOnlyOut(v => !v)}
              className={`rounded-full border px-3 py-1.5 text-sm ${onlyOut ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600'}`}>
              רק מה שאזל
            </button>
            <button
              onClick={() => {
                const n = exportShortages(items, warehouse);
                const limit = shortageThreshold(warehouse);
                const what = limit ? `עם מלאי עד ${limit}` : 'שאזלו';
                toast({ title: n ? `ירד קובץ אקסל עם ${n} מידות ${what}` : `אין מידות ${what}` });
              }}
              title={shortageThreshold(warehouse) ? `מידות שהמלאי שלהן עד ${shortageThreshold(warehouse)} — משנים בהגדרות המחסן` : 'מידות שאזלו — את הסף משנים בהגדרות המחסן'}
              className="flex items-center gap-1.5 rounded-full border border-green-300 bg-green-50 px-3 py-1.5 text-sm text-green-800 hover:bg-green-100">
              <Download className="w-4 h-4" /> ייצוא חוסרים לאקסל
            </button>
            <button
              onClick={() => {
                const n = downloadStockExcel(items.filter(i => i.qty > 0), { fileTitle: 'מלאי', place: warehouse?.name || 'מחסן', withReserved: true });
                toast({ title: n ? `ירד קובץ אקסל עם ${n} מידות שיש במלאי` : 'אין כרגע מלאי במחסן' });
              }}
              title="כל המידות שיש מהן במלאי, מסודר לפי מספר קרטון"
              className="flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm text-blue-800 hover:bg-blue-100">
              <FileSpreadsheet className="w-4 h-4" /> ייצוא מלאי לאקסל
            </button>
            {filtering && (
              <button onClick={() => { setSearch(''); setOnlyOut(false); }} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
                <X className="w-4 h-4" /> נקה
              </button>
            )}
            <div className="flex rounded-xl border bg-white p-1 mr-auto">
              <button onClick={() => setView('tiles')} className={`rounded-lg p-2 ${view === 'tiles' ? 'bg-gray-900 text-white' : 'text-gray-500'}`} title="תצוגת ריבועים"><LayoutGrid className="w-4 h-4" /></button>
              <button onClick={() => setView('table')} className={`rounded-lg p-2 ${view === 'table' ? 'bg-gray-900 text-white' : 'text-gray-500'}`} title="תצוגת טבלה"><Table2 className="w-4 h-4" /></button>
            </div>
          </div>

          {view === 'table' ? (
            <StockTable items={items.filter(matches)} isLoading={false} onEdit={readOnly ? undefined : (it) => openItem(it)} />
          ) : filtering ? (
            <WarehouseSizeTiles items={items.filter(matches).sort((a, b) =>
              (a.product_name || '').localeCompare(b.product_name || '', 'he') || sizeCollator.compare(a.variant_label || '', b.variant_label || ''))}
              selected={selected} onToggle={onToggle} onEdit={(it) => openItem(it)} showProduct readOnly={readOnly} />
          ) : openProduct ? (
            <div className="space-y-4">
              <button onClick={() => setProductId(null)} className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200">
                <ArrowRight className="w-4 h-4" /> חזרה
              </button>
              <div className="rounded-2xl border bg-white p-4 flex flex-wrap items-center gap-4">
                {openProduct.image_url
                  ? <img src={openProduct.image_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
                  : <div className="w-16 h-16 rounded-xl bg-blue-50 flex items-center justify-center"><Package className="w-8 h-8 text-blue-500" /></div>}
                <div className="flex-1 min-w-0">
                  <p className="text-xl font-bold text-gray-900">{openProduct.name}</p>
                  <p className="text-sm text-gray-500">{index.productStats(openProduct).sizes} מידות · {index.productStats(openProduct).units} יחידות</p>
                </div>
                {!readOnly && <TriCheck ids={sizesOf(openProduct.id).map(i => i.key)} selected={selected} onToggle={onToggle} />}
              </div>
              <WarehouseSizeTiles items={sizesOf(openProduct.id)} selected={selected} onToggle={onToggle} onEdit={(it) => openItem(it)} readOnly={readOnly} />
              {!readOnly && <p className="text-xs text-gray-400">לחיצה על מידה מסמנת אותה (לעדכון כמה יחד מהסרגל התחתון). העיפרון פותח ספירה למידה אחת.</p>}
            </div>
          ) : (
            <CatalogTiles index={index} path={path} setPath={setPath} onOpenProduct={setProductId} selected={selected} onToggle={onToggle} hideChecks={readOnly} />
          )}
        </div>
      )}

      {!readOnly && (
        <BulkStockBar
          count={selectedItems.length}
          units={selectedItems.reduce((s, i) => s + i.qty, 0)}
          busy={busy}
          progress={progress}
          onApply={applyBulk}
          onOrder={null}
          onClear={() => setSelected(new Set())}
          stockNote="המלאי של המחסן מתעדכן דרך השרת, וכל שינוי נרשם בתנועות המלאי."
        />
      )}

      {!readOnly && editing && (
        <StockCountDialog
          item={editing}
          form={form}
          onFormChange={setForm}
          cartonSize={cartonSize[editing.key]}
          openedByScan={openedByScan}
          previouslyCounted={counted[editing.key]}
          onClose={() => setEditing(null)}
          onSave={(data) => save(data)}
        />
      )}
    </div>
  );
}
