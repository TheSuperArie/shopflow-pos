import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { offlineManager } from '@/components/pos/offlineManager';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { format } from 'date-fns';

export default function OfflineSyncStatus() {
  const { syncStatus, failedCount, retryFailedSync } = useOfflineSync();
  const [showFailedDialog, setShowFailedDialog] = useState(false);
  const [failedSales, setFailedSales] = useState([]);

  useEffect(() => {
    if (failedCount > 0) {
      offlineManager.getFailedSyncs().then(setFailedSales);
    }
  }, [failedCount]);

  if (syncStatus === 'idle' && failedCount === 0) {
    return null;
  }

  return (
    <>
      {/* Status Bar */}
      <div className={`fixed top-16 right-4 z-50 p-3 rounded-lg shadow-lg flex items-center gap-2 ${
        syncStatus === 'syncing'
          ? 'bg-blue-50 text-blue-800 border border-blue-200'
          : syncStatus === 'error' || failedCount > 0
            ? 'bg-red-50 text-red-800 border border-red-200'
            : 'bg-green-50 text-green-800 border border-green-200'
      }`}>
        {syncStatus === 'syncing' && (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">סנכרון בעיצומו...</span>
          </>
        )}
        
        {failedCount > 0 && (
          <>
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-medium">{failedCount} מכירות לא עברו סנכרון</span>
            <button
              onClick={() => setShowFailedDialog(true)}
              className="ml-2 px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              עריכה
            </button>
          </>
        )}

        {syncStatus === 'idle' && failedCount === 0 && (
          <>
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm font-medium">הכל מסונכרן!</span>
          </>
        )}
      </div>

      {/* Failed Syncs Dialog */}
      <Dialog open={showFailedDialog} onOpenChange={setShowFailedDialog}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              מכירות שלא עברו סנכרון ({failedCount})
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {failedSales.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p>אין מכירות שנכשלו בסנכרון</p>
              </div>
            ) : (
              failedSales.map(sale => (
                <Card key={sale.offline_id} className="border-red-200 bg-red-50">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">
                          מכירה: ₪{sale.total.toLocaleString('he-IL', { maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          {format(new Date(sale.queued_at), 'dd/MM/yyyy HH:mm:ss')}
                        </p>
                        <p className="text-sm text-red-700 mt-2">
                          <strong>שגיאה:</strong> {sale.error_message}
                        </p>
                      </div>
                      <Badge variant="destructive">{sale.payment_method}</Badge>
                    </div>

                    {/* Items */}
                    <div className="mb-3 p-2 bg-white rounded text-xs max-h-32 overflow-y-auto">
                      {sale.items?.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-gray-700 py-1">
                          <span>{item.product_name}</span>
                          <span>{item.quantity}x ₪{item.sell_price}</span>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          retryFailedSync(sale.offline_id);
                          setFailedSales(prev => prev.filter(s => s.offline_id !== sale.offline_id));
                        }}
                        className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
                      >
                        נסה שנית
                      </button>
                      <button
                        onClick={() => {
                          offlineManager.clearFailedSync(sale.offline_id);
                          setFailedSales(prev => prev.filter(s => s.offline_id !== sale.offline_id));
                        }}
                        className="px-3 py-1.5 bg-gray-300 text-gray-700 text-xs rounded-lg hover:bg-gray-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFailedDialog(false)}>
              סגור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}