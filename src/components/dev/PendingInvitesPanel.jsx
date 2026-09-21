import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, GitBranch } from 'lucide-react';

/** Network → branch join offers waiting for system (developer) approval. */
export default function PendingInvitesPanel({ invites, onDecide, isPending }) {
  if (invites.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-400 text-sm">אין הצעות הצטרפות ממתינות</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {invites.map(b => (
        <div key={b.id} className="border border-indigo-300 bg-indigo-50 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
            <GitBranch className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="flex-1 text-sm">
            <p className="font-bold text-gray-900">הצעת הצטרפות לרשת {b.network_name || ''}</p>
            <p className="text-gray-600">סניף: {b.name} · {b.station_email}</p>
            <p className="text-gray-400 text-xs mt-0.5">
              רשת: {b.tenant_email} · {new Date(b.created_date).toLocaleString('he-IL')}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50"
              disabled={isPending} onClick={() => onDecide(b.id, 'REJECTED')}>
              <XCircle className="w-4 h-4 ml-1" />דחה
            </Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
              disabled={isPending} onClick={() => onDecide(b.id, 'APPROVED')}>
              <CheckCircle2 className="w-4 h-4 ml-1" />אשר
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}