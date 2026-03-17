import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ShipmentCheckbox from './ShipmentCheckbox';

export default function VariantItemWithCheckbox({ variant, group, showCheckbox = false }) {
  const dimText = variant.dimensions && Object.keys(variant.dimensions).length > 0
    ? Object.entries(variant.dimensions).map(([k, val]) => `${k}: ${val}`).join(' • ')
    : 'רגיל';

  return (
    <Card className={showCheckbox ? 'cursor-pointer hover:bg-blue-50 transition-colors' : ''}>
      <CardContent className="p-3 flex items-center gap-3">
        {showCheckbox && (
          <ShipmentCheckbox variant={variant} group={group} />
        )}
        <div className="flex-1">
          <p className="font-semibold text-sm">{group?.name}</p>
          <p className="text-xs text-gray-600">{dimText}</p>
          <Badge className="mt-2 bg-amber-100 text-amber-800">{variant.stock || 0} יחידות</Badge>
        </div>
      </CardContent>
    </Card>
  );
}