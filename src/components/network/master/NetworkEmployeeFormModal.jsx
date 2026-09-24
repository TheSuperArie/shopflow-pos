import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ownershipFields } from '@/lib/ownershipFields';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ROLES = ['קופאי', 'מנהל', 'עובד'];

/** Adds an employee straight into a branch — appears for the branch manager too. */
export default function NetworkEmployeeFormModal({ open, onClose, branch, onSaved, onError }) {
  const [form, setForm] = useState({ name: '', pin: '', phone: '', role: 'קופאי', hourly_rate: '' });

  useEffect(() => {
    if (open) setForm({ name: '', pin: '', phone: '', role: 'קופאי', hourly_rate: '' });
  }, [open]);

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.Employee.create({
      name: data.name,
      pin: data.pin,
      phone: data.phone || undefined,
      role: data.role,
      hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : undefined,
      is_active: true,
      branch_id: branch.id,
      ...ownershipFields(branch),
    }),
    onSuccess: onSaved,
    onError,
  });

  const isValid = form.name.trim() && /^\d{4}$/.test(form.pin);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>עובד חדש ל{branch?.name || 'סניף'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>שם העובד</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="שם מלא" />
          </div>
          <div>
            <Label>קוד PIN (4 ספרות)</Label>
            <Input value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="1234" dir="ltr" />
          </div>
          <div>
            <Label>טלפון</Label>
            <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="05X-XXXXXXX" dir="ltr" />
          </div>
          <div>
            <Label>תפקיד</Label>
            <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>שכר לשעה (₪)</Label>
            <Input type="number" value={form.hourly_rate} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} placeholder="0" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate(form)} disabled={!isValid || mutation.isPending} className="w-full bg-blue-500 hover:bg-blue-600">
            {mutation.isPending ? 'שומר...' : 'שמור עובד'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}