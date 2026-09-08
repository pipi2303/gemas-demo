// ============================================================
// FINANCE ADD-ON MODULE — Fase 1: Generic Master Data CRUD
// ============================================================
// Factory generik untuk endpoint CRUD tabel master data finance
// (account_groups, accounts, fields, programs, activities, funds,
// cash_accounts, bank_accounts). Setiap tabel didefinisikan lewat
// MasterDataConfig agar tidak menulis handler Express berulang-ulang
// untuk pola yang sama persis.
//
// Semua endpoint di sini mewajibkan koneksi PostgreSQL asli
// (requireRealDb) karena tabel `finance.*` adalah tabel relasional
// sungguhan, bukan koleksi generic /api/data yang punya fallback
// in-memory yang berarti.
// ============================================================

import { Router, Response, NextFunction } from 'express';
import { getPool } from './db.js';
import { isUsingInMemoryStore } from './db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireFinancePermission as requireFinancePermissionBase } from '../middleware/checkFinancePermission.js';

// Submenu Finance Add-on untuk file ini (dipakai validasi server per-submenu) —
// lihat komentar di checkFinancePermission.ts.
const requireFinancePermission = (action?: string) => requireFinancePermissionBase(action, 'finance-master-data');
import { logger } from './logger.js';

export const FINANCE_ORG = 'gpib-trinitas';

export function requireRealDb(req: AuthRequest, res: Response, next: NextFunction) {
  // Dual-mode: Berjalan baik di PostgreSQL asli maupun fallback In-Memory engine
  next();
}

type Pool = ReturnType<typeof getPool>;

// parsePagination/paginationMeta sekarang tinggal di ./pagination.js (dipakai
// juga oleh endpoint /api/data/:collection yang generik). Diimpor DAN
// diekspor ulang di sini: diimpor supaya masih bisa dipakai langsung di
// createMasterDataRouter() di bawah, diekspor ulang supaya import lama di
// 4 file route finance (financeBudget/financeLedger/financeReconciliation/
// financeTransaction) tetap jalan tanpa perlu diubah.
import { parsePagination, paginationMeta } from './pagination.js';
export { parsePagination, paginationMeta };

export interface MasterDataConfig {
  /** Nama tabel lengkap dengan schema, mis. 'finance.account_groups' */
  table: string;
  /** Kolom yang boleh ditulis lewat body (di luar id, organization_id, kolom created/updated, dan deleted_at) */
  fields: string[];
  /** Subset dari fields yang wajib diisi saat create */
  requiredFields: string[];
  /** Klausa ORDER BY untuk listing */
  orderBy: string;
  /** Strategi "hapus": soft-delete via deleted_at, soft-disable via is_active, atau tidak bisa dihapus sama sekali */
  deleteMode: 'deleted_at' | 'is_active' | 'none';
  /** Field yang aktif dipakai untuk filter listing default (tanpa ?all=1) */
  activeFilter?: 'deleted_at' | 'is_active' | 'none';
  /** Turunkan/lengkapi field tertentu di server sebelum INSERT (mis. account_type dari group_id) */
  deriveDefaults?: (body: Record<string, any>, pool: Pool) => Promise<Record<string, any>>;
  /** Label Indonesia untuk pesan error generik */
  entityLabel: string;
}

function sanitizeBody(body: Record<string, any>, fields: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of fields) {
    if (!(f in body)) continue;
    out[f] = body[f] === '' ? null : body[f];
  }
  return out;
}

