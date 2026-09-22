import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, LogIn, LogOut, Plus } from 'lucide-react';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { fetchBranchScoped } from '@/lib/branchScope';
import NetworkEmployeeFormModal from './NetworkEmployeeFormModal';

export default function BranchEmployeesView({ branch }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['branch-employees', branch.id],
    queryFn: () => fetchBranchScoped(base44.entities.Employee, branch, {}, 'name', 500),
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['branch-attendance-logs', branch.id],
    queryFn: () => fetchBranchScoped(base44.entities.AttendanceLog, branch, {}, '-clock_in', 1000),
  });

  const duration = (log) => {
    if (!log.clock_out) return 'פעיל';
    const mins = differenceInMinutes(parseISO(log.clock_out), parseISO(log.clock_in));
    return `${Math.floor(mins / 60)}ש' ${mins % 60}ד'`;
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(true)} className="gap-2 bg-blue-500 hover:bg-blue-600">
          <Plus className="w-4 h-4" /> הוספת עובד
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-700">עובדי הסניף ({employees.length})</h3>
          {employees.map(emp => (
            <Card key={emp.id}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700">
                  {emp.name?.[0]}
                </div>
                <div>
                  <p className="font-semibold">{emp.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-xs">{emp.role}</Badge>
                    {emp.phone && <span className="text-xs text-gray-500">{emp.phone}</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {employees.length === 0 && <p className="text-center text-gray-400 py-8">אין עובדים בסניף זה</p>}
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold text-gray-700">לוג נוכחות אחרון</h3>
          {logs.slice(0, 30).map(log => (
            <Card key={log.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">{log.employee_name} • {log.date}</span>
                  <Badge className={log.clock_out ? 'bg-gray-200 text-gray-700' : 'bg-green-100 text-green-700'}>
                    {duration(log)}
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
                </div>
              </CardContent>
            </Card>
          ))}
          {logs.length === 0 && <p className="text-center text-gray-400 py-8">אין רשומות נוכחות בסניף זה</p>}
        </div>
      </div>

      <NetworkEmployeeFormModal
        open={showForm}
        branch={branch}
        onClose={() => setShowForm(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['branch-employees', branch.id] });
          setShowForm(false);
          toast({ title: '✅ העובד נוסף לסניף', duration: 2000 });
        }}
        onError={(error) => toast({ title: '❌ הפעולה נכשלה', description: error?.message || 'נסה שוב', variant: 'destructive' })}
      />
    </div>
  );
}