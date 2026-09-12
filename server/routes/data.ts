import { Router, Response } from 'express';
import { getAll, getAllPaged, getOne, upsert, remove } from '../lib/db.js';
import { parsePagination, paginationMeta } from '../lib/pagination.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/checkPermission.js';
import { hashPassword, isHashed } from '../lib/passwordUtils.js';
import { logger } from '../lib/logger.js';

const router = Router();

const VALID_COLLECTION = /^[a-zA-Z0-9_-]+$/;

function isValidCollection(name: string): boolean {
  return VALID_COLLECTION.test(name) && name.length <= 64;
}

// Collections where only Admin can write
// letterNumberCounters: internal ke endpoint atomik generate nomor surat (server/routes/letterNumbers.ts),
// TIDAK boleh diubah lewat CRUD generik biasa (bisa merusak jaminan anti-duplikat SELECT...FOR UPDATE-nya).
// customRoles & rbac_permissions: SECURITY FIX -- sebelumnya kedua collection ini
// HANYA dilindungi requirePermission() biasa terhadap izin 'roles' page, bukan
// hard-lock Admin-only. Akibatnya siapa pun yang (secara tidak sengaja) didelegasikan
// izin edit di halaman "Manajemen Hak Akses" bisa: (a) mengedit Custom Role
// miliknya sendiri lewat UI RolesManagement.tsx untuk memberi diri sendiri preset
// "Semua" di modul Admin Sistem (tidak ada pengecekan batas atas di
// handleSaveRole()/updateCustomRole()), atau (b) PUT langsung ke
// /api/data/rbac_permissions/matrix (endpoint generik ini, BUKAN /api/permissions
// yang sudah benar Admin-only) untuk mengubah matrix izin bawaan Majelis/Ketua
// Sektor/Operator jadi "Semua" di modul apa pun. Keduanya = privilege escalation
// jadi setara Admin tanpa pernah menyentuh collection 'users'. Dikunci Admin-only
// di sini supaya sama levelnya dengan endpoint /api/permissions yang memang
// dirancang Admin-only sejak awal.
const ADMIN_WRITE = new Set(['users', 'letterNumberCounters', 'customRoles', 'rbac_permissions']);

// Audit gap fix: modul Keuangan & Persembahan klasik (ChurchFinanceHub.tsx dkk)
// sudah dihapus total (commit dde3c20) dan digantikan Finance Add-on (server/lib/
// financeSchema.ts + server/routes/financeTransaction.ts, dst). Tapi 5 collection
// lama ini masih berupa endpoint /api/data terbuka TANPA validator apa pun di
// runCollectionValidation() -- kalau ada kode/klien lama yang masih menulis ke
// sini, datanya akan diam-diam dorman (tidak pernah dibaca UI mana pun sekarang)
// atau, lebih buruk, disalahartikan sebagai sumber kebenaran keuangan yang aktif.
// Ditutup total (POST/PUT/DELETE) di sini -- GET tetap dibiarkan supaya data lama
// (kalau ada) masih bisa diinspeksi/diekspor untuk migrasi manual bila perlu.
const DORMANT_FINANCE_COLLECTIONS = new Set(['financialRecords', 'bankAccounts', 'budgets', 'pettyCash', 'liabilities']);

function blockDormantFinanceWrite(collection: string): string | null {
  if (!DORMANT_FINANCE_COLLECTIONS.has(collection)) return null;
  return 'Modul Keuangan & Persembahan klasik sudah tidak aktif -- gunakan Finance Add-on (menu Finance) untuk transaksi keuangan.';
}

// Log aktivitas (activityLogs/audit_logs) sengaja dibuat APPEND-ONLY -- tidak ada
// alasan sah untuk mengedit/menghapus entri yang sudah tercatat lewat API generik
// ini (ActivityLog.tsx sendiri tidak punya tombol edit/hapus sama sekali).
// Sebelumnya kedua collection ini tunduk penuh ke matrix RBAC biasa (ikut
// COLLECTION_PAGE -> 'activity' page) -- kalau suatu saat ada Custom Role yang
// (sengaja/tidak sengaja) diberi izin delete di halaman itu, jejak audit bisa
// dihapus lewat API. Dikunci di sini, terpisah dari RBAC, supaya immutable
// SELALU berlaku apa pun izin yang didelegasikan -- bahkan untuk Admin sendiri.
const AUDIT_LOG_COLLECTIONS = new Set(['activityLogs', 'audit_logs']);

// Cegah menghapus/menonaktifkan/menurunkan role Admin TERAKHIR yang masih aktif --
// sebelumnya tidak ada pengecekan sama sekali di jalur PUT/DELETE generik ini,
// sistem bisa kehabisan Admin total tanpa jalan pemulihan lewat aplikasi (harus
// akses database langsung). Guard "tidak bisa hapus baris sendiri" di
// RolesManagement.tsx TIDAK menutup ini -- itu cuma mencegah Admin menghapus DIRI
// SENDIRI, bukan mencegah Admin A menghapus/menurunkan Admin B yang kebetulan
// satu-satunya Admin lain yang tersisa.
async function blockLastAdminRemoval(id: string, newData: Record<string, any> | null): Promise<string | null> {
  const existing = await getOne<any>('users', id).catch(() => null);
  if (!existing || existing.role !== 'Admin' || existing.isActive === false) return null; // bukan Admin aktif, tidak relevan

  const willStillBeActiveAdmin = !!newData
    && (newData.role === undefined ? existing.role : newData.role) === 'Admin'
    && (newData.isActive === undefined ? existing.isActive : newData.isActive) !== false;
  if (willStillBeActiveAdmin) return null;

  const allUsers = await getAll<any>('users').catch(() => []);
  const activeAdminCount = allUsers.filter((u: any) => u.role === 'Admin' && u.isActive !== false).length;
  if (activeAdminCount <= 1) {
    return 'Tidak bisa menghapus/menonaktifkan/menurunkan user ini — ini satu-satunya Admin aktif yang tersisa di sistem. Aktifkan atau tambahkan Admin lain terlebih dahulu.';
  }
  return null;
}

// mode 'write': hanya blokir kalau ID-nya SUDAH ADA (edit entri lama) --
// entri BARU tetap boleh dibuat (ini cara normal logActivity()/recordAuditLog()
// mencatat, keduanya lewat PUT/POST upsert dengan id baru). mode 'delete': selalu
// blokir tanpa syarat, tidak ada alasan sah menghapus entri log yang sudah ada.
async function blockAuditLogTamper(collection: string, id: string, mode: 'write' | 'delete'): Promise<string | null> {
  if (!AUDIT_LOG_COLLECTIONS.has(collection)) return null;
  if (mode === 'delete') {
    return 'Log aktivitas tidak bisa dihapus lewat API — sengaja dibuat append-only untuk menjaga integritas jejak audit.';
  }
  const existing = await getOne<any>(collection, id).catch(() => null);
  if (existing) {
    return 'Log aktivitas yang sudah tercatat tidak bisa diedit lewat API — sengaja dibuat append-only untuk menjaga integritas jejak audit.';
  }
  return null;
}

// Collections monitored for automated audit trail
const AUDITED_COLLECTIONS: Record<string, { domain: 'Member' | 'Financial' | 'Asset' | 'System' | 'Correspondence'; entityType: string; nameField: string }> = {
  members:          { domain: 'Member',    entityType: 'Member',          nameField: 'fullName' },
  families:         { domain: 'Member',    entityType: 'Family',          nameField: 'headOfFamily' },
  sectors:          { domain: 'Member',    entityType: 'Sector',          nameField: 'name' },
  baptisms:         { domain: 'Member',    entityType: 'Baptism',         nameField: 'memberName' },
  sidis:            { domain: 'Member',    entityType: 'Sidi',            nameField: 'memberName' },
  marriages:        { domain: 'Member',    entityType: 'Marriage',        nameField: 'groomName' },
  attestations:     { domain: 'Member',    entityType: 'Attestation',     nameField: 'memberName' },
  prayerRequests:   { domain: 'Member',    entityType: 'PrayerRequest',   nameField: 'request' },
  serviceRequests:  { domain: 'Member',    entityType: 'ServiceRequest',  nameField: 'requestedBy' },
  aidDistributions: { domain: 'Member',    entityType: 'AidDistribution', nameField: 'recipientName' },
  aidDistributionDocuments: { domain: 'Member', entityType: 'AidDistributionDocument', nameField: 'fileName' },
  financialRecords: { domain: 'Financial', entityType: 'FinancialRecord', nameField: 'description' },
  financialCategories: { domain: 'Financial', entityType: 'FinancialCategory', nameField: 'name' },
  offerings:        { domain: 'Financial', entityType: 'Offering',        nameField: 'donorName' },
  pettyCash:        { domain: 'Financial', entityType: 'PettyCash',       nameField: 'description' },
  pettyCashTopUps:  { domain: 'Financial', entityType: 'PcTopUp',          nameField: 'description' },
  bankAccounts:     { domain: 'Financial', entityType: 'BankAccount',     nameField: 'bankName' },
  budgets:          { domain: 'Financial', entityType: 'Budget',          nameField: 'category' },
  liabilities:      { domain: 'Financial', entityType: 'Liability',       nameField: 'description' },
  churchAssets:     { domain: 'Asset',     entityType: 'ChurchAsset',     nameField: 'name' },
  assetMaintenances:{ domain: 'Asset',     entityType: 'AssetMaintenance',nameField: 'description' },
  assetLoanHistories:{ domain: 'Asset',    entityType: 'AssetLoan',       nameField: 'borrowedByName' },
  roomBookings:     { domain: 'Asset',     entityType: 'RoomBooking',     nameField: 'roomName' },
  rooms:            { domain: 'Asset',     entityType: 'Room',            nameField: 'name' },
  buildingProjects: { domain: 'Asset',     entityType: 'BuildingProject', nameField: 'name' },
  users:            { domain: 'System',    entityType: 'User',            nameField: 'name' },
  resources:        { domain: 'System',    entityType: 'Resource',        nameField: 'title' },
  resourceFiles:    { domain: 'System',    entityType: 'ResourceFile',    nameField: 'fileName' },
  // Domain 'Correspondence' dipakai satu grup untuk SELURUH modul Surat Menyurat
  // (Fase 1 & 2) supaya semuanya konsisten difilter satu kategori di Log Aktivitas —
  // sebelumnya Fase 1 sempat pakai 'System', diselaraskan di sini saat Fase 2 dibangun.
  orgLetterhead:       { domain: 'Correspondence', entityType: 'OrgLetterhead',       nameField: 'churchName' },
  letterTemplates:     { domain: 'Correspondence', entityType: 'LetterTemplate',      nameField: 'name' },
  letterNumberFormats: { domain: 'Correspondence', entityType: 'LetterNumberFormat',  nameField: 'pattern' },
  signatureAssets:     { domain: 'Correspondence', entityType: 'SignatureAsset',      nameField: 'type' },
  signingOfficials:    { domain: 'Correspondence', entityType: 'SigningOfficial',     nameField: 'userId' },
  outgoingLetters:           { domain: 'Correspondence', entityType: 'OutgoingLetter',           nameField: 'subject' },
  outgoingLetterAttachments: { domain: 'Correspondence', entityType: 'OutgoingLetterAttachment',  nameField: 'fileName' },
  incomingLetters:           { domain: 'Correspondence', entityType: 'IncomingLetter',            nameField: 'subject' },
  incomingLetterAttachments: { domain: 'Correspondence', entityType: 'IncomingLetterAttachment',   nameField: 'fileName' },
};

