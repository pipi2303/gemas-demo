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
  { module: 'Keuangan & Persembahan',       emoji: '💰', admin: A, majelis: CRDAX, ketuaSektor: NONE, operator: NONE },
  { module: 'Laporan & Direktori',          emoji: '📋', admin: A, majelis: REX,   ketuaSektor: REX,  operator: NONE },
  { module: 'Pelayanan Kasih & Komunikasi', emoji: '❤️', admin: A, majelis: CRD,   ketuaSektor: R,    operator: NONE },
  { module: 'Manajemen Aset',               emoji: '📦', admin: A, majelis: CRD,   ketuaSektor: NONE, operator: NONE },
  { module: 'Admin Sistem',                 emoji: '🔐', admin: A, majelis: NONE,  ketuaSektor: NONE, operator: NONE },
  { module: 'Keuangan (Finance Add-on)',    emoji: '🏛️', admin: A, majelis: CRDAX, ketuaSektor: NONE, operator: NONE },
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
  'church-finance':      'Keuangan & Persembahan',
  offerings:             'Keuangan & Persembahan',
  financial:             'Keuangan & Persembahan',
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
  'finance-addon':       'Keuangan (Finance Add-on)',
};

export function buildCan(matrix: ModulePermission[], role: UserRole) {
  const roleKey = role === 'Ketua Sektor'
    ? 'ketuaSektor'
    : (role.toLowerCase() as 'admin' | 'majelis' | 'operator');
  return (module: string, permission: PermissionKey): boolean => {
    const mod = matrix.find(m => m.module === module);
    if (!mod) return role === 'Admin';
    return (mod[roleKey] as RolePermSet).includes(permission);
  };
}
