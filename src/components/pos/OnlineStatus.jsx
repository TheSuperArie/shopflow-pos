import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { offlineManager } from '@/lib/offlineManager';
import { base44 } from '@/api/base44Client';

export default function OnlineStatus({ onSync }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Update pending count
    const updatePendingCount = () => {
      const pending = offlineManager.getPendingSales();
      setPendingCount(pending.length);
    };
    updatePendingCount();

    const interval = setInterval(updatePendingCount, 3000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const handleSync = async () => {
    if (!isOnline) {
      toast({
        title: '⚠️ אין חיבור לאינטרנט',
        description: 'לא ניתן לסנכרן ללא חיבור',
        duration: 3000,
      });
      return;
    }

    setIsSyncing(true);

    try {
      // 1. Push pending sales
      const pendingSales = offlineManager.getPendingSales();
      
      if (pendingSales.length > 0) {
        toast({
          title: '🔄 מסנכרן מכירות...',
          description: `מעלה ${pendingSales.length} מכירות`,
          duration: 2000,
        });

        for (const sale of pendingSales) {
          await base44.entities.Sale.create(sale);
          
          // Update stock for each item
          for (const item of sale.items) {
            if (item.variant_id) {
              const variant = await base44.entities.ProductVariant.list();
              const current = variant.find(v => v.id === item.variant_id);
              if (current) {
                await base44.entities.ProductVariant.update(item.variant_id, {
                  stock: Math.max(0, (current.stock || 0) - item.quantity),
                });
              }
            }
          }
        }

        offlineManager.clearPendingSales();
        setPendingCount(0);

        toast({
          title: '✅ מכירות סונכרנו בהצלחה',
          description: `${pendingSales.length} מכירות הועלו למערכת`,
          duration: 3000,
        });
      }

      // 2. Pull latest inventory data
      toast({
        title: '🔄 מעדכן מלאי...',
        description: 'מוריד נתונים עדכניים',
        duration: 2000,
      });

      const [categories, groups, variants] = await Promise.all([
        base44.entities.Category.list('sort_order'),
        base44.entities.ProductGroup.list(),
        base44.entities.ProductVariant.list(),
      ]);

      offlineManager.cacheInventoryData(categories, groups, variants);

      // Trigger parent refresh
      if (onSync) {
        onSync();
      }

      toast({
        title: '✅ סנכרון הושלם',
        description: 'כל הנתונים מעודכנים',
        duration: 3000,
      });
    } catch (error) {
      console.error('Sync error:', error);
      toast({
        title: '❌ שגיאה בסנכרון',
        description: 'נסה שוב מאוחר יותר',
        duration: 3000,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Status Indicator */}
      <div className="flex items-center gap-2">
        {isOnline ? (
          <div className="flex items-center gap-2 text-green-600">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <Wifi className="w-4 h-4" />
            <span className="text-xs font-medium hidden sm:inline">מחובר</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-red-600">
            <div className="w-2 h-2 bg-red-500 rounded-full" />
            <WifiOff className="w-4 h-4" />
            <span className="text-xs font-medium hidden sm:inline">לא מחובר</span>
          </div>
        )}
      </div>

      {/* Pending Sales Badge */}
      {pendingCount > 0 && (
        <Badge className="bg-orange-500 text-white">
          {pendingCount} ממתין
        </Badge>
      )}

      {/* Sync Button */}
      <Button
        onClick={handleSync}
        disabled={isSyncing || !isOnline}
        size="sm"
        variant="outline"
        className="gap-2"
      >
        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
        <span className="hidden sm:inline">סנכרן</span>
      </Button>
    </div>
  );
}