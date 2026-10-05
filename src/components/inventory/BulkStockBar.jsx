import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { X, Loader2, Plus, Equal, ShoppingCart } from 'lucide-react';

/**
 * Bottom bar for everything selected across categories / products / sizes:
 * add to stock, set stock, or (branch side) put into the order to the network.
 */
export default function BulkStockBar({ count, units, onApply, onOrder, onClear, busy, progress, stockNote }) {
  const [mode, setMode] = useState('add');
  const [value, setValue] = useState('');
  const [confirm, setConfirm] = useState(null); // 'stock' | 'order'

  if (count === 0) return null;
  const n = parseInt(value, 10);
  const valid = value !== '' && !Number.isNaN(n) && n >= 0 && (mode === 'set' || n > 0);

  const run = async () => {
    const kind = confirm;
    setConfirm(null);
    if (kind === 'order') await onOrder(n);
    else await onApply(mode, n);
    setValue('');
  };

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900 text-white shadow-2xl" dir="rtl">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="bg-amber-500 rounded-full px-3 py-1 text-sm font-bold">{count}</span>
            <span className="text-sm">מידות נבחרו <span className="text-gray-400">({units} יח' כרגע)</span></span>
          </div>

          <div className="flex rounded-xl bg-white/10 p-1">
            <button onClick={() => setMode('add')} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ${mode === 'add' ? 'bg-white text-gray-900' : 'text-gray-300'}`}>
              <Plus className="w-4 h-4" /> הוסף
            </button>
            <button onClick={() => setMode('set')} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ${mode === 'set' ? 'bg-white text-gray-900' : 'text-gray-300'}`}>
              <Equal className="w-4 h-4" /> קבע כמות
            </button>
          </div>

          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && valid) setConfirm('stock'); }}
            placeholder={mode === 'add' ? 'כמה להוסיף לכל מידה' : 'כמות חדשה לכל מידה'}
            className="w-44 h-10 bg-white text-gray-900 text-center font-semibold"
          />
          <Button onClick={() => setConfirm('stock')} disabled={!valid || busy} className="h-10 bg-amber-500 hover:bg-amber-600">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin ml-1" /> {progress}%</> : 'עדכן מלאי'}
          </Button>
          {onOrder && (
            <Button onClick={() => setConfirm('order')} disabled={!valid || n === 0 || busy} variant="outline" className="h-10 bg-transparent border-white/30 text-white hover:bg-white/10 gap-1.5">
              <ShoppingCart className="w-4 h-4" /> להזמנה מהרשת
            </Button>
          )}

          <button onClick={onClear} className="mr-auto flex items-center gap-1 text-sm text-gray-300 hover:text-white">
            <X className="w-4 h-4" /> בטל בחירה
          </button>
        </div>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={o => !o && setConfirm(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'order'
                ? `להוסיף ${n} יח' מכל מידה להזמנה מהרשת?`
                : mode === 'add' ? `להוסיף ${n} יחידות לכל אחת מ-${count} המידות?` : `לקבוע מלאי ${n} לכל אחת מ-${count} המידות?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'order'
                ? 'המידות ייכנסו לטיוטת ההזמנה בדף "הזמנות לרשת", ושם אפשר לערוך ולשלוח.'
                : (stockNote || 'המלאי מתעדכן באותו מלאי שהקופה עובדת איתו, וכל שינוי נרשם בהיסטוריה.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>חזור</AlertDialogCancel>
            <AlertDialogAction onClick={run} className="bg-amber-500 hover:bg-amber-600">אישור</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
