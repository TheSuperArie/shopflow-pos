import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2 } from 'lucide-react';

/** One expense section (fixed / one-time / employee payments) with its own header and total. */
export default function BranchExpenseSection({ title, icon: Icon, color, expenses, total, emptyText, onEdit, onDelete }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${color}`} />
          <h3 className="font-bold text-gray-800">{title}</h3>
          <span className="text-xs text-gray-400">({expenses.length})</span>
        </div>
        <span className={`font-bold ${color}`}>₪{total.toFixed(0)}</span>
      </div>

      {expenses.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-4">{emptyText}</p>
      ) : expenses.map(exp => (
        <Card key={exp.id}>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold">{exp.description}</p>
                {exp.network_only && <Badge className="bg-amber-100 text-amber-700 text-xs">הוצאת רשת</Badge>}
                {exp.employee_name && <Badge className="bg-blue-100 text-blue-700 text-xs">{exp.employee_name}</Badge>}
              </div>
              <p className="text-sm text-gray-500">
                {exp.category === 'אחר' && exp.custom_category ? exp.custom_category : exp.category} • {exp.date}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-bold text-red-600">₪{Number(exp.amount || 0).toFixed(0)}</span>
              {exp.network_only && (
                <>
                  <button onClick={() => onEdit(exp)} className="p-2 rounded-lg hover:bg-gray-100">
                    <Pencil className="w-4 h-4 text-gray-500" />
                  </button>
                  <button onClick={() => onDelete(exp)} className="p-2 rounded-lg hover:bg-red-50">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}