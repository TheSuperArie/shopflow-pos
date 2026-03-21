import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { offlineManager } from './offlineManager';
import { base44 } from '@/api/base44Client';
import SyncModal from './SyncModal';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export default function OnlineStatus({ onModeChange, onSync }) {
  const [networkOnline, setNetworkOnline] = useState(navigator.onLine);
  const [offlineMode, setOfflineMode] = useState(() => offlineManager.isOfflineMode());
  const [pendingCount, setPendingCount] = useState(0);
  const [modalMode, setModalMode] = useState(null); // 'go-offline' | 'go-online' | null
  const { toast } = useToast();
  const user = useCurrentUser();

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

  // Refresh pending count
  useEffect(() => {
    const refresh = async () => {
      const pending = await offlineManager.getPendingSales();
      setPendingCount(pending.length);
    };
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, []);

  const isEffectivelyOffline = offlineMode || !networkOnline;

  // ── Go Offline handlers ────────────────────────────────────────
  const cacheInventory = async () => {
    if (!user?.email) throw new Error('לא מחובר');
    const [categories, groups, variants] = await Promise.all([
      base44.entities.Category.filter({ created_by: user.email }, 'sort_order'),
      base44.entities.ProductGroup.filter({ created_by: user.email }),
      base44.entities.ProductVariant.filter({ created_by: user.email }),
    ]);
    await offlineManager.cacheInventory(categories, groups, variants);
    toast({ title: `✅ מלאי נשמר מקומית (${variants.length} וריאציות)`, duration: 2500 });
  };

  const switchToOffline = async () => {
    offlineManager.setOfflineMode(true);
    setOfflineMode(true);
    onModeChange?.(true);
    toast({ title: '📴 מצב לא מקוון הופעל', description: 'המכירות יישמרו מקומית', duration: 3000 });
  };

  // ── Go Online handlers ─────────────────────────────────────────
  const syncSalesToServer = async () => {
    const pending = await offlineManager.getPendingSales();
    if (pending.length === 0) return;

    toast({ title: `🔄 מסנכרן ${pending.length} מכירות...`, duration: 2000 });
    offlineManager.setGlobalSyncLock(true);
    offlineManager.setSyncInProgress(true);

    try {
      // Fetch live variants once
      const liveVariants = user?.email
        ? await base44.entities.ProductVariant.filter({ created_by: user.email })
        : await base44.entities.ProductVariant.list();

      for (const sale of pending) {
        const { offline_id, queued_at, status, ...saleData } = sale;
        await base44.entities.Sale.create({ ...saleData, created_date: queued_at });

        for (const item of sale.items || []) {
          if (!item.variant_id) continue;
          const lv = liveVariants.find(v => v.id === item.variant_id);
          if (lv) {
            const newStock = Math.max(0, (lv.stock || 0) - item.quantity);
            await base44.entities.ProductVariant.update(item.variant_id, { stock: newStock });
            lv.stock = newStock; // update local ref for subsequent items in same loop
          }
        }
        await offlineManager.markSaleAsSynced(sale.offline_id);
      }

      setPendingCount(0);
      toast({ title: `✅ ${pending.length} מכירות סונכרנו בהצלחה`, duration: 3000 });
    } finally {
      offlineManager.setSyncInProgress(false);
      offlineManager.setGlobalSyncLock(false);
    }
  };

  const switchToOnline = async () => {
    // Refresh inventory cache from server
    const [categories, groups, variants] = await Promise.all([
      user?.email ? base44.entities.Category.filter({ created_by: user.email }, 'sort_order') : base44.entities.Category.list('sort_order'),
      user?.email ? base44.entities.ProductGroup.filter({ created_by: user.email }) : base44.entities.ProductGroup.list(),
      user?.email ? base44.entities.ProductVariant.filter({ created_by: user.email }) : base44.entities.ProductVariant.list(),
    ]);
    await offlineManager.cacheInventory(categories, groups, variants);

    offlineManager.setOfflineMode(false);
    setOfflineMode(false);
    onModeChange?.(false);
    onSync?.();
    toast({ title: '🌐 חזרת למצב מקוון', description: 'המלאי עודכן מהשרת', duration: 3000 });
  };

  const handleToggleClick = () => {
    if (isEffectivelyOffline && offlineMode) {
      // Currently offline (manually) → open go-online modal
      setModalMode('go-online');
    } else if (!isEffectivelyOffline) {
      // Currently online → open go-offline modal
      setModalMode('go-offline');
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {pendingCount > 0 && (
          <Badge className="bg-orange-500 text-white text-xs px-2 py-0.5">
            {pendingCount} ממתין
          </Badge>
        )}

        <button
          onClick={handleToggleClick}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border-2 ${
            isEffectivelyOffline
              ? 'bg-red-50 border-red-300 text-red-700'
              : 'bg-green-50 border-green-300 text-green-700'
          }`}
          title={offlineMode ? 'לחץ לעבור למצב מקוון' : 'לחץ לעבור למצב לא מקוון'}
        >
          {isEffectivelyOffline
            ? <><WifiOff className="w-3.5 h-3.5" /> לא מקוון</>
            : <><Wifi className="w-3.5 h-3.5" /> מחובר</>
          }
        </button>
      </div>

      {modalMode === 'go-offline' && (
        <SyncModal
          mode="go-offline"
          pendingCount={pendingCount}
          onClose={() => setModalMode(null)}
          onGoOffline={{ cacheInventory, switchMode: switchToOffline }}
          onGoOnline={null}
        />
      )}

      {modalMode === 'go-online' && (
        <SyncModal
          mode="go-online"
          pendingCount={pendingCount}
          onClose={() => setModalMode(null)}
          onGoOffline={null}
          onGoOnline={{ syncSales: syncSalesToServer, switchMode: switchToOnline }}
        />
      )}
    </>
  );
}