import React, { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchNetworkExpenses } from '@/lib/networkScope';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Loader2, Wallet } from 'lucide-react';
import { groupExpenses, sumExpenses } from '@/lib/expenseGrouping';
import { makeExpenseSide } from '@/lib/businessModelSplit';
import NetworkDateRangeFilter from './NetworkDateRangeFilter';
import ExpenseFolder from './ExpenseFolder';
import SideExpenseRow from './SideExpenseRow';
import ExpenseBranchBreakdown from './ExpenseBranchBreakdown';

const TITLES = { importer: 'צד המייבא', private: 'צד פרטי (המלאי שלנו)' };
const NETWORK_LABEL = 'הוצאת רשת';

// Same date rule as the dashboard banners
const toLocalDate = (iso) => {
  if (!iso) return null;
  const safe = typeof iso === 'string' && iso.length > 10 && !iso.endsWith('Z') ? `${iso}Z` : iso;
  try { return new Date(safe).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); } catch { return null; }
};

export default function NetworkSideExpensesView({ side, tenantEmail, branches, initialRange, onBack }) {
  const [range, setRange] = useState(initialRange);

  // Same server-scoped query (and cache key) as the dashboard — only this network's expenses
  const branchIdList = useMemo(() => (branches || []).map(b => b.id).sort(), [branches]);
  const stationEmailList = useMemo(() => (branches || []).map(b => b.station_email).filter(Boolean).sort(), [branches]);

  const { data: raw = [], isLoading } = useQuery({
    queryKey: ['all-expenses-dashboard', tenantEmail, branchIdList.join(','), stationEmailList.join(','), range.from, range.to],
    queryFn: () => fetchNetworkExpenses({
      branchIds: branchIdList,
      stationEmails: stationEmailList,
      tenantEmail,
      dateQuery: { date: { $gte: range.from, $lte: range.to } },
    }),
    enabled: !!tenantEmail,
    staleTime: 120000,
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => {
    const sideOf = makeExpenseSide(branches, tenantEmail);
    return raw
      .filter(e => { const d = e.date || toLocalDate(e.created_date); return !!d && d >= range.from && d <= range.to; })
      .map(e => ({ exp: e, ...sideOf(e) }))
      .filter(r => r.side === side)
      .map(r => ({ ...r, label: r.networkLevel ? NETWORK_LABEL : (r.branch?.name || 'חשבון הרשת') }));
  }, [raw, branches, tenantEmail, side, range.from, range.to]);

  const labelOf = useMemo(() => new Map(rows.map(r => [r.exp.id, r])), [rows]);
  const groups = groupExpenses(rows.map(r => r.exp));
  const totals = { fixed: sumExpenses(groups.fixed), onetime: sumExpenses(groups.onetime), employee: sumExpenses(groups.employee) };
  const total = totals.fixed + totals.onetime + totals.employee;

  const breakdown = useMemo(() => {
    const m = {};
    rows.forEach(r => { m[r.label] = (m[r.label] || 0) + (Number(r.exp.amount) || 0); });
    return Object.entries(m).map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
  }, [rows]);

  const renderList = (list, empty) => list.length === 0
    ? <p className="text-center text-sm text-gray-400 py-4">{empty}</p>
    : list.map(e => { const r = labelOf.get(e.id); return <SideExpenseRow key={e.id} exp={e} branchLabel={r.label} networkLevel={r.networkLevel} />; });

  return (
    <div className="space-y-3 max-w-full overflow-x-hidden" dir="rtl">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5 shrink-0">
          <ArrowRight className="w-4 h-4" /> חזרה לדאשבורד
        </Button>
        <h1 className="text-lg md:text-2xl font-bold text-gray-800 truncate">הוצאות הרשת - פירוט · {TITLES[side]}</h1>
      </div>

      <NetworkDateRangeFilter from={range.from} to={range.to} preset={range.preset} onChange={setRange} />

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>
      ) : (
        <>
          <Card>
            <CardContent className="p-3 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-red-500" />
                <span className="text-sm text-gray-500">סה"כ הוצאות</span>
                <span className="text-lg font-bold text-red-600" data-testid="side-expenses-total">₪{total.toFixed(0)}</span>
              </div>
              <div className="flex items-center gap-3 text-xs flex-wrap">
                <span className="text-gray-500">קבועות <b className="text-indigo-600">₪{totals.fixed.toFixed(0)}</b></span>
                <span className="text-gray-500">חד פעמיות <b className="text-orange-600">₪{totals.onetime.toFixed(0)}</b></span>
                <span className="text-gray-500">תשלומי עובדים <b className="text-blue-600">₪{totals.employee.toFixed(0)}</b></span>
              </div>
            </CardContent>
          </Card>

          <ExpenseBranchBreakdown rows={breakdown} total={total} />

          <ExpenseFolder title="הוצאות קבועות" count={groups.fixed.length} total={totals.fixed} color="text-indigo-600">
            {renderList(groups.fixed, 'אין הוצאות קבועות')}
          </ExpenseFolder>
          <ExpenseFolder title="הוצאות חד פעמיות" count={groups.onetime.length} total={totals.onetime} color="text-orange-600">
            {renderList(groups.onetime, 'אין הוצאות חד פעמיות')}
          </ExpenseFolder>
          <ExpenseFolder title="תשלומי עובדים" count={groups.employee.length} total={totals.employee} color="text-blue-600">
            {renderList(groups.employee, 'אין תשלומי עובדים')}
          </ExpenseFolder>
        </>
      )}
    </div>
  );
}