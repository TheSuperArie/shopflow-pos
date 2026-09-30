import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  Loader2, Warehouse, Inbox, PackageCheck, MessagesSquare, LogOut, ArrowRight, ScanLine, UsersRound, Printer, Send,
} from 'lucide-react';
import GeneralChatDrawer from '@/components/orders/GeneralChatDrawer';
import SupplyOrderLines from '@/components/supply/SupplyOrderLines';
import SupplyOrderParties from '@/components/supply/SupplyOrderParties';
import SupplyStatusBadge from '@/components/supply/SupplyStatusBadge';
import PickingScreen from '@/components/supply/PickingScreen';
import OrderDocumentDialog from '@/components/supply/OrderDocument';
import WarehousePickersPanel from '@/components/supply/WarehousePickersPanel';
import { orderTotals, formatOrderDate, nowIso } from '@/lib/supplyOrders';

/** The warehouse account's whole app: incoming orders, picking, ready orders, pickers, chat with the network. */
export default function WarehouseHome() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState('pending');
  const [openId, setOpenId] = useState(null);
  const [pickingId, setPickingId] = useState(null);
  const [docOrder, setDocOrder] = useState(null);
  const [sendingId, setSendingId] = useState(null);

  const { data: records = [], isLoading: loadingWarehouse } = useQuery({
    queryKey: ['my-warehouse', user?.email],
    queryFn: () => base44.entities.Warehouse.filter({ station_email: user.email }),
    enabled: !!user?.email,
    staleTime: 300000,
  });
  const warehouse = records.find(w => w.status === 'ACTIVE');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['supply-orders-warehouse', warehouse?.id],
    queryFn: () => base44.entities.SupplyOrder.filter({ warehouse_id: warehouse.id }, '-created_date', 300),
    enabled: !!warehouse?.id,
  });

  useEffect(() => {
    if (!warehouse?.id) return undefined;
    return base44.entities.SupplyOrder.subscribe(() =>
      queryClient.invalidateQueries({ queryKey: ['supply-orders-warehouse', warehouse.id] }));
  }, [warehouse?.id, queryClient]);

  const { data: unread = [] } = useQuery({
    queryKey: ['warehouse-unread-chat', warehouse?.id],
    queryFn: () => base44.entities.BranchGeneralChat.filter({ branch_id: warehouse.id, sender_role: 'HQ', is_read: false }),
    enabled: !!warehouse?.id,
    refetchInterval: 30000,
  });

  if (!user || loadingWarehouse) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }
  if (!warehouse) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-gray-500" dir="rtl">
        החשבון הזה לא מחובר כמחסן לאף רשת.
      </div>
    );
  }

  const pending = orders.filter(o => ['SENT_TO_WAREHOUSE', 'PICKING'].includes(o.status));
  const packed = orders.filter(o => o.status === 'PACKED');
  const history = orders.filter(o => ['READY', 'SENT_TO_BRANCH', 'RECEIVED'].includes(o.status));
  const openOrder = orders.find(o => o.id === openId);
  const pickingOrder = orders.find(o => o.id === pickingId);

  const sendToNetwork = async (order) => {
    setSendingId(order.id);
    try {
      await base44.entities.SupplyOrder.update(order.id, { status: 'READY' });
      queryClient.invalidateQueries({ queryKey: ['supply-orders-warehouse', warehouse.id] });
      toast({ title: `הזמנה #${order.order_number} נשלחה לרשת` });
    } catch (err) {
      toast({ title: 'השליחה נכשלה', description: err?.message, variant: 'destructive' });
    } finally {
      setSendingId(null);
    }
  };

  const tabs = [
    { key: 'pending', label: 'הזמנות ממתינות', icon: Inbox, count: pending.length },
    { key: 'ready', label: 'הזמנות מוכנות', icon: PackageCheck, count: packed.length },
    { key: 'pickers', label: 'מלקטים', icon: UsersRound, count: 0 },
    { key: 'chat', label: "צ'אט עם הרשת", icon: MessagesSquare, count: unread.length },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      <header className="bg-gray-950 text-white px-4 md:px-6 py-3 flex items-center gap-3 sticky top-0 z-30">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center"><Warehouse className="w-5 h-5 text-blue-300" /></div>
        <div className="flex-1 min-w-0">
          <p className="font-bold truncate">{warehouse.name}</p>
          <p className="text-xs text-gray-400 truncate">מחסן · {warehouse.network_name}</p>
        </div>
        <button onClick={() => base44.auth.logout()} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-gray-300 hover:bg-white/10">
          <LogOut className="w-4 h-4" /> יציאה
        </button>
      </header>

      <main className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
        {pickingOrder ? (
          <PickingScreen
            key={pickingOrder.id}
            order={pickingOrder}
            warehouse={warehouse}
            onBack={() => setPickingId(null)}
            onFinished={(finished) => { setPickingId(null); setOpenId(null); setTab('ready'); setDocOrder(finished); }}
          />
        ) : openOrder ? (
          <OrderView order={openOrder} warehouse={warehouse} onBack={() => setOpenId(null)} onPick={() => setPickingId(openOrder.id)} onPrint={() => setDocOrder(openOrder)} />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {tabs.map(({ key, label, icon: Icon, count }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`relative flex flex-col sm:flex-row items-center justify-center gap-2 rounded-2xl border-2 px-3 py-4 text-sm sm:text-base font-semibold transition-colors ${
                    tab === key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
                  }`}
                >
                  <Icon className="w-6 h-6" /> {label}
                  {count > 0 && <span className="absolute -top-2 -left-2 rounded-full bg-red-500 text-white text-xs font-bold px-2 py-0.5">{count}</span>}
                </button>
              ))}
            </div>

            {tab === 'pending' && <OrderCards orders={pending} loading={isLoading} onOpen={setOpenId} empty="אין הזמנות ממתינות" />}

            {tab === 'ready' && (
              <div className="space-y-6">
                {packed.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 rounded-2xl border bg-white">אין הזמנות שממתינות לשליחה לרשת</div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {packed.map(o => {
                      const t = orderTotals(o.items);
                      const units = (o.items || []).reduce((s, i) => s + Number(i.picked_qty || 0), 0);
                      return (
                        <div key={o.id} className="rounded-2xl border-2 border-teal-200 bg-white p-4 space-y-3">
                          <button onClick={() => setOpenId(o.id)} className="text-right w-full">
                            <p className="text-lg font-bold text-gray-900">{o.branch_name} · {formatOrderDate(o.ready_at || o.created_date)}</p>
                            <p className="text-sm text-gray-500">הזמנה #{o.order_number} · {t.lines} שורות · נארזו {units}/{t.units}</p>
                            {o.picker_name && <p className="text-xs text-gray-400 mt-0.5">מלקט: {o.picker_name}</p>}
                          </button>
                          <div className="grid grid-cols-2 gap-2">
                            <Button variant="outline" onClick={() => setDocOrder(o)} className="h-12 gap-1.5 text-base">
                              <Printer className="w-5 h-5" /> PDF / הדפסה
                            </Button>
                            <Button onClick={() => sendToNetwork(o)} disabled={sendingId === o.id} className="h-12 gap-1.5 text-base bg-green-600 hover:bg-green-700">
                              {sendingId === o.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />} שלח לרשת
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {history.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-gray-600">נשלחו לרשת</h3>
                    <OrderCards orders={history} loading={false} onOpen={setOpenId} empty="" />
                  </div>
                )}
              </div>
            )}

            {tab === 'pickers' && <WarehousePickersPanel warehouse={warehouse} orders={orders} />}

            {tab === 'chat' && (
              <div className="h-[70vh] rounded-2xl border bg-white overflow-hidden">
                <GeneralChatDrawer open inline branchId={warehouse.id} tenantEmail={warehouse.tenant_email} senderRole="BRANCH" title="צ'אט עם הרשת" />
              </div>
            )}
          </>
        )}
      </main>

      {docOrder && <OrderDocumentDialog order={docOrder} warehouse={warehouse} onClose={() => setDocOrder(null)} />}
    </div>
  );
}

