import React, { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import BranchDashboard from '@/components/dashboard/BranchDashboard';
import BranchInvitationBanner from '@/components/dashboard/BranchInvitationBanner';
import { useQuery } from '@tanstack/react-query';

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const user = useCurrentUser();

  // Fetch branches where this user's station_email matches — covers invitations sent to them
  const { data: branches = [] } = useQuery({
    queryKey: ['branches', user?.email],
    queryFn: () => base44.entities.Branch.filter({ tenant_email: user.email }),
    enabled: !!user?.email,
  });

  // Check for pending invitations addressed to this user's email as station_email
  const { data: pendingInvitations = [] } = useQuery({
    queryKey: ['pending-invitations', user?.email],
    queryFn: () => base44.entities.Branch.filter({ station_email: user.email, status: 'PENDING' }),
    enabled: !!user?.email,
  });

  // Real-time sync
  useEffect(() => {
    const unsub1 = base44.entities.Sale.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['branch-dashboard-sales'] });
    });
    const unsub2 = base44.entities.Expense.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['branch-dashboard-expenses'] });
    });
    const unsub3 = base44.entities.ProductVariant.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [queryClient]);

  // Use the main branch (first active branch for this tenant)
  const mainBranch = branches.find(b => b.is_active && b.status !== 'PENDING') || branches.find(b => b.is_active);

  if (!user) return null;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Pending invitation banners */}
      {pendingInvitations.map(inv => (
        <BranchInvitationBanner key={inv.id} invitation={inv} userEmail={user.email} />
      ))}
      <BranchDashboard
        branchId={mainBranch?.id}
        tenantEmail={user.email}
      />
    </div>
  );
}