import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Delete, Loader2 } from 'lucide-react';

/**
 * 4-digit code pad. onSubmit(code) → true when accepted, or an error message string.
 * Works with the on-screen keys and with a keyboard (digits / Backspace / Enter).
 */
export default function PinPadDialog({ title, subtitle, onSubmit, onClose }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (code) => {
    if (code.length !== 4 || busy) return;
    setBusy(true);
    try {
      const res = await onSubmit(code);
      if (res !== true) {
        setError(typeof res === 'string' ? res : 'קוד שגוי');
        setPin('');
      }
    } finally {
      setBusy(false);
    }
  };

  const press = (d) => {
    if (busy || pin.length >= 4) return;
    setError('');
    const next = pin + d;
    setPin(next);
    if (next.length === 4) setTimeout(() => submit(next), 120);
  };
  const back = () => { setError(''); setPin(p => p.slice(0, -1)); };

  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); back(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">{title}</DialogTitle>
        </DialogHeader>
        {subtitle && <p className="text-center text-sm text-gray-500 -mt-2">{subtitle}</p>}

        <div className="flex justify-center gap-3 my-2" dir="ltr">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-xl font-bold transition-colors ${
              error ? 'border-red-400 bg-red-50' : pin.length > i ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300'
            }`}>
              {pin.length > i ? '●' : ''}
            </div>
          ))}
        </div>
        <p className={`text-center text-sm h-5 ${error ? 'text-red-600' : 'text-transparent'}`}>{error || '.'}</p>

        <div className="grid grid-cols-3 gap-2" dir="ltr">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
            <button key={d} onClick={() => press(d)} className="h-16 rounded-2xl bg-gray-100 text-2xl font-bold text-gray-800 hover:bg-gray-200 active:scale-95 transition">
              {d}
            </button>
          ))}
          <div />
          <button onClick={() => press('0')} className="h-16 rounded-2xl bg-gray-100 text-2xl font-bold text-gray-800 hover:bg-gray-200 active:scale-95 transition">0</button>
          <button onClick={back} className="h-16 rounded-2xl bg-gray-50 text-gray-500 flex items-center justify-center hover:bg-gray-100" title="מחק">
            {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Delete className="w-6 h-6" />}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
