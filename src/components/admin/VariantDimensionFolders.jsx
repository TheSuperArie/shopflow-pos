import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { ChevronDown } from 'lucide-react';

/**
 * Groups variants by their first enabled dimension (e.g., size),
 * then renders collapsible sub-folders for each dimension value.
 *
 * Props:
 *   variants        - array of ProductVariant objects
 *   group           - the ProductGroup object (for uniform price / dimension config)
 *   renderVariant   - (variant) => ReactNode — how to render each leaf variant row
 *   badgeColor      - tailwind class for the badge bg (default: "bg-amber-500")
 *   folderBg        - tailwind class for folder header bg (default: "bg-amber-50")
 *   folderBorder    - tailwind class for folder border (default: "border-amber-200")
 */
export default function VariantDimensionFolders({
  variants,
  group,
  renderVariant,
  badgeColor = 'bg-amber-500',
  folderBg = 'bg-amber-50',
  folderBorder = 'border-amber-200',
}) {
  const [expandedDim, setExpandedDim] = useState(null);

  if (!variants || variants.length === 0) {
    return <p className="text-center text-gray-400 py-4 text-sm">אין וריאציות</p>;
  }

  // Determine the primary grouping dimension key
  // Use the first key found in any variant's dimensions object
  const firstDimKey = (() => {
    for (const v of variants) {
      const keys = Object.keys(v.dimensions || {});
      if (keys.length > 0) return keys[0];
    }
    return null;
  })();

  // If no dimensions at all, just render all variants flat
  if (!firstDimKey) {
    return (
      <div className="space-y-2">
        {variants.map(v => (
          <div key={v.id}>{renderVariant(v)}</div>
        ))}
      </div>
    );
  }

  // Group variants by the first dimension value
  const grouped = {};
  variants.forEach(v => {
    const dimVal = v.dimensions?.[firstDimKey] ?? '—';
    if (!grouped[dimVal]) grouped[dimVal] = [];
    grouped[dimVal].push(v);
  });

  // Sort dimension values naturally (numeric-aware)
  const sortedKeys = Object.keys(grouped).sort((a, b) => {
    const nA = parseFloat(a);
    const nB = parseFloat(b);
    if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
    return a.localeCompare(b, 'he');
  });

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