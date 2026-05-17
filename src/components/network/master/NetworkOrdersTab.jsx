import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle, XCircle, Clock, Package, Filter } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_CONFIG = {
  pending:  { label: 'ממתין',  color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'אושר',   color: 'bg-green-100 text-green-800'  },
  rejected: { label: 'נדחה',   color: 'bg-red-100 text-red-800'      },
  dispatched:{ label: 'נשלח',  color: 'bg-blue-100 text-blue-800'    },
};

export default function NetworkOrdersTab({ tenantEmail }) {
  const [filterBranch, setFilterBranch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantEmail],
    queryFn: () => base44.entities.Branch.filter({ tenant_email: tenantEmail }),
    enabled: !!tenantEmail,
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['stock-requests-all', tenantEmail],
    queryFn: async () => {
      const branchIds = branches.map(b => b.id);
      if (branchIds.length === 0) return [];
      return base44.entities.StockRequest.filter({ tenant_email: tenantEmail }, '-created_date');
    },
    enabled: !!tenantEmail && branches.length > 0,
  });

  const branchMap = Object.fromEntries(branches.map(b => [b.id, b]));

  const approveMutation = useMutation({
    mutationFn: async ({ request, approvedQty }) => {
      // 1. Update request status
      await base44.entities.StockRequest.update(request.id, {
        status: 'approved',
        approved_qty: approvedQty,
      });
      // 2. Add stock to branch
      const existing = await base44.entities.BranchVariantStock.filter({
        branch_id: request.branch_id,
        variant_id: request.variant_id,
      });
      if (existing.length > 0) {
        await base44.entities.BranchVariantStock.update(existing[0].id, {
          stock: (existing[0].stock || 0) + approvedQty,
        });
      } else {
        await base44.entities.BranchVariantStock.create({
          branch_id: request.branch_id,
          variant_id: request.variant_id,
          stock: approvedQty,
          tenant_email: tenantEmail,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-requests-all'] });
      queryClient.invalidateQueries({ queryKey: ['stock-requests'] });
      queryClient.invalidateQueries({ queryKey: ['branch-variant-stock'] });
      toast({ title: '✅ הבקשה אושרה והמלאי עודכן', duration: 2000 });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id) => base44.entities.StockRequest.update(id, { status: 'rejected' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-requests-all'] });
      queryClient.invalidateQueries({ queryKey: ['stock-requests'] });
      toast({ title: '❌ הבקשה נדחתה', duration: 2000 });
    },
  });

  // Filter
  const filtered = requests.filter(r => {
    const branch = branchMap[r.branch_id];
    if (filterBranch && (!branch || !branch.name.includes(filterBranch))) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterFrom && new Date(r.created_date) < new Date(filterFrom)) return false;
    if (filterTo && new Date(r.created_date) > new Date(filterTo + 'T23:59:59')) return false;
    return true;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">הזמנות מהסניפים</h1>
          <p className="text-sm text-gray-500 mt-1">מרכז ניהול בקשות מלאי</p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2">
            <Clock className="w-4 h-4 text-yellow-600" />
            <span className="text-sm font-semibold text-yellow-800">{pendingCount} בקשות ממתינות</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">סינון</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Input placeholder="סניף..." value={filterBranch} onChange={e => setFilterBranch(e.target.value)} />
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
            <Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} placeholder="מתאריך" />
            <Input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} placeholder="עד תאריך" />
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-gray-400">טוען...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>אין בקשות</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-right text-gray-500">
                    <th className="px-4 py-3 font-medium">סניף</th>
                    <th className="px-4 py-3 font-medium">מוצר</th>
                    <th className="px-4 py-3 font-medium">כמות מבוקשת</th>
                    <th className="px-4 py-3 font-medium">כמות שאושרה</th>
                    <th className="px-4 py-3 font-medium">הערות</th>
                    <th className="px-4 py-3 font-medium">תאריך</th>
                    <th className="px-4 py-3 font-medium">סטטוס</th>
                    <th className="px-4 py-3 font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(req => (
                    <OrderRow
                      key={req.id}
                      request={req}
                      branch={branchMap[req.branch_id]}
                      onApprove={(approvedQty) => approveMutation.mutate({ request: req, approvedQty })}
                      onReject={() => rejectMutation.mutate(req.id)}
                      isLoading={approveMutation.isPending || rejectMutation.isPending}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OrderRow({ request, branch, onApprove, onReject, isLoading }) {
  const [approvedQty, setApprovedQty] = useState(request.requested_qty);
  const cfg = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending;
  const isPending = request.status === 'pending';

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 font-medium">{branch?.name || '—'}</td>
      <td className="px-4 py-3 max-w-48">
        <span className="truncate block">{request.variant_label || request.variant_id?.slice(0, 10)}</span>
      </td>
      <td className="px-4 py-3 text-center">{request.requested_qty}</td>
      <td className="px-4 py-3">
        {isPending ? (
          <Input
            type="number"
            min={1}
            max={request.requested_qty * 2}
            value={approvedQty}
            onChange={e => setApprovedQty(Number(e.target.value))}
            className="w-20 h-7 text-center"
          />
        ) : (
          <span className="text-center block">{request.approved_qty ?? '—'}</span>
        )}
      </td>
      <td className="px-4 py-3 text-gray-500 max-w-32 truncate">{request.notes || '—'}</td>
      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
        {format(new Date(request.created_date), 'dd/MM/yy HH:mm')}
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
      </td>
      <td className="px-4 py-3">
        {isPending && (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 h-7 px-2 text-xs gap-1"
              onClick={() => onApprove(approvedQty)}
              disabled={isLoading || approvedQty < 1}
            >
              <CheckCircle className="w-3 h-3" /> אשר
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50 h-7 px-2 text-xs gap-1"
              onClick={onReject}
              disabled={isLoading}
            >
              <XCircle className="w-3 h-3" /> דחה
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}