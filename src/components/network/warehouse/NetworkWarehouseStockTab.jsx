import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';
import { useWarehouseInventory } from '@/hooks/useWarehouseInventory';
import WarehouseStockPanel from '@/components/warehouse/stock/WarehouseStockPanel';
import ReceiptHistory from '@/components/warehouse/stock/ReceiptHistory';
import MovementsList from '@/components/warehouse/stock/MovementsList';
import PendingLocalProducts from './PendingLocalProducts';

/** Network owner's view of the warehouse: stock (read only), receipts, movements, local products to approve. */
export default function NetworkWarehouseStockTab({ tenantEmail }) {
  const [tab, setTab] = useState('stock');
  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ['network-warehouses', tenantEmail],
    queryFn: () => base44.entities.Warehouse.filter({ tenant_email: tenantEmail }),
  });
  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantEmail],
    queryFn: () => base44.entities.Branch.filter({ tenant_email: tenantEmail }),
  });
  const active = warehouses.filter(w => w.status === 'ACTIVE');
  const [whId, setWhId] = useState(null);
  const warehouse = active.find(w => w.id === whId) || active[0];
  const inv = useWarehouseInventory(warehouse);
  const activeBranches = branches.filter(b => (b.status || 'ACTIVE') === 'ACTIVE' && b.system_approval !== 'PENDING_SYSTEM' && b.is_active !== false);
  const pendingCount = inv.localProducts.filter(p => p.status === 'PENDING').length;

  if (isLoading) return <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>;
  if (!warehouse) return <div className="py-16 text-center text-gray-400 rounded-2xl border bg-white">אין מחסן מחובר לרשת</div>;

  const tabs = [
    ['stock', 'מלאי'], ['receipts', 'קליטות'], ['movements', 'תנועות'], ['pending', `מוצרים לאישור${pendingCount ? ` (${pendingCount})` : ''}`],
  ];

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-800 flex-1">מחסן</h1>
        {active.length > 1 && (
          <select value={warehouse.id} onChange={e => setWhId(e.target.value)} className="h-10 rounded-md border bg-white px-3 text-sm">
            {active.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-xl px-4 py-2 text-sm font-medium border ${tab === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50'} ${k === 'pending' && pendingCount ? 'ring-2 ring-amber-400' : ''}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'stock' && <WarehouseStockPanel warehouse={warehouse} readOnly />}
      {tab === 'receipts' && <ReceiptHistory warehouseId={warehouse.id} />}
      {tab === 'movements' && <MovementsList warehouseId={warehouse.id} />}
      {tab === 'pending' && (
        <PendingLocalProducts warehouse={warehouse} tenantEmail={tenantEmail} branches={activeBranches} localProducts={inv.localProducts} />
      )}
    </div>
  );
}