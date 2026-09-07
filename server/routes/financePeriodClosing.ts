// ============================================================
// FINANCE ADD-ON MODULE — Fase 7: Penutupan Periode
// ============================================================
// finance.periods.status ('OPEN'/'SOFT_CLOSED'/'CLOSED'/'LOCKED') sudah
// menjadi satu-satunya sumber kebenaran yang dicek di seluruh mesin
// transaksi (lihat financeTransaction.ts: create/:id/post/:id/reverse semua
// menolak kalau period.status !== 'OPEN'). Fase 7 ini murni membangun
// checklist penutupan periode di atasnya + endpoint untuk benar-benar
// memindahkan status periode OPEN -> CLOSED (dan sebaliknya, reopen).
//
// Checklist penutupan (dihitung ulang di server setiap kali, tidak percaya
// input klien) sebelum periode boleh ditutup:
//   1. Semua transaksi di periode ini sudah final — tidak ada yang masih
//      DRAFT/SUBMITTED/VERIFIED/APPROVED/REJECTED/REVISION_REQUIRED
//      (hanya POSTED/REVERSED/CANCELLED yang dianggap final).
//   2. Semua Rekening Bank aktif sudah punya Sesi Rekonsiliasi berstatus
//      Disetujui (APPROVED) untuk periode ini (lihat financeReconciliation.ts).
//   3. Neraca saldo jurnal periode ini balance (total debit = total kredit) —
//      ini sebenarnya selalu benar berkat CHECK constraint per jurnal,
//      murni sanity-check tambahan sebelum tutup buku.
//   4. Review anggaran (RKA) — item MANUAL (dicentang pengguna), karena
//      sinkronisasi actual_amount anggaran belum diimplementasikan (gap
//      yang sudah didokumentasikan sejak Fase 4).
// Periode hanya bisa ditutup kalau ke-4 item di atas terpenuhi.
//
// Reopen (CLOSED -> OPEN) sengaja TIDAK memakai aturan segregation-of-duties
// (orang yang sama boleh membuka lagi periode yang ia tutup) karena ini
// tindakan koreksi administratif yang jarang terjadi, bukan bagian dari
// alur maker-checker verify/approve/post — tapi tetap wajib mengisi alasan
// (reopen_reason) untuk jejak audit.
// ============================================================

import { Router, Response } from 'express';
import { getPool } from '../lib/db.js';
import { requireRealDb, FINANCE_ORG } from '../lib/financeCrud.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireFinancePermission } from '../middleware/checkFinancePermission.js';
import { logger } from '../lib/logger.js';

const router = Router();
router.use(requireAuth, requireRealDb);

const NONFINAL_STATUSES = ['DRAFT', 'SUBMITTED', 'VERIFIED', 'APPROVED', 'REJECTED', 'REVISION_REQUIRED'];

