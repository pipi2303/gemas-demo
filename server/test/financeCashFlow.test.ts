// ============================================================
// FINANCE ADD-ON MODULE — Test integrasi: Laporan Arus Kas (metode langsung)
// ============================================================
// Dua sifat paling penting dari desain laporan ini (lihat komentar di
// server/routes/financeReports.ts, GET /reports/cash-flow) yang divalidasi
// di sini:
//   1. Transaksi yang menyentuh kas (di sini lewat voucher Bukti Memorial,
//      BUKAN BKM/BBM) tetap terhitung dengan benar sebagai arus kas Operasi
//      -- klasifikasi TIDAK bergantung pada label tipe voucher, murni dari
//      account_type sisi lawan kas dalam jurnal yang sama.
//   2. Mutasi antar-kas (dua sisi jurnal sama-sama akun Kas & Setara Kas,
//      mis. setor tunai ke bank) TIDAK MUNCUL sama sekali di laporan --
//      karena bukan arus kas eksternal, dan pergerakan bersih kasnya nol.
// Kedua sifat ini spesifik untuk pendekatan "klasifikasi dari sisi non-kas
// di jurnal yang pergerakan kasnya tidak nol" -- kalau nanti ada yang
// menyederhanakan implementasi jadi bergantung pada transaction_type/
// voucher_type, test ini akan gagal dan menandai regresi tersebut.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, seedBaseFinanceData, uniqueCode } from './helpers.js';

