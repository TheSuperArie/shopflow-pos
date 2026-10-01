import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ChevronDown } from 'lucide-react';
import { fetchWarehouseMovements } from '@/lib/warehouseStock';
import { formatOrderDate } from '@/lib/supplyOrders';

/** Goods receipts, grouped by receipt (each receipt = several lines saved together). */
export default function ReceiptHistory({ warehouseId }) {
  const [openId, setOpenId] = useState(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ['warehouse-movements', warehouseId],
    queryFn: () => fetchWarehouseMovements(warehouseId),
  });
  const receipts = useMemo(() => {
    const m = new Map();
    data.filter(x => x.type === 'RECEIPT').forEach(x => {
      const k = x.receipt_id || x.id;
      if (!m.has(k)) m.set(k, { id: k, first: x, lines: [] });
      m.get(k).lines.push(x);
    });
    return [...m.values()];
  }, [data]);

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-gray-700">היסטוריית קליטות</h3>
      {isLoading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
      ) : receipts.length === 0 ? (
        <p className="py-8 text-center text-gray-400 rounded-2xl border bg-white">עדיין לא נקלטה סחורה</p>
      ) : (
        <div className="rounded-2xl border bg-white divide-y">
          {receipts.map(r => {
            const units = r.lines.reduce((s, l) => s + Number(l.qty_change || 0), 0);
            const open = openId === r.id;
            return (
              <div key={r.id}>
                <button onClick={() => setOpenId(open ? null : r.id)} className="w-full text-right flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{formatOrderDate(r.first.date || r.first.created_date, true)} · {r.lines.length} שורות · {units} יחידות</p>
                    <p className="text-xs text-gray-500 truncate">
                      {r.first.supplier_name ? `ספק: ${r.first.supplier_name}` : 'ללא ספק'}
                      {r.first.delivery_note ? ` · ת.משלוח ${r.first.delivery_note}` : ''}
                      {r.first.notes ? ` · ${r.first.notes}` : ''}
                    </p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && (
                  <div className="bg-gray-50 px-4 py-2 space-y-1 text-sm">
                    {r.lines.map(l => (
                      <div key={l.id} className="flex justify-between"><span>{l.product_name} {l.variant_label ? `· ${l.variant_label}` : ''}</span><strong>+{l.qty_change}</strong></div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}