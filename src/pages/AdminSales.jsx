import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Banknote, CreditCard, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminSales() {
  const [dateFrom, setDateFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['sales'],
    queryFn: () => base44.entities.Sale.list('-created_date'),
  });

  const filteredSales = sales.filter(s => {
    const d = s.created_date?.split('T')[0];
    return d >= dateFrom && d <= dateTo;
  });

  const total = filteredSales.reduce((s, sale) => s + (sale.total || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800">היסטוריית מכירות</h1>
        <div className="flex items-center gap-2">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
          <span className="text-gray-400">עד</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
        </div>
      </div>

      <div className="flex items-center gap-4 p-4 bg-amber-50 rounded-2xl">
        <span className="font-medium text-gray-600">סה"כ בטווח תאריכים:</span>
        <span className="text-2xl font-bold text-amber-600">₪{total.toFixed(0)}</span>
        <span className="text-gray-500">({filteredSales.length} מכירות)</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
      ) : (
        <div className="space-y-3">
          {filteredSales.map(sale => (
            <Card key={sale.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500">
                      {sale.created_date ? format(new Date(sale.created_date), 'dd/MM/yyyy HH:mm') : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={sale.payment_method === 'מזומן' ? 'text-green-600 border-green-200 bg-green-50' : 'text-blue-600 border-blue-200 bg-blue-50'}>
                      {sale.payment_method === 'מזומן' ? <Banknote className="w-3 h-3 ml-1" /> : <CreditCard className="w-3 h-3 ml-1" />}
                      {sale.payment_method}
                    </Badge>
                    <span className="font-bold text-lg">₪{sale.total?.toFixed(0)}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  {sale.items?.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm text-gray-600 py-1 border-b border-gray-50 last:border-0">
                      <div>
                        <span className="font-medium">{item.product_name}</span>
                        {item.shirt_size && (
                          <span className="text-xs text-gray-400 mr-2">
                            ({item.shirt_size}, {item.shirt_collar}, {item.shirt_cut})
                          </span>
                        )}
                      </div>
                      <span>x{item.quantity} — ₪{(item.sell_price * item.quantity).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredSales.length === 0 && (
            <p className="text-center text-gray-400 py-12">אין מכירות בטווח התאריכים</p>
          )}
        </div>
      )}
    </div>
  );
}