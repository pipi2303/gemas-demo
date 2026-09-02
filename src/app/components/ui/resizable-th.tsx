import React from 'react';

/** Handle drag di sisi kanan header kolom untuk resize. Taruh di dalam <th style={{position:'relative'}}>. */
export function ColResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <span
      onMouseDown={onMouseDown}
      onClick={e => e.stopPropagation()}
      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-black/10 active:bg-black/20 z-10"
    />
  );
}
