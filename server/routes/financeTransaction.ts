// ============================================================
// FINANCE ADD-ON MODULE — Fase 3: Transaksi & Voucher
// ============================================================
// Endpoint untuk mencatat transaksi kas/bank dengan voucher bernomor
// otomatis (format PREFIX/KODE_TAHUN_FISKAL/URUT, mis. BKM/2026-2027/0190).
// Lingkup Fase 3 berhenti di status SUBMITTED — alur Verifikasi/Persetujuan
// (VERIFIED/APPROVED) dan Posting ke General Ledger (POSTED) sengaja
// ditunda ke Fase 4 (Accounting Engine & Posting) dan Fase 5 (Verifikasi &
// Approval) sesuai roadmap yang sudah disetujui, supaya accounting engine
// (jurnal, saldo GL) dibangun sekali dengan matang, bukan dicicil.
// ============================================================

import { Router, Response } from 'express';
import { getPool } from '../lib/db.js';
import { requireRealDb, FINANCE_ORG } from '../lib/financeCrud.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireFinancePermission } from '../middleware/checkFinancePermission.js';
import { logger } from '../lib/logger.js';

const router = Router();
router.use(requireAuth, requireRealDb);

const TX_WITH_VOUCHER_SELECT = `
  SELECT t.*, v.voucher_number, v.voucher_date, v.voucher_type_id,
         vt.code AS voucher_type_code, vt.name AS voucher_type_name
  FROM finance.transactions t
  JOIN finance.vouchers v ON v.id = t.voucher_id
  JOIN finance.voucher_types vt ON vt.id = v.voucher_type_id
`;

async function getTransactionOr404(pool: ReturnType<typeof getPool>, id: string, res: Response): Promise<any | null> {
  const r = await pool.query(`${TX_WITH_VOUCHER_SELECT} WHERE t.id = $1 AND t.organization_id = $2`, [id, FINANCE_ORG]);
  if (r.rows.length === 0) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transaksi tidak ditemukan' } });
    return null;
  }
  return r.rows[0];
}

async function recomputeTotals(client: any, transactionId: string) {
  const sums = await client.query(
    `SELECT COALESCE(SUM(debit),0) AS total_debit, COALESCE(SUM(credit),0) AS total_credit
     FROM finance.transaction_lines WHERE transaction_id = $1`,
    [transactionId]
  );
  const { total_debit, total_credit } = sums.rows[0];
  await client.query(
    `UPDATE finance.transactions SET total_debit = $2, total_credit = $3, updated_at = NOW() WHERE id = $1`,
    [transactionId, total_debit, total_credit]
  );
  return { total_debit: Number(total_debit), total_credit: Number(total_credit) };
}

