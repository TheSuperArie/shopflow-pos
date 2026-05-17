import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, CheckCircle, XCircle, Package, MessageSquare, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import TicketChatPanel from './TicketChatPanel';

const STATUS_CONFIG = {
  pending:   { label: 'ממתין',  color: 'bg-yellow-100 text-yellow-800' },
  approved:  { label: 'אושר',   color: 'bg-green-100 text-green-800'  },
  rejected:  { label: 'נדחה',   color: 'bg-red-100 text-red-800'      },
  partial:   { label: 'חלקי',   color: 'bg-blue-100 text-blue-800'    },
};

// viewerRole: 'BRANCH' | 'HQ'
export default function TicketDetailPanel({ ticket, onClose, viewerRole, tenantEmail }) {
  const [tab, setTab] = useState('items');
  const queryClient = useQueryClient();
  const { toast } = { toast: () => {} }; // lightweight

  const { data: lineItems = [] } = useQuery({
    queryKey: ['stock-requests', ticket?.id],
    queryFn: () => base44.entities.StockRequest.filter({ ticket_id: ticket.id }),
    enabled: !!ticket?.id,
  });

  const approveMutation = useMutation({
    mutationFn: async ({ item, qty }) => {
      await base44.entities.StockRequest.update(item.id, { status: 'approved', approved_qty: qty });
      const existing = await base44.entities.BranchVariantStock.filter({
        branch_id: item.branch_id,
        variant_id: item.variant_id,
      });
      if (existing.length > 0) {
        await base44.entities.BranchVariantStock.update(existing[0].id, { stock: (existing[0].stock || 0) + qty });
      } else {
        await base44.entities.BranchVariantStock.create({
          branch_id: item.branch_id,
          variant_id: item.variant_id,
          stock: qty,
          tenant_email: tenantEmail,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-requests', ticket.id] });
      queryClient.invalidateQueries({ queryKey: ['stock-requests-all'] });
      queryClient.invalidateQueries({ queryKey: ['order-tickets'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (itemId) => base44.entities.StockRequest.update(itemId, { status: 'rejected' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-requests', ticket.id] });
      queryClient.invalidateQueries({ queryKey: ['stock-requests-all'] });
      queryClient.invalidateQueries({ queryKey: ['order-tickets'] });
    },
  });

  const approveAllMutation = useMutation({
    mutationFn: async () => {
      const pending = lineItems.filter(i => i.status === 'pending');
      await Promise.all(pending.map(async (item) => {
        await base44.entities.StockRequest.update(item.id, { status: 'approved', approved_qty: item.requested_qty });
        const existing = await base44.entities.BranchVariantStock.filter({
          branch_id: item.branch_id, variant_id: item.variant_id,
        });
        if (existing.length > 0) {
          await base44.entities.BranchVariantStock.update(existing[0].id, { stock: (existing[0].stock || 0) + item.requested_qty });
        } else {
          await base44.entities.BranchVariantStock.create({
            branch_id: item.branch_id, variant_id: item.variant_id,
            stock: item.requested_qty, tenant_email: tenantEmail,
          });
        }
      }));
      await base44.entities.OrderTicket.update(ticket.id, { status: 'approved' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-requests', ticket.id] });
      queryClient.invalidateQueries({ queryKey: ['stock-requests-all'] });
      queryClient.invalidateQueries({ queryKey: ['order-tickets'] });
    },
  });

  if (!ticket) return null;
  const cfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.pending;
  const pendingItems = lineItems.filter(i => i.status === 'pending');

  return (
    <div className="fixed inset-0 z-50 flex justify-end" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-xl shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-amber-500" />
            <div>
              <p className="font-bold text-gray-800 text-sm">{ticket.branch_name || 'הזמנה'}</p>
              <p className="text-xs text-gray-400">
                {ticket.created_date ? format(new Date(ticket.created_date), 'dd/MM/yy HH:mm') : ''}
              </p>
            </div>
            <span className={`mr-2 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-white">
          <button
            onClick={() => setTab('items')}
            className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 ${tab === 'items' ? 'border-b-2 border-amber-500 text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Package className="w-4 h-4" /> פריטים ({lineItems.length})
          </button>
          <button
            onClick={() => setTab('chat')}
            className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 ${tab === 'chat' ? 'border-b-2 border-amber-500 text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <MessageSquare className="w-4 h-4" /> צ'אט
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {tab === 'items' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {viewerRole === 'HQ' && pendingItems.length > 0 && (
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 gap-2"
                  onClick={() => approveAllMutation.mutate()}
                  disabled={approveAllMutation.isPending}
                >
                  <CheckCircle className="w-4 h-4" /> אשר הכל ({pendingItems.length} פריטים)
                </Button>
              )}
              {lineItems.map(item => (
                <LineItemRow
                  key={item.id}
                  item={item}
                  viewerRole={viewerRole}
                  onApprove={(qty) => approveMutation.mutate({ item, qty })}
                  onReject={() => rejectMutation.mutate(item.id)}
                  isLoading={approveMutation.isPending || rejectMutation.isPending}
                />
              ))}
              {lineItems.length === 0 && (
                <div className="text-center text-gray-400 py-12">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>אין פריטים</p>
                </div>
              )}
              {ticket.notes && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 border">
                  <span className="font-medium">הערות: </span>{ticket.notes}
                </div>
              )}
            </div>
          )}
          {tab === 'chat' && (
            <TicketChatPanel ticketId={ticket.id} senderRole={viewerRole} />
          )}
        </div>
      </div>
    </div>
  );
}

function LineItemRow({ item, viewerRole, onApprove, onReject, isLoading }) {
  const [approvedQty, setApprovedQty] = useState(item.requested_qty);
  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
  const isPending = item.status === 'pending';

  return (
    <div className="border rounded-xl p-3 bg-white">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-800 flex-1">{item.variant_label}</p>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${cfg.color}`}>{cfg.label}</span>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>מבוקש: <strong>{item.requested_qty}</strong></span>
          {item.approved_qty != null && <span>אושר: <strong className="text-green-600">{item.approved_qty}</strong></span>}
        </div>
        {viewerRole === 'HQ' && isPending && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={approvedQty}
              onChange={e => setApprovedQty(Number(e.target.value))}
              className="w-16 h-7 text-center text-xs"
            />
            <Button size="sm" className="h-7 px-2 bg-green-600 hover:bg-green-700 text-xs gap-1" onClick={() => onApprove(approvedQty)} disabled={isLoading}>
              <CheckCircle className="w-3 h-3" /> אשר
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-red-600 border-red-300 hover:bg-red-50 text-xs gap-1" onClick={onReject} disabled={isLoading}>
              <XCircle className="w-3 h-3" /> דחה
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}