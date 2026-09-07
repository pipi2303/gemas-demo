// ============================================================
// FINANCE ADD-ON MODULE — Fase 6: Rekonsiliasi Bank
// ============================================================
// Alur: (1) input Rekening Koran (bank statement) — header + baris mutasi,
// manual entry karena belum ada integrasi API bank; (2) buka Sesi
// Rekonsiliasi untuk satu Rekening Bank + Periode + Rekening Koran, sistem
// menghitung saldo buku (system_balance, dari finance.journal_lines yang
// sudah diposting) dan saldo bank (bank_balance, dari closing_balance
// rekening koran); (3) cocokkan baris rekening koran dengan transaksi yang
// sudah diposting — otomatis (jumlah + arah + tanggal berdekatan, hanya
// dieksekusi kalau kandidatnya tunggal/tidak ambigu) atau manual;
// (4) selesaikan sesi setelah "selisih setelah penyesuaian" = 0, lalu
// disetujui oleh orang LAIN (segregation of duties, konsisten dengan aturan
// verify/approve/post di financeTransaction.ts).
//
// Rumus selisih setelah penyesuaian (standard bank reconciliation):
//   selisih_awal = bank_balance - system_balance
//   net_buku_belum_cocok    = SUM(debit) - SUM(credit) transaksi sistem yang
//                              belum ada padanannya di rekening koran (mis.
//                              cek keluar yang belum cair / setoran dalam
//                              perjalanan)
//   net_bank_belum_cocok    = SUM(credit) - SUM(debit) baris rekening koran
//                              yang belum ada padanannya di sistem (mis.
//                              biaya admin/bunga bank yang belum dijurnal)
//   selisih_penyesuaian = selisih_awal + net_buku_belum_cocok - net_bank_belum_cocok
// Sesi hanya boleh diselesaikan (complete) kalau |selisih_penyesuaian| ~ 0.
//
// Cakupan yang SENGAJA belum dikerjakan di Fase 6 ini (didokumentasikan,
// bukan lupa): pencocokan sebagian/split (satu baris rekening koran ke
// beberapa transaksi, atau sebaliknya) — v1 hanya mendukung pencocokan 1:1
// penuh; entri penyesuaian otomatis (mis. auto-generate jurnal biaya admin
// bank dari baris yang tidak cocok) — untuk sekarang itu dikerjakan manual
// lewat menu Transaksi & Voucher seperti biasa, lalu dicocokkan di sini.
// ============================================================

import { Router, Response } from 'express';
import { getPool } from '../lib/db.js';
import { requireRealDb, FINANCE_ORG } from '../lib/financeCrud.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireFinancePermission } from '../middleware/checkFinancePermission.js';
import { logger } from '../lib/logger.js';

const router = Router();
router.use(requireAuth, requireRealDb);

const EPS = 0.01; // toleransi pembulatan rupiah (NUMERIC(20,2))

// ── Rekening Koran (Bank Statements) ────────────────────────────────────────────

