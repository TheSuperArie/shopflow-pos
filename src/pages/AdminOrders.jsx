import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, ShoppingCart, AlertCircle, Package, CheckCircle } from 'lucide-react';

export default function AdminOrders() {
  const [threshold, setThreshold] = useState(5);

  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['product-groups'],
    queryFn: () => base44.entities.ProductGroup.list(),
  });

  const { data: variants = [], isLoading: loadingVariants } = useQuery({
    queryKey: ['product-variants'],
    queryFn: () => base44.entities.ProductVariant.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list(),
  });

  // Generate order suggestions
  const orderSuggestions = {};
  
  groups.forEach(group => {
    const groupVariants = variants.filter(v => v.group_id === group.id);
    const lowStockVariants = groupVariants.filter(v => (v.stock || 0) < threshold);
    
    if (lowStockVariants.length > 0) {
      const category = categories.find(c => c.id === group.category_id);
      
      if (!orderSuggestions[group.id]) {
        orderSuggestions[group.id] = {
          groupName: group.name,
          categoryName: category?.name || 'אחר',
          image_url: group.image_url,
          variants: [],
        };
      }
      
      lowStockVariants.forEach(v => {
        orderSuggestions[group.id].variants.push({
          size: v.size,
          cut: v.cut,
          collar: v.collar,
          currentStock: v.stock || 0,
          suggestedOrder: Math.max(10 - (v.stock || 0), 5), // Suggest to reach 10 units or at least 5
        });
      });
    }
  });

  const orderList = Object.values(orderSuggestions);
  const totalItemsToOrder = orderList.reduce((sum, group) => sum + group.variants.length, 0);

  if (loadingGroups || loadingVariants) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800">ריכוז הזמנות לספקים</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">סף מלאי:</span>
          <Input
            type="number"
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="w-20"
            min="1"
          />
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
              <p className="text-xs text-gray-500 mt-1">מ-{orderList.length} תיקיות מוצרים</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Order List */}
      {orderList.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <p className="text-xl font-semibold text-gray-700">כל המלאי תקין!</p>
            <p className="text-gray-500 mt-2">אין מוצרים שצריך להזמין כרגע</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orderList.map((order, idx) => (
            <Card key={idx}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {order.image_url ? (
                      <img src={order.image_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Package className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-lg">{order.groupName}</CardTitle>
                      <Badge variant="outline" className="mt-1">{order.categoryName}</Badge>
                    </div>
                  </div>
                  <Badge className="bg-orange-500">{order.variants.length} וריאציות</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {order.variants.map((v, vIdx) => (
                    <div key={vIdx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="w-4 h-4 text-orange-500" />
                        <div>
                          <p className="font-medium text-sm">
                            מידה {v.size} | {v.cut} | {v.collar}
                          </p>
                          <p className="text-xs text-gray-500">
                            מלאי נוכחי: <span className="font-semibold text-red-600">{v.currentStock}</span> יחידות
                          </p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-xs text-gray-500">מומלץ להזמין</p>
                        <p className="text-lg font-bold text-amber-600">{v.suggestedOrder} יחידות</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Print/Export Button */}
      {orderList.length > 0 && (
        <div className="flex justify-center pt-4">
          <Button
            onClick={() => window.print()}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Package className="w-4 h-4" />
            הדפס רשימת הזמנות
          </Button>
        </div>
      )}
    </div>
  );
}