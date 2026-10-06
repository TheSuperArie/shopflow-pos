import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * Nedarim Plus secure payment window (their iframe). The card details are typed INSIDE Nedarim's
 * frame — they never pass through our site. We send the deal (mosad, key, amount, installments)
 * with postMessage and get back a TransactionResponse.
 *
 * Protection against charging twice: once "charge" is pressed the button stays locked until an
 * answer arrives; a success is reported once; no answer within 90s → the cashier is told to check
 * in Nedarim before trying again.
 */
const FRAME_URL = 'https://matara.pro/nedarimplus/iframe?language=he';
const DEFAULT_HEIGHT = 460; // until the frame reports its own height
const LOAD_TIMEOUT_MS = 12000;
const fromNedarim = (origin) => /(^|\.)matara\.pro$/i.test(String(origin || '').replace(/^https?:\/\//, ''));

// Keep the answer for later questions, without anything card-like
export const cleanNedarimResponse = (v) => {
  const out = {};
  Object.entries(v || {}).forEach(([k, val]) => {
    if (/cvv|tokef|cardnumber|^card$/i.test(k)) return;
    if (val !== null && typeof val === 'object') return;
    out[k] = val;
  });
  return out;
};
export const nedarimRef = (v) =>
  String(v?.Confirmation || v?.TransactionId || v?.Shovar || v?.TransactionID || v?.ID || '');

export default function NedarimPaymentDialog({ open, amount, config, comment, onSuccess, onCancel }) {
  const frameRef = useRef(null);
  const doneRef = useRef(false);
  const timerRef = useRef(null);
  const [height, setHeight] = useState(0);
  const [tashlumim, setTashlumim] = useState(1);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [noAnswer, setNoAnswer] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loaded, setLoaded] = useState(false);     // the frame finished loading (button can be used)
  const [loadSlow, setLoadSlow] = useState(false); // nothing loaded after a while — probably blocked

  // Fresh window every time it opens
  useEffect(() => {
    if (!open) return;
    doneRef.current = false;
    setHeight(0); setTashlumim(1); setPaying(false); setError(''); setNoAnswer(false); setSuccess(false);
    setLoaded(false); setLoadSlow(false);
    const t = setTimeout(() => setLoadSlow(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onMessage = (event) => {
      // Only our own Nedarim frame (checked by the window it came from, so a redirect to another
      // Nedarim domain still works); data may arrive as an object or as a JSON string
      const fromOurFrame = frameRef.current && event.source === frameRef.current.contentWindow;
      if (!fromOurFrame && !fromNedarim(event.origin)) return;
      let data = event.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
      const { Name, Value } = data || {};
      if (Name === 'Height') {
        setHeight(parseInt(Value, 10) + 15 || 0);
        setLoaded(true);
        setLoadSlow(false);
      } else if (Name === 'TransactionResponse') {
        clearTimeout(timerRef.current);
        setPaying(false);
        setNoAnswer(false);
        if (Value?.Status === 'Error') {
          setError(Value?.Message || 'העסקה נדחתה');
          return;
        }
        if (doneRef.current) return; // report a success only once
        doneRef.current = true;
        setSuccess(true);
        onSuccess?.({
          provider: 'nedarim',
          amount: Number(amount),
          tashlumim,
          ref: nedarimRef(Value),
          details: cleanNedarimResponse(Value),
        });
      }
    };
    window.addEventListener('message', onMessage);
    return () => { window.removeEventListener('message', onMessage); clearTimeout(timerRef.current); };
  }, [open, amount, tashlumim, onSuccess]);

  const charge = () => {
    if (paying || doneRef.current || !frameRef.current?.contentWindow) return;
    // Ask for the height too, in case the frame waits to be asked
    try { frameRef.current.contentWindow.postMessage({ Name: 'GetHeight' }, '*'); } catch { /* ignore */ }
    setError('');
    setNoAnswer(false);
    setPaying(true);
    frameRef.current.contentWindow.postMessage({
      Name: 'FinishTransaction2',
      Value: {
        Mosad: config.mosad,
        ApiValid: config.api_valid,
        PaymentType: 'Ragil',
        Currency: '1',
        Zeout: '',
        FirstName: 'לקוח קופה',
        LastName: '',
        Street: '',
        City: '',
        Phone: '',
        Mail: '',
        Amount: Number(amount).toFixed(2),
        Tashlumim: String(tashlumim),
        Groupe: '',
        Comment: comment || 'ShopFlow',
        CallBack: '',
      },
    }, '*');
    timerRef.current = setTimeout(() => { setPaying(false); setNoAnswer(true); }, 90000);
  };

  const busy = paying || success;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onCancel?.(); }}>
      <DialogContent className="max-w-md" dir="rtl" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-xl">
            <CreditCard className="w-5 h-5 text-blue-600" /> תשלום באשראי — נדרים פלוס
          </DialogTitle>
        </DialogHeader>

        <div className="text-center">
          <p className="text-gray-500 text-sm">סכום לחיוב</p>
          <p className="text-3xl font-bold text-blue-700">₪{Number(amount || 0).toFixed(2)}</p>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="text-gray-600">תשלומים:</span>
          <select
            value={tashlumim}
            onChange={e => setTashlumim(Number(e.target.value))}
            disabled={busy}
            className="border rounded-lg px-2 py-1"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {!loaded && !loadSlow && (
          <p className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> טוען את טופס האשראי של נדרים פלוס...
          </p>
        )}
        <div className="rounded-xl border overflow-hidden bg-white">
          <iframe
            ref={frameRef}
            src={open ? FRAME_URL : 'about:blank'}
            title="נדרים פלוס"
            className="w-full border-0 block"
            style={{ height: height || DEFAULT_HEIGHT }}
            onLoad={() => { if (open) { setLoaded(true); try { frameRef.current?.contentWindow?.postMessage({ Name: 'GetHeight' }, '*'); } catch { /* ignore */ } } }}
          />
        </div>
        {loadSlow && !loaded && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-300 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            החלון של נדרים לא נטען. ייתכן שהאתר של נדרים חסום בסינון במחשב הזה. אפשר לסגור, לעבור ל&quot;אשראי: ידני&quot; בראש הקופה ולחייב בטאבלט.
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}
        {noAnswer && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-300 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            לא התקבלה תשובה מנדרים. לפני שמנסים שוב — בדקו במערכת של נדרים אם העסקה עברה, כדי לא לחייב פעמיים.
          </div>
        )}
        {success && (
          <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 font-medium">
            <CheckCircle2 className="w-4 h-4" /> העסקה אושרה — שומר את המכירה...
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy} className="flex-1">ביטול</Button>
          <Button onClick={charge} disabled={busy || !loaded} className="flex-1 h-12 text-lg font-bold bg-blue-600 hover:bg-blue-700">
            {paying ? <Loader2 className="w-5 h-5 animate-spin" /> : `חייב ₪${Number(amount || 0).toFixed(2)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
