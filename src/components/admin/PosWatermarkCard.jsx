import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';

/**
 * "לוגו ברקע הקופה" — an image shown faint (watermark) behind the POS products.
 * Saved on this store's AppSettings (pos_watermark_url); empty = no logo.
 */
export default function PosWatermarkCard({ settings }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const current = settings?.pos_watermark_url || '';

  const save = async (url) => {
    setBusy(true);
    try {
      if (settings?.id) await base44.entities.AppSettings.update(settings.id, { pos_watermark_url: url || null });
      else await base44.entities.AppSettings.create({ pos_watermark_url: url || null });
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      toast({ title: url ? 'הלוגו נשמר — יופיע ברקע הקופה' : 'הלוגו הוסר מהקופה' });
    } catch (e) {
      toast({ title: 'השמירה נכשלה', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'צריך לבחור קובץ תמונה', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await save(file_url);
    } catch (e) {
      toast({ title: 'העלאת התמונה נכשלה', description: e?.message, variant: 'destructive' });
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ImageIcon className="w-5 h-5" /> לוגו ברקע הקופה
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-600">הלוגו מוצג שקוף מאחורי המוצרים בקופה. מומלץ תמונה עם רקע לבן או שקוף.</p>
        <div className="flex items-center gap-4">
          <div className="w-28 h-28 rounded-xl border bg-[#F5EFE3] flex items-center justify-center overflow-hidden shrink-0">
            {current
              ? <img src={current} alt="" className="max-w-[85%] max-h-[85%] object-contain opacity-60 mix-blend-multiply" />
              : <span className="text-xs text-gray-400">אין לוגו</span>}
          </div>
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => upload(e.target.files?.[0])} />
            <Button onClick={() => fileRef.current?.click()} disabled={busy} variant="outline" className="gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {current ? 'החלף לוגו' : 'העלה לוגו'}
            </Button>
            {current && (
              <Button onClick={() => save('')} disabled={busy} variant="ghost" className="gap-2 text-red-600 hover:text-red-700">
                <Trash2 className="w-4 h-4" /> הסר
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
