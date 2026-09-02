import { Router, Response } from 'express';
import crypto from 'crypto';
import { getAllCollectionCounts, truncateAll, getPool } from '../lib/db.js';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';

const ENCRYPTION_MARKER = 'GEMAS_ENC_V1:';

function getEncryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET || 'fallback';
  return crypto.scryptSync(secret, 'gemas-backup-salt', 32);
}

function encryptData(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ENCRYPTION_MARKER + Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptData(data: string): string {
  if (!data.startsWith(ENCRYPTION_MARKER)) return data; // not encrypted
  const key = getEncryptionKey();
  const buf = Buffer.from(data.slice(ENCRYPTION_MARKER.length), 'base64');
  const iv = buf.subarray(0, 16);
  const authTag = buf.subarray(16, 32);
  const encrypted = buf.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

const router = Router();

router.get('/counts', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const counts = await getAllCollectionCounts();
    res.json(counts);
  } catch (err) {
    logger.error('Backup counts error', { message: String(err) });
    res.status(500).json({ error: 'Gagal mengambil data' });
  }
});

// GET /api/backup/export — export semua data sebagai JSON
router.get('/export', requireAuth, requireRole('Admin'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await getPool().query<{ collection: string; id: string; data: string }>(
      'SELECT collection, id, data FROM gemas_store ORDER BY collection, updated_at ASC'
    );

    const grouped: Record<string, unknown[]> = {};
    for (const row of result.rows) {
      if (!grouped[row.collection]) grouped[row.collection] = [];
      grouped[row.collection].push(JSON.parse(row.data));
    }

    // Strip passwords dari export
    if (grouped.users) {
      grouped.users = (grouped.users as any[]).map(({ password: _pw, ...u }) => u);
    }

    const filename = `gemas-backup-${new Date().toISOString().slice(0, 10)}.json`;
    logger.info('Data exported', { user: req.user!.username, collections: Object.keys(grouped).length });
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), data: grouped });
    const encrypted = encryptData(payload);
    const encFilename = filename.replace('.json', '.enc.json');
    res.setHeader('Content-Disposition', `attachment; filename="${encFilename}"`);
    res.setHeader('Content-Type', 'text/plain');
    res.send(encrypted);
  } catch (err) {
    logger.error('Export error', { message: String(err) });
    res.status(500).json({ error: 'Gagal export data' });
  }
});

router.delete('/all', requireAuth, requireRole('Admin'), async (req: AuthRequest, res: Response) => {
  try {
    await truncateAll();
    logger.warn('All data truncated', { user: req.user!.username });
    res.json({ ok: true });
  } catch (err) {
    logger.error('Truncate all error', { message: String(err) });
    res.status(500).json({ error: 'Gagal reset data' });
  }
});

// POST /api/backup/restore — restore data dari backup JSON
router.post('/restore', requireAuth, requireRole('Admin'), async (req: AuthRequest, res: Response) => {
  const body = req.body as { data?: Record<string, unknown[]>; encrypted?: string; clearFirst?: boolean };

  let data: Record<string, unknown[]>;
  const clearFirst = body.clearFirst ?? true;

  if (body.encrypted) {
    try {
      const decrypted = decryptData(body.encrypted);
      const backup = JSON.parse(decrypted);
      data = backup.data;
    } catch {
      return res.status(400).json({ error: 'Gagal dekripsi backup. Pastikan backup dari server yang sama.' });
    }
  } else if (body.data) {
    data = body.data;
  } else {
    return res.status(400).json({ error: 'Format backup tidak valid' });
  }

  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Format backup tidak valid' });
  }

  const PROTECTED = ['users']; // jangan overwrite users agar akses tidak hilang
  const collections = Object.keys(data).filter(c => !PROTECTED.includes(c));

  try {
    const pool = getPool();
    await pool.query('BEGIN');

    if (clearFirst) {
      for (const col of collections) {
        await pool.query('DELETE FROM gemas_store WHERE collection = $1', [col]);
      }
    }

    let restored = 0;
    for (const col of collections) {
      const items = data[col] as any[];
      for (const item of items) {
        if (!item.id) continue;
        await pool.query(
          `INSERT INTO gemas_store (collection, id, data, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (collection, id)
           DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
          [col, item.id, JSON.stringify(item)]
        );
        restored++;
      }
    }

    await pool.query('COMMIT');
    logger.info('Data restored from backup', { user: req.user!.username, restored, collections: collections.length });
    res.json({ ok: true, restored, collections: collections.length });
  } catch (err) {
    await getPool().query('ROLLBACK').catch(() => {});
    logger.error('Restore error', { message: String(err) });
    res.status(500).json({ error: 'Gagal restore data' });
  }
});

export default router;
