import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, Loader2, UsersRound, ClipboardList } from 'lucide-react';
import SupplyStatusBadge from './SupplyStatusBadge';
import { formatOrderDate, orderTotals } from '@/lib/supplyOrders';

/** "מלקטים" — like the branch employees page, without employee types or POS fields. */
export default function WarehousePickersPanel({ warehouse, orders = [] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null); // picker | 'new' | null

  const { data: pickers = [], isLoading } = useQuery({
    queryKey: ['warehouse-pickers', warehouse.id],
    queryFn: () => base44.entities.WarehousePicker.filter({ warehouse_id: warehouse.id }, 'name'),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.WarehousePicker.delete(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-pickers', warehouse.id] });
      if (selected?.id === id) setSelected(null);
      toast({ title: 'המלקט נמחק' });
    },
  });

  const pickedBy = (name) => orders.filter(o => o.picker_name === name && !['SENT_TO_WAREHOUSE'].includes(o.status));
  const selectedOrders = selected ? pickedBy(selected.name) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><UsersRound className="w-6 h-6" /> מלקטים</h2>
        <Button onClick={() => setEditing('new')} className="gap-2 h-11 bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4" /> מלקט חדש
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-700">רשימת מלקטים</h3>
            {pickers.map(p => (
              <div
                key={p.id}
                onClick={() => setSelected(p)}
                className={`cursor-pointer rounded-2xl border bg-white p-4 flex items-center justify-between transition-all ${selected?.id === p.id ? 'border-blue-500 shadow-md' : 'hover:border-blue-300'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold ${p.is_active === false ? 'bg-gray-100 text-gray-400' : 'bg-blue-100 text-blue-700'}`}>
                    {p.name?.[0]}
                  </div>
                  <div>
                    <p className="font-semibold">{p.name}{p.is_active === false && <span className="text-xs text-gray-400"> · לא פעיל</span>}</p>
                    <p className="text-xs text-gray-500">{p.phone || ''}{p.phone ? ' · ' : ''}{pickedBy(p.name).length} הזמנות לוקטו</p>
                  </div>
                </div>
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setEditing(p)} className="p-2.5 hover:bg-gray-100 rounded-lg"><Pencil className="w-4 h-4 text-gray-500" /></button>
                  <button onClick={() => { if (window.confirm(`למחוק את ${p.name}?`)) remove.mutate(p.id); }} className="p-2.5 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            ))}
            {pickers.length === 0 && <p className="text-center text-gray-400 py-8">אין מלקטים. לחץ על "מלקט חדש" להוספה.</p>}
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-gray-700 flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4" />
              {selected ? `הזמנות שליקט ${selected.name}` : 'בחר מלקט לצפייה בהזמנות שליקט'}
            </h3>
            {selected && selectedOrders.length === 0 && <p className="text-center text-gray-400 py-8">עוד אין הזמנות</p>}
            {selectedOrders.map(o => {
              const t = orderTotals(o.items);
              const packed = (o.items || []).reduce((s, i) => s + Number(i.picked_qty || 0), 0);
              return (
                <div key={o.id} className="rounded-2xl border bg-white p-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-800">{o.branch_name} · #{o.order_number}</p>
                    <p className="text-xs text-gray-500">{formatOrderDate(o.ready_at || o.picking_started_at || o.created_date, true)} · {t.lines} שורות · נארזו {packed}/{t.units}</p>
                  </div>
                  <SupplyStatusBadge status={o.status} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editing && (
        <PickerFormDialog
          picker={editing === 'new' ? null : editing}
          warehouse={warehouse}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PickerFormDialog({ picker, warehouse, onClose }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: picker?.name || '',
    phone: picker?.phone || '',
    is_active: picker ? picker.is_active !== false : true,
  });

  const save = useMutation({
    mutationFn: () => {
      const data = { name: form.name.trim(), phone: form.phone.trim(), is_active: form.is_active };
      return picker
        ? base44.entities.WarehousePicker.update(picker.id, data)
        : base44.entities.WarehousePicker.create({ ...data, warehouse_id: warehouse.id, tenant_email: warehouse.tenant_email });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-pickers', warehouse.id] });
      toast({ title: picker ? 'המלקט עודכן' : 'המלקט נוסף' });
      onClose();
    },
    onError: (e) => toast({ title: 'השמירה נכשלה', description: e?.message, variant: 'destructive' }),
  });

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader><DialogTitle>{picker ? 'עריכת מלקט' : 'מלקט חדש'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>שם מלא</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="שם המלקט" className="h-11" />
          </div>
          <div>
            <Label>טלפון (אופציונלי)</Label>
            <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="050-0000000" className="h-11" dir="ltr" />
          </div>
          <label className="flex items-center justify-between rounded-xl border p-3">
            <span className="text-sm">פעיל (מופיע בבחירת מלקט)</span>
            <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
          </label>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending} className="w-full h-11 bg-blue-600 hover:bg-blue-700">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
