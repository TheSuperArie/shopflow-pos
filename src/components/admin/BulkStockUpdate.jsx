import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Layers } from 'lucide-react';

/**
 * BulkStockUpdate - allows selecting categories/sub-categories and setting stock
 * for ALL their variants at once.
 */
export default function BulkStockUpdate({ categories, groups, variants, userEmail }) {
  const [checked, setChecked] = useState({}); // { categoryId: true }
  const [stockValues, setStockValues] = useState({}); // { categoryId: number }
  const [confirm, setConfirm] = useState(null); // { categoryId, categoryName, variantIds, value }
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const topLevel = categories.filter(c => !c.parent_id);

  // Get all variant IDs belonging to a category (including sub-categories)
  const getVariantIdsForCategory = (categoryId) => {
    const subCatIds = categories
      .filter(c => c.parent_id === categoryId)
      .map(c => c.id);
    const allCatIds = [categoryId, ...subCatIds];
    const catGroups = groups.filter(g => allCatIds.includes(g.category_id));
    const catVariantIds = variants
      .filter(v => catGroups.some(g => g.id === v.group_id))
      .map(v => v.id);
    return catVariantIds;
  };

  const handleCheck = (catId, checked_) => {
    setChecked(prev => ({ ...prev, [catId]: checked_ }));
    if (!checked_) {
      setStockValues(prev => { const n = { ...prev }; delete n[catId]; return n; });
    }
  };

  const handleApplyClick = (cat) => {
    const value = Number(stockValues[cat.id]);
    if (isNaN(value) || value < 0) return;
    const variantIds = getVariantIdsForCategory(cat.id);
    if (variantIds.length === 0) {
      toast({ title: 'אין וריאציות בקטגוריה זו', duration: 2000 });
      return;
    }
    setConfirm({ categoryId: cat.id, categoryName: cat.name, variantIds, value });
  };

  const bulkMutation = useMutation({
    mutationFn: async ({ variantIds, value }) => {
      await Promise.all(variantIds.map(id => base44.entities.ProductVariant.update(id, { stock: value })));
    },
    onSuccess: (_, { categoryId, categoryName, variantIds, value }) => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      toast({
        title: `✅ עודכנו ${variantIds.length} וריאציות בקטגוריה "${categoryName}"`,
        description: `מלאי הוגדר ל-${value} יחידות`,
        duration: 3000,
        className: 'bg-green-500 text-white border-green-600',
      });
      // Uncheck and clear input after success
      setChecked(prev => { const n = { ...prev }; delete n[categoryId]; return n; });
      setStockValues(prev => { const n = { ...prev }; delete n[categoryId]; return n; });
      setConfirm(null);
    },
    onError: (error) => {
      toast({ title: `❌ שגיאה: ${error.message}`, duration: 4000 });
      setConfirm(null);
    },
  });

  const handleConfirm = () => {
    if (!confirm) return;
    bulkMutation.mutate(confirm);
  };

  return (
    <>
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <Layers className="w-5 h-5" />
            עדכון מלאי בכמות — לפי קטגוריה
          </CardTitle>
          <p className="text-sm text-blue-600 mt-1">סמן קטגוריה, הזן ערך מלאי וקבע לכל הוריאציות בה בבת אחת.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {topLevel.length === 0 && (
            <p className="text-sm text-blue-400 text-center py-4">אין קטגוריות</p>
          )}
          {topLevel.map(cat => {
            const subCats = categories.filter(c => c.parent_id === cat.id);
            const allCatIds = [cat.id, ...subCats.map(s => s.id)];
            const totalVariants = variants.filter(v =>
              groups.filter(g => allCatIds.includes(g.category_id)).some(g => g.id === v.group_id)
            ).length;
            const isChecked = !!checked[cat.id];

            return (
              <div key={cat.id} className="bg-white border-2 border-blue-200 rounded-xl overflow-hidden">
                {/* Category row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={e => handleCheck(cat.id, e.target.checked)}
                    className="w-5 h-5 accent-blue-600 cursor-pointer"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">{cat.name}</p>
                    <p className="text-xs text-gray-500">
                      {subCats.length > 0 ? `${subCats.length} תת-קטגוריות • ` : ''}{totalVariants} וריאציות
                    </p>
                  </div>
                  {isChecked && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        placeholder="מלאי"
                        value={stockValues[cat.id] ?? ''}
                        onChange={e => setStockValues(prev => ({ ...prev, [cat.id]: e.target.value }))}
                        className="w-24 text-center"
                        onClick={e => e.stopPropagation()}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleApplyClick(cat)}
                        disabled={stockValues[cat.id] === '' || stockValues[cat.id] === undefined || bulkMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        החל
                      </Button>
                    </div>
                  )}
                </div>

                {/* Sub-categories (read-only info) */}
                {subCats.length > 0 && isChecked && (
                  <div className="border-t border-blue-100 bg-blue-50 px-6 py-2 flex flex-wrap gap-2">
                    {subCats.map(sc => (
                      <span key={sc.id} className="text-xs bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-3 py-1">
                        {sc.name}
                      </span>
                    ))}
                    <span className="text-xs text-blue-400 self-center">כולן יעודכנו</span>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={!!confirm} onOpenChange={() => setConfirm(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>אישור עדכון מלאי</DialogTitle>
          </DialogHeader>
          {confirm && (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm space-y-1">
                <p className="font-bold text-gray-800">קטגוריה: {confirm.categoryName}</p>
                <p className="text-gray-600">מספר וריאציות: <strong>{confirm.variantIds.length}</strong></p>
                <p className="text-gray-600">ערך מלאי חדש: <strong>{confirm.value} יחידות</strong></p>
              </div>
              <p className="text-sm text-gray-500 text-center">
                האם אתה בטוח שברצונך לעדכן <strong>{confirm.variantIds.length}</strong> וריאציות בקטגוריה "<strong>{confirm.categoryName}</strong>" ל-<strong>{confirm.value}</strong> יחידות?
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={bulkMutation.isPending}>ביטול</Button>
            <Button
              onClick={handleConfirm}
              disabled={bulkMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {bulkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'אשר ועדכן'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}