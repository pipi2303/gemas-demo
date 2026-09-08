// ============================================================
// FINANCE ADD-ON MODULE — Fase 3 + Fase 4: Transaksi, Voucher & Posting
// ============================================================
// Fase 3: mencatat transaksi kas/bank dengan voucher bernomor otomatis
// (format PREFIX/KODE_TAHUN_FISKAL/URUT, mis. BKM/2026-2027/0190).
// Fase 4 (Accounting Engine & Posting) menambahkan mesin alur kerja penuh:
//   DRAFT -> SUBMITTED -> VERIFIED -> APPROVED -> POSTED
//                      \-> REJECTED -> (revisi) -> DRAFT
//   POSTED -> REVERSED (jurnal pembalik, tidak menghapus jurnal asli)
// Posting menghasilkan finance.journals + finance.journal_lines (nomor urut
// atomik JV/KODE_TAHUN_FISKAL/URUT) sebagai sumber General Ledger — lihat
// server/routes/financeLedger.ts. Segregation of duties: pembuat transaksi
// (created_by) TIDAK BOLEH memverifikasi/menyetujui/memposting transaksinya
// sendiri, dan verifikator TIDAK BOLEH merangkap sebagai penyetuju — dicek
// per-aksi via perbandingan user id, berlaku untuk semua role TERMASUK
// Admin (aturan kontrol keuangan ini sengaja tidak mengikuti bypass Admin
// yang dipakai requireFinancePermission untuk cek hak akses biasa).
// Sinkronisasi actual_amount ke budget_lines
// (kontrol RKA vs realisasi) SENGAJA belum diimplementasikan di sini —
// aturan bisnisnya (jenis transaksi mana yang mengonsumsi anggaran, dan
// bagaimana ADJUSTMENT/REVERSAL memengaruhinya) butuh keputusan produk
// tersendiri, jadi ditunda ke fase Pelaporan/Anggaran berikutnya daripada
// ditebak di sini.
// Status enum finance.transaction_status juga punya nilai REVISION_REQUIRED
// yang SENGAJA tidak dipakai kode manapun di sini (hanya REJECTED yang aktif
// dipakai) — alur REJECTED -> (revisi via PUT /:id/revise) -> DRAFT yang
// sudah ada sekarang sudah mencakup kebutuhan "kembalikan untuk diperbaiki".
// Membuat REVISION_REQUIRED jadi status terpisah dari REJECTED butuh
// keputusan produk dulu soal apa bedanya secara alur kerja (mis. apakah ia
// skip balik ke DRAFT dan langsung SUBMITTED lagi setelah diperbaiki) — jadi
// nilai enum ini dibiarkan ada (tidak dihapus lewat ALTER TYPE, yang punya
// risiko lebih besar daripada manfaatnya untuk kolom yang memang belum
// dipakai) tapi tidak diaktifkan sampai ada keputusan itu. UI
// (FinanceTransaction.tsx STATUS_META) sudah punya label siap pakai kalau
// nanti diaktifkan.
// ============================================================

import { Router, Response } from 'express';
import { getPool } from '../lib/db.js';
import { requireRealDb, FINANCE_ORG, parsePagination, paginationMeta } from '../lib/financeCrud.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireFinancePermission as requireFinancePermissionBase } from '../middleware/checkFinancePermission.js';
import { recordFinanceAudit } from '../lib/financeAudit.js';
import { logger } from '../lib/logger.js';

// Submenu Finance Add-on untuk file ini: endpoint CRUD draft transaksi sendiri
// ada di bawah 'finance-transaction', sementara endpoint alur verifikasi/
// persetujuan (queue, verify, approve, reject, post, reverse) ada di bawah
// 'finance-approval' — dua submenu terpisah yang kebetulan berbagi router yang
// sama. Lihat komentar di checkFinancePermission.ts.
const requireFinancePermission = (action?: string) => requireFinancePermissionBase(action, 'finance-transaction');
const requireApprovalPermission = (action?: string) => requireFinancePermissionBase(action, 'finance-approval');

const router = Router();
router.use(requireAuth, requireRealDb);

