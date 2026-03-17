import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown } from 'lucide-react';
import { getVariantFolders, getPrimaryDimensionKey } from '@/lib/variantHierarchy';

/**
 * Groups variants by primary dimension (if set), with dynamic hierarchy.
 * Falls back to first enabled dimension if no primary is set.
 *
 * Props:
 *   variants        - array of ProductVariant objects
 *   group           - the ProductGroup object (with primary_dimension_id)
 *   allDimensions   - all VariantDimension records for the category
 *   renderVariant   - (variant) => ReactNode — how to render each leaf variant row
 *   badgeColor      - tailwind class for the badge bg (default: "bg-amber-500")
 *   folderBg        - tailwind class for folder header bg (default: "bg-amber-50")
 *   folderBorder    - tailwind class for folder border (default: "border-amber-200")
 */
export default function VariantDimensionFolders({
  variants,
  group,
  allDimensions = [],
  renderVariant,
  badgeColor = 'bg-amber-500',
  folderBg = 'bg-amber-50',
  folderBorder = 'border-amber-200',
}) {
  const [expandedDim, setExpandedDim] = useState(null);

  if (!variants || variants.length === 0) {
    return <p className="text-center text-gray-400 py-4 text-sm">אין וריאציות</p>;
  }

  // If single variant, render flat
  if (variants.length === 1) {
    return <div>{renderVariant(variants[0])}</div>;
  }

  // Get folders organized by primary dimension
  const folders = getVariantFolders(variants, group, allDimensions);
  
  // If no valid primary dimension found, render flat
  if (folders.length === 0 || !folders[0]?.primaryDimensionKey) {
    return (
      <div className="space-y-2">
        {variants.map(v => (
          <div key={v.id}>{renderVariant(v)}</div>
        ))}
      </div>
    );
  }

  const primaryDimKey = folders[0].primaryDimensionKey;

  return (
    <div className="space-y-2">
      {sortedKeys.map(dimVal => {
        const dimVariants = grouped[dimVal];
        const isOpen = expandedDim === dimVal;
        return (
          <div key={dimVal} className={`border-2 ${folderBorder} rounded-xl overflow-hidden`}>
            <button
              onClick={() => setExpandedDim(isOpen ? null : dimVal)}
              className={`w-full ${folderBg} px-4 py-3 flex items-center justify-between hover:brightness-95 transition-all`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">📁</span>
                <span className="font-semibold text-gray-800">{firstDimKey}: {dimVal}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${badgeColor} text-white text-xs`}>{dimVariants.length}</Badge>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {isOpen && (
              <div className="bg-white p-3 space-y-2">
                {dimVariants.map(v => (
                  <div key={v.id}>{renderVariant(v)}</div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}