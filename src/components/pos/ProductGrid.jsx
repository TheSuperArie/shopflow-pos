import React from 'react';
import { Folder, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

export default function ProductGrid({ groups, variants, onSelect }) {
  const { data: settings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const list = await base44.entities.AppSettings.list();
      return list[0] || { low_stock_threshold: 5 };
    },
  });

  const threshold = settings?.low_stock_threshold || 5;
  if (!groups.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Folder className="w-12 h-12 mb-3" />
        <p className="text-lg">אין מוצרים בקטגוריה זו</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {groups.map((group) => {
        const groupVariants = variants.filter(v => v.group_id === group.id);
        const totalStock = groupVariants.reduce((s, v) => s + (v.stock || 0), 0);
        const outOfStock = totalStock <= 0;
        const isLowStock = totalStock > 0 && totalStock < threshold;
        
        return (
          <button
            key={group.id}
            onClick={() => !outOfStock && onSelect(group)}
            disabled={outOfStock}
            className={`relative flex flex-col items-center p-4 rounded-2xl border-2 transition-all active:scale-95 ${
              outOfStock
                ? 'border-red-200 bg-red-50 opacity-60 cursor-not-allowed'
                : isLowStock
                ? 'border-orange-200 bg-orange-50 hover:border-orange-300 hover:shadow-md'
                : 'border-gray-200 bg-white hover:border-amber-300 hover:shadow-md'
            }`}
          >
            {outOfStock && (
              <div className="absolute top-2 left-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
            )}
            {isLowStock && !outOfStock && (
              <div className="absolute top-2 left-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
              </div>
            )}
            {group.image_url ? (
              <img
                src={group.image_url}
                alt={group.name}
                className="w-16 h-16 object-cover rounded-xl mb-2"
              />
            ) : (
              <div className="w-16 h-16 bg-amber-50 rounded-xl mb-2 flex items-center justify-center">
                <Folder className="w-8 h-8 text-amber-400" />
              </div>
            )}
            <span className="font-semibold text-sm text-center leading-tight">{group.name}</span>
            {group.has_uniform_price && (
              <span className="text-amber-600 font-bold mt-1">₪{group.uniform_sell_price}</span>
            )}
            <span className={`text-xs mt-0.5 font-semibold ${
              outOfStock ? 'text-red-600' : isLowStock ? 'text-orange-600' : 'text-gray-400'
            }`}>
              מלאי: {totalStock}
            </span>
          </button>
        );
      })}
    </div>
  );
}