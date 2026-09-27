import React, { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { isOwnStock } from '@/lib/businessModelSplit';
import WithdrawalListDialog from './WithdrawalListDialog';

/** Network "משכורת" — total owner withdrawals across the network's OWN_STOCK branches. Display only. */
export default function NetworkSalaryBanner({ branches, from, to, privateProfit = null, onTotal }) {
  const [showList, setShowList] = useState(false);
  const ownBranches = useMemo(() => Object.fromEntries(branches.filter(isOwnStock).map(b => [b.id, b])), [branches]);
  const ids = Object.keys(ownBranches);

  const { data: raw = [] } = useQuery({
    queryKey: ['owner-withdrawals', 'network', ids.join(','), from, to],
    queryFn: () => base44.entities.OwnerWithdrawal.filter({ branch_id: { $in: ids }, date: { $gte: from, $lte: to } }, '-date', 5000),
    enabled: ids.length > 0,
  });
  const withdrawals = raw.filter(w => ownBranches[w.branch_id]);
  const total = withdrawals.reduce((s, w) => s + (Number(w.amount) || 0), 0);

  // Report upward so the private-profit banner can offer "כלול משיכות"
  useEffect(() => { if (onTotal) onTotal(total); }, [total, onTotal]);

  if (ids.length === 0) return null;
  return (
    <>
      <Card className="border-emerald-100 bg-emerald-50 text-emerald-800">
        <CardContent className="p-4" data-testid="banner-salary">
          <p className="text-xs font-medium opacity-80">משכורת</p>
          <p className="text-2xl font-bold mt-1">₪{total.toFixed(0)}</p>
          {privateProfit !== null && (
            <p className="text-[11px] opacity-70 mt-0.5">נשאר למשוך ₪{(privateProfit - total).toFixed(0)}</p>
          )}
          <button onClick={() => setShowList(true)} className="text-[11px] opacity-70 mt-1 underline underline-offset-2 hover:opacity-100">
            {withdrawals.length} משיכות · פירוט
          </button>
        </CardContent>
      </Card>
      <WithdrawalListDialog open={showList} onClose={() => setShowList(false)} withdrawals={withdrawals}
        branchName={(w) => ownBranches[w.branch_id]?.name || ''} />
    </>
  );
}