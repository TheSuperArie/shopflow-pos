import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

const PAGE = 50;

/** Chronological login history, newest first. */
export default function UsageHistoryTable({ logs = [] }) {
  const [limit, setLimit] = useState(PAGE);
  const shown = logs.slice(0, limit);

  return (
    <Card>
      <CardContent className="p-0">
        {logs.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">אין כניסות להצגה</div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-right px-4 py-2 font-medium">זמן כניסה</th>
                  <th className="text-right px-4 py-2 font-medium">חשבון</th>
                  <th className="text-right px-4 py-2 font-medium">סניף</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map(log => (
                  <tr key={log.id}>
                    <td className="px-4 py-2 whitespace-nowrap text-gray-700">
                      {format(new Date(log.login_at || log.created_date), 'dd/MM/yy HH:mm:ss')}
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-medium text-gray-800">{log.user_name || log.user_email}</span>
                      <span className="block text-xs text-gray-400">{log.user_email}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{log.branch_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {limit < logs.length && (
              <div className="p-3 text-center border-t">
                <Button variant="outline" size="sm" onClick={() => setLimit(limit + PAGE)}>
                  הצג עוד ({logs.length - limit})
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}