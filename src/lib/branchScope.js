/**
 * Network-side branch scoping — the master's mirror of filterBranchScoped():
 * records stamped with this branch's id + legacy records with no branch_id
 * that were created by the branch's own station account.
 */
export async function fetchBranchScoped(entity, branch, extra = {}, sort, limit) {
  if (!branch?.id) return [];
  const requests = [entity.filter({ ...extra, branch_id: branch.id }, sort, limit)];
  if (branch.station_email) {
    requests.push(entity.filter({ ...extra, branch_id: null, created_by: branch.station_email }, sort, limit));
  }
  const merged = (await Promise.all(requests)).flat();
  const seen = new Set();
  return merged.filter(r => {
    // Network-level expenses belong to no branch — even when the master is also a station
    if (r.network_level === true || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

/** Expenses the network master created for a branch are hidden from the branch itself. */
export const withoutNetworkOnly = (list = []) => list.filter(r => r.network_only !== true && r.network_level !== true);

/** Network-level expenses (office, accountant, central warehouse...) — never part of any branch. */
export const withoutNetworkLevel = (list = []) => list.filter(r => r.network_level !== true);
export const isNetworkLevelOf = (tenantEmail) => (e) => e.network_level === true && e.tenant_email === tenantEmail;