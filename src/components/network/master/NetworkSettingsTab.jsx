import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Crown, Save, Loader2, Settings } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import LegacyDataMigration from './LegacyDataMigration';

export default function NetworkSettingsTab({ tenantEmail }) {
  const [networkPassword, setNetworkPassword] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['app-settings', tenantEmail],
    queryFn: () => base44.entities.AppSettings.filter({ created_by: tenantEmail }),
    enabled: !!tenantEmail,
  });

  useEffect(() => {
    if (settings[0]) {
      setNetworkPassword(settings[0].network_admin_password || '');
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      if (settings[0]) {
        return base44.entities.AppSettings.update(settings[0].id, data);
      } else {
        return base44.entities.AppSettings.create({ ...data, created_by: tenantEmail });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      toast({ title: 'הגדרות הרשת נשמרו בהצלחה', duration: 3000 });
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
    <div className="space-y-6 max-w-lg" dir="rtl">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">הגדרות רשת</h1>
          <p className="text-sm text-gray-500">הגדרות הנגישות רק לבעל הרשת</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Crown className="w-5 h-5 text-amber-500" /> קוד מאסטר לבעל הרשת
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>קוד גישה מאסטר</Label>
            <Input
              type="text"
              value={networkPassword}
              onChange={e => setNetworkPassword(e.target.value)}
              placeholder="הכנס קוד מאסטר חדש"
              className="mt-1"
            />
            <p className="text-xs text-gray-400 mt-1">
              קוד זה מעניק גישה מלאה לניהול הרשת מכל סניף. ברירת מחדל זמנית: 8888
            </p>
          </div>
          <Button
            onClick={() => mutation.mutate({ network_admin_password: networkPassword || null })}
            className="bg-amber-500 hover:bg-amber-600 gap-2"
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><Save className="w-4 h-4" /> שמור קוד מאסטר</>
            }
          </Button>
        </CardContent>
      </Card>

      <LegacyDataMigration tenantEmail={tenantEmail} />
    </div>
  );
}