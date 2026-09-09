/**
 * Helpers for the cross-category variant selection used by the stock pages.
 * The selection itself lives in ShipmentBatchContext, so a selection made here
 * stays compatible with the existing shipment-entry flow.
 */

/**
 * Enriches variants with their group info, exactly as ShipmentCheckbox does,
 * so parent-level "select all" produces items identical to single-item toggles.
 */
export function toBatchItems(variants, group) {
  return variants.map(v => ({
    ...v,
    group_id: group?.id ?? v.group_id,
    group_name: group?.name ?? v.group_name,
  }));
}

/** Flattens [{ group, variants }] pairs into batch items across products/categories. */
export function toBatchItemsFromGroups(groupEntries) {
  return groupEntries.flatMap(({ group, variants }) => toBatchItems(variants, group));
}

/** Human-readable description of a variant's dimensions. */
export function variantDimText(variant) {
  const dims = variant?.dimensions;
  if (dims && Object.keys(dims).length > 0) {
    return Object.entries(dims).map(([k, v]) => `${k}: ${v}`).join(' • ');
  }
  return variant?.sku || 'מוצר בודד';
}