import React, { useState } from 'react';
import { ChevronLeft, ArrowRight, User } from 'lucide-react';
import { sumExpenses } from '@/lib/expenseGrouping';
import ExpenseRow from './ExpenseRow';

/** Employee payments folder body: employee list → drill into one employee's payments. */
export default function EmployeeExpenseFolderContent({ expenses, onEdit, onDelete }) {
  const [selected, setSelected] = useState(null);

  const byEmployee = {};
  expenses.forEach(e => {
    const name = e.employee_name || 'ללא שם עובד';
    (byEmployee[name] = byEmployee[name] || []).push(e);
  });
  const names = Object.keys(byEmployee).sort((a, b) => sumExpenses(byEmployee[b]) - sumExpenses(byEmployee[a]));

  if (expenses.length === 0) {
    return <p className="text-center text-sm text-gray-400 py-4">אין תשלומי עובדים</p>;
  }

  if (selected) {
    const list = byEmployee[selected] || [];
    return (
      <div>
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b">
          <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <ArrowRight className="w-3.5 h-3.5" /> חזרה לרשימת העובדים
          </button>
          <span className="ms-auto text-sm font-bold text-gray-800">{selected}</span>
          <span className="text-sm font-bold text-blue-600">₪{sumExpenses(list).toFixed(0)}</span>
        </div>
        {list.map(exp => <ExpenseRow key={exp.id} exp={exp} onEdit={onEdit} onDelete={onDelete} />)}
      </div>
    );
  }

  return (
    <div>
      {names.map(name => (
        <button
          key={name}
          onClick={() => setSelected(name)}
          className="w-full flex items-center gap-2 px-3 py-2 border-b last:border-b-0 text-sm hover:bg-gray-50 text-right"
        >
          <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="font-medium text-gray-800 truncate">{name}</span>
          <span className="text-xs text-gray-400 shrink-0">{byEmployee[name].length} תשלומים</span>
          <span className="ms-auto font-bold text-blue-600 shrink-0">₪{sumExpenses(byEmployee[name]).toFixed(0)}</span>
          <ChevronLeft className="w-4 h-4 text-gray-300 shrink-0" />
        </button>
      ))}
    </div>
  );
}