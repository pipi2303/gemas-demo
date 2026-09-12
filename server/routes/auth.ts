import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { getAll, upsert } from '../lib/db.js';
import { signToken, verifyToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';
import { hashPassword, verifyPassword } from '../lib/passwordUtils.js';
import { blacklistToken } from '../lib/tokenBlacklist.js';

const COOKIE_NAME = 'gemas_token';
const COOKIE_MAX_AGE = 8 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: COOKIE_MAX_AGE,
  };
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
});

const router = Router();

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Input tidak valid' }); return; }

  const { username, password } = parsed.data;

  try {
    const users = await getAll<any>('users');
    const cleanUsername = username.trim().toLowerCase();
    const user = users.find((u: any) => u.username?.toLowerCase() === cleanUsername && u.isActive !== false);

    if (!user) { res.status(401).json({ error: 'Username atau password salah' }); return; }

    const { valid, needsUpgrade } = await verifyPassword(password, user.password);

    if (!valid) { res.status(401).json({ error: 'Username atau password salah' }); return; }

    // Auto-upgrade plaintext ke bcrypt
    if (needsUpgrade) {
      await upsert('users', user.id, { ...user, password: await hashPassword(password) });
    }

    const token = signToken({
      userId: user.id, username: user.username,
      role: user.role, name: user.name || user.fullName || user.username,
    });

    res.cookie(COOKIE_NAME, token, cookieOptions());
    const { password: _pw, ...safeUser } = user;
    logger.info('User logged in', { username: user.username, role: user.role });
    res.json({ token, user: safeUser });
  } catch (err) {
    logger.error('Login error', { message: String(err) });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  const token = req.cookies?.gemas_token || req.headers.authorization?.slice(7);
  if (token) {
    try {
      const payload = verifyToken(token);
      if (payload.jti) blacklistToken(payload.jti);
    } catch { /* token already invalid, ignore */ }
  }
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
  res.json({ ok: true });
});

// Audit gap fix: sebelumnya TIDAK ADA cara bagi user untuk mengganti password
// sendiri lewat aplikasi sama sekali -- satu-satunya jalan adalah Admin reset
// manual lewat menu User Management. Ini jadi krusial karena 16 user awal semua
// di-seed dengan password default pola "Nama123" (lihat scripts/seed-users-pg.mjs
// & seedDefaultUsersInMemory di server/lib/db.ts, field mustChangePassword: true)
// -- tanpa endpoint ini, password default itu tidak akan pernah benar-benar
// diganti oleh staf yang bersangkutan.
const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password baru minimal 8 karakter'),
});

router.put('/change-password', async (req: Request, res: Response) => {
  const token = req.cookies?.[COOKIE_NAME] || req.headers.authorization?.slice(7);
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const parsed = ChangePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Input tidak valid' });
    return;
  }
  const { currentPassword, newPassword } = parsed.data;

  try {
    const payload = verifyToken(token);
    const users = await getAll<any>('users');
    const user = users.find((u: any) => u.id === payload.userId && u.isActive !== false);
    if (!user) { res.status(401).json({ error: 'User tidak ditemukan' }); return; }

    // PENTING: 400, BUKAN 401 -- apiClient.ts men-treat semua respons 401 sebagai
    // sesi berakhir dan otomatis clearToken()/logout paksa (lihat request() di
    // src/lib/apiClient.ts). Salah ketik password saat ini bukan kegagalan sesi,
    // jadi harus tetap 400 supaya user tidak ter-logout diam-diam saat salah ketik.
    const { valid } = await verifyPassword(currentPassword, user.password);
    if (!valid) { res.status(400).json({ error: 'Password saat ini salah' }); return; }

    await upsert('users', user.id, {
      ...user,
      password: await hashPassword(newPassword),
      mustChangePassword: false,
    });

    logger.info('User changed own password', { username: user.username });
    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: 'Token invalid' });
  }
});

router.get('/me', async (req: Request, res: Response) => {
  const token = req.cookies?.[COOKIE_NAME] || req.headers.authorization?.slice(7);
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const payload = verifyToken(token);
    const users = await getAll<any>('users');
    const user = users.find((u: any) => u.id === payload.userId && u.isActive !== false);
    if (!user) { res.status(401).json({ error: 'User tidak ditemukan' }); return; }
    const { password: _pw, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch {
    res.status(401).json({ error: 'Token invalid' });
  }
});

export default router;
