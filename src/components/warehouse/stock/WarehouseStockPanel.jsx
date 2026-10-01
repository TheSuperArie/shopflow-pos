import React, { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { useWarehouseInventory } from '@/hooks/useWarehouseInventory';
import { stockOps, newOpKey } from '@/lib/warehouseStock';
import StockTable from './StockTable';
import StockCountDialog from './StockCountDialog';
import MovementsList from './MovementsList';

export default function WarehouseStockPanel({ warehouse }) {
  const { items, isLoading } = useWarehouseInventory(warehouse);
  const [editing, setEditing] = useState(null);
  const opKey = useRef(null); // one key per opened dialog — a retried save is applied once
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const openEdit = (item) => { opKey.current = newOpKey(); setEditing(item); };

  const save = async ({ type, newQty, notes }) => {
    try {
      await stockOps('warehouseCount', {
        warehouse_id: warehouse.id, op_key: opKey.current, type,
        value: type === 'ADJUST' ? newQty - editing.qty : newQty,
        item: { variant_id: editing.variant_id, local_product_id: editing.local_product_id, product_name: editing.product_name,
          variant_label: editing.variant_label, category_name: editing.category_name, sku: editing.sku },
        meta: { notes, performed_by: 'מנהל המחסן' },
      });
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock', warehouse.id] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-movements', warehouse.id] });
      toast({ title: 'המלאי עודכן' });
      setEditing(null);
    } catch (e) {
      toast({ title: 'העדכון נכשל', description: e?.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <StockTable items={items} isLoading={isLoading} onEdit={openEdit} />
      <MovementsList warehouseId={warehouse.id} />
      {editing && <StockCountDialog item={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}