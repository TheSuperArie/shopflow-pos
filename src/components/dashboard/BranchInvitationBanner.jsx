import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Mail } from 'lucide-react';

/**
 * Shows a prominent banner when the local admin has a PENDING branch invitation.
 * Props:
 *   invitation – Branch record with status='PENDING'
 *   userEmail  – current user's email (used to invalidate queries)
 */
export default function BranchInvitationBanner({ invitation, userEmail }) {
  const queryClient = useQueryClient();
  const [done, setDone] = useState(false);

  const accept = useMutation({
    mutationFn: async () => {
      await base44.entities.Branch.update(invitation.id, { status: 'ACTIVE', is_active: true });
      // Notify the Master Admin (tenant_email on the branch is the master's email)
      await base44.entities.NetworkAlert.create({
        tenant_email: invitation.tenant_email,
        type: 'INVITE_ACCEPTED',
        title: 'סניף אישר הזמנה',
        body: `"${invitation.name}" אישר את ההזמנה והצטרף לרשת!`,
        branch_id: invitation.id,
        branch_name: invitation.name,
        is_read: false,
        navigate_to: 'branches',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches', userEmail] });
      queryClient.invalidateQueries({ queryKey: ['pending-invitations', userEmail] });
      setDone(true);
    },
  });

  const decline = useMutation({
    mutationFn: () => base44.entities.Branch.update(invitation.id, { status: 'REJECTED', is_active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches', userEmail] });
      queryClient.invalidateQueries({ queryKey: ['pending-invitations', userEmail] });
      setDone(true);
    },
  });

  if (done) return null;

  const isPending = accept.isPending || decline.isPending;

  return (
    <div className="border border-amber-300 bg-amber-50 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4" dir="rtl">
      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
        <Mail className="w-5 h-5 text-amber-600" />
      </div>
      <div className="flex-1">
        <p className="font-bold text-gray-900 text-base">הזמנה להצטרף לרשת</p>
        <p className="text-sm text-gray-600 mt-0.5">
          רשת <span className="font-semibold text-amber-700">{invitation.network_name || 'לא ידוע'}</span> הזמינה אותך להצטרף כסניף בשם
          &nbsp;<span className="font-semibold">"{invitation.name}"</span>.
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="border-red-300 text-red-600 hover:bg-red-50"
          onClick={() => decline.mutate()}
          disabled={isPending}
        >
          <XCircle className="w-4 h-4 ml-1" />
          דחה
        </Button>
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={() => accept.mutate()}
          disabled={isPending}
        >
          <CheckCircle2 className="w-4 h-4 ml-1" />
          אשר בקשה
        </Button>
      </div>
    </div>
  );
}