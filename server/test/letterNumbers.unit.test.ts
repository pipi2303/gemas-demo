// Unit test murni (tanpa DB) untuk modul Surat Menyurat Fase 1 — mirip pola
// permissionCache.unit.test.ts. Menguji dua hal yang paling gampang salah diam-diam:
// 1) formatLetterNumber() — penggantian token pola nomor surat.
// 2) RBAC modul 'Surat Menyurat' benar-benar terdaftar & konsisten di permissionCache.ts
//    (kalau lupa didaftarkan, requirePermission() di server/routes/data.ts akan
//    meloloskan collection-nya tanpa cek izin sama sekali — lihat komentar
//    COLLECTION_PAGE di permissionCache.ts).
import { describe, it, expect } from 'vitest';
import { formatLetterNumber } from '../routes/letterNumbers.js';
import { checkPagePermission } from '../lib/permissionCache.js';

describe('formatLetterNumber', () => {
  it('mengganti semua token dengan benar, termasuk {urut:N} zero-padded', () => {
    const result = formatLetterNumber('{urut:3}/{jenis}/{kodeGereja}/{bulanRomawi}/{tahun}', {
      urut: 12, jenis: 'UND', kodeGereja: 'GPIB-BK', bulanRomawi: 'IX', tahun: '2026', sektor: '',
    });
    expect(result).toBe('012/UND/GPIB-BK/IX/2026');
  });

  it('{urut} tanpa padding menghasilkan angka polos', () => {
    const result = formatLetterNumber('{urut}/{jenis}', {
      urut: 7, jenis: 'SK', kodeGereja: '', bulanRomawi: '', tahun: '', sektor: '',
    });
    expect(result).toBe('7/SK');
  });

  it('token {sektor} ikut diganti kalau dipakai di pola', () => {
    const result = formatLetterNumber('{urut:2}/{sektor}', {
      urut: 3, jenis: '', kodeGereja: '', bulanRomawi: '', tahun: '', sektor: 'Sektor1',
    });
    expect(result).toBe('03/Sektor1');
  });

  it('pola tanpa token sama sekali dikembalikan apa adanya', () => {
    expect(formatLetterNumber('SURAT-TETAP', { urut: 1, jenis: '', kodeGereja: '', bulanRomawi: '', tahun: '', sektor: '' }))
      .toBe('SURAT-TETAP');
  });
});

describe('RBAC modul Surat Menyurat — permissionCache.ts (backend enforcement)', () => {
  it('Admin selalu boleh akses letter-settings', async () => {
    expect(await checkPagePermission('Admin', 'letter-settings', 'edit')).toBe(true);
  });

  it('Majelis boleh edit letter-settings (modul Surat Menyurat = CRD)', async () => {
    expect(await checkPagePermission('Majelis', 'letter-settings', 'view')).toBe(true);
    expect(await checkPagePermission('Majelis', 'letter-settings', 'edit')).toBe(true);
    // CRD tidak termasuk approve/export — modul ini memang belum butuh keduanya di Fase 1
    expect(await checkPagePermission('Majelis', 'letter-settings', 'approve')).toBe(false);
  });

  it('Operator & Ketua Sektor TIDAK boleh akses letter-settings (default NONE)', async () => {
    expect(await checkPagePermission('Operator', 'letter-settings', 'view')).toBe(false);
    expect(await checkPagePermission('Ketua Sektor', 'letter-settings', 'view')).toBe(false);
  });
});
