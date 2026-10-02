import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, KeyRound, AlertTriangle } from 'lucide-react';

/**
 * Change an admin code (branch manager code / network master code). The codes are kept and
 * checked only on the server (adminAuth) — the current code is never shown, and changing it
 * requires a valid current code.
 * field: 'admin_password' | 'network_admin_password'
 */
export default function AdminCodeChange({ field, label, hint }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: status } = useQuery({
    queryKey: ['admin-code-status'],
    queryFn: async () => (await base44.functions.invoke('adminAuth', { action: 'status' })).data,
    staleTime: 60000,
    retry: false,
  });
  const usingDefault = status && (field === 'network_admin_password' ? !status.custom_network : !status.custom_admin);

  const save = async () => {
    if (next.trim().length < 4) return toast({ title: 'הקוד החדש חייב להיות לפחות 4 תווים', variant: 'destructive' });
    if (next !== confirm) return toast({ title: 'הקוד החדש והאימות לא זהים', variant: 'destructive' });
    setSaving(true);
    try {
      await base44.functions.invoke('adminAuth', { action: 'setPasswords', current, [field]: next.trim() });
      setCurrent(''); setNext(''); setConfirm('');
      queryClient.invalidateQueries({ queryKey: ['admin-code-status'] });
      toast({ title: 'הקוד עודכן', duration: 3000 });
    } catch (err) {
      toast({ title: 'הקוד לא עודכן', description: err?.data?.error || err?.message || 'נסה שוב', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border p-3" dir="rtl">
      <Label className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> {label}</Label>
      {usingDefault && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> כרגע בשימוש קוד ברירת המחדל — מומלץ להחליף
        </p>
      )}
      <Input type="password" value={current} onChange={e => setCurrent(e.target.value)} placeholder="קוד נוכחי" autoComplete="off" />
      <Input type="password" value={next} onChange={e => setNext(e.target.value)} placeholder="קוד חדש (לפחות 4 תווים)" autoComplete="new-password" />
      <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="אימות קוד חדש" autoComplete="new-password" />
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      <Button onClick={save} disabled={saving || !current || !next} variant="outline" className="gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} שנה קוד
      </Button>
    </div>
  );
}
