import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw } from 'lucide-react';

/**
 * Read-only view of a branch station's own inventory — the stock levels its
 * POS actually holds (FlexibleVariant records owned by the station account).
 * Refreshed on demand via the "רענן" button.
 */
export default function BranchStockView({ branch }) {
  const station = branch.station_email;

  const { data: groups = [], isLoading: loadingGroups, refetch: refetchGroups } = useQuery({
    queryKey: ['branch-catalog-groups', station],
    queryFn: () => base44.entities.ProductGroup.filter({ created_by: station }),
    enabled: !!station,
  });
  const { data: variants = [], isLoading: loadingVariants, refetch: refetchVariants } = useQuery({
    queryKey: ['branch-stock-variants', station],
    queryFn: () => base44.entities.FlexibleVariant.filter({ created_by: station }),
    enabled: !!station,
  });

  const loading = loadingGroups || loadingVariants;

  const groupMap = Object.fromEntries(groups.map(g => [g.id, g]));
  const formatDimensions = (dims) => Object.values(dims || {}).filter(Boolean).join(' / ');

  const byGroup = variants.reduce((acc, v) => {
    if (!acc[v.group_id]) acc[v.group_id] = [];
    acc[v.group_id].push(v);
    return acc;
  }, {});

  const totalUnits = variants.reduce((s, v) => s + (v.stock ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-600">
          מלאי הסניף: {variants.length} וריאציות · סה"כ {totalUnits} יחידות
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { refetchGroups(); refetchVariants(); }}
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ml-1 ${loading ? 'animate-spin' : ''}`} />
          רענן
        </Button>
      </div>

      {Object.entries(byGroup).map(([groupId, groupVariants]) => (
        <Card key={groupId}>
          <CardContent className="p-4">
            <p className="font-semibold text-gray-800 mb-3 text-sm border-b pb-2">
              {groupMap[groupId]?.name || 'מוצר ללא שם'}
            </p>
            <div className="space-y-2">
              {groupVariants.map(variant => {
                const stock = variant.stock ?? 0;
                return (
                  <div key={variant.id} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-gray-700 flex-1">
                      {formatDimensions(variant.dimensions) || 'ברירת מחדל'}
                    </span>
                    <Badge variant={stock > 0 ? 'outline' : 'destructive'} className="text-xs">
                      {stock > 0 ? stock : 'אזל'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {!loading && variants.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            אין מלאי בסניף
          </CardContent>
        </Card>
      )}
    </div>
  );
}