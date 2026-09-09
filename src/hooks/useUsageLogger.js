import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const SESSION_KEY = 'usage_log_recorded';

/**
 * Records one usage (login/session) record per browser session for the signed-in
 * account — single store, network branch station, or network owner.
 */
export function useUsageLogger() {
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return;

    const record = async () => {
      let user = null;
      try {
        user = await base44.auth.me();
      } catch {
        return; // not signed in yet
      }
      if (!user?.email) return;
      sessionStorage.setItem(SESSION_KEY, '1');

      let branch = null;
      let ownsNetwork = false;
      try {
        const asStation = await base44.entities.Branch.filter({ station_email: user.email, status: 'ACTIVE' });
        branch = asStation.find(b => b.tenant_email && b.tenant_email !== user.email) || null;
        const owned = await base44.entities.Branch.filter({ tenant_email: user.email });
        ownsNetwork = owned.length > 0;
      } catch {
        // branch lookup is optional context
      }

      await base44.entities.UsageLog.create({
        user_email: user.email,
        user_name: user.full_name || '',
        login_at: new Date().toISOString(),
        account_type: branch ? 'BRANCH' : ownsNetwork ? 'MASTER' : 'STORE',
        branch_id: branch?.id || null,
        branch_name: branch?.name || null,
        tenant_email: branch?.tenant_email || (ownsNetwork ? user.email : null),
      });
    };

    record();
  }, []);
}