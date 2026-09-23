import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function FixedTemplateForm({ template, categories, saving, onSave, onCancel }) {
  const [f, setF] = useState({
    name: template?.name || '', default_amount: template?.default_amount ?? '', category: template?.category || '',
    custom_category: template?.custom_category || '', description: template?.description || '',
  });
  const set = (patch) => setF(prev => ({ ...prev, ...patch }));
  const valid = f.name && f.category && parseFloat(f.default_amount) > 0;
  return (
    <div className="space-y-2 rounded-lg border p-3 bg-gray-50">
      <div><Label>שם</Label><Input value={f.name} onChange={e => set({ name: e.target.value })} placeholder="למשל: אינטרנט" /></div>
      <div><Label>סכום ברירת מחדל (₪)</Label><Input type="number" value={f.default_amount} onChange={e => set({ default_amount: e.target.value })} placeholder="65" /></div>
      <div>
        <Label>קטגוריה</Label>
        <Select value={f.category} onValueChange={v => set({ category: v })}>
          <SelectTrigger className="bg-white"><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
          <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {f.category === 'אחר' && (
        <div><Label>שם הקטגוריה</Label><Input value={f.custom_category} onChange={e => set({ custom_category: e.target.value })} placeholder="למשל: תקשורת" /></div>
      )}
      <div><Label>תיאור (אופציונלי)</Label><Input value={f.description} onChange={e => set({ description: e.target.value })} placeholder="אם ריק — השם ישמש כתיאור" /></div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" disabled={!valid || saving} onClick={() => onSave({
          ...f, default_amount: parseFloat(f.default_amount), custom_category: f.category === 'אחר' ? f.custom_category : '',
        })} className="bg-amber-500 hover:bg-amber-600">{saving ? 'שומר...' : 'שמור תבנית'}</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>ביטול</Button>
      </div>
    </div>
  );
}