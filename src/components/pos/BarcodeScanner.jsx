import { useEffect, useRef, useState } from 'react';
import { Barcode } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

/**
 * Hidden Input Trap pattern — the only reliable way to capture hardware
 * barcode scanners on Android WebViews where global keydown events are
 * masked as 'Unidentified' composition events.
 *
 * A visually hidden input aggressively holds focus when enabled.
 * The scanner types into it and sends Enter, which we intercept to
 * read the full barcode value directly from e.target.value.
 */
export default function BarcodeScanner({ variants, groups, onVariantFound, enabled }) {
  const inputRef = useRef(null);
  const { toast } = useToast();
  const [lastScanned, setLastScanned] = useState('');

  // Focus the hidden input whenever enabled becomes true
  useEffect(() => {
    if (enabled) {
      inputRef.current?.focus();
    }
  }, [enabled]);

  const processCode = (code) => {
    if (!code || code.length < 2) return;

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
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const code = e.target.value.trim();
      e.target.value = '';
      processCode(code);
    }
  };

  if (!enabled) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-300 rounded-xl text-green-700 text-xs font-semibold animate-pulse">
      <input
        ref={inputRef}
        type="text"
        className="absolute opacity-0 w-0 h-0"
        onKeyDown={handleKeyDown}
        onBlur={(e) => { if (enabled) e.target.focus(); }}
        autoComplete="off"
        readOnly={false}
      />
      <Barcode className="w-4 h-4" />
      מצב סריקה פעיל
      {lastScanned && <span className="opacity-60">· {lastScanned}</span>}
    </div>
  );
}