import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowUpDown, ArrowUp, ArrowDown, Save, Loader2, Undo2 } from 'lucide-react';
import { stockStatus, variantLabel } from '@/lib/inventory';

const collator = new Intl.Collator('he', { numeric: true, sensitivity: 'base' });

/** Flat, sortable table with in-place stock editing — for fast work on a computer. */
export default function InventoryTable({ index, rowsFilter, selected, onToggle, onSaveEdits, saving }) {
  const [sort, setSort] = useState({ key: 'product', dir: 'asc' });
  const [edits, setEdits] = useState({});

  const rows = useMemo(() => {
    const list = index.allVariants.filter(v => !rowsFilter || rowsFilter(v)).map(v => {
      const g = index.groupById.get(v.group_id);
      const cat = g?.category_id ? index.catById.get(g.category_id) : null;
      const parent = cat?.parent_id ? index.catById.get(cat.parent_id) : null;
      const th = index.thresholdOfVariant(v);
      return {
        v,
        product: g?.name || '',
        size: variantLabel(v),
        category: parent ? `${parent.name} › ${cat.name}` : (cat?.name || ''),
        sku: v.sku || '',
        stock: Number(v.stock || 0),
        status: stockStatus(v.stock, th),
      };
    });
    const mult = sort.dir === 'desc' ? -1 : 1;
    return list.sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      const p = typeof x === 'number' ? x - y : collator.compare(x, y);
      return (p || collator.compare(a.product, b.product) || collator.compare(a.size, b.size)) * (p ? mult : 1);
    });
  }, [index, rowsFilter, sort]);

  const dirty = Object.entries(edits).filter(([id, val]) => {
    const r = rows.find(x => x.v.id === id);
    return r && val !== '' && Number(val) !== r.stock;
  });

  const toggleSort = (key) => setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const Icon = ({ k }) => (sort.key !== k ? <ArrowUpDown className="w-3 h-3 opacity-40" /> : sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />);
  const allIds = rows.map(r => r.v.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));

  const save = async () => {
    const byId = new Map(rows.map(r => [r.v.id, r.v]));
    await onSaveEdits(dirty.map(([id, val]) => ({ variant: byId.get(id), mode: 'set', value: Math.max(0, parseInt(val, 10) || 0) })));
    setEdits({});
  };

  return (
    <div className="space-y-3">
      {dirty.length > 0 && (
        <div className="sticky top-0 z-20 flex items-center gap-3 rounded-xl border border-green-300 bg-green-50 px-3 py-2">
          <span className="text-sm font-semibold text-green-900">{dirty.length} שינויים שלא נשמרו</span>
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5 bg-green-600 hover:bg-green-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} שמור
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEdits({})} className="gap-1.5"><Undo2 className="w-4 h-4" /> בטל</Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="w-10 px-3 py-2.5"><Checkbox checked={allSelected} onCheckedChange={() => onToggle(allIds, !allSelected)} /></th>
              {[['product', 'מוצר'], ['size', 'מידה'], ['category', 'סוג'], ['sku', 'מק"ט'], ['stock', 'מלאי']].map(([k, l]) => (
                <th key={k} className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                  <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-gray-900">{l} <Icon k={k} /></button>
                </th>
              ))}
              <th className="px-3 py-2.5 text-center font-medium w-32">כמות חדשה</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(r => {
              const isSel = selected.has(r.v.id);
              const edit = edits[r.v.id];
              return (
                <tr key={r.v.id} className={isSel ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                  <td className="px-3 py-2"><Checkbox checked={isSel} onCheckedChange={v => onToggle([r.v.id], !!v)} /></td>
                  <td className="px-3 py-2 font-medium text-gray-800">{r.product}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{r.size || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.category || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 font-mono text-xs">{r.sku || '—'}</td>
                  <td className={`px-3 py-2 font-bold ${r.status === 'out' ? 'text-red-600' : r.status === 'low' ? 'text-amber-600' : 'text-gray-900'}`}>{r.stock}</td>
                  <td className="px-3 py-1.5">
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={edit ?? ''}
                      placeholder={String(r.stock)}
                      onFocus={e => e.target.select()}
                      onChange={e => setEdits(p => ({ ...p, [r.v.id]: e.target.value }))}
                      className={`h-9 w-24 mx-auto text-center font-semibold ${edit !== undefined && edit !== '' && Number(edit) !== r.stock ? 'border-green-500 bg-green-50' : ''}`}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-gray-400">אין מוצרים שתואמים לסינון</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
