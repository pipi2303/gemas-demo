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
import { getPool, getAll } from '../lib/db.js';
import { requireRealDb, FINANCE_ORG, parsePagination, paginationMeta, assertMasterDataActive } from '../lib/financeCrud.js';
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

// ── Setor ke Buku Besar (deposit Persembahan/QRIS → Finance Add-on) ─────────
// Modul Persembahan/QRIS lama (`offerings`, collection generik /api/data,
// lihat OfferingsQRIS.tsx) tidak tersambung ke double-entry Finance Add-on —
// dua sistem pembukuan paralel. Daripada memaksa tiap catatan persembahan
// individual melalui alur transaksi penuh (tidak realistis — bendahara
// menghitung & menyetor persembahan secara batch, bukan per-transaksi),
// fitur ini mengagregasi persembahan yang BELUM disetor dalam satu rentang
// tanggal, dikelompokkan per kategori + metode pembayaran, menjadi transaksi
// Finance Add-on berstatus DRAFT (tetap lewat alur submit→verifikasi→
// approve→posting yang sama seperti transaksi manual — TIDAK auto-posted).
//
// Tunai dan Transfer/QRIS dipisah jadi 2 transaksi (voucher BKM & BBM)
// alih-alih dipaksa jadi satu transaksi "campuran" — supaya transaction_type
// tiap transaksi tetap konsisten dengan definisi voucher_type yang sudah ada
// (CASH_IN murni utk BKM, BANK_IN murni utk BBM), tidak menebak asumsi
// laporan/rekonsiliasi yang mungkin bergantung pada transaction_type.
//
// Idempotensi: setiap offering yang berhasil disetor ditandai
// `depositedTransactionId`/`depositedAt` (field baru pada record JSON
// `offerings`, ditulis via SQL langsung ke gemas_store dalam transaksi
// Postgres yang sama dengan pembuatan voucher/transaksi — supaya keduanya
// atomik, tidak ada risiko voucher jadi tapi tandanya gagal atau sebaliknya)
// — offering yang sudah punya tanda ini tidak akan pernah ikut ke-agregasi
// setoran berikutnya.
// Peta kategori persembahan -> akun GL/dana/kas TIDAK lagi hardcode di sini --
// diambil dari tabel finance.offering_deposit_map (lihat financeSchema.ts) lewat
// resolveOfferingMap() di bawah, supaya bendahara boleh mengubah kode/nama akun
// di Master Data > Akun tanpa merusak fitur setoran ini (mapping disimpan lewat
// ID akun yang stabil, bukan kode yang bisa berubah).

interface OfferingRecord {
  id: string; type: string; amount: number; paymentMethod: string; date: string;
  depositedTransactionId?: string; depositedAt?: string; [key: string]: any;
}

function offeringMethodBucket(paymentMethod: string): 'CASH' | 'BANK' {
  return paymentMethod === 'Tunai' ? 'CASH' : 'BANK';
}

// Ambil mapping akun/dana/kas untuk satu map_key ('CASH_DEBIT', 'BANK_DEBIT', atau
// nama kategori persembahan) dari finance.offering_deposit_map. Mengembalikan null
// kalau map_key belum dikonfigurasi ATAU akunnya sudah dihapus (account_id jadi
// NULL lewat ON DELETE SET NULL) -- keduanya ditangani sebagai "mapping hilang"
// oleh pemanggil: gagal dengan pesan jelas alih-alih memakai akun yang salah.
async function resolveOfferingMap(client: any, mapKey: string): Promise<{ accountId: string; fundId: string | null; cashAccountId: string | null } | null> {
  const r = await client.query(
    'SELECT account_id, fund_id, cash_account_id FROM finance.offering_deposit_map WHERE organization_id = $1 AND map_key = $2',
    [FINANCE_ORG, mapKey]
  );
  const row = r.rows[0];
  if (!row || !row.account_id) return null;
  return { accountId: row.account_id, fundId: row.fund_id ?? null, cashAccountId: row.cash_account_id ?? null };
}