router.get('/bank-statements', requireFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const conditions = ['bs.organization_id = $1'];
    const params: any[] = [FINANCE_ORG];
    if (req.query.bankAccountId) { params.push(req.query.bankAccountId); conditions.push(`bs.bank_account_id = $${params.length}`); }
    const result = await pool.query(
      `SELECT bs.*,
         (SELECT COUNT(*) FROM finance.bank_statement_lines bsl WHERE bsl.statement_id = bs.id) AS line_count,
         (SELECT COUNT(*) FROM finance.bank_statement_lines bsl WHERE bsl.statement_id = bs.id AND bsl.matching_status = 'MATCHED') AS matched_count,
         (SELECT r.id FROM finance.reconciliations r WHERE r.statement_id = bs.id AND r.status <> 'CANCELLED' LIMIT 1) AS reconciliation_id,
         (SELECT r.status FROM finance.reconciliations r WHERE r.statement_id = bs.id AND r.status <> 'CANCELLED' LIMIT 1) AS reconciliation_status
       FROM finance.bank_statements bs
       WHERE ${conditions.join(' AND ')}
       ORDER BY bs.statement_date DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('GET reconciliation/bank-statements', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil daftar rekening koran' } });
  }
});

router.post('/bank-statements', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  const { bank_account_id, statement_number, statement_date, opening_balance, closing_balance, lines } = req.body || {};
  if (!bank_account_id || !statement_date || opening_balance === undefined || closing_balance === undefined) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Rekening bank, tanggal, saldo awal, dan saldo akhir wajib diisi' } });
    return;
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Minimal satu baris mutasi rekening koran wajib diisi' } });
    return;
  }
  for (const [i, l] of lines.entries()) {
    const debit = Number(l.debit || 0), credit = Number(l.credit || 0);
    if (!l.transaction_date) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Baris ${i + 1}: tanggal wajib diisi` } }); return; }
    if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Baris ${i + 1}: isi salah satu dari Debit atau Kredit, tidak boleh keduanya` } });
      return;
    }
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stRes = await client.query(
      `INSERT INTO finance.bank_statements
        (organization_id, bank_account_id, statement_number, statement_date, opening_balance, closing_balance, source_type, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'MANUAL',$7) RETURNING *`,
      [FINANCE_ORG, bank_account_id, statement_number || null, statement_date, opening_balance, closing_balance, req.user!.userId]
    );
    const statement = stRes.rows[0];
    let lineNumber = 0;
    for (const l of lines) {
      lineNumber += 1;
      await client.query(
        `INSERT INTO finance.bank_statement_lines
          (statement_id, line_number, transaction_date, value_date, reference_number, description, debit, credit, balance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [statement.id, lineNumber, l.transaction_date, l.value_date || null, l.reference_number || null, l.description || null,
         Number(l.debit || 0), Number(l.credit || 0), l.balance !== undefined && l.balance !== null && l.balance !== '' ? Number(l.balance) : null]
      );
    }
    await client.query('COMMIT');
    logger.info('Bank statement created', { user: req.user?.username, statementId: statement.id, lines: lineNumber });
    res.status(201).json({ success: true, data: statement });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('POST reconciliation/bank-statements', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menyimpan rekening koran' } });
  } finally {
    client.release();
  }
});

router.get('/bank-statements/:id', requireFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const stRes = await pool.query('SELECT * FROM finance.bank_statements WHERE id = $1 AND organization_id = $2', [req.params.id, FINANCE_ORG]);
    if (stRes.rows.length === 0) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rekening koran tidak ditemukan' } }); return; }
    const linesRes = await pool.query('SELECT * FROM finance.bank_statement_lines WHERE statement_id = $1 ORDER BY line_number ASC', [req.params.id]);
    res.json({ success: true, data: { ...stRes.rows[0], lines: linesRes.rows } });
  } catch (err) {
    logger.error('GET reconciliation/bank-statements/:id', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil detail rekening koran' } });
  }
});

router.delete('/bank-statements/:id', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const used = await pool.query(`SELECT id FROM finance.reconciliations WHERE statement_id = $1 AND status <> 'CANCELLED'`, [req.params.id]);
    if (used.rows.length > 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Rekening koran ini sudah dipakai di sesi rekonsiliasi — batalkan sesinya dulu' } });
      return;
    }
    await pool.query('DELETE FROM finance.bank_statements WHERE id = $1 AND organization_id = $2', [req.params.id, FINANCE_ORG]);
    res.json({ success: true, data: null });
  } catch (err) {
    logger.error('DELETE reconciliation/bank-statements/:id', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menghapus rekening koran' } });
  }
});

// ── Sesi Rekonsiliasi ────────────────────────────────────────────────────────────

