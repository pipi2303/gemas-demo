import { getAll } from './db.js';

type PermSet = string[];

interface MatrixEntry {
  module: string;
  admin: PermSet; majelis: PermSet; ketuaSektor: PermSet; operator: PermSet;
}

// Default RBAC matrix — mirrors permissions.ts di frontend
const A: PermSet    = ['view','create','edit','delete','approve','export'];
const NONE: PermSet = [];
const R: PermSet    = ['view'];
const REX: PermSet  = ['view','export'];
const CRD: PermSet  = ['view','create','edit','delete'];
const CRDA: PermSet = ['view','create','edit','delete','approve'];
const CRDAX: PermSet = ['view','create','edit','delete','approve','export'];

export const DEFAULT_MATRIX: MatrixEntry[] = [
  { module: 'Dashboard',                    admin: A, majelis: R,     ketuaSektor: R,    operator: R    },
  { module: 'Database Warga',               admin: A, majelis: CRDA,  ketuaSektor: R,    operator: R    },
  { module: 'Data Keluarga',                admin: A, majelis: CRD,   ketuaSektor: R,    operator: NONE },
  { module: 'Sektor Pelayanan',             admin: A, majelis: CRD,   ketuaSektor: CRD,  operator: R    },
  { module: 'Sakramen & Atestasi',          admin: A, majelis: CRDA,  ketuaSektor: NONE, operator: NONE },
  { module: 'Peribadahan & Kegiatan',       admin: A, majelis: CRDA,  ketuaSektor: R,    operator: R    },
  { module: 'Laporan & Direktori',          admin: A, majelis: REX,   ketuaSektor: REX,  operator: NONE },
  { module: 'Pelayanan Kasih & Komunikasi', admin: A, majelis: CRD,   ketuaSektor: R,    operator: NONE },
  { module: 'Manajemen Aset',               admin: A, majelis: CRD,   ketuaSektor: NONE, operator: NONE },
  { module: 'Admin Sistem',                 admin: A, majelis: NONE,  ketuaSektor: NONE, operator: NONE },
  { module: 'Keuangan (Finance Add-on)',    admin: A, majelis: CRDAX, ketuaSektor: NONE, operator: NONE },
  { module: 'Surat Menyurat',               admin: A, majelis: CRDAX, ketuaSektor: NONE, operator: NONE },
];

// Submenu (page) → modul kasar — mirrors PAGE_MODULE di src/lib/permissions.ts.
// Dipakai untuk role BAWAAN (Admin/Majelis/Ketua Sektor/Operator), yang tetap
// dicek di level modul lewat DEFAULT_MATRIX di atas, dan sebagai fallback untuk
// Custom Role yang modulePermissions-nya masih format lama (keyed by nama modul,
// dari sebelum fitur granular submenu ini ada).
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
  offerings:             'Keuangan (Finance Add-on)',
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
  'finance-master-data': 'Keuangan (Finance Add-on)',
  'finance-budget':      'Keuangan (Finance Add-on)',
  'finance-transaction': 'Keuangan (Finance Add-on)',
  'finance-approval':    'Keuangan (Finance Add-on)',
  'finance-ledger':      'Keuangan (Finance Add-on)',
  'finance-reconciliation': 'Keuangan (Finance Add-on)',
  'finance-period-closing': 'Keuangan (Finance Add-on)',
  'finance-reports':     'Keuangan (Finance Add-on)',
  'finance-dashboard':   'Keuangan (Finance Add-on)',
  'letter-settings':     'Surat Menyurat',
  'letters-outgoing':    'Surat Menyurat',
  'letter-templates':    'Surat Menyurat',
  'letters-incoming':    'Surat Menyurat',
};

// Collection → submenu (page). Kebanyakan collection punya SATU submenu pemilik
// yang jelas (array 1 elemen). Modul klasik "Keuangan & Persembahan" (church-finance
// / financial) sudah dihapus — collection kas/keuangan lama di bawah ini kini
// hanya dipetakan ke 'offerings' (satu-satunya submenu yang masih hidup dari
// cluster ini). Data lama tetap dapat dibaca lewat DataManager/BackupRestore,
// namun tidak ada lagi UI untuk menulis ke financialTransactions/pettyCash/dll.
export const COLLECTION_PAGE: Record<string, string[]> = {
  members:               ['members'],
  memberDocuments:       ['members'],
  marriages:             ['members'],
  sectorTransfers:       ['members'],
  families:              ['families'],
  sectors:               ['sectors'],
  sacraments:            ['sacraments'],
  sacramentDocuments:    ['sacraments'],
  attestations:          ['attestations'],
  attestationDocuments:  ['attestations'],
  sensusSnapshots:       ['sensus-report'],
  consolidatedReportSnapshots: ['report-center'],
  liturgy:               ['liturgy'],
  events:                ['events'],
  worshipSchedules:      ['worship-schedules'],
  ministries:            ['ministries'],
  attendance:            ['attendance'],
  announcements:         ['announcements'],
  financialTransactions: ['offerings'],
  financialCategories:   ['offerings'],
  offerings:             ['offerings'],
  pettyCash:             ['offerings'],
  pettyAccounts:         ['offerings'],
  pettyCashTopUps:       ['offerings'],
  financeDocuments:      ['offerings'],
  assets:                ['assets'],
  roomBookings:          ['room-booking'],
  assetDocuments:        ['assets'],
  resourceLibrary:       ['resource-library'],
  serviceRequests:       ['service-requests'],
  aidDistributions:      ['aid-distribution'],
  aidDistributionDocuments: ['aid-distribution'],
  prayers:               ['prayers'],
  users:                 ['users'],
  customRoles:           ['roles'],
  rbac_permissions:      ['roles'],
  builtinRoleOverrides:  ['roles'],
  masterData:            ['master-data'],
  activityLogs:          ['activity'],
  audit_logs:            ['activity'],
  // Modul Surat Menyurat (Fase 1 — fondasi & pengaturan).
  orgLetterhead:         ['letter-settings'],
  letterTemplates:       ['letter-templates'],
  letterNumberFormats:   ['letter-settings'],
  signatureAssets:       ['letter-settings'],
  letterNumberCounters:  ['letter-settings'], // internal, dibatasi juga lewat ADMIN_WRITE di data.ts
  // Fase 2 — Surat Keluar (alur inti)
  outgoingLetters:           ['letters-outgoing'],
  outgoingLetterAttachments: ['letters-outgoing'],
  // Fase 3 — Surat Masuk & Disposisi
  incomingLetters:           ['letters-incoming'],
  incomingLetterAttachments: ['letters-incoming'],
};

