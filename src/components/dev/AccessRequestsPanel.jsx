import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, UserPlus } from 'lucide-react';

/** Pending access requests, each as a banner with approve / reject buttons. */
export default function AccessRequestsPanel({ requests, onDecide, isPending }) {
  const pending = requests.filter(r => r.status === 'pending');

  if (pending.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-400 text-sm">אין בקשות גישה חדשות</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {pending.map(r => (
        <div key={r.id} className="border border-amber-300 bg-amber-50 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <UserPlus className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 text-sm">
            <p className="font-bold text-gray-900">{r.full_name}</p>
            <p className="text-gray-600">{r.phone} · {r.email}</p>
            <p className="text-gray-400 text-xs mt-0.5">
              חשבון: {r.account_email} · {new Date(r.created_date).toLocaleString('he-IL')}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50"
              disabled={isPending} onClick={() => onDecide(r.id, 'rejected')}>
              <XCircle className="w-4 h-4 ml-1" />דחה
            </Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
              disabled={isPending} onClick={() => onDecide(r.id, 'approved')}>
              <CheckCircle2 className="w-4 h-4 ml-1" />אשר
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}