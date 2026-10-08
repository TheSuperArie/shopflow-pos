import { compareCartonLocation } from '@/lib/supplyOrders';

const sizeCollator = new Intl.Collator('he', { numeric: true });

/** Rows ordered the way the stock is walked: carton, then product, then size (no carton last). */
export const sortByCarton = (rows) => [...rows].sort((a, b) =>
  compareCartonLocation(a, b) ||
  (a.product_name || '').localeCompare(b.product_name || '', 'he') ||
  sizeCollator.compare(a.variant_label || '', b.variant_label || ''));

const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

/**
 * Downloads a stock list as an Excel file (CSV with BOM so Hebrew opens right), sorted by carton.
 * rows: { carton_number, size, product_name, variant_label, category_name, sku, qty, reserved? }
 * withReserved adds the "reserved for picking" column (warehouse). Returns how many rows went in.
 */
export function downloadStockExcel(rows, { fileTitle, place, withReserved = false }) {
  const list = sortByCarton(rows);
  if (!list.length) return 0;
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['מספר קרטון', 'מוצר', 'מידה', 'קטגוריה', 'מק"ט', 'במלאי', ...(withReserved ? ['משוריין לליקוט'] : [])];
  const body = list.map(i => [
    i.carton_number || 'ללא קרטון',
    i.product_name,
    String(i.size ?? '').trim() || i.variant_label,
    i.category_name,
    i.sku,
    i.qty,
    ...(withReserved ? [i.reserved || 0] : []),
  ]);
  const csv = '﻿' + [head, ...body].map(r => r.map(cell).join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  link.download = `${fileTitle}_${place || 'מלאי'}_${today()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  return list.length;
}
