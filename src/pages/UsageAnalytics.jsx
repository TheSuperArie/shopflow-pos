import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Search, Activity, Users } from 'lucide-react';
import UsageAccountList from '@/components/usage/UsageAccountList';
import UsageHistoryTable from '@/components/usage/UsageHistoryTable';

export default function UsageAnalytics() {
  const [search, setSearch] = useState('');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['usage-logs'],
    queryFn: () => base44.entities.UsageLog.list('-login_at', 3000),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(l =>
      (l.user_email || '').toLowerCase().includes(q) ||
      (l.user_name || '').toLowerCase().includes(q) ||
      (l.branch_name || '').toLowerCase().includes(q)
    );
  }, [logs, search]);

  const accounts = useMemo(() => {
    const map = {};
    filtered.forEach(l => {
      const key = l.user_email;
      if (!map[key]) {
        map[key] = {
          user_email: key,
          user_name: l.user_name,
          account_type: l.account_type,
          branch_name: l.branch_name,
          last_login: l.login_at || l.created_date,
          count: 0,
        };
      }
      const acc = map[key];
      acc.count += 1;
      const at = l.login_at || l.created_date;
      if (at && new Date(at) > new Date(acc.last_login)) {
        acc.last_login = at;
        acc.account_type = l.account_type;
        acc.branch_name = l.branch_name;
        acc.user_name = l.user_name || acc.user_name;
      }
    });
    return Object.values(map).sort((a, b) => new Date(b.last_login) - new Date(a.last_login));
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">נתוני שימוש באתר</h1>
        <p className="text-sm text-gray-500 mt-1">מי נכנס לאפליקציה, מתי, ומאיזה חשבון</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-5 h-5 text-blue-500" />
            <div>
              <p className="text-xs text-gray-400">חשבונות</p>
              <p className="text-xl font-bold text-gray-800">{accounts.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="w-5 h-5 text-amber-500" />
            <div>
              <p className="text-xs text-gray-400">סך כניסות</p>
              <p className="text-xl font-bold text-gray-800">{filtered.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש לפי חשבון, שם או סניף"
          className="pr-9"
        />
      </div>

      <div>
        <h2 className="text-base font-bold text-gray-800 mb-2">חשבונות שהשתמשו באפליקציה</h2>
        <UsageAccountList accounts={accounts} />
      </div>

      <div>
        <h2 className="text-base font-bold text-gray-800 mb-2">היסטוריית כניסות</h2>
        <UsageHistoryTable logs={filtered} />
      </div>
    </div>
  );
}