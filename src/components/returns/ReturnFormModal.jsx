import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Trash2, Link2, CreditCard, X } from 'lucide-react';
import { usePosCatalogQuery } from '@/hooks/usePosCatalog';
import { variantLabel } from '@/lib/supplyOrders';
import SaleLookup, { originalSaleSnapshot, formatSaleDate } from './SaleLookup';

const itemKey = (i) => i.variant_id || `name:${i.product_name}`;
const cleanItem = ({ max_quantity, ...rest }) => rest; // eslint-disable-line no-unused-vars

export default function ReturnFormModal({ open, onClose, branchId = null }) {
  const [form, setForm] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    reason: '',
    refund_method: 'זיכוי',
    notes: '',
  });
  const [selectedItems, setSelectedItems] = useState([]);
  const [exchangeItems, setExchangeItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [exchangeSearchQuery, setExchangeSearchQuery] = useState('');
  // The original sale this return is linked to (optional): { sale, snapshot, returnedBefore }
  const [linked, setLinked] = useState(null);
  const [linking, setLinking] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: groups = [] } = usePosCatalogQuery('product-groups', 'ProductGroup');

  const { data: variants = [] } = usePosCatalogQuery('product-variants', 'ProductVariant');

  const createReturnMutation = useMutation({
    mutationFn: async (data) => {
      const totalAmount = selectedItems.reduce((sum, item) => 
        sum + (item.sell_price * item.quantity), 0
      );

      // Create return with approved status
      const returnRecord = await base44.entities.Return.create({
        ...data,
        branch_id: branchId || null,
        items: selectedItems.map(cleanItem),
        ...(linked ? { sale_id: linked.sale.id, original_sale: linked.snapshot } : {}),
        total_amount: totalAmount,
        status: 'אושר',
        approval_date: format(new Date(), 'yyyy-MM-dd'),
        processed_by: 'system',
        ...(data.refund_method === 'החלפה' && exchangeItems.length > 0
          ? { exchange_items: exchangeItems }
          : {}),
      });

      // Update inventory: returned items go back to stock
      const touchedIds = [
        ...selectedItems.map(i => i.variant_id),
        ...exchangeItems.map(i => i.variant_id),
      ].filter(Boolean);
      const variantsById = new Map(
        (touchedIds.length
          ? await base44.entities.ProductVariant.filter({ id: { $in: touchedIds } })
          : []
        ).map(v => [v.id, v])
      );
      for (const item of selectedItems) {
        const variant = variantsById.get(item.variant_id);
        if (variant) {
          variant.stock = (variant.stock || 0) + item.quantity;
          await base44.entities.ProductVariant.update(variant.id, {
            stock: variant.stock,
          });
        }
      }

      // Exchange: replacement items leave stock
      if (data.refund_method === 'החלפה') {
        for (const item of exchangeItems) {
          const variant = variantsById.get(item.variant_id);
          if (variant) {
            variant.stock = Math.max(0, (variant.stock || 0) - item.quantity);
            await base44.entities.ProductVariant.update(variant.id, {
              stock: variant.stock,
            });
          }
        }
      }

      // Create credit if refund method is זיכוי
      if (data.refund_method === 'זיכוי') {
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 6);
        
        await base44.entities.Credit.create({
          customer_name: data.customer_name,
          customer_email: data.customer_email,
          customer_phone: data.customer_phone,
          amount: totalAmount,
          balance: totalAmount,
          return_id: returnRecord.id,
          expiry_date: format(expiryDate, 'yyyy-MM-dd'),
          status: 'פעיל',
        });
      }

      // Create expense record only for actual cash refunds
      if (data.refund_method === 'החזר כספי') {
        await base44.entities.Expense.create({
          description: `החזרה - ${data.customer_name || 'לקוח'}`,
          amount: totalAmount,
          category: 'אחר',
          custom_category: 'החזרות מוצרים',
          date: format(new Date(), 'yyyy-MM-dd'),
          branch_id: branchId || null,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast({ 
        title: '✅ החזרה בוצעה בהצלחה',
        description: 'המלאי עודכן והזיכוי נוצר',
        duration: 3000,
      });
      handleClose();
    },
  });

  const handleClose = () => {
    setForm({
      customer_name: '',
      customer_email: '',
      customer_phone: '',
      reason: '',
      refund_method: 'זיכוי',
      notes: '',
    });
    setSelectedItems([]);
    setExchangeItems([]);
    setSearchQuery('');
    setExchangeSearchQuery('');
    setLinked(null);
    onClose();
  };

  // Link to the original sale: its items fill the return (minus what was already returned from it)
  const pickSale = async (sale, receiptNumber) => {
    setLinking(true);
    try {
      const earlier = await base44.entities.Return.filter({ sale_id: sale.id }, '-created_date', 50);
      const returnedBefore = new Map();
      earlier.forEach(r => (r.items || []).forEach(i => {
        returnedBefore.set(itemKey(i), (returnedBefore.get(itemKey(i)) || 0) + Number(i.quantity || 0));
      }));
      const items = (sale.items || [])
        .map(i => {
          const left = Number(i.quantity || 0) - (returnedBefore.get(itemKey(i)) || 0);
          return { variant_id: i.variant_id || null, product_name: i.product_name, quantity: left, max_quantity: left, sell_price: Number(i.sell_price || 0) };
        })
        .filter(i => i.quantity > 0);
      setLinked({ sale, snapshot: originalSaleSnapshot(sale, receiptNumber), returnedBefore: earlier.length });
      setSelectedItems(items);
      if (items.length === 0) {
        toast({ title: 'כל הפריטים מהמכירה הזו כבר הוחזרו', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'לא הצלחתי לטעון את המכירה', description: err?.message, variant: 'destructive' });
    } finally {
      setLinking(false);
    }
  };

  const unlink = () => {
    setLinked(null);
    setSelectedItems([]);
  };

  const addItem = (variant, group) => {
    const existingIndex = selectedItems.findIndex(i => i.variant_id === variant.id);
    if (existingIndex >= 0) {
      const updated = [...selectedItems];
      updated[existingIndex].quantity += 1;
      setSelectedItems(updated);
    } else {
      const sellPrice = group.has_uniform_price ? group.uniform_sell_price : variant.sell_price;
      const label = variantLabel(variant);
      setSelectedItems([...selectedItems, {
        variant_id: variant.id,
        product_name: label ? `${group.name} - ${label}` : group.name,
        quantity: 1,
        sell_price: sellPrice,
      }]);
    }
  };

  const removeItem = (index) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };

  const updateQuantity = (index, quantity) => {
    const updated = [...selectedItems];
    const max = updated[index].max_quantity;
    updated[index] = { ...updated[index], quantity: Math.min(max || Infinity, Math.max(1, quantity)) };
    setSelectedItems(updated);
  };

  const filteredVariants = searchQuery.trim().length >= 2
    ? variants.filter(v => {
        const group = groups.find(g => g.id === v.group_id);
        return group?.name.toLowerCase().includes(searchQuery.toLowerCase());
      }).slice(0, 5)
    : [];

  const filteredExchangeVariants = exchangeSearchQuery.trim().length >= 2
    ? variants.filter(v => {
        const group = groups.find(g => g.id === v.group_id);
        return group?.name.toLowerCase().includes(exchangeSearchQuery.toLowerCase());
      }).slice(0, 5)
    : [];

  const addExchangeItem = (variant, group) => {
    const existingIndex = exchangeItems.findIndex(i => i.variant_id === variant.id);
    if (existingIndex >= 0) {
      const updated = [...exchangeItems];
      updated[existingIndex].quantity += 1;
      setExchangeItems(updated);
    } else {
      const sellPrice = group.has_uniform_price ? group.uniform_sell_price : variant.sell_price;
      const label = variantLabel(variant);
      setExchangeItems([...exchangeItems, {
        variant_id: variant.id,
        product_name: label ? `${group.name} - ${label}` : group.name,
        quantity: 1,
        sell_price: sellPrice,
      }]);
    }
  };

  const removeExchangeItem = (index) => {
    setExchangeItems(exchangeItems.filter((_, i) => i !== index));
  };

  const updateExchangeQuantity = (index, quantity) => {
    const updated = [...exchangeItems];
    updated[index].quantity = Math.max(1, quantity);
    setExchangeItems(updated);
  };

  const totalAmount = selectedItems.reduce((sum, item) => 
    sum + (item.sell_price * item.quantity), 0
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>החזרה חדשה</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Original sale — linked by card digits / approval / receipt / amount */}
          {linked ? (
            <div className="rounded-xl border-2 border-[#2E6B4C] bg-[#E3EFE7] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="flex items-center gap-1.5 font-semibold text-[#1E2433]">
                    <Link2 className="w-4 h-4" /> מקושר למכירה מ-{formatSaleDate(linked.sale.created_date)} · ₪{Number(linked.sale.total || 0).toFixed(2)}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-3 text-sm text-gray-700">
                    <span className="flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /> {linked.sale.payment_method || '—'}
                      {linked.snapshot.card_last4 ? ` · ****${linked.snapshot.card_last4}` : ''}</span>
                    {linked.snapshot.credit_ref && <span>אישור {linked.snapshot.credit_ref}</span>}
                    {linked.snapshot.receipt_number && <span>קבלה {linked.snapshot.receipt_number}</span>}
                  </p>
                  {linked.returnedBefore > 0 && (
                    <p className="text-xs text-amber-800">כבר בוצעו {linked.returnedBefore} החזרות מהמכירה הזו — מופיע רק מה שעוד לא הוחזר</p>
                  )}
                </div>
                <button type="button" onClick={unlink} className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-700 shrink-0">
                  <X className="w-4 h-4" /> בטל קישור
                </button>
              </div>
            </div>
          ) : linking ? (
            <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : (
            open && <SaleLookup branchId={branchId} onPick={pickSale} />
          )}

          {/* Customer Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>שם לקוח</Label>
              <Input 
                value={form.customer_name}
                onChange={e => setForm({ ...form, customer_name: e.target.value })}
                placeholder="שם מלא"
              />
            </div>
            <div>
              <Label>טלפון</Label>
              <Input 
                value={form.customer_phone}
                onChange={e => setForm({ ...form, customer_phone: e.target.value })}
                placeholder="05X-XXXXXXX"
              />
            </div>
          </div>

          <div>
            <Label>אימייל (אופציונלי)</Label>
            <Input 
              type="email"
              value={form.customer_email}
              onChange={e => setForm({ ...form, customer_email: e.target.value })}
              placeholder="email@example.com"
            />
          </div>

          {/* Item Selection (a linked sale already filled the items from the sale) */}
          {!linked && <div>
            <Label>חיפוש מוצר להחזרה</Label>
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="הקלד שם מוצר..."
            />
            {filteredVariants.length > 0 && (
              <div className="mt-2 border rounded-lg max-h-40 overflow-y-auto">
                {filteredVariants.map(variant => {
                  const group = groups.find(g => g.id === variant.group_id);
                  return (
                    <button
                      key={variant.id}
                      onClick={() => addItem(variant, group)}
                      className="w-full p-2 text-right hover:bg-gray-50 border-b last:border-0"
                    >
                      <p className="font-medium">{group?.name}</p>
                      <p className="text-sm text-gray-500">{variantLabel(variant) || 'רגיל'}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>}

          {/* Selected Items */}
          {selectedItems.length > 0 && (
            <div className="border rounded-lg p-3 bg-gray-50">
              <p className="font-semibold mb-2">פריטים להחזרה:</p>
              <div className="space-y-2">
                {selectedItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.product_name}</p>
                      <p className="text-xs text-gray-500">₪{item.sell_price} ליחידה{item.max_quantity ? ` · נמכרו ${item.max_quantity}` : ''}</p>
                    </div>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={e => updateQuantity(idx, parseInt(e.target.value) || 1)}
                      className="w-16"
                      min="1"
                      max={item.max_quantity || undefined}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(idx)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t">
                <p className="text-lg font-bold">סה"כ להחזר: ₪{totalAmount.toFixed(2)}</p>
              </div>
            </div>
          )}

          {/* Exchange Items (only for החלפה) */}
          {form.refund_method === 'החלפה' && (
            <div className="border rounded-lg p-3 bg-purple-50">
              <p className="font-semibold mb-2">מוצרים חלופיים (יוצאים מהמלאי):</p>
              <Input
                value={exchangeSearchQuery}
                onChange={e => setExchangeSearchQuery(e.target.value)}
                placeholder="הקלד שם מוצר חלופי..."
              />
              {filteredExchangeVariants.length > 0 && (
                <div className="mt-2 border rounded-lg max-h-40 overflow-y-auto">
                  {filteredExchangeVariants.map(variant => {
                    const group = groups.find(g => g.id === variant.group_id);
                    return (
                      <button
                        key={variant.id}
                        onClick={() => addExchangeItem(variant, group)}
                        className="w-full p-2 text-right hover:bg-gray-50 border-b last:border-0"
                      >
                        <p className="font-medium">{group?.name}</p>
                        <p className="text-sm text-gray-500">{variantLabel(variant) || 'רגיל'}</p>
                      </button>
                    );
                  })}
                </div>
              )}
              {exchangeItems.length > 0 && (
                <div className="mt-2 space-y-2">
                  {exchangeItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.product_name}</p>
                        <p className="text-xs text-gray-500">₪{item.sell_price} ליחידה</p>
                      </div>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={e => updateExchangeQuantity(idx, parseInt(e.target.value) || 1)}
                        className="w-16"
                        min="1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeExchangeItem(idx)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {exchangeItems.length === 0 && (
                <p className="text-xs text-purple-700 mt-2">
                  חובה לבחור לפחות מוצר חלופי אחד להשלמת ההחלפה
                </p>
              )}
            </div>
          )}

          {/* Return Details */}
          <div>
            <Label>סיבת ההחזרה *</Label>
            <Textarea
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              placeholder="למה הלקוח מחזיר את המוצר?"
              rows={3}
            />
          </div>

          <div>
            <Label>אופן ההחזר</Label>
            <Select value={form.refund_method} onValueChange={v => setForm({ ...form, refund_method: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="זיכוי">זיכוי (תוקף 6 חודשים)</SelectItem>
                <SelectItem value="החזר כספי">החזר כספי</SelectItem>
                <SelectItem value="החלפה">החלפה במוצר אחר</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>הערות (אופציונלי)</Label>
            <Textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="הערות נוספות..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            ביטול
          </Button>
          <Button
            onClick={() => createReturnMutation.mutate(form)}
            disabled={
              !form.customer_name ||
              !form.reason ||
              selectedItems.length === 0 ||
              (form.refund_method === 'החלפה' && exchangeItems.length === 0) ||
              createReturnMutation.isPending
            }
            className="bg-purple-600 hover:bg-purple-700"
          >
            {createReturnMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'יצירת החזרה'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}