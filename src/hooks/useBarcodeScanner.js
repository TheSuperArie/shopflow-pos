import { useEffect, useRef, useCallback } from 'react';

/**
 * Listens for physical barcode scanner input (rapid keystrokes + Enter).
 * Calls onScan(barcode) when a barcode is detected.
 */
export function useBarcodeScanner(onScan, enabled = true) {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const TIMEOUT_MS = 80; // scanners type chars faster than ~80ms apart

  const handleKeyDown = useCallback((e) => {
    if (!enabled) return;

    // Ignore if user is typing in an input/textarea
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const now = Date.now();
    const delta = now - lastKeyTimeRef.current;
    lastKeyTimeRef.current = now;

    if (e.key === 'Enter') {
      const code = bufferRef.current.trim();
      bufferRef.current = '';
      if (code.length >= 3) {
        onScan(code);
      }
      return;
    }

    // If gap is too long, reset buffer (user is typing manually)
    if (delta > 500) {
      bufferRef.current = '';
    }

    if (e.key.length === 1) {
      bufferRef.current += e.key;
    }
  }, [enabled, onScan]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}