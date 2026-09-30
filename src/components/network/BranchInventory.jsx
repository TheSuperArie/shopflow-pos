import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import { fetchBranchCatalogRecords } from '@/lib/branchCatalog';

/**
 * Edit a branch's stock from the network side. Reads and writes the branch's own
 * ProductVariant records — the same stock the branch POS sells from — so there is
 * one number per variant (the old separate BranchVariantStock table is no longer used here).
 */
export default function BranchInventory({ branch }) {
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState({});

  const { data: groups = [] } = useQuery({
    queryKey: ['branch-catalog-groups', branch.id],
    queryFn: () => fetchBranchCatalogRecords(base44.entities.ProductGroup, branch),
    enabled: !!branch?.id,
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['branch-stock-variants', branch.id],
    queryFn: () => fetchBranchCatalogRecords(base44.entities.ProductVariant, branch),
    enabled: !!branch?.id,
  });

  const saveMutation = useMutation({
    mutationFn: ({ variantId, qty }) => base44.entities.ProductVariant.update(variantId, { stock: Math.max(0, Number(qty) || 0) }),
    onSuccess: (_, { variantId }) => {
      queryClient.invalidateQueries({ queryKey: ['branch-stock-variants', branch.id] });
      setEdits(p => { const n = { ...p }; delete n[variantId]; return n; });
    },
  });

  const visibleGroups = groups.filter(g => g.is_active !== false);
  const formatDimensions = (dims) => Object.values(dims || {}).filter(Boolean).join(' / ');

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        המלאי של הסניף — אותו מלאי שהקופה של הסניף עובדת איתו.
      </p>

      {visibleGroups.map(group => {
        const groupVariants = variants.filter(v => v.group_id === group.id);
        if (groupVariants.length === 0) return null;

        return (
          <Card key={group.id}>
            <CardContent className="p-4">
              <p className="font-semibold text-gray-800 mb-3 text-sm border-b pb-2">{group.name}</p>
              <div className="space-y-2">
                {groupVariants.map(variant => {
                  const currentStock = variant.stock ?? 0;
                  const editVal = edits[variant.id];
                  const isDirty = editVal !== undefined && Number(editVal) !== currentStock;

                  return (
                    <div key={variant.id} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-700 flex-1">
                        {formatDimensions(variant.dimensions) || 'ברירת מחדל'}
                      </span>
                      <div className="flex items-center gap-2">
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
            אין מוצרים בקטלוג של הסניף
          </CardContent>
        </Card>
      )}
    </div>
  );
}
