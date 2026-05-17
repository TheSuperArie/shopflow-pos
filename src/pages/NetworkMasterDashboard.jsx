import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Menu } from 'lucide-react';
import NetworkMasterSidebar from '@/components/network/master/NetworkMasterSidebar';
import NetworkBranchesTab from '@/components/network/master/NetworkBranchesTab';
import NetworkAnalyticsTab from '@/components/network/master/NetworkAnalyticsTab';

export default function NetworkMasterDashboard() {
  const [activeTab, setActiveTab] = useState('branches');
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  // Guard: only NETWORK_MASTER may enter
  useEffect(() => {
    const auth = sessionStorage.getItem('admin_auth');
    const role = sessionStorage.getItem('admin_role');
    if (auth !== 'true' || role !== 'NETWORK_MASTER') {
      navigate('/AdminLogin');
    }
  }, [navigate]);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const tenantEmail = currentUser?.email;

  return (
    <div dir="rtl" className="flex min-h-screen bg-gray-50">
      <NetworkMasterSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-xl bg-gray-100">
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-gray-800">מרכז פיקוד רשת</h1>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {tenantEmail && (
            <>
              {activeTab === 'branches' && (
                <NetworkBranchesTab tenantEmail={tenantEmail} />
              )}
              {activeTab === 'analytics' && (
                <NetworkAnalyticsTab tenantEmail={tenantEmail} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}