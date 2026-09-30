import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, ShoppingCart, CheckCircle2, Settings } from 'lucide-react';
import { stockStatus, variantLabel } from '@/lib/inventory';
import { TriCheck } from './InventoryTiles';

/**
 * Shortages: every size under its product's threshold, grouped by top category.
 * Select sizes (or whole products / categories) → update stock, or top the selection
 * up into the order to the network in one click.
 */
export default function ShortagesView({ index, globalThreshold, selected, onToggle, onTopUpOrder, networkMode }) {
  const [filter, setFilter] = useState('all'); // all | out | low
  const [target, setTarget] = useState(String(Math.max(globalThreshold * 2, 1)));

  const rootOf = (catId) => {
    let c = catId ? index.catById.get(catId) : null;
    while (c?.parent_id && index.catById.get(c.parent_id)) c = index.catById.get(c.parent_id);
    return c || null;
  };

  const sections = useMemo(() => {
    const map = new Map();
    index.allVariants.forEach(v => {
      const st = stockStatus(v.stock, index.thresholdOfVariant(v));
      if (st === 'ok' || (filter !== 'all' && st !== filter)) return;
      const g = index.groupById.get(v.group_id);
      const root = rootOf(g?.category_id);
      const key = root?.id || '__none__';
      if (!map.has(key)) map.set(key, { name: root?.name || 'ללא קטגוריה', sort: root?.sort_order ?? 999, products: new Map() });
      const sec = map.get(key);
      if (!sec.products.has(g.id)) sec.products.set(g.id, { group: g, sizes: [] });
      sec.products.get(g.id).sizes.push({ v, st });
    });
    return [...map.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'he'));
  }, [index, filter]);

  const allShortIds = sections.flatMap(s => [...s.products.values()].flatMap(p => p.sizes.map(x => x.v.id)));
  const counts = index.allVariants.reduce((acc, v) => {
    const st = stockStatus(v.stock, index.thresholdOfVariant(v));
    if (st !== 'ok') acc[st] += 1;
    return acc;
  }, { out: 0, low: 0 });

  const selectedShort = allShortIds.filter(id => selected.has(id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[
          { k: 'all', l: `כל החוסרים (${counts.out + counts.low})` },
          { k: 'out', l: `אזלו (${counts.out})` },
          { k: 'low', l: `מלאי נמוך (${counts.low})` },
        ].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium ${filter === f.k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 hover:border-gray-400'}`}>
            {f.l}
          </button>
        ))}
        <span className="text-xs text-gray-500 flex items-center gap-1 mr-2">
          <Settings className="w-3.5 h-3.5" /> סף כללי: {globalThreshold} (בהגדרות) · לכל מוצר אפשר סף משלו בדף המלאי
        </span>
        {allShortIds.length > 0 && (
          <div className="mr-auto flex items-center gap-2">
            <TriCheck ids={allShortIds} selected={selected} onToggle={onToggle} />
            <span className="text-sm text-gray-600">בחר את כל החוסרים</span>
          </div>
        )}
      </div>

      {!networkMode && selectedShort.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-blue-200 bg-blue-50 p-3">
          <ShoppingCart className="w-5 h-5 text-blue-600" />
          <span className="text-sm text-blue-900 font-medium">השלם את {selectedShort.length} המידות המסומנות עד</span>
          <Input type="number" min={1} value={target} onChange={e => setTarget(e.target.value)} className="w-20 h-9 text-center bg-white" />
          <span className="text-sm text-blue-900">יח' — ישר להזמנה מהרשת</span>
          <Button size="sm" disabled={!(parseInt(target, 10) > 0)} onClick={() => onTopUpOrder(selectedShort, parseInt(target, 10))} className="bg-blue-600 hover:bg-blue-700">
            הוסף להזמנה
          </Button>
        </div>
      )}

      {sections.length === 0 ? (
        <div className="rounded-2xl border bg-white py-16 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="text-lg font-semibold text-gray-700">אין חוסרים</p>
        </div>
      ) : sections.map(sec => {
        const secIds = [...sec.products.values()].flatMap(p => p.sizes.map(x => x.v.id));
        return (
          <section key={sec.name} className="space-y-2">
            <div className="flex items-center gap-2">
              <TriCheck ids={secIds} selected={selected} onToggle={onToggle} />
              <h3 className="text-lg font-bold text-gray-800">{sec.name}</h3>
              <span className="text-sm text-gray-400">{secIds.length} מידות</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {[...sec.products.values()].map(({ group, sizes }) => {
                const ids = sizes.map(x => x.v.id);
                const collator = new Intl.Collator('he', { numeric: true });
                sizes.sort((a, b) => collator.compare(variantLabel(a.v), variantLabel(b.v)));
                return (
                  <div key={group.id} className={`rounded-2xl border-2 bg-white p-3 space-y-2 min-h-[150px] ${ids.some(id => selected.has(id)) ? 'border-amber-400' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-2">
                      {group.image_url
                        ? <img src={group.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        : <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><Package className="w-5 h-5 text-amber-500" /></div>}
                      <p className="flex-1 font-bold text-gray-900 leading-tight">{group.name}</p>
                      <TriCheck ids={ids} selected={selected} onToggle={onToggle} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {sizes.map(({ v, st }) => {
                        const isSel = selected.has(v.id);
                        return (
                          <button key={v.id} onClick={() => onToggle([v.id], !isSel)}
                            className={`rounded-xl border-2 px-2.5 py-1.5 text-sm transition-colors ${
                              isSel ? 'border-amber-500 bg-amber-500 text-white'
                                : st === 'out' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'
                            }`}>
                            <span className="font-medium">{variantLabel(v) || 'רגיל'}</span>
                            <span className="font-bold mr-1.5">{Number(v.stock || 0)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