router.get('/', requireFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const conditions = ['r.organization_id = $1'];
    const params: any[] = [FINANCE_ORG];
    if (req.query.bankAccountId) { params.push(req.query.bankAccountId); conditions.push(`r.bank_account_id = $${params.length}`); }
    if (req.query.periodId) { params.push(req.query.periodId); conditions.push(`r.period_id = $${params.length}`); }
    const result = await pool.query(
      `SELECT r.*, ba.bank_name, ba.account_name, ba.account_number,
         p.code AS period_code, p.name AS period_name,
         bs.statement_number, bs.statement_date
       FROM finance.reconciliations r
       JOIN finance.bank_accounts ba ON ba.id = r.bank_account_id
       JOIN finance.periods p ON p.id = r.period_id
       LEFT JOIN finance.bank_statements bs ON bs.id = r.statement_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY bs.statement_date DESC NULLS LAST, r.created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('GET reconciliation/', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil daftar sesi rekonsiliasi' } });
  }
});

async function computeSystemBalance(pool: ReturnType<typeof getPool>, accountId: string, asOfDate: string) {
  const acctRes = await pool.query('SELECT opening_balance, normal_balance FROM finance.accounts WHERE id = $1', [accountId]);
  const acct = acctRes.rows[0];
  if (!acct) throw new Error('Akun GL untuk rekening bank ini tidak ditemukan');
  const sumRes = await pool.query(
    `SELECT COALESCE(SUM(jl.debit),0) AS total_debit, COALESCE(SUM(jl.credit),0) AS total_credit
     FROM finance.journal_lines jl JOIN finance.journals j ON j.id = jl.journal_id
     WHERE jl.account_id = $1 AND j.organization_id = $2 AND j.journal_date <= $3`,
    [accountId, FINANCE_ORG, asOfDate]
  );
  const { total_debit, total_credit } = sumRes.rows[0];
  const opening = Number(acct.opening_balance);
  const debitMinusCredit = Number(total_debit) - Number(total_credit);
  return acct.normal_balance === 'DEBIT' ? opening + debitMinusCredit : opening - debitMinusCredit;
}

router.post('/', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  const { bank_account_id, period_id, statement_id } = req.body || {};
  if (!bank_account_id || !period_id || !statement_id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Rekening bank, periode, dan rekening koran wajib dipilih' } });
    return;
  }
  try {
    const pool = getPool();
    const existing = await pool.query(
      `SELECT id FROM finance.reconciliations WHERE bank_account_id = $1 AND period_id = $2 AND status <> 'CANCELLED'`,
      [bank_account_id, period_id]
    );
    if (existing.rows.length > 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Sudah ada sesi rekonsiliasi aktif untuk rekening dan periode ini' } });
      return;
    }
    const baRes = await pool.query('SELECT * FROM finance.bank_accounts WHERE id = $1 AND organization_id = $2', [bank_account_id, FINANCE_ORG]);
    const bankAccount = baRes.rows[0];
    if (!bankAccount) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rekening bank tidak ditemukan' } }); return; }
    const periodRes = await pool.query('SELECT * FROM finance.periods WHERE id = $1', [period_id]);
    const period = periodRes.rows[0];
    if (!period) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Periode tidak ditemukan' } }); return; }
    const stRes = await pool.query('SELECT * FROM finance.bank_statements WHERE id = $1 AND organization_id = $2', [statement_id, FINANCE_ORG]);
    const statement = stRes.rows[0];
    if (!statement) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rekening koran tidak ditemukan' } }); return; }

    const systemBalance = await computeSystemBalance(pool, bankAccount.account_id, period.end_date);
    const bankBalance = Number(statement.closing_balance);
    const difference = bankBalance - systemBalance;

    const result = await pool.query(
      `INSERT INTO finance.reconciliations
        (organization_id, bank_account_id, period_id, statement_id, system_balance, bank_balance, difference, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8) RETURNING *`,
      [FINANCE_ORG, bank_account_id, period_id, statement_id, systemBalance, bankBalance, difference, req.user!.userId]
    );
    logger.info('Reconciliation session created', { user: req.user?.username, reconciliationId: result.rows[0].id });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    logger.error('POST reconciliation/', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err?.message || 'Gagal membuat sesi rekonsiliasi' } });
  }
});

async function loadSessionDetail(pool: ReturnType<typeof getPool>, id: string) {
  const rRes = await pool.query(
    `SELECT r.*, ba.bank_name, ba.account_name, ba.account_number, ba.account_id,
       p.code AS period_code, p.name AS period_name, p.end_date AS period_end_date
     FROM finance.reconciliations r
     JOIN finance.bank_accounts ba ON ba.id = r.bank_account_id
     JOIN finance.periods p ON p.id = r.period_id
     WHERE r.id = $1 AND r.organization_id = $2`,
    [id, FINANCE_ORG]
  );
  const session = rRes.rows[0];
  if (!session) return null;

  const statementRes = await pool.query('SELECT * FROM finance.bank_statements WHERE id = $1', [session.statement_id]);
  const statement = statementRes.rows[0];

  const lineRes = await pool.query(
    `SELECT bsl.*, rm.id AS match_id, rm.transaction_id, rm.match_type, rm.matched_amount,
       v.voucher_number, t.description AS transaction_description
     FROM finance.bank_statement_lines bsl
     LEFT JOIN finance.reconciliation_matches rm ON rm.statement_line_id = bsl.id AND rm.reconciliation_id = $2
     LEFT JOIN finance.transactions t ON t.id = rm.transaction_id
     LEFT JOIN finance.vouchers v ON v.id = t.voucher_id
     WHERE bsl.statement_id = $1
     ORDER BY bsl.line_number ASC`,
    [session.statement_id, id]
  );

  const bookRes = await pool.query(
    `SELECT t.id AS transaction_id, t.transaction_date, t.description, v.voucher_number, tl.debit, tl.credit
     FROM finance.transactions t
     JOIN finance.transaction_lines tl ON tl.transaction_id = t.id
     JOIN finance.vouchers v ON v.id = t.voucher_id
     WHERE t.organization_id = $1 AND t.status = 'POSTED' AND tl.bank_account_id = $2
       AND t.transaction_date <= $3
       AND NOT EXISTS (SELECT 1 FROM finance.reconciliation_matches rm WHERE rm.transaction_id = t.id)
     ORDER BY t.transaction_date ASC`,
    [FINANCE_ORG, session.bank_account_id, statement?.statement_date || session.period_end_date]
  );

  const unmatchedStmtLines = lineRes.rows.filter((l: any) => !l.match_id);
  const netBankBelumCocok = unmatchedStmtLines.reduce((s: number, l: any) => s + Number(l.credit) - Number(l.debit), 0);
  const netBukuBelumCocok = bookRes.rows.reduce((s: number, t: any) => s + Number(t.debit) - Number(t.credit), 0);
  const adjustedDifference = Number(session.difference) + netBukuBelumCocok - netBankBelumCocok;

  return {
    session,
    statement,
    statementLines: lineRes.rows,
    unmatchedBookTransactions: bookRes.rows,
    netBankBelumCocok,
    netBukuBelumCocok,
    adjustedDifference,
    balanced: Math.abs(adjustedDifference) < EPS,
  };
}

router.get('/:id', requireFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const detail = await loadSessionDetail(pool, req.params.id);
    if (!detail) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesi rekonsiliasi tidak ditemukan' } }); return; }
    res.json({ success: true, data: detail });
  } catch (err) {
    logger.error('GET reconciliation/:id', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil detail sesi rekonsiliasi' } });
  }
});

// ── Pencocokan Otomatis ──────────────────────────────────────────────────────────
// Hanya mencocokkan kalau kandidatnya TUNGGAL (jumlah + arah sama, tanggal
// dalam rentang ±5 hari) — kalau ambigu (lebih dari satu kandidat), baris
// dibiarkan UNMATCHED supaya dicocokkan manual, demi menghindari salah pasang.
router.post('/:id/auto-match', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rRes = await client.query('SELECT * FROM finance.reconciliations WHERE id = $1 AND organization_id = $2 FOR UPDATE', [req.params.id, FINANCE_ORG]);
    const session = rRes.rows[0];
    if (!session) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesi rekonsiliasi tidak ditemukan' } }); return; }
    if (session.status === 'APPROVED' || session.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Sesi ini sudah final — tidak bisa dicocokkan lagi' } });
      return;
    }
    const statementRes = await client.query('SELECT * FROM finance.bank_statements WHERE id = $1', [session.statement_id]);
    const statement = statementRes.rows[0];

    const unmatchedLines = await client.query(
      `SELECT * FROM finance.bank_statement_lines
       WHERE statement_id = $1 AND matching_status = 'UNMATCHED'
       ORDER BY line_number ASC`,
      [session.statement_id]
    );
    const candidates = await client.query(
      `SELECT t.id AS transaction_id, t.transaction_date, tl.debit, tl.credit
       FROM finance.transactions t
       JOIN finance.transaction_lines tl ON tl.transaction_id = t.id
       WHERE t.organization_id = $1 AND t.status = 'POSTED' AND tl.bank_account_id = $2
         AND NOT EXISTS (SELECT 1 FROM finance.reconciliation_matches rm WHERE rm.transaction_id = t.id)`,
      [FINANCE_ORG, session.bank_account_id]
    );
    const used = new Set<string>();
    let matchedCount = 0;
    for (const line of unmatchedLines.rows) {
      const lineAmount = Number(line.credit) > 0 ? Number(line.credit) : Number(line.debit);
      const lineIsCredit = Number(line.credit) > 0; // deposit ke bank = debit di GL akun bank
      const lineDate = new Date(line.transaction_date).getTime();
      const matches = candidates.rows.filter((c: any) => {
        if (used.has(c.transaction_id)) return false;
        const cAmount = lineIsCredit ? Number(c.debit) : Number(c.credit);
        const cOtherSide = lineIsCredit ? Number(c.credit) : Number(c.debit);
        if (cOtherSide > 0) return false; // arah GL harus berlawanan dari sisi yang dicari
        if (Math.abs(cAmount - lineAmount) > EPS) return false;
        const cDate = new Date(c.transaction_date).getTime();
        const diffDays = Math.abs(cDate - lineDate) / 86400000;
        return diffDays <= 5;
      });
      if (matches.length !== 1) continue; // ambigu atau tidak ada kandidat — lewati
      const match = matches[0];
      used.add(match.transaction_id);
      await client.query(
        `INSERT INTO finance.reconciliation_matches
          (reconciliation_id, statement_line_id, transaction_id, matched_amount, match_type, created_by)
         VALUES ($1,$2,$3,$4,'AUTO',$5)`,
        [session.id, line.id, match.transaction_id, lineAmount, req.user!.userId]
      );
      await client.query(`UPDATE finance.bank_statement_lines SET matching_status = 'MATCHED' WHERE id = $1`, [line.id]);
      matchedCount += 1;
    }
    if (matchedCount > 0 && session.status === 'DRAFT') {
      await client.query(`UPDATE finance.reconciliations SET status = 'IN_PROGRESS' WHERE id = $1`, [session.id]);
    }
    await client.query('COMMIT');
    logger.info('Reconciliation auto-match run', { user: req.user?.username, reconciliationId: session.id, matchedCount });
    res.json({ success: true, data: { matchedCount, totalUnmatchedBefore: unmatchedLines.rows.length } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('POST reconciliation/:id/auto-match', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menjalankan pencocokan otomatis' } });
  } finally {
    client.release();
  }
});

// ── Pencocokan Manual ────────────────────────────────────────────────────────────
router.post('/:id/matches', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  const { statement_line_id, transaction_id } = req.body || {};
  if (!statement_line_id || !transaction_id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Baris rekening koran dan transaksi wajib dipilih' } });
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rRes = await client.query('SELECT * FROM finance.reconciliations WHERE id = $1 AND organization_id = $2 FOR UPDATE', [req.params.id, FINANCE_ORG]);
    const session = rRes.rows[0];
    if (!session) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesi rekonsiliasi tidak ditemukan' } }); return; }
    if (session.status === 'APPROVED' || session.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Sesi ini sudah final — tidak bisa dicocokkan lagi' } });
      return;
    }
    const lineRes = await client.query('SELECT * FROM finance.bank_statement_lines WHERE id = $1 AND statement_id = $2', [statement_line_id, session.statement_id]);
    const line = lineRes.rows[0];
    if (!line) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Baris rekening koran tidak ditemukan' } }); return; }
    if (line.matching_status === 'MATCHED') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Baris ini sudah cocok — lepas dulu pencocokan sebelumnya' } });
      return;
    }
    const dup = await client.query(`SELECT 1 FROM finance.reconciliation_matches WHERE transaction_id = $1`, [transaction_id]);
    if (dup.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Transaksi ini sudah dicocokkan ke baris lain' } });
      return;
    }
    const lineAmount = Number(line.credit) > 0 ? Number(line.credit) : Number(line.debit);
    await client.query(
      `INSERT INTO finance.reconciliation_matches
        (reconciliation_id, statement_line_id, transaction_id, matched_amount, match_type, created_by)
       VALUES ($1,$2,$3,$4,'MANUAL',$5)`,
      [session.id, line.id, transaction_id, lineAmount, req.user!.userId]
    );
    await client.query(`UPDATE finance.bank_statement_lines SET matching_status = 'MATCHED' WHERE id = $1`, [line.id]);
    if (session.status === 'DRAFT') {
      await client.query(`UPDATE finance.reconciliations SET status = 'IN_PROGRESS' WHERE id = $1`, [session.id]);
    }
    await client.query('COMMIT');
    logger.info('Reconciliation manual match', { user: req.user?.username, reconciliationId: session.id, statementLineId: statement_line_id, transactionId: transaction_id });
    res.status(201).json({ success: true, data: null });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('POST reconciliation/:id/matches', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mencocokkan baris' } });
  } finally {
    client.release();
  }
});

router.delete('/:id/matches/:matchId', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const rRes = await client.query('SELECT * FROM finance.reconciliations WHERE id = $1 AND organization_id = $2 FOR UPDATE', [req.params.id, FINANCE_ORG]);
    const session = rRes.rows[0];
    if (!session) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesi rekonsiliasi tidak ditemukan' } }); return; }
    if (session.status === 'APPROVED' || session.status === 'CANCELLED') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Sesi ini sudah final — tidak bisa diubah lagi' } });
      return;
    }
    const matchRes = await client.query('SELECT * FROM finance.reconciliation_matches WHERE id = $1 AND reconciliation_id = $2', [req.params.matchId, req.params.id]);
    const match = matchRes.rows[0];
    if (!match) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pencocokan tidak ditemukan' } }); return; }
    await client.query('DELETE FROM finance.reconciliation_matches WHERE id = $1', [match.id]);
    await client.query(`UPDATE finance.bank_statement_lines SET matching_status = 'UNMATCHED' WHERE id = $1`, [match.statement_line_id]);
    await client.query('COMMIT');
    logger.info('Reconciliation match removed', { user: req.user?.username, reconciliationId: req.params.id, matchId: req.params.matchId });
    res.json({ success: true, data: null });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('DELETE reconciliation/:id/matches/:matchId', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal melepas pencocokan' } });
  } finally {
    client.release();
  }
});

// ── Selesaikan & Setujui Sesi (segregation of duties: penyetuju harus beda orang) ─
router.put('/:id/complete', requireFinancePermission('approve'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const rRes = await pool.query('SELECT * FROM finance.reconciliations WHERE id = $1 AND organization_id = $2', [req.params.id, FINANCE_ORG]);
    const session = rRes.rows[0];
    if (!session) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesi rekonsiliasi tidak ditemukan' } }); return; }
    if (session.status !== 'DRAFT' && session.status !== 'IN_PROGRESS') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Sesi ini tidak dalam status yang bisa diselesaikan' } });
      return;
    }
    const detail = await loadSessionDetail(pool, session.id);
    if (!detail!.balanced) {
      res.status(400).json({
        success: false,
        error: { code: 'NOT_BALANCED', message: `Selisih setelah penyesuaian belum nol (Rp ${detail!.adjustedDifference.toLocaleString('id-ID')}) — cocokkan semua baris dulu sebelum menyelesaikan sesi` },
      });
      return;
    }
    const result = await pool.query(
      `UPDATE finance.reconciliations SET status = 'COMPLETED', completed_at = NOW(), completed_by = $2
       WHERE id = $1 RETURNING *`,
      [session.id, req.user!.userId]
    );
    logger.info('Reconciliation completed', { user: req.user?.username, reconciliationId: session.id });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('PUT reconciliation/:id/complete', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menyelesaikan sesi rekonsiliasi' } });
  }
});

router.put('/:id/approve', requireFinancePermission('approve'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const rRes = await pool.query('SELECT * FROM finance.reconciliations WHERE id = $1 AND organization_id = $2', [req.params.id, FINANCE_ORG]);
    const session = rRes.rows[0];
    if (!session) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesi rekonsiliasi tidak ditemukan' } }); return; }
    if (session.status !== 'COMPLETED') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya sesi berstatus Selesai yang bisa disetujui' } });
      return;
    }
    if (session.completed_by === req.user!.userId) {
      res.status(403).json({ success: false, error: { code: 'SEGREGATION_OF_DUTIES', message: 'Orang yang menyelesaikan sesi tidak bisa menyetujui sesinya sendiri — perlu orang lain (segregation of duties)' } });
      return;
    }
    const result = await pool.query(
      `UPDATE finance.reconciliations SET status = 'APPROVED', approved_at = NOW(), approved_by = $2
       WHERE id = $1 RETURNING *`,
      [session.id, req.user!.userId]
    );
    logger.info('Reconciliation approved', { user: req.user?.username, reconciliationId: session.id });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('PUT reconciliation/:id/approve', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menyetujui sesi rekonsiliasi' } });
  }
});

router.put('/:id/cancel', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const rRes = await pool.query('SELECT * FROM finance.reconciliations WHERE id = $1 AND organization_id = $2', [req.params.id, FINANCE_ORG]);
    const session = rRes.rows[0];
    if (!session) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesi rekonsiliasi tidak ditemukan' } }); return; }
    if (session.status === 'APPROVED') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Sesi yang sudah disetujui tidak bisa dibatalkan' } });
      return;
    }
    const result = await pool.query(
      `UPDATE finance.reconciliations SET status = 'CANCELLED', notes = COALESCE($2, notes) WHERE id = $1 RETURNING *`,
      [session.id, req.body?.reason || null]
    );
    logger.info('Reconciliation cancelled', { user: req.user?.username, reconciliationId: session.id });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('PUT reconciliation/:id/cancel', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal membatalkan sesi rekonsiliasi' } });
  }
});

export default router;
