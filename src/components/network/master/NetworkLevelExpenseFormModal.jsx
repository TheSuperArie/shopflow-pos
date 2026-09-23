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
import TemplatePicker from '@/components/expenses/TemplatePicker';
import { templateToExpense } from '@/lib/fixedExpenseTemplates';

export const NETWORK_EXPENSE_CATEGORIES = [
  'שכירות משרד', 'רואה חשבון/הנהלת חשבונות', 'פרסום ושיווק', 'מחסן מרכזי', 'תוכנה ומערכות', 'שכר הנהלה', 'אחר',
];

const blank = () => ({ description: '', amount: '', category: '', custom_category: '', expense_type: 'חד פעמית', date: format(new Date(), 'yyyy-MM-dd'), template_id: '' });

/** Expense of the network itself — no branch_id, so no branch ever sees or counts it. */
export default function NetworkLevelExpenseFormModal({ open, onClose, tenantEmail, expense, onSaved, onError, templates = [], lastUsed = {} }) {
  const [form, setForm] = useState(blank());
  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    setForm(expense ? {
      description: expense.description || '', amount: expense.amount ?? '', category: expense.category || '',
      custom_category: expense.custom_category || '', expense_type: expense.expense_type || 'חד פעמית', date: expense.date,
      template_id: expense.template_id || '',
    } : blank());
  }, [open, expense]);

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        description: data.description,
        amount: parseFloat(data.amount),
        category: data.category,
        custom_category: data.category === 'אחר' ? data.custom_category : '',
        expense_type: data.expense_type,
        date: data.date,
        branch_id: null,
        network_only: true,
        network_level: true,
        tenant_email: tenantEmail,
        template_id: data.template_id || null,
      };
      return expense ? base44.entities.Expense.update(expense.id, payload) : base44.entities.Expense.create(payload);
    },
    onSuccess: onSaved,
    onError,
  });

  const isValid = form.description && form.category && parseFloat(form.amount) > 0 && form.date;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader><DialogTitle>{expense ? 'עריכת הוצאת רשת' : 'הוצאת רשת חדשה'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!expense && (
            <TemplatePicker
              templates={templates}
              lastUsed={lastUsed}
              value={form.template_id}
              onPick={t => set(t ? templateToExpense(t) : { template_id: '' })}
            />
          )}
          <div><Label>סכום (₪)</Label><Input type="number" value={form.amount} onChange={e => set({ amount: e.target.value })} placeholder="0.00" className="text-lg" /></div>
          <div>
            <Label>סוג הוצאה</Label>
            <Select value={form.expense_type} onValueChange={v => set({ expense_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{EXPENSE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>קטגוריה</Label>
            <Select value={form.category} onValueChange={v => set({ category: v })}>
              <SelectTrigger><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
              <SelectContent>{NETWORK_EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {form.category === 'אחר' && (
            <div><Label>שם הקטגוריה</Label><Input value={form.custom_category} onChange={e => set({ custom_category: e.target.value })} placeholder="למשל: ביטוח, ייעוץ משפטי" /></div>
          )}
          <div><Label>תיאור</Label><Input value={form.description} onChange={e => set({ description: e.target.value })} placeholder="למשל: שכירות משרד — ספטמבר" /></div>
          <div><Label>תאריך</Label><Input type="date" value={form.date} onChange={e => set({ date: e.target.value })} /></div>
          <p className="text-xs text-gray-400 border-t pt-2">הוצאה כללית של הרשת — לא משויכת לאף סניף, ואף סניף לא רואה אותה.</p>
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