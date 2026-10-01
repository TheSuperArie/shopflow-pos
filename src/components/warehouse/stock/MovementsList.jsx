import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { fetchWarehouseMovements, MOVEMENT_TYPES } from '@/lib/warehouseStock';
import { formatOrderDate } from '@/lib/supplyOrders';

/** Latest stock movements of a warehouse (all types). */
export default function MovementsList({ warehouseId }) {
  const [type, setType] = useState('');
  const { data = [], isLoading } = useQuery({
    queryKey: ['warehouse-movements', warehouseId],
    queryFn: () => fetchWarehouseMovements(warehouseId),
  });
  const shown = data.filter(m => !type || m.type === type).slice(0, 300);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-gray-700 flex-1">תנועות מלאי</h3>
        <select value={type} onChange={e => setType(e.target.value)} className="h-9 rounded-md border bg-white px-2 text-sm">
          <option value="">כל הסוגים</option>
          {Object.entries(MOVEMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      {isLoading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-gray-400 rounded-2xl border bg-white">אין תנועות</p>
      ) : (
        <div className="rounded-2xl border bg-white divide-y max-h-[50vh] overflow-y-auto text-sm">
          {shown.map(m => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-2">
              <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${MOVEMENT_TYPES[m.type]?.color || ''}`}>{MOVEMENT_TYPES[m.type]?.label || m.type}</span>
              <div className="flex-1 min-w-0">
                <p className="truncate text-gray-900">{m.product_name} {m.variant_label ? `· ${m.variant_label}` : ''}</p>
                <p className="text-xs text-gray-500 truncate">
                  {formatOrderDate(m.date || m.created_date, true)}
                  {m.order_number ? ` · הזמנה #${m.order_number}` : ''}
                  {m.delivery_note ? ` · ת.משלוח ${m.delivery_note}` : ''}
                  {m.performed_by ? ` · ${m.performed_by}` : ''}
                  {m.notes ? ` · ${m.notes}` : ''}
                </p>
              </div>
              <span className={`font-bold ${m.qty_change < 0 ? 'text-red-600' : 'text-green-700'}`} dir="ltr">{m.qty_change > 0 ? `+${m.qty_change}` : m.qty_change}</span>
              <span className={`w-12 text-center text-xs ${m.qty_after < 0 ? 'text-red-600' : 'text-gray-500'}`}>= {m.qty_after}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}