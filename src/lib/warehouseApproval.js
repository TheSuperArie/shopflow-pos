import { base44 } from '@/api/base44Client';
import { createProductForBranches } from '@/lib/networkProductCreate';

/**
 * Approves a warehouse-local product: creates it in the network catalog (the owner's own branch),
 * optionally copies it to other branches (linked by source_id), and moves the local stock
 * to the new network variant.
 */
export async function approveLocalProduct({ local, warehouse, tenantEmail, branches, product, label, copyToBranches }) {
  const own = branches.find(b => b.station_email === tenantEmail);
  if (!own) throw new Error('לא נמצא הסניף של בעל הרשת — לא ניתן ליצור מוצר בקטלוג הרשת');
  const rows = [{ dimensions: label ? { 'מידה': label } : {}, sell_price: null, cost_price: null }];

  const [res] = await createProductForBranches([own], product, rows, 0);
  if (!res.ok) throw new Error(res.error);
  const networkVariantId = res.variantIds[0];

  let copies = [];
  if (copyToBranches) {
    const others = branches.filter(b => b.id !== own.id);
    copies = await createProductForBranches(others, product, rows, 0);
    await Promise.all(copies.filter(c => c.ok).flatMap(c => [
      base44.entities.ProductGroup.update(c.groupId, { source_id: res.groupId }),
      ...c.variantIds.map(id => base44.entities.ProductVariant.update(id, { source_id: networkVariantId })),
    ]));
  }

  // Local stock → network variant
  const [stockRow] = await base44.entities.WarehouseStock.filter({ warehouse_id: warehouse.id, local_product_id: local.id });
  if (stockRow) {
    await base44.entities.WarehouseStock.update(stockRow.id, {
      variant_id: networkVariantId, product_name: product.name, variant_label: label || '', category_name: product.category_name,
    });
  }
  await base44.entities.WarehouseLocalProduct.update(local.id, { status: 'APPROVED', linked_variant_id: networkVariantId });
  return { copies };
}