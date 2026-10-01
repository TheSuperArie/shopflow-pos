import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getStuckSaleStock, retryStuckSaleStock, dismissStuckSaleStock } from '@/lib/saleStockQueue';

/** Sales whose stock deduction gave up (the server didn't find them) — shown to the manager */
export default function StuckStockBanner({ onRetry }) {
  const [stuck, setStuck] = useState(getStuckSaleStock);
  useEffect(() => {
    const refresh = () => setStuck(getStuckSaleStock());
    window.addEventListener('pos-stuck-stock', refresh);
    return () => window.removeEventListener('pos-stuck-stock', refresh);
  }, []);
  if (!stuck.length) return null;
  return (
    <div dir="rtl" className="mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1">{stuck.length} מכירות לא הורדו מהמלאי — המכירה לא נמצאה בשרת. בדקו את המלאי ידנית.</span>
      <button onClick={() => { retryStuckSaleStock(); onRetry?.(); }} className="rounded-lg bg-red-600 px-3 py-1 text-white font-semibold hover:bg-red-700">נסה שוב</button>
      <button onClick={dismissStuckSaleStock} className="rounded-lg px-3 py-1 hover:bg-red-100">הסתר</button>
    </div>
  );
}