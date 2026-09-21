import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Code2, Loader2 } from 'lucide-react';
import { DEV_CODE_SESSION_KEY } from '@/lib/developerAccess';

/** Developer code entry — the code is global and verified server-side. */
export default function DeveloperAccessCard() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    if (!code.trim()) return;
    setIsChecking(true);
    setError('');
    try {
      const res = await base44.functions.invoke('developerPortal', { action: 'verify', code: code.trim() });
      if (res.data?.ok) {
        sessionStorage.setItem(DEV_CODE_SESSION_KEY, code.trim());
        navigate('/UsageAnalytics');
      } else {
        setError('קוד שגוי');
      }
    } catch {
      setError('קוד שגוי');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Code2 className="w-5 h-5" /> דף מפתחים
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Label>קוד מפתח</Label>
        <div className="flex gap-2 mt-1">
          <Input
            type="password"
            value={code}
            onChange={e => { setCode(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="הקש קוד מפתח"
          />
          <Button onClick={submit} disabled={isChecking} className="bg-slate-800 hover:bg-slate-900">
            {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'כניסה'}
          </Button>
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </CardContent>
    </Card>
  );
}