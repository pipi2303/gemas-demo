import { useEffect } from 'react';

export function useUnsavedChanges(isDirty: boolean, message = 'Anda memiliki perubahan yang belum disimpan. Yakin ingin meninggalkan halaman?') {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, message]);
}
