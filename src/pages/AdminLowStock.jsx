import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Package, Loader2 } from 'lucide-react';
import StockCategoryTree from '@/components/stock/StockCategoryTree';
import BulkStockActionBar from '@/components/stock/BulkStockActionBar';
import { useInventorySync } from '@/hooks/useInventorySync';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePosCatalogQuery } from '@/hooks/usePosCatalog';

export default function AdminLowStock() {
  const queryClient = useQueryClient();
  useInventorySync();
  const user = useCurrentUser();

  // Force fresh data fetch on component mount
  useEffect(() => {
    const refreshAll = () => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      queryClient.invalidateQueries({ queryKey: ['product-groups'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    };

    refreshAll();

    window.addEventListener('online', refreshAll);
    return () => window.removeEventListener('online', refreshAll);
  }, [queryClient]);

  const { data: settings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const list = await base44.entities.AppSettings.list();
      return list[0] || { low_stock_threshold: 5 };
    },
  });

  // Own catalog + products the network master added for this branch (same scope as the POS)
  const freshness = { refetchOnMount: 'always', refetchOnWindowFocus: true, staleTime: 60000 };
  const { data: groups = [], isPending: groupsLoading } = usePosCatalogQuery('product-groups', 'ProductGroup', freshness);
  const { data: variants = [], isPending: variantsLoading } = usePosCatalogQuery('product-variants', 'ProductVariant', { ...freshness, refetchInterval: 60000 });
  const { data: categories = [] } = usePosCatalogQuery('categories', 'Category', { ...freshness, sort: 'sort_order' });

  const { data: allDimensions = [] } = useQuery({
    queryKey: ['variant-dimensions', user?.email],
    queryFn: () => user ? base44.entities.VariantDimension.filter({ created_by: user.email }) : [],
    enabled: !!user,
    staleTime: 60000,
  });

  const isLoading = groupsLoading || variantsLoading;
  const threshold = settings?.low_stock_threshold || 5;

  // All variants below the threshold — grouped into the category tree by the tree itself
  const lowStockVariants = variants.filter(v => (v.stock || 0) < threshold);
  const hasData = lowStockVariants.length > 0;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
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

      {!hasData ? (
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
        <StockCategoryTree
          categories={categories}
          groups={groups}
          variants={lowStockVariants}
          allDimensions={allDimensions}
          threshold={threshold}
        />
      )}

      {hasData && (
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-sm text-blue-800">💡 טיפ</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-700">
              סמן מידות (גם מכמה מוצרים וקטגוריות יחד) ועדכן את המלאי של כולן בבת אחת מהסרגל התחתון.
              ניתן לעדכן את סף המלאי הנמוך בעמוד <strong>הגדרות</strong>.
            </p>
          </CardContent>
        </Card>
      )}

      <BulkStockActionBar variants={variants} />
    </div>
  );
}