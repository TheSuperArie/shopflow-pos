import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

const EMPTY = (employee) => ({
  amount: '',
  payment_method: 'מזומן',
  payment_type: 'משכורת',
  payment_date: format(new Date(), 'yyyy-MM-dd'),
  notes: '',
});

const expenseDescription = (employee, notes) =>
  `תשלום לעובד ${employee.name}${notes ? ` — ${notes}` : ''}`;

/** Creates or edits an employee payment, keeping the mirrored expense in sync. */
export default function PaymentFormModal({ open, employee, branchId, payment, onClose, onSuccess, onError }) {
  const [form, setForm] = useState(EMPTY(employee));

  useEffect(() => {
    if (!open) return;
    setForm(payment ? {
      amount: String(payment.amount ?? ''),
      payment_method: payment.payment_method || 'מזומן',
      payment_type: payment.payment_type || 'משכורת',
      payment_date: payment.payment_date || format(new Date(), 'yyyy-MM-dd'),
      notes: payment.notes || '',
    } : EMPTY(employee));
  }, [open, payment, employee]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      const amount = parseFloat(data.amount);

      if (payment) {
        const updated = await base44.entities.EmployeePayment.update(payment.id, { ...data, amount });
        const linked = await base44.entities.Expense.filter({ employee_payment_id: payment.id });
        for (const exp of linked) {
          await base44.entities.Expense.update(exp.id, {
            description: expenseDescription(employee, data.notes),
            amount,
            date: data.payment_date,
          });
        }
        return updated;
      }

      const created = await base44.entities.EmployeePayment.create({
        ...data,
        employee_id: employee.id,
        employee_name: employee.name,
        amount,
        // Ownership follows the employee's own stamp
        branch_id: employee.branch_id || branchId || null,
        station_email: employee.station_email || null,
        tenant_email: employee.tenant_email || null,
      });
      // Mirror the payment as a branch expense so it shows in expense reports
      await base44.entities.Expense.create({
        description: expenseDescription(employee, data.notes),
        amount,
        category: 'שכר עובדים',
        date: data.payment_date,
        employee_payment_id: created.id,
        branch_id: employee.branch_id || branchId || null,
      });
      return created;
    },
    onSuccess,
    onError,
  });

  const isValid = form.amount && parseFloat(form.amount) > 0 && form.payment_date;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{payment ? 'עריכת תשלום' : `תשלום ל${employee?.name}`}</DialogTitle>
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
            {mutation.isPending ? 'שומר...' : payment ? 'שמור שינויים' : 'שמור תשלום'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}