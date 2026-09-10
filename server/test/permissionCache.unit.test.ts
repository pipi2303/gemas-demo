// Unit test murni (tanpa koneksi DB, mirip financeCrud.unit.test.ts) untuk logic
// hak akses per SUBMENU yang baru ditambahkan di permissionCache.ts. getMatrix()
// mencoba baca 'rbac_permissions' dari DB tapi punya try/catch yang jatuh ke
// DEFAULT_MATRIX kalau gagal — jadi test ini jalan tanpa DATABASE_URL sama sekali,
// persis seperti financeCrud.unit.test.ts.
import { describe, it, expect } from 'vitest';
import { checkPagePermission, checkPermission } from '../lib/permissionCache.js';

describe('checkPagePermission — role bawaan (dicek di level modul lewat PAGE_MODULE)', () => {
  it('Admin selalu true tanpa perlu cek apa pun', async () => {
    expect(await checkPagePermission('Admin', 'finance-transaction', 'delete')).toBe(true);
  });

  it('Operator boleh lihat halaman "members" (modul Database Warga = R) tapi tidak boleh create', async () => {
    expect(await checkPagePermission('Operator', 'members', 'view')).toBe(true);
    expect(await checkPagePermission('Operator', 'members', 'create')).toBe(false);
  });

  it('dua submenu beda di bawah modul yang sama tetap dapat izin modul yang sama utk role bawaan', async () => {
    // 'sacraments' dan 'attestations' sama-sama di bawah modul "Sakramen & Atestasi"
    // (Majelis = CRDA) — role BAWAAN tidak granular, jadi keduanya harus identik.
    expect(await checkPagePermission('Majelis', 'sacraments', 'approve')).toBe(true);
    expect(await checkPagePermission('Majelis', 'attestations', 'approve')).toBe(true);
    expect(await checkPagePermission('Majelis', 'sacraments', 'export')).toBe(false);
  });

  it('halaman tak dikenal (bukan page-key maupun nama modul) ditolak', async () => {
    expect(await checkPagePermission('Majelis', 'halaman-tidak-ada', 'view')).toBe(false);
  });
});

describe('checkPagePermission — Custom Role granular per submenu', () => {
  const customRoles = [
    {
      name: 'Bendahara Ad-Hoc',
      modulePermissions: {
        // Format BARU (page-keyed): akses penuh cuma di 'liturgy', view-only di 'events'.
        liturgy: ['view', 'create', 'edit', 'delete'],
        events: ['view'],
      },
    },
  ];

  it('submenu yang di-set eksplisit dipakai apa adanya', async () => {
    expect(await checkPagePermission('Bendahara Ad-Hoc', 'liturgy', 'edit', customRoles)).toBe(true);
    expect(await checkPagePermission('Bendahara Ad-Hoc', 'events', 'edit', customRoles)).toBe(false);
    expect(await checkPagePermission('Bendahara Ad-Hoc', 'events', 'view', customRoles)).toBe(true);
  });

  it('submenu yang tidak di-set sama sekali (di bawah modul yang sama) tidak otomatis ikut submenu lain', async () => {
    // 'ministries' juga di bawah modul "Peribadahan & Kegiatan" tapi TIDAK di-set
    // di atas — harus tetap tidak ada akses (bukan ikut 'liturgy' yang full akses).
    expect(await checkPagePermission('Bendahara Ad-Hoc', 'ministries', 'view', customRoles)).toBe(false);
  });

  it('role custom yang tidak ditemukan di daftar dianggap tanpa akses', async () => {
    expect(await checkPagePermission('Peran Tidak Ada', 'liturgy', 'view', customRoles)).toBe(false);
  });
});

