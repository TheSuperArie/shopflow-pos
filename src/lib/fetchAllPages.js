import { toast } from '@/components/ui/use-toast';

/**
 * Paged loading for entities that grow over time (Sale, Expense, AttendanceLog, Return).
 * The server caps a single request, so reports read page by page until the data ends —
 * never silently cut at a fixed limit. A safety cap stops runaway loads and tells the user.
 */
export const PAGE_SIZE = 1000;
export const SAFETY_CAP = 50000;
const PARALLEL_PAGES = 4;

/** Pass as `limit` to the scoped helpers to load every matching record. */
export const ALL = Infinity;

const warned = new Set();
const warnPartial = (label) => {
  if (warned.has(label)) return;
  warned.add(label);
  toast({
    title: '⚠️ הנתונים חלקיים',
    description: `נטענו ${SAFETY_CAP.toLocaleString()} רשומות ${label} האחרונות בלבד. צמצמו את טווח התאריכים לתוצאה מלאה.`,
    duration: 8000,
  });
};

export async function fetchAllPages(entity, query = {}, sort, { label = '' } = {}) {
  const rows = [];
  let skip = 0;
  let done = false;
  while (!done && skip < SAFETY_CAP) {
    const skips = [];
    for (let i = 0; i < PARALLEL_PAGES && skip < SAFETY_CAP; i++, skip += PAGE_SIZE) skips.push(skip);
    const pages = await Promise.all(skips.map(s => entity.filter(query, sort, PAGE_SIZE, s)));
    for (const page of pages) {
      rows.push(...page);
      if (page.length < PAGE_SIZE) { done = true; break; }
    }
  }
  if (!done) warnPartial(label);
  // Records created while paging can shift pages — drop the duplicates this causes
  const seen = new Set();
  return rows.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

/** entity.filter with a fixed limit, or every page when limit === ALL. */
export const filterUpTo = (entity, query, sort, limit) =>
  limit === ALL ? fetchAllPages(entity, query, sort) : entity.filter(query, sort, limit);

/**
 * Server-side created_date bounds for a local (Israel) date range 'YYYY-MM-DD'.
 * One extra day on each side absorbs the timezone offset — the pages keep their
 * exact client-side date filter, so the numbers are unchanged.
 */
const DAY_MS = 86400000;
export function createdDateBetween(from, to) {
  const q = {};
  if (from) q.$gte = new Date(Date.parse(`${from}T00:00:00Z`) - DAY_MS).toISOString();
  if (to) q.$lte = new Date(Date.parse(`${to}T23:59:59Z`) + DAY_MS).toISOString();
  return q;
}

/** Earliest / latest of several 'YYYY-MM-DD' strings. */
export const minDate = (...d) => d.filter(Boolean).sort()[0];
export const maxDate = (...d) => d.filter(Boolean).sort().reverse()[0];