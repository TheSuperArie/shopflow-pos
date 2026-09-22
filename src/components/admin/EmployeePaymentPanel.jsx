import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PaymentFormModal from '@/components/admin/PaymentFormModal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Wallet, Banknote, Clock, Scale, Receipt, Pencil, Trash2 } from 'lucide-react';
import { parseISO, differenceInMinutes } from 'date-fns';
import EmployeeExpensesPanel from '@/components/admin/EmployeeExpensesPanel';

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
  const [editingPayment, setEditingPayment] = useState(null);
  const [month, setMonth] = useState(''); // '' = all time, else 'yyyy-MM'
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: payments = [] } = useQuery({
    queryKey: ['employee-payments', employee?.id],
    queryFn: () => base44.entities.EmployeePayment.filter({ employee_id: employee.id }, '-payment_date'),
    enabled: !!employee,
  });

  const { data: employeeExpenses = [] } = useQuery({
    queryKey: ['employee-expenses', employee?.id],
    queryFn: () => base44.entities.Expense.filter({ employee_id: employee.id }, '-date'),
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
  const filteredExpenses = useMemo(
    () => employeeExpenses.filter(e => inMonth(e.date)),
    [employeeExpenses, month]
  );
  const deductedExpenses = filteredExpenses
    .filter(e => e.deduct_from_debt !== false)
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  const nonDeductedExpenses = filteredExpenses
    .filter(e => e.deduct_from_debt === false)
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const totalPaid = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const balance = earned - totalPaid - deductedExpenses;

  const refreshPayments = () => {
    queryClient.invalidateQueries({ queryKey: ['employee-payments', employee.id] });
    queryClient.invalidateQueries({ queryKey: ['employee-expenses', employee.id] });
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
  };

  // Deleting a payment also removes the expense that mirrors it
  const deleteMutation = useMutation({
    mutationFn: async (payment) => {
      const linked = await base44.entities.Expense.filter({ employee_payment_id: payment.id });
      for (const exp of linked) await base44.entities.Expense.delete(exp.id);
      await base44.entities.EmployeePayment.delete(payment.id);
    },
    onSuccess: () => {
      refreshPayments();
      toast({ title: '🗑️ התשלום נמחק', duration: 2500 });
    },
    onError: (error) => toast({
      title: '❌ מחיקת התשלום נכשלה',
      description: error?.message || 'נסה שוב',
      variant: 'destructive',
      duration: 5000,
    }),
  });

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
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-3 text-center">
            <Receipt className="w-4 h-4 text-orange-500 mx-auto mb-1" />
            <p className="text-xs text-gray-500">הוצאות משוכללות</p>
            <p className="text-xl font-bold text-orange-600">₪{deductedExpenses.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              לא משוכללות: ₪{nonDeductedExpenses.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className={balance > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Scale className={`w-4 h-4 ${balance > 0 ? 'text-red-500' : 'text-gray-400'}`} /> יתרת חוב לעובד
            </span>
            <span className={`text-2xl font-bold ${balance > 0 ? 'text-red-600' : 'text-gray-600'}`}>
              ₪{balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            שכר מגיע ₪{earned.toLocaleString(undefined, { maximumFractionDigits: 0 })} − תשלומים ₪{totalPaid.toLocaleString()} − הוצאות משוכללות ₪{deductedExpenses.toLocaleString()}
          </p>
        </CardContent>
      </Card>

      <EmployeeExpensesPanel employee={employee} expenses={filteredExpenses} branchId={branchId} />

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
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">{payment.payment_date}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-blue-600"
                      onClick={() => setEditingPayment(payment)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-600"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`למחוק את התשלום על ₪${payment.amount}? ההוצאה המשויכת תימחק גם.`)) {
                          deleteMutation.mutate(payment);
                        }
                      }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                {payment.notes && <p className="text-xs text-gray-500 mt-1">{payment.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PaymentFormModal
        open={showAddPayment || !!editingPayment}
        employee={employee}
        branchId={branchId}
        payment={editingPayment}
        onClose={() => { setShowAddPayment(false); setEditingPayment(null); }}
        onSuccess={() => {
          refreshPayments();
          toast({ title: editingPayment ? '✅ התשלום עודכן' : '✅ תשלום נרשם ונרשם גם כהוצאה', duration: 2500 });
          setShowAddPayment(false);
          setEditingPayment(null);
        }}
        onError={(error) => toast({
          title: '❌ שמירת התשלום נכשלה',
          description: error?.message || 'נסה שוב',
          variant: 'destructive',
          duration: 5000,
        })}
      />
    </div>
  );
}