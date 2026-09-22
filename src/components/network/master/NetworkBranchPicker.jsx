import React from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

/** "All branches" or a multi-select of specific ACTIVE branches. */
export default function NetworkBranchPicker({ branches, mode, onModeChange, selectedIds, onSelectedChange }) {
  const toggle = (id) => onSelectedChange(
    selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]
  );

  return (
    <div className="space-y-2 p-3 rounded-xl border">
      <Label>לאילו סניפים להוסיף</Label>
      <div className="flex gap-2">
        {[['all', `כל הסניפים (${branches.length})`], ['some', 'סניפים נבחרים']].map(([value, label]) => (
          <button key={value} type="button" onClick={() => onModeChange(value)}
            className={`flex-1 text-sm py-2 rounded-lg border ${mode === value ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600'}`}>
            {label}
          </button>
        ))}
      </div>
      {mode === 'some' && (
        <div className="space-y-1 pt-1">
          {branches.map(b => (
            <label key={b.id} className="flex items-center gap-2 py-1 cursor-pointer text-sm">
              <Checkbox checked={selectedIds.includes(b.id)} onCheckedChange={() => toggle(b.id)} />
              <span>{b.name}</span>
            </label>
          ))}
        </div>
      )}
      {branches.length === 0 && <p className="text-xs text-gray-400">אין סניפים פעילים</p>}
    </div>
  );
}