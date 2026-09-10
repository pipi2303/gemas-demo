import React from 'react';
import { Info } from 'lucide-react';

interface ModuleSeparationNoteProps {
  /**
   * 'legacy'          → Kas & Rekening Gereja, Jurnal & Neraca Kas — tidak
   *                      punya jalur apapun ke Finance Add-on.
   * 'legacy-offerings'→ Persembahan & QRIS — sama seperti 'legacy', TAPI ada
   *                      satu tombol opsional "Setor ke Buku Besar" yang bisa
   *                      mengirim salinan data ke Finance Add-on sebagai
   *                      draft. Tombol ini manual (bukan otomatis/real-time)
   *                      dan modul ini tetap berjalan normal walau tombol itu
   *                      tidak pernah dipakai atau Finance Add-on bermasalah.
   * 'addon'           → Finance Add-on (Ringkasan/Dashboard Finance).
   */
  variant: 'legacy' | 'legacy-offerings' | 'addon';
  className?: string;
}

/**
 * Catatan kecil yang menjelaskan bahwa modul Keuangan & Persembahan (Modul
 * Klasik) dan Finance Add-on (Standar Akuntansi) SENGAJA punya penyimpanan
 * data & endpoint API sendiri-sendiri, jadi masing-masing tetap berjalan
 * normal meskipun modul yang satunya dimatikan/bermasalah. Ini keputusan
 * desain, bukan bug.
 */
export function ModuleSeparationNote({ variant, className = '' }: ModuleSeparationNoteProps) {
  const TEXT: Record<ModuleSeparationNoteProps['variant'], string> = {
    legacy:
      'Modul ini (Keuangan & Persembahan — Modul Klasik) menyimpan datanya sendiri dan berjalan independen dari Finance Add-on — tidak ada jalur otomatis di antara keduanya. Kalau gereja memakai Finance Add-on sebagai pembukuan resmi, transaksi di sini perlu dicatat ulang secara manual di sana.',
    'legacy-offerings':
      'Modul ini menyimpan datanya sendiri dan berjalan independen dari Finance Add-on. Ada satu jembatan opsional — tombol "Setor ke Buku Besar" — yang bisa mengirim salinan persembahan ke Finance Add-on sebagai transaksi draft (masih perlu diverifikasi terpisah di sana). Ini manual, bukan sinkronisasi otomatis: modul ini tetap berfungsi penuh walau tombol itu tidak pernah dipakai atau Finance Add-on sedang bermasalah.',
    addon:
      'Finance Add-on menyimpan datanya sendiri (skema akuntansi terpisah) dan berjalan independen dari modul Keuangan & Persembahan (Modul Klasik). Persembahan/QRIS bisa dikirim ke sini lewat tombol "Setor ke Buku Besar" di modul Persembahan, tapi itu satu-satunya jalur, sifatnya manual, dan Finance Add-on tetap berjalan normal tanpa jalur itu.',
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
