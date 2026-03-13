import React from 'react';
import { Package, AlertTriangle } from 'lucide-react';

export default function ProductGrid({ products, onSelect }) {
  if (!products.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Package className="w-12 h-12 mb-3" />
        <p className="text-lg">אין מוצרים בקטגוריה זו</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {products.map((product) => {
        const outOfStock = (product.stock || 0) <= 0;
        return (
          <button
            key={product.id}
            onClick={() => !outOfStock && onSelect(product)}
            disabled={outOfStock}
            className={`relative flex flex-col items-center p-4 rounded-2xl border-2 transition-all active:scale-95 ${
              outOfStock
                ? 'border-red-200 bg-red-50 opacity-60 cursor-not-allowed'
                : 'border-gray-200 bg-white hover:border-amber-300 hover:shadow-md'
            }`}
          >
            {outOfStock && (
              <div className="absolute top-2 left-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
            )}
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-16 h-16 object-cover rounded-xl mb-2"
              />
            ) : (
              <div className="w-16 h-16 bg-gray-100 rounded-xl mb-2 flex items-center justify-center">
                <Package className="w-8 h-8 text-gray-400" />
              </div>
            )}
            <span className="font-semibold text-sm text-center leading-tight">{product.name}</span>
            <span className="text-amber-600 font-bold mt-1">₪{product.sell_price}</span>
            <span className="text-xs text-gray-400 mt-0.5">מלאי: {product.stock || 0}</span>
          </button>
        );
      })}
    </div>
  );
}