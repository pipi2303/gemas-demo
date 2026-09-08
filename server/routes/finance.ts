import { Router, Response } from 'express';
import { getPool, isUsingInMemoryStore } from '../lib/db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireFinancePermission as requireFinancePermissionBase } from '../middleware/checkFinancePermission.js';

// Submenu Finance Add-on untuk file ini (dipakai validasi server per-submenu) —
// lihat komentar di checkFinancePermission.ts.
const requireFinancePermission = (action?: string) => requireFinancePermissionBase(action, 'finance-addon');
import { logger } from '../lib/logger.js';

const router = Router();

/**
 * GET /api/v1/finance/status
 * Mengembalikan status registrasi modul Finance Add-on: apakah skema sudah
 * aktif (butuh koneksi PostgreSQL asli — tidak berjalan di in-memory
 * fallback) dan jumlah data rujukan (account_groups, voucher_types) hasil
 * seed Fase 0.
 */
router.get('/status', requireAuth, requireFinancePermission('view'), async (req: AuthRequest, res: Response) => {
  const inMemory = isUsingInMemoryStore();

  if (inMemory) {
    res.json({
      success: true,
      data: {
        schemaReady: false,
        mode: 'in-memory',
        accountGroups: 0,
        voucherTypes: 0,
      },
      meta: { timestamp: new Date().toISOString() },
    });
    return;
  }

  try {
    const pool = getPool();
    const [groupsResult, typesResult] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM finance.account_groups'),
      pool.query('SELECT COUNT(*)::int AS count FROM finance.voucher_types'),
    ]);
    res.json({
      success: true,
      data: {
        schemaReady: true,
        mode: 'postgresql',
        accountGroups: groupsResult.rows[0]?.count ?? 0,
        voucherTypes: typesResult.rows[0]?.count ?? 0,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error('GET /api/v1/finance/status', { message: String(err) });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Gagal memeriksa status skema Finance Add-on' },
    });
  }
});

export default router;
