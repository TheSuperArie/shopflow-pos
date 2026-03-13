import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Package, X } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function SmartSearch({ groups, variants, onSelectGroup, categories }) {
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchResults = query.trim().length >= 2 ? groups.filter(group => {
    const searchLower = query.toLowerCase();
    const nameMatch = group.name.toLowerCase().includes(searchLower);
    
    // Check if any variant has stock
    const groupVariants = variants.filter(v => v.group_id === group.id);
    const hasStock = groupVariants.some(v => (v.stock || 0) > 0);
    
    return nameMatch && hasStock;
  }).slice(0, 8) : [];

  const handleSelectGroup = (group) => {
    onSelectGroup(group);
    setQuery('');
    setShowResults(false);
  };

  const getCategoryName = (categoryId) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name || '';
  };

  const getGroupStock = (groupId) => {
    const groupVariants = variants.filter(v => v.group_id === groupId);
    return groupVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
  };

  return (
    <div ref={searchRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => query.trim().length >= 2 && setShowResults(true)}
          placeholder="חיפוש מהיר - הקלד שם מוצר..."
          className="pr-10 pl-10 h-12 text-base border-2 border-gray-300 focus:border-amber-400"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setShowResults(false);
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {showResults && searchResults.length > 0 && (
        <Card className="absolute top-full mt-2 w-full max-h-96 overflow-y-auto z-50 shadow-xl border-2 border-amber-200">
          <div className="p-2 space-y-1">
            {searchResults.map(group => {
              const stock = getGroupStock(group.id);
              return (
                <button
                  key={group.id}
                  onClick={() => handleSelectGroup(group)}
                  className="w-full p-3 rounded-lg bg-white hover:bg-amber-50 border border-gray-200 hover:border-amber-300 transition-all text-right flex items-center gap-3"
                >
                  {group.image_url ? (
                    <img 
                      src={group.image_url} 
                      alt={group.name}
                      className="w-12 h-12 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                      <Package className="w-6 h-6 text-amber-600" />
                    </div>
                  )}
                  <div className="flex-1 text-right">
                    <p className="font-semibold text-gray-800">{group.name}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">{getCategoryName(group.category_id)}</span>
                      <span className="text-gray-400">•</span>
                      <span className="text-gray-500">מלאי: {stock}</span>
                    </div>
                  </div>
                  {group.has_uniform_price && (
                    <span className="text-amber-600 font-bold text-lg">₪{group.uniform_sell_price}</span>
                  )}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {showResults && query.trim().length >= 2 && searchResults.length === 0 && (
        <Card className="absolute top-full mt-2 w-full z-50 shadow-xl border-2 border-gray-200">
          <div className="p-6 text-center text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>לא נמצאו מוצרים</p>
          </div>
        </Card>
      )}
    </div>
  );
}