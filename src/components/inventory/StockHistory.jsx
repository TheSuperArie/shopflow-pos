import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Loader2, Search, TrendingUp, TrendingDown } from 'lucide-react';
import { formatOrderDate } from '@/lib/supplyOrders';

/** Every stock change (from this page, old shipments, etc.) — newest first. */
export default function StockHistory({ history, loading }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return history.filter(h => !s || [h.product_name, h.notes, h.supplier_name].some(v => String(v || '').toLowerCase().includes(s)));
  }, [history, q]);

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>;

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש בהיסטוריה" className="pr-9" />
      </div>
      <div className="rounded-2xl border bg-white divide-y">
        {rows.map(h => {
          const delta = Number(h.quantity_added || 0);
          const up = delta >= 0;
          return (
            <div key={h.id} className="flex items-center gap-3 px-4 py-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${up ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">{h.product_name}</p>
                <p className="text-xs text-gray-500 truncate">{h.notes || (h.supplier_name ? `משלוח · ${h.supplier_name}` : '')}</p>
              </div>
              <span className={`font-bold ${up ? 'text-green-700' : 'text-red-600'}`} dir="ltr">{up ? '+' : ''}{delta}</span>
              <span className="text-xs text-gray-400 w-24 text-left">{formatOrderDate(h.created_date, true) || h.arrival_date}</span>
            </div>
          );
        })}
        {rows.length === 0 && <p className="py-12 text-center text-gray-400">אין עדכוני מלאי</p>}
      </div>
    </div>
  );
}
