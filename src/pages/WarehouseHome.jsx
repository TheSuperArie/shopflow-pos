import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Loader2, Warehouse, Inbox, PackageCheck, MessagesSquare, LogOut, ArrowRight, ScanLine } from 'lucide-react';
import GeneralChatDrawer from '@/components/orders/GeneralChatDrawer';
import SupplyOrderLines from '@/components/supply/SupplyOrderLines';
import SupplyOrderParties from '@/components/supply/SupplyOrderParties';
import SupplyStatusBadge from '@/components/supply/SupplyStatusBadge';
import { orderTotals, formatOrderDate } from '@/lib/supplyOrders';

/** The warehouse account's whole app: incoming orders, ready orders, chat with the network. */
export default function WarehouseHome() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('pending');
  const [openId, setOpenId] = useState(null);

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
  const done = orders.filter(o => ['READY', 'SENT_TO_BRANCH', 'RECEIVED'].includes(o.status));
  const openOrder = orders.find(o => o.id === openId);

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      {/* Top bar */}
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
        {openOrder ? (
          <OrderView order={openOrder} warehouse={warehouse} onBack={() => setOpenId(null)} />
        ) : (
          <>
            {/* Big tabs — tablet friendly */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'pending', label: 'הזמנות ממתינות', icon: Inbox, count: pending.length },
                { key: 'done', label: 'הזמנות מוכנות', icon: PackageCheck, count: 0 },
                { key: 'chat', label: "צ'אט עם הרשת", icon: MessagesSquare, count: unread.length },
              ].map(({ key, label, icon: Icon, count }) => (
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
            {tab === 'done' && <OrderCards orders={done} loading={isLoading} onOpen={setOpenId} empty="עוד אין הזמנות מוכנות" />}
            {tab === 'chat' && (
              <div className="h-[70vh] rounded-2xl border bg-white overflow-hidden">
                <GeneralChatDrawer open inline branchId={warehouse.id} tenantEmail={warehouse.tenant_email} senderRole="BRANCH" title="צ'אט עם הרשת" />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function OrderCards({ orders, loading, onOpen, empty }) {
  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-500" /></div>;
  if (orders.length === 0) return <div className="py-16 text-center text-gray-400 rounded-2xl border bg-white">{empty}</div>;
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
          </button>
        );
      })}
    </div>
  );
}

function OrderView({ order, warehouse, onBack }) {
  const t = orderTotals(order.items);
  const canPick = ['SENT_TO_WAREHOUSE', 'PICKING'].includes(order.status);
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
        <ArrowRight className="w-4 h-4" /> חזרה להזמנות
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
        {canPick && (
          <Button disabled className="h-14 px-8 text-lg gap-2 bg-blue-600" title="מסך הליקוט יתווסף בשלב הבא">
            <ScanLine className="w-6 h-6" /> לקט הזמנה
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

      <SupplyOrderLines items={order.items || []} showBranchStock={false} showPicked={order.items?.some(i => i.picked_qty != null)} />

      <SupplyOrderParties order={order} warehouse={warehouse} />
    </div>
  );
}