async function collectUndepositedOfferings(startDate: string, endDate: string): Promise<OfferingRecord[]> {
  const all = await getAll<OfferingRecord>('offerings');
  // amount > 0 disaring di sini (sumber data), bukan cuma saat generate baris
  // kredit -- supaya persembahan dengan nominal negatif/nol (data rusak/invalid,
  // form frontend cuma dijaga min="0" HTML yang gampang dilewati) tidak pernah
  // ikut masuk ke agregasi, dan tidak bisa bikin voucher timpang (debit != kredit).
  return all.filter(o => o && o.date >= startDate && o.date <= endDate && !o.depositedTransactionId && Number(o.amount) > 0);
}

function summarizeOfferings(items: OfferingRecord[]) {
  const buckets: Record<'CASH' | 'BANK', { total: number; count: number; byCategory: Record<string, { amount: number; count: number }> }> = {
    CASH: { total: 0, count: 0, byCategory: {} },
    BANK: { total: 0, count: 0, byCategory: {} },
  };
  for (const o of items) {
    const bucket = offeringMethodBucket(o.paymentMethod);
    const amount = Number(o.amount) || 0;
    const b = buckets[bucket];
    b.total += amount;
    b.count += 1;
    const cat = b.byCategory[o.type] ?? { amount: 0, count: 0 };
    cat.amount += amount;
    cat.count += 1;
    b.byCategory[o.type] = cat;
  }
  return buckets;
}

async function resolveDepositFiscalYearId(client: any, fiscalYearId?: string): Promise<string> {
  if (fiscalYearId) {
    const r = await client.query('SELECT id FROM finance.fiscal_years WHERE id = $1 AND organization_id = $2', [fiscalYearId, FINANCE_ORG]);
    if (r.rows.length === 0) throw Object.assign(new Error('Tahun Fiskal tidak ditemukan'), { status: 400 });
    return r.rows[0].id;
  }
  const cur = await client.query('SELECT id FROM finance.fiscal_years WHERE organization_id = $1 AND is_current = TRUE', [FINANCE_ORG]);
  if (cur.rows.length === 0) {
    throw Object.assign(new Error('Belum ada Tahun Fiskal yang aktif — tetapkan Tahun Fiskal di Master Data Finance terlebih dahulu'), { status: 400 });
  }
  return cur.rows[0].id;
}

