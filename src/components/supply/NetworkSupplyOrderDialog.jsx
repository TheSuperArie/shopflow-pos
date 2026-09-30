import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Warehouse, Save, Ban, Send, Loader2, Printer } from 'lucide-react';
import SupplyOrderLines from '@/components/supply/SupplyOrderLines';
import SupplyOrderParties from '@/components/supply/SupplyOrderParties';
import SupplyStatusBadge from '@/components/supply/SupplyStatusBadge';
import { formatOrderDate, nowIso, orderTotals, lineQty } from '@/lib/supplyOrders';

const EDITABLE = ['SENT_TO_NETWORK', 'SENT_TO_WAREHOUSE'];

/** The network's view of one order: edit lines + notes, share to the warehouse / back to the branch. */
export default function NetworkSupplyOrderDialog({ order, warehouse, onClose, onPrint }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [branchNotes, setBranchNotes] = useState('');
  const [networkNotes, setNetworkNotes] = useState('');
  const [busy, setBusy] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (!order) return;
    setItems((order.items || []).map(i => ({ ...i, qty: lineQty(i) })));
    setBranchNotes(order.branch_notes || '');
    setNetworkNotes(order.network_notes || '');
    setConfirmCancel(false);
  }, [order?.id]);

  if (!order) return null;

  const editable = EDITABLE.includes(order.status);
  const warehouseReady = warehouse?.status === 'ACTIVE';
  const dirty =
    editable && (
      branchNotes !== (order.branch_notes || '') ||
      networkNotes !== (order.network_notes || '') ||
      JSON.stringify(items.map(i => [i.variant_id, lineQty(i)])) !==
        JSON.stringify((order.items || []).map(i => [i.variant_id, lineQty(i)]))
    );
  const totals = orderTotals(items);

  const save = async (patch = {}, label) => {
    setBusy(label);
    try {
      if (editable) {
        // The warehouse may have started picking since this window opened — never overwrite its progress
        const [fresh] = await base44.entities.SupplyOrder.filter({ id: order.id });
        if (fresh && !EDITABLE.includes(fresh.status)) {
          toast({ title: 'המחסן כבר התחיל ללקט את ההזמנה — השינויים לא נשמרו', variant: 'destructive' });
          queryClient.invalidateQueries({ queryKey: ['supply-orders-network'] });
          return false;
        }
      }
      const data = editable
        ? { items: items.filter(i => lineQty(i) > 0), branch_notes: branchNotes.trim(), network_notes: networkNotes.trim(), ...patch }
        : patch;
      await base44.entities.SupplyOrder.update(order.id, data);
      queryClient.invalidateQueries({ queryKey: ['supply-orders-network'] });
      return true;
    } catch (err) {
      toast({ title: 'השמירה נכשלה', description: err?.message || 'נסה שוב', variant: 'destructive' });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const shareToWarehouse = async () => {
    if (items.filter(i => lineQty(i) > 0).length === 0) {
      toast({ title: 'אין שורות עם כמות בהזמנה', variant: 'destructive' });
      return;
    }
    const ok = await save({ status: 'SENT_TO_WAREHOUSE', warehouse_id: warehouse.id, sent_to_warehouse_at: nowIso() }, 'warehouse');
    if (ok) { toast({ title: `הזמנה #${order.order_number} שותפה למחסן` }); onClose(); }
  };

  const shareToBranch = async () => {
    const ok = await save({ status: 'SENT_TO_BRANCH', sent_to_branch_at: nowIso() }, 'branch');
    if (ok) { toast({ title: `הזמנה #${order.order_number} שותפה לסניף` }); onClose(); }
  };

  const cancelOrder = async () => {
    const ok = await save({ status: 'CANCELLED' }, 'cancel');
    if (ok) { toast({ title: 'ההזמנה בוטלה' }); onClose(); }
  };

  const saveOnly = async () => {
    const ok = await save({}, 'save');
    if (ok) toast({ title: 'השינויים נשמרו' });
  };

  const hasPicked = items.some(i => i.picked_qty != null);

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            הזמנה #{order.order_number} · {order.branch_name}
            <SupplyStatusBadge status={order.status} />
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500 -mt-2">
          נשלחה מהסניף {formatOrderDate(order.sent_to_network_at || order.created_date, true)} · {totals.lines} שורות · {totals.units} יחידות
          {editable && ' · אפשר לשנות כמויות, להסיר שורות ולערוך הערות'}
        </p>

        <SupplyOrderLines items={items} editable={editable} onChange={setItems} showPicked={hasPicked} showReceived={order.status === 'RECEIVED'} />
        {order.status === 'RECEIVED' && (
          <p className="text-sm text-green-700">נקלטה בסניף {formatOrderDate(order.received_at, true)} — המלאי של הסניף עודכן.</p>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">הערות הסניף</label>
            <Textarea value={branchNotes} onChange={e => setBranchNotes(e.target.value)} rows={3} disabled={!editable} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">הערות הרשת למחסן</label>
            <Textarea value={networkNotes} onChange={e => setNetworkNotes(e.target.value)} rows={3} disabled={!editable} placeholder="יוצג למחסן יחד עם ההזמנה" />
          </div>
        </div>
        {order.warehouse_notes && (
          <div className="rounded-xl border bg-gray-50 p-3 text-sm text-gray-700">
            <span className="font-medium">הערות המחסן: </span>{order.warehouse_notes}
            {order.picker_name && <span className="text-gray-500"> · מלקט: {order.picker_name}</span>}
          </div>
        )}

        <SupplyOrderParties order={order} warehouse={warehouse} />

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {order.status === 'SENT_TO_NETWORK' && (
            warehouseReady ? (
              <Button onClick={shareToWarehouse} disabled={!!busy} className="gap-2 h-11 bg-blue-600 hover:bg-blue-700">
                {busy === 'warehouse' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Warehouse className="w-4 h-4" />}
                שתף למחסן
              </Button>
            ) : (
              <span className="text-sm text-gray-500">כדי לשתף למחסן, חבר קודם מחסן בצד של המחסן בדף הזה.</span>
            )
          )}
          {order.status === 'READY' && (
            <Button onClick={shareToBranch} disabled={!!busy} className="gap-2 h-11 bg-purple-600 hover:bg-purple-700">
              {busy === 'branch' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              שתף לסניף
            </Button>
          )}
          {hasPicked && ['PACKED', 'READY', 'SENT_TO_BRANCH', 'RECEIVED'].includes(order.status) && onPrint && (
            <Button variant="outline" onClick={() => onPrint(order)} className="gap-2 h-11">
              <Printer className="w-4 h-4" /> דף הזמנה / PDF
            </Button>
          )}
          {editable && (
            <Button variant="outline" onClick={saveOnly} disabled={!dirty || !!busy} className="gap-2 h-11">
              {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              שמור שינויים
            </Button>
          )}
          {editable && (
            confirmCancel ? (
              <div className="mr-auto flex items-center gap-2">
                <span className="text-sm text-red-600">לבטל את ההזמנה?</span>
                <Button variant="destructive" size="sm" onClick={cancelOrder} disabled={!!busy}>כן, בטל</Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmCancel(false)}>לא</Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmCancel(true)} className="mr-auto gap-1.5 text-red-600 hover:bg-red-50">
                <Ban className="w-4 h-4" /> בטל הזמנה
              </Button>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
