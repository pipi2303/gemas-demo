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
import { requireFinancePermission as requireFinancePermissionBase } from '../middleware/checkFinancePermission.js';

// Submenu Finance Add-on untuk file ini (dipakai validasi server per-submenu) —
// lihat komentar di checkFinancePermission.ts.
const requireFinancePermission = (action?: string) => requireFinancePermissionBase(action, 'finance-dashboard');
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
    const balanceByAccount = new Map<string, number>();
    let totalAssets = 0, totalLiabilities = 0, totalFundBalanceRaw = 0;
    for (const a of acctRes.rows) {
      const s = sumsByAccount.get(a.id) || { debit: 0, credit: 0 };
      const net = a.normal_balance === 'DEBIT' ? s.debit - s.credit : s.credit - s.debit;
      const balance = Number(a.opening_balance) + net;
      balanceByAccount.set(a.id, balance);
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

    // ── Top 5 akun Pendapatan (YTD) ──────────────────────────────────────────────
    const topRevenueRes = await pool.query(
      `SELECT a.code, a.name, COALESCE(SUM(jl.credit - jl.debit),0) AS amount
       FROM finance.journal_lines jl
       JOIN finance.journals j ON j.id = jl.journal_id
       JOIN finance.accounts a ON a.id = jl.account_id
       WHERE j.organization_id = $1 AND j.fiscal_year_id = $2 AND j.journal_date <= $3 AND a.account_type = 'REVENUE'
       GROUP BY a.code, a.name
       HAVING COALESCE(SUM(jl.credit - jl.debit),0) > 0
       ORDER BY amount DESC LIMIT 5`,
      [FINANCE_ORG, fiscalYearId, asOfDate]
    );

    // ── Kas & Bank (Likuiditas) ───────────────────────────────────────────────────
    const cashAcctsRes = await pool.query(
      `SELECT id, account_id, code, name, location FROM finance.cash_accounts
       WHERE organization_id = $1 AND is_active = TRUE`,
      [FINANCE_ORG]
    );
    const bankAcctsRes = await pool.query(
      `SELECT id, account_id, bank_name, account_number, account_name, currency FROM finance.bank_accounts
       WHERE organization_id = $1 AND is_active = TRUE`,
      [FINANCE_ORG]
    );
    const cashAccounts = (cashAcctsRes.rows || []).map((c: any) => ({
      ...c, current_balance: balanceByAccount.get(c.account_id) || 0
    }));
    const bankAccounts = (bankAcctsRes.rows || []).map((b: any) => ({
      ...b, current_balance: balanceByAccount.get(b.account_id) || 0
    }));

    const totalCash = cashAccounts.reduce((s: number, c: any) => s + c.current_balance, 0);
    const totalBank = bankAccounts.reduce((s: number, b: any) => s + b.current_balance, 0);
    const totalLiquidAssets = totalCash + totalBank;

    // ── Ringkasan Anggaran (Budget) ──────────────────────────────────────────────
    // Audit gap fix: sebelumnya cuma budget berstatus ACTIVE yang dihitung, padahal
    // Laporan Realisasi Anggaran (financeReports.ts, GET /reports/budget-realization)
    // memakai APPROVED+ACTIVE+REVISED untuk fiscal year yang sama -- dua angka
    // realisasi berbeda untuk data yang seharusnya sama. Disamakan ke daftar status
    // yang sama supaya "Ringkasan Anggaran" di dashboard konsisten dengan Laporan.
    const budgetRes = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN a.account_type = 'REVENUE' THEN bl.budget_amount ELSE 0 END), 0) AS total_budget_revenue,
         COALESCE(SUM(CASE WHEN a.account_type = 'EXPENSE' THEN bl.budget_amount ELSE 0 END), 0) AS total_budget_expense
       FROM finance.budget_lines bl
       JOIN finance.budgets b ON b.id = bl.budget_id
       JOIN finance.accounts a ON a.id = bl.account_id
       WHERE b.organization_id = $1 AND b.fiscal_year_id = $2 AND b.status IN ('APPROVED','ACTIVE','REVISED')`,
      [FINANCE_ORG, fiscalYearId]
    );
    const budgetRow = budgetRes.rows[0] || { total_budget_revenue: 0, total_budget_expense: 0 };
    const totalBudgetRevenue = Number(budgetRow.total_budget_revenue);
    const totalBudgetExpense = Number(budgetRow.total_budget_expense);

    // Hitung persentase realisasi
    const revenueRealizationRate = totalBudgetRevenue > 0 ? (ytdRevenue / totalBudgetRevenue) * 100 : 0;
    const expenseAbsorptionRate = totalBudgetExpense > 0 ? (ytdExpense / totalBudgetExpense) * 100 : 0;

    // Rata-rata beban operasional bulanan & runway likuiditas.
    // Audit gap fix: sebelumnya asumsi tahun fiskal SELALU mulai April (hardcode
    // `getMonth() + 1 - 3`) -- salah untuk Tahun Fiskal manapun yang start_date-nya
    // beda (Tahun Fiskal dibuat bebas oleh admin, lihat financeMasterData.ts, tidak
    // dibatasi April). Dihitung dari start_date Tahun Fiskal yang sebenarnya s/d
    // asOfDate yang sedang dilihat (bukan bulan kalender sekarang).
    const fyStartDate = new Date(fiscalYear.start_date);
    const asOfForElapsed = new Date(asOfDate);
    const monthsElapsed = Math.max(1,
      (asOfForElapsed.getFullYear() - fyStartDate.getFullYear()) * 12
      + (asOfForElapsed.getMonth() - fyStartDate.getMonth()) + 1
    );
    const avgMonthlyExpense = ytdExpense > 0 ? ytdExpense / monthsElapsed : (totalBudgetExpense / 12);
    const runwayMonths = avgMonthlyExpense > 0 ? (totalLiquidAssets / avgMonthlyExpense) : 12;

    // ── Ringkasan status periode ─────────────────────────────────────────────────
    const periodStatusRes = await pool.query(
      `SELECT status, COUNT(*) AS cnt FROM finance.periods WHERE fiscal_year_id = $1 GROUP BY status`,
      [fiscalYearId]
    );
    const periodStatusCounts: Record<string, number> = {};
    for (const r of periodStatusRes.rows) periodStatusCounts[r.status] = Number(r.cnt);

    // ── Kepatuhan Jurnal Seimbang (integritas double-entry) ─────────────────────
    // Audit gap fix: sebelumnya badge "Jurnal: Seimbang (Balanced)" di dashboard
    // cuma teks statis yang selalu tampil sama apa pun kondisi datanya. Di sini
    // benar-benar dihitung: setiap jurnal yang sudah diposting WAJIB total_debit
    // == total_credit (double-entry); kalau ada satu saja jurnal yang tidak
    // seimbang (semestinya tidak mungkin lewat alur normal, tapi ini jaring
    // pengaman audit), badge akan melaporkannya alih-alih diam-diam tampil OK.
    const unbalancedRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM finance.journals
       WHERE organization_id = $1 AND fiscal_year_id = $2 AND journal_date <= $3
         AND total_debit IS DISTINCT FROM total_credit`,
      [FINANCE_ORG, fiscalYearId, asOfDate]
    );
    const unbalancedJournalCount = Number(unbalancedRes.rows[0]?.cnt || 0);
    const journalBalanced = unbalancedJournalCount === 0;

    res.json({
      success: true,
      data: {
        fiscalYear, asOfDate,
        totalAssets, totalLiabilities, totalFundBalanceEffective,
        ytdRevenue, ytdExpense, ytdNetSurplus,
        monthlyTrend,
        statusCounts, pendingApproval,
        topExpenseAccounts: topExpenseRes.rows.map((r: any) => ({ code: r.code, name: r.name, amount: Number(r.amount) })),
        topRevenueAccounts: topRevenueRes.rows.map((r: any) => ({ code: r.code, name: r.name, amount: Number(r.amount) })),
        cashAccounts, bankAccounts,
        liquidity: {
          totalCash, totalBank, totalLiquidAssets,
          runwayMonths: Number(runwayMonths.toFixed(1)),
          avgMonthlyExpense: Math.round(avgMonthlyExpense)
        },
        budget: {
          totalBudgetRevenue,
          totalBudgetExpense,
          revenueRealizationRate: Number(revenueRealizationRate.toFixed(1)),
          expenseAbsorptionRate: Number(expenseAbsorptionRate.toFixed(1)),
        },
        periodStatusCounts,
        journalBalanced, unbalancedJournalCount,
      },
    });
  } catch (err) {
    logger.error('GET dashboard/', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal memuat dashboard keuangan' } });
  }
});

export default router;