const IGNORED_DIFF_KEYS = new Set(['id', 'createdAt', 'updatedAt', 'password']);

function computeFieldDiffs(before: Record<string, any> | null, after: Record<string, any> | null) {
  if (!before || !after) return [];
  const diffs: { field: string; oldValue: any; newValue: any }[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of allKeys) {
    if (IGNORED_DIFF_KEYS.has(k)) continue;
    const oldV = before[k];
    const newV = after[k];
    const nOld = oldV === undefined || oldV === null ? '' : oldV;
    const nNew = newV === undefined || newV === null ? '' : newV;
    if (JSON.stringify(nOld) !== JSON.stringify(nNew)) {
      diffs.push({ field: k, oldValue: oldV, newValue: newV });
    }
  }
  return diffs;
}

async function recordAuditLog(
  req: AuthRequest,
  action: 'Menambahkan' | 'Mengubah' | 'Menghapus',
  collection: string,
  entityId: string,
  beforeData: any,
  afterData: any
) {
  if (collection === 'activityLogs') return; // Do not recursively log audit logs
  const meta = AUDITED_COLLECTIONS[collection];
  if (!meta) return;

  const user = req.user;
  const userId = user?.id || 'system';
  const userName = user?.name || 'Administrator';
  const userRole = user?.role || 'Admin';
  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || '127.0.0.1';

  const entityName = afterData?.[meta.nameField] || beforeData?.[meta.nameField] || entityId;
  const diff = action === 'Mengubah' ? computeFieldDiffs(beforeData, afterData) : undefined;

  let severity: 'normal' | 'sensitive' | 'critical' = 'normal';
  if (action === 'Menghapus') {
    severity = ['Member', 'Financial', 'Asset'].includes(meta.domain) ? 'critical' : 'sensitive';
  } else if (meta.domain === 'Financial' || meta.domain === 'Asset' || meta.domain === 'Member') {
    const amount = Number(afterData?.amount || afterData?.acquisitionValue || beforeData?.amount || 0);
    if (amount >= 5_000_000) severity = 'critical';
    else severity = 'sensitive';
  }

  let details = '';
  if (action === 'Menambahkan') {
    details = `Pencatatan data baru pada modul ${meta.domain} (${meta.entityType}): ${entityName}`;
  } else if (action === 'Mengubah') {
    const changedFields = diff && diff.length > 0 ? diff.map(d => d.field).join(', ') : 'beberapa atribut';
    details = `Perubahan data ${meta.entityType} [${entityName}], field diubah: ${changedFields}`;
  } else if (action === 'Menghapus') {
    details = `Penghapusan data ${meta.entityType}: ${entityName}`;
  }

  const logEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    userId,
    userName,
    userRole,
    action,
    domain: meta.domain,
    entityType: meta.entityType,
    entityId,
    entityName: String(entityName),
    timestamp: new Date().toISOString(),
    details,
    ipAddress,
    severity,
    diff,
    beforeState: beforeData ? { ...beforeData, password: undefined } : undefined,
    afterState: afterData ? { ...afterData, password: undefined } : undefined,
  };

  try {
    await upsert('activityLogs', logEntry.id, logEntry);
  } catch (err) {
    logger.warn('Failed to persist automated audit trail', { message: String(err) });
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-()./ ]{7,25}$/;

function validateMemberData(data: Record<string, any>): string | null {
  if (data.email && !EMAIL_RE.test(String(data.email))) return 'Format email tidak valid';
  if (data.phone && !PHONE_RE.test(String(data.phone))) return 'Format nomor telepon tidak valid';
  if (data.homePhone && !PHONE_RE.test(String(data.homePhone))) return 'Format nomor telepon rumah tidak valid';
  return null;
}

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024; // 2MB

// Collection PDF-dokumen generik → nama field pemilik (owner id) yang wajib diisi.
// Menambah collection dokumen baru cukup menambah 1 baris di sini.
const DOCUMENT_COLLECTIONS: Record<string, string> = {
  memberDocuments:         'memberId',
  attestationDocuments:    'attestationId',
  sacramentDocuments:      'sacramentId',
  assetDocuments:          'assetId',
  financeDocuments:        'recordId',
  aidDistributionDocuments:'aidId',
  outgoingLetterAttachments:'letterId',
  incomingLetterAttachments:'letterId',
};

function validateDocumentData(data: Record<string, any>, ownerField: string): string | null {
  if (!data[ownerField] || typeof data[ownerField] !== 'string') return `${ownerField} wajib diisi`;
  if (!data.fileName || typeof data.fileName !== 'string') return 'Nama file wajib diisi';
  if (data.mimeType !== 'application/pdf') return 'Hanya file PDF yang diperbolehkan';
  if (!data.fileData || typeof data.fileData !== 'string') return 'Data file tidak valid';

  let buf: Buffer;
  try {
    buf = Buffer.from(data.fileData, 'base64');
  } catch {
    return 'Data file tidak valid';
  }
  if (buf.length === 0) return 'Data file tidak valid';
  if (buf.length > MAX_DOCUMENT_BYTES) return 'Ukuran file melebihi batas 2MB';
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return 'File bukan PDF yang valid';
  return null;
}

// Validasi minimal untuk materi Perpustakaan Digital (collection 'resources').
// Sebelumnya route generik ini tidak mengecek field wajib sama sekali --
// title/type kosong atau type di luar enum bisa tersimpan tanpa error, dan
// baru ketahuan rusak saat ditampilkan di UI.
const RESOURCE_TYPES = new Set(['Khotbah', 'Materi PJJ', 'Artikel', 'Video', 'Audio', 'Dokumen']);
function validateResourceData(data: Record<string, any>): string | null {
  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) return 'Judul wajib diisi';
  if (!data.type || !RESOURCE_TYPES.has(data.type)) return 'Tipe materi tidak valid';
  return null;
}

// Validasi file yang diupload ke Perpustakaan Digital (collection 'resourceFiles').
// Mirip validateDocumentData di atas, tapi TANPA ownerField (resourceFiles
// direferensikan dari Resource.fileId, bukan sebaliknya) dan mimeType lebih
// longgar (PDF/DOC/PPT, bukan cuma PDF) karena UI-nya memang menerima ketiganya.
const RESOURCE_FILE_MIME_ALLOW = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);
function validateResourceFileData(data: Record<string, any>): string | null {
  if (!data.fileName || typeof data.fileName !== 'string') return 'Nama file wajib diisi';
  if (!data.mimeType || !RESOURCE_FILE_MIME_ALLOW.has(data.mimeType)) return 'Tipe file tidak didukung (hanya PDF/DOC/PPT)';
  if (!data.fileData || typeof data.fileData !== 'string') return 'Data file tidak valid';
  let buf: Buffer;
  try {
    buf = Buffer.from(data.fileData, 'base64');
  } catch {
    return 'Data file tidak valid';
  }
  if (buf.length === 0) return 'Data file tidak valid';
  if (buf.length > MAX_DOCUMENT_BYTES) return 'Ukuran file melebihi batas 2MB';
  return null;
}

// Validasi minimal untuk daftar Pejabat Penandatangan (SigningOfficial) --
// userId wajib diisi supaya tidak ada baris "pejabat" yatim tanpa user
// yang jelas (lihat catatan lengkap di types/index.ts).
function validateSigningOfficialData(data: Record<string, any>): string | null {
  if (!data.userId || typeof data.userId !== 'string' || !data.userId.trim()) return 'User wajib dipilih';
  return null;
}

// Validasi minimal untuk Pelayanan Kasih & Doa (prayerRequests, serviceRequests,
// aidDistributions) -- sebelumnya ketiga collection ini TIDAK PUNYA validasi
// server-side sama sekali, hanya required-check di client yang trivial
// dilewati lewat panggilan API langsung.
const PRAYER_CATEGORIES = new Set(['Kesehatan', 'Keuangan', 'Keluarga', 'Pekerjaan', 'Rohani', 'Lainnya']);
function validatePrayerRequestData(data: Record<string, any>): string | null {
  if (!data.memberId || typeof data.memberId !== 'string') return 'Jemaat wajib dipilih';
  if (!data.request || typeof data.request !== 'string' || !data.request.trim()) return 'Isi pokok doa wajib diisi';
  if (data.category && !PRAYER_CATEGORIES.has(data.category)) return 'Kategori pokok doa tidak valid';
  return null;
}

