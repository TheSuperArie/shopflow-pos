import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function BusinessModelSelect({ branch }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (value) => base44.entities.Branch.update(branch.id, { business_model: value }),
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <div className="mt-2 flex items-center gap-2 text-xs" onClick={e => e.stopPropagation()}>
      <span className="text-gray-500">מודל עסקי:</span>
      <select
        className="border rounded px-1.5 py-0.5 bg-white text-gray-700"
        value={branch.business_model || 'IMPORTER'}
        disabled={save.isPending}
        onChange={e => save.mutate(e.target.value)}
        data-testid={`bm-${branch.id}`}
      >
        <option value="OWN_STOCK">המלאי שלנו</option>
        <option value="IMPORTER">מכירה עבור המייבא</option>
      </select>
    </div>
  );
}