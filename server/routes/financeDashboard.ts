// ============================================================
// FINANCE ADD-ON MODULE — Fase 9: Dashboard & Analitik
// ============================================================
// Satu endpoint ringkasan eksekutif untuk satu Tahun Fiskal — semuanya
// dihitung real-time dari jurnal yang sudah diposting, sama seperti Fase 8
// (financeReports.ts). Tidak ada tabel ringkasan/cache baru; halaman ini
// murni menyusun ulang data yang sudah ada (Neraca, Laporan Aktivitas,
// status transaksi) jadi satu pandangan cepat.
// ============================================================

import { Router, Response } from 'express';
import { getPool } from '../lib/db.js';
import { requireRealDb, FINANCE_ORG } from '../lib/financeCrud.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireFinancePermission } from '../middleware/checkFinancePermission.js';
import { logger } from '../lib/logger.js';

const router = Router();
router.use(requireAuth, requireRealDb, requireFinancePermission('view'));

router.get('/', async (req: AuthRequest, res: Response) => {
  if (!req.query.fiscalYearId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tahun Fiskal wajib dipilih' } });
    return;
  }
  const fiscalYearId = String(req.query.fiscalYearId);
  try {
    const pool = getPool();
    const fyRes = await pool.query('SELECT * FROM finance.fiscal_years WHERE id = $1 AND organization_id = $2', [fiscalYearId, FINANCE_ORG]);
    const fiscalYear = fyRes.rows[0];
    if (!fiscalYear) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tahun Fiskal tidak ditemukan' } }); return; }

    const today = new Date().toISOString().slice(0, 10);
    // Batasi "as of" ke rentang Tahun Fiskal ini supaya masuk akal kalau yang dipilih tahun lampau.
    const asOfDate = today < fiscalYear.start_date ? fiscalYear.start_date : (today > fiscalYear.end_date ? fiscalYear.end_date : today);

    // ── Neraca ringkas per asOfDate (logika sama seperti Fase 8 balance-sheet) ──
    const acctRes = await pool.query(
      `SELECT a.id, a.code, a.name, a.account_type, a.normal_balance, a.opening_balance
       FROM finance.accounts a
       WHERE a.organization_id = $1 AND a.is_postable = TRUE`,
      [FINANCE_ORG]
    );
    const sumsRes = await pool.query(
      `SELECT jl.account_id, COALESCE(SUM(jl.debit),0) AS total_debit, COALESCE(SUM(jl.credit),0) AS total_credit
       FROM finance.journal_lines jl JOIN finance.journals j ON j.id = jl.journal_id
       WHERE j.organization_id = $1 AND j.journal_date <= $2
       GROUP BY jl.account_id`,
      [FINANCE_ORG, asOfDate]
    );
    const sumsByAccount = new Map<string, { debit: number; credit: number }>();
    for (const r of sumsRes.rows) sumsByAccount.set(r.account_id, { debit: Number(r.total_debit), credit: Number(r.total_credit) });
    let totalAssets = 0, totalLiabilities = 0, totalFundBalanceRaw = 0;
    for (const a of acctRes.rows) {
      const s = sumsByAccount.get(a.id) || { debit: 0, credit: 0 };
      const net = a.normal_balance === 'DEBIT' ? s.debit - s.credit : s.credit - s.debit;
      const balance = Number(a.opening_balance) + net;
      if (a.account_type === 'ASSET') totalAssets += balance;
      else if (a.account_type === 'LIABILITY') totalLiabilities += balance;
      else if (a.account_type === 'FUND_BALANCE') totalFundBalanceRaw += balance;
    }

    // ── Pendapatan/Beban year-to-date (awal Tahun Fiskal s/d asOfDate) ──────────
    const ytdRes = await pool.query(
      `SELECT a.account_type, COALESCE(SUM(jl.debit),0) AS total_debit, COALESCE(SUM(jl.credit),0) AS total_credit
       FROM finance.journal_lines jl
       JOIN finance.journals j ON j.id = jl.journal_id
       JOIN finance.accounts a ON a.id = jl.account_id
       WHERE j.organization_id = $1 AND j.fiscal_year_id = $2 AND j.journal_date <= $3 AND a.account_type IN ('REVENUE','EXPENSE')
       GROUP BY a.account_type`,
      [FINANCE_ORG, fiscalYearId, asOfDate]
    );
    let ytdRevenue = 0, ytdExpense = 0;
    for (const r of ytdRes.rows) {
      if (r.account_type === 'REVENUE') ytdRevenue = Number(r.total_credit) - Number(r.total_debit);
      if (r.account_type === 'EXPENSE') ytdExpense = Number(r.total_debit) - Number(r.total_credit);
    }
    const ytdNetSurplus = ytdRevenue - ytdExpense;
    const totalFundBalanceEffective = totalFundBalanceRaw + ytdNetSurplus;

    // ── Tren bulanan (per Periode di Tahun Fiskal ini) ──────────────────────────
    const trendRes = await pool.query(
      `SELECT p.id AS period_id, p.period_number, p.name AS period_name,
         COALESCE(SUM(CASE WHEN a.account_type = 'REVENUE' THEN jl.credit - jl.debit ELSE 0 END),0) AS revenue,
         COALESCE(SUM(CASE WHEN a.account_type = 'EXPENSE' THEN jl.debit - jl.credit ELSE 0 END),0) AS expense
       FROM finance.periods p
       LEFT JOIN finance.journals j ON j.period_id = p.id AND j.organization_id = $1
       LEFT JOIN finance.journal_lines jl ON jl.journal_id = j.id
       LEFT JOIN finance.accounts a ON a.id = jl.account_id AND a.account_type IN ('REVENUE','EXPENSE')
       WHERE p.fiscal_year_id = $2
       GROUP BY p.id, p.period_number, p.name
       ORDER BY p.period_number ASC`,
      [FINANCE_ORG, fiscalYearId]
    );
    const monthlyTrend = trendRes.rows.map((r: any) => ({
      periodId: r.period_id, periodNumber: r.period_number, periodName: r.period_name,
      revenue: Number(r.revenue), expense: Number(r.expense), net: Number(r.revenue) - Number(r.expense),
    }));

    // ── Status transaksi (untuk Tahun Fiskal ini) ───────────────────────────────
    const statusRes = await pool.query(
      `SELECT status, COUNT(*) AS cnt FROM finance.transactions
       WHERE organization_id = $1 AND fiscal_year_id = $2 GROUP BY status`,
      [FINANCE_ORG, fiscalYearId]
    );
    const statusCounts: Record<string, number> = {};
    for (const r of statusRes.rows) statusCounts[r.status] = Number(r.cnt);
    const pendingApproval = (statusCounts.SUBMITTED || 0) + (statusCounts.VERIFIED || 0) + (statusCounts.APPROVED || 0);

    // ── Top 5 akun Beban (YTD) ───────────────────────────────────────────────────
    const topExpenseRes = await pool.query(
      `SELECT a.code, a.name, COALESCE(SUM(jl.debit - jl.credit),0) AS amount
       FROM finance.journal_lines jl
       JOIN finance.journals j ON j.id = jl.journal_id
       JOIN finance.accounts a ON a.id = jl.account_id
       WHERE j.organization_id = $1 AND j.fiscal_year_id = $2 AND j.journal_date <= $3 AND a.account_type = 'EXPENSE'
       GROUP BY a.code, a.name
       HAVING COALESCE(SUM(jl.debit - jl.credit),0) > 0
       ORDER BY amount DESC LIMIT 5`,
      [FINANCE_ORG, fiscalYearId, asOfDate]
    );

    // ── Ringkasan status periode ─────────────────────────────────────────────────
    const periodStatusRes = await pool.query(
      `SELECT status, COUNT(*) AS cnt FROM finance.periods WHERE fiscal_year_id = $1 GROUP BY status`,
      [fiscalYearId]
    );
    const periodStatusCounts: Record<string, number> = {};
    for (const r of periodStatusRes.rows) periodStatusCounts[r.status] = Number(r.cnt);

    res.json({
      success: true,
      data: {
        fiscalYear, asOfDate,
        totalAssets, totalLiabilities, totalFundBalanceEffective,
        ytdRevenue, ytdExpense, ytdNetSurplus,
        monthlyTrend,
        statusCounts, pendingApproval,
        topExpenseAccounts: topExpenseRes.rows.map((r: any) => ({ code: r.code, name: r.name, amount: Number(r.amount) })),
        periodStatusCounts,
      },
    });
  } catch (err) {
    logger.error('GET dashboard/', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal memuat dashboard keuangan' } });
  }
});

export default router;
