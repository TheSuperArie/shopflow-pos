import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { getDelegateOwner } from '@/api/base44Client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

// Pages an authorized network manager may open — everything else goes to the network dashboard
const ALLOWED = ['/NetworkMasterDashboard', '/network/reports/category/', '/UsageAnalytics'];

/**
 * Authorized network manager (מנהל רשת מורשה): no POS and no store admin of his own — he always
 * lands in the network dashboard of the network he manages, without a code. Every other account
 * passes straight through (the check is remembered per sign-in, so the POS isn't delayed).
 */
export default function DelegateGate({ children }) {
  const user = useCurrentUser();
  const location = useLocation();
  const [owner, setOwner] = useState(undefined); // undefined = still checking

  useEffect(() => {
    let alive = true;
    if (!user?.email) return undefined;
    getDelegateOwner().then(o => { if (alive) setOwner(o || null); });
    return () => { alive = false; };
  }, [user?.email]);

  useEffect(() => {
    if (!owner) return;
    try {
      sessionStorage.setItem('admin_auth', 'true');
      sessionStorage.setItem('admin_role', 'NETWORK_MASTER');
      sessionStorage.setItem('network_master_email', owner);
    } catch { /* storage blocked */ }
  }, [owner, location.pathname]);

  if (!user?.email) return children;
  if (owner === undefined) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }
  if (!owner) return children;

  // Make sure the dashboard's own guard sees the session before it renders
  try {
    sessionStorage.setItem('admin_auth', 'true');
    sessionStorage.setItem('admin_role', 'NETWORK_MASTER');
    sessionStorage.setItem('network_master_email', owner);
  } catch { /* storage blocked */ }

  return ALLOWED.some(p => location.pathname.startsWith(p))
    ? children
    : <Navigate to="/NetworkMasterDashboard" replace />;
}
