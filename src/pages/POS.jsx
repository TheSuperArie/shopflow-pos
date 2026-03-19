import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, ShoppingCart, RotateCcw, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import ProductGrid from '@/components/pos/ProductGrid';
import Cart from '@/components/pos/Cart';
import DynamicVariantSelector from '@/components/pos/DynamicVariantSelector';
import CheckoutModal from '@/components/pos/CheckoutModal';
import SmartSearch from '@/components/pos/SmartSearch';
import ReceiptModal from '@/components/pos/ReceiptModal';
import OnlineStatus from '@/components/pos/OnlineStatus';
import OfflineSyncStatus from '@/components/pos/OfflineSyncStatus';
import { offlineManager } from '@/components/pos/offlineManager';
import ReturnFormModal from '@/components/returns/ReturnFormModal';
import StaffPortal from '@/components/pos/StaffPortal';
import { useInventorySync } from '@/hooks/useInventorySync';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export default function POS() {
  // ── All hooks declared unconditionally at top level ──────────────
  const [selectedCategory, setSelectedCategory] = useState(null); // top-level category id
  const [selectedSubCategory, setSelectedSubCategory] = useState(null); // sub-category id or null
  const [cartItems, setCartItems] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [showStaffPortal, setShowStaffPortal] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(() => offlineManager.isOfflineMode());

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = useCurrentUser();

  useInventorySync();
  const { syncToServer, syncStatus, failedCount, processedCount, retryFailedSync } = useOfflineSync();

  // ── Derived values (not hooks) ───────────────────────────────────
  const isEffectivelyOffline = isOfflineMode || !navigator.onLine;

  // ── Effects ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleOnline = async () => {
      console.log('[POS] Connection restored, initiating manual sync...');
      await syncToServer();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncToServer]);

  // ── Query functions ───────────────────────────────────────────────
  // Simple rule: if online → fetch from server; if offline or sync locked → use cache
  const fetchOrCache = useCallback(async (apiCall, cacheKey) => {
    const locked = offlineManager.isGlobalSyncLocked() || offlineManager.isSyncInProgress();

    if (locked || isEffectivelyOffline || !navigator.onLine) {
      const cached = await offlineManager.getCachedInventory();
      return cached[cacheKey] || [];
    }

    try {
      const result = await apiCall();
      return result;
    } catch {
      const cached = await offlineManager.getCachedInventory();
      return cached[cacheKey] || [];
    }
  }, [isEffectivelyOffline]);

  const queryEnabled = !!user && !offlineManager.isGlobalSyncLocked() && !offlineManager.isSyncInProgress();

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', isOfflineMode, user?.email],
    queryFn: () => fetchOrCache(
      () => base44.entities.Category.filter({ created_by: user.email }, 'sort_order'),
      'categories'
    ),
    staleTime: isEffectivelyOffline ? Infinity : 30000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!user,
  });

  const { data: allGroups = [] } = useQuery({
    queryKey: ['product-groups', isOfflineMode, user?.email],
    queryFn: () => fetchOrCache(
      () => base44.entities.ProductGroup.filter({ created_by: user.email }),
      'groups'
    ),
    staleTime: isEffectivelyOffline ? Infinity : 30000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!user,
  });

  const { data: allVariants = [] } = useQuery({
    queryKey: ['product-variants', isOfflineMode, user?.email],
    queryFn: () => fetchOrCache(
      () => base44.entities.ProductVariant.filter({ created_by: user.email }),
      'variants'
    ),
    staleTime: isEffectivelyOffline ? Infinity : 30000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!user,
  });

  // When online data arrives, ALWAYS overwrite the cache with fresh server data (no merge)
  useEffect(() => {
    if (
      !isEffectivelyOffline &&
      !offlineManager.isSyncInProgress() &&
      categories.length > 0 &&
      allVariants.length > 0
    ) {
      // Overwrite cache entirely with fresh server data — prevents stale/duplicate entries
      offlineManager.cacheInventory(categories, allGroups, allVariants);
    }
  }, [categories, allGroups, allVariants, isEffectivelyOffline]);

  // ── Derived data (not hooks) ─────────────────────────────────────
  // Sub-categories of the selected main category
  const subCategories = selectedCategory
    ? categories.filter(c => c.parent_id === selectedCategory)
    : [];

  // Active category for products: sub-category if selected, else main category
  const activeProductCategoryId = selectedSubCategory || (subCategories.length === 0 ? selectedCategory : null);

  const groups = activeProductCategoryId
    ? allGroups.filter(g => g.category_id === activeProductCategoryId)
    : [];

  // ── Handlers ────────────────────────────────────────────────────
  const handleModeChange = (offline) => {
    setIsOfflineMode(offline);
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['product-groups'] });
    queryClient.invalidateQueries({ queryKey: ['product-variants'] });
  };

  const handleSync = () => {
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['product-groups'] });
    queryClient.invalidateQueries({ queryKey: ['product-variants'] });
  };

  const saleMutation = useMutation({
    mutationFn: async ({ paymentMethod, cashDetails }) => {
      const totalCost = cartItems.reduce((s, i) => s + (i.cost_price || 0) * i.quantity, 0);
      const total = cartItems.reduce((s, i) => s + i.sell_price * i.quantity, 0);

      const saleData = {
        items: cartItems,
        total,
        total_cost: totalCost,
        payment_method: paymentMethod,
        cash_received: cashDetails?.received,
        cash_change: cashDetails?.change,
        seller_email: user?.email,
        seller_name: user?.full_name,
        created_date: new Date().toISOString(),
      };

      if (isEffectivelyOffline) {
        await offlineManager.addPendingSale(saleData);
        const updatedVariants = await offlineManager.deductLocalStock(cartItems);
        queryClient.setQueryData(['product-variants', isOfflineMode, user?.email], updatedVariants);
        return { ...saleData, id: 'offline_' + Date.now() };
      } else {
        const sale = await base44.entities.Sale.create(saleData);
        for (const item of cartItems) {
          if (!item.variant_id) continue;
          const variant = allVariants.find(v => v.id === item.variant_id);
          if (variant) {
            await base44.entities.ProductVariant.update(variant.id, {
              stock: Math.max(0, (variant.stock || 0) - item.quantity),
            });
          }
        }
        return sale;
      }
    },
    onSuccess: (sale) => {
      if (!isEffectivelyOffline) {
        queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      }
      setLastSale(sale);
      setCartItems([]);
      setShowCheckout(false);
      setShowCart(false);
      setShowReceipt(true);
      if (isEffectivelyOffline) {
        toast({ title: '✅ המכירה נשמרה מקומית (אופליין)', description: 'תסונכרן כשיחזור החיבור', duration: 3000 });
      } else {
        toast({ title: '✅ המכירה הושלמה!' });
      }
    },
  });

  const addToCart = (variant, group) => {
    const liveVariant = allVariants.find(v => v.id === variant.id);
    if ((liveVariant?.stock || 0) <= 0) {
      toast({ title: '⛔ אין מלאי', description: 'הפריט אזל מהמלאי', duration: 2000 });
      return;
    }

    const sellPrice = group.has_uniform_price ? group.uniform_sell_price : variant.sell_price;
    const costPrice = group.has_uniform_price ? group.uniform_cost_price : variant.cost_price;
    const dimText = variant.dimensions && Object.keys(variant.dimensions).length > 0
      ? Object.values(variant.dimensions).join(' / ')
      : '';

    setCartItems(prev => [...prev, {
      variant_id: variant.id,
      product_name: dimText ? `${group.name} - ${dimText}` : group.name,
      quantity: 1,
      sell_price: sellPrice,
      cost_price: costPrice || 0,
      variant_stock: liveVariant?.stock || 0,
    }]);

    toast({ title: '✅ נוסף לעגלה', description: dimText ? `${group.name} - ${dimText}` : group.name, duration: 1200 });
    setSelectedCategory(null);
  };

  const handleGroupSelect = (group) => {
    const groupVariants = allVariants.filter(v => v.group_id === group.id);
    const isSimple = !group.enabled_dimensions || group.enabled_dimensions.length === 0;
    if (isSimple && groupVariants.length === 1) {
      addToCart(groupVariants[0], group);
      setSelectedGroup(null);
    } else {
      setSelectedGroup(group);
    }
  };

  const handleVariantConfirm = (variant, group) => { addToCart(variant, group); setSelectedGroup(null); };
  const handleBarcodeSelect = (variant, group) => { addToCart(variant, group); setSelectedGroup(null); };

  const updateCartQty = (idx, newQty) => {
    if (newQty <= 0) {
      setCartItems(prev => prev.filter((_, i) => i !== idx));
    } else {
      setCartItems(prev => prev.map((item, i) => i === idx ? { ...item, quantity: newQty } : item));
    }
  };

  const removeCartItem = (idx) => setCartItems(prev => prev.filter((_, i) => i !== idx));
  const cartTotal = cartItems.reduce((s, i) => s + i.sell_price * i.quantity, 0);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="h-screen flex flex-col bg-gray-50">
      <OfflineSyncStatus syncStatus={syncStatus} failedCount={failedCount} processedCount={processedCount} retryFailedSync={retryFailedSync} />
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <h1 className="text-xl font-bold text-gray-800">🛍️ קופה</h1>
        <div className="flex items-center gap-3">
          <OnlineStatus onModeChange={handleModeChange} onSync={handleSync} />
          <button onClick={() => setShowStaffPortal(true)}
            className="p-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors" title="פורטל עובדים">
            <Users className="w-5 h-5" />
          </button>
          <button onClick={() => setShowReturnForm(true)}
            className="p-2 rounded-xl bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors" title="החזרת מוצר">
            <RotateCcw className="w-5 h-5" />
          </button>
          <button onClick={() => setShowCart(!showCart)}
            className="lg:hidden relative p-2 rounded-xl bg-amber-50 text-amber-600">
            <ShoppingCart className="w-6 h-6" />
            {cartItems.length > 0 && (
              <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
                {cartItems.length}
              </span>
            )}
          </button>
          <Link to="/AdminLogin" className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
            <Settings className="w-5 h-5" />
          </Link>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <SmartSearch
            groups={allGroups}
            variants={allVariants}
            categories={categories}
            onSelectGroup={handleGroupSelect}
            onSelectVariant={handleBarcodeSelect}
          />

          {!selectedCategory ? (
            <>
              <h2 className="text-lg font-bold text-gray-700">קטגוריות</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {/* Deduplicate by ID, hide categories with no groups that have stock */}
                {Array.from(new Map(categories.map(c => [c.id, c])).values())
                  .filter(category => {
                    const catGroups = allGroups.filter(g => g.category_id === category.id);
                    return catGroups.some(group =>
                      allVariants.some(v => v.group_id === group.id && (v.stock || 0) > 0)
                    );
                  })
                  .map(category => {
                    const catGroups = allGroups.filter(g => g.category_id === category.id);
                    return (
                      <button key={category.id} onClick={() => setSelectedCategory(category.id)}
                        className="bg-white rounded-xl p-6 shadow-sm border-2 border-gray-200 hover:border-amber-500 hover:shadow-md transition-all text-center min-h-[140px]">
                        <div className="text-4xl mb-2">📦</div>
                        <h3 className="text-lg font-bold text-gray-800">{category.name}</h3>
                        <p className="text-sm text-gray-500 mt-1">{catGroups.length} מוצרים</p>
                      </button>
                    );
                  })}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <button onClick={() => setSelectedCategory(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium flex items-center gap-2">
                  ← חזור לקטגוריות
                </button>
                <h2 className="text-lg font-bold text-amber-600">
                  {categories.find(c => c.id === selectedCategory)?.name}
                </h2>
              </div>
              <ProductGrid groups={groups} variants={allVariants} onSelect={handleGroupSelect} />
            </>
          )}
        </div>

        <div className="hidden lg:flex w-[380px] border-r border-gray-200 bg-gray-50 p-4 flex-col">
          <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" /> עגלת קניות
          </h2>
          <Cart items={cartItems} onUpdateQty={updateCartQty} onRemove={removeCartItem} onCheckout={() => setShowCheckout(true)} />
        </div>

        {showCart && (
          <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setShowCart(false)}>
            <div className="absolute left-0 top-0 bottom-0 w-[85%] max-w-[400px] bg-white p-4 shadow-xl flex flex-col"
              onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" /> עגלת קניות
              </h2>
              <Cart items={cartItems} onUpdateQty={updateCartQty} onRemove={removeCartItem} onCheckout={() => setShowCheckout(true)} />
            </div>
          </div>
        )}
      </div>

      <DynamicVariantSelector
        open={!!selectedGroup}
        group={selectedGroup}
        variants={allVariants.filter(v => v.group_id === selectedGroup?.id)}
        allVariants={allVariants}
        onConfirm={handleVariantConfirm}
        onClose={() => setSelectedGroup(null)}
      />

      <CheckoutModal
        open={showCheckout}
        total={cartTotal}
        onConfirm={(method, cashDetails) => saleMutation.mutate({ paymentMethod: method, cashDetails })}
        onClose={() => setShowCheckout(false)}
        isProcessing={saleMutation.isPending}
      />

      <ReceiptModal
        open={showReceipt}
        sale={lastSale}
        onClose={() => { setShowReceipt(false); setLastSale(null); }}
      />

      <ReturnFormModal open={showReturnForm} onClose={() => setShowReturnForm(false)} />
      <StaffPortal open={showStaffPortal} onClose={() => setShowStaffPortal(false)} />
    </div>
  );
}