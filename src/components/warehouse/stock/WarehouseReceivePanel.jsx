import React, { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Trash2, ScanLine, Save, Package } from 'lucide-react';
import { useScanDetector } from '@/hooks/useScanDetector';
import { useWarehouseInventory } from '@/hooks/useWarehouseInventory';
import { stockOps } from '@/lib/warehouseStock';
import { matchScannedCode, matchCartonCode, cartonBreakdown } from '@/lib/supplyOrders';
import ReceiptHistory from './ReceiptHistory';

const emptyMeta = { supplier_name: '', delivery_note: '', notes: '' };

/**
 * Manual goods receipt: several product/size lines at once → stock goes up + movements.
 * Always ADDS to the stock. The scanner works anywhere on the page (also while the cursor is in a box):
 * a carton label adds the whole carton (12 / 24 / whatever the label says), a single shirt adds 1.
 */
export default function WarehouseReceivePanel({ warehouse }) {
  const { items, isLoading } = useWarehouseInventory(warehouse);
  const [lines, setLines] = useState([]); // [{ item, qty }]
  const [q, setQ] = useState('');
  const [meta, setMeta] = useState(emptyMeta);
  const [saving, setSaving] = useState(false);
  const [cartonSize, setCartonSize] = useState({}); // item key → shirts per carton (from scanned labels)
  const [lastKey, setLastKey] = useState(null); // the line the last scan went to (highlighted)
  const receiptKey = useRef(null);
  // What the boxes held when a key burst began — a scan typed into a box is undone
  const snapshot = useRef({ q: '', lines: [] });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return items.filter(i => [i.product_name, i.variant_label, i.sku, i.barcode].some(v => String(v || '').toLowerCase().includes(s))).slice(0, 30);
  }, [items, q]);

  const add = (item, step = 1, base = null) => {
    setLines(ls => {
      const from = base || ls;
      const i = from.findIndex(l => l.item.key === item.key);
      if (i >= 0) return from.map((l, x) => (x === i ? { ...l, qty: String((parseInt(l.qty, 10) || 0) + step) } : l));
      return [...from, { item, qty: String(step) }];
    });
    setLastKey(item.key);
    setQ('');
  };

  useScanDetector({
    enabled: !saving,
    onBurstStart: () => { snapshot.current = { q, lines }; },
    onScan: (code) => {
      // Undo whatever the scanner typed into a focused box
      const before = snapshot.current;
      setQ(before.q);
      const carton = matchCartonCode(code, items);
      if (carton.length === 1) {
        const { row, units } = carton[0];
        if (units) setCartonSize(s => ({ ...s, [row.key]: units }));
        add(row, units || 1, before.lines);
        toast({ title: `קרטון נקלט: +${units || 1}`, description: `${row.product_name}${row.variant_label ? ` · ${row.variant_label}` : ''}`, duration: 1800 });
        return;
      }
      const m = matchScannedCode(code, items);
      if (m.length === 1) add(m[0], 1, before.lines);
      else if (m.length > 1) { setLines(before.lines); setQ(code); }
      else { setLines(before.lines); toast({ title: `ברקוד לא נמצא: ${code}`, variant: 'destructive', duration: 2500 }); }
    },
  });

  const valid = lines.filter(l => parseInt(l.qty, 10) > 0);

  const save = async () => {
    setSaving(true);
    try {
      // Same key until the receipt succeeds — a retry after a failure never adds the stock twice
      if (!receiptKey.current) receiptKey.current = `R${Date.now()}`;
      await stockOps('warehouseReceive', {
        warehouse_id: warehouse.id,
        op_key: receiptKey.current,
        lines: valid.map(l => ({
          variant_id: l.item.variant_id || null, local_product_id: l.item.local_product_id || null,
          product_name: l.item.product_name, variant_label: l.item.variant_label, category_name: l.item.category_name,
          sku: l.item.sku, qty: parseInt(l.qty, 10),
        })),
        meta: {
          supplier_name: meta.supplier_name.trim(), delivery_note: meta.delivery_note.trim(),
          notes: meta.notes.trim(), performed_by: 'מנהל המחסן',
        },
      });
      receiptKey.current = null;
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock', warehouse.id] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-movements', warehouse.id] });
      toast({ title: `נקלטו ${valid.length} שורות` });
      setLines([]); setMeta(emptyMeta); setLastKey(null);
    } catch (e) {
      toast({ title: 'הקליטה נכשלה', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <p className="flex items-center gap-1.5 w-fit rounded-full bg-green-50 border border-green-200 px-3 py-1 text-sm text-green-700 font-medium">
          <ScanLine className="w-4 h-4" /> הסורק פעיל — קרטון מוסיף את כל הקרטון, חולצה מוסיפה 1. הקליטה מוסיפה למלאי ולא מחליפה אותו
        </p>
        <div className="relative">
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder={isLoading ? 'טוען קטלוג…' : 'חיפוש מוצר / מידה / מק״ט'} className="h-11" data-scan-capture />
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-lg max-h-72 overflow-y-auto">
              {results.map(r => (
                <button key={r.key} onClick={() => add(r)} className="w-full text-right px-4 py-2 hover:bg-blue-50 text-sm">
                  <strong>{r.product_name}</strong> {r.variant_label ? `· ${r.variant_label}` : ''}
                  <span className="text-xs text-gray-400"> {r.sku}{r.isLocal ? ' · מקומי' : ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <div className="divide-y rounded-xl border">
            {lines.map((l, idx) => {
              const per = cartonSize[l.item.key];
              const cartons = per ? cartonBreakdown(parseInt(l.qty, 10) || 0, per) : '';
              return (
              <div key={l.item.key} className={`flex items-center gap-2 px-3 py-2 transition-colors ${lastKey === l.item.key ? 'bg-green-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="truncate">{l.item.product_name} {l.item.variant_label ? `· ${l.item.variant_label}` : ''}</p>
                  {(cartons || l.item.carton_number) && (
                    <p className="flex items-center gap-1 text-xs text-amber-800">
                      <Package className="w-3 h-3" />
                      {l.item.carton_number ? `קרטון ${l.item.carton_number}` : ''}
                      {cartons ? `${l.item.carton_number ? ' · ' : ''}${cartons} (${per} בקרטון)` : ''}
                    </p>
                  )}
                </div>
                <Input type="number" min={1} value={l.qty} onChange={e => setLines(ls => ls.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} className="w-24 h-10 text-center" data-scan-capture />
                <button onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
              );
            })}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label>ספק</Label><Input value={meta.supplier_name} onChange={e => setMeta({ ...meta, supplier_name: e.target.value })} placeholder="אופציונלי" /></div>
          <div><Label>מספר תעודת משלוח</Label><Input value={meta.delivery_note} onChange={e => setMeta({ ...meta, delivery_note: e.target.value })} placeholder="אופציונלי" /></div>
          <div><Label>הערות</Label><Input value={meta.notes} onChange={e => setMeta({ ...meta, notes: e.target.value })} placeholder="אופציונלי" /></div>
        </div>
        <Button onClick={save} disabled={!valid.length || saving} className="w-full h-12 gap-2 bg-green-600 hover:bg-green-700 text-base">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} קלוט {valid.length} שורות למלאי
        </Button>
      </div>
      <ReceiptHistory warehouseId={warehouse.id} />
    </div>
  );
}