import { base44 } from '@/api/base44Client';
import { fetchAllPages } from '@/lib/fetchAllPages';

/**
 * Network-scoped loading for the network-master screens.
 * Filtering happens on the SERVER, so a network never downloads other
 * networks' sales/expenses (faster, and never hits the paging safety cap
 * because of someone else's data). The screens keep their exact client-side
 * filters, so the displayed numbers are unchanged.
 */

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

const dedupeById = (...lists) => {
  const seen = new Set();
  return lists.flat().filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
};

/** Sales of the network's branches (by branch_id) + the master's own sales. */
export async function fetchNetworkSales({ branchIds = [], tenantEmail, dateQuery = {}, includeOwn = true }) {
  const ids = uniq(branchIds);
  const [branchSales, ownSales] = await Promise.all([
    ids.length
      ? fetchAllPages(base44.entities.Sale, { ...dateQuery, branch_id: { $in: ids } }, '-created_date', { label: 'מכירות' })
      : [],
    includeOwn && tenantEmail
      ? fetchAllPages(base44.entities.Sale, { ...dateQuery, seller_email: tenantEmail }, '-created_date', { label: 'מכירות' })
      : [],
  ]);
  return dedupeById(branchSales, ownSales);
}

/**
 * Expenses that can belong to the network: stamped with one of its branch ids,
 * created by the master or by a branch station account (legacy, no branch_id),
 * or network-level expenses of this tenant.
 */
export async function fetchNetworkExpenses({ branchIds = [], stationEmails = [], tenantEmail, dateQuery = {} }) {
  const ids = uniq(branchIds);
  const creators = uniq([tenantEmail, ...stationEmails]);
  const q = (filter) => fetchAllPages(base44.entities.Expense, { ...dateQuery, ...filter }, '-date', { label: 'הוצאות' });
  const [byBranch, byCreator, byTenant] = await Promise.all([
    ids.length ? q({ branch_id: { $in: ids } }) : [],
    creators.length ? q({ created_by: { $in: creators } }) : [],
    tenantEmail ? q({ tenant_email: tenantEmail }) : [],
  ]);
  return dedupeById(byBranch, byCreator, byTenant);
}
