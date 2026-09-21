import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

/** Employee-attached expenses (portal withdrawals + manual advances) with per-expense debt toggle. */
export default function EmployeeExpensesPanel({ employee, expenses = [], branchId }) {
  const [showAdd, setShowAdd] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['employee-expenses'] });
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
  };

  const onError = (error) => toast({
    title: '❌ הפעולה נכשלה',
    description: error?.message || 'נסה שוב',
    variant: 'destructive',
    duration: 5000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, deduct }) => base44.entities.Expense.update(id, { deduct_from_debt: deduct }),
    onSuccess: refresh,
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Expense.delete(id),
    onSuccess: () => { refresh(); toast({ title: '🗑️ ההוצאה נמחקה', duration: 2000 }); },
    onError,
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
          <Receipt className="w-4 h-4" /> הוצאות העובד
        </h3>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1 bg-amber-500 hover:bg-amber-600 text-xs">
          <Plus className="w-3 h-3" /> הוצאה / מקדמה
        </Button>
      </div>

      {expenses.length === 0 ? (
        <p className="text-center text-gray-400 py-5 text-sm">אין הוצאות רשומות לעובד</p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {expenses.map(exp => {
            const deducted = exp.deduct_from_debt !== false;
            return (
              <Card key={exp.id} className="border-gray-200">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800">₪{(exp.amount || 0).toLocaleString()}</p>
                      <p className="text-xs text-gray-500 truncate">{exp.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-400">{exp.date}</span>
                      <button onClick={() => { if (window.confirm('למחוק את ההוצאה?')) deleteMutation.mutate(exp.id); }}
                        className="p-1.5 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t pt-2">
                    <span className={`text-xs ${deducted ? 'text-red-600' : 'text-gray-400'}`}>
                      {deducted ? 'משוכללת בחוב לעובד' : 'לא משוכללת בחוב'}
                    </span>
                    <Switch
                      checked={deducted}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: exp.id, deduct: v })}
                      disabled={toggleMutation.isPending}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddEmployeeExpenseModal
        open={showAdd}
        employee={employee}
        branchId={branchId}
        onClose={() => setShowAdd(false)}
        onSuccess={() => { refresh(); toast({ title: '✅ ההוצאה נרשמה', duration: 2000 }); setShowAdd(false); }}
        onError={onError}
      />
    </div>
  );
}

function AddEmployeeExpenseModal({ open, employee, branchId, onClose, onSuccess, onError }) {
  const [form, setForm] = useState({
    amount: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    deduct_from_debt: true,
  });

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.Expense.create({
      description: data.description || `מקדמה ל${employee.name}`,
      amount: parseFloat(data.amount),
      category: 'שכר עובדים',
      date: data.date,
      employee_id: employee.id,
      employee_name: employee.name,
      deduct_from_debt: data.deduct_from_debt,
      branch_id: employee.branch_id || branchId || null,
    }),
    onSuccess,
    onError,
  });

  const isValid = form.amount && parseFloat(form.amount) > 0 && form.date;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>הוצאה / מקדמה ל{employee?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>סכום (₪)</Label>
            <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" className="text-lg" />
          </div>
          <div>
            <Label>תיאור</Label>
            <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="למשל: מקדמה, כסף מהקופה" />
          </div>
          <div>
            <Label>תאריך</Label>
            <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <Label>לשכלל בחוב לעובד</Label>
              <p className="text-xs text-gray-400 mt-1">כבוי — ההוצאה לא תוריד מהחוב של החנות לעובד</p>
            </div>
            <Switch checked={form.deduct_from_debt} onCheckedChange={v => setForm({ ...form, deduct_from_debt: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate(form)} disabled={!isValid || mutation.isPending} className="w-full bg-amber-500 hover:bg-amber-600">
            {mutation.isPending ? 'שומר...' : 'שמור הוצאה'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}