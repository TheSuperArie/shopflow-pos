import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, LogIn, LogOut } from 'lucide-react';
import { format, parseISO, differenceInMinutes } from 'date-fns';

export default function BranchEmployeesView({ branch }) {
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['branch-employees', branch.id],
    queryFn: () => base44.entities.Employee.filter({ branch_id: branch.id }, 'name', 500),
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['branch-attendance-logs', branch.id],
    queryFn: () => base44.entities.AttendanceLog.filter({ branch_id: branch.id }, '-clock_in', 1000),
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" dir="rtl">
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
  );
}