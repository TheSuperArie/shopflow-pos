import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import CategoryGrid from '@/components/pos/CategoryGrid';
import ProductGrid from '@/components/pos/ProductGrid';
import Cart from '@/components/pos/Cart';
import VariantSelectorModal from '@/components/pos/VariantSelectorModal';
import CheckoutModal from '@/components/pos/CheckoutModal';
import SmartSearch from '@/components/pos/SmartSearch';
import ReceiptModal from '@/components/pos/ReceiptModal';
import OnlineStatus from '@/components/pos/OnlineStatus';
import { offlineManager } from '@/components/pos/offlineManager';

export default function POS() {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [useCache, setUseCache] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Online/Offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setUseCache(false);
      queryClient.invalidateQueries();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setUseCache(true);
      toast({
        title: '⚠️ מצב לא מקוון',
        description: 'עובד עם מלאי שמור מקומית',
        duration: 4000,
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [queryClient, toast]);

  // Fetch from API or cache
  const { data: categories = [], isLoading: loadingCat } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      if (useCache || !isOnline) {
        const cached = offlineManager.getCachedInventory();
        return cached.categories;
      }
      const data = await base44.entities.Category.list('sort_order');
      return data;
    },
  });

  const { data: allGroups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['product-groups'],
    queryFn: async () => {
      if (useCache || !isOnline) {
        const cached = offlineManager.getCachedInventory();
        return cached.groups;
      }
      const data = await base44.entities.ProductGroup.list();
      return data;
    },
  });

  const { data: allVariants = [], isLoading: loadingVar } = useQuery({
    queryKey: ['product-variants'],
    queryFn: async () => {
      if (useCache || !isOnline) {
        const cached = offlineManager.getCachedInventory();
        return cached.variants;
      }
      const data = await base44.entities.ProductVariant.list();
      return data;
    },
  });

  // Cache data when online
  useEffect(() => {
    if (isOnline && categories.length > 0 && allGroups.length > 0 && allVariants.length > 0) {
      offlineManager.cacheInventoryData(categories, allGroups, allVariants);
    }
  }, [categories, allGroups, allVariants, isOnline]);

  const groups = selectedCategory
    ? allGroups.filter(g => g.category_id === selectedCategory.id)
    : [];

  const saleMutation = useMutation({
    mutationFn: async (paymentMethod) => {
      const totalCost = cartItems.reduce((s, i) => s + (i.cost_price || 0) * i.quantity, 0);
      const total = cartItems.reduce((s, i) => s + i.sell_price * i.quantity, 0);

      const saleData = {
        items: cartItems,
        total,
        total_cost: totalCost,
        payment_method: paymentMethod,
        created_date: new Date().toISOString(),
      };

      // If offline, save to pending sales
      if (!isOnline) {
        offlineManager.addPendingSale(saleData);
        
        // Update local cache
        const cached = offlineManager.getCachedInventory();
        const updatedVariants = cached.variants.map(v => {
          const item = cartItems.find(i => i.variant_id === v.id);
          if (item) {
            return { ...v, stock: Math.max(0, (v.stock || 0) - item.quantity) };
          }
          return v;
        });
        offlineManager.cacheInventoryData(cached.categories, cached.groups, updatedVariants);
        queryClient.invalidateQueries({ queryKey: ['product-variants'] });
        
        return { ...saleData, id: 'offline_' + Date.now() };
      }

      // If online, save normally
      const sale = await base44.entities.Sale.create(saleData);

      for (const item of cartItems) {
        if (item.variant_id) {
          const variant = allVariants.find(v => v.id === item.variant_id);
          if (variant) {
            await base44.entities.ProductVariant.update(variant.id, {
              stock: Math.max(0, (variant.stock || 0) - item.quantity),
            });
          }
        }
      }

      return sale;
    },
    onSuccess: (sale) => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      setLastSale(sale);
      setCartItems([]);
      setShowCheckout(false);
      setShowCart(false);
      setShowReceipt(true);
      
      if (!isOnline) {
        toast({ 
          title: '✅ המכירה נשמרה מקומית',
          description: 'תסונכרן אוטומטית כשתתחבר לאינטרנט',
        });
      } else {
        toast({ title: '✅ המכירה הושלמה בהצלחה!' });
      }
    },
  });

  const handleSync = () => {
    queryClient.invalidateQueries();
  };

  const handleGroupSelect = (group) => {
    setSelectedGroup(group);
  };

  const handleBarcodeSelect = (variant, group) => {
    const sellPrice = group.has_uniform_price ? group.uniform_sell_price : variant.sell_price;
    const costPrice = group.has_uniform_price ? group.uniform_cost_price : variant.cost_price;
    
    setCartItems(prev => [...prev, {
      variant_id: variant.id,
      product_name: `${group.name} - מידה ${variant.size}, ${variant.cut}, ${variant.collar}`,
      quantity: 1,
      sell_price: sellPrice,
      cost_price: costPrice || 0,
      shirt_size: variant.size,
      shirt_collar: variant.collar,
      shirt_cut: variant.cut,
      variant_stock: variant.stock || 0,
    }]);
    
    toast({ 
      title: '✅ נוסף לעגלה',
      description: `${group.name} - מידה ${variant.size}`,
      duration: 1500,
    });
  };

  const handleVariantConfirm = (variant, group) => {
    const sellPrice = group.has_uniform_price ? group.uniform_sell_price : variant.sell_price;
    const costPrice = group.has_uniform_price ? group.uniform_cost_price : variant.cost_price;
    
    setCartItems(prev => [...prev, {
      variant_id: variant.id,
      product_name: `${group.name} - מידה ${variant.size}, ${variant.cut}, ${variant.collar}`,
      quantity: 1,
      sell_price: sellPrice,
      cost_price: costPrice || 0,
      shirt_size: variant.size,
      shirt_collar: variant.collar,
      shirt_cut: variant.cut,
      variant_stock: variant.stock || 0,
    }]);
    
    toast({ 
      title: '✅ נוסף לעגלה',
      description: `${group.name} - מידה ${variant.size}`,
      duration: 1500,
    });
    
    setSelectedGroup(null);
  };

  const updateCartQty = (idx, newQty) => {
    if (newQty <= 0) {
      setCartItems(prev => prev.filter((_, i) => i !== idx));
    } else {
      setCartItems(prev => prev.map((item, i) => i === idx ? { ...item, quantity: newQty } : item));
    }
  };

  const removeCartItem = (idx) => {
    setCartItems(prev => prev.filter((_, i) => i !== idx));
  };

  const cartTotal = cartItems.reduce((s, i) => s + i.sell_price * i.quantity, 0);

  return (
    <div dir="rtl" className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <h1 className="text-xl font-bold text-gray-800">🛍️ קופה</h1>
        <div className="flex items-center gap-3">
          <OnlineStatus onSync={handleSync} />
          {/* Mobile cart toggle */}
          <button
            onClick={() => setShowCart(!showCart)}
            className="lg:hidden relative p-2 rounded-xl bg-amber-50 text-amber-600"
          >
            <ShoppingCart className="w-6 h-6" />
            {cartItems.length > 0 && (
              <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
                {cartItems.length}
              </span>
            )}
          </button>
          <Link
            to="/AdminLogin"
            className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <Settings className="w-5 h-5" />
          </Link>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Products side */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Smart Search */}
          <SmartSearch 
            groups={allGroups}
            variants={allVariants}
            categories={categories}
            onSelectGroup={handleGroupSelect}
            onSelectVariant={handleBarcodeSelect}
          />
          
          {!selectedCategory ? (
            <>
              <h2 className="text-lg font-bold text-gray-700">בחר קטגוריה</h2>
              <CategoryGrid
                categories={categories}
                selectedCategory={selectedCategory}
                onSelect={setSelectedCategory}
              />
            </>
          ) : (
            <>
              <CategoryGrid
                categories={categories}
                selectedCategory={selectedCategory}
                onSelect={(cat) => setSelectedCategory(cat)}
              />
              <div className="mt-4">
                <h2 className="text-lg font-bold text-gray-700 mb-3">{selectedCategory.name}</h2>
                <ProductGrid 
                  groups={groups} 
                  variants={allVariants}
                  onSelect={handleGroupSelect} 
                />
              </div>
            </>
          )}
        </div>

        {/* Cart side - Desktop */}
        <div className="hidden lg:flex w-[380px] border-r border-gray-200 bg-gray-50 p-4 flex-col">
          <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" /> עגלת קניות
          </h2>
          <Cart
            items={cartItems}
            onUpdateQty={updateCartQty}
            onRemove={removeCartItem}
            onCheckout={() => setShowCheckout(true)}
          />
        </div>

        {/* Cart side - Mobile overlay */}
        {showCart && (
          <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setShowCart(false)}>
            <div
              className="absolute left-0 top-0 bottom-0 w-[85%] max-w-[400px] bg-white p-4 shadow-xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" /> עגלת קניות
              </h2>
              <Cart
                items={cartItems}
                onUpdateQty={updateCartQty}
                onRemove={removeCartItem}
                onCheckout={() => setShowCheckout(true)}
              />
            </div>
          </div>
        )}
      </div>

      <VariantSelectorModal
        open={!!selectedGroup}
        group={selectedGroup}
        variants={allVariants.filter(v => v.group_id === selectedGroup?.id)}
        onConfirm={handleVariantConfirm}
        onClose={() => setSelectedGroup(null)}
      />

      <CheckoutModal
        open={showCheckout}
        total={cartTotal}
        onConfirm={(method) => saleMutation.mutate(method)}
        onClose={() => setShowCheckout(false)}
        isProcessing={saleMutation.isPending}
      />

      <ReceiptModal
        open={showReceipt}
        sale={lastSale}
        onClose={() => {
          setShowReceipt(false);
          setLastSale(null);
        }}
      />
    </div>
  );
}