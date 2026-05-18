import React, { useState } from 'react';
import { ArrowRight, MapPin, User, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import CatalogVisibility from '../CatalogVisibility';
import BranchInventory from '../BranchInventory';
import BranchDashboard from '@/components/dashboard/BranchDashboard';
import TicketChatPanel from '@/components/orders/TicketChatPanel';

export default function BranchCommandCenter({ branch, tenantEmail, onBack }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: branch.name || '',
    station_email: branch.station_email || '',
    address: branch.address || '',
    manager_name: branch.manager_name || '',
    manager_phone: branch.manager_phone || '',
    notes: branch.notes || '',
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Branch.update(branch.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      toast({ title: 'השינויים נשמרו בהצלחה!' });
    },
  });

  const handleSave = () => updateMutation.mutate(form);

  // Find the latest ticket for this branch to attach chat to
  const { data: tickets = [] } = useQuery({
    queryKey: ['order-tickets-branch', branch.id],
    queryFn: () => base44.entities.OrderTicket.filter({ branch_id: branch.id }, '-created_date', 1),
  });
  const latestTicket = tickets[0] || null;

  // Unread messages from branch
  const { data: unreadMsgs = [] } = useQuery({
    queryKey: ['chat-unread-hq', branch.id],
    queryFn: () => base44.entities.TicketChat.filter({ sender_role: 'BRANCH', is_read: false }),
    refetchInterval: 15000,
  });
  const unreadCount = latestTicket ? unreadMsgs.filter(m => m.ticket_id === latestTicket?.id).length : 0;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="mt-1">
          <ArrowRight className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{form.name || branch.name}</h1>
            <Badge variant={branch.is_active ? 'default' : 'secondary'}>
              {branch.is_active ? 'פעיל' : 'לא פעיל'}
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{branch.station_email}</p>
          {form.manager_name && (
            <p className="text-sm text-gray-600 flex items-center gap-1 mt-0.5">
              <User className="w-3.5 h-3.5" /> {form.manager_name}
            </p>
          )}
          {form.address && (
            <p className="text-sm text-gray-600 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3.5 h-3.5" /> {form.address}
            </p>
          )}
        </div>
      </div>

      <Tabs defaultValue="dashboard" dir="rtl">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="dashboard">לוח בקרה</TabsTrigger>
          <TabsTrigger value="details">פרטי סניף</TabsTrigger>
          <TabsTrigger value="catalog">נראות קטלוג</TabsTrigger>
          <TabsTrigger value="inventory">מלאי</TabsTrigger>
          <TabsTrigger value="chat" className="relative">
            צ'אט
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {unreadCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── DASHBOARD TAB ── */}
        <TabsContent value="dashboard" className="mt-4">
          <BranchDashboard branchId={branch.id} tenantEmail={tenantEmail} />
        </TabsContent>

        {/* ── BRANCH DETAILS TAB ── */}
        <TabsContent value="details" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold text-gray-700">עריכת פרטי סניף</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">שם הסניף</label>
                  <Input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="שם הסניף"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">אימייל עמדה</label>
                  <Input
                    value={form.station_email}
                    onChange={e => setForm(f => ({ ...f, station_email: e.target.value }))}
                    placeholder="אימייל עמדת הקופה"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">שם מנהל הסניף</label>
                  <Input
                    value={form.manager_name}
                    onChange={e => setForm(f => ({ ...f, manager_name: e.target.value }))}
                    placeholder="שם המנהל"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">טלפון מנהל הסניף</label>
                  <Input
                    value={form.manager_phone}
                    onChange={e => setForm(f => ({ ...f, manager_phone: e.target.value }))}
                    placeholder="05X-XXXXXXX"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium text-gray-700">כתובת הסניף</label>
                  <Input
                    value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="רחוב, עיר, מיקוד"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium text-gray-700">הערות פנימיות</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="הערות למנהל הרשת בלבד..."
                    rows={3}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  />
                </div>
              </div>

              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="bg-amber-500 hover:bg-amber-600"
              >
                {updateMutation.isPending ? 'שומר...' : 'שמור שינויים'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CATALOG TAB — master-only ── */}
        <TabsContent value="catalog" className="mt-4">
          <CatalogVisibility branch={branch} tenantEmail={tenantEmail} />
        </TabsContent>

        {/* ── INVENTORY TAB ── */}
        <TabsContent value="inventory" className="mt-4">
          <BranchInventory branch={branch} tenantEmail={tenantEmail} />
        </TabsContent>

        {/* ── CHAT TAB ── */}
        <TabsContent value="chat" className="mt-4">
          {latestTicket ? (
            <Card className="overflow-hidden" style={{ height: '500px' }}>
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-amber-500" />
                  צ'אט עם {branch.name}
                  <span className="text-xs text-gray-400 font-normal">• הזמנה #{latestTicket.id.slice(-6)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 h-full flex flex-col" style={{ height: 'calc(500px - 56px)' }}>
                <TicketChatPanel ticketId={latestTicket.id} senderRole="HQ" />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-gray-400">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>אין הזמנות לסניף זה עדיין</p>
                <p className="text-sm mt-1">הצ'אט זמין ברגע שהסניף שולח הזמנה ראשונה</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}