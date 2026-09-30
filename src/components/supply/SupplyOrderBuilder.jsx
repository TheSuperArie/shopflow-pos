import React, { useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, X, CheckSquare } from 'lucide-react';
import { sortRows } from '@/lib/supplyOrders';

const COLUMNS = [
  { key: 'product_name',  label: 'מוצר' },
  { key: 'variant_label', label: 'מידה' },
  { key: 'category_name', label: 'סוג' },
  { key: 'sku',           label: 'מק"ט' },
  { key: 'branch_stock',  label: 'במלאי' },
];

/**
 * The branch's order grid: one row per variant of its own catalog.
 * quantities = { [variant_id]: number } — controlled by the page (so it survives as a draft).
 */
export default function SupplyOrderBuilder({ rows, quantities, onQuantitiesChange }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [onlyOrdered, setOnlyOrdered] = useState(false);
  const [sort, setSort] = useState({ key: 'product_name', dir: 'asc' });
  const [selected, setSelected] = useState(() => new Set());
  const [bulkQty, setBulkQty] = useState('');
  const lastClicked = useRef(null);

  const categories = useMemo(
    () => [...new Set(rows.map(r => r.category_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he')),
    [rows]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter(r => {
      if (category && r.category_name !== category) return false;
      if (onlyOrdered && !(quantities[r.variant_id] > 0)) return false;
      if (!q) return true;
      return [r.product_name, r.variant_label, r.sku, r.category_name].some(v => String(v || '').toLowerCase().includes(q));
    });
    return sortRows(filtered, sort.key, sort.dir);
  }, [rows, search, category, onlyOrdered, quantities, sort]);

  const setQty = (variantId, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0);
    const next = { ...quantities };
    if (n > 0) next[variantId] = n; else delete next[variantId];
    onQuantitiesChange(next);
  };

  const toggleSort = (key) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'branch_stock' ? 'asc' : 'asc' }));

  // Click = toggle one row; Shift+click = select the whole range from the last clicked row
  const toggleRow = (index, shiftKey) => {
    const next = new Set(selected);
    const row = visible[index];
    const willSelect = !next.has(row.variant_id);
    if (shiftKey && lastClicked.current !== null) {
      const [from, to] = [Math.min(lastClicked.current, index), Math.max(lastClicked.current, index)];
      for (let i = from; i <= to; i++) {
        if (willSelect) next.add(visible[i].variant_id); else next.delete(visible[i].variant_id);
      }
    } else if (willSelect) next.add(row.variant_id); else next.delete(row.variant_id);
    lastClicked.current = index;
    setSelected(next);
  };

  // All sizes of one product at once
  const selectProduct = (groupId) => {
    const next = new Set(selected);
    rows.filter(r => r.group_id === groupId).forEach(r => next.add(r.variant_id));
    setSelected(next);
  };

  const allVisibleSelected = visible.length > 0 && visible.every(r => selected.has(r.variant_id));
  const toggleAllVisible = () => {
    const next = new Set(selected);
    if (allVisibleSelected) visible.forEach(r => next.delete(r.variant_id));
    else visible.forEach(r => next.add(r.variant_id));
    setSelected(next);
  };

  const applyBulk = (value) => {
    const n = Math.max(0, parseInt(value, 10) || 0);
    const next = { ...quantities };
    selected.forEach(id => { if (n > 0) next[id] = n; else delete next[id]; });
    onQuantitiesChange(next);
    setBulkQty('');
  };

  const SortIcon = ({ col }) => {
    if (sort.key !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder='חיפוש לפי מוצר, מידה או מק"ט' className="pr-9" />
        </div>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="h-9 rounded-md border border-input bg-white px-3 text-sm min-w-[140px]"
        >
          <option value="">כל הסוגים</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 px-2 cursor-pointer select-none">
          <Checkbox checked={onlyOrdered} onCheckedChange={v => setOnlyOrdered(!!v)} />
          רק מה שבהזמנה
        </label>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 shadow-sm">
          <CheckSquare className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-900">{selected.size} שורות נבחרו</span>
          <span className="text-sm text-amber-800 mr-2">כמות לכולן:</span>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={bulkQty}
            onChange={e => setBulkQty(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && bulkQty !== '') applyBulk(bulkQty); }}
            className="w-20 h-9 text-center bg-white"
            autoFocus
          />
          <Button size="sm" onClick={() => applyBulk(bulkQty)} disabled={bulkQty === ''} className="bg-amber-500 hover:bg-amber-600">
            החל
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyBulk(0)}>אפס כמות</Button>
          <button onClick={() => setSelected(new Set())} className="mr-auto flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
            <X className="w-4 h-4" /> בטל בחירה
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} aria-label="בחר הכל" />
              </th>
              {COLUMNS.map(col => (
                <th key={col.key} className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                  <button onClick={() => toggleSort(col.key)} className="inline-flex items-center gap-1 hover:text-gray-900">
                    {col.label} <SortIcon col={col.key} />
                  </button>
                </th>
              ))}
              <th className="px-3 py-2.5 text-center font-medium w-28">להזמנה</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((row, index) => {
              const qty = quantities[row.variant_id] || 0;
              const isSelected = selected.has(row.variant_id);
              return (
                <tr
                  key={row.variant_id}
                  className={`${isSelected ? 'bg-amber-50' : qty > 0 ? 'bg-green-50/60' : 'hover:bg-gray-50'} transition-colors`}
                >
                  <td className="px-3 py-2" onClick={e => { e.preventDefault(); toggleRow(index, e.shiftKey); }}>
                    <Checkbox checked={isSelected} aria-label="בחר שורה" />
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-800">
                    <button
                      onClick={() => selectProduct(row.group_id)}
                      title="בחר את כל המידות של המוצר"
                      className="text-right hover:text-amber-700 hover:underline"
                    >
                      {row.product_name}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.variant_label || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.category_name || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 font-mono text-xs whitespace-nowrap">{row.sku || '—'}</td>
                  <td className={`px-3 py-2 font-semibold whitespace-nowrap ${row.branch_stock <= 0 ? 'text-red-600' : 'text-gray-800'}`}>
                    {row.branch_stock}
                  </td>
                  <td className="px-3 py-1.5">
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={qty || ''}
                      placeholder="0"
                      onChange={e => setQty(row.variant_id, e.target.value)}
                      onFocus={e => e.target.select()}
                      className={`h-10 w-24 mx-auto text-center text-base font-semibold ${qty > 0 ? 'border-green-400 bg-white' : ''}`}
                    />
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="py-12 text-center text-gray-400">
                  {rows.length === 0 ? 'אין מוצרים בקטלוג של הסניף' : 'אין מוצרים שתואמים לסינון'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        טיפ: לחיצה על שם מוצר בוחרת את כל המידות שלו. Shift + לחיצה על תיבות הסימון בוחרת טווח שורות.
      </p>
    </div>
  );
}
