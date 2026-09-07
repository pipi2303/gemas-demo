import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { checkModulePermission, METHOD_ACTION } from '../lib/permissionCache.js';
import { getAll } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const FINANCE_MODULE = 'Keuangan (Finance Add-on)';

/**
 * Permission gate untuk rute Finance Add-on (/api/v1/finance/**).
 * Berbeda dari requirePermission() di checkPermission.ts (yang berbasis nama
 * collection generic /api/data/:collection), rute finance memakai path REST
 * sendiri sehingga permission dicek langsung terhadap satu modul tetap:
 * "Keuangan (Finance Add-on)".
 */
export function requireFinancePermission(action?: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (role === 'Admin') { next(); return; }

    const resolvedAction = action ?? METHOD_ACTION[req.method] ?? 'view';

    try {
      const customRoles = await getAll<any>('customRoles').catch(() => []);
      const allowed = await checkModulePermission(role, FINANCE_MODULE, resolvedAction, customRoles);
      if (!allowed) {
        logger.warn('Finance permission denied', {
          user: req.user?.username, role, action: resolvedAction, path: req.path,
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
