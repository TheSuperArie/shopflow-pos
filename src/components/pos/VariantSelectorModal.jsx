import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

export default function VariantSelectorModal({ open, group, variants, onConfirm, onClose }) {
  const [selectedVariant, setSelectedVariant] = useState(null);

  const { data: settings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const list = await base44.entities.AppSettings.list();
      return list[0] || { low_stock_threshold: 5 };
    },
  });

  const threshold = settings?.low_stock_threshold || 5;

  if (!group) return null;

  const availableVariants = variants.filter(v => (v.stock || 0) > 0);

  const handleConfirm = () => {
    if (selectedVariant) {
      onConfirm(selectedVariant, group);
      setSelectedVariant(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{group.name}</DialogTitle>
          {group.has_uniform_price && (
            <p className="text-sm text-gray-500">מחיר: ₪{group.uniform_sell_price}</p>
          )}
        </DialogHeader>

        {availableVariants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <AlertTriangle className="w-12 h-12 mb-3 text-red-400" />
            <p className="text-lg">אין מלאי זמין</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">בחר מידה, גזרה וצווארון:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {availableVariants.map(variant => {
                const stock = variant.stock || 0;
                const isLowStock = stock < threshold;
                return (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant)}
                    className={`relative p-4 rounded-xl border-2 text-right transition-all ${
                      selectedVariant?.id === variant.id
                        ? 'border-amber-500 bg-amber-50'
                        : isLowStock
                        ? 'border-orange-200 bg-orange-50 hover:border-orange-300'
                        : 'border-gray-200 bg-white hover:border-amber-300'
                    }`}
                  >
                    {isLowStock && (
                      <div className="absolute top-2 left-2">
                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                      </div>
                    )}
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-lg">מידה {variant.size}</p>
                        <p className="text-sm text-gray-600">{variant.cut} | {variant.collar}</p>
                        <p className={`text-xs mt-1 font-semibold ${isLowStock ? 'text-orange-600' : 'text-gray-400'}`}>
                          מלאי: {stock}
                        </p>
                      </div>
                      {!group.has_uniform_price && (
                        <span className="text-amber-600 font-bold">₪{variant.sell_price}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 pt-4">
              <Button onClick={onClose} variant="outline" className="flex-1">
                ביטול
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!selectedVariant}
                className="flex-1 bg-amber-500 hover:bg-amber-600"
              >
                הוסף לעגלה
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}