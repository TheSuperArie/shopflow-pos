import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2 } from 'lucide-react';

/** One compact expense line inside an expense folder. */
export default function ExpenseRow({ exp, onEdit, onDelete }) {
  const category = exp.category === 'אחר' && exp.custom_category ? exp.custom_category : exp.category;
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 text-sm hover:bg-gray-50">
      <span className="text-xs text-gray-400 shrink-0 w-[68px]">{exp.date}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-gray-800 truncate">{exp.description}</span>
          {exp.network_only && <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0">הוצאת רשת</Badge>}
        </div>
        <span className="text-xs text-gray-400">{category}</span>
      </div>
      <span className="font-bold text-red-600 shrink-0">₪{Number(exp.amount || 0).toFixed(0)}</span>
      {exp.network_only && (
        <div className="flex items-center shrink-0">
          <button onClick={() => onEdit(exp)} className="p-1.5 rounded-md hover:bg-gray-100" title="עריכה">
            <Pencil className="w-3.5 h-3.5 text-gray-500" />
          </button>
          <button onClick={() => onDelete(exp)} className="p-1.5 rounded-md hover:bg-red-50" title="מחיקה">
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      )}
    </div>
  );
}