import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, GitBranch, ShoppingBag, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';

export default function NotificationBell({ tenantEmail, onNavigateToOrders, onNavigateToBranches }) {
  const [open, setOpen] = useState(false);
  const [dismissedOrders, setDismissedOrders] = useState(new Set());
  const ref = useRef(null);
  const queryClient = useQueryClient();

  // Order tickets (pending)
  const { data: tickets = [] } = useQuery({
    queryKey: ['order-tickets', tenantEmail],
    queryFn: () => base44.entities.OrderTicket.filter({ tenant_email: tenantEmail }, '-created_date'),
    enabled: !!tenantEmail,
    refetchInterval: 30000,
  });

  // Network alerts (unread)
  const { data: alerts = [] } = useQuery({
    queryKey: ['network-alerts', tenantEmail],
    queryFn: () => base44.entities.NetworkAlert.filter({ tenant_email: tenantEmail, is_read: false }, '-created_date'),
    enabled: !!tenantEmail,
    refetchInterval: 30000,
  });

  // Unread chat messages from branches (HQ side)
  const { data: unreadChats = [] } = useQuery({
    queryKey: ['ticket-chats-hq-bell', tenantEmail],
    queryFn: () => base44.entities.TicketChat.filter({ sender_role: 'BRANCH', is_read: false }),
    enabled: !!tenantEmail,
    refetchInterval: 15000,
  });

  // Group unread chats by ticket_id, attach branch name via tickets
  const ticketById = Object.fromEntries(tickets.map(t => [t.id, t]));
  const chatsByTicket = {};
  for (const chat of unreadChats) {
    if (!chatsByTicket[chat.ticket_id]) chatsByTicket[chat.ticket_id] = [];
    chatsByTicket[chat.ticket_id].push(chat);
  }
  const unreadChatTickets = Object.entries(chatsByTicket).map(([ticketId, chats]) => ({
    ticketId,
    count: chats.length,
    chatIds: chats.map(c => c.id),
    branchName: ticketById[ticketId]?.branch_name || 'סניף',
    latestDate: chats[chats.length - 1]?.created_date,
  }));

  // Real-time subscriptions
  useEffect(() => {
    const unsub1 = base44.entities.OrderTicket.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['order-tickets', tenantEmail] });
    });
    const unsub2 = base44.entities.NetworkAlert.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['network-alerts', tenantEmail] });
    });
    const unsub3 = base44.entities.TicketChat.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['ticket-chats-hq-bell', tenantEmail] });
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [tenantEmail, queryClient]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pendingOrders = tickets.filter(t => t.status === 'pending' && !dismissedOrders.has(t.id));
  const unreadAlerts = alerts;
  const totalCount = pendingOrders.length + unreadAlerts.length + unreadChatTickets.length;

  const markAlertRead = async (alert) => {
    await base44.entities.NetworkAlert.delete(alert.id);
    queryClient.invalidateQueries({ queryKey: ['network-alerts', tenantEmail] });
    setOpen(false);
    if (alert.navigate_to === 'branches' && onNavigateToBranches) onNavigateToBranches();
    else if (onNavigateToOrders) onNavigateToOrders();
  };

  const handleChatClick = async ({ chatIds }) => {
    // Mark all chats in this ticket as read
    await Promise.all(chatIds.map(id => base44.entities.TicketChat.update(id, { is_read: true })));
    queryClient.invalidateQueries({ queryKey: ['ticket-chats-hq-bell', tenantEmail] });
    queryClient.invalidateQueries({ queryKey: ['ticket-chats-hq', tenantEmail] });
    setOpen(false);
    onNavigateToOrders?.();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-xl text-gray-400 hover:text-amber-400 hover:bg-white/5 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {totalCount > 0 && (
          <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <span className="font-semibold text-gray-800 text-sm">התראות</span>
            <span className="text-xs text-gray-500">{totalCount} חדשות</span>
          </div>

          {totalCount === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">אין התראות חדשות</div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y">
              {/* Unread chat messages from branches */}
              {unreadChatTickets.map(ct => (
                <button
                  key={ct.ticketId}
                  onClick={() => handleChatClick(ct)}
                  className="w-full text-right px-4 py-3 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">{ct.branchName} — {ct.count} הודעות חדשות</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {ct.latestDate ? format(new Date(ct.latestDate), 'dd/MM/yy HH:mm') : ''}
                      </p>
                    </div>
                  </div>
                </button>
              ))}

              {/* System alerts first */}
              {unreadAlerts.map(alert => (
                <button
                  key={alert.id}
                  onClick={() => markAlertRead(alert)}
                  className="w-full text-right px-4 py-3 hover:bg-green-50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                      <GitBranch className="w-3.5 h-3.5 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">{alert.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{alert.body}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {alert.created_date ? format(new Date(alert.created_date), 'dd/MM/yy HH:mm') : ''}
                      </p>
                    </div>
                  </div>
                </button>
              ))}

              {/* Pending order tickets */}
              {pendingOrders.slice(0, 6).map(ticket => (
                <button
                  key={ticket.id}
                  onClick={() => { setDismissedOrders(prev => new Set([...prev, ticket.id])); setOpen(false); onNavigateToOrders?.(); }}
                  className="w-full text-right px-4 py-3 hover:bg-amber-50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {ticket.branch_name || 'סניף'} — {ticket.total_items} פריטים
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {ticket.created_date ? format(new Date(ticket.created_date), 'dd/MM/yy HH:mm') : ''}
                        {ticket.notes ? ` • ${ticket.notes}` : ''}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="px-4 py-3 border-t bg-gray-50">
            <button
              onClick={() => { setOpen(false); onNavigateToOrders?.(); }}
              className="w-full text-center text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              צפה בכל ההזמנות ←
            </button>
          </div>
        </div>
      )}
    </div>
  );
}