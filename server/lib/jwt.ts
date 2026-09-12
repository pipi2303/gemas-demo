import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export interface JWTPayload {
  userId: string;
  username: string;
  role: string;
  name: string;
  jti?: string;
}

// Security fix: sebelumnya fallback ke string hardcoded ini SELALU dipakai
// diam-diam kalau JWT_SECRET tidak di-set/terlalu pendek -- termasuk saat
// deploy production, cuma dengan warning log yang gampang terlewat. Karena
// string ini tertulis di source code (repo publik/pernah di-clone siapa
// pun), siapa pun yang punya salinan kode bisa memalsukan token login ATAU
// mendekripsi file backup (lihat server/routes/backup.ts yang memakai
// secret yang sama untuk enkripsi backup) kalau server produksi ternyata
// lupa set env var ini. Sekarang: production WAJIB set JWT_SECRET (>=32
// karakter) atau server menolak start sama sekali (lihat validateEnv() di
// server/index.ts yang memanggil getJwtSecret() saat startup) -- bukan lagi
// jalan diam-diam dengan kunci yang sudah diketahui publik. Di luar
// production (dev/test lokal, CI yang belum set env var), fallback ini
// tetap dipakai demi kenyamanan, dengan warning.
const DEV_FALLBACK_SECRET = 'gpib_bahtera_kasih_gemas_jwt_secret_key_2026_super_secure_32chars';

export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET wajib di-set (minimal 32 karakter) saat NODE_ENV=production -- ' +
      'server menolak start tanpa ini karena kunci fallback bawaan sudah tertulis ' +
      'terbuka di source code dan tidak aman dipakai untuk sign token login maupun ' +
      'enkripsi backup di lingkungan produksi.'
    );
  }
  return DEV_FALLBACK_SECRET;
}

function secret(): string {
  return getJwtSecret();
}

export function signToken(payload: JWTPayload): string {
  const jti = crypto.randomUUID();
  return jwt.sign({ ...payload, jti }, secret(), { expiresIn: '8h' });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, secret()) as JWTPayload;
}