const SERVICE_REQUEST_TYPES = new Set(['Kunjungan', 'Doa Khusus', 'Pelayanan Duka', 'Konseling', 'Lainnya']);
function validateServiceRequestData(data: Record<string, any>): string | null {
  if (!data.type || !SERVICE_REQUEST_TYPES.has(data.type)) return 'Jenis layanan tidak valid';
  if (!data.requestedBy || typeof data.requestedBy !== 'string' || !data.requestedBy.trim()) return 'Nama pemohon wajib diisi';
  if (!data.phone || typeof data.phone !== 'string') return 'Nomor telepon wajib diisi';
  if (!data.address || typeof data.address !== 'string') return 'Alamat wajib diisi';
  if (!data.description || typeof data.description !== 'string') return 'Deskripsi permohonan wajib diisi';
  return null;
}

const AID_TYPES = new Set(['Ekonomi', 'Beasiswa', 'Kesehatan', 'Bencana', 'Lainnya']);
function validateAidDistributionData(data: Record<string, any>): string | null {
  if (!data.type || !AID_TYPES.has(data.type)) return 'Jenis bantuan tidak valid';
  if (!data.recipientName || typeof data.recipientName !== 'string' || !data.recipientName.trim()) return 'Nama penerima wajib diisi';
  if (!data.phone || typeof data.phone !== 'string') return 'Nomor telepon wajib diisi';
  if (!data.address || typeof data.address !== 'string') return 'Alamat wajib diisi';
  if (!data.description || typeof data.description !== 'string') return 'Deskripsi bantuan wajib diisi';
  if (!data.reason || typeof data.reason !== 'string') return 'Alasan pengajuan wajib diisi';
  if (data.amount !== undefined && data.amount !== null && (typeof data.amount !== 'number' || data.amount < 0)) return 'Nominal bantuan tidak valid';
  return null;
}

// Validasi minimal untuk Peribadahan & Kegiatan (worshipSchedules, wartas,
// liturgies, events, ministrySchedules, attendance) -- sama seperti
// prayerRequests/serviceRequests/aidDistributions sebelumnya, keenam
// collection ini TIDAK PUNYA validasi server-side sama sekali, hanya
// required-check trivial di client yang gampang dilewati lewat panggilan
// API langsung.
function validateWorshipScheduleData(data: Record<string, any>): string | null {
  if (!data.type || typeof data.type !== 'string' || !data.type.trim()) return 'Jenis ibadah wajib diisi';
  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) return 'Judul ibadah wajib diisi';
  if (!data.date || typeof data.date !== 'string') return 'Tanggal ibadah wajib diisi';
  if (!data.time || typeof data.time !== 'string') return 'Waktu ibadah wajib diisi';
  if (!data.location || typeof data.location !== 'string' || !data.location.trim()) return 'Lokasi ibadah wajib diisi';
  return null;
}

function validateWartaData(data: Record<string, any>): string | null {
  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) return 'Judul warta wajib diisi';
  if (!data.date || typeof data.date !== 'string') return 'Tanggal warta wajib diisi';
  if (typeof data.week !== 'number' || data.week < 1) return 'Minggu ke- warta tidak valid';
  if (typeof data.month !== 'number' || data.month < 1 || data.month > 12) return 'Bulan warta tidak valid';
  if (typeof data.year !== 'number' || data.year < 2000) return 'Tahun warta tidak valid';
  if (data.sections !== undefined && !Array.isArray(data.sections)) return 'Format seksi warta tidak valid';
  return null;
}

function validateLiturgyData(data: Record<string, any>): string | null {
  if (!data.date || typeof data.date !== 'string') return 'Tanggal liturgi wajib diisi';
  if (!data.worshipType || typeof data.worshipType !== 'string' || !data.worshipType.trim()) return 'Jenis ibadah liturgi wajib diisi';
  if (!data.theme || typeof data.theme !== 'string' || !data.theme.trim()) return 'Tema liturgi wajib diisi';
  return null;
}

const EVENT_TYPES = new Set(['Ibadah', 'Persekutuan', 'Retreat', 'Seminar', 'Pelayanan', 'Lainnya']);
const EVENT_STATUSES = new Set(['Akan Datang', 'Berlangsung', 'Selesai', 'Dibatalkan']);
function validateEventData(data: Record<string, any>): string | null {
  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) return 'Judul kegiatan wajib diisi';
  if (!data.date || typeof data.date !== 'string') return 'Tanggal kegiatan wajib diisi';
  if (!data.type || !EVENT_TYPES.has(data.type)) return 'Jenis kegiatan tidak valid';
  if (data.status && !EVENT_STATUSES.has(data.status)) return 'Status kegiatan tidak valid';
  return null;
}

function validateMinistryScheduleData(data: Record<string, any>): string | null {
  if (!data.date || typeof data.date !== 'string') return 'Tanggal jadwal pelayanan wajib diisi';
  if (!data.serviceType || typeof data.serviceType !== 'string' || !data.serviceType.trim()) return 'Jenis ibadah jadwal pelayanan wajib diisi';
  if (!data.ministryId || typeof data.ministryId !== 'string') return 'Pelkat/Komisi wajib dipilih';
  if (data.assignedMembers !== undefined && !Array.isArray(data.assignedMembers)) return 'Format anggota bertugas tidak valid';
  return null;
}

const ATTENDANCE_SERVICE_TYPES = new Set(['Minggu Pagi', 'Minggu Sore', 'Rabu', 'Jumat', 'Doa Pagi', 'Pemuda', 'Khusus']);
function validateAttendanceData(data: Record<string, any>): string | null {
  if (!data.date || typeof data.date !== 'string') return 'Tanggal presensi wajib diisi';
  if (!data.serviceType || !ATTENDANCE_SERVICE_TYPES.has(data.serviceType)) return 'Jenis ibadah presensi tidak valid';
  if (!data.memberId || typeof data.memberId !== 'string') return 'Jemaat wajib dipilih';
  if (data.present !== undefined && typeof data.present !== 'boolean') return 'Format status hadir tidak valid';
  return null;
}

// Audit gap fix: validasi field inti Surat Menyurat (incomingLetters,
// outgoingLetters, letterTemplates) -- sebelumnya TIDAK ADA validator sama
// sekali untuk ketiganya, baik di PUT maupun POST. Untuk outgoingLetters,
// dampaknya sebelumnya rendah karena endpoint /submit
// (server/routes/outgoingLetters.ts) sudah mewajibkan jenisSuratId/subject/
// recipientName/body sebelum surat naik dari status Draft -- tapi
// incomingLetters TIDAK PUNYA gerbang wajib-isi di mana pun (endpoint
// /disposisikan cuma validasi field disposisi, bukan field inti surat
// masuk itu sendiri), jadi surat masuk kosong/sampah bisa dibuat & tetap
// bisa didisposisikan. body TIDAK diwajibkan di sini (boleh kosong saat
// draft awal, diisi bertahap oleh staf) -- selaras dengan client (lihat
// handleSaveDraft di OutgoingLetters.tsx).
function validateOutgoingLetterData(data: Record<string, any>): string | null {
  if (!data.jenisSuratId || typeof data.jenisSuratId !== 'string') return 'Jenis surat wajib dipilih';
  if (!data.subject || typeof data.subject !== 'string' || !data.subject.trim()) return 'Perihal surat wajib diisi';
  if (!data.recipientName || typeof data.recipientName !== 'string' || !data.recipientName.trim()) return 'Nama penerima surat wajib diisi';
  if (!data.letterDate || typeof data.letterDate !== 'string') return 'Tanggal surat wajib diisi';
  return null;
}

function validateIncomingLetterData(data: Record<string, any>): string | null {
  if (!data.senderName || typeof data.senderName !== 'string' || !data.senderName.trim()) return 'Nama pengirim surat wajib diisi';
  if (!data.subject || typeof data.subject !== 'string' || !data.subject.trim()) return 'Perihal surat wajib diisi';
  if (!data.receivedDate || typeof data.receivedDate !== 'string') return 'Tanggal diterima wajib diisi';
  return null;
}

function validateLetterTemplateData(data: Record<string, any>): string | null {
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) return 'Nama template surat wajib diisi';
  if (!data.jenisSuratId || typeof data.jenisSuratId !== 'string') return 'Jenis surat wajib dipilih';
  return null;
}

// Audit gap fix (Fasilitas & Inventaris): validasi field inti roomBookings,
// rooms, assets -- sebelumnya TIDAK ADA validator sama sekali untuk
// ketiganya, baik di PUT maupun POST.
function validateRoomBookingData(data: Record<string, any>): string | null {
  if (!data.roomName || typeof data.roomName !== 'string' || !data.roomName.trim()) return 'Nama ruangan wajib diisi';
  if (!data.bookedBy || typeof data.bookedBy !== 'string' || !data.bookedBy.trim()) return 'Nama pemesan wajib diisi';
  if (!data.phone || typeof data.phone !== 'string') return 'Nomor telepon wajib diisi';
  if (!data.purpose || typeof data.purpose !== 'string' || !data.purpose.trim()) return 'Keperluan booking wajib diisi';
  if (!data.date || typeof data.date !== 'string') return 'Tanggal booking wajib diisi';
  if (!data.startTime || typeof data.startTime !== 'string') return 'Waktu mulai wajib diisi';
  if (!data.endTime || typeof data.endTime !== 'string') return 'Waktu selesai wajib diisi';
  if (data.startTime >= data.endTime) return 'Waktu mulai harus sebelum waktu selesai';
  if (data.attendees !== undefined && (typeof data.attendees !== 'number' || data.attendees < 0)) return 'Jumlah peserta tidak valid';
  return null;
}

