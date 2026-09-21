import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldAlert, Clock, XCircle } from 'lucide-react';
import AccessRequestForm from './AccessRequestForm';

/**
 * Whitelist gate for the whole app: an account that the developer has not approved
 * sees only the access-request flow. The developer page is reachable regardless.
 */
export default function AccessGate({ children }) {
  const location = useLocation();
  const [showForm, setShowForm] = useState(false);
  const isDevPage = location.pathname === '/UsageAnalytics';

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['access-status'],
    queryFn: async () => {
      const res = await base44.functions.invoke('accessControl', { action: 'status' });
      return res.data;
    },
    enabled: !isDevPage,
    retry: false,
    staleTime: 60000,
  });

  if (isDevPage) return children;

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  const status = data?.status;
  // Unknown status (e.g. anonymous/public visitor) — don't block the app
  if (!status || status === 'approved') return children;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center space-y-4">
          {status === 'pending' ? (
            <>
              <Clock className="w-12 h-12 text-amber-500 mx-auto" />
              <h1 className="text-xl font-bold text-gray-900">בקשתך נשלחה וממתינה לאישור</h1>
              <p className="text-sm text-gray-500">נעדכן אותך ברגע שהגישה תאושר.</p>
            </>
          ) : status === 'rejected' || status === 'blocked' ? (
            <>
              <XCircle className="w-12 h-12 text-red-500 mx-auto" />
              <h1 className="text-xl font-bold text-gray-900">בקשתך נדחתה</h1>
              <p className="text-sm text-gray-500">אין לך הרשאת גישה לאתר.</p>
            </>
          ) : showForm ? (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-2">בקשת גישה לאתר</h1>
              <AccessRequestForm
                defaultEmail={data?.email}
                defaultName={data?.full_name}
                onSubmitted={() => { setShowForm(false); refetch(); }}
                onCancel={() => setShowForm(false)}
              />
            </>
          ) : (
            <>
              <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto" />
              <h1 className="text-xl font-bold text-gray-900">אין לך אישור לגשת לאתר</h1>
              <Button onClick={() => setShowForm(true)} className="mt-2">להגשת בקשה לחץ כאן</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}