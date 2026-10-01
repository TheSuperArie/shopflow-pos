import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { approveLocalProduct } from '@/lib/warehouseApproval';

/** Pre-filled "add to network catalog" form for a product the warehouse added locally. */
export default function ApproveLocalProductDialog({ local, warehouse, tenantEmail, branches, onClose, onDone }) {
  const [form, setForm] = useState({
    name: local.name || '', category_name: local.category_name || '', barcode: local.barcode || '',
    uniform_sell_price: '', uniform_cost_price: '', label: local.variant_label || '',
  });
  const [copy, setCopy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await approveLocalProduct({
        local, warehouse, tenantEmail, branches, copyToBranches: copy, label: form.label.trim(),
        product: {
          name: form.name.trim(), category_name: form.category_name.trim(), barcode: form.barcode.trim(),
          is_active: true, has_uniform_price: true,
          uniform_sell_price: form.uniform_sell_price, uniform_cost_price: form.uniform_cost_price,
        },
      });
      onDone(res);
    } catch (e) {
      setError(e?.message || 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const otherCount = branches.filter(b => b.station_email !== tenantEmail).length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader><DialogTitle>הוספת מוצר המחסן לקטלוג הרשת</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>שם המוצר *</Label><Input value={form.name} onChange={set('name')} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>קטגוריה *</Label><Input value={form.category_name} onChange={set('category_name')} /></div>
            <div><Label>מידה / וריאנט</Label><Input value={form.label} onChange={set('label')} /></div>
            <div><Label>מחיר מכירה</Label><Input type="number" value={form.uniform_sell_price} onChange={set('uniform_sell_price')} /></div>
            <div><Label>מחיר עלות</Label><Input type="number" value={form.uniform_cost_price} onChange={set('uniform_cost_price')} /></div>
          </div>
          <div><Label>ברקוד</Label><Input value={form.barcode} onChange={set('barcode')} /></div>
          <div className="flex items-center justify-between p-3 rounded-xl border">
            <Label>להוסיף גם לקטלוג הסניפים ({otherCount})</Label>
            <Switch checked={copy} onCheckedChange={setCopy} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={save} disabled={!form.name.trim() || !form.category_name.trim() || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'הוסף לקטלוג הרשת'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}