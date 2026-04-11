import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Lock, Save } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import DangerZone from '@/components/admin/DangerZone';

export default function AdminSettings() {
  const [password, setPassword] = useState('');
  const [storeName, setStoreName] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = useCurrentUser();


  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['app-settings', user?.email],
    queryFn: () => user ? base44.entities.AppSettings.filter({ created_by: user.email }) : [],
    enabled: !!user,
  });

  useEffect(() => {
    if (settings[0]) {
      setPassword(settings[0].admin_password || '12345678');
      setStoreName(settings[0].store_name || 'החנות שלי');
      setLowStockThreshold(settings[0].low_stock_threshold || 5);
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      if (settings[0]) {
        return base44.entities.AppSettings.update(settings[0].id, data);
      } else {
        return base44.entities.AppSettings.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      toast({ title: 'ההגדרות נשמרו בהצלחה', duration: 3000 });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold text-gray-800">הגדרות</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="w-5 h-5" /> אבטחה
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>שם החנות</Label>
            <Input value={storeName} onChange={e => setStoreName(e.target.value)} />
          </div>
          <div>
            <Label>סיסמת מנהל</Label>
            <Input type="text" value={password} onChange={e => setPassword(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">סיסמה זו נדרשת לכניסה לפאנל הניהול</p>
          </div>
          <div>
            <Label>סף מלאי נמוך (יחידות)</Label>
            <Input 
              type="number" 
              value={lowStockThreshold} 
              onChange={e => setLowStockThreshold(Number(e.target.value))} 
              min="0"
            />
            <p className="text-xs text-gray-400 mt-1">מוצרים עם מלאי מתחת לסף זה יוצגו כמלאי חסר ויסומנו באדום</p>
          </div>
          <Button
            onClick={() => mutation.mutate({ 
              admin_password: password, 
              store_name: storeName,
              low_stock_threshold: lowStockThreshold 
            })}
            className="bg-amber-500 hover:bg-amber-600 gap-2"
            disabled={!password}
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> שמור הגדרות</>}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="w-5 h-5" /> סיסמת כניסה לאפליקציה
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">כדי להגדיר או לאפס את סיסמת הכניסה שלך (לשימוש ב-WebView / אפליקציה):</p>
          <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1 pr-2">
            <li>צא מהחשבון או פתח את דף הכניסה של האפליקציה</li>
            <li>לחץ על <strong>"Forgot password?"</strong></li>
            <li>הכנס את האימייל שלך — תקבל מייל לאיפוס סיסמה</li>
            <li>הגדר סיסמה חדשה ולאחר מכן כנס עם אימייל + סיסמה</li>
          </ol>
          <p className="text-xs text-gray-400">* זוהי הדרך הרשמית להגדיר סיסמה לכניסה דרך אימייל במערכת</p>
        </CardContent>
      </Card>
      <DangerZone user={user} />
    </div>
  );
}