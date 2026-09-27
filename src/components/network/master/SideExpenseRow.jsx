import React from 'react';

/** Read-only compact expense line showing which branch it belongs to. */
export default function SideExpenseRow({ exp, branchLabel, networkLevel }) {
  const category = exp.category === 'אחר' && exp.custom_category ? exp.custom_category : exp.category;
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 text-sm hover:bg-gray-50" data-testid="side-expense-row">
      <span className="text-xs text-gray-400 shrink-0 w-[68px]">{exp.date}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-800 truncate">{exp.description}</p>
        <div className="flex items-center gap-1.5 text-xs min-w-0">
          <span className={`shrink-0 px-1.5 rounded ${networkLevel ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
            {branchLabel}
          </span>
          <span className="text-gray-400 truncate">{category}{exp.employee_name ? ` · ${exp.employee_name}` : ''}</span>
        </div>
      </div>
      <span className="font-bold text-red-600 shrink-0">₪{Number(exp.amount || 0).toFixed(0)}</span>
    </div>
  );
}