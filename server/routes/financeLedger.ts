// ============================================================
// FINANCE ADD-ON MODULE — Fase 4: General Ledger (Buku Besar)
// ============================================================
// Endpoint pelaporan read-only atas jurnal yang sudah diposting
// (finance.journals/finance.journal_lines, status selalu POSTED — lihat
// requireFinancePermission('view') di server/routes/financeTransaction.ts
// untuk mesin posting-nya). Dua bentuk laporan:
//   - GET /entries        → mutasi baris jurnal per akun (kartu buku besar),
//                            diurutkan tanggal, saldo berjalan dihitung di
//                            frontend memakai normal_balance akun (kolom
//                            debit/kredit mentah dikembalikan apa adanya).
//   - GET /trial-balance   → neraca saldo: total debit/kredit per akun untuk
//                            satu Tahun Fiskal (opsional dipersempit ke satu
//                            Periode).
// ============================================================

import { Router, Response } from 'express';
import { getPool } from '../lib/db.js';
import { requireRealDb, FINANCE_ORG } from '../lib/financeCrud.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireFinancePermission } from '../middleware/checkFinancePermission.js';
import { logger } from '../lib/logger.js';

const router = Router();
router.use(requireAuth, requireRealDb, requireFinancePermission('view'));

// ── Mutasi Buku Besar per akun ──────────────────────────────────────────────────
router.get('/entries', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const conditions = ['j.organization_id = $1'];
    const params: any[] = [FINANCE_ORG];
    if (req.query.fiscalYearId) { params.push(req.query.fiscalYearId); conditions.push(`j.fiscal_year_id = $${params.length}`); }
    if (req.query.periodId) { params.push(req.query.periodId); conditions.push(`j.period_id = $${params.length}`); }
    if (req.query.accountId) { params.push(req.query.accountId); conditions.push(`jl.account_id = $${params.length}`); }
    if (req.query.from) { params.push(req.query.from); conditions.push(`j.journal_date >= $${params.length}`); }
    if (req.query.to) { params.push(req.query.to); conditions.push(`j.journal_date <= $${params.length}`); }

    const result = await pool.query(
      `SELECT
         jl.id AS journal_line_id, jl.line_number, jl.debit, jl.credit, jl.description AS line_description,
         jl.account_id, a.code AS account_code, a.name AS account_name, a.normal_balance,
         j.id AS journal_id, j.journal_number, j.journal_date, j.description AS journal_description,
         j.reversal_of_journal_id, j.period_id, j.fiscal_year_id,
         v.voucher_number, t.id AS transaction_id
       FROM finance.journal_lines jl
       JOIN finance.journals j ON j.id = jl.journal_id
       JOIN finance.accounts a ON a.id = jl.account_id
       JOIN finance.transactions t ON t.id = j.transaction_id
       JOIN finance.vouchers v ON v.id = j.voucher_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY j.journal_date ASC, j.journal_number ASC, jl.line_number ASC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('GET gl/entries', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil mutasi buku besar' } });
  }
});

// ── Neraca Saldo (Trial Balance) ────────────────────────────────────────────────
router.get('/trial-balance', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.query.fiscalYearId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tahun Fiskal wajib dipilih' } });
      return;
    }
    const pool = getPool();
    const conditions = ['j.organization_id = $1', 'j.fiscal_year_id = $2'];
    const params: any[] = [FINANCE_ORG, req.query.fiscalYearId];
    if (req.query.periodId) { params.push(req.query.periodId); conditions.push(`j.period_id = $${params.length}`); }

    const result = await pool.query(
      `SELECT
         a.id AS account_id, a.code AS account_code, a.name AS account_name, a.normal_balance, a.account_type,
         COALESCE(SUM(jl.debit),0) AS total_debit, COALESCE(SUM(jl.credit),0) AS total_credit
       FROM finance.journal_lines jl
       JOIN finance.journals j ON j.id = jl.journal_id
       JOIN finance.accounts a ON a.id = jl.account_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY a.id, a.code, a.name, a.normal_balance, a.account_type
       ORDER BY a.code ASC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('GET gl/trial-balance', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menghitung neraca saldo' } });
  }
});

export default router;