describe('Finance Reports — Laporan Arus Kas', () => {
  let app: any;
  let seed: Awaited<ReturnType<typeof seedBaseFinanceData>>;
  const admin = authHeader('user-cashflow-admin');
  const verifier = authHeader('user-cashflow-verifier');
  const approver = authHeader('user-cashflow-approver');

  beforeAll(async () => {
    app = await getTestApp();
    seed = await seedBaseFinanceData(app, request, admin);
  });

  async function postTransaction(lines: { account_id: string; side: 'debit' | 'credit'; amount: number }[], date: string) {
    const txRes = await request(app).post('/api/v1/finance/transactions').set('Authorization', admin).send({
      voucher_type_id: seed.voucherTypeId, fiscal_year_id: seed.fiscalYearId, transaction_date: date,
      description: 'Test Laporan Arus Kas',
    });
    const tx = txRes.body.data;
    for (const l of lines) {
      const r = await request(app).post(`/api/v1/finance/transactions/${tx.id}/lines`).set('Authorization', admin).send(l);
      expect(r.status).toBe(201);
    }
    await request(app).put(`/api/v1/finance/transactions/${tx.id}/submit`).set('Authorization', admin);
    await request(app).put(`/api/v1/finance/transactions/${tx.id}/verify`).set('Authorization', verifier);
    await request(app).put(`/api/v1/finance/transactions/${tx.id}/approve`).set('Authorization', approver);
    const postRes = await request(app).put(`/api/v1/finance/transactions/${tx.id}/post`).set('Authorization', approver);
    expect(postRes.status).toBe(200);
    return tx.id as string;
  }

  it('mencatat Beban yang dibayar dari akun kas terdaftar sebagai arus kas keluar Operasi (walau lewat voucher Bukti Memorial)', async () => {
    // Daftarkan akun aset dari seed sebagai akun Kas resmi (finance.cash_accounts) --
    // ini yang membedakan "akun kas beneran" dari akun ASET lain di Neraca, sesuai
    // desain: klasifikasi kas TIDAK ditebak dari nama akun.
    const cashCode = uniqueCode('KASCF');
    const cashRes = await request(app).post('/api/v1/finance/cash-accounts').set('Authorization', admin).send({
      account_id: seed.assetAccountId, code: cashCode, name: `Kas Arus Kas Test ${cashCode}`, opening_balance: 0,
    });
    expect(cashRes.status).toBe(201);

    await postTransaction([
      { account_id: seed.expenseAccountId, side: 'debit', amount: 400000 },
      { account_id: seed.assetAccountId, side: 'credit', amount: 400000 },
    ], seed.transactionDate);

    const res = await request(app).get('/api/v1/finance/reports/cash-flow')
      .query({ from: seed.periods[0].start_date, to: seed.periods[0].end_date })
      .set('Authorization', admin);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.balanced).toBe(true);
    expect(data.investing.lines.length).toBe(0);
    expect(data.financing.lines.length).toBe(0);
    expect(data.operating.lines.length).toBeGreaterThan(0);
    // Beban dibayar tunai -> arus kas Operasi NEGATIF (kas keluar), bukan positif.
    expect(data.operating.total).toBeLessThan(0);
    expect(Math.abs(data.operating.total)).toBeCloseTo(400000, 5);
    expect(data.netChange).toBeCloseTo(-400000, 5);
    expect(data.endingCash - data.beginningCash).toBeCloseTo(-400000, 5);
  });

  it('mutasi antar dua akun Kas & Setara Kas (mis. setor tunai ke bank) TIDAK muncul sebagai arus kas Operasi/Investasi/Pendanaan', async () => {
    // Perlu akun kas KEDUA -- kalau tidak, "mutasi antar kas" tidak berarti apa-apa.
    const astAccRes2 = await request(app).post('/api/v1/finance/accounts').set('Authorization', admin).send({
      group_id: (await request(app).get('/api/v1/finance/account-groups').set('Authorization', admin).then((r: any) => r.body.data.find((g: any) => g.code === 'AST'))).id,
      code: uniqueCode('ASTACC2'), name: 'Bank Test Kedua (otomatis dari test suite)',
    });
    const asset2Id = astAccRes2.body.data.id as string;
    const cashCode2 = uniqueCode('KASCF2');
    const cash2Res = await request(app).post('/api/v1/finance/cash-accounts').set('Authorization', admin).send({
      account_id: asset2Id, code: cashCode2, name: `Kas Kedua Test ${cashCode2}`, opening_balance: 0,
    });
    expect(cash2Res.status).toBe(201);
    const cashCode1 = uniqueCode('KASCF1');
    await request(app).post('/api/v1/finance/cash-accounts').set('Authorization', admin).send({
      account_id: seed.assetAccountId, code: cashCode1, name: `Kas Pertama Test ${cashCode1}`, opening_balance: 0,
    });

    // Rentang tanggal TERPISAH dari test sebelumnya (periode kedua) supaya tidak
    // tercampur dengan transaksi Beban di atas.
    const period2 = seed.periods[1];
    await postTransaction([
      { account_id: asset2Id, side: 'debit', amount: 250000 },
      { account_id: seed.assetAccountId, side: 'credit', amount: 250000 },
    ], period2.start_date);

    const res = await request(app).get('/api/v1/finance/reports/cash-flow')
      .query({ from: period2.start_date, to: period2.end_date })
      .set('Authorization', admin);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.operating.lines.length).toBe(0);
    expect(data.investing.lines.length).toBe(0);
    expect(data.financing.lines.length).toBe(0);
    expect(data.netChange).toBeCloseTo(0, 5);
    expect(data.balanced).toBe(true);
  });

  it('metode Langsung dan Tidak Langsung menghasilkan total Arus Kas Operasi yang SAMA (identitas akuntansi)', async () => {
    // Skenario independen (akun & periode sendiri) supaya tidak bergantung pada
    // urutan eksekusi test lain: persembahan diterima tunai (Debit Kas, Kredit
    // Pendapatan). Metode Langsung menghitungnya dari efek-kas jurnal; metode
    // Tidak Langsung menghitungnya dari Surplus/(Defisit) Bersih + penyesuaian --
    // dua jalur hitung yang BERBEDA, hasilnya WAJIB persis sama.
    const groups = await request(app).get('/api/v1/finance/account-groups').set('Authorization', admin).then((r: any) => r.body.data);
    const revGroup = groups.find((g: any) => g.code === 'REV');
    const astGroup = groups.find((g: any) => g.code === 'AST');

    const revAccRes = await request(app).post('/api/v1/finance/accounts').set('Authorization', admin).send({
      group_id: revGroup.id, code: uniqueCode('REVACC'), name: 'Pendapatan Test Rekonsiliasi (otomatis dari test suite)',
    });
    const revAccountId = revAccRes.body.data.id as string;
    const astAccRes3 = await request(app).post('/api/v1/finance/accounts').set('Authorization', admin).send({
      group_id: astGroup.id, code: uniqueCode('ASTACC3'), name: 'Kas Test Rekonsiliasi (otomatis dari test suite)',
    });
    const asset3Id = astAccRes3.body.data.id as string;
    const cashCode3 = uniqueCode('KASCF3');
    await request(app).post('/api/v1/finance/cash-accounts').set('Authorization', admin).send({
      account_id: asset3Id, code: cashCode3, name: `Kas Rekonsiliasi Test ${cashCode3}`, opening_balance: 0,
    });

    const period3 = seed.periods[2];
    await postTransaction([
      { account_id: asset3Id, side: 'debit', amount: 750000 },
      { account_id: revAccountId, side: 'credit', amount: 750000 },
    ], period3.start_date);

    const query = { from: period3.start_date, to: period3.end_date };
    const directRes = await request(app).get('/api/v1/finance/reports/cash-flow').query({ ...query, method: 'direct' }).set('Authorization', admin);
    const indirectRes = await request(app).get('/api/v1/finance/reports/cash-flow').query({ ...query, method: 'indirect' }).set('Authorization', admin);
    expect(directRes.status).toBe(200);
    expect(indirectRes.status).toBe(200);

    expect(directRes.body.data.operating.total).toBeCloseTo(750000, 5);
    expect(indirectRes.body.data.operating.total).toBeCloseTo(750000, 5);
    expect(indirectRes.body.data.operating.total).toBeCloseTo(directRes.body.data.operating.total, 5);
    expect(directRes.body.data.balanced).toBe(true);
    expect(indirectRes.body.data.balanced).toBe(true);
    // Investasi/Pendanaan harus identik di kedua metode (bukan cuma totalnya, seluruh baris).
    expect(indirectRes.body.data.investing).toEqual(directRes.body.data.investing);
    expect(indirectRes.body.data.financing).toEqual(directRes.body.data.financing);
  });
});
