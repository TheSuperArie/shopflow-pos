import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Warehouse } from 'lucide-react';
import { format } from 'date-fns';

/** Log of the warehouse orders that were already sent — what was ordered and when. */
export default function WarehouseOrderHistory({ orders = [], isLoading }) {
  const [openId, setOpenId] = useState(null);

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="py-10 text-center text-gray-400">טוען...</div>
        ) : orders.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <Warehouse className="w-9 h-9 mx-auto mb-2 opacity-30" />
            <p className="text-sm">עדיין לא נשלחו הזמנות למחסן</p>
          </div>
        ) : (
          <div className="divide-y">
            {orders.map(order => {
              const isOpen = openId === order.id;
              return (
                <div key={order.id}>
                  <button
                    onClick={() => setOpenId(isOpen ? null : order.id)}
                    className="w-full text-right flex items-center justify-between px-4 py-3 hover:bg-amber-50"
                  >
                    <div>
                      <p className="text-sm font-bold text-gray-800">
                        הזמנה {order.order_number || `#${order.id.slice(0, 6)}`}
                      </p>
                      <p className="text-xs text-gray-400">
                        {order.total_items || order.items?.length || 0} פריטים • {order.total_qty || 0} יחידות
                        {order.notes ? ` • ${order.notes}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge className="bg-green-100 text-green-800">{order.status || 'הוזמן'}</Badge>
                      <span className="text-xs text-gray-400">
                        {order.order_date || (order.created_date ? format(new Date(order.created_date), 'dd/MM/yy') : '')}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {isOpen && (
                    <div className="bg-gray-50 px-4 py-3 space-y-2">
                      {(order.items || []).map((item, idx) => (
                        <div key={idx} className="bg-white border rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-800">{item.variant_label}</p>
                            <span className="text-sm font-bold text-gray-900">{item.qty} יח'</span>
                          </div>
                          {item.branches?.length > 0 && (
                            <p className="text-xs text-gray-400 mt-1">
                              {item.branches.map(b => `${b.branch_name}: ${b.qty}`).join(' • ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}