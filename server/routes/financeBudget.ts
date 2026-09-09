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
import { requireRealDb, FINANCE_ORG, parsePagination, paginationMeta, assertMasterDataActive } from '../lib/financeCrud.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireFinancePermission as requireFinancePermissionBase } from '../middleware/checkFinancePermission.js';

// Submenu Finance Add-on untuk file ini (dipakai validasi server per-submenu) —
// lihat komentar di checkFinancePermission.ts.
const requireFinancePermission = (action?: string) => requireFinancePermissionBase(action, 'finance-budget');
import { recordFinanceAudit } from '../lib/financeAudit.js';
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
    const { page, pageSize, offset } = parsePagination(req);
    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM finance.budgets WHERE ${where}`, params);
    const dataParams = [...params, pageSize, offset];
    const result = await pool.query(
      `SELECT * FROM finance.budgets WHERE ${where} ORDER BY fiscal_year_id DESC, version DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    res.json({ success: true, data: result.rows, meta: paginationMeta(countRes.rows[0].total, page, pageSize) });
  } catch (err) {
    logger.error('GET budgets', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil data RKA' } });
  }
});

// ── Cari baris anggaran yang cocok untuk 1 akun di 1 Tahun Fiskal ───────────────
// Dipakai saat menambah baris Transaksi (financeTransaction.ts POST /:id/lines)
// supaya pengguna bisa OPSIONAL mengaitkan baris transaksi ke baris RKA yang
// sesuai -- tanpa ini, Laporan Realisasi Anggaran tidak pernah tahu transaksi
// mana yang termasuk realisasi anggaran mana (budget_line_id di
// transaction_lines tidak pernah terisi). Diletakkan SEBELUM '/:id' supaya
// path literal '/lines/lookup' tidak tertangkap sebagai parameter :id.
router.get('/lines/lookup', requireFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  try {
    const { fiscalYearId, accountId } = req.query as { fiscalYearId?: string; accountId?: string };
    if (!fiscalYearId || !accountId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tahun Fiskal dan Akun wajib diisi' } });
      return;
    }
    const pool = getPool();
    // Status budget yang dianggap berlaku sama seperti Laporan Realisasi
    // Anggaran (financeReports.ts) -- APPROVED/ACTIVE/REVISED.
    const result = await pool.query(
      `SELECT bl.id, bl.budget_amount, bl.committed_amount, bl.actual_amount, bl.available_amount,
              p.id AS period_id, p.name AS period_name, p.period_number,
              fi.name AS field_name, pr.name AS program_name, act.name AS activity_name, fu.name AS fund_name
       FROM finance.budget_lines bl
       JOIN finance.budgets b ON b.id = bl.budget_id
       JOIN finance.periods p ON p.id = bl.period_id
       LEFT JOIN finance.fields fi ON fi.id = bl.field_id
       LEFT JOIN finance.programs pr ON pr.id = bl.program_id
       LEFT JOIN finance.activities act ON act.id = bl.activity_id
       LEFT JOIN finance.funds fu ON fu.id = bl.fund_id
       WHERE b.organization_id = $1 AND b.fiscal_year_id = $2 AND bl.account_id = $3
         AND b.status IN ('APPROVED','ACTIVE','REVISED')
       ORDER BY p.period_number ASC`,
      [FINANCE_ORG, fiscalYearId, accountId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('GET budgets/lines/lookup', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal memuat daftar baris anggaran' } });
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
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // SELECT ... FOR UPDATE mengunci baris RKA ini SELAMA transaksi -- pola yang
    // sama seperti /:id/activate di file ini & alur kerja transaksi di
    // financeTransaction.ts, supaya submit/approve/reject tidak race.
    const bRes = await client.query('SELECT * FROM finance.budgets WHERE id = $1 AND organization_id = $2 FOR UPDATE', [req.params.id, FINANCE_ORG]);
    const budget = bRes.rows[0];
    if (!budget) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'RKA tidak ditemukan' } });
      return;
    }
    if (budget.status !== 'DRAFT') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya RKA berstatus Draft yang bisa diajukan' } });
      return;
    }
    const lineCount = await client.query('SELECT COUNT(*)::int AS n FROM finance.budget_lines WHERE budget_id = $1', [req.params.id]);
    if ((lineCount.rows[0]?.n ?? 0) === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'RKA belum punya baris anggaran — tambahkan minimal satu baris dulu' } });
      return;
    }
    const result = await client.query(
      `UPDATE finance.budgets SET status = 'SUBMITTED', submitted_at = NOW(), submitted_by = $3, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, req.user!.userId]
    );
    await client.query('COMMIT');
    logger.info('Budget submitted', { user: req.user?.username, budgetId: req.params.id });
    await recordFinanceAudit(req, 'Diajukan', 'FinanceBudget', budget.id, `${budget.code} — ${budget.name}`, `RKA ${budget.code} diajukan untuk persetujuan`, 'sensitive');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT budgets/:id/submit', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengajukan RKA' } });
  } finally {
    client.release();
  }
});

router.put('/:id/approve', requireFinancePermission('approve'), async (req: AuthRequest, res: Response) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bRes = await client.query('SELECT * FROM finance.budgets WHERE id = $1 AND organization_id = $2 FOR UPDATE', [req.params.id, FINANCE_ORG]);
    const budget = bRes.rows[0];
    if (!budget) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'RKA tidak ditemukan' } });
      return;
    }
    if (budget.status !== 'SUBMITTED') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya RKA berstatus Diajukan yang bisa disetujui' } });
      return;
    }
    if (budget.created_by === req.user!.userId || budget.submitted_by === req.user!.userId) {
      await client.query('ROLLBACK');
      res.status(403).json({ success: false, error: { code: 'SEGREGATION_OF_DUTIES', message: 'Pembuat/pengaju RKA tidak bisa menyetujui RKA-nya sendiri — perlu orang lain (segregation of duties)' } });
      return;
    }
    const result = await client.query(
      `UPDATE finance.budgets SET status = 'APPROVED', approved_at = NOW(), approved_by = $3, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, req.user!.userId]
    );
    await client.query('COMMIT');
    logger.info('Budget approved', { user: req.user?.username, budgetId: req.params.id });
    await recordFinanceAudit(req, 'Disetujui', 'FinanceBudget', budget.id, `${budget.code} — ${budget.name}`, `RKA ${budget.code} disetujui`, 'sensitive');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT budgets/:id/approve', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menyetujui RKA' } });
  } finally {
    client.release();
  }
});

