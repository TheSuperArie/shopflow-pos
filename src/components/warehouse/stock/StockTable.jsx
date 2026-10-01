import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Pencil } from 'lucide-react';
import { sortRows } from '@/lib/supplyOrders';

/** Stock list with search + category filter. onEdit (optional) adds an update button per row. */
export default function StockTable({ items, isLoading, onEdit }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const categories = useMemo(() => [...new Set(items.map(i => i.category_name).filter(Boolean))].sort(), [items]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = items.filter(i => (!cat || i.category_name === cat) &&
      (!s || [i.product_name, i.variant_label, i.sku, i.barcode].some(v => String(v || '').toLowerCase().includes(s))));
    return sortRows(list, 'product_name', 'asc');
  }, [items, q, cat]);
  const units = shown.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש מוצר, מידה, מק״ט…" className="h-11 pr-9" />
        </div>
        <select value={cat} onChange={e => setCat(e.target.value)} className="h-11 rounded-md border bg-white px-3 text-sm">
          <option value="">כל הקטגוריות</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-sm text-gray-500">{shown.length} שורות · {units.toLocaleString()} יחידות</span>
      </div>
      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-500" /></div>
      ) : shown.length === 0 ? (
        <div className="py-12 text-center text-gray-400 rounded-2xl border bg-white">אין מוצרים להצגה</div>
      ) : (
        <div className="rounded-2xl border bg-white divide-y max-h-[65vh] overflow-y-auto">
          {shown.map(i => (
            <div key={i.key} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">
                  {i.product_name} {i.variant_label ? `· ${i.variant_label}` : ''}
                  {i.isLocal && <span className="mr-2 text-xs rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">מקומי</span>}
                </p>
                <p className="text-xs text-gray-500 truncate">{i.category_name || '—'}{i.sku ? ` · ${i.sku}` : ''}</p>
              </div>
              <span className={`min-w-[56px] text-center text-lg font-bold ${i.qty < 0 ? 'text-red-600' : i.qty === 0 ? 'text-gray-400' : 'text-gray-900'}`}>{i.qty}</span>
              {onEdit && (
                <button onClick={() => onEdit(i)} className="p-2 rounded-lg text-gray-500 hover:bg-blue-50 hover:text-blue-600" title="עדכון / ספירה">
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}