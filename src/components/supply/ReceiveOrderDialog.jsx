import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { stockOps } from '@/lib/warehouseStock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { ScanLine, X, Loader2, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { useScanDetector } from '@/hooks/useScanDetector';
import { nowIso, formatOrderDate } from '@/lib/supplyOrders';

const CHUNK = 25;

/** "SO1001" (the printed barcode) or a typed "1001" → "1001" */
const orderNumberFromCode = (code) => String(code || '').trim().replace(/^so/i, '');

/**
 * Branch receiving: scan the barcode printed on the delivery sheet → check / correct the
 * quantities → confirm → the branch stock (the same stock the POS sells from) goes up.
 * The stock is added on the server (stockOps → branchReceive) in rounds of CHUNK lines; every line
 * is recorded once added, so a retry or a second device never adds the same line twice.
 */
export default function ReceiveOrderDialog({ orders, initialOrder = null, userEmail, onClose }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [order, setOrder] = useState(initialOrder);
  const [lines, setLines] = useState(() => (initialOrder ? toLines(initialOrder) : []));
  const [typed, setTyped] = useState('');
  const [scanError, setScanError] = useState('');
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState(0);

  function toLines(o) {
    return (o.items || []).map(it => ({
      ...it,
      received_qty: it.received_qty ?? Number(it.picked_qty || 0),
    }));
  }

  const findOrder = (code) => {
    const num = orderNumberFromCode(code);
    const match = orders.find(o => String(o.order_number) === num);
    if (!match) return setScanError(`לא נמצאה הזמנה ${num} של הסניף`);
    if (match.status === 'RECEIVED') return setScanError(`הזמנה #${num} כבר נקלטה`);
    if (match.status !== 'SENT_TO_BRANCH') return setScanError(`הזמנה #${num} עוד לא נשלחה לסניף`);
    setScanError('');
    setOrder(match);
    setLines(toLines(match));
    return undefined;
  };

  useScanDetector({ enabled: !order && !applying, onScan: findOrder });

  const setReceived = (i, value) =>
    setLines(ls => ls.map((l, idx) => (idx === i ? { ...l, received_qty: Math.max(0, parseInt(value, 10) || 0) } : l)));

  const apply = async () => {
    setApplying(true);
    setProgress(0);
    try {
      const sentLines = lines.map(l => ({ variant_id: l.variant_id || null, received_qty: Number(l.received_qty || 0) }));
      let res = null;
      // Each round adds up to CHUNK lines on the server; repeat until the whole order is in
      for (let round = 0; round < 400; round++) {
        res = await stockOps('branchReceive', { order_id: order.id, lines: sentLines, max_lines: CHUNK });
        if (res?.done) break;
        if (res?.total) setProgress(Math.round((res.applied / res.total) * 100));
      }
      if (!res?.done) throw new Error('הקליטה לא הסתיימה');

      queryClient.invalidateQueries({ queryKey: ['supply-orders-branch'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      if (res.already) {
        toast({ title: 'ההזמנה כבר נקלטה', description: 'המלאי לא עודכן פעם נוספת' });
      } else {
        toast({ title: `הזמנה #${order.order_number} נקלטה והמלאי עודכן` });
      }
      if (res.missing?.length) {
        toast({
          title: 'חלק מהמוצרים לא נמצאו בקטלוג של הסניף',
          description: `${res.missing.join(', ')} — המלאי שלהם לא עודכן`,
          variant: 'destructive',
          duration: 10000,
        });
      }
      onClose();
    } catch (err) {
      toast({
        title: 'הקליטה נעצרה באמצע — אפשר ללחוץ שוב, מה שכבר נוסף לא יתווסף פעמיים',
        description: err?.message,
        variant: 'destructive',
        duration: 8000,
      });
    } finally {
      setApplying(false);
    }
  };

  const packedTotal = lines.reduce((s, l) => s + Number(l.picked_qty || 0), 0);
  const receivedTotal = lines.reduce((s, l) => s + Number(l.received_qty || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4" dir="rtl">
      <div className="w-full max-w-4xl max-h-[96vh] overflow-y-auto bg-white rounded-3xl shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-2xl font-bold text-gray-900">קבלת הזמנה</p>
          <button onClick={onClose} disabled={applying} className="p-2 rounded-xl hover:bg-gray-100"><X className="w-6 h-6 text-gray-500" /></button>
        </div>

        {!order ? (
          <div className="space-y-5 py-4 text-center">
            <div className="mx-auto w-24 h-24 rounded-3xl bg-green-50 flex items-center justify-center">
              <ScanLine className="w-12 h-12 text-green-600 animate-pulse" />
            </div>
            <p className="text-xl font-semibold text-gray-800">סרוק את הברקוד שעל דף ההזמנה שהגיע עם המשלוח</p>
            {scanError && (
              <p className="flex items-center justify-center gap-2 text-red-600 font-medium"><AlertTriangle className="w-5 h-5" /> {scanError}</p>
            )}
            <div className="flex gap-2 max-w-sm mx-auto">
              <Input
                value={typed}
                onChange={e => setTyped(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && typed.trim()) findOrder(typed); }}
                placeholder="או הקלד מספר הזמנה"
                inputMode="numeric"
                className="h-12 text-center text-lg"
              />
              <Button onClick={() => findOrder(typed)} disabled={!typed.trim()} className="h-12 px-5">פתח</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-2xl bg-gray-50 border p-3 flex flex-wrap items-center gap-3">
              {!initialOrder && (
                <button onClick={() => { setOrder(null); setLines([]); }} disabled={applying} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
                  <ArrowRight className="w-4 h-4" /> סריקה אחרת
                </button>
              )}
              <p className="text-lg font-bold text-gray-900">הזמנה #{order.order_number}</p>
              <p className="text-sm text-gray-500">נארזה {formatOrderDate(order.ready_at, true)}{order.picker_name ? ` · מלקט: ${order.picker_name}` : ''}</p>
            </div>
            <p className="text-sm text-gray-600">בדוק שהכמויות תואמות למה שהגיע בפועל. אם משהו חסר או עודף — תקן את הכמות לפני האישור.</p>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2.5 text-right font-medium">מק"ט</th>
                    <th className="px-3 py-2.5 text-right font-medium">מוצר</th>
                    <th className="px-3 py-2.5 text-right font-medium">מידה</th>
                    <th className="px-3 py-2.5 text-center font-medium">הוזמן</th>
                    <th className="px-3 py-2.5 text-center font-medium">נארז</th>
                    <th className="px-3 py-2.5 text-center font-medium">התקבל</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((l, i) => {
                    const diff = Number(l.received_qty) !== Number(l.picked_qty || 0);
                    return (
                      <tr key={`${l.variant_id}-${i}`} className={diff ? 'bg-amber-50' : Number(l.picked_qty || 0) === 0 ? 'opacity-60' : ''}>
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{l.sku || '—'}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">
                          {l.product_name}{l.extra && <span className="mr-1 text-xs text-red-600">(לא בהזמנה)</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{l.variant_label || '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-500">{l.extra ? '—' : (l.qty ?? l.requested_qty)}</td>
                        <td className="px-3 py-2 text-center font-semibold">{l.picked_qty ?? 0}</td>
                        <td className="px-3 py-1.5 text-center">
                          <Input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={l.received_qty}
                            disabled={applying || l.stock_applied}
                            onFocus={e => e.target.select()}
                            onChange={e => setReceived(i, e.target.value)}
                            className={`h-10 w-20 mx-auto text-center text-base font-semibold ${diff ? 'border-amber-400' : ''}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-gray-700">נארזו <strong>{packedTotal}</strong> · מתקבלים <strong>{receivedTotal}</strong> יחידות</p>
              <Button onClick={apply} disabled={applying} className="h-14 px-8 text-lg gap-2 bg-green-600 hover:bg-green-700">
                {applying ? <><Loader2 className="w-5 h-5 animate-spin" /> מעדכן מלאי… {progress}%</> : <><CheckCircle2 className="w-6 h-6" /> אשר קבלה ועדכן מלאי</>}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