async function evaluateChecklist(pool: ReturnType<typeof getPool>, periodId: string) {
  const openTxRes = await pool.query(
    `SELECT t.id, v.voucher_number, t.description, t.status
     FROM finance.transactions t JOIN finance.vouchers v ON v.id = t.voucher_id
     WHERE t.organization_id = $1 AND t.period_id = $2 AND t.status::text = ANY($3::text[])
     ORDER BY t.created_at ASC`,
    [FINANCE_ORG, periodId, NONFINAL_STATUSES]
  );

  const bankRes = await pool.query(
    `SELECT ba.id AS bank_account_id, ba.bank_name, ba.account_number, r.status AS reconciliation_status
     FROM finance.bank_accounts ba
     LEFT JOIN finance.reconciliations r ON r.bank_account_id = ba.id AND r.period_id = $2 AND r.status <> 'CANCELLED'
     WHERE ba.organization_id = $1 AND ba.is_active = TRUE
     ORDER BY ba.bank_name ASC`,
    [FINANCE_ORG, periodId]
  );
  const unreconciledBanks = bankRes.rows.filter((b: any) => b.reconciliation_status !== 'APPROVED');

  const tbRes = await pool.query(
    `SELECT COALESCE(SUM(jl.debit),0) AS total_debit, COALESCE(SUM(jl.credit),0) AS total_credit
     FROM finance.journal_lines jl JOIN finance.journals j ON j.id = jl.journal_id
     WHERE j.organization_id = $1 AND j.period_id = $2`,
    [FINANCE_ORG, periodId]
  );
  const totalDebit = Number(tbRes.rows[0].total_debit);
  const totalCredit = Number(tbRes.rows[0].total_credit);
  const trialBalanceOk = Math.abs(totalDebit - totalCredit) < 0.01;

  const pcRes = await pool.query('SELECT * FROM finance.period_closings WHERE period_id = $1', [periodId]);
  const closing = pcRes.rows[0] || null;
  const manualChecks = closing?.checklist_json?.manualChecks || {};
  const budgetReviewed = manualChecks.budget_reviewed === true;

  const items = {
    transactionsFinalized: { pass: openTxRes.rows.length === 0, openTransactions: openTxRes.rows },
    bankReconciliationApproved: { pass: unreconciledBanks.length === 0, unreconciledBanks },
    trialBalanceOk: { pass: trialBalanceOk, totalDebit, totalCredit },
    budgetReviewed: { pass: budgetReviewed, manualChecks },
  };
  const canClose = items.transactionsFinalized.pass && items.bankReconciliationApproved.pass && items.trialBalanceOk.pass && items.budgetReviewed.pass;
  const unresolvedCount = openTxRes.rows.length + unreconciledBanks.length + (trialBalanceOk ? 0 : 1) + (budgetReviewed ? 0 : 1);

  return { items, canClose, unresolvedCount, closing };
}

