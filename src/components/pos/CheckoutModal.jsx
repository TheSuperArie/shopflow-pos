import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Banknote, CreditCard, Loader2, RotateCcw, Receipt, SplitSquareHorizontal, CheckCircle2 } from 'lucide-react';
import NedarimPaymentDialog from '@/components/pos/NedarimPaymentDialog';

const BANKNOTES = [200, 100, 50, 20];
const COINS = [10, 5, 2, 1];

function CurrencyButton({ value, type, onClick }) {
  const isBanknote = type === 'banknote';
  return (
    <button
      onClick={() => onClick(value)}
      className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 transition-all active:scale-95 hover:shadow-md select-none
        ${isBanknote
          ? 'border-[#B9D3C2] bg-[#EEF5F0] hover:border-[#2E6B4C] h-14'
          : 'border-[#E3C98F] bg-[#FBF3E1] hover:border-[#A5752A] h-12'
        }`}
    >
      <span className={`font-bold ${isBanknote ? 'text-[#1F4D36] text-base' : 'text-[#5A3E0E] text-sm'}`}>
        ₪{value}
      </span>
    </button>
  );
}

// nedarim: Nedarim Plus settings ({ enabled, mosad, api_valid }) — when enabled, credit is charged
//          here through Nedarim's window; otherwise credit is confirmed by hand as before.
// paidCharge: a credit charge that went through but whose sale wasn't saved — reused, never re-charged.
export default function CheckoutModal({ open, total, onConfirm, onClose, isProcessing, nedarim = null, paidCharge = null, chargeComment = '' }) {
  const [method, setMethod] = useState(null); // null | 'מזומן' | 'אשראי' | 'פיצול'
  const [received, setReceived] = useState(0);
  const [cashAmount, setCashAmount] = useState(0); // for split: how much cash
  const [printReceipt, setPrintReceipt] = useState(false);
  // Open Nedarim window: { amount, method, details }
  const [charging, setCharging] = useState(null);
  const useNedarim = !!nedarim?.enabled;
  const samePaid = (amount) => !!paidCharge && Math.abs(Number(paidCharge.amount) - Number(amount)) < 0.01;

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

  const handleClose = () => { if (charging) return; resetState(); onClose(); };

  // Credit through Nedarim: charge first, then save the sale with the approval attached.
  // A charge that already went through for this amount is reused instead of charging again.
  const chargeThenConfirm = (methodName, details, amount) => {
    if (samePaid(amount)) {
      onConfirm(methodName, { ...(details || {}), credit: paidCharge }, printReceipt);
      resetState();
      return;
    }
    setCharging({ amount, methodName, details });
  };
  const onCharged = (credit) => {
    const c = charging;
    setCharging(null);
    if (!c) return;
    onConfirm(c.methodName, { ...(c.details || {}), credit }, printReceipt);
    resetState();
  };

  const creditButtons = (methodName, details, amount, disabled, color) => {
    if (!useNedarim) {
      return (
        <Button onClick={handleConfirm} disabled={disabled || isProcessing}
          className={`flex-1 h-12 text-lg font-bold ${color}`}>
          {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'אשר תשלום'}
        </Button>
      );
    }
    return (
      <Button onClick={() => chargeThenConfirm(methodName, details, amount)} disabled={disabled || isProcessing}
        className={`flex-1 h-12 text-lg font-bold ${color}`}>
        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" />
          : samePaid(amount) ? 'שמור מכירה (כבר חויב)' : `חייב ₪${Number(amount).toFixed(2)} באשראי`}
      </Button>
    );
  };

  const isWide = method === 'מזומן' || method === 'פיצול';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`${isWide ? 'max-w-lg' : 'max-w-sm'}`} dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center" style={{ fontFamily: "'Frank Ruhl Libre', Georgia, serif" }}>תשלום</DialogTitle>
        </DialogHeader>

        <div className="text-center py-2">
          <p className="text-gray-500 text-sm">סכום לתשלום</p>
          <p className="text-5xl font-bold text-[#1E2433] mt-1 tabular-nums" style={{ fontFamily: "'Frank Ruhl Libre', Georgia, serif" }}>₪{safeTotal.toFixed(2)}</p>
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
              className="flex flex-col items-center gap-2 p-5 min-h-[112px] justify-center rounded-2xl border-2 border-[#E2D8C4] bg-[#FFFDF8] text-[#2E6B4C] hover:border-[#2E6B4C] hover:bg-[#EEF5F0] transition-all active:scale-95"
            >
              <Banknote className="w-8 h-8" />
              <span className="font-bold text-lg">מזומן</span>
            </button>
            <button
              onClick={() => setMethod('אשראי')}
              className="flex flex-col items-center gap-2 p-5 min-h-[112px] justify-center rounded-2xl border-2 border-[#E2D8C4] bg-[#FFFDF8] text-[#1F3A5F] hover:border-[#1F3A5F] hover:bg-[#E4EAF2] transition-all active:scale-95"
            >
              <CreditCard className="w-8 h-8" />
              <span className="font-bold text-lg">אשראי</span>
            </button>
            <button
              onClick={() => setMethod('פיצול')}
              className="flex flex-col items-center gap-2 p-5 min-h-[112px] justify-center rounded-2xl border-2 border-[#E2D8C4] bg-[#FFFDF8] text-[#6B3E6E] hover:border-[#6B3E6E] hover:bg-[#EFE4F0] transition-all active:scale-95"
            >
              <SplitSquareHorizontal className="w-8 h-8" />
              <span className="font-bold text-lg">פיצול</span>
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
            {useNedarim && samePaid(safeTotal) && (
              <p className="flex items-center justify-center gap-1.5 text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4" /> הסכום כבר חויב בנדרים{paidCharge?.ref ? ` (אישור ${paidCharge.ref})` : ''} — לא יחויב שוב
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMethod(null)} className="flex-1 h-12 text-base">חזור</Button>
              {creditButtons('אשראי', null, safeTotal, false, 'bg-[#1F3A5F] hover:bg-[#162B47]')}
            </div>
            {useNedarim && (
              <button onClick={handleConfirm} disabled={isProcessing}
                className="w-full text-xs text-gray-400 hover:text-gray-600 underline">
                חויב במכשיר אחר (טאבלט / מסוף) — רק לשמור את המכירה
              </button>
            )}
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
              <Button variant="outline" onClick={() => { setMethod(null); setReceived(0); }} className="flex-1 h-12 text-base">חזור</Button>
              <Button onClick={handleConfirm} disabled={!hasEnough || isProcessing}
                className="flex-1 h-12 text-lg font-bold bg-[#2E6B4C] hover:bg-[#25573D]">
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
              <Button variant="outline" onClick={() => { setMethod(null); setCashAmount(0); setReceived(0); }} className="flex-1 h-12 text-base">חזור</Button>
              {creditButtons('מזומן + אשראי', {
                cashAmount, creditAmount, received, change: Math.max(0, cashChange),
              }, creditAmount, !splitValid, 'bg-[#6B3E6E] hover:bg-[#563157]')}
            </div>
            {useNedarim && (
              <button onClick={handleConfirm} disabled={!splitValid || isProcessing}
                className="w-full text-xs text-gray-400 hover:text-gray-600 underline">
                האשראי חויב במכשיר אחר (טאבלט / מסוף) — רק לשמור את המכירה
              </button>
            )}
          </div>
        )}
        {/* Nested inside the checkout dialog, so it stacks on top of it */}
        {useNedarim && (
          <NedarimPaymentDialog
            open={!!charging}
            amount={charging?.amount || 0}
            config={nedarim}
            comment={chargeComment}
            onSuccess={onCharged}
            onCancel={() => setCharging(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}