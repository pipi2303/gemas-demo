// ============================================================
// Test integrasi: pagination opsional di GET /api/data/:collection
// ============================================================
// Ditulis sesudah menemukan bug produksi nyata saat memindahkan
// parsePagination/paginationMeta dari financeCrud.ts ke pagination.ts:
// `export { x } from './y.js'` HANYA mengekspor ulang — tidak membuat
// binding lokal `x` yang bisa dipakai langsung di file yang sama, jadi
// createMasterDataRouter() di financeCrud.ts sempat gagal dengan
// "ReferenceError: parsePagination is not defined" saat runtime.
// Repo ini tidak punya tsconfig.json, jadi `npm run build` (cuma bundling
// via esbuild) TIDAK menangkap ReferenceError semacam ini — hanya test
// yang benar-benar memanggil endpoint yang bisa. Test di file ini juga
// memverifikasi kontrak endpoint /api/data/:collection yang baru: tanpa
// query param harus tetap mengembalikan array polos (backward compatible
// untuk semua consumer lama), dan dengan ?page=&pageSize=[&sort=desc]
// harus mengembalikan {data, meta} dengan urutan yang benar.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, uniqueCode } from './helpers.js';

describe('GET /api/data/:collection — pagination opsional', () => {
  let app: any;
  const admin = authHeader('user-admin-paging-test');
  const idPrefix = uniqueCode('paging-test');

  beforeAll(async () => {
    app = await getTestApp();
    for (let i = 0; i < 5; i++) {
      const res = await request(app).put(`/api/data/activityLogs/${idPrefix}-${i}`).set('Authorization', admin).send({
        id: `${idPrefix}-${i}`, userId: 'u1', userName: 'Test', userRole: 'Admin',
        action: 'Test', domain: 'System', entityType: 'Test', entityId: `${idPrefix}-${i}`,
        entityName: `Entry ${i}`, timestamp: new Date(Date.now() + i * 1000).toISOString(),
        details: 'test', ipAddress: '127.0.0.1', severity: 'normal',
      });
      expect(res.status).toBe(200);
    }
  });

  it('tanpa query param mengembalikan array polos (backward compatible)', async () => {
    const res = await request(app).get('/api/data/activityLogs').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(5);
  });

  it('dengan ?page=&pageSize= mengembalikan {data, meta}', async () => {
    const res = await request(app).get('/api/data/activityLogs?page=1&pageSize=2').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.pageSize).toBe(2);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(5);
    expect(res.body.meta.totalPages).toBe(Math.ceil(res.body.meta.total / 2));
  });

  it('?sort=desc membalik urutan dibanding urutan default', async () => {
    const ascRes = await request(app).get('/api/data/activityLogs?page=1&pageSize=500').set('Authorization', admin);
    const descRes = await request(app).get('/api/data/activityLogs?page=1&pageSize=500&sort=desc').set('Authorization', admin);
    const ascIds = ascRes.body.data.map((x: any) => x.id);
    const descIds = descRes.body.data.map((x: any) => x.id);
    expect(descIds).toEqual([...ascIds].reverse());
  });

  it('nama koleksi tidak valid ditolak dengan 400', async () => {
    const res = await request(app).get('/api/data/../etc-passwd').set('Authorization', admin);
    expect([400, 404]).toContain(res.status);
  });
});
