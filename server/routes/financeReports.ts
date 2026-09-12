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
import { requireFinancePermission as requireFinancePermissionBase } from '../middleware/checkFinancePermission.js';

// Submenu Finance Add-on untuk file ini (dipakai validasi server per-submenu) —
// lihat komentar di checkFinancePermission.ts.
const requireFinancePermission = (action?: string) => requireFinancePermissionBase(action, 'finance-reports');
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
      `SELECT f.id AS fund_id, f.code, f.name, f.restriction_type,
         COALESCE(SUM(CASE WHEN a.account_type = 'REVENUE' THEN jl.credit - jl.debit ELSE 0 END),0) AS revenue,
         COALESCE(SUM(CASE WHEN a.account_type = 'EXPENSE' THEN jl.debit - jl.credit ELSE 0 END),0) AS expense
       FROM finance.journal_lines jl
       JOIN finance.journals j ON j.id = jl.journal_id
       JOIN finance.accounts a ON a.id = jl.account_id
       JOIN finance.funds f ON f.id = jl.fund_id
       WHERE j.organization_id = $1 AND j.journal_date BETWEEN $2 AND $3 AND a.account_type IN ('REVENUE','EXPENSE')
       GROUP BY f.id, f.code, f.name, f.restriction_type
       ORDER BY f.code ASC`,
      byFundParams
    );
    const byFund = byFundRes.rows.map((r: any) => ({ ...r, revenue: Number(r.revenue), expense: Number(r.expense), net: Number(r.revenue) - Number(r.expense) }));

    // Roll-up ISAK 35: standar saat ini menyederhanakan klasifikasi aset neto jadi 2
    // kategori (dengan pembatasan / tanpa pembatasan dari penyumbang), bukan 4 tingkat
    // restriction_type yang dipakai secara internal (finance.funds tidak diubah -- 4
    // tingkat itu tetap berguna untuk pencatatan detail, rinciannya tetap tersedia di
    // byFund di atas). Roll-up ini KHUSUS untuk tampilan resmi ke Sinode/auditor.
    const isak35Rollup = { unrestricted: { revenue: 0, expense: 0, net: 0 }, restricted: { revenue: 0, expense: 0, net: 0 } };
    for (const f of byFund) {
      const bucket = f.restriction_type === 'UNRESTRICTED' ? isak35Rollup.unrestricted : isak35Rollup.restricted;
      bucket.revenue += f.revenue;
      bucket.expense += f.expense;
      bucket.net += f.net;
    }

    res.json({
      success: true,
      data: {
        from, to, revenue, expense, totalRevenue, totalExpense, netSurplus: totalRevenue - totalExpense,
        byFund, isak35Rollup,
      },
    });
  } catch (err) {
    logger.error('GET reports/activity-statement', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menghitung Laporan Aktivitas' } });
  }
});