async function createDepositTransaction(client: any, req: AuthRequest, opts: {
  voucherTypeCode: 'BKM' | 'BBM';
  mapKey: 'CASH_DEBIT' | 'BANK_DEBIT';
  categoryTotals: Record<string, number>;
  transactionDate: string;
  fiscalYearId: string;
  description: string;
}): Promise<{ transactionId: string; voucherNumber: string }> {
  const vt = await client.query(
    'SELECT * FROM finance.voucher_types WHERE organization_id = $1 AND code = $2 AND is_active = TRUE',
    [FINANCE_ORG, opts.voucherTypeCode]
  );
  if (vt.rows.length === 0) throw Object.assign(new Error(`Jenis Voucher ${opts.voucherTypeCode} tidak ditemukan`), { status: 400 });
  const voucherType = vt.rows[0];

  const fy = await client.query('SELECT * FROM finance.fiscal_years WHERE id = $1 AND organization_id = $2', [opts.fiscalYearId, FINANCE_ORG]);
  if (fy.rows.length === 0) throw Object.assign(new Error('Tahun Fiskal tidak ditemukan'), { status: 400 });
  const fiscalYear = fy.rows[0];

  const periodRes = await client.query(
    'SELECT id, status FROM finance.periods WHERE fiscal_year_id = $1 AND start_date <= $2 AND end_date >= $2',
    [opts.fiscalYearId, opts.transactionDate]
  );
  if (periodRes.rows.length === 0) throw Object.assign(new Error('Tanggal setor di luar periode Tahun Fiskal yang dipilih'), { status: 400 });
  const period = periodRes.rows[0];
  if (period.status !== 'OPEN') throw Object.assign(new Error('Periode untuk tanggal setor sudah tidak Terbuka (Open)'), { status: 400 });

  const debitMap = await resolveOfferingMap(client, opts.mapKey);
  if (!debitMap) {
    throw Object.assign(new Error(`Peta akun setoran "${opts.mapKey}" belum dikonfigurasi — jalankan seed Master Data Finance terlebih dahulu`), { status: 400 });
  }
  const debitAccountId = debitMap.accountId;
  const debitCashAccountId = debitMap.cashAccountId;

  const seqRes = await client.query(
    `INSERT INTO finance.voucher_sequences (organization_id, fiscal_year_id, voucher_type_id, current_number)
     VALUES ($1,$2,$3,1)
     ON CONFLICT (organization_id, fiscal_year_id, voucher_type_id)
     DO UPDATE SET current_number = finance.voucher_sequences.current_number + 1
     RETURNING current_number`,
    [FINANCE_ORG, opts.fiscalYearId, voucherType.id]
  );
  const seqNumber = seqRes.rows[0].current_number;
  const voucherNumber = `${voucherType.prefix}/${fiscalYear.code}/${String(seqNumber).padStart(4, '0')}`;

  const voucherRes = await client.query(
    `INSERT INTO finance.vouchers
      (organization_id, fiscal_year_id, period_id, voucher_type_id, voucher_number, voucher_date, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [FINANCE_ORG, opts.fiscalYearId, period.id, voucherType.id, voucherNumber, opts.transactionDate, opts.description, req.user!.userId]
  );
  const voucher = voucherRes.rows[0];

  const txRes = await client.query(
    `INSERT INTO finance.transactions
      (organization_id, voucher_id, fiscal_year_id, period_id, transaction_type, transaction_date, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [FINANCE_ORG, voucher.id, opts.fiscalYearId, period.id, voucherType.transaction_type, opts.transactionDate, opts.description, req.user!.userId]
  );
  const tx = txRes.rows[0];

  const totalAmount = Object.values(opts.categoryTotals).reduce((s, v) => s + v, 0);
  let lineNumber = 1;
  await client.query(
    `INSERT INTO finance.transaction_lines (transaction_id, line_number, account_id, cash_account_id, description, debit, credit)
     VALUES ($1,$2,$3,$4,$5,$6,0)`,
    [tx.id, lineNumber++, debitAccountId, debitCashAccountId, opts.description, totalAmount]
  );

  for (const [type, amount] of Object.entries(opts.categoryTotals)) {
    if (amount <= 0) continue;
    const map = await resolveOfferingMap(client, type);
    if (!map) throw Object.assign(new Error(`Akun Penerimaan untuk kategori "${type}" tidak ditemukan`), { status: 400 });
    await client.query(
      `INSERT INTO finance.transaction_lines (transaction_id, line_number, account_id, fund_id, description, debit, credit)
       VALUES ($1,$2,$3,$4,$5,0,$6)`,
      [tx.id, lineNumber++, map.accountId, map.fundId, `Persembahan ${type}`, amount]
    );
  }

  await recomputeTotals(client, tx.id);
  return { transactionId: tx.id, voucherNumber };
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

// ── Pratinjau agregasi persembahan yang belum disetor ──────────────────────────
router.get('/deposit-preview', requireFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
    if (!startDate || !endDate || startDate > endDate) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Rentang tanggal tidak valid' } });
      return;
    }
    const items = await collectUndepositedOfferings(startDate, endDate);
    const summary = summarizeOfferings(items);
    res.json({
      success: true,
      data: {
        offeringCount: items.length,
        totalAmount: items.reduce((s, o) => s + (Number(o.amount) || 0), 0),
        cash: summary.CASH,
        bank: summary.BANK,
      },
    });
  } catch (err) {
    logger.error('GET transactions/deposit-preview', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal memuat ringkasan persembahan' } });
  }
});

