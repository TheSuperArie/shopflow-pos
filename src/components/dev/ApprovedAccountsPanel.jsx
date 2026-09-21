import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Ban, CheckCircle2 } from 'lucide-react';

/** All accounts with their whitelist status — approved accounts can be blocked here. */
export default function ApprovedAccountsPanel({ accounts, onSetStatus, isPending }) {
  const sorted = [...accounts].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  const label = {
    approved: 'מאושר',
    pending: 'ממתין',
    rejected: 'נדחה',
    blocked: 'חסום',
  };

  return (
    <Card>
      <CardContent className="p-0 divide-y">
        {sorted.map(a => (
          <div key={a.id} className="p-4 flex items-center justify-between gap-3">
            <div className="text-sm min-w-0">
              <p className="font-semibold text-gray-900 truncate">{a.full_name || a.email}</p>
              <p className="text-gray-500 truncate">{a.email}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={a.access_status === 'approved' ? 'default' : 'secondary'}>
                {label[a.access_status] || 'ללא אישור'}
              </Badge>
              {a.access_status === 'approved' ? (
                <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50"
                  disabled={isPending} onClick={() => onSetStatus(a.email, 'blocked')}>
                  <Ban className="w-4 h-4 ml-1" />חסום
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50"
                  disabled={isPending} onClick={() => onSetStatus(a.email, 'approved')}>
                  <CheckCircle2 className="w-4 h-4 ml-1" />אשר
                </Button>
              )}
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="py-8 text-center text-gray-400 text-sm">אין חשבונות</div>
        )}
      </CardContent>
    </Card>
  );
}