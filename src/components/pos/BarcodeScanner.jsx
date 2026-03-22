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

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      // Ignore if the user is typing in an input/textarea
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === 'Enter') {
        const code = bufferRef.current.trim();
        bufferRef.current = '';
        clearTimeout(timerRef.current);

        if (code.length < 2) return;

        // Search by sku or barcode field on variants
        const variant = variants.find(v =>
          (v.sku && v.sku === code) ||
          (v.barcode && v.barcode === code) ||
          (v.barcode && v.barcode.slice(-4) === code)
        );

        if (variant) {
          const group = groups.find(g => g.id === variant.group_id);
          if (group) {
            setLastScanned(code);
            onVariantFound(variant, group);
            toast({ title: `✅ נסרק: ${group.name}`, duration: 1500 });
          }
        } else {
          toast({ title: `⛔ ברקוד לא נמצא: ${code}`, duration: 2000, variant: 'destructive' });
        }
        return;
      }

      // Accumulate characters
      if (e.key.length === 1) {
        bufferRef.current += e.key;
        clearTimeout(timerRef.current);
        // Clear buffer if user types slowly (>300ms between chars = human typing)
        timerRef.current = setTimeout(() => {
          bufferRef.current = '';
        }, 300);
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
    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-300 rounded-xl text-green-700 text-xs font-semibold animate-pulse">
      <Barcode className="w-4 h-4" />
      מצב סריקה פעיל
      {lastScanned && <span className="opacity-60">· {lastScanned}</span>}
    </div>
  );
}