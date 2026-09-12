// ============================================================
// Test integrasi: PUT /api/auth/change-password
// ============================================================
// Endpoint baru -- sebelumnya TIDAK ADA cara bagi user mengganti password
// sendiri lewat aplikasi sama sekali. Test ini memverifikasi jalur berhasil,
// jalur password saat ini salah (HARUS 400, bukan 401 -- lihat komentar di
// server/routes/auth.ts: apiClient.ts men-treat 401 sebagai sesi berakhir
// dan auto-logout, jadi salah ketik password tidak boleh memicu itu), dan
// validasi panjang minimum password baru.
// ============================================================
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getTestApp, uniqueCode } from './helpers.js';
import { hashPassword } from '../lib/passwordUtils.js';
import { signToken } from '../lib/jwt.js';

async function createUserDirect(app: any, overrides: Record<string, any> = {}) {
  // Dibuat langsung lewat helper request PUT /api/data/users/:id (bukan lewat
  // register -- tidak ada endpoint register) memakai token Admin terpisah,
  // supaya kita kontrol penuh field password (plaintext vs hash) untuk test.
  const adminToken = signToken({ userId: 'user-admin-setup-cp', username: 'admin-setup', name: 'Admin Setup', role: 'Admin' });
  const id = uniqueCode('user-cp');
  const plainPassword = 'PasswordLama123';
  const hashed = await hashPassword(plainPassword);
  const res = await request(app).put(`/api/data/users/${id}`).set('Authorization', `Bearer ${adminToken}`).send({
    id, name: 'User Ganti Password Test', username: id, password: hashed, role: 'Operator', isActive: true, mustChangePassword: true,
    ...overrides,
  });
  expect(res.status).toBe(200);
  return { id, plainPassword };
}

describe('PUT /api/auth/change-password', () => {
  it('berhasil ganti password dengan currentPassword yang benar (200)', async () => {
    const app = await getTestApp();
    const { id, plainPassword } = await createUserDirect(app);
    const userToken = signToken({ userId: id, username: id, name: 'User Ganti Password Test', role: 'Operator' });

    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Cookie', `gemas_token=${userToken}`)
      .send({ currentPassword: plainPassword, newPassword: 'PasswordBaru456' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Password lama tidak lagi berfungsi, password baru berhasil login
    const loginOld = await request(app).post('/api/auth/login').send({ username: id, password: plainPassword });
    expect(loginOld.status).toBe(401);

    const loginNew = await request(app).post('/api/auth/login').send({ username: id, password: 'PasswordBaru456' });
    expect(loginNew.status).toBe(200);
    expect(loginNew.body.user.mustChangePassword).toBe(false);
  });

  it('currentPassword salah ditolak dengan 400 (BUKAN 401, supaya tidak memicu auto-logout di apiClient.ts)', async () => {
    const app = await getTestApp();
    const { id } = await createUserDirect(app);
    const userToken = signToken({ userId: id, username: id, name: 'User Ganti Password Test', role: 'Operator' });

    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Cookie', `gemas_token=${userToken}`)
      .send({ currentPassword: 'PasswordSalahTotal', newPassword: 'PasswordBaru456' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Password saat ini salah/);
  });

  it('newPassword kurang dari 8 karakter ditolak dengan 400', async () => {
    const app = await getTestApp();
    const { id, plainPassword } = await createUserDirect(app);
    const userToken = signToken({ userId: id, username: id, name: 'User Ganti Password Test', role: 'Operator' });

    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Cookie', `gemas_token=${userToken}`)
      .send({ currentPassword: plainPassword, newPassword: 'pendek' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/minimal 8 karakter/);
  });

  it('tanpa token ditolak dengan 401', async () => {
    const app = await getTestApp();
    const res = await request(app).put('/api/auth/change-password').send({ currentPassword: 'x', newPassword: 'PasswordBaru456' });
    expect(res.status).toBe(401);
  });
});
