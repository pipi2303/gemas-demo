import { Router, Response } from 'express';
import { getAll, getOne, upsert, remove } from '../lib/db.js';
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
const ADMIN_WRITE = new Set(['users']);

// Collections monitored for automated audit trail
const AUDITED_COLLECTIONS: Record<string, { domain: 'Member' | 'Financial' | 'Asset' | 'System'; entityType: string; nameField: string }> = {
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
  buildingProjects: { domain: 'Asset',     entityType: 'BuildingProject', nameField: 'name' },
  users:            { domain: 'System',    entityType: 'User',            nameField: 'name' },
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

function validateMemberDocumentData(data: Record<string, any>): string | null {
  if (!data.memberId || typeof data.memberId !== 'string') return 'memberId wajib diisi';
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
  try {
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

  // Validasi format field untuk collection members
  if (collection === 'members') {
    const valErr = validateMemberData(data);
    if (valErr) { res.status(400).json({ error: valErr }); return; }
  }

  // Validasi dokumen PDF (tipe, ukuran, magic bytes) untuk collection memberDocuments
  if (collection === 'memberDocuments') {
    const valErr = validateMemberDocumentData(data);
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

