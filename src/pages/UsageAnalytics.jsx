import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import AccessRequestsPanel from '@/components/dev/AccessRequestsPanel';
import ApprovedAccountsPanel from '@/components/dev/ApprovedAccountsPanel';
import PendingInvitesPanel from '@/components/dev/PendingInvitesPanel';
import DevEmailCard from '@/components/dev/DevEmailCard';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Search, Activity, Users, Code2, LogOut } from 'lucide-react';
import UsageAccountList from '@/components/usage/UsageAccountList';
import UsageHistoryTable from '@/components/usage/UsageHistoryTable';
import DeveloperCodeCard from '@/components/usage/DeveloperCodeCard';
import { getDevCode, clearDevCode } from '@/lib/developerAccess';

export default function UsageAnalytics() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const devCode = getDevCode();

  const { data: logs = [], isLoading, isError } = useQuery({
    queryKey: ['usage-logs', devCode],
    queryFn: async () => {
      const res = await base44.functions.invoke('developerPortal', { action: 'logs', code: devCode });
      return res.data?.logs || [];
    },
    enabled: !!devCode,
    retry: false,
  });

  const { data: access, refetch: refetchAccess } = useQuery({
    queryKey: ['access-admin', devCode],
    queryFn: async () => {
      const res = await base44.functions.invoke('accessControl', { action: 'list', code: devCode });
      return res.data;
    },
    enabled: !!devCode,
    retry: false,
  });

  const accessAction = useMutation({
    mutationFn: (payload) => base44.functions.invoke('accessControl', { ...payload, code: devCode }),
    onSuccess: () => refetchAccess(),
  });

  // Direct URL entry without a verified code goes back to settings
  const blocked = !devCode || isError;
  useEffect(() => {
    if (blocked) {
      clearDevCode();
      navigate('/AdminLogin', { replace: true });
    }
  }, [blocked, navigate]);

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

  if (blocked) return null;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Code2 className="w-6 h-6" /> דף מפתחים
          </h1>
          <p className="text-sm text-gray-500 mt-1">נתוני שימוש באתר — מי נכנס, מתי, ומאיזה חשבון</p>
        </div>
        <Button
          variant="outline"
          onClick={() => { clearDevCode(); navigate('/POS'); }}
          className="gap-2 shrink-0"
        >
          <LogOut className="w-4 h-4" /> יציאה
        </Button>
      </div>

      <div>
        <h2 className="text-base font-bold text-gray-800 mb-2">בקשות גישה חדשות</h2>
        <AccessRequestsPanel
          requests={access?.requests || []}
          isPending={accessAction.isPending}
          onDecide={(request_id, decision) => accessAction.mutate({ action: 'decide', request_id, decision })}
        />
      </div>

      <div>
        <h2 className="text-base font-bold text-gray-800 mb-2">הצעות הצטרפות לרשת — ממתינות לאישור מערכת</h2>
        <PendingInvitesPanel
          invites={access?.pendingInvites || []}
          isPending={accessAction.isPending}
          onDecide={(branch_id, decision) => accessAction.mutate({ action: 'decideInvite', branch_id, decision })}
        />
      </div>

      <div>
        <h2 className="text-base font-bold text-gray-800 mb-2">חשבונות מאושרים</h2>
        <ApprovedAccountsPanel
          accounts={access?.accounts || []}
          isPending={accessAction.isPending}
          onSetStatus={(email, status) => accessAction.mutate({ action: 'setAccountStatus', email, status })}
        />
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

      <DevEmailCard code={devCode} currentEmail={access?.dev_email} />
      <DeveloperCodeCard code={devCode} />
    </div>
  );
}