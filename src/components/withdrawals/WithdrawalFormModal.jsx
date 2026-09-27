import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

/** Add / edit one owner withdrawal. */
export default function WithdrawalFormModal({ open, branchId, withdrawal, onClose, onSaved }) {
  const [form, setForm] = useState({ amount: '', date: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(withdrawal
      ? { amount: String(withdrawal.amount ?? ''), date: withdrawal.date, notes: withdrawal.notes || '' }
      : { amount: '', date: format(new Date(), 'yyyy-MM-dd'), notes: '' });
  }, [open, withdrawal]);

  const save = async () => {
    const amount = Number(form.amount);
    if (!(amount > 0) || !form.date) { setError('יש להזין סכום ותאריך'); return; }
    setSaving(true);
    try {
      const data = { amount, date: form.date, notes: form.notes };
      if (withdrawal) await base44.entities.OwnerWithdrawal.update(withdrawal.id, data);
      else await base44.entities.OwnerWithdrawal.create({ ...data, branch_id: branchId || null });
      onSaved();
    } catch (e) {
      setError(e?.message || 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader><DialogTitle>{withdrawal ? 'עריכת משיכה' : 'הוספת משיכה'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>סכום (₪)</Label><Input type="number" inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} data-testid="withdrawal-amount" /></div>
          <div><Label>תאריך</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
          <div><Label>הערה</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving} className="bg-amber-500 hover:bg-amber-600 w-full" data-testid="withdrawal-save">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} שמירה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}