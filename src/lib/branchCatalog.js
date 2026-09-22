/**
 * The catalog a branch POS shows = records the station account created itself
 * + records the network master created for this branch (branch_id = branch.id).
 * Both the POS and the network master's catalog editor read through these helpers.
 */
const dedupe = (rows) => {
  const seen = new Set();
  return rows.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
};

/** Network-master side: catalog of a given branch (station-owned + branch-stamped). */
export async function fetchBranchCatalogRecords(entity, branch, sort) {
  if (!branch?.id) return [];
  const requests = [entity.filter({ branch_id: branch.id }, sort)];
  if (branch.station_email) requests.push(entity.filter({ created_by: branch.station_email }, sort));
  return dedupe((await Promise.all(requests)).flat());
}

/** POS side: this account's own records + records the network master added for its branch. */
export async function fetchPosCatalogRecords(entity, userEmail, branchId, sort, limit) {
  const requests = [entity.filter({ created_by: userEmail }, sort, limit)];
  if (branchId) requests.push(entity.filter({ branch_id: branchId }, sort, limit));
  return dedupe((await Promise.all(requests)).flat());
}

/** Branches this account may operate as: an approved station branch first, else its own branches. */
export async function fetchPosBranches(entities, userEmail) {
  const [own, station] = await Promise.all([
    entities.Branch.filter({ tenant_email: userEmail }),
    entities.Branch.filter({ station_email: userEmail, is_active: true, status: 'ACTIVE' }),
  ]);
  return station.length > 0 ? station : own;
}

/** The POS's active branch: a station branch in someone else's network, then any active branch. */
export function pickActiveBranch(branches = [], userEmail) {
  return branches.find(b => b.is_active && b.tenant_email !== userEmail) ||
    branches.find(b => b.is_active) ||
    branches[0] || null;
}