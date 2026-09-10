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
import { requireFinancePermission as requireFinancePermissionBase } from '../middleware/checkFinancePermission.js';
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
fyRouter.use(requireAuth, requireFinancePermission(), requireRealDb);

fyRouter.get('/', async (_req: AuthRequest, res: Response) => {
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

fyRouter.get('/:id/periods', async (req: AuthRequest, res: Response) => {
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

fyRouter.post('/', async (req: AuthRequest, res: Response) => {
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

fyRouter.put('/:id/set-current', async (req: AuthRequest, res: Response) => {
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

export default router;
