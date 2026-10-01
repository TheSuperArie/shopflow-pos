import React from 'react';

const STATUS = {
  PENDING: { label: 'ממתין לאישור הרשת', cls: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'נוסף לקטלוג הרשת', cls: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'מקומי במחסן', cls: 'bg-gray-100 text-gray-600' },
};

export default function LocalStatusBadge({ status }) {
  const s = STATUS[status] || STATUS.PENDING;
  return <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}