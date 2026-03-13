import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Loader2, TruckIcon, AlertTriangle, Package } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminStock() {
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: updates = [], isLoading } = useQuery({
    queryKey: ['stock-updates'],
    queryFn: () => base44.entities.StockUpdate.list('-arrival_date'),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['product-groups'],
    queryFn: () => base44.entities.ProductGroup.list(),
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['product-variants'],
    queryFn: () => base44.entities.ProductVariant.list(),
  });

  // Calculate low stock items
  const lowStockItems = [];
  groups.forEach(group => {
    const groupVariants = variants.filter(v => v.group_id === group.id);
    groupVariants.forEach(variant => {
      if ((variant.stock || 0) < 5) {
        lowStockItems.push({
          groupName: group.name,
          variant,
          stock: variant.stock || 0,
        });
      }
    });
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">עדכון מלאי</h1>
        <Button onClick={() => setShowForm(true)} className="gap-2 bg-amber-500 hover:bg-amber-600">
          <Plus className="w-4 h-4" /> סחורה חדשה
        </Button>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              התראות מלאי נמוך ({lowStockItems.length} פריטים)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {lowStockItems.map((item, idx) => (
                <div key={idx} className="p-3 bg-white rounded-lg border border-red-200">
                  <p className="font-semibold text-sm">{item.groupName}</p>
                  <p className="text-xs text-gray-600">
                    {item.variant.size} | {item.variant.cut} | {item.variant.collar}
                  </p>
                  <Badge className="mt-2 bg-red-600">
                    מלאי: {item.stock} יחידות
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
      ) : (
        <div className="space-y-3">
          {updates.map(upd => (
            <Card key={upd.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <TruckIcon className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{upd.product_name}</p>
                  <p className="text-sm text-gray-500">
                    +{upd.quantity_added} יחידות • {upd.supplier_name || 'ספק לא צוין'} • {upd.arrival_date}
                  </p>
                  {upd.notes && <p className="text-xs text-gray-400 mt-1">{upd.notes}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
          {updates.length === 0 && <p className="text-center text-gray-400 py-12">אין עדכוני מלאי</p>}
        </div>
      )}

      <StockFormModal open={showForm} onClose={() => setShowForm(false)} queryClient={queryClient} toast={toast} />
    </div>
  );
}

function StockFormModal({ open, onClose, queryClient, toast }) {
  const [form, setForm] = useState({
    product_id: '', quantity_added: 0, supplier_name: '', arrival_date: format(new Date(), 'yyyy-MM-dd'), notes: '',
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
  });

  const mutation = useMutation({
    mutationFn: async (data) => {
      const product = products.find(p => p.id === data.product_id);
      await base44.entities.StockUpdate.create({
        ...data,
        product_name: product?.name || '',
      });
      if (product) {
        await base44.entities.Product.update(product.id, {
          stock: (product.stock || 0) + data.quantity_added,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-updates'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'המלאי עודכן' });
      onClose();
      setForm({ product_id: '', quantity_added: 0, supplier_name: '', arrival_date: format(new Date(), 'yyyy-MM-dd'), notes: '' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader><DialogTitle>סחורה חדשה</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>מוצר</Label>
            <Select value={form.product_id} onValueChange={v => setForm({ ...form, product_id: v })}>
              <SelectTrigger><SelectValue placeholder="בחר מוצר" /></SelectTrigger>
              <SelectContent>
                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} (מלאי: {p.stock || 0})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>כמות שהגיעה</Label><Input type="number" value={form.quantity_added} onChange={e => setForm({ ...form, quantity_added: Number(e.target.value) })} /></div>
          <div><Label>שם ספק</Label><Input value={form.supplier_name} onChange={e => setForm({ ...form, supplier_name: e.target.value })} /></div>
          <div><Label>תאריך הגעה</Label><Input type="date" value={form.arrival_date} onChange={e => setForm({ ...form, arrival_date: e.target.value })} /></div>
          <div><Label>הערות</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate(form)} disabled={!form.product_id || !form.quantity_added} className="bg-amber-500 hover:bg-amber-600">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}