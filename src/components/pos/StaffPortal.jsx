import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Users, LogIn, LogOut, Clock, DollarSign, Delete } from 'lucide-react';
import { format } from 'date-fns';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const ACTIVE_SHIFT_KEY = 'active_shift';

export function getActiveShift() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_SHIFT_KEY) || 'null');
  } catch { return null; }
}

export default function StaffPortal({ open, onClose }) {
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState('select'); // 'select' | 'clock_in' | 'clock_out' | 'opening_cash' | 'closing_cash'
  const [foundEmployee, setFoundEmployee] = useState(null);
  const [cashAmount, setCashAmount] = useState('');
  const [activeShift, setActiveShift] = useState(getActiveShift());
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = useCurrentUser();

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', user?.email],
    queryFn: () => user ? base44.entities.Employee.filter({ created_by: user.email, is_active: true }) : [],
    enabled: !!user,
  });

  useEffect(() => {
    setActiveShift(getActiveShift());
  }, [open]);

  const clockInMutation = useMutation({
    mutationFn: async ({ employee, openingCash }) => {
      const now = new Date().toISOString();
      const log = await base44.entities.AttendanceLog.create({
        employee_id: employee.id,
        employee_name: employee.name,
        clock_in: now,
        date: format(new Date(), 'yyyy-MM-dd'),
        opening_cash: openingCash,
      });
      localStorage.setItem(ACTIVE_SHIFT_KEY, JSON.stringify({ logId: log.id, employee }));
      return log;
    },
    onSuccess: () => {
      setActiveShift(getActiveShift());
      queryClient.invalidateQueries({ queryKey: ['attendance-logs'] });
      toast({ title: `✅ כניסה נרשמה - ${foundEmployee?.name}`, duration: 3000 });
      resetAndClose();
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async ({ logId, closingCash }) => {
      await base44.entities.AttendanceLog.update(logId, {
        clock_out: new Date().toISOString(),
        closing_cash: closingCash,
      });
      localStorage.removeItem(ACTIVE_SHIFT_KEY);
    },
    onSuccess: () => {
      setActiveShift(null);
      queryClient.invalidateQueries({ queryKey: ['attendance-logs'] });
      toast({ title: `✅ יציאה נרשמה - ${foundEmployee?.name}`, duration: 3000 });
      resetAndClose();
    },
  });

  const handlePinInput = (digit) => {
    if (pin.length < 4) setPin(prev => prev + digit);
  };

  const handlePinDelete = () => setPin(prev => prev.slice(0, -1));

  const handlePinSubmit = () => {
    const emp = employees.find(e => e.pin === pin);
    if (!emp) {
      toast({ title: '❌ קוד PIN שגוי', variant: 'destructive', duration: 2000 });
      setPin('');
      return;
    }
    setFoundEmployee(emp);
    // Decide action based on active shift
    const shift = getActiveShift();
    if (shift && shift.employee.id === emp.id) {
      setMode('closing_cash');
    } else if (!shift) {
      setMode('opening_cash');
    } else {
      toast({ title: '⚠️ משמרת פתוחה של עובד אחר', duration: 3000 });
      setPin('');
    }
  };

  const handleClockIn = () => {
    const amount = parseFloat(cashAmount);
    if (isNaN(amount) || amount < 0) {
      toast({ title: '⚠️ הזן סכום תקין', variant: 'destructive' });
      return;
    }
    clockInMutation.mutate({ employee: foundEmployee, openingCash: amount });
  };

  const handleClockOut = () => {
    const shift = getActiveShift();
    const amount = parseFloat(cashAmount);
    if (isNaN(amount) || amount < 0) {
      toast({ title: '⚠️ הזן סכום תקין', variant: 'destructive' });
      return;
    }
    clockOutMutation.mutate({ logId: shift.logId, closingCash: amount });
  };

  const resetAndClose = () => {
    setPin('');
    setMode('select');
    setFoundEmployee(null);
    setCashAmount('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            פורטל עובדים
          </DialogTitle>
        </DialogHeader>

        {/* Active shift banner */}
        {activeShift && mode === 'select' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>משמרת פעילה: <strong>{activeShift.employee.name}</strong></span>
          </div>
        )}

        {/* PIN Entry */}
        {(mode === 'select') && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-gray-500 mb-3">הזן קוד PIN (4 ספרות)</p>
              <div className="flex justify-center gap-2 mb-4">
                {[0,1,2,3].map(i => (
                  <div key={i} className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-xl font-bold ${
                    pin.length > i ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300'
                  }`}>
                    {pin.length > i ? '●' : ''}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Numpad */}
            <div className="grid grid-cols-3 gap-2">
              {[1,2,3,4,5,6,7,8,9].map(d => (
                <button key={d} onClick={() => handlePinInput(String(d))}
                  className="h-14 text-xl font-bold bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                  {d}
                </button>
              ))}
              <button onClick={handlePinDelete}
                className="h-14 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                <Delete className="w-5 h-5 text-gray-600" />
              </button>
              <button onClick={() => handlePinInput('0')}
                className="h-14 text-xl font-bold bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                0
              </button>
              <button onClick={handlePinSubmit} disabled={pin.length !== 4}
                className="h-14 text-xl font-bold bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors disabled:opacity-40">
                ✓
              </button>
            </div>
          </div>
        )}

        {/* Opening Cash */}
        {mode === 'opening_cash' && (
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-xl text-center">
              <p className="font-bold text-blue-800">{foundEmployee?.name}</p>
              <p className="text-sm text-blue-600">פתיחת משמרת</p>
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> יתרת קופה פתיחה (₪)
              </Label>
              <Input type="number" value={cashAmount} onChange={e => setCashAmount(e.target.value)}
                placeholder="הזן סכום" className="text-lg text-center mt-1" autoFocus />
            </div>
            <Button onClick={handleClockIn} className="w-full bg-green-600 hover:bg-green-700 gap-2"
              disabled={clockInMutation.isPending}>
              <LogIn className="w-4 h-4" /> כניסה למשמרת
            </Button>
            <Button variant="outline" onClick={() => { setMode('select'); setPin(''); setFoundEmployee(null); }} className="w-full">
              חזור
            </Button>
          </div>
        )}

        {/* Closing Cash */}
        {mode === 'closing_cash' && (
          <div className="space-y-4">
            <div className="bg-orange-50 p-3 rounded-xl text-center">
              <p className="font-bold text-orange-800">{foundEmployee?.name}</p>
              <p className="text-sm text-orange-600">סיום משמרת</p>
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> יתרת קופה בסיום (₪)
              </Label>
              <Input type="number" value={cashAmount} onChange={e => setCashAmount(e.target.value)}
                placeholder="הזן סכום" className="text-lg text-center mt-1" autoFocus />
            </div>
            <Button onClick={handleClockOut} className="w-full bg-orange-500 hover:bg-orange-600 gap-2"
              disabled={clockOutMutation.isPending}>
              <LogOut className="w-4 h-4" /> יציאה ממשמרת
            </Button>
            <Button variant="outline" onClick={() => { setMode('select'); setPin(''); setFoundEmployee(null); }} className="w-full">
              חזור
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}