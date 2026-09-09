import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, uniqueCode } from './helpers.js';
import { getPool } from '../lib/db.js';

// findAuditEntry() di helpers.ts memakai raw SQL dengan nama collection sebagai
// STRING LITERAL (bukan placeholder $1) — pola yang TIDAK dikenali mockQuery()
// (server/lib/db.ts) saat berjalan tanpa Postgres asli (lihat catatan panjang di
// server/routes/letterNumbers.ts soal ini). Ini keterbatasan environment yang
// sudah ada SEBELUM Fase 2 (test finance yang juga memakai findAuditEntry, mis.
// financeBudget.test.ts, sama-sama gagal di sandbox ini karena alasan yang
// persis sama) — bukan sesuatu yang dipengaruhi kode Fase 2. Supaya test ini
// tetap benar-benar memverifikasi recordLetterAudit() menulis entry (bukan
// cuma "seharusnya"), dipakai jalur BACA yang SAMA dengan endpoint GET
// generik (/api/data/activityLogs → getAll() → pola SELECT ... WHERE
// collection = $1 yang DIKENALI mockQuery()), lalu difilter di sisi test.
async function findActivityLogEntry(app: any, adminHeader: string, entityId: string, action: string) {
  const res = await request(app).get('/api/data/activityLogs').set('Authorization', adminHeader);
  const rows = res.body as any[];
  return rows.find(r => r.entityId === entityId && r.action === action) || null;
}

// ============================================================
// MODUL SURAT-MENYURAT — Fase 2 (Surat Keluar, alur inti)
// ============================================================
// Integration test: menembak app Express sungguhan (getTestApp()) lewat
// supertest, bukan memanggil fungsi handler secara langsung — supaya routing,
// middleware requireAuth/requirePermission, DAN guard generik di data.ts
// (blockNonDraftOutgoingLetterWrite) ikut teruji, bukan cuma logic murni.
//
// Fixture jenis surat + format nomor dibuat sekali di beforeAll (lewat
// /api/data generik sebagai Admin), lalu dibersihkan di afterAll — mengikuti
// keputusan yang sama seperti server/test/letterNumbers.test.ts: area
// Surat Menyurat baru dibangun & sengaja dijaga tetap kosong sampai user
// mengisi sendiri, jadi test tidak boleh meninggalkan sampah di sana
// (beda dengan konvensi test Finance yang memang tidak membersihkan diri).

