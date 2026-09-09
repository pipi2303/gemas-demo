// ============================================================
// FINANCE ADD-ON MODULE — Test integrasi: Dashboard & Analitik
// ============================================================
// Regression test langsung untuk bug produksi yang ditemukan lewat audit gap:
// query Ringkasan Anggaran di financeDashboard.ts memakai kolom `bl.amount`
// yang TIDAK PERNAH ADA (kolom aslinya `budget_amount`) -- GET /dashboard
// selalu gagal 500 di Postgres asli, lalu jatuh ke 2 angka placeholder
// hardcode (385000000/360000000) yang membuat baiknya kelihatan "jalan"
// padahal sama sekali tidak mencerminkan data RKA sungguhan. Sebelum
// perbaikan, tidak ada satu pun test yang menyentuh endpoint ini.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, seedBaseFinanceData, uniqueCode } from './helpers.js';

describe('Finance Dashboard — ringkasan eksekutif', () => {
  let app: any;
  let seed: Awaited<ReturnType<typeof seedBaseFinanceData>>;
  const admin = authHeader('user-dashboard-admin');
  const approver = authHeader('user-dashboard-approver');

  beforeAll(async () => {
    app = await getTestApp();
    seed = await seedBaseFinanceData(app, request, admin);
  });

  it('menghitung Ringkasan Anggaran dari budget_amount RKA yang ACTIVE (bukan 500 karena salah nama kolom, bukan angka placeholder hardcode)', async () => {
    const groupsRes = await request(app).get('/api/v1/finance/account-groups').set('Authorization', admin);
    const groups = groupsRes.body.data as any[];
    const revGroup = groups.find(g => g.code === 'REV');
    const expGroup = groups.find(g => g.code === 'EXP');

    const revAcc = await request(app).post('/api/v1/finance/accounts').set('Authorization', admin).send({
      group_id: revGroup.id, code: uniqueCode('DASHREV'), name: 'Pendapatan Test Dashboard',
    });
    const expAcc = await request(app).post('/api/v1/finance/accounts').set('Authorization', admin).send({
      group_id: expGroup.id, code: uniqueCode('DASHEXP'), name: 'Beban Test Dashboard',
    });
    expect(revAcc.status).toBe(201);
    expect(expAcc.status).toBe(201);

    const code = uniqueCode('RKADASH');
    const budgetRes = await request(app).post('/api/v1/finance/budgets').set('Authorization', admin).send({
      fiscal_year_id: seed.fiscalYearId, code, name: `RKA Dashboard ${code}`,
    });
    const budget = budgetRes.body.data;
    await request(app).post(`/api/v1/finance/budgets/${budget.id}/lines`).set('Authorization', admin).send({
      account_id: revAcc.body.data.id, period_id: seed.periods[0].id, budget_amount: 900000,
    });
    await request(app).post(`/api/v1/finance/budgets/${budget.id}/lines`).set('Authorization', admin).send({
      account_id: expAcc.body.data.id, period_id: seed.periods[0].id, budget_amount: 600000,
    });
    await request(app).put(`/api/v1/finance/budgets/${budget.id}/submit`).set('Authorization', admin);
    await request(app).put(`/api/v1/finance/budgets/${budget.id}/approve`).set('Authorization', approver);
    const activateRes = await request(app).put(`/api/v1/finance/budgets/${budget.id}/activate`).set('Authorization', approver);
    expect(activateRes.status).toBe(200);

    const dashRes = await request(app).get('/api/v1/finance/dashboard').query({ fiscalYearId: seed.fiscalYearId }).set('Authorization', admin);
    // Sebelum perbaikan: request ini SELALU 500 (kolom bl.amount tidak ada).
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.budget.totalBudgetRevenue).toBe(900000);
    expect(dashRes.body.data.budget.totalBudgetExpense).toBe(600000);
  });

  it('menolak request tanpa fiscalYearId', async () => {
    const res = await request(app).get('/api/v1/finance/dashboard').set('Authorization', admin);
    expect(res.status).toBe(400);
  });
});