function validateRoomData(data: Record<string, any>): string | null {
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) return 'Nama ruangan wajib diisi';
  if (data.capacity !== undefined && (typeof data.capacity !== 'number' || data.capacity < 0)) return 'Kapasitas ruangan tidak valid';
  if (data.facilities !== undefined && !Array.isArray(data.facilities)) return 'Format fasilitas tidak valid';
  return null;
}

function validateAssetData(data: Record<string, any>): string | null {
  if (!data.assetCode || typeof data.assetCode !== 'string' || !data.assetCode.trim()) return 'Kode aset wajib diisi';
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) return 'Nama aset wajib diisi';
  if (!data.category || typeof data.category !== 'string') return 'Kategori aset wajib dipilih';
  if (!data.location || typeof data.location !== 'string' || !data.location.trim()) return 'Lokasi aset wajib diisi';
  if (!data.condition || typeof data.condition !== 'string') return 'Kondisi aset wajib dipilih';
  if (!data.acquisitionDate || typeof data.acquisitionDate !== 'string') return 'Tanggal perolehan aset wajib diisi';
  if (typeof data.acquisitionValue !== 'number' || data.acquisitionValue < 0) return 'Nilai perolehan aset tidak valid';
  if (data.usefulLifeYears !== undefined && (typeof data.usefulLifeYears !== 'number' || data.usefulLifeYears < 0)) return 'Umur ekonomis aset tidak valid';
  return null;
}

// Audit gap fix (Fasilitas & Inventaris): bentrok jadwal ruangan sebelumnya
// CUMA dicek di client (findRoomConflict() di RoomBooking.tsx, Array.find
// terhadap state React lokal) -- tidak ada penegakan server sama sekali.
// Dampaknya: (a) race condition, dua staf yang submit nyaris bersamaan
// bisa sama-sama lolos cek client dan dua-duanya tersimpan; (b) panggilan
// API langsung ke PUT/POST /api/data/roomBookings bisa buat booking bentrok
// kapan saja tanpa hambatan. Query & logika overlap disamakan persis dengan
// findRoomConflict() di client supaya perilakunya konsisten.
async function checkRoomBookingConflict(id: string, data: Record<string, any>): Promise<string | null> {
  if (!data.roomName || !data.date || !data.startTime || !data.endTime) return null;
  const all = await getAll<any>('roomBookings').catch(() => []);
  const conflict = (all || []).find((b: any) =>
    b.id !== id &&
    b.roomName === data.roomName &&
    b.date === data.date &&
    b.status !== 'Rejected' && b.status !== 'Cancelled' &&
    data.startTime < b.endTime && b.startTime < data.endTime
  );
  if (conflict) {
    return `Ruangan ${data.roomName} sudah dipesan pada jam tersebut oleh ${conflict.bookedBy} (${conflict.startTime}-${conflict.endTime}). Pilih waktu atau ruangan lain.`;
  }
  return null;
}

// Audit gap fix (Fasilitas & Inventaris): hapus ruangan yang masih punya
// riwayat booking sebelumnya cuma dicegah di client (handleDeleteRoom() di
// RoomBooking.tsx) -- panggilan DELETE /api/data/rooms/:id langsung tetap
// bisa menghapus ruangan yang masih dirujuk booking lama, membuat
// roomName di booking tersebut jadi rujukan yatim.
async function blockRoomDeletionWithBookings(id: string): Promise<string | null> {
  const room = await getOne<any>('rooms', id).catch(() => null);
  if (!room) return null;
  const all = await getAll<any>('roomBookings').catch(() => []);
  const used = (all || []).some((b: any) => b.roomName === room.name);
  if (used) {
    return `Ruangan "${room.name}" masih punya riwayat booking -- nonaktifkan saja (bukan hapus) supaya riwayat booking lama tidak kehilangan referensi nama ruangan.`;
  }
  return null;
}

// Audit gap fix (Database Jemaat/Keluarga/Sektor): pengecekan referensi
// sebelum hapus Jemaat/Keluarga/Sektor SEBELUMNYA hanya ada di client
// (MemberDatabase.tsx, FamilyDatabase.tsx, SectorDatabase.tsx). Panggilan
// DELETE langsung ke /api/data/members|families|sectors/:id (lewat API
// client lain, curl, dsb) bisa melewati semua pengecekan itu dan membuat
// banyak record jadi yatim (memberId/familyId/sectorId/leaderMemberId
// menunjuk ke data yang sudah tidak ada). Logikanya disamakan persis
// dengan versi client (termasuk fallback pencocokan nama untuk data lama
// yang belum punya memberId) supaya perilakunya konsisten baik lewat UI
// maupun panggilan API langsung. Ministries (leaderMemberId/memberIds)
// ditambahkan di sini karena belum pernah dicek di client sama sekali.
async function blockMemberDeletionInUse(id: string): Promise<string | null> {
  const member = await getOne<any>('members', id).catch(() => null);
  if (!member) return null;
  const nm = (member.fullName || '').toLowerCase();

  const [
    attestationsAll, churchAssetsAll, memberDocumentsAll, baptismsAll, sidisAll, marriagesAll,
    prayerRequestsAll, serviceRequestsAll, aidDistributionsAll, outgoingLettersAll, incomingLettersAll,
    ministriesAll,
  ] = await Promise.all([
    getAll<any>('attestations').catch(() => []),
    getAll<any>('churchAssets').catch(() => []),
    getAll<any>('memberDocuments').catch(() => []),
    getAll<any>('baptisms').catch(() => []),
    getAll<any>('sidis').catch(() => []),
    getAll<any>('marriages').catch(() => []),
    getAll<any>('prayerRequests').catch(() => []),
    getAll<any>('serviceRequests').catch(() => []),
    getAll<any>('aidDistributions').catch(() => []),
    getAll<any>('outgoingLetters').catch(() => []),
    getAll<any>('incomingLetters').catch(() => []),
    getAll<any>('ministries').catch(() => []),
  ]);

  const attestationsCount = (attestationsAll || []).filter((a: any) =>
    (a.memberId && a.memberId === id) || (!a.memberId && a.memberName?.toLowerCase() === nm)
  ).length;
  const assetsManaged = (churchAssetsAll || []).filter((a: any) => a.memberId
    ? a.memberId === id
    : (() => { const rp = (a.responsiblePerson || '').toLowerCase(); return !!rp && (rp.includes(nm) || nm.includes(rp)); })()
  ).length;
  const assetsBorrowed = (churchAssetsAll || []).filter((a: any) =>
    (a.loanStatus || 'Tersedia') === 'Dipinjam' && (
      (a.borrowedById && a.borrowedById === id) ||
      (!a.borrowedById && a.borrowedByName && a.borrowedByName.toLowerCase().includes(nm))
    )
  ).length;
  const documents = (memberDocumentsAll || []).filter((d: any) => d.memberId === id).length;
  const sacraments =
    (baptismsAll || []).filter((b: any) => b.memberId === id).length +
    (sidisAll || []).filter((s: any) => s.memberId === id).length +
    (marriagesAll || []).filter((m: any) => m.groomMemberId === id || m.brideMemberId === id).length;
  const prayerRequestsCount = (prayerRequestsAll || []).filter((p: any) => p.memberId === id).length;
  const serviceRequestsCount = (serviceRequestsAll || []).filter((sr: any) => sr.memberId === id).length;
  const aidDistributionsCount = (aidDistributionsAll || []).filter((ad: any) => ad.memberId === id).length;
  const letters =
    (outgoingLettersAll || []).filter((l: any) => l.memberId === id).length +
    (incomingLettersAll || []).filter((l: any) => l.memberId === id).length;
  const ministriesCount = (ministriesAll || []).filter((m: any) =>
    m.leaderMemberId === id || (Array.isArray(m.memberIds) && m.memberIds.includes(id))
  ).length;

  const total = attestationsCount + assetsManaged + assetsBorrowed + documents + sacraments +
    prayerRequestsCount + serviceRequestsCount + aidDistributionsCount + letters + ministriesCount;
  if (total > 0) {
    return `Jemaat "${member.fullName}" masih punya data terkait (atestasi/aset/dokumen/sakramen/doa/pelayanan/bantuan/surat/pelayanan komisi) dan tidak bisa dihapus langsung -- selesaikan atau pindahkan data terkait tersebut terlebih dahulu.`;
  }
  return null;
}

async function blockFamilyDeletionInUse(id: string): Promise<string | null> {
  const family = await getOne<any>('families', id).catch(() => null);
  if (!family) return null;
  const allMembers = await getAll<any>('members').catch(() => []);
  const count = (allMembers || []).filter((m: any) => m.familyId === id).length;
  if (count > 0) {
    return `Keluarga "${family.headOfFamily}" masih memiliki ${count} anggota -- pindahkan anggota terlebih dahulu sebelum menghapus keluarga.`;
  }
  return null;
}

async function blockSectorDeletionInUse(id: string): Promise<string | null> {
  const sector = await getOne<any>('sectors', id).catch(() => null);
  if (!sector) return null;
  const allMembers = await getAll<any>('members').catch(() => []);
  const count = (allMembers || []).filter((m: any) => m.sectorId === id).length;
  if (count > 0) {
    return `Sektor "${sector.name}" masih memiliki ${count} anggota -- pindahkan anggota terlebih dahulu sebelum menghapus sektor.`;
  }
  return null;
}

