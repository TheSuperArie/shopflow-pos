import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Plus, Package, Clock, CheckCircle, XCircle, Truck, Search } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_CONFIG = {
  pending:  { label: 'ממתין', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  approved: { label: 'אושר',  color: 'bg-green-100 text-green-800',  icon: CheckCircle },
  rejected: { label: 'נדחה',  color: 'bg-red-100 text-red-800',      icon: XCircle },
  dispatched:{ label: 'נשלח', color: 'bg-blue-100 text-blue-800',    icon: Truck },
};

export default function BranchNetworkOrders() {
  const [showForm, setShowForm] = useState(false);
  const user = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get this branch's record
  const { data: branches = [] } = useQuery({
    queryKey: ['branches', user?.email],
    queryFn: () => base44.entities.Branch.filter({ tenant_email: user.email }),
    enabled: !!user?.email,
  });
  const myBranch = branches.find(b => b.is_active) || branches[0];

  // All stock requests for this branch
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['stock-requests', myBranch?.id],
    queryFn: () => base44.entities.StockRequest.filter({ branch_id: myBranch.id }, '-created_date'),
    enabled: !!myBranch?.id,
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">הזמנות לרשת</h1>
          <p className="text-sm text-gray-500 mt-1">שלח בקשות מלאי למרכז הרשת</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" /> בקשה חדשה
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const count = requests.filter(r => r.status === key).length;
          return (
            <Card key={key}>
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">{cfg.label}</p>
                  <p className="text-xl font-bold">{count}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">היסטוריית בקשות</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-gray-400">טוען...</div>
          ) : requests.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>אין בקשות עדיין</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500 text-right">
                    <th className="pb-2 font-medium">מוצר</th>
                    <th className="pb-2 font-medium">כמות מבוקשת</th>
                    <th className="pb-2 font-medium">כמות שאושרה</th>
                    <th className="pb-2 font-medium">סטטוס</th>
                    <th className="pb-2 font-medium">הערות</th>
                    <th className="pb-2 font-medium">תאריך</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {requests.map(req => {
                    const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                    return (
                      <tr key={req.id} className="py-2">
                        <td className="py-3 font-medium">{req.variant_label || req.variant_id?.slice(0, 8)}</td>
                        <td className="py-3">{req.requested_qty}</td>
                        <td className="py-3">{req.approved_qty ?? '—'}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="py-3 text-gray-500 max-w-32 truncate">{req.notes || '—'}</td>
                        <td className="py-3 text-gray-400">{format(new Date(req.created_date), 'dd/MM/yy')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <NewRequestModal
        open={showForm}
        onClose={() => setShowForm(false)}
        branch={myBranch}
        tenantEmail={user?.email}
        queryClient={queryClient}
        toast={toast}
      />
    </div>
  );
}

function NewRequestModal({ open, onClose, branch, tenantEmail, queryClient, toast }) {
  const [variantSearch, setVariantSearch] = useState('');
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  const { data: variants = [] } = useQuery({
    queryKey: ['flexible-variants-all', tenantEmail],
    queryFn: () => base44.entities.FlexibleVariant.filter({ created_by: tenantEmail }),
    enabled: open && !!tenantEmail,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['product-groups', tenantEmail],
    queryFn: () => base44.entities.ProductGroup.filter({ created_by: tenantEmail }),
    enabled: open && !!tenantEmail,
  });

  const groupMap = Object.fromEntries(groups.map(g => [g.id, g]));

  const getVariantLabel = (v) => {
    const grp = groupMap[v.group_id];
    const dimStr = v.dimensions ? Object.values(v.dimensions).join(' / ') : '';
    return [grp?.name, dimStr].filter(Boolean).join(' — ');
  };

  const filtered = variants.filter(v =>
    getVariantLabel(v).toLowerCase().includes(variantSearch.toLowerCase())
  ).slice(0, 20);

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.StockRequest.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-requests'] });
      queryClient.invalidateQueries({ queryKey: ['stock-requests-all'] });
      toast({ title: '✅ הבקשה נשלחה בהצלחה', duration: 2000 });
      onClose();
      setSelectedVariant(null);
      setVariantSearch('');
      setQty(1);
      setNotes('');
    },
  });

  const handleSubmit = () => {
    if (!selectedVariant || !branch) return;
    mutation.mutate({
      tenant_email: tenantEmail,
      branch_id: branch.id,
      variant_id: selectedVariant.id,
      variant_label: getVariantLabel(selectedVariant),
      requested_qty: qty,
      status: 'pending',
      notes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>בקשת מלאי חדשה</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>חיפוש מוצר</Label>
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <Input
                className="pr-9"
                placeholder="חפש לפי שם מוצר..."
                value={variantSearch}
                onChange={e => { setVariantSearch(e.target.value); setSelectedVariant(null); }}
              />
            </div>
            {variantSearch && !selectedVariant && (
              <div className="border rounded-lg mt-1 max-h-48 overflow-y-auto shadow-sm">
                {filtered.length === 0 ? (
                  <p className="p-3 text-sm text-gray-400">לא נמצאו תוצאות</p>
                ) : filtered.map(v => (
                  <button
                    key={v.id}
                    onClick={() => { setSelectedVariant(v); setVariantSearch(getVariantLabel(v)); }}
                    className="w-full text-right px-3 py-2 hover:bg-amber-50 text-sm border-b last:border-0"
                  >
                    {getVariantLabel(v)}
                  </button>
                ))}
              </div>
            )}
            {selectedVariant && (
              <div className="mt-2 p-2 bg-amber-50 rounded-lg text-sm text-amber-800 flex items-center justify-between">
                <span>{getVariantLabel(selectedVariant)}</span>
                <button onClick={() => { setSelectedVariant(null); setVariantSearch(''); }} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
              </div>
            )}
          </div>

          <div>
            <Label>כמות מבוקשת</Label>
            <Input type="number" min={1} value={qty} onChange={e => setQty(Number(e.target.value))} />
          </div>
          <div>
            <Label>הערות (אופציונלי)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="סיבת הבקשה, דחיפות..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSubmit} disabled={!selectedVariant || qty < 1 || mutation.isPending}>
            שלח בקשה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}