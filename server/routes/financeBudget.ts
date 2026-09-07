// ============================================================
// FINANCE ADD-ON MODULE — Fase 2: Budget / RKA
// ============================================================
// Endpoint untuk penyusunan RKA (Rencana Kerja & Anggaran): header budget
// per Tahun Fiskal (dengan versi otomatis & alur status), baris budget per
// akun/dimensi/periode, dan alur kerja Draft → Submit → Approve/Reject →
// Activate. Ditulis khusus (bukan lewat factory generic financeCrud.ts)
// karena alur status & validasi silang (baris hanya boleh diubah saat
// Draft, periode harus cocok dengan Tahun Fiskal budget, dst) tidak cocok
// dengan pola CRUD generik.
// ============================================================

import { Router, Response } from 'express';
import { getPool } from '../lib/db.js';
import { requireRealDb, FINANCE_ORG } from '../lib/financeCrud.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireFinancePermission } from '../middleware/checkFinancePermission.js';
import { logger } from '../lib/logger.js';

const router = Router();
router.use(requireAuth, requireRealDb);

async function getBudgetOr404(pool: ReturnType<typeof getPool>, id: string, res: Response): Promise<any | null> {
  const r = await pool.query('SELECT * FROM finance.budgets WHERE id = $1 AND organization_id = $2', [id, FINANCE_ORG]);
  if (r.rows.length === 0) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'RKA tidak ditemukan' } });
    return null;
  }
  return r.rows[0];
}

// ── List & detail ────────────────────────────────────────────────────────────
router.get('/', requireFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const fiscalYearId = req.query.fiscalYearId as string | undefined;
    const where = fiscalYearId
      ? 'organization_id = $1 AND fiscal_year_id = $2'
      : 'organization_id = $1';
    const params = fiscalYearId ? [FINANCE_ORG, fiscalYearId] : [FINANCE_ORG];
    const result = await pool.query(
      `SELECT * FROM finance.budgets WHERE ${where} ORDER BY fiscal_year_id DESC, version DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('GET budgets', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil data RKA' } });
  }
});

router.get('/:id', requireFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const budget = await getBudgetOr404(pool, req.params.id, res);
    if (!budget) return;
    res.json({ success: true, data: budget });
  } catch (err) {
    logger.error('GET budgets/:id', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil data RKA' } });
  }
});

// ── Create ────────────────────────────────────────────────────────────────────
router.post('/', requireFinancePermission('create'), async (req: AuthRequest, res: Response) => {
  const { fiscal_year_id, code, name } = req.body ?? {};
  if (!fiscal_year_id || !code || !name) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tahun Fiskal, kode, dan nama RKA wajib diisi' } });
    return;
  }
  try {
    const pool = getPool();
    const fy = await pool.query('SELECT id FROM finance.fiscal_years WHERE id = $1 AND organization_id = $2', [fiscal_year_id, FINANCE_ORG]);
    if (fy.rows.length === 0) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tahun Fiskal tidak ditemukan' } });
      return;
    }
    const versionResult = await pool.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM finance.budgets WHERE organization_id = $1 AND fiscal_year_id = $2',
      [FINANCE_ORG, fiscal_year_id]
    );
    const version = versionResult.rows[0]?.next_version ?? 1;
    const result = await pool.query(
      `INSERT INTO finance.budgets (organization_id, fiscal_year_id, version, code, name, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [FINANCE_ORG, fiscal_year_id, version, code, name, req.user!.userId]
    );
    logger.info('Budget (RKA) created', { user: req.user?.username, budgetId: result.rows[0].id, code });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    logger.error('POST budgets', { message: String(err) });
    const message = /unique/i.test(String(err?.message ?? '')) ? 'Kode RKA sudah digunakan' : 'Gagal membuat RKA';
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
  }
});

