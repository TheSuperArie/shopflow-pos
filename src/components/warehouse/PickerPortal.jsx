import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { LogIn, LogOut, Receipt, Loader2, Clock, X, Wallet } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { parseServerDate } from '@/lib/serverDate';

const IDLE_MS = 3 * 60 * 1000;
const EMPTY_EXPENSE = { amount: '', description: '', category: 'הוצאה אישית', payment_method: 'מזומן' };

/**
 * A picker's own screen (entered with his 4-digit code from the warehouse home):
 * clock in / out, record a personal expense, see his recent shifts and expenses.
 * Everything is stamped with the warehouse id only — never with the network.
 * Leaves automatically after 3 idle minutes (shared device).
 */
export default function PickerPortal({ warehouse, picker, onExit }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expense, setExpense] = useState(EMPTY_EXPENSE);
  const [showExpense, setShowExpense] = useState(false);

  // Auto sign-out when idle
  useEffect(() => {
    let timer = setTimeout(onExit, IDLE_MS);
    const reset = () => { clearTimeout(timer); timer = setTimeout(onExit, IDLE_MS); };
    const events = ['pointerdown', 'keydown'];
    events.forEach(e => window.addEventListener(e, reset));
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)); };
  }, [onExit]);

  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['picker-portal-logs', picker.id],
    queryFn: () => base44.entities.AttendanceLog.filter({ employee_id: picker.id }, '-clock_in', 20),
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ['picker-portal-expenses', picker.id],
    queryFn: () => base44.entities.Expense.filter({ employee_id: picker.id }, '-created_date', 15),
  });

  const openShift = logs.find(l => !l.clock_out);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['picker-portal-logs', picker.id] });
    queryClient.invalidateQueries({ queryKey: ['picker-portal-expenses', picker.id] });
    queryClient.invalidateQueries({ queryKey: ['attendance-logs'] });
    queryClient.invalidateQueries({ queryKey: ['warehouse-expenses', warehouse.id] });
  };

  const clock = useMutation({
    mutationFn: async () => {
      // Re-check right before writing — another device may have clocked him in/out meanwhile
      const fresh = await base44.entities.AttendanceLog.filter({ employee_id: picker.id }, '-clock_in', 5);
      const open = fresh.find(l => !l.clock_out);
      if (open) {
        await base44.entities.AttendanceLog.update(open.id, { clock_out: new Date().toISOString() });
        return 'out';
      }
      await base44.entities.AttendanceLog.create({
        employee_id: picker.id,
        employee_name: picker.name,
        clock_in: new Date().toISOString(),
        date: format(new Date(), 'yyyy-MM-dd'),
        branch_id: warehouse.id,
        station_email: warehouse.station_email,
        tenant_email: null,
      });
      return 'in';
    },
    onSuccess: (dir) => {
      refresh();
      toast({ title: dir === 'in' ? `✅ ${picker.name} — כניסה למשמרת נרשמה` : `✅ ${picker.name} — יציאה ממשמרת נרשמה`, duration: 2500 });
    },
    onError: (e) => toast({ title: 'הרישום נכשל', description: e?.message || 'נסה שוב', variant: 'destructive' }),
  });

  const addExpense = useMutation({
    mutationFn: () => base44.entities.Expense.create({
      description: `${expense.description.trim() || expense.category} (${picker.name})`,
      amount: Number(expense.amount),
      category: 'שכר עובדים',
      custom_category: expense.category,
      expense_type: 'חד פעמית',
      date: format(new Date(), 'yyyy-MM-dd'),
      notes: `מחסן · שיטת תשלום: ${expense.payment_method}`,
      employee_id: picker.id,
      employee_name: picker.name,
      deduct_from_debt: true,
      branch_id: warehouse.id,
      station_email: warehouse.station_email,
      tenant_email: null,
    }),
    onSuccess: () => {
      refresh();
      setExpense(EMPTY_EXPENSE);
      setShowExpense(false);
      toast({ title: '✅ ההוצאה נרשמה', duration: 2000 });
    },
    onError: (e) => toast({ title: 'רישום ההוצאה נכשל', description: e?.message || 'נסה שוב', variant: 'destructive' }),
  });

  const amountValid = Number(expense.amount) > 0;
  const dur = (log) => {
    const start = parseServerDate(log.clock_in);
    const end = log.clock_out ? parseServerDate(log.clock_out) : new Date();
    if (!start || !end) return '';
    const mins = Math.max(0, differenceInMinutes(end, start));
    return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
  };
  const time = (v) => { const d = parseServerDate(v); return d ? format(d, 'HH:mm') : ''; };
  const day = (v) => { const d = parseServerDate(v); return d ? format(d, 'dd/MM') : ''; };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Who */}
      <div className="rounded-2xl border bg-white p-4 flex items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-2xl font-bold">{picker.name?.[0]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xl font-bold text-gray-900 truncate">שלום, {picker.name}</p>
          <p className={`text-sm ${openShift ? 'text-green-700' : 'text-gray-500'}`}>
            {loadingLogs ? '...' : openShift ? `במשמרת מ-${time(openShift.clock_in)} (${dur(openShift)} שעות)` : 'לא במשמרת'}
          </p>
        </div>
        <Button variant="outline" onClick={onExit} className="h-11 gap-1.5"><X className="w-4 h-4" /> יציאה מהחשבון</Button>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => clock.mutate()}
          disabled={clock.isPending || loadingLogs}
          className={`rounded-2xl p-5 flex flex-col items-center gap-2 text-white text-lg font-bold shadow-sm disabled:opacity-60 ${openShift ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'}`}
        >
          {clock.isPending ? <Loader2 className="w-8 h-8 animate-spin" /> : openShift ? <LogOut className="w-8 h-8" /> : <LogIn className="w-8 h-8" />}
          {openShift ? 'יציאה ממשמרת' : 'כניסה למשמרת'}
        </button>
        <button
          onClick={() => setShowExpense(s => !s)}
          className={`rounded-2xl p-5 flex flex-col items-center gap-2 text-lg font-bold border-2 ${showExpense ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-gray-200 bg-white text-gray-700 hover:border-amber-400'}`}
        >
          <Receipt className="w-8 h-8" /> רישום הוצאה
        </button>
      </div>

      {showExpense && (
        <div className="rounded-2xl border-2 border-amber-300 bg-white p-4 space-y-3">
          <p className="text-sm text-gray-500">הוצאה אישית שלך כמלקט — תופיע בדף הניהול של המחסן</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>סכום (₪)</Label>
              <Input type="number" inputMode="decimal" min={0} value={expense.amount} onChange={e => setExpense({ ...expense, amount: e.target.value })} className="h-12 text-lg font-bold text-center" autoFocus />
            </div>
            <div>
              <Label>סוג</Label>
              <select value={expense.category} onChange={e => setExpense({ ...expense, category: e.target.value })} className="w-full h-12 rounded-md border border-input bg-white px-3">
                <option value="הוצאה אישית">הוצאה אישית</option>
                <option value="שק קטן">שק קטן</option>
                <option value="חומרי צריכה">חומרי צריכה</option>
                <option value="אחר">אחר</option>
              </select>
            </div>
          </div>
          <div>
            <Label>תיאור</Label>
            <Input value={expense.description} onChange={e => setExpense({ ...expense, description: e.target.value })} placeholder="למשל: דלק, אוכל..." className="h-11" />
          </div>
          <div>
            <Label>אמצעי תשלום</Label>
            <div className="flex gap-2">
              {['מזומן', 'אשראי', 'העברה בנקאית'].map(m => (
                <button key={m} onClick={() => setExpense({ ...expense, payment_method: m })}
                  className={`flex-1 h-11 rounded-xl border text-sm font-medium ${expense.payment_method === m ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={() => addExpense.mutate()} disabled={!amountValid || addExpense.isPending} className="w-full h-12 text-base bg-amber-500 hover:bg-amber-600">
            {addExpense.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'שמור הוצאה'}
          </Button>
        </div>
      )}

      {/* History */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-4">
          <p className="font-semibold text-gray-700 flex items-center gap-2 mb-2"><Clock className="w-4 h-4" /> המשמרות האחרונות</p>
          {logs.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">אין משמרות</p> : (
            <div className="divide-y text-sm">
              {logs.slice(0, 8).map(l => (
                <div key={l.id} className="flex justify-between py-1.5">
                  <span className="text-gray-600">{day(l.clock_in)} · {time(l.clock_in)}–{l.clock_out ? time(l.clock_out) : 'עכשיו'}</span>
                  <span className="font-semibold text-gray-800">{dur(l)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <p className="font-semibold text-gray-700 flex items-center gap-2 mb-2"><Wallet className="w-4 h-4" /> ההוצאות האחרונות</p>
          {expenses.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">אין הוצאות</p> : (
            <div className="divide-y text-sm">
              {expenses.slice(0, 8).map(e => (
                <div key={e.id} className="flex justify-between gap-2 py-1.5">
                  <span className="text-gray-600 truncate">{e.date ? format(new Date(e.date), 'dd/MM') : ''} · {e.custom_category || e.description}</span>
                  <span className="font-semibold text-gray-800 shrink-0">₪{Number(e.amount || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
