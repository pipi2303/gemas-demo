import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, uniqueCode } from './helpers.js';
import { getPool } from '../lib/db.js';

// Sama seperti outgoingLetters.test.ts: findAuditEntry() di helpers.ts memakai
// raw SQL dengan nama collection sebagai STRING LITERAL (bukan placeholder $1),
// yang tidak dikenali mockQuery() saat berjalan tanpa Postgres asli (sandbox
// ini). Jadi verifikasi audit trail & notifikasi lewat endpoint GET generik
// (/api/data/activityLogs, /api/data/notifications), bukan lewat findAuditEntry().
async function findActivityLogEntry(app: any, adminHeader: string, entityId: string, action: string) {
  const res = await request(app).get('/api/data/activityLogs').set('Authorization', adminHeader);
  const rows = res.body as any[];
  return rows.find(r => r.entityId === entityId && r.action === action) || null;
}

async function findNotificationsFor(app: any, adminHeader: string, targetUserId: string) {
  const res = await request(app).get('/api/data/notifications').set('Authorization', adminHeader);
  const rows = res.body as any[];
  return rows.filter(r => r.targetUserId === targetUserId && r.type === 'disposition');
}

// ============================================================
// MODUL SURAT-MENYURAT — Fase 3 (Surat Masuk & Disposisi)
// ============================================================
// Integration test lewat supertest terhadap app Express sungguhan (getTestApp()),
// meniru pola server/test/outgoingLetters.test.ts — supaya routing, middleware
// requireAuth/requirePermission, guard generik di data.ts
// (blockNonEditableLetterWrite), DAN "assignee override" di
// server/routes/incomingLetters.ts semua ikut teruji.
//
// Dua keputusan desain yang dikonfirmasi user sebelum Fase 3 dibangun (lihat
// plan-modul-surat-menyurat.md Bagian 5-6) diuji eksplisit di sini:
// 1) Staf yang DITUGASKAN lewat disposisi selalu boleh tindak-lanjut/selesai,
//    walau role-nya (Operator) tidak punya izin modul 'letters-incoming' sama
//    sekali (ketuaSektor/operator = NONE di DEFAULT_MATRIX 'Surat Menyurat').
// 2) Arsipkan BUKAN assignee-gated — staf yang sama tanpa izin modul harus
//    tetap ditolak di tahap Arsipkan.

