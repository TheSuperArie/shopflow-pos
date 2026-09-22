import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

/** Per-branch result of a network-wide product creation. */
export default function NetworkProductSummary({ productName, results }) {
  const okCount = results.filter(r => r.ok).length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-700">
        המוצר <strong>{productName}</strong> נוצר ב-{okCount} מתוך {results.length} סניפים
      </p>
      <div className="space-y-1">
        {results.map(r => (
          <div key={r.branch.id} data-branch-result={r.ok ? 'ok' : 'failed'}
            className={`flex items-start gap-2 p-2 rounded-lg text-sm ${r.ok ? 'bg-green-50' : 'bg-red-50'}`}>
            {r.ok
              ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              : <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />}
            <div className="flex-1">
              <p className="font-medium text-gray-900">{r.branch.name}</p>
              {r.ok && r.categoryCreated && <p className="text-xs text-gray-500">נוצרה קטגוריה חדשה בסניף</p>}
              {!r.ok && <p className="text-xs text-red-600">נכשל: {r.error}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}