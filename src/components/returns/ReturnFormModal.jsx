import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Plus, Trash2 } from 'lucide-react';

export default function ReturnFormModal({ open, onClose }) {
  const [form, setForm] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    reason: '',
    refund_method: 'זיכוי',
    notes: '',
  });
  const [selectedItems, setSelectedItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: groups = [] } = useQuery({
    queryKey: ['product-groups'],
    queryFn: () => base44.entities.ProductGroup.list(),
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['product-variants'],
    queryFn: () => base44.entities.ProductVariant.list(),
  });

  const createReturnMutation = useMutation({
    mutationFn: async (data) => {
      const totalAmount = selectedItems.reduce((sum, item) => 
        sum + (item.sell_price * item.quantity), 0
      );

      await base44.entities.Return.create({
        ...data,
        items: selectedItems,
        total_amount: totalAmount,
        status: 'ממתין',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      toast({ 
        title: '✅ החזרה נוצרה בהצלחה',
        description: 'ממתינה לאישור',
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
    setSearchQuery('');
    onClose();
  };

  const addItem = (variant, group) => {
    const existingIndex = selectedItems.findIndex(i => i.variant_id === variant.id);
    if (existingIndex >= 0) {
      const updated = [...selectedItems];
      updated[existingIndex].quantity += 1;
      setSelectedItems(updated);
    } else {
      const sellPrice = group.has_uniform_price ? group.uniform_sell_price : variant.sell_price;
      setSelectedItems([...selectedItems, {
        variant_id: variant.id,
        product_name: `${group.name} - מידה ${variant.size}, ${variant.cut}, ${variant.collar}`,
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
    updated[index].quantity = Math.max(1, quantity);
    setSelectedItems(updated);
  };

  const filteredVariants = searchQuery.trim().length >= 2
    ? variants.filter(v => {
        const group = groups.find(g => g.id === v.group_id);
        return group?.name.toLowerCase().includes(searchQuery.toLowerCase());
      }).slice(0, 5)
    : [];

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

          {/* Item Selection */}
          <div>
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
                      <p className="text-sm text-gray-500">
                        מידה {variant.size} | {variant.cut} | {variant.collar}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Items */}
          {selectedItems.length > 0 && (
            <div className="border rounded-lg p-3 bg-gray-50">
              <p className="font-semibold mb-2">פריטים להחזרה:</p>
              <div className="space-y-2">
                {selectedItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.product_name}</p>
                      <p className="text-xs text-gray-500">₪{item.sell_price} ליחידה</p>
                    </div>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={e => updateQuantity(idx, parseInt(e.target.value) || 1)}
                      className="w-16"
                      min="1"
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
            disabled={!form.customer_name || !form.reason || selectedItems.length === 0 || createReturnMutation.isPending}
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