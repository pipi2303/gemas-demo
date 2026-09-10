import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  Search, X, User, Users, Home, MapPin, Calendar, CalendarDays,
  BookOpen, Scroll, Megaphone, Heart, Landmark, QrCode, Building,
  FileText, UserCog, LayoutDashboard, ChevronRight,
  Cross, Gift, Library, DoorOpen
} from 'lucide-react';

interface GlobalSearchProps {
  onNavigate?: (page: string) => void;
  variant?: 'light' | 'dark';
  placeholder?: string;
}

const GROUP_ORDER = [
  'Fitur / Halaman',
  'Data Jemaat',
  'Peribadahan',
  'Kegiatan & Doa',
  'Keuangan',
  'Komisi & Pelayanan',
  'Pelayanan Kasih',
  'Fasilitas & Inventaris',
  'Sakramen & Surat',
  'Admin Sistem',
];

const MAX_PER_GROUP = 4;

const TYPE_ICON: Record<string, React.ReactNode> = {
  feature:     <LayoutDashboard className="w-4 h-4" />,
  member:      <User className="w-4 h-4" />,
  family:      <Home className="w-4 h-4" />,
  sector:      <MapPin className="w-4 h-4" />,
  worship:     <Calendar className="w-4 h-4" />,
  warta:       <BookOpen className="w-4 h-4" />,
  liturgy:     <Scroll className="w-4 h-4" />,
  event:       <CalendarDays className="w-4 h-4" />,
  prayer:      <Heart className="w-4 h-4" />,
  announcement:<Megaphone className="w-4 h-4" />,
  financial:   <Landmark className="w-4 h-4" />,
  offering:    <QrCode className="w-4 h-4" />,
  building:    <Building className="w-4 h-4" />,
  service:     <Heart className="w-4 h-4" />,
  baptism:     <Cross className="w-4 h-4" />,
  sidi:        <Cross className="w-4 h-4" />,
  marriage:    <Heart className="w-4 h-4" />,
  attestation: <FileText className="w-4 h-4" />,
  ministry:    <Users className="w-4 h-4" />,
  user:        <UserCog className="w-4 h-4" />,
  aid:         <Gift className="w-4 h-4" />,
  resource:    <Library className="w-4 h-4" />,
  roomBooking: <DoorOpen className="w-4 h-4" />,
};

const TYPE_COLOR: Record<string, string> = {
  feature:     '#144f6b',
  member:      '#16a34a',
  family:      '#0891b2',
  sector:      '#7c3aed',
  worship:     '#144f6b',
  warta:       '#0891b2',
  liturgy:     '#7c3aed',
  event:       '#9333ea',
  prayer:      '#dc2626',
  announcement:'#ea580c',
  financial:   '#15803d',
  offering:    '#0891b2',
  building:    '#b45309',
  service:     '#e11d48',
  baptism:     '#144f6b',
  sidi:        '#144f6b',
  marriage:    '#db2777',
  attestation: '#6366f1',
  ministry:    '#0d9488',
  user:        '#475569',
  aid:         '#7c3aed',
  resource:    '#0891b2',
  roomBooking: '#b45309',
};

function groupResults(results: any[]) {
  const grouped: Record<string, any[]> = {};
  results.forEach(r => {
    const g = r.group ?? 'Lainnya';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(r);
  });
  const ordered: { group: string; items: any[]; total: number }[] = [];
  GROUP_ORDER.forEach(g => {
    if (grouped[g]) {
      ordered.push({ group: g, items: grouped[g].slice(0, MAX_PER_GROUP), total: grouped[g].length });
    }
  });
  Object.keys(grouped).forEach(g => {
    if (!GROUP_ORDER.includes(g)) {
      ordered.push({ group: g, items: grouped[g].slice(0, MAX_PER_GROUP), total: grouped[g].length });
    }
  });
  return ordered;
}