// ── Edit header (hanya saat Draft) ─────────────────────────────────────────────
router.put('/:id', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const budget = await getBudgetOr404(pool, req.params.id, res);
    if (!budget) return;
    if (budget.status !== 'DRAFT') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya RKA berstatus Draft yang bisa diedit' } });
      return;
    }
    const { name } = req.body ?? {};
    if (!name) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Nama wajib diisi' } });
      return;
    }
    const result = await pool.query(
      `UPDATE finance.budgets SET name = $3, updated_at = NOW(), updated_by = $4 WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, name, req.user!.userId]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('PUT budgets/:id', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal memperbarui RKA' } });
  }
});

// ── Batalkan (hanya sebelum Approved) ──────────────────────────────────────────
router.delete('/:id', requireFinancePermission('delete'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const budget = await getBudgetOr404(pool, req.params.id, res);
    if (!budget) return;
    if (!['DRAFT', 'SUBMITTED', 'REVIEWED'].includes(budget.status)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'RKA yang sudah disetujui tidak bisa dibatalkan langsung — buat revisi baru' } });
      return;
    }
    const result = await pool.query(
      `UPDATE finance.budgets SET status = 'CANCELLED', updated_at = NOW(), updated_by = $3 WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [req.params.id, FINANCE_ORG, req.user!.userId]
    );
    res.json({ success: true, data: { id: result.rows[0].id } });
  } catch (err) {
    logger.error('DELETE budgets/:id', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal membatalkan RKA' } });
  }
});

// ── Alur kerja: submit → approve/reject → activate ─────────────────────────────
router.put('/:id/submit', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const budget = await getBudgetOr404(pool, req.params.id, res);
    if (!budget) return;
    if (budget.status !== 'DRAFT') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya RKA berstatus Draft yang bisa diajukan' } });
      return;
    }
    const lineCount = await pool.query('SELECT COUNT(*)::int AS n FROM finance.budget_lines WHERE budget_id = $1', [req.params.id]);
    if ((lineCount.rows[0]?.n ?? 0) === 0) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'RKA belum punya baris anggaran — tambahkan minimal satu baris dulu' } });
      return;
    }
    const result = await pool.query(
      `UPDATE finance.budgets SET status = 'SUBMITTED', submitted_at = NOW(), submitted_by = $3, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, req.user!.userId]
    );
    logger.info('Budget submitted', { user: req.user?.username, budgetId: req.params.id });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('PUT budgets/:id/submit', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengajukan RKA' } });
  }
});

router.put('/:id/approve', requireFinancePermission('approve'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const budget = await getBudgetOr404(pool, req.params.id, res);
    if (!budget) return;
    if (budget.status !== 'SUBMITTED') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya RKA berstatus Diajukan yang bisa disetujui' } });
      return;
    }
    const result = await pool.query(
      `UPDATE finance.budgets SET status = 'APPROVED', approved_at = NOW(), approved_by = $3, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, req.user!.userId]
    );
    logger.info('Budget approved', { user: req.user?.username, budgetId: req.params.id });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('PUT budgets/:id/approve', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menyetujui RKA' } });
  }
});

router.put('/:id/reject', requireFinancePermission('approve'), async (req: AuthRequest, res: Response) => {
  const { reason } = req.body ?? {};
  if (!reason) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Alasan penolakan wajib diisi' } });
    return;
  }
  try {
    const pool = getPool();
    const budget = await getBudgetOr404(pool, req.params.id, res);
    if (!budget) return;
    if (budget.status !== 'SUBMITTED') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya RKA berstatus Diajukan yang bisa dikembalikan' } });
      return;
    }
    const result = await pool.query(
      `UPDATE finance.budgets SET status = 'DRAFT', revision_reason = $3, updated_at = NOW(), updated_by = $4
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, reason, req.user!.userId]
    );
    logger.info('Budget rejected', { user: req.user?.username, budgetId: req.params.id, reason });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('PUT budgets/:id/reject', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengembalikan RKA' } });
  }
});

router.put('/:id/activate', requireFinancePermission('approve'), async (req: AuthRequest, res: Response) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bRes = await client.query('SELECT * FROM finance.budgets WHERE id = $1 AND organization_id = $2', [req.params.id, FINANCE_ORG]);
    const budget = bRes.rows[0];
    if (!budget) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'RKA tidak ditemukan' } });
      return;
    }
    if (budget.status !== 'APPROVED') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya RKA berstatus Disetujui yang bisa diaktifkan' } });
      return;
    }
    // Versi ACTIVE lama untuk Tahun Fiskal yang sama otomatis jadi Revised
    await client.query(
      `UPDATE finance.budgets SET status = 'REVISED', updated_at = NOW(), updated_by = $3
       WHERE organization_id = $1 AND fiscal_year_id = $2 AND status = 'ACTIVE'`,
      [FINANCE_ORG, budget.fiscal_year_id, req.user!.userId]
    );
    const result = await client.query(
      `UPDATE finance.budgets SET status = 'ACTIVE', updated_at = NOW(), updated_by = $3 WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, req.user!.userId]
    );
    await client.query('COMMIT');
    logger.info('Budget activated', { user: req.user?.username, budgetId: req.params.id });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT budgets/:id/activate', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengaktifkan RKA' } });
  } finally {
    client.release();
  }
});

