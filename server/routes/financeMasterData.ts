// ============================================================
// FINANCE ADD-ON MODULE — Fase 1: Master Data & Periode Fiskal
// ============================================================
// Mendaftarkan endpoint CRUD untuk seluruh master data finance:
// Kelompok Akun, Chart of Accounts, Bidang, Program, Kegiatan, Dana,
// Kas, Bank — lewat factory generik di financeCrud.ts — ditambah
// endpoint khusus Tahun Fiskal (yang juga men-generate 12 periode
// bulanan otomatis saat dibuat, dan endpoint set-current).
// ============================================================

import { Router, Response } from 'express';
import { getPool } from '../lib/db.js';
import { createMasterDataRouter, requireRealDb, FINANCE_ORG } from '../lib/financeCrud.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireFinancePermission as requireFinancePermissionBase, requireAnyFinancePermission } from '../middleware/checkFinancePermission.js';
import { recordFinanceAudit } from '../lib/financeAudit.js';

// Submenu Finance Add-on untuk file ini (dipakai validasi server per-submenu) —
// lihat komentar di checkFinancePermission.ts.
const requireFinancePermission = (action?: string) => requireFinancePermissionBase(action, 'finance-master-data');
import { logger } from '../lib/logger.js';

const router = Router();

// ── Kelompok Akun ────────────────────────────────────────────────────────────
router.use('/account-groups', createMasterDataRouter({
  table: 'finance.account_groups',
  fields: ['code', 'name', 'account_type', 'normal_balance', 'sort_order', 'is_active'],
  requiredFields: ['code', 'name', 'account_type', 'normal_balance'],
  orderBy: 'sort_order ASC, code ASC',
  deleteMode: 'deleted_at',
  entityLabel: 'Kelompok Akun',
}));

// ── Chart of Accounts ─────────────────────────────────────────────────────────
router.use('/accounts', createMasterDataRouter({
  table: 'finance.accounts',
  fields: [
    'group_id', 'parent_id', 'code', 'name', 'account_type', 'normal_balance',
    'level', 'is_postable', 'is_control_account', 'opening_balance', 'is_active',
  ],
  requiredFields: ['group_id', 'code', 'name'],
  orderBy: 'code ASC',
  deleteMode: 'deleted_at',
  entityLabel: 'Akun',
  deriveDefaults: async (body, pool) => {
    const out: Record<string, any> = {};
    if (body.group_id) {
      const r = await pool.query(
        'SELECT account_type, normal_balance FROM finance.account_groups WHERE id = $1 AND organization_id = $2',
        [body.group_id, FINANCE_ORG]
      );
      if (r.rows.length === 0) throw new Error('Kelompok akun tidak ditemukan');
      out.account_type = r.rows[0].account_type;
      out.normal_balance = r.rows[0].normal_balance;
    }
    if (body.parent_id) {
      const r2 = await pool.query(
        'SELECT level FROM finance.accounts WHERE id = $1 AND organization_id = $2',
        [body.parent_id, FINANCE_ORG]
      );
      out.level = r2.rows.length > 0 ? Number(r2.rows[0].level) + 1 : 1;
    } else {
      out.level = 1;
    }
    return out;
  },
}));

// ── Bidang (Fields) ───────────────────────────────────────────────────────────
router.use('/fields', createMasterDataRouter({
  table: 'finance.fields',
  fields: ['parent_id', 'code', 'name', 'description', 'manager_user_id', 'is_active'],
  requiredFields: ['code', 'name'],
  orderBy: 'code ASC',
  deleteMode: 'deleted_at',
  entityLabel: 'Bidang',
}));

// ── Program ───────────────────────────────────────────────────────────────────
router.use('/programs', createMasterDataRouter({
  table: 'finance.programs',
  fields: ['field_id', 'code', 'name', 'description', 'is_active'],
  requiredFields: ['field_id', 'code', 'name'],
  orderBy: 'code ASC',
  deleteMode: 'deleted_at',
  entityLabel: 'Program',
}));

// ── Kegiatan (Activities) ─────────────────────────────────────────────────────
router.use('/activities', createMasterDataRouter({
  table: 'finance.activities',
  fields: ['program_id', 'code', 'name', 'description', 'is_active'],
  requiredFields: ['program_id', 'code', 'name'],
  orderBy: 'code ASC',
  deleteMode: 'deleted_at',
  entityLabel: 'Kegiatan',
}));