export function GlobalSearch({ onNavigate, variant = 'light', placeholder = 'Cari ibadah, warta, KK...' }: GlobalSearchProps) {
  const { globalSearch } = useApp();
  const [query, setQuery] = useState('');
  const [grouped, setGrouped] = useState<{ group: string; items: any[]; total: number }[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDark = variant === 'dark';

  const totalFound = grouped.reduce((acc, g) => acc + g.total, 0);

  useEffect(() => {
    if (query.length >= 2) {
      const raw = globalSearch(query);
      setGrouped(groupResults(raw));
      setIsOpen(true);
      setActiveIndex(-1);
    } else {
      setGrouped([]);
      setIsOpen(false);
    }
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        if (query.length >= 2) setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [query]);

  const flatItems = grouped.flatMap(g => g.items);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen || flatItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleResultClick(flatItems[activeIndex]);
    }
  }, [isOpen, flatItems, activeIndex]);

  const handleResultClick = (result: any) => {
    setIsOpen(false);
    setQuery('');
    if (onNavigate && result.page) onNavigate(result.page);
  };

  const isMac = navigator.platform.toUpperCase().includes('MAC');

  return (
    <div ref={searchRef} className="relative" style={{ width: isDark ? '240px' : '220px' }}>
      {/* Input */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
          style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#94a3b8' }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={e => {
            if (query.length >= 2) setIsOpen(true);
            e.target.style.borderColor = isDark ? '#d4af37' : '#144f6b';
            e.target.style.boxShadow = isDark ? '0 0 0 2px rgba(212,175,55,0.25)' : '0 0 0 2px rgba(20,79,107,0.12)';
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            width: '100%',
            paddingLeft: '2.1rem',
            paddingRight: query ? '2rem' : '3.5rem',
            paddingTop: '0.45rem',
            paddingBottom: '0.45rem',
            background: isDark ? 'rgba(255,255,255,0.08)' : '#f0f7fb',
            border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #b8d5e8',
            borderRadius: '9999px',
            color: isDark ? '#ffffff' : '#0f172a',
            fontSize: '12px',
            outline: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
          onBlur={e => {
            e.target.style.borderColor = isDark ? 'rgba(255,255,255,0.15)' : '#b8d5e8';
            e.target.style.boxShadow = 'none';
          }}
        />
        {query ? (
          <button
            onClick={() => { setQuery(''); setIsOpen(false); inputRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span
            className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono rounded"
            style={{
              color: isDark ? 'rgba(255,255,255,0.5)' : '#94a3b8',
              background: isDark ? 'rgba(255,255,255,0.1)' : '#e2eaf0',
              border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #cdd9e5',
              fontSize: '9.5px',
              padding: '1px 5px',
              lineHeight: '16px',
              whiteSpace: 'nowrap',
            }}
          >
            {isMac ? '⌘K' : 'Ctrl K'}
          </span>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute top-full left-0 right-0 mt-1.5 rounded-xl overflow-hidden z-[9999]"
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            maxHeight: '72vh',
            overflowY: 'auto',
            minWidth: '340px',
            right: 'auto',
          }}
        >
          {grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Search className="w-7 h-7" style={{ color: '#cbd5e1' }} />
              <p style={{ color: '#94a3b8', fontSize: '13px' }}>
                Tidak ada hasil untuk "{query}"
              </p>
            </div>
          ) : (
            <>
              {/* Count bar */}
              <div
                className="px-3 py-1.5"
                style={{ borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}
              >
                <span style={{ color: '#94a3b8', fontSize: '11px' }}>
                  {totalFound} hasil ditemukan
                </span>
              </div>

              {/* Groups */}
              {(() => {
                let flatIdx = 0;
                return grouped.map(({ group, items, total }) => (
                  <div key={group}>
                    {/* Group header */}
                    <div
                      className="px-3 py-1.5 flex items-center gap-2"
                      style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}
                    >
                      <span style={{
                        color: '#144f6b',
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.07em',
                      }}>
                        {group}
                      </span>
                      {total > MAX_PER_GROUP && (
                        <span style={{ color: '#94a3b8', fontSize: '10px' }}>
                          +{total - MAX_PER_GROUP} lainnya
                        </span>
                      )}
                    </div>

                    {/* Items */}
                    {items.map((result, i) => {
                      const currentFlat = flatIdx++;
                      const isActive = activeIndex === currentFlat;
                      const iconColor = TYPE_COLOR[result.type] ?? '#144f6b';
                      const icon = TYPE_ICON[result.type] ?? <Search className="w-4 h-4" />;

                      return (
                        <button
                          key={`${result.type}-${result.data?.id ?? i}`}
                          onClick={() => handleResultClick(result)}
                          onMouseEnter={() => setActiveIndex(currentFlat)}
                          className="w-full text-left flex items-center gap-3 px-3 py-2 transition-all"
                          style={{
                            background: isActive ? '#f0f7fb' : '#ffffff',
                            borderLeft: `2px solid ${isActive ? '#144f6b' : 'transparent'}`,
                            borderBottom: '1px solid #f8fafc',
                          }}
                        >
                          {/* Icon */}
                          <div
                            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                            style={{ background: `${iconColor}18`, color: iconColor }}
                          >
                            {icon}
                          </div>

                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            <p
                              className="truncate font-medium"
                              style={{ color: '#0f172a', fontSize: '12.5px' }}
                            >
                              {result.title}
                            </p>
                            {result.subtitle && (
                              <p
                                className="truncate"
                                style={{ color: '#64748b', fontSize: '11px', marginTop: '1px' }}
                              >
                                {result.subtitle}
                              </p>
                            )}
                          </div>

                          {/* Arrow */}
                          <ChevronRight
                            className="w-3.5 h-3.5 flex-shrink-0"
                            style={{ color: isActive ? '#144f6b' : '#cbd5e1' }}
                          />
                        </button>
                      );
                    })}
                  </div>
                ));
              })()}

              {/* Footer */}
              <div
                className="px-3 py-1.5 flex items-center gap-3"
                style={{ borderTop: '1px solid #f1f5f9', background: '#fafbfc' }}
              >
                <span style={{ color: '#94a3b8', fontSize: '10px' }}>↑↓ navigasi</span>
                <span style={{ color: '#94a3b8', fontSize: '10px' }}>↵ buka</span>
                <span style={{ color: '#94a3b8', fontSize: '10px' }}>Esc tutup</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
