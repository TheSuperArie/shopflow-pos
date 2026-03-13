import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Banknote, CreditCard, Loader2 } from 'lucide-react';

export default function CheckoutModal({ open, total, onConfirm, onClose, isProcessing }) {
  const [method, setMethod] = useState(null);

  const handleConfirm = () => {
    if (!method) return;
    onConfirm(method);
    setMethod(null);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl text-center">תשלום</DialogTitle>
        </DialogHeader>

        <div className="text-center py-4">
          <p className="text-gray-500">סכום לתשלום</p>
          <p className="text-4xl font-bold text-amber-600 mt-1">₪{total?.toFixed(2)}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setMethod('מזומן')}
            className={`flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all active:scale-95 ${
              method === 'מזומן'
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 text-gray-600 hover:border-green-300'
            }`}
          >
            <Banknote className="w-10 h-10" />
            <span className="font-bold text-lg">מזומן</span>
          </button>

          <button
            onClick={() => setMethod('אשראי')}
            className={`flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all active:scale-95 ${
              method === 'אשראי'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-600 hover:border-blue-300'
            }`}
          >
            <CreditCard className="w-10 h-10" />
            <span className="font-bold text-lg">אשראי</span>
          </button>
        </div>

        <Button
          onClick={handleConfirm}
          disabled={!method || isProcessing}
          className="w-full h-14 text-lg font-bold bg-amber-500 hover:bg-amber-600 rounded-xl mt-4"
        >
          {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : 'אישור תשלום'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}