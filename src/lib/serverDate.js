/**
 * Base44 returns its built-in timestamps (created_date / updated_date) as UTC
 * WITHOUT a trailing "Z" — e.g. "2026-09-25T12:02:53.845000".
 * new Date() / moment() read such a string as LOCAL time, which shifts every
 * sale 2–3 hours back (and sales after midnight into the previous day).
 * Always read server timestamps through these helpers.
 */
const TZ = 'Asia/Jerusalem';

/** Server timestamp → Date (treats offset-less timestamps as UTC). Null when empty/invalid. */
export function parseServerDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  let s = String(value);
  // A timestamp with no zone info is UTC; date-only strings ('YYYY-MM-DD') are left as-is
  if (s.length > 10 && !/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s = `${s}Z`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const dateKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });

/** Israel calendar day 'YYYY-MM-DD' of a server timestamp. */
export function israelDateKey(value) {
  const d = parseServerDate(value);
  return d ? dateKeyFmt.format(d) : null;
}

/** Israel hour (0–23) of a server timestamp. */
export function israelHour(value) {
  const d = parseServerDate(value);
  if (!d) return null;
  const h = Number(hourFmt.format(d));
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : null;
}
