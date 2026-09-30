import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Send, Package, MessagesSquare, ClipboardList, Loader2, Truck, Trash2, ScanLine } from 'lucide-react';
import { usePosBranch, usePosCatalogQuery } from '@/hooks/usePosCatalog';
import GeneralChatDrawer from '@/components/orders/GeneralChatDrawer';
import OrderTilesBuilder from '@/components/supply/OrderTilesBuilder';
import { useInventoryData } from '@/hooks/useInventoryData';
import { buildInventoryIndex } from '@/lib/inventory';
import SupplyOrderLines from '@/components/supply/SupplyOrderLines';
import StatusBadge from '@/components/supply/SupplyStatusBadge';
import ReceiveOrderDialog from '@/components/supply/ReceiveOrderDialog';
import {
  buildCatalogRows, nextOrderNumber, nowIso, orderTotals, formatOrderDate, supplyDraftKey,
} from '@/lib/supplyOrders';

const draftKey = supplyDraftKey;
const readDraft = (branchId) => {
  try { return JSON.parse(localStorage.getItem(draftKey(branchId)) || 'null') || { quantities: {}, notes: '' }; }
  catch { return { quantities: {}, notes: '' }; }
};

export default function BranchSupplyOrders() {
  const { user, activeBranch: branch, ready } = usePosBranch();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState('new');
  const [quantities, setQuantities] = useState({});
  const [notes, setNotes] = useState('');
  const [draftLoadedFor, setDraftLoadedFor] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [openOrder, setOpenOrder] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [receiving, setReceiving] = useState(null); // { order: null | order }

  const { data: categories = [] } = usePosCatalogQuery('categories', 'Category', { sort: 'sort_order' });
  const { data: groups = [], isLoading: loadingGroups } = usePosCatalogQuery('product-groups', 'ProductGroup');
  const { data: variants = [], isLoading: loadingVariants } = usePosCatalogQuery('product-variants', 'ProductVariant');

  const rows = useMemo(() => buildCatalogRows(variants, groups, categories), [variants, groups, categories]);

  // Same catalog + shortage threshold as the inventory screen → same square tiles
  const inv = useInventoryData();
  const index = useMemo(
    () => buildInventoryIndex({ categories: inv.categories, groups: inv.groups, variants: inv.variants, globalThreshold: inv.threshold }),
    [inv.categories, inv.groups, inv.variants, inv.threshold]
  );

  // Unread messages from the network — shown on the chat button
  const { data: unreadChat = [] } = useQuery({
    queryKey: ['general-chat-unread', branch?.id],
    queryFn: () => base44.entities.BranchGeneralChat.filter({ branch_id: branch.id, tenant_email: branch.tenant_email, sender_role: 'HQ', is_read: false }),
    enabled: !!branch?.id && !!branch?.tenant_email,
    refetchInterval: 30000,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['supply-orders-branch', branch?.id],
    queryFn: () => base44.entities.SupplyOrder.filter({ branch_id: branch.id }, '-created_date', 200),
    enabled: !!branch?.id,
  });

  useEffect(() => {
    if (!branch?.id) return undefined;
    return base44.entities.SupplyOrder.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['supply-orders-branch', branch.id] });
    });
  }, [branch?.id, queryClient]);

  // Restore the unsent draft for this branch once
  useEffect(() => {
    if (branch?.id && draftLoadedFor !== branch.id) {
      const d = readDraft(branch.id);
      setQuantities(d.quantities || {});
      setNotes(d.notes || '');
      setDraftLoadedFor(branch.id);
    }
  }, [branch?.id, draftLoadedFor]);

  // Keep the draft on this device so a refresh doesn't lose a half-typed order
  useEffect(() => {
    if (!branch?.id || draftLoadedFor !== branch.id) return;
    try { localStorage.setItem(draftKey(branch.id), JSON.stringify({ quantities, notes })); } catch { /* storage full/blocked */ }
  }, [quantities, notes, branch?.id, draftLoadedFor]);

  const orderedRows = rows.filter(r => quantities[r.variant_id] > 0);
  const totalUnits = orderedRows.reduce((s, r) => s + quantities[r.variant_id], 0);
  const inNetwork = !!branch?.tenant_email;

  const clearDraft = () => { setQuantities({}); setNotes(''); };

  const sendOrder = async () => {
    setSending(true);
    try {
      const order_number = await nextOrderNumber(branch.tenant_email);
      const items = orderedRows.map(r => ({
        variant_id: r.variant_id,
        group_id: r.group_id,
        sku: r.sku,
        barcode: r.barcode,
        group_barcode: r.group_barcode,
        product_name: r.product_name,
        variant_label: r.variant_label,
        category_name: r.category_name,
        branch_stock: r.branch_stock,
        requested_qty: quantities[r.variant_id],
        qty: quantities[r.variant_id],
      }));
      await base44.entities.SupplyOrder.create({
        order_number,
        tenant_email: branch.tenant_email,
        branch_id: branch.id,
        branch_name: branch.name,
        station_email: branch.station_email || user?.email,
        status: 'SENT_TO_NETWORK',
        items,
        branch_notes: notes.trim(),
        sent_to_network_at: nowIso(),
      });
      // Alert for the network master's bell — best effort
      base44.entities.NetworkAlert.create({
        tenant_email: branch.tenant_email,
        type: 'ORDER_PENDING',
        title: `הזמנה חדשה #${order_number}`,
        body: `${branch.name} שלח הזמנה: ${items.length} שורות, ${totalUnits} יחידות`,
        branch_id: branch.id,
        branch_name: branch.name,
        is_read: false,
        navigate_to: 'supply',
      }).catch(() => {});
      clearDraft();
      setConfirmOpen(false);
      setTab('orders');
      queryClient.invalidateQueries({ queryKey: ['supply-orders-branch', branch.id] });
      toast({ title: `הזמנה #${order_number} נשלחה לרשת` });
    } catch (err) {
      toast({ title: 'שליחת ההזמנה נכשלה', description: err?.message || 'נסה שוב', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  if (!ready || loadingGroups || loadingVariants) {
    return <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>;
  }

  if (!branch || !inNetwork) {
    return (
      <Card><CardContent className="py-16 text-center text-gray-500">
        <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
        הסניף לא מחובר לרשת, ולכן אין אפשרות לשלוח הזמנות.
      </CardContent></Card>
    );
  }

  const activeOrders = orders.filter(o => !['RECEIVED', 'CANCELLED'].includes(o.status));
  const incoming = orders.filter(o => o.status === 'SENT_TO_BRANCH');

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">הזמנות מהרשת</h1>
          <p className="text-xs text-gray-500 mt-0.5">{branch.name}</p>
        </div>
        <Button variant="outline" onClick={() => setChatOpen(true)} className="relative gap-2 bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100">
          <MessagesSquare className="w-4 h-4" /> צ'אט עם הרשת
          {unreadChat.length > 0 && (
            <span className="absolute -top-2 -left-2 rounded-full bg-red-500 text-white text-xs font-bold px-1.5 min-w-[20px] text-center">{unreadChat.length}</span>
          )}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b gap-1 overflow-x-auto">
        {[
          { key: 'new', label: 'הזמנה חדשה', icon: ClipboardList, count: orderedRows.length || null },
          { key: 'orders', label: 'ההזמנות שלי', icon: Package, count: activeOrders.length || null },
          { key: 'incoming', label: 'הזמנות מוכנות מהרשת', icon: Truck, count: incoming.length || null },
        ].map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === key ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
            {count ? <span className="rounded-full bg-amber-500 text-white text-xs px-1.5 min-w-[18px] text-center">{count}</span> : null}
          </button>
        ))}
      </div>

      <div>
        <div className="min-w-0 space-y-4">
          {tab === 'new' && (
            <>
              <OrderTilesBuilder
                index={index}
                categories={categories}
                groups={groups}
                variants={variants}
                quantities={quantities}
                onChange={setQuantities}
                scanEnabled={tab === 'new' && !confirmOpen && !receiving && !chatOpen}
              />

              <Card>
                <CardContent className="p-4 space-y-3">
                  <label className="text-sm font-medium text-gray-700">הערות להזמנה</label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="הערות לרשת ולמחסן (לא חובה)" />
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <p className="text-sm text-gray-600">
                      <strong>{orderedRows.length}</strong> שורות · <strong>{totalUnits}</strong> יחידות
                    </p>
                    <div className="flex gap-2">
                      {orderedRows.length > 0 && (
                        <Button variant="outline" onClick={clearDraft} className="gap-1.5 text-gray-600">
                          <Trash2 className="w-4 h-4" /> נקה הזמנה
                        </Button>
                      )}
                      <Button
                        onClick={() => setConfirmOpen(true)}
                        disabled={orderedRows.length === 0}
                        className="gap-2 h-11 px-6 text-base bg-amber-500 hover:bg-amber-600"
                      >
                        <Send className="w-4 h-4" /> שלח לרשת
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {tab === 'orders' && <OrdersList orders={orders} onOpen={setOpenOrder} empty="עוד לא נשלחו הזמנות" />}

          {tab === 'incoming' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-green-200 bg-green-50 p-4">
                <p className="text-sm text-green-900">הגיע משלוח? לחץ על "קבל הזמנה" וסרוק את הברקוד שעל דף ההזמנה. אחרי האישור המלאי מתעדכן אוטומטית.</p>
                <Button onClick={() => setReceiving({ order: null })} disabled={incoming.length === 0} className="h-12 px-6 text-base gap-2 bg-green-600 hover:bg-green-700">
                  <ScanLine className="w-5 h-5" /> קבל הזמנה
                </Button>
              </div>
              <OrdersList orders={incoming} onOpen={(o) => setReceiving({ order: o })} empty="אין כרגע הזמנות בדרך לסניף" />
            </>
          )}
        </div>
      </div>

      {chatOpen && (
        <GeneralChatDrawer open onClose={() => setChatOpen(false)} branchId={branch.id} tenantEmail={branch.tenant_email} senderRole="BRANCH" />
      )}

      {receiving && (
        <ReceiveOrderDialog
          orders={orders}
          initialOrder={receiving.order}
          userEmail={user?.email}
          onClose={() => setReceiving(null)}
        />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לשלוח את ההזמנה לרשת?</AlertDialogTitle>
            <AlertDialogDescription>
              {orderedRows.length} שורות, {totalUnits} יחידות. אחרי השליחה הרשת תוכל לערוך את ההזמנה ולהעביר אותה למחסן.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={sending}>חזור</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); sendOrder(); }} disabled={sending} className="bg-amber-500 hover:bg-amber-600">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שלח לרשת'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!openOrder} onOpenChange={o => !o && setOpenOrder(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          {openOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  הזמנה #{openOrder.order_number}
                  <StatusBadge status={openOrder.status} />
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-gray-500">נשלחה {formatOrderDate(openOrder.sent_to_network_at || openOrder.created_date, true)}</p>
              <SupplyOrderLines
                items={openOrder.items || []}
                showBranchStock={false}
                showPicked={openOrder.items?.some(i => i.picked_qty != null)}
                showReceived={openOrder.status === 'RECEIVED'}
              />
              {openOrder.branch_notes && <NoteBox label="ההערות שלך" text={openOrder.branch_notes} />}
              {openOrder.network_notes && <NoteBox label="הערות הרשת" text={openOrder.network_notes} />}
              {openOrder.warehouse_notes && <NoteBox label="הערות המחסן" text={openOrder.warehouse_notes} />}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NoteBox({ label, text }) {
  return (
    <div className="rounded-xl border bg-gray-50 p-3 text-sm text-gray-700">
      <span className="font-medium">{label}: </span>{text}
    </div>
  );
}

function OrdersList({ orders, onOpen, empty }) {
  if (orders.length === 0) {
    return <Card><CardContent className="py-14 text-center text-gray-400">{empty}</CardContent></Card>;
  }
  return (
    <Card>
      <CardContent className="p-0 divide-y">
        {orders.map(o => {
          const t = orderTotals(o.items);
          return (
            <button key={o.id} onClick={() => onOpen(o)} className="w-full text-right flex items-center justify-between gap-3 px-4 py-3 hover:bg-amber-50 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">הזמנה #{o.order_number}</p>
                <p className="text-xs text-gray-500 truncate">
                  {t.lines} שורות · {t.units} יחידות{o.branch_notes ? ` · ${o.branch_notes}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge status={o.status} />
                <span className="text-xs text-gray-400">{formatOrderDate(o.sent_to_network_at || o.created_date)}</span>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