// ── Dana (Funds) ──────────────────────────────────────────────────────────────
router.use('/funds', createMasterDataRouter({
  table: 'finance.funds',
  fields: ['parent_id', 'code', 'name', 'fund_type', 'restriction_type', 'opening_balance', 'is_active'],
  requiredFields: ['code', 'name', 'fund_type', 'restriction_type'],
  orderBy: 'code ASC',
  deleteMode: 'deleted_at',
  entityLabel: 'Dana',
}));

// ── Kas (Cash Accounts) ───────────────────────────────────────────────────────
router.use('/cash-accounts', createMasterDataRouter({
  table: 'finance.cash_accounts',
  fields: ['account_id', 'code', 'name', 'location', 'opening_balance', 'current_balance', 'is_active'],
  requiredFields: ['account_id', 'code', 'name'],
  orderBy: 'code ASC',
  deleteMode: 'is_active',
  entityLabel: 'Kas',
  deriveDefaults: async (body) => (body.opening_balance !== undefined ? { current_balance: body.opening_balance } : {}),
}));

// ── Peta Setoran Persembahan ─────────────────────────────────────────────────
// UI untuk finance.offering_deposit_map -- sebelumnya tabel ini HANYA bisa
// diisi lewat SQL seed manual (lihat FINANCE_SEED_SQL di financeSchema.ts),
// tidak ada endpoint/UI sama sekali, jadi menambah kategori persembahan baru
// di tab Jenis Persembahan selalu butuh developer masuk ke database untuk
// memetakan akun GL-nya sebelum "Setor ke Buku Besar" (financeTransaction.ts)
// bisa dipakai untuk kategori itu. map_key WAJIB persis sama dengan nilai
// kategori di tab Jenis Persembahan (atau 'CASH_DEBIT'/'BANK_DEBIT' untuk
// sisi debit kas/bank saat setor) -- dicocokkan sebagai teks biasa, BUKAN
// foreign key (map_key hanya UNIQUE per organisasi), jadi mengganti nama
// kategori di tab Jenis Persembahan TIDAK otomatis mengganti map_key di sini
// (lihat guard pemakaian di endpoint jenis_persembahan/metode_pembayaran).
// deleteMode 'none' disengaja: menghapus satu baris berarti kategori itu
// mendadak tidak punya rujukan akun GL sama sekali (fitur setor akan gagal
// untuk kategori tsb) -- kalau kategori itu memang ingin dipensiunkan,
// nonaktifkan kategorinya di tab Jenis Persembahan, jangan hapus mapping-nya.
router.use('/offering-deposit-map', createMasterDataRouter({
  table: 'finance.offering_deposit_map',
  fields: ['map_key', 'account_id', 'fund_id', 'cash_account_id'],
  requiredFields: ['map_key', 'account_id'],
  orderBy: 'map_key ASC',
  deleteMode: 'none',
  entityLabel: 'Peta Setoran Persembahan',
}));

// ── Bank Accounts ─────────────────────────────────────────────────────────────
router.use('/bank-accounts', createMasterDataRouter({
  table: 'finance.bank_accounts',
  fields: [
    'account_id', 'bank_name', 'bank_code', 'account_number', 'account_name',
    'currency', 'opening_balance', 'current_balance', 'is_active',
  ],
  requiredFields: ['account_id', 'bank_name', 'account_number', 'account_name'],
  orderBy: 'bank_name ASC, account_name ASC',
  deleteMode: 'is_active',
  entityLabel: 'Rekening Bank',
  deriveDefaults: async (body) => (body.opening_balance !== undefined ? { current_balance: body.opening_balance } : {}),
}));

// ── Jenis Voucher ─────────────────────────────────────────────────────────────
router.use('/voucher-types', createMasterDataRouter({
  table: 'finance.voucher_types',
  fields: ['code', 'name', 'transaction_type', 'prefix', 'sequence_scope', 'is_active', 'requires_approval'],
  requiredFields: ['code', 'name', 'transaction_type', 'prefix'],
  orderBy: 'code ASC',
  deleteMode: 'is_active',
  entityLabel: 'Jenis Voucher',
  onUpdate: async (before, after, req) => {
    // Catat ke Audit Trail Finance setiap kali status wajib-approval sebuah
    // jenis voucher diubah — ini mengubah kontrol internal (SoD 4-mata),
    // jadi perlu jejak audit yang jelas, bukan cuma log CRUD biasa.
    if (before.requires_approval !== after.requires_approval) {
      await recordFinanceAudit(
        req,
        after.requires_approval ? 'Aktifkan Approval Wajib' : 'Nonaktifkan Approval Wajib',
        'voucher_type',
        String(after.id),
        `${after.code} - ${after.name}`,
        {
          before_requires_approval: before.requires_approval,
          after_requires_approval: after.requires_approval,
        },
        'critical'
      );
    }
  },
}));

