import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Check, CheckCheck } from 'lucide-react';
import { format } from 'date-fns';

// senderRole: 'BRANCH' | 'HQ'  — the current viewer's role
export default function TicketChatPanel({ ticketId, senderRole }) {
  const [text, setText] = useState('');
  const bottomRef = useRef(null);
  const queryClient = useQueryClient();

  const myRole = senderRole;
  const otherRole = senderRole === 'BRANCH' ? 'HQ' : 'BRANCH';

  const { data: messages = [] } = useQuery({
    queryKey: ['ticket-chat', ticketId],
    queryFn: () => base44.entities.TicketChat.filter({ ticket_id: ticketId }, 'created_date'),
    enabled: !!ticketId,
    refetchInterval: 10000,
  });

  // Mark incoming messages as read
  const markReadMutation = useMutation({
    mutationFn: async () => {
      const unread = messages.filter(m => m.sender_role === otherRole && !m.is_read);
      await Promise.all(unread.map(m => base44.entities.TicketChat.update(m.id, { is_read: true })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-chat', ticketId] });
    },
  });

  // Real-time subscription
  useEffect(() => {
    const unsub = base44.entities.TicketChat.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['ticket-chat', ticketId] });
    });
    return unsub;
  }, [ticketId, queryClient]);

  // Mark as read when opened + when messages change
  useEffect(() => {
    if (messages.length > 0) {
      const hasUnread = messages.some(m => m.sender_role === otherRole && !m.is_read);
      if (hasUnread) markReadMutation.mutate();
    }
  }, [messages.length, ticketId]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: (msg) => base44.entities.TicketChat.create(msg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-chat', ticketId] });
      setText('');
    },
  });

  const handleSend = () => {
    if (!text.trim() || !ticketId) return;
    sendMutation.mutate({
      ticket_id: ticketId,
      sender_role: myRole,
      message_text: text.trim(),
      is_read: false,
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col h-full" dir="rtl">
      <div className="px-3 py-2 border-b bg-gray-50">
        <p className="text-xs font-medium text-gray-600">צ'אט עם {myRole === 'BRANCH' ? 'מטה הרשת' : 'הסניף'}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-center text-xs text-gray-400 mt-4">אין הודעות עדיין</p>
        )}
        {messages.map(msg => {
          const isMine = msg.sender_role === myRole;
          const isRead = msg.is_read;
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
                    isRead
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
      <div className="p-2 border-t bg-white flex gap-2">
        <Input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="כתוב הודעה..."
          className="flex-1 text-sm"
        />
        <Button size="icon" onClick={handleSend} disabled={!text.trim() || sendMutation.isPending} className="bg-amber-500 hover:bg-amber-600 shrink-0">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}