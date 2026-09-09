import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/**
 * Resolves the branch the current station account belongs to — the same
 * identification method already used for Sale (Branch.station_email match).
 * Returns branchId = null for a single-store setup (no branch record).
 */
export function useCurrentBranch() {
  const user = useCurrentUser();

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['current-branch', user?.email],
    queryFn: () => base44.entities.Branch.filter({ station_email: user.email }),
    enabled: !!user,
  });

  const branch = branches[0] || null;
  return { user, branch, branchId: branch?.id || null, isLoading: !user || isLoading };
}

/**
 * Branch-scoped read helper — mirrors the Sale pattern:
 * records of this branch + legacy records with no branch_id (backward compatible).
 * Without a branch (single store) falls back to the account's own records.
 */
export async function filterBranchScoped(entity, branchId, userEmail, extra = {}, sort, limit) {
  if (!branchId) {
    return entity.filter({ ...extra, created_by: userEmail }, sort, limit);
  }
  const [branchRecords, legacyRecords] = await Promise.all([
    entity.filter({ ...extra, branch_id: branchId }, sort, limit),
    entity.filter({ ...extra, branch_id: null, created_by: userEmail }, sort, limit),
  ]);
  return [...branchRecords, ...legacyRecords];
}