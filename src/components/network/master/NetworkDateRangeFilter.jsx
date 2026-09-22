import React from 'react';
import { Input } from '@/components/ui/input';
import { format, startOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns';

const d = (date) => format(date, 'yyyy-MM-dd');

export const DATE_PRESETS = [
  { key: 'today', label: 'היום', range: () => ({ from: d(new Date()), to: d(new Date()) }) },
  { key: 'week', label: 'השבוע', range: () => ({ from: d(startOfWeek(new Date(), { weekStartsOn: 0 })), to: d(new Date()) }) },
  { key: 'month', label: 'החודש', range: () => ({ from: d(startOfMonth(new Date())), to: d(new Date()) }) },
  {
    key: 'prevMonth',
    label: 'חודש קודם',
    range: () => {
      const prev = subMonths(new Date(), 1);
      return { from: d(startOfMonth(prev)), to: d(endOfMonth(prev)) };
    },
  },
];

/** Date-range picker with quick presets — shared by the network master screens. */
export default function NetworkDateRangeFilter({ from, to, preset, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {DATE_PRESETS.map(p => (
        <button
          key={p.key}
          onClick={() => onChange({ ...p.range(), preset: p.key })}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            preset === p.key ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={from}
          onChange={e => onChange({ from: e.target.value, to, preset: 'custom' })}
          className="h-8 w-36 text-sm"
        />
        <span className="text-gray-400 text-sm">עד</span>
        <Input
          type="date"
          value={to}
          onChange={e => onChange({ from, to: e.target.value, preset: 'custom' })}
          className="h-8 w-36 text-sm"
        />
      </div>
    </div>
  );
}