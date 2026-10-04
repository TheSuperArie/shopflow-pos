import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Package } from 'lucide-react';

const labelOf = (dims = {}) => Object.values(dims).join(' / ');

/** Inline editor for a product's variants (label / stock / price / cost, + carton number & carton barcode). */
export default function BranchVariantsEditor({ variants, onChange, hasUniformPrice, hideStock = false }) {
  const update = (idx, patch) => onChange(variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)));

  const setLabel = (idx, value) => {
    const v = variants[idx];
    const keys = Object.keys(v.dimensions || {});
    const key = keys[0] || 'וריאנט';
    update(idx, { dimensions: { ...(keys.length > 1 ? v.dimensions : {}), [key]: value } });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">{hideStock ? 'וריאנטים / מידות' : 'וריאנטים ומלאי'}</p>
        <Button type="button" size="sm" variant="outline"
          onClick={() => onChange([...variants, { dimensions: {}, stock: 0, sell_price: null, cost_price: null }])}>
          <Plus className="w-3.5 h-3.5 ml-1" /> וריאנט
        </Button>
      </div>

      {variants.length === 0 && (
        <p className="text-xs text-gray-400">אין וריאנטים — הוסף לפחות אחד כדי שהמוצר יימכר בקופה</p>
      )}

      {variants.map((v, idx) => (
        <div key={v.id || `new-${idx}`} className="space-y-1.5 rounded-xl border border-gray-100 p-2">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input value={labelOf(v.dimensions)} onChange={e => setLabel(idx, e.target.value)}
              placeholder="תיאור (למשל: L / כחול)" />
          </div>
          {!hideStock && (
            <div className="w-20">
              <Input type="number" value={v.stock ?? 0} onChange={e => update(idx, { stock: Number(e.target.value) })}
                placeholder="מלאי" />
            </div>
          )}
          {!hasUniformPrice && (
            <>
              <div className="w-20">
                <Input type="number" value={v.sell_price ?? ''} onChange={e => update(idx, { sell_price: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="מחיר" />
              </div>
              <div className="w-20">
                <Input type="number" value={v.cost_price ?? ''} onChange={e => update(idx, { cost_price: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="עלות" />
              </div>
            </>
          )}
          <button type="button" onClick={() => onChange(variants.filter((_, i) => i !== idx))}
            className="p-2 rounded-lg hover:bg-red-50 shrink-0">
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="w-24">
            <Input value={v.carton_number ?? ''} onChange={e => update(idx, { carton_number: e.target.value })}
              placeholder="מס' קרטון" className="h-8 text-sm" />
          </div>
          <div className="flex-1">
            <Input value={v.carton_barcode ?? ''} onChange={e => update(idx, { carton_barcode: e.target.value })}
              placeholder="ברקוד קרטון (אופציונלי)" dir="ltr" className="h-8 text-sm font-mono" />
          </div>
        </div>
        </div>
      ))}
    </div>
  );
}