// ── Pemasok (Vendors) ─────────────────────────────────────────────────────────
router.use('/vendors', createMasterDataRouter({
  table: 'finance.vendors',
  fields: [
    'code', 'name', 'contact_person', 'phone', 'email', 'address',
    'npwp', 'bank_name', 'bank_account_number', 'notes', 'is_active',
  ],
  requiredFields: ['code', 'name'],
  orderBy: 'name ASC',
  deleteMode: 'deleted_at',
  entityLabel: 'Pemasok',
}));

// ── Donatur (Donors) ──────────────────────────────────────────────────────────
router.use('/donors', createMasterDataRouter({
  table: 'finance.donors',
  fields: ['code', 'name', 'donor_type', 'contact_person', 'phone', 'email', 'address', 'notes', 'is_active'],
  requiredFields: ['code', 'name', 'donor_type'],
  orderBy: 'name ASC',
  deleteMode: 'deleted_at',
  entityLabel: 'Donatur',
}));

// ── Pusat Biaya (Cost Centers) ────────────────────────────────────────────────
router.use('/cost-centers', createMasterDataRouter({
  table: 'finance.cost_centers',
  fields: ['parent_id', 'code', 'name', 'description', 'manager_user_id', 'is_active'],
  requiredFields: ['code', 'name'],
  orderBy: 'code ASC',
  deleteMode: 'deleted_at',
  entityLabel: 'Pusat Biaya',
}));

// ── Tahun Fiskal & Periode (khusus — bukan generic CRUD) ─────────────────────
const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateStr(y: number, m: number, d: number): string {
  // m: 0-based month index (JS convention), d: 1-based day
  const dt = new Date(Date.UTC(y, m, d));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

const fyRouter = Router();
fyRouter.use(requireAuth, requireRealDb);

// GET di sini murni referensi (dipakai dropdown Tahun Fiskal di semua submenu Finance
// Add-on lain), jadi digating lintas-submenu (requireAnyFinancePermission), bukan
// dikunci ke 'finance-master-data' saja -- lihat komentar di checkFinancePermission.ts.
fyRouter.get('/', requireAnyFinancePermission('view'), async (_req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM finance.fiscal_years WHERE organization_id = $1 ORDER BY start_date DESC',
      [FINANCE_ORG]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('GET fiscal-years', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil data Tahun Fiskal' } });
  }
});

fyRouter.get('/:id/periods', requireAnyFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT p.* FROM finance.periods p
       JOIN finance.fiscal_years fy ON fy.id = p.fiscal_year_id
       WHERE p.fiscal_year_id = $1 AND fy.organization_id = $2
       ORDER BY p.period_number ASC`,
      [req.params.id, FINANCE_ORG]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('GET fiscal-years/:id/periods', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil data Periode' } });
  }
});

// POST/PUT tetap dikunci ke 'finance-master-data' -- membuat/mengubah Tahun Fiskal
// adalah aksi pengelolaan master data, bukan sekadar baca referensi.
fyRouter.post('/', requireFinancePermission('create'), async (req: AuthRequest, res: Response) => {
  const { code, name, startDate } = req.body ?? {};
  if (!code || !name || !startDate) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Kode, nama, dan tanggal mulai wajib diisi' } });
    return;
  }
  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tanggal mulai tidak valid' } });
    return;
  }
  const startY = start.getUTCFullYear();
  const startM = start.getUTCMonth();
  const startD = start.getUTCDate();
  const endDateStr = toDateStr(startY + 1, startM, startD - 1);
  const startDateStr = toDateStr(startY, startM, startD);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fyResult = await client.query(
      `INSERT INTO finance.fiscal_years (organization_id, code, name, start_date, end_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [FINANCE_ORG, code, name, startDateStr, endDateStr, req.user!.userId]
    );
    const fy = fyResult.rows[0];

    for (let i = 0; i < 12; i++) {
      const pStartY = startY + Math.floor((startM + i) / 12);
      const pStartM = (startM + i) % 12;
      const periodStartStr = toDateStr(pStartY, pStartM, 1);
      // hari terakhir bulan tsb = hari ke-0 bulan berikutnya
      const periodEndStr = toDateStr(pStartY, pStartM + 1, 0);
      const quarter = Math.floor(i / 3) + 1;
      const periodCode = `${fy.code}-P${pad2(i + 1)}`;
      const periodName = `${MONTHS_ID[pStartM]} ${pStartY}`;
      await client.query(
        `INSERT INTO finance.periods (fiscal_year_id, period_number, code, name, start_date, end_date, quarter)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [fy.id, i + 1, periodCode, periodName, periodStartStr, periodEndStr, quarter]
      );
    }

    await client.query('COMMIT');
    logger.info('Fiscal year created', { user: req.user?.username, fiscalYearId: fy.id, code: fy.code });
    res.status(201).json({ success: true, data: fy });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('POST fiscal-years', { message: String(err) });
    const raw = String(err?.message ?? '');
    const message = /unique/i.test(raw) ? 'Kode Tahun Fiskal sudah digunakan' : 'Gagal membuat Tahun Fiskal';
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
  } finally {
    client.release();
  }
});

fyRouter.put('/:id/set-current', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE finance.fiscal_years SET is_current = FALSE WHERE organization_id = $1', [FINANCE_ORG]);
    const result = await client.query(
      `UPDATE finance.fiscal_years SET is_current = TRUE, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, req.user!.userId]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tahun Fiskal tidak ditemukan' } });
      return;
    }
    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT fiscal-years/:id/set-current', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengaktifkan Tahun Fiskal' } });
  } finally {
    client.release();
  }
});

