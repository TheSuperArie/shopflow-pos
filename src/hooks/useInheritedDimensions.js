import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/**
 * Returns the effective variant dimensions for a category,
 * walking up the category tree (sub → parent → grandparent)
 * until dimensions are found.
 *
 * Also returns `resolvedCategoryId` so the caller knows which
 * ancestor actually owns the dimensions.
 */
export function useInheritedDimensions(categoryId, allCategories = []) {
  const user = useCurrentUser();

  // Build the ancestor chain: [categoryId, parentId, grandparentId, ...]
  const ancestorChain = [];
  let current = categoryId;
  const visited = new Set();
  while (current && !visited.has(current)) {
    ancestorChain.push(current);
    visited.add(current);
    const cat = allCategories.find(c => c.id === current);
    current = cat?.parent_id || null;
  }

  // Fetch dimensions for every ancestor in parallel
  const queries = ancestorChain.map(catId => ({
    queryKey: ['variant-dimensions', catId, user?.email],
    queryFn: () =>
      user
        ? base44.entities.VariantDimension.filter({ category_id: catId, created_by: user.email })
        : Promise.resolve([]),
    enabled: !!user && !!catId,
    staleTime: 30000,
  }));

  // We can't call useQuery inside a loop conditionally, so we use a fixed-size
  // approach: fetch all three levels (self, parent, grandparent) separately.
  const [selfId, parentId, grandparentId] = ancestorChain;

  const { data: selfDims = [] } = useQuery({
    queryKey: ['variant-dimensions', selfId, user?.email],
    queryFn: () => selfId && user ? base44.entities.VariantDimension.filter({ category_id: selfId, created_by: user.email }) : Promise.resolve([]),
    enabled: !!user && !!selfId,
    staleTime: 30000,
  });

  const { data: parentDims = [] } = useQuery({
    queryKey: ['variant-dimensions', parentId, user?.email],
    queryFn: () => parentId && user ? base44.entities.VariantDimension.filter({ category_id: parentId, created_by: user.email }) : Promise.resolve([]),
    enabled: !!user && !!parentId,
    staleTime: 30000,
  });

  const { data: grandparentDims = [] } = useQuery({
    queryKey: ['variant-dimensions', grandparentId, user?.email],
    queryFn: () => grandparentId && user ? base44.entities.VariantDimension.filter({ category_id: grandparentId, created_by: user.email }) : Promise.resolve([]),
    enabled: !!user && !!grandparentId,
    staleTime: 30000,
  });

  // Walk the chain: return first level that has dimensions
  if (selfDims.length > 0) {
    return { dimensions: selfDims, resolvedCategoryId: selfId, isInherited: false };
  }
  if (parentDims.length > 0) {
    return { dimensions: parentDims, resolvedCategoryId: parentId, isInherited: selfId !== parentId };
  }
  if (grandparentDims.length > 0) {
    return { dimensions: grandparentDims, resolvedCategoryId: grandparentId, isInherited: true };
  }

  return { dimensions: [], resolvedCategoryId: selfId, isInherited: false };
}