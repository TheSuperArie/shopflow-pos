import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, GitBranch, MapPin, Mail, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import BranchForm from '../BranchForm';
import BranchCommandCenter from './BranchCommandCenter';

export default function NetworkBranchesTab({ tenantEmail, networkName }) {
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches', tenantEmail],
    queryFn: () => base44.entities.Branch.filter({ tenant_email: tenantEmail }),
    enabled: !!tenantEmail,
  });

  const createBranch = useMutation({
    // Send invitation: status=PENDING, not yet active
    mutationFn: (data) => base44.entities.Branch.create({
      ...data,
      tenant_email: tenantEmail,
      is_active: false,
      status: 'PENDING',
      network_name: networkName || 'הרשת',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches', tenantEmail] });
      setShowForm(false);
    },
  });

  // Only allow drilling into ACTIVE branches
  if (selectedBranch && selectedBranch.status !== 'PENDING') {
    return (
      <BranchCommandCenter
        branch={selectedBranch}
        tenantEmail={tenantEmail}
        onBack={() => setSelectedBranch(null)}
      />
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranch className="w-6 h-6 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">רשימת סניפים</h1>
            <p className="text-sm text-gray-500">{branches.length} סניפים רשומים</p>
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

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : branches.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-gray-400">
            <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">אין סניפים עדיין</p>
            <p className="text-sm mt-1">לחץ על "סניף חדש" כדי להתחיל</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {branches.map(branch => (
            <button
              key={branch.id}
              onClick={() => setSelectedBranch(branch)}
              className="text-right bg-white rounded-2xl border border-gray-200 p-5 hover:border-amber-400 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-amber-500" />
                </div>
                {branch.status === 'PENDING' ? (
                  <Badge className="text-xs bg-amber-100 text-amber-700 border border-amber-300">
                    <Clock className="w-3 h-3 mr-1" />ממתין לאישור
                  </Badge>
                ) : branch.status === 'REJECTED' ? (
                  <Badge variant="destructive" className="text-xs">
                    <XCircle className="w-3 h-3 mr-1" />נדחה
                  </Badge>
                ) : (
                  <Badge variant={branch.is_active ? 'default' : 'secondary'} className="text-xs">
                    {branch.is_active ? (
                      <><CheckCircle2 className="w-3 h-3 mr-1" />פעיל</>
                    ) : (
                      <><XCircle className="w-3 h-3 mr-1" />לא פעיל</>
                    )}
                  </Badge>
                )}
              </div>
              <p className="font-bold text-gray-900 text-lg mb-1 group-hover:text-amber-600 transition-colors">
                {branch.name}
              </p>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Mail className="w-3 h-3" />
                <span className="truncate">{branch.station_email}</span>
              </div>
              <p className="text-xs text-amber-500 mt-3 font-medium">
                {branch.status === 'PENDING' ? 'ממתין לאישור הסניף' : branch.status === 'REJECTED' ? 'ההזמנה נדחתה' : 'לחץ לפתיחת מרכז הבקרה ←'}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}