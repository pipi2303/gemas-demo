import { Router, Response } from 'express';
import { getAll, upsert } from '../lib/db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';
import { invalidateCache } from '../lib/permissionCache.js';

const router = Router();
const COL = 'rbac_permissions';
const ID  = 'matrix';

router.get('/', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await getAll<{ id: string; matrix: unknown }>(COL);
    const found = rows.find((r: any) => r.id === ID);
    res.json(found ? (found as any).matrix : null);
  } catch (err) {
    logger.error('GET permissions', { message: String(err) });
    res.status(500).json({ error: 'Gagal mengambil permissions' });
  }
});

router.put('/', requireAuth, async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== 'Admin') {
    res.status(403).json({ error: 'Akses ditolak' });
    return;
  }
  if (!Array.isArray(req.body)) {
    res.status(400).json({ error: 'Format tidak valid' });
    return;
  }
  try {
    await upsert(COL, ID, { id: ID, matrix: req.body });
    invalidateCache(); // Force permission cache refresh segera
    logger.info('Permissions updated', { user: req.user?.username });
    res.json({ ok: true });
  } catch (err) {
    logger.error('PUT permissions', { message: String(err) });
    res.status(500).json({ error: 'Gagal menyimpan permissions' });
  }
});

export default router;
