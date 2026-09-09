import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Sun, Moon } from 'lucide-react';

/**
 * Tombol ganti mode terang/gelap. Sebelumnya komponen ini ada di kode tapi
 * tidak pernah dipasang di UI manapun (dead code) — padahal state tema
 * (theme/setTheme di AppContext), variabel CSS mode gelap (src/styles/theme.css),
 * dan penyimpanan preferensi ke localStorage sudah lengkap tersedia. Sekarang
 * dipasang di header DashboardLayout supaya fitur ini benar-benar bisa dipakai.
 */
export function ThemeSwitcher({ dark = false }: { dark?: boolean }) {
  const { theme, setTheme } = useApp();
  const [isHover, setIsHover] = useState(false);

  useEffect(() => {
    if (theme.mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme({
      ...theme,
      mode: theme.mode === 'light' ? 'dark' : 'light',
    });
  };

  const isDarkMode = theme.mode === 'dark';
  const label = isDarkMode ? 'Mode Terang' : 'Mode Gelap';

  return (
    <button
      onClick={toggleTheme}
      style={{
        position: 'relative',
        padding: '7px',
        borderRadius: 9999,
        border: dark ? '1px solid rgba(255,255,255,0.15)' : 'none',
        background: dark
          ? isHover ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'
          : isHover ? '#e8f3f9' : 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background .15s, border-color .15s',
      }}
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      data-tooltip={label}
      title={label}
      aria-label={label}
    >
      {isDarkMode ? (
        <Sun style={{ width: 18, height: 18, color: dark ? '#ffffff' : '#f59e0b' }} />
      ) : (
        <Moon style={{ width: 18, height: 18, color: dark ? '#ffffff' : '#374151' }} />
      )}
    </button>
  );
}
