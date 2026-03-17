import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, Loader2, Users, Clock, LogIn, LogOut, Calendar } from 'lucide-react';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export default function AdminEmployees() {
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = useCurrentUser();

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees', user?.email],
    queryFn: () => user ? base44.entities.Employee.filter({ created_by: user.email }) : [],
    enabled: !!user,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['attendance-logs', user?.email],
    queryFn: () => user ? base44.entities.AttendanceLog.filter({ created_by: user.email }, '-clock_in') : [],
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Employee.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: '🗑️ העובד נמחק', duration: 2000 });
    },
  });

  const employeeLogs = selectedEmployee
    ? logs.filter(l => l.employee_id === selectedEmployee.id)
    : [];

  const calcDuration = (log) => {
    if (!log.clock_out) return 'פעיל';
    const mins = differenceInMinutes(parseISO(log.clock_out), parseISO(log.clock_in));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}ש' ${m}ד'`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Users className="w-6 h-6" /> ניהול עובדים
        </h1>
        <Button onClick={() => { setEditingEmployee(null); setShowForm(true); }} className="gap-2 bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4" /> עובד חדש
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Employees list */}
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-700">רשימת עובדים</h2>
            {employees.map(emp => (
              <Card
                key={emp.id}
                className={`cursor-pointer transition-all ${selectedEmployee?.id === emp.id ? 'border-blue-500 shadow-md' : ''}`}
                onClick={() => setSelectedEmployee(emp)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700">
                      {emp.name[0]}
                    </div>
                    <div>
                      <p className="font-semibold">{emp.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-xs">{emp.role}</Badge>
                        {emp.phone && <span className="text-xs text-gray-500">{emp.phone}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setEditingEmployee(emp); setShowForm(true); }}
                      className="p-2 hover:bg-gray-100 rounded-lg">
                      <Pencil className="w-4 h-4 text-gray-500" />
                    </button>
                    <button onClick={() => { if (window.confirm('למחוק?')) deleteMutation.mutate(emp.id); }}
                      className="p-2 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {employees.length === 0 && (
              <p className="text-center text-gray-400 py-8">אין עובדים. לחץ על "עובד חדש" להוספה.</p>
            )}
          </div>

          {/* Attendance log for selected employee */}
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-700">
              {selectedEmployee ? `לוג נוכחות - ${selectedEmployee.name}` : 'בחר עובד לצפייה בלוג'}
            </h2>
            {selectedEmployee && employeeLogs.length === 0 && (
              <p className="text-center text-gray-400 py-8">אין רשומות נוכחות</p>
            )}
            {employeeLogs.map(log => (
              <Card key={log.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">{log.date}</span>
                    <Badge className={log.clock_out ? 'bg-gray-200 text-gray-700' : 'bg-green-100 text-green-700'}>
                      {calcDuration(log)}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <div className="flex items-center gap-1">
                      <LogIn className="w-3 h-3 text-green-500" />
                      {log.clock_in ? format(parseISO(log.clock_in), 'HH:mm') : '-'}
                    </div>
                    <div className="flex items-center gap-1">
                      <LogOut className="w-3 h-3 text-red-500" />
                      {log.clock_out ? format(parseISO(log.clock_out), 'HH:mm') : '-'}
                    </div>
                    {log.opening_cash !== undefined && (
                      <div>פתיחה: ₪{log.opening_cash}</div>
                    )}
                    {log.closing_cash !== undefined && (
                      <div>סגירה: ₪{log.closing_cash}</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <EmployeeFormModal
        open={showForm}
        employee={editingEmployee}
        onClose={() => setShowForm(false)}
        queryClient={queryClient}
        toast={toast}
      />
    </div>
  );
}

function EmployeeFormModal({ open, employee, onClose, queryClient, toast }) {
  const [form, setForm] = useState({ name: '', pin: '', phone: '', role: 'קופאי', is_active: true });

  React.useEffect(() => {
    if (employee) {
      setForm({ name: employee.name, pin: employee.pin, phone: employee.phone || '', role: employee.role || 'קופאי', is_active: employee.is_active !== false });
    } else {
      setForm({ name: '', pin: '', phone: '', role: 'קופאי', is_active: true });
    }
  }, [employee, open]);

  const mutation = useMutation({
    mutationFn: (data) =>
      employee ? base44.entities.Employee.update(employee.id, data) : base44.entities.Employee.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: employee ? '✅ העובד עודכן' : '✅ העובד נוסף', duration: 2000 });
      onClose();
    },
  });

  const isValid = form.name && form.pin.length === 4 && /^\d{4}$/.test(form.pin);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{employee ? 'עריכת עובד' : 'עובד חדש'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>שם מלא</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="שם העובד" />
          </div>
          <div>
            <Label>קוד PIN (4 ספרות)</Label>
            <Input
              value={form.pin}
              onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              placeholder="0000"
              className="text-center text-lg tracking-widest"
              maxLength={4}
            />
          </div>
          <div>
            <Label>טלפון (אופציונלי)</Label>
            <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="050-0000000" />
          </div>
          <div>
            <Label>תפקיד</Label>
            <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="קופאי">קופאי</SelectItem>
                <SelectItem value="עובד">עובד</SelectItem>
                <SelectItem value="מנהל">מנהל</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate(form)} disabled={!isValid || mutation.isPending} className="w-full bg-blue-600 hover:bg-blue-700">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}