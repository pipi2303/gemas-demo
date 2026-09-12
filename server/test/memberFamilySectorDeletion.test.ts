// ============================================================
// Test integrasi: integritas referensi saat hapus Jemaat/Keluarga/Sektor
// ============================================================
// Sebelum fix ini, pengecekan "masih ada data terkait?" untuk hapus
// Jemaat/Keluarga/Sektor HANYA ada di client (MemberDatabase.tsx/
// FamilyDatabase.tsx/SectorDatabase.tsx) -- panggilan DELETE langsung ke
// /api/data/members|families|sectors/:id bisa melewati semua pengecekan itu
// dan membuat banyak record jadi yatim. Test ini memverifikasi guard server
// baru (blockMemberDeletionInUse/blockFamilyDeletionInUse/
// blockSectorDeletionInUse di server/routes/data.ts) benar-benar menutup
// celah itu -- baik jalur "boleh dihapus" (positif) maupun "harus ditolak"
// (negatif), termasuk relasi ministries yang sebelumnya tidak pernah dicek
// sama sekali (bukan hanya di server, di client pun tidak).
// ============================================================
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, uniqueCode } from './helpers.js';

describe('DELETE /api/data/members/:id -- integritas referensi', () => {
  it('Jemaat TANPA data terkait berhasil dihapus (200)', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-memberdel-test');
    const id = uniqueCode('member-clean');

    const create = await request(app).put(`/api/data/members/${id}`).set('Authorization', admin).send({
      id, fullName: 'Jemaat Bersih Test',
    });
    expect(create.status).toBe(200);

    const del = await request(app).delete(`/api/data/members/${id}`).set('Authorization', admin);
    expect(del.status).toBe(200);
  });

  it('Jemaat dengan prayerRequests terkait menolak DELETE dengan 403', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-memberdel-test');
    const id = uniqueCode('member-prayer');

    await request(app).put(`/api/data/members/${id}`).set('Authorization', admin).send({
      id, fullName: 'Jemaat Ada Pokok Doa',
    });

    const prayerId = uniqueCode('prayer');
    const prayerRes = await request(app).put(`/api/data/prayerRequests/${prayerId}`).set('Authorization', admin).send({
      id: prayerId, memberId: id, request: 'Mohon didoakan untuk kesehatan',
    });
    expect(prayerRes.status).toBe(200);

    const del = await request(app).delete(`/api/data/members/${id}`).set('Authorization', admin);
    expect(del.status).toBe(403);
    expect(del.body.error).toMatch(/tidak bisa dihapus langsung/);
  });

  it('Jemaat yang jadi leaderMemberId/memberIds sebuah ministries menolak DELETE dengan 403', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-memberdel-test');
    const id = uniqueCode('member-ministry');

    await request(app).put(`/api/data/members/${id}`).set('Authorization', admin).send({
      id, fullName: 'Jemaat Pengurus Komisi',
    });

    const ministryId = uniqueCode('ministry');
    const ministryRes = await request(app).put(`/api/data/ministries/${ministryId}`).set('Authorization', admin).send({
      id: ministryId, name: 'Komisi Test', leader: 'Jemaat Pengurus Komisi', leaderMemberId: id, memberIds: [id],
    });
    expect(ministryRes.status).toBe(200);

    const del = await request(app).delete(`/api/data/members/${id}`).set('Authorization', admin);
    expect(del.status).toBe(403);
    expect(del.body.error).toMatch(/tidak bisa dihapus langsung/);
  });
});

describe('DELETE /api/data/families/:id -- integritas referensi', () => {
  it('Keluarga TANPA anggota berhasil dihapus (200)', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-familydel-test');
    const headId = uniqueCode('member-head');
    const familyId = uniqueCode('family-clean');

    await request(app).put(`/api/data/members/${headId}`).set('Authorization', admin).send({ id: headId, fullName: 'Kepala Keluarga Test' });
    const createFamily = await request(app).put(`/api/data/families/${familyId}`).set('Authorization', admin).send({
      id: familyId, headOfFamily: 'Kepala Keluarga Test', headMemberId: headId, sectorId: uniqueCode('sector-ref'), address: 'Jl. Test No. 1',
    });
    expect(createFamily.status).toBe(200);

    const del = await request(app).delete(`/api/data/families/${familyId}`).set('Authorization', admin);
    expect(del.status).toBe(200);
  });

  it('Keluarga yang masih punya anggota (member.familyId) menolak DELETE dengan 403', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-familydel-test');
    const headId = uniqueCode('member-head2');
    const familyId = uniqueCode('family-withmember');

    await request(app).put(`/api/data/members/${headId}`).set('Authorization', admin).send({ id: headId, fullName: 'Kepala Keluarga Dua' });
    await request(app).put(`/api/data/families/${familyId}`).set('Authorization', admin).send({
      id: familyId, headOfFamily: 'Kepala Keluarga Dua', headMemberId: headId, sectorId: uniqueCode('sector-ref'), address: 'Jl. Test No. 2',
    });

    const memberId = uniqueCode('member-in-family');
    await request(app).put(`/api/data/members/${memberId}`).set('Authorization', admin).send({
      id: memberId, fullName: 'Anggota Keluarga', familyId,
    });

    const del = await request(app).delete(`/api/data/families/${familyId}`).set('Authorization', admin);
    expect(del.status).toBe(403);
    expect(del.body.error).toMatch(/masih memiliki \d+ anggota/);
  });
});

describe('DELETE /api/data/sectors/:id -- integritas referensi', () => {
  it('Sektor TANPA anggota berhasil dihapus (200)', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-sectordel-test');
    const sectorId = uniqueCode('sector-clean');

    const create = await request(app).put(`/api/data/sectors/${sectorId}`).set('Authorization', admin).send({
      id: sectorId, name: 'Sektor Bersih Test', leader: 'Ketua Sektor Test', leaderContact: '081234567890',
    });
    expect(create.status).toBe(200);

    const del = await request(app).delete(`/api/data/sectors/${sectorId}`).set('Authorization', admin);
    expect(del.status).toBe(200);
  });

  it('Sektor yang masih punya anggota (member.sectorId) menolak DELETE dengan 403', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-sectordel-test');
    const sectorId = uniqueCode('sector-withmember');

    await request(app).put(`/api/data/sectors/${sectorId}`).set('Authorization', admin).send({
      id: sectorId, name: 'Sektor Ada Anggota', leader: 'Ketua Sektor Dua', leaderContact: '081298765432',
    });

    const memberId = uniqueCode('member-in-sector');
    await request(app).put(`/api/data/members/${memberId}`).set('Authorization', admin).send({
      id: memberId, fullName: 'Anggota Sektor', sectorId,
    });

    const del = await request(app).delete(`/api/data/sectors/${sectorId}`).set('Authorization', admin);
    expect(del.status).toBe(403);
    expect(del.body.error).toMatch(/masih memiliki \d+ anggota/);
  });
});