describe('Surat Masuk & Disposisi — alur kerja (server/routes/incomingLetters.ts)', () => {
  let app: any;
  const admin = authHeader('tester-admin', { role: 'Admin' });
  const majelis = authHeader('tester-majelis-masuk', { role: 'Majelis' });

  // Dua "Operator" berbeda — satu akan ditugaskan lewat disposisi (assignee),
  // satu lagi TIDAK (untuk membuktikan override cuma berlaku untuk yang
  // benar-benar ditugaskan, bukan untuk semua Operator).
  const assigneeUserId = uniqueCode('test-staf-assignee');
  const otherUserId = uniqueCode('test-staf-lain');
  const assigneeHeader = authHeader(assigneeUserId, { role: 'Operator', username: assigneeUserId, name: 'Staf Ditugaskan' });
  const otherHeader = authHeader(otherUserId, { role: 'Operator', username: otherUserId, name: 'Staf Lain' });

  let letterId: string;

  beforeAll(async () => {
    app = await getTestApp();

    const seedUser = async (id: string, name: string) => {
      const res = await request(app).put(`/api/data/users/${id}`).set('Authorization', admin).send({
        id, name, email: `${id}@test.local`, username: id, password: 'testpass123', role: 'Operator', isActive: true,
      });
      expect(res.status).toBe(200);
    };
    await seedUser(assigneeUserId, 'Staf Ditugaskan');
    await seedUser(otherUserId, 'Staf Lain');
  });

  afterAll(async () => {
    await request(app).delete(`/api/data/users/${assigneeUserId}`).set('Authorization', admin);
    await request(app).delete(`/api/data/users/${otherUserId}`).set('Authorization', admin);
    const pool = getPool();
    if (letterId) {
      await pool.query(`DELETE FROM gemas_store WHERE collection = 'incomingLetters' AND id = $1`, [letterId]);
    }
  });

  it('POST /api/data/incomingLetters memaksa status Diterima & membuang field disposisi/tahap-lanjut walau client mengirimkannya', async () => {
    const res = await request(app).post('/api/data/incomingLetters').set('Authorization', admin).send({
      id: uniqueCode('inl-test'),
      status: 'Selesai', // client nakal mencoba lompat status — harus diabaikan server
      disposisi: { assignedToUserId: assigneeUserId, instruction: 'palsu' },
      receivedDate: '2026-01-01',
      senderName: 'Jemaat Uji',
      subject: 'Surat Uji Coba Masuk',
      createdBy: 'tester-admin',
    });
    expect(res.status).toBe(200);
    letterId = res.body.id;

    const list = await request(app).get('/api/data/incomingLetters').set('Authorization', admin);
    const created = (list.body as any[]).find(l => l.id === letterId);
    expect(created.status).toBe('Diterima');
    expect(created.disposisi).toBeUndefined();
  });

  it('PUT generik tidak bisa menyelundupkan status/disposisi walau surat masih Diterima', async () => {
    const res = await request(app).put(`/api/data/incomingLetters/${letterId}`).set('Authorization', admin).send({
      id: letterId, receivedDate: '2026-01-01', senderName: 'Jemaat Uji',
      subject: 'Surat Uji Coba Masuk (diedit)', createdBy: 'tester-admin',
      status: 'Selesai', disposisi: { assignedToUserId: assigneeUserId, instruction: 'palsu' }, completedAt: '2026-01-02',
    });
    expect(res.status).toBe(200); // edit biasa tetap diperbolehkan...

    const list = await request(app).get('/api/data/incomingLetters').set('Authorization', admin);
    const updated = (list.body as any[]).find(l => l.id === letterId);
    expect(updated.status).toBe('Diterima'); // ...tapi status & disposisi tetap diabaikan
    expect(updated.disposisi).toBeUndefined();
    expect(updated.completedAt).toBeUndefined();
    expect(updated.subject).toBe('Surat Uji Coba Masuk (diedit)'); // field biasa tetap tersimpan
  });

  it('Operator (tanpa permission modul Surat Menyurat) tidak bisa mendisposisikan surat', async () => {
    const res = await request(app).put(`/api/incoming-letters/${letterId}/disposisikan`).set('Authorization', otherHeader).send({
      assignedToUserId: assigneeUserId, instruction: 'Tolong tindak lanjuti',
    });
    expect(res.status).toBe(403);
  });

  it('Tidak bisa tindak-lanjut sebelum didisposisikan (masih Diterima)', async () => {
    const res = await request(app).put(`/api/incoming-letters/${letterId}/tindak-lanjut`).set('Authorization', assigneeHeader).send({});
    expect(res.status).toBe(400);
  });

  it('Disposisikan (Diterima → Didisposisikan) oleh Majelis — tercatat di Log Aktivitas & notifikasi dibuat', async () => {
    const res = await request(app).put(`/api/incoming-letters/${letterId}/disposisikan`).set('Authorization', majelis).send({
      assignedToUserId: assigneeUserId, instruction: 'Tolong tindak lanjuti surat ini', dueDate: '2026-02-01',
    });
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/data/incomingLetters').set('Authorization', admin);
    const updated = (list.body as any[]).find(l => l.id === letterId);
    expect(updated.status).toBe('Didisposisikan');
    expect(updated.disposisi.assignedToUserId).toBe(assigneeUserId);
    expect(updated.disposisi.instruction).toBe('Tolong tindak lanjuti surat ini');

    const auditEntry = await findActivityLogEntry(app, admin, letterId, 'Didisposisikan');
    expect(auditEntry).not.toBeNull();
    expect(auditEntry.domain).toBe('Correspondence');

    const notifs = await findNotificationsFor(app, admin, assigneeUserId);
    expect(notifs.length).toBeGreaterThanOrEqual(1);
    expect(notifs[0].read).toBe(false);
  });

  it('PUT generik ditolak begitu status sudah Didisposisikan (bukan Diterima lagi)', async () => {
    const res = await request(app).put(`/api/data/incomingLetters/${letterId}`).set('Authorization', admin).send({
      id: letterId, subject: 'Coba edit langsung',
    });
    expect(res.status).toBe(403);
  });

  it('DELETE generik ditolak begitu status sudah Didisposisikan', async () => {
    const res = await request(app).delete(`/api/data/incomingLetters/${letterId}`).set('Authorization', admin);
    expect(res.status).toBe(403);
  });

  it('Disposisikan boleh dipanggil ulang selama masih Didisposisikan (koreksi penugasan)', async () => {
    const res = await request(app).put(`/api/incoming-letters/${letterId}/disposisikan`).set('Authorization', majelis).send({
      assignedToUserId: assigneeUserId, instruction: 'Instruksi diperbarui',
    });
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/data/incomingLetters').set('Authorization', admin);
    const updated = (list.body as any[]).find(l => l.id === letterId);
    expect(updated.disposisi.instruction).toBe('Instruksi diperbarui');
  });

  it('Staf lain (bukan assignee, tanpa izin modul) tidak bisa tindak-lanjut', async () => {
    const res = await request(app).put(`/api/incoming-letters/${letterId}/tindak-lanjut`).set('Authorization', otherHeader).send({});
    expect(res.status).toBe(403);
  });

  it('Assignee (Operator, tanpa izin modul) BOLEH tindak-lanjut — "assignee override"', async () => {
    const res = await request(app).put(`/api/incoming-letters/${letterId}/tindak-lanjut`).set('Authorization', assigneeHeader).send({
      followUpNotes: 'Sudah saya hubungi pihak terkait',
    });
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/data/incomingLetters').set('Authorization', admin);
    const updated = (list.body as any[]).find(l => l.id === letterId);
    expect(updated.status).toBe('DitindakLanjuti');
    expect(updated.followUpNotes).toBe('Sudah saya hubungi pihak terkait');

    const auditEntry = await findActivityLogEntry(app, admin, letterId, 'DitindakLanjuti');
    expect(auditEntry).not.toBeNull();
  });

  it('Disposisi terkunci setelah DitindakLanjuti — tidak bisa disposisikan ulang', async () => {
    const res = await request(app).put(`/api/incoming-letters/${letterId}/disposisikan`).set('Authorization', majelis).send({
      assignedToUserId: otherUserId, instruction: 'coba ganti',
    });
    expect(res.status).toBe(400);
  });

  it('Staf lain (bukan assignee) tidak bisa menyelesaikan surat', async () => {
    const res = await request(app).put(`/api/incoming-letters/${letterId}/selesai`).set('Authorization', otherHeader).send({});
    expect(res.status).toBe(403);
  });

  it('Assignee BOLEH menyelesaikan surat (assignee override) — DitindakLanjuti → Selesai', async () => {
    const res = await request(app).put(`/api/incoming-letters/${letterId}/selesai`).set('Authorization', assigneeHeader).send({});
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/data/incomingLetters').set('Authorization', admin);
    const updated = (list.body as any[]).find(l => l.id === letterId);
    expect(updated.status).toBe('Selesai');

    const auditEntry = await findActivityLogEntry(app, admin, letterId, 'Selesai');
    expect(auditEntry).not.toBeNull();
  });

  it('Arsipkan BUKAN assignee-gated — assignee tanpa izin modul tetap ditolak', async () => {
    const res = await request(app).put(`/api/incoming-letters/${letterId}/arsipkan`).set('Authorization', assigneeHeader).send({});
    expect(res.status).toBe(403);
  });

  it('Arsipkan (Selesai → Diarsipkan) oleh Majelis — tahap akhir alur kerja', async () => {
    const res = await request(app).put(`/api/incoming-letters/${letterId}/arsipkan`).set('Authorization', majelis).send({});
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/data/incomingLetters').set('Authorization', admin);
    const updated = (list.body as any[]).find(l => l.id === letterId);
    expect(updated.status).toBe('Diarsipkan');

    const auditEntry = await findActivityLogEntry(app, admin, letterId, 'Diarsipkan');
    expect(auditEntry).not.toBeNull();
  });

  it('Tidak ada aksi lanjutan yang mungkin setelah Diarsipkan', async () => {
    const res = await request(app).put(`/api/incoming-letters/${letterId}/tindak-lanjut`).set('Authorization', assigneeHeader).send({});
    expect(res.status).toBe(400);
  });
});
