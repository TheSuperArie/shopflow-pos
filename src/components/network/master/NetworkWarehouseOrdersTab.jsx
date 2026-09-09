import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Warehouse, Package, Loader2, Send, Trash2, History } from 'lucide-react';
import { format } from 'date-fns';
import WarehouseOrderHistory from './WarehouseOrderHistory';

/**
 * Warehouse ordering screen for the network owner:
 * consolidates the branches' open requests per item, lets him correct the
 * quantities, and sends one warehouse order that is kept for tracking.
 * Receiving the goods (and any branch stock update) is intentionally NOT part of this screen.
 */
export default function NetworkWarehouseOrdersTab({ tenantEmail }) {
  const [overrides, setOverrides] = useState({}); // { variant_id: qty }
  const [excluded, setExcluded] = useState({});   // { variant_id: true }
  const [notes, setNotes] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantEmail],
    queryFn: () => base44.entities.Branch.filter({ tenant_email: tenantEmail }),
    enabled: !!tenantEmail,
    staleTime: 120000,
  });

  const { data: requests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ['stock-requests-all', tenantEmail],
    queryFn: () => base44.entities.StockRequest.filter({ tenant_email: tenantEmail }, '-created_date'),
    enabled: !!tenantEmail,
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['warehouse-orders', tenantEmail],
    queryFn: () => base44.entities.WarehouseOrder.filter({ tenant_email: tenantEmail }, '-created_date'),
    enabled: !!tenantEmail,
  });

  const branchName = (id) => branches.find(b => b.id === id)?.name || 'סניף';

  // Requests already covered by a previous warehouse order are not consolidated again
  const orderedRequestIds = useMemo(() => {
    const set = new Set();
    orders.forEach(o => (o.request_ids || []).forEach(id => set.add(id)));
    return set;
  }, [orders]);

  const lines = useMemo(() => {
    const byVariant = {};
    requests
      .filter(r => r.status === 'pending' && !orderedRequestIds.has(r.id))
      .forEach(r => {
        if (!byVariant[r.variant_id]) {
          byVariant[r.variant_id] = {
            variant_id: r.variant_id,
            variant_label: r.variant_label || 'פריט',
            requested_qty: 0,
            branches: [],
            request_ids: [],
          };
        }
        const line = byVariant[r.variant_id];
        line.requested_qty += r.requested_qty || 0;
        line.request_ids.push(r.id);
        const existing = line.branches.find(b => b.branch_id === r.branch_id);
        if (existing) existing.qty += r.requested_qty || 0;
        else line.branches.push({ branch_id: r.branch_id, branch_name: branchName(r.branch_id), qty: r.requested_qty || 0 });
      });
    return Object.values(byVariant).sort((a, b) => b.requested_qty - a.requested_qty);
  }, [requests, orderedRequestIds, branches]);

  const activeLines = lines.filter(l => !excluded[l.variant_id]);
  const finalQty = (line) => {
    const val = overrides[line.variant_id];
    return val === undefined || val === '' ? line.requested_qty : Number(val);
  };
  const totalQty = activeLines.reduce((sum, l) => sum + finalQty(l), 0);

  const createOrder = useMutation({
    mutationFn: async () => {
      const items = activeLines.map(l => ({
        variant_id: l.variant_id,
        variant_label: l.variant_label,
        qty: finalQty(l),
        requested_qty: l.requested_qty,
        branches: l.branches,
      }));
      return base44.entities.WarehouseOrder.create({
        tenant_email: tenantEmail,
        order_number: `WH-${format(new Date(), 'yyMMdd')}-${String(Date.now()).slice(-4)}`,
        order_date: format(new Date(), 'yyyy-MM-dd'),
        status: 'הוזמן',
        total_qty: totalQty,
        total_items: items.length,
        notes,
        items,
        request_ids: activeLines.flatMap(l => l.request_ids),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-orders', tenantEmail] });
      toast({ title: '✅ ההזמנה למחסן נשמרה', duration: 3000, className: 'bg-green-500 text-white border-green-600' });
      setOverrides({});
      setExcluded({});
      setNotes('');
    },
    onError: (e) => toast({ title: `❌ שגיאה ביצירת ההזמנה: ${e.message}`, duration: 4000 }),
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">הזמנות מהמחסן</h1>
          <p className="text-sm text-gray-500 mt-1">ריכוז הבקשות מהסניפים והזמנה מרוכזת אחת מהמחסן</p>
        </div>
        {activeLines.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
            <Warehouse className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">{activeLines.length} פריטים • {totalQty} יחידות</span>
          </div>
        )}
      </div>

      {/* Consolidated requests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-500" />
            מה הסניפים ביקשו
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {requestsLoading ? (
            <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-500" /></div>
          ) : lines.length === 0 ? (
            <p className="py-10 text-center text-gray-400 text-sm">אין בקשות פתוחות מהסניפים</p>
          ) : (
            lines.map(line => {
              const isExcluded = !!excluded[line.variant_id];
              return (
                <div
                  key={line.variant_id}
                  className={`border rounded-xl p-3 ${isExcluded ? 'bg-gray-50 opacity-60' : 'bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-sm font-bold text-gray-800">{line.variant_label}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {line.branches.map(b => (
                          <Badge key={b.branch_id} variant="outline" className="text-xs bg-gray-50">
                            {b.branch_name}: {b.qty}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-center">
                        <p className="text-xs text-gray-400">ביקשו</p>
                        <p className="text-lg font-bold text-gray-700">{line.requested_qty}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-1">להזמין</p>
                        <Input
                          type="number"
                          min={0}
                          disabled={isExcluded}
                          value={overrides[line.variant_id] ?? line.requested_qty}
                          onChange={e => setOverrides(prev => ({ ...prev, [line.variant_id]: e.target.value }))}
                          className="w-20 h-8 text-center"
                        />
                      </div>
                      <button
                        onClick={() => setExcluded(prev => ({ ...prev, [line.variant_id]: !prev[line.variant_id] }))}
                        className={`p-2 rounded-lg ${isExcluded ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 hover:text-red-500'}`}
                        title={isExcluded ? 'החזר להזמנה' : 'הסר מההזמנה'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {lines.length > 0 && (
            <div className="border-t pt-3 space-y-3">
              <Input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="הערות להזמנה (אופציונלי)"
              />
              <Button
                onClick={() => createOrder.mutate()}
                disabled={activeLines.length === 0 || totalQty <= 0 || createOrder.isPending}
                className="w-full gap-2 bg-amber-500 hover:bg-amber-600"
              >
                {createOrder.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                צור הזמנה למחסן ({activeLines.length} פריטים • {totalQty} יחידות)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sent orders log */}
      <div>
        <h2 className="text-base font-bold text-gray-800 mb-2 flex items-center gap-2">
          <History className="w-4 h-4 text-gray-400" />
          הזמנות שיצאו למחסן
        </h2>
        <WarehouseOrderHistory orders={orders} isLoading={ordersLoading} />
      </div>
    </div>
  );
}