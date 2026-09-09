import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import VariantDimensionFolders from '@/components/admin/VariantDimensionFolders';
import VariantStockCard from './VariantStockCard';
import SelectAllCheckbox from './SelectAllCheckbox';
import { toBatchItems } from '@/lib/stockSelection';

export const VARIANT_GRID = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3';

/**
 * One product (ProductGroup): header with a product-level "select all",
 * dimension folders that each carry their own "select all", and the
 * variants themselves as square cards in a responsive grid.
 */
export default function StockProductBlock({ group, variants, allDimensions = [], threshold = 5 }) {
  const sorted = [...variants].sort((a, b) => (a.stock || 0) - (b.stock || 0));

  return (
    <Card className="border-red-200 bg-gray-50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {group.image_url && (
              <img src={group.image_url} alt={group.name} className="w-12 h-12 object-cover rounded-lg" />
            )}
            <div>
              <CardTitle className="text-base">{group.name}</CardTitle>
              <p className="text-xs text-gray-500 mt-1">{variants.length} וריאציות</p>
            </div>
          </div>
          <SelectAllCheckbox
            items={toBatchItems(sorted, group)}
            label="כל המוצר"
            className="text-gray-700 bg-white border rounded-lg px-2 py-1"
          />
        </div>
      </CardHeader>
      <CardContent>
        <VariantDimensionFolders
          variants={sorted}
          group={group}
          allDimensions={allDimensions}
          badgeColor="bg-red-600"
          folderBg="bg-red-50"
          folderBorder="border-red-200"
          leafClassName={VARIANT_GRID}
          renderFolderExtra={(folderVariants) => (
            <SelectAllCheckbox
              items={toBatchItems(folderVariants, group)}
              label="תיקייה"
              className="text-gray-700 bg-white border rounded-lg px-2 py-1 shrink-0"
            />
          )}
          renderVariant={(variant) => (
            <VariantStockCard variant={variant} group={group} threshold={threshold} />
          )}
        />
      </CardContent>
    </Card>
  );
}