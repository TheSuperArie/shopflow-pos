import React, { useRef, useEffect } from 'react';
import { useShipmentBatch } from '@/lib/ShipmentBatchContext';

/**
 * Parent-level "select all" checkbox that covers every variant beneath it
 * (category / sub-category / product / dimension folder).
 * Shows an indeterminate state when only part of the subtree is selected.
 *
 * items - batch items (variants enriched with group_id/group_name)
 */
export default function SelectAllCheckbox({ items = [], label, className = '' }) {
  const { isItemSelected, selectAll, unselectAll } = useShipmentBatch();
  const inputRef = useRef(null);

  const ids = items.map(i => i.id);
  const selectedCount = ids.filter(id => isItemSelected(id)).length;
  const allSelected = ids.length > 0 && selectedCount === ids.length;
  const someSelected = selectedCount > 0 && !allSelected;

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const handleToggle = (e) => {
    e.stopPropagation();
    if (allSelected) unselectAll(ids);
    else selectAll(items);
  };

  if (ids.length === 0) return null;

  return (
    <div
      onClick={handleToggle}
      className={`flex items-center gap-2 cursor-pointer select-none ${className}`}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={allSelected}
        onChange={handleToggle}
        onClick={e => e.stopPropagation()}
        className="w-5 h-5 accent-blue-600 cursor-pointer shrink-0"
      />
      <span className="text-xs font-medium whitespace-nowrap">
        {label || (allSelected ? 'בטל הכל' : 'בחר הכל')} ({selectedCount}/{ids.length})
      </span>
    </div>
  );
}