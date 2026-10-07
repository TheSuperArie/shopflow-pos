import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import Barcode from 'react-barcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { formatOrderDate, lineQty, orderBarcodeValue } from '@/lib/supplyOrders';

/**
 * Picking sheet — for picking by hand with a paper first, then confirming on the tablet.
 * lines: [{ it, carton, size, free }] already sorted the way the picker walks (carton, then size).
 * Lines with nothing in the warehouse are listed separately at the end.
 */
export function PickSheet({ order, warehouse, lines }) {
  const ready = lines.filter(l => l.free == null || l.free > 0);
  const missing = lines.filter(l => l.free != null && l.free <= 0);
  const units = ready.reduce((s, l) => s + lineQty(l.it), 0);

  const Rows = ({ list, dim }) => list.map((l, i) => {
    const need = lineQty(l.it);
    const short = l.free != null && l.free > 0 && l.free < need;
    return (
      <tr key={`${l.it.variant_id}-${i}`} className={`border-b border-gray-400 ${dim ? 'text-gray-500' : ''}`}>
        <td className="py-1.5 px-1 text-center"><span className="inline-block w-4 h-4 border-2 border-black align-middle" /></td>
        <td className="py-1.5 px-1 text-center text-[18px] font-bold">{l.carton || '—'}</td>
        <td className="py-1.5 px-1">{l.it.product_name}</td>
        <td className="py-1.5 px-1 font-bold text-[15px]">{l.size || l.it.variant_label || '—'}</td>
        <td className="py-1.5 px-1 font-mono text-[11px]">{l.it.sku || '—'}</td>
        <td className="py-1.5 px-1 text-center text-[17px] font-bold">{need}</td>
        <td className="py-1.5 px-1 text-center text-[11px]">{l.free == null ? '' : l.free <= 0 ? 'אין' : short ? `רק ${l.free}` : l.free}</td>
        <td className="py-1.5 px-1"><span className="inline-block w-14 border-b border-black">&nbsp;</span></td>
      </tr>
    );
  });

  const head = (
    <thead>
      <tr className="border-b-2 border-black">
        <th className="py-1.5 px-1 w-8">✓</th>
        <th className="py-1.5 px-1 text-center w-14">קרטון</th>
        <th className="py-1.5 px-1 text-right">מוצר</th>
        <th className="py-1.5 px-1 text-right w-16">מידה</th>
        <th className="py-1.5 px-1 text-right w-24">מק"ט</th>
        <th className="py-1.5 px-1 text-center w-14">צריך</th>
        <th className="py-1.5 px-1 text-center w-14">במחסן</th>
        <th className="py-1.5 px-1 text-right w-20">לוקט</th>
      </tr>
    </thead>
  );

  return (
    <div dir="rtl" className="bg-white text-black text-[13px] leading-snug">
      <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-3">
        <div>
          <p className="text-2xl font-bold">דף ליקוט · הזמנה #{order.order_number}</p>
          <p className="text-lg font-semibold mt-1">{order.branch_name}</p>
          <p className="mt-1">הודפס: {formatOrderDate(new Date().toISOString(), true)}{warehouse?.name ? ` · מחסן: ${warehouse.name}` : ''}</p>
          <p className="mt-1">{ready.length} שורות · {units} יחידות · מסודר לפי קרטון ואז מידה</p>
          <p className="mt-2">שם המלקט: ____________________</p>
        </div>
        <div className="text-center" dir="ltr">
          <Barcode value={orderBarcodeValue(order)} height={48} width={1.6} fontSize={13} margin={0} />
        </div>
      </div>

      <table className="w-full mt-3 border-collapse">
        {head}
        <tbody><Rows list={ready} /></tbody>
      </table>

      {missing.length > 0 && (
        <>
          <p className="mt-5 font-bold border-b-2 border-black pb-1">אין כרגע במחסן ({missing.length} שורות) — לבדוק אם הגיע</p>
          <table className="w-full border-collapse">
            {head}
            <tbody><Rows list={missing} dim /></tbody>
          </table>
        </>
      )}

      {(order.branch_notes || order.network_notes) && (
        <div className="mt-4 space-y-0.5">
          {order.branch_notes && <p><strong>הערות הסניף:</strong> {order.branch_notes}</p>}
          {order.network_notes && <p><strong>הערות הרשת:</strong> {order.network_notes}</p>}
        </div>
      )}
      <p className="mt-4">הערות המלקט: ______________________________________________</p>
    </div>
  );
}

const PRINT_CSS = `
@media screen { .supply-print-root { display: none; } }
@media print {
  body > *:not(.supply-print-root) { display: none !important; }
  .supply-print-root { display: block !important; padding: 10mm; }
  .supply-print-root tr { break-inside: avoid; }
  @page { size: A4; margin: 0; }
}`;

/** Preview + "print / save as PDF". */
export default function PickSheetDialog({ order, warehouse, lines, onClose }) {
  const [printing, setPrinting] = useState(false);
  const print = () => {
    setPrinting(true);
    setTimeout(() => { window.print(); setPrinting(false); }, 300);
  };
  return (
    <>
      <Dialog open onOpenChange={o => !o && onClose()}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>דף ליקוט · הזמנה #{order.order_number}</DialogTitle></DialogHeader>
          <Button onClick={print} className="gap-2 h-12 text-base bg-gray-900 hover:bg-gray-800">
            <Printer className="w-5 h-5" /> הדפס / שמור כ-PDF
          </Button>
          <div className="rounded-xl border p-4">
            <PickSheet order={order} warehouse={warehouse} lines={lines} />
          </div>
        </DialogContent>
      </Dialog>
      {printing && createPortal(
        <div className="supply-print-root">
          <style>{PRINT_CSS}</style>
          <PickSheet order={order} warehouse={warehouse} lines={lines} />
        </div>,
        document.body
      )}
    </>
  );
}
