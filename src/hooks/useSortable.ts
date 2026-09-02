import { useState, useMemo } from 'react';

type SortDir = 'asc' | 'desc';

export function useSortable<T>(data: T[]) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const requestSort = (key: keyof T) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else if (typeof av === 'boolean' && typeof bv === 'boolean') {
        cmp = Number(av) - Number(bv);
      } else {
        cmp = String(av).localeCompare(String(bv), 'id', { numeric: true });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  return { sorted, sortKey, sortDir, requestSort };
}
