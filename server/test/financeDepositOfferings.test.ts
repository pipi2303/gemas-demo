// ============================================================
// FINANCE ADD-ON MODULE — Test integrasi: Setor ke Buku Besar (deposit
// Persembahan/QRIS → Finance Add-on)
// ============================================================
// Menguji jembatan antara collection generik lama `offerings` (dipakai
// OfferingsQRIS.tsx, TIDAK tersambung ke double-entry) dan modul Finance
// Add-on: agregasi per kategori + metode pembayaran menjadi transaksi DRAFT
// (BKM untuk Tunai, BBM terpisah untuk Transfer/QRIS — lihat komentar di
// server/routes/financeTransaction.ts), idempotensi (offering yang sudah
// disetor tidak boleh ikut ke-agregasi lagi), dan keseimbangan debit=kredit
// pada setiap transaksi yang dihasilkan.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, seedBaseFinanceData, uniqueCode } from './helpers.js';
import { getPool } from '../lib/db.js';

async function seedOffering(o: { id: string; type: string; amount: number; paymentMethod: string; date: string }) {
  await getPool().query(
    `INSERT INTO gemas_store (collection, id, data, updated_at) VALUES ('offerings', $1, $2, NOW())
     ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [o.id, JSON.stringify({ ...o, donorName: 'Test Jemaat', createdAt: new Date().toISOString() })]
  );
}

async function getOffering(id: string): Promise<any | null> {
  const r = await getPool().query(`SELECT data FROM gemas_store WHERE collection = 'offerings' AND id = $1`, [id]);
  return r.rows[0] ? JSON.parse(r.rows[0].data) : null;
}

async function getAccountIdByCode(code: string): Promise<string> {
  const r = await getPool().query(`SELECT id FROM finance.accounts WHERE organization_id = 'gpib-trinitas' AND code = $1`, [code]);
  if (!r.rows[0]) throw new Error(`Akun dengan kode ${code} tidak ditemukan di seed default — cek FINANCE_SEED_SQL`);
  return r.rows[0].id;
}

describe('Finance — Setor ke Buku Besar (deposit Persembahan/QRIS)', () => {
  let app: any;
  let seed: Awaited<ReturnType<typeof seedBaseFinanceData>>;
  const admin = authHeader('user-deposit-admin');

  beforeAll(async () => {
    app = await getTestApp();
    seed = await seedBaseFinanceData(app, request, admin);
  });

  it('mengagregasi persembahan Tunai + Transfer/QRIS jadi 2 transaksi DRAFT terpisah (BKM & BBM), seimbang, dan idempoten', async () => {
    const startDate = '2031-01-05';
    const endDate = '2031-01-07';
    const ids = {
      mingguanTunai: uniqueCode('OFR'),
      syukurTunai: uniqueCode('OFR'),
      pembangunanTransfer: uniqueCode('OFR'),
      diakoniaQris: uniqueCode('OFR'),
      diLuarRentang: uniqueCode('OFR'),
      sudahDisetor: uniqueCode('OFR'),
    };

    await seedOffering({ id: ids.mingguanTunai, type: 'Mingguan', amount: 500000, paymentMethod: 'Tunai', date: '2031-01-05' });
    await seedOffering({ id: ids.syukurTunai, type: 'Syukur', amount: 250000, paymentMethod: 'Tunai', date: '2031-01-06' });
    await seedOffering({ id: ids.pembangunanTransfer, type: 'Pembangunan', amount: 1000000, paymentMethod: 'Transfer', date: '2031-01-06' });
    await seedOffering({ id: ids.diakoniaQris, type: 'Diakonia', amount: 300000, paymentMethod: 'QRIS', date: '2031-01-07' });
    // Di luar rentang tanggal — tidak boleh ikut ter-agregasi
    await seedOffering({ id: ids.diLuarRentang, type: 'Mingguan', amount: 999999, paymentMethod: 'Tunai', date: '2031-01-20' });
    // Sudah pernah disetor sebelumnya — tidak boleh ikut ter-agregasi lagi
    await seedOffering({
      id: ids.sudahDisetor, type: 'Mingguan', amount: 111111, paymentMethod: 'Tunai', date: '2031-01-05',
      depositedTransactionId: 'sudah-disetor-duluan', depositedAt: new Date().toISOString(),
    } as any);

    // ── Pratinjau ──────────────────────────────────────────────────────────
    const previewRes = await request(app)
      .get('/api/v1/finance/transactions/deposit-preview')
      .query({ startDate, endDate })
      .set('Authorization', admin);
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.data.offeringCount).toBe(4);
    expect(previewRes.body.data.cash.total).toBe(750000); // Mingguan 500rb + Syukur 250rb
    expect(previewRes.body.data.cash.count).toBe(2);
    expect(previewRes.body.data.bank.total).toBe(1300000); // Pembangunan 1jt + Diakonia 300rb
    expect(previewRes.body.data.bank.count).toBe(2);

    // ── Buat setoran ───────────────────────────────────────────────────────
    const depositRes = await request(app)
      .post('/api/v1/finance/transactions/deposit-offerings')
      .set('Authorization', admin)
      .send({ startDate, endDate, depositDate: seed.transactionDate, fiscal_year_id: seed.fiscalYearId });
    expect(depositRes.status).toBe(201);
    expect(depositRes.body.data.offeringCount).toBe(4);
    const txs = depositRes.body.data.transactions as any[];
    expect(txs).toHaveLength(2);

    const cashTx = txs.find(t => t.bucket === 'CASH');
    const bankTx = txs.find(t => t.bucket === 'BANK');
    expect(cashTx).toBeTruthy();
    expect(bankTx).toBeTruthy();
    expect(cashTx.amount).toBe(750000);
    expect(bankTx.amount).toBe(1300000);
    expect(cashTx.voucherNumber).toMatch(/^BKM\//);
    expect(bankTx.voucherNumber).toMatch(/^BBM\//);

    // ── Transaksi Tunai: DRAFT, seimbang, 1 debit (Kas) + 2 kredit (Mingguan+Syukur) ──
    const cashDetail = await request(app).get(`/api/v1/finance/transactions/${cashTx.transactionId}`).set('Authorization', admin);
    expect(cashDetail.status).toBe(200);
    expect(cashDetail.body.data.status).toBe('DRAFT');
    expect(cashDetail.body.data.voucher_type_code).toBe('BKM');
    expect(Number(cashDetail.body.data.total_debit)).toBe(750000);
    expect(Number(cashDetail.body.data.total_credit)).toBe(750000);

    const cashLines = await request(app).get(`/api/v1/finance/transactions/${cashTx.transactionId}/lines`).set('Authorization', admin);
    expect(cashLines.body.data).toHaveLength(3); // 1 debit Kas + 2 kredit kategori
    const cashDebitLines = cashLines.body.data.filter((l: any) => Number(l.debit) > 0);
    const cashCreditLines = cashLines.body.data.filter((l: any) => Number(l.credit) > 0);
    expect(cashDebitLines).toHaveLength(1);
    expect(Number(cashDebitLines[0].debit)).toBe(750000);
    expect(cashCreditLines).toHaveLength(2);
    expect(cashCreditLines.reduce((s: number, l: any) => s + Number(l.credit), 0)).toBe(750000);

    // ── Transaksi Bank: DRAFT, seimbang, 1 debit (Bank) + 2 kredit (Pembangunan+Diakonia) ──
    const bankDetail = await request(app).get(`/api/v1/finance/transactions/${bankTx.transactionId}`).set('Authorization', admin);
    expect(bankDetail.body.data.voucher_type_code).toBe('BBM');
    expect(Number(bankDetail.body.data.total_debit)).toBe(1300000);
    expect(Number(bankDetail.body.data.total_credit)).toBe(1300000);
    const bankLines = await request(app).get(`/api/v1/finance/transactions/${bankTx.transactionId}/lines`).set('Authorization', admin);
    expect(bankLines.body.data).toHaveLength(3);

    // ── Offerings yang ikut diagregasi harus tertandai "sudah disetor" ──────
    const flaggedMingguan = await getOffering(ids.mingguanTunai);
    expect(flaggedMingguan.depositedTransactionId).toBe(cashTx.transactionId);
    expect(flaggedMingguan.depositedAt).toBeTruthy();
    const flaggedPembangunan = await getOffering(ids.pembangunanTransfer);
    expect(flaggedPembangunan.depositedTransactionId).toBe(bankTx.transactionId);

    // Yang di luar rentang & yang sudah disetor duluan TIDAK boleh berubah
    const unaffected = await getOffering(ids.diLuarRentang);
    expect(unaffected.depositedTransactionId).toBeUndefined();
    const alreadyDeposited = await getOffering(ids.sudahDisetor);
    expect(alreadyDeposited.depositedTransactionId).toBe('sudah-disetor-duluan');

    // ── Idempotensi: jalankan lagi pada rentang yang sama persis ────────────
    const secondRun = await request(app)
      .post('/api/v1/finance/transactions/deposit-offerings')
      .set('Authorization', admin)
      .send({ startDate, endDate, depositDate: seed.transactionDate, fiscal_year_id: seed.fiscalYearId });
    expect(secondRun.status).toBe(400);
    expect(secondRun.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('menolak rentang tanggal yang tidak valid (startDate > endDate)', async () => {
    const res = await request(app)
      .post('/api/v1/finance/transactions/deposit-offerings')
      .set('Authorization', admin)
      .send({ startDate: '2031-02-10', endDate: '2031-02-01', fiscal_year_id: seed.fiscalYearId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('hanya membuat 1 transaksi (BKM) kalau semua persembahan dalam rentang bermetode Tunai', async () => {
    const startDate = '2031-01-10';
    const endDate = '2031-01-10';
    const id = uniqueCode('OFR');
    await seedOffering({ id, type: 'Lainnya', amount: 75000, paymentMethod: 'Tunai', date: startDate });

    const res = await request(app)
      .post('/api/v1/finance/transactions/deposit-offerings')
      .set('Authorization', admin)
      .send({ startDate, endDate, depositDate: seed.transactionDate, fiscal_year_id: seed.fiscalYearId });
    expect(res.status).toBe(201);
    expect(res.body.data.transactions).toHaveLength(1);
    expect(res.body.data.transactions[0].bucket).toBe('CASH');
  });

  it('mengecualikan persembahan bernominal <= 0 dari pratinjau maupun setoran (data rusak/invalid tidak boleh bikin voucher timpang)', async () => {
    const startDate = '2031-04-01';
    const endDate = '2031-04-02';
    const validId = uniqueCode('OFR');
    const negativeId = uniqueCode('OFR');
    const zeroId = uniqueCode('OFR');
    await seedOffering({ id: validId, type: 'Mingguan', amount: 100000, paymentMethod: 'Tunai', date: startDate });
    await seedOffering({ id: negativeId, type: 'Mingguan', amount: -50000, paymentMethod: 'Tunai', date: startDate });
    await seedOffering({ id: zeroId, type: 'Syukur', amount: 0, paymentMethod: 'Tunai', date: endDate });

    const previewRes = await request(app)
      .get('/api/v1/finance/transactions/deposit-preview')
      .query({ startDate, endDate })
      .set('Authorization', admin);
    expect(previewRes.body.data.offeringCount).toBe(1);
    expect(previewRes.body.data.totalAmount).toBe(100000);

    const depositRes = await request(app)
      .post('/api/v1/finance/transactions/deposit-offerings')
      .set('Authorization', admin)
      .send({ startDate, endDate, depositDate: seed.transactionDate, fiscal_year_id: seed.fiscalYearId });
    expect(depositRes.status).toBe(201);
    expect(depositRes.body.data.offeringCount).toBe(1);
    const tx = depositRes.body.data.transactions[0];
    expect(Number(tx.amount)).toBe(100000);

    // Voucher yang dihasilkan tetap harus seimbang (debit == credit) meski ada
    // record amount <= 0 di rentang yang sama -- karena keduanya sudah disaring
    // sejak collectUndepositedOfferings, bukan cuma saat generate baris kredit.
    const detail = await request(app).get(`/api/v1/finance/transactions/${tx.transactionId}`).set('Authorization', admin);
    expect(Number(detail.body.data.total_debit)).toBe(Number(detail.body.data.total_credit));
    expect(Number(detail.body.data.total_debit)).toBe(100000);

    const negFlagged = await getOffering(negativeId);
    expect(negFlagged.depositedTransactionId).toBeUndefined();
    const zeroFlagged = await getOffering(zeroId);
    expect(zeroFlagged.depositedTransactionId).toBeUndefined();
  });

  it('tetap berhasil setor walau kode akun GL diganti setelah seed (mapping pakai ID akun yang stabil, bukan kode)', async () => {
    const accountId = await getAccountIdByCode('4101'); // akun tujuan kategori "Mingguan"
    const renamedCode = uniqueCode('RENAMED-4101');
    const renameRes = await request(app)
      .put(`/api/v1/finance/accounts/${accountId}`)
      .set('Authorization', admin)
      .send({ code: renamedCode });
    expect(renameRes.status).toBe(200);

    try {
      const startDate = '2031-05-01';
      const endDate = '2031-05-01';
      const id = uniqueCode('OFR');
      await seedOffering({ id, type: 'Mingguan', amount: 150000, paymentMethod: 'Tunai', date: startDate });

      const depositRes = await request(app)
        .post('/api/v1/finance/transactions/deposit-offerings')
        .set('Authorization', admin)
        .send({ startDate, endDate, depositDate: seed.transactionDate, fiscal_year_id: seed.fiscalYearId });
      expect(depositRes.status).toBe(201);
      expect(depositRes.body.data.transactions).toHaveLength(1);
      expect(Number(depositRes.body.data.transactions[0].amount)).toBe(150000);

      const linesRes = await request(app)
        .get(`/api/v1/finance/transactions/${depositRes.body.data.transactions[0].transactionId}/lines`)
        .set('Authorization', admin);
      const creditLine = linesRes.body.data.find((l: any) => Number(l.credit) > 0);
      // ID akun kredit tetap sama dengan akun yang barusan diganti kodenya --
      // mapping resolve lewat finance.offering_deposit_map (ID), bukan lewat
      // kode '4101' yang sekarang sudah tidak ada lagi.
      expect(creditLine.account_id).toBe(accountId);
    } finally {
      // Kembalikan kode semula supaya tidak mengganggu test lain di suite yang
      // masih mengandalkan kode default '4101' untuk kategori "Mingguan".
      await request(app).put(`/api/v1/finance/accounts/${accountId}`).set('Authorization', admin).send({ code: '4101' });
    }
  });

  it('mencegah 2 request setor bersamaan pada rentang yang sama menghitung ganda uang yang sama (race condition)', async () => {
    const startDate = '2031-06-01';
    const endDate = '2031-06-01';
    const id = uniqueCode('OFR');
    await seedOffering({ id, type: 'Mingguan', amount: 200000, paymentMethod: 'Tunai', date: startDate });

    const payload = { startDate, endDate, depositDate: seed.transactionDate, fiscal_year_id: seed.fiscalYearId };
    const [r1, r2] = await Promise.all([
      request(app).post('/api/v1/finance/transactions/deposit-offerings').set('Authorization', admin).send(payload),
      request(app).post('/api/v1/finance/transactions/deposit-offerings').set('Authorization', admin).send(payload),
    ]);

    // Tanpa penguncian FOR UPDATE, kedua request bisa sama-sama membaca offering
    // ini sebagai "belum disetor" dan sama-sama berhasil (201) -- menghasilkan 2
    // transaksi Finance Add-on terpisah untuk 1 persembahan yang sama (double-
    // count). Dengan penguncian baris: persis 1 yang berhasil (201), 1 lagi gagal
    // (400) karena setelah menunggu giliran, tidak ada lagi yang belum disetor.
    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 400]);

    const successRes = r1.status === 201 ? r1 : r2;
    expect(successRes.body.data.offeringCount).toBe(1);
    expect(successRes.body.data.transactions).toHaveLength(1);

    const flagged = await getOffering(id);
    expect(flagged.depositedTransactionId).toBe(successRes.body.data.transactions[0].transactionId);
  });
});
