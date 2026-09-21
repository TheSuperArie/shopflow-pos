import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Wallet, Banknote, Clock, Scale } from 'lucide-react';
import { format, parseISO, differenceInMinutes } from 'date-fns';

const METHOD_COLORS = {
  'מזומן': 'bg-green-100 text-green-700',
  'העברה בנקאית': 'bg-blue-100 text-blue-700',
  "צ'ק": 'bg-purple-100 text-purple-700',
  'אחר': 'bg-gray-100 text-gray-700',
};

const TYPE_COLORS = {
  'משכורת': 'bg-amber-100 text-amber-700',
  'בונוס': 'bg-pink-100 text-pink-700',
  'עמלה': 'bg-teal-100 text-teal-700',
  'אחר': 'bg-gray-100 text-gray-700',
};

export default function EmployeePaymentPanel({ employee, attendanceLogs = [], branchId }) {
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [month, setMonth] = useState(''); // '' = all time, else 'yyyy-MM'
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: payments = [] } = useQuery({
    queryKey: ['employee-payments', employee?.id],
    queryFn: () => base44.entities.EmployeePayment.filter({ employee_id: employee.id }, '-payment_date'),
    enabled: !!employee,
  });

  const inMonth = (dateStr) => !month || (dateStr || '').startsWith(month);

  const filteredLogs = useMemo(
    () => attendanceLogs.filter(l => inMonth(l.date)),
    [attendanceLogs, month]
  );
  const filteredPayments = useMemo(
    () => payments.filter(p => inMonth(p.payment_date)),
    [payments, month]
  );

  const totalHours = filteredLogs.reduce((sum, log) => {
    if (!log.clock_out) return sum;
    return sum + differenceInMinutes(parseISO(log.clock_out), parseISO(log.clock_in)) / 60;
  }, 0);

  const hourlyRate = employee?.hourly_rate || 0;
  const earned = totalHours * hourlyRate;
  const totalPaid = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const balance = earned - totalPaid;

  if (!employee) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        בחר עובד לצפייה בפרטי תשלומים
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-xs">חודש</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-9" />
        </div>
        {month && (
          <Button variant="outline" size="sm" onClick={() => setMonth('')}>הצג הכל</Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3 text-center">
            <Clock className="w-4 h-4 text-blue-500 mx-auto mb-1" />
            <p className="text-xs text-gray-500">שעות עבודה</p>
            <p className="text-xl font-bold text-blue-600">{totalHours.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3 text-center">
            <Wallet className="w-4 h-4 text-amber-500 mx-auto mb-1" />
            <p className="text-xs text-gray-500">שכר מגיע</p>
            <p className="text-xl font-bold text-amber-600">₪{earned.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {hourlyRate ? `₪${hourlyRate} לשעה` : 'לא הוגדר שכר לשעה'}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-3 text-center">
            <Banknote className="w-4 h-4 text-green-500 mx-auto mb-1" />
            <p className="text-xs text-gray-500">סה"כ שולם</p>
            <p className="text-xl font-bold text-green-600">₪{totalPaid.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className={balance > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}>
          <CardContent className="p-3 text-center">
            <Scale className={`w-4 h-4 mx-auto mb-1 ${balance > 0 ? 'text-red-500' : 'text-gray-400'}`} />
            <p className="text-xs text-gray-500">יתרת חוב לעובד</p>
            <p className={`text-xl font-bold ${balance > 0 ? 'text-red-600' : 'text-gray-600'}`}>
              ₪{balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
          <Wallet className="w-4 h-4" /> היסטוריית תשלומים
        </h3>
        <Button size="sm" onClick={() => setShowAddPayment(true)} className="gap-1 bg-green-600 hover:bg-green-700 text-xs">
          <Plus className="w-3 h-3" /> תשלום חדש
        </Button>
      </div>

      {filteredPayments.length === 0 ? (
        <p className="text-center text-gray-400 py-6 text-sm">אין תשלומים רשומים</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filteredPayments.map(payment => (
            <Card key={payment.id} className="border-gray-200">
              <CardContent className="p-3">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800">₪{payment.amount.toLocaleString()}</span>
                    <Badge className={`text-xs ${TYPE_COLORS[payment.payment_type] || ''}`}>
                      {payment.payment_type}
                    </Badge>
                    <Badge className={`text-xs ${METHOD_COLORS[payment.payment_method] || ''}`}>
                      {payment.payment_method}
                    </Badge>
                  </div>
                  <span className="text-xs text-gray-500">{payment.payment_date}</span>
                </div>
                {payment.notes && <p className="text-xs text-gray-500 mt-1">{payment.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddPaymentModal
        open={showAddPayment}
        employee={employee}
        branchId={branchId}
        onClose={() => setShowAddPayment(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['employee-payments', employee.id] });
          queryClient.invalidateQueries({ queryKey: ['expenses'] });
          toast({ title: '✅ תשלום נרשם ונרשם גם כהוצאה', duration: 2500 });
          setShowAddPayment(false);
        }}
        onError={(error) => toast({
          title: '❌ רישום התשלום נכשל',
          description: error?.message || 'נסה שוב',
          variant: 'destructive',
          duration: 5000,
        })}
      />
    </div>
  );
}

function AddPaymentModal({ open, employee, branchId, onClose, onSuccess, onError }) {
  const [form, setForm] = useState({
    amount: '',
    payment_method: 'מזומן',
    payment_type: 'משכורת',
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  });

  const mutation = useMutation({
    mutationFn: async (data) => {
      const amount = parseFloat(data.amount);
      const payment = await base44.entities.EmployeePayment.create({
        ...data,
        employee_id: employee.id,
        employee_name: employee.name,
        amount,
      });
      // Mirror the payment as a branch expense so it shows in expense reports
      await base44.entities.Expense.create({
        description: `תשלום לעובד ${employee.name}${data.notes ? ` — ${data.notes}` : ''}`,
        amount,
        category: 'שכר עובדים',
        date: data.payment_date,
        branch_id: employee.branch_id || branchId || null,
      });
      return payment;
    },
    onSuccess,
    onError,
  });

  const isValid = form.amount && parseFloat(form.amount) > 0 && form.payment_date;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>תשלום ל{employee?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>סכום (₪)</Label>
            <Input
              type="number"
              value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
              className="text-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>סוג תשלום</Label>
              <Select value={form.payment_type} onValueChange={v => setForm({ ...form, payment_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="משכורת">משכורת</SelectItem>
                  <SelectItem value="בונוס">בונוס</SelectItem>
                  <SelectItem value="עמלה">עמלה</SelectItem>
                  <SelectItem value="אחר">אחר</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>אמצעי תשלום</Label>
              <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="מזומן">מזומן</SelectItem>
                  <SelectItem value="העברה בנקאית">העברה בנקאית</SelectItem>
                  <SelectItem value="צ'ק">צ'ק</SelectItem>
                  <SelectItem value="אחר">אחר</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>תאריך</Label>
            <Input
              type="date"
              value={form.payment_date}
              onChange={e => setForm({ ...form, payment_date: e.target.value })}
            />
          </div>
          <div>
            <Label>הערות (אופציונלי)</Label>
            <Input
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="למשל: משכורת חודש מרץ"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => mutation.mutate(form)}
            disabled={!isValid || mutation.isPending}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            {mutation.isPending ? 'שומר...' : 'שמור תשלום'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}