// Method → action mapping
export const METHOD_ACTION: Record<string, string> = {
  GET:    'view',
  POST:   'create',
  PUT:    'edit',
  DELETE: 'delete',
};

// In-memory cache with 60s TTL
let cachedMatrix: MatrixEntry[] | null = null;
let cacheExpiry = 0;

export async function getMatrix(): Promise<MatrixEntry[]> {
  if (cachedMatrix && Date.now() < cacheExpiry) return cachedMatrix;
  try {
    const rows = await getAll<any>('rbac_permissions');
    const found = rows.find((r: any) => r.id === 'matrix');
    if (found && Array.isArray((found as any).matrix) && (found as any).matrix.length > 0) {
      cachedMatrix = (found as any).matrix as MatrixEntry[];
    } else {
      cachedMatrix = DEFAULT_MATRIX;
    }
  } catch {
    cachedMatrix = DEFAULT_MATRIX;
  }
  cacheExpiry = Date.now() + 60_000;
  return cachedMatrix;
}

export function invalidateCache() {
  cachedMatrix = null;
  cacheExpiry = 0;
}

function getRoleKey(role: string): keyof Omit<MatrixEntry, 'module'> {
  if (role === 'Admin')        return 'admin';
  if (role === 'Majelis')      return 'majelis';
  if (role === 'Ketua Sektor') return 'ketuaSektor';
  return 'operator';
}

/** Ambil izin submenu tertentu dari modulePermissions milik sebuah Custom Role.
 *  Kompatibel-mundur: modulePermissions lama berkunci NAMA MODUL (sebelum fitur
 *  granular submenu ini ada) — di situ, izin submenu jatuh-balik ke izin modul
 *  induknya, supaya role lama tidak kehilangan akses sampai disimpan ulang lewat
 *  editor baru. Mirrors getPagePermission() di src/lib/permissions.ts (frontend). */
function getCustomRolePagePermission(modulePermissions: Record<string, string[]> | undefined, pageKey: string): string[] {
  const mp = modulePermissions ?? {};
  if (mp[pageKey]) return mp[pageKey];
  const mod = PAGE_MODULE[pageKey];
  return (mod ? mp[mod] : undefined) ?? [];
}

/** Cek hak akses untuk satu SUBMENU (bukan modul kasar). Role bawaan tetap
 *  dicek di level modul (lewat PAGE_MODULE → DEFAULT_MATRIX); Custom Role
 *  dicek langsung per submenu lewat getCustomRolePagePermission(). */
export async function checkPagePermission(
  role: string, pageKey: string, action: string,
  customRoles?: any[]
): Promise<boolean> {
  if (role === 'Admin') return true;

  const builtIn = ['Admin', 'Majelis', 'Ketua Sektor', 'Operator'];
  if (builtIn.includes(role)) {
    const matrix = await getMatrix();
    const moduleName = PAGE_MODULE[pageKey] ?? pageKey;
    const entry = matrix.find(m => m.module === moduleName);
    if (!entry) return false;
    const key = getRoleKey(role);
    return (entry[key] as PermSet).includes(action);
  }

  if (customRoles) {
    const custom = customRoles.find((r: any) => r.name === role);
    const perms = getCustomRolePagePermission(custom?.modulePermissions, pageKey);
    return perms.includes(action);
  }

  return false;
}

export async function checkPermission(
  role: string, collection: string, method: string,
  customRoles?: any[]
): Promise<boolean> {
  if (role === 'Admin') return true;

  const pages = COLLECTION_PAGE[collection];
  if (!pages || pages.length === 0) return role === 'Admin'; // unknown collection: Admin only

  const action = METHOD_ACTION[method] ?? 'view';
  for (const page of pages) {
    if (await checkPagePermission(role, page, action, customRoles)) return true;
  }
  return false;
}
