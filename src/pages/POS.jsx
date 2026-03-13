import React, { useState } from 'react';
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

export default function POS() {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('sort_order'),
  });

  const { data: allGroups = [] } = useQuery({
    queryKey: ['product-groups'],
    queryFn: () => base44.entities.ProductGroup.list(),
  });

  const { data: allVariants = [] } = useQuery({
    queryKey: ['product-variants'],
    queryFn: () => base44.entities.ProductVariant.list(),
  });

  const groups = selectedCategory
    ? allGroups.filter(g => g.category_id === selectedCategory.id)
    : [];

  const saleMutation = useMutation({
    mutationFn: async (paymentMethod) => {
      const totalCost = cartItems.reduce((s, i) => s + (i.cost_price || 0) * i.quantity, 0);
      const total = cartItems.reduce((s, i) => s + i.sell_price * i.quantity, 0);

      const sale = await base44.entities.Sale.create({
        items: cartItems,
        total,
        total_cost: totalCost,
        payment_method: paymentMethod,
      });

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
      toast({ title: '✅ המכירה הושלמה בהצלחה!' });
    },
  });

  const handleGroupSelect = (group) => {
    setSelectedGroup(group);
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
    }]);
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