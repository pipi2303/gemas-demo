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
  { module: 'Keuangan & Persembahan',       admin: A, majelis: CRDAX, ketuaSektor: NONE, operator: NONE },
  { module: 'Laporan & Direktori',          admin: A, majelis: REX,   ketuaSektor: REX,  operator: NONE },
  { module: 'Pelayanan Kasih & Komunikasi', admin: A, majelis: CRD,   ketuaSektor: R,    operator: NONE },
  { module: 'Manajemen Aset',               admin: A, majelis: CRD,   ketuaSektor: NONE, operator: NONE },
  { module: 'Admin Sistem',                 admin: A, majelis: NONE,  ketuaSektor: NONE, operator: NONE },
  { module: 'Keuangan (Finance Add-on)',    admin: A, majelis: CRDAX, ketuaSektor: NONE, operator: NONE },
];

// Collection → module mapping
export const COLLECTION_MODULE: Record<string, string> = {
  members:               'Database Warga',
  memberDocuments:       'Database Warga',
  marriages:             'Database Warga',
  sectorTransfers:       'Database Warga',
  families:              'Data Keluarga',
  sectors:               'Sektor Pelayanan',
  sacraments:            'Sakramen & Atestasi',
  attestations:          'Sakramen & Atestasi',
  sacramentDocuments:    'Sakramen & Atestasi',
  attestationDocuments:  'Sakramen & Atestasi',
  liturgy:               'Peribadahan & Kegiatan',
  events:                'Peribadahan & Kegiatan',
  worshipSchedules:      'Peribadahan & Kegiatan',
  ministries:            'Peribadahan & Kegiatan',
  attendance:            'Peribadahan & Kegiatan',
  financialTransactions: 'Keuangan & Persembahan',
  financialCategories:   'Keuangan & Persembahan',
  offerings:             'Keuangan & Persembahan',
  pettyCash:             'Keuangan & Persembahan',
  pettyAccounts:         'Keuangan & Persembahan',
  financeDocuments:      'Keuangan & Persembahan',
  assets:                'Manajemen Aset',
  roomBookings:          'Manajemen Aset',
  assetDocuments:        'Manajemen Aset',
  resourceLibrary:       'Laporan & Direktori',
  serviceRequests:       'Pelayanan Kasih & Komunikasi',
  aidDistributions:      'Pelayanan Kasih & Komunikasi',
  aidDistributionDocuments: 'Pelayanan Kasih & Komunikasi',
  prayers:               'Pelayanan Kasih & Komunikasi',
  announcements:         'Peribadahan & Kegiatan',
  users:                 'Admin Sistem',
  customRoles:           'Admin Sistem',
  rbac_permissions:      'Admin Sistem',
  builtinRoleOverrides:  'Admin Sistem',
  masterData:            'Admin Sistem',
  activityLogs:          'Admin Sistem',
  audit_logs:            'Admin Sistem',
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

export async function checkModulePermission(
  role: string, module: string, action: string,
  customRoles?: any[]
): Promise<boolean> {
  if (role === 'Admin') return true;

  const matrix = await getMatrix();
  const entry = matrix.find(m => m.module === module);
  if (!entry) return false;

  // Built-in roles
  const builtIn = ['Admin', 'Majelis', 'Ketua Sektor', 'Operator'];
  if (builtIn.includes(role)) {
    const key = getRoleKey(role);
    return (entry[key] as PermSet).includes(action);
  }

  // Custom roles
  if (customRoles) {
    const custom = customRoles.find((r: any) => r.name === role);
    const perms = (custom?.modulePermissions?.[module] ?? []) as string[];
    return perms.includes(action);
  }

  return false;
}

export async function checkPermission(
  role: string, collection: string, method: string,
  customRoles?: any[]
): Promise<boolean> {
  if (role === 'Admin') return true;

  const module = COLLECTION_MODULE[collection];
  if (!module) return role === 'Admin'; // unknown collection: Admin only

  const action = METHOD_ACTION[method] ?? 'view';
  return checkModulePermission(role, module, action, customRoles);
}
