import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

/** Manual stock update: a count (exact quantity) or a correction (+/-). */
export default function StockCountDialog({ item, onClose, onSave }) {
  const [mode, setMode] = useState('COUNT');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const n = parseInt(value, 10);
  const valid = !Number.isNaN(n) && (mode === 'COUNT' || n !== 0);
  const after = mode === 'COUNT' ? n : item.qty + n;

  const save = async () => {
    setSaving(true);
    try { await onSave({ type: mode, newQty: after, notes: notes.trim() }); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader><DialogTitle>{item.product_name} {item.variant_label ? `· ${item.variant_label}` : ''}</DialogTitle></DialogHeader>
        <p className="text-sm text-gray-500">כמות נוכחית: <strong className={item.qty < 0 ? 'text-red-600' : ''}>{item.qty}</strong></p>
        <div className="grid grid-cols-2 gap-2">
          {[['COUNT', 'ספירת מלאי'], ['ADJUST', 'תיקון +/-']].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={`rounded-xl border-2 py-2 text-sm font-medium ${mode === k ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200'}`}>{l}</button>
          ))}
        </div>
        <div>
          <Label>{mode === 'COUNT' ? 'הכמות שנספרה' : 'שינוי (למשל 5 או -3)'}</Label>
          <Input type="number" value={value} onChange={e => setValue(e.target.value)} className="h-11 text-lg" autoFocus />
          {valid && <p className="text-xs text-gray-500 mt-1">אחרי העדכון: <strong>{after}</strong></p>}
        </div>
        <div><Label>הערה</Label><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="אופציונלי" /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={save} disabled={!valid || saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}