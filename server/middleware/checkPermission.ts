import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { checkPermission, COLLECTION_PAGE } from '../lib/permissionCache.js';
import { getAll } from '../lib/db.js';
import { logger } from '../lib/logger.js';

// Audit gap fix (User Management & Permission audit round): sebelumnya
// requirePermission() next() (LOLOS tanpa cek izin sama sekali) untuk SEMUA
// collection yang tidak terdaftar di COLLECTION_PAGE. Desain fail-open ini
// adalah AKAR PENYEBAB dari hampir seluruh bug RBAC bypass yang ditemukan
// berulang kali sepanjang audit sesi ini (wartas, liturgies, baptisms/sidis,
// churchAssets, assetLoanHistories, assetMaintenances, dst) -- setiap kali
// developer menambah collection baru tapi lupa mendaftarkannya di
// COLLECTION_PAGE, celahnya otomatis terbuka tanpa ada yang sadar sampai
// diaudit satu per satu.
//
// Dibalik jadi FAIL-CLOSED by default: collection yang tidak terdaftar dan
// tidak ada di NO_PAGE_GATING_COLLECTIONS sekarang DITOLAK (403), bukan
// diloloskan. Ini menutup risiko struktural untuk fitur BARU ke depan --
// tidak lagi bergantung pada kedisiplinan menambah entri baru setiap kali.
//
// NO_PAGE_GATING_COLLECTIONS: satu-satunya pengecualian yang disengaja.
// 'notifications' memang dipakai LINTAS semua role (reminder ulang tahun/
// jadwal ibadah dibuat otomatis oleh setiap user yang login, tidak terikat
// izin modul tertentu) -- yang menegakkan keamanannya bukan RBAC per
// halaman, melainkan guard kepemilikan per-notifikasi di
// server/routes/data.ts (filterTargetedNotifications/
// blockCrossUserNotificationWrite/blockNotificationOwnershipViolation).
const NO_PAGE_GATING_COLLECTIONS = new Set(['notifications']);

export function requirePermission() {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (role === 'Admin') { next(); return; }

    const collection = req.params.collection as string;
    if (collection && NO_PAGE_GATING_COLLECTIONS.has(collection)) { next(); return; }
    if (!collection || !(collection in COLLECTION_PAGE)) {
      logger.warn('Permission denied (collection tidak terdaftar / fail-closed)', {
        user: req.user?.username, role, collection, method: req.method,
      });
      res.status(403).json({ error: 'Akses ditolak untuk operasi ini' });
      return;
    }

    try {
      const customRoles = await getAll<any>('customRoles').catch(() => []);
      const allowed = await checkPermission(role, collection, req.method, customRoles);
      if (!allowed) {
        logger.warn('Permission denied', {
          user: req.user?.username, role, collection, method: req.method,
        });
        res.status(403).json({ error: 'Akses ditolak untuk operasi ini' });
        return;
      }
      next();
    } catch (err) {
      logger.error('Permission check error', { message: String(err) });
      res.status(500).json({ error: 'Gagal memverifikasi akses' });
    }
  };
}
