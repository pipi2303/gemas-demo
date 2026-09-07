// ============================================================
// FINANCE ADD-ON MODULE — Test integrasi: Penutupan Periode
// ============================================================
// Test paling penting di sini adalah regression test gap #4: reopen periode
// yang lebih awal HARUS ditolak selama ada periode SETELAHNYA (di tahun
// fiskal yang sama) yang masih Ditutup/Terkunci (commit c8962da).
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, seedBaseFinanceData } from './helpers.js';

describe('Finance Period Closing — checklist & aturan reopen', () => {
  let app: any;
  let seed: Awaited<ReturnType<typeof seedBaseFinanceData>>;
  const admin = authHeader('user-admin-p');

  beforeAll(async () => {
    app = await getTestApp();
    seed = await seedBaseFinanceData(app, request, admin);
  });

  it('menolak close periode kalau checklist belum lengkap (budget belum direview)', async () => {
    const period = seed.periods[2];
    const closeRes = await request(app).put(`/api/v1/finance/period-closing/${period.id}/close`).set('Authorization', admin);
    expect(closeRes.status).toBe(400);
    expect(closeRes.body.error.code).toBe('CHECKLIST_INCOMPLETE');
  });

  it('menutup dua periode berurutan, lalu mencegah reopen periode awal selama periode setelahnya masih tertutup', async () => {
    const period1 = seed.periods[3];
    const period2 = seed.periods[4];

    // Centang review anggaran manual (satu-satunya item checklist yang butuh aksi manual
    // untuk periode kosong tanpa transaksi/bank/rekonsiliasi)
    await request(app).put(`/api/v1/finance/period-closing/${period1.id}/checklist`).set('Authorization', admin).send({ key: 'budget_reviewed', checked: true });
    await request(app).put(`/api/v1/finance/period-closing/${period2.id}/checklist`).set('Authorization', admin).send({ key: 'budget_reviewed', checked: true });

    const close1 = await request(app).put(`/api/v1/finance/period-closing/${period1.id}/close`).set('Authorization', admin);
    expect(close1.status).toBe(200);
    const close2 = await request(app).put(`/api/v1/finance/period-closing/${period2.id}/close`).set('Authorization', admin);
    expect(close2.status).toBe(200);

    // REGRESSION gap #4: reopen periode1 harus ditolak selama periode2 (setelahnya) masih CLOSED
    const reopen1Blocked = await request(app).put(`/api/v1/finance/period-closing/${period1.id}/reopen`).set('Authorization', admin).send({ reason: 'Koreksi data' });
    expect(reopen1Blocked.status).toBe(400);
    expect(reopen1Blocked.body.error.code).toBe('LATER_PERIOD_CLOSED');

    // Reopen periode2 (yang terakhir) dulu — ini harus berhasil
    const reopen2 = await request(app).put(`/api/v1/finance/period-closing/${period2.id}/reopen`).set('Authorization', admin).send({ reason: 'Koreksi data' });
    expect(reopen2.status).toBe(200);

    // Sekarang periode1 boleh dibuka kembali karena periode2 sudah OPEN lagi
    const reopen1Ok = await request(app).put(`/api/v1/finance/period-closing/${period1.id}/reopen`).set('Authorization', admin).send({ reason: 'Koreksi data' });
    expect(reopen1Ok.status).toBe(200);
  });

  it('reopen wajib mengisi alasan', async () => {
    const period = seed.periods[5];
    await request(app).put(`/api/v1/finance/period-closing/${period.id}/checklist`).set('Authorization', admin).send({ key: 'budget_reviewed', checked: true });
    await request(app).put(`/api/v1/finance/period-closing/${period.id}/close`).set('Authorization', admin);
    const noReason = await request(app).put(`/api/v1/finance/period-closing/${period.id}/reopen`).set('Authorization', admin).send({});
    expect(noReason.status).toBe(400);
  });
});
