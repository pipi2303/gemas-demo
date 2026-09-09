import type { PermissionKey, UserRole } from '../app/types';

export type { PermissionKey };
export type RolePermSet = PermissionKey[];
export interface ModulePermission {
  module: string;
  emoji: string;
  admin: RolePermSet;
  majelis: RolePermSet;
  ketuaSektor: RolePermSet;
  operator: RolePermSet;
}

const A: RolePermSet    = ['view','create','edit','delete','approve','export'];
const NONE: RolePermSet = [];
const R: RolePermSet    = ['view'];
const REX: RolePermSet  = ['view','export'];
const CRD: RolePermSet  = ['view','create','edit','delete'];
const CRDA: RolePermSet = ['view','create','edit','delete','approve'];
const CRDAX: RolePermSet = ['view','create','edit','delete','approve','export'];

export const DEFAULT_PERMISSIONS: ModulePermission[] = [
  { module: 'Dashboard',                    emoji: '📊', admin: A, majelis: R,     ketuaSektor: R,    operator: R    },
  { module: 'Database Warga',               emoji: '👥', admin: A, majelis: CRDA,  ketuaSektor: R,    operator: R    },
  { module: 'Data Keluarga',                emoji: '🏠', admin: A, majelis: CRD,   ketuaSektor: R,    operator: NONE },
  { module: 'Sektor Pelayanan',             emoji: '📍', admin: A, majelis: CRD,   ketuaSektor: CRD,  operator: R    },
  { module: 'Sakramen & Atestasi',          emoji: '✝️', admin: A, majelis: CRDA,  ketuaSektor: NONE, operator: NONE },
  { module: 'Peribadahan & Kegiatan',       emoji: '⛪', admin: A, majelis: CRDA,  ketuaSektor: R,    operator: R    },
  { module: 'Keuangan & Persembahan (Modul Klasik)',       emoji: '💰', admin: A, majelis: CRDAX, ketuaSektor: NONE, operator: NONE },
  { module: 'Laporan & Direktori',          emoji: '📋', admin: A, majelis: REX,   ketuaSektor: REX,  operator: NONE },
  { module: 'Pelayanan Kasih & Komunikasi', emoji: '❤️', admin: A, majelis: CRD,   ketuaSektor: R,    operator: NONE },
  { module: 'Manajemen Aset',               emoji: '📦', admin: A, majelis: CRD,   ketuaSektor: NONE, operator: NONE },
  { module: 'Admin Sistem',                 emoji: '🔐', admin: A, majelis: NONE,  ketuaSektor: NONE, operator: NONE },
  { module: 'Finance Add-on (Standar Akuntansi)',    emoji: '🏛️', admin: A, majelis: CRDAX, ketuaSektor: NONE, operator: NONE },
];

export const PAGE_MODULE: Record<string, string> = {
  dashboard:             'Dashboard',
  members:               'Database Warga',
  families:              'Data Keluarga',
  sectors:               'Sektor Pelayanan',
  sacraments:            'Sakramen & Atestasi',
  attestations:          'Sakramen & Atestasi',
  'sensus-report':       'Laporan & Direktori',
  'report-center':       'Laporan & Direktori',
  'worship-schedules':   'Peribadahan & Kegiatan',
  'e-warta':             'Peribadahan & Kegiatan',
  'sermon-archive':      'Peribadahan & Kegiatan',
  liturgy:               'Peribadahan & Kegiatan',
  events:                'Peribadahan & Kegiatan',
  ministries:            'Peribadahan & Kegiatan',
  livestream:            'Peribadahan & Kegiatan',
  attendance:            'Peribadahan & Kegiatan',
  'church-finance':      'Keuangan & Persembahan (Modul Klasik)',
  offerings:             'Keuangan & Persembahan (Modul Klasik)',
  financial:             'Keuangan & Persembahan (Modul Klasik)',
  assets:                'Manajemen Aset',
  'room-booking':        'Manajemen Aset',
  'resource-library':    'Laporan & Direktori',
  'service-requests':    'Pelayanan Kasih & Komunikasi',
  'aid-distribution':    'Pelayanan Kasih & Komunikasi',
  prayers:               'Pelayanan Kasih & Komunikasi',
  announcements:         'Peribadahan & Kegiatan',
  users:                 'Admin Sistem',
  roles:                 'Admin Sistem',
  backup:                'Admin Sistem',
  data:                  'Admin Sistem',
  'master-data':         'Admin Sistem',
  activity:              'Admin Sistem',
  'finance-dashboard':   'Finance Add-on (Standar Akuntansi)',
  'finance-addon':       'Finance Add-on (Standar Akuntansi)',
  'finance-master-data': 'Finance Add-on (Standar Akuntansi)',
  'finance-budget':      'Finance Add-on (Standar Akuntansi)',
  'finance-transaction': 'Finance Add-on (Standar Akuntansi)',
  'finance-ledger':      'Finance Add-on (Standar Akuntansi)',
  'finance-approval':    'Finance Add-on (Standar Akuntansi)',
  'finance-reconciliation': 'Finance Add-on (Standar Akuntansi)',
  'finance-period-closing': 'Finance Add-on (Standar Akuntansi)',
  'finance-reports':     'Finance Add-on (Standar Akuntansi)',
};

