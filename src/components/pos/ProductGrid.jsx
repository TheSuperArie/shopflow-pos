import React from 'react';
import { Folder } from 'lucide-react';

export default function ProductGrid({ groups, variants, onSelect }) {
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
        
        return (
          <button
            key={group.id}
            onClick={() => onSelect(group)}
            className="relative flex flex-col items-center p-4 rounded-2xl border-2 border-gray-200 bg-white hover:border-amber-300 hover:shadow-md transition-all active:scale-95"
          >
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
            <span className="text-xs mt-0.5 font-semibold text-gray-400">
              מלאי: {totalStock}
            </span>
          </button>
        );
      })}
    </div>
  );
}