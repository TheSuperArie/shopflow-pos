import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, DollarSign, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export default function AdminCashReport() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const user = useCurrentUser();

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['attendance-logs', user?.email],
    queryFn: () => user ? base44.entities.AttendanceLog.filter({ created_by: user.email }, '-clock_in') : [],
    enabled: !!user,
  });

  const { data: sales = [], isLoading: salesLoading } = useQuery({
    queryKey: ['sales', user?.email],
    queryFn: () => user ? base44.entities.Sale.filter({ created_by: user.email }, '-created_date') : [],
    enabled: !!user,
  });

  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ['expenses', user?.email],
    queryFn: () => user ? base44.entities.Expense.filter({ created_by: user.email }, '-date') : [],
    enabled: !!user,
  });

  const isLoading = logsLoading || salesLoading || expensesLoading;

  // Filter by selected date
  const dayLogs = logs.filter(l => l.date === selectedDate);
  const daySales = sales.filter(s => s.created_date?.startsWith(selectedDate));
  const dayExpenses = expenses.filter(e => e.date === selectedDate);

  // Cash sales only
  const cashSales = daySales.filter(s => s.payment_method === 'מזומן');
  const totalCashSales = cashSales.reduce((s, sale) => s + (sale.total || 0), 0);
  const totalExpenses = dayExpenses.reduce((s, e) => s + (e.amount || 0), 0);

  // Per shift summary
  const shiftSummaries = dayLogs.map(log => {
    // Sales during this shift
    const shiftSales = cashSales.filter(s => {
      if (!s.created_date) return false;
      const saleTime = new Date(s.created_date);
      const clockIn = new Date(log.clock_in);
      const clockOut = log.clock_out ? new Date(log.clock_out) : new Date();
      return saleTime >= clockIn && saleTime <= clockOut;
    });

    const shiftExpenses = dayExpenses.filter(e => {
      // Approximate: attribute all day expenses if single shift
      return dayLogs.length === 1;
    });

    const shiftCashSales = shiftSales.reduce((s, sale) => s + (sale.total || 0), 0);
    const shiftExp = shiftExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const openingCash = log.opening_cash || 0;
    const closingCash = log.closing_cash;
    const expectedClosing = openingCash + shiftCashSales - shiftExp;
    const discrepancy = closingCash !== undefined ? closingCash - expectedClosing : null;

    return { log, shiftCashSales, shiftExp, openingCash, closingCash, expectedClosing, discrepancy };
  });

  // Day totals
  const totalOpeningCash = dayLogs.length > 0 ? (dayLogs[0].opening_cash || 0) : 0;
  const totalClosingCash = dayLogs.length > 0 ? dayLogs[dayLogs.length - 1].closing_cash : undefined;
  const expectedClosing = totalOpeningCash + totalCashSales - totalExpenses;
  const dayDiscrepancy = totalClosingCash !== undefined ? totalClosingCash - expectedClosing : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <DollarSign className="w-6 h-6" /> דוח קופה יומי
        </h1>
        <div className="flex items-center gap-2">
          <Label>תאריך:</Label>
          <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="w-40" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
      ) : (
        <>
          {/* Day Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-blue-600 font-medium">יתרת פתיחה</p>
                <p className="text-2xl font-bold text-blue-800 mt-1">₪{totalOpeningCash.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-green-600 font-medium">מכירות מזומן</p>
                <p className="text-2xl font-bold text-green-800 mt-1">₪{totalCashSales.toLocaleString()}</p>
                <p className="text-xs text-green-600 mt-0.5">{cashSales.length} עסקאות</p>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-red-600 font-medium">הוצאות</p>
                <p className="text-2xl font-bold text-red-800 mt-1">₪{totalExpenses.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="bg-purple-50 border-purple-200">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-purple-600 font-medium">קופה צפויה לסגירה</p>
                <p className="text-2xl font-bold text-purple-800 mt-1">₪{expectedClosing.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          {/* Discrepancy */}
          {dayDiscrepancy !== null && (
            <Card className={`border-2 ${Math.abs(dayDiscrepancy) < 1 ? 'border-green-300 bg-green-50' : dayDiscrepancy > 0 ? 'border-yellow-300 bg-yellow-50' : 'border-red-300 bg-red-50'}`}>
              <CardContent className="p-4 flex items-center gap-3">
                {Math.abs(dayDiscrepancy) < 1 ? (
                  <CheckCircle className="w-6 h-6 text-green-600" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                )}
                <div>
                  <p className="font-semibold">
                    {Math.abs(dayDiscrepancy) < 1 ? '✅ הקופה מאוזנת' :
                      dayDiscrepancy > 0 ? '📈 עודף בקופה' : '📉 חסר בקופה'}
                  </p>
                  <p className="text-sm text-gray-600">
                    קופה סגירה בפועל: ₪{totalClosingCash?.toLocaleString()} |
                    פער: {dayDiscrepancy > 0 ? '+' : ''}₪{dayDiscrepancy.toFixed(2)}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Shift breakdown */}
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-700">פירוט משמרות</h2>
            {shiftSummaries.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-gray-400">
                  <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>אין משמרות רשומות לתאריך זה</p>
                </CardContent>
              </Card>
            ) : (
              shiftSummaries.map(({ log, shiftCashSales, shiftExp, openingCash, closingCash, expectedClosing, discrepancy }) => (
                <Card key={log.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{log.employee_name}</CardTitle>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>{log.clock_in ? format(parseISO(log.clock_in), 'HH:mm') : '-'}</span>
                        <span>—</span>
                        <span>{log.clock_out ? format(parseISO(log.clock_out), 'HH:mm') : 'פעיל'}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div className="bg-blue-50 p-2 rounded-lg text-center">
                        <p className="text-xs text-blue-600">פתיחה</p>
                        <p className="font-bold text-blue-800">₪{openingCash}</p>
                      </div>
                      <div className="bg-green-50 p-2 rounded-lg text-center">
                        <p className="text-xs text-green-600">מכירות מזומן</p>
                        <p className="font-bold text-green-800">₪{shiftCashSales}</p>
                      </div>
                      <div className="bg-purple-50 p-2 rounded-lg text-center">
                        <p className="text-xs text-purple-600">קופה צפויה</p>
                        <p className="font-bold text-purple-800">₪{expectedClosing.toFixed(0)}</p>
                      </div>
                      <div className={`p-2 rounded-lg text-center ${closingCash !== undefined ? (Math.abs(discrepancy) < 1 ? 'bg-green-50' : 'bg-red-50') : 'bg-gray-50'}`}>
                        <p className="text-xs text-gray-600">סגירה בפועל</p>
                        <p className={`font-bold ${closingCash !== undefined ? (Math.abs(discrepancy) < 1 ? 'text-green-800' : 'text-red-800') : 'text-gray-400'}`}>
                          {closingCash !== undefined ? `₪${closingCash}` : 'טרם נסגר'}
                        </p>
                        {discrepancy !== null && Math.abs(discrepancy) >= 1 && (
                          <p className={`text-xs font-medium ${discrepancy > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {discrepancy > 0 ? '+' : ''}₪{discrepancy.toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}