import React from 'react';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';
import { lineQty } from '@/lib/supplyOrders';

/**
 * Lines of a supply order as a plain table — SKU, product, size, quantities.
 * editable: the network can change each quantity and remove lines.
 * showPicked: adds the picked column once the warehouse has picked.
 */
export default function SupplyOrderLines({ items = [], editable = false, onChange, showBranchStock = true, showRequested = true, showPicked = false, showReceived = false }) {
  const update = (index, patch) => onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  const remove = (index) => onChange(items.filter((_, i) => i !== index));

  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="px-3 py-2.5 text-right font-medium">#</th>
            <th className="px-3 py-2.5 text-right font-medium">מק"ט</th>
            <th className="px-3 py-2.5 text-right font-medium">מוצר</th>
            <th className="px-3 py-2.5 text-right font-medium">מידה</th>
            <th className="px-3 py-2.5 text-right font-medium">סוג</th>
            {showBranchStock && <th className="px-3 py-2.5 text-center font-medium">מלאי בסניף</th>}
            {showRequested && <th className="px-3 py-2.5 text-center font-medium">ביקש הסניף</th>}
            <th className="px-3 py-2.5 text-center font-medium">{editable ? 'כמות להזמנה' : showRequested ? 'להזמנה' : 'כמות'}</th>
            {showPicked && <th className="px-3 py-2.5 text-center font-medium">לוקט</th>}
            {showReceived && <th className="px-3 py-2.5 text-center font-medium">התקבל</th>}
            {editable && <th className="w-10" />}
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item, index) => {
            const qty = lineQty(item);
            const changed = item.qty != null && Number(item.qty) !== Number(item.requested_qty);
            const picked = item.picked_qty;
            const over = picked != null && (item.extra || picked > qty);
            return (
              <tr key={`${item.variant_id}-${index}`} className={changed ? 'bg-amber-50/70' : ''}>
                <td className="px-3 py-2 text-gray-400">{index + 1}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-600 whitespace-nowrap">{item.sku || '—'}</td>
                <td className="px-3 py-2 font-medium text-gray-800">
                  {item.product_name}
                  {item.extra && <span className="mr-1 text-xs font-semibold text-red-600">(לא בהזמנה)</span>}
                </td>
                <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{item.variant_label || '—'}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{item.category_name || '—'}</td>
                {showBranchStock && <td className="px-3 py-2 text-center text-gray-500">{item.branch_stock ?? '—'}</td>}
                {showRequested && <td className="px-3 py-2 text-center text-gray-500">{item.requested_qty ?? '—'}</td>}
                <td className="px-3 py-1.5 text-center">
                  {editable ? (
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={qty}
                      onFocus={e => e.target.select()}
                      onChange={e => update(index, { qty: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      className={`h-9 w-20 mx-auto text-center font-semibold ${changed ? 'border-amber-400' : ''}`}
                    />
                  ) : (
                    <span className="font-bold text-gray-900">{qty}</span>
                  )}
                </td>
                {showPicked && (
                  <td className={`px-3 py-2 text-center font-semibold ${over ? 'text-red-600' : 'text-gray-800'}`}>
                    {picked ?? '—'}
                  </td>
                )}
                {showReceived && (
                  <td className={`px-3 py-2 text-center font-semibold ${item.received_qty != null && Number(item.received_qty) !== Number(picked || 0) ? 'text-amber-600' : 'text-green-700'}`}>
                    {item.received_qty ?? '—'}
                  </td>
                )}
                {editable && (
                  <td className="px-2 py-2 text-center">
                    <button onClick={() => remove(index)} className="text-gray-400 hover:text-red-600" title="הסר שורה">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr><td colSpan={10} className="py-10 text-center text-gray-400">אין שורות בהזמנה</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
