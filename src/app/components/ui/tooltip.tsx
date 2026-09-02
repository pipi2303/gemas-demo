import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';

// ── Global tooltip root ────────────────────────────────────────────────────────
// Render sekali di App.tsx. Mendengarkan data-tooltip di seluruh DOM.
export function TooltipRoot() {
  const [tip, setTip] = useState<{ text: string; top: number; left: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const enter = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('[data-tooltip]') as HTMLElement | null;
      if (!el) return;
      const text = el.getAttribute('data-tooltip') || '';
      if (!text) return;
      const truncateOnly = el.hasAttribute('data-tooltip-truncate');
      if (truncateOnly && el.scrollWidth <= el.clientWidth) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const r = el.getBoundingClientRect();
        setTip({ text, top: r.top - 8, left: r.left + r.width / 2 });
      }, 220);
    };

    const leave = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('[data-tooltip]');
      if (!el) return;
      clearTimeout(timer.current);
      setTip(null);
    };

    const scroll = () => { clearTimeout(timer.current); setTip(null); };

    document.addEventListener('mouseover', enter);
    document.addEventListener('mouseout', leave);
    document.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('mouseover', enter);
      document.removeEventListener('mouseout', leave);
      document.removeEventListener('scroll', scroll, true);
      clearTimeout(timer.current);
    };
  }, []);

  if (!tip) return null;

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed',
        top: tip.top,
        left: tip.left,
        transform: 'translate(-50%, -100%)',
        zIndex: 99999,
        pointerEvents: 'none',
        paddingBottom: 6,
      }}
    >
      <div style={{
        background: '#384959',
        color: '#fff',
        borderRadius: 6,
        padding: '5px 10px',
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1.45,
        maxWidth: 260,
        wordBreak: 'break-word',
        whiteSpace: 'pre-line',
        boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        {tip.text}
      </div>
    </div>,
    document.body,
  );
}

// ── Programmatic Tooltip (untuk kasus khusus) ─────────────────────────────────
interface TooltipProps {
  label: string;
  children: React.ReactElement;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  onlyIfTruncated?: boolean;
}

export function Tooltip({ label, children, placement = 'top', delay = 220, onlyIfTruncated = false }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const calcPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const G = 8;
    switch (placement) {
      case 'bottom': return { top: r.bottom + G, left: r.left + r.width / 2 };
      case 'left':   return { top: r.top + r.height / 2, left: r.left - G };
      case 'right':  return { top: r.top + r.height / 2, left: r.right + G };
      default:       return { top: r.top - G, left: r.left + r.width / 2 };
    }
  }, [placement]);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      const el = triggerRef.current;
      if (!el) return;
      if (onlyIfTruncated && el.scrollWidth <= el.clientWidth) return;
      const c = calcPos();
      if (c) { setCoords(c); setVisible(true); }
    }, delay);
  }, [delay, onlyIfTruncated, calcPos]);

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const transformMap: Record<string, string> = {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)',
  };

  const child = React.cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      (triggerRef as React.MutableRefObject<HTMLElement | null>).current = node;
      const orig = (children as any).ref;
      if (typeof orig === 'function') orig(node);
      else if (orig && 'current' in orig) orig.current = node;
    },
    onMouseEnter: (e: React.MouseEvent) => { show(); children.props.onMouseEnter?.(e); },
    onMouseLeave: (e: React.MouseEvent) => { hide(); children.props.onMouseLeave?.(e); },
    onFocus:      (e: React.FocusEvent) => { show(); children.props.onFocus?.(e); },
    onBlur:       (e: React.FocusEvent) => { hide(); children.props.onBlur?.(e); },
  });

  return (
    <>
      {child}
      {visible && label && ReactDOM.createPortal(
        <div style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
          transform: transformMap[placement],
          zIndex: 99999,
          pointerEvents: 'none',
          paddingBottom: placement === 'top' ? 6 : 0,
          paddingTop: placement === 'bottom' ? 6 : 0,
        }}>
          <div style={{
            background: '#384959',
            color: '#fff',
            borderRadius: 6,
            padding: '5px 10px',
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1.45,
            maxWidth: 260,
            wordBreak: 'break-word',
            boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            {label}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
