import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BranchList from '@/components/network/BranchList';
import BranchForm from '@/components/network/BranchForm';
import BranchSettings from '@/components/network/BranchSettings';

export default function AdminNetwork() {
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const tenantEmail = currentUser?.email;

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches', tenantEmail],
    queryFn: () => base44.entities.Branch.filter({ tenant_email: tenantEmail }),
    enabled: !!tenantEmail,
  });

  const createBranch = useMutation({
    mutationFn: (data) => base44.entities.Branch.create({ ...data, tenant_email: tenantEmail, is_active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches', tenantEmail] });
      setShowForm(false);
    },
  });

  if (selectedBranch) {
    return (
      <BranchSettings
        branch={selectedBranch}
        tenantEmail={tenantEmail}
        onBack={() => setSelectedBranch(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranch className="w-6 h-6 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ניהול רשת סניפים</h1>
            <p className="text-sm text-gray-500">{branches.length} סניפים פעילים</p>
          </div>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          סניף חדש
        </Button>
      </div>

      {showForm && (
        <BranchForm
          onSubmit={(data) => createBranch.mutate(data)}
          onCancel={() => setShowForm(false)}
          isLoading={createBranch.isPending}
        />
      )}

      <BranchList
        branches={branches}
        isLoading={isLoading}
        onSelect={setSelectedBranch}
      />
    </div>
  );
}