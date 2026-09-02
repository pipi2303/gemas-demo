import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../lib/jwt.js';
import { isBlacklisted } from '../lib/tokenBlacklist.js';

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

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    req.user = verifyToken(token);
    if (req.user.jti && isBlacklisted(req.user.jti)) {
      res.status(401).json({ error: 'Token telah dicabut' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Token invalid atau kedaluwarsa' });
  }
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
