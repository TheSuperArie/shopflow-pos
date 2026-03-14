import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

export default function VariantSelectorModal({ open, group, variants, onConfirm, onClose }) {
  const [step, setStep] = useState(1); // 1: size, 2: cut, 3: collar
  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedCut, setSelectedCut] = useState(null);
  const [selectedCollar, setSelectedCollar] = useState(null);

  const { data: settings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const list = await base44.entities.AppSettings.list();
      return list[0] || { low_stock_threshold: 5 };
    },
  });

  const threshold = settings?.low_stock_threshold || 5;

  // Reset on close
  const handleClose = () => {
    setStep(1);
    setSelectedSize(null);
    setSelectedCut(null);
    setSelectedCollar(null);
    onClose();
  };

  if (!group) return null;

  const allVariants = variants || [];
  
  // Get unique sizes, cuts, collars
  const uniqueSizes = [...new Set(allVariants.map(v => v.size))].sort((a, b) => parseFloat(a) - parseFloat(b));
  const uniqueCuts = [...new Set(allVariants.map(v => v.cut))];
  const uniqueCollars = [...new Set(allVariants.map(v => v.collar))];

  // Filter variants based on current selections
  const availableVariants = allVariants.filter(v => {
    if (selectedSize && v.size !== selectedSize) return false;
    if (selectedCut && v.cut !== selectedCut) return false;
    return true;
  });

  const handleSizeSelect = (size) => {
    setSelectedSize(size);
    setStep(2);
  };

  const handleCutSelect = (cut) => {
    setSelectedCut(cut);
    setStep(3);
  };

  const handleCollarSelect = (collar) => {
    setSelectedCollar(collar);
    // Find the exact variant
    const variant = allVariants.find(v => 
      v.size === selectedSize && 
      v.cut === selectedCut && 
      v.collar === collar
    );
    if (variant) {
      onConfirm(variant, group);
      handleClose();
    }
  };

  const handleBack = () => {
    if (step === 3) {
      setStep(2);
      setSelectedCollar(null);
    } else if (step === 2) {
      setStep(1);
      setSelectedCut(null);
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
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${step === 1 ? 'bg-amber-500 text-white' : 'bg-gray-200'}`}>
                1. מידה
              </div>
              <div className="w-8 h-0.5 bg-gray-300"></div>
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${step === 2 ? 'bg-amber-500 text-white' : 'bg-gray-200'}`}>
                2. גזרה
              </div>
              <div className="w-8 h-0.5 bg-gray-300"></div>
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${step === 3 ? 'bg-amber-500 text-white' : 'bg-gray-200'}`}>
                3. צווארון
              </div>
            </div>

            {/* Step 1: Select Size */}
            {step === 1 && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-center">בחר מידה</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {uniqueSizes.map(size => {
                    const hasStock = allVariants.some(v => v.size === size && (v.stock || 0) > 0);
                    return (
                      <button
                        key={size}
                        onClick={() => handleSizeSelect(size)}
                        className={`relative p-6 text-2xl font-bold rounded-xl border-2 transition-all ${
                          hasStock
                            ? 'border-gray-200 hover:border-amber-500 hover:bg-amber-50'
                            : 'border-red-200 bg-red-50 hover:border-red-300'
                        }`}
                      >
                        {size}
                        {!hasStock && (
                          <div className="absolute top-1 left-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded">
                            אזל
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2: Select Cut */}
            {step === 2 && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-center">בחר גזרה</h3>
                <p className="text-sm text-gray-500 text-center">מידה: {selectedSize}</p>
                <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
                  {uniqueCuts.map(cut => {
                    const hasStock = availableVariants.some(v => v.cut === cut && (v.stock || 0) > 0);
                    return (
                      <button
                        key={cut}
                        onClick={() => handleCutSelect(cut)}
                        className={`relative p-10 text-2xl font-bold rounded-xl border-2 transition-all ${
                          hasStock
                            ? 'border-gray-200 hover:border-amber-500 hover:bg-amber-50'
                            : 'border-red-200 bg-red-50 hover:border-red-300'
                        }`}
                      >
                        {cut}
                        {!hasStock && (
                          <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                            אזל
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Select Collar */}
            {step === 3 && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-center">בחר צווארון</h3>
                <p className="text-sm text-gray-500 text-center">מידה: {selectedSize} | גזרה: {selectedCut}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {uniqueCollars.map(collar => {
                    const variant = allVariants.find(v => 
                      v.size === selectedSize && 
                      v.cut === selectedCut && 
                      v.collar === collar
                    );
                    const hasStock = variant && (variant.stock || 0) > 0;
                    const stock = variant?.stock || 0;
                    const isLowStock = stock > 0 && stock < threshold;
                    
                    return (
                      <button
                        key={collar}
                        onClick={() => handleCollarSelect(collar)}
                        className={`relative p-10 text-2xl font-bold rounded-xl border-2 transition-all ${
                          hasStock
                            ? isLowStock
                              ? 'border-orange-300 bg-orange-50 hover:border-orange-500'
                              : 'border-gray-200 hover:border-amber-500 hover:bg-amber-50'
                            : 'border-red-200 bg-red-50 hover:border-red-300'
                        }`}
                      >
                        {collar}
                        <p className={`text-xs mt-2 font-semibold ${
                          !hasStock ? 'text-red-600' : isLowStock ? 'text-orange-600' : 'text-gray-400'
                        }`}>
                          מלאי: {stock}
                        </p>
                        {!hasStock && (
                          <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded font-semibold">
                            אזל מהמלאי
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button onClick={step === 1 ? handleClose : handleBack} variant="outline" className="flex-1">
                {step === 1 ? 'ביטול' : 'חזור'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}