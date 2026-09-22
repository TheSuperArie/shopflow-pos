import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Wallet, Plus, Pencil, Trash2 } from 'lucide-react';
import { fetchBranchScoped } from '@/lib/branchScope';
import NetworkExpenseFormModal from './NetworkExpenseFormModal';

export default function BranchExpensesView({ branch }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['branch-expenses', branch.id],
    queryFn: () => fetchBranchScoped(base44.entities.Expense, branch, {}, '-date', 1000),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['branch-expenses', branch.id] });
  const onError = (error) => toast({ title: '❌ הפעולה נכשלה', description: error?.message || 'נסה שוב', variant: 'destructive' });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Expense.delete(id),
    onSuccess: () => { refresh(); toast({ title: '🗑️ ההוצאה נמחקה', duration: 2000 }); },
    onError,
  });

  const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const networkTotal = expenses.filter(e => e.network_only).reduce((s, e) => s + (Number(e.amount) || 0), 0);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;
  }

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Card className="flex-1 min-w-[220px]">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">סה"כ הוצאות בסניף</p>
              <p className="text-2xl font-bold text-red-600">₪{total.toFixed(0)}</p>
              {networkTotal > 0 && <p className="text-xs text-amber-600">מתוכן הוצאות רשת: ₪{networkTotal.toFixed(0)}</p>}
            </div>
          </CardContent>
        </Card>
        <Button onClick={() => { setEditing(null); setShowForm(true); }} className="gap-2 bg-amber-500 hover:bg-amber-600">
          <Plus className="w-4 h-4" /> הוספת הוצאה
        </Button>
      </div>

      {expenses.map(exp => (
        <Card key={exp.id}>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold">{exp.description}</p>
                {exp.network_only && <Badge className="bg-amber-100 text-amber-700 text-xs">הוצאת רשת</Badge>}
              </div>
              <p className="text-sm text-gray-500">
                {exp.category === 'אחר' && exp.custom_category ? exp.custom_category : exp.category} • {exp.date}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-bold text-red-600">₪{Number(exp.amount || 0).toFixed(0)}</span>
              {exp.network_only && (
                <>
                  <button onClick={() => { setEditing(exp); setShowForm(true); }} className="p-2 rounded-lg hover:bg-gray-100">
                    <Pencil className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    onClick={() => { if (window.confirm('למחוק את הוצאת הרשת?')) deleteMutation.mutate(exp.id); }}
                    className="p-2 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
      {expenses.length === 0 && <p className="text-center text-gray-400 py-12">אין הוצאות בסניף זה</p>}

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