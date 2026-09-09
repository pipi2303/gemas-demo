// ============================================================
// FINANCE ADD-ON MODULE — Test integrasi: Laporan Realisasi Anggaran
// ============================================================
// Regression test langsung untuk bug produksi yang ditemukan lewat audit gap:
// transaction_lines.budget_line_id TIDAK PERNAH diisi (kolomnya ada di skema,
// tapi tidak ada satu jalur kode pun -- backend maupun frontend -- yang
// mengisinya), sehingga GET /reports/budget-realization SELALU menghitung
// realisasi aktual = 0 berapa pun uang yang sungguhan sudah dibelanjakan.
// Perbaikan: POST /:id/lines sekarang menerima budget_line_id OPSIONAL
// (divalidasi lewat GET /budgets/lines/lookup di UI), dan test ini
// membuktikan seluruh jalur itu benar-benar menghasilkan angka realisasi
// yang tidak nol setelah transaksi diposting.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, seedBaseFinanceData, uniqueCode } from './helpers.js';

describe('Finance Reports — Realisasi Anggaran (budget_line_id)', () => {
  let app: any;
  let seed: Awaited<ReturnType<typeof seedBaseFinanceData>>;
  const admin = authHeader('user-report-admin');
  const verifier = authHeader('user-report-verifier');
  const approver = authHeader('user-report-approver');

  beforeAll(async () => {
    app = await getTestApp();
    seed = await seedBaseFinanceData(app, request, admin);
  });

  it('GET /budgets/lines/lookup menemukan baris RKA aktif untuk akun & Tahun Fiskal tertentu', async () => {
    const code = uniqueCode('RKALKP');
    const budgetRes = await request(app).post('/api/v1/finance/budgets').set('Authorization', admin).send({
      fiscal_year_id: seed.fiscalYearId, code, name: `RKA Lookup ${code}`,
    });
    const budget = budgetRes.body.data;
    const blRes = await request(app).post(`/api/v1/finance/budgets/${budget.id}/lines`).set('Authorization', admin).send({
      account_id: seed.expenseAccountId, period_id: seed.periods[1].id, budget_amount: 250000,
    });
    expect(blRes.status).toBe(201);

    // RKA masih DRAFT -- belum APPROVED/ACTIVE/REVISED, jadi belum boleh muncul di lookup
    const lookupDraft = await request(app).get('/api/v1/finance/budgets/lines/lookup')
      .query({ fiscalYearId: seed.fiscalYearId, accountId: seed.expenseAccountId })
      .set('Authorization', admin);
    expect(lookupDraft.body.data.some((l: any) => l.id === blRes.body.data.id)).toBe(false);

    await request(app).put(`/api/v1/finance/budgets/${budget.id}/submit`).set('Authorization', admin);
    const approveRes = await request(app).put(`/api/v1/finance/budgets/${budget.id}/approve`).set('Authorization', approver);
    expect(approveRes.status).toBe(200);

    // Sudah APPROVED -- sekarang harus muncul
    const lookupApproved = await request(app).get('/api/v1/finance/budgets/lines/lookup')
      .query({ fiscalYearId: seed.fiscalYearId, accountId: seed.expenseAccountId })
      .set('Authorization', admin);
    expect(lookupApproved.status).toBe(200);
    expect(lookupApproved.body.data.some((l: any) => l.id === blRes.body.data.id)).toBe(true);
  });

  it('menghitung realisasi aktual dari transaksi yang dikaitkan ke baris RKA lewat budget_line_id (sebelumnya selalu 0%)', async () => {
    const code = uniqueCode('RKAREAL');
    const budgetRes = await request(app).post('/api/v1/finance/budgets').set('Authorization', admin).send({
      fiscal_year_id: seed.fiscalYearId, code, name: `RKA Realisasi ${code}`,
    });
    const budget = budgetRes.body.data;
    const blRes = await request(app).post(`/api/v1/finance/budgets/${budget.id}/lines`).set('Authorization', admin).send({
      account_id: seed.expenseAccountId, period_id: seed.periods[0].id, budget_amount: 1000000,
    });
    const budgetLineId = blRes.body.data.id;
    await request(app).put(`/api/v1/finance/budgets/${budget.id}/submit`).set('Authorization', admin);
    await request(app).put(`/api/v1/finance/budgets/${budget.id}/approve`).set('Authorization', approver);
    await request(app).put(`/api/v1/finance/budgets/${budget.id}/activate`).set('Authorization', approver);

    const txRes = await request(app).post('/api/v1/finance/transactions').set('Authorization', admin).send({
      voucher_type_id: seed.voucherTypeId, fiscal_year_id: seed.fiscalYearId, transaction_date: seed.transactionDate,
      description: 'Realisasi RKA test',
    });
    const tx = txRes.body.data;
    const l1 = await request(app).post(`/api/v1/finance/transactions/${tx.id}/lines`).set('Authorization', admin).send({
      account_id: seed.expenseAccountId, side: 'debit', amount: 400000, budget_line_id: budgetLineId,
    });
    expect(l1.status).toBe(201);
    expect(l1.body.data.budget_line_id).toBe(budgetLineId);
    await request(app).post(`/api/v1/finance/transactions/${tx.id}/lines`).set('Authorization', admin).send({
      account_id: seed.assetAccountId, side: 'credit', amount: 400000,
    });
    await request(app).put(`/api/v1/finance/transactions/${tx.id}/submit`).set('Authorization', admin);
    await request(app).put(`/api/v1/finance/transactions/${tx.id}/verify`).set('Authorization', verifier);
    await request(app).put(`/api/v1/finance/transactions/${tx.id}/approve`).set('Authorization', approver);
    const postRes = await request(app).put(`/api/v1/finance/transactions/${tx.id}/post`).set('Authorization', approver);
    expect(postRes.status).toBe(200);

    const realRes = await request(app).get('/api/v1/finance/reports/budget-realization').query({ fiscalYearId: seed.fiscalYearId }).set('Authorization', admin);
    expect(realRes.status).toBe(200);
    const line = (realRes.body.data.lines as any[]).find(l => l.budget_line_id === budgetLineId);
    expect(line).toBeTruthy();
    // Sebelum perbaikan: actual SELALU 0 di sini, berapa pun transaksi yang diposting.
    expect(Number(line.actual)).toBe(400000);
    expect(Number(line.variance)).toBe(600000);
  });

  it('menolak baris transaksi yang budget_line_id-nya untuk akun yang berbeda', async () => {
    const code = uniqueCode('RKAMIS');
    const budgetRes = await request(app).post('/api/v1/finance/budgets').set('Authorization', admin).send({
      fiscal_year_id: seed.fiscalYearId, code, name: `RKA Mismatch ${code}`,
    });
    const budget = budgetRes.body.data;
    const blRes = await request(app).post(`/api/v1/finance/budgets/${budget.id}/lines`).set('Authorization', admin).send({
      account_id: seed.expenseAccountId, period_id: seed.periods[0].id, budget_amount: 100000,
    });
    const budgetLineId = blRes.body.data.id;

    const txRes = await request(app).post('/api/v1/finance/transactions').set('Authorization', admin).send({
      voucher_type_id: seed.voucherTypeId, fiscal_year_id: seed.fiscalYearId, transaction_date: seed.transactionDate,
      description: 'Mismatch akun test',
    });
    const tx = txRes.body.data;
    const lineRes = await request(app).post(`/api/v1/finance/transactions/${tx.id}/lines`).set('Authorization', admin).send({
      account_id: seed.assetAccountId, side: 'debit', amount: 50000, budget_line_id: budgetLineId,
    });
    expect(lineRes.status).toBe(400);
  });
});
