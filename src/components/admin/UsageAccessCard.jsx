import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Activity, KeyRound } from 'lucide-react';

/** Code entry that opens the usage analytics page. The code lives in AppSettings. */
export default function UsageAccessCard({ accessCode = '0963', onSaveCode, isSaving }) {
  const [code, setCode] = useState('');
  const [newCode, setNewCode] = useState(accessCode);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const submit = () => {
    if (code.trim() === String(accessCode)) {
      setError('');
      navigate('/UsageAnalytics');
    } else {
      setError('קוד שגוי');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="w-5 h-5" /> נתוני שימוש באתר
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>קוד גישה</Label>
          <div className="flex gap-2 mt-1">
            <Input
              type="password"
              value={code}
              onChange={e => { setCode(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="הקש קוד"
            />
            <Button onClick={submit} className="bg-amber-500 hover:bg-amber-600">כניסה</Button>
          </div>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>

        <div className="border-t pt-4">
          <Label className="flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> שינוי קוד הגישה
          </Label>
          <div className="flex gap-2 mt-1">
            <Input value={newCode} onChange={e => setNewCode(e.target.value)} />
            <Button variant="outline" disabled={!newCode || isSaving} onClick={() => onSaveCode(newCode)}>
              שמור
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}