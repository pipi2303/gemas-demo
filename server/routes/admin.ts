import { Router, Response } from 'express';
import { getAll, batchUpsert, upsert, getPool } from '../lib/db.js';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';

const router = Router();

const ROLE_MAP: Record<string, string> = {
  'Kepala Keluarga': 'KK',
  'Istri/Suami':     'IS',
  'Anak':            'AN',
  'Cucu':            'CU',
  'Keponakan':       'KA',
  'Orang Tua':       'OT',
  'Famili':          'FA',
};
const HEAD_ROLES = new Set(['KK', 'Kepala Keluarga']);

type SyncResult = { familiesCreated: number; rolesNormalized: number; sectorsUpdated: number };

async function runSync(): Promise<SyncResult> {
  const now = new Date().toISOString();
  const [members, families, sectors] = await Promise.all([
    getAll<any>('members'),
    getAll<any>('families'),
    getAll<any>('sectors'),
  ]);

  const familyIds = new Set(families.map((f: any) => f.id as string));
  const groups = new Map<string, any[]>();
  for (const m of members) {
    if (m.familyId && !familyIds.has(m.familyId)) {
      if (!groups.has(m.familyId)) groups.set(m.familyId, []);
      groups.get(m.familyId)!.push(m);
    }
  }

  const batchItems: { collection: string; id: string; data: unknown }[] = [];

  let familiesCreated = 0;
  for (const [fid, mlist] of groups.entries()) {
    const head = mlist.find(m => HEAD_ROLES.has(m.familyRole)) ?? mlist[0];
    const fam = {
      id: fid,
      headOfFamily: head.familyName || head.fullName || '',
      headMemberId: head.id,
      sectorId: head.sectorId || '',
      address: head.address || '',
      memberCount: mlist.length,
      members: mlist.map((m: any) => m.id),
      createdAt: now,
      updatedAt: now,
    };
    batchItems.push({ collection: 'families', id: fid, data: fam });
    familiesCreated++;
  }

  let rolesNormalized = 0;
  for (const m of members) {
    if (m.familyRole && ROLE_MAP[m.familyRole]) {
      batchItems.push({
        collection: 'members',
        id: m.id,
        data: { ...m, familyRole: ROLE_MAP[m.familyRole], updatedAt: now },
      });
      rolesNormalized++;
    }
  }

  const sectorCounts: Record<string, number> = {};
  for (const m of members) {
    if (m.sectorId) sectorCounts[m.sectorId] = (sectorCounts[m.sectorId] ?? 0) + 1;
  }
  let sectorsUpdated = 0;
  for (const s of sectors) {
    const actual = sectorCounts[s.id] ?? 0;
    if (s.memberCount !== actual) {
      batchItems.push({
        collection: 'sectors',
        id: s.id,
        data: { ...s, memberCount: actual, updatedAt: now },
      });
      sectorsUpdated++;
    }
  }

  await batchUpsert(batchItems);
  return { familiesCreated, rolesNormalized, sectorsUpdated };
}

async function writeAuditLog(userId: string, username: string, action: string, meta: Record<string, unknown>) {
  const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await upsert('audit_logs', id, {
    id, userId, username, action, meta,
    timestamp: new Date().toISOString(),
  });
}

// POST /api/admin/sync
router.post('/sync', requireAuth, requireRole('Admin'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await runSync();
    await writeAuditLog(req.user!.userId, req.user!.username, 'sync', result);
    logger.info('Admin sync executed', { user: req.user!.username, ...result });
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error('Sync error', { user: req.user?.username, message: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// POST /api/admin/members/import
router.post('/members/import', requireAuth, requireRole('Admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { members: incoming }: { members: any[] } = req.body;
    if (!Array.isArray(incoming) || incoming.length === 0) {
      res.status(400).json({ ok: false, error: 'No members provided' });
      return;
    }

    const now = new Date().toISOString();
    const existing = await getAll<any>('members');
    const byNum  = new Map(existing.map(m => [String(m.memberNumber ?? '').toLowerCase(), true]));
    const byName = new Map(existing.map(m => [String(m.fullName ?? '').toLowerCase(), true]));

    const toInsert: any[] = [];
    let duplicates = 0;
    for (const raw of incoming) {
      const numKey  = String(raw.memberNumber ?? '').toLowerCase();
      const nameKey = String(raw.fullName ?? '').toLowerCase();
      if ((numKey && byNum.has(numKey)) || (nameKey && byName.has(nameKey))) {
        duplicates++;
        continue;
      }
      const id = `m${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      toInsert.push({ ...raw, id, createdAt: now, updatedAt: now });
      if (numKey)  byNum.set(numKey, true);
      if (nameKey) byName.set(nameKey, true);
    }

    if (toInsert.length > 0) {
      await batchUpsert(toInsert.map(m => ({ collection: 'members', id: m.id, data: m })));
    }

    const syncResult = await runSync();
    await writeAuditLog(req.user!.userId, req.user!.username, 'members_import', {
      imported: toInsert.length, duplicates, ...syncResult,
    });
    logger.info('Members imported', { user: req.user!.username, imported: toInsert.length, duplicates });
    res.json({ ok: true, imported: toInsert.length, duplicates, ...syncResult });
  } catch (err) {
    logger.error('Batch import error', { user: req.user?.username, message: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// DELETE /api/admin/members/:id — hapus member beserta data sakramen terkait (atomic)
router.delete('/members/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const pool = getPool();
  try {
    await pool.query('BEGIN');

    // Hapus member
    await pool.query('DELETE FROM gemas_store WHERE collection = $1 AND id = $2', ['members', id]);

    // Hapus sakramen terkait (berdasarkan memberId dalam data JSON)
    const sacramentCollections = ['baptisms', 'sidis', 'attestations'];
    for (const col of sacramentCollections) {
      await pool.query(
        `DELETE FROM gemas_store WHERE collection = $1 AND data::jsonb->>'memberId' = $2`,
        [col, id]
      );
    }

    await pool.query('COMMIT');
    logger.info('Member deleted atomically', { memberId: id, user: req.user?.username });
    res.json({ ok: true });
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    logger.error('Atomic member delete error', { message: String(err) });
    res.status(500).json({ error: 'Gagal menghapus member' });
  }
});

export default router;
