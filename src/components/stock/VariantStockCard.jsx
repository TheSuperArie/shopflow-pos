import React from 'react';
import { AlertTriangle, Package } from 'lucide-react';
import { useShipmentBatch } from '@/lib/ShipmentBatchContext';
import { variantDimText } from '@/lib/stockSelection';

/**
 * Square variant card for the stock grids — dimensions, a big stock number,
 * the product image and a selection checkbox. Colored by severity.
 */
export default function VariantStockCard({ variant, group, threshold = 5 }) {
  const { isItemSelected, toggleItem } = useShipmentBatch();
  const selected = isItemSelected(variant.id);

  const stock = variant.stock || 0;
  const isCritical = stock === 0;
  const isLow = !isCritical && stock < threshold;

  const tone = isCritical
    ? 'bg-red-50 border-red-300'
    : isLow
      ? 'bg-orange-50 border-orange-300'
      : 'bg-white border-gray-200';
  const stockTone = isCritical ? 'text-red-700' : isLow ? 'text-orange-600' : 'text-gray-800';

  const handleToggle = () => {
    toggleItem(variant.id, { ...variant, group_id: group?.id, group_name: group?.name });
  };

  return (
    <div
      onClick={handleToggle}
      className={`relative aspect-square rounded-xl border-2 p-2 flex flex-col items-center justify-between text-center cursor-pointer transition-all hover:brightness-95 ${tone} ${
        selected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
      }`}
    >
      <div className="w-full flex items-start justify-between">
        <input
          type="checkbox"
          checked={selected}
          onChange={handleToggle}
          onClick={e => e.stopPropagation()}
          className="w-5 h-5 accent-blue-600 cursor-pointer"
        />
        {isCritical && <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
      </div>

      {group?.image_url ? (
        <img src={group.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
      ) : (
        <Package className="w-8 h-8 text-gray-300" />
      )}

      <p className="text-[11px] leading-tight font-medium text-gray-700 line-clamp-2 w-full break-words">
        {variantDimText(variant)}
      </p>

      <div>
        <p className={`text-2xl font-bold leading-none ${stockTone}`}>{stock}</p>
        <p className="text-[10px] text-gray-500 mt-0.5">במלאי</p>
      </div>
    </div>
  );
}