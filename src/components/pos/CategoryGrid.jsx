import React from 'react';
import { Shirt, Package, ArrowRight } from 'lucide-react';

const iconMap = {
  shirt: Shirt,
  package: Package,
};

export default function CategoryGrid({ categories, selectedCategory, onSelect }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {selectedCategory && (
        <button
          onClick={() => onSelect(null)}
          className="flex items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-amber-500 hover:text-amber-600 transition-all active:scale-95"
        >
          <ArrowRight className="w-5 h-5" />
          <span className="font-medium">כל הקטגוריות</span>
        </button>
      )}
      {categories.map((cat) => {
        const Icon = iconMap[cat.icon] || Package;
        const isActive = selectedCategory?.id === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat)}
            className={`flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 transition-all active:scale-95 min-h-[100px] ${
              isActive
                ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-md'
                : 'border-gray-200 bg-white text-gray-700 hover:border-amber-300 hover:shadow-sm'
            }`}
          >
            <Icon className="w-8 h-8" />
            <span className="font-semibold text-sm">{cat.name}</span>
          </button>
        );
      })}
    </div>
  );
}