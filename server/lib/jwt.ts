import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export interface JWTPayload {
  userId: string;
  username: string;
  role: string;
  name: string;
  jti?: string;
}

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (s && s.length >= 32) return s;
  return 'gpib_bahtera_kasih_gemas_jwt_secret_key_2026_super_secure_32chars';
}

export function signToken(payload: JWTPayload): string {
  const jti = crypto.randomUUID();
  return jwt.sign({ ...payload, jti }, secret(), { expiresIn: '8h' });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, secret()) as JWTPayload;
}
