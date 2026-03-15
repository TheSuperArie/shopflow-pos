import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function VariantSelectorModal({ open, group, variants, onConfirm, onClose }) {
  const [step, setStep] = useState(1); // 1: size, 2: cut, 3: collar
  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedCut, setSelectedCut] = useState(null);
  const [selectedCollar, setSelectedCollar] = useState(null);



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
    // Check if any variant with this size has stock
    const hasStock = allVariants.some(v => v.size === size && (v.stock || 0) > 0);
    if (!hasStock) {
      return; // Don't proceed if no stock
    }
    setSelectedSize(size);
    setStep(2);
  };

  const handleCutSelect = (cut) => {
    // Check if any variant with this size+cut has stock
    const hasStock = availableVariants.some(v => v.cut === cut && (v.stock || 0) > 0);
    if (!hasStock) {
      return; // Don't proceed if no stock
    }
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
    if (variant && (variant.stock || 0) > 0) {
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
                        disabled={!hasStock}
                        className={`relative p-6 text-2xl font-bold rounded-xl border-2 transition-all ${
                          hasStock 
                            ? 'border-gray-200 hover:border-amber-500 hover:bg-amber-50 cursor-pointer'
                            : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {size}
                        {!hasStock && <div className="absolute top-1 right-1 text-xs text-red-500">אזל</div>}
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
                        disabled={!hasStock}
                        className={`relative p-10 text-2xl font-bold rounded-xl border-2 transition-all ${
                          hasStock
                            ? 'border-gray-200 hover:border-amber-500 hover:bg-amber-50 cursor-pointer'
                            : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {cut}
                        {!hasStock && <div className="absolute top-2 right-2 text-xs text-red-500">אזל</div>}
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
                    const stock = variant?.stock || 0;
                    const hasStock = stock > 0;
                    
                    return (
                      <button
                        key={collar}
                        onClick={() => handleCollarSelect(collar)}
                        disabled={!hasStock}
                        className={`relative p-10 text-2xl font-bold rounded-xl border-2 transition-all ${
                          hasStock
                            ? 'border-gray-200 hover:border-amber-500 hover:bg-amber-50 cursor-pointer'
                            : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {collar}
                        <p className={`text-xs mt-2 font-semibold ${hasStock ? 'text-gray-400' : 'text-red-500'}`}>
                          מלאי: {stock}
                        </p>
                        {!hasStock && <div className="absolute top-2 right-2 text-xs text-red-500 bg-red-100 px-2 py-1 rounded">אזל</div>}
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