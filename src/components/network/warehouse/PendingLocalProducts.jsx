import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import LocalStatusBadge from '@/components/warehouse/stock/LocalStatusBadge';
import ApproveLocalProductDialog from './ApproveLocalProductDialog';

/** Warehouse-local products: approve (→ network catalog) or reject (stays local). */
export default function PendingLocalProducts({ warehouse, tenantEmail, branches, localProducts }) {
  const [approving, setApproving] = useState(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const pending = localProducts.filter(p => p.status === 'PENDING');
  const others = localProducts.filter(p => p.status !== 'PENDING');

  const refresh = () => {
    ['warehouse-local-products', 'warehouse-stock', 'warehouse-network-catalog'].forEach(k =>
      queryClient.invalidateQueries({ queryKey: [k] }));
  };

  const reject = async (p) => {
    if (!window.confirm(`לדחות את "${p.name}"? המוצר יישאר מקומי במחסן.`)) return;
    await base44.entities.WarehouseLocalProduct.update(p.id, { status: 'REJECTED' });
    refresh();
    toast({ title: 'המוצר נשאר מקומי במחסן' });
  };

  const Row = ({ p, actions }) => (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{p.name} {p.variant_label ? `· ${p.variant_label}` : ''}</p>
        <p className="text-xs text-gray-500 truncate">{p.category_name || '—'}{p.sku ? ` · ${p.sku}` : ''}{p.notes ? ` · ${p.notes}` : ''}</p>
      </div>
      {actions ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setApproving(p)} className="bg-green-600 hover:bg-green-700">אשר</Button>
          <Button size="sm" variant="outline" onClick={() => reject(p)}>דחה</Button>
        </div>
      ) : <LocalStatusBadge status={p.status} />}
    </div>
  );

  return (
    <div className="space-y-4">
      {pending.length === 0 ? (
        <p className="py-8 text-center text-gray-400 rounded-2xl border bg-white">אין מוצרים שממתינים לאישור</p>
      ) : (
        <div className="rounded-2xl border-2 border-amber-200 bg-white divide-y">{pending.map(p => <Row key={p.id} p={p} actions />)}</div>
      )}
      {others.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-600">טופלו</h4>
          <div className="rounded-2xl border bg-white divide-y">{others.map(p => <Row key={p.id} p={p} />)}</div>
        </div>
      )}
      {approving && (
        <ApproveLocalProductDialog
          local={approving} warehouse={warehouse} tenantEmail={tenantEmail} branches={branches}
          onClose={() => setApproving(null)}
          onDone={({ copies }) => {
            setApproving(null);
            refresh();
            const failed = copies.filter(c => !c.ok).length;
            toast({ title: 'המוצר נוסף לקטלוג הרשת', description: failed ? `${failed} סניפים נכשלו` : undefined });
          }}
        />
      )}
    </div>
  );
}