// Audit gap fix (Database Jemaat): baptisms/sidis/marriages/sectorTransfers/
// families/sectors/attestations sebelumnya TIDAK PUNYA validator server sama
// sekali (beda dengan sacraments lama yang cuma alias tanpa collection nyata),
// jadi PUT/POST langsung ke /api/data/:collection bisa menyimpan data kosong
// atau status di luar daftar yang sah. memberId/groomMemberId/brideMemberId
// TIDAK diwajibkan di sini karena form client (SacramentDatabase.tsx) sendiri
// cuma mewajibkan nama + tanggal, bukan relasi ke Member -- validator ini
// mengikuti kontrak form yang sudah ada, bukan menambah aturan baru.
function validateBaptismData(data: Record<string, any>): string | null {
  if (!data.memberName || typeof data.memberName !== 'string' || !data.memberName.trim()) return 'Nama yang dibaptis wajib diisi';
  if (!data.type || !['Anak', 'Dewasa'].includes(data.type)) return 'Jenis baptis wajib dipilih (Anak/Dewasa)';
  if (!data.baptismDate || typeof data.baptismDate !== 'string') return 'Tanggal baptis wajib diisi';
  if (!data.baptismPlace || typeof data.baptismPlace !== 'string' || !data.baptismPlace.trim()) return 'Tempat baptis wajib diisi';
  if (!data.minister || typeof data.minister !== 'string' || !data.minister.trim()) return 'Pelayan/pendeta wajib diisi';
  if (data.status !== undefined && !['Terjadwal', 'Selesai', 'Dibatalkan'].includes(data.status)) return 'Status baptis tidak valid';
  return null;
}

function validateSidiData(data: Record<string, any>): string | null {
  if (!data.memberName || typeof data.memberName !== 'string' || !data.memberName.trim()) return 'Nama peserta sidi wajib diisi';
  if (!data.sidiDate || typeof data.sidiDate !== 'string') return 'Tanggal sidi wajib diisi';
  if (!data.sidiPlace || typeof data.sidiPlace !== 'string' || !data.sidiPlace.trim()) return 'Tempat sidi wajib diisi';
  if (!data.minister || typeof data.minister !== 'string' || !data.minister.trim()) return 'Pelayan/pendeta wajib diisi';
  if (data.status !== undefined && !['Terjadwal', 'Selesai', 'Dibatalkan'].includes(data.status)) return 'Status sidi tidak valid';
  return null;
}

function validateMarriageData(data: Record<string, any>): string | null {
  if (!data.groomName || typeof data.groomName !== 'string' || !data.groomName.trim()) return 'Nama mempelai pria wajib diisi';
  if (!data.brideName || typeof data.brideName !== 'string' || !data.brideName.trim()) return 'Nama mempelai wanita wajib diisi';
  if (!data.marriageDate || typeof data.marriageDate !== 'string') return 'Tanggal pernikahan wajib diisi';
  if (!data.marriagePlace || typeof data.marriagePlace !== 'string' || !data.marriagePlace.trim()) return 'Tempat pernikahan wajib diisi';
  if (!data.minister || typeof data.minister !== 'string' || !data.minister.trim()) return 'Pelayan/pendeta wajib diisi';
  if (data.status !== undefined && !['Terjadwal', 'Selesai', 'Dibatalkan'].includes(data.status)) return 'Status pernikahan tidak valid';
  return null;
}

function validateFamilyData(data: Record<string, any>): string | null {
  if (!data.headOfFamily || typeof data.headOfFamily !== 'string' || !data.headOfFamily.trim()) return 'Nama kepala keluarga wajib diisi';
  if (!data.headMemberId || typeof data.headMemberId !== 'string') return 'Kepala keluarga wajib dipilih dari data Jemaat';
  if (!data.sectorId || typeof data.sectorId !== 'string') return 'Sektor keluarga wajib dipilih';
  if (!data.address || typeof data.address !== 'string' || !data.address.trim()) return 'Alamat keluarga wajib diisi';
  return null;
}

function validateSectorData(data: Record<string, any>): string | null {
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) return 'Nama sektor wajib diisi';
  if (!data.leader || typeof data.leader !== 'string' || !data.leader.trim()) return 'Nama Ketua Sektor wajib diisi';
  if (!data.leaderContact || typeof data.leaderContact !== 'string' || !data.leaderContact.trim()) return 'Kontak Ketua Sektor wajib diisi';
  return null;
}

function validateSectorTransferData(data: Record<string, any>): string | null {
  if (!data.memberId || typeof data.memberId !== 'string') return 'Jemaat yang dipindah wajib dipilih';
  if (!data.memberName || typeof data.memberName !== 'string' || !data.memberName.trim()) return 'Nama jemaat wajib diisi';
  if (!data.fromSectorId || typeof data.fromSectorId !== 'string') return 'Sektor asal wajib diisi';
  if (!data.toSectorId || typeof data.toSectorId !== 'string') return 'Sektor tujuan wajib dipilih';
  if (data.fromSectorId === data.toSectorId) return 'Sektor asal dan tujuan tidak boleh sama';
  if (!data.reason || typeof data.reason !== 'string' || !data.reason.trim()) return 'Alasan pindah sektor wajib diisi';
  if (!data.requestDate || typeof data.requestDate !== 'string') return 'Tanggal permohonan wajib diisi';
  if (data.status !== undefined && !['Pending', 'Diproses', 'Selesai'].includes(data.status)) return 'Status pindah sektor tidak valid';
  return null;
}

// Audit gap fix: 'ministries' sebelumnya TIDAK punya validator sama sekali di
// runCollectionValidation() -- satu-satunya collection utama yang lolos tanpa
// pengecekan field wajib apa pun lewat POST/PUT generik.
function validateMinistryData(data: Record<string, any>): string | null {
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) return 'Nama komisi/unit pelayanan wajib diisi';
  if (!data.leader || typeof data.leader !== 'string' || !data.leader.trim()) return 'Nama ketua/koordinator wajib diisi';
  if (data.memberIds !== undefined && !Array.isArray(data.memberIds)) return 'Daftar anggota (memberIds) harus berupa array';
  return null;
}

function validateAttestationData(data: Record<string, any>): string | null {
  if (!data.type || typeof data.type !== 'string') return 'Jenis atestasi wajib dipilih';
  if (!data.memberId || typeof data.memberId !== 'string') return 'Jemaat wajib dipilih';
  if (!data.memberName || typeof data.memberName !== 'string' || !data.memberName.trim()) return 'Nama jemaat wajib diisi';
  if (!data.fromChurch || typeof data.fromChurch !== 'string' || !data.fromChurch.trim()) return 'Gereja asal wajib diisi';
  if (!data.toChurch || typeof data.toChurch !== 'string' || !data.toChurch.trim()) return 'Gereja tujuan wajib diisi';
  if (!data.reason || typeof data.reason !== 'string' || !data.reason.trim()) return 'Alasan atestasi wajib diisi';
  if (!data.requestDate || typeof data.requestDate !== 'string') return 'Tanggal permohonan wajib diisi';
  return null;
}

// sensusSnapshots & consolidatedReportSnapshots SENGAJA TIDAK diberi validator
// isi-field: keduanya arsip hasil hitung otomatis aplikasi (snapshot sensus
// jemaat per sektor, rekap laporan konsolidasi), bukan form yang diisi
// manual oleh staf -- struktur fieldnya kompleks & computed (banyak field
// angka agregat bersarang) dan gampang berubah seiring fitur laporan
// berkembang. Validasi ketat di sini berisiko malah menolak snapshot sah
// karena skema field yang berubah. Yang tetap diperlukan cuma pagar generik:
// pastikan value adalah object, tidak kosong -- itu sudah cukup untuk cegah
// PUT/POST dengan payload rusak/null, tanpa mengunci bentuk field internalnya.
function validateSnapshotData(data: Record<string, any>): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Data snapshot tidak valid';
  return null;
}

// Audit gap fix (Announcement/Livestream/Notifikasi): announcements,
// livestreamLinks, reminderSettings, dan notifications sebelumnya tidak
// punya validator server sama sekali -- client memang sudah validasi field
// wajib (AnnouncementManagement.tsx baris 45, LivestreamReminder.tsx baris
// 106 & 136), tapi itu gampang dilewati lewat PUT/POST langsung. Field wajib
// di sini SENGAJA disamakan persis dengan yang sudah diwajibkan client,
// tidak menambah aturan baru.
function validateAnnouncementData(data: Record<string, any>): string | null {
  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) return 'Judul pengumuman wajib diisi';
  if (!data.content || typeof data.content !== 'string' || !data.content.trim()) return 'Isi pengumuman wajib diisi';
  if (data.priority !== undefined && !['normal', 'important', 'urgent'].includes(data.priority)) return 'Prioritas pengumuman tidak valid';
  return null;
}

function validateLivestreamLinkData(data: Record<string, any>): string | null {
  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) return 'Judul livestream wajib diisi';
  if (!data.url || typeof data.url !== 'string' || !data.url.trim()) return 'URL livestream wajib diisi';
  return null;
}

function validateReminderSettingData(data: Record<string, any>): string | null {
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) return 'Nama reminder wajib diisi';
  if (!data.serviceType || typeof data.serviceType !== 'string' || !data.serviceType.trim()) return 'Jenis ibadah untuk reminder wajib dipilih';
  return null;
}

function validateNotificationData(data: Record<string, any>): string | null {
  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) return 'Judul notifikasi wajib diisi';
  if (!data.message || typeof data.message !== 'string' || !data.message.trim()) return 'Isi notifikasi wajib diisi';
  return null;
}

