import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { KeyRound, Loader2 } from 'lucide-react';
import { DEV_CODE_SESSION_KEY } from '@/lib/developerAccess';

/** Changes the global developer code — available only inside the developer page. */
export default function DeveloperCodeCard({ code }) {
  const [newCode, setNewCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const save = async () => {
    setIsSaving(true);
    try {
      const res = await base44.functions.invoke('developerPortal', {
        action: 'setCode',
        code,
        new_code: newCode.trim(),
      });
      if (res.data?.ok) {
        sessionStorage.setItem(DEV_CODE_SESSION_KEY, res.data.dev_code);
        setNewCode('');
        toast({ title: '✅ קוד המפתח עודכן', duration: 3000 });
      }
    } catch (error) {
      toast({
        title: '❌ עדכון הקוד נכשל',
        description: error?.response?.data?.error || error?.message || 'נסה שוב',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="w-4 h-4" /> שינוי קוד המפתח
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Label>קוד חדש (גלובלי לכל האתר)</Label>
        <div className="flex gap-2 mt-1">
          <Input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="לפחות 4 תווים" />
          <Button onClick={save} disabled={newCode.trim().length < 4 || isSaving} variant="outline">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}