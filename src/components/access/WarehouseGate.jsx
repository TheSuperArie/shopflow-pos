import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Warehouse, CheckCircle2, XCircle } from 'lucide-react';

const ALLOWED_FOR_WAREHOUSE = ['/Warehouse', '/UsageAnalytics'];
const cacheKey = (email) => `warehouse-gate:${email}`;

/**
 * A warehouse account never sees the POS or store admin:
 * - pending invitation → accept / decline screen
 * - active warehouse   → always routed to /Warehouse
 * Every other account passes straight through (remembered per session, so the POS isn't delayed).
 */
export default function WarehouseGate({ children }) {
  const user = useCurrentUser();
  const location = useLocation();
  const queryClient = useQueryClient();
  const email = user?.email;
  const knownNone = !!email && sessionStorage.getItem(cacheKey(email)) === 'none';

  const { data: records, isLoading } = useQuery({
    queryKey: ['my-warehouse', email],
    queryFn: () => base44.entities.Warehouse.filter({ station_email: email }),
    enabled: !!email,
    staleTime: 300000,
    retry: false,
  });

  const active = records?.find(w => w.status === 'ACTIVE');
  const pending = records?.find(w => w.status === 'PENDING');

  useEffect(() => {
    if (!email || !records) return;
    try {
      if (active || pending) sessionStorage.removeItem(cacheKey(email));
      else sessionStorage.setItem(cacheKey(email), 'none');
    } catch { /* storage blocked */ }
  }, [email, records, active, pending]);

  const respond = useMutation({
    mutationFn: async (accept) => {
      await base44.entities.Warehouse.update(pending.id, accept
        ? { status: 'ACTIVE', is_active: true }
        : { status: 'REJECTED', is_active: false });
      if (accept) {
        await base44.entities.NetworkAlert.create({
          tenant_email: pending.tenant_email,
          type: 'INVITE_ACCEPTED',
          title: 'המחסן אישר את החיבור',
          body: `"${pending.name}" מחובר עכשיו לרשת`,
          is_read: false,
          navigate_to: 'supply',
        }).catch(() => {});
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-warehouse', email] }),
  });

  if (!email || knownNone) return children;

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (active) {
    return ALLOWED_FOR_WAREHOUSE.includes(location.pathname) ? children : <Navigate to="/Warehouse" replace />;
  }

  if (pending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto">
              <Warehouse className="w-7 h-7 text-blue-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">הזמנה לחבר מחסן לרשת</h1>
            <p className="text-sm text-gray-600">
              רשת <strong>{pending.network_name || 'הרשת'}</strong> מזמינה את החשבון הזה לעבוד כמחסן
              בשם <strong>"{pending.name}"</strong>. אחרי האישור החשבון ייכנס ישר למסך המחסן ולא לקופה.
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 gap-1" disabled={respond.isPending} onClick={() => respond.mutate(false)}>
                <XCircle className="w-4 h-4" /> דחה
              </Button>
              <Button className="bg-green-600 hover:bg-green-700 gap-1" disabled={respond.isPending} onClick={() => respond.mutate(true)}>
                {respond.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} אשר חיבור
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return children;
}
