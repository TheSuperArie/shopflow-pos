import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Check, CheckCheck, X, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';

// senderRole: 'BRANCH' | 'HQ'
// inline: render as embedded panel instead of floating drawer
export default function GeneralChatDrawer({ open, onClose, branchId, tenantEmail, senderRole, inline = false }) {
  const [text, setText] = useState('');
  const bottomRef = useRef(null);
  const queryClient = useQueryClient();
  const otherRole = senderRole === 'BRANCH' ? 'HQ' : 'BRANCH';

  const { data: messages = [] } = useQuery({
    queryKey: ['general-chat', branchId],
    queryFn: () => base44.entities.BranchGeneralChat.filter({ branch_id: branchId, tenant_email: tenantEmail }, 'created_date'),
    enabled: !!branchId && open,
    refetchInterval: 8000,
  });

  // Mark incoming as read
  const markReadMutation = useMutation({
    mutationFn: async () => {
      const unread = messages.filter(m => m.sender_role === otherRole && !m.is_read);
      await Promise.all(unread.map(m => base44.entities.BranchGeneralChat.update(m.id, { is_read: true })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['general-chat', branchId] });
      queryClient.invalidateQueries({ queryKey: ['general-chat-unread', branchId] });
    },
  });

  // Real-time subscription
  useEffect(() => {
    const unsub = base44.entities.BranchGeneralChat.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['general-chat', branchId] });
      queryClient.invalidateQueries({ queryKey: ['general-chat-unread', branchId] });
    });
    return unsub;
  }, [branchId, queryClient]);

  // Mark as read when opened
  useEffect(() => {
    if (open && messages.length > 0) {
      const hasUnread = messages.some(m => m.sender_role === otherRole && !m.is_read);
      if (hasUnread) markReadMutation.mutate();
    }
  }, [open, messages.length]);

  // Auto-scroll
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, open]);

  const sendMutation = useMutation({
    mutationFn: (msg) => base44.entities.BranchGeneralChat.create(msg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['general-chat', branchId] });
      setText('');
    },
  });

  const handleSend = () => {
    if (!text.trim()) return;
    sendMutation.mutate({
      branch_id: branchId,
      tenant_email: tenantEmail,
      sender_role: senderRole,
      message_text: text.trim(),
      is_read: false,
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (!open && !inline) return null;

  const chatContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-amber-500 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-white" />
          <span className="font-semibold text-white">
            {senderRole === 'BRANCH' ? "צ'אט עם מטה הרשת" : "צ'אט עם הסניף"}
          </span>
        </div>
        {!inline && (
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0 bg-gray-50">
          {messages.length === 0 && (
            <p className="text-center text-sm text-gray-400 mt-8">אין הודעות עדיין. שלח הודעה ראשונה!</p>
          )}
          {messages.map(msg => {
            const isMine = msg.sender_role === senderRole;
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  isMine
                    ? 'bg-amber-500 text-white rounded-tr-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                }`}>
                  <p className="leading-snug">{msg.message_text}</p>
                  <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <span className={`text-[10px] ${isMine ? 'text-amber-100' : 'text-gray-400'}`}>
                      {msg.created_date ? format(new Date(msg.created_date), 'HH:mm') : ''}
                    </span>
                    {isMine && (
                      msg.is_read
                        ? <CheckCheck className="w-3 h-3 text-blue-300" />
                        : <Check className="w-3 h-3 text-amber-200" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}

        <div className="p-3 border-t bg-white flex gap-2">
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="כתוב הודעה..."
            className="flex-1 text-sm"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!text.trim() || sendMutation.isPending}
            className="bg-amber-500 hover:bg-amber-600 shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
    </>
  );

  if (inline) {
    return <div className="flex flex-col h-full" dir="rtl">{chatContent}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none" dir="rtl">
      <div className="absolute inset-0 bg-black/30 pointer-events-auto" onClick={onClose} />
      <div className="relative pointer-events-auto w-full max-w-sm h-[70vh] bg-white rounded-t-2xl shadow-2xl flex flex-col sm:rounded-2xl sm:m-4 sm:h-[600px]">
        {chatContent}
      </div>
    </div>
  );
}