import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet, Plus } from 'lucide-react';
import WithdrawalFormModal from './WithdrawalFormModal';
import WithdrawalListDialog from './WithdrawalListDialog';

const fmt = (n) => `₪${Number(n || 0).toFixed(0)}`;

/** "משכורת" — owner cash withdrawals for an OWN_STOCK branch. Display only; not an expense. */
export default function BranchSalaryBanner({ branchId, dateFrom, dateTo, privateProfit }) {
  const queryClient = useQueryClient();
  const [showList, setShowList] = useState(false);
  const [form, setForm] = useState({ open: false, withdrawal: null });

  const { data: withdrawals = [] } = useQuery({
    queryKey: ['owner-withdrawals', branchId, dateFrom, dateTo],
    queryFn: () => base44.entities.OwnerWithdrawal.filter({ branch_id: branchId, date: { $gte: dateFrom, $lte: dateTo } }, '-date', 2000),
  });
  const withdrawn = withdrawals.reduce((s, w) => s + (Number(w.amount) || 0), 0);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['owner-withdrawals'] });

  const remove = async (w) => {
    if (!window.confirm('למחוק את המשיכה?')) return;
    await base44.entities.OwnerWithdrawal.delete(w.id);
    refresh();
  };

  return (
    <>
      <Card className="border-emerald-100 bg-emerald-50 text-emerald-800">
        <CardContent className="p-4 flex items-center gap-3 flex-wrap" data-testid="branch-salary-banner">
          <button onClick={() => setShowList(true)} className="flex items-center gap-3 text-right min-w-0 flex-1">
            <Wallet className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium opacity-80">משכורת (נמשך מהקופה)</p>
              <p className="text-2xl font-bold" data-testid="branch-salary-value">{fmt(withdrawn)}</p>
              <p className="text-[11px] opacity-70">רווח פרטי {fmt(privateProfit)} · נשאר למשוך {fmt(privateProfit - withdrawn)}</p>
            </div>
          </button>
          <Button size="sm" onClick={() => setForm({ open: true, withdrawal: null })} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 shrink-0">
            <Plus className="w-3.5 h-3.5" /> הוסף משיכה
          </Button>
        </CardContent>
      </Card>
      <WithdrawalListDialog open={showList} onClose={() => setShowList(false)} withdrawals={withdrawals}
        onEdit={(w) => setForm({ open: true, withdrawal: w })} onDelete={remove} />
      <WithdrawalFormModal open={form.open} branchId={branchId} withdrawal={form.withdrawal}
        onClose={() => setForm({ open: false, withdrawal: null })}
        onSaved={() => { refresh(); setForm({ open: false, withdrawal: null }); }} />
    </>
  );
}