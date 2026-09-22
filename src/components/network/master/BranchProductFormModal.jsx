import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import BranchVariantsEditor from './BranchVariantsEditor';

const emptyForm = {
  name: '', category_id: '', barcode: '', is_active: true,
  has_uniform_price: true, uniform_sell_price: '', uniform_cost_price: '',
};

/**
 * Create / edit a product in a branch's catalog from the network dashboard.
 * New records are stamped with branch_id so the branch POS loads them immediately.
 */
export default function BranchProductFormModal({ open, onClose, branch, categories, group, variants = [], onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!open) return;
    if (group) {
      setForm({
        name: group.name || '',
        category_id: group.category_id || '',
        barcode: group.barcode || '',
        is_active: group.is_active !== false,
        has_uniform_price: group.has_uniform_price !== false,
        uniform_sell_price: group.uniform_sell_price ?? '',
        uniform_cost_price: group.uniform_cost_price ?? '',
      });
      setRows(variants.map(v => ({ ...v })));
    } else {
      setForm(emptyForm);
      setRows([{ dimensions: {}, stock: 0, sell_price: null, cost_price: null }]);
    }
  }, [open, group?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        category_id: form.category_id,
        barcode: form.barcode || null,
        is_active: form.is_active,
        has_uniform_price: form.has_uniform_price,
        uniform_sell_price: form.uniform_sell_price === '' ? null : Number(form.uniform_sell_price),
        uniform_cost_price: form.uniform_cost_price === '' ? null : Number(form.uniform_cost_price),
      };

      const saved = group
        ? await base44.entities.ProductGroup.update(group.id, payload)
        : await base44.entities.ProductGroup.create({ ...payload, branch_id: branch.id });
      const groupId = group?.id || saved.id;

      // Variants: update existing, create new, delete removed
      const keptIds = rows.filter(r => r.id).map(r => r.id);
      const removed = variants.filter(v => !keptIds.includes(v.id));
      await Promise.all([
        ...rows.map(r => {
          const vp = {
            dimensions: r.dimensions || {},
            stock: Number(r.stock) || 0,
            sell_price: r.sell_price === null || r.sell_price === '' ? null : Number(r.sell_price),
            cost_price: r.cost_price === null || r.cost_price === '' ? null : Number(r.cost_price),
          };
          return r.id
            ? base44.entities.ProductVariant.update(r.id, vp)
            : base44.entities.ProductVariant.create({ ...vp, group_id: groupId, branch_id: branch.id });
        }),
        ...removed.map(v => base44.entities.ProductVariant.delete(v.id)),
      ]);
    },
    onSuccess: () => {
      toast({ title: group ? 'המוצר עודכן' : 'המוצר נוסף' });
      onSaved();
      onClose();
    },
    onError: (e) => toast({ title: 'השמירה נכשלה', description: e?.message, variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{group ? 'עריכת מוצר' : 'מוצר חדש'}</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div><Label>שם המוצר</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>

          <div>
            <Label>קטגוריה</Label>
            <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
              <SelectTrigger><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div><Label>ברקוד</Label><Input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="אופציונלי" /></div>

          <div className="flex items-center justify-between p-3 rounded-xl border">
            <Label>מחיר אחיד לכל הוריאנטים</Label>
            <Switch checked={form.has_uniform_price} onCheckedChange={v => setForm({ ...form, has_uniform_price: v })} />
          </div>

          {form.has_uniform_price && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>מחיר מכירה</Label><Input type="number" value={form.uniform_sell_price} onChange={e => setForm({ ...form, uniform_sell_price: e.target.value })} /></div>
              <div><Label>מחיר עלות</Label><Input type="number" value={form.uniform_cost_price} onChange={e => setForm({ ...form, uniform_cost_price: e.target.value })} /></div>
            </div>
          )}

          <BranchVariantsEditor variants={rows} onChange={setRows} hasUniformPrice={form.has_uniform_price} />

          <div className="flex items-center justify-between p-3 rounded-xl border">
            <Label>מוצר פעיל (מוצג בקופה)</Label>
            <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!form.name || !form.category_id || saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}