// ============================================================
// FINANCE ADD-ON MODULE — Fase 8: Laporan Keuangan
// ============================================================
// Tiga laporan inti, semuanya read-only dan dihitung langsung dari
// finance.journal_lines/finance.transaction_lines yang sudah diposting
// (tidak ada tabel ringkasan/cache terpisah — konsisten dengan pola
// Trial Balance di financeLedger.ts):
//   - GET /balance-sheet        → Neraca (Aset = Kewajiban + Saldo Dana)
//   - GET /activity-statement   → Laporan Aktivitas (Pendapatan - Beban)
//   - GET /budget-realization   → Realisasi Anggaran (RKA vs Realisasi)
//
// Catatan penting untuk Neraca: karena modul ini tidak melakukan jurnal
// penutup formal di akhir periode (akun Pendapatan/Beban tidak "ditutup"
// ke akun Saldo Dana secara eksplisit), Neraca menghitung Saldo Dana
// EFEKTIF sebagai saldo akun FUND_BALANCE ditambah surplus/defisit
// berjalan (akumulasi Pendapatan dikurangi Beban sejak awal sampai
// tanggal laporan) — supaya Aset selalu sama dengan Kewajiban + Saldo
// Dana tanpa perlu proses tutup buku tambahan.
//
// Realisasi Anggaran DIHITUNG LANGSUNG dari finance.transaction_lines
// (kolom budget_line_id, filter transaksi berstatus POSTED) alih-alih
// bergantung pada finance.budget_lines.actual_amount — kolom itu memang
// sengaja tidak disinkronkan otomatis (gap yang didokumentasikan sejak
// Fase 4), tapi laporan ini tidak membutuhkannya sama sekali karena
// realisasi dihitung real-time, sama seperti Trial Balance.
// ============================================================

import { Router, Response } from 'express';
import { getPool } from '../lib/db.js';
import { requireRealDb, FINANCE_ORG } from '../lib/financeCrud.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireFinancePermission } from '../middleware/checkFinancePermission.js';
import { logger } from '../lib/logger.js';

const router = Router();
router.use(requireAuth, requireRealDb, requireFinancePermission('view'));

// ── Neraca (Balance Sheet) ────────────────────────────────────────────────────
router.get('/balance-sheet', async (req: AuthRequest, res: Response) => {
  const asOfDate = String(req.query.asOfDate || '');
  if (!asOfDate) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tanggal Neraca wajib diisi' } });
    return;
  }
  try {
    const pool = getPool();
    const acctRes = await pool.query(
      `SELECT a.id, a.code, a.name, a.account_type, a.normal_balance, a.opening_balance, ag.name AS group_name
       FROM finance.accounts a
       JOIN finance.account_groups ag ON ag.id = a.group_id
       WHERE a.organization_id = $1 AND a.is_postable = TRUE AND a.account_type IN ('ASSET','LIABILITY','FUND_BALANCE','REVENUE','EXPENSE')
       ORDER BY a.code ASC`,
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

    const rows = acctRes.rows.map((a: any) => {
      const s = sumsByAccount.get(a.id) || { debit: 0, credit: 0 };
      const net = a.normal_balance === 'DEBIT' ? s.debit - s.credit : s.credit - s.debit;
      return { ...a, balance: Number(a.opening_balance) + net };
    });

    const assets = rows.filter((r: any) => r.account_type === 'ASSET');
    const liabilities = rows.filter((r: any) => r.account_type === 'LIABILITY');
    const fundBalance = rows.filter((r: any) => r.account_type === 'FUND_BALANCE');
    const revenue = rows.filter((r: any) => r.account_type === 'REVENUE');
    const expense = rows.filter((r: any) => r.account_type === 'EXPENSE');

    const sum = (list: any[]) => list.reduce((s, r) => s + r.balance, 0);
    const totalAssets = sum(assets);
    const totalLiabilities = sum(liabilities);
    const totalFundBalanceRaw = sum(fundBalance);
    const netSurplus = sum(revenue) - sum(expense);
    const totalFundBalanceEffective = totalFundBalanceRaw + netSurplus;

    res.json({
      success: true,
      data: {
        asOfDate,
        assets, liabilities, fundBalance,
        totalAssets, totalLiabilities, totalFundBalanceRaw, netSurplus, totalFundBalanceEffective,
        balanced: Math.abs(totalAssets - (totalLiabilities + totalFundBalanceEffective)) < 0.01,
      },
    });
  } catch (err) {
    logger.error('GET reports/balance-sheet', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menghitung Neraca' } });
  }
});

// ── Laporan Aktivitas (Statement of Activities) ─────────────────────────────────
router.get('/activity-statement', async (req: AuthRequest, res: Response) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if (!from || !to) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Rentang tanggal (dari & sampai) wajib diisi' } });
    return;
  }
  try {
    const pool = getPool();
    const conditions = ['j.organization_id = $1', 'j.journal_date BETWEEN $2 AND $3', "a.account_type IN ('REVENUE','EXPENSE')"];
    const params: any[] = [FINANCE_ORG, from, to];
    if (req.query.fundId) { params.push(req.query.fundId); conditions.push(`jl.fund_id = $${params.length}`); }

    const result = await pool.query(
      `SELECT a.id AS account_id, a.code, a.name, a.account_type, a.normal_balance,
         COALESCE(SUM(jl.debit),0) AS total_debit, COALESCE(SUM(jl.credit),0) AS total_credit
       FROM finance.journal_lines jl
       JOIN finance.journals j ON j.id = jl.journal_id
       JOIN finance.accounts a ON a.id = jl.account_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
       ORDER BY a.code ASC`,
      params
    );
    const rows = result.rows.map((r: any) => ({
      ...r,
      amount: r.account_type === 'REVENUE' ? Number(r.total_credit) - Number(r.total_debit) : Number(r.total_debit) - Number(r.total_credit),
    }));
    const revenue = rows.filter((r: any) => r.account_type === 'REVENUE');
    const expense = rows.filter((r: any) => r.account_type === 'EXPENSE');
    const totalRevenue = revenue.reduce((s: number, r: any) => s + r.amount, 0);
    const totalExpense = expense.reduce((s: number, r: any) => s + r.amount, 0);

    const byFundParams: any[] = [FINANCE_ORG, from, to];
    const byFundRes = await pool.query(
      `SELECT f.id AS fund_id, f.code, f.name,
         COALESCE(SUM(CASE WHEN a.account_type = 'REVENUE' THEN jl.credit - jl.debit ELSE 0 END),0) AS revenue,
         COALESCE(SUM(CASE WHEN a.account_type = 'EXPENSE' THEN jl.debit - jl.credit ELSE 0 END),0) AS expense
       FROM finance.journal_lines jl
       JOIN finance.journals j ON j.id = jl.journal_id
       JOIN finance.accounts a ON a.id = jl.account_id
       JOIN finance.funds f ON f.id = jl.fund_id
       WHERE j.organization_id = $1 AND j.journal_date BETWEEN $2 AND $3 AND a.account_type IN ('REVENUE','EXPENSE')
       GROUP BY f.id, f.code, f.name
       ORDER BY f.code ASC`,
      byFundParams
    );

    res.json({
      success: true,
      data: {
        from, to, revenue, expense, totalRevenue, totalExpense, netSurplus: totalRevenue - totalExpense,
        byFund: byFundRes.rows.map((r: any) => ({ ...r, revenue: Number(r.revenue), expense: Number(r.expense), net: Number(r.revenue) - Number(r.expense) })),
      },
    });
  } catch (err) {
    logger.error('GET reports/activity-statement', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menghitung Laporan Aktivitas' } });
  }
});

