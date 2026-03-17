import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { TrendingDown, TrendingUp } from 'lucide-react';

/**
 * TransactionLedger: Chronological history of all financial movements (shipments + payments)
 * with running balance tracking.
 * 
 * Props:
 *   stockUpdates - array of StockUpdate records (shipments that add debt)
 *   payments - array of SupplierPayment records (payments that reduce debt)
 *   initialDebt - the current total_debt on the supplier (end state)
 */
export default function TransactionLedger({ stockUpdates = [], payments = [], initialDebt = 0 }) {
  // Calculate running balance by working backwards from current debt
  const ledger = useMemo(() => {
    // Build transaction objects with dates
    const transactions = [
      ...stockUpdates.map(u => ({
        id: u.id,
        date: new Date(u.arrival_date),
        type: 'shipment',
        label: u.product_name || 'משלוח',
        quantity: u.quantity_added,
        costPrice: u.cost_price || 0,
        amount: u.quantity_added * (u.cost_price || 0),
        notes: u.notes,
      })),
      ...payments.map(p => ({
        id: p.id,
        date: new Date(p.payment_date),
        type: 'payment',
        label: p.payment_method,
        amount: p.amount,
        reference: p.reference_number,
        notes: p.notes,
      })),
    ];

    // Sort chronologically (oldest first)
    transactions.sort((a, b) => a.date - b.date);

    // Calculate running balance: start from 0 and apply each transaction
    let runningBalance = 0;
    const ledgerWithBalance = transactions.map(tx => {
      if (tx.type === 'shipment') {
        runningBalance += tx.amount; // Add to debt
      } else {
        runningBalance -= tx.amount; // Reduce debt
      }
      return {
        ...tx,
        balanceAfter: Math.max(0, runningBalance),
      };
    });

    return ledgerWithBalance;
  }, [stockUpdates, payments]);

  if (ledger.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-400">
          <p>אין היסטוריה של עסקאות</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">יומן עסקאות - היסטוריה מלאה</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-right py-3 px-3 font-semibold text-gray-700">תאריך</th>
                <th className="text-right py-3 px-3 font-semibold text-gray-700">סוג</th>
                <th className="text-right py-3 px-3 font-semibold text-gray-700">פרטים</th>
                <th className="text-right py-3 px-3 font-semibold text-gray-700">סכום</th>
                <th className="text-right py-3 px-3 font-semibold text-gray-700">יתרה לאחר</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((tx, idx) => (
                <tr key={tx.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="py-3 px-3 text-gray-600">
                    {format(tx.date, 'dd/MM/yyyy')}
                  </td>
                  <td className="py-3 px-3">
                    {tx.type === 'shipment' ? (
                      <Badge className="bg-red-100 text-red-700">
                        <TrendingUp className="w-3 h-3 ml-1" />
                        משלוח
                      </Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-700">
                        <TrendingDown className="w-3 h-3 ml-1" />
                        תשלום
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-800">{tx.label}</span>
                      {tx.type === 'shipment' && tx.quantity && (
                        <span className="text-xs text-gray-500">
                          {tx.quantity} יח׳ × ₪{tx.costPrice.toFixed(2)}
                        </span>
                      )}
                      {tx.reference && (
                        <span className="text-xs text-gray-500">
                          אסמכתא: {tx.reference}
                        </span>
                      )}
                      {tx.notes && (
                        <span className="text-xs text-gray-400 italic">
                          {tx.notes}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span
                      className={`font-semibold ${
                        tx.type === 'shipment'
                          ? 'text-red-600'
                          : 'text-green-600'
                      }`}
                    >
                      {tx.type === 'shipment' ? '+' : '-'}₪{tx.amount.toLocaleString('he-IL', {
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className="font-bold text-lg text-blue-700">
                      ₪{tx.balanceAfter.toLocaleString('he-IL', {
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer: show final balance note */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between bg-blue-50 p-3 rounded-lg">
            <span className="text-sm font-medium text-blue-900">
              יתרה נוכחית (כולל עסקאות חדשות):
            </span>
            <span className="text-xl font-bold text-blue-700">
              ₪{initialDebt.toLocaleString('he-IL', { maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-2 text-right">
            השורה האחרונה מוצגת כך־קדימה בזמן, היתרה המחושבת משקפת את החוב המצטבר מתחילת התזמינות.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}