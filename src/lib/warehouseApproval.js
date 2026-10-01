import { base44 } from '@/api/base44Client';
import { createProductForBranches } from '@/lib/networkProductCreate';

/**
 * Approves a warehouse-local product: creates it in the network catalog (the owner's own branch),
 * optionally copies it to other branches (linked by source_id), and moves the local stock
 * to the new network variant.
 * Safe to run again after a failure: each step is saved right after it's done, and a retry
 * continues from there instead of creating the product a second time.
 */
export async function approveLocalProduct({ local, warehouse, tenantEmail, branches, product, label, copyToBranches }) {
  const own = branches.find(b => b.station_email === tenantEmail);
  if (!own) throw new Error('לא נמצא הסניף של בעל הרשת — לא ניתן ליצור מוצר בקטלוג הרשת');
  const rows = [{ dimensions: label ? { 'מידה': label } : {}, sell_price: null, cost_price: null }];
  // Fresh copy — a previous attempt may already have created the product
  const [fresh] = await base44.entities.WarehouseLocalProduct.filter({ id: local.id });
  const current = fresh || local;

  let networkVariantId = current.linked_variant_id;
  let groupId = current.linked_group_id;
  if (!networkVariantId) {
    const [res] = await createProductForBranches([own], product, rows, 0);
    if (!res.ok) throw new Error(res.error);
    networkVariantId = res.variantIds[0];
    groupId = res.groupId;
    // Saved immediately, so a retry never creates it again
    await base44.entities.WarehouseLocalProduct.update(local.id, { linked_variant_id: networkVariantId, linked_group_id: groupId });
  }

  let copies = [];
  if (copyToBranches) {
    const copied = new Set(current.copied_branch_ids || []);
    const others = branches.filter(b => b.id !== own.id && !copied.has(b.id));
    copies = await createProductForBranches(others, product, rows, 0);
    const ok = copies.filter(c => c.ok);
    await Promise.all(ok.flatMap(c => [
      base44.entities.ProductGroup.update(c.groupId, { source_id: groupId }),
      ...c.variantIds.map(id => base44.entities.ProductVariant.update(id, { source_id: networkVariantId })),
    ]));
    if (ok.length) {
      await base44.entities.WarehouseLocalProduct.update(local.id, { copied_branch_ids: [...copied, ...ok.map(c => c.branch.id)] });
    }
  }

  // Local stock → network variant
  const [stockRow] = await base44.entities.WarehouseStock.filter({ warehouse_id: warehouse.id, local_product_id: local.id });
  if (stockRow && stockRow.variant_id !== networkVariantId) {
    await base44.entities.WarehouseStock.update(stockRow.id, {
      variant_id: networkVariantId, product_name: product.name, variant_label: label || '', category_name: product.category_name,
    });
  }
  await base44.entities.WarehouseLocalProduct.update(local.id, { status: 'APPROVED' });
  return { copies };
}