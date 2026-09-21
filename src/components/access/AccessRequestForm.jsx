import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

/** Access request form — name / phone / email (email pre-filled from the signed-in account). */
export default function AccessRequestForm({ defaultEmail, defaultName, onSubmitted, onCancel }) {
  const [form, setForm] = useState({ full_name: defaultName || '', phone: '', email: defaultEmail || '' });
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      const res = await base44.functions.invoke('accessControl', { action: 'submit', ...form });
      if (res.data?.ok) onSubmitted();
      else setError(res.data?.error || 'שליחת הבקשה נכשלה');
    } catch (err) {
      setError(err?.response?.data?.error || 'שליחת הבקשה נכשלה');
    }
    setSending(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4 text-right" dir="rtl">
      <div className="space-y-1.5">
        <Label>שם מלא *</Label>
        <Input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} required />
      </div>
      <div className="space-y-1.5">
        <Label>טלפון *</Label>
        <Input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} required />
      </div>
      <div className="space-y-1.5">
        <Label>מייל *</Label>
        <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>ביטול</Button>
        <Button type="submit" disabled={sending} className="gap-2">
          {sending && <Loader2 className="w-4 h-4 animate-spin" />}
          שלח בקשה
        </Button>
      </div>
    </form>
  );
}