import React, { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface SearchDropdownProps<T> {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  items: T[];
  filterFn: (item: T, query: string) => boolean;
  renderResult: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  maxResults?: number;
  className?: string;
  inputStyle?: React.CSSProperties;
  onClear?: () => void;
}

export function SearchDropdown<T>({
  value, onChange, placeholder = 'Cari...',
  items, filterFn, renderResult, onSelect,
  maxResults = 8, className = '', inputStyle = {}, onClear,
}: SearchDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = value.trim().length > 0
    ? items.filter(i => filterFn(i, value)).slice(0, maxResults)
    : [];

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }} className={className}>
      <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#94a3b8', pointerEvents: 'none' }} />
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => value.trim().length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{
          width: '100%', paddingLeft: 34, paddingRight: value ? 32 : 12,
          paddingTop: 7, paddingBottom: 7,
          border: `1px solid ${value ? '#144f6b' : '#e2e8f0'}`,
          borderRadius: 10, fontSize: 13, outline: 'none',
          background: '#fafafa', boxSizing: 'border-box',
          ...inputStyle,
        }}
      />
      {value && (
        <button
          onClick={() => { onChange(''); setOpen(false); onClear?.(); }}
          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2, borderRadius: '50%', display: 'flex' }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      )}

      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4,
          maxHeight: 300, overflowY: 'auto',
        }}>
          {results.map((item, i) => (
            <div
              key={i}
              onMouseDown={e => { e.preventDefault(); onSelect(item); setOpen(false); }}
              style={{
                padding: '9px 12px', cursor: 'pointer',
                borderBottom: i < results.length - 1 ? '1px solid #f1f5f9' : 'none',
                transition: 'background .1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0f7fb')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {renderResult(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
