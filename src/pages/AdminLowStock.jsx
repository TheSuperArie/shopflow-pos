import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Package, Loader2, ChevronDown } from 'lucide-react';
import VariantDimensionFolders from '@/components/admin/VariantDimensionFolders';
import { useInventorySync } from '@/hooks/useInventorySync';

export default function AdminLowStock() {
  const [expandedCategory, setExpandedCategory] = useState(null);
  const queryClient = useQueryClient();
  useInventorySync();

  // Force fresh data fetch on component mount
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['product-variants'] });
    queryClient.invalidateQueries({ queryKey: ['product-groups'] });
    queryClient.invalidateQueries({ queryKey: ['categories'] });
  }, [queryClient]);

  const { data: settings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const list = await base44.entities.AppSettings.list();
      return list[0] || { low_stock_threshold: 5 };
    },
  });

  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['product-groups'],
    queryFn: () => base44.entities.ProductGroup.list(),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: variants = [], isLoading: variantsLoading } = useQuery({
    queryKey: ['product-variants'],
    queryFn: () => base44.entities.ProductVariant.list(),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('sort_order'),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const isLoading = groupsLoading || variantsLoading;
  const threshold = settings?.low_stock_threshold || 5;

  // Filter low stock variants - include ALL variants below threshold
  const lowStockVariants = variants.filter(v => (v.stock || 0) < threshold);

  // Group by category first, then by product group
  const categorizedLowStock = {};
  
  // Initialize all categories first to ensure all are shown
  categories.forEach(cat => {
    categorizedLowStock[cat.id] = {
      category: { id: cat.id, name: cat.name },
      groups: {},
      totalVariants: 0,
    };
  });
  
  // Then process all variants
  lowStockVariants.forEach(variant => {
    const group = groups.find(g => g.id === variant.group_id);
    if (!group) return; // Skip if group not found
    
    const category = categories.find(c => c.id === group.category_id);
    const categoryId = category?.id || 'no-category';
    const categoryName = category?.name || 'ללא קטגוריה';

    if (!categorizedLowStock[categoryId]) {
      categorizedLowStock[categoryId] = {
        category: { id: categoryId, name: categoryName },
        groups: {},
        totalVariants: 0,
      };
    }

    if (!categorizedLowStock[categoryId].groups[group.id]) {
      categorizedLowStock[categoryId].groups[group.id] = {
        group,
        variants: [],
      };
    }

    categorizedLowStock[categoryId].groups[group.id].variants.push(variant);
    categorizedLowStock[categoryId].totalVariants++;
  });

  const categorizedData = Object.values(categorizedLowStock)
    .filter(cat => cat.totalVariants > 0)
    .map(cat => ({
      ...cat,
      groups: Object.values(cat.groups),
    }));

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">מלאי חסר</h1>
          <p className="text-sm text-gray-500 mt-1">מוצרים עם מלאי מתחת ל-{threshold} יחידות</p>
        </div>
        <div className="flex items-center gap-3 bg-red-50 px-4 py-2 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-800">{lowStockVariants.length} וריאציות</p>
            <p className="text-xs text-red-600">דורשות תשומת לב</p>
          </div>
        </div>
      </div>

      {categorizedData.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Package className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-lg font-semibold text-gray-700">מצוין! המלאי תקין</p>
              <p className="text-sm text-gray-500 mt-1">אין מוצרים עם מלאי נמוך</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {categorizedData.map(({ category, groups, totalVariants }) => {
            const isExpanded = expandedCategory === category.id;
            
            return (
              <div key={category.id} className="border-2 border-red-300 rounded-xl overflow-hidden">
                {/* Category Header - Clickable */}
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : category.id)}
                  className="sticky top-0 z-10 w-full bg-red-200 p-4 flex items-center justify-between border-b-2 border-red-300 hover:bg-red-250 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center">
                      <Package className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-right">
                      <h3 className="font-bold text-red-900 text-lg">{category.name}</h3>
                      <p className="text-sm text-red-700">{groups.length} מוצרים • {totalVariants} וריאציות</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className="bg-red-700 text-white text-sm px-3 py-1">
                      {totalVariants} חסרות
                    </Badge>
                    <ChevronDown className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                
                {/* Products in Category - Expandable */}
                {isExpanded && (
                  <div className="bg-white p-4 space-y-3">
                    {groups.map(({ group, variants }) => (
                      <Card key={group.id} className="border-red-200 bg-gray-50">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              {group.image_url && (
                                <img 
                                  src={group.image_url} 
                                  alt={group.name} 
                                  className="w-14 h-14 object-cover rounded-lg"
                                />
                              )}
                              <div>
                                <CardTitle className="text-base">{group.name}</CardTitle>
                                <p className="text-xs text-gray-500 mt-1">
                                  {group.has_uniform_price && `מחיר: ₪${group.uniform_sell_price}`}
                                </p>
                              </div>
                            </div>
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                              {variants.length} וריאציות
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <VariantDimensionFolders
                            variants={[...variants].sort((a, b) => (a.stock || 0) - (b.stock || 0))}
                            group={group}
                            badgeColor="bg-red-600"
                            folderBg="bg-red-50"
                            folderBorder="border-red-200"
                            renderVariant={(variant) => {
                              const stock = variant.stock || 0;
                              const isCritical = stock === 0;
                              const dimText = variant.dimensions && Object.keys(variant.dimensions).length > 0
                                ? Object.entries(variant.dimensions).map(([k, v]) => `${k}: ${v}`).join(' • ')
                                : 'רגיל';
                              return (
                                <div className={`flex items-center justify-between p-3 rounded-lg ${
                                  isCritical ? 'bg-red-100 border border-red-300' : 'bg-white border border-gray-200'
                                }`}>
                                  <div className="flex items-center gap-3">
                                    {isCritical && <AlertTriangle className="w-4 h-4 text-red-600" />}
                                    <div>
                                      <p className="font-medium text-gray-800 text-sm">{dimText}</p>
                                      {!group.has_uniform_price && (
                                        <p className="text-xs text-gray-500">מחיר: ₪{variant.sell_price}</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-left">
                                    <p className={`text-xl font-bold ${isCritical ? 'text-red-700' : 'text-orange-600'}`}>{stock}</p>
                                    <p className="text-xs text-gray-500">במלאי</p>
                                  </div>
                                </div>
                              );
                            }}
                          />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {categorizedData.length > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-sm text-blue-800">💡 טיפ</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-700">
              ניתן לעדכן את סף המלאי הנמוך בעמוד <strong>הגדרות</strong>. כרגע, המערכת מציגה התראה למוצרים עם פחות מ-{threshold} יחידות.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}