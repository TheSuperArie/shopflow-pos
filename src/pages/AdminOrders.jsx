import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, ShoppingCart, AlertCircle, Package, CheckCircle, ChevronDown } from 'lucide-react';
import VariantDimensionFolders from '@/components/admin/VariantDimensionFolders';
import ShipmentCheckbox from '@/components/shipment/ShipmentCheckbox';
import { useInventorySync } from '@/hooks/useInventorySync';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export default function AdminOrders() {
  const [threshold, setThreshold] = useState(5);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [expandedGroup, setExpandedGroup] = useState(null);
  useInventorySync();
  const user = useCurrentUser();

  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['product-groups', user?.email],
    queryFn: () => user ? base44.entities.ProductGroup.filter({ created_by: user.email }) : [],
    enabled: !!user,
  });

  const { data: variants = [], isLoading: loadingVariants } = useQuery({
    queryKey: ['product-variants', user?.email],
    queryFn: () => user ? base44.entities.ProductVariant.filter({ created_by: user.email }) : [],
    enabled: !!user,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', user?.email],
    queryFn: () => user ? base44.entities.Category.filter({ created_by: user.email }, 'sort_order') : [],
    enabled: !!user,
  });

  // Build category → group → variants hierarchy
  const byCategory = {};
  categories.forEach(cat => { byCategory[cat.id] = { category: cat, groups: [] }; });

  groups.forEach(group => {
    const lowStockVariants = variants.filter(v => v.group_id === group.id && (v.stock || 0) < threshold);
    if (lowStockVariants.length === 0) return;
    const catId = group.category_id;
    if (!byCategory[catId]) byCategory[catId] = { category: { id: catId, name: 'ללא קטגוריה' }, groups: [] };
    byCategory[catId].groups.push({ group, variants: lowStockVariants });
  });

  const categoryList = Object.values(byCategory).filter(c => c.groups.length > 0);
  const totalItemsToOrder = categoryList.reduce((sum, c) => sum + c.groups.reduce((s, g) => s + g.variants.length, 0), 0);

  if (loadingGroups || loadingVariants) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800">ריכוז הזמנות לספקים</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">סף מלאי:</span>
          <Input type="number" value={threshold} onChange={e => setThreshold(Number(e.target.value))} className="w-20" min="1" />
        </div>
      </div>

      {/* Summary Card */}
      <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">פריטים להזמנה</p>
              <p className="text-3xl font-bold text-amber-700">{totalItemsToOrder}</p>
              <p className="text-xs text-gray-500 mt-1">ב-{categoryList.length} קטגוריות</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {categoryList.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <p className="text-xl font-semibold text-gray-700">כל המלאי תקין!</p>
            <p className="text-gray-500 mt-2">אין מוצרים שצריך להזמין כרגע</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {categoryList.map(({ category, groups: catGroups }) => {
            const isCatOpen = expandedCategory === category.id;
            const catTotal = catGroups.reduce((s, g) => s + g.variants.length, 0);
            return (
              <div key={category.id} className="border-2 border-amber-300 rounded-xl overflow-hidden">
                {/* Category Level */}
                <button
                  onClick={() => setExpandedCategory(isCatOpen ? null : category.id)}
                  className="w-full bg-amber-100 p-4 flex items-center justify-between hover:bg-amber-150 transition-colors border-b-2 border-amber-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center">
                      <Package className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-right">
                      <h3 className="font-bold text-amber-900 text-lg">{category.name}</h3>
                      <p className="text-sm text-amber-700">{catGroups.length} מוצרים • {catTotal} וריאציות</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-amber-600 text-white">{catTotal}</Badge>
                    <ChevronDown className={`w-5 h-5 text-amber-700 transition-transform ${isCatOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isCatOpen && (
                  <div className="bg-white p-4 space-y-3">
                    {catGroups.map(({ group, variants: gVariants }) => {
                      const isGroupOpen = expandedGroup === group.id;
                      return (
                        <div key={group.id} className="border-2 border-gray-200 rounded-xl overflow-hidden">
                          {/* Group Level */}
                          <button
                            onClick={() => setExpandedGroup(isGroupOpen ? null : group.id)}
                            className="w-full bg-gray-50 p-3 flex items-center justify-between hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              {group.image_url ? (
                                <img src={group.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                                  <Package className="w-5 h-5 text-gray-400" />
                                </div>
                              )}
                              <span className="font-semibold text-gray-800">{group.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className="bg-orange-500 text-white">{gVariants.length}</Badge>
                              <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isGroupOpen ? 'rotate-180' : ''}`} />
                            </div>
                          </button>

                          {isGroupOpen && (
                            <div className="bg-white p-3">
                              <VariantDimensionFolders
                                variants={gVariants}
                                group={group}
                                badgeColor="bg-orange-500"
                                folderBg="bg-orange-50"
                                folderBorder="border-orange-200"
                                renderVariant={(v) => {
                                  const dimText = v.dimensions && Object.keys(v.dimensions).length > 0
                                    ? Object.entries(v.dimensions).map(([k, val]) => `${k}: ${val}`).join(' | ')
                                    : v.sku || 'מוצר בודד';
                                  const suggested = Math.max(10 - (v.stock || 0), 5);
                                  return (
                                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                                      <div className="flex items-center gap-3">
                                        <AlertCircle className="w-4 h-4 text-orange-500 shrink-0" />
                                        <div>
                                          <p className="font-medium text-sm">{dimText}</p>
                                          <p className="text-xs text-gray-500">מלאי: <span className="font-semibold text-red-600">{v.stock || 0}</span></p>
                                        </div>
                                      </div>
                                      <div className="text-left">
                                        <p className="text-xs text-gray-500">מומלץ להזמין</p>
                                        <p className="text-lg font-bold text-amber-600">{suggested} יח'</p>
                                      </div>
                                    </div>
                                  );
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {categoryList.length > 0 && (
        <div className="flex justify-center pt-4">
          <Button onClick={() => window.print()} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Package className="w-4 h-4" /> הדפס רשימת הזמנות
          </Button>
        </div>
      )}
    </div>
  );
}