router.use('/fiscal-years', fyRouter);

// ── Data QRIS ────────────────────────────────────────────────────────────────
// Menyimpan gambar kode QRIS statis (bisa lebih dari satu -- per kategori
// persembahan, per rekening, atau per event/musim) yang dipakai Persembahan
// Digital & E-Warta. Bukan factory createMasterDataRouter generik karena ada
// 2 kebutuhan khusus: (1) validasi gambar (magic bytes + batas ukuran, mirip
// validateDocumentData di server/routes/data.ts tapi untuk PNG/JPEG bukan
// PDF), dan (2) relasi many-to-many ke kategori lewat qris_code_categories
// yang perlu ditulis dalam 1 transaksi bareng baris qris_codes-nya.
const MAX_QRIS_IMAGE_BYTES = 1 * 1024 * 1024; // 1MB -- kode QR statis, tidak perlu besar
const QRIS_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg']);

function validateQrisImage(mimeType: unknown, imageData: unknown): string | null {
  if (typeof mimeType !== 'string' || !QRIS_IMAGE_MIME_TYPES.has(mimeType)) {
    return 'Gambar QRIS harus berformat PNG atau JPEG';
  }
  if (typeof imageData !== 'string' || !imageData) return 'Data gambar tidak valid';
  let buf: Buffer;
  try {
    buf = Buffer.from(imageData, 'base64');
  } catch {
    return 'Data gambar tidak valid';
  }
  if (buf.length === 0) return 'Data gambar tidak valid';
  if (buf.length > MAX_QRIS_IMAGE_BYTES) return 'Ukuran gambar melebihi batas 1MB';
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (mimeType === 'image/png' && !isPng) return 'File bukan PNG yang valid';
  if (mimeType === 'image/jpeg' && !isJpeg) return 'File bukan JPEG yang valid';
  return null;
}

function sanitizeCategories(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const c of input) {
    if (typeof c === 'string' && c.trim()) seen.add(c.trim());
  }
  return [...seen];
}

const qrisRouter = Router();
qrisRouter.use(requireAuth, requireRealDb);

async function fetchQrisCodesWithCategories(pool: ReturnType<typeof getPool>, where: string, params: any[]) {
  const codesRes = await pool.query(
    `SELECT * FROM finance.qris_codes WHERE ${where} ORDER BY sort_order ASC, label ASC`,
    params
  );
  const codes = codesRes.rows;
  if (codes.length === 0) return [];
  const catRes = await pool.query(
    `SELECT qris_code_id, category FROM finance.qris_code_categories WHERE qris_code_id = ANY($1::uuid[])`,
    [codes.map((c: any) => c.id)]
  );
  const byId = new Map<string, string[]>();
  for (const r of catRes.rows) {
    const arr = byId.get(r.qris_code_id) ?? [];
    arr.push(r.category);
    byId.set(r.qris_code_id, arr);
  }
  return codes.map((c: any) => ({ ...c, categories: byId.get(c.id) ?? [] }));
}

