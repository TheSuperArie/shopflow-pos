import React from 'react';
import { Trash2, Plus, Minus, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Cart({ items, onUpdateQty, onRemove, onCheckout }) {
  const total = items.reduce((sum, item) => sum + item.sell_price * item.quantity, 0);

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
        <ShoppingCart className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">העגלה ריקה</p>
        <p className="text-sm mt-1">בחר מוצרים מהרשימה</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 pb-4">
        {items.map((item, idx) => (
          <div key={idx} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 truncate">{item.product_name}</p>
                {item.shirt_size && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {item.shirt_size} | {item.shirt_collar} | {item.shirt_cut}
                  </p>
                )}
                <p className="text-amber-600 font-bold mt-1">₪{item.sell_price}</p>
              </div>
              <button
                onClick={() => onRemove(idx)}
                className="text-red-400 hover:text-red-600 p-1 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => onUpdateQty(idx, item.quantity - 1)}
                className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 active:scale-95"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="font-bold text-lg w-8 text-center">{item.quantity}</span>
              <button
                onClick={() => onUpdateQty(idx, item.quantity + 1)}
                className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 active:scale-95"
              >
                <Plus className="w-4 h-4" />
              </button>
              <span className="mr-auto font-bold text-gray-800">
                ₪{(item.sell_price * item.quantity).toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200 pt-4 mt-auto space-y-3">
        <div className="flex justify-between items-center text-xl font-bold">
          <span>סה"כ</span>
          <span className="text-amber-600">₪{total.toFixed(2)}</span>
        </div>
        <Button
          onClick={onCheckout}
          className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-700 rounded-xl active:scale-[0.98] transition-all"
        >
          המשך לתשלום
        </Button>
      </div>
    </div>
  );
}