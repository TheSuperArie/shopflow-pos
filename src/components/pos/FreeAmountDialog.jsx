import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Banknote } from 'lucide-react';

const SERIF = { fontFamily: "'Frank Ruhl Libre', Georgia, serif" };

/**
 * "סכום חופשי" — charge an amount that isn't a catalog product (e.g. a small test charge).
 * The cart line has no product, so it never touches the stock.
 */
export default function FreeAmountDialog({ open, onClose, onAdd }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const value = Math.round((parseFloat(String(amount).replace(',', '.')) || 0) * 100) / 100;
  const valid = value > 0 && value < 100000;

  const reset = () => { setAmount(''); setNote(''); };
  const close = () => { reset(); onClose(); };
  const add = () => {
    if (!valid) return;
    onAdd({ amount: value, note: note.trim() });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent dir="rtl" className="max-w-sm bg-[#FFFDF8]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl" style={SERIF}>
            <Banknote className="w-6 h-6" strokeWidth={1.7} /> סכום חופשי
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[#5E5A52]">חיוב על סכום שלא קשור למוצר בקטלוג. לא משפיע על המלאי.</p>
        <form onSubmit={(e) => { e.preventDefault(); add(); }} className="space-y-3">
          <div>
            <label className="text-sm font-medium">סכום (₪)</label>
            <Input autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="למשל 1" className="h-14 text-3xl font-bold text-center tabular-nums" />
          </div>
          <div>
            <label className="text-sm font-medium">תיאור (לא חובה)</label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="למשל: בדיקת נדרים" className="h-11" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={close}
              className="h-12 flex-1 rounded-xl border-[1.5px] border-[#E2D8C4] bg-[#F5EFE3] font-medium hover:bg-[#EDE4D2]">
              ביטול
            </button>
            <button type="submit" disabled={!valid}
              className="h-12 flex-[2] rounded-xl bg-[#2E6B4C] text-white text-lg font-bold hover:bg-[#25573D] disabled:bg-[#DDD5C4] disabled:text-[#6B665C]">
              {valid ? `הוסף לעגלה · ₪${value}` : 'הוסף לעגלה'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
