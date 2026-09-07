import React, { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/**
 * Plays a short two-tone "ding-dong" using the Web Audio API (no asset files needed).
 * Silently does nothing if the browser blocks audio before a user gesture.
 */
function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.resume) ctx.resume();
    const playTone = (freq, start) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.35);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + 0.4);
    };
    playTone(880, 0);
    playTone(1174.66, 0.18);
  } catch {
    // audio unavailable — the toast still shows
  }
}

/**
 * Global listener for incoming network chat messages (HQ → branch).
 * - While the site is open: plays a sound + toast the moment a new HQ message arrives.
 * - When the site was closed: on open, if unread HQ messages exist, shows
 *   "הגיע אליך הודעה מהרשת".
 * - Respects the "התראות וצלילים" setting (default: enabled).
 */
export default function NetworkMessageNotifier() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const prevCount = useRef(null);

  // This account's branch as a station in someone else's network (POS branch rule)
  const { data: stationBranches = [] } = useQuery({
    queryKey: ['notifier-station-branches', user?.email],
    queryFn: () => base44.entities.Branch.filter({ station_email: user.email, is_active: true, status: 'ACTIVE' }),
    enabled: !!user?.email,
    staleTime: 0,
  });
  const myBranch = stationBranches.find(b => b.tenant_email !== user?.email);

  // Per-account settings — notifications default to ON when unset
  const { data: settings = [] } = useQuery({
    queryKey: ['app-settings', user?.email],
    queryFn: () => base44.entities.AppSettings.filter({ created_by: user.email }),
    enabled: !!user?.email,
    staleTime: 60000,
  });
  const notificationsEnabled = settings[0]?.notifications_enabled !== false;

  // Live updates when this account's station branch changes (invitation accepted, etc.)
  useEffect(() => {
    const unsub = base44.entities.Branch.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['notifier-station-branches', user?.email] });
    });
    return unsub;
  }, [user?.email, queryClient]);

  // Unread general-chat messages sent by HQ to this branch
  const { data: unread = [] } = useQuery({
    queryKey: ['network-chat-unread', myBranch?.id],
    queryFn: () => base44.entities.BranchGeneralChat.filter({
      branch_id: myBranch.id,
      tenant_email: myBranch.tenant_email,
      sender_role: 'HQ',
      is_read: false,
    }),
    enabled: !!myBranch,
    staleTime: 0,
  });

  // Live updates while the site is open
  useEffect(() => {
    const unsub = base44.entities.BranchGeneralChat.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['network-chat-unread', myBranch?.id] });
    });
    return unsub;
  }, [myBranch?.id, queryClient]);

  const count = unread.length;
  useEffect(() => {
    if (!notificationsEnabled || count === 0) {
      prevCount.current = count;
      return;
    }
    const isFirstLoad = prevCount.current === null;
    const isNewMessage = !isFirstLoad && count > prevCount.current;
    // isFirstLoad = site just opened with waiting messages; isNewMessage = arrived live
    if (isFirstLoad || isNewMessage) {
      playNotificationSound();
      toast({
        title: 'הגיע אליך הודעה מהרשת',
        description: count > 1
          ? `${count} הודעות חדשות ממטה הרשת`
          : 'הודעה חדשה ממטה הרשת — צפה ב"הזמנות לרשת"',
        duration: 6000,
      });
    }
    prevCount.current = count;
  }, [count, notificationsEnabled, toast, myBranch?.id]);

  return null;
}