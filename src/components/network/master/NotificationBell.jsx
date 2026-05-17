import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { format } from 'date-fns';

export default function NotificationBell({ tenantEmail, onNavigateToOrders }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const queryClient = useQueryClient();

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantEmail],
    queryFn: () => base44.entities.Branch.filter({ tenant_email: tenantEmail }),
    enabled: !!tenantEmail,
  });

  const { data: allRequests = [] } = useQuery({
    queryKey: ['stock-requests-all', tenantEmail],
    queryFn: () => base44.entities.StockRequest.filter({ tenant_email: tenantEmail }, '-created_date'),
    enabled: !!tenantEmail && branches.length > 0,
    refetchInterval: 30000, // poll every 30s as backup
  });

  // Real-time subscription
  useEffect(() => {
    const unsub = base44.entities.StockRequest.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['stock-requests-all', tenantEmail] });
      queryClient.invalidateQueries({ queryKey: ['stock-requests'] });
    });
    return unsub;
  }, [tenantEmail, queryClient]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const branchMap = Object.fromEntries(branches.map(b => [b.id, b]));
  const pending = allRequests.filter(r => r.status === 'pending');
  const recent = pending.slice(0, 8);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-xl text-gray-400 hover:text-amber-400 hover:bg-white/5 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {pending.length > 0 && (
          <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
            {pending.length > 99 ? '99+' : pending.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <span className="font-semibold text-gray-800 text-sm">בקשות ממתינות</span>
            <span className="text-xs text-gray-500">{pending.length} בקשות</span>
          </div>

          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">אין בקשות ממתינות</div>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y">
              {recent.map(req => {
                const branch = branchMap[req.branch_id];
                return (
                  <button
                    key={req.id}
                    onClick={() => { setOpen(false); onNavigateToOrders(); }}
                    className="w-full text-right px-4 py-3 hover:bg-amber-50 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {branch?.name || 'סניף'} ביקש {req.requested_qty} יח' מ-{req.variant_label?.split('—')[0] || 'מוצר'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(new Date(req.created_date), 'dd/MM/yy HH:mm')}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          <div className="px-4 py-3 border-t bg-gray-50">
            <button
              onClick={() => { setOpen(false); onNavigateToOrders(); }}
              className="w-full text-center text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              צפה בכל הבקשות ←
            </button>
          </div>
        </div>
      )}
    </div>
  );
}