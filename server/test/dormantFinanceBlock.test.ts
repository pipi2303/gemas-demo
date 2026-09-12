// ============================================================
// Test integrasi: blokir total collection Keuangan & Persembahan klasik
// yang sudah dorman
// ============================================================
// Modul Keuangan & Persembahan klasik (ChurchFinanceHub.tsx dkk) sudah
// dihapus total dari frontend (commit dde3c20), digantikan Finance Add-on.
// Tapi 5 collection lama (financialRecords/bankAccounts/budgets/pettyCash/
// liabilities) masih berupa endpoint /api/data terbuka tanpa validator apa
// pun -- ditutup total di POST/PUT/DELETE lewat blockDormantFinanceWrite().
// GET sengaja tetap dibiarkan (lihat komentar di server/routes/data.ts)
// supaya data lama masih bisa diinspeksi/diekspor untuk migrasi manual.
// ============================================================
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, uniqueCode } from './helpers.js';

const DORMANT_COLLECTIONS = ['financialRecords', 'bankAccounts', 'budgets', 'pettyCash', 'liabilities'];

describe('Collection Keuangan klasik dorman -- diblokir total', () => {
  for (const collection of DORMANT_COLLECTIONS) {
    it(`PUT /api/data/${collection}/:id ditolak dengan 403`, async () => {
      const app = await getTestApp();
      const admin = authHeader('user-admin-dormant-test');
      const id = uniqueCode('dormant');

      const res = await request(app).put(`/api/data/${collection}/${id}`).set('Authorization', admin).send({ id, name: 'Test' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/tidak aktif/);
    });

    it(`POST /api/data/${collection} ditolak dengan 403`, async () => {
      const app = await getTestApp();
      const admin = authHeader('user-admin-dormant-test');

      const res = await request(app).post(`/api/data/${collection}`).set('Authorization', admin).send({ name: 'Test' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/tidak aktif/);
    });

    it(`DELETE /api/data/${collection}/:id ditolak dengan 403`, async () => {
      const app = await getTestApp();
      const admin = authHeader('user-admin-dormant-test');
      const id = uniqueCode('dormant-del');

      const res = await request(app).delete(`/api/data/${collection}/${id}`).set('Authorization', admin);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/tidak aktif/);
    });
  }

  it('GET /api/data/financialRecords TETAP bisa diakses (bukan diblokir, hanya tulis yang ditutup)', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-dormant-test');

    const res = await request(app).get('/api/data/financialRecords').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body) || Array.isArray(res.body.data)).toBe(true);
  });
});
