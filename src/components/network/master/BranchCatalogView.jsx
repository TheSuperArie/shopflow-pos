import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { RefreshCw, Plus, Pencil, Trash2 } from 'lucide-react';
import { fetchBranchCatalogRecords } from '@/lib/branchCatalog';
import BranchCategoryManager from './BranchCategoryManager';
import BranchProductFormModal from './BranchProductFormModal';

/**
 * Editable view of a branch's catalog — the products its POS shows.
 * Edits save straight onto the branch's records, and products the network owner
 * adds are stamped with branch_id so the branch POS picks them up with no approval.
 */
export default function BranchCatalogView({ branch }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(null); // { group } | { group: null }

  const catalog = useQuery({
    queryKey: ['branch-catalog', branch.id],
    queryFn: async () => {
      const [categories, groups, variants] = await Promise.all([
        fetchBranchCatalogRecords(base44.entities.Category, branch, 'sort_order'),
        fetchBranchCatalogRecords(base44.entities.ProductGroup, branch, 'name'),
        fetchBranchCatalogRecords(base44.entities.ProductVariant, branch),
      ]);
      return { categories, groups, variants };
    },
    enabled: !!branch?.id,
  });

  const { categories = [], groups = [], variants = [] } = catalog.data || {};
  const loading = catalog.isLoading;
  const reload = () => catalog.refetch();

  const deleteProduct = async (group) => {
    if (!window.confirm(`למחוק את המוצר "${group.name}" מקטלוג הסניף?`)) return;
    try {
      await Promise.all(
        variants.filter(v => v.group_id === group.id).map(v => base44.entities.ProductVariant.delete(v.id))
      );
      await base44.entities.ProductGroup.delete(group.id);
      toast({ title: 'המוצר נמחק' });
      reload();
    } catch (e) {
      toast({ title: 'המחיקה נכשלה', description: e?.message, variant: 'destructive' });
    }
  };

  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));
  const byCategory = groups.reduce((acc, g) => {
    const catId = g.category_id || 'uncategorized';
    (acc[catId] = acc[catId] || []).push(g);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-600">
          קטלוג הסניף: {groups.length} מוצרים · {categories.length} קטגוריות — עריכה כאן מתעדכנת מיד בקופת הסניף
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ml-1 ${loading ? 'animate-spin' : ''}`} />
            רענן
          </Button>
          <Button size="sm" onClick={() => setEditing({ group: null })} disabled={categories.length === 0}>
            <Plus className="w-3.5 h-3.5 ml-1" /> מוצר חדש
          </Button>
        </div>
      </div>

      <BranchCategoryManager branch={branch} categories={categories} groups={groups} onChanged={reload} />

      {Object.entries(byCategory).map(([catId, catGroups]) => (
        <Card key={catId}>
          <CardContent className="p-4">
            <p className="font-semibold text-gray-700 mb-3 text-sm border-b pb-2">
              {categoryMap[catId]?.name || 'ללא קטגוריה'}
            </p>
            <div className="space-y-1">
              {catGroups.map(g => (
                <div key={g.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-sm font-medium text-gray-900 flex-1">{g.name}</span>
                  {g.is_active === false && <Badge variant="secondary" className="text-xs">מושבת</Badge>}
                  <Badge variant="outline" className="text-xs">
                    {g.uniform_sell_price ? `₪${g.uniform_sell_price}` : 'מחיר לפי וריאנט'}
                  </Badge>
                  <span className="text-xs text-gray-400">
                    {variants.filter(v => v.group_id === g.id).length} וריאנטים
                  </span>
                  <button onClick={() => setEditing({ group: g })} className="p-2 rounded-lg hover:bg-gray-100">
                    <Pencil className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <button onClick={() => deleteProduct(g)} className="p-2 rounded-lg hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {!loading && groups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            אין מוצרים בקטלוג של הסניף
          </CardContent>
        </Card>
      )}

      <BranchProductFormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        branch={branch}
        categories={categories}
        group={editing?.group || null}
        variants={editing?.group ? variants.filter(v => v.group_id === editing.group.id) : []}
        onSaved={reload}
      />
    </div>
  );
}