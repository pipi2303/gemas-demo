// ============================================================
// FINANCE ADD-ON MODULE — Test integrasi: siklus hidup RKA (Budget)
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, seedBaseFinanceData, findAuditEntry, uniqueCode } from './helpers.js';

describe('Finance Budget — siklus hidup & segregation of duties', () => {
  let app: any;
  let seed: Awaited<ReturnType<typeof seedBaseFinanceData>>;
  const creator = authHeader('user-creator-b');
  const approver = authHeader('user-approver-b');

  beforeAll(async () => {
    app = await getTestApp();
    seed = await seedBaseFinanceData(app, request, creator);
  });

  async function createBudgetWithLine() {
    const code = uniqueCode('RKA');
    const createRes = await request(app).post('/api/v1/finance/budgets').set('Authorization', creator).send({
      fiscal_year_id: seed.fiscalYearId, code, name: `RKA Test ${code}`,
    });
    expect(createRes.status).toBe(201);
    const budget = createRes.body.data;

    const lineRes = await request(app).post(`/api/v1/finance/budgets/${budget.id}/lines`).set('Authorization', creator).send({
      account_id: seed.expenseAccountId, period_id: seed.periods[0].id, budget_amount: 5000000,
    });
    expect(lineRes.status).toBe(201);
    return budget;
  }

  it('menolak submit kalau RKA belum punya baris anggaran', async () => {
    const code = uniqueCode('RKA');
    const createRes = await request(app).post('/api/v1/finance/budgets').set('Authorization', creator).send({
      fiscal_year_id: seed.fiscalYearId, code, name: `RKA kosong ${code}`,
    });
    const budget = createRes.body.data;
    const submitRes = await request(app).put(`/api/v1/finance/budgets/${budget.id}/submit`).set('Authorization', creator);
    expect(submitRes.status).toBe(400);
  });

  it('menjalankan alur DRAFT→SUBMITTED→APPROVED→ACTIVE dengan segregation of duties, dan mencatat jejak audit', async () => {
    const budget = await createBudgetWithLine();

    const submitRes = await request(app).put(`/api/v1/finance/budgets/${budget.id}/submit`).set('Authorization', creator);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('SUBMITTED');

    // Pembuat/pengaju tidak boleh menyetujui RKA-nya sendiri
    const selfApprove = await request(app).put(`/api/v1/finance/budgets/${budget.id}/approve`).set('Authorization', creator);
    expect(selfApprove.status).toBe(403);
    expect(selfApprove.body.error.code).toBe('SEGREGATION_OF_DUTIES');

    const approveRes = await request(app).put(`/api/v1/finance/budgets/${budget.id}/approve`).set('Authorization', approver);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');

    const activateRes = await request(app).put(`/api/v1/finance/budgets/${budget.id}/activate`).set('Authorization', approver);
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.data.status).toBe('ACTIVE');

    const auditEntry = await findAuditEntry(budget.id, 'Diaktifkan');
    expect(auditEntry).not.toBeNull();
    expect(auditEntry.severity).toBe('critical');
    expect(auditEntry.domain).toBe('Financial');
  });

  it('mengaktifkan versi RKA baru menurunkan versi ACTIVE lama menjadi REVISED', async () => {
    const budgetA = await createBudgetWithLine();
    await request(app).put(`/api/v1/finance/budgets/${budgetA.id}/submit`).set('Authorization', creator);
    await request(app).put(`/api/v1/finance/budgets/${budgetA.id}/approve`).set('Authorization', approver);
    await request(app).put(`/api/v1/finance/budgets/${budgetA.id}/activate`).set('Authorization', approver);

    const budgetB = await createBudgetWithLine();
    await request(app).put(`/api/v1/finance/budgets/${budgetB.id}/submit`).set('Authorization', creator);
    await request(app).put(`/api/v1/finance/budgets/${budgetB.id}/approve`).set('Authorization', approver);
    const activateB = await request(app).put(`/api/v1/finance/budgets/${budgetB.id}/activate`).set('Authorization', approver);
    expect(activateB.status).toBe(200);
    expect(activateB.body.data.status).toBe('ACTIVE');

    const getA = await request(app).get(`/api/v1/finance/budgets/${budgetA.id}`).set('Authorization', creator);
    expect(getA.body.data.status).toBe('REVISED');
  });

  it('reject RKA wajib mengisi alasan', async () => {
    const budget = await createBudgetWithLine();
    await request(app).put(`/api/v1/finance/budgets/${budget.id}/submit`).set('Authorization', creator);
    const noReason = await request(app).put(`/api/v1/finance/budgets/${budget.id}/reject`).set('Authorization', approver).send({});
    expect(noReason.status).toBe(400);
    const rejectRes = await request(app).put(`/api/v1/finance/budgets/${budget.id}/reject`).set('Authorization', approver).send({ reason: 'Anggaran terlalu tinggi' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('DRAFT');
  });

  it('mencegah 2 aktivasi bersamaan menghasilkan 2 RKA ACTIVE sekaligus untuk 1 Tahun Fiskal (race condition)', async () => {
    const budgetA = await createBudgetWithLine();
    await request(app).put(`/api/v1/finance/budgets/${budgetA.id}/submit`).set('Authorization', creator);
    await request(app).put(`/api/v1/finance/budgets/${budgetA.id}/approve`).set('Authorization', approver);

    const budgetB = await createBudgetWithLine();
    await request(app).put(`/api/v1/finance/budgets/${budgetB.id}/submit`).set('Authorization', creator);
    await request(app).put(`/api/v1/finance/budgets/${budgetB.id}/approve`).set('Authorization', approver);

    // Tanpa lock baris Tahun Fiskal di PUT /:id/activate, kedua request ini bisa
    // sama-sama membaca "belum ada yang ACTIVE" lalu sama-sama berhasil set
    // dirinya ACTIVE -- 2 RKA aktif sekaligus untuk 1 tahun fiskal (merusak
    // Ringkasan Anggaran & Laporan Realisasi Anggaran). Dengan lock: keduanya
    // tetap 200 (tidak ada yang gagal), tapi harus berbaris sehingga hasil
    // akhirnya PERSIS 1 ACTIVE + 1 REVISED.
    const [r1, r2] = await Promise.all([
      request(app).put(`/api/v1/finance/budgets/${budgetA.id}/activate`).set('Authorization', approver),
      request(app).put(`/api/v1/finance/budgets/${budgetB.id}/activate`).set('Authorization', approver),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const [getA, getB] = await Promise.all([
      request(app).get(`/api/v1/finance/budgets/${budgetA.id}`).set('Authorization', creator),
      request(app).get(`/api/v1/finance/budgets/${budgetB.id}`).set('Authorization', creator),
    ]);
    const statuses = [getA.body.data.status, getB.body.data.status].sort();
    expect(statuses).toEqual(['ACTIVE', 'REVISED']);
  });
});
