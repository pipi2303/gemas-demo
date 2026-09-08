import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { checkPagePermission, METHOD_ACTION } from '../lib/permissionCache.js';
import { getAll } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const FINANCE_MODULE = 'Keuangan (Finance Add-on)';

/**
 * Permission gate untuk rute Finance Add-on (/api/v1/finance/**).
 * Berbeda dari requirePermission() di checkPermission.ts (yang berbasis nama
 * collection generic /api/data/:collection), rute finance memakai path REST
 * sendiri.
 *
 * `page` (opsional) adalah id submenu Finance Add-on (mis. 'finance-budget',
 * 'finance-transaction') supaya validasi granular per submenu, bukan cuma satu
 * modul "Keuangan (Finance Add-on)" untuk semua 9 submenu. Tiap file route
 * finance*.ts membuat alias lokal yang sudah mengisi page ini (lihat komentar
 * di masing-masing file) — kalau suatu saat ada pemanggilan tanpa page (lupa
 * di-alias), fallback ke perilaku lama: cek terhadap modul "Keuangan (Finance
 * Add-on)" secara keseluruhan, supaya tidak diam-diam menolak akses.
 */
export function requireFinancePermission(action?: string, page?: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (role === 'Admin') { next(); return; }

    const resolvedAction = action ?? METHOD_ACTION[req.method] ?? 'view';
    const resolvedPage = page ?? FINANCE_MODULE;

    try {
      const customRoles = await getAll<any>('customRoles').catch(() => []);
      const allowed = await checkPagePermission(role, resolvedPage, resolvedAction, customRoles);
      if (!allowed) {
        logger.warn('Finance permission denied', {
          user: req.user?.username, role, action: resolvedAction, page: resolvedPage, path: req.path,
        });
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Akses ditolak untuk operasi ini' } });
        return;
      }
      next();
    } catch (err) {
      logger.error('Finance permission check error', { message: String(err) });
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gagal memverifikasi akses' } });
    }
  };
}
