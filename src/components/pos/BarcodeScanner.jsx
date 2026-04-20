import { useEffect, useRef, useState } from 'react';
import { Barcode } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

/**
 * Listens for rapid keystrokes ending in Enter — the standard behaviour of
 * USB/Bluetooth barcode scanners.  When a barcode is detected it looks up the
 * matching variant by `sku` or `barcode` field and calls onVariantFound.
 */
export default function BarcodeScanner({ variants, groups, onVariantFound, enabled }) {
  const bufferRef = useRef('');
  const timerRef  = useRef(null);
  const { toast } = useToast();
  const [lastScanned, setLastScanned] = useState('');
  const [debugKeys, setDebugKeys] = useState([]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      console.log('Scanner Key Received:', e.key, e.keyCode);
      setDebugKeys(prev => [...prev, e.key + ' (Code: ' + e.keyCode + ')'].slice(-12));

      if (e.key === 'Enter' || e.key === 'Tab') {
        const code = bufferRef.current.trim();
        bufferRef.current = '';
        clearTimeout(timerRef.current);

        if (code.length >= 2) {
          e.preventDefault();
        }

        console.log('Scanner buffer on terminator:', code);

        if (code.length < 2) return;

        // Search variant by exact barcode or SKU (case-insensitive, full or last 4)
        const variant = variants.find(v =>
          (v.sku && (v.sku.toLowerCase() === code.toLowerCase() || v.sku.slice(-4).toLowerCase() === code.toLowerCase())) ||
          (v.barcode && (v.barcode.toLowerCase() === code.toLowerCase() || v.barcode.slice(-4).toLowerCase() === code.toLowerCase()))
        );

        if (variant) {
          const group = groups.find(g => g.id === variant.group_id);
          if (group) {
            setLastScanned(code);
            onVariantFound(variant, group);
            toast({ title: `✅ נסרק: ${group.name}`, duration: 1500 });
          }
          return;
        }

        // Fallback: search group by barcode
        const group = groups.find(g =>
          g.barcode && (g.barcode.toLowerCase() === code.toLowerCase() || g.barcode.slice(-4).toLowerCase() === code.toLowerCase())
        );
        if (group) {
          const groupVariants = variants.filter(v => v.group_id === group.id && (v.stock || 0) > 0);
          if (groupVariants.length === 1) {
            setLastScanned(code);
            onVariantFound(groupVariants[0], group);
            toast({ title: `✅ נסרק: ${group.name}`, duration: 1500 });
          } else if (groupVariants.length > 1) {
            setLastScanned(code);
            onVariantFound(null, group);
            toast({ title: `✅ נסרק: ${group.name}`, duration: 1500 });
          }
          return;
        }

        toast({ title: `⛔ ברקוד לא נמצא: ${code}`, duration: 2000, variant: 'destructive' });
        return;
      }

      // Accumulate printable characters (ignore modifier-only keys)
      if (e.key.length === 1) {
        bufferRef.current += e.key;
        clearTimeout(timerRef.current);
        // Clear buffer after 2500ms to handle Bluetooth latency
        timerRef.current = setTimeout(() => {
          console.log('Buffer cleared due to timeout. Current buffer was:', bufferRef.current);
          bufferRef.current = '';
        }, 2500);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timerRef.current);
    };
  }, [enabled, variants, groups, onVariantFound, toast]);

  if (!enabled) return null;

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-300 rounded-xl text-green-700 text-xs font-semibold animate-pulse">
        <Barcode className="w-4 h-4" />
        מצב סריקה פעיל
        {lastScanned && <span className="opacity-60">· {lastScanned}</span>}
      </div>
      <div className="bg-red-600 text-white text-xs rounded-xl p-3 font-mono w-full">
        <div className="font-bold mb-1 text-yellow-300">🔍 DEBUG — Raw Keys (last 12):</div>
        {debugKeys.length === 0 ? (
          <div className="opacity-60">ממתין לקלט מהסורק...</div>
        ) : (
          debugKeys.map((k, i) => (
            <div key={i}>{i + 1}. {k}</div>
          ))
        )}
        <button
          onClick={() => setDebugKeys([])}
          className="mt-2 px-2 py-0.5 bg-white text-red-700 rounded text-xs font-bold"
        >
          נקה
        </button>
      </div>
    </div>
  );
}