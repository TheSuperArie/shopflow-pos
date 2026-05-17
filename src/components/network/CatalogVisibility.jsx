import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function CatalogVisibility({ branch, tenantEmail }) {
  const queryClient = useQueryClient();

  const { data: allGroups = [] } = useQuery({
    queryKey: ['productGroups', tenantEmail],
    queryFn: () => base44.entities.ProductGroup.filter({ created_by: tenantEmail }),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', tenantEmail],
    queryFn: () => base44.entities.Category.filter({ created_by: tenantEmail }),
  });

  // Load existing visibility overrides for this branch
  const { data: visibilityRecords = [] } = useQuery({
    queryKey: ['branchVisibility', branch.id],
    queryFn: () => base44.entities.BranchProductVisibility.filter({ branch_id: branch.id }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ group, currentlyVisible }) => {
      const existing = visibilityRecords.find(r => r.product_group_id === group.id);
      if (currentlyVisible) {
        // Hide: create or update record with is_visible=false
        if (existing) {
          await base44.entities.BranchProductVisibility.update(existing.id, { is_visible: false });
        } else {
          await base44.entities.BranchProductVisibility.create({
            branch_id: branch.id,
            product_group_id: group.id,
            is_visible: false,
          });
        }
      } else {
        // Show: delete record (absence = visible) or set true
        if (existing) {
          await base44.entities.BranchProductVisibility.update(existing.id, { is_visible: true });
        }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branchVisibility', branch.id] }),
  });

  const isVisible = (groupId) => {
    const rec = visibilityRecords.find(r => r.product_group_id === groupId);
    return !rec || rec.is_visible !== false;
  };

  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));

  // Group products by category
  const byCategory = allGroups.reduce((acc, g) => {
    const catId = g.category_id || 'uncategorized';
    if (!acc[catId]) acc[catId] = [];
    acc[catId].push(g);
    return acc;
  }, {});

  const hiddenCount = allGroups.filter(g => !isVisible(g.id)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {allGroups.length} מוצרים בקטלוג — {hiddenCount} מוסתרים בסניף זה
        </p>
        <Badge variant={hiddenCount > 0 ? 'destructive' : 'default'}>
          {allGroups.length - hiddenCount} גלויים
        </Badge>
      </div>

      {Object.entries(byCategory).map(([catId, groups]) => {
        const cat = categoryMap[catId];
        return (
          <Card key={catId}>
            <CardContent className="p-4">
              <p className="font-semibold text-gray-700 mb-3 text-sm border-b pb-2">
                {cat?.name || 'ללא קטגוריה'}
              </p>
              <div className="space-y-2">
                {groups.map(group => {
                  const visible = isVisible(group.id);
                  return (
                    <div key={group.id} className="flex items-center justify-between py-1.5">
                      <div>
                        <span className={`text-sm font-medium ${visible ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                          {group.name}
                        </span>
                        {group.uniform_sell_price && (
                          <span className="text-xs text-gray-400 mr-2">₪{group.uniform_sell_price}</span>
                        )}
                      </div>
                      <Switch
                        checked={visible}
                        onCheckedChange={() => toggleMutation.mutate({ group, currentlyVisible: visible })}
                        disabled={toggleMutation.isPending}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {allGroups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            אין מוצרים בקטלוג עדיין
          </CardContent>
        </Card>
      )}
    </div>
  );
}