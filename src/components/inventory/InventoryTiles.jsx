import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Folder, Package, ChevronLeft, Check, Minus, ArrowRight } from 'lucide-react';
import { stockStatus, variantLabel } from '@/lib/inventory';

/** Round corner check: all / some / none of the given variant ids are selected. */
export function TriCheck({ ids, selected, onToggle, className = '' }) {
  const n = ids.filter(id => selected.has(id)).length;
  const state = n === 0 ? 'none' : n === ids.length ? 'all' : 'some';
  return (
    <button
      type="button"
      disabled={ids.length === 0}
      onClick={(e) => { e.stopPropagation(); onToggle(ids, state !== 'all'); }}
      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors disabled:opacity-30 ${
        state === 'none' ? 'bg-white border-gray-300 hover:border-amber-400' : 'bg-amber-500 border-amber-500 text-white'
      } ${className}`}
      title={state === 'all' ? 'בטל בחירה' : 'בחר הכל'}
    >
      {state === 'all' && <Check className="w-5 h-5" />}
      {state === 'some' && <Minus className="w-5 h-5" />}
    </button>
  );
}

const StatusPills = ({ low, out }) => (
  <div className="flex flex-wrap gap-1 justify-center">
    {out > 0 && <span className="rounded-full bg-red-100 text-red-700 text-[11px] font-semibold px-2 py-0.5">{out} אזלו</span>}
    {low > 0 && <span className="rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold px-2 py-0.5">{low} נמוך</span>}
  </div>
);

/** Square tile — categories and products look the same size so the grid stays calm. */
export function Tile({ title, subtitle, units, low, out, image, icon: Icon, ids, selected, onToggle, onClick, accent = 'amber' }) {
  const ring = accent === 'blue' ? 'hover:border-blue-400' : 'hover:border-amber-400';
  return (
    <div
      onClick={onClick}
      className={`relative aspect-square rounded-2xl border-2 bg-white p-3 flex flex-col items-center justify-center text-center gap-1.5 cursor-pointer transition-all hover:shadow-md ${ring} ${
        ids.some(id => selected.has(id)) ? 'border-amber-400 bg-amber-50/40' : 'border-gray-200'
      }`}
    >
      <TriCheck ids={ids} selected={selected} onToggle={onToggle} className="absolute top-2 left-2" />
      {image ? (
        <img src={image} alt="" className="w-14 h-14 rounded-xl object-cover" />
      ) : (
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${accent === 'blue' ? 'bg-blue-50 text-blue-500' : 'bg-amber-50 text-amber-500'}`}>
          <Icon className="w-6 h-6" />
        </div>
      )}
      <p className="font-bold text-gray-900 leading-tight line-clamp-2 text-sm sm:text-base">{title}</p>
      <p className="text-2xl font-bold text-gray-800 leading-none">{units}</p>
      <p className="text-[11px] text-gray-500">{subtitle}</p>
      <StatusPills low={low} out={out} />
    </div>
  );
}

/** Folder → sub-folder → product navigation with square tiles. */
export function CatalogTiles({ index, path, setPath, onOpenProduct, selected, onToggle, productFilter }) {
  const currentCat = path[path.length - 1] ?? null;
  const isUncategorized = currentCat === '__none__';
  const subCats = isUncategorized ? [] : index.childCategories(currentCat);
  const products = (isUncategorized ? index.productsIn(null) : currentCat ? index.productsIn(currentCat) : [])
    .filter(g => !productFilter || productFilter(g));

  return (
    <div className="space-y-3">
      <Breadcrumb index={index} path={path} setPath={setPath} />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {subCats.map(c => {
          const s = index.categoryStats(c.id);
          if (s.sizes === 0) return null;
          return (
            <Tile key={c.id} title={c.name} subtitle={`${s.products} מוצרים · ${s.sizes} מידות`} units={s.units} low={s.low} out={s.out}
              icon={Folder} accent="blue" ids={s.variantIds} selected={selected} onToggle={onToggle} onClick={() => setPath([...path, c.id])} />
          );
        })}
        {!currentCat && index.hasUncategorized && (() => {
          const s = index.categoryStats(null);
          return (
            <Tile title="ללא קטגוריה" subtitle={`${index.productsIn(null).length} מוצרים`} units={index.productsIn(null).reduce((a, g) => a + index.productStats(g).units, 0)}
              low={0} out={0} icon={Folder} accent="blue"
              ids={index.productsIn(null).flatMap(g => index.productStats(g).variantIds)} selected={selected} onToggle={onToggle}
              onClick={() => setPath(['__none__'])} key="__none__" data-stats={s.units} />
          );
        })()}
        {products.map(g => {
          const s = index.productStats(g);
          return (
            <Tile key={g.id} title={g.name} subtitle={`${s.sizes} מידות`} units={s.units} low={s.low} out={s.out}
              image={g.image_url} icon={Package} ids={s.variantIds} selected={selected} onToggle={onToggle} onClick={() => onOpenProduct(g.id)} />
          );
        })}
      </div>
      {subCats.length === 0 && products.length === 0 && (
        <p className="py-10 text-center text-gray-400">אין כאן מוצרים</p>
      )}
    </div>
  );
}