describe('Surat Keluar — alur kerja (server/routes/outgoingLetters.ts)', () => {
  let app: any;
  const admin = authHeader('tester-admin', { role: 'Admin' });
  const majelis = authHeader('tester-majelis-surat', { role: 'Majelis' });
  const operator = authHeader('tester-operator-surat', { role: 'Operator' });

  const jenisSuratId = uniqueCode('test-jenis-keluar');
  let letterId: string;

  beforeAll(async () => {
    app = await getTestApp();

    // Master Data: jenis surat dipakai testnya
    const md = await request(app).put(`/api/data/masterData/${jenisSuratId}`).set('Authorization', admin).send({
      id: jenisSuratId, category: 'jenis_surat_keluar', value: 'TEST', label: 'Jenis Surat Test', isActive: true, order: 999,
    });
    expect(md.status).toBe(200);

    // Format nomor untuk jenis surat ini (dibutuhkan tahap "Periksa")
    const fmt = await request(app).put(`/api/data/letterNumberFormats/${jenisSuratId}`).set('Authorization', admin).send({
      id: jenisSuratId, jenisSuratId, pattern: '{urut:3}/TESTSK/{tahun}', resetPeriod: 'tidak_pernah',
    });
    expect(fmt.status).toBe(200);
  });

  afterAll(async () => {
    await request(app).delete(`/api/data/masterData/${jenisSuratId}`).set('Authorization', admin);
    await request(app).delete(`/api/data/letterNumberFormats/${jenisSuratId}`).set('Authorization', admin);
    const pool = getPool();
    await pool.query(`DELETE FROM gemas_store WHERE collection = 'letterNumberCounters' AND id = $1`, [jenisSuratId]);
    if (letterId) {
      await pool.query(`DELETE FROM gemas_store WHERE collection = 'outgoingLetters' AND id = $1`, [letterId]);
    }
  });

  it('POST /api/data/outgoingLetters memaksa status Draft & membuang field tahap-lanjut walau client mengirimkannya', async () => {
    const res = await request(app).post('/api/data/outgoingLetters').set('Authorization', admin).send({
      id: uniqueCode('outl-test'),
      status: 'Ditandatangani', // client nakal mencoba lompat status — harus diabaikan server
      letterNumber: 'PALSU/999',
      jenisSuratId,
      letterDate: '2026-01-01',
      subject: 'Surat Uji Coba',
      recipientName: 'Jemaat Uji',
      body: 'Isi surat uji coba.',
      createdBy: 'tester-admin',
    });
    expect(res.status).toBe(200);
    letterId = res.body.id;

    const list = await request(app).get('/api/data/outgoingLetters').set('Authorization', admin);
    const created = (list.body as any[]).find(l => l.id === letterId);
    expect(created.status).toBe('Draft');
    expect(created.letterNumber).toBeUndefined();
  });

  it('Operator (tanpa permission Surat Menyurat) tidak bisa mengajukan surat', async () => {
    const res = await request(app).put(`/api/outgoing-letters/${letterId}/submit`).set('Authorization', operator).send({});
    expect(res.status).toBe(403);
  });

  it('PUT generik /api/data/outgoingLetters/:id tidak bisa menyelundupkan status/finalPdfData walau surat masih Draft', async () => {
    const res = await request(app).put(`/api/data/outgoingLetters/${letterId}`).set('Authorization', admin).send({
      id: letterId, jenisSuratId, letterDate: '2026-01-01', subject: 'Surat Uji Coba (diedit)',
      recipientName: 'Jemaat Uji', body: 'Isi surat uji coba.', createdBy: 'tester-admin',
      status: 'Ditandatangani', finalPdfData: 'AAAA', signedBy: 'tester-admin',
    });
    expect(res.status).toBe(200); // edit Draft biasa tetap diperbolehkan...

    const list = await request(app).get('/api/data/outgoingLetters').set('Authorization', admin);
    const updated = (list.body as any[]).find(l => l.id === letterId);
    expect(updated.status).toBe('Draft'); // ...tapi status & finalPdfData tetap diabaikan
    expect(updated.finalPdfData).toBeUndefined();
    expect(updated.subject).toBe('Surat Uji Coba (diedit)'); // field biasa tetap tersimpan
  });

  it('Tidak bisa Periksa surat yang masih Draft (harus Diajukan dulu)', async () => {
    const res = await request(app).put(`/api/outgoing-letters/${letterId}/periksa`).set('Authorization', majelis).send({});
    expect(res.status).toBe(400);
  });

  it('Ajukan (Draft → Diajukan) oleh Majelis, tercatat di Log Aktivitas', async () => {
    const res = await request(app).put(`/api/outgoing-letters/${letterId}/submit`).set('Authorization', majelis).send({});
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/data/outgoingLetters').set('Authorization', admin);
    const updated = (list.body as any[]).find(l => l.id === letterId);
    expect(updated.status).toBe('Diajukan');

    const auditEntry = await findActivityLogEntry(app, admin, letterId, 'Diajukan');
    expect(auditEntry).not.toBeNull();
    expect(auditEntry.domain).toBe('Correspondence');
  });

  it('PUT generik ditolak begitu status sudah Diajukan (bukan Draft lagi)', async () => {
    const res = await request(app).put(`/api/data/outgoingLetters/${letterId}`).set('Authorization', admin).send({
      id: letterId, subject: 'Coba edit langsung',
    });
    expect(res.status).toBe(403);
  });

  it('DELETE generik ditolak begitu status sudah Diajukan', async () => {
    const res = await request(app).delete(`/api/data/outgoingLetters/${letterId}`).set('Authorization', admin);
    expect(res.status).toBe(403);
  });

  it('Kembalikan (Diajukan → Draft) wajib alasan', async () => {
    const noReason = await request(app).put(`/api/outgoing-letters/${letterId}/kembalikan`).set('Authorization', majelis).send({});
    expect(noReason.status).toBe(400);

    const res = await request(app).put(`/api/outgoing-letters/${letterId}/kembalikan`).set('Authorization', majelis).send({ reason: 'Perihal kurang jelas' });
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/data/outgoingLetters').set('Authorization', admin);
    const updated = (list.body as any[]).find(l => l.id === letterId);
    expect(updated.status).toBe('Draft');
    expect(updated.rejectReason).toBe('Perihal kurang jelas');
  });

  it('Ajukan ulang lalu Periksa & Setujui (Diajukan → Diperiksa) — nomor surat ter-generate', async () => {
    const submit = await request(app).put(`/api/outgoing-letters/${letterId}/submit`).set('Authorization', majelis).send({});
    expect(submit.status).toBe(200);

    const periksa = await request(app).put(`/api/outgoing-letters/${letterId}/periksa`).set('Authorization', majelis).send({});
    expect(periksa.status).toBe(200);
    expect(periksa.body.letterNumber).toMatch(/^001\/TESTSK\/\d{4}$/);

    const list = await request(app).get('/api/data/outgoingLetters').set('Authorization', admin);
    const updated = (list.body as any[]).find(l => l.id === letterId);
    expect(updated.status).toBe('Diperiksa');
    expect(updated.letterNumber).toBe(periksa.body.letterNumber);

    const auditEntry = await findActivityLogEntry(app, admin, letterId, 'Diperiksa');
    expect(auditEntry).not.toBeNull();
  });

  it('Operator tidak bisa menandatangani (permission approve tidak dimiliki)', async () => {
    const res = await request(app).put(`/api/outgoing-letters/${letterId}/tandatangani`).set('Authorization', operator).send({
      finalPdfData: Buffer.from('%PDF-1.4 fake content for test').toString('base64'),
    });
    expect(res.status).toBe(403);
  });

  it('Tandatangani (Diperiksa → Ditandatangani) menolak data PDF yang tidak valid', async () => {
    const res = await request(app).put(`/api/outgoing-letters/${letterId}/tandatangani`).set('Authorization', majelis).send({
      finalPdfData: Buffer.from('BUKAN PDF SAMA SEKALI').toString('base64'),
    });
    expect(res.status).toBe(400);
  });

  it('Tandatangani (Diperiksa → Ditandatangani) berhasil dengan PDF valid, mengunci finalPdfData', async () => {
    const fakePdfBase64 = Buffer.from('%PDF-1.4 fake content for test').toString('base64');
    const res = await request(app).put(`/api/outgoing-letters/${letterId}/tandatangani`).set('Authorization', majelis).send({
      finalPdfData: fakePdfBase64,
    });
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/data/outgoingLetters').set('Authorization', admin);
    const updated = (list.body as any[]).find(l => l.id === letterId);
    expect(updated.status).toBe('Ditandatangani');
    expect(updated.finalPdfData).toBe(fakePdfBase64);

    const auditEntry = await findActivityLogEntry(app, admin, letterId, 'Ditandatangani');
    expect(auditEntry).not.toBeNull();
  });

  it('Tidak bisa Kembalikan lagi setelah Ditandatangani (immutable)', async () => {
    const res = await request(app).put(`/api/outgoing-letters/${letterId}/kembalikan`).set('Authorization', majelis).send({ reason: 'coba lagi' });
    expect(res.status).toBe(400);
  });

  it('Tandai Terkirim (Ditandatangani → Terkirim)', async () => {
    const res = await request(app).put(`/api/outgoing-letters/${letterId}/kirim`).set('Authorization', majelis).send({ sentVia: 'Email' });
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/data/outgoingLetters').set('Authorization', admin);
    const updated = (list.body as any[]).find(l => l.id === letterId);
    expect(updated.status).toBe('Terkirim');
    expect(updated.sentVia).toBe('Email');
  });

  it('Arsipkan (Terkirim → Diarsipkan) — tahap akhir alur kerja', async () => {
    const res = await request(app).put(`/api/outgoing-letters/${letterId}/arsipkan`).set('Authorization', majelis).send({});
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/data/outgoingLetters').set('Authorization', admin);
    const updated = (list.body as any[]).find(l => l.id === letterId);
    expect(updated.status).toBe('Diarsipkan');

    const auditEntry = await findActivityLogEntry(app, admin, letterId, 'Diarsipkan');
    expect(auditEntry).not.toBeNull();
  });

  it('Tidak ada aksi lanjutan yang mungkin setelah Diarsipkan', async () => {
    const res = await request(app).put(`/api/outgoing-letters/${letterId}/kirim`).set('Authorization', majelis).send({});
    expect(res.status).toBe(400);
  });
});
