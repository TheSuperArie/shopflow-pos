import React, { useState } from 'react';
import { Folder, FolderOpen, ChevronDown } from 'lucide-react';

/** Collapsible compact folder card for a group of expenses. */
export default function ExpenseFolder({ title, count, total, color = 'text-gray-700', children }) {
  const [open, setOpen] = useState(false);
  const Icon = open ? FolderOpen : Folder;

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 text-right"
      >
        <Icon className={`w-4 h-4 shrink-0 ${color}`} />
        <span className="font-bold text-sm text-gray-800 truncate">{title}</span>
        <span className="text-xs text-gray-400 shrink-0">({count})</span>
        <span className={`ms-auto font-bold text-sm shrink-0 ${color}`}>₪{total.toFixed(0)}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t">{children}</div>}
    </div>
  );
}