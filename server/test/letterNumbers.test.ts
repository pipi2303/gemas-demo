// Test integrasi terhadap PostgreSQL asli untuk endpoint atomik generate nomor
// surat (Fase 1 modul Surat Menyurat). Fokus utama test ini: MEMBUKTIKAN klaim
// "tidak ada nomor kembar walau submit bersamaan" — bukan cuma anggapan, tapi
// diuji dengan benar-benar menembak endpoint secara concurrent (Promise.all)
// dan memastikan setiap nomor yang dihasilkan unik & berurutan tanpa lompat
// atau tabrakan. Pola getTestApp()/authHeader() sama seperti test finance.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, uniqueCode } from './helpers.js';
import { getPool } from '../lib/db.js';

describe('POST /api/letters/number/generate — atomik, anti-duplikat', () => {
  let app: any;
  const admin = authHeader('tester-admin', { role: 'Admin' });
  const jenisSuratId = uniqueCode('test-jenis');

  beforeAll(async () => {
    app = await getTestApp();

    // Seed minimal: satu format nomor untuk satu jenis surat uji-coba.
    // SENGAJA TIDAK menyentuh orgLetterhead (id 'default') — itu singleton asli
    // yang harus tetap kosong untuk diisi user sendiri, bukan buat data test.
    const put = await request(app).put(`/api/data/letterNumberFormats/${jenisSuratId}`).set('Authorization', admin).send({
      id: jenisSuratId,
      jenisSuratId,
      pattern: '{urut:3}/TEST/{tahun}',
      resetPeriod: 'tidak_pernah',
    });
    expect(put.status).toBe(200);
  });

  afterAll(async () => {
    // Bersihkan semua jejak test — koleksi ini tampil langsung di halaman
    // Pengaturan Surat Menyurat yang baru dibangun, jadi tidak boleh ada sisa
    // data "test-jenis-..." nyangkut di sana.
    await request(app).delete(`/api/data/letterNumberFormats/${jenisSuratId}`).set('Authorization', admin);
    const pool = getPool();
    await pool.query(`DELETE FROM gemas_store WHERE collection = 'letterNumberCounters' AND id = $1`, [jenisSuratId]);
  });

  it('menolak jenis surat yang belum punya format nomor', async () => {
    const res = await request(app).post('/api/letters/number/generate').set('Authorization', admin).send({
      jenisSuratId: 'jenis-yang-tidak-pernah-diatur',
    });
    expect(res.status).toBe(400);
  });

  it('generate pertama menghasilkan urutan 1, format sesuai pattern', async () => {
    const res = await request(app).post('/api/letters/number/generate').set('Authorization', admin).send({ jenisSuratId });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.lastNumber).toBe(1);
    expect(res.body.letterNumber).toBe(`001/TEST/${new Date().getFullYear()}`);
  });

  it('generate kedua melanjutkan ke urutan 2 (counter persisten, bukan reset tiap call)', async () => {
    const res = await request(app).post('/api/letters/number/generate').set('Authorization', admin).send({ jenisSuratId });
    expect(res.status).toBe(200);
    expect(res.body.lastNumber).toBe(2);
  });

  it('20 request BERSAMAAN tidak menghasilkan satu pun nomor kembar (bukti FOR UPDATE bekerja)', async () => {
    const N = 20;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        request(app).post('/api/letters/number/generate').set('Authorization', admin).send({ jenisSuratId })
      )
    );
    for (const r of results) expect(r.status).toBe(200);

    const numbers = results.map(r => r.body.lastNumber as number);
    const uniqueNumbers = new Set(numbers);
    expect(uniqueNumbers.size).toBe(N); // tidak ada duplikat sama sekali

    // Berurutan tanpa lompat: sebelum test ini counter sudah di 2 (dari 2 test di atas),
    // jadi hasil kali ini harus persis {3, 4, ..., 22} — himpunan lengkap, bukan cuma unik.
    const sorted = [...numbers].sort((a, b) => a - b);
    const expected = Array.from({ length: N }, (_, i) => i + 3);
    expect(sorted).toEqual(expected);
  });
});