// ── Setor ke Buku Besar: buat transaksi DRAFT dari persembahan yang belum disetor ──
router.post('/deposit-offerings', requireFinancePermission('create'), async (req: AuthRequest, res: Response) => {
  const body = req.body ?? {};
  const { startDate, endDate } = body;
  const depositDate = body.depositDate || endDate;
  if (!startDate || !endDate || startDate > endDate) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Rentang tanggal persembahan tidak valid' } });
    return;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Kunci baris offerings dalam rentang tanggal ini SELAMA transaksi (FOR UPDATE)
    // -- supaya dua request setor yang tumpang-tindih rentang tanggalnya tidak bisa
    // sama-sama membaca offering yang sama sebagai "belum disetor" dan membuat 2
    // transaksi Finance Add-on terpisah untuk uang yang sama (double-count). Request
    // kedua akan menunggu (blok oleh Postgres) sampai request pertama COMMIT, lalu
    // baca ulang data yang sudah ter-flag depositedTransactionId dari request
    // pertama -- otomatis gagal di pengecekan "tidak ada yang belum disetor" di
    // bawah, bukan ikut membuat transaksi duplikat. ORDER BY id membuat urutan
    // penguncian antar request konsisten supaya tidak deadlock.
    const lockRes = await client.query(
      `SELECT id, data FROM gemas_store
       WHERE collection = 'offerings' AND (data::jsonb)->>'date' >= $1 AND (data::jsonb)->>'date' <= $2
       ORDER BY id
       FOR UPDATE`,
      [startDate, endDate]
    );
    const items: OfferingRecord[] = lockRes.rows
      .map((row: any) => JSON.parse(row.data) as OfferingRecord)
      .filter(o => o && !o.depositedTransactionId && Number(o.amount) > 0);

    if (items.length === 0) {
      throw Object.assign(new Error('Tidak ada persembahan yang belum disetor pada rentang tanggal ini'), { status: 400 });
    }
    for (const type of new Set(items.map(o => o.type))) {
      if (!(await resolveOfferingMap(client, type))) {
        throw Object.assign(new Error(`Kategori persembahan "${type}" belum punya akun GL rujukan di Master Data Finance`), { status: 400 });
      }
    }

    const fiscalYearId = await resolveDepositFiscalYearId(client, body.fiscal_year_id);
    const summary = summarizeOfferings(items);
    const results: { bucket: 'CASH' | 'BANK'; transactionId: string; voucherNumber: string; amount: number }[] = [];

    if (summary.CASH.count > 0) {
      const categoryTotals: Record<string, number> = {};
      for (const [type, v] of Object.entries(summary.CASH.byCategory)) categoryTotals[type] = v.amount;
      const r = await createDepositTransaction(client, req, {
        voucherTypeCode: 'BKM',
        mapKey: 'CASH_DEBIT',
        categoryTotals,
        transactionDate: depositDate,
        fiscalYearId,
        description: `Setor Persembahan Tunai ${startDate} s/d ${endDate}`,
      });
      results.push({ bucket: 'CASH', ...r, amount: summary.CASH.total });
    }
    if (summary.BANK.count > 0) {
      const categoryTotals: Record<string, number> = {};
      for (const [type, v] of Object.entries(summary.BANK.byCategory)) categoryTotals[type] = v.amount;
      const r = await createDepositTransaction(client, req, {
        voucherTypeCode: 'BBM',
        mapKey: 'BANK_DEBIT',
        categoryTotals,
        transactionDate: depositDate,
        fiscalYearId,
        description: `Setor Persembahan Transfer/QRIS ${startDate} s/d ${endDate}`,
      });
      results.push({ bucket: 'BANK', ...r, amount: summary.BANK.total });
    }

    // Tandai offerings sebagai sudah disetor DALAM transaksi Postgres yang sama
    // (client yang sama, belum COMMIT) supaya atomik dengan pembuatan voucher
    // di atas — bukan lewat upsert()/getPool() terpisah yang berisiko voucher
    // jadi tapi tandanya gagal tertulis (atau sebaliknya).
    const now = new Date().toISOString();
    for (const o of items) {
      const match = results.find(r => r.bucket === offeringMethodBucket(o.paymentMethod));
      if (!match) continue;
      const updated = { ...o, depositedTransactionId: match.transactionId, depositedAt: now };
      await client.query(
        `INSERT INTO gemas_store (collection, id, data, updated_at)
         VALUES ('offerings', $1, $2, NOW())
         ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
        [o.id, JSON.stringify(updated)]
      );
    }

    await client.query('COMMIT');

    for (const r of results) {
      await recordFinanceAudit(
        req, 'Setor ke Buku Besar', 'FinanceTransaction', r.transactionId, r.voucherNumber,
        `Setor persembahan ${r.bucket === 'CASH' ? 'Tunai' : 'Transfer/QRIS'} ${startDate} s/d ${endDate}, total Rp${r.amount.toLocaleString('id-ID')} (${items.filter(o => offeringMethodBucket(o.paymentMethod) === r.bucket).length} catatan)`,
        'sensitive'
      );
    }

    logger.info('Deposit persembahan created', { user: req.user?.username, results, offeringCount: items.length });
    res.status(201).json({ success: true, data: { transactions: results, offeringCount: items.length } });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('POST transactions/deposit-offerings', { message: String(err), stack: err?.stack });
    res.status(err.status ?? 500).json({ success: false, error: { code: err.code || 'VALIDATION_ERROR', message: err.message || 'Gagal membuat setoran persembahan' } });
  } finally {
    client.release();
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

    await assertMasterDataActive(client, 'finance.vendors', body.vendor_id, 'Vendor/Pemasok', true);
    await assertMasterDataActive(client, 'finance.donors', body.donor_id, 'Donatur', true);

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
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tRes = await client.query('SELECT * FROM finance.transactions WHERE id = $1 AND organization_id = $2', [req.params.id, FINANCE_ORG]);
    const tx = tRes.rows[0];
    if (!tx) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transaksi tidak ditemukan' } });
      return;
    }
    if (tx.status !== 'DRAFT') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya transaksi berstatus Draft yang bisa diedit' } });
      return;
    }
    const body = req.body ?? {};
    if (body.vendor_id) await assertMasterDataActive(client, 'finance.vendors', body.vendor_id, 'Vendor/Pemasok', true);
    if (body.donor_id) await assertMasterDataActive(client, 'finance.donors', body.donor_id, 'Donatur', true);
    const result = await client.query(
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
    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT transactions/:id', { message: String(err) });
    res.status(err.status ?? 500).json({ success: false, error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Gagal memperbarui transaksi' } });
  } finally {
    client.release();
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
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // SELECT ... FOR UPDATE mengunci baris transaksi ini SELAMA transaksi Postgres
    // -- supaya 2 request aksi alur-kerja (submit/verify/approve/reject/revise)
    // yang menembak transaksi yang sama nyaris bersamaan tidak bisa sama-sama
    // membaca status lama yang sama lalu sama-sama berhasil meng-UPDATE dengan
    // asumsi yang sudah basi (bisa menghasilkan status akhir yang kontradiktif +
    // 2 entri audit trail yang saling bertentangan). Request kedua menunggu
    // request pertama COMMIT, lalu pengecekan status di bawah otomatis gagal
    // dengan pesan yang jelas kalau memang sudah tidak berlaku lagi.
    const txRes = await client.query('SELECT * FROM finance.transactions WHERE id = $1 AND organization_id = $2 FOR UPDATE', [req.params.id, FINANCE_ORG]);
    const tx = txRes.rows[0];
    if (!tx) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transaksi tidak ditemukan' } });
      return;
    }
    if (tx.status !== 'DRAFT') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya transaksi berstatus Draft yang bisa diajukan' } });
      return;
    }
    const lineCount = await client.query('SELECT COUNT(*)::int AS n FROM finance.transaction_lines WHERE transaction_id = $1', [req.params.id]);
    if ((lineCount.rows[0]?.n ?? 0) === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Transaksi belum punya baris jurnal — tambahkan minimal 2 baris (debit & kredit)' } });
      return;
    }
    if (Number(tx.total_debit) !== Number(tx.total_credit) || Number(tx.total_debit) === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Transaksi belum seimbang — total debit ${tx.total_debit} ≠ total kredit ${tx.total_credit}` } });
      return;
    }
    const result = await client.query(
      `UPDATE finance.transactions SET status = 'SUBMITTED', submitted_at = NOW(), submitted_by = $3, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, req.user!.userId]
    );
    await client.query(
      `UPDATE finance.vouchers SET status = 'SUBMITTED', updated_at = NOW(), updated_by = $2 WHERE id = $1`,
      [tx.voucher_id, req.user!.userId]
    );
    await client.query('COMMIT');
    logger.info('Transaction submitted', { user: req.user?.username, transactionId: req.params.id });
    await recordFinanceAudit(req, 'Diajukan', 'FinanceTransaction', tx.id, tx.voucher_number, `Transaksi ${tx.voucher_number} diajukan untuk verifikasi`, 'sensitive');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT transactions/:id/submit', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengajukan transaksi' } });
  } finally {
    client.release();
  }
});

// ── Verifikasi (Submitted → Verified) ──────────────────────────────────────────
router.put('/:id/verify', requireApprovalPermission('approve'), async (req: AuthRequest, res: Response) => {
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
    if (tx.status !== 'SUBMITTED') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya transaksi berstatus Diajukan yang bisa diverifikasi' } });
      return;
    }
    if (tx.created_by === req.user!.userId) {
      await client.query('ROLLBACK');
      res.status(403).json({ success: false, error: { code: 'SEGREGATION_OF_DUTIES', message: 'Pembuat transaksi tidak bisa memverifikasi transaksinya sendiri — perlu orang lain (segregation of duties)' } });
      return;
    }
    const result = await client.query(
      `UPDATE finance.transactions SET status = 'VERIFIED', verified_at = NOW(), verified_by = $3, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, req.user!.userId]
    );
    await client.query('COMMIT');
    logger.info('Transaction verified', { user: req.user?.username, transactionId: req.params.id });
    await recordFinanceAudit(req, 'Diverifikasi', 'FinanceTransaction', tx.id, tx.voucher_number, `Transaksi ${tx.voucher_number} diverifikasi`, 'sensitive');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT transactions/:id/verify', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal memverifikasi transaksi' } });
  } finally {
    client.release();
  }
});