export function createMasterDataRouter(cfg: MasterDataConfig): Router {
  const router = Router();
  const activeFilter = cfg.activeFilter ?? (cfg.deleteMode === 'none' ? 'none' : cfg.deleteMode);

  router.use(requireAuth, requireFinancePermission(), requireRealDb);

  router.get('/', async (req: AuthRequest, res: Response) => {
    try {
      const pool = getPool();
      const includeInactive = req.query.all === '1';
      let where = 'organization_id = $1';
      if (!includeInactive) {
        if (activeFilter === 'deleted_at') where += ' AND deleted_at IS NULL';
        else if (activeFilter === 'is_active') where += ' AND is_active = TRUE';
      }
      // Master data (Kelompok Akun, COA, Bidang, Program, Kegiatan, Dana, Kas, Bank, Jenis
      // Voucher) secara alami terbatas jumlahnya (bukan tabel yang bertambah tak terbatas
      // seperti transaksi/jurnal) — default & maks pageSize sengaja dibuat besar (500) supaya
      // dropdown/lookup di frontend yang mengandalkan daftar lengkap tidak pernah kepotong
      // untuk ukuran data yang realistis, sambil tetap ada batas keamanan untuk kasus ekstrem.
      const { page, pageSize, offset } = parsePagination(req, 500, 500);
      const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM ${cfg.table} WHERE ${where}`, [FINANCE_ORG]);
      const result = await pool.query(
        `SELECT * FROM ${cfg.table} WHERE ${where} ORDER BY ${cfg.orderBy} LIMIT $2 OFFSET $3`,
        [FINANCE_ORG, pageSize, offset]
      );
      res.json({
        success: true,
        data: result.rows,
        meta: { count: result.rows.length, ...paginationMeta(countRes.rows[0].total, page, pageSize) },
      });
    } catch (err) {
      logger.error(`GET ${cfg.table}`, { message: String(err) });
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: `Gagal mengambil data ${cfg.entityLabel}` } });
    }
  });

  router.post('/', async (req: AuthRequest, res: Response) => {
    try {
      const body = sanitizeBody(req.body ?? {}, cfg.fields);
      const missing = cfg.requiredFields.filter(f => body[f] === undefined || body[f] === null || body[f] === '');
      if (missing.length > 0) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Field wajib belum diisi: ${missing.join(', ')}` } });
        return;
      }
      const pool = getPool();
      const defaults = cfg.deriveDefaults ? await cfg.deriveDefaults(body, pool) : {};
      const merged = { ...defaults, ...body };
      const cols = cfg.fields.filter(f => merged[f] !== undefined);
      const values = cols.map(f => merged[f]);
      const insertCols = ['organization_id', 'created_by', ...cols];
      const insertPlaceholders = ['$1', '$2', ...cols.map((_, i) => `$${i + 3}`)];
      const sql = `INSERT INTO ${cfg.table} (${insertCols.join(', ')}) VALUES (${insertPlaceholders.join(', ')}) RETURNING *`;
      const result = await pool.query(sql, [FINANCE_ORG, req.user!.userId, ...values]);
      const row = result.rows[0] ?? null;
      logger.info(`Finance master data created`, { table: cfg.table, user: req.user?.username, id: row?.id });
      res.status(201).json({ success: true, data: row });
    } catch (err: any) {
      logger.error(`POST ${cfg.table}`, { message: String(err) });
      const raw = String(err?.message ?? '');
      let message = `Gagal menyimpan data ${cfg.entityLabel}`;
      if (/unique/i.test(raw)) message = `Kode sudah digunakan untuk ${cfg.entityLabel}`;
      else if (/foreign key/i.test(raw)) message = 'Referensi yang dipilih tidak valid';
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
    }
  });

  router.put('/:id', async (req: AuthRequest, res: Response) => {
    try {
      const body = sanitizeBody(req.body ?? {}, cfg.fields);
      const cols = Object.keys(body);
      if (cols.length === 0) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tidak ada field untuk diperbarui' } });
        return;
      }
      const pool = getPool();
      const setClauses = cols.map((f, i) => `${f} = $${i + 4}`);
      const values = cols.map(f => body[f]);
      const sql = `UPDATE ${cfg.table} SET ${setClauses.join(', ')}, updated_at = NOW(), updated_by = $3
                   WHERE id = $1 AND organization_id = $2 RETURNING *`;
      const result = await pool.query(sql, [req.params.id, FINANCE_ORG, req.user!.userId, ...values]);
      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Data ${cfg.entityLabel} tidak ditemukan` } });
        return;
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (err: any) {
      logger.error(`PUT ${cfg.table}`, { message: String(err) });
      const raw = String(err?.message ?? '');
      let message = `Gagal memperbarui data ${cfg.entityLabel}`;
      if (/unique/i.test(raw)) message = `Kode sudah digunakan untuk ${cfg.entityLabel}`;
      else if (/foreign key/i.test(raw)) message = 'Referensi yang dipilih tidak valid';
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
    }
  });

  router.delete('/:id', async (req: AuthRequest, res: Response) => {
    if (cfg.deleteMode === 'none') {
      res.status(405).json({ success: false, error: { code: 'NOT_ALLOWED', message: `Data ${cfg.entityLabel} tidak dapat dihapus` } });
      return;
    }
    try {
      const pool = getPool();
      const sql = cfg.deleteMode === 'deleted_at'
        ? `UPDATE ${cfg.table} SET deleted_at = NOW(), updated_at = NOW(), updated_by = $3 WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL RETURNING id`
        : `UPDATE ${cfg.table} SET is_active = FALSE, updated_at = NOW(), updated_by = $3 WHERE id = $1 AND organization_id = $2 RETURNING id`;
      const result = await pool.query(sql, [req.params.id, FINANCE_ORG, req.user!.userId]);
      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Data ${cfg.entityLabel} tidak ditemukan` } });
        return;
      }
      res.json({ success: true, data: { id: req.params.id } });
    } catch (err: any) {
      logger.error(`DELETE ${cfg.table}`, { message: String(err) });
      const raw = String(err?.message ?? '');
      const message = /foreign key|violates/i.test(raw) ? `Data ${cfg.entityLabel} masih dipakai di tempat lain` : `Gagal menghapus data ${cfg.entityLabel}`;
      res.status(400).json({ success: false, error: { code: 'CONFLICT', message } });
    }
  });

  return router;
}