function OrderCards({ orders, loading, onOpen, empty }) {
  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-500" /></div>;
  if (orders.length === 0) return empty ? <div className="py-16 text-center text-gray-400 rounded-2xl border bg-white">{empty}</div> : null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {orders.map(o => {
        const t = orderTotals(o.items);
        return (
          <button key={o.id} onClick={() => onOpen(o.id)} className="text-right rounded-2xl border-2 border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-md transition-all space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-lg font-bold text-gray-900">{o.branch_name}</p>
              <SupplyStatusBadge status={o.status} />
            </div>
            <p className="text-sm text-gray-500">הזמנה #{o.order_number} · {formatOrderDate(o.sent_to_warehouse_at || o.created_date, true)}</p>
            <p className="text-sm text-gray-700"><strong>{t.lines}</strong> שורות · <strong>{t.units}</strong> יחידות</p>
            {o.status === 'PICKING' && o.picker_name && <p className="text-xs text-indigo-600">בליקוט אצל {o.picker_name}</p>}
          </button>
        );
      })}
    </div>
  );
}

function OrderView({ order, warehouse, onBack, onPick, onPrint }) {
  const t = orderTotals(order.items);
  const canPick = ['SENT_TO_WAREHOUSE', 'PICKING', 'PACKED'].includes(order.status);
  const hasPicked = order.items?.some(i => i.picked_qty != null);
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-base text-gray-600 hover:text-gray-900">
        <ArrowRight className="w-5 h-5" /> חזרה להזמנות
      </button>

      <div className="rounded-2xl border bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
            {order.branch_name} · הזמנה #{order.order_number} <SupplyStatusBadge status={order.status} />
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            {formatOrderDate(order.sent_to_warehouse_at || order.created_date, true)} · {t.lines} שורות · {t.units} יחידות
          </p>
        </div>
        {hasPicked && !['SENT_TO_WAREHOUSE', 'PICKING'].includes(order.status) && (
          <Button variant="outline" onClick={onPrint} className="h-14 px-5 text-base gap-2"><Printer className="w-5 h-5" /> PDF / הדפסה</Button>
        )}
        {canPick && (
          <Button onClick={onPick} className="h-14 px-8 text-lg gap-2 bg-blue-600 hover:bg-blue-700">
            <ScanLine className="w-6 h-6" /> {order.status === 'SENT_TO_WAREHOUSE' ? 'לקט הזמנה' : order.status === 'PICKING' ? 'המשך ליקוט' : 'ערוך ליקוט'}
          </Button>
        )}
      </div>

      {order.network_notes && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-gray-800">
          <span className="font-semibold">הערות הרשת: </span>{order.network_notes}
        </div>
      )}
      {order.branch_notes && (
        <div className="rounded-xl border bg-white p-3 text-sm text-gray-700">
          <span className="font-semibold">הערות הסניף: </span>{order.branch_notes}
        </div>
      )}
      {order.warehouse_notes && (
        <div className="rounded-xl border bg-white p-3 text-sm text-gray-700">
          <span className="font-semibold">הערות הליקוט: </span>{order.warehouse_notes}
        </div>
      )}

      <SupplyOrderLines items={order.items || []} showBranchStock={false} showRequested={false} showPicked={hasPicked} />

      <SupplyOrderParties order={order} warehouse={warehouse} />
    </div>
  );
}
