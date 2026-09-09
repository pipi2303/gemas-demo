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

  it('mencegah 1 transaksi tercocok ke 2 sesi rekonsiliasi berbeda sekaligus (race condition lintas-sesi)', async () => {
    // 2 sesi berbeda (statement & periode masing-masing) atas rekening bank yang
    // sama -- pengecekan duplikat di POST /:id/matches sebelumnya cuma snapshot
    // read per-request, TIDAK ada lock lintas sesi, jadi 2 sesi berbeda bisa
    // sama-sama lolos cek "belum dicocokkan" untuk transaksi yang sama lalu
    // sama-sama berhasil INSERT. uq_recon_matches_transaction (financeSchema.ts)
    // jadi pengaman lapis kedua di level database untuk race ini.
    const sessionX = await createBalancedSession(9);
    const sessionY = await createBalancedSession(10);
    const detailX = await request(app).get(`/api/v1/finance/reconciliation/${sessionX.id}`).set('Authorization', completer);
    const detailY = await request(app).get(`/api/v1/finance/reconciliation/${sessionY.id}`).set('Authorization', completer);
    const lineX = detailX.body.data.statementLines[0].id;
    const lineY = detailY.body.data.statementLines[0].id;

    const txRes = await request(app).post('/api/v1/finance/transactions').set('Authorization', completer).send({
      voucher_type_id: seed.voucherTypeId, fiscal_year_id: seed.fiscalYearId, transaction_date: seed.transactionDate,
      description: 'Transaksi untuk dicocokkan bersamaan',
    });
    const transactionId = txRes.body.data.id;

    const [matchX, matchY] = await Promise.all([
      request(app).post(`/api/v1/finance/reconciliation/${sessionX.id}/matches`).set('Authorization', completer).send({ statement_line_id: lineX, transaction_id: transactionId }),
      request(app).post(`/api/v1/finance/reconciliation/${sessionY.id}/matches`).set('Authorization', completer).send({ statement_line_id: lineY, transaction_id: transactionId }),
    ]);
    const statuses = [matchX.status, matchY.status];
    // Salah satu HARUS 201 (berhasil dicocokkan), satu lagi HARUS gagal (400 dari
    // cek aplikasi kalau menang duluan sebelum commit, atau 409 dari unique index
    // kalau race betulan kejadian di level DB) -- yang PENTING adalah TIDAK PERNAH
    // keduanya 201 (itu berarti 1 transaksi lolos tercocok ke 2 sesi berbeda).
    const successCount = statuses.filter((s) => s === 201).length;
    expect(successCount).toBe(1);
    const failureStatus = statuses.find((s) => s !== 201);
    expect([400, 409]).toContain(failureStatus);
  });
});