// Audit gap fix: dispatch validasi per collection sebelumnya cuma dipasang
// di PUT handler -- POST handler (dipakai langsung oleh signingOfficials,
// outgoingLetters, outgoingLetterAttachments, letterTemplates,
// incomingLetters, incomingLetterAttachments lewat api.post(), bukan
// apiSave() yang selalu PUT) cuma memvalidasi 'members', sisanya lolos
// tanpa validasi apa pun -- termasuk validateDocumentData (cek PDF-only,
// magic bytes, batas ukuran) untuk lampiran surat. Disatukan jadi satu
// fungsi yang dipanggil dari PUT *dan* POST supaya tidak ada lagi celah
// seperti ini untuk validator yang sudah ada maupun yang baru ditambahkan
// nanti.
function runCollectionValidation(collection: string, data: Record<string, any>): string | null {
  if (collection === 'members') return validateMemberData(data);
  if (DOCUMENT_COLLECTIONS[collection]) return validateDocumentData(data, DOCUMENT_COLLECTIONS[collection]);
  if (collection === 'resources') return validateResourceData(data);
  if (collection === 'resourceFiles') return validateResourceFileData(data);
  if (collection === 'signingOfficials') return validateSigningOfficialData(data);
  if (collection === 'prayerRequests') return validatePrayerRequestData(data);
  if (collection === 'serviceRequests') return validateServiceRequestData(data);
  if (collection === 'aidDistributions') return validateAidDistributionData(data);
  if (collection === 'worshipSchedules') return validateWorshipScheduleData(data);
  if (collection === 'wartas') return validateWartaData(data);
  if (collection === 'liturgies') return validateLiturgyData(data);
  if (collection === 'events') return validateEventData(data);
  if (collection === 'ministrySchedules') return validateMinistryScheduleData(data);
  if (collection === 'attendance') return validateAttendanceData(data);
  if (collection === 'outgoingLetters') return validateOutgoingLetterData(data);
  if (collection === 'incomingLetters') return validateIncomingLetterData(data);
  if (collection === 'letterTemplates') return validateLetterTemplateData(data);
  if (collection === 'roomBookings') return validateRoomBookingData(data);
  if (collection === 'rooms') return validateRoomData(data);
  if (collection === 'baptisms') return validateBaptismData(data);
  if (collection === 'sidis') return validateSidiData(data);
  if (collection === 'marriages') return validateMarriageData(data);
  if (collection === 'families') return validateFamilyData(data);
  if (collection === 'sectors') return validateSectorData(data);
  if (collection === 'sectorTransfers') return validateSectorTransferData(data);
  if (collection === 'attestations') return validateAttestationData(data);
  if (collection === 'ministries') return validateMinistryData(data);
  if (collection === 'sensusSnapshots' || collection === 'consolidatedReportSnapshots') return validateSnapshotData(data);
  // 'assets' dipertahankan sebagai alias tak berbahaya -- lihat catatan bug
  // nama collection churchAssets vs assets di permissionCache.ts.
  if (collection === 'churchAssets' || collection === 'assets') return validateAssetData(data);
  if (collection === 'announcements') return validateAnnouncementData(data);
  if (collection === 'livestreamLinks') return validateLivestreamLinkData(data);
  if (collection === 'reminderSettings') return validateReminderSettingData(data);
  if (collection === 'notifications') return validateNotificationData(data);
  return null;
}

// Surat Keluar & Surat Masuk: field WAJIB tetap bisa diedit generik SELAMA
// statusnya masih tahap awal (Draft untuk outgoingLetters, Diterima untuk
// incomingLetters — lihat LETTER_EDITABLE_STATUS) — tapi begitu sudah masuk
// alur kerja (Diajukan+ / Didisposisikan+), SEMUA perubahan harus lewat
// endpoint transisi khusus (server/routes/outgoingLetters.ts,
// server/routes/incomingLetters.ts) yang memvalidasi urutan status & mencatat
// recordLetterAudit() per transisi — bukan PUT/DELETE generik ini. Ini
// menutup celah supaya nomor surat/TTD/disposisi yang sudah dikunci tidak
// bisa "diam-diam" diubah lewat jalur CRUD biasa (mirip prinsip Finance:
// transaksi yang sudah diposting harus dibalik/reversal, tidak diedit langsung).
const LETTER_EDITABLE_STATUS: Record<string, string> = {
  outgoingLetters: 'Draft',
  incomingLetters: 'Diterima',
};

async function blockNonEditableLetterWrite(collection: string, id: string): Promise<boolean> {
  const editableStatus = LETTER_EDITABLE_STATUS[collection];
  if (!editableStatus) return false;
  const existing = await getOne<any>(collection, id).catch(() => null);
  return !!existing && existing.status !== editableStatus;
}

// Persembahan (`offerings`) yang sudah "Setor ke Buku Besar" (lihat
// server/routes/financeTransaction.ts POST /deposit-offerings) ditandai
// `depositedTransactionId` -- record itu sudah jadi bagian voucher/transaksi
// resmi di Finance Add-on (finance.transaction_lines), jadi TIDAK BOLEH lagi
// diedit/dihapus langsung lewat CRUD generik ini, supaya sumber data mentah
// persembahan tidak diam-diam menyimpang dari yang sudah tercatat di buku
// besar. Prinsipnya sama persis dengan blockNonEditableLetterWrite() di
// atas: begitu sebuah record sudah "dikunci" oleh proses di modul lain,
// koreksinya harus lewat alur resmi modul itu (di sini: reversal/adjustment
// transaksi di Finance Add-on), bukan lewat PUT/DELETE biasa.
async function blockNonEditableOfferingWrite(collection: string, id: string): Promise<boolean> {
  if (collection !== 'offerings') return false;
  const existing = await getOne<any>(collection, id).catch(() => null);
  return !!existing && !!existing.depositedTransactionId;
}

function stripPassword(items: any[]): any[] {
  return items.map(({ password: _pw, ...u }) => u);
}

// Audit gap (Pelayanan Kasih & Doa, item #8): toggle "Pokok Doa Pribadi" di
// PrayerRequests.tsx sebelumnya HANYA menyaring tampilan di browser
// (Array.filter di komponen React) -- payload GET /api/data/prayerRequests
// tetap mengirim SEMUA baris apa adanya ke siapa pun yang authenticated,
// termasuk role Operator/Ketua Sektor atau Custom Role yang cuma dikasih
// izin 'view' di halaman prayers. Siapa pun bisa lihat isi pokok doa pribadi
// lewat network tab / panggilan API langsung, tanpa perlu bypass apa pun.
// Keputusan produk yang sudah dikonfirmasi user sebelumnya: pokok doa
// pribadi hanya boleh dilihat Admin & Majelis -- fungsi ini menegakkan
// keputusan itu di response server, bukan cuma di UI.
function filterPrivatePrayers(items: any[], user: { role?: string } | undefined): any[] {
  if (user?.role === 'Admin' || user?.role === 'Majelis') return items;
  return items.filter((i: any) => !i.isPrivate);
}

// Audit gap fix (Announcement/Livestream/Notifikasi): 'notifications' TIDAK
// terdaftar sama sekali di COLLECTION_PAGE (server/lib/permissionCache.ts),
// jadi requirePermission() next() tanpa cek izin apa pun untuk collection
// ini -- field targetUserId (dipakai NotificationCenter.tsx untuk notifikasi
// privat disposisi Surat Masuk, lihat notifyAssignee() di
// server/routes/incomingLetters.ts) cuma disaring di client. Siapa pun yang
// login bisa GET seluruh notifikasi user lain, atau PUT/DELETE notifikasi
// milik orang lain (tandai terbaca/hapus paksa), lewat panggilan API
// langsung.
//
// 'notifications' SENGAJA TIDAK dipetakan ke satu 'page' RBAC tertentu
// seperti collection lain -- notifikasi memang dipakai LINTAS semua role
// (reminder ulang tahun/jadwal ibadah dibuat otomatis oleh SETIAP user yang
// login, tidak terikat izin modul tertentu). Yang perlu ditegakkan bukan
// RBAC per halaman, melainkan KEPEMILIKAN per notifikasi -- tiga fungsi di
// bawah ini menegakkan itu langsung di collection 'notifications', mengikuti
// pola yang sama dengan ADMIN_WRITE/blockLastAdminRemoval (enforcement lewat
// guard khusus, bukan lewat COLLECTION_PAGE).
function filterTargetedNotifications(items: any[], user: { userId?: string; role?: string } | undefined): any[] {
  if (user?.role === 'Admin') return items;
  return items.filter((i: any) => !i.targetUserId || i.targetUserId === user?.userId);
}

function blockCrossUserNotificationWrite(collection: string, data: Record<string, any>, user: { userId?: string; role?: string } | undefined): string | null {
  if (collection !== 'notifications') return null;
  if (user?.role === 'Admin') return null;
  if (data?.targetUserId && data.targetUserId !== user?.userId) {
    return 'Tidak dapat menulis notifikasi yang ditargetkan untuk user lain';
  }
  return null;
}

async function blockNotificationOwnershipViolation(collection: string, id: string, user: { userId?: string; role?: string } | undefined): Promise<string | null> {
  if (collection !== 'notifications') return null;
  if (user?.role === 'Admin') return null;
  const existing = await getOne<any>('notifications', id).catch(() => null);
  if (existing?.targetUserId && existing.targetUserId !== user?.userId) {
    return 'Notifikasi ini milik user lain';
  }
  return null;
}

