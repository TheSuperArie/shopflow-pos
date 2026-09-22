import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Wallet, Plus, Repeat, Receipt, Users } from 'lucide-react';
import { fetchBranchScoped } from '@/lib/branchScope';
import { groupExpenses, sumExpenses } from '@/lib/expenseGrouping';
import NetworkExpenseFormModal from './NetworkExpenseFormModal';
import BranchExpenseSection from './BranchExpenseSection';

export default function BranchExpensesView({ branch, fromDate, toDate }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: allExpenses = [], isLoading } = useQuery({
    queryKey: ['branch-expenses', branch.id],
    queryFn: () => fetchBranchScoped(base44.entities.Expense, branch, {}, '-date', 1000),
  });

  const expenses = allExpenses.filter(e => (!fromDate || e.date >= fromDate) && (!toDate || e.date <= toDate));

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
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <Card className="flex-1 min-w-[260px]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">סה"כ הוצאות בסניף</p>
                <p className="text-2xl font-bold text-red-600">₪{total.toFixed(0)}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t text-center">
              <div>
                <p className="text-xs text-gray-500">הוצאות קבועות</p>
                <p className="font-bold text-indigo-600">₪{totals.fixed.toFixed(0)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">הוצאות חד פעמיות</p>
                <p className="font-bold text-orange-600">₪{totals.onetime.toFixed(0)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">תשלומי עובדים</p>
                <p className="font-bold text-blue-600">₪{totals.employee.toFixed(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Button onClick={() => { setEditing(null); setShowForm(true); }} className="gap-2 bg-amber-500 hover:bg-amber-600">
          <Plus className="w-4 h-4" /> הוספת הוצאה
        </Button>
      </div>

      <BranchExpenseSection
        title="הוצאות קבועות" icon={Repeat} color="text-indigo-600"
        expenses={groups.fixed} total={totals.fixed}
        emptyText="אין הוצאות קבועות" onEdit={handleEdit} onDelete={handleDelete}
      />
      <BranchExpenseSection
        title="הוצאות חד פעמיות" icon={Receipt} color="text-orange-600"
        expenses={groups.onetime} total={totals.onetime}
        emptyText="אין הוצאות חד פעמיות" onEdit={handleEdit} onDelete={handleDelete}
      />
      <BranchExpenseSection
        title="תשלומי עובדים" icon={Users} color="text-blue-600"
        expenses={groups.employee} total={totals.employee}
        emptyText="אין תשלומי עובדים" onEdit={handleEdit} onDelete={handleDelete}
      />

      <NetworkExpenseFormModal
        open={showForm}
        branch={branch}
        expense={editing}
        onClose={() => setShowForm(false)}
        onSaved={() => { refresh(); setShowForm(false); toast({ title: '✅ ההוצאה נשמרה', duration: 2000 }); }}
        onError={onError}
      />
    </div>
  );
}