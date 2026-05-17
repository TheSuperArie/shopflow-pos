import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { format } from 'date-fns';

export default function NotificationBell({ tenantEmail, onNavigateToOrders }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const queryClient = useQueryClient();

  const { data: tickets = [] } = useQuery({
    queryKey: ['order-tickets', tenantEmail],
    queryFn: () => base44.entities.OrderTicket.filter({ tenant_email: tenantEmail }, '-created_date'),
    enabled: !!tenantEmail,
    refetchInterval: 30000,
  });

  // Real-time subscription
  useEffect(() => {
    const unsub = base44.entities.OrderTicket.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['order-tickets', tenantEmail] });
    });
    return unsub;
  }, [tenantEmail, queryClient]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pending = tickets.filter(t => t.status === 'pending');
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
            <span className="font-semibold text-gray-800 text-sm">הזמנות ממתינות</span>
            <span className="text-xs text-gray-500">{pending.length} הזמנות</span>
          </div>

          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">אין הזמנות ממתינות</div>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y">
              {recent.map(ticket => (
                <button
                  key={ticket.id}
                  onClick={() => { setOpen(false); onNavigateToOrders(); }}
                  className="w-full text-right px-4 py-3 hover:bg-amber-50 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {ticket.branch_name || 'סניף'} — {ticket.total_items} פריטים
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {ticket.created_date ? format(new Date(ticket.created_date), 'dd/MM/yy HH:mm') : ''}
                    {ticket.notes ? ` • ${ticket.notes}` : ''}
                  </p>
                </button>
              ))}
            </div>
          )}

          <div className="px-4 py-3 border-t bg-gray-50">
            <button
              onClick={() => { setOpen(false); onNavigateToOrders(); }}
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