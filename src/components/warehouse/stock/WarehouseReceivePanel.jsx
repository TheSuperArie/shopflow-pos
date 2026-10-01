import React, { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Trash2, ScanLine, Save } from 'lucide-react';
import { useScanDetector } from '@/hooks/useScanDetector';
import { useWarehouseInventory } from '@/hooks/useWarehouseInventory';
import { stockOps } from '@/lib/warehouseStock';
import { matchScannedCode } from '@/lib/supplyOrders';
import ReceiptHistory from './ReceiptHistory';

const emptyMeta = { supplier_name: '', delivery_note: '', notes: '' };

/** Manual goods receipt: several product/size lines at once → stock goes up + movements. */
export default function WarehouseReceivePanel({ warehouse }) {
  const { items, isLoading } = useWarehouseInventory(warehouse);
  const [lines, setLines] = useState([]); // [{ item, qty }]
  const [q, setQ] = useState('');
  const [meta, setMeta] = useState(emptyMeta);
  const [saving, setSaving] = useState(false);
  const receiptKey = useRef(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return items.filter(i => [i.product_name, i.variant_label, i.sku, i.barcode].some(v => String(v || '').toLowerCase().includes(s))).slice(0, 30);
  }, [items, q]);

  const add = (item) => {
    setLines(ls => {
      const i = ls.findIndex(l => l.item.key === item.key);
      if (i >= 0) return ls.map((l, x) => (x === i ? { ...l, qty: String((parseInt(l.qty, 10) || 0) + 1) } : l));
      return [...ls, { item, qty: '1' }];
    });
    setQ('');
  };

  useScanDetector({
    enabled: !saving,
    onScan: (code) => {
      const m = matchScannedCode(code, items);
      if (m.length === 1) add(m[0]);
      else if (m.length > 1) setQ(code);
      else toast({ title: `ברקוד לא נמצא: ${code}`, variant: 'destructive', duration: 2500 });
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
      setLines([]); setMeta(emptyMeta);
    } catch (e) {
      toast({ title: 'הקליטה נכשלה', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <p className="flex items-center gap-1.5 text-sm text-green-700"><ScanLine className="w-4 h-4" /> אפשר לסרוק ברקוד או לחפש מוצר</p>
        <div className="relative">
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder={isLoading ? 'טוען קטלוג…' : 'חיפוש מוצר / מידה / מק״ט'} className="h-11" />
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
            {lines.map((l, idx) => (
              <div key={l.item.key} className="flex items-center gap-2 px-3 py-2">
                <p className="flex-1 min-w-0 truncate">{l.item.product_name} {l.item.variant_label ? `· ${l.item.variant_label}` : ''}</p>
                <Input type="number" min={1} value={l.qty} onChange={e => setLines(ls => ls.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} className="w-24 h-10 text-center" />
                <button onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
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