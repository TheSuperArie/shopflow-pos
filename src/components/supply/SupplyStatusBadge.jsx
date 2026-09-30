import React from 'react';
import { SUPPLY_STATUS } from '@/lib/supplyOrders';

export default function SupplyStatusBadge({ status }) {
  const cfg = SUPPLY_STATUS[status] || SUPPLY_STATUS.SENT_TO_NETWORK;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}
