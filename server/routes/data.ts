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
const ADMIN_WRITE = new Set(['users', 'letterNumberCounters']);

// Collections monitored for automated audit trail
const AUDITED_COLLECTIONS: Record<string, { domain: 'Member' | 'Financial' | 'Asset' | 'System' | 'Correspondence'; entityType: string; nameField: string }> = {
  members:          { domain: 'Member',    entityType: 'Member',          nameField: 'fullName' },
  families:         { domain: 'Member',    entityType: 'Family',          nameField: 'headOfFamily' },
  sectors:          { domain: 'Member',    entityType: 'Sector',          nameField: 'name' },
  baptisms:         { domain: 'Member',    entityType: 'Baptism',         nameField: 'memberName' },
  sidis:            { domain: 'Member',    entityType: 'Sidi',            nameField: 'memberName' },
  marriages:        { domain: 'Member',    entityType: 'Marriage',        nameField: 'groomName' },
  attestations:     { domain: 'Member',    entityType: 'Attestation',     nameField: 'memberName' },
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
      res.json({
        data: collection === 'users' ? stripPassword(items as any[]) : items,
        meta: paginationMeta(total, page, pageSize),
      });
      return;
    }
    const items = await getAll(collection);
    res.json(collection === 'users' ? stripPassword(items as any[]) : items);
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

  if (ADMIN_WRITE.has(collection) && req.user?.role !== 'Admin') {
    res.status(403).json({ error: 'Akses ditolak' });
    return;
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

  // Validasi format field untuk collection members
  if (collection === 'members') {
    const valErr = validateMemberData(data);
    if (valErr) { res.status(400).json({ error: valErr }); return; }
  }

  // Validasi dokumen PDF (tipe, ukuran, magic bytes, owner id) untuk semua collection dokumen
  if (DOCUMENT_COLLECTIONS[collection]) {
    const valErr = validateDocumentData(data, DOCUMENT_COLLECTIONS[collection]);
    if (valErr) { res.status(400).json({ error: valErr }); return; }
  }

  // Validasi Perpustakaan Digital (resources & resourceFiles)
  if (collection === 'resources') {
    const valErr = validateResourceData(data);
    if (valErr) { res.status(400).json({ error: valErr }); return; }
  }
  if (collection === 'resourceFiles') {
    const valErr = validateResourceFileData(data);
    if (valErr) { res.status(400).json({ error: valErr }); return; }
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

  if (ADMIN_WRITE.has(collection) && req.user?.role !== 'Admin') {
    res.status(403).json({ error: 'Akses ditolak' });
    return;
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

  if (collection === 'members') {
    const valErr = validateMemberData(data);
    if (valErr) { res.status(400).json({ error: valErr }); return; }
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

  if (ADMIN_WRITE.has(collection) && req.user?.role !== 'Admin') {
    res.status(403).json({ error: 'Akses ditolak' });
    return;
  }

  if (await blockNonEditableLetterWrite(collection, id)) {
    res.status(403).json({ error: 'Surat ini sudah diproses lebih lanjut dan tidak bisa dihapus langsung — gunakan aksi alur kerja di halaman Surat Keluar/Surat Masuk' });
    return;
  }

  if (await blockNonEditableOfferingWrite(collection, id)) {
    res.status(403).json({ error: 'Persembahan ini sudah disetor ke Buku Besar (Finance Add-on) dan tidak bisa dihapus langsung — gunakan alur reversal/adjustment di modul Finance untuk koreksi' });
    return;
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

