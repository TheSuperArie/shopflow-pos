import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { ArrowRight, UsersRound, Wallet, Settings, Loader2, Trash2, Plus, KeyRound, Save } from 'lucide-react';
import { format } from 'date-fns';
import WarehousePickersPanel from '@/components/supply/WarehousePickersPanel';

export const DEFAULT_WAREHOUSE_CODE = '1234';

/** The warehouse's management page (behind the manager code): pickers, expenses, settings. */
export default function WarehouseAdmin({ warehouse, orders, onExit }) {
  const [tab, setTab] = useState('pickers');
  const tabs = [
    { key: 'pickers', label: 'מלקטים', icon: UsersRound },
    { key: 'expenses', label: 'הוצאות', icon: Wallet },
    { key: 'settings', label: 'הגדרות', icon: Settings },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">ניהול המחסן</h1>
          <p className="text-sm text-gray-500">{warehouse.name}</p>
        </div>
        <Button variant="outline" onClick={onExit} className="h-11 gap-1.5"><ArrowRight className="w-4 h-4" /> חזרה להזמנות</Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex flex-col sm:flex-row items-center justify-center gap-2 rounded-2xl border-2 px-3 py-4 font-semibold transition-colors ${
              tab === key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
            }`}>
            <Icon className="w-6 h-6" /> {label}
          </button>
        ))}
      </div>

      {tab === 'pickers' && <WarehousePickersPanel warehouse={warehouse} orders={orders} />}
      {tab === 'expenses' && <WarehouseExpenses warehouse={warehouse} />}
      {tab === 'settings' && <WarehouseSettings warehouse={warehouse} />}
    </div>
  );
}

const paymentOf = (e) => (String(e.notes || '').match(/שיטת תשלום:\s*([^|·]+)/)?.[1] || '').trim();

function WarehouseExpenses({ warehouse }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ amount: '', description: '', date: format(new Date(), 'yyyy-MM-dd') });

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['warehouse-expenses', warehouse.id],
    queryFn: () => base44.entities.Expense.filter({ branch_id: warehouse.id }, '-date', 1000),
  });

  const shown = useMemo(() => expenses.filter(e => !month || String(e.date || '').startsWith(month)), [expenses, month]);
  const total = shown.reduce((s, e) => s + Number(e.amount || 0), 0);
  const byPicker = useMemo(() => {
    const m = new Map();
    shown.forEach(e => {
      const k = e.employee_name || 'הוצאות המחסן';
      m.set(k, (m.get(k) || 0) + Number(e.amount || 0));
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [shown]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['warehouse-expenses', warehouse.id] });
    queryClient.invalidateQueries({ queryKey: ['picker-portal-expenses'] });
  };

  const remove = useMutation({
    mutationFn: (id) => base44.entities.Expense.delete(id),
    onSuccess: () => { invalidate(); toast({ title: 'ההוצאה נמחקה' }); },
    onError: (e) => toast({ title: 'המחיקה נכשלה', description: e?.message, variant: 'destructive' }),
  });

  const add = useMutation({
    mutationFn: () => base44.entities.Expense.create({
      description: form.description.trim() || 'הוצאת מחסן',
      amount: Number(form.amount),
      category: 'אחר',
      custom_category: 'הוצאת מחסן',
      expense_type: 'חד פעמית',
      date: form.date,
      branch_id: warehouse.id,
      station_email: warehouse.station_email,
      tenant_email: null,
    }),
    onSuccess: () => {
      invalidate();
      setForm({ amount: '', description: '', date: format(new Date(), 'yyyy-MM-dd') });
      setAdding(false);
      toast({ title: 'ההוצאה נוספה' });
    },
    onError: (e) => toast({ title: 'השמירה נכשלה', description: e?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <Label className="text-xs text-gray-500">חודש</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-10 w-44" />
        </div>
        <div className="rounded-2xl bg-white border px-4 py-2">
          <p className="text-xs text-gray-500">סה"כ הוצאות בחודש</p>
          <p className="text-2xl font-bold text-gray-900">₪{total.toLocaleString()}</p>
        </div>
        <Button onClick={() => setAdding(a => !a)} className="mr-auto h-11 gap-1.5 bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4" /> הוצאת מחסן
        </Button>
      </div>

      {adding && (
        <div className="rounded-2xl border-2 border-blue-200 bg-white p-4 grid gap-3 sm:grid-cols-[120px_1fr_160px_auto] items-end">
          <div><Label>סכום (₪)</Label><Input type="number" min={0} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="h-11" autoFocus /></div>
          <div><Label>תיאור</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="למשל: חומרי אריזה" className="h-11" /></div>
          <div><Label>תאריך</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="h-11" /></div>
          <Button onClick={() => add.mutate()} disabled={!(Number(form.amount) > 0) || add.isPending} className="h-11 bg-blue-600 hover:bg-blue-700">
            {add.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
          </Button>
        </div>
      )}

      {byPicker.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byPicker.map(([name, sum]) => (
            <span key={name} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">{name}: <strong>₪{sum.toLocaleString()}</strong></span>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-500" /></div>
      ) : shown.length === 0 ? (
        <div className="py-12 text-center text-gray-400 rounded-2xl border bg-white">אין הוצאות בחודש הזה</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2.5 text-right font-medium">תאריך</th>
                <th className="px-3 py-2.5 text-right font-medium">מלקט</th>
                <th className="px-3 py-2.5 text-right font-medium">סוג</th>
                <th className="px-3 py-2.5 text-right font-medium">תיאור</th>
                <th className="px-3 py-2.5 text-right font-medium">תשלום</th>
                <th className="px-3 py-2.5 text-right font-medium">סכום</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map(e => (
                <tr key={e.id}>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{e.date ? format(new Date(e.date), 'dd/MM/yy') : ''}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">{e.employee_name || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{e.custom_category || e.category}</td>
                  <td className="px-3 py-2 text-gray-600">{e.description}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">{paymentOf(e) || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-bold text-gray-900">₪{Number(e.amount || 0).toLocaleString()}</td>
                  <td className="px-2 py-2">
                    <button onClick={() => { if (window.confirm('למחוק את ההוצאה?')) remove.mutate(e.id); }} className="p-1.5 text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400">הוצאות שמלקט רשם בפורטל שלו מופיעות גם אצלו בלשונית "תשלומים" בדף המלקטים, ומשוכללות בחוב שלו.</p>
    </div>
  );
}

function WarehouseSettings({ warehouse }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    address: warehouse.address || '',
    manager_name: warehouse.manager_name || '',
    manager_phone: warehouse.manager_phone || '',
  });
  const [code, setCode] = useState({ current: '', next: '', confirm: '' });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['my-warehouse'] });

  const saveDetails = useMutation({
    mutationFn: () => base44.entities.Warehouse.update(warehouse.id, {
      address: form.address.trim(),
      manager_name: form.manager_name.trim(),
      manager_phone: form.manager_phone.trim(),
    }),
    onSuccess: () => { refresh(); toast({ title: 'הפרטים נשמרו' }); },
    onError: (e) => toast({ title: 'השמירה נכשלה', description: e?.message, variant: 'destructive' }),
  });

  const currentCode = warehouse.admin_code || DEFAULT_WAREHOUSE_CODE;
  const codeError =
    code.current && code.current !== currentCode ? 'הקוד הנוכחי שגוי'
      : code.next && !/^\d{4}$/.test(code.next) ? 'הקוד החדש חייב להיות 4 ספרות'
        : code.confirm && code.confirm !== code.next ? 'האימות לא תואם לקוד החדש'
          : '';
  const codeReady = code.current === currentCode && /^\d{4}$/.test(code.next) && code.confirm === code.next;

  const saveCode = useMutation({
    mutationFn: () => base44.entities.Warehouse.update(warehouse.id, { admin_code: code.next }),
    onSuccess: () => { refresh(); setCode({ current: '', next: '', confirm: '' }); toast({ title: 'קוד הניהול עודכן' }); },
    onError: (e) => toast({ title: 'העדכון נכשל', description: e?.message, variant: 'destructive' }),
  });

  const digits = (v) => v.replace(/\D/g, '').slice(0, 4);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <h3 className="font-bold text-gray-800">פרטי המחסן</h3>
        <div>
          <Label>שם המחסן</Label>
          <Input value={warehouse.name} disabled className="h-11 bg-gray-50" />
          <p className="text-xs text-gray-400 mt-1">השם נקבע ע"י הרשת</p>
        </div>
        <div><Label>כתובת</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="h-11" /></div>
        <div><Label>שם מנהל המחסן</Label><Input value={form.manager_name} onChange={e => setForm({ ...form, manager_name: e.target.value })} className="h-11" /></div>
        <div><Label>טלפון מנהל המחסן</Label><Input value={form.manager_phone} onChange={e => setForm({ ...form, manager_phone: e.target.value })} className="h-11" dir="ltr" /></div>
        <Button onClick={() => saveDetails.mutate()} disabled={saveDetails.isPending} className="w-full h-11 gap-1.5 bg-blue-600 hover:bg-blue-700">
          {saveDetails.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} שמור פרטים
        </Button>
      </div>

      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <h3 className="font-bold text-gray-800 flex items-center gap-2"><KeyRound className="w-5 h-5" /> קוד כניסה לדף הניהול</h3>
        {!warehouse.admin_code && (
          <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            הקוד כרגע הוא קוד ברירת המחדל (1234) — מומלץ להחליף.
          </p>
        )}
        {[
          { k: 'current', l: 'קוד נוכחי' },
          { k: 'next', l: 'קוד חדש (4 ספרות)' },
          { k: 'confirm', l: 'אימות הקוד החדש' },
        ].map(f => (
          <div key={f.k}>
            <Label>{f.l}</Label>
            <Input type="password" inputMode="numeric" value={code[f.k]} onChange={e => setCode({ ...code, [f.k]: digits(e.target.value) })}
              className="h-11 text-center text-lg tracking-[0.5em]" dir="ltr" />
          </div>
        ))}
        <p className={`text-sm h-5 ${codeError ? 'text-red-600' : 'text-transparent'}`}>{codeError || '.'}</p>
        <Button onClick={() => saveCode.mutate()} disabled={!codeReady || saveCode.isPending} className="w-full h-11 bg-gray-900 hover:bg-gray-800">
          {saveCode.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'עדכן קוד'}
        </Button>
        <p className="text-xs text-gray-400">קודי הכניסה של המלקטים נקבעים בלשונית "מלקטים", בעריכת כל מלקט.</p>
      </div>
    </div>
  );
}
