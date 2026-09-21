import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';

/** Email address that receives a notification for every new access request. */
export default function DevEmailCard({ code, currentEmail }) {
  const [email, setEmail] = useState(currentEmail || '');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      await base44.functions.invoke('developerPortal', { action: 'setDevEmail', code, dev_email: email });
      setMsg('נשמר');
    } catch {
      setMsg('השמירה נכשלה');
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-gray-800 font-bold text-sm">
          <Mail className="w-4 h-4" /> מייל להתראות על בקשות גישה
        </div>
        <div className="space-y-1.5">
          <Label>אימייל המפתח</Label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="dev@example.com" />
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={save} disabled={saving}>שמור</Button>
          {msg && <span className="text-xs text-gray-500">{msg}</span>}
        </div>
      </CardContent>
    </Card>
  );
}