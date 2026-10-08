import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Package, ScanLine, AlertTriangle } from 'lucide-react';
import { cartonLocation, cartonBreakdown } from '@/lib/supplyOrders';

/** "after" quantity for a count form: COUNT = the counted quantity, ADJUST = current ± the change. */
export const countAfter = (item, form) => {
  const n = parseInt(form.value, 10);
  if (Number.isNaN(n)) return null;
  return form.mode === 'COUNT' ? n : item.qty + n;
};
export const countFormValid = (form) => {
  const n = parseInt(form.value, 10);
  return !Number.isNaN(n) && (form.mode === 'COUNT' || n !== 0);
};

/**
 * Manual stock update: a correction (+/-, the default — adds to what's recorded) or a count (exact quantity,
 * replaces what's recorded — only after the seller confirms a warning).
 * The form ({ mode, value, notes }) is owned by the panel, so scans can add to it while it's open:
 * a carton label adds a whole carton, a single shirt adds 1.
 * openedByScan: don't focus the number box — the scanner would type into it.
 */
export default function StockCountDialog({ item, form, onFormChange, onClose, onSave, cartonSize, openedByScan, previouslyCounted }) {
  const [saving, setSaving] = useState(false);
  const [confirmCount, setConfirmCount] = useState(false); // "ספירת מלאי" replaces the stock — asked first
  useEffect(() => { setConfirmCount(false); }, [item?.key]); // a scan opened another size
  const n = parseInt(form.value, 10);
  const valid = countFormValid(form);
  const after = countAfter(item, form);
  const location = cartonLocation(item);
  const counted = cartonSize && !Number.isNaN(n) && n > 0 ? cartonBreakdown(n, cartonSize) : '';
  const set = (patch) => onFormChange({ ...form, ...patch });

  const save = async () => {
    setSaving(true);
    try { await onSave({ type: form.mode, newQty: after, notes: form.notes.trim() }); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader><DialogTitle>{item.product_name} {item.variant_label ? `· ${item.variant_label}` : ''}</DialogTitle></DialogHeader>
        {location && (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-amber-50 border-2 border-amber-300 px-3 py-2 text-amber-900 text-xl font-bold">
            <Package className="w-6 h-6" /> {location}
          </div>
        )}
        <p className="text-sm text-gray-500">כמות נוכחית במערכת: <strong className={item.qty < 0 ? 'text-red-600' : ''}>{item.qty}</strong></p>
        {form.mode === 'COUNT' && previouslyCounted != null && (
          <p className="rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1.5 text-sm text-blue-900">
            כבר נספרו <strong>{previouslyCounted}</strong> קודם בספירה הזו — ממשיכים מהמספר הזה, לא מאפס
          </p>
        )}
        {confirmCount ? (
          // No button here takes focus — a scanner's Enter can't confirm it by accident
          <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 space-y-2.5">
            <p className="flex items-center gap-2 font-bold text-amber-900"><AlertTriangle className="w-5 h-5 shrink-0" /> לעבור לספירת מלאי?</p>
            <p className="text-sm text-amber-900">
              בספירת מלאי הכמות שתקליד <b>מחליפה</b> את מה שרשום במערכת (כרגע {item.qty}) — לא מוסיפה עליו.
              להשתמש רק כשסופרים את כל הכמות של המידה הזו.
            </p>
            <div className="flex gap-2">
              <button type="button" tabIndex={-1}
                onClick={() => {
                  setConfirmCount(false);
                  const soFar = Number.isNaN(n) ? 0 : n;
                  set({ mode: 'COUNT', value: previouslyCounted != null ? String(previouslyCounted + soFar) : form.value });
                }}
                className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-bold text-white hover:bg-amber-600">
                כן, אני סופר הכל
              </button>
              <button type="button" tabIndex={-1} onClick={() => setConfirmCount(false)}
                className="flex-1 rounded-lg border bg-white py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {[['ADJUST', 'תיקון +/- (הוספה)'], ['COUNT', 'ספירת מלאי']].map(([k, l]) => (
              <button key={k} tabIndex={-1}
                onClick={() => (k === 'COUNT' && form.mode !== 'COUNT' ? setConfirmCount(true) : set({ mode: k }))}
                className={`rounded-xl border-2 py-2 text-sm font-medium ${form.mode === k ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200'}`}>{l}</button>
            ))}
          </div>
        )}
        <div>
          <Label>{form.mode === 'COUNT' ? 'הכמות שנספרה' : 'שינוי (למשל 5 או -3)'}</Label>
          <Input type="number" value={form.value} onChange={e => set({ value: e.target.value })} className="h-11 text-lg" autoFocus={!openedByScan} data-scan-capture />
          {valid && (
            <div className={`mt-2 rounded-xl border-2 px-3 py-2 text-center ${form.mode === 'COUNT' ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-green-300 bg-green-50 text-green-900'}`}>
              {form.mode === 'COUNT' ? (
                <>
                  <p className="text-lg font-bold">המלאי יוגדר ל־{after}</p>
                  <p className="text-sm">מחליף את מה שרשום (היה {item.qty})</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold">{n > 0 ? `יתווסף ${n}` : `יורד ${Math.abs(n)}`} → יהיה {after}</p>
                  <p className="text-sm">נוסף על מה שרשום (היה {item.qty})</p>
                </>
              )}
            </div>
          )}
          {counted && (
            <p className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-sm font-semibold text-amber-900">
              נספרו: {counted} <span className="font-normal text-amber-700">({cartonSize} בקרטון)</span>
            </p>
          )}
          <p className="mt-1.5 flex items-center gap-1 text-xs text-green-700">
            <ScanLine className="w-3.5 h-3.5" />
            אפשר להמשיך לסרוק: קרטון מוסיף {cartonSize || 'קרטון שלם'}, חולצה מוסיפה 1
          </p>
        </div>
        <div><Label>הערה</Label><Input value={form.notes} onChange={e => set({ notes: e.target.value })} placeholder="אופציונלי" /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={save} disabled={!valid || saving || confirmCount} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
