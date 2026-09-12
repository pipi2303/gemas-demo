// ============================================================
// Test integrasi: validator collection 'ministries'
// ============================================================
// Sebelum fix ini, 'ministries' adalah satu-satunya collection utama yang
// lolos tanpa validasi field wajib apa pun lewat runCollectionValidation() --
// PUT/POST bisa membuat record ministries tanpa nama/ketua sama sekali.
// ============================================================
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, uniqueCode } from './helpers.js';

describe('POST/PUT /api/data/ministries -- validasi field wajib', () => {
  it('data lengkap (name + leader) berhasil disimpan (200)', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-ministry-test');
    const id = uniqueCode('ministry-valid');

    const res = await request(app).put(`/api/data/ministries/${id}`).set('Authorization', admin).send({
      id, name: 'Komisi Pemuda', leader: 'Ketua Pemuda Test', memberIds: [], isActive: true,
    });
    expect(res.status).toBe(200);
  });

  it('tanpa name ditolak dengan 400', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-ministry-test');
    const id = uniqueCode('ministry-noname');

    const res = await request(app).put(`/api/data/ministries/${id}`).set('Authorization', admin).send({
      id, leader: 'Ketua Tanpa Nama Komisi',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Nama komisi/);
  });

  it('tanpa leader ditolak dengan 400', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-ministry-test');
    const id = uniqueCode('ministry-noleader');

    const res = await request(app).put(`/api/data/ministries/${id}`).set('Authorization', admin).send({
      id, name: 'Komisi Tanpa Ketua',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ketua\/koordinator/);
  });

  it('memberIds bukan array ditolak dengan 400', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-ministry-test');
    const id = uniqueCode('ministry-badmembers');

    const res = await request(app).put(`/api/data/ministries/${id}`).set('Authorization', admin).send({
      id, name: 'Komisi Salah Format', leader: 'Ketua Test', memberIds: 'bukan-array',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/memberIds/);
  });
});
