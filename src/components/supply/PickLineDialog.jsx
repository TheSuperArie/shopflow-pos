import React from 'react';
import { Button } from '@/components/ui/button';
import { X, Delete, AlertTriangle, Check, Minus, Plus, Package } from 'lucide-react';
import { lineQty, cartonBreakdown } from '@/lib/supplyOrders';

/**
 * Big, touch-friendly popup for one line: how many are needed, how many were packed.
 * The quantity is typed on the on-screen keypad (or a keyboard) — never in a text field,
 * so a barcode scan can't be typed into it by mistake.
 * cartonSize (shirts per carton, known after a carton label was scanned) adds the
 * "how many cartons" breakdown; every further carton scan adds one more carton.
 */
export default function PickLineDialog({ line, qty, onQtyChange, onConfirm, onCancel, saving, cartonSize, cartonNumber }) {
  if (!line) return null;
  const needed = lineQty(line);
  const n = Number(qty || 0);
  const over = line.extra ? n : Math.max(0, n - needed);
  const neededCartons = cartonBreakdown(needed, cartonSize);
  const packedCartons = cartonBreakdown(n, cartonSize);
  const leftCartons = !line.extra && n < needed ? cartonBreakdown(needed - n, cartonSize) : '';
  const press = (k) => {
    if (k === 'C') return onQtyChange('');
    if (k === '⌫') return onQtyChange(String(qty || '').slice(0, -1));
    const next = `${qty === '0' ? '' : qty || ''}${k}`.slice(0, 5);
    onQtyChange(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" dir="rtl">
      <div className="w-full sm:max-w-lg bg-white sm:rounded-3xl rounded-t-3xl shadow-2xl p-5 space-y-4 max-h-[96vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xl font-bold text-gray-900 leading-tight">{line.product_name}</p>
            <p className="text-lg text-gray-700 mt-0.5">{line.variant_label || '—'}</p>
            <p className="text-sm text-gray-500 font-mono mt-0.5">מק"ט {line.sku || '—'}</p>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            {cartonNumber && (
              <span className="flex items-center gap-1 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 font-bold">
                <Package className="w-5 h-5" /> קרטון {cartonNumber}
              </span>
            )}
            <button onClick={onCancel} className="p-2 rounded-xl hover:bg-gray-100"><X className="w-6 h-6 text-gray-500" /></button>
          </div>
        </div>

        {line.extra ? (
          <div className="flex items-center gap-2 rounded-2xl bg-red-50 border-2 border-red-300 px-4 py-3 text-red-700 font-semibold">
            <AlertTriangle className="w-6 h-6 shrink-0" /> המוצר הזה לא בהזמנה — לא צריך אותו. אפשר עדיין להוסיף.
          </div>
        ) : (
          <div className="rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-lg text-blue-900">צריך</span>
              <span className="text-4xl font-bold text-blue-900">{needed}</span>
            </div>
            {neededCartons && (
              <p className="mt-1 flex items-center gap-1.5 text-lg font-bold text-blue-800">
                <Package className="w-5 h-5" /> {neededCartons}
                <span className="text-sm font-normal text-blue-700">({cartonSize} בקרטון)</span>
              </p>
            )}
          </div>
        )}

        <div className={`rounded-2xl border-2 px-4 py-3 flex items-center justify-between ${over > 0 ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}>
          <span className="text-lg text-gray-700">נארז</span>
          <div className="flex items-center gap-3">
            <button onClick={() => onQtyChange(String(Math.max(0, n - 1)))} className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center"><Minus className="w-6 h-6" /></button>
            <span className={`text-5xl font-bold min-w-[3ch] text-center ${over > 0 ? 'text-red-600' : 'text-gray-900'}`}>{qty === '' ? '0' : qty}</span>
            <button onClick={() => onQtyChange(String(n + 1))} className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center"><Plus className="w-6 h-6" /></button>
          </div>
        </div>
        {over > 0 && !line.extra && <p className="text-center text-red-600 font-semibold">חריגה של {over} מעבר להזמנה</p>}
        {cartonSize && n > 0 && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-center">
            <p className="text-lg font-semibold text-amber-900">נארז: {packedCartons}</p>
            {leftCartons && <p className="text-base text-amber-800">נשאר לארוז: {leftCartons}</p>}
            <p className="text-xs text-amber-700 mt-0.5">כל סריקה של קרטון מוסיפה עוד {cartonSize}</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2" dir="ltr">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(k => (
            <button
              key={k}
              onClick={() => press(k)}
              className="h-16 rounded-2xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-2xl font-bold text-gray-800 flex items-center justify-center"
            >
              {k === '⌫' ? <Delete className="w-7 h-7" /> : k}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {!line.extra && (
            <Button variant="outline" onClick={() => onQtyChange(String(needed))} className="h-14 text-lg">
              הכל ({needed})
            </Button>
          )}
          <Button onClick={onConfirm} disabled={saving} className={`h-14 text-lg gap-2 bg-green-600 hover:bg-green-700 ${line.extra ? 'col-span-2' : ''}`}>
            <Check className="w-6 h-6" /> אשר
          </Button>
        </div>
      </div>
    </div>
  );
}