// ── Setujui (Verified → Approved) ───────────────────────────────────────────────
router.put('/:id/approve', requireApprovalPermission('approve'), async (req: AuthRequest, res: Response) => {
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
    if (tx.status !== 'VERIFIED') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya transaksi berstatus Diverifikasi yang bisa disetujui' } });
      return;
    }
    if (tx.created_by === req.user!.userId) {
      await client.query('ROLLBACK');
      res.status(403).json({ success: false, error: { code: 'SEGREGATION_OF_DUTIES', message: 'Pembuat transaksi tidak bisa menyetujui transaksinya sendiri — perlu orang lain (segregation of duties)' } });
      return;
    }
    if (tx.verified_by === req.user!.userId) {
      await client.query('ROLLBACK');
      res.status(403).json({ success: false, error: { code: 'SEGREGATION_OF_DUTIES', message: 'Verifikator tidak bisa merangkap sebagai penyetuju — harus orang berbeda (segregation of duties)' } });
      return;
    }
    const result = await client.query(
      `UPDATE finance.transactions SET status = 'APPROVED', approved_at = NOW(), approved_by = $3, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, req.user!.userId]
    );
    await client.query('COMMIT');
    logger.info('Transaction approved', { user: req.user?.username, transactionId: req.params.id });
    await recordFinanceAudit(req, 'Disetujui', 'FinanceTransaction', tx.id, tx.voucher_number, `Transaksi ${tx.voucher_number} disetujui`, 'sensitive');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT transactions/:id/approve', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menyetujui transaksi' } });
  } finally {
    client.release();
  }
});

// ── Tolak (Submitted/Verified → Rejected, wajib alasan) ─────────────────────────
router.put('/:id/reject', requireApprovalPermission('approve'), async (req: AuthRequest, res: Response) => {
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
    if (!['SUBMITTED', 'VERIFIED'].includes(tx.status)) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya transaksi berstatus Diajukan/Diverifikasi yang bisa ditolak' } });
      return;
    }
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Alasan penolakan wajib diisi' } });
      return;
    }
    const result = await client.query(
      `UPDATE finance.transactions SET status = 'REJECTED', rejection_reason = $3, updated_at = NOW(), updated_by = $4
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, reason, req.user!.userId]
    );
    await client.query('COMMIT');
    logger.info('Transaction rejected', { user: req.user?.username, transactionId: req.params.id, reason });
    await recordFinanceAudit(req, 'Ditolak', 'FinanceTransaction', tx.id, tx.voucher_number, `Transaksi ${tx.voucher_number} ditolak — alasan: ${reason}`, 'sensitive');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT transactions/:id/reject', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal menolak transaksi' } });
  } finally {
    client.release();
  }
});

