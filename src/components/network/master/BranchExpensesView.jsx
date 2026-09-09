import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Wallet } from 'lucide-react';

export default function BranchExpensesView({ branch }) {
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['branch-expenses', branch.id],
    queryFn: () => base44.entities.Expense.filter({ branch_id: branch.id }, '-date', 1000),
  });

  const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;
  }

  return (
    <div className="space-y-3" dir="rtl">
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-sm text-gray-500">סה"כ הוצאות בסניף</p>
            <p className="text-2xl font-bold text-red-600">₪{total.toFixed(0)}</p>
          </div>
        </CardContent>
      </Card>

      {expenses.map(exp => (
        <Card key={exp.id}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold">{exp.description}</p>
              <p className="text-sm text-gray-500">
                {exp.category === 'אחר' && exp.custom_category ? exp.custom_category : exp.category} • {exp.date}
              </p>
            </div>
            <span className="font-bold text-red-600">₪{Number(exp.amount || 0).toFixed(0)}</span>
          </CardContent>
        </Card>
      ))}
      {expenses.length === 0 && <p className="text-center text-gray-400 py-12">אין הוצאות בסניף זה</p>}
    </div>
  );
}