import React from 'react';
import { Trash2, Plus, Minus, ShoppingCart, CreditCard, PackageOpen } from 'lucide-react';

const SERIF = { fontFamily: "'Frank Ruhl Libre', Georgia, serif" };
const money = (n) => `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;

/**
 * POS cart: compact lines with big +/- (touch size), the line just added flashes (flashId = its variant_id),
 * and the pay button carries the total and the item count.
 */
export default function Cart({ items, onUpdateQty, onRemove, onCheckout, onClear, flashId }) {
  const total = items.reduce((sum, item) => sum + item.sell_price * item.quantity, 0);
  const units = items.reduce((sum, item) => sum + item.quantity, 0);
  const unitsLabel = units === 1 ? 'פריט אחד' : `${units} פריטים`;

  return (
    <div className="flex flex-col h-full min-h-0 rounded-2xl bg-[#FFFDF8] border-[1.5px] border-[#E2D8C4] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#E2D8C4]">
        <span className="flex items-center gap-2.5 text-xl font-bold" style={SERIF}>
          <ShoppingCart className="w-5 h-5" strokeWidth={1.8} />
          עגלה
          {units > 0 && (
            <span className="text-sm font-medium px-2.5 py-0.5 rounded-full bg-[#F0E6D2] text-[#5A3E0E]" style={{ fontFamily: 'inherit' }}>
              {unitsLabel}
            </span>
          )}
        </span>
        {items.length > 0 && onClear && (
          <button onClick={onClear} className="h-11 px-3 rounded-xl text-sm font-medium text-[#A23B2A] hover:bg-[#F7E3DF] transition-colors">
            נקה עגלה
          </button>
        )}
      </div>

      {/* Lines */}
      {!items.length ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 py-12 text-center text-[#5E5A52]">
          <PackageOpen className="w-12 h-12 text-[#B8AE9A]" strokeWidth={1.4} />
          <p className="text-lg font-medium text-[#1E2433]">העגלה ריקה</p>
          <p className="text-sm">סרוק חולצה, או בחר קטגוריה ומידה</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {items.map((item, idx) => {
            const flashing = flashId && item.variant_id === flashId;
            return (
              <div key={item.variant_id || idx}
                className={`flex items-center gap-2.5 px-4 py-3 border-b border-[#EFE7D6] transition-colors duration-500 ${flashing ? 'bg-[#F8E7BF]' : 'bg-[#FFFDF8]'}`}>
                <button onClick={() => onRemove(idx)} aria-label="הסר מהעגלה"
                  className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-[#B4A898] hover:text-[#A23B2A] hover:bg-[#F7E3DF] transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[15px] leading-snug line-clamp-2">{item.product_name}</p>
                  {item.shirt_size && (
                    <p className="text-xs text-[#5E5A52] mt-0.5">{item.shirt_size} · {item.shirt_collar} · {item.shirt_cut}</p>
                  )}
                  <p className="text-[13px] text-[#5E5A52] mt-0.5">{money(item.sell_price)} ליחידה</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => onUpdateQty(idx, item.quantity - 1)} aria-label="פחות"
                    className="w-11 h-11 rounded-xl border-[1.5px] border-[#E2D8C4] bg-[#F5EFE3] flex items-center justify-center hover:bg-[#EDE4D2] active:scale-95">
                    <Minus className="w-[18px] h-[18px]" strokeWidth={2.2} />
                  </button>
                  <span className="w-8 text-center text-xl font-bold tabular-nums">{item.quantity}</span>
                  <button onClick={() => onUpdateQty(idx, item.quantity + 1)} aria-label="עוד אחד"
                    className="w-11 h-11 rounded-xl border-[1.5px] border-[#E2D8C4] bg-[#F5EFE3] flex items-center justify-center hover:bg-[#EDE4D2] active:scale-95">
                    <Plus className="w-[18px] h-[18px]" strokeWidth={2.2} />
                  </button>
                </div>
                <span className="w-[72px] shrink-0 text-left font-bold text-base tabular-nums">{money(item.sell_price * item.quantity)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Total + pay */}
      <div className="mt-auto flex flex-col gap-3 px-4 pt-3.5 pb-4 border-t border-[#E2D8C4] bg-[#FBF7EE]">
        <div className="flex items-baseline justify-between">
          <span className="text-base text-[#5E5A52]">סה״כ לתשלום</span>
          <span className="text-4xl font-bold tabular-nums" style={SERIF}>{money(total)}</span>
        </div>
        <button
          onClick={onCheckout}
          disabled={!items.length}
          className="h-16 rounded-2xl text-xl font-bold flex items-center justify-center gap-2.5 transition-all active:scale-[0.99] bg-[#2E6B4C] hover:bg-[#25573D] text-white disabled:bg-[#DDD5C4] disabled:text-[#6B665C] disabled:cursor-not-allowed"
        >
          <CreditCard className="w-6 h-6" strokeWidth={1.9} />
          {items.length ? `לתשלום ${money(total)} · ${unitsLabel}` : 'לתשלום'}
        </button>
      </div>
    </div>
  );
}
