import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Wallet, TrendingUp, Banknote, Clock } from 'lucide-react';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { useCurrentUser } from '@/hooks/useCurrentUser';

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

export default function EmployeePaymentPanel({ employee, attendanceLogs = [] }) {
  const [showAddPayment, setShowAddPayment] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = useCurrentUser();

  const { data: payments = [] } = useQuery({
    queryKey: ['employee-payments', employee?.id],
    queryFn: () => base44.entities.EmployeePayment.filter({ employee_id: employee.id }, '-payment_date'),
    enabled: !!employee,
  });

  // Calculate total hours from attendance logs (completed shifts only)
  const totalHours = attendanceLogs.reduce((sum, log) => {
    if (!log.clock_out) return sum;
    const mins = differenceInMinutes(parseISO(log.clock_out), parseISO(log.clock_in));
    return sum + mins / 60;
  }, 0);

  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalSalaryPayments = payments.filter(p => p.payment_type === 'משכורת').reduce((sum, p) => sum + p.amount, 0);
  const totalBonuses = payments.filter(p => p.payment_type !== 'משכורת').reduce((sum, p) => sum + p.amount, 0);

  if (!employee) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        בחר עובד לצפייה בפרטי תשלומים
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3 text-center">
            <Clock className="w-4 h-4 text-blue-500 mx-auto mb-1" />
            <p className="text-xs text-gray-500">שעות עבודה</p>
            <p className="text-xl font-bold text-blue-600">{totalHours.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-3 text-center">
            <Banknote className="w-4 h-4 text-green-500 mx-auto mb-1" />
            <p className="text-xs text-gray-500">סה"כ שולם</p>
            <p className="text-xl font-bold text-green-600">₪{totalPaid.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3 text-center">
            <TrendingUp className="w-4 h-4 text-amber-500 mx-auto mb-1" />
            <p className="text-xs text-gray-500">בונוסים</p>
            <p className="text-xl font-bold text-amber-600">₪{totalBonuses.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Add Payment Button */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
          <Wallet className="w-4 h-4" /> היסטוריית תשלומים
        </h3>
        <Button size="sm" onClick={() => setShowAddPayment(true)} className="gap-1 bg-green-600 hover:bg-green-700 text-xs">
          <Plus className="w-3 h-3" /> תשלום חדש
        </Button>
      </div>

      {/* Payments Table */}
      {payments.length === 0 ? (
        <p className="text-center text-gray-400 py-6 text-sm">אין תשלומים רשומים</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {payments.map(payment => (
            <Card key={payment.id} className="border-gray-200">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
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
                {payment.notes && (
                  <p className="text-xs text-gray-500 mt-1">{payment.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddPaymentModal
        open={showAddPayment}
        employee={employee}
        onClose={() => setShowAddPayment(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['employee-payments', employee.id] });
          toast({ title: '✅ תשלום נרשם', duration: 2000 });
          setShowAddPayment(false);
        }}
      />
    </div>
  );
}

function AddPaymentModal({ open, employee, onClose, onSuccess }) {
  const [form, setForm] = useState({
    amount: '',
    payment_method: 'מזומן',
    payment_type: 'משכורת',
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  });

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.EmployeePayment.create({
      ...data,
      employee_id: employee.id,
      employee_name: employee.name,
      amount: parseFloat(data.amount),
    }),
    onSuccess,
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