// ── Laporan Arus Kas (Cash Flow Statement, metode LANGSUNG) ──────────────────────
// Tidak ada tabel/kolom baru -- akun "Kas & Setara Kas" diidentifikasi lewat JOIN ke
// finance.cash_accounts & finance.bank_accounts (account_id), BUKAN ditebak dari nama
// akun. Untuk tiap jurnal ter-posting dalam rentang tanggal, hitung pergerakan bersih
// pada sisi kas -- kalau nol (mis. jurnal Bukti Transfer memindahkan dana antar Kas
// Tunai <-> Bank, dua-duanya "kas"), jurnal itu otomatis tidak muncul di laporan ini
// (benar secara akuntansi: mutasi antar-kas bukan arus kas eksternal). Untuk jurnal
// yang pergerakan kasnya tidak nol, klasifikasi Operasi/Investasi/Pendanaan diambil
// dari account_type sisi LAWAN kas (non-kas) dalam jurnal yang sama:
//   REVENUE/EXPENSE -> Operasi, ASSET (non-kas, mis. beli aset tetap) -> Investasi,
//   LIABILITY/FUND_BALANCE -> Pendanaan.
// Efek-kas per baris non-kas dihitung sebagai (credit - debit) baris itu sendiri --
// bukan lewat normal_balance seperti Neraca/Aktivitas -- karena satu jurnal SELALU
// seimbang (total debit = total credit), jadi efek-kas baris non-kas otomatis sama
// dengan NEGASI dari (debit-credit) baris itu = (credit-debit), tanpa perlu tahu
// normal_balance akunnya sama sekali. Total efek-kas ini WAJIB sama dengan
// (Saldo Kas Akhir - Saldo Kas Awal) yang dihitung terpisah dari saldo akun Kas &
// Setara Kas -- kalau tidak sama, `balanced: false` (pola sama seperti badge "Jurnal
// Seimbang" di Dashboard Finance).
//
// Catatan (bukan fakta baku, perlu direview akuntan/bendahara Sinode kalau relevan):
// - Baris LIABILITY/FUND_BALANCE diklasifikasikan Pendanaan -- kemungkinan besar jarang
//   muncul di sistem ini karena persembahan terikat (mis. Pembangunan) sudah masuk
//   lewat akun Pendapatan, bukan langsung ke Saldo Dana.
// - Baris ASSET non-kas diklasifikasikan Investasi secara default. Ini cukup untuk
//   pembelian aset tetap (kasus utama saat ini), tapi kalau nanti ada modul piutang
//   usaha, piutang semestinya tetap Operasi -- belum relevan karena skema belum
//   punya piutang.
router.get('/cash-flow', async (req: AuthRequest, res: Response) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  const method = req.query.method === 'indirect' ? 'indirect' : 'direct';
  if (!from || !to) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Rentang tanggal (dari & sampai) wajib diisi' } });
    return;
  }
  try {
    const pool = getPool();

    // Saldo Kas & Setara Kas per tanggal cut-off -- pola identik dengan Neraca
    // (opening_balance akun + akumulasi mutasi jurnal sampai tanggal itu), tapi
    // dipersempit hanya ke akun yang terdaftar di cash_accounts/bank_accounts.
    const cashBalanceAsOf = async (asOfDate: string): Promise<number> => {
      const r = await pool.query(
        `WITH cash_gl AS (
           SELECT account_id FROM finance.cash_accounts WHERE organization_id = $1
           UNION
           SELECT account_id FROM finance.bank_accounts WHERE organization_id = $1
         )
         SELECT COALESCE(SUM(a.opening_balance), 0) AS opening,
                COALESCE(SUM(m.net), 0) AS movement
         FROM finance.accounts a
         JOIN cash_gl cg ON cg.account_id = a.id
         LEFT JOIN LATERAL (
           SELECT SUM(jl.debit - jl.credit) AS net
           FROM finance.journal_lines jl
           JOIN finance.journals j ON j.id = jl.journal_id
           WHERE jl.account_id = a.id AND j.organization_id = $1 AND j.journal_date <= $2
         ) m ON TRUE`,
        [FINANCE_ORG, asOfDate]
      );
      const row = r.rows[0] || { opening: 0, movement: 0 };
      return Number(row.opening) + Number(row.movement);
    };

    // Saldo akun BUKAN kas dengan account_type tertentu per tanggal cut-off -- dipakai
    // KHUSUS untuk penyesuaian metode TIDAK LANGSUNG di bawah (perubahan saldo Aset
    // non-kas & Kewajiban antara awal dan akhir periode). Query terpisah dari
    // cashBalanceAsOf (bukan digabung jadi satu fungsi generik) supaya SQL masing-masing
    // tetap sederhana dan gampang diverifikasi, alih-alih satu query dinamis yang rawan
    // salah rakit klausa WHERE/JOIN.
    const nonCashTypeBalanceAsOf = async (asOfDate: string, accountTypes: string[]): Promise<number> => {
      const r = await pool.query(
        `WITH cash_gl AS (
           SELECT account_id FROM finance.cash_accounts WHERE organization_id = $1
           UNION
           SELECT account_id FROM finance.bank_accounts WHERE organization_id = $1
         )
         SELECT COALESCE(SUM(a.opening_balance), 0) AS opening,
                COALESCE(SUM(m.net), 0) AS movement
         FROM finance.accounts a
         LEFT JOIN cash_gl cg ON cg.account_id = a.id
         LEFT JOIN LATERAL (
           SELECT SUM(jl.debit - jl.credit) AS net
           FROM finance.journal_lines jl
           JOIN finance.journals j ON j.id = jl.journal_id
           WHERE jl.account_id = a.id AND j.organization_id = $1 AND j.journal_date <= $2
         ) m ON TRUE
         WHERE cg.account_id IS NULL AND a.account_type = ANY($3::finance.account_type[])`,
        [FINANCE_ORG, asOfDate, accountTypes]
      );
      const row = r.rows[0] || { opening: 0, movement: 0 };
      return Number(row.opening) + Number(row.movement);
    };

    const dayBefore = new Date(from);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const beginningDate = dayBefore.toISOString().slice(0, 10);

    const [beginningCash, endingCash] = await Promise.all([
      cashBalanceAsOf(beginningDate),
      cashBalanceAsOf(to),
    ]);

    // Baris non-kas dari jurnal yang pergerakan kasnya TIDAK NOL dalam rentang tanggal.
    const result = await pool.query(
      `WITH cash_gl AS (
         SELECT account_id FROM finance.cash_accounts WHERE organization_id = $1
         UNION
         SELECT account_id FROM finance.bank_accounts WHERE organization_id = $1
       ),
       journal_cash_net AS (
         SELECT jl.journal_id, SUM(jl.debit - jl.credit) AS net_cash
         FROM finance.journal_lines jl
         JOIN finance.journals j ON j.id = jl.journal_id
         WHERE j.organization_id = $1 AND j.journal_date BETWEEN $2 AND $3
           AND jl.account_id IN (SELECT account_id FROM cash_gl)
         GROUP BY jl.journal_id
         HAVING SUM(jl.debit - jl.credit) <> 0
       )
       SELECT a.code, a.name, a.account_type, (jl.credit - jl.debit) AS cash_effect
       FROM finance.journal_lines jl
       JOIN finance.journals j ON j.id = jl.journal_id
       JOIN finance.accounts a ON a.id = jl.account_id
       JOIN journal_cash_net jcn ON jcn.journal_id = jl.journal_id
       WHERE j.organization_id = $1 AND j.journal_date BETWEEN $2 AND $3
         AND jl.account_id NOT IN (SELECT account_id FROM cash_gl)
       ORDER BY a.code ASC`,
      [FINANCE_ORG, from, to]
    );

    const classify = (accountType: string): 'operating' | 'investing' | 'financing' | null => {
      if (accountType === 'REVENUE' || accountType === 'EXPENSE') return 'operating';
      if (accountType === 'ASSET') return 'investing';
      if (accountType === 'LIABILITY' || accountType === 'FUND_BALANCE') return 'financing';
      return null;
    };

    const buckets: Record<'operating' | 'investing' | 'financing', Map<string, { code: string; name: string; amount: number }>> = {
      operating: new Map(), investing: new Map(), financing: new Map(),
    };
    for (const r of result.rows) {
      const bucket = classify(r.account_type);
      if (!bucket) continue; // account_type tak dikenal -- diabaikan alih-alih ditebak salah
      const key = r.code;
      const existing = buckets[bucket].get(key);
      const amount = Number(r.cash_effect);
      if (existing) existing.amount += amount;
      else buckets[bucket].set(key, { code: r.code, name: r.name, amount });
    }
    const toLines = (m: Map<string, { code: string; name: string; amount: number }>) =>
      Array.from(m.values()).filter(l => Math.abs(l.amount) > 0.005).sort((a, b) => a.code.localeCompare(b.code));

    // Investasi & Pendanaan dihitung SAMA di kedua metode (langsung/tidak langsung) --
    // bedanya cuma di cara MENYAJIKAN Operasi, bukan di angka Investasi/Pendanaan itu
    // sendiri (keduanya sudah murni "arus kas aktual" di kedua metode).
    const investingLines = toLines(buckets.investing);
    const financingLines = toLines(buckets.financing);
    const totalInvesting = investingLines.reduce((s, l) => s + l.amount, 0);
    const totalFinancing = financingLines.reduce((s, l) => s + l.amount, 0);

    let operatingLines: { code?: string; name: string; amount: number }[];
    let totalOperating: number;

    if (method === 'indirect') {
      // Metode TIDAK LANGSUNG: mulai dari Surplus/(Defisit) Bersih periode berjalan
      // (basis akrual -- SEMUA baris Pendapatan/Beban, bukan cuma yang jurnalnya
      // menyentuh kas), lalu disesuaikan dengan perubahan saldo Aset non-kas &
      // Kewajiban selama periode. Identitas akuntansi: hasil akhirnya WAJIB sama
      // dengan totalOperating metode langsung (dicek lewat `balanced` di bawah,
      // sama seperti Neraca/Dashboard) -- kalau sistem ini nanti punya modul
      // piutang/utang usaha sungguhan, uji ini yang akan menangkap kalau
      // penyesuaiannya belum benar.
      const netSurplusRes = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN a.account_type = 'REVENUE' THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
           COALESCE(SUM(CASE WHEN a.account_type = 'EXPENSE' THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense
         FROM finance.journal_lines jl
         JOIN finance.journals j ON j.id = jl.journal_id
         JOIN finance.accounts a ON a.id = jl.account_id
         WHERE j.organization_id = $1 AND j.journal_date BETWEEN $2 AND $3 AND a.account_type IN ('REVENUE','EXPENSE')`,
        [FINANCE_ORG, from, to]
      );
      const netSurplus = Number(netSurplusRes.rows[0].revenue) - Number(netSurplusRes.rows[0].expense);

      const [beginAsset, endAsset, beginLiab, endLiab] = await Promise.all([
        nonCashTypeBalanceAsOf(beginningDate, ['ASSET']),
        nonCashTypeBalanceAsOf(to, ['ASSET']),
        nonCashTypeBalanceAsOf(beginningDate, ['LIABILITY']),
        nonCashTypeBalanceAsOf(to, ['LIABILITY']),
      ]);
      const nonCashAssetChange = endAsset - beginAsset; // naik = kas "tertahan" di aset non-kas
      const liabilityChange = endLiab - beginLiab; // naik = sumber kas tambahan

      operatingLines = [
        { name: 'Surplus/(Defisit) Bersih periode berjalan', amount: netSurplus },
      ];
      if (Math.abs(nonCashAssetChange) > 0.005) {
        operatingLines.push({ name: 'Penyesuaian: (Kenaikan)/Penurunan Aset non-Kas', amount: -nonCashAssetChange });
      }
      if (Math.abs(liabilityChange) > 0.005) {
        operatingLines.push({ name: 'Penyesuaian: Kenaikan/(Penurunan) Kewajiban', amount: liabilityChange });
      }
      totalOperating = netSurplus - nonCashAssetChange + liabilityChange;
    } else {
      operatingLines = toLines(buckets.operating);
      totalOperating = operatingLines.reduce((s, l) => s + l.amount, 0);
    }

    const netChangeFromActivities = totalOperating + totalInvesting + totalFinancing;
    const netChangeFromBalances = endingCash - beginningCash;

    res.json({
      success: true,
      data: {
        from, to, method,
        operating: { lines: operatingLines, total: totalOperating },
        investing: { lines: investingLines, total: totalInvesting },
        financing: { lines: financingLines, total: totalFinancing },
        beginningCash, endingCash,
        netChange: netChangeFromActivities,
        balanced: Math.abs(netChangeFromActivities - netChangeFromBalances) < 0.01,
      },
    });
  } catch (err) {
    logger.error('GET reports/cash-flow', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menghitung Laporan Arus Kas' } });
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
