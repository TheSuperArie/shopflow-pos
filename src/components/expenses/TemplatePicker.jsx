import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isThisMonth } from '@/lib/fixedExpenseTemplates';

/** Pick a fixed-expense template to prefill the form, or keep a free expense. */
export default function TemplatePicker({ templates = [], lastUsed = {}, value, onPick }) {
  const active = templates.filter(t => t.is_active !== false);
  if (active.length === 0) return null;
  return (
    <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 p-2">
      <Label className="text-indigo-700">מתוך הוצאה קבועה</Label>
      <Select value={value || 'none'} onValueChange={v => onPick(v === 'none' ? null : active.find(t => t.id === v))}>
        <SelectTrigger className="bg-white" data-testid="template-picker"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">ללא תבנית — הוצאה חופשית</SelectItem>
          {active.map(t => (
            <SelectItem key={t.id} value={t.id}>
              {t.name} · ₪{t.default_amount}{isThisMonth(lastUsed[t.id]) ? ' ✓ נרשם החודש' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}