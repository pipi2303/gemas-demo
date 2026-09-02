import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Sun, Moon } from 'lucide-react';

export function ThemeSwitcher() {
  const { theme, setTheme } = useApp();

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
      mode: theme.mode === 'light' ? 'dark' : 'light'
    });
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
      title={theme.mode === 'light' ? 'Mode Gelap' : 'Mode Terang'}
    >
      {theme.mode === 'light' ? (
        <Moon className="w-6 h-6 text-gray-600" />
      ) : (
        <Sun className="w-6 h-6 text-yellow-500" />
      )}
    </button>
  );
}
