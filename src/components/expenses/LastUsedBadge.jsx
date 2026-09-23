import React from 'react';
import { isThisMonth } from '@/lib/fixedExpenseTemplates';

/** When an expense was last recorded from a template — green when already recorded this month. */
export default function LastUsedBadge({ date }) {
  if (!date) return <span className="text-[11px] text-amber-600">טרם נרשמה הוצאה</span>;
  return isThisMonth(date)
    ? <span className="text-[11px] text-green-600">נרשם החודש · {date}</span>
    : <span className="text-[11px] text-amber-600">טרם נרשם החודש · אחרון: {date}</span>;
}