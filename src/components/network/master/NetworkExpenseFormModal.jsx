import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

import { EXPENSE_TYPES } from '@/lib/expenseGrouping';

const EXPENSE_CATEGORIES = ['הוצאות חוץ', 'פרסום', 'כיבוד/עוגות', 'אחר'];

/** Network-only expense for a branch — visible to the network master, hidden from the branch manager. */
export default function NetworkExpenseFormModal({ open, onClose, branch, expense, onSaved, onError }) {
  const [form, setForm] = useState({ description: '', amount: '', category: '', custom_category: '', date: format(new Date(), 'yyyy-MM-dd') });

  useEffect(() => {
    if (!open) return;
    setForm({
      description: expense?.description || '',
      amount: expense?.amount ?? '',
      category: expense?.category || '',
      custom_category: expense?.custom_category || '',
      date: expense?.date || format(new Date(), 'yyyy-MM-dd'),
    });
  }, [open, expense]);

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        description: data.description,
        amount: parseFloat(data.amount),
        category: data.category,
        custom_category: data.category === 'אחר' ? data.custom_category : '',
        date: data.date,
        branch_id: branch.id,
        network_only: true,
      };
      return expense
        ? base44.entities.Expense.update(expense.id, payload)
        : base44.entities.Expense.create(payload);
    },
    onSuccess: onSaved,
    onError,
  });

  const isValid = form.description && form.category && form.amount && parseFloat(form.amount) > 0 && form.date;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{expense ? 'עריכת הוצאת רשת' : `הוצאת רשת ל${branch?.name || 'סניף'}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>סכום (₪)</Label>
            <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" className="text-lg" />
          </div>
          <div>
            <Label>קטגוריה</Label>
            <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {form.category === 'אחר' && (
            <div>
              <Label>שם הקטגוריה</Label>
              <Input value={form.custom_category} onChange={e => setForm({ ...form, custom_category: e.target.value })} placeholder="למשל: הקמה, אחזקה" />
            </div>
          )}
          <div>
            <Label>תיאור</Label>
            <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="למשל: הקמת הסניף" />
          </div>
          <div>
            <Label>תאריך</Label>
            <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <p className="text-xs text-gray-400 border-t pt-2">הוצאה זו תוצג רק לך (מנהל הרשת) ותשוכלל בדוחות הרשת — מנהל הסניף לא יראה אותה.</p>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate(form)} disabled={!isValid || mutation.isPending} className="w-full bg-amber-500 hover:bg-amber-600">
            {mutation.isPending ? 'שומר...' : 'שמור הוצאה'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}