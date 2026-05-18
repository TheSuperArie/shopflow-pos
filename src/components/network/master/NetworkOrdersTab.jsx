import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Clock, Package, Filter, MessageSquare, FileSpreadsheet } from 'lucide-react';
import { format } from 'date-fns';
import TicketDetailPanel from '@/components/orders/TicketDetailPanel';

const STATUS_CONFIG = {
  pending:  { label: 'ממתין', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'אושר',  color: 'bg-green-100 text-green-800'  },
  rejected: { label: 'נדחה',  color: 'bg-red-100 text-red-800'      },
  partial:  { label: 'חלקי',  color: 'bg-blue-100 text-blue-800'    },
};

async function exportOrdersToExcel(tickets, tenantEmail) {
  // Fetch all stock requests and branches in parallel
  const [allRequests, branches] = await Promise.all([
    base44.entities.StockRequest.filter({ tenant_email: tenantEmail }),
    base44.entities.Branch.filter({ tenant_email: tenantEmail }),
  ]);

  const branchMap = {};
  branches.forEach(b => { branchMap[b.id] = b; });

  // Build rows per ticket
  const rows = [];
  for (const ticket of tickets) {
    const branch = branchMap[ticket.branch_id] || {};
    const items = allRequests.filter(r => r.ticket_id === ticket.id);

    // Header info for this ticket
    const branchHeader = [
      ['סניף:', ticket.branch_name || ''],
      ['כתובת:', branch.address || ''],
      ['מנהל סניף:', branch.manager_name || ''],
      ['טלפון:', branch.manager_phone || ''],
      ['תאריך הזמנה:', ticket.created_date ? format(new Date(ticket.created_date), 'dd/MM/yyyy HH:mm') : ''],
      ['סטטוס:', { pending: 'ממתין', approved: 'אושר', rejected: 'נדחה', partial: 'חלקי' }[ticket.status] || ticket.status],
      [],
      ['מק"ט', 'שם פריט', 'כמות מבוקשת', 'כמות מאושרת', 'סטטוס'],
    ];

    const itemRows = items.map(item => {
      // Try to extract SKU from variant_label (format: "Name / dim1 / dim2" or item.sku)
      const sku = item.sku || '';
      const nameParts = item.variant_label || '';
      return [sku, nameParts, item.requested_qty, item.approved_qty ?? '', { pending: 'ממתין', approved: 'אושר', rejected: 'נדחה' }[item.status] || item.status];
    });

    rows.push(...branchHeader, ...itemRows, [], [], []);
  }

  // Build CSV content (Hebrew-compatible with BOM)
  const csvRows = rows.map(row => {
    if (!Array.isArray(row)) return '';
    return row.map(cell => {
      const val = String(cell ?? '');
      return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val.replace(/"/g, '""')}"` : val;
    }).join(',');
  });

  const bom = '\uFEFF';
  const csvContent = bom + csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `הזמנות_סניפים_${format(new Date(), 'dd-MM-yyyy')}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function NetworkOrdersTab({ tenantEmail }) {
  const [filterBranch, setFilterBranch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [exporting, setExporting] = useState(false);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['order-tickets', tenantEmail],
    queryFn: () => base44.entities.OrderTicket.filter({ tenant_email: tenantEmail }, '-created_date'),
    enabled: !!tenantEmail,
  });

  // Unread messages from branches
  const { data: allChats = [] } = useQuery({
    queryKey: ['ticket-chats-hq', tenantEmail],
    queryFn: () => base44.entities.TicketChat.filter({ sender_role: 'BRANCH', is_read: false }),
    enabled: !!tenantEmail,
    refetchInterval: 15000,
  });

  const unreadByTicket = {};
  allChats.forEach(c => {
    unreadByTicket[c.ticket_id] = (unreadByTicket[c.ticket_id] || 0) + 1;
  });

  const pendingCount = tickets.filter(t => t.status === 'pending').length;

  const filtered = tickets.filter(t => {
    if (filterBranch && !t.branch_name?.includes(filterBranch)) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterFrom && new Date(t.created_date) < new Date(filterFrom)) return false;
    if (filterTo && new Date(t.created_date) > new Date(filterTo + 'T23:59:59')) return false;
    return true;
  });

  const handleExport = async () => {
    setExporting(true);
    await exportOrdersToExcel(filtered, tenantEmail);
    setExporting(false);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">הזמנות מהסניפים</h1>
          <p className="text-sm text-gray-500 mt-1">מרכז ניהול וטיפול בהזמנות</p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2">
              <Clock className="w-4 h-4 text-yellow-600" />
              <span className="text-sm font-semibold text-yellow-800">{pendingCount} ממתינות</span>
            </div>
          )}
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting || filtered.length === 0}
            className="gap-2 border-green-300 text-green-700 hover:bg-green-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {exporting ? 'מייצא...' : 'ייצוא Excel'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">סינון</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Input placeholder="שם סניף..." value={filterBranch} onChange={e => setFilterBranch(e.target.value)} />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">כל הסטטוסים</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
            <Input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Tickets List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-gray-400">טוען...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>אין הזמנות</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map(ticket => {
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
                        <p className="text-sm font-bold text-gray-800">
                          {ticket.branch_name || 'סניף'}
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
                        {ticket.created_date ? format(new Date(ticket.created_date), 'dd/MM/yy HH:mm') : ''}
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

      {selectedTicket && (
        <TicketDetailPanel
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          viewerRole="HQ"
          tenantEmail={tenantEmail}
        />
      )}
    </div>
  );
}