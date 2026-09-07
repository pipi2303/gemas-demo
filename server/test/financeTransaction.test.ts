// ============================================================
// FINANCE ADD-ON MODULE — Test integrasi: siklus hidup Transaksi
// ============================================================
// Test paling penting di sini: "membalik jurnal transaksi yang sudah diposting
// berhasil" — ini regression test langsung untuk bug produksi kritis yang
// pernah ditemukan (finance.journals.transaction_id sempat UNIQUE polos,
// membuat fitur Balik Jurnal SELALU gagal — diperbaiki di commit 4cc90a3).
// Tanpa test ini, constraint yang salah bisa kembali lagi lewat perubahan
// skema di masa depan tanpa ada yang sadar sampai dipakai di production.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, seedBaseFinanceData, findAuditEntry } from './helpers.js';

describe('Finance Transaction — siklus hidup & segregation of duties', () => {
  let app: any;
  let seed: Awaited<ReturnType<typeof seedBaseFinanceData>>;
  const creator = authHeader('user-creator');
  const verifier = authHeader('user-verifier');
  const approver = authHeader('user-approver');

  beforeAll(async () => {
    app = await getTestApp();
    seed = await seedBaseFinanceData(app, request, creator);
  });

  async function createBalancedTransaction() {
    const createRes = await request(app).post('/api/v1/finance/transactions').set('Authorization', creator).send({
      voucher_type_id: seed.voucherTypeId,
      fiscal_year_id: seed.fiscalYearId,
      transaction_date: seed.transactionDate,
      description: 'Test transaksi otomatis',
    });
    expect(createRes.status).toBe(201);
    const tx = createRes.body.data;

    const l1 = await request(app).post(`/api/v1/finance/transactions/${tx.id}/lines`).set('Authorization', creator).send({
      account_id: seed.expenseAccountId, side: 'debit', amount: 100000,
    });
    expect(l1.status).toBe(201);
    const l2 = await request(app).post(`/api/v1/finance/transactions/${tx.id}/lines`).set('Authorization', creator).send({
      account_id: seed.assetAccountId, side: 'credit', amount: 100000,
    });
    expect(l2.status).toBe(201);
    return tx;
  }

  it('menolak submit kalau transaksi belum punya baris jurnal', async () => {
    const createRes = await request(app).post('/api/v1/finance/transactions').set('Authorization', creator).send({
      voucher_type_id: seed.voucherTypeId,
      fiscal_year_id: seed.fiscalYearId,
      transaction_date: seed.transactionDate,
      description: 'Transaksi tanpa baris',
    });
    const tx = createRes.body.data;
    const submitRes = await request(app).put(`/api/v1/finance/transactions/${tx.id}/submit`).set('Authorization', creator);
    expect(submitRes.status).toBe(400);
    expect(submitRes.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('menjalankan seluruh alur DRAFT→SUBMITTED→VERIFIED→APPROVED→POSTED→REVERSED dengan segregation of duties', async () => {
    const tx = await createBalancedTransaction();

    // Submit oleh pembuat sendiri — ini boleh (belum masuk tahap approval)
    const submitRes = await request(app).put(`/api/v1/finance/transactions/${tx.id}/submit`).set('Authorization', creator);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('SUBMITTED');

    // Pembuat TIDAK BOLEH memverifikasi transaksinya sendiri
    const selfVerify = await request(app).put(`/api/v1/finance/transactions/${tx.id}/verify`).set('Authorization', creator);
    expect(selfVerify.status).toBe(403);
    expect(selfVerify.body.error.code).toBe('SEGREGATION_OF_DUTIES');

    // Orang lain boleh memverifikasi
    const verifyRes = await request(app).put(`/api/v1/finance/transactions/${tx.id}/verify`).set('Authorization', verifier);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.status).toBe('VERIFIED');

    // Pembuat & verifikator TIDAK BOLEH menyetujui
    const selfApprove = await request(app).put(`/api/v1/finance/transactions/${tx.id}/approve`).set('Authorization', creator);
    expect(selfApprove.status).toBe(403);
    const verifierApprove = await request(app).put(`/api/v1/finance/transactions/${tx.id}/approve`).set('Authorization', verifier);
    expect(verifierApprove.status).toBe(403);

    // Orang ketiga menyetujui
    const approveRes = await request(app).put(`/api/v1/finance/transactions/${tx.id}/approve`).set('Authorization', approver);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');

    // Pembuat TIDAK BOLEH memposting transaksinya sendiri
    const selfPost = await request(app).put(`/api/v1/finance/transactions/${tx.id}/post`).set('Authorization', creator);
    expect(selfPost.status).toBe(403);

    // Orang lain memposting — menghasilkan jurnal di GL
    const postRes = await request(app).put(`/api/v1/finance/transactions/${tx.id}/post`).set('Authorization', approver);
    expect(postRes.status).toBe(200);
    expect(postRes.body.data.status).toBe('POSTED');
    expect(postRes.body.data.journal_number).toMatch(/^JV\//);

    // Jejak audit tercatat untuk aksi posting (severity critical)
    const auditEntry = await findAuditEntry(tx.id, 'Diposting');
    expect(auditEntry).not.toBeNull();
    expect(auditEntry.severity).toBe('critical');
    expect(auditEntry.domain).toBe('Financial');

    // ── REGRESSION: membalik jurnal transaksi yang sudah diposting ──
    // Sebelum commit 4cc90a3, ini SELALU gagal dengan duplicate-key error
    // karena finance.journals.transaction_id punya UNIQUE constraint polos,
    // padahal endpoint ini sengaja insert jurnal KEDUA dengan transaction_id
    // yang sama (jurnal pembalik) untuk transaksi yang sama.
    const reverseRes = await request(app).put(`/api/v1/finance/transactions/${tx.id}/reverse`).set('Authorization', approver).send({
      reason: 'Test pembalikan otomatis',
    });
    expect(reverseRes.status).toBe(200);
    expect(reverseRes.body.data.status).toBe('REVERSED');
    expect(reverseRes.body.data.reversal_journal_number).toMatch(/^JV\//);
    expect(reverseRes.body.data.reversal_journal_number).not.toBe(postRes.body.data.journal_number);

    // Transaksi yang sudah REVERSED tidak bisa dibalik lagi
    const reReverse = await request(app).put(`/api/v1/finance/transactions/${tx.id}/reverse`).set('Authorization', approver).send({ reason: 'coba lagi' });
    expect(reReverse.status).toBe(400);
    expect(reReverse.body.error.code).toBe('INVALID_STATE');
  });

  it('menolak (reject) transaksi wajib mengisi alasan, dan mengembalikannya bisa direvisi ke Draft', async () => {
    const tx = await createBalancedTransaction();
    await request(app).put(`/api/v1/finance/transactions/${tx.id}/submit`).set('Authorization', creator);

    const noReason = await request(app).put(`/api/v1/finance/transactions/${tx.id}/reject`).set('Authorization', verifier).send({});
    expect(noReason.status).toBe(400);

    const rejectRes = await request(app).put(`/api/v1/finance/transactions/${tx.id}/reject`).set('Authorization', verifier).send({ reason: 'Bukti tidak lengkap' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('REJECTED');

    const reviseRes = await request(app).put(`/api/v1/finance/transactions/${tx.id}/revise`).set('Authorization', creator);
    expect(reviseRes.status).toBe(200);
    expect(reviseRes.body.data.status).toBe('DRAFT');
    expect(reviseRes.body.data.rejection_reason).toBeNull();
  });

  it('memaginasi GET / dan menghitung meta.totalPages dengan benar', async () => {
    for (let i = 0; i < 3; i++) await createBalancedTransaction();
    const res = await request(app).get('/api/v1/finance/transactions?page=1&pageSize=2').set('Authorization', creator);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
    expect(res.body.meta.pageSize).toBe(2);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
    expect(res.body.meta.totalPages).toBe(Math.ceil(res.body.meta.total / 2));
  });

  it('antrian /queue memaginasi & menyembunyikan transaksi milik sendiri (segregation)', async () => {
    const tx = await createBalancedTransaction();
    await request(app).put(`/api/v1/finance/transactions/${tx.id}/submit`).set('Authorization', creator);

    // Pembuat tidak melihat transaksinya sendiri di antrian miliknya
    const ownQueue = await request(app).get('/api/v1/finance/transactions/queue?page=1').set('Authorization', creator);
    expect(ownQueue.status).toBe(200);
    expect(ownQueue.body.data.find((t: any) => t.id === tx.id)).toBeUndefined();

    // Orang lain melihatnya, dengan meta pagination yang benar
    const otherQueue = await request(app).get('/api/v1/finance/transactions/queue?page=1&pageSize=1').set('Authorization', verifier);
    expect(otherQueue.status).toBe(200);
    expect(otherQueue.body.meta).toBeDefined();
    expect(otherQueue.body.meta.total).toBeGreaterThanOrEqual(1);
  });
});