// Audit gap fix (Announcement/Livestream/Notifikasi): filter targetSectors
// untuk role Ketua Sektor di AnnouncementManagement.tsx (baris ~152-158)
// cuma dijalankan di client (Array.filter) -- GET /api/data/announcements
// tetap mengirim SEMUA pengumuman apa adanya, termasuk yang ditarget ke
// sektor lain. Perilaku yang tampil di UI TIDAK berubah oleh fix ini (Ketua
// Sektor memang sudah cuma melihat pengumuman sektornya sendiri di layar) --
// fix ini cuma menutup jalur bypass lewat panggilan API langsung, sama
// seperti scopeBySectorForKetuaSektor() di atas untuk members/families.
async function scopeAnnouncementsForKetuaSektor(items: any[], user: { userId?: string; role?: string } | undefined): Promise<any[]> {
  if (user?.role !== 'Ketua Sektor') return items;
  const account = user.userId ? await getOne<any>('users', user.userId).catch(() => null) : null;
  const assignedSectorId = account?.assignedSectorId;
  return items.filter((a: any) => !a.targetSectors || a.targetSectors.length === 0 || (!!assignedSectorId && a.targetSectors.includes(assignedSectorId)));
}

// Audit gap fix (MasterData): hapus item master data (jenis surat, kategori
// aset, dst) sebelumnya CUMA dicegah oleh heuristik client (usageCount di
// MasterData.tsx, yang scan array-array di AppContext) -- panggilan DELETE
// /api/data/masterData/:id langsung tetap berhasil menghapus item yang
// masih dirujuk banyak record, tanpa hambatan apa pun dari server.
// Heuristik client itu sendiri juga TERBUKTI buta terhadap outgoingLetters &
// incomingLetters (keduanya tidak pernah dimuat ke AppContext, dikelola
// lewat useState lokal per komponen) -- staf melihat "tidak ada pemakaian"
// padahal ratusan surat memakainya lewat field jenisSuratId/category.
//
// Guard ini memeriksa collection yang DIPASTIKAN merujuk MasterDataItem
// lewat id (dari komentar tipe eksplisit "= id dari MasterDataItem" /
// "ref MasterDataItem" di src/app/types/index.ts): letterTemplates.jenisSuratId,
// letterNumberFormats.jenisSuratId, outgoingLetters.jenisSuratId,
// incomingLetters.category. CATATAN CAKUPAN (bukan celah yang terlewat,
// tapi keterbatasan yang disengaja): guard ini TIDAK memeriksa kategori
// master data lain yang dirujuk sebagai SALINAN STRING NILAI, bukan id --
// mis. ChurchAsset.category (lihat AssetManagement.tsx: kategoriAsetOpts
// diambil dari .value, bukan .id) -- karena field itu memang tidak pernah
// menyimpan id master data sama sekali. Menutup itu perlu perubahan skema
// data (string value -> id) di modul Aset, bukan sekadar guard delete di sini.
async function blockMasterDataDeletionInUse(id: string): Promise<string | null> {
  const item = await getOne<any>('masterData', id).catch(() => null);
  if (!item) return null;
  const [letterTemplates, letterNumberFormats, outgoingLetters, incomingLetters] = await Promise.all([
    getAll<any>('letterTemplates').catch(() => []),
    getAll<any>('letterNumberFormats').catch(() => []),
    getAll<any>('outgoingLetters').catch(() => []),
    getAll<any>('incomingLetters').catch(() => []),
  ]);
  const uses =
    (letterTemplates || []).filter((t: any) => t.jenisSuratId === id).length +
    (letterNumberFormats || []).filter((f: any) => f.jenisSuratId === id).length +
    (outgoingLetters || []).filter((l: any) => l.jenisSuratId === id).length +
    (incomingLetters || []).filter((l: any) => l.category === id).length;
  if (uses > 0) {
    const label = item.label || item.value || id;
    return `Item master data "${label}" masih dirujuk oleh ${uses} data Surat Menyurat (template surat/format nomor/surat keluar/surat masuk) -- ganti rujukan tersebut dulu sebelum menghapus item ini.`;
  }
  return null;
}

// Audit gap fix (Dashboard Utama & Laporan): tipe User sudah punya field
// assignedSectorId dengan komentar eksplisit "Khusus role Ketua Sektor -- ID
// sektor yang boleh ia kelola", tapi sebelumnya field ini CUMA dipakai untuk
// membatasi EDIT data sektor itu sendiri (SectorDatabase.tsx) dan menyaring
// pengumuman (AnnouncementManagement.tsx) -- tidak pernah dipakai untuk
// membatasi data jemaat/keluarga yang boleh DILIHAT. Padahal matriks default
// (DEFAULT_MATRIX) memang memberi Ketua Sektor akses 'view' ke Database
// Warga & Data Keluarga (read-only, tidak ada risiko tulis) -- akibatnya
// Ketua Sektor bisa melihat & mengekspor data SELURUH jemaat lintas semua
// sektor lewat Database Warga, Laporan Sensus, dan Pusat Laporan
// Konsolidasi (ketiganya menghitung dari array members/families yang sama
// di AppContext), bukan cuma sektor yang ia pimpin.
//
// Fix ini menyaring di sumbernya (collection members & families) supaya
// otomatis berlaku juga untuk laporan/ekspor turunannya yang dihitung
// client-side dari kedua array itu. Sengaja TIDAK menyaring
// sensusSnapshots/consolidatedReportSnapshots -- itu artefak laporan yang
// sudah dipublikasikan (mis. oleh Majelis/Admin), beda konteks dari data
// mentah jemaat/keluarga.
async function scopeBySectorForKetuaSektor(collection: string, items: any[], user: { userId?: string; role?: string } | undefined): Promise<any[]> {
  if (user?.role !== 'Ketua Sektor') return items;
  if (collection !== 'members' && collection !== 'families') return items;
  const account = user.userId ? await getOne<any>('users', user.userId).catch(() => null) : null;
  const assignedSectorId = account?.assignedSectorId;
  if (!assignedSectorId) return [];
  return items.filter((i: any) => i.sectorId === assignedSectorId);
}

// GET /api/data/:collection
router.get('/:collection', requireAuth, requirePermission(), async (req: AuthRequest, res: Response) => {
  const collection = req.params.collection as string;
  if (!isValidCollection(collection)) {
    res.status(400).json({ error: 'Nama koleksi tidak valid' });
    return;
  }
  // Pagination opsional: hanya aktif kalau caller eksplisit mengirim ?page=
  // dan/atau ?pageSize=. Tanpa parameter itu, perilaku persis sama seperti
  // sebelumnya (array penuh) — supaya semua consumer lama yang belum diubah
  // tidak terpengaruh sama sekali.
  const hasPaginationParams = req.query.page !== undefined || req.query.pageSize !== undefined;
  try {
    if (hasPaginationParams) {
      const { page, pageSize } = parsePagination(req, 100, 500);
      // ?sort=desc membalik urutan sebelum diiris (masih JS-level slice di atas
      // getAll(), bukan SQL baru) — berguna untuk widget "aktivitas terbaru" yang
      // butuh entri terbaru dulu tanpa harus mengunduh seluruh koleksi.
      const reverse = req.query.sort === 'desc';
      const { items, total } = await getAllPaged(collection, page, pageSize, reverse);
      let dataOut: any[] = items as any[];
      if (collection === 'users') dataOut = stripPassword(dataOut);
      if (collection === 'prayerRequests') dataOut = filterPrivatePrayers(dataOut, req.user);
      if (collection === 'notifications') dataOut = filterTargetedNotifications(dataOut, req.user);
      dataOut = await scopeBySectorForKetuaSektor(collection, dataOut, req.user);
      if (collection === 'announcements') dataOut = await scopeAnnouncementsForKetuaSektor(dataOut, req.user);
      res.json({
        data: dataOut,
        meta: paginationMeta(total, page, pageSize),
      });
      return;
    }
    const items = await getAll(collection);
    let dataOut: any[] = items as any[];
    if (collection === 'users') dataOut = stripPassword(dataOut);
    if (collection === 'prayerRequests') dataOut = filterPrivatePrayers(dataOut, req.user);
    if (collection === 'notifications') dataOut = filterTargetedNotifications(dataOut, req.user);
    dataOut = await scopeBySectorForKetuaSektor(collection, dataOut, req.user);
    if (collection === 'announcements') dataOut = await scopeAnnouncementsForKetuaSektor(dataOut, req.user);
    res.json(dataOut);
  } catch (err) {
    logger.error(`GET ${collection}`, { message: String(err) });
    res.status(500).json({ error: 'Gagal mengambil data' });
  }
});