// GET /api/v1/finance/qris-codes -- ?all=1 untuk sertakan yang sudah dinonaktifkan
qrisRouter.get('/', requireFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const includeInactive = req.query.all === '1';
    const where = includeInactive ? 'organization_id = $1' : 'organization_id = $1 AND is_active = TRUE';
    const data = await fetchQrisCodesWithCategories(pool, where, [FINANCE_ORG]);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('GET qris-codes', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil data QRIS' } });
  }
});

qrisRouter.post('/', requireFinancePermission('create'), async (req: AuthRequest, res: Response) => {
  const body = req.body ?? {};
  const imgErr = validateQrisImage(body.mime_type, body.image_data);
  if (imgErr) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: imgErr } }); return; }
  if (typeof body.label !== 'string' || !body.label.trim()) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Label wajib diisi' } });
    return;
  }
  const categories = sanitizeCategories(body.categories);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const insertRes = await client.query(
      `INSERT INTO finance.qris_codes
         (organization_id, label, image_data, mime_type, bank_account_id, cash_account_id, event_tag, is_displayed, sort_order, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        FINANCE_ORG, body.label.trim(), body.image_data, body.mime_type,
        body.bank_account_id || null, body.cash_account_id || null, body.event_tag || null,
        body.is_displayed !== false, Number(body.sort_order) || 0, req.user!.userId,
      ]
    );
    const qris = insertRes.rows[0];
    for (const category of categories) {
      await client.query(
        `INSERT INTO finance.qris_code_categories (qris_code_id, category) VALUES ($1,$2)`,
        [qris.id, category]
      );
    }
    await client.query('COMMIT');
    await recordFinanceAudit(req, 'Menambahkan', 'QrisCode', qris.id, qris.label, `Kode QRIS "${qris.label}" ditambahkan untuk kategori: ${categories.join(', ') || '(tanpa kategori)'}`, 'normal');
    res.status(201).json({ success: true, data: { ...qris, categories } });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('POST qris-codes', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menyimpan Kode QRIS' } });
  } finally {
    client.release();
  }
});

qrisRouter.put('/:id', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  const body = req.body ?? {};
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingRes = await client.query('SELECT * FROM finance.qris_codes WHERE id = $1 AND organization_id = $2', [req.params.id, FINANCE_ORG]);
    if (existingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Kode QRIS tidak ditemukan' } });
      return;
    }
    const existing = existingRes.rows[0];

    // Gambar boleh tidak dikirim ulang saat PUT (mis. cuma ganti label/kategori) --
    // hanya divalidasi ulang kalau memang ada image_data baru di body.
    if (body.image_data !== undefined) {
      const imgErr = validateQrisImage(body.mime_type ?? existing.mime_type, body.image_data);
      if (imgErr) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: imgErr } });
        return;
      }
    }

    const updated = await client.query(
      `UPDATE finance.qris_codes SET
         label = $3, image_data = $4, mime_type = $5, bank_account_id = $6, cash_account_id = $7,
         event_tag = $8, is_displayed = $9, is_active = $10, sort_order = $11,
         updated_at = NOW(), updated_by = $12
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [
        req.params.id, FINANCE_ORG,
        (typeof body.label === 'string' && body.label.trim()) ? body.label.trim() : existing.label,
        body.image_data !== undefined ? body.image_data : existing.image_data,
        body.mime_type !== undefined ? body.mime_type : existing.mime_type,
        body.bank_account_id !== undefined ? (body.bank_account_id || null) : existing.bank_account_id,
        body.cash_account_id !== undefined ? (body.cash_account_id || null) : existing.cash_account_id,
        body.event_tag !== undefined ? (body.event_tag || null) : existing.event_tag,
        body.is_displayed !== undefined ? !!body.is_displayed : existing.is_displayed,
        body.is_active !== undefined ? !!body.is_active : existing.is_active,
        body.sort_order !== undefined ? Number(body.sort_order) || 0 : existing.sort_order,
        req.user!.userId,
      ]
    );

    let categories: string[] | null = null;
    if (body.categories !== undefined) {
      categories = sanitizeCategories(body.categories);
      await client.query('DELETE FROM finance.qris_code_categories WHERE qris_code_id = $1', [req.params.id]);
      for (const category of categories) {
        await client.query('INSERT INTO finance.qris_code_categories (qris_code_id, category) VALUES ($1,$2)', [req.params.id, category]);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, data: { ...updated.rows[0], categories: categories ?? undefined } });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT qris-codes/:id', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal memperbarui Kode QRIS' } });
  } finally {
    client.release();
  }
});

