import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

export default function DynamicVariantSelector({ open, group, variants, allVariants: allVariantsLive, onConfirm, onClose }) {
  const [currentDimensionIndex, setCurrentDimensionIndex] = useState(0);
  const [selectedValues, setSelectedValues] = useState({});

  // Fetch dimensions for this product's category
  const { data: allDimensions = [] } = useQuery({
    queryKey: ['variant-dimensions', group?.category_id],
    queryFn: () => group?.category_id ? base44.entities.VariantDimension.filter({ category_id: group.category_id, is_active: true }) : Promise.resolve([]),
    enabled: !!group?.category_id,
  });

  // Filter to only enabled dimensions for this product
  const enabledDimensions = allDimensions.filter(dim => 
    group?.enabled_dimensions?.includes(dim.id)
  ).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  // Reset on close
  const handleClose = () => {
    setCurrentDimensionIndex(0);
    setSelectedValues({});
    onClose();
  };

  useEffect(() => {
    if (open) {
      setCurrentDimensionIndex(0);
      setSelectedValues({});
    }
  }, [open]);

  if (!group) return null;

  const allVariants = variants || [];

  // If no dimensions configured, show simple stock check
  if (enabledDimensions.length === 0) {
    const variant = allVariants[0];
    const hasStock = variant && (variant.stock || 0) > 0;
    
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">{group.name}</DialogTitle>
            {group.has_uniform_price && (
              <p className="text-sm text-gray-500">מחיר: ₪{group.uniform_sell_price}</p>
            )}
          </DialogHeader>
          <div className="py-8 text-center">
            {hasStock ? (
              <div>
                <p className="text-lg mb-4">מלאי זמין: {variant.stock}</p>
                <Button 
                  onClick={() => { onConfirm(variant, group); handleClose(); }}
                  className="bg-amber-500 hover:bg-amber-600"
                >
                  הוסף לעגלה
                </Button>
              </div>
            ) : (
              <div className="text-gray-400">
                <AlertTriangle className="w-12 h-12 mb-3 mx-auto text-red-400" />
                <p className="text-lg">אזל מהמלאי</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const currentDimension = enabledDimensions[currentDimensionIndex];
  const isLastDimension = currentDimensionIndex === enabledDimensions.length - 1;

  // Get available values for current dimension based on previous selections
  const getAvailableValues = () => {
    if (!currentDimension) return [];

    return currentDimension.values.filter(value => {
      // Check if any variant matches this value + previous selections and has stock
      return allVariants.some(variant => {
        // Check previous selections match
        for (let i = 0; i < currentDimensionIndex; i++) {
          const prevDim = enabledDimensions[i];
          if (variant.dimensions?.[prevDim.name] !== selectedValues[prevDim.name]) {
            return false;
          }
        }
        // Check current value matches
        if (variant.dimensions?.[currentDimension.name] !== value) {
          return false;
        }
        // Check has stock
        return (variant.stock || 0) > 0;
      });
    });
  };

  const availableValues = getAvailableValues();

  const handleValueSelect = (value) => {
    const newSelections = { ...selectedValues, [currentDimension.name]: value };
    setSelectedValues(newSelections);

    if (isLastDimension) {
      // Find the exact variant
      const variant = allVariants.find(v => {
        if (!v.dimensions) return false;
        return enabledDimensions.every(dim => v.dimensions[dim.name] === newSelections[dim.name]);
      });

      if (variant && (variant.stock || 0) > 0) {
        onConfirm(variant, group);
        handleClose();
      }
    } else {
      // Move to next dimension
      setCurrentDimensionIndex(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentDimensionIndex > 0) {
      setCurrentDimensionIndex(prev => prev - 1);
      const newSelections = { ...selectedValues };
      delete newSelections[currentDimension.name];
      setSelectedValues(newSelections);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{group.name}</DialogTitle>
          {group.has_uniform_price && (
            <p className="text-sm text-gray-500">מחיר: ₪{group.uniform_sell_price}</p>
          )}
        </DialogHeader>

        {allVariants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <AlertTriangle className="w-12 h-12 mb-3 text-red-400" />
            <p className="text-lg">אין וריאציות מוגדרות למוצר זה</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Progress indicator */}
            <div className="flex items-center justify-center gap-2 mb-4 overflow-x-auto pb-2">
              {enabledDimensions.map((dim, idx) => (
                <React.Fragment key={dim.id}>
                  {idx > 0 && <div className="w-8 h-0.5 bg-gray-300 flex-shrink-0"></div>}
                  <div className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${
                    idx === currentDimensionIndex ? 'bg-amber-500 text-white' : 
                    idx < currentDimensionIndex ? 'bg-green-500 text-white' : 'bg-gray-200'
                  }`}>
                    {idx + 1}. {dim.name}
                  </div>
                </React.Fragment>
              ))}
            </div>

            {/* Current dimension selection */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-center">בחר {currentDimension?.name}</h3>
              {Object.keys(selectedValues).length > 0 && (
                <p className="text-sm text-gray-500 text-center">
                  {Object.entries(selectedValues).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                </p>
              )}
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {availableValues.map(value => (
                  <button
                    key={value}
                    onClick={() => handleValueSelect(value)}
                    className="relative p-6 text-lg font-bold rounded-xl border-2 border-gray-200 hover:border-amber-500 hover:bg-amber-50 transition-all"
                  >
                    {value}
                  </button>
                ))}
              </div>

              {availableValues.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <AlertTriangle className="w-10 h-10 mb-2 mx-auto text-red-400" />
                  <p>אין אפשרויות זמינות במלאי</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button onClick={currentDimensionIndex === 0 ? handleClose : handleBack} variant="outline" className="flex-1">
                {currentDimensionIndex === 0 ? 'ביטול' : 'חזור'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}