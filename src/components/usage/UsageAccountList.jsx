import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Building2, Crown, Store } from 'lucide-react';
import { format } from 'date-fns';

const TYPE_META = {
  BRANCH: { label: 'סניף ברשת', icon: Building2, cls: 'bg-blue-100 text-blue-800' },
  MASTER: { label: 'בעל רשת', icon: Crown, cls: 'bg-amber-100 text-amber-800' },
  STORE: { label: 'חנות יחידה', icon: Store, cls: 'bg-gray-100 text-gray-700' },
};

/** One row per account that used the app — last login + total logins. */
export default function UsageAccountList({ accounts = [] }) {
  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-400">
          <User className="w-9 h-9 mx-auto mb-2 opacity-30" />
          <p className="text-sm">לא נמצאו חשבונות</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 divide-y">
        {accounts.map(acc => {
          const meta = TYPE_META[acc.account_type] || TYPE_META.STORE;
          const Icon = meta.icon;
          return (
            <div key={acc.user_email} className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-[180px]">
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">{acc.user_name || acc.user_email}</p>
                  <p className="text-xs text-gray-400">{acc.user_email}</p>
                  {acc.branch_name && <p className="text-xs text-blue-500">{acc.branch_name}</p>}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <Badge className={meta.cls}>{meta.label}</Badge>
                <div className="text-center">
                  <p className="text-xs text-gray-400">כניסות</p>
                  <p className="text-base font-bold text-gray-800">{acc.count}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-gray-400">כניסה אחרונה</p>
                  <p className="text-sm font-medium text-gray-700">
                    {format(new Date(acc.last_login), 'dd/MM/yy HH:mm')}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}