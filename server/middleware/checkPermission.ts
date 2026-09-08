import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { checkPermission, COLLECTION_PAGE } from '../lib/permissionCache.js';
import { getAll } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export function requirePermission() {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (role === 'Admin') { next(); return; }

    const collection = req.params.collection as string;
    if (!collection || !(collection in COLLECTION_PAGE)) { next(); return; }

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