const TX_WITH_VOUCHER_SELECT = `
  SELECT t.*, v.voucher_number, v.voucher_date, v.voucher_type_id,
         vt.code AS voucher_type_code, vt.name AS voucher_type_name,
         j.journal_number, j.journal_date AS posted_journal_date
  FROM finance.transactions t
  JOIN finance.vouchers v ON v.id = t.voucher_id
  JOIN finance.voucher_types vt ON vt.id = v.voucher_type_id
  LEFT JOIN finance.journals j ON j.transaction_id = t.id AND j.reversal_of_journal_id IS NULL
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
    const { page, pageSize, offset } = parsePagination(req);
    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM finance.transactions t WHERE ${conditions.join(' AND ')}`, params);
    const dataParams = [...params, pageSize, offset];
    const result = await pool.query(
      `${TX_WITH_VOUCHER_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    res.json({ success: true, data: result.rows, meta: paginationMeta(countRes.rows[0].total, page, pageSize) });
  } catch (err) {
    logger.error('GET transactions', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil data transaksi' } });
  }
});

// ── Antrian Verifikasi & Persetujuan (Fase 5) ───────────────────────────────────
// Menampilkan transaksi yang BISA diproses oleh pengguna yang sedang login,
// dengan aturan segregation of duties yang sama seperti endpoint aksi (lihat
// /:id/verify, /:id/approve, /:id/post): pembuat transaksi tidak muncul di
// antriannya sendiri, dan verifikator tidak muncul lagi di antrian approve
// untuk transaksi yang sudah dia verifikasi sendiri.
router.get('/queue', requireApprovalPermission('approve'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const queueCondition = `t.organization_id = $1 AND (
         (t.status = 'SUBMITTED' AND t.created_by != $2) OR
         (t.status = 'VERIFIED' AND t.created_by != $2 AND t.verified_by != $2) OR
         (t.status = 'APPROVED' AND t.created_by != $2)
       )`;
    const { page, pageSize, offset } = parsePagination(req);
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM finance.transactions t WHERE ${queueCondition}`,
      [FINANCE_ORG, req.user!.userId]
    );
    const result = await pool.query(
      `${TX_WITH_VOUCHER_SELECT} WHERE ${queueCondition} ORDER BY COALESCE(t.submitted_at, t.created_at) ASC LIMIT $3 OFFSET $4`,
      [FINANCE_ORG, req.user!.userId, pageSize, offset]
    );
    res.json({ success: true, data: result.rows, meta: paginationMeta(countRes.rows[0].total, page, pageSize) });
  } catch (err) {
    logger.error('GET transactions/queue', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil antrian verifikasi/persetujuan' } });
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
        (organization_id, voucher_id, fiscal_year_id, period_id, transaction_type, transaction_date, payer_name, payee_name, vendor_id, donor_id, description, reference_number, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        FINANCE_ORG, voucher.id, fiscal_year_id, period.id, voucherType.transaction_type, transaction_date,
        body.payer_name || null, body.payee_name || null, body.vendor_id || null, body.donor_id || null,
        description, body.reference_number || null, req.user!.userId,
      ]
    );

    await client.query('COMMIT');
    logger.info('Transaction created', { user: req.user?.username, transactionId: txRes.rows[0].id, voucherNumber });
    res.status(201).json({ success: true, data: { ...txRes.rows[0], voucher_number: voucherNumber, voucher_date: voucher.voucher_date, voucher_type_code: voucherType.code, voucher_type_name: voucherType.name } });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('POST transactions', { message: String(err), stack: err?.stack });
    res.status(err.status ?? 500).json({ success: false, error: { code: err.code || 'VALIDATION_ERROR', message: err.message || 'Gagal membuat transaksi' } });
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
         vendor_id = COALESCE($5, vendor_id),
         donor_id = COALESCE($6, donor_id),
         description = COALESCE($7, description),
         reference_number = COALESCE($8, reference_number),
         updated_at = NOW(), updated_by = $9
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [
        req.params.id, FINANCE_ORG, body.payer_name ?? null, body.payee_name ?? null,
        body.vendor_id ?? null, body.donor_id ?? null, body.description ?? null, body.reference_number ?? null, req.user!.userId,
      ]
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
    await recordFinanceAudit(req, 'Diajukan', 'FinanceTransaction', tx.id, tx.voucher_number, `Transaksi ${tx.voucher_number} diajukan untuk verifikasi`, 'sensitive');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('PUT transactions/:id/submit', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengajukan transaksi' } });
  }
});