// ── List & detail ────────────────────────────────────────────────────────────
router.get('/', requireFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const conditions = ['t.organization_id = $1'];
    const params: any[] = [FINANCE_ORG];
    if (req.query.fiscalYearId) { params.push(req.query.fiscalYearId); conditions.push(`t.fiscal_year_id = $${params.length}`); }
    if (req.query.status) { params.push(req.query.status); conditions.push(`t.status = $${params.length}`); }
    const result = await pool.query(
      `${TX_WITH_VOUCHER_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY t.transaction_date DESC, t.created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('GET transactions', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil data transaksi' } });
  }
});

router.get('/:id', requireFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const tx = await getTransactionOr404(pool, req.params.id, res);
    if (!tx) return;
    res.json({ success: true, data: tx });
  } catch (err) {
    logger.error('GET transactions/:id', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil data transaksi' } });
  }
});

// ── Create (voucher + transaction sekaligus, satu transaksi DB) ───────────────
router.post('/', requireFinancePermission('create'), async (req: AuthRequest, res: Response) => {
  const body = req.body ?? {};
  const { voucher_type_id, fiscal_year_id, transaction_date, description } = body;
  if (!voucher_type_id || !fiscal_year_id || !transaction_date || !description) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Jenis Voucher, Tahun Fiskal, tanggal, dan keterangan wajib diisi' } });
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const vt = await client.query(
      'SELECT * FROM finance.voucher_types WHERE id = $1 AND organization_id = $2 AND is_active = TRUE',
      [voucher_type_id, FINANCE_ORG]
    );
    if (vt.rows.length === 0) throw Object.assign(new Error('Jenis Voucher tidak ditemukan'), { status: 400 });
    const voucherType = vt.rows[0];

    const fy = await client.query('SELECT * FROM finance.fiscal_years WHERE id = $1 AND organization_id = $2', [fiscal_year_id, FINANCE_ORG]);
    if (fy.rows.length === 0) throw Object.assign(new Error('Tahun Fiskal tidak ditemukan'), { status: 400 });
    const fiscalYear = fy.rows[0];

    const periodRes = await client.query(
      'SELECT id, status FROM finance.periods WHERE fiscal_year_id = $1 AND start_date <= $2 AND end_date >= $2',
      [fiscal_year_id, transaction_date]
    );
    if (periodRes.rows.length === 0) throw Object.assign(new Error('Tanggal transaksi di luar periode Tahun Fiskal yang dipilih'), { status: 400 });
    const period = periodRes.rows[0];
    if (period.status !== 'OPEN') throw Object.assign(new Error('Periode untuk tanggal ini sudah tidak Terbuka (Open)'), { status: 400 });

    const seqRes = await client.query(
      `INSERT INTO finance.voucher_sequences (organization_id, fiscal_year_id, voucher_type_id, current_number)
       VALUES ($1,$2,$3,1)
       ON CONFLICT (organization_id, fiscal_year_id, voucher_type_id)
       DO UPDATE SET current_number = finance.voucher_sequences.current_number + 1
       RETURNING current_number`,
      [FINANCE_ORG, fiscal_year_id, voucher_type_id]
    );
    const seqNumber = seqRes.rows[0].current_number;
    const voucherNumber = `${voucherType.prefix}/${fiscalYear.code}/${String(seqNumber).padStart(4, '0')}`;

    const voucherRes = await client.query(
      `INSERT INTO finance.vouchers
        (organization_id, fiscal_year_id, period_id, voucher_type_id, voucher_number, voucher_date, reference_number, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [FINANCE_ORG, fiscal_year_id, period.id, voucher_type_id, voucherNumber, transaction_date, body.reference_number || null, description, req.user!.userId]
    );
    const voucher = voucherRes.rows[0];

    const txRes = await client.query(
      `INSERT INTO finance.transactions
        (organization_id, voucher_id, fiscal_year_id, period_id, transaction_type, transaction_date, payer_name, payee_name, description, reference_number, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        FINANCE_ORG, voucher.id, fiscal_year_id, period.id, voucherType.transaction_type, transaction_date,
        body.payer_name || null, body.payee_name || null, description, body.reference_number || null, req.user!.userId,
      ]
    );

    await client.query('COMMIT');
    logger.info('Transaction created', { user: req.user?.username, transactionId: txRes.rows[0].id, voucherNumber });
    res.status(201).json({ success: true, data: { ...txRes.rows[0], voucher_number: voucherNumber, voucher_date: voucher.voucher_date, voucher_type_code: voucherType.code, voucher_type_name: voucherType.name } });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('POST transactions', { message: String(err) });
    res.status(err.status ?? 500).json({ success: false, error: { code: 'VALIDATION_ERROR', message: err.status ? err.message : 'Gagal membuat transaksi' } });
  } finally {
    client.release();
  }
});

// ── Edit header (hanya saat Draft) ─────────────────────────────────────────────
router.put('/:id', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const tx = await getTransactionOr404(pool, req.params.id, res);
    if (!tx) return;
    if (tx.status !== 'DRAFT') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya transaksi berstatus Draft yang bisa diedit' } });
      return;
    }
    const body = req.body ?? {};
    const result = await pool.query(
      `UPDATE finance.transactions SET
         payer_name = COALESCE($3, payer_name),
         payee_name = COALESCE($4, payee_name),
         description = COALESCE($5, description),
         reference_number = COALESCE($6, reference_number),
         updated_at = NOW(), updated_by = $7
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, body.payer_name ?? null, body.payee_name ?? null, body.description ?? null, body.reference_number ?? null, req.user!.userId]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('PUT transactions/:id', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal memperbarui transaksi' } });
  }
});

// ── Batalkan (hanya saat Draft) ─────────────────────────────────────────────────
router.delete('/:id', requireFinancePermission('delete'), async (req: AuthRequest, res: Response) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT * FROM finance.transactions WHERE id = $1 AND organization_id = $2', [req.params.id, FINANCE_ORG]);
    const tx = r.rows[0];
    if (!tx) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transaksi tidak ditemukan' } });
      return;
    }
    if (tx.status !== 'DRAFT') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya transaksi berstatus Draft yang bisa dibatalkan' } });
      return;
    }
    await client.query(
      `UPDATE finance.transactions SET status = 'CANCELLED', updated_at = NOW(), updated_by = $2 WHERE id = $1`,
      [req.params.id, req.user!.userId]
    );
    await client.query(
      `UPDATE finance.vouchers SET status = 'CANCELLED', updated_at = NOW(), updated_by = $2 WHERE id = $1`,
      [tx.voucher_id, req.user!.userId]
    );
    await client.query('COMMIT');
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('DELETE transactions/:id', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal membatalkan transaksi' } });
  } finally {
    client.release();
  }
});