// ── Baris RKA (budget lines) ───────────────────────────────────────────────────
router.get('/:id/lines', requireFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const budget = await getBudgetOr404(pool, req.params.id, res);
    if (!budget) return;
    const result = await pool.query(
      `SELECT * FROM finance.budget_lines WHERE budget_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('GET budgets/:id/lines', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil baris RKA' } });
  }
});

router.post('/:id/lines', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const budget = await getBudgetOr404(pool, req.params.id, res);
    if (!budget) return;
    if (budget.status !== 'DRAFT') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Baris hanya bisa ditambah saat RKA berstatus Draft' } });
      return;
    }
    const body = req.body ?? {};
    const { account_id, period_id } = body;
    const budget_amount = body.budget_amount === '' || body.budget_amount === undefined ? 0 : Number(body.budget_amount);
    if (!account_id || !period_id) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Akun dan Periode wajib diisi' } });
      return;
    }
    if (!Number.isFinite(budget_amount) || budget_amount < 0) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Jumlah anggaran tidak valid' } });
      return;
    }
    const periodRes = await pool.query('SELECT fiscal_year_id FROM finance.periods WHERE id = $1', [period_id]);
    if (periodRes.rows.length === 0 || periodRes.rows[0].fiscal_year_id !== budget.fiscal_year_id) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Periode tidak sesuai dengan Tahun Fiskal RKA ini' } });
      return;
    }
    const nullable = (v: any) => (v === '' || v === undefined ? null : v);
    const result = await pool.query(
      `INSERT INTO finance.budget_lines
        (budget_id, account_id, field_id, program_id, activity_id, fund_id, period_id, description, budget_amount, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        req.params.id, account_id, nullable(body.field_id), nullable(body.program_id), nullable(body.activity_id),
        nullable(body.fund_id), period_id, nullable(body.description), budget_amount, req.user!.userId,
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    logger.error('POST budgets/:id/lines', { message: String(err) });
    const message = /foreign key/i.test(String(err?.message ?? '')) ? 'Referensi yang dipilih tidak valid' : 'Gagal menambah baris RKA';
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
  }
});

router.put('/:id/lines/:lineId', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const budget = await getBudgetOr404(pool, req.params.id, res);
    if (!budget) return;
    if (budget.status !== 'DRAFT') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Baris hanya bisa diubah saat RKA berstatus Draft' } });
      return;
    }
    const body = req.body ?? {};
    const budget_amount = body.budget_amount === '' || body.budget_amount === undefined ? undefined : Number(body.budget_amount);
    if (budget_amount !== undefined && (!Number.isFinite(budget_amount) || budget_amount < 0)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Jumlah anggaran tidak valid' } });
      return;
    }
    const result = await pool.query(
      `UPDATE finance.budget_lines SET
         description = COALESCE($3, description),
         budget_amount = COALESCE($4, budget_amount),
         updated_at = NOW(), updated_by = $5
       WHERE id = $1 AND budget_id = $2 RETURNING *`,
      [req.params.lineId, req.params.id, body.description ?? null, budget_amount ?? null, req.user!.userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Baris RKA tidak ditemukan' } });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('PUT budgets/:id/lines/:lineId', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal memperbarui baris RKA' } });
  }
});

router.delete('/:id/lines/:lineId', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const budget = await getBudgetOr404(pool, req.params.id, res);
    if (!budget) return;
    if (budget.status !== 'DRAFT') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Baris hanya bisa dihapus saat RKA berstatus Draft' } });
      return;
    }
    const result = await pool.query(
      'DELETE FROM finance.budget_lines WHERE id = $1 AND budget_id = $2 RETURNING id',
      [req.params.lineId, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Baris RKA tidak ditemukan' } });
      return;
    }
    res.json({ success: true, data: { id: result.rows[0].id } });
  } catch (err) {
    logger.error('DELETE budgets/:id/lines/:lineId', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menghapus baris RKA' } });
  }
});

export default router;
