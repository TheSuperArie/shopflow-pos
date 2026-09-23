import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Wallet, Plus, Landmark, Repeat } from 'lucide-react';
import { groupExpenses, sumExpenses } from '@/lib/expenseGrouping';
import { lastUsedByTemplate } from '@/lib/fixedExpenseTemplates';
import { fetchAllPages } from '@/lib/fetchAllPages';
import NetworkDateRangeFilter, { DATE_PRESETS } from './NetworkDateRangeFilter';
import NetworkLevelExpenseFormModal, { NETWORK_EXPENSE_CATEGORIES } from './NetworkLevelExpenseFormModal';
import FixedTemplatesDialog from '@/components/expenses/FixedTemplatesDialog';
import ExpenseFolder from './ExpenseFolder';
import ExpenseRow from './ExpenseRow';

/** The network's own expenses (office, accountant, central warehouse...) — belong to no branch. */
export default function NetworkLevelExpensesTab({ tenantEmail }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [range, setRange] = useState(() => ({ ...DATE_PRESETS[2].range(), preset: 'month' }));
  const [form, setForm] = useState({ open: false, expense: null });

  const queryKey = ['network-level-expenses', tenantEmail];
  const { data: all = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchAllPages(base44.entities.Expense, { network_level: true, tenant_email: tenantEmail }, '-date', { label: 'הוצאות' }),
    enabled: !!tenantEmail,
  });
  const expenses = all.filter(e => e.date >= range.from && e.date <= range.to);

  const [showTemplates, setShowTemplates] = useState(false);
  const { data: templates = [] } = useQuery({
    queryKey: ['fixed-templates', 'network', tenantEmail],
    queryFn: () => base44.entities.FixedExpenseTemplate.filter({ network_level: true, tenant_email: tenantEmail }, 'name', 500),
    enabled: !!tenantEmail,
  });
  const lastUsed = lastUsedByTemplate(all);

  // Also refresh the network reports/dashboard so their expense totals are never stale
  const refresh = () => ['network-level-expenses', 'network-expenses', 'all-expenses-dashboard']
    .forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
  const onError = (error) => toast({ title: '❌ הפעולה נכשלה', description: error?.message || 'נסה שוב', variant: 'destructive' });
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Expense.delete(id),
    onSuccess: () => { refresh(); toast({ title: '🗑️ ההוצאה נמחקה', duration: 2000 }); },
    onError,
  });

  const groups = groupExpenses(expenses);
  const fixed = sumExpenses(groups.fixed);
  const onetime = sumExpenses(groups.onetime) + sumExpenses(groups.employee);
  const onetimeList = [...groups.onetime, ...groups.employee];
  const onEdit = (expense) => setForm({ open: true, expense });
  const onDelete = (exp) => { if (window.confirm('למחוק את הוצאת הרשת?')) deleteMutation.mutate(exp.id); };
  const rows = (list, empty) => list.length === 0
    ? <p className="text-center text-sm text-gray-400 py-4">{empty}</p>
    : list.map(exp => <ExpenseRow key={exp.id} exp={exp} onEdit={onEdit} onDelete={onDelete} />);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-3">
        <Landmark className="w-6 h-6 text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">הוצאות הרשת</h1>
          <p className="text-sm text-gray-500">הוצאות כלליות של הרשת שאינן שייכות לאף סניף</p>
        </div>
      </div>

      <NetworkDateRangeFilter from={range.from} to={range.to} preset={range.preset} onChange={setRange} />

      <Card>
        <CardContent className="p-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-red-500" />
            <span className="text-sm text-gray-500">סה"כ הוצאות רשת</span>
            <span className="text-lg font-bold text-red-600" data-testid="network-level-total">₪{(fixed + onetime).toFixed(0)}</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-500">קבועות <b className="text-indigo-600">₪{fixed.toFixed(0)}</b></span>
            <span className="text-gray-500">חד פעמיות <b className="text-orange-600">₪{onetime.toFixed(0)}</b></span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowTemplates(true)} className="ms-auto gap-1.5">
            <Repeat className="w-3.5 h-3.5" /> הוצאות קבועות
          </Button>
          <Button size="sm" onClick={() => setForm({ open: true, expense: null })} className="gap-1.5 bg-amber-500 hover:bg-amber-600">
            <Plus className="w-3.5 h-3.5" /> הוספת הוצאה
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>
      ) : (
        <>
          <ExpenseFolder title="הוצאות קבועות" count={groups.fixed.length} total={fixed} color="text-indigo-600">
            {rows(groups.fixed, 'אין הוצאות קבועות')}
          </ExpenseFolder>
          <ExpenseFolder title="הוצאות חד פעמיות" count={onetimeList.length} total={onetime} color="text-orange-600">
            {rows(onetimeList, 'אין הוצאות חד פעמיות')}
          </ExpenseFolder>
        </>
      )}

      <NetworkLevelExpenseFormModal
        open={form.open}
        tenantEmail={tenantEmail}
        expense={form.expense}
        templates={templates}
        lastUsed={lastUsed}
        onClose={() => setForm({ open: false, expense: null })}
        onSaved={() => { refresh(); setForm({ open: false, expense: null }); toast({ title: '✅ ההוצאה נשמרה', duration: 2000 }); }}
        onError={onError}
      />
      <FixedTemplatesDialog
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        templates={templates}
        lastUsed={lastUsed}
        categories={NETWORK_EXPENSE_CATEGORIES}
        scope={{ branch_id: null, network_level: true, tenant_email: tenantEmail }}
      />
    </div>
  );
}