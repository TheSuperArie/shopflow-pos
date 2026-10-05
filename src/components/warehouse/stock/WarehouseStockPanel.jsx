import React, { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { ScanLine } from 'lucide-react';
import { useWarehouseInventory } from '@/hooks/useWarehouseInventory';
import { useScanDetector } from '@/hooks/useScanDetector';
import { stockOps, newOpKey } from '@/lib/warehouseStock';
import { matchScannedCode, matchCartonCode } from '@/lib/supplyOrders';
import StockTable from './StockTable';
import StockCountDialog, { countAfter, countFormValid } from './StockCountDialog';
import MovementsList from './MovementsList';

const emptyForm = { mode: 'COUNT', value: '', notes: '' };

export default function WarehouseStockPanel({ warehouse }) {
  const { items, isLoading } = useWarehouseInventory(warehouse);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [openedByScan, setOpenedByScan] = useState(false);
  const [cartonSize, setCartonSize] = useState({}); // item key → shirts per carton (read from scanned labels)
  const opKey = useRef(null); // one key per opened dialog — a retried save is applied once
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const openItem = (item, { value = '', byScan = false } = {}) => {
    opKey.current = newOpKey();
    setForm({ ...emptyForm, value });
    setOpenedByScan(byScan);
    setEditing(item);
  };
  const openEdit = (item) => openItem(item);

  const save = async ({ type, newQty, notes }, target = editing) => {
    try {
      await stockOps('warehouseCount', {
        warehouse_id: warehouse.id, op_key: opKey.current, type,
        value: type === 'ADJUST' ? newQty - target.qty : newQty,
        item: { variant_id: target.variant_id, local_product_id: target.local_product_id, product_name: target.product_name,
          variant_label: target.variant_label, category_name: target.category_name, sku: target.sku },
        meta: { notes, performed_by: 'מנהל המחסן' },
      });
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock', warehouse.id] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-movements', warehouse.id] });
      toast({ title: `המלאי עודכן${target.variant_label ? ` · ${target.variant_label}` : ''}` });
      setEditing(null);
      return true;
    } catch (e) {
      toast({ title: 'העדכון נכשל', description: e?.message, variant: 'destructive' });
      return false;
    }
  };

  // ── Scanner: a carton label adds a whole carton, a single shirt adds 1 ──
  const addScanned = async (item, step, units) => {
    if (units) setCartonSize(s => ({ ...s, [item.key]: units }));
    if (editing && editing.key === item.key) {
      setForm(f => ({ ...f, value: String((parseInt(f.value, 10) || 0) + step) }));
      return;
    }
    // Another product is open → save its count first (if one was entered), then open this one
    if (editing) {
      if (countFormValid(form)) {
        const ok = await save({ type: form.mode, newQty: countAfter(editing, form), notes: form.notes.trim() }, editing);
        if (!ok) return;
      } else {
        setEditing(null);
      }
    }
    openItem(item, { value: String(step), byScan: true });
  };

  const handleScan = (code) => {
    const carton = matchCartonCode(code, items);
    if (carton.length === 1) return addScanned(carton[0].row, carton[0].units || 1, carton[0].units);
    const hits = matchScannedCode(code, items);
    if (hits.length === 1) return addScanned(hits[0], 1, null);
    if (hits.length > 1) {
      toast({ title: 'הברקוד מתאים לכמה מידות', description: 'לחץ על המידה הנכונה ברשימה', variant: 'destructive' });
      return;
    }
    toast({ title: 'ברקוד לא נמצא', description: code, variant: 'destructive' });
  };

  useScanDetector({ enabled: !!warehouse?.id, onScan: handleScan });

  return (
    <div className="space-y-6">
      <p className="flex items-center gap-1.5 w-fit rounded-full bg-green-50 border border-green-200 px-3 py-1 text-sm text-green-700 font-medium">
        <ScanLine className="w-4 h-4" /> הסורק פעיל — סרוק קרטון או חולצה כדי לספור (קרטון מוסיף קרטון שלם, חולצה מוסיפה 1)
      </p>
      <StockTable items={items} isLoading={isLoading} onEdit={openEdit} />
      <MovementsList warehouseId={warehouse.id} />
      {editing && (
        <StockCountDialog
          item={editing}
          form={form}
          onFormChange={setForm}
          cartonSize={cartonSize[editing.key]}
          openedByScan={openedByScan}
          onClose={() => setEditing(null)}
          onSave={(data) => save(data)}
        />
      )}
    </div>
  );
}
