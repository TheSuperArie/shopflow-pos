import { useEffect, useRef } from 'react';

/**
 * Keyboard-wedge barcode scanner detection (same hardware format as the POS scanner).
 * A scanner "types" very fast and ends with Enter; a person types slowly.
 *
 * - onScan(code)        — a full fast burst ending with Enter
 * - onKey(key)          — slow (human) keys: digits, 'Backspace', 'Enter'
 * - onBurstStart()      — a new key burst began (lets callers snapshot state, so if the
 *                         burst turns out to be a scan, the digits it typed can be undone)
 * Ignored while the user types in an input / textarea / select — except fields marked
 * data-scan-capture: there a scan is still caught (the caller undoes what it typed, using onBurstStart).
 */
const FAST_MS = 60;

export function useScanDetector({ enabled = true, onScan, onKey, onBurstStart }) {
  const handlers = useRef({ onScan, onKey, onBurstStart });
  handlers.current = { onScan, onKey, onBurstStart };
  const buffer = useRef('');
  const last = useRef(0);
  const fastCount = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;

    const handler = (e) => {
      const el = document.activeElement;
      const tag = el?.tagName;
      if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) && !el?.closest?.('[data-scan-capture]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const now = Date.now();
      const gap = now - last.current;
      last.current = now;

      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const code = buffer.current;
        const wasScan = code.length >= 3 && gap < FAST_MS * 2 && fastCount.current >= code.length - 1;
        buffer.current = '';
        fastCount.current = 0;
        if (wasScan) handlers.current.onScan?.(code);
        else handlers.current.onKey?.('Enter');
        return;
      }

      if (e.key === 'Backspace') {
        buffer.current = '';
        fastCount.current = 0;
        handlers.current.onKey?.('Backspace');
        return;
      }

      if (e.key.length !== 1) return;

      if (gap > FAST_MS || !buffer.current) {
        buffer.current = e.key;
        fastCount.current = 0;
        handlers.current.onBurstStart?.();
      } else {
        buffer.current += e.key;
        fastCount.current += 1;
      }
      handlers.current.onKey?.(e.key);
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [enabled]);
}
