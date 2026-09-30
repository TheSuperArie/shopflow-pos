import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Warehouse, Save, Ban, Send, Loader2, Printer, LayoutGrid, List } from 'lucide-react';
import SupplyOrderLines from '@/components/supply/SupplyOrderLines';
import SupplyOrderParties from '@/components/supply/SupplyOrderParties';
import SupplyStatusBadge from '@/components/supply/SupplyStatusBadge';
import OrderTilesBuilder from '@/components/supply/OrderTilesBuilder';
import { useInventoryData } from '@/hooks/useInventoryData';
import { buildInventoryIndex } from '@/lib/inventory';
import { formatOrderDate, nowIso, orderTotals, lineQty, buildCatalogRows } from '@/lib/supplyOrders';

const EDITABLE = ['SENT_TO_NETWORK', 'SENT_TO_WAREHOUSE'];

/** The network's view of one order: edit lines + notes, share to the warehouse / back to the branch. */
export default function NetworkSupplyOrderDialog({ order, branch, warehouse, onClose, onPrint }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [branchNotes, setBranchNotes] = useState('');
  const [networkNotes, setNetworkNotes] = useState('');
  const [busy, setBusy] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editView, setEditView] = useState('tiles'); // tiles | lines

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

        {editable && branch && (
          <div className="flex rounded-xl border bg-white p-1 w-fit">
            <button onClick={() => setEditView('tiles')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${editView === 'tiles' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}>
              <LayoutGrid className="w-4 h-4" /> ריבועים (מלאי הסניף)
            </button>
            <button onClick={() => setEditView('lines')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${editView === 'lines' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}>
              <List className="w-4 h-4" /> שורות ההזמנה
            </button>
          </div>
        )}
        {editable && branch && editView === 'tiles' ? (
          <NetworkOrderTiles branch={branch} items={items} setItems={setItems} scanEnabled={!busy && !confirmCancel} />
        ) : (
          <SupplyOrderLines items={items} editable={editable} onChange={setItems} showPicked={hasPicked} showReceived={order.status === 'RECEIVED'} />
        )}
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

/**
 * The network editing a branch's order with the branch's own catalog as tiles:
 * change quantities, add sizes the branch didn't ask for, scan to add.
 * Lines whose product is no longer in the branch catalog are kept as they are.
 */
function NetworkOrderTiles({ branch, items, setItems, scanEnabled }) {
  const inv = useInventoryData(branch);
  const index = useMemo(
    () => buildInventoryIndex({ categories: inv.categories, groups: inv.groups, variants: inv.variants, globalThreshold: inv.threshold }),
    [inv.categories, inv.groups, inv.variants, inv.threshold]
  );
  const rowById = useMemo(
    () => new Map(buildCatalogRows(inv.variants, inv.groups, inv.categories).map(r => [r.variant_id, r])),
    [inv.variants, inv.groups, inv.categories]
  );

  const quantities = useMemo(() => {
    const q = {};
    items.forEach(i => {
      const n = lineQty(i);
      if (n > 0) q[i.variant_id] = (q[i.variant_id] || 0) + n;
    });
    return q;
  }, [items]);

  const requested = useMemo(
    () => Object.fromEntries(items.filter(i => Number(i.requested_qty) > 0).map(i => [i.variant_id, Number(i.requested_qty)])),
    [items]
  );

  const onChange = (next) => {
    const seen = new Set();
    const updated = items.map(i => {
      if (!rowById.has(i.variant_id)) return i;
      seen.add(i.variant_id);
      return { ...i, qty: next[i.variant_id] || 0 };
    });
    Object.entries(next).forEach(([vid, q]) => {
      if (seen.has(vid) || !(q > 0)) return;
      const r = rowById.get(vid);
      if (!r) return;
      updated.push({
        variant_id: r.variant_id,
        group_id: r.group_id,
        sku: r.sku,
        barcode: r.barcode,
        group_barcode: r.group_barcode,
        product_name: r.product_name,
        variant_label: r.variant_label,
        category_name: r.category_name,
        branch_stock: r.branch_stock,
        requested_qty: 0,
        qty: q,
        added_by_network: true,
      });
    });
    setItems(updated);
  };

  if (inv.isLoading) {
    return <div className="py-12 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-amber-500" /></div>;
  }

  const outside = items.filter(i => !rowById.has(i.variant_id) && lineQty(i) > 0).length;

  return (
    <div className="space-y-2">
      {outside > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {outside} שורות בהזמנה שייכות למוצרים שכבר לא בקטלוג של הסניף — הן נשארות בהזמנה ומופיעות ב"שורות ההזמנה".
        </p>
      )}
      <OrderTilesBuilder
        index={index}
        categories={inv.categories}
        groups={inv.groups}
        variants={inv.variants}
        quantities={quantities}
        onChange={onChange}
        requested={requested}
        scanEnabled={scanEnabled}
      />
    </div>
  );
}