// PUT /api/data/:collection/:id  — upsert
router.put('/:collection/:id', requireAuth, requirePermission(), async (req: AuthRequest, res: Response) => {
  const collection = req.params.collection as string;
  const id = req.params.id as string;

  if (!isValidCollection(collection)) {
    res.status(400).json({ error: 'Nama koleksi tidak valid' });
    return;
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ error: 'Body harus berupa object' });
    return;
  }

  const data = { ...req.body };

  {
    const dormantErr = blockDormantFinanceWrite(collection);
    if (dormantErr) { res.status(403).json({ error: dormantErr }); return; }
  }

  if (ADMIN_WRITE.has(collection) && req.user?.role !== 'Admin') {
    res.status(403).json({ error: 'Akses ditolak' });
    return;
  }

  {
    const auditErr = await blockAuditLogTamper(collection, id, 'write');
    if (auditErr) { res.status(403).json({ error: auditErr }); return; }
  }

  if (collection === 'users') {
    const lastAdminErr = await blockLastAdminRemoval(id, data);
    if (lastAdminErr) { res.status(403).json({ error: lastAdminErr }); return; }
  }

  {
    const crossUserErr = blockCrossUserNotificationWrite(collection, data, req.user);
    if (crossUserErr) { res.status(403).json({ error: crossUserErr }); return; }
    const ownershipErr = await blockNotificationOwnershipViolation(collection, id, req.user);
    if (ownershipErr) { res.status(403).json({ error: ownershipErr }); return; }
  }

  if (await blockNonEditableLetterWrite(collection, id)) {
    res.status(403).json({ error: 'Surat ini sudah diproses lebih lanjut dan tidak bisa diedit langsung — gunakan aksi alur kerja di halaman Surat Keluar/Surat Masuk' });
    return;
  }

  if (await blockNonEditableOfferingWrite(collection, id)) {
    res.status(403).json({ error: 'Persembahan ini sudah disetor ke Buku Besar (Finance Add-on) dan tidak bisa diedit langsung — gunakan alur reversal/adjustment di modul Finance untuk koreksi' });
    return;
  }

  // blockNonEditableLetterWrite() di atas hanya menolak PUT kalau status YANG
  // TERSIMPAN sudah lewat tahap awal — tapi tanpa langkah ini, client yang masih
  // di tahap awal bisa "lompat" langsung mengirim status/field tahap-lanjut lewat
  // body PUT biasa (skip semua endpoint transisi & validasinya). Maka: paksa
  // status tetap di tahap awal dan buang semua field yang HARUS hanya ditulis
  // lewat endpoint transisi masing-masing — persis field yang sama yang dibuang
  // saat create (POST) di bawah.
  if (collection === 'outgoingLetters') {
    data.status = 'Draft';
    delete data.letterNumber;
    delete data.submittedBy; delete data.submittedAt;
    delete data.checkedBy; delete data.checkedAt;
    delete data.signedBy; delete data.signedAt;
    delete data.signatureAssetId; delete data.stampAssetId; delete data.finalPdfData;
    delete data.sentAt; delete data.sentVia;
    delete data.archivedAt; delete data.archivedBy;
  }
  if (collection === 'incomingLetters') {
    data.status = 'Diterima';
    delete data.disposisi;
    delete data.followUpNotes; delete data.followUpAt; delete data.followUpBy;
    delete data.completedAt; delete data.completedBy;
    delete data.archivedAt; delete data.archivedBy;
  }

  // Validasi field per collection -- disatukan lewat runCollectionValidation()
  // supaya PUT dan POST (lihat pemanggilan sama di router.post di bawah)
  // selalu konsisten, tidak ada lagi celah salah satu endpoint lolos tanpa
  // validasi seperti yang ditemukan audit (lihat catatan di
  // runCollectionValidation).
  {
    const valErr = runCollectionValidation(collection, data);
    if (valErr) { res.status(400).json({ error: valErr }); return; }
  }

  if (collection === 'roomBookings') {
    const conflictErr = await checkRoomBookingConflict(id, data);
    if (conflictErr) { res.status(400).json({ error: conflictErr }); return; }
  }

  // Fetch previous state for diff & audit trail
  let beforeData: any = null;
  if (AUDITED_COLLECTIONS[collection]) {
    try {
      beforeData = await getOne(collection, id);
    } catch { /* ignore */ }
  }

  // Hash password jika ada dan belum di-hash
  if (collection === 'users' && data.password && !isHashed(String(data.password))) {
    data.password = await hashPassword(String(data.password));
  }

  try {
    await upsert(collection, id, data);
    const action = beforeData ? 'Mengubah' : 'Menambahkan';
    await recordAuditLog(req, action, collection, id, beforeData, data);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`PUT ${collection}/${id}`, { message: String(err) });
    res.status(500).json({ error: 'Gagal menyimpan data' });
  }
});

// POST /api/data/:collection — create
router.post('/:collection', requireAuth, requirePermission(), async (req: AuthRequest, res: Response) => {
  const collection = req.params.collection as string;

  if (!isValidCollection(collection)) {
    res.status(400).json({ error: 'Nama koleksi tidak valid' });
    return;
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ error: 'Body harus berupa object' });
    return;
  }

  const data = { ...req.body };
  const id = data.id || `${collection.slice(0, 3)}_${Date.now()}`;
  data.id = id;

  {
    const dormantErr = blockDormantFinanceWrite(collection);
    if (dormantErr) { res.status(403).json({ error: dormantErr }); return; }
  }

  if (ADMIN_WRITE.has(collection) && req.user?.role !== 'Admin') {
    res.status(403).json({ error: 'Akses ditolak' });
    return;
  }

  {
    const auditErr = await blockAuditLogTamper(collection, id, 'write');
    if (auditErr) { res.status(403).json({ error: auditErr }); return; }
  }

  {
    const crossUserErr = blockCrossUserNotificationWrite(collection, data, req.user);
    if (crossUserErr) { res.status(403).json({ error: crossUserErr }); return; }
  }

  // Surat Keluar baru SELALU dibuat sebagai Draft polos — field yang berhubungan
  // dengan tahap lanjut (nomor surat, checked/signed/sent/archived by&at, PDF final)
  // hanya boleh terisi lewat endpoint transisi khusus, tidak lewat create generik ini,
  // walau client mengirimkannya (mis. lewat request yang dimanipulasi).
  if (collection === 'outgoingLetters') {
    data.status = 'Draft';
    delete data.letterNumber;
    delete data.submittedBy; delete data.submittedAt;
    delete data.checkedBy; delete data.checkedAt;
    delete data.signedBy; delete data.signedAt;
    delete data.signatureAssetId; delete data.stampAssetId; delete data.finalPdfData;
    delete data.sentAt; delete data.sentVia;
    delete data.archivedAt; delete data.archivedBy;
  }

  // Surat Masuk baru SELALU dibuat sebagai Diterima polos — disposisi & field
  // tahap-lanjut hanya boleh terisi lewat endpoint transisi khusus
  // (server/routes/incomingLetters.ts), sama seperti outgoingLetters di atas.
  if (collection === 'incomingLetters') {
    data.status = 'Diterima';
    delete data.disposisi;
    delete data.followUpNotes; delete data.followUpAt; delete data.followUpBy;
    delete data.completedAt; delete data.completedBy;
    delete data.archivedAt; delete data.archivedBy;
  }

  {
    const valErr = runCollectionValidation(collection, data);
    if (valErr) { res.status(400).json({ error: valErr }); return; }
  }

  if (collection === 'roomBookings') {
    const conflictErr = await checkRoomBookingConflict(data.id, data);
    if (conflictErr) { res.status(400).json({ error: conflictErr }); return; }
  }

  if (collection === 'users' && data.password && !isHashed(String(data.password))) {
    data.password = await hashPassword(String(data.password));
  }

  try {
    await upsert(collection, data.id, data);
    await recordAuditLog(req, 'Menambahkan', collection, data.id, null, data);
    res.json({ ok: true, id: data.id });
  } catch (err) {
    logger.error(`POST ${collection}`, { message: String(err) });
    res.status(500).json({ error: 'Gagal membuat data' });
  }
});

// DELETE /api/data/:collection/:id
router.delete('/:collection/:id', requireAuth, requirePermission(), async (req: AuthRequest, res: Response) => {
  const collection = req.params.collection as string;
  const id = req.params.id as string;

  if (!isValidCollection(collection)) {
    res.status(400).json({ error: 'Nama koleksi tidak valid' });
    return;
  }

  {
    const dormantErr = blockDormantFinanceWrite(collection);
    if (dormantErr) { res.status(403).json({ error: dormantErr }); return; }
  }

  if (ADMIN_WRITE.has(collection) && req.user?.role !== 'Admin') {
    res.status(403).json({ error: 'Akses ditolak' });
    return;
  }

  {
    const auditErr = await blockAuditLogTamper(collection, id, 'delete');
    if (auditErr) { res.status(403).json({ error: auditErr }); return; }
  }

  if (collection === 'users') {
    const lastAdminErr = await blockLastAdminRemoval(id, null);
    if (lastAdminErr) { res.status(403).json({ error: lastAdminErr }); return; }
  }

  if (await blockNonEditableLetterWrite(collection, id)) {
    res.status(403).json({ error: 'Surat ini sudah diproses lebih lanjut dan tidak bisa dihapus langsung — gunakan aksi alur kerja di halaman Surat Keluar/Surat Masuk' });
    return;
  }

  if (await blockNonEditableOfferingWrite(collection, id)) {
    res.status(403).json({ error: 'Persembahan ini sudah disetor ke Buku Besar (Finance Add-on) dan tidak bisa dihapus langsung — gunakan alur reversal/adjustment di modul Finance untuk koreksi' });
    return;
  }

  if (collection === 'rooms') {
    const roomErr = await blockRoomDeletionWithBookings(id);
    if (roomErr) { res.status(403).json({ error: roomErr }); return; }
  }

  if (collection === 'members') {
    const memberErr = await blockMemberDeletionInUse(id);
    if (memberErr) { res.status(403).json({ error: memberErr }); return; }
  }

  if (collection === 'families') {
    const familyErr = await blockFamilyDeletionInUse(id);
    if (familyErr) { res.status(403).json({ error: familyErr }); return; }
  }

  if (collection === 'sectors') {
    const sectorErr = await blockSectorDeletionInUse(id);
    if (sectorErr) { res.status(403).json({ error: sectorErr }); return; }
  }

  if (collection === 'masterData') {
    const masterDataErr = await blockMasterDataDeletionInUse(id);
    if (masterDataErr) { res.status(403).json({ error: masterDataErr }); return; }
  }

  {
    const ownershipErr = await blockNotificationOwnershipViolation(collection, id, req.user);
    if (ownershipErr) { res.status(403).json({ error: ownershipErr }); return; }
  }

  // Fetch previous state for audit logging before removal
  let beforeData: any = null;
  if (AUDITED_COLLECTIONS[collection]) {
    try {
      beforeData = await getOne(collection, id);
    } catch { /* ignore */ }
  }

  try {
    await remove(collection, id);
    await recordAuditLog(req, 'Menghapus', collection, id, beforeData, null);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`DELETE ${collection}/${id}`, { message: String(err) });
    res.status(500).json({ error: 'Gagal menghapus data' });
  }
});

export default router;

