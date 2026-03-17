import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { offlineManager } from './offlineManager';
import { base44 } from '@/api/base44Client';

export default function OnlineStatus({ onModeChange, onSync }) {
  const [networkOnline, setNetworkOnline] = useState(navigator.onLine);
  const [offlineMode, setOfflineMode] = useState(() => offlineManager.isOfflineMode());
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(() => offlineManager.getPendingSales().length);
  const { toast } = useToast();

  // Track real network status
  useEffect(() => {
    const onOnline = () => setNetworkOnline(true);
    const onOffline = () => setNetworkOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Refresh pending count periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setPendingCount(offlineManager.getPendingSales().length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (networkOnline && !offlineMode && offlineManager.getPendingSales().length > 0) {
      handleSync();
    }
  }, [networkOnline, offlineMode]);

  const toggleOfflineMode = () => {
    const next = !offlineMode;
    offlineManager.setOfflineMode(next);
    setOfflineMode(next);
    onModeChange?.(next);

    if (!next && networkOnline) {
      // Switched back to online — sync
      handleSync();
    } else if (next) {
      toast({ title: '📴 מצב לא מקוון הופעל', description: 'המכירות יישמרו מקומית', duration: 3000 });
    }
  };

  const handleSync = useCallback(async () => {
    if (!networkOnline) {
      toast({ title: '⚠️ אין חיבור לאינטרנט', duration: 2000 });
      return;
    }
    setIsSyncing(true);
    try {
      const pending = offlineManager.getPendingSales();

      if (pending.length > 0) {
        toast({ title: `🔄 מסנכרן ${pending.length} מכירות...`, duration: 2000 });

        // Fetch current variants once for stock updates
        const liveVariants = await base44.entities.ProductVariant.list();

        for (const sale of pending) {
          const { offline_id, queued_at, ...saleData } = sale;
          await base44.entities.Sale.create({ ...saleData, created_date: queued_at });

          for (const item of sale.items || []) {
            if (!item.variant_id) continue;
            const current = liveVariants.find(v => v.id === item.variant_id);
            if (current) {
              await base44.entities.ProductVariant.update(item.variant_id, {
                stock: Math.max(0, (current.stock || 0) - item.quantity),
              });
              // Update local reference so next item uses fresh count
              current.stock = Math.max(0, (current.stock || 0) - item.quantity);
            }
          }
        }

        offlineManager.clearPendingSales();
        setPendingCount(0);
        toast({ title: `✅ ${pending.length} מכירות סונכרנו`, duration: 3000 });
      }

      // Refresh cache
      const [categories, groups, variants] = await Promise.all([
        base44.entities.Category.list('sort_order'),
        base44.entities.ProductGroup.list(),
        base44.entities.ProductVariant.list(),
      ]);
      offlineManager.cacheInventory(categories, groups, variants);
      onSync?.();
    } catch (err) {
      toast({ title: '❌ שגיאה בסנכרון', description: err.message, duration: 3000 });
    } finally {
      setIsSyncing(false);
    }
  }, [networkOnline, toast, onSync]);

  const isEffectivelyOffline = offlineMode || !networkOnline;

  return (
    <div className="flex items-center gap-2">
      {/* Pending badge */}
      {pendingCount > 0 && (
        <Badge className="bg-orange-500 text-white text-xs px-2 py-0.5">
          {pendingCount} ממתין
        </Badge>
      )}

      {/* Sync button — show only when online and has pending */}
      {!isEffectivelyOffline && pendingCount > 0 && (
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
          title="סנכרן עכשיו"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
        </button>
      )}

      {/* Manual toggle */}
      <button
        onClick={toggleOfflineMode}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border-2 ${
          isEffectivelyOffline
            ? 'bg-red-50 border-red-300 text-red-700'
            : 'bg-green-50 border-green-300 text-green-700'
        }`}
        title={offlineMode ? 'לחץ לעבור למצב מקוון' : 'לחץ לעבור למצב לא מקוון'}
      >
        {isEffectivelyOffline ? (
          <><WifiOff className="w-3.5 h-3.5" /> לא מקוון</>
        ) : (
          <><Wifi className="w-3.5 h-3.5" /> מחובר</>
        )}
        {offlineMode
          ? <ToggleLeft className="w-4 h-4 mr-1" />
          : <ToggleRight className="w-4 h-4 mr-1" />
        }
      </button>
    </div>
  );
}