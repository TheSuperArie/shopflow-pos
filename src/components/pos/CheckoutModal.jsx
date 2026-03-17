import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Banknote, CreditCard, Loader2, RotateCcw } from 'lucide-react';

const BANKNOTES = [200, 100, 50, 20];
const COINS = [10, 5, 2, 1];

function CurrencyButton({ value, type, onClick }) {
  const isBanknote = type === 'banknote';
  return (
    <button
      onClick={() => onClick(value)}
      className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 transition-all active:scale-95 hover:shadow-md select-none
        ${isBanknote
          ? 'border-green-300 bg-gradient-to-br from-green-50 to-green-100 hover:border-green-500 h-16'
          : 'border-yellow-300 bg-gradient-to-br from-yellow-50 to-yellow-100 hover:border-yellow-500 h-14'
        }`}
    >
      <span className={`font-bold ${isBanknote ? 'text-green-800 text-lg' : 'text-yellow-800 text-base'}`}>
        ₪{value}
      </span>
      <span className="text-xs text-gray-500">{isBanknote ? '🟩' : '🟡'}</span>
    </button>
  );
}

export default function CheckoutModal({ open, total, onConfirm, onClose, isProcessing }) {
  const [method, setMethod] = useState(null);
  const [received, setReceived] = useState(0);

  const change = received - (total || 0);
  const isShort = received > 0 && change < 0;
  const hasEnough = received >= (total || 0);

  const handleAddCurrency = (value) => {
    setReceived(prev => prev + value);
  };

  const handleConfirm = () => {
    if (!method) return;
    if (method === 'מזומן' && !hasEnough) return;
    onConfirm(method, method === 'מזומן' ? { received, change: Math.max(0, change) } : null);
    setMethod(null);
    setReceived(0);
  };

  const handleClose = () => {
    setMethod(null);
    setReceived(0);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`${method === 'מזומן' ? 'max-w-lg' : 'max-w-sm'}`} dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl text-center">תשלום</DialogTitle>
        </DialogHeader>

        <div className="text-center py-3">
          <p className="text-gray-500">סכום לתשלום</p>
          <p className="text-4xl font-bold text-amber-600 mt-1">₪{total?.toFixed(2)}</p>
        </div>

        {/* Method selection */}
        {!method && (
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setMethod('מזומן')}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-gray-200 text-gray-600 hover:border-green-300 hover:bg-green-50 transition-all active:scale-95"
            >
              <Banknote className="w-10 h-10" />
              <span className="font-bold text-lg">מזומן</span>
            </button>
            <button
              onClick={() => setMethod('אשראי')}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50 transition-all active:scale-95"
            >
              <CreditCard className="w-10 h-10" />
              <span className="font-bold text-lg">אשראי</span>
            </button>
          </div>
        )}

        {/* Credit - just confirm */}
        {method === 'אשראי' && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 p-3 bg-blue-50 rounded-xl">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-blue-700">תשלום באשראי</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMethod(null)} className="flex-1">חזור</Button>
              <Button onClick={handleConfirm} disabled={isProcessing}
                className="flex-1 h-12 text-lg font-bold bg-blue-500 hover:bg-blue-600">
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'אשר תשלום'}
              </Button>
            </div>
          </div>
        )}

        {/* Cash - full calculator */}
        {method === 'מזומן' && (
          <div className="space-y-4">
            {/* Received amount input */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">סכום שהתקבל</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={received || ''}
                    onChange={e => setReceived(parseFloat(e.target.value) || 0)}
                    className="text-xl text-center font-bold h-12"
                    placeholder="0"
                  />
                  <button onClick={() => setReceived(0)}
                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors">
                    <RotateCcw className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>
            </div>

            {/* Banknotes */}
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">שטרות</p>
              <div className="grid grid-cols-4 gap-2">
                {BANKNOTES.map(v => (
                  <CurrencyButton key={v} value={v} type="banknote" onClick={handleAddCurrency} />
                ))}
              </div>
            </div>

            {/* Coins */}
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">מטבעות</p>
              <div className="grid grid-cols-4 gap-2">
                {COINS.map(v => (
                  <CurrencyButton key={v} value={v} type="coin" onClick={handleAddCurrency} />
                ))}
              </div>
            </div>

            {/* Change display */}
            <div className={`p-4 rounded-xl text-center border-2 ${
              received === 0 ? 'bg-gray-50 border-gray-200' :
              isShort ? 'bg-red-50 border-red-300' :
              'bg-green-50 border-green-300'
            }`}>
              {received === 0 && <p className="text-gray-400 text-sm">הזן סכום שהתקבל</p>}
              {isShort && (
                <>
                  <p className="text-red-600 text-sm font-medium">חסר לתשלום</p>
                  <p className="text-3xl font-bold text-red-700">₪{Math.abs(change).toFixed(2)}</p>
                </>
              )}
              {!isShort && received > 0 && (
                <>
                  <p className="text-green-600 text-sm font-medium">עודף להחזיר</p>
                  <p className="text-4xl font-bold text-green-700">₪{change.toFixed(2)}</p>
                </>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setMethod(null); setReceived(0); }} className="flex-1">חזור</Button>
              <Button
                onClick={handleConfirm}
                disabled={!hasEnough || isProcessing}
                className="flex-1 h-12 text-lg font-bold bg-green-600 hover:bg-green-700"
              >
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'אשר תשלום'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}