export function buildCan(matrix: ModulePermission[], role: UserRole) {
  const roleKey = role === 'Ketua Sektor'
    ? 'ketuaSektor'
    : (role.toLowerCase() as 'admin' | 'majelis' | 'operator');
  // Terima id submenu (mis. 'liturgy') ATAU nama modul langsung (kompatibel-mundur):
  // resolve dulu lewat PAGE_MODULE, kalau bukan kunci submenu yang dikenal anggap
  // sudah berupa nama modul apa adanya.
  return (pageOrModule: string, permission: PermissionKey): boolean => {
    const moduleName = PAGE_MODULE[pageOrModule] ?? pageOrModule;
    const mod = matrix.find(m => m.module === moduleName);
    if (!mod) return role === 'Admin';
    return (mod[roleKey] as RolePermSet).includes(permission);
  };
}

// ─── Submenu (page) level — dipakai Custom Role ────────────────────────────────
// PAGE_MODULE di atas sudah memetakan tiap halaman/submenu ke satu modul kasar.
// Untuk Custom Role, hak akses sekarang disimpan per SUBMENU (bukan per modul),
// supaya satu role bisa, misalnya, cuma lihat "Tata Ibadah" tapi kelola penuh
// "Kalender Kegiatan" walau keduanya sama-sama di bawah modul "Peribadahan &
// Kegiatan". Role bawaan (Admin/Majelis/Ketua Sektor/Operator) TETAP di level
// modul seperti sebelumnya (lihat buildCan di atas) — granularitas submenu ini
// khusus Custom Role.
export const PAGE_LABEL: Record<string, string> = {
  dashboard:             'Dashboard',
  members:               'Database Warga',
  families:              'Data Keluarga Jemaat',
  sectors:               'Sektor Pelayanan',
  attestations:          'Atestasi & Mutasi',
  'sensus-report':       'Laporan Sensus Jemaat',
  'report-center':       'Pusat Laporan Konsolidasi',
  'worship-schedules':   'Jadwal & Petugas Ibadah',
  'e-warta':             'E-Warta Jemaat',
  'sermon-archive':      'Arsip Khotbah & Renungan',
  liturgy:               'Tata Ibadah',
  sacraments:            'Peribadahan',
  events:                'Kalender Kegiatan',
  ministries:            'Pelkat & Komisi',
  livestream:            'Livestream & Reminder',
  attendance:            'Presensi Ibadah (QR)',
  announcements:         'Warta & Pengumuman',
  'church-finance':      'Kas & Rekening Gereja',
  offerings:             'Persembahan Digital',
  financial:             'Jurnal & Neraca Kas',
  assets:                'Manajemen Aset',
  'room-booking':        'Peminjaman Ruangan',
  'resource-library':    'Perpustakaan Digital',
  'service-requests':    'Permohonan Diakonia',
  'aid-distribution':    'Distribusi Bantuan',
  prayers:               'Pokok & Pergumulan Doa',
  users:                 'List User',
  roles:                 'Manajemen Hak Akses',
  backup:                'Backup & Restore',
  data:                  'Pusat Manajemen Data',
  'master-data':         'Master Data',
  activity:              'Log Aktivitas',
  'finance-dashboard':   'Dashboard Finance',
  'finance-addon':       'Ringkasan',
  'finance-master-data': 'Master Data Finance',
  'finance-budget':      'Budget / RKA',
  'finance-transaction': 'Transaksi & Voucher',
  'finance-approval':    'Verifikasi & Persetujuan',
  'finance-ledger':      'Buku Besar (GL)',
  'finance-reconciliation': 'Rekonsiliasi Bank',
  'finance-period-closing': 'Penutupan Periode',
  'finance-reports':     'Laporan Keuangan',
};

export interface PageGroup {
  module: string;
  emoji: string;
  pages: { key: string; label: string }[];
}

/** Daftar submenu dikelompokkan per modul (urutan modul & emoji ikut DEFAULT_PERMISSIONS),
 *  dipakai untuk merender tabel "Hak Akses per Modul" di editor Custom Role. */
export function getPageGroups(): PageGroup[] {
  return DEFAULT_PERMISSIONS
    .map(mod => ({
      module: mod.module,
      emoji: mod.emoji,
      pages: Object.keys(PAGE_MODULE)
        .filter(key => PAGE_MODULE[key] === mod.module)
        .map(key => ({ key, label: PAGE_LABEL[key] ?? key })),
    }))
    .filter(g => g.pages.length > 0);
}

/** Ambil izin submenu tertentu dari modulePermissions milik sebuah Custom Role.
 *  Kompatibel-mundur: kalau role belum pernah disimpan ulang sejak fitur ini ada,
 *  modulePermissions masih berkunci NAMA MODUL (format lama) — di situ, izin
 *  submenu jatuh-balik (fallback) ke izin modul induknya, supaya role lama TIDAK
 *  kehilangan akses sampai role itu dibuka & disimpan ulang lewat editor baru. */
export function getPagePermission(
  modulePermissions: Record<string, string[]> | undefined,
  pageKey: string
): PermissionKey[] {
  const mp = modulePermissions ?? {};
  if (mp[pageKey]) return mp[pageKey] as PermissionKey[];
  const mod = PAGE_MODULE[pageKey];
  return (mod ? (mp[mod] as PermissionKey[]) : undefined) ?? [];
}