// ── Verifikasi (Submitted → Verified) ──────────────────────────────────────────
router.put('/:id/verify', requireApprovalPermission('approve'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const tx = await getTransactionOr404(pool, req.params.id, res);
    if (!tx) return;
    if (tx.status !== 'SUBMITTED') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya transaksi berstatus Diajukan yang bisa diverifikasi' } });
      return;
    }
    if (tx.created_by === req.user!.userId) {
      res.status(403).json({ success: false, error: { code: 'SEGREGATION_OF_DUTIES', message: 'Pembuat transaksi tidak bisa memverifikasi transaksinya sendiri — perlu orang lain (segregation of duties)' } });
      return;
    }
    const result = await pool.query(
      `UPDATE finance.transactions SET status = 'VERIFIED', verified_at = NOW(), verified_by = $3, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, req.user!.userId]
    );
    logger.info('Transaction verified', { user: req.user?.username, transactionId: req.params.id });
    await recordFinanceAudit(req, 'Diverifikasi', 'FinanceTransaction', tx.id, tx.voucher_number, `Transaksi ${tx.voucher_number} diverifikasi`, 'sensitive');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('PUT transactions/:id/verify', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal memverifikasi transaksi' } });
  }
});

// ── Setujui (Verified → Approved) ───────────────────────────────────────────────
router.put('/:id/approve', requireApprovalPermission('approve'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const tx = await getTransactionOr404(pool, req.params.id, res);
    if (!tx) return;
    if (tx.status !== 'VERIFIED') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya transaksi berstatus Diverifikasi yang bisa disetujui' } });
      return;
    }
    if (tx.created_by === req.user!.userId) {
      res.status(403).json({ success: false, error: { code: 'SEGREGATION_OF_DUTIES', message: 'Pembuat transaksi tidak bisa menyetujui transaksinya sendiri — perlu orang lain (segregation of duties)' } });
      return;
    }
    if (tx.verified_by === req.user!.userId) {
      res.status(403).json({ success: false, error: { code: 'SEGREGATION_OF_DUTIES', message: 'Verifikator tidak bisa merangkap sebagai penyetuju — harus orang berbeda (segregation of duties)' } });
      return;
    }
    const result = await pool.query(
      `UPDATE finance.transactions SET status = 'APPROVED', approved_at = NOW(), approved_by = $3, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, req.user!.userId]
    );
    logger.info('Transaction approved', { user: req.user?.username, transactionId: req.params.id });
    await recordFinanceAudit(req, 'Disetujui', 'FinanceTransaction', tx.id, tx.voucher_number, `Transaksi ${tx.voucher_number} disetujui`, 'sensitive');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('PUT transactions/:id/approve', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menyetujui transaksi' } });
  }
});

// ── Tolak (Submitted/Verified → Rejected, wajib alasan) ─────────────────────────
router.put('/:id/reject', requireApprovalPermission('approve'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const tx = await getTransactionOr404(pool, req.params.id, res);
    if (!tx) return;
    if (!['SUBMITTED', 'VERIFIED'].includes(tx.status)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya transaksi berstatus Diajukan/Diverifikasi yang bisa ditolak' } });
      return;
    }
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Alasan penolakan wajib diisi' } });
      return;
    }
    const result = await pool.query(
      `UPDATE finance.transactions SET status = 'REJECTED', rejection_reason = $3, updated_at = NOW(), updated_by = $4
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, reason, req.user!.userId]
    );
    logger.info('Transaction rejected', { user: req.user?.username, transactionId: req.params.id, reason });
    await recordFinanceAudit(req, 'Ditolak', 'FinanceTransaction', tx.id, tx.voucher_number, `Transaksi ${tx.voucher_number} ditolak — alasan: ${reason}`, 'sensitive');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('PUT transactions/:id/reject', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menolak transaksi' } });
  }
});

// ── Revisi (Rejected → Draft, kembali untuk diedit & diajukan ulang) ────────────
router.put('/:id/revise', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const tx = await getTransactionOr404(pool, req.params.id, res);
    if (!tx) return;
    if (tx.status !== 'REJECTED') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya transaksi berstatus Ditolak yang bisa direvisi' } });
      return;
    }
    const result = await pool.query(
      `UPDATE finance.transactions SET status = 'DRAFT', rejection_reason = NULL, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, req.user!.userId]
    );
    logger.info('Transaction sent back to draft for revision', { user: req.user?.username, transactionId: req.params.id });
    await recordFinanceAudit(req, 'Direvisi', 'FinanceTransaction', tx.id, tx.voucher_number, `Transaksi ${tx.voucher_number} dikembalikan ke Draft untuk direvisi`, 'normal');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('PUT transactions/:id/revise', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengembalikan transaksi ke Draft' } });
  }
});

