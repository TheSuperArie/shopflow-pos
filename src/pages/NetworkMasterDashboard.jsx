import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Menu } from 'lucide-react';
import NetworkMasterSidebar from '@/components/network/master/NetworkMasterSidebar';
import NetworkBranchesTab from '@/components/network/master/NetworkBranchesTab';
import NetworkAnalyticsTab from '@/components/network/master/NetworkAnalyticsTab';
import NetworkSettingsTab from '@/components/network/master/NetworkSettingsTab';
import NetworkSuppliersTab from '@/components/network/master/NetworkSuppliersTab';
import NetworkOrdersTab from '@/components/network/master/NetworkOrdersTab';
import NotificationBell from '@/components/network/master/NotificationBell';

export default function NetworkMasterDashboard() {
  const [activeTab, setActiveTab] = useState('branches');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  const { data: branches = [], isSuccess: branchesLoaded } = useQuery({
    queryKey: ['branches', tenantEmail],
    queryFn: () => base44.entities.Branch.filter({ tenant_email: tenantEmail }),
    enabled: !!tenantEmail,
  });

  const createBranch = useMutation({
    mutationFn: (data) => base44.entities.Branch.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches', tenantEmail] });
      setBootstrapped(true);
    },
  });

  // Auto-bootstrap: if tenant has no branches, create "סניף ראשי"
  useEffect(() => {
    if (branchesLoaded && branches.length === 0 && tenantEmail && !bootstrapped && !createBranch.isPending) {
      createBranch.mutate({
        tenant_email: tenantEmail,
        name: 'סניף ראשי',
        station_email: tenantEmail,
        is_active: true,
      });
    }
  }, [branchesLoaded, branches.length, tenantEmail, bootstrapped]);

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
          <h1 className="font-bold text-gray-800 flex-1">מרכז פיקוד רשת</h1>
          {tenantEmail && (
            <div className="bg-gray-900 rounded-xl p-1">
              <NotificationBell tenantEmail={tenantEmail} onNavigateToOrders={() => setActiveTab('orders')} onNavigateToBranches={() => setActiveTab('branches')} />
            </div>
          )}
        </header>

        {/* Desktop notification bell in top-right */}
        {tenantEmail && (
          <div className="hidden lg:flex items-center justify-end px-6 py-2 bg-gray-950 border-b border-white/5">
            <NotificationBell tenantEmail={tenantEmail} onNavigateToOrders={() => setActiveTab('orders')} onNavigateToBranches={() => setActiveTab('branches')} />
          </div>
        )}

        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {tenantEmail && (
            <>
              {activeTab === 'branches' && <NetworkBranchesTab tenantEmail={tenantEmail} />}
              {activeTab === 'analytics' && <NetworkAnalyticsTab tenantEmail={tenantEmail} />}
              {activeTab === 'orders' && <NetworkOrdersTab tenantEmail={tenantEmail} />}
              {activeTab === 'suppliers' && <NetworkSuppliersTab tenantEmail={tenantEmail} />}
              {activeTab === 'settings' && <NetworkSettingsTab tenantEmail={tenantEmail} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}