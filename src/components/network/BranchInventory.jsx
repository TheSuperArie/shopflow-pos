import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save } from 'lucide-react';

export default function BranchInventory({ branch, tenantEmail }) {
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState({});

  // All visible groups for this branch (no hidden overrides)
  const { data: allGroups = [] } = useQuery({
    queryKey: ['productGroups', tenantEmail],
    queryFn: () => base44.entities.ProductGroup.filter({ created_by: tenantEmail }),
  });

  const { data: visibilityRecords = [] } = useQuery({
    queryKey: ['branchVisibility', branch.id],
    queryFn: () => base44.entities.BranchProductVisibility.filter({ branch_id: branch.id }),
  });

  const { data: allVariants = [] } = useQuery({
    queryKey: ['flexibleVariants', tenantEmail],
    queryFn: () => base44.entities.FlexibleVariant.filter({ created_by: tenantEmail }),
  });

  const { data: branchStocks = [] } = useQuery({
    queryKey: ['branchStocks', branch.id],
    queryFn: () => base44.entities.BranchVariantStock.filter({ branch_id: branch.id }),
  });

  const saveMutation = useMutation({
    mutationFn: async ({ variantId, qty }) => {
      const existing = branchStocks.find(s => s.variant_id === variantId);
      if (existing) {
        await base44.entities.BranchVariantStock.update(existing.id, { stock: Number(qty) });
      } else {
        await base44.entities.BranchVariantStock.create({
          branch_id: branch.id,
          variant_id: variantId,
          stock: Number(qty),
          tenant_email: tenantEmail,
        });
      }
    },
    onSuccess: (_, { variantId }) => {
      queryClient.invalidateQueries({ queryKey: ['branchStocks', branch.id] });
      setEdits(p => { const n = { ...p }; delete n[variantId]; return n; });
    },
  });

  const isGroupVisible = (groupId) => {
    const rec = visibilityRecords.find(r => r.product_group_id === groupId);
    return !rec || rec.is_visible !== false;
  };

  const visibleGroups = allGroups.filter(g => isGroupVisible(g.id));

  const getStock = (variantId) => {
    const rec = branchStocks.find(s => s.variant_id === variantId);
    return rec?.stock ?? 0;
  };

  const formatDimensions = (dims) =>
    Object.values(dims || {}).filter(Boolean).join(' / ');

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        עדכן את כמות המלאי הספציפית לסניף זה. מוצרים מוסתרים לא מוצגים כאן.
      </p>

      {visibleGroups.map(group => {
        const variants = allVariants.filter(v => v.group_id === group.id);
        if (variants.length === 0) return null;

        return (
          <Card key={group.id}>
            <CardContent className="p-4">
              <p className="font-semibold text-gray-800 mb-3 text-sm border-b pb-2">{group.name}</p>
              <div className="space-y-2">
                {variants.map(variant => {
                  const currentStock = getStock(variant.id);
                  const editVal = edits[variant.id];
                  const isDirty = editVal !== undefined && Number(editVal) !== currentStock;

                  return (
                    <div key={variant.id} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-700 flex-1">
                        {formatDimensions(variant.dimensions) || 'ברירת מחדל'}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          גלובלי: {variant.stock ?? 0}
                        </Badge>
                        <Input
                          type="number"
                          min="0"
                          className="w-20 h-8 text-center text-sm"
                          value={editVal !== undefined ? editVal : currentStock}
                          onChange={e => setEdits(p => ({ ...p, [variant.id]: e.target.value }))}
                        />
                        {isDirty && (
                          <Button
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => saveMutation.mutate({ variantId: variant.id, qty: editVal })}
                            disabled={saveMutation.isPending}
                          >
                            <Save className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {visibleGroups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            כל המוצרים מוסתרים בסניף זה
          </CardContent>
        </Card>
      )}
    </div>
  );
}