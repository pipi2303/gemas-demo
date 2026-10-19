import { getAll } from './db.js';

// ── Masa berlaku akun (field users.expiresAt) ─────────────────────────────────
// expiresAt disimpan sebagai tanggal 'YYYY-MM-DD' (input <input type="date"> di
// List User). Akun berlaku SAMPAI AKHIR hari itu waktu WIB (23:59:59 +07:00);
// kosong/undefined = tanpa batas. Setelah lewat: login ditolak, /api/auth/me
// 401, dan token yang masih beredar ditolak requireAuth (cek lewat cache 30 dtk
// supaya tidak query DB tiap request).

export function expiryInstant(expiresAt: unknown): Date | null {
  if (typeof expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return null;
  const d = new Date(`${expiresAt}T23:59:59+07:00`);
  return isNaN(d.getTime()) ? null : d;
}

export function isAccountExpired(user: { expiresAt?: unknown } | null | undefined, now = new Date()): boolean {
  const end = expiryInstant(user?.expiresAt);
  return !!end && now.getTime() > end.getTime();
}

let cache: { at: number; byId: Map<string, string | undefined> } | null = null;
const TTL_MS = 30_000;

/** true kalau userId punya expiresAt yang sudah lewat (pakai cache 30 detik). */
export async function isUserIdExpired(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const users = await getAll<any>('users').catch(() => [] as any[]);
    cache = { at: Date.now(), byId: new Map(users.map((u: any) => [u.id, u.expiresAt])) };
  }
  return isAccountExpired({ expiresAt: cache.byId.get(userId) });
}

/** Panggil setelah data user diubah supaya perubahan expiresAt langsung berlaku. */
export function invalidateExpiryCache() { cache = null; }
