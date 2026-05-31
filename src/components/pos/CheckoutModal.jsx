import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Banknote, CreditCard, Loader2, RotateCcw, Receipt, SplitSquareHorizontal } from 'lucide-react';

const BANKNOTES = [200, 100, 50, 20];
const COINS = [10, 5, 2, 1];

function CurrencyButton({ value, type, onClick }) {
  const isBanknote = type === 'banknote';
  return (
    <button
      onClick={() => onClick(value)}
      className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 transition-all active:scale-95 hover:shadow-md select-none
        ${isBanknote
          ? 'border-green-300 bg-gradient-to-br from-green-50 to-green-100 hover:border-green-500 h-14'
          : 'border-yellow-300 bg-gradient-to-br from-yellow-50 to-yellow-100 hover:border-yellow-500 h-12'
        }`}
    >
      <span className={`font-bold ${isBanknote ? 'text-green-800 text-base' : 'text-yellow-800 text-sm'}`}>
        ₪{value}
      </span>
    </button>
  );
}

export default function CheckoutModal({ open, total, onConfirm, onClose, isProcessing }) {
  const [method, setMethod] = useState(null); // null | 'מזומן' | 'אשראי' | 'פיצול'
  const [received, setReceived] = useState(0);
  const [cashAmount, setCashAmount] = useState(0); // for split: how much cash
  const [printReceipt, setPrintReceipt] = useState(false);

  const safeTotal = total || 0;

  // Single cash mode
  const change = received - safeTotal;
  const isShort = received > 0 && change < 0;
  const hasEnough = received >= safeTotal;

  // Split mode
  const creditAmount = Math.max(0, safeTotal - cashAmount);
  const cashChange = received - cashAmount;
  const cashIsShort = received > 0 && cashChange < 0;
  const splitValid = cashAmount > 0 && cashAmount <= safeTotal && received >= cashAmount;

  const resetState = () => {
    setMethod(null);
    setReceived(0);
    setCashAmount(0);
    setPrintReceipt(false);
  };

  const handleConfirm = () => {
    if (!method) return;
    if (method === 'מזומן' && !hasEnough) return;
    if (method === 'פיצול' && !splitValid) return;

    if (method === 'מזומן') {
      onConfirm('מזומן', { received, change: Math.max(0, change) }, printReceipt);
    } else if (method === 'אשראי') {
      onConfirm('אשראי', null, printReceipt);
    } else if (method === 'פיצול') {
      onConfirm('מזומן + אשראי', {
        cashAmount,
        creditAmount,
        received,
        change: Math.max(0, cashChange),
      }, printReceipt);
    }
    resetState();
  };

  const handleClose = () => { resetState(); onClose(); };

  const isWide = method === 'מזומן' || method === 'פיצול';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`${isWide ? 'max-w-lg' : 'max-w-sm'}`} dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl text-center">תשלום</DialogTitle>
        </DialogHeader>

        <div className="text-center py-2">
          <p className="text-gray-500 text-sm">סכום לתשלום</p>
          <p className="text-4xl font-bold text-amber-600 mt-1">₪{safeTotal.toFixed(2)}</p>
        </div>

        {/* Receipt checkbox */}
        <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50 cursor-pointer hover:bg-amber-50 hover:border-amber-300 transition-colors">
          <input
            type="checkbox"
            checked={printReceipt}
            onChange={e => setPrintReceipt(e.target.checked)}
            className="w-4 h-4 accent-amber-500"
          />
          <Receipt className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">הוצאת קבלה ללקוח</span>
        </label>

        {/* Method selection */}
        {!method && (
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setMethod('מזומן')}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-gray-200 text-gray-600 hover:border-green-300 hover:bg-green-50 transition-all active:scale-95"
            >
              <Banknote className="w-8 h-8" />
              <span className="font-bold">מזומן</span>
            </button>
            <button
              onClick={() => setMethod('אשראי')}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50 transition-all active:scale-95"
            >
              <CreditCard className="w-8 h-8" />
              <span className="font-bold">אשראי</span>
            </button>
            <button
              onClick={() => setMethod('פיצול')}
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-gray-200 text-gray-600 hover:border-purple-300 hover:bg-purple-50 transition-all active:scale-95"
            >
              <SplitSquareHorizontal className="w-8 h-8" />
              <span className="font-bold">פיצול</span>
            </button>
          </div>
        )}

        {/* Credit only */}
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

        {/* Cash only */}
        {method === 'מזומן' && (
          <div className="space-y-3">
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
            <div>
              <p className="text-xs text-gray-500 mb-1 font-medium">שטרות</p>
              <div className="grid grid-cols-4 gap-2">
                {BANKNOTES.map(v => <CurrencyButton key={v} value={v} type="banknote" onClick={v => setReceived(p => p + v)} />)}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1 font-medium">מטבעות</p>
              <div className="grid grid-cols-4 gap-2">
                {COINS.map(v => <CurrencyButton key={v} value={v} type="coin" onClick={v => setReceived(p => p + v)} />)}
              </div>
            </div>
            <div className={`p-3 rounded-xl text-center border-2 ${
              received === 0 ? 'bg-gray-50 border-gray-200' :
              isShort ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'
            }`}>
              {received === 0 && <p className="text-gray-400 text-sm">הזן סכום שהתקבל</p>}
              {isShort && <><p className="text-red-600 text-sm font-medium">חסר לתשלום</p><p className="text-3xl font-bold text-red-700">₪{Math.abs(change).toFixed(2)}</p></>}
              {!isShort && received > 0 && <><p className="text-green-600 text-sm font-medium">עודף להחזיר</p><p className="text-4xl font-bold text-green-700">₪{change.toFixed(2)}</p></>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setMethod(null); setReceived(0); }} className="flex-1">חזור</Button>
              <Button onClick={handleConfirm} disabled={!hasEnough || isProcessing}
                className="flex-1 h-12 text-lg font-bold bg-green-600 hover:bg-green-700">
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'אשר תשלום'}
              </Button>
            </div>
          </div>
        )}

        {/* Split: cash + credit */}
        {method === 'פיצול' && (
          <div className="space-y-3">
            {/* Split summary bar */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-center">
                <p className="text-xs text-gray-500 mb-0.5">מזומן</p>
                <p className="text-xl font-bold text-green-700">₪{cashAmount.toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-center">
                <p className="text-xs text-gray-500 mb-0.5">אשראי</p>
                <p className="text-xl font-bold text-blue-700">₪{creditAmount.toFixed(2)}</p>
              </div>
            </div>

            {/* Cash part input */}
            <div>
              <p className="text-xs text-gray-500 mb-1">כמה מזומן? (השאר יחויב באשראי)</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={cashAmount || ''}
                  onChange={e => { setCashAmount(parseFloat(e.target.value) || 0); setReceived(0); }}
                  className="text-xl text-center font-bold h-12"
                  placeholder="0"
                  max={safeTotal}
                />
                <button onClick={() => { setCashAmount(0); setReceived(0); }}
                  className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors">
                  <RotateCcw className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Cash received (if there's a cash portion) */}
            {cashAmount > 0 && cashAmount <= safeTotal && (
              <>
                <div>
                  <p className="text-xs text-gray-500 mb-1">מזומן שהתקבל בפועל</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={received || ''}
                      onChange={e => setReceived(parseFloat(e.target.value) || 0)}
                      className="text-xl text-center font-bold h-12"
                      placeholder="0"
                    />
                    <button onClick={() => setReceived(cashAmount)}
                      className="px-3 py-2 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 text-xs font-semibold transition-colors whitespace-nowrap">
                      מדויק
                    </button>
                  </div>
                </div>
                <div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {BANKNOTES.map(v => <CurrencyButton key={v} value={v} type="banknote" onClick={v => setReceived(p => p + v)} />)}
                    {COINS.map(v => <CurrencyButton key={v} value={v} type="coin" onClick={v => setReceived(p => p + v)} />)}
                  </div>
                </div>
                <div className={`p-3 rounded-xl text-center border-2 ${
                  received === 0 ? 'bg-gray-50 border-gray-200' :
                  cashIsShort ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'
                }`}>
                  {received === 0 && <p className="text-gray-400 text-sm">הזן מזומן שהתקבל</p>}
                  {cashIsShort && <><p className="text-red-600 text-sm font-medium">חסר במזומן</p><p className="text-2xl font-bold text-red-700">₪{Math.abs(cashChange).toFixed(2)}</p></>}
                  {!cashIsShort && received > 0 && <><p className="text-green-600 text-sm font-medium">עודף להחזיר</p><p className="text-3xl font-bold text-green-700">₪{cashChange.toFixed(2)}</p></>}
                </div>
              </>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setMethod(null); setCashAmount(0); setReceived(0); }} className="flex-1">חזור</Button>
              <Button onClick={handleConfirm} disabled={!splitValid || isProcessing}
                className="flex-1 h-12 text-lg font-bold bg-purple-600 hover:bg-purple-700">
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'אשר תשלום'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}