// ── Posting (Approved → Posted): membuat Jurnal + Baris Jurnal di GL ────────────
router.put('/:id/post', requireApprovalPermission('approve'), async (req: AuthRequest, res: Response) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txRes = await client.query('SELECT * FROM finance.transactions WHERE id = $1 AND organization_id = $2 FOR UPDATE', [req.params.id, FINANCE_ORG]);
    const tx = txRes.rows[0];
    if (!tx) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transaksi tidak ditemukan' } });
      return;
    }
    if (tx.status !== 'APPROVED') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya transaksi berstatus Disetujui yang bisa diposting' } });
      return;
    }
    if (tx.created_by === req.user!.userId) {
      await client.query('ROLLBACK');
      res.status(403).json({ success: false, error: { code: 'SEGREGATION_OF_DUTIES', message: 'Pembuat transaksi tidak bisa memposting transaksinya sendiri — perlu orang lain (segregation of duties)' } });
      return;
    }
    const periodRes = await client.query('SELECT * FROM finance.periods WHERE id = $1', [tx.period_id]);
    const period = periodRes.rows[0];
    if (!period || period.status !== 'OPEN') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Periode transaksi ini sudah tidak Terbuka (Open) — tidak bisa diposting' } });
      return;
    }
    const fyRes = await client.query('SELECT * FROM finance.fiscal_years WHERE id = $1', [tx.fiscal_year_id]);
    const fiscalYear = fyRes.rows[0];

    const seqRes = await client.query(
      `INSERT INTO finance.journal_sequences (organization_id, fiscal_year_id, current_number)
       VALUES ($1,$2,1)
       ON CONFLICT (organization_id, fiscal_year_id)
       DO UPDATE SET current_number = finance.journal_sequences.current_number + 1
       RETURNING current_number`,
      [FINANCE_ORG, tx.fiscal_year_id]
    );
    const journalNumber = `JV/${fiscalYear.code}/${String(seqRes.rows[0].current_number).padStart(4, '0')}`;

    const journalRes = await client.query(
      `INSERT INTO finance.journals
        (organization_id, transaction_id, voucher_id, fiscal_year_id, period_id, journal_number, journal_date, description, total_debit, total_credit, posted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [FINANCE_ORG, tx.id, tx.voucher_id, tx.fiscal_year_id, tx.period_id, journalNumber, tx.transaction_date, tx.description, tx.total_debit, tx.total_credit, req.user!.userId]
    );
    const journal = journalRes.rows[0];

    const linesRes = await client.query('SELECT * FROM finance.transaction_lines WHERE transaction_id = $1 ORDER BY line_number ASC', [tx.id]);
    for (const line of linesRes.rows) {
      await client.query(
        `INSERT INTO finance.journal_lines
          (journal_id, line_number, account_id, field_id, program_id, activity_id, fund_id, cost_center_id, debit, credit, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          journal.id, line.line_number, line.account_id, line.field_id, line.program_id, line.activity_id,
          line.fund_id, line.cost_center_id, line.debit, line.credit, line.description,
        ]
      );
    }

    const updated = await client.query(
      `UPDATE finance.transactions SET status = 'POSTED', posted_at = NOW(), posted_by = $3, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [tx.id, FINANCE_ORG, req.user!.userId]
    );
    await client.query(
      `UPDATE finance.vouchers SET status = 'POSTED', updated_at = NOW(), updated_by = $2 WHERE id = $1`,
      [tx.voucher_id, req.user!.userId]
    );

    await client.query('COMMIT');
    logger.info('Transaction posted to GL', { user: req.user?.username, transactionId: tx.id, journalNumber });
    await recordFinanceAudit(req, 'Diposting', 'FinanceTransaction', tx.id, journalNumber, `Transaksi ${tx.id} diposting ke General Ledger sebagai jurnal ${journalNumber}`, 'critical');
    res.json({ success: true, data: { ...updated.rows[0], journal_number: journalNumber } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT transactions/:id/post', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal memposting transaksi ke General Ledger' } });
  } finally {
    client.release();
  }
});

// ── Balik jurnal (Posted → Reversed): jurnal pembalik, jurnal asli tetap ada ────
router.put('/:id/reverse', requireApprovalPermission('approve'), async (req: AuthRequest, res: Response) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txRes = await client.query('SELECT * FROM finance.transactions WHERE id = $1 AND organization_id = $2 FOR UPDATE', [req.params.id, FINANCE_ORG]);
    const tx = txRes.rows[0];
    if (!tx) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transaksi tidak ditemukan' } });
      return;
    }
    if (tx.status !== 'POSTED') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya transaksi berstatus Terposting yang bisa dibalik' } });
      return;
    }
    const periodRes = await client.query('SELECT * FROM finance.periods WHERE id = $1', [tx.period_id]);
    const period = periodRes.rows[0];
    if (!period || period.status !== 'OPEN') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Periode transaksi ini sudah tidak Terbuka (Open) — tidak bisa dibalik' } });
      return;
    }
    const origJournalRes = await client.query('SELECT * FROM finance.journals WHERE transaction_id = $1', [tx.id]);
    const origJournal = origJournalRes.rows[0];
    if (!origJournal) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Jurnal asal tidak ditemukan' } });
      return;
    }
    const fyRes = await client.query('SELECT * FROM finance.fiscal_years WHERE id = $1', [tx.fiscal_year_id]);
    const fiscalYear = fyRes.rows[0];

    const seqRes = await client.query(
      `INSERT INTO finance.journal_sequences (organization_id, fiscal_year_id, current_number)
       VALUES ($1,$2,1)
       ON CONFLICT (organization_id, fiscal_year_id)
       DO UPDATE SET current_number = finance.journal_sequences.current_number + 1
       RETURNING current_number`,
      [FINANCE_ORG, tx.fiscal_year_id]
    );
    const journalNumber = `JV/${fiscalYear.code}/${String(seqRes.rows[0].current_number).padStart(4, '0')}`;
    const reason = String(req.body?.reason ?? '').trim();
    const description = reason ? `Pembalikan ${origJournal.journal_number}: ${reason}` : `Pembalikan ${origJournal.journal_number}`;

    const reversalRes = await client.query(
      `INSERT INTO finance.journals
        (organization_id, transaction_id, voucher_id, fiscal_year_id, period_id, journal_number, journal_date, description, total_debit, total_credit, posted_by, reversal_of_journal_id)
       VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE,$7,$8,$9,$10,$11) RETURNING *`,
      [FINANCE_ORG, tx.id, tx.voucher_id, tx.fiscal_year_id, period.id, journalNumber, description, origJournal.total_debit, origJournal.total_credit, req.user!.userId, origJournal.id]
    );
    const reversalJournal = reversalRes.rows[0];

    const origLinesRes = await client.query('SELECT * FROM finance.journal_lines WHERE journal_id = $1 ORDER BY line_number ASC', [origJournal.id]);
    for (const line of origLinesRes.rows) {
      await client.query(
        `INSERT INTO finance.journal_lines
          (journal_id, line_number, account_id, field_id, program_id, activity_id, fund_id, cost_center_id, debit, credit, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          reversalJournal.id, line.line_number, line.account_id, line.field_id, line.program_id, line.activity_id,
          line.fund_id, line.cost_center_id, line.credit, line.debit, line.description,
        ]
      );
    }

    const updated = await client.query(
      `UPDATE finance.transactions SET status = 'REVERSED', updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [tx.id, FINANCE_ORG, req.user!.userId]
    );
    await client.query(
      `UPDATE finance.vouchers SET status = 'REVERSED', updated_at = NOW(), updated_by = $2 WHERE id = $1`,
      [tx.voucher_id, req.user!.userId]
    );

    await client.query('COMMIT');
    logger.info('Transaction reversed', { user: req.user?.username, transactionId: tx.id, reversalJournalNumber: journalNumber });
    await recordFinanceAudit(req, 'Dibalik', 'FinanceTransaction', tx.id, journalNumber, `Jurnal ${origJournal.journal_number} dibalik melalui jurnal pembalik ${journalNumber}`, 'critical');
    res.json({ success: true, data: { ...updated.rows[0], reversal_journal_number: journalNumber } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT transactions/:id/reverse', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal membalik jurnal transaksi' } });
  } finally {
    client.release();
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
        (transaction_id, line_number, account_id, field_id, program_id, activity_id, fund_id, cost_center_id, cash_account_id, bank_account_id, description, debit, credit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        req.params.id, lineNumber, account_id, nullable(body.field_id), nullable(body.program_id), nullable(body.activity_id),
        nullable(body.fund_id), nullable(body.cost_center_id), nullable(body.cash_account_id), nullable(body.bank_account_id), nullable(body.description),
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
