import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import Barcode from 'react-barcode';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import {
  fetchNetworkDetails, formatOrderDate, lineQty, orderBarcodeValue, isOverPicked,
} from '@/lib/supplyOrders';

/** Delivery document for a picked order: barcode on top, branch + network details, lines. */
export function OrderDocument({ order, warehouse }) {
  const { data: branch } = useQuery({
    queryKey: ['supply-branch', order?.branch_id],
    queryFn: async () => (await base44.entities.Branch.filter({ id: order.branch_id }))[0] || null,
    enabled: !!order?.branch_id,
    staleTime: 300000,
  });
  const { data: network } = useQuery({
    queryKey: ['supply-network-details', order?.tenant_email],
    queryFn: () => fetchNetworkDetails(order.tenant_email),
    enabled: !!order?.tenant_email,
    staleTime: 300000,
  });

  const items = order.items || [];
  const ordered = items.reduce((s, i) => s + lineQty(i), 0);
  const packed = items.reduce((s, i) => s + Number(i.picked_qty || 0), 0);

  return (
    <div dir="rtl" className="bg-white text-black text-[13px] leading-snug">
      <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-3">
        <div>
          <p className="text-2xl font-bold">הזמנה #{order.order_number}</p>
          <p className="text-lg font-semibold mt-1">{order.branch_name}</p>
          <p className="mt-1">תאריך: {formatOrderDate(order.ready_at || order.updated_date || order.created_date, true)}</p>
        </div>
        <div className="text-center" dir="ltr">
          <Barcode value={orderBarcodeValue(order)} height={56} width={1.8} fontSize={14} margin={0} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 py-3 border-b">
        <div>
          <p className="font-bold mb-0.5">פרטי הסניף</p>
          <p>{order.branch_name}</p>
          {branch?.address && <p>{branch.address}</p>}
          {branch?.manager_name && <p>מנהל: {branch.manager_name}</p>}
          {branch?.manager_phone && <p>טלפון: {branch.manager_phone}</p>}
        </div>
        <div>
          <p className="font-bold mb-0.5">פרטי הרשת</p>
          <p>{network?.name}</p>
          {warehouse?.network_phone && <p>טלפון: {warehouse.network_phone}</p>}
          {network?.email && <p dir="ltr" className="text-right">{network.email}</p>}
          {warehouse?.name && <p className="mt-1">מחסן: {warehouse.name}</p>}
          {order.picker_name && <p>מלקט: {order.picker_name}</p>}
        </div>
      </div>

      <table className="w-full mt-3 border-collapse">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="py-1.5 px-1 text-right">#</th>
            <th className="py-1.5 px-1 text-right">מק"ט</th>
            <th className="py-1.5 px-1 text-right">מוצר</th>
            <th className="py-1.5 px-1 text-right">מידה</th>
            <th className="py-1.5 px-1 text-center">הוזמן</th>
            <th className="py-1.5 px-1 text-center">נארז</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={`${it.variant_id}-${i}`} className="border-b border-gray-300">
              <td className="py-1 px-1">{i + 1}</td>
              <td className="py-1 px-1 font-mono text-[12px]">{it.sku || '—'}</td>
              <td className="py-1 px-1">{it.product_name}{it.extra ? ' (לא בהזמנה)' : ''}</td>
              <td className="py-1 px-1">{it.variant_label || '—'}</td>
              <td className="py-1 px-1 text-center">{lineQty(it)}</td>
              <td className={`py-1 px-1 text-center font-bold ${isOverPicked(it) ? 'underline' : ''}`}>{it.picked_qty ?? 0}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-bold">
            <td colSpan={4} className="py-1.5 px-1">סה"כ {items.length} שורות</td>
            <td className="py-1.5 px-1 text-center">{ordered}</td>
            <td className="py-1.5 px-1 text-center">{packed}</td>
          </tr>
        </tfoot>
      </table>

      {(order.branch_notes || order.network_notes || order.warehouse_notes) && (
        <div className="mt-3 space-y-0.5">
          {order.branch_notes && <p><strong>הערות הסניף:</strong> {order.branch_notes}</p>}
          {order.network_notes && <p><strong>הערות הרשת:</strong> {order.network_notes}</p>}
          {order.warehouse_notes && <p><strong>הערות המחסן:</strong> {order.warehouse_notes}</p>}
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-8">
        <p>חתימת המחסן: ____________________</p>
        <p>חתימת הסניף בקבלה: ____________________</p>
      </div>
    </div>
  );
}

const PRINT_CSS = `
@media screen { .supply-print-root { display: none; } }
@media print {
  body > *:not(.supply-print-root) { display: none !important; }
  .supply-print-root { display: block !important; padding: 12mm; }
  @page { size: A4; margin: 0; }
}`;

/** Preview + "print / save as PDF" (the browser print dialog offers "Save as PDF"). */
export default function OrderDocumentDialog({ order, warehouse, onClose }) {
  const [printing, setPrinting] = useState(false);

  const print = () => {
    setPrinting(true);
    // Let the print copy render, then open the print dialog
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 300);
  };

  if (!order) return null;
  return (
    <>
      <Dialog open onOpenChange={o => !o && onClose()}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>דף הזמנה #{order.order_number}</span>
            </DialogTitle>
          </DialogHeader>
          <Button onClick={print} className="gap-2 h-12 text-base bg-gray-900 hover:bg-gray-800">
            <Printer className="w-5 h-5" /> הדפס / שמור כ-PDF
          </Button>
          <div className="rounded-xl border p-4">
            <OrderDocument order={order} warehouse={warehouse} />
          </div>
        </DialogContent>
      </Dialog>
      {printing && createPortal(
        <div className="supply-print-root">
          <style>{PRINT_CSS}</style>
          <OrderDocument order={order} warehouse={warehouse} />
        </div>,
        document.body
      )}
    </>
  );
}