function Breadcrumb({ index, path, setPath }) {
  if (path.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <button onClick={() => setPath(path.slice(0, -1))} className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 hover:bg-gray-200 ml-2">
        <ArrowRight className="w-4 h-4" /> חזרה
      </button>
      <button onClick={() => setPath([])} className="text-gray-500 hover:text-gray-900">כל הקטגוריות</button>
      {path.map((id, i) => (
        <React.Fragment key={id}>
          <ChevronLeft className="w-4 h-4 text-gray-300" />
          <button onClick={() => setPath(path.slice(0, i + 1))} className={i === path.length - 1 ? 'font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-900'}>
            {id === '__none__' ? 'ללא קטגוריה' : index.catById.get(id)?.name}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

/** One product: square size tiles (tap = select) + its own shortage threshold. */
export function ProductSizes({ index, groupId, onBack, selected, onToggle, globalThreshold, onThresholdSaved, variantFilter }) {
  const group = index.groupById.get(groupId);
  const [th, setTh] = useState(group?.low_stock_threshold ?? '');
  const [saving, setSaving] = useState(false);
  if (!group) return null;
  const stats = index.productStats(group);
  const variants = index.variantsOf(groupId).filter(v => !variantFilter || variantFilter(v));
  const collator = new Intl.Collator('he', { numeric: true });
  variants.sort((a, b) => collator.compare(variantLabel(a), variantLabel(b)));

  const saveThreshold = async (value) => {
    setSaving(true);
    try {
      await base44.entities.ProductGroup.update(group.id, { low_stock_threshold: value === '' ? null : Number(value) });
      onThresholdSaved();
    } finally {
      setSaving(false);
    }
  };

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
          <p className="text-sm text-gray-500">{stats.sizes} מידות · {stats.units} יחידות</p>
        </div>
        <TriCheck ids={variants.map(v => v.id)} selected={selected} onToggle={onToggle} />
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-gray-500">סף חוסר למוצר</label>
            <Input type="number" min={0} value={th} onChange={e => setTh(e.target.value)} placeholder={`כללי: ${globalThreshold}`} className="w-28 h-9 text-center" />
          </div>
          <Button size="sm" variant="outline" disabled={saving || String(th) === String(group.low_stock_threshold ?? '')} onClick={() => saveThreshold(th)}>
            שמור
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {variants.map(v => {
          const st = stockStatus(v.stock, stats.threshold);
          const isSel = selected.has(v.id);
          const tone = st === 'out' ? 'border-red-300 bg-red-50' : st === 'low' ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white';
          return (
            <button
              key={v.id}
              onClick={() => onToggle([v.id], !isSel)}
              className={`relative aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-1 p-2 transition-all ${isSel ? 'ring-4 ring-amber-400 border-amber-500' : tone}`}
            >
              {isSel && <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center"><Check className="w-3.5 h-3.5" /></span>}
              <span className="text-xs text-gray-600 font-medium line-clamp-2 text-center">{variantLabel(v) || 'רגיל'}</span>
              <span className={`text-2xl font-bold ${st === 'out' ? 'text-red-600' : st === 'low' ? 'text-amber-700' : 'text-gray-900'}`}>{Number(v.stock || 0)}</span>
              {v.sku && <span className="text-[10px] text-gray-400 font-mono">{v.sku}</span>}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-400">לחיצה על מידה מסמנת אותה. אחרי הסימון עדכנו את כולן יחד מהסרגל התחתון.</p>
    </div>
  );
}
