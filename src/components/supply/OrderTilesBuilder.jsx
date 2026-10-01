import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  Search, LayoutGrid, Table2, X, ScanLine, Package, ArrowRight, Check, Plus, Minus, Equal, TrendingUp, Trash2, AlertTriangle,
} from 'lucide-react';
import { CatalogTiles, Tile, TriCheck } from '@/components/inventory/InventoryTiles';
import { stockStatus, variantLabel, buildInventoryIndex } from '@/lib/inventory';
import { buildCatalogRows, matchScannedCode } from '@/lib/supplyOrders';
import { useScanDetector } from '@/hooks/useScanDetector';
import SupplyOrderBuilder from './SupplyOrderBuilder';

const collator = new Intl.Collator('he', { numeric: true });

/**
 * Filling a supply order with the same square tiles as the inventory screen.
 * Used by the branch ("הזמנה חדשה") and by the network master (editing a branch's order).
 *
 *  quantities = { [variant_id]: qty }  — controlled by the parent
 *  requested  = { [variant_id]: qty }  — optional, what the branch asked for (network side)
 *  scanEnabled — a barcode scan adds +1 of that size (a product's general barcode opens its sizes)
 */
export default function OrderTilesBuilder({
  index: fullIndex, categories = [], groups = [], variants = [], quantities, onChange, requested = null, scanEnabled = true,
  initialShortOnly = false,
}) {
  const { toast } = useToast();
  const [view, setView] = useState('tiles');
  const [path, setPath] = useState([]);
  const [productId, setProductId] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | ordered | low | out
  const [selected, setSelected] = useState(() => new Set());
  const [flashId, setFlashId] = useState(null);
  const [shortOnly, setShortOnly] = useState(initialShortOnly);

  // "Below the shortage threshold only": everything else disappears from every level (categories → sizes)
  const shortIds = useMemo(
    () => new Set(fullIndex.allVariants.filter(v => stockStatus(v.stock, fullIndex.thresholdOfVariant(v)) !== 'ok').map(v => v.id)),
    [fullIndex]
  );
  const index = useMemo(
    () => (shortOnly
      ? buildInventoryIndex({ categories, groups, variants: variants.filter(v => shortIds.has(v.id)), globalThreshold: fullIndex.globalThreshold })
      : fullIndex),
    [shortOnly, shortIds, fullIndex, categories, groups, variants]
  );
  const toggleShortOnly = () => {
    setShortOnly(s => !s);
    setPath([]);
    setProductId(null);
    setSelected(new Set());
  };

  // Always work from the latest quantities (several scans can land before a re-render)
  const qRef = useRef(quantities);
  qRef.current = quantities;

  const rows = useMemo(() => buildCatalogRows(variants, groups, categories), [variants, groups, categories]);
  const tableRows = useMemo(() => (shortOnly ? rows.filter(r => shortIds.has(r.variant_id)) : rows), [rows, shortOnly, shortIds]);

  const setQty = (id, value) => {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    const next = { ...qRef.current };
    if (n > 0) next[id] = n; else delete next[id];
    qRef.current = next;
    onChange(next);
    return n;
  };

  const orderedUnits = (ids) => ids.reduce((s, id) => s + (quantities[id] || 0), 0);
  const badgeFor = (ids) => {
    const u = orderedUnits(ids);
    return u > 0 ? `${u} בהזמנה` : null;
  };

  const orderedIds = Object.keys(quantities).filter(id => quantities[id] > 0 && fullIndex.allVariants.some(v => v.id === id));
  const totalLines = orderedIds.length;
  const totalUnits = orderedIds.reduce((s, id) => s + quantities[id], 0);

  const onToggle = (ids, on) => setSelected(prev => {
    const next = new Set(prev);
    ids.forEach(id => (on ? next.add(id) : next.delete(id)));
    return next;
  });

  // ── Scanner ──
  const flashTimer = useRef(null);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  /** Returns 'added' | 'product' | 'search' | 'none' */
  const handleScan = (code) => {
    const matches = matchScannedCode(code, rows);
    if (matches.length === 1) {
      const r = matches[0];
      const n = setQty(r.variant_id, (qRef.current[r.variant_id] || 0) + 1);
      const visible = !shortOnly || shortIds.has(r.variant_id);
      if (view === 'tiles' && visible) { setProductId(r.group_id); setSearch(''); setFilter('all'); }
      setFlashId(r.variant_id);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashId(null), 1200);
      toast({
        title: `+1 ${r.product_name}${r.variant_label ? ` · ${r.variant_label}` : ''}`,
        description: `בהזמנה: ${n}${visible ? '' : ' · (לא מתחת לרף — מוסתר בתצוגה)'}`,
        duration: 1800,
      });
      return 'added';
    }
    if (matches.length > 1) {
      const groupIds = new Set(matches.map(m => m.group_id));
      if (groupIds.size === 1) {
        setView('tiles');
        setProductId(matches[0].group_id);
        setSearch('');
        setFilter('all');
        toast({ title: 'נסרק הברקוד הכללי של המוצר — בחר מידה', duration: 2500 });
        return 'product';
      }
      setView('tiles');
      setProductId(null);
      setSearch(code);
      return 'search';
    }
    toast({ title: `ברקוד לא נמצא: ${code}`, variant: 'destructive', duration: 2500 });
    return 'none';
  };

  useScanDetector({ enabled: scanEnabled, onScan: handleScan });

  // ── Filters ──
  const q = search.trim().toLowerCase();
  const variantMatches = (v) => {
    if (filter === 'ordered' && !(quantities[v.id] > 0)) return false;
    if ((filter === 'low' || filter === 'out') && stockStatus(v.stock, index.thresholdOfVariant(v)) !== filter) return false;
    if (!q) return true;
    const g = index.groupById.get(v.group_id);
    return [g?.name, variantLabel(v), v.sku, v.barcode, g?.barcode].some(x => String(x || '').toLowerCase().includes(q));
  };
  const filtering = !!q || filter !== 'all';

  // ── Bulk ──
  const applyBulk = (mode, value) => {
    const ids = [...selected];
    const next = { ...qRef.current };
    ids.forEach(id => {
      const v = fullIndex.allVariants.find(x => x.id === id);
      if (!v) return;
      const cur = next[id] || 0;
      let n = cur;
      if (mode === 'add') n = cur + value;
      else if (mode === 'set') n = value;
      else if (mode === 'topup') n = Math.max(0, value - Number(v.stock || 0));
      else if (mode === 'zero') n = 0;
      if (n > 0) next[id] = n; else delete next[id];
    });
    qRef.current = next;
    onChange(next);
    setSelected(new Set());
    toast({ title: mode === 'zero' ? `${ids.length} מידות הוסרו מההזמנה` : `ההזמנה עודכנה (${ids.length} מידות)` });
  };

  const chips = [
    { k: 'all', l: 'הכל' },
    { k: 'ordered', l: `בהזמנה${totalLines ? ` (${totalLines})` : ''}` },
    { k: 'low', l: 'נמוך' },
    { k: 'out', l: 'אזל' },
  ];

  return (
    <div className="space-y-4">
      {/* Scanner + order summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3">
        <div className={`flex items-center gap-2 text-sm ${scanEnabled ? 'text-green-700' : 'text-gray-400'}`}>
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${scanEnabled ? 'bg-green-50' : 'bg-gray-50'}`}>
            <ScanLine className="w-5 h-5" />
          </span>
          {scanEnabled
            ? <span><strong>הסורק פעיל</strong> — סרוק מוצר והוא יתווסף להזמנה (+1 בכל סריקה)</span>
            : <span>הסורק מושהה</span>}
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
          בהזמנה: <strong>{totalLines}</strong> מידות · <strong>{totalUnits}</strong> יחידות
        </div>
      </div>

      {/* Search / filters / view */}
      <div className="flex flex-wrap items-center gap-2">
        {view === 'tiles' && (
          <>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return;
                  const code = search.trim();
                  if (!code || matchScannedCode(code, rows).length === 0) return;
                  e.preventDefault();
                  const res = handleScan(code);
                  if (res === 'added' || res === 'product') setSearch('');
                }}
                placeholder='חיפוש לפי מוצר, מידה, מק"ט או ברקוד'
                className="pr-9"
              />
            </div>
            {chips.map(f => (
              <button key={f.k} onClick={() => { setFilter(f.k); setProductId(null); }}
                className={`rounded-full border px-3 py-1.5 text-sm ${filter === f.k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600'}`}>
                {f.l}
              </button>
            ))}
            {filtering && (
              <button onClick={() => { setSearch(''); setFilter('all'); }} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
                <X className="w-4 h-4" /> נקה
              </button>
            )}
          </>
        )}
        <button
          onClick={toggleShortOnly}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${shortOnly ? 'bg-red-500 border-red-500 text-white' : 'bg-white text-gray-600 hover:border-red-300'}`}
          title={`מציג רק מידות שהמלאי שלהן מתחת לרף החוסרים (${fullIndex.globalThreshold} או הרף של המוצר)`}
        >
          <AlertTriangle className="w-4 h-4" /> רק מתחת לרף החוסרים{shortOnly ? ` (${shortIds.size})` : ''}
        </button>
        <div className="flex rounded-xl border bg-white p-1 mr-auto">
          <button onClick={() => setView('tiles')} className={`rounded-lg p-2 ${view === 'tiles' ? 'bg-gray-900 text-white' : 'text-gray-500'}`} title="תצוגת ריבועים"><LayoutGrid className="w-4 h-4" /></button>
          <button onClick={() => setView('table')} className={`rounded-lg p-2 ${view === 'table' ? 'bg-gray-900 text-white' : 'text-gray-500'}`} title="תצוגת טבלה"><Table2 className="w-4 h-4" /></button>
        </div>
      </div>

      {view === 'table' ? (
        <SupplyOrderBuilder rows={tableRows} quantities={quantities} onQuantitiesChange={(next) => { qRef.current = next; onChange(next); }} />
      ) : productId ? (
        <OrderSizes
          key={productId}
          index={index}
          groupId={productId}
          onBack={() => setProductId(null)}
          quantities={quantities}
          setQty={setQty}
          selected={selected}
          onToggle={onToggle}
          variantFilter={filtering ? variantMatches : null}
          requested={requested}
          flashId={flashId}
        />
      ) : filtering ? (
        <FilteredProducts index={index} variantMatches={variantMatches} selected={selected} onToggle={onToggle} onOpen={setProductId} badgeFor={badgeFor} />
      ) : (
        <CatalogTiles index={index} path={path} setPath={setPath} onOpenProduct={setProductId} selected={selected} onToggle={onToggle} badgeFor={badgeFor} />
      )}

      <OrderBulkBar count={selected.size} onApply={applyBulk} onClear={() => setSelected(new Set())} />
    </div>
  );
}

/** Search / filter results as product tiles (selecting a tile selects only its matching sizes). */
function FilteredProducts({ index, variantMatches, selected, onToggle, onOpen, badgeFor }) {
  const products = [...index.groupById.values()]
    .map(g => ({ g, vs: index.variantsOf(g.id).filter(variantMatches) }))
    .filter(x => x.vs.length > 0)
    .sort((a, b) => a.g.name.localeCompare(b.g.name, 'he'));
  if (products.length === 0) return <p className="py-12 text-center text-gray-400">לא נמצאו מוצרים</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {products.map(({ g, vs }) => {
        const s = index.productStats(g);
        const ids = vs.map(v => v.id);
        return (
          <Tile key={g.id} title={g.name} subtitle={`${vs.length} מתוך ${s.sizes} מידות`} units={vs.reduce((a, v) => a + Number(v.stock || 0), 0)}
            low={vs.filter(v => stockStatus(v.stock, s.threshold) === 'low').length}
            out={vs.filter(v => stockStatus(v.stock, s.threshold) === 'out').length}
            image={g.image_url} icon={Package} ids={ids} selected={selected} onToggle={onToggle} onClick={() => onOpen(g.id)}
            badge={badgeFor(ids)} />
        );
      })}
    </div>
  );
}

/** One product: a tile per size with its stock and − / qty / + for the order. Tapping the tile selects it. */
function OrderSizes({ index, groupId, onBack, quantities, setQty, selected, onToggle, variantFilter, requested, flashId }) {
  const group = index.groupById.get(groupId);
  if (!group) return null;
  const stats = index.productStats(group);
  const vs = index.variantsOf(groupId)
    .filter(v => !variantFilter || variantFilter(v))
    .sort((a, b) => collator.compare(variantLabel(a), variantLabel(b)));
  const ordered = vs.reduce((s, v) => s + (quantities[v.id] || 0), 0);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200">
        <ArrowRight className="w-4 h-4" /> חזרה
      </button>
      <div className="rounded-2xl border bg-white p-4 flex flex-wrap items-center gap-4">
        {group.image_url
          ? <img src={group.image_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
          : <div className="w-16 h-16 rounded-xl bg-amber-50 flex items-center justify-center"><Package className="w-8 h-8 text-amber-500" /></div>}
        <div className="flex-1 min-w-0">
          <p className="text-xl font-bold text-gray-900">{group.name}</p>
          <p className="text-sm text-gray-500">{stats.sizes} מידות · {stats.units} יחידות במלאי</p>
        </div>
        {ordered > 0 && <span className="rounded-full bg-amber-500 text-white text-sm font-bold px-3 py-1">{ordered} בהזמנה</span>}
        <TriCheck ids={vs.map(v => v.id)} selected={selected} onToggle={onToggle} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {vs.map(v => (
          <SizeTile
            key={v.id}
            v={v}
            threshold={stats.threshold}
            qty={quantities[v.id] || 0}
            setQty={setQty}
            isSel={selected.has(v.id)}
            onToggle={onToggle}
            req={requested ? requested[v.id] : null}
            flash={flashId === v.id}
          />
        ))}
      </div>
      {vs.length === 0 && <p className="py-8 text-center text-gray-400">אין מידות שתואמות לסינון</p>}
      <p className="text-xs text-gray-400">לחיצה על מידה מסמנת אותה; לחיצה על המספר מאפשרת להקליד כמות. אפשר גם פשוט לסרוק.</p>
    </div>
  );
}

function SizeTile({ v, threshold, qty, setQty, isSel, onToggle, req, flash }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const st = stockStatus(v.stock, threshold);
  const stockTone = st === 'out' ? 'text-red-600' : st === 'low' ? 'text-amber-700' : 'text-gray-800';

  const commit = () => {
    setEditing(false);
    if (val.trim() !== '') setQty(v.id, val);
  };

  const tone = isSel
    ? 'ring-4 ring-amber-400 border-amber-500 bg-white'
    : qty > 0 ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white';

  return (
    <div
      onClick={() => onToggle([v.id], !isSel)}
      className={`relative rounded-2xl border-2 p-2.5 flex flex-col items-center gap-1 cursor-pointer select-none transition-all ${tone} ${flash ? 'ring-4 ring-green-400 scale-105' : ''}`}
    >
      {isSel && <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center"><Check className="w-3.5 h-3.5" /></span>}
      <span className="text-sm text-gray-700 font-semibold line-clamp-2 text-center">{variantLabel(v) || 'רגיל'}</span>
      <span className="text-xs text-gray-500">במלאי <strong className={stockTone}>{Number(v.stock || 0)}</strong></span>
      {req != null && <span className="text-[10px] text-gray-400">ביקש הסניף: {req}</span>}

      <div className="flex items-center gap-1 mt-1" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setQty(v.id, qty - 1)}
          disabled={qty <= 0}
          className="w-9 h-9 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center hover:bg-gray-200 disabled:opacity-30"
        >
          <Minus className="w-4 h-4" />
        </button>
        {editing ? (
          <input
            autoFocus
            type="number"
            min={0}
            inputMode="numeric"
            value={val}
            onChange={e => setVal(e.target.value)}
            onFocus={e => e.target.select()}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') setEditing(false);
            }}
            className="w-14 h-9 rounded-lg border-2 border-amber-400 text-center text-lg font-bold outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => { setVal(qty ? String(qty) : ''); setEditing(true); }}
            className={`min-w-[3.5rem] h-9 rounded-lg text-2xl font-bold leading-none ${qty > 0 ? 'text-amber-700' : 'text-gray-300'}`}
            title="הקלד כמות"
          >
            {qty}
          </button>
        )}
        <button
          type="button"
          onClick={() => setQty(v.id, qty + 1)}
          className="w-9 h-9 rounded-lg bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {v.sku && <span className="text-[10px] text-gray-400 font-mono">{v.sku}</span>}
    </div>
  );
}

/** Sticky bar for everything selected: add / set / top-up to a target stock / remove from the order. */
function OrderBulkBar({ count, onApply, onClear }) {
  const [mode, setMode] = useState('add');
  const [value, setValue] = useState('');
  if (count === 0) return null;

  const n = parseInt(value, 10);
  const valid = value !== '' && !Number.isNaN(n) && n >= 0 && (mode === 'set' || n > 0);
  const run = () => {
    if (!valid) return;
    onApply(mode, n);
    setValue('');
  };
  const modes = [
    { k: 'add', l: 'הוסף', icon: Plus, ph: 'כמה להוסיף לכל מידה' },
    { k: 'set', l: 'קבע כמות', icon: Equal, ph: 'כמות לכל מידה' },
    { k: 'topup', l: 'השלם עד', icon: TrendingUp, ph: 'מלאי יעד לכל מידה' },
  ];
  const current = modes.find(m => m.k === mode);

  return (
    <div className="sticky bottom-2 z-30 rounded-2xl bg-gray-900 text-white shadow-2xl px-4 py-3 flex flex-wrap items-center gap-3" dir="rtl">
      <div className="flex items-center gap-2">
        <span className="bg-amber-500 rounded-full px-3 py-1 text-sm font-bold">{count}</span>
        <span className="text-sm">מידות נבחרו</span>
      </div>
      <div className="flex rounded-xl bg-white/10 p-1">
        {modes.map(m => (
          <button key={m.k} onClick={() => setMode(m.k)}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ${mode === m.k ? 'bg-white text-gray-900' : 'text-gray-300'}`}>
            <m.icon className="w-4 h-4" /> {m.l}
          </button>
        ))}
      </div>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') run(); }}
        placeholder={current.ph}
        className="w-40 h-10 bg-white text-gray-900 text-center font-semibold"
      />
      <Button onClick={run} disabled={!valid} className="h-10 bg-amber-500 hover:bg-amber-600">עדכן הזמנה</Button>
      <Button onClick={() => onApply('zero', 0)} variant="ghost" className="h-10 gap-1 text-red-300 hover:bg-white/10 hover:text-red-200">
        <Trash2 className="w-4 h-4" /> הסר מההזמנה
      </Button>
      <button onClick={onClear} className="mr-auto flex items-center gap-1 text-sm text-gray-300 hover:text-white">
        <X className="w-4 h-4" /> בטל בחירה
      </button>
    </div>
  );
}
