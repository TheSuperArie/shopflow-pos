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
import { Plus, Trash2, Loader2, Wallet, Repeat } from 'lucide-react';
import TemplatePicker from '@/components/expenses/TemplatePicker';
import FixedTemplatesDialog from '@/components/expenses/FixedTemplatesDialog';
import { lastUsedByTemplate, templateToExpense } from '@/lib/fixedExpenseTemplates';
import { format } from 'date-fns';
import { useCurrentBranch, filterBranchScoped } from '@/hooks/useCurrentBranch';
import { withoutNetworkOnly } from '@/lib/branchScope';
import { ALL } from '@/lib/fetchAllPages';

import { EXPENSE_TYPES } from '@/lib/expenseGrouping';

// "שכר עובדים" is intentionally excluded — employee expenses are recorded only via the
// employees page or the staff portal, and always land in the "תשלומי עובדים" section.
const EXPENSE_CATEGORIES = ['הוצאות חוץ', 'פרסום', 'כיבוד/עוגות', 'אחר'];

export default function AdminExpenses() {
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, branchId, isLoading: loadingBranch } = useCurrentBranch();

  const { data: expenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ['expenses', branchId, user?.email],
    // Network-master expenses (network_only) are never shown to the branch manager.
    queryFn: async () => withoutNetworkOnly(await filterBranchScoped(base44.entities.Expense, branchId, user.email, {}, '-date', ALL)),
    enabled: !loadingBranch && !!user,
  });

  const [showTemplates, setShowTemplates] = useState(false);
  const { data: templates = [] } = useQuery({
    queryKey: ['fixed-templates', 'branch', branchId, user?.email],
    queryFn: async () => (await filterBranchScoped(base44.entities.FixedExpenseTemplate, branchId, user.email, {}, 'name', 500))
      .filter(t => t.network_level !== true),
    enabled: !loadingBranch && !!user,
  });
  const lastUsed = lastUsedByTemplate(expenses);

  const isLoading = loadingBranch || loadingExpenses;

  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
         <h1 className="text-2xl font-bold text-gray-800">הוצאות</h1>
         <div className="flex gap-2">
           <Button variant="outline" onClick={() => setShowTemplates(true)} className="gap-2">
             <Repeat className="w-4 h-4" /> הוצאות קבועות
           </Button>
           <Button onClick={() => setShowForm(true)} className="gap-2 bg-amber-500 hover:bg-amber-600">
             <Plus className="w-4 h-4" /> הוצאה חדשה
           </Button>
         </div>
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

      <ExpenseFormModal open={showForm} onClose={() => setShowForm(false)} queryClient={queryClient} toast={toast} branchId={branchId} templates={templates} lastUsed={lastUsed} />
      <FixedTemplatesDialog
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        templates={templates}
        lastUsed={lastUsed}
        categories={EXPENSE_CATEGORIES}
        scope={{ branch_id: branchId || null, network_level: false }}
      />
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
          <p className="text-sm text-gray-500">{displayCategory} • {expense.expense_type || 'חד פעמית'} • {expense.date}</p>
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

function ExpenseFormModal({ open, onClose, queryClient, toast, branchId, templates, lastUsed }) {
  const [form, setForm] = useState({
    description: '', amount: 0, category: '', custom_category: '', expense_type: 'חד פעמית', date: format(new Date(), 'yyyy-MM-dd'), template_id: '',
  });

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.Expense.create({ ...data, template_id: data.template_id || null, branch_id: branchId || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast({ title: 'ההוצאה נוספה' });
      onClose();
      setForm({ description: '', amount: 0, category: '', custom_category: '', expense_type: 'חד פעמית', date: format(new Date(), 'yyyy-MM-dd'), template_id: '' });
    },
    onError: (e) => toast({ title: '❌ השמירה נכשלה', description: e?.message || 'נסה שוב', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader><DialogTitle>הוצאה חדשה</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <TemplatePicker
            templates={templates}
            lastUsed={lastUsed}
            value={form.template_id}
            onPick={t => setForm(t ? { ...form, ...templateToExpense(t) } : { ...form, template_id: '' })}
          />
          <div><Label>תיאור</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label>סכום</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          <div>
            <Label>סוג הוצאה</Label>
            <Select value={form.expense_type} onValueChange={v => setForm({ ...form, expense_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
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