// ── Realisasi Anggaran (Budget Realization) ─────────────────────────────────────
router.get('/budget-realization', async (req: AuthRequest, res: Response) => {
  if (!req.query.fiscalYearId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tahun Fiskal wajib dipilih' } });
    return;
  }
  try {
    const pool = getPool();
    const budgetConditions = ['b.organization_id = $1', 'b.fiscal_year_id = $2', "b.status IN ('APPROVED','ACTIVE','REVISED')"];
    const params: any[] = [FINANCE_ORG, req.query.fiscalYearId];
    if (req.query.periodId) { params.push(req.query.periodId); budgetConditions.push(`bl.period_id = $${params.length}`); }

    const result = await pool.query(
      `SELECT bl.id AS budget_line_id, bl.budget_amount,
         a.code AS account_code, a.name AS account_name,
         f.name AS field_name, pr.name AS program_name, act.name AS activity_name, fu.name AS fund_name,
         p.name AS period_name,
         COALESCE((
           SELECT SUM(tl.debit - tl.credit)
           FROM finance.transaction_lines tl JOIN finance.transactions t ON t.id = tl.transaction_id
           WHERE tl.budget_line_id = bl.id AND t.status = 'POSTED'
         ), 0) AS actual_net
       FROM finance.budget_lines bl
       JOIN finance.budgets b ON b.id = bl.budget_id
       JOIN finance.accounts a ON a.id = bl.account_id
       JOIN finance.periods p ON p.id = bl.period_id
       LEFT JOIN finance.fields f ON f.id = bl.field_id
       LEFT JOIN finance.programs pr ON pr.id = bl.program_id
       LEFT JOIN finance.activities act ON act.id = bl.activity_id
       LEFT JOIN finance.funds fu ON fu.id = bl.fund_id
       WHERE ${budgetConditions.join(' AND ')}
       ORDER BY a.code ASC, p.period_number ASC`,
      params
    );

    const rows = result.rows.map((r: any) => {
      // actual_net dihitung debit-kredit mentah; untuk akun Beban (normal DEBIT) ini sudah
      // langsung jadi jumlah realisasi positif, untuk akun Pendapatan (normal CREDIT) dibalik.
      const actual = Math.abs(Number(r.actual_net));
      const budgetAmount = Number(r.budget_amount);
      const variance = budgetAmount - actual;
      const variancePct = budgetAmount > 0 ? (actual / budgetAmount) * 100 : (actual > 0 ? 100 : 0);
      return { ...r, actual, variance, variancePct };
    });
    const totalBudget = rows.reduce((s: number, r: any) => s + Number(r.budget_amount), 0);
    const totalActual = rows.reduce((s: number, r: any) => s + r.actual, 0);

    res.json({ success: true, data: { lines: rows, totalBudget, totalActual, totalVariance: totalBudget - totalActual } });
  } catch (err) {
    logger.error('GET reports/budget-realization', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menghitung Realisasi Anggaran' } });
  }
});

export default router;
