import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, ShoppingCart, RotateCcw, Users, Wifi, WifiOff, AlertTriangle, Shirt, FolderOpen, ChevronLeft, CreditCard, Banknote } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import ProductGrid from '@/components/pos/ProductGrid';
import Cart from '@/components/pos/Cart';
import DynamicVariantSelector from '@/components/pos/DynamicVariantSelector';
import CheckoutModal from '@/components/pos/CheckoutModal';
import SmartSearch from '@/components/pos/SmartSearch';
import ReceiptModal from '@/components/pos/ReceiptModal';
import FreeAmountDialog from '@/components/pos/FreeAmountDialog';
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
import { usePosReservations } from '@/hooks/usePosReservations';
import StuckStockBanner from '@/components/pos/StuckStockBanner';
import { enqueueSaleStock, flushSaleStock } from '@/lib/saleStockQueue';
// Built-in logos, inlined into the page (no separate image request, so a filtered connection still shows them)
import tomcheiTorahLogo from '@/assets/brand/tomchei-torah.webp?inline';
const BUILTIN_WATERMARKS = { '/brand/tomchei-torah.webp': tomcheiTorahLogo };

// Shared look of the POS screen (ink / paper / brass)
const SERIF = { fontFamily: "'Frank Ruhl Libre', Georgia, serif" };
// One color per top-level category, by its order — so the eye finds a category by color
const CATEGORY_TONES = [
  { tone: '#1F3A5F', soft: '#E4EAF2' }, { tone: '#2E6B4C', soft: '#E3EFE7' }, { tone: '#8A5A2B', soft: '#F2E6D8' },
  { tone: '#6B3E6E', soft: '#EFE4F0' }, { tone: '#2A7F7F', soft: '#E0F0F0' }, { tone: '#8C3B2E', soft: '#F4E3DF' },
  { tone: '#4F5A23', soft: '#ECEFDD' }, { tone: '#4B4A8C', soft: '#E7E6F4' },
];
const money = (n) => `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;

// A system notice — every banner on the POS looks the same (tone: 'warn' | 'danger')
function PosNotice({ tone = 'warn', children, action }) {
  const cls = tone === 'danger'
    ? 'bg-[#F7E3DF] border-[#D9A194] text-[#6E2216]'
    : 'bg-[#FBF0D9] border-[#E3C98F] text-[#5A3E0E]';
  return (
    <div className={`mx-4 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm ${cls}`} dir="rtl">
      <span className="flex items-center gap-2">
        {tone === 'danger' ? <WifiOff className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
        {children}
      </span>
      {action}
    </div>
  );
}

// "כל הקטגוריות ‹ חולצות ‹ אמריקאי" — always visible, every step clickable; the last one is where you are
function PosBreadcrumb({ steps }) {
  return (
    <nav aria-label="מיקום" className="flex flex-wrap items-center gap-1.5 min-h-[44px]">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && <ChevronLeft className="w-4 h-4 text-[#8A8478]" aria-hidden="true" />}
            <button
              type="button"
              onClick={s.onClick}
              className={`h-11 px-4 rounded-xl text-base transition-colors ${last ? 'bg-[#1E2433] text-[#F5EFE3] font-medium' : 'bg-[#EDE4D2] text-[#1E2433] hover:bg-[#E3D7BF]'}`}
            >
              {s.label}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

// A credit charge that went through (Nedarim) but whose sale wasn't saved yet — kept on the device so
// the next "save" reuses it instead of charging the customer again, even after a page refresh.
const PAID_CHARGE_KEY = 'pos_paid_unsaved_charge';
const loadPaidCharge = () => { try { return JSON.parse(localStorage.getItem(PAID_CHARGE_KEY) || 'null'); } catch { return null; } };
const savePaidCharge = (c) => { try { c ? localStorage.setItem(PAID_CHARGE_KEY, JSON.stringify(c)) : localStorage.removeItem(PAID_CHARGE_KEY); } catch { /* ignore */ } };

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
  const [showFreeAmount, setShowFreeAmount] = useState(false);
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
  const [paidCharge, setPaidChargeState] = useState(loadPaidCharge);
  const setPaidCharge = (c) => { savePaidCharge(c); setPaidChargeState(c); };

  // Nedarim Plus settings (this store's, or its network's) — read on the server, key included
  const { data: nedarim = null } = useQuery({
    queryKey: ['nedarim-config'],
    queryFn: async () => (await base44.functions.invoke('adminAuth', { action: 'nedarimConfig' })).data,
    staleTime: 300000,
    retry: false,
  });
  // "אשראי ידני" switch in the header (per device): ON = credit is confirmed by hand as before (charged on the
  // separate tablet); OFF = credit goes through Nedarim's window. Starts ON, so nothing changes until a seller switches it.
  const [manualCredit, setManualCreditState] = useState(() => {
    try { return localStorage.getItem('pos_manual_credit') !== '0'; } catch { return true; }
  });
  const setManualCredit = (on) => {
    setManualCreditState(on);
    try { localStorage.setItem('pos_manual_credit', on ? '1' : '0'); } catch { /* private mode — keeps for this session */ }
  };
  const nedarimAvailable = !!nedarim?.enabled;
  const nedarimForCheckout = nedarimAvailable && !manualCredit ? nedarim : null;
  // Out-of-stock warning popup: { title, description, onConfirm } — the seller can still sell after confirming
  const [stockConfirm, setStockConfirm] = useState(null);
  // The cart line that was just added / raised — flashes for a moment so the seller sees the scan landed
  const [flashId, setFlashId] = useState(null);
  const flashTimer = useRef(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20000);
    return () => { clearInterval(t); clearTimeout(flashTimer.current); };
  }, []);

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

  const { data: appSettingsRaw = [] } = useQuery({
    queryKey: ['app-settings', user?.email],
    queryFn: () => base44.entities.AppSettings.filter({ created_by: user.email }),
    enabled: !!user?.email,
    staleTime: 60000,
  });
  // Always a list, even if some other screen cached one settings object under the same key
  const appSettingsList = Array.isArray(appSettingsRaw) ? appSettingsRaw : (appSettingsRaw ? [appSettingsRaw] : []);
  const virtualFolders = appSettingsList[0]?.pos_virtual_folders || [];
  // "חסום מכירה של מוצר שאזל" (settings, field stock_mode_enabled): on → out-of-stock items can't be sold.
  // It only controls blocking — every sale always deducts from stock, so inventory/shortages stay accurate.
  const stockModeEnabled = appSettingsList[0]?.stock_mode_enabled !== false;

  useInventorySync();

  // Cart reservations across this branch's computers (background only)
  const reservedByOthers = usePosReservations({ branch: activeBranch, user, cartItems });

  // Stock of saved sales is deducted on the server in the background; waiting ones are resent
  const flushStock = useCallback(() => {
    flushSaleStock().then(n => { if (n) queryClient.invalidateQueries({ queryKey: ['product-variants'] }); });
  }, [queryClient]);
  useEffect(() => {
    flushStock();
    const timer = setInterval(flushStock, 60000);
    window.addEventListener('online', flushStock);
    return () => { clearInterval(timer); window.removeEventListener('online', flushStock); };
  }, [flushStock]);

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
        // Charged through Nedarim in the POS → keep the approval with the sale
        credit_provider: cashDetails?.credit?.provider || null,
        credit_ref: cashDetails?.credit?.ref || null,
        credit_details: cashDetails?.credit
          ? { ...(cashDetails.credit.details || {}), amount: cashDetails.credit.amount, tashlumim: cashDetails.credit.tashlumim }
          : null,
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
        if (existing.length > 0) {
          enqueueSaleStock(clientSaleId); // deducted once on the server, even if it was already done
          return { ...existing[0], _recovered: true };
        }
      }

      // Queued BEFORE saving — if the save reaches the server but the reply is lost (and the page is
      // refreshed), the sale is still deducted. Deduction runs once on the server, keyed by client_sale_id.
      enqueueSaleStock(clientSaleId);
      return base44.entities.Sale.create({ ...saleData, client_sale_id: clientSaleId });
    },
    onSuccess: (sale) => {
      pendingSaleIdRef.current = null;
      if (saleMutation.variables?.cashDetails?.credit) setPaidCharge(null);
      flushStock();
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
    onError: (error, variables) => {
      // The card was already charged — remember it so the retry saves without charging again
      if (variables?.cashDetails?.credit) setPaidCharge({ ...variables.cashDetails.credit, at: new Date().toISOString() });
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
          enqueueSaleStock(clientSaleId);
          await offlineManager.markSaleAsSynced(offline_id);
          sent += 1;
        } catch (err) {
          console.error('[POS] Failed to send stored sale:', err);
          failed += 1;
        }
      }
    } finally {
      setSendingUnsent(false);
      flushStock();
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
    // Free = stock − what other computers of this branch hold in their carts
    const available = (liveVariant?.stock || 0) - reservedByOthers(variant.id);
    const inCart = cartItems.find(item => item.variant_id === variant.id)?.quantity || 0;
    if (inCart + 1 > available) {
      if (stockModeEnabled) {
        toast({ title: '⛔ אין מלאי', description: available > 0 ? `קיימים במלאי רק ${available}` : 'הפריט אזל מהמלאי', duration: 2000 });
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
    setFlashId(variant.id);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashId(null), 1100);

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

  // Same "free" as a regular add: stock − other computers' carts
  const scanFreeStock = useCallback((v) => (v.stock || 0) - reservedByOthers(v.id), [reservedByOthers]);

  // Global barcode listener — always active, silent add to cart
  useGlobalBarcodeScanner({
    variants: allVariants,
    groups: allGroups,
    onAddToCart: addToCart,
    onGroupSelect: handleScannerGroupSelect,
    stockModeEnabled,
    freeStock: scanFreeStock,
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
    // (a free-amount line has no product and no stock)
    if (item && item.variant_id && newQty > item.quantity) {
      if (stockConfirm) return;
      const available = (allVariants.find(v => v.id === item.variant_id)?.stock || 0) - reservedByOthers(item.variant_id);
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
  const clearCart = () => { if (window.confirm('לנקות את כל העגלה?')) setCartItems([]); };
  const cartTotal = cartItems.reduce((s, i) => s + i.sell_price * i.quantity, 0);
  const cartUnits = cartItems.reduce((s, i) => s + i.quantity, 0);
  const branchName = activeBranch?.name || appSettingsList[0]?.store_name || '';
  const savedWatermark = appSettingsList[0]?.pos_watermark_url || '';
  const watermarkUrl = BUILTIN_WATERMARKS[savedWatermark] || savedWatermark;
  // The network's name in the header (a branch gets it from its network); a lone store shows its own name
  const networkName = activeBranch?.network_name || appSettingsList[0]?.network_name || '';
  const headerTitle = networkName || appSettingsList[0]?.store_name || 'קופה';
  const headerSub = branchName && branchName !== headerTitle ? branchName : '';
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const catName = (id) => categories.find(c => c.id === id)?.name || '';
  const topCategories = Array.from(new Map(categories.map(c => [c.id, c])).values()).filter(c => !c.parent_id);
  const toneOf = (catId) => {
    const i = topCategories.findIndex(c => c.id === catId);
    return CATEGORY_TONES[(i < 0 ? 0 : i) % CATEGORY_TONES.length];
  };
  const crumbs = [{ label: 'כל הקטגוריות', onClick: () => { setSelectedCategory(null); setSelectedSubCategory(null); } }];
  if (selectedCategory) crumbs.push({ label: catName(selectedCategory), onClick: () => setSelectedSubCategory(null) });
  if (selectedSubCategory) crumbs.push({ label: selectedSubCategory === '__direct__' ? 'כללי' : catName(selectedSubCategory), onClick: () => {} });
  const cartProps = {
    items: cartItems, onUpdateQty: updateCartQty, onRemove: removeCartItem, onClear: clearCart, flashId,
    onCheckout: () => { setShowCart(false); setShowCheckout(true); },
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="h-screen flex flex-col bg-[#F5EFE3] text-[#1E2433]" style={{ fontFamily: "Rubik, 'Segoe UI', Tahoma, sans-serif" }}>
      {/* Sales the old offline mode left on this device */}
      <StuckStockBanner onRetry={flushStock} />

      {/* ── Header ── */}
      <header className="bg-[#1E2433] text-[#F5EFE3] px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl border border-[#B8925A] flex items-center justify-center shrink-0">
            <Shirt className="w-6 h-6" strokeWidth={1.6} />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold leading-tight truncate" style={SERIF}>{headerTitle}</p>
            {headerSub && <p className="text-[13px] text-[#D9D1C1] truncate">{headerSub}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`flex items-center gap-2 h-10 px-3 rounded-full text-sm ${networkOnline ? 'bg-[#2B3245]' : 'bg-[#8C3B2E]'}`}
            title={networkOnline ? 'מחובר לאינטרנט' : 'אין חיבור לאינטרנט'}>
            {networkOnline ? <Wifi className="w-4 h-4 text-[#6FCF97]" /> : <WifiOff className="w-4 h-4" />}
            <span className="hidden sm:inline">{networkOnline ? 'מחובר' : 'אין אינטרנט'}</span>
          </span>
          <span className="hidden sm:inline text-xl font-medium px-2 tabular-nums" style={SERIF}>{clock}</span>
          {nedarimAvailable && (
            <button onClick={() => setManualCredit(!manualCredit)}
              title={manualCredit ? 'אשראי מאושר ידנית (כמו קודם) — לחץ כדי לעבור לנדרים פלוס' : 'אשראי עובר דרך נדרים פלוס — לחץ כדי לאשר ידנית'}
              className={`h-11 flex items-center gap-2 px-3 sm:px-4 rounded-xl border text-[15px] transition-colors ${manualCredit
                ? 'border-[#B8925A] text-[#F3DFB8] hover:bg-[#2B3245]'
                : 'border-[#2E6B4C] bg-[#2E6B4C] text-white hover:bg-[#25573D]'}`}>
              <CreditCard className="w-[18px] h-[18px]" />
              <span className="hidden sm:inline">{manualCredit ? 'אשראי: ידני' : 'אשראי: נדרים'}</span>
            </button>
          )}
          <button onClick={() => setShowReturnForm(true)}
            className="h-11 flex items-center gap-2 px-3 sm:px-4 rounded-xl border border-[#4A5268] hover:bg-[#2B3245] transition-colors text-[15px]">
            <RotateCcw className="w-[18px] h-[18px]" /> <span className="hidden sm:inline">החזרה</span>
          </button>
          <button onClick={() => setShowStaffPortal(true)}
            className="h-11 flex items-center gap-2 px-3 sm:px-4 rounded-xl border border-[#4A5268] hover:bg-[#2B3245] transition-colors text-[15px]">
            <Users className="w-[18px] h-[18px]" /> <span className="hidden sm:inline">עובדים</span>
          </button>
          <button onClick={() => setShowCart(!showCart)} aria-label="עגלה"
            className="lg:hidden relative w-11 h-11 rounded-xl border border-[#4A5268] flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
            {cartUnits > 0 && (
              <span className="absolute -top-1.5 -left-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-[#B8925A] text-[#1E2433] text-xs flex items-center justify-center font-bold">
                {cartUnits}
              </span>
            )}
          </button>
          <Link to="/AdminLogin" aria-label="ניהול" className="w-11 h-11 rounded-xl border border-[#4A5268] hover:bg-[#2B3245] flex items-center justify-center transition-colors">
            <Settings className="w-5 h-5" />
          </Link>
        </div>
      </header>

      {/* ── System notices — one look for all ── */}
      {!networkOnline && (
        <PosNotice tone="danger">אין חיבור לאינטרנט — לא ניתן לבצע מכירות כרגע</PosNotice>
      )}
      {paidCharge && (
        <PosNotice action={(
          <button
            onClick={() => { if (window.confirm('להסיר את ההודעה? אם המכירה לא נשמרה — צריך לרשום אותה או לבטל את העסקה בנדרים ידנית.')) setPaidCharge(null); }}
            className="h-9 px-3 rounded-lg text-xs underline hover:bg-[#F3E2BC]">
            טופל — הסר הודעה
          </button>
        )}>
          חיוב אשראי של {money(paidCharge.amount)}{paidCharge.ref ? ` (אישור ${paidCharge.ref})` : ''} עבר בנדרים, אבל המכירה עוד לא נשמרה.
          לחצו שוב על תשלום — הוא לא יחויב שוב.
        </PosNotice>
      )}
      {unsentSales.length > 0 && (
        <PosNotice action={(
          <button onClick={sendUnsentSales} disabled={sendingUnsent}
            className="h-10 px-4 rounded-lg bg-[#5A3E0E] text-[#FFFDF8] font-medium hover:bg-[#46300B] disabled:opacity-60 shrink-0">
            {sendingUnsent ? 'שולח...' : 'שלח עכשיו'}
          </button>
        )}>
          {unsentSales.length === 1 ? 'מכירה אחת נשמרה במכשיר ולא הגיעה לשרת' : `${unsentSales.length} מכירות נשמרו במכשיר ולא הגיעו לשרת`}
        </PosNotice>
      )}
      {/* Pending network invitations — approve here to join the network */}
      {pendingInvitations.map(inv => (
        <BranchInvitationBanner key={inv.id} invitation={inv} userEmail={user?.email} />
      ))}
      <CatalogShareBanner branch={activeBranch} userEmail={user?.email} />

      <div className="flex-1 flex overflow-hidden">
        {/* ── Products side (the store's logo sits faint behind it, if set in the settings) ── */}
        <div className="relative flex-1 min-w-0 flex">
        {watermarkUrl && (
          <div aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-no-repeat opacity-[0.12] mix-blend-multiply"
            style={{ backgroundImage: `url("${watermarkUrl}")`, backgroundSize: 'min(48%, 420px) auto', backgroundPosition: 'center calc(100% - 32px)' }} />
        )}
        <div className={`relative flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 ${cartItems.length > 0 ? 'pb-28 lg:pb-5' : ''}`}>
          <SmartSearch
            stockModeEnabled={stockModeEnabled}
            groups={allGroups}
            variants={allVariants}
            categories={categories}
            onSelectGroup={handleGroupSelect}
            onSelectVariant={handleBarcodeSelect}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <PosBreadcrumb steps={crumbs} />
            <button onClick={() => setShowFreeAmount(true)}
              className="h-11 flex items-center gap-2 px-4 rounded-xl border-[1.5px] border-[#E2D8C4] bg-[#FFFDF8] text-[15px] font-medium hover:bg-[#F0E6D2] transition-colors">
              <Banknote className="w-[18px] h-[18px]" strokeWidth={1.8} /> סכום חופשי
            </button>
          </div>

          {!selectedCategory ? (
            <>
              {categoriesError && (
                <PosNotice tone="danger">שגיאה בטעינת קטגוריות: {categoriesError.message}</PosNotice>
              )}
              {!user && <p className="text-sm text-[#5E5A52]">טוען משתמש...</p>}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {/* Only top-level categories; each gets its own color */}
                {topCategories.map(category => {
                  const subCats = categories.filter(c => c.parent_id === category.id);
                  const allCatGroups = [
                    ...allGroups.filter(g => g.category_id === category.id),
                    ...subCats.flatMap(sc => allGroups.filter(g => g.category_id === sc.id)),
                  ];
                  const { tone, soft } = toneOf(category.id);
                  return (
                    <button key={category.id} onClick={() => { setSelectedCategory(category.id); setSelectedSubCategory(null); }}
                      className="flex flex-col text-right rounded-2xl overflow-hidden border-[1.5px] border-[#E2D8C4] bg-[#FFFDF8] hover:shadow-md hover:border-[#CDBF9F] active:scale-[0.98] transition-all min-h-[140px]">
                      <span className="block h-2.5 w-full" style={{ background: tone }} />
                      <span className="flex items-center gap-3.5 p-4">
                        <span className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: soft, color: tone }}>
                          <Shirt className="w-7 h-7" strokeWidth={1.6} />
                        </span>
                        <span className="flex flex-col gap-1 min-w-0">
                          <span className="text-xl font-bold leading-tight" style={SERIF}>{category.name}</span>
                          <span className="text-sm text-[#5E5A52]">{allCatGroups.length} מוצרים</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {user && categories.length === 0 && (
                <div className="text-center py-12 text-[#5E5A52] text-sm">
                  אין קטגוריות להצגה — עבור לניהול מוצרים כדי להוסיף קטגוריות
                </div>
              )}
            </>
          ) : selectedCategory && subCategories.length > 0 && !selectedSubCategory ? (
            /* Sub-category selection */
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {subCategories.map(subCat => {
                const scGroups = allGroups.filter(g => g.category_id === subCat.id);
                const { tone, soft } = toneOf(selectedCategory);
                return (
                  <button key={subCat.id} onClick={() => setSelectedSubCategory(subCat.id)}
                    className="flex items-center gap-3.5 text-right p-4 rounded-2xl border-[1.5px] border-[#E2D8C4] bg-[#FFFDF8] hover:shadow-md hover:border-[#CDBF9F] active:scale-[0.98] transition-all min-h-[110px]">
                    <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: soft, color: tone }}>
                      <FolderOpen className="w-6 h-6" strokeWidth={1.6} />
                    </span>
                    <span className="flex flex-col gap-1 min-w-0">
                      <span className="text-lg font-bold leading-tight" style={SERIF}>{subCat.name}</span>
                      <span className="text-sm text-[#5E5A52]">{scGroups.length} מוצרים</span>
                    </span>
                  </button>
                );
              })}
              {/* Also show direct products of the main category if any */}
              {allGroups.filter(g => g.category_id === selectedCategory).length > 0 && (
                <button onClick={() => setSelectedSubCategory('__direct__')}
                  className="flex items-center gap-3.5 text-right p-4 rounded-2xl border-[1.5px] border-dashed border-[#CDBF9F] bg-[#FFFDF8] hover:shadow-md transition-all min-h-[110px]">
                  <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-[#EDE4D2] text-[#5E5A52]">
                    <Shirt className="w-6 h-6" strokeWidth={1.6} />
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="text-lg font-bold" style={SERIF}>כללי</span>
                    <span className="text-sm text-[#5E5A52]">{allGroups.filter(g => g.category_id === selectedCategory).length} מוצרים</span>
                  </span>
                </button>
              )}
            </div>
          ) : (
            /* Products level */
            <ProductGrid
              groups={selectedSubCategory === '__direct__'
                ? allGroups.filter(g => g.category_id === selectedCategory)
                : groups}
              variants={allVariants}
              virtualFolders={virtualFolders}
              stockModeEnabled={stockModeEnabled}
              currentCategoryId={selectedSubCategory && selectedSubCategory !== '__direct__' ? selectedSubCategory : selectedCategory}
              tone={toneOf(selectedCategory).tone}
              onSelect={handleGroupSelect}
            />
          )}
        </div>
        </div>

        {/* ── Cart (desktop) ── */}
        <aside className="hidden lg:flex w-[500px] xl:w-[580px] shrink-0 border-r border-[#E2D8C4] p-4 flex-col">
          <Cart {...cartProps} />
        </aside>

        {/* ── Cart drawer (tablet / phone) ── */}
        {showCart && (
          <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setShowCart(false)}>
            <div className="absolute left-0 top-0 bottom-0 w-[94%] max-w-[560px] bg-[#F5EFE3] p-4 shadow-xl flex flex-col"
              onClick={e => e.stopPropagation()}>
              <Cart {...cartProps} />
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom bar (tablet / phone): the total is always in sight ── */}
      {cartItems.length > 0 && !showCart && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#FFFDF8] border-t border-[#E2D8C4] px-4 py-3 flex items-center gap-3 shadow-[0_-4px_16px_rgba(30,36,51,0.08)]">
          <button onClick={() => setShowCart(true)} className="h-14 px-4 rounded-xl border-[1.5px] border-[#E2D8C4] bg-[#F5EFE3] flex items-center gap-2 font-medium">
            <ShoppingCart className="w-5 h-5" /> עגלה ({cartUnits})
          </button>
          <button onClick={() => setShowCheckout(true)}
            className="flex-1 h-14 rounded-xl bg-[#2E6B4C] hover:bg-[#25573D] text-white text-lg font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition-all">
            <CreditCard className="w-5 h-5" /> לתשלום {money(cartTotal)}
          </button>
        </div>
      )}

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
        nedarim={nedarimForCheckout}
        paidCharge={paidCharge}
        // Shown with the charge in Nedarim's reports: the branch name as the network registered it
        // (falls back to the store name in settings for a store without a network branch)
        chargeComment={(activeBranch?.name || appSettingsList[0]?.store_name || 'קופה').trim()}
      />

      <ReceiptModal
        open={showReceipt}
        sale={lastSale}
        onClose={() => { setShowReceipt(false); setLastSale(null); }}
      />

      <ReturnFormModal open={showReturnForm} onClose={() => setShowReturnForm(false)} branchId={activeBranch?.id || null} />

      {/* Free amount — a cart line with no product (doesn't touch the stock) */}
      <FreeAmountDialog
        open={showFreeAmount}
        onClose={() => setShowFreeAmount(false)}
        onAdd={({ amount, note }) => {
          setCartItems(prev => [...prev, {
            variant_id: null,
            group_id: null,
            free_id: `free-${Date.now()}`,
            product_name: note ? `סכום חופשי - ${note}` : 'סכום חופשי',
            quantity: 1,
            sell_price: amount,
            cost_price: 0,
            variant_stock: 0,
          }]);
          setShowFreeAmount(false);
          toast({ title: `סכום חופשי ${money(amount)} נוסף לעגלה` });
        }}
      />
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