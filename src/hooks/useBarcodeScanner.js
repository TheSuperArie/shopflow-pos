import { useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';

/**
 * Global barcode scanner listener — always on.
 * Detects rapid sequential keystrokes (hardware scanner) terminating with Enter,
 * looks up the product, and calls onAddToCart(variant, group) or onGroupSelect(group).
 */
export function useGlobalBarcodeScanner({ variants, groups, onAddToCart, onGroupSelect }) {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const { toast } = useToast();

  const handleKeyDown = useCallback((e) => {
    // Never intercept when user is typing in an input/textarea/select
    const tag = document.activeElement?.tagName;
    const role = document.activeElement?.getAttribute('role');
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || role === 'listbox') return;

    // Only intercept printable characters and Enter
    if (e.key !== 'Enter' && e.key.length !== 1) return;

    const now = Date.now();
    const delta = now - lastKeyTimeRef.current;
    lastKeyTimeRef.current = now;

    // If long gap since last key, reset buffer (manual typing)
    if (delta > 500 && e.key !== 'Enter') {
      bufferRef.current = '';
    }

    if (e.key === 'Enter') {
      const code = bufferRef.current.trim();
      bufferRef.current = '';
      if (!code || code.length < 3) return;

      e.preventDefault();
      e.stopPropagation();

      // Look up variant by SKU or barcode
      const variant = variants.find(v =>
        (v.sku && (v.sku.toLowerCase() === code.toLowerCase() || v.sku.slice(-4).toLowerCase() === code.toLowerCase())) ||
        (v.barcode && (v.barcode.toLowerCase() === code.toLowerCase() || v.barcode.slice(-4).toLowerCase() === code.toLowerCase()))
      );

      if (variant) {
        const group = groups.find(g => g.id === variant.group_id);
        if (group) {
          onAddToCart(variant, group);
          return;
        }
      }

      // Fallback: search group by barcode
      const group = groups.find(g =>
        g.barcode && (g.barcode.toLowerCase() === code.toLowerCase() || g.barcode.slice(-4).toLowerCase() === code.toLowerCase())
      );
      if (group) {
        const groupVariants = variants.filter(v => v.group_id === group.id && (v.stock || 0) > 0);
        if (groupVariants.length === 1) {
          onAddToCart(groupVariants[0], group);
        } else if (groupVariants.length > 1) {
          onGroupSelect(group);
        }
        return;
      }

      toast({ title: `⛔ ברקוד לא נמצא: ${code}`, duration: 2000, variant: 'destructive' });
      return;
    }

    // Accumulate printable characters
    bufferRef.current += e.key;
  }, [variants, groups, onAddToCart, onGroupSelect, toast]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}