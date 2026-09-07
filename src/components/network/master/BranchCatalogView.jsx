import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw } from 'lucide-react';

/**
 * Read-only view of a branch station's own catalog — the products its POS
 * actually shows (including catalog received via catalog sharing).
 * Refreshed on demand via the "רענן" button.
 */
export default function BranchCatalogView({ branch }) {
  const station = branch.station_email;

  const { data: categories = [], isLoading: loadingCats, refetch: refetchCats } = useQuery({
    queryKey: ['branch-catalog-categories', station],
    queryFn: () => base44.entities.Category.filter({ created_by: station }),
    enabled: !!station,
  });
  const { data: groups = [], isLoading: loadingGroups, refetch: refetchGroups } = useQuery({
    queryKey: ['branch-catalog-groups', station],
    queryFn: () => base44.entities.ProductGroup.filter({ created_by: station }),
    enabled: !!station,
  });

  const loading = loadingCats || loadingGroups;

  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));
  const byCategory = groups.reduce((acc, g) => {
    const catId = g.category_id || 'uncategorized';
    if (!acc[catId]) acc[catId] = [];
    acc[catId].push(g);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-600">
          קטלוג הסניף: {groups.length} מוצרים · {categories.length} קטגוריות
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { refetchCats(); refetchGroups(); }}
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ml-1 ${loading ? 'animate-spin' : ''}`} />
          רענן
        </Button>
      </div>

      {Object.entries(byCategory).map(([catId, catGroups]) => (
        <Card key={catId}>
          <CardContent className="p-4">
            <p className="font-semibold text-gray-700 mb-3 text-sm border-b pb-2">
              {categoryMap[catId]?.name || 'ללא קטגוריה'}
            </p>
            <div className="space-y-2">
              {catGroups.map(g => (
                <div key={g.id} className="flex items-center justify-between py-1.5">
                  <span className="text-sm font-medium text-gray-900">{g.name}</span>
                  {g.uniform_sell_price ? (
                    <Badge variant="outline" className="text-xs">₪{g.uniform_sell_price}</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">ללא מחיר</Badge>
                  )}
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
    </div>
  );
}