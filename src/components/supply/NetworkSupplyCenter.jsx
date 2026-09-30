import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Store, Warehouse, MessagesSquare, Inbox, PackageCheck, Truck, History } from 'lucide-react';
import GeneralChatDrawer from '@/components/orders/GeneralChatDrawer';
import SupplyStatusBadge from '@/components/supply/SupplyStatusBadge';
import NetworkSupplyOrderDialog from '@/components/supply/NetworkSupplyOrderDialog';
import WarehouseConnectCard from '@/components/supply/WarehouseConnectCard';
import OrderDocumentDialog from '@/components/supply/OrderDocument';
import { orderTotals, formatOrderDate } from '@/lib/supplyOrders';

/**
 * Network ↔ branches on one side, network ↔ warehouse on the other.
 * Orders: branch sends → network edits → shares to warehouse → warehouse picks (READY) → network shares to branch.
 */
export default function NetworkSupplyCenter({ tenantEmail, networkName }) {
  const queryClient = useQueryClient();
  const [openOrderId, setOpenOrderId] = useState(null);
  const [branchTab, setBranchTab] = useState('pending');
  const [warehouseTab, setWarehouseTab] = useState('pending');
  const [chatBranchId, setChatBranchId] = useState('');
  const [docOrder, setDocOrder] = useState(null);

  const { data: orders = [] } = useQuery({
    queryKey: ['supply-orders-network', tenantEmail],
    queryFn: () => base44.entities.SupplyOrder.filter({ tenant_email: tenantEmail }, '-created_date', 300),
    enabled: !!tenantEmail,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses', tenantEmail],
    queryFn: () => base44.entities.Warehouse.filter({ tenant_email: tenantEmail }),
    enabled: !!tenantEmail,
  });
  const warehouse = warehouses.find(w => w.status === 'ACTIVE') || warehouses.find(w => w.status === 'PENDING') || warehouses[0] || null;

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantEmail],
    queryFn: () => base44.entities.Branch.filter({ tenant_email: tenantEmail }),
    enabled: !!tenantEmail,
  });
  const activeBranches = branches.filter(b => (b.status || 'ACTIVE') === 'ACTIVE' && b.system_approval !== 'PENDING_SYSTEM');

  // Unread chat messages sent to the network (from branches and from the warehouse — same channel)
  const { data: unreadChats = [] } = useQuery({
    queryKey: ['supply-unread-chats', tenantEmail],
    queryFn: () => base44.entities.BranchGeneralChat.filter({ tenant_email: tenantEmail, sender_role: 'BRANCH', is_read: false }),
    enabled: !!tenantEmail,
    refetchInterval: 30000,
  });
  const unreadBy = useMemo(() => unreadChats.reduce((m, c) => ({ ...m, [c.branch_id]: (m[c.branch_id] || 0) + 1 }), {}), [unreadChats]);

  useEffect(() => {
    if (!tenantEmail) return undefined;
    const u1 = base44.entities.SupplyOrder.subscribe(() => queryClient.invalidateQueries({ queryKey: ['supply-orders-network', tenantEmail] }));
    const u2 = base44.entities.Warehouse.subscribe(() => queryClient.invalidateQueries({ queryKey: ['warehouses', tenantEmail] }));
    const u3 = base44.entities.BranchGeneralChat.subscribe(() => queryClient.invalidateQueries({ queryKey: ['supply-unread-chats', tenantEmail] }));
    return () => { u1(); u2(); u3(); };
  }, [tenantEmail, queryClient]);

  // Default the branch chat to the branch with unread messages, else the first branch
  useEffect(() => {
    if (!chatBranchId && activeBranches.length > 0) {
      const withUnread = activeBranches.find(b => unreadBy[b.id]);
      setChatBranchId((withUnread || activeBranches[0]).id);
    }
  }, [activeBranches.length, chatBranchId, unreadBy]);

  const by = (...statuses) => orders.filter(o => statuses.includes(o.status));
  const lists = {
    branchPending: by('SENT_TO_NETWORK'),
    ready: by('READY'),
    branchSent: by('SENT_TO_BRANCH', 'RECEIVED'),
    warehousePending: by('SENT_TO_WAREHOUSE', 'PICKING', 'PACKED'),
  };
  const openOrder = orders.find(o => o.id === openOrderId) || null;
  const branchUnreadTotal = activeBranches.reduce((s, b) => s + (unreadBy[b.id] || 0), 0);
  const warehouseUnread = warehouse ? unreadBy[warehouse.id] || 0 : 0;

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">הזמנות ואספקה</h1>
        <p className="text-sm text-gray-500 mt-1">הזמנות מהסניפים, העברה למחסן, והחזרה לסניפים — הכל במקום אחד</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* ── Network ↔ branches ── */}
        <Panel icon={Store} title="הרשת ↔ הסניפים" accent="amber">
          <SubTabs
            value={branchTab}
            onChange={setBranchTab}
            tabs={[
              { key: 'pending', label: 'ממתינות מהסניפים', icon: Inbox, count: lists.branchPending.length },
              { key: 'ready', label: 'מוכנות מהמחסן', icon: PackageCheck, count: lists.ready.length },
              { key: 'sent', label: 'נשלחו לסניפים', icon: History },
              { key: 'chat', label: "צ'אט", icon: MessagesSquare, count: branchUnreadTotal },
            ]}
          />
          {branchTab === 'pending' && <OrderList orders={lists.branchPending} onOpen={setOpenOrderId} empty="אין הזמנות שממתינות לטיפול" />}
          {branchTab === 'ready' && (
            <OrderList orders={lists.ready} onOpen={setOpenOrderId} empty="אין הזמנות מוכנות לשיתוף לסניף" hint="פתח הזמנה ולחץ 'שתף לסניף'" />
          )}
          {branchTab === 'sent' && <OrderList orders={lists.branchSent} onOpen={setOpenOrderId} empty="עוד לא נשלחו הזמנות לסניפים" />}
          {branchTab === 'chat' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {activeBranches.map(b => (
                  <button
                    key={b.id}
                    onClick={() => setChatBranchId(b.id)}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                      chatBranchId === b.id ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white text-gray-600 hover:border-amber-400'
                    }`}
                  >
                    {b.name}
                    {unreadBy[b.id] ? <span className="mr-1.5 rounded-full bg-red-500 text-white text-xs px-1.5">{unreadBy[b.id]}</span> : null}
                  </button>
                ))}
              </div>
              {chatBranchId && (
                <div className="h-[460px] rounded-2xl border overflow-hidden">
                  <GeneralChatDrawer
                    key={chatBranchId}
                    open
                    inline
                    branchId={chatBranchId}
                    tenantEmail={tenantEmail}
                    senderRole="HQ"
                    title={`צ'אט עם ${activeBranches.find(b => b.id === chatBranchId)?.name || 'הסניף'}`}
                  />
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* ── Network ↔ warehouse ── */}
        <Panel icon={Warehouse} title="הרשת ↔ המחסן" accent="blue">
          <WarehouseConnectCard warehouse={warehouse} tenantEmail={tenantEmail} networkName={networkName} />
          <SubTabs
            value={warehouseTab}
            onChange={setWarehouseTab}
            tabs={[
              { key: 'pending', label: 'ממתינות במחסן', icon: Truck, count: lists.warehousePending.length },
              { key: 'ready', label: 'מוכנות מהמחסן', icon: PackageCheck, count: lists.ready.length },
              { key: 'chat', label: "צ'אט", icon: MessagesSquare, count: warehouseUnread },
            ]}
          />
          {warehouseTab === 'pending' && <OrderList orders={lists.warehousePending} onOpen={setOpenOrderId} empty="אין הזמנות פתוחות במחסן" />}
          {warehouseTab === 'ready' && <OrderList orders={lists.ready} onOpen={setOpenOrderId} empty="אין הזמנות מוכנות" />}
          {warehouseTab === 'chat' && (
            warehouse?.status === 'ACTIVE' ? (
              <div className="h-[460px] rounded-2xl border overflow-hidden">
                <GeneralChatDrawer open inline branchId={warehouse.id} tenantEmail={tenantEmail} senderRole="HQ" title={`צ'אט עם ${warehouse.name}`} />
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-gray-400">הצ'אט ייפתח אחרי שהמחסן יאשר את החיבור</p>
            )
          )}
        </Panel>
      </div>

      {openOrder && (
        <NetworkSupplyOrderDialog order={openOrder} warehouse={warehouse} onClose={() => setOpenOrderId(null)} onPrint={(o) => { setOpenOrderId(null); setDocOrder(o); }} />
      )}
      {docOrder && <OrderDocumentDialog order={docOrder} warehouse={warehouse} onClose={() => setDocOrder(null)} />}
    </div>
  );
}

