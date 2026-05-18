import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Plus, Package, Clock, CheckCircle, XCircle, Truck, MessageSquare, Bell } from 'lucide-react';
import { format } from 'date-fns';
import MultiItemOrderModal from '@/components/orders/MultiItemOrderModal';
import TicketDetailPanel from '@/components/orders/TicketDetailPanel';

const STATUS_CONFIG = {
  pending:  { label: 'ממתין', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  approved: { label: 'אושר',  color: 'bg-green-100 text-green-800',  icon: CheckCircle },
  rejected: { label: 'נדחה',  color: 'bg-red-100 text-red-800',      icon: XCircle },
  partial:  { label: 'חלקי',  color: 'bg-blue-100 text-blue-800',    icon: Truck },
};

export default function BranchNetworkOrders() {
  const [showForm, setShowForm] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const user = useCurrentUser();
  const queryClient = useQueryClient();

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', user?.email],
    queryFn: () => base44.entities.Branch.filter({ tenant_email: user.email }),
    enabled: !!user?.email,
  });
  const myBranch = branches.find(b => b.is_active) || branches[0];

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['order-tickets', myBranch?.id],
    queryFn: () => base44.entities.OrderTicket.filter({ branch_id: myBranch.id }, '-created_date'),
    enabled: !!myBranch?.id,
  });

  // Unread chat messages per ticket (from HQ)
  const { data: allChats = [] } = useQuery({
    queryKey: ['ticket-chats-branch', myBranch?.id],
    queryFn: async () => {
      const ticketIds = tickets.map(t => t.id);
      if (ticketIds.length === 0) return [];
      return base44.entities.TicketChat.filter({ sender_role: 'HQ', is_read: false });
    },
    enabled: tickets.length > 0,
  });

  const unreadByTicket = {};
  allChats.forEach(c => {
    unreadByTicket[c.ticket_id] = (unreadByTicket[c.ticket_id] || 0) + 1;
  });
  const totalUnread = allChats.length;

  // Real-time subscription
  useEffect(() => {
    const unsub = base44.entities.TicketChat.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['ticket-chats-branch', myBranch?.id] });
    });
    return unsub;
  }, [myBranch?.id, queryClient]);


  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'messages'

  // Switch to messages tab if bell clicked
  const handleBellClick = () => {
    setActiveTab('messages');
  };

  const ticketsWithUnread = tickets.filter(t => unreadByTicket[t.id] > 0);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">הזמנות לרשת</h1>
          <p className="text-sm text-gray-500 mt-1">שלח בקשות מלאי למרכז הרשת</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Notification Bell */}
          <button
            onClick={handleBellClick}
            className="relative p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <Bell className="w-5 h-5 text-gray-600" />
            {totalUnread > 0 && (
              <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
                {totalUnread}
              </span>
            )}
          </button>
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" /> הזמנה חדשה
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b gap-1">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'orders' ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          הזמנות
        </button>
        <button
          onClick={() => setActiveTab('messages')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'messages' ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          הודעות ממטה הרשת
          {totalUnread > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{totalUnread}</span>
          )}
        </button>
      </div>

      {activeTab === 'orders' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const Icon = cfg.icon;
              const count = tickets.filter(t => t.status === key).length;
              return (
                <Card key={key}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <Icon className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">{cfg.label}</p>
                      <p className="text-xl font-bold">{count}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Tickets Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">היסטוריית הזמנות</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="py-8 text-center text-gray-400">טוען...</div>
              ) : tickets.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>אין הזמנות עדיין</p>
                </div>
              ) : (
                <div className="divide-y">
                  {tickets.map(ticket => {
                    const cfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.pending;
                    const unread = unreadByTicket[ticket.id] || 0;
                    return (
                      <button
                        key={ticket.id}
                        onClick={() => setSelectedTicket(ticket)}
                        className="w-full text-right flex items-center justify-between px-4 py-3 hover:bg-amber-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-amber-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">
                              הזמנה #{ticket.id.slice(-6)}
                              {unread > 0 && (
                                <span className="mr-2 inline-flex items-center gap-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                                  <MessageSquare className="w-2.5 h-2.5" />{unread}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400">
                              {ticket.total_items} פריטים
                              {ticket.notes ? ` • ${ticket.notes}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                          <span className="text-xs text-gray-400">
                            {ticket.created_date ? format(new Date(ticket.created_date), 'dd/MM/yy') : ''}
                          </span>
                          <span className="text-gray-300">←</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === 'messages' && (
        <Card>
          <CardContent className="p-0">
            {ticketsWithUnread.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>אין הודעות חדשות ממטה הרשת</p>
              </div>
            ) : (
              <div className="divide-y">
                {ticketsWithUnread.map(ticket => {
                  const cfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.pending;
                  return (
                    <button
                      key={ticket.id}
                      onClick={() => { setSelectedTicket(ticket); }}
                      className="w-full text-right flex items-center justify-between px-4 py-4 hover:bg-amber-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                          <MessageSquare className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            הזמנה #{ticket.id.slice(-6)}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {unreadByTicket[ticket.id]} הודעות חדשות ממטה הרשת
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {ticket.created_date ? format(new Date(ticket.created_date), 'dd/MM/yy') : ''}
                            {ticket.notes ? ` • ${ticket.notes}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                        <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">{unreadByTicket[ticket.id]}</span>
                        <span className="text-gray-300">←</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showForm && myBranch && (
        <MultiItemOrderModal
          open={showForm}
          onClose={() => setShowForm(false)}
          branch={myBranch}
          tenantEmail={myBranch.tenant_email}
        />
      )}

      {selectedTicket && (
        <TicketDetailPanel
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          viewerRole="BRANCH"
          tenantEmail={user?.email}
        />
      )}
    </div>
  );
}