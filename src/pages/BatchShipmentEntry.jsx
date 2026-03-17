import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useShipmentBatch } from '@/lib/ShipmentBatchContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, ChevronLeft, Trash2, Package, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function BatchShipmentEntry() {
  const navigate = useNavigate();
  const { selectedItems, shipmentDetails, updateShipmentDetails, clearBatch, removeItem } = useShipmentBatch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [removingItem, setRemovingItem] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['product-groups'],
    queryFn: () => base44.entities.ProductGroup.list(),
  });

  // Fetch all variants to get database cost prices
  const { data: allVariants = [] } = useQuery({
    queryKey: ['product-variants'],
    queryFn: () => base44.entities.ProductVariant.list(),
  });

  // Build item cost map: fetch actual database cost prices for each selected item
  const itemCosts = selectedItems.map(item => {
    const variant = allVariants.find(v => v.id === item.id);
    const group = groups.find(g => g.id === item.group_id);
    
    // Get cost price: variant-level or group-level
    const costPrice = group?.has_uniform_price
      ? (group?.uniform_cost_price || 0)
      : (variant?.cost_price || 0);
    
    return {
      id: item.id,
      costPrice,
      hasCost: costPrice > 0,
    };
  });

  // Check for missing costs
  const itemsWithMissingCost = itemCosts.filter(ic => !ic.hasCost);
  const hasAcknowledgedMissingCost = shipmentDetails.acknowledgeZeroCost === true;
  const canSubmit = itemsWithMissingCost.length === 0 || hasAcknowledgedMissingCost;

  // Calculate precise debt based on database costs
  const calculatePreciseDebt = () => {
    return itemCosts.reduce((total, ic) => {
      return total + (ic.costPrice * shipmentDetails.quantity);
    }, 0);
  };

  const preciseTotalDebt = calculatePreciseDebt();

  // Batch update mutation with precise cost-price calculation
  const batchUpdateMutation = useMutation({
    mutationFn: async () => {
      const supplier = suppliers.find(s => s.id === shipmentDetails.supplier_id);
      
      // Calculate precise total debt from database costs
      const totalDebt = itemCosts.reduce((total, ic) => {
        return total + (ic.costPrice * shipmentDetails.quantity);
      }, 0);

      const updatePromises = selectedItems.map(item =>
        base44.entities.ProductVariant.update(item.id, {
          stock: (item.stock || 0) + (shipmentDetails.quantity || 0),
        })
      );

      // Create stock updates for tracking
      const updates = selectedItems.map((item, idx) => {
        const group = groups.find(g => g.id === item.group_id);
        const dimText = item.dimensions && Object.keys(item.dimensions).length > 0
          ? Object.entries(item.dimensions).map(([k, v]) => `${k}: ${v}`).join(', ')
          : 'רגיל';
        const itemCost = itemCosts[idx];
        return {
          product_id: item.id,
          product_name: `${group?.name || 'מוצר'} - ${dimText}`,
          quantity_added: shipmentDetails.quantity,
          supplier_id: shipmentDetails.supplier_id,
          supplier_name: shipmentDetails.supplier_name,
          order_id: shipmentDetails.order_id,
          arrival_date: format(new Date(), 'yyyy-MM-dd'),
          notes: shipmentDetails.notes,
          cost_price: itemCost.costPrice,
        };
      });

      await Promise.all(updatePromises);
      await Promise.all(updates.map(u => base44.entities.StockUpdate.create(u)));

      // Update supplier debt with precise calculated amount
      if (supplier && totalDebt > 0) {
        const currentDebt = supplier.total_debt || 0;
        await base44.entities.Supplier.update(supplier.id, {
          total_debt: currentDebt + totalDebt,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      queryClient.invalidateQueries({ queryKey: ['stock-updates'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast({
        title: `✅ ${selectedItems.length} פריטים עודכנו + חוב מדויק עודכן`,
        duration: 2000,
      });
      clearBatch();
      navigate('/AdminStock');
    },
  });

  if (selectedItems.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto">
          <Button variant="outline" onClick={() => navigate(-1)} className="mb-6 gap-2">
            <ChevronLeft className="w-4 h-4" /> חזור
          </Button>
          <Card className="text-center py-12">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">לא נבחרו פריטים</p>
            <Button onClick={() => navigate('/AdminStock')} className="mt-4">
              חזור לעדכון מלאי
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const isFormValid =
    selectedItems.length > 0 &&
    shipmentDetails.supplier_name &&
    shipmentDetails.quantity > 0 &&
    shipmentDetails.cost_price > 0;

  return (
    <div className="min-h-screen bg-gray-50 p-6 pb-24">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">עדכון מלאי בקבוצה</h1>
            <p className="text-sm text-gray-500 mt-1">{selectedItems.length} פריטים נבחרו</p>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
            <ChevronLeft className="w-4 h-4" /> חזור
          </Button>
        </div>

        {/* Selected Items List */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">פריטים נבחרים</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {selectedItems.map(item => {
                const dimText = item.dimensions && Object.keys(item.dimensions).length > 0
                  ? Object.entries(item.dimensions).map(([k, v]) => `${k}: ${v}`).join(' • ')
                  : 'רגיל';
                return (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{dimText}</p>
                      <p className="text-xs text-gray-500">מלאי נוכחי: {item.stock || 0}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(item.id);
                      }}
                      className="text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Shipment Details Form */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">פרטי משלוח</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Supplier */}
            <div>
              <Label>ספק *</Label>
              <div className="flex gap-2">
                <input
                  type="text"
                  list="suppliers-list"
                  value={shipmentDetails.supplier_name}
                  onChange={e => {
                    updateShipmentDetails({ supplier_name: e.target.value });
                    const supplier = suppliers.find(s => s.name === e.target.value);
                    if (supplier) {
                      updateShipmentDetails({ supplier_id: supplier.id });
                    }
                  }}
                  placeholder="בחר או הקלד שם ספק"
                  className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1"
                />
                <datalist id="suppliers-list">
                  {suppliers.map(s => <option key={s.id} value={s.name} />)}
                </datalist>
              </div>
            </div>

            {/* Quantity */}
            <div>
              <Label>כמות לכל פריט *</Label>
              <Input
                type="number"
                min="1"
                value={shipmentDetails.quantity}
                onChange={e => updateShipmentDetails({ quantity: Number(e.target.value) })}
                placeholder="40"
              />
              <p className="text-xs text-gray-500 mt-1">
                סה״כ: {shipmentDetails.quantity * selectedItems.length} יחידות לכל הפריטים
              </p>
            </div>

            {/* Cost Price */}
            <div>
              <Label>מחיר עלות ליחידה *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={shipmentDetails.cost_price || ''}
                onChange={e => updateShipmentDetails({ cost_price: e.target.value })}
                placeholder="50.00"
              />
              {shipmentDetails.quantity > 0 && shipmentDetails.cost_price && (
                <p className="text-xs text-amber-600 mt-1 font-semibold">
                  סה״כ חוב: ₪{(parseFloat(shipmentDetails.cost_price) * shipmentDetails.quantity * selectedItems.length).toLocaleString('he-IL', { maximumFractionDigits: 2 })}
                </p>
              )}
            </div>

            {/* Invoice Number */}
            <div>
              <Label>מספר חשבונית / משלוח</Label>
              <Input
                value={shipmentDetails.invoice_number}
                onChange={e => updateShipmentDetails({ invoice_number: e.target.value })}
                placeholder="למשל: INV-2026-001"
              />
            </div>

            {/* Order ID */}
            <div>
              <Label>מספר הזמנה</Label>
              <Input
                value={shipmentDetails.order_id}
                onChange={e => updateShipmentDetails({ order_id: e.target.value })}
                placeholder="מספר הזמנה מהספק"
              />
            </div>

            {/* Notes */}
            <div>
              <Label>הערות</Label>
              <Textarea
                value={shipmentDetails.notes}
                onChange={e => updateShipmentDetails({ notes: e.target.value })}
                placeholder="הערות נוספות על המשלוח"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-600">פריטים</p>
                <p className="text-2xl font-bold text-blue-600">{selectedItems.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">כמות לפריט</p>
                <p className="text-2xl font-bold text-blue-600">{shipmentDetails.quantity}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">סה״כ יחידות</p>
                <p className="text-2xl font-bold text-green-600">
                  {shipmentDetails.quantity * selectedItems.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">ספק</p>
                <p className="text-sm font-bold text-gray-800">{shipmentDetails.supplier_name || '—'}</p>
              </div>
            </div>
            {shipmentDetails.cost_price && (
              <div className="mt-4 pt-4 border-t border-blue-300">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">סה״כ חוב לספק:</span>
                  <p className="text-2xl font-bold text-red-600">
                    ₪{(parseFloat(shipmentDetails.cost_price) * shipmentDetails.quantity * selectedItems.length).toLocaleString('he-IL', { maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="flex-1"
          >
            ביטול
          </Button>
          <Button
            onClick={() => setShowConfirm(true)}
            disabled={!isFormValid || batchUpdateMutation.isPending}
            className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
          >
            {batchUpdateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Package className="w-4 h-4" />
            )}
            עדכן {selectedItems.length} פריטים
          </Button>
        </div>
      </div>



      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>אישור עדכון מלאי</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              עמוד לעדכון <strong>{selectedItems.length}</strong> פריטים עם <strong>{shipmentDetails.quantity}</strong> יחידות לכל אחד?
            </p>
            <p className="text-gray-600">
              <strong>ספק:</strong> {shipmentDetails.supplier_name}
            </p>
            {shipmentDetails.invoice_number && (
              <p className="text-gray-600">
                <strong>חשבונית:</strong> {shipmentDetails.invoice_number}
              </p>
            )}
            <p className="font-bold text-blue-600">
              סה״כ: {shipmentDetails.quantity * selectedItems.length} יחידות
            </p>
            {shipmentDetails.cost_price && (
              <p className="font-bold text-red-600">
                חוב לספק: ₪{(parseFloat(shipmentDetails.cost_price) * shipmentDetails.quantity * selectedItems.length).toLocaleString('he-IL', { maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>ביטול</Button>
            <Button
              onClick={() => {
                batchUpdateMutation.mutate();
                setShowConfirm(false);
              }}
              disabled={batchUpdateMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {batchUpdateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'אישור עדכון'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}