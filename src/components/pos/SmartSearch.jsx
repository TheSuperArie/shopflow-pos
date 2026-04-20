import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Package, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { offlineManager } from '@/components/pos/offlineManager';

export default function SmartSearch({ groups, variants, onSelectGroup, onSelectVariant, categories }) {
  // Fallback to cache if data is empty
  const [cachedGroups, setCachedGroups] = useState(groups);
  const [cachedVariants, setCachedVariants] = useState(variants);
  const [cachedCategories, setCachedCategories] = useState(categories);
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);

  // Hydrate with cache if props are empty
  useEffect(() => {
    if (groups.length > 0) {
      setCachedGroups(groups);
    } else {
      offlineManager.getCachedInventory().then(cached => {
        setCachedGroups(cached.groups);
      });
    }
  }, [groups]);

  useEffect(() => {
    if (variants.length > 0) {
      setCachedVariants(variants);
    } else {
      offlineManager.getCachedInventory().then(cached => {
        setCachedVariants(cached.variants);
      });
    }
  }, [variants]);

  useEffect(() => {
    if (categories.length > 0) {
      setCachedCategories(categories);
    }
  }, [categories]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle Enter key — treat as barcode/SKU scan (exact match)
  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    const code = query.trim();
    if (!code) return;

    // Exact match on variant barcode or SKU
    const exactVariant = cachedVariants.find(v =>
      (v.barcode && (v.barcode === code || v.barcode.slice(-4) === code)) ||
      (v.sku && (v.sku === code || v.sku.slice(-4) === code))
    );
    if (exactVariant) {
      const group = cachedGroups.find(g => g.id === exactVariant.group_id);
      if (group && onSelectVariant) {
        onSelectVariant(exactVariant, group);
        setQuery('');
        setShowResults(false);
        return;
      }
    }

    // Exact match on group barcode
    const exactGroup = cachedGroups.find(g =>
      g.barcode && (g.barcode === code || g.barcode.slice(-4) === code)
    );
    if (exactGroup) {
      onSelectGroup(exactGroup);
      setQuery('');
      setShowResults(false);
      return;
    }

    // If only one result in search — auto-select it
    if (searchResults.length === 1) {
      handleSelectGroup(searchResults[0]);
    }
  };

  // Check if query is exactly 4 digits (barcode scan)
  const isBarcodeSearch = /^\d{4}$/.test(query);
  
  // Find exact variant by last 4 digits of barcode (use cache if needed)
  useEffect(() => {
    if (isBarcodeSearch && onSelectVariant) {
      // Priority 1: search on variants directly
      const exactVariant = cachedVariants.find(v => 
        v.barcode && 
        v.barcode.slice(-4) === query && 
        (v.stock || 0) > 0
      );
      
      if (exactVariant) {
        const group = cachedGroups.find(g => g.id === exactVariant.group_id);
        if (group) {
          onSelectVariant(exactVariant, group);
          setQuery('');
          setShowResults(false);
          return;
        }
      }

      // Priority 2: search on group barcode
      const exactGroup = cachedGroups.find(g => 
        g.barcode && g.barcode.slice(-4) === query
      );
      if (exactGroup) {
        const groupVariants = cachedVariants.filter(v => v.group_id === exactGroup.id && (v.stock || 0) > 0);
        if (groupVariants.length === 1) {
          // Single variant - select directly
          onSelectVariant(groupVariants[0], exactGroup);
          setQuery('');
          setShowResults(false);
        } else {
          // Multiple variants - open group selector
          onSelectGroup(exactGroup);
          setQuery('');
          setShowResults(false);
        }
      }
    }
  }, [query, isBarcodeSearch, cachedVariants, cachedGroups, onSelectVariant]);

  const searchResults = query.trim().length >= 2 ? cachedGroups.filter(group => {
    const searchLower = query.toLowerCase().trim();
    const nameMatch = group.name.toLowerCase().includes(searchLower);

    // Check if any variant has stock
    const groupVariants = cachedVariants.filter(v => v.group_id === group.id);
    const hasStock = groupVariants.some(v => (v.stock || 0) > 0);

    // Match variant barcode or SKU (full or last 4 digits)
    const variantMatch = groupVariants.some(v =>
      (v.barcode && (v.barcode.toLowerCase().includes(searchLower) || v.barcode.slice(-4) === searchLower)) ||
      (v.sku && (v.sku.toLowerCase().includes(searchLower) || v.sku.slice(-4) === searchLower))
    );

    // Match group-level barcode
    const groupBarcodeMatch = group.barcode && (
      group.barcode.toLowerCase().includes(searchLower) ||
      group.barcode.slice(-4) === searchLower
    );

    return (nameMatch || variantMatch || groupBarcodeMatch) && hasStock;
  }).slice(0, 8) : [];

  const handleSelectGroup = (group) => {
    onSelectGroup(group);
    setQuery('');
    setShowResults(false);
  };

  const getCategoryName = (categoryId) => {
    const category = cachedCategories.find(c => c.id === categoryId);
    return category?.name || '';
  };

  const getGroupStock = (groupId) => {
    const groupVariants = cachedVariants.filter(v => v.group_id === groupId);
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
          onKeyDown={handleKeyDown}
          placeholder="חיפוש מהיר - הקלד שם מוצר, ברקוד או מק״ט..."
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