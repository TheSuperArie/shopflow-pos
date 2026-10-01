import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { useWarehouseInventory } from '@/hooks/useWarehouseInventory';
import { setStockQty } from '@/lib/warehouseStock';
import StockTable from './StockTable';
import StockCountDialog from './StockCountDialog';
import MovementsList from './MovementsList';

export default function WarehouseStockPanel({ warehouse }) {
  const { items, isLoading } = useWarehouseInventory(warehouse);
  const [editing, setEditing] = useState(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const save = async ({ type, newQty, notes }) => {
    try {
      await setStockQty(warehouse, editing, newQty, editing.qty, { type, notes, performed_by: 'מנהל המחסן' });
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
      <StockTable items={items} isLoading={isLoading} onEdit={setEditing} />
      <MovementsList warehouseId={warehouse.id} />
      {editing && <StockCountDialog item={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}