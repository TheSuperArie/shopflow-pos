import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Pencil, Trash2 } from 'lucide-react';
import LastUsedBadge from './LastUsedBadge';

export default function FixedTemplateRow({ t, lastUsed, onEdit, onToggle, onDelete }) {
  const category = t.category === 'אחר' && t.custom_category ? t.custom_category : t.category;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 border-b last:border-b-0 text-sm ${t.is_active === false ? 'opacity-50' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-800 truncate">{t.name}</p>
        <p className="text-xs text-gray-400 truncate">{category}{t.description ? ` · ${t.description}` : ''}</p>
        <LastUsedBadge date={lastUsed} />
      </div>
      <span className="font-bold text-indigo-600 shrink-0">₪{Number(t.default_amount || 0).toFixed(0)}</span>
      <Switch checked={t.is_active !== false} onCheckedChange={onToggle} title="פעילה" />
      <button onClick={onEdit} className="p-1.5 rounded-md hover:bg-gray-100" title="עריכת תבנית">
        <Pencil className="w-3.5 h-3.5 text-gray-500" />
      </button>
      <button onClick={onDelete} className="p-1.5 rounded-md hover:bg-red-50" title="מחיקת תבנית">
        <Trash2 className="w-3.5 h-3.5 text-red-400" />
      </button>
    </div>
  );
}