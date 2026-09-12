// ============================================================
// Test integrasi: kunci record `offerings` yang sudah "Setor ke Buku Besar"
// ============================================================
// Sebelum perbaikan ini, record `offerings` yang sudah ditandai
// `depositedTransactionId` (sudah jadi bagian voucher/transaksi resmi di
// Finance Add-on -- lihat server/routes/financeTransaction.ts
// POST /deposit-offerings) masih bisa diedit/dihapus lewat CRUD generik
// PUT/DELETE /api/data/offerings/:id tanpa penguncian apa pun, berisiko
// membuat sumber data mentah persembahan menyimpang diam-diam dari yang
// sudah tercatat di buku besar. Perbaikan ini menutup celah itu dengan pola
// yang sama seperti blockNonEditableLetterWrite() untuk Surat Menyurat.
// ============================================================
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, uniqueCode } from './helpers.js';

describe('PUT/DELETE /api/data/offerings/:id — kunci setelah disetor ke Buku Besar', () => {
  it('offering yang BELUM disetor tetap bisa diedit dan dihapus seperti biasa', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-offering-lock-test');
    const id = uniqueCode('offering-undeposited');

    const create = await request(app).put(`/api/data/offerings/${id}`).set('Authorization', admin).send({
      id, type: 'Mingguan', amount: 50000, paymentMethod: 'Tunai', date: '2026-01-05',
    });
    expect(create.status).toBe(200);

    const edit = await request(app).put(`/api/data/offerings/${id}`).set('Authorization', admin).send({
      id, type: 'Mingguan', amount: 75000, paymentMethod: 'Tunai', date: '2026-01-05',
    });
    expect(edit.status).toBe(200);

    const del = await request(app).delete(`/api/data/offerings/${id}`).set('Authorization', admin);
    expect(del.status).toBe(200);
  });

  it('offering yang SUDAH disetor (depositedTransactionId terisi) menolak PUT dengan 403', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-offering-lock-test');
    const id = uniqueCode('offering-deposited');

    await request(app).put(`/api/data/offerings/${id}`).set('Authorization', admin).send({
      id, type: 'Syukur', amount: 100000, paymentMethod: 'Transfer', date: '2026-01-06',
      depositedTransactionId: 'fake-tx-id-untuk-test', depositedAt: new Date().toISOString(),
    });

    const edit = await request(app).put(`/api/data/offerings/${id}`).set('Authorization', admin).send({
      id, type: 'Syukur', amount: 999999, paymentMethod: 'Transfer', date: '2026-01-06',
      depositedTransactionId: 'fake-tx-id-untuk-test',
    });
    expect(edit.status).toBe(403);
    expect(edit.body.error).toMatch(/disetor ke Buku Besar/);
  });

  it('offering yang SUDAH disetor (depositedTransactionId terisi) menolak DELETE dengan 403', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-offering-lock-test');
    const id = uniqueCode('offering-deposited-del');

    await request(app).put(`/api/data/offerings/${id}`).set('Authorization', admin).send({
      id, type: 'Diakonia', amount: 200000, paymentMethod: 'QRIS', date: '2026-01-07',
      depositedTransactionId: 'fake-tx-id-untuk-test-2', depositedAt: new Date().toISOString(),
    });

    const del = await request(app).delete(`/api/data/offerings/${id}`).set('Authorization', admin);
    expect(del.status).toBe(403);
    expect(del.body.error).toMatch(/disetor ke Buku Besar/);
  });
});