// ── Ajukan (Draft → Submitted) ─────────────────────────────────────────────────
router.put('/:id/submit', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const tx = await getTransactionOr404(pool, req.params.id, res);
    if (!tx) return;
    if (tx.status !== 'DRAFT') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya transaksi berstatus Draft yang bisa diajukan' } });
      return;
    }
    const lineCount = await pool.query('SELECT COUNT(*)::int AS n FROM finance.transaction_lines WHERE transaction_id = $1', [req.params.id]);
    if ((lineCount.rows[0]?.n ?? 0) === 0) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Transaksi belum punya baris jurnal — tambahkan minimal 2 baris (debit & kredit)' } });
      return;
    }
    if (Number(tx.total_debit) !== Number(tx.total_credit) || Number(tx.total_debit) === 0) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Transaksi belum seimbang — total debit ${tx.total_debit} ≠ total kredit ${tx.total_credit}` } });
      return;
    }
    const result = await pool.query(
      `UPDATE finance.transactions SET status = 'SUBMITTED', submitted_at = NOW(), submitted_by = $3, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, req.user!.userId]
    );
    await pool.query(
      `UPDATE finance.vouchers SET status = 'SUBMITTED', updated_at = NOW(), updated_by = $2 WHERE id = $1`,
      [tx.voucher_id, req.user!.userId]
    );
    logger.info('Transaction submitted', { user: req.user?.username, transactionId: req.params.id });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('PUT transactions/:id/submit', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengajukan transaksi' } });
  }
});

// ── Baris jurnal transaksi ──────────────────────────────────────────────────────
router.get('/:id/lines', requireFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const tx = await getTransactionOr404(pool, req.params.id, res);
    if (!tx) return;
    const result = await pool.query('SELECT * FROM finance.transaction_lines WHERE transaction_id = $1 ORDER BY line_number ASC', [req.params.id]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('GET transactions/:id/lines', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil baris transaksi' } });
  }
});

router.post('/:id/lines', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txRes = await client.query('SELECT * FROM finance.transactions WHERE id = $1 AND organization_id = $2', [req.params.id, FINANCE_ORG]);
    const tx = txRes.rows[0];
    if (!tx) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transaksi tidak ditemukan' } });
      return;
    }
    if (tx.status !== 'DRAFT') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Baris hanya bisa ditambah saat transaksi berstatus Draft' } });
      return;
    }
    const body = req.body ?? {};
    const { account_id, side } = body;
    const amount = Number(body.amount);
    if (!account_id || (side !== 'debit' && side !== 'credit')) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Akun dan sisi (debit/kredit) wajib diisi' } });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Jumlah harus lebih besar dari 0' } });
      return;
    }
    if (body.cash_account_id && body.bank_account_id) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Pilih Kas atau Bank, tidak keduanya' } });
      return;
    }
    const nullable = (v: any) => (v === '' || v === undefined ? null : v);
    const lineNumRes = await client.query('SELECT COALESCE(MAX(line_number),0) + 1 AS next FROM finance.transaction_lines WHERE transaction_id = $1', [req.params.id]);
    const lineNumber = lineNumRes.rows[0].next;
    const result = await client.query(
      `INSERT INTO finance.transaction_lines
        (transaction_id, line_number, account_id, field_id, program_id, activity_id, fund_id, cash_account_id, bank_account_id, description, debit, credit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        req.params.id, lineNumber, account_id, nullable(body.field_id), nullable(body.program_id), nullable(body.activity_id),
        nullable(body.fund_id), nullable(body.cash_account_id), nullable(body.bank_account_id), nullable(body.description),
        side === 'debit' ? amount : 0, side === 'credit' ? amount : 0,
      ]
    );
    const totals = await recomputeTotals(client, req.params.id);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { ...result.rows[0], _totals: totals } });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('POST transactions/:id/lines', { message: String(err) });
    const message = /foreign key/i.test(String(err?.message ?? '')) ? 'Referensi yang dipilih tidak valid' : 'Gagal menambah baris';
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
  } finally {
    client.release();
  }
});

router.delete('/:id/lines/:lineId', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txRes = await client.query('SELECT * FROM finance.transactions WHERE id = $1 AND organization_id = $2', [req.params.id, FINANCE_ORG]);
    const tx = txRes.rows[0];
    if (!tx) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transaksi tidak ditemukan' } });
      return;
    }
    if (tx.status !== 'DRAFT') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Baris hanya bisa dihapus saat transaksi berstatus Draft' } });
      return;
    }
    const del = await client.query('DELETE FROM finance.transaction_lines WHERE id = $1 AND transaction_id = $2 RETURNING id', [req.params.lineId, req.params.id]);
    if (del.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Baris tidak ditemukan' } });
      return;
    }
    const totals = await recomputeTotals(client, req.params.id);
    await client.query('COMMIT');
    res.json({ success: true, data: { id: req.params.lineId, _totals: totals } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('DELETE transactions/:id/lines/:lineId', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menghapus baris' } });
  } finally {
    client.release();
  }
});

export default router;
