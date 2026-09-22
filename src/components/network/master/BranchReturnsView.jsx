import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { fetchBranchScoped } from '@/lib/branchScope';

export default function BranchReturnsView({ branch }) {
  const { data: returns = [], isLoading } = useQuery({
    queryKey: ['branch-returns', branch.id],
    queryFn: () => fetchBranchScoped(base44.entities.Return, branch, {}, '-created_date', 1000),
  });

  const total = returns.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>;
  }

  return (
    <div className="space-y-3" dir="rtl">
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{returns.length} החזרות בסניף</p>
            <p className="text-2xl font-bold text-purple-600">₪{total.toFixed(0)}</p>
          </div>
        </CardContent>
      </Card>

      {returns.map(r => (
        <Card key={r.id}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline">{r.status}</Badge>
              {r.refund_method && <Badge variant="outline">{r.refund_method}</Badge>}
            </div>
            <p className="font-semibold text-gray-800">{r.customer_name || 'לקוח'}</p>
            <p className="text-sm text-gray-500">
              {r.items?.length || 0} פריטים • ₪{Number(r.total_amount || 0).toFixed(2)}
            </p>
            {r.created_date && (
              <p className="text-xs text-gray-400 mt-1">{format(new Date(r.created_date), 'dd/MM/yyyy HH:mm')}</p>
            )}
            {r.reason && <p className="text-sm text-gray-600 mt-2 bg-gray-50 p-2 rounded">סיבה: {r.reason}</p>}
          </CardContent>
        </Card>
      ))}
      {returns.length === 0 && <p className="text-center text-gray-400 py-12">אין החזרות בסניף זה</p>}
    </div>
  );
}