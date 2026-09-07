// ============================================================
// FINANCE ADD-ON MODULE — Test integrasi: Rekonsiliasi Bank
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, seedBaseFinanceData, uniqueCode } from './helpers.js';

describe('Finance Reconciliation — segregation of duties pada complete/approve', () => {
  let app: any;
  let seed: Awaited<ReturnType<typeof seedBaseFinanceData>>;
  const completer = authHeader('user-completer-r');
  const approver = authHeader('user-approver-r');
  let bankAccountId: string;

  beforeAll(async () => {
    app = await getTestApp();
    seed = await seedBaseFinanceData(app, request, completer);

    const bankAccRes = await request(app).post('/api/v1/finance/bank-accounts').set('Authorization', completer).send({
      account_id: seed.assetAccountId,
      bank_name: 'Bank Test', account_number: uniqueCode('ACC'), account_name: 'Rekening Test',
    });
    expect(bankAccRes.status).toBe(201);
    bankAccountId = bankAccRes.body.data.id;
  });

  // Rekening bank finance.bank_accounts bersifat organization-wide (bukan per tahun
  // fiskal) — checklist penutupan periode (financePeriodClosing.test.ts) memeriksa
  // SEMUA rekening bank aktif untuk periode manapun yang mau ditutup. Nonaktifkan
  // rekening test ini setelah selesai supaya tidak membocorkan syarat rekonsiliasi
  // ke test file lain yang menutup periode di tahun fiskal berbeda.
  afterAll(async () => {
    await request(app).delete(`/api/v1/finance/bank-accounts/${bankAccountId}`).set('Authorization', completer);
  });

  async function createBalancedSession(periodIndex: number) {
    const stmtRes = await request(app).post('/api/v1/finance/reconciliation/bank-statements').set('Authorization', completer).send({
      bank_account_id: bankAccountId, statement_date: seed.transactionDate,
      opening_balance: 0, closing_balance: 0,
      lines: [
        { transaction_date: seed.transactionDate, credit: 100000 },
        { transaction_date: seed.transactionDate, debit: 100000 },
      ],
    });
    expect(stmtRes.status).toBe(201);

    const sessionRes = await request(app).post('/api/v1/finance/reconciliation').set('Authorization', completer).send({
      bank_account_id: bankAccountId, period_id: seed.periods[periodIndex].id, statement_id: stmtRes.body.data.id,
    });
    expect(sessionRes.status).toBe(201);
    return sessionRes.body.data;
  }

  it('menyelesaikan sesi yang sudah seimbang, lalu mencegah penyelesai merangkap sebagai penyetuju', async () => {
    const session = await createBalancedSession(6);

    const completeRes = await request(app).put(`/api/v1/finance/reconciliation/${session.id}/complete`).set('Authorization', completer);
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.status).toBe('COMPLETED');

    const selfApprove = await request(app).put(`/api/v1/finance/reconciliation/${session.id}/approve`).set('Authorization', completer);
    expect(selfApprove.status).toBe(403);
    expect(selfApprove.body.error.code).toBe('SEGREGATION_OF_DUTIES');

    const approveRes = await request(app).put(`/api/v1/finance/reconciliation/${session.id}/approve`).set('Authorization', approver);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');
  });

  it('sesi yang sudah disetujui tidak bisa dibatalkan', async () => {
    const session = await createBalancedSession(7);
    await request(app).put(`/api/v1/finance/reconciliation/${session.id}/complete`).set('Authorization', completer);
    await request(app).put(`/api/v1/finance/reconciliation/${session.id}/approve`).set('Authorization', approver);
    const cancelRes = await request(app).put(`/api/v1/finance/reconciliation/${session.id}/cancel`).set('Authorization', completer);
    expect(cancelRes.status).toBe(400);
  });

  it('sesi yang belum disetujui bisa dibatalkan', async () => {
    const session = await createBalancedSession(8);
    const cancelRes = await request(app).put(`/api/v1/finance/reconciliation/${session.id}/cancel`).set('Authorization', completer);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');
  });
});