function Panel({ icon: Icon, title, accent, children }) {
  const colors = accent === 'blue' ? 'text-blue-600 bg-blue-50' : 'text-amber-600 bg-amber-50';
  return (
    <section className="rounded-2xl border bg-white shadow-sm p-4 space-y-3 min-w-0">
      <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${colors}`}><Icon className="w-5 h-5" /></span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function SubTabs({ tabs, value, onChange }) {
  return (
    <div className="flex border-b gap-1 overflow-x-auto">
      {tabs.map(({ key, label, icon: Icon, count }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
            value === key ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Icon className="w-4 h-4" /> {label}
          {count ? <span className="rounded-full bg-red-500 text-white text-xs px-1.5 min-w-[18px] text-center">{count}</span> : null}
        </button>
      ))}
    </div>
  );
}

function OrderList({ orders, onOpen, empty, hint }) {
  if (orders.length === 0) return <p className="py-10 text-center text-sm text-gray-400">{empty}</p>;
  return (
    <div className="space-y-2">
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
      <div className="divide-y rounded-xl border">
        {orders.map(o => {
          const t = orderTotals(o.items);
          return (
            <button key={o.id} onClick={() => onOpen(o.id)} className="w-full text-right flex items-center justify-between gap-3 px-3 py-3 hover:bg-amber-50 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">{o.branch_name} · #{o.order_number}</p>
                <p className="text-xs text-gray-500 truncate">
                  {t.lines} שורות · {t.units} יחידות{o.branch_notes ? ` · ${o.branch_notes}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <SupplyStatusBadge status={o.status} />
                <span className="text-xs text-gray-400">{formatOrderDate(o.sent_to_network_at || o.created_date)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
