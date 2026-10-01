import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, ShoppingCart, RotateCcw, Users, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import ProductGrid from '@/components/pos/ProductGrid';
import Cart from '@/components/pos/Cart';
import DynamicVariantSelector from '@/components/pos/DynamicVariantSelector';
import CheckoutModal from '@/components/pos/CheckoutModal';
import SmartSearch from '@/components/pos/SmartSearch';
import ReceiptModal from '@/components/pos/ReceiptModal';
import { offlineManager } from '@/components/pos/offlineManager';
import ReturnFormModal from '@/components/returns/ReturnFormModal';
import StaffPortal from '@/components/pos/StaffPortal';
import BranchInvitationBanner from '@/components/dashboard/BranchInvitationBanner';
import CatalogShareBanner from '@/components/dashboard/CatalogShareBanner';
import { useInventorySync } from '@/hooks/useInventorySync';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useGlobalBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { fetchPosCatalogRecords } from '@/lib/branchCatalog';
import { usePosBranch } from '@/hooks/usePosCatalog';

// Offline selling is disabled: a sale is recorded ONLY when it reaches the server.
// (The offline code in offlineManager / OnlineStatus / useOfflineSync is kept but no longer wired in.)
const NO_INTERNET = 'NO_INTERNET';
const newClientSaleId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

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
  // Offline mode is off for good — a device that had it switched on is reset on load (see effect below)
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine);
  // Sales left on this device by the old offline mode, waiting to be sent to the server
  const [unsentSales, setUnsentSales] = useState([]);
  const [sendingUnsent, setSendingUnsent] = useState(false);
  // Id of the sale currently being checked out — kept across retries of the same cart,
  // so a retry after an unclear failure never records the sale twice
  const pendingSaleIdRef = useRef(null);
  // Out-of-stock warning popup: { title, description, onConfirm } — the seller can still sell after confirming
  const [stockConfirm, setStockConfirm] = useState(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = useCurrentUser();

  // Resolve the branch for this device so every sale gets stamped with branch_id.
  // If this account was approved as a branch station in a network — that branch takes precedence,
  // so every sale made here is attributed to the network branch the master sees.
  const { activeBranch } = usePosBranch();

  // Pending network invitations addressed to this account (station_email = this email)
  const { data: pendingInvitations = [] } = useQuery({
    queryKey: ['pending-invitations', user?.email],
    // Only offers already approved by the system (developer) reach the branch owner
    queryFn: async () => {
      const list = await base44.entities.Branch.filter({ station_email: user.email, status: 'PENDING' });
      return list.filter(b => b.system_approval !== 'PENDING_SYSTEM' && b.system_approval !== 'REJECTED');
    },
    enabled: !!user?.email,
    staleTime: 60000,
    refetchOnWindowFocus: true,
  });

  // Live updates from the network master: when an invitation is canceled or the station
  // is disconnected, reflect it here immediately (banner disappears, branch linkage drops)
  useEffect(() => {
    if (!user?.email) return;
    // Debounced: a burst of branch changes collapses into one refetch instead of
    // two queries re-running on every connected station for every single change.
    let timer = null;
    const unsubscribe = base44.entities.Branch.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        queryClient.invalidateQueries({ queryKey: ['pending-invitations', user.email] });
        queryClient.invalidateQueries({ queryKey: ['pos-branches', user.email] });
      }, 3000);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [user?.email, queryClient]);

  const { data: appSettingsList = [] } = useQuery({
    queryKey: ['app-settings', user?.email],
    queryFn: () => base44.entities.AppSettings.filter({ created_by: user.email }),
    enabled: !!user?.email,
    staleTime: 60000,
  });
  const virtualFolders = appSettingsList[0]?.pos_virtual_folders || [];
  // "חסום מכירה של מוצר שאזל" (settings, field stock_mode_enabled): on → out-of-stock items can't be sold.
  // It only controls blocking — every sale always deducts from stock, so inventory/shortages stay accurate.
  const stockModeEnabled = appSettingsList[0]?.stock_mode_enabled !== false;

  useInventorySync();

  // ── Derived values (not hooks) ───────────────────────────────────
  const isEffectivelyOffline = isOfflineMode || !navigator.onLine;

  // ── Effects ──────────────────────────────────────────────────────
  // Clear leftovers of the old offline mode on this device
  useEffect(() => {
    offlineManager.setOfflineMode(false);
    offlineManager.setSyncInProgress(false);
    offlineManager.setGlobalSyncLock(false);
  }, []);

  // Live network indicator
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

  const refreshUnsentSales = useCallback(async () => {
    setUnsentSales(await offlineManager.getPendingSales());
  }, []);

  useEffect(() => {
    refreshUnsentSales();
    const timer = setInterval(refreshUnsentSales, 30000);
    return () => clearInterval(timer);
  }, [refreshUnsentSales]);

  // A changed cart is a new sale — it gets a new id on the next checkout
  useEffect(() => {
    pendingSaleIdRef.current = null;
  }, [cartItems]);

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

  const { data: categories = [], error: categoriesError } = useQuery({
    queryKey: ['categories', isOfflineMode, user?.email, activeBranch?.id],
    queryFn: async () => {
      const result = await fetchOrCache(
        () => fetchPosCatalogRecords(base44.entities.Category, user.email, activeBranch?.id, 'sort_order'),
        'categories'
      );
      console.log('[POS] categories loaded:', result?.length, 'user:', user?.email);
      return result;
    },
    staleTime: isEffectivelyOffline ? Infinity : 30000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!user,
  });

  const { data: allGroups = [] } = useQuery({
    queryKey: ['product-groups', isOfflineMode, user?.email, activeBranch?.id],
    queryFn: () => fetchOrCache(
      async () => (await fetchPosCatalogRecords(base44.entities.ProductGroup, user.email, activeBranch?.id))
        .filter(g => g.is_active !== false),
      'groups'
    ),
    staleTime: isEffectivelyOffline ? Infinity : 30000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!user,
  });

  const { data: allVariants = [] } = useQuery({
    queryKey: ['product-variants', isOfflineMode, user?.email, activeBranch?.id],
    queryFn: () => fetchOrCache(
      () => fetchPosCatalogRecords(base44.entities.ProductVariant, user.email, activeBranch?.id),
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
    setSelectedCategory(null);
    setSelectedSubCategory(null);
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
    mutationFn: async ({ paymentMethod, cashDetails, printReceipt }) => {
      const totalCost = cartItems.reduce((s, i) => s + (i.cost_price || 0) * i.quantity, 0);
      const total = cartItems.reduce((s, i) => s + i.sell_price * i.quantity, 0);

      // Map cart items to clean sale items — explicitly carry relational IDs
      const saleItems = cartItems.map(item => ({
        variant_id: item.variant_id || null,
        group_id: item.group_id || null,
        product_name: item.product_name,
        quantity: item.quantity,
        sell_price: item.sell_price,
        cost_price: item.cost_price || 0,
      }));

      const saleData = {
        items: saleItems,
        total,
        total_cost: totalCost,
        payment_method: paymentMethod,
        cash_received: cashDetails?.received,
        cash_change: cashDetails?.change,
        // Split payment (cash + credit): record how much went to each method
        cash_amount: cashDetails?.cashAmount,
        credit_amount: cashDetails?.creditAmount,
        seller_email: user?.email,
        seller_name: user?.full_name,
        created_date: new Date().toISOString(),
        // Always stamp branch_id — fall back to activeBranch if available
        branch_id: activeBranch?.id || null,
      };

      // No internet → no sale. Nothing is stored on the device; the cart stays for a retry.
      if (!navigator.onLine) throw new Error(NO_INTERNET);

      // Same cart retried after a failure keeps its id — if the server already got it, reuse it
      const isRetry = !!pendingSaleIdRef.current;
      if (!pendingSaleIdRef.current) pendingSaleIdRef.current = newClientSaleId();
      const clientSaleId = pendingSaleIdRef.current;

      if (isRetry) {
        const existing = await base44.entities.Sale.filter({ client_sale_id: clientSaleId }, '-created_date', 1);
        if (existing.length > 0) return { ...existing[0], _recovered: true };
      }

      const sale = await base44.entities.Sale.create({ ...saleData, client_sale_id: clientSaleId });

      // The sale is saved — a stock-update failure must not turn it into an error (and a retry)
      let stockWarning = false;
      try {
        for (const item of saleItems) {
          if (!item.variant_id) continue;
          const variant = allVariants.find(v => v.id === item.variant_id);
          if (variant) {
            await base44.entities.ProductVariant.update(variant.id, {
              stock: Math.max(0, (variant.stock || 0) - item.quantity),
            });
          }
        }
      } catch (err) {
        console.warn('[POS] Sale saved but stock update failed:', err?.message);
        stockWarning = true;
      }
      return { ...sale, _stockWarning: stockWarning };
    },
    onSuccess: (sale) => {
      pendingSaleIdRef.current = null;
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      queryClient.invalidateQueries({ queryKey: ['branch-dashboard-sales', activeBranch?.id] });
      setLastSale(sale);
      setCartItems([]);
      setShowCheckout(false);
      setShowCart(false);
      if (saleMutation.variables?.printReceipt) setShowReceipt(true);
      toast({
        title: sale?._recovered ? '✅ המכירה כבר נשמרה בניסיון הקודם' : '✅ המכירה הושלמה!',
        description: sale?._recovered
          ? 'לא נרשמה פעמיים'
          : sale?._stockWarning ? 'שים לב: עדכון המלאי נכשל' : undefined,
      });
    },
    onError: (error) => {
      const noInternet = error?.message === NO_INTERNET || !navigator.onLine;
      toast({
        title: noInternet ? '📡 אין חיבור לאינטרנט' : '❌ המכירה לא נשמרה',
        description: noInternet
          ? 'לא ניתן לבצע מכירה ללא אינטרנט. העגלה נשמרה — נסו שוב כשהחיבור יחזור.'
          : 'העגלה נשמרה — אפשר ללחוץ שוב על "אשר תשלום". המערכת תוודא שהמכירה לא תירשם פעמיים.',
        variant: 'destructive',
        duration: 7000,
      });
    },
  });

  // Send sales that the old offline mode left on this device (skips any the server already has)
  const sendUnsentSales = async () => {
    if (sendingUnsent) return;
    if (!navigator.onLine) {
      toast({ title: '📡 אין חיבור לאינטרנט', variant: 'destructive' });
      return;
    }
    setSendingUnsent(true);
    let sent = 0;
    let failed = 0;
    try {
      const pending = await offlineManager.getPendingSales();
      for (const p of pending) {
        const { offline_id, queued_at, status, ...data } = p;
        const clientSaleId = data.client_sale_id || offline_id;
        try {
          const existing = await base44.entities.Sale.filter({ client_sale_id: clientSaleId }, '-created_date', 1);
          if (existing.length === 0) {
            await base44.entities.Sale.create({
              ...data,
              branch_id: data.branch_id || activeBranch?.id || null,
              client_sale_id: clientSaleId,
              created_date: data.created_date || queued_at,
            });
          }
          await offlineManager.markSaleAsSynced(offline_id);
          sent += 1;
        } catch (err) {
          console.error('[POS] Failed to send stored sale:', err);
          failed += 1;
        }
      }
    } finally {
      setSendingUnsent(false);
      await refreshUnsentSales();
      queryClient.invalidateQueries({ queryKey: ['branch-dashboard-sales', activeBranch?.id] });
    }
    toast({
      title: failed ? `⚠️ נשלחו ${sent} מכירות, ${failed} נכשלו — נסו שוב` : `✅ ${sent} מכירות נשלחו לשרת`,
      variant: failed ? 'destructive' : undefined,
      duration: 5000,
    });
  };

  const addToCart = (variant, group) => {
    // Guard: variant must have an id and group must have an id
    if (!variant?.id) {
      console.error('[POS] addToCart: variant missing id', { variant, group });
      toast({ title: '⛔ שגיאה', description: 'לא ניתן להוסיף פריט ללא מזהה', duration: 2000 });
      return;
    }
    if (!group?.id) {
      console.error('[POS] addToCart: group missing id', { variant, group });
      toast({ title: '⛔ שגיאה', description: 'לא ניתן להוסיף פריט ללא מזהה מוצר', duration: 2000 });
      return;
    }

    // A warning popup is already open — ignore further scans/taps until the seller answers it
    if (stockConfirm) return;

    const liveVariant = allVariants.find(v => v.id === variant.id);
    const available = liveVariant?.stock || 0;
    const inCart = cartItems.find(item => item.variant_id === variant.id)?.quantity || 0;
    if (inCart + 1 > available) {
      if (stockModeEnabled) {
        toast({ title: '⛔ אין מלאי', description: 'הפריט אזל מהמלאי', duration: 2000 });
        return;
      }
      setStockConfirm({
        title: stockWarningTitle(available),
        description: stockWarningText(variant, group),
        onConfirm: () => pushToCart(variant, group, liveVariant),
      });
      return;
    }

    pushToCart(variant, group, liveVariant);
  };

  // "Only 2 in stock" when some are left, "out of stock" when none
  const stockWarningTitle = (available) => {
    if (available <= 0) return 'שים לב — המוצר אזל מהמלאי';
    if (available === 1) return 'שים לב — קיים במלאי רק פריט אחד מהמוצר הזה';
    return `שים לב — קיימים במלאי רק ${available} פריטים מהמוצר הזה`;
  };

  const stockWarningText = (variant, group) => {
    const dimText = variant.dimensions && Object.keys(variant.dimensions).length > 0
      ? Object.values(variant.dimensions).join(' / ')
      : '';
    const name = dimText ? `${group.name} - ${dimText}` : group.name;
    return `${name}. אם יש עוד בחנות — אפשר למכור.`;
  };

  const pushToCart = (variant, group, liveVariant) => {
    const sellPrice = group.has_uniform_price ? group.uniform_sell_price : variant.sell_price;
    const costPrice = group.has_uniform_price ? group.uniform_cost_price : variant.cost_price;
    const dimText = variant.dimensions && Object.keys(variant.dimensions).length > 0
      ? Object.values(variant.dimensions).join(' / ')
      : '';

    setCartItems(prev => {
      const existingIdx = prev.findIndex(item => item.variant_id === variant.id);
      if (existingIdx !== -1) {
        // Auto-increment existing item
        return prev.map((item, i) => i === existingIdx ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, {
        variant_id: variant.id,        // FK to FlexibleVariant / ProductVariant
        group_id: group.id,            // FK to ProductGroup
        product_name: dimText ? `${group.name} - ${dimText}` : group.name,
        quantity: 1,
        sell_price: sellPrice,
        cost_price: costPrice || 0,
        variant_stock: liveVariant?.stock || 0,
      }];
    });

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
  const handleScannerGroupSelect = useCallback((group) => { setSelectedGroup(group); }, []);

  // Global barcode listener — always active, silent add to cart
  useGlobalBarcodeScanner({
    variants: allVariants,
    groups: allGroups,
    onAddToCart: addToCart,
    onGroupSelect: handleScannerGroupSelect,
    stockModeEnabled,
  });

  // Barcode scan: bypass modal entirely — add directly to cart (or open selector only if multi-variant needed)
  const handleBarcodeSelect = (variant, group) => {
    if (variant) {
      // Exact variant matched — instant add, no modal
      addToCart(variant, group);
    } else {
      // Group matched but multiple variants — open selector (no way around it)
      setSelectedGroup(group);
    }
  };

  const updateCartQty = (idx, newQty) => {
    if (newQty <= 0) {
      setCartItems(prev => prev.filter((_, i) => i !== idx));
      return;
    }
    const item = cartItems[idx];
    const setQty = () => setCartItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: newQty } : it));
    // Raising the quantity above what's in stock → block (if blocking is on) or warn first
    if (item && newQty > item.quantity) {
      if (stockConfirm) return;
      const available = allVariants.find(v => v.id === item.variant_id)?.stock || 0;
      if (newQty > available) {
        if (stockModeEnabled) {
          toast({ title: '⛔ אין מלאי', description: `רשומים במלאי רק ${available}`, duration: 2000 });
          return;
        }
        setStockConfirm({
          title: stockWarningTitle(available),
          description: `${item.product_name}. אם יש עוד בחנות — אפשר למכור.`,
          onConfirm: setQty,
        });
        return;
      }
    }
    setQty();
  };

  const removeCartItem = (idx) => setCartItems(prev => prev.filter((_, i) => i !== idx));
  const cartTotal = cartItems.reduce((s, i) => s + i.sell_price * i.quantity, 0);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="h-screen flex flex-col bg-gray-50">
      {/* Sales the old offline mode left on this device */}
      {unsentSales.length > 0 && (
        <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 flex items-center justify-between gap-3 text-sm shrink-0">
          <span className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            נמצאו {unsentSales.length} מכירות שנשמרו במכשיר ולא הגיעו לשרת
          </span>
          <button onClick={sendUnsentSales} disabled={sendingUnsent}
            className="px-3 py-1.5 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-60 shrink-0">
            {sendingUnsent ? 'שולח...' : 'שלח לשרת'}
          </button>
        </div>
      )}
      {!networkOnline && (
        <div className="bg-red-600 text-white px-4 py-2 text-sm font-medium flex items-center gap-2 shrink-0">
          <WifiOff className="w-4 h-4 shrink-0" />
          אין חיבור לאינטרנט — לא ניתן לבצע מכירות כרגע
        </div>
      )}
      {/* Pending network invitations — approve here to join the network */}
      {pendingInvitations.map(inv => (
        <BranchInvitationBanner key={inv.id} invitation={inv} userEmail={user?.email} />
      ))}
      <CatalogShareBanner branch={activeBranch} userEmail={user?.email} />
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <h1 className="text-xl font-bold text-gray-800">🛍️ קופה</h1>
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium ${networkOnline ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
            title={networkOnline ? 'מחובר לאינטרנט' : 'אין חיבור לאינטרנט'}>
            {networkOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            <span className="hidden sm:inline">{networkOnline ? 'מחובר' : 'אין אינטרנט'}</span>
          </div>
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
            stockModeEnabled={stockModeEnabled}
            groups={allGroups}
            variants={allVariants}
            categories={categories}
            onSelectGroup={handleGroupSelect}
            onSelectVariant={handleBarcodeSelect}
          />

          {!selectedCategory ? (
            <>
              <h2 className="text-lg font-bold text-gray-700">קטגוריות</h2>
              {categoriesError && (
                <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-red-700 text-sm">
                  שגיאה בטעינת קטגוריות: {categoriesError.message}
                </div>
              )}
              {!user && (
                <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 text-yellow-700 text-sm">
                  טוען משתמש...
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {/* Only top-level categories that have groups with stock (direct or via sub-cats) */}
                {Array.from(new Map(categories.map(c => [c.id, c])).values())
                  .filter(category => !category.parent_id)
                  .map(category => {
                    const subCats = categories.filter(c => c.parent_id === category.id);
                    const allCatGroups = [
                      ...allGroups.filter(g => g.category_id === category.id),
                      ...subCats.flatMap(sc => allGroups.filter(g => g.category_id === sc.id)),
                    ];
                    return (
                      <button key={category.id} onClick={() => { setSelectedCategory(category.id); setSelectedSubCategory(null); }}
                        className="bg-white rounded-xl p-6 shadow-sm border-2 border-gray-200 hover:border-amber-500 hover:shadow-md transition-all text-center min-h-[140px]">
                        <div className="text-4xl mb-2">📦</div>
                        <h3 className="text-lg font-bold text-gray-800">{category.name}</h3>
                        <p className="text-sm text-gray-500 mt-1">{allCatGroups.length} מוצרים</p>
                      </button>
                    );
                  })}
              </div>
              {user && categories.length === 0 && (
                <div className="text-center py-12 text-gray-400 text-sm">
                  אין קטגוריות להצגה — עבור לניהול מוצרים כדי להוסיף קטגוריות
                </div>
              )}

            </>
          ) : selectedCategory && subCategories.length > 0 && !selectedSubCategory ? (
            <>
              {/* Sub-category selection */}
              <div className="flex items-center gap-3 mb-4">
                <button onClick={() => { setSelectedCategory(null); setSelectedSubCategory(null); }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium flex items-center gap-2">
                  ← חזור לקטגוריות
                </button>
                <h2 className="text-lg font-bold text-amber-600">
                  {categories.find(c => c.id === selectedCategory)?.name}
                </h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {subCategories
                  .map(subCat => {
                    const scGroups = allGroups.filter(g => g.category_id === subCat.id);
                    return (
                      <button key={subCat.id} onClick={() => setSelectedSubCategory(subCat.id)}
                        className="bg-white rounded-xl p-6 shadow-sm border-2 border-gray-200 hover:border-blue-500 hover:shadow-md transition-all text-center min-h-[120px]">
                        <div className="text-3xl mb-2">📁</div>
                        <h3 className="text-base font-bold text-gray-800">{subCat.name}</h3>
                        <p className="text-sm text-gray-500 mt-1">{scGroups.length} מוצרים</p>
                      </button>
                    );
                  })}
                {/* Also show direct products of the main category if any */}
                {allGroups.filter(g => g.category_id === selectedCategory).length > 0 && (
                  <button onClick={() => setSelectedSubCategory('__direct__')}
                    className="bg-white rounded-xl p-6 shadow-sm border-2 border-dashed border-gray-300 hover:border-amber-400 hover:shadow-md transition-all text-center min-h-[120px]">
                    <div className="text-3xl mb-2">📦</div>
                    <h3 className="text-base font-bold text-gray-800">כללי</h3>
                    <p className="text-sm text-gray-500 mt-1">{allGroups.filter(g => g.category_id === selectedCategory).length} מוצרים</p>
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Products level */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <button onClick={() => { setSelectedCategory(null); setSelectedSubCategory(null); }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium flex items-center gap-2">
                  ← קטגוריות
                </button>
                {subCategories.length > 0 && (
                  <button onClick={() => setSelectedSubCategory(null)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium flex items-center gap-2">
                    {categories.find(c => c.id === selectedCategory)?.name} ←
                  </button>
                )}
                <h2 className="text-lg font-bold text-amber-600">
                  {selectedSubCategory && selectedSubCategory !== '__direct__'
                    ? categories.find(c => c.id === selectedSubCategory)?.name
                    : categories.find(c => c.id === selectedCategory)?.name}
                </h2>
              </div>
              <ProductGrid
                groups={selectedSubCategory === '__direct__'
                  ? allGroups.filter(g => g.category_id === selectedCategory)
                  : groups}
                variants={allVariants}
                virtualFolders={virtualFolders}
                stockModeEnabled={stockModeEnabled}
                currentCategoryId={selectedSubCategory && selectedSubCategory !== '__direct__' ? selectedSubCategory : selectedCategory}
                onSelect={handleGroupSelect}
              />
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
        categories={categories}
        stockModeEnabled={stockModeEnabled}
        onConfirm={handleVariantConfirm}
        onClose={() => setSelectedGroup(null)}
      />

      <CheckoutModal
        open={showCheckout}
        total={cartTotal}
        onConfirm={(method, cashDetails, printReceipt) => saleMutation.mutate({ paymentMethod: method, cashDetails, printReceipt })}
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

      {/* Out-of-stock warning — no button is focused, so a scanner's Enter can't confirm it by accident */}
      {stockConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
            <div className="flex items-center gap-2 text-amber-600 mb-2">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="text-lg font-bold">{stockConfirm.title}</h2>
            </div>
            <p className="text-gray-700 mb-5">{stockConfirm.description}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { const fn = stockConfirm.onConfirm; setStockConfirm(null); fn(); }}
                className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600">
                כן, הוסף לעגלה
              </button>
              <button
                type="button"
                onClick={() => setStockConfirm(null)}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}