import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { AlertTriangle, Loader2, Trash2, PackageX, ArchiveX } from 'lucide-react';

const ACTIONS = [
  {
    id: 'reset_inventory',
    label: 'איפוס מלאי',
    description: 'יאפס את כמות המלאי ל-0 עבור כל הוריאציות שלך',
    icon: PackageX,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 border-orange-200',
    btnColor: 'bg-orange-500 hover:bg-orange-600',
  },
  {
    id: 'clear_sales',
    label: 'מחיקת היסטוריית מכירות',
    description: 'ימחק את כל המכירות, הקבלות ורשומות העסקאות שלך',
    icon: ArchiveX,
    color: 'text-red-500',
    bgColor: 'bg-red-50 border-red-200',
    btnColor: 'bg-red-500 hover:bg-red-600',
  },
  {
    id: 'clear_catalog',
    label: 'מחיקת קטלוג',
    description: 'ימחק את כל המוצרים, הקטגוריות, תת-הקטגוריות, הוריאציות והממדים שלך',
    icon: Trash2,
    color: 'text-red-700',
    bgColor: 'bg-red-100 border-red-300',
    btnColor: 'bg-red-700 hover:bg-red-800',
  },
];

async function batchDelete(fetchFn, deleteFn) {
  const items = await fetchFn();
  await Promise.all(items.map(item => deleteFn(item.id)));
  return items.length;
}

export default function DangerZone({ user }) {
  const [activeAction, setActiveAction] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isConfirmed = confirmText === 'RESET' || confirmText === 'איפוס';

  const handleOpen = (action) => {
    setActiveAction(action);
    setConfirmText('');
  };

  const handleClose = () => {
    if (loading) return;
    setActiveAction(null);
    setConfirmText('');
  };

  const invalidateAll = () => {
    // Clear the entire cache so ALL pages re-fetch fresh data from server
    queryClient.clear();
  };

  const handleConfirm = async () => {
    if (!isConfirmed || !user?.email) return;
    setLoading(true);
    try {
      const email = user.email;

      if (activeAction.id === 'reset_inventory') {
        const variants = await base44.entities.ProductVariant.filter({ created_by: email });
        await Promise.all(variants.map(v => base44.entities.ProductVariant.update(v.id, { stock: 0 })));
        invalidateAll();
        toast({ title: '✅ המלאי אופס בהצלחה', duration: 3000, className: 'bg-green-500 text-white' });
      }

      if (activeAction.id === 'clear_sales') {
        // Step 1: Fetch all sales and restore their stock back to variants
        const sales = await base44.entities.Sale.filter({ created_by: email });
        const variants = await base44.entities.ProductVariant.filter({ created_by: email });

        // Build a stock-delta map: variant_id → total quantity to restore
        const stockDelta = {};
        for (const sale of sales) {
          for (const item of (sale.items || [])) {
            if (item.variant_id) {
              stockDelta[item.variant_id] = (stockDelta[item.variant_id] || 0) + (item.quantity || 0);
            }
          }
        }

        // Apply restorations
        const restorePromises = Object.entries(stockDelta).map(([variantId, qty]) => {
          const variant = variants.find(v => v.id === variantId);
          if (!variant) return Promise.resolve();
          return base44.entities.ProductVariant.update(variantId, {
            stock: (variant.stock || 0) + qty,
          });
        });
        await Promise.all(restorePromises);

        // Step 2: Delete all sales, receipts, returns, credits
        await Promise.all(sales.map(s => base44.entities.Sale.delete(s.id)));
        await batchDelete(
          () => base44.entities.Receipt.filter({ created_by: email }),
          (id) => base44.entities.Receipt.delete(id)
        );
        await batchDelete(
          () => base44.entities.Return.filter({ created_by: email }),
          (id) => base44.entities.Return.delete(id)
        );
        await batchDelete(
          () => base44.entities.Credit.filter({ created_by: email }),
          (id) => base44.entities.Credit.delete(id)
        );

        invalidateAll();
        toast({ title: '✅ היסטוריית המכירות נמחקה והמלאי שוחזר', duration: 3000, className: 'bg-green-500 text-white' });
      }

      if (activeAction.id === 'clear_catalog') {
        // Delete in dependency order: variants → flexible variants → groups → dimensions → categories
        await batchDelete(
          () => base44.entities.ProductVariant.filter({ created_by: email }),
          (id) => base44.entities.ProductVariant.delete(id)
        );
        await batchDelete(
          () => base44.entities.FlexibleVariant.filter({ created_by: email }),
          (id) => base44.entities.FlexibleVariant.delete(id)
        );
        await batchDelete(
          () => base44.entities.ProductGroup.filter({ created_by: email }),
          (id) => base44.entities.ProductGroup.delete(id)
        );
        await batchDelete(
          () => base44.entities.VariantDimension.filter({ created_by: email }),
          (id) => base44.entities.VariantDimension.delete(id)
        );
        await batchDelete(
          () => base44.entities.Category.filter({ created_by: email }),
          (id) => base44.entities.Category.delete(id)
        );
        invalidateAll();
        toast({ title: '✅ הקטלוג נמחק בהצלחה', duration: 3000, className: 'bg-green-500 text-white' });
      }

      handleClose();
    } catch (err) {
      toast({ title: `❌ שגיאה: ${err.message}`, duration: 5000, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="border-2 border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700 text-lg">
            <AlertTriangle className="w-5 h-5" /> אזור מסוכן
          </CardTitle>
          <p className="text-sm text-gray-500">פעולות אלו בלתי הפיכות. יש להשתמש בזהירות.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {ACTIONS.map(action => {
            const Icon = action.icon;
            return (
              <div key={action.id} className={`flex items-center justify-between p-3 rounded-xl border ${action.bgColor}`}>
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${action.color}`} />
                  <div>
                    <p className={`font-semibold text-sm ${action.color}`}>{action.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{action.description}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className={`${action.btnColor} text-white shrink-0 mr-2`}
                  onClick={() => handleOpen(action)}
                >
                  בצע
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!activeAction} onOpenChange={handleClose}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" /> אישור פעולה מסוכנת
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              <p className="font-semibold mb-1">{activeAction?.label}</p>
              <p>{activeAction?.description}</p>
              <p className="mt-2 font-bold">פעולה זו בלתי הפיכה!</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-2">
                כדי לאשר, הקלד <strong className="text-red-600">RESET</strong> או <strong className="text-red-600">איפוס</strong> בשדה למטה:
              </p>
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="הקלד RESET או איפוס"
                className="text-center font-mono"
                autoFocus
                disabled={loading}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleClose} disabled={loading}>ביטול</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
              onClick={handleConfirm}
              disabled={!isConfirmed || loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              אשר ובצע
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}