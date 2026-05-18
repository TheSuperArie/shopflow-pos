import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import { BarChart2 } from 'lucide-react';

const toLocalDate = (isoString) => {
  if (!isoString) return null;
  const safe = isoString.endsWith('Z') ? isoString : `${isoString}Z`;
  return new Date(safe).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
};

const toLocalHour = (isoString) => {
  if (!isoString) return null;
  const safe = isoString.endsWith('Z') ? isoString : `${isoString}Z`;
  return parseInt(new Date(safe).toLocaleTimeString('en-IL', { hour: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' }), 10);
};

export default function HourlySalesChart({ sales = [] }) {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const daySales = sales.filter(s => toLocalDate(s.created_date) === selectedDate);

  // Build 24 hourly buckets
  const hourly = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, '0')}:00`,
    מכירות: 0,
  }));

  daySales.forEach(s => {
    const h = toLocalHour(s.created_date);
    if (h !== null && h >= 0 && h < 24) {
      hourly[h].מכירות += Number(s.total) || 0;
    }
  });

  // Trim leading/trailing empty hours but keep at least 8:00–22:00
  const relevantHours = hourly.slice(7, 23);
  const totalDay = daySales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-amber-500" />
            <CardTitle className="text-base">מכירות לפי שעה</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-40 h-8 text-sm"
            />
            <span className="text-sm text-gray-500 whitespace-nowrap">
              סה"כ: <span className="font-bold text-gray-800">₪{totalDay.toFixed(0)}</span>
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        {daySales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-400">
            <BarChart2 className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">אין מכירות ביום זה</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={relevantHours} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `₪${v}`} />
              <Tooltip
                formatter={(value) => [`₪${Number(value).toFixed(0)}`, 'מכירות']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="מכירות" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}