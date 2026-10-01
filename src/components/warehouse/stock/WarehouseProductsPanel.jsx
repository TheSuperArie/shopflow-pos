import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Plus, Search } from 'lucide-react';
import { useWarehouseInventory } from '@/hooks/useWarehouseInventory';
import { sortRows } from '@/lib/supplyOrders';
import LocalProductFormDialog from './LocalProductFormDialog';
import LocalStatusBadge from './LocalStatusBadge';

/** Network catalog (view only) + the warehouse's own local products. */
export default function WarehouseProductsPanel({ warehouse }) {
  const { catalogRows, localProducts, isLoading } = useWarehouseInventory(warehouse);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = catalogRows.filter(r => !s || [r.product_name, r.variant_label, r.sku, r.category_name].some(v => String(v || '').toLowerCase().includes(s)));
    return sortRows(list, 'product_name', 'asc').slice(0, 500);
  }, [catalogRows, q]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-700 flex-1">מוצרים מקומיים של המחסן ({localProducts.length})</h3>
          <Button onClick={() => setAdding(true)} className="gap-1.5 bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4" /> מוצר מקומי</Button>
        </div>
        {localProducts.length === 0 ? (
          <p className="py-6 text-center text-gray-400 rounded-2xl border bg-white text-sm">אין מוצרים מקומיים</p>
        ) : (
          <div className="rounded-2xl border bg-white divide-y">
            {localProducts.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.name} {p.variant_label ? `· ${p.variant_label}` : ''}</p>
                  <p className="text-xs text-gray-500 truncate">{p.category_name || '—'}{p.sku ? ` · ${p.sku}` : ''}</p>
                </div>
                <LocalStatusBadge status={p.status} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-gray-700">קטלוג הרשת ({catalogRows.length})</h3>
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש בקטלוג הרשת" className="h-11 pr-9" />
        </div>
        {isLoading ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-500" /></div>
        ) : (
          <div className="rounded-2xl border bg-white divide-y max-h-[55vh] overflow-y-auto">
            {shown.map(r => (
              <div key={r.variant_id} className="px-4 py-2">
                <p className="text-gray-900 truncate">{r.product_name} {r.variant_label ? `· ${r.variant_label}` : ''}</p>
                <p className="text-xs text-gray-500 truncate">{r.category_name || '—'}{r.sku ? ` · ${r.sku}` : ''}</p>
              </div>
            ))}
            {shown.length === 0 && <p className="py-8 text-center text-gray-400">לא נמצאו מוצרים</p>}
          </div>
        )}
      </section>

      {adding && (
        <LocalProductFormDialog
          warehouse={warehouse}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            queryClient.invalidateQueries({ queryKey: ['warehouse-local-products', warehouse.id] });
            toast({ title: 'המוצר נוסף ונשלח לאישור הרשת' });
          }}
        />
      )}
    </div>
  );
}