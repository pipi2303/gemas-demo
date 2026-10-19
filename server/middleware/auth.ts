import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../lib/jwt.js';
import { isBlacklisted } from '../lib/tokenBlacklist.js';
import { getDemoGuestUser } from '../lib/demoGuest.js';
import { isUserIdExpired } from '../lib/accountExpiry.js';

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

function extractToken(req: AuthRequest): string | null {
  // 1. httpOnly cookie (preferred)
  if (req.cookies?.gemas_token) return req.cookies.gemas_token as string;
  // 2. Authorization header (backward compat)
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    // Mode tamu demo (lihat server/lib/demoGuest.ts)
    const guest = getDemoGuestUser();
    if (guest) {
      // Pengunjung Demo SELALU hanya-baca, apa pun isi izin role-nya: semua
      // request selain GET/HEAD/OPTIONS ditolak di sini (termasuk collection
      // yang tidak digate per halaman, mis. notifications).
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        res.status(403).json({ error: 'Mode demo hanya bisa melihat data. Silakan login untuk mengubah data.' });
        return;
      }
      req.user = guest; next(); return;
    }
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    req.user = verifyToken(token);
    if (req.user.jti && isBlacklisted(req.user.jti)) {
      res.status(401).json({ error: 'Token telah dicabut' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Token invalid atau kedaluwarsa' });
    return;
  }
  // Masa berlaku akun (users.expiresAt) — lihat server/lib/accountExpiry.ts
  if (await isUserIdExpired(req.user?.userId)) {
    res.clearCookie('gemas_token');
    res.status(401).json({ error: 'Masa berlaku akun sudah habis. Hubungi admin.', code: 'ACCOUNT_EXPIRED' });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Akses ditolak' });
      return;
    }
    next();
  };
}
