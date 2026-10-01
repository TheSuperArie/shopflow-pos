import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { stockOps } from '@/lib/warehouseStock';

/** Shown when finishing a picking saved the order but the warehouse stock update didn't complete. */
export default function PendingStockBanner({ order }) {
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  if (order.stock_status !== 'PENDING') return null;

  const complete = async () => {
    setBusy(true);
    try {
      await stockOps('pickComplete', { order_id: order.id });
      toast({ title: 'מלאי המחסן עודכן' });
    } catch (e) {
      toast({ title: 'העדכון נכשל — נסו שוב', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
      queryClient.invalidateQueries({ queryKey: ['supply-orders-warehouse'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-reservations'] });
    }
  };

  return (
    <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 flex flex-wrap items-center gap-3">
      <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
      <p className="flex-1 min-w-[200px] text-red-800 font-medium">ממתין לעדכון מלאי — ההזמנה נשמרה אבל מלאי המחסן עוד לא עודכן עד הסוף.</p>
      <Button onClick={complete} disabled={busy} className="h-12 gap-2 bg-red-600 hover:bg-red-700">
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />} השלם עדכון מלאי
      </Button>
    </div>
  );
}