import React from 'react';
import { Check, Pencil, Package } from 'lucide-react';

/**
 * Square size tiles for the warehouse stock screen.
 * Tap = select (for the bottom bar). The pencil opens the count window for that size.
 * Shows the carton the size sits in, and what is reserved for open pickings.
 * showProduct: also print the product name (search results mix products).
 */
export default function WarehouseSizeTiles({ items, selected, onToggle, onEdit, showProduct = false }) {
  if (items.length === 0) return <p className="py-12 text-center text-gray-400">לא נמצאו מידות</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
      {items.map(it => {
        const isSel = selected.has(it.key);
        const out = it.qty <= 0;
        const tone = out ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white';
        return (
          <div
            key={it.key}
            onClick={() => onToggle([it.key], !isSel)}
            className={`relative aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 p-2 cursor-pointer transition-all ${isSel ? 'ring-4 ring-amber-400 border-amber-500' : tone}`}
          >
            {isSel && <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center"><Check className="w-3.5 h-3.5" /></span>}
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(it); }}
              className="absolute top-1 right-1 p-1.5 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600"
              title="ספירה / עדכון"
            >
              <Pencil className="w-4 h-4" />
            </button>
            {showProduct && <span className="text-[11px] text-gray-500 line-clamp-1 px-5 text-center">{it.product_name}</span>}
            <span className="text-sm text-gray-700 font-semibold line-clamp-2 text-center">{it.variant_label || 'רגיל'}</span>
            <span className={`text-2xl font-bold leading-none ${out ? 'text-red-600' : 'text-gray-900'}`}>{it.qty}</span>
            {it.reserved > 0 && (
              <span className="text-[11px] text-indigo-700">משוריין {it.reserved} · פנוי {it.free}</span>
            )}
            {it.carton_number && (
              <span className="flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">
                <Package className="w-3 h-3" /> קרטון {it.carton_number}
              </span>
            )}
            {it.isLocal && <span className="text-[10px] rounded-full bg-amber-100 text-amber-700 px-2">מקומי</span>}
            {it.sku && <span className="text-[10px] text-gray-400 font-mono">{it.sku}</span>}
          </div>
        );
      })}
    </div>
  );
}
