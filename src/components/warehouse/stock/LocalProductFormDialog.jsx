import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const empty = { name: '', category_name: '', variant_label: '', sku: '', barcode: '', notes: '' };

/** A product that arrived but isn't in the network catalog → local warehouse product + alert to the owner. */
export default function LocalProductFormDialog({ warehouse, onClose, onSaved }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const data = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]));
      await base44.entities.WarehouseLocalProduct.create({
        ...data, status: 'PENDING', warehouse_id: warehouse.id,
        tenant_email: warehouse.tenant_email, station_email: warehouse.station_email,
      });
      await base44.entities.NetworkAlert.create({
        tenant_email: warehouse.tenant_email,
        type: 'WAREHOUSE_PRODUCT_PENDING',
        title: 'מוצר חדש במחסן ממתין לאישור',
        body: `${warehouse.name}: ${data.name}${data.variant_label ? ` · ${data.variant_label}` : ''}`,
        branch_id: warehouse.id,
        branch_name: warehouse.name,
        navigate_to: 'warehouse-stock',
        is_read: false,
      });
      onSaved();
    } catch (e) {
      setError(e?.message || 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader><DialogTitle>הוספת מוצר מקומי למחסן</DialogTitle></DialogHeader>
        <p className="text-sm text-gray-500">למוצר שהגיע ואינו בקטלוג הרשת. בעל הרשת יקבל התראה לאשר אותו.</p>
        <div className="space-y-3">
          <div><Label>שם המוצר *</Label><Input value={form.name} onChange={set('name')} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>קטגוריה</Label><Input value={form.category_name} onChange={set('category_name')} /></div>
            <div><Label>מידה / צבע</Label><Input value={form.variant_label} onChange={set('variant_label')} /></div>
            <div><Label>מק״ט</Label><Input value={form.sku} onChange={set('sku')} /></div>
            <div><Label>ברקוד</Label><Input value={form.barcode} onChange={set('barcode')} /></div>
          </div>
          <div><Label>הערות</Label><Input value={form.notes} onChange={set('notes')} /></div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={save} disabled={!form.name.trim() || saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'הוסף ושלח לאישור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}