describe('checkPagePermission — migrasi otomatis dari format lama (keyed by nama modul)', () => {
  const legacyCustomRoles = [
    {
      name: 'Panitia Lama',
      // Format LAMA (sebelum fitur granular submenu): kunci berupa NAMA MODUL,
      // bukan id submenu — persis seperti tersimpan sebelum fitur ini ada.
      modulePermissions: {
        'Peribadahan & Kegiatan': ['view', 'create', 'edit'],
      },
    },
  ];

  it('semua submenu di bawah modul itu otomatis mewarisi izin modul lama — tidak ada yang hilang', async () => {
    expect(await checkPagePermission('Panitia Lama', 'liturgy', 'edit', legacyCustomRoles)).toBe(true);
    expect(await checkPagePermission('Panitia Lama', 'events', 'create', legacyCustomRoles)).toBe(true);
    expect(await checkPagePermission('Panitia Lama', 'worship-schedules', 'view', legacyCustomRoles)).toBe(true);
    expect(await checkPagePermission('Panitia Lama', 'announcements', 'view', legacyCustomRoles)).toBe(true);
  });

  it('permission yang tidak dimiliki modul lama tetap ditolak di semua submenunya', async () => {
    expect(await checkPagePermission('Panitia Lama', 'liturgy', 'delete', legacyCustomRoles)).toBe(false);
    expect(await checkPagePermission('Panitia Lama', 'events', 'approve', legacyCustomRoles)).toBe(false);
  });

  it('submenu di modul LAIN yang tidak di-set di format lama tetap tanpa akses', async () => {
    expect(await checkPagePermission('Panitia Lama', 'members', 'view', legacyCustomRoles)).toBe(false);
  });
});

describe('checkPermission (berbasis collection) — server-side untuk /api/data/:collection', () => {
  it('Admin selalu true', async () => {
    expect(await checkPermission('Admin', 'members', 'DELETE')).toBe(true);
  });

  it('collection dgn 1 submenu pemilik (mapping bersih) mengikuti izin submenu itu', async () => {
    const customRoles = [{ name: 'Operator Sakramen', modulePermissions: { sacraments: ['view', 'create'] } }];
    expect(await checkPermission('Operator Sakramen', 'sacraments', 'POST', customRoles)).toBe(true);
    expect(await checkPermission('Operator Sakramen', 'sacraments', 'DELETE', customRoles)).toBe(false);
    // sacramentDocuments ikut submenu 'sacraments' yang sama.
    expect(await checkPermission('Operator Sakramen', 'sacramentDocuments', 'POST', customRoles)).toBe(true);
  });

  it('collection kas/keuangan lama (peninggalan modul klasik yang sudah dihapus) mengikuti izin submenu offerings', async () => {
    // Modul klasik "Keuangan & Persembahan" (church-finance/financial) sudah dihapus —
    // collection financialTransactions/pettyCash/dll kini hanya dipetakan ke submenu
    // 'offerings' yang masih hidup (lihat COLLECTION_PAGE, permissionCache.ts).
    const customRoles = [{ name: 'Bendahara Persembahan', modulePermissions: { offerings: ['view', 'create', 'edit'] } }];
    expect(await checkPermission('Bendahara Persembahan', 'offerings', 'POST', customRoles)).toBe(true);
    expect(await checkPermission('Bendahara Persembahan', 'pettyCash', 'PUT', customRoles)).toBe(true);
    expect(await checkPermission('Bendahara Persembahan', 'financialTransactions', 'GET', customRoles)).toBe(true);
  });

  it('role custom tanpa akses ke submenu offerings ditolak di semua collection kas/keuangan lama', async () => {
    const customRoles = [{ name: 'Tanpa Akses Keuangan', modulePermissions: { liturgy: ['view'] } }];
    expect(await checkPermission('Tanpa Akses Keuangan', 'offerings', 'POST', customRoles)).toBe(false);
    expect(await checkPermission('Tanpa Akses Keuangan', 'pettyCash', 'GET', customRoles)).toBe(false);
  });

  it('collection yang tidak dikenal (tidak ada di COLLECTION_PAGE) hanya boleh Admin', async () => {
    expect(await checkPermission('Majelis', 'collectionEksotisTidakDikenal', 'GET')).toBe(false);
    expect(await checkPermission('Admin', 'collectionEksotisTidakDikenal', 'GET')).toBe(true);
  });
});
