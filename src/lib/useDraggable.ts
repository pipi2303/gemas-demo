import { useState, useRef } from 'react';

export function useDraggable() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const start = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    start.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
    const onMove = (ev: MouseEvent) => {
      if (!start.current) return;
      setOffset({ x: start.current.ox + ev.clientX - start.current.mx, y: start.current.oy + ev.clientY - start.current.my });
    };
    const onUp = () => {
      start.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return { offset, onMouseDown };
}