// Soft-delete saja (is_active = FALSE) -- TIDAK dihapus fisik, karena record
// persembahan (offerings.qrisCodeId) bisa mereferensikan baris ini untuk
// riwayat. Lihat catatan di CREATE TABLE finance.qris_codes (financeSchema.ts).
//
// Audit gap catatan (Finance Add-on, minor): endpoint ini sengaja memakai
// action permission 'edit', BUKAN 'delete' tersendiri -- konsisten dengan
// pola nonaktifkan-bukan-hapus di modul ini (operasinya memang UPDATE
// is_active, bukan DELETE fisik). Dampaknya: role dengan izin 'edit' tapi
// bukan 'delete' pada submenu finance-master-data tetap bisa menonaktifkan
// kode QRIS. Ini keputusan desain yang didokumentasikan, bukan bug -- kalau
// ke depan granularitas izin nonaktifkan-QRIS perlu dipisah dari edit biasa,
// baru action 'delete' perlu ditambahkan di sini.
qrisRouter.delete('/:id', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `UPDATE finance.qris_codes SET is_active = FALSE, is_displayed = FALSE, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [req.params.id, FINANCE_ORG, req.user!.userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Kode QRIS tidak ditemukan' } });
      return;
    }
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) {
    logger.error('DELETE qris-codes/:id', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menonaktifkan Kode QRIS' } });
  }
});

router.use('/qris-codes', qrisRouter);

// GET publik (siapa pun yang sudah login, TANPA butuh akses Finance) untuk
// kode QRIS yang is_displayed = TRUE -- dipakai E-Warta (server/routes lain
// di luar Finance Add-on, dikelola sekretariat yang belum tentu punya akses
// Finance sama sekali) untuk menampilkan kode QR ke jemaat. Sengaja terpisah
// dari GET /qris-codes di atas (yang tetap dikunci ke 'finance-master-data'
// untuk keperluan pengelolaan) -- kode yang is_displayed=TRUE memang
// ditujukan untuk tampil ke publik, jadi levelnya beda dari data Finance
// lain yang sensitif (saldo, jurnal, dst).
router.get('/qris-codes/displayed', requireAuth, requireRealDb, async (_req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const data = await fetchQrisCodesWithCategories(pool, 'organization_id = $1 AND is_active = TRUE AND is_displayed = TRUE', [FINANCE_ORG]);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('GET qris-codes/displayed', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil Kode QRIS' } });
  }
});

// GET publik (siapa pun yang sudah login) untuk SEMUA kode QRIS yang
// is_active = TRUE (tanpa syarat is_displayed) -- dipakai Persembahan
// Digital (OfferingsQRIS.tsx, submenu 'offerings', BUKAN 'finance-master-
// data') supaya staf yang mencatat persembahan bisa memilih kode QRIS yang
// dipakai jemaat, tanpa perlu diberi akses Master Data Finance. is_displayed
// di sini tidak relevan -- itu soal tampil-tidaknya ke publik (E-Warta),
// bukan soal boleh-tidaknya dipakai mencatat transaksi internal.
router.get('/qris-codes/active', requireAuth, requireRealDb, async (_req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const data = await fetchQrisCodesWithCategories(pool, 'organization_id = $1 AND is_active = TRUE', [FINANCE_ORG]);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('GET qris-codes/active', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil Kode QRIS' } });
  }
});

// Dipakai guard pemakaian kategori (server/routes/data.ts, saat rename/hapus
// item jenis_persembahan) supaya admin diperingatkan sebelum mengubah nama
// kategori yang masih dipakai kode QRIS tertentu. Endpoint sendiri (bukan
// query count generik) supaya server/routes/data.ts tidak perlu tahu bentuk
// tabel finance.* sama sekali -- cukup panggil HTTP internal ini.
router.get('/qris-codes/usage/:category', requireAuth, requireRealDb, requireAnyFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT qc.label FROM finance.qris_code_categories qcc
       JOIN finance.qris_codes qc ON qc.id = qcc.qris_code_id
       WHERE qcc.category = $1 AND qc.organization_id = $2 AND qc.is_active = TRUE`,
      [req.params.category, FINANCE_ORG]
    );
    res.json({ success: true, data: { count: result.rows.length, labels: result.rows.map((r: any) => r.label) } });
  } catch (err) {
    logger.error('GET qris-codes/usage/:category', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengecek pemakaian kategori' } });
  }
});

export default router;
