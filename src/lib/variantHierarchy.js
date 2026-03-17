/**
 * Utility functions for dynamic variant hierarchy management
 * Reorganizes variants based on a selected primary dimension
 */

/**
 * Reorganizes variants into a nested hierarchy based on primary dimension
 * @param {Array} variants - ProductVariant records
 * @param {Object} group - ProductGroup with enabled_dimensions and primary_dimension_id
 * @param {Array} allDimensions - All VariantDimension records for the category
 * @returns {Object} Hierarchical structure: { dimValue: { subDimKey: [variants] } }
 */
export function getHierarchicalVariants(variants, group, allDimensions) {
  if (!variants || variants.length === 0) return {};

  // Get the primary dimension name/ID
  const primaryDimId = group?.primary_dimension_id;
  const enabledDims = group?.enabled_dimensions || [];
  
  // If no primary dimension set, fall back to first enabled dimension
  const primaryDim = primaryDimId
    ? allDimensions.find(d => d.id === primaryDimId)
    : allDimensions.find(d => enabledDims.includes(d.id));

  if (!primaryDim) {
    return { all: variants };
  }

  const primaryDimKey = primaryDim.name;

  // Group by primary dimension value
  const grouped = {};
  variants.forEach(v => {
    const primaryValue = v.dimensions?.[primaryDimKey] ?? '—';
    if (!grouped[primaryValue]) {
      grouped[primaryValue] = [];
    }
    grouped[primaryValue].push(v);
  });

  // Sort primary values naturally
  const sortedPrimaryValues = Object.keys(grouped).sort((a, b) => {
    const nA = parseFloat(a);
    const nB = parseFloat(b);
    if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
    return a.localeCompare(b, 'he');
  });

  // Build final hierarchy
  const hierarchy = {};
  sortedPrimaryValues.forEach(primaryVal => {
    hierarchy[primaryVal] = grouped[primaryVal];
  });

  return hierarchy;
}

/**
 * Gets the primary dimension key for a product group
 * @param {Object} group - ProductGroup
 * @param {Array} allDimensions - All VariantDimension records
 * @returns {String|null} The name of the primary dimension
 */
export function getPrimaryDimensionKey(group, allDimensions) {
  if (!group?.primary_dimension_id) return null;
  const primaryDim = allDimensions.find(d => d.id === group.primary_dimension_id);
  return primaryDim?.name || null;
}

/**
 * Organizes variants for display with primary grouping and sub-items
 * @param {Array} variants
 * @param {Object} group
 * @param {Array} allDimensions
 * @returns {Array} Array of folder objects: { primaryValue, variants }
 */
export function getVariantFolders(variants, group, allDimensions) {
  const hierarchy = getHierarchicalVariants(variants, group, allDimensions);
  
  return Object.entries(hierarchy).map(([primaryValue, variantsInFolder]) => ({
    primaryValue,
    primaryDimensionKey: getPrimaryDimensionKey(group, allDimensions),
    variants: variantsInFolder,
  }));
}