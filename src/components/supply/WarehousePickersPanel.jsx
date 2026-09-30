import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  Plus, Pencil, Trash2, Loader2, UsersRound, ClipboardList, Clock, Wallet, LogIn, LogOut, Calendar, ClipboardEdit,
} from 'lucide-react';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { fetchAllPages } from '@/lib/fetchAllPages';
import EmployeePaymentPanel from '@/components/admin/EmployeePaymentPanel';
import ShiftEditModal from '@/components/admin/ShiftEditModal';
import SupplyStatusBadge from './SupplyStatusBadge';
import { formatOrderDate, orderTotals } from '@/lib/supplyOrders';

/**
 * "מלקטים" — the warehouse's employees page: same attendance / payments as the branch
 * employees page, without employee types or POS fields (no PIN, no cash counts).
 * Shifts and payments are stamped with the warehouse id (never with the network), so they
 * never show up in the network's branch reports.
 */
export default function WarehousePickersPanel({ warehouse, orders = [] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null); // picker | 'new' | null
  const [manualFor, setManualFor] = useState(null);
  const [editingLog, setEditingLog] = useState(null);
  const [tab, setTab] = useState('attendance');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: pickers = [], isLoading } = useQuery({
    queryKey: ['warehouse-pickers', warehouse.id],
    queryFn: () => base44.entities.WarehousePicker.filter({ warehouse_id: warehouse.id }, 'name'),
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['attendance-logs', 'warehouse', warehouse.id],
    queryFn: () => fetchAllPages(base44.entities.AttendanceLog, { branch_id: warehouse.id }, '-clock_in', { label: 'משמרות' }),
  });

  // The shape the shared employee components expect
  const asEmployee = (p) => p && ({
    ...p,
    branch_id: warehouse.id,
    station_email: warehouse.station_email,
    tenant_email: null,
  });
  const selected = asEmployee(pickers.find(p => p.id === selectedId));
  const openShiftOf = (id) => logs.find(l => l.employee_id === id && !l.clock_out);

  const refreshLogs = () => queryClient.invalidateQueries({ queryKey: ['attendance-logs'] });

  const clock = useMutation({
    mutationFn: async (picker) => {
      const open = openShiftOf(picker.id);
      if (open) return base44.entities.AttendanceLog.update(open.id, { clock_out: new Date().toISOString() });
      return base44.entities.AttendanceLog.create({
        employee_id: picker.id,
        employee_name: picker.name,
        clock_in: new Date().toISOString(),
        date: format(new Date(), 'yyyy-MM-dd'),
        branch_id: warehouse.id,
        station_email: warehouse.station_email,
        tenant_email: null,
      });
    },
    onSuccess: (_, picker) => {
      refreshLogs();
      toast({ title: openShiftOf(picker.id) ? `${picker.name} יצא/ה מהמשמרת` : `${picker.name} נכנס/ה למשמרת`, duration: 2000 });
    },
    onError: (e) => toast({ title: 'העדכון נכשל', description: e?.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.WarehousePicker.delete(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-pickers', warehouse.id] });
      if (selectedId === id) setSelectedId(null);
      toast({ title: 'המלקט נמחק' });
    },
  });

  const selectedLogs = useMemo(() => (selected ? logs.filter(l => l.employee_id === selected.id) : []), [logs, selected?.id]);
  const filteredLogs = selectedLogs.filter(l => (!startDate || l.date >= startDate) && (!endDate || l.date <= endDate));
  const totalHours = filteredLogs.reduce((s, l) => (l.clock_out ? s + differenceInMinutes(parseISO(l.clock_out), parseISO(l.clock_in)) / 60 : s), 0);
  const pickedBy = (name) => orders.filter(o => o.picker_name === name && o.status !== 'SENT_TO_WAREHOUSE');

  const duration = (log) => {
    if (!log.clock_out) return 'פעיל';
    const mins = differenceInMinutes(parseISO(log.clock_out), parseISO(log.clock_in));
    return `${Math.floor(mins / 60)}ש' ${mins % 60}ד'`;
  };

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
          {/* List */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-700">רשימת מלקטים</h3>
            {pickers.map(p => {
              const onShift = !!openShiftOf(p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`cursor-pointer rounded-2xl border bg-white p-3 transition-all ${selectedId === p.id ? 'border-blue-500 shadow-md' : 'hover:border-blue-300'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold shrink-0 ${p.is_active === false ? 'bg-gray-100 text-gray-400' : 'bg-blue-100 text-blue-700'}`}>
                        {p.name?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">
                          {p.name}
                          {onShift && <Badge className="mr-2 bg-green-100 text-green-700 text-[10px]">במשמרת</Badge>}
                          {p.is_active === false && <span className="text-xs text-gray-400"> · לא פעיל</span>}
                        </p>
                        <p className="text-xs text-gray-500">
                          {p.phone ? `${p.phone} · ` : ''}{pickedBy(p.name).length} הזמנות לוקטו ·{' '}
                          {p.pin ? <span dir="ltr">קוד {p.pin}</span> : <span className="text-red-600 font-medium">אין קוד כניסה</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setManualFor(asEmployee(p))} className="p-2.5 hover:bg-blue-50 rounded-lg" title="הזנת שעות ידנית">
                        <ClipboardEdit className="w-4 h-4 text-blue-500" />
                      </button>
                      <button onClick={() => setEditing(p)} className="p-2.5 hover:bg-gray-100 rounded-lg"><Pencil className="w-4 h-4 text-gray-500" /></button>
                      <button onClick={() => { if (window.confirm(`למחוק את ${p.name}?`)) remove.mutate(p.id); }} className="p-2.5 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2" onClick={e => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={clock.isPending}
                      onClick={() => clock.mutate(p)}
                      className={`w-full h-10 gap-1.5 ${onShift ? 'border-red-300 text-red-600 hover:bg-red-50' : 'border-green-300 text-green-700 hover:bg-green-50'}`}
                    >
                      {onShift ? <><LogOut className="w-4 h-4" /> יציאה ממשמרת</> : <><LogIn className="w-4 h-4" /> כניסה למשמרת</>}
                    </Button>
                  </div>
                </div>
              );
            })}
            {pickers.length === 0 && <p className="text-center text-gray-400 py-8">אין מלקטים. לחץ על "מלקט חדש" להוספה.</p>}
          </div>

          {/* Details */}
          <div className="space-y-3">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {[
                { key: 'attendance', label: 'נוכחות', icon: Clock, active: 'text-blue-700' },
                { key: 'payments', label: 'תשלומים', icon: Wallet, active: 'text-green-700' },
                { key: 'orders', label: 'הזמנות', icon: ClipboardList, active: 'text-indigo-700' },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-sm font-medium transition-all ${tab === t.key ? `bg-white shadow ${t.active}` : 'text-gray-500 hover:text-gray-700'}`}>
                  <t.icon className="w-4 h-4" /> {t.label}
                </button>
              ))}
            </div>

            {!selected && <p className="text-center text-gray-400 py-10">בחר מלקט מהרשימה</p>}

            {selected && tab === 'attendance' && (
              <>
                <h3 className="font-semibold text-gray-700">לוג נוכחות — {selected.name}</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs flex items-center gap-1"><Calendar className="w-3 h-3" /> מ-</Label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full h-9 rounded border text-sm px-2" />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1"><Calendar className="w-3 h-3" /> עד</Label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full h-9 rounded border text-sm px-2" />
                  </div>
                </div>
                {filteredLogs.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 p-2 bg-blue-50 rounded-lg">
                    <div><p className="text-xs text-gray-600">סה"כ שעות</p><p className="text-lg font-bold text-blue-600">{totalHours.toFixed(1)}h</p></div>
                    <div><p className="text-xs text-gray-600">משמרות</p><p className="text-lg font-bold text-blue-600">{filteredLogs.length}</p></div>
                  </div>
                )}
                {filteredLogs.length === 0 && <p className="text-center text-gray-400 py-8">אין רשומות נוכחות בתקופה זו</p>}
                {filteredLogs.map(log => (
                  <Card key={log.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-sm flex items-center gap-2">
                          {log.date}
                          {log.manually_edited && <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">עודכן ידנית</Badge>}
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge className={log.clock_out ? 'bg-gray-200 text-gray-700' : 'bg-green-100 text-green-700'}>{duration(log)}</Badge>
                          <button onClick={() => setEditingLog(log)} className="p-1.5 hover:bg-blue-50 rounded-lg" title="עריכת משמרת">
                            <Pencil className="w-3.5 h-3.5 text-blue-500" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <div className="flex items-center gap-1"><LogIn className="w-3 h-3 text-green-500" />{log.clock_in ? format(parseISO(log.clock_in), 'HH:mm') : '-'}</div>
                        <div className="flex items-center gap-1"><LogOut className="w-3 h-3 text-red-500" />{log.clock_out ? format(parseISO(log.clock_out), 'HH:mm') : '-'}</div>
                      </div>
                      {log.notes && <p className="text-xs text-gray-500 mt-1">{log.notes}</p>}
                    </CardContent>
                  </Card>
                ))}
              </>
            )}

            {selected && tab === 'payments' && (
              <EmployeePaymentPanel employee={selected} attendanceLogs={selectedLogs} branchId={warehouse.id} />
            )}

            {selected && tab === 'orders' && (
              <>
                <h3 className="font-semibold text-gray-700">הזמנות שליקט {selected.name}</h3>
                {pickedBy(selected.name).length === 0 && <p className="text-center text-gray-400 py-8">עוד אין הזמנות</p>}
                {pickedBy(selected.name).map(o => {
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
              </>
            )}
          </div>
        </div>
      )}

      {editing && <PickerFormDialog picker={editing === 'new' ? null : editing} warehouse={warehouse} pickers={pickers} onClose={() => setEditing(null)} />}
      {manualFor && <ManualHoursDialog picker={manualFor} onClose={() => setManualFor(null)} onSaved={refreshLogs} />}
      <ShiftEditModal open={!!editingLog} log={editingLog} onClose={() => setEditingLog(null)} />
    </div>
  );
}

function PickerFormDialog({ picker, warehouse, pickers = [], onClose }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: picker?.name || '',
    phone: picker?.phone || '',
    hourly_rate: picker?.hourly_rate ?? '',
    is_active: picker ? picker.is_active !== false : true,
    pin: picker?.pin || '',
  });
  const pinTaken = form.pin.length === 4 && pickers.some(p => p.id !== picker?.id && p.pin === form.pin);
  const pinValid = /^\d{4}$/.test(form.pin) && !pinTaken;

  const save = useMutation({
    mutationFn: () => {
      const data = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        hourly_rate: form.hourly_rate === '' ? null : Number(form.hourly_rate),
        is_active: form.is_active,
        pin: form.pin,
      };
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
          <div>
            <Label>שכר לשעה (₪)</Label>
            <Input type="number" value={form.hourly_rate} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} placeholder="למשל: 45" className="h-11" />
            <p className="text-xs text-gray-400 mt-1">לפי שדה זה מחושב השכר המגיע למלקט והחוב אליו</p>
          </div>
          <div>
            <Label>קוד כניסה אישי (4 ספרות)</Label>
            <Input
              value={form.pin}
              onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              inputMode="numeric"
              placeholder="למשל: 4821"
              className={`h-11 text-center text-lg tracking-[0.5em] font-bold ${pinTaken ? 'border-red-400' : ''}`}
              dir="ltr"
            />
            <p className={`text-xs mt-1 ${pinTaken ? 'text-red-600' : 'text-gray-400'}`}>
              {pinTaken ? 'הקוד הזה כבר שייך למלקט אחר' : 'בקוד הזה המלקט נכנס לפורטל שלו מהמסך הראשי של המחסן'}
            </p>
          </div>
          <label className="flex items-center justify-between rounded-xl border p-3">
            <span className="text-sm">פעיל (מופיע בבחירת מלקט)</span>
            <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
          </label>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={!form.name.trim() || !pinValid || save.isPending} className="w-full h-11 bg-blue-600 hover:bg-blue-700">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualHoursDialog({ picker, onClose, onSaved }) {
  const { toast } = useToast();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [form, setForm] = useState({ date: today, start_time: '', end_time: '', notes: '' });

  const save = useMutation({
    mutationFn: () => base44.entities.AttendanceLog.create({
      employee_id: picker.id,
      employee_name: picker.name,
      clock_in: new Date(`${form.date}T${form.start_time}:00`).toISOString(),
      clock_out: new Date(`${form.date}T${form.end_time}:00`).toISOString(),
      date: form.date,
      notes: form.notes || 'הזנה ידנית',
      manually_edited: true,
      branch_id: picker.branch_id,
      station_email: picker.station_email,
      tenant_email: null,
    }),
    onSuccess: () => { onSaved(); toast({ title: 'השעות נרשמו' }); onClose(); },
    onError: (e) => toast({ title: 'שמירת השעות נכשלה', description: e?.message, variant: 'destructive' }),
  });

  const valid = form.date && form.start_time && form.end_time && form.end_time > form.start_time;

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardEdit className="w-5 h-5 text-blue-500" /> הזנת שעות ידנית — {picker.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>תאריך</Label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full h-10 rounded-md border px-3 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-1"><LogIn className="w-3 h-3 text-green-500" /> כניסה</Label>
              <input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="w-full h-10 rounded-md border px-3 text-sm" />
            </div>
            <div>
              <Label className="flex items-center gap-1"><LogOut className="w-3 h-3 text-red-500" /> יציאה</Label>
              <input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="w-full h-10 rounded-md border px-3 text-sm" />
            </div>
          </div>
          {form.start_time && form.end_time && form.end_time <= form.start_time && (
            <p className="text-xs text-red-500">שעת יציאה חייבת להיות אחרי שעת כניסה</p>
          )}
          <div>
            <Label>סיבה / הערה</Label>
            <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="למשל: שכח להיכנס למשמרת" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={!valid || save.isPending} className="w-full bg-blue-600 hover:bg-blue-700">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור שעות'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