router.put('/:id/reject', requireFinancePermission('approve'), async (req: AuthRequest, res: Response) => {
  const { reason } = req.body ?? {};
  if (!reason) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Alasan penolakan wajib diisi' } });
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bRes = await client.query('SELECT * FROM finance.budgets WHERE id = $1 AND organization_id = $2 FOR UPDATE', [req.params.id, FINANCE_ORG]);
    const budget = bRes.rows[0];
    if (!budget) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'RKA tidak ditemukan' } });
      return;
    }
    if (budget.status !== 'SUBMITTED') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya RKA berstatus Diajukan yang bisa dikembalikan' } });
      return;
    }
    if (budget.created_by === req.user!.userId || budget.submitted_by === req.user!.userId) {
      await client.query('ROLLBACK');
      res.status(403).json({ success: false, error: { code: 'SEGREGATION_OF_DUTIES', message: 'Pembuat/pengaju RKA tidak bisa menolak/mengembalikan RKA-nya sendiri — perlu orang lain (segregation of duties)' } });
      return;
    }
    const result = await client.query(
      `UPDATE finance.budgets SET status = 'DRAFT', revision_reason = $3, updated_at = NOW(), updated_by = $4
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, reason, req.user!.userId]
    );
    await client.query('COMMIT');
    logger.info('Budget rejected', { user: req.user?.username, budgetId: req.params.id, reason });
    await recordFinanceAudit(req, 'Ditolak', 'FinanceBudget', budget.id, `${budget.code} — ${budget.name}`, `RKA ${budget.code} dikembalikan ke Draft — alasan: ${reason}`, 'sensitive');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT budgets/:id/reject', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengembalikan RKA' } });
  } finally {
    client.release();
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
    // Kunci baris Tahun Fiskal ini SELAMA transaksi -- supaya 2 permintaan
    // aktivasi untuk RKA BERBEDA tapi Tahun Fiskal yang SAMA tidak bisa berjalan
    // bersamaan. Tanpa ini, keduanya bisa sama-sama membaca "belum ada yang
    // ACTIVE" lalu sama-sama berhasil set dirinya ACTIVE -- menghasilkan 2 RKA
    // aktif sekaligus untuk 1 tahun fiskal (merusak Ringkasan Anggaran & Laporan
    // Realisasi Anggaran). Semua permintaan aktivasi untuk tahun fiskal yang
    // sama otomatis berbaris lewat lock baris fiscal_years ini, siapa pun
    // RKA-nya. uq_budgets_one_active_per_fiscal_year (lihat financeSchema.ts)
    // jadi pengaman lapis kedua di level database kalau lock ini sampai
    // terlewati.
    await client.query('SELECT id FROM finance.fiscal_years WHERE id = $1 FOR UPDATE', [budget.fiscal_year_id]);
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
    await recordFinanceAudit(req, 'Diaktifkan', 'FinanceBudget', budget.id, `${budget.code} — ${budget.name}`, `RKA ${budget.code} diaktifkan sebagai anggaran berlaku untuk tahun fiskal ini`, 'critical');
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT budgets/:id/activate', { message: String(err) });
    const isUnique = /unique/i.test(String(err?.message ?? ''));
    res.status(isUnique ? 409 : 500).json({
      success: false,
      error: {
        code: isUnique ? 'CONFLICT' : 'INTERNAL_ERROR',
        message: isUnique ? 'RKA lain untuk Tahun Fiskal ini baru saja diaktifkan bersamaan — muat ulang dan coba lagi' : 'Gagal mengaktifkan RKA',
      },
    });
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
    // Akun WAJIB selalu dicek aktif; Dana dicek HANYA kalau diisi -- mencegah
    // baris RKA baru mengacu ke akun/dana yang sudah dinonaktifkan.
    await assertMasterDataActive(pool, 'finance.accounts', account_id, 'Akun', true);
    await assertMasterDataActive(pool, 'finance.funds', nullable(body.fund_id), 'Dana', true);
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
    const message = err?.status ? err.message : (/foreign key/i.test(String(err?.message ?? '')) ? 'Referensi yang dipilih tidak valid' : 'Gagal menambah baris RKA');
    res.status(err?.status ?? 400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
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
