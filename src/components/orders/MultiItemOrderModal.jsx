import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Search, Package, Plus, Trash2, ShoppingCart } from 'lucide-react';

export default function MultiItemOrderModal({ open, onClose, branch, tenantEmail }) {
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  // cart: [{ variant, qty }]
  const [cart, setCart] = useState([]);
  const [notes, setNotes] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: groups = [] } = useQuery({
    queryKey: ['product-groups', tenantEmail],
    queryFn: () => base44.entities.ProductGroup.filter({ created_by: tenantEmail }),
    enabled: open && !!tenantEmail,
  });

  const { data: allVariants = [] } = useQuery({
    queryKey: ['flexible-variants-all', tenantEmail],
    queryFn: () => base44.entities.FlexibleVariant.filter({ created_by: tenantEmail }),
    enabled: open && !!tenantEmail,
  });

  const groupMap = Object.fromEntries(groups.map(g => [g.id, g]));

  const getVariantLabel = (v, grp) => {
    const g = grp || groupMap[v.group_id];
    const dimStr = v.dimensions ? Object.values(v.dimensions).filter(Boolean).join(' / ') : '';
    return [g?.name, dimStr].filter(Boolean).join(' — ');
  };

  // Search: match group name, barcode, sku
  const searchLower = search.toLowerCase();
  const matchedGroups = search.length > 0
    ? groups.filter(g =>
        g.name?.toLowerCase().includes(searchLower) ||
        g.barcode?.toLowerCase().includes(searchLower)
      )
    : [];

  // Variants for selected group
  const groupVariants = selectedGroup
    ? allVariants.filter(v => v.group_id === selectedGroup.id)
    : [];

  // Cart item quantity update
  const setCartQty = (variantId, qty) => {
    setCart(prev => prev.map(item => item.variant.id === variantId ? { ...item, qty } : item));
  };

  const addToCart = (variant) => {
    setCart(prev => {
      const exists = prev.find(i => i.variant.id === variant.id);
      if (exists) return prev.map(i => i.variant.id === variant.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { variant, qty: 1 }];
    });
  };

  const removeFromCart = (variantId) => {
    setCart(prev => prev.filter(i => i.variant.id !== variantId));
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!branch || cart.length === 0) return;
      // 1. Create the OrderTicket
      const ticket = await base44.entities.OrderTicket.create({
        tenant_email: tenantEmail,
        branch_id: branch.id,
        branch_name: branch.name,
        status: 'pending',
        notes,
        total_items: cart.length,
      });
      // 2. Create StockRequest per cart item
      await Promise.all(cart.map(item =>
        base44.entities.StockRequest.create({
          tenant_email: tenantEmail,
          branch_id: branch.id,
          ticket_id: ticket.id,
          variant_id: item.variant.id,
          variant_label: getVariantLabel(item.variant),
          requested_qty: item.qty,
          status: 'pending',
          notes,
        })
      ));
      return ticket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['stock-requests'] });
      queryClient.invalidateQueries({ queryKey: ['stock-requests-all'] });
      toast({ title: '✅ ההזמנה נשלחה בהצלחה', duration: 2000 });
      handleClose();
    },
  });

  const handleClose = () => {
    setCart([]);
    setSearch('');
    setSelectedGroup(null);
    setNotes('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-amber-500" />
            בקשת הזמנה חדשה
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
          {/* Search */}
          <div>
            <Label className="mb-1 block">חיפוש מוצר (שם / ברקוד / SKU)</Label>
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <Input
                className="pr-9"
                placeholder="הקלד שם מוצר, ברקוד או SKU..."
                value={search}
                onChange={e => { setSearch(e.target.value); setSelectedGroup(null); }}
              />
            </div>

            {/* Search Results */}
            {search && !selectedGroup && (
              <div className="border rounded-lg mt-1 max-h-44 overflow-y-auto shadow-sm">
                {matchedGroups.length === 0 ? (
                  <p className="p-3 text-sm text-gray-400">לא נמצאו תוצאות</p>
                ) : matchedGroups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => { setSelectedGroup(g); setSearch(g.name); }}
                    className="w-full text-right px-3 py-2 hover:bg-amber-50 text-sm border-b last:border-0 flex items-center gap-2"
                  >
                    {g.image_url
                      ? <img src={g.image_url} alt="" className="w-8 h-8 rounded object-cover" />
                      : <Package className="w-4 h-4 text-gray-300 shrink-0" />
                    }
                    <span>{g.name}</span>
                    {g.barcode && <span className="text-xs text-gray-400 mr-auto">#{g.barcode}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Variant selector for selected group */}
          {selectedGroup && (
            <div className="border rounded-xl p-3 bg-amber-50/50">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-gray-800">{selectedGroup.name} — בחר וריאציות</p>
                <button onClick={() => { setSelectedGroup(null); setSearch(''); }} className="text-xs text-gray-400 hover:text-red-500">✕ סגור</button>
              </div>
              {groupVariants.length === 0 ? (
                <p className="text-sm text-gray-400">אין וריאציות</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {groupVariants.map(v => {
                    const label = getVariantLabel(v, selectedGroup);
                    const inCart = cart.find(i => i.variant.id === v.id);
                    return (
                      <div key={v.id} className="flex items-center justify-between bg-white rounded-lg border px-3 py-2">
                        <span className="text-sm text-gray-700">{label}</span>
                        <div className="flex items-center gap-2">
                          {v.sku && <span className="text-xs text-gray-400">SKU: {v.sku}</span>}
                          <Button
                            size="sm"
                            variant={inCart ? 'secondary' : 'outline'}
                            className="h-7 px-3 text-xs gap-1"
                            onClick={() => addToCart(v)}
                          >
                            <Plus className="w-3 h-3" />
                            {inCart ? `הוסף עוד (${inCart.qty})` : 'הוסף'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Cart */}
          {cart.length > 0 && (
            <div>
              <Label className="mb-2 block">סל ההזמנה ({cart.length} פריטים)</Label>
              <div className="border rounded-xl overflow-hidden divide-y">
                {cart.map(({ variant, qty }) => (
                  <div key={variant.id} className="flex items-center justify-between px-3 py-2 bg-white">
                    <span className="text-sm text-gray-700 flex-1 truncate">{getVariantLabel(variant)}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Input
                        type="number"
                        min={1}
                        value={qty}
                        onChange={e => setCartQty(variant.id, Number(e.target.value))}
                        className="w-16 h-7 text-center text-sm"
                      />
                      <span className="text-xs text-gray-400">יח'</span>
                      <button onClick={() => removeFromCart(variant.id)} className="text-gray-300 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label className="mb-1 block">הערות להזמנה (אופציונלי)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="דחיפות, הוראות מיוחדות..." />
          </div>
        </div>

        <DialogFooter className="pt-3 border-t">
          <Button variant="outline" onClick={handleClose}>ביטול</Button>
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={cart.length === 0 || submitMutation.isPending}
            className="gap-2"
          >
            <ShoppingCart className="w-4 h-4" />
            שלח הזמנה ({cart.length} פריטים)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}