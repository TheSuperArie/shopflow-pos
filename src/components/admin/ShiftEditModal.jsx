import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, LogIn, LogOut, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

/** Branch manager edits, closes or deletes a single attendance shift. */
export default function ShiftEditModal({ open, log, onClose }) {
  const [form, setForm] = useState({ date: '', start_time: '', end_time: '', notes: '' });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open && log) {
      setForm({
        date: log.date || format(parseISO(log.clock_in), 'yyyy-MM-dd'),
        start_time: log.clock_in ? format(parseISO(log.clock_in), 'HH:mm') : '',
        end_time: log.clock_out ? format(parseISO(log.clock_out), 'HH:mm') : '',
        notes: log.notes || '',
      });
    }
  }, [open, log]);

  const done = (title) => {
    queryClient.invalidateQueries({ queryKey: ['attendance-logs'] });
    toast({ title, duration: 2000 });
    onClose();
  };

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.AttendanceLog.update(log.id, {
      date: data.date,
      clock_in: new Date(`${data.date}T${data.start_time}:00`).toISOString(),
      clock_out: data.end_time ? new Date(`${data.date}T${data.end_time}:00`).toISOString() : null,
      notes: data.notes || null,
      manually_edited: true,
    }),
    onSuccess: () => done('✅ המשמרת עודכנה'),
    onError: (e) => toast({ title: '❌ עדכון המשמרת נכשל', description: e?.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.AttendanceLog.delete(log.id),
    onSuccess: () => done('🗑️ המשמרת נמחקה'),
    onError: (e) => toast({ title: '❌ מחיקת המשמרת נכשלה', description: e?.message, variant: 'destructive' }),
  });

  const isValid = form.date && form.start_time && (!form.end_time || form.end_time > form.start_time);
  const isOpenShift = log && !log.clock_out;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>עריכת משמרת — {log?.employee_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isOpenShift && (
            <p className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-md p-2">
              משמרת פתוחה — הזן שעת יציאה כדי לסגור אותה
            </p>
          )}
          <div>
            <Label>תאריך</Label>
            <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-1"><LogIn className="w-3 h-3 text-green-500" /> שעת כניסה</Label>
              <Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div>
              <Label className="flex items-center gap-1"><LogOut className="w-3 h-3 text-red-500" /> שעת יציאה</Label>
              <Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
            </div>
          </div>
          {form.end_time && form.end_time <= form.start_time && (
            <p className="text-xs text-red-500">שעת יציאה חייבת להיות אחרי שעת כניסה</p>
          )}
          <div>
            <Label>הערה</Label>
            <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="סיבת העדכון" />
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={() => saveMutation.mutate(form)}
            disabled={!isValid || saveMutation.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור שינויים'}
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2 border-red-300 text-red-600 hover:bg-red-50"
            disabled={deleteMutation.isPending}
            onClick={() => { if (window.confirm('למחוק את המשמרת?')) deleteMutation.mutate(); }}
          >
            <Trash2 className="w-4 h-4" /> מחק משמרת
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}