import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Warehouse, Clock, CheckCircle2, XCircle, Unlink, Plus, Mail } from 'lucide-react';

const EMPTY = { name: '', station_email: '', address: '', manager_name: '', manager_phone: '', network_phone: '' };

/** Network side: invite a warehouse account, see its status, disconnect it. */
export default function WarehouseConnectCard({ warehouse, tenantEmail, networkName }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['warehouses', tenantEmail] });

  const invite = useMutation({
    mutationFn: () => base44.entities.Warehouse.create({
      ...form,
      name: form.name.trim(),
      station_email: form.station_email.trim().toLowerCase(),
      tenant_email: tenantEmail,
      network_name: networkName || 'הרשת',
      status: 'PENDING',
      is_active: false,
    }),
    onSuccess: () => { refresh(); setShowForm(false); setForm(EMPTY); toast({ title: 'ההזמנה נשלחה לחשבון המחסן' }); },
    onError: (e) => toast({ title: 'שליחת ההזמנה נכשלה', description: e?.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: () => base44.entities.Warehouse.delete(warehouse.id),
    onSuccess: () => { refresh(); setConfirmRemove(false); },
  });

  const saveDetails = useMutation({
    mutationFn: (patch) => base44.entities.Warehouse.update(warehouse.id, patch),
    onSuccess: refresh,
  });

  if (!warehouse) {
    if (!showForm) {
      return (
        <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50/50 p-4 text-center space-y-2">
          <Warehouse className="w-8 h-8 mx-auto text-blue-400" />
          <p className="text-sm text-gray-600">עוד לא חובר מחסן לרשת</p>
          <Button onClick={() => setShowForm(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4" /> חבר מחסן
          </Button>
        </div>
      );
    }
    const valid = form.name.trim() && /\S+@\S+\.\S+/.test(form.station_email.trim());
    const field = (key, label, props = {}) => (
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-600">{label}</label>
        <Input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} {...props} />
      </div>
    );
    return (
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <p className="font-semibold text-gray-800">חיבור מחסן</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('name', 'שם המחסן *', { placeholder: 'לדוגמה: מחסן ראשי' })}
          {field('station_email', 'אימייל חשבון המחסן *', { type: 'email', dir: 'ltr', placeholder: 'warehouse@gmail.com' })}
          {field('address', 'כתובת')}
          {field('manager_name', 'איש קשר')}
          {field('manager_phone', 'טלפון איש קשר', { dir: 'ltr' })}
          {field('network_phone', 'טלפון הרשת (יוצג למחסן בהזמנות)', { dir: 'ltr' })}
        </div>
        <p className="text-xs text-gray-500">
          חשוב: חשבון נפרד שלא משמש כקופה של אף סניף. כשהחשבון יתחבר לאתר הוא יתבקש לאשר את ההזמנה, ומאז ייכנס ישר למסך המחסן.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => invite.mutate()} disabled={!valid || invite.isPending} className="bg-blue-600 hover:bg-blue-700">שלח הזמנה</Button>
          <Button variant="outline" onClick={() => { setShowForm(false); setForm(EMPTY); }}>ביטול</Button>
        </div>
      </div>
    );
  }

  const status = warehouse.status;
  return (
    <div className="rounded-xl border bg-white p-3 flex flex-wrap items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
        <Warehouse className="w-5 h-5 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800 flex items-center gap-2">
          {warehouse.name}
          {status === 'ACTIVE' && <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> מחובר</span>}
          {status === 'PENDING' && <span className="inline-flex items-center gap-1 text-xs text-amber-700"><Clock className="w-3.5 h-3.5" /> ממתין לאישור המחסן</span>}
          {status === 'REJECTED' && <span className="inline-flex items-center gap-1 text-xs text-red-600"><XCircle className="w-3.5 h-3.5" /> נדחה</span>}
        </p>
        <p className="text-xs text-gray-400 flex items-center gap-1 truncate"><Mail className="w-3 h-3" /> {warehouse.station_email}</p>
        {status === 'ACTIVE' && !warehouse.network_phone && (
          <button
            className="text-xs text-blue-600 hover:underline mt-0.5"
            onClick={() => {
              const phone = window.prompt('טלפון הרשת שיוצג למחסן בהזמנות:');
              if (phone) saveDetails.mutate({ network_phone: phone.trim() });
            }}
          >
            + הוסף טלפון רשת להזמנות
          </button>
        )}
      </div>
      {confirmRemove ? (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
            {status === 'ACTIVE' ? 'אשר ניתוק' : 'אשר ביטול'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmRemove(false)}>חזור</Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 gap-1" onClick={() => setConfirmRemove(true)}>
          <Unlink className="w-3.5 h-3.5" /> {status === 'ACTIVE' ? 'נתק' : 'בטל הזמנה'}
        </Button>
      )}
    </div>
  );
}
