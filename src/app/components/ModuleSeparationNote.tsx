import React from 'react';
import { Info } from 'lucide-react';

interface ModuleSeparationNoteProps {
  /**
   * 'legacy-offerings'→ Persembahan Digital (di bawah kategori Finance) —
   *                      menyimpan datanya sendiri, terpisah dari skema
   *                      akuntansi Finance Add-on. Ada satu tombol opsional
   *                      "Setor ke Buku Besar" yang bisa mengirim salinan
   *                      data ke Finance Add-on sebagai draft. Tombol ini
   *                      manual (bukan otomatis/real-time) dan modul ini
   *                      tetap berjalan normal walau tombol itu tidak pernah
   *                      dipakai atau Finance Add-on bermasalah.
   * 'addon'           → Finance Add-on (Ringkasan/Dashboard Finance).
   *
   * Catatan migrasi: modul klasik "Keuangan & Persembahan (Modul Klasik)"
   * (ChurchFinanceHub/FinancialManagement, varian 'legacy' sebelumnya) sudah
   * dihapus beserta kodenya — hanya Persembahan Digital & Finance Add-on
   * yang tersisa.
   */
  variant: 'legacy-offerings' | 'addon';
  className?: string;
}

/**
 * Catatan kecil yang menjelaskan bahwa Persembahan Digital dan Finance
 * Add-on (Standar Akuntansi) SENGAJA punya penyimpanan data & endpoint API
 * sendiri-sendiri, jadi masing-masing tetap berjalan normal meskipun yang
 * satunya bermasalah. Ini keputusan desain, bukan bug.
 */
export function ModuleSeparationNote({ variant, className = '' }: ModuleSeparationNoteProps) {
  const TEXT: Record<ModuleSeparationNoteProps['variant'], string> = {
    'legacy-offerings':
      'Modul ini menyimpan datanya sendiri dan berjalan independen dari Finance Add-on. Ada satu jembatan opsional — tombol "Setor ke Buku Besar" — yang bisa mengirim salinan persembahan ke Finance Add-on sebagai transaksi draft (masih perlu diverifikasi terpisah di sana). Ini manual, bukan sinkronisasi otomatis: modul ini tetap berfungsi penuh walau tombol itu tidak pernah dipakai atau Finance Add-on sedang bermasalah.',
    addon:
      'Finance Add-on menyimpan datanya sendiri (skema akuntansi terpisah) dan berjalan independen dari Persembahan Digital. Persembahan/QRIS bisa dikirim ke sini lewat tombol "Setor ke Buku Besar" di modul Persembahan, tapi itu satu-satunya jalur, sifatnya manual, dan Finance Add-on tetap berjalan normal tanpa jalur itu.',
  };

  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs ${className}`}
      style={{ background: '#f0f7fb', borderColor: '#b8d5e8', color: '#0d1a2d' }}
    >
      <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#144f6b' }} />
      <p className="leading-relaxed">{TEXT[variant]}</p>
    </div>
  );
}
