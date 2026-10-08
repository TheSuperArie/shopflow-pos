import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format, startOfMonth, endOfMonth, startOfWeek, subMonths } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Wallet, Plus, Repeat } from 'lucide-react';
import FixedTemplatesDialog from '@/components/expenses/FixedTemplatesDialog';
import { fetchBranchScoped } from '@/lib/branchScope';
import { ALL } from '@/lib/fetchAllPages';
import { groupExpenses, sumExpenses } from '@/lib/expenseGrouping';
import { lastUsedByTemplate } from '@/lib/fixedExpenseTemplates';
import NetworkExpenseFormModal from './NetworkExpenseFormModal';
import ExpenseFolder from './ExpenseFolder';
import ExpenseRow from './ExpenseRow';
import EmployeeExpenseFolderContent from './EmployeeExpenseFolderContent';

const EXPENSE_CATEGORIES = ['הוצאות חוץ', 'פרסום', 'כיבוד/עוגות', 'אחר'];

const d = (x) => format(x, 'yyyy-MM-dd');
const RANGE_SHORTCUTS = [
  { label: 'היום', get: () => ({ from: d(new Date()), to: d(new Date()) }) },
  { label: 'השבוע', get: () => ({ from: d(startOfWeek(new Date(), { weekStartsOn: 0 })), to: d(new Date()) }) },
  { label: 'החודש', get: () => ({ from: d(startOfMonth(new Date())), to: d(new Date()) }) },
  { label: 'חודש קודם', get: () => ({ from: d(startOfMonth(subMonths(new Date(), 1))), to: d(endOfMonth(subMonths(new Date(), 1))) }) },
];

export default function BranchExpensesView({ branch, fromDate, toDate }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editing, setEditing] = useState(null);
  // Local date range for this tab (defaults to whatever the page passed in)
  const [from, setFrom] = useState(fromDate || '');
  const [to, setTo] = useState(toDate || '');

  const { data: allExpenses = [], isLoading } = useQuery({
    queryKey: ['branch-expenses', branch.id],
    queryFn: () => fetchBranchScoped(base44.entities.Expense, branch, {}, '-date', ALL),
  });

  // The branch's fixed-expense templates: the branch manager's own + the network's for this branch
  // (network_only — like the network's expenses, the branch manager doesn't see those)
  const { data: templates = [] } = useQuery({
    queryKey: ['fixed-templates', 'branch-view', branch.id],
    queryFn: async () => (await fetchBranchScoped(base44.entities.FixedExpenseTemplate, branch, {}, 'name', 500))
      .filter(t => t.network_level !== true),
  });
  const lastUsed = lastUsedByTemplate(allExpenses);

  const expenses = allExpenses.filter(e => (!from || e.date >= from) && (!to || e.date <= to));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['branch-expenses', branch.id] });
  const onError = (error) => toast({ title: '❌ הפעולה נכשלה', description: error?.message || 'נסה שוב', variant: 'destructive' });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Expense.delete(id),
    onSuccess: () => { refresh(); toast({ title: '🗑️ ההוצאה נמחקה', duration: 2000 }); },
    onError,
  });

  const groups = groupExpenses(expenses);
  const totals = {
    fixed: sumExpenses(groups.fixed),
    onetime: sumExpenses(groups.onetime),
    employee: sumExpenses(groups.employee),
  };
  const total = totals.fixed + totals.onetime + totals.employee;

  const handleEdit = (exp) => { setEditing(exp); setShowForm(true); };
  const handleDelete = (exp) => { if (window.confirm('למחוק את הוצאת הרשת?')) deleteMutation.mutate(exp.id); };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;
  }

  return (
    <div className="space-y-3" dir="rtl">
      <Card>
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">מתאריך</span>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 w-36 text-sm" />
          <span className="text-xs text-gray-500">עד</span>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 w-36 text-sm" />
          <div className="flex items-center gap-1.5 flex-wrap">
            {RANGE_SHORTCUTS.map(s => (
              <Button key={s.label} size="sm" variant="outline" className="h-8 text-xs"
                onClick={() => { const r = s.get(); setFrom(r.from); setTo(r.to); }}>
                {s.label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" className="h-8 text-xs text-gray-500"
              onClick={() => { setFrom(''); setTo(''); }}>
              הכל
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-red-500" />
            <span className="text-sm text-gray-500">סה"כ הוצאות</span>
            <span className="text-lg font-bold text-red-600">₪{total.toFixed(0)}</span>
          </div>
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <span className="text-gray-500">קבועות <b className="text-indigo-600">₪{totals.fixed.toFixed(0)}</b></span>
            <span className="text-gray-500">חד פעמיות <b className="text-orange-600">₪{totals.onetime.toFixed(0)}</b></span>
            <span className="text-gray-500">תשלומי עובדים <b className="text-blue-600">₪{totals.employee.toFixed(0)}</b></span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowTemplates(true)} className="ms-auto gap-1.5">
            <Repeat className="w-3.5 h-3.5" /> הוצאות קבועות
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} className="gap-1.5 bg-amber-500 hover:bg-amber-600">
            <Plus className="w-3.5 h-3.5" /> הוספת הוצאה
          </Button>
        </CardContent>
      </Card>

      <ExpenseFolder title="הוצאות קבועות" count={groups.fixed.length} total={totals.fixed} color="text-indigo-600">
        {groups.fixed.length === 0
          ? <p className="text-center text-sm text-gray-400 py-4">אין הוצאות קבועות</p>
          : groups.fixed.map(exp => <ExpenseRow key={exp.id} exp={exp} onEdit={handleEdit} onDelete={handleDelete} />)}
      </ExpenseFolder>

      <ExpenseFolder title="הוצאות חד פעמיות" count={groups.onetime.length} total={totals.onetime} color="text-orange-600">
        {groups.onetime.length === 0
          ? <p className="text-center text-sm text-gray-400 py-4">אין הוצאות חד פעמיות</p>
          : groups.onetime.map(exp => <ExpenseRow key={exp.id} exp={exp} onEdit={handleEdit} onDelete={handleDelete} />)}
      </ExpenseFolder>

      <ExpenseFolder title="תשלומי עובדים" count={groups.employee.length} total={totals.employee} color="text-blue-600">
        <EmployeeExpenseFolderContent expenses={groups.employee} onEdit={handleEdit} onDelete={handleDelete} />
      </ExpenseFolder>

      <NetworkExpenseFormModal
        open={showForm}
        branch={branch}
        expense={editing}
        templates={templates}
        lastUsed={lastUsed}
        onClose={() => setShowForm(false)}
        onSaved={() => { refresh(); setShowForm(false); toast({ title: '✅ ההוצאה נשמרה', duration: 2000 }); }}
        onError={onError}
      />

      {/* Templates the network manager keeps for this branch — network-only, like his expenses here */}
      <FixedTemplatesDialog
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        templates={templates}
        lastUsed={lastUsed}
        categories={EXPENSE_CATEGORIES}
        scope={{
          branch_id: branch.id, network_level: false, network_only: true,
          station_email: branch.station_email || null, tenant_email: branch.tenant_email || null,
        }}
      />
    </div>
  );
}