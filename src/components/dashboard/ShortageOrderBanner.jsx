import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ShoppingCart, X } from 'lucide-react';
import { useShortageCount } from '@/hooks/useShortageCount';

const DISMISS_KEY = 'shortage_banner_dismissed_at';
const DISMISS_FOR_MS = 6 * 60 * 60 * 1000; // hidden for 6 hours after "later"

/** Branch dashboard alert: sizes under the shortage threshold → one click to an order of only them. */
export default function ShortageOrderBanner() {
  const count = useShortageCount();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => {
    try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_FOR_MS; } catch { return false; }
  });

  if (!count || dismissed) return null;

  const later = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
    setDismissed(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
      <span className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
        <AlertTriangle className="w-5 h-5 text-red-600" />
      </span>
      <div className="flex-1 min-w-[180px]">
        <p className="font-bold text-red-800">{count} מידות מתחת לרף החוסרים</p>
        <p className="text-sm text-red-700/80">אפשר להזמין אותן מהרשת עכשיו — דף ההזמנה ייפתח רק עם מה שחסר</p>
      </div>
      <button
        onClick={() => navigate('/AdminOrders?short=1')}
        className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
      >
        <ShoppingCart className="w-4 h-4" /> הזמן מה שחסר
      </button>
      <button onClick={later} className="p-1.5 text-red-400 hover:text-red-700" title="הזכר לי מאוחר יותר">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