router.get('/', requireFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  if (!req.query.fiscalYearId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tahun Fiskal wajib dipilih' } });
    return;
  }
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT p.*, pc.status AS closing_status, pc.closed_at, pc.closed_by, pc.unresolved_count
       FROM finance.periods p
       JOIN finance.fiscal_years fy ON fy.id = p.fiscal_year_id
       LEFT JOIN finance.period_closings pc ON pc.period_id = p.id
       WHERE p.fiscal_year_id = $1 AND fy.organization_id = $2
       ORDER BY p.period_number ASC`,
      [req.query.fiscalYearId, FINANCE_ORG]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('GET period-closing/', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil daftar periode' } });
  }
});

router.get('/:periodId', requireFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const periodRes = await pool.query(
      `SELECT p.*, fy.code AS fiscal_year_code, fy.name AS fiscal_year_name
       FROM finance.periods p JOIN finance.fiscal_years fy ON fy.id = p.fiscal_year_id
       WHERE p.id = $1 AND fy.organization_id = $2`,
      [req.params.periodId, FINANCE_ORG]
    );
    const period = periodRes.rows[0];
    if (!period) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Periode tidak ditemukan' } }); return; }
    const checklist = await evaluateChecklist(pool, req.params.periodId);
    res.json({ success: true, data: { period, ...checklist } });
  } catch (err) {
    logger.error('GET period-closing/:periodId', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengevaluasi checklist penutupan periode' } });
  }
});

// ── Centang item manual (mis. "Review Anggaran sudah dilakukan") ────────────────
router.put('/:periodId/checklist', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  const { key, checked, note } = req.body || {};
  if (key !== 'budget_reviewed') {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Item checklist tidak dikenal' } });
    return;
  }
  try {
    const pool = getPool();
    const periodRes = await pool.query('SELECT id FROM finance.periods WHERE id = $1', [req.params.periodId]);
    if (periodRes.rows.length === 0) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Periode tidak ditemukan' } }); return; }

    const existing = await pool.query('SELECT checklist_json FROM finance.period_closings WHERE period_id = $1', [req.params.periodId]);
    const currentJson = existing.rows[0]?.checklist_json || {};
    const manualChecks = { ...(currentJson.manualChecks || {}) };
    manualChecks[key] = !!checked;
    manualChecks[`${key}_note`] = note || null;
    manualChecks[`${key}_by`] = req.user!.userId;
    const newJson = { ...currentJson, manualChecks };

    await pool.query(
      `INSERT INTO finance.period_closings (period_id, checklist_json)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (period_id) DO UPDATE SET checklist_json = $2::jsonb`,
      [req.params.periodId, JSON.stringify(newJson)]
    );
    const checklist = await evaluateChecklist(pool, req.params.periodId);
    logger.info('Period closing checklist updated', { user: req.user?.username, periodId: req.params.periodId, key, checked });
    res.json({ success: true, data: checklist });
  } catch (err) {
    logger.error('PUT period-closing/:periodId/checklist', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menyimpan checklist' } });
  }
});

router.put('/:periodId/close', requireFinancePermission('approve'), async (req: AuthRequest, res: Response) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const periodRes = await client.query('SELECT * FROM finance.periods WHERE id = $1 FOR UPDATE', [req.params.periodId]);
    const period = periodRes.rows[0];
    if (!period) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Periode tidak ditemukan' } }); return; }
    if (period.status !== 'OPEN') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Periode ini sudah tidak berstatus Terbuka' } });
      return;
    }
    const checklist = await evaluateChecklist(client as any, req.params.periodId);
    if (!checklist.canClose) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'CHECKLIST_INCOMPLETE', message: 'Checklist penutupan periode belum lengkap — lihat detail item yang belum terpenuhi', details: checklist.items } });
      return;
    }
    await client.query(
      `UPDATE finance.periods SET status = 'CLOSED', closed_at = NOW(), closed_by = $2 WHERE id = $1`,
      [period.id, req.user!.userId]
    );
    await client.query(
      `INSERT INTO finance.period_closings (period_id, checklist_json, unresolved_count, status, closed_at, closed_by)
       VALUES ($1, '{}'::jsonb, 0, 'CLOSED', NOW(), $2)
       ON CONFLICT (period_id) DO UPDATE SET status = 'CLOSED', unresolved_count = 0, closed_at = NOW(), closed_by = $2,
         reopened_at = NULL, reopened_by = NULL, reopen_reason = NULL`,
      [period.id, req.user!.userId]
    );
    await client.query('COMMIT');
    logger.info('Period closed', { user: req.user?.username, periodId: period.id });
    res.json({ success: true, data: null });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT period-closing/:periodId/close', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menutup periode' } });
  } finally {
    client.release();
  }
});

router.put('/:periodId/reopen', requireFinancePermission('approve'), async (req: AuthRequest, res: Response) => {
  const reason = String(req.body?.reason ?? '').trim();
  if (!reason) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Alasan membuka kembali periode wajib diisi' } });
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const periodRes = await client.query('SELECT * FROM finance.periods WHERE id = $1 FOR UPDATE', [req.params.periodId]);
    const period = periodRes.rows[0];
    if (!period) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Periode tidak ditemukan' } }); return; }
    if (period.status !== 'CLOSED') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya periode berstatus Ditutup yang bisa dibuka kembali (periode Terkunci tidak bisa)' } });
      return;
    }
    await client.query(`UPDATE finance.periods SET status = 'OPEN' WHERE id = $1`, [period.id]);
    await client.query(
      `UPDATE finance.period_closings SET status = 'OPEN', reopened_at = NOW(), reopened_by = $2, reopen_reason = $3 WHERE period_id = $1`,
      [period.id, req.user!.userId, reason]
    );
    await client.query('COMMIT');
    logger.info('Period reopened', { user: req.user?.username, periodId: period.id, reason });
    res.json({ success: true, data: null });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT period-closing/:periodId/reopen', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal membuka kembali periode' } });
  } finally {
    client.release();
  }
});

export default router;
