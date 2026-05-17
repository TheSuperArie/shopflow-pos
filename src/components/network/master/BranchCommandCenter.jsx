import React, { useState } from 'react';
import { ArrowRight, MapPin, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import CatalogVisibility from '../CatalogVisibility';
import BranchInventory from '../BranchInventory';
import BranchDashboard from '@/components/dashboard/BranchDashboard';

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
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="dashboard">לוח בקרה</TabsTrigger>
          <TabsTrigger value="details">פרטי סניף</TabsTrigger>
          <TabsTrigger value="catalog">נראות קטלוג</TabsTrigger>
          <TabsTrigger value="inventory">מלאי</TabsTrigger>
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
      </Tabs>
    </div>
  );
}