import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { CreditCard, Loader2, Save, Info } from 'lucide-react';

/**
 * Nedarim Plus settings (credit card payments in the POS). Saved on the server (adminAuth →
 * AdminSecret); the key is never shown back. A branch with no settings of its own uses its network's.
 * network: true on the network dashboard (the text explains it applies to all branches).
 */
export default function NedarimSettingsCard({ network = false }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useQuery({
    queryKey: ['nedarim-status'],
    queryFn: async () => (await base44.functions.invoke('adminAuth', { action: 'nedarimStatus' })).data,
    staleTime: 60000,
    retry: false,
  });

  const [enabled, setEnabled] = useState(false);
  const [mosad, setMosad] = useState('');
  const [apiValid, setApiValid] = useState('');
  const [current, setCurrent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!status) return;
    setEnabled(!!status.own_enabled);
    setMosad(status.own_mosad || '');
  }, [status]);

  const save = async () => {
    if (enabled && !mosad.trim()) return toast({ title: 'צריך מספר מוסד', variant: 'destructive' });
    if (enabled && !apiValid.trim() && !status?.own_has_key) return toast({ title: 'צריך קוד ApiValid מנדרים', variant: 'destructive' });
    setSaving(true);
    try {
      await base44.functions.invoke('adminAuth', {
        action: 'setNedarim', current, enabled, mosad: mosad.trim(), api_valid: apiValid.trim(),
      });
      setApiValid(''); setCurrent('');
      queryClient.invalidateQueries({ queryKey: ['nedarim-status'] });
      queryClient.invalidateQueries({ queryKey: ['nedarim-config'] });
      toast({ title: 'הגדרות נדרים פלוס נשמרו', duration: 3000 });
    } catch (err) {
      toast({ title: 'לא נשמר', description: err?.data?.error || err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="w-5 h-5 text-blue-600" /> סליקת אשראי — נדרים פלוס
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : (
          <>
            <p className="text-xs text-gray-500">
              כשמופעל — תשלום באשראי בקופה נפתח בחלון המאובטח של נדרים פלוס עם הסכום ממולא, והמכירה נשמרת עם מספר האישור.
              {network
                ? ' ההגדרה כאן חלה על כל הסניפים ברשת (סניף שהגדיר אצלו בנפרד — משתמש בשלו).'
                : ' סניף ברשת שלא הגדיר כאן — משתמש בהגדרות של הרשת.'}
            </p>
            {!network && status?.source === 'network' && (
              <p className="flex items-center gap-1.5 text-xs text-sky-700 bg-sky-50 rounded-lg px-3 py-2">
                <Info className="w-3.5 h-3.5" /> כרגע הקופה משתמשת בהגדרות של הרשת (מוסד {status.mosad}).
              </p>
            )}
            <div className="flex items-center justify-between">
              <Label>הפעל סליקה דרך נדרים פלוס בקופה</Label>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <div>
              <Label>מספר מוסד</Label>
              <Input value={mosad} onChange={e => setMosad(e.target.value.replace(/\D/g, ''))} placeholder="למשל 7014477" inputMode="numeric" />
            </div>
            <div>
              <Label>קוד ApiValid (מהתמיכה של נדרים)</Label>
              <Input
                type="password"
                value={apiValid}
                onChange={e => setApiValid(e.target.value)}
                placeholder={status?.own_has_key ? 'שמור קוד — השאר ריק כדי לא לשנות' : 'הדבק כאן את הקוד'}
                autoComplete="off"
              />
            </div>
            <div>
              <Label>קוד מנהל (לאישור השמירה)</Label>
              <Input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="off" />
            </div>
            <Button onClick={save} disabled={saving || !current} className="bg-amber-500 hover:bg-amber-600 gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} שמור הגדרות סליקה
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
