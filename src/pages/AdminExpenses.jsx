import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, Loader2, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const EXPENSE_CATEGORIES = ['שכר עובדים', 'הוצאות חוץ', 'פרסום', 'כיבוד/עוגות', 'אחר'];

export default function AdminExpenses() {
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = useCurrentUser();

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', user?.email],
    queryFn: () => user ? base44.entities.Expense.filter({ created_by: user.email }, '-date') : [],
    enabled: !!user,
  });

  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
         <h1 className="text-2xl font-bold text-gray-800">הוצאות</h1>
         <Button onClick={() => setShowForm(true)} className="gap-2 bg-amber-500 hover:bg-amber-600">
           <Plus className="w-4 h-4" /> הוצאה חדשה
         </Button>
       </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">סה"כ הוצאות</p>
                <p className="text-2xl font-bold text-red-600">₪{totalExpenses.toFixed(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {cashCounts[0] && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                  <Calculator className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">ספירת קופה אחרונה ({cashCounts[0].date})</p>
                  <p className="text-2xl font-bold text-green-600">₪{cashCounts[0].amount?.toFixed(0)}</p>
                </div>
              </div>
            </CardContent>
            </Card>
            )}
            </div>

            {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
      ) : (
        <div className="space-y-3">
          {expenses.map(exp => (
            <ExpenseItem key={exp.id} expense={exp} queryClient={queryClient} toast={toast} />
          ))}
          {expenses.length === 0 && <p className="text-center text-gray-400 py-12">אין הוצאות</p>}
        </div>
      )}

      <ExpenseFormModal open={showForm} onClose={() => setShowForm(false)} queryClient={queryClient} toast={toast} />
    </div>
  );
}

function ExpenseItem({ expense, queryClient, toast }) {
  const deleteMut = useMutation({
    mutationFn: () => base44.entities.Expense.delete(expense.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast({ title: 'ההוצאה נמחקה' });
    },
  });

  const displayCategory = expense.category === 'אחר' && expense.custom_category ? expense.custom_category : expense.category;

  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="font-semibold">{expense.description}</p>
          <p className="text-sm text-gray-500">{displayCategory} • {expense.date}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold text-red-600">₪{expense.amount?.toFixed(0)}</span>
          <button
            onClick={() => { if (window.confirm('למחוק?')) deleteMut.mutate(); }}
            className="p-2 rounded-lg hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function ExpenseFormModal({ open, onClose, queryClient, toast }) {
  const [form, setForm] = useState({
    description: '', amount: 0, category: '', custom_category: '', date: format(new Date(), 'yyyy-MM-dd'),
  });

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.Expense.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast({ title: 'ההוצאה נוספה' });
      onClose();
      setForm({ description: '', amount: 0, category: '', custom_category: '', date: format(new Date(), 'yyyy-MM-dd') });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader><DialogTitle>הוצאה חדשה</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>תיאור</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label>סכום</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          <div>
            <Label>קטגוריה</Label>
            <Select value={form.category} onValueChange={v => setForm({ ...form, category: v, custom_category: v === 'אחר' ? form.custom_category : '' })}>
              <SelectTrigger><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {form.category === 'אחר' && (
            <div><Label>שם הקטגוריה</Label><Input value={form.custom_category} onChange={e => setForm({ ...form, custom_category: e.target.value })} placeholder="למשל: אחזקת מבנה, ביטוח..." /></div>
          )}
          <div><Label>תאריך</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate(form)} disabled={!form.description || !form.category} className="bg-amber-500 hover:bg-amber-600">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CashCountModal({ open, onClose, queryClient, toast }) {
  const [amount, setAmount] = useState(0);
  const [countDate, setCountDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.CashCount.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-counts'] });
      toast({ title: 'ספירת קופה נשמרה' });
      onClose();
      setAmount(0);
      setCountDate(format(new Date(), 'yyyy-MM-dd'));
      setNotes('');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader><DialogTitle>ספירת קופה</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>סכום בקופה</Label><Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} /></div>
          <div><Label>תאריך ושעת הספירה</Label><Input type="date" value={countDate} onChange={e => setCountDate(e.target.value)} /></div>
          <div><Label>הערות</Label><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="הערות נוספות..." /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate({ amount, notes, date: countDate })} className="bg-amber-500 hover:bg-amber-600">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}