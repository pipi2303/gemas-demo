import type { JWTPayload } from './jwt.js';
import { logger } from './logger.js';

// ── Mode tamu demo ────────────────────────────────────────────────────────────
// Kalau env DEMO_GUEST_ROLE diisi (mis. "Demo"), request TANPA token login tidak
// lagi ditolak 401 — server memperlakukannya sebagai "Pengunjung Demo" dengan
// role tersebut. Hak aksesnya tetap mengikuti role itu (Custom Role "Demo" =
// lihat saja, tanpa Admin Sistem), jadi pengunjung bisa menjelajah tanpa login
// tapi tidak bisa mengubah data. Login biasa (admin dst) tetap berfungsi.
// Kosongkan DEMO_GUEST_ROLE untuk mematikan mode ini (wajib di produksi asli).
// Demi keamanan, role 'Admin' tidak pernah dipakai sebagai role tamu.
export const DEMO_GUEST_ID = 'demo-guest';

let warned = false;
export function getDemoGuestUser(): JWTPayload | null {
  const role = (process.env.DEMO_GUEST_ROLE || '').trim();
  if (!role) return null;
  if (role === 'Admin') {
    if (!warned) { logger.warn('DEMO_GUEST_ROLE=Admin diabaikan — role tamu tidak boleh Admin'); warned = true; }
    return null;
  }
  return { userId: DEMO_GUEST_ID, username: 'demo', role, name: 'Pengunjung Demo' };
}
