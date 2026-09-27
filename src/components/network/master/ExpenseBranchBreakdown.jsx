import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

/** Per-branch totals with a proportional background stripe. rows: [{ label, amount }] */
export default function ExpenseBranchBreakdown({ rows, total }) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-0">
        <p className="px-3 pt-3 pb-2 text-sm font-bold text-gray-700">פילוח לפי סניף</p>
        <div className="divide-y">
          {rows.map(r => {
            const pct = total > 0 ? (r.amount / total) * 100 : 0;
            return (
              <div key={r.label} className="relative flex items-center gap-2 px-3 py-2 text-sm overflow-hidden" data-testid="branch-breakdown-row">
                <div className="absolute inset-y-0 right-0 bg-red-50" style={{ width: `${pct}%` }} />
                <span className="relative font-medium text-gray-800 truncate flex-1 min-w-0">{r.label}</span>
                <span className="relative text-xs text-gray-500 shrink-0">{pct.toFixed(1)}%</span>
                <span className="relative font-bold text-red-600 shrink-0">₪{r.amount.toFixed(0)}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}