import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Store, Crown } from 'lucide-react';
import { fetchNetworkDetails } from '@/lib/supplyOrders';

const Row = ({ label, value }) => (value ? (
  <p className="text-sm text-gray-700"><span className="text-gray-500">{label}: </span>{value}</p>
) : null);

/** Branch details (who orders) + network details (who manages) — shown at the bottom of an order. */
export default function SupplyOrderParties({ order, warehouse }) {
  const { data: branch } = useQuery({
    queryKey: ['supply-branch', order?.branch_id],
    queryFn: async () => (await base44.entities.Branch.filter({ id: order.branch_id }))[0] || null,
    enabled: !!order?.branch_id,
    staleTime: 300000,
  });
  const { data: network } = useQuery({
    queryKey: ['supply-network-details', order?.tenant_email],
    queryFn: () => fetchNetworkDetails(order.tenant_email),
    enabled: !!order?.tenant_email,
    staleTime: 300000,
  });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border bg-gray-50 p-3 space-y-0.5">
        <p className="flex items-center gap-1.5 font-semibold text-gray-800 mb-1"><Store className="w-4 h-4 text-amber-500" /> פרטי הסניף</p>
        <Row label="סניף" value={order?.branch_name || branch?.name} />
        <Row label="כתובת" value={branch?.address} />
        <Row label="מנהל" value={branch?.manager_name} />
        <Row label="טלפון" value={branch?.manager_phone} />
      </div>
      <div className="rounded-xl border bg-gray-50 p-3 space-y-0.5">
        <p className="flex items-center gap-1.5 font-semibold text-gray-800 mb-1"><Crown className="w-4 h-4 text-amber-500" /> פרטי הרשת</p>
        <Row label="רשת" value={network?.name} />
        <Row label="טלפון" value={warehouse?.network_phone} />
        <Row label="אימייל" value={network?.email} />
      </div>
    </div>
  );
}
