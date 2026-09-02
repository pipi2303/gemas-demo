import { useState, useCallback, useRef, useEffect } from 'react';

const MIN_WIDTH = 60;
const STORAGE_PREFIX = 'col-widths:';

/**
 * Resizable table columns dengan lebar tersimpan per-browser (localStorage).
 * `storageKey` harus unik per tabel (mis. 'member-database-main').
 * `defaults` map key kolom -> lebar awal (px).
 */
export function useResizableColumns(storageKey: string, defaults: Record<string, number>) {
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + storageKey);
      return saved ? { ...defaults, ...JSON.parse(saved) } : { ...defaults };
    } catch {
      return { ...defaults };
    }
  });

  const dragRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  const onMouseMove = useCallback((e: MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = Math.max(MIN_WIDTH, drag.startWidth + (e.clientX - drag.startX));
    setWidths(prev => (prev[drag.key] === next ? prev : { ...prev, [drag.key]: next }));
  }, []);

  const onMouseUp = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    try {
      localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(widthsRef.current));
    } catch { /* ignore quota/private-mode errors */ }
  }, [storageKey]);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const startResize = useCallback((key: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { key, startX: e.clientX, startWidth: widthsRef.current[key] ?? defaults[key] ?? 120 };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [defaults]);

  const resetWidths = useCallback(() => {
    setWidths({ ...defaults });
    try { localStorage.removeItem(STORAGE_PREFIX + storageKey); } catch { /* ignore */ }
  }, [defaults, storageKey]);

  return { widths, startResize, resetWidths };
}
