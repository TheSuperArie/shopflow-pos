import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import {
  Loader2, Search, LayoutGrid, Table2, Boxes, AlertTriangle, PackageX, Layers, Package, History, X,
} from 'lucide-react';
import { useInventoryData } from '@/hooks/useInventoryData';
import { buildInventoryIndex, applyStockChanges, stockStatus, variantLabel } from '@/lib/inventory';
import { addToSupplyDraft } from '@/lib/supplyOrders';
import { CatalogTiles, ProductSizes, Tile } from './InventoryTiles';
import InventoryTable from './InventoryTable';
import ShortagesView from './ShortagesView';
import StockHistory from './StockHistory';
import BulkStockBar from './BulkStockBar';

/**
 * The inventory screen — one component for both sides:
 *  - branch admin:   <InventoryManager />             (its own stock; can send sizes to the order)
 *  - network master: <InventoryManager branch={b} />  (full access to that branch's stock)
 * Tabs: stock (square tiles or a table) · shortages · history.
 * Selection works across categories / sub-categories / products / sizes; the bottom bar
 * adds to or sets the stock of everything selected at once.
 */
export default function InventoryManager({ branch, defaultTab = 'stock', title = 'מלאי' }) {
  const data = useInventoryData(branch);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [tab, setTab] = useState(defaultTab);
  const [view, setView] = useState('tiles');
  const [path, setPath] = useState([]);
  const [productId, setProductId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | low | out
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const index = useMemo(
    () => buildInventoryIndex({ categories: data.categories, groups: data.groups, variants: data.variants, globalThreshold: data.threshold }),
    [data.categories, data.groups, data.variants, data.threshold]
  );

  // Totals for the KPI squares
  const kpi = useMemo(() => {
    let units = 0, low = 0, out = 0;
    index.allVariants.forEach(v => {
      units += Number(v.stock || 0);
      const st = stockStatus(v.stock, index.thresholdOfVariant(v));
      if (st === 'low') low += 1;
      if (st === 'out') out += 1;
    });
    return { units, sizes: index.allVariants.length, products: index.groupById.size, low, out };
  }, [index]);

  const onToggle = (ids, on) => setSelected(prev => {
    const next = new Set(prev);
    ids.forEach(id => (on ? next.add(id) : next.delete(id)));
    return next;
  });

  // Search / status filter on sizes
  const q = search.trim().toLowerCase();
  const variantMatches = (v) => {
    if (statusFilter !== 'all' && stockStatus(v.stock, index.thresholdOfVariant(v)) !== statusFilter) return false;
    if (!q) return true;
    const g = index.groupById.get(v.group_id);
    return [g?.name, variantLabel(v), v.sku, g?.barcode].some(x => String(x || '').toLowerCase().includes(q));
  };
  const filtering = !!q || statusFilter !== 'all';

  const selectedVariants = index.allVariants.filter(v => selected.has(v.id));
  const selectedUnits = selectedVariants.reduce((s, v) => s + Number(v.stock || 0), 0);

  const runChanges = async (ops) => {
    if (!ops.length) return;
    setBusy(true);
    setProgress(0);
    try {
      const done = await applyStockChanges(ops, {
        branchId: data.branchId,
        groupById: index.groupById,
        note: data.networkMode ? 'עודכן ע"י מנהל הרשת' : '',
        onProgress: setProgress,
      });
      data.invalidate();
      toast({ title: `המלאי עודכן (${done.length} מידות)` });
      return true;
    } catch (err) {
      data.invalidate();
      toast({ title: 'העדכון נעצר באמצע — בדוק את המלאי ונסה שוב', description: err?.message, variant: 'destructive' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const applyBulk = async (mode, value) => {
    const ok = await runChanges(selectedVariants.map(v => ({ variant: v, mode, value })));
    if (ok) setSelected(new Set());
  };

  const toOrder = (quantities) => {
    if (!data.branchId) {
      toast({ title: 'החנות לא מחוברת לרשת', variant: 'destructive' });
      return;
    }
    const n = addToSupplyDraft(data.branchId, quantities);
    setSelected(new Set());
    toast({ title: `${n} מידות נוספו להזמנה מהרשת` });
    navigate('/AdminOrders');
  };

  const orderFixed = (qty) => toOrder(Object.fromEntries(selectedVariants.map(v => [v.id, qty])));
  const orderTopUp = (ids, target) => toOrder(Object.fromEntries(
    index.allVariants.filter(v => ids.includes(v.id)).map(v => [v.id, Math.max(1, target - Number(v.stock || 0))])
  ));

  if (data.isLoading) {
    return <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>;
  }

  const kpis = [
    { label: 'יחידות במלאי', value: kpi.units, icon: Boxes, tone: 'bg-gray-50 text-gray-800' },
    { label: 'מוצרים', value: kpi.products, icon: Package, tone: 'bg-gray-50 text-gray-800' },
    { label: 'מידות', value: kpi.sizes, icon: Layers, tone: 'bg-gray-50 text-gray-800' },
    { label: 'מלאי נמוך', value: kpi.low, icon: AlertTriangle, tone: 'bg-amber-50 text-amber-800', onClick: () => { setTab('stock'); setStatusFilter('low'); } },
    { label: 'אזלו', value: kpi.out, icon: PackageX, tone: 'bg-red-50 text-red-700', onClick: () => { setTab('stock'); setStatusFilter('out'); } },
  ];

  return (
    <div className="space-y-5 pb-28" dir="rtl">
      {title && <h1 className="text-2xl font-bold text-gray-800">{title}</h1>}

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

      {/* Tabs */}
      <div className="flex border-b gap-1 overflow-x-auto">
        {[
          { key: 'stock', label: 'מלאי', icon: Boxes },
          { key: 'shortages', label: 'חוסרים', icon: AlertTriangle, count: kpi.low + kpi.out },
          { key: 'history', label: 'היסטוריית עדכונים', icon: History },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap ${tab === t.key ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
            {t.count ? <span className="rounded-full bg-red-500 text-white text-xs px-1.5">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder='חיפוש לפי מוצר, מידה, מק"ט או ברקוד' className="pr-9" />
            </div>
            {[{ k: 'all', l: 'הכל' }, { k: 'low', l: 'נמוך' }, { k: 'out', l: 'אזל' }].map(f => (
              <button key={f.k} onClick={() => setStatusFilter(f.k)}
                className={`rounded-full border px-3 py-1.5 text-sm ${statusFilter === f.k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600'}`}>
                {f.l}
              </button>
            ))}
            {filtering && (
              <button onClick={() => { setSearch(''); setStatusFilter('all'); }} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
                <X className="w-4 h-4" /> נקה
              </button>
            )}
            <div className="flex rounded-xl border bg-white p-1 mr-auto">
              <button onClick={() => setView('tiles')} className={`rounded-lg p-2 ${view === 'tiles' ? 'bg-gray-900 text-white' : 'text-gray-500'}`} title="תצוגת ריבועים"><LayoutGrid className="w-4 h-4" /></button>
              <button onClick={() => setView('table')} className={`rounded-lg p-2 ${view === 'table' ? 'bg-gray-900 text-white' : 'text-gray-500'}`} title="תצוגת טבלה"><Table2 className="w-4 h-4" /></button>
            </div>
          </div>

          {view === 'table' ? (
            <InventoryTable index={index} rowsFilter={variantMatches} selected={selected} onToggle={onToggle}
              onSaveEdits={runChanges} saving={busy} />
          ) : productId ? (
            <ProductSizes
              key={productId}
              index={index}
              groupId={productId}
              onBack={() => setProductId(null)}
              selected={selected}
              onToggle={onToggle}
              globalThreshold={data.threshold}
              onThresholdSaved={data.invalidate}
              variantFilter={filtering ? variantMatches : null}
            />
          ) : filtering ? (
            <FilteredProducts index={index} variantMatches={variantMatches} selected={selected} onToggle={onToggle} onOpen={setProductId} />
          ) : (
            <CatalogTiles index={index} path={path} setPath={setPath} onOpenProduct={setProductId} selected={selected} onToggle={onToggle} />
          )}
        </div>
      )}

      {tab === 'shortages' && (
        <ShortagesView index={index} globalThreshold={data.threshold} selected={selected} onToggle={onToggle}
          onTopUpOrder={orderTopUp} networkMode={data.networkMode} />
      )}

      {tab === 'history' && <StockHistory history={data.history} loading={data.historyLoading} />}

      <BulkStockBar
        count={selected.size}
        units={selectedUnits}
        busy={busy}
        progress={progress}
        onApply={applyBulk}
        onOrder={data.networkMode ? null : orderFixed}
        onClear={() => setSelected(new Set())}
      />
    </div>
  );
}

/** Search / status results: product tiles whose sizes match (selecting a tile selects only the matching sizes). */
function FilteredProducts({ index, variantMatches, selected, onToggle, onOpen }) {
  const products = [...index.groupById.values()]
    .map(g => ({ g, vs: index.variantsOf(g.id).filter(variantMatches) }))
    .filter(x => x.vs.length > 0)
    .sort((a, b) => a.g.name.localeCompare(b.g.name, 'he'));
  if (products.length === 0) return <p className="py-12 text-center text-gray-400">לא נמצאו מוצרים</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {products.map(({ g, vs }) => {
        const s = index.productStats(g);
        return (
          <Tile key={g.id} title={g.name} subtitle={`${vs.length} מתוך ${s.sizes} מידות`} units={vs.reduce((a, v) => a + Number(v.stock || 0), 0)}
            low={vs.filter(v => stockStatus(v.stock, s.threshold) === 'low').length}
            out={vs.filter(v => stockStatus(v.stock, s.threshold) === 'out').length}
            image={g.image_url} icon={Package} ids={vs.map(v => v.id)} selected={selected} onToggle={onToggle} onClick={() => onOpen(g.id)} />
        );
      })}
    </div>
  );
}
