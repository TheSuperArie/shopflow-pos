import { base44 } from '@/api/base44Client';
import { fetchBranchCatalogRecords } from '@/lib/branchCatalog';

const norm = (s) => (s || '').trim().toLowerCase();

/** Find a category with this name in the branch's catalog, or create it stamped with branch_id. */
async function findOrCreateCategory(branch, name) {
  const cats = await fetchBranchCatalogRecords(base44.entities.Category, branch, 'sort_order');
  // Ignore records the station account owns but that were stamped for a different branch
  const own = cats.filter(c => !c.branch_id || c.branch_id === branch.id);
  const match = own.find(c => !c.parent_id && norm(c.name) === norm(name)) || own.find(c => norm(c.name) === norm(name));
  if (match) return { id: match.id, created: false };
  const created = await base44.entities.Category.create({ name: name.trim(), branch_id: branch.id });
  return { id: created.id, created: true };
}

/** Same record format as the single-branch catalog form (BranchProductFormModal). */
async function createForBranch(branch, product, rows, initialStock) {
  const category = await findOrCreateCategory(branch, product.category_name);
  const group = await base44.entities.ProductGroup.create({
    name: product.name,
    category_id: category.id,
    barcode: product.barcode || null,
    is_active: product.is_active,
    has_uniform_price: product.has_uniform_price,
    uniform_sell_price: product.uniform_sell_price === '' ? null : Number(product.uniform_sell_price),
    uniform_cost_price: product.uniform_cost_price === '' ? null : Number(product.uniform_cost_price),
    branch_id: branch.id,
  });
  try {
    await Promise.all(rows.map(r => base44.entities.ProductVariant.create({
      dimensions: r.dimensions || {},
      stock: initialStock,
      sell_price: r.sell_price === null || r.sell_price === '' ? null : Number(r.sell_price),
      cost_price: r.cost_price === null || r.cost_price === '' ? null : Number(r.cost_price),
      group_id: group.id,
      branch_id: branch.id,
    })));
  } catch (e) {
    // Don't leave a half-created product behind in this branch
    const leftovers = await base44.entities.ProductVariant.filter({ group_id: group.id });
    await Promise.all(leftovers.map(v => base44.entities.ProductVariant.delete(v.id)));
    await base44.entities.ProductGroup.delete(group.id);
    throw e;
  }
  return { categoryCreated: category.created };
}

/** Creates a copy of the product in every given branch; returns a per-branch result list. */
export async function createProductForBranches(branches, product, rows, initialStock) {
  const settled = await Promise.allSettled(branches.map(b => createForBranch(b, product, rows, initialStock)));
  return settled.map((s, i) => ({
    branch: branches[i],
    ok: s.status === 'fulfilled',
    categoryCreated: s.value?.categoryCreated || false,
    error: s.reason?.message || (s.status === 'rejected' ? 'שגיאה לא ידועה' : null),
  }));
}