import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Loader2, Search, CreditCard, Banknote, Receipt, X, Link2 } from 'lucide-react';
import { parseServerDate } from '@/lib/serverDate';

const DAYS_BACK = 120;
const money = (n) => `₪${Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
const trim0 = (s) => String(s ?? '').trim().replace(/^0+/, '');

/** Card / approval details of a sale, from what the payment provider returned. */
export function saleCreditInfo(sale) {
  const d = sale?.credit_details || {};
  return {
    provider: sale?.credit_provider || null,
    ref: String(sale?.credit_ref || d.Confirmation || '').trim() || null,
    transactionId: String(d.TransactionId || d.ID || '').trim() || null,
    last4: String(d.LastNum || '').trim() || null,
    tashlumim: d.Tashloumim || d.tashlumim || null,
  };
}

/** What a return keeps about its original sale (a snapshot — stays readable even if the sale changes). */
export function originalSaleSnapshot(sale, receiptNumber) {
  const c = saleCreditInfo(sale);
  return {
    sale_id: sale.id,
    date: sale.created_date || null,
    total: sale.total,
    payment_method: sale.payment_method || null,
    credit_provider: c.provider,
    credit_ref: c.ref,
    transaction_id: c.transactionId,
    card_last4: c.last4,
    receipt_number: receiptNumber || null,
  };
}

export const formatSaleDate = (value) => {
  const d = parseServerDate(value);
  return d ? d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
};

/**
 * Find the original sale of a return: by the card's last 4 digits, the approval number,
 * the transaction id, the receipt number or the amount. Empty search = the latest sales.
 */
export default function SaleLookup({ branchId, onPick }) {
  const [q, setQ] = useState('');

  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - DAYS_BACK);
    return d.toISOString().slice(0, 10);
  }, []);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['return-sale-lookup', branchId || 'store', since],
    queryFn: () => base44.entities.Sale.filter(
      { ...(branchId ? { branch_id: branchId } : {}), created_date: { $gte: since } },
      '-created_date', 500,
    ),
    staleTime: 30000,
  });

  const term = q.trim();
  const { data: receiptHits = [] } = useQuery({
    queryKey: ['return-receipt-lookup', term],
    queryFn: () => base44.entities.Receipt.filter({ receipt_number: term }, '-created_date', 5),
    enabled: /^\d{5,}$/.test(term),
    staleTime: 30000,
  });

  const results = useMemo(() => {
    if (!term) return sales.slice(0, 8).map(s => ({ sale: s, receipt: null }));
    const t0 = trim0(term);
    const amount = parseFloat(term.replace(',', '.'));
    const byReceipt = new Map(receiptHits.map(r => [r.sale_id, r.receipt_number]));
    return sales.filter(s => {
      if (byReceipt.has(s.id)) return true;
      const c = saleCreditInfo(s);
      if (c.last4 && c.last4 === term) return true;
      if (c.ref && t0 && trim0(c.ref) === t0) return true;
      if (c.transactionId && c.transactionId === term) return true;
      if (!Number.isNaN(amount) && /^[\d.,]+$/.test(term) && Math.abs(Number(s.total || 0) - amount) < 0.005) return true;
      return false;
    }).slice(0, 20).map(s => ({ sale: s, receipt: byReceipt.get(s.id) || null }));
  }, [sales, term, receiptHits]);

  return (
    <div className="rounded-xl border-2 border-dashed border-[#E2D8C4] bg-[#FBF7EE] p-3 space-y-2">
      <p className="flex items-center gap-1.5 font-semibold text-[#1E2433]">
        <Link2 className="w-4 h-4" /> קישור למכירה המקורית <span className="text-xs font-normal text-gray-500">(לא חובה)</span>
      </p>
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
        <Input value={q} onChange={e => setQ(e.target.value)} className="pr-9 bg-white"
          placeholder="4 ספרות אחרונות של הכרטיס, מספר אישור, מספר קבלה או סכום" />
        {q && (
          <button onClick={() => setQ('')} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700" aria-label="נקה">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500">{term ? `תוצאות מ-${DAYS_BACK} הימים האחרונים` : 'המכירות האחרונות:'}</p>

      {isLoading ? (
        <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : results.length === 0 ? (
        <p className="py-3 text-center text-sm text-gray-500">לא נמצאה מכירה מתאימה</p>
      ) : (
        <div className="max-h-56 overflow-y-auto space-y-1.5">
          {results.map(({ sale, receipt }) => {
            const c = saleCreditInfo(sale);
            const isCredit = !!c.last4 || /אשראי/.test(sale.payment_method || '');
            const names = (sale.items || []).map(i => `${i.product_name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ');
            return (
              <button key={sale.id} type="button" onClick={() => onPick(sale, receipt)}
                className="w-full text-right rounded-lg border bg-white px-3 py-2 hover:border-[#B8925A] hover:bg-[#FFFDF8] transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold tabular-nums">{money(sale.total)}</span>
                  <span className="text-xs text-gray-500 tabular-nums">{formatSaleDate(sale.created_date)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600 mt-0.5">
                  <span className="flex items-center gap-1">
                    {isCredit ? <CreditCard className="w-3.5 h-3.5" /> : <Banknote className="w-3.5 h-3.5" />}
                    {sale.payment_method || '—'}{c.last4 ? ` · ****${c.last4}` : ''}
                  </span>
                  {c.ref && <span>אישור {c.ref}</span>}
                  {receipt && <span className="flex items-center gap-1"><Receipt className="w-3.5 h-3.5" /> קבלה {receipt}</span>}
                </div>
                {names && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{names}</p>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