// ── Revisi (Rejected → Draft, kembali untuk diedit & diajukan ulang) ────────────
router.put('/:id/revise', requireFinancePermission('edit'), async (req: AuthRequest, res: Response) => {
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
    if (tx.status !== 'REJECTED') {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Hanya transaksi berstatus Ditolak yang bisa direvisi' } });
      return;
    }
    const result = await client.query(
      `UPDATE finance.transactions SET status = 'DRAFT', rejection_reason = NULL, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, FINANCE_ORG, req.user!.userId]
    );
    await client.query('COMMIT');
    logger.info('Transaction sent back to draft for revision', { user: req.user?.username, transactionId: req.params.id });
    await recordFinanceAudit(req, 'Direvisi', 'FinanceTransaction', tx.id, tx.voucher_number, `Transaksi ${tx.voucher_number} dikembalikan ke Draft untuk direvisi`, 'normal');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('PUT transactions/:id/revise', { message: String(err) });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal mengembalikan transaksi ke Draft' } });
  } finally {
    client.release();
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

    // Akun WAJIB selalu dicek aktif; dimensi lain (dana/pusat biaya/kas/bank)
    // dicek HANYA kalau diisi -- mencegah baris transaksi BARU memakai master
    // data yang sudah dinonaktifkan lewat Master Data UI (menonaktifkan
    // sebelumnya tidak benar-benar mencegah pemakaian baru sama sekali).
    await assertMasterDataActive(client, 'finance.accounts', account_id, 'Akun', true);
    await assertMasterDataActive(client, 'finance.funds', nullable(body.fund_id), 'Dana', true);
    await assertMasterDataActive(client, 'finance.cost_centers', nullable(body.cost_center_id), 'Pusat Biaya', true);
    await assertMasterDataActive(client, 'finance.cash_accounts', nullable(body.cash_account_id), 'Kas', false);
    await assertMasterDataActive(client, 'finance.bank_accounts', nullable(body.bank_account_id), 'Rekening Bank', false);

    // budget_line_id OPSIONAL -- kalau diisi, validasi dulu supaya baris transaksi
    // ini benar-benar bisa dihitung sebagai realisasi baris RKA tsb oleh Laporan
    // Realisasi Anggaran (financeReports.ts, yang JOIN lewat budget_line_id):
    // harus RKA organisasi ini, akunnya harus sama dengan akun baris ini, dan
    // Tahun Fiskal RKA-nya harus sama dengan Tahun Fiskal transaksi ini --
    // supaya tidak ada baris realisasi "nyasar" ke RKA akun/tahun yang salah.
    let budgetLineId: string | null = null;
    if (body.budget_line_id) {
      const blRes = await client.query(
        `SELECT bl.id, bl.account_id, b.fiscal_year_id
         FROM finance.budget_lines bl JOIN finance.budgets b ON b.id = bl.budget_id
         WHERE bl.id = $1 AND b.organization_id = $2`,
        [body.budget_line_id, FINANCE_ORG]
      );
      const bl = blRes.rows[0];
      if (!bl) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Baris Anggaran (RKA) yang dipilih tidak ditemukan' } });
        return;
      }
      if (bl.account_id !== account_id) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Baris Anggaran (RKA) yang dipilih untuk akun yang berbeda' } });
        return;
      }
      if (bl.fiscal_year_id !== tx.fiscal_year_id) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Baris Anggaran (RKA) yang dipilih dari Tahun Fiskal yang berbeda' } });
        return;
      }
      budgetLineId = bl.id;
    }

    const lineNumRes = await client.query('SELECT COALESCE(MAX(line_number),0) + 1 AS next FROM finance.transaction_lines WHERE transaction_id = $1', [req.params.id]);
    const lineNumber = lineNumRes.rows[0].next;
    const result = await client.query(
      `INSERT INTO finance.transaction_lines
        (transaction_id, line_number, account_id, field_id, program_id, activity_id, fund_id, cost_center_id, cash_account_id, bank_account_id, description, debit, credit, budget_line_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        req.params.id, lineNumber, account_id, nullable(body.field_id), nullable(body.program_id), nullable(body.activity_id),
        nullable(body.fund_id), nullable(body.cost_center_id), nullable(body.cash_account_id), nullable(body.bank_account_id), nullable(body.description),
        side === 'debit' ? amount : 0, side === 'credit' ? amount : 0, budgetLineId,
      ]
    );
    const totals = await recomputeTotals(client, req.params.id);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { ...result.rows[0], _totals: totals } });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('POST transactions/:id/lines', { message: String(err) });
    const message = err?.status
      ? err.message
      : (/foreign key/i.test(String(err?.message ?? '')) ? 'Referensi yang dipilih tidak valid' : 'Gagal menambah baris');
    res.status(err?.status ?? 400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
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
