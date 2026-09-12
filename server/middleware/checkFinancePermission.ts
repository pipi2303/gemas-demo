import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { checkPagePermission, checkAnyPagePermission, METHOD_ACTION } from '../lib/permissionCache.js';
import { getAll } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const FINANCE_MODULE = 'Keuangan (Finance Add-on)';

// Semua id submenu Finance Add-on -- dipakai requireAnyFinancePermission() di bawah
// untuk endpoint referensi bersama (mis. daftar Tahun Fiskal) yang dipanggil oleh
// hampir semua submenu, bukan cuma satu submenu tertentu.
const ALL_FINANCE_PAGES = [
  'finance-dashboard', 'finance-master-data', 'finance-budget', 'finance-transaction',
  'finance-approval', 'finance-ledger', 'finance-reconciliation', 'finance-period-closing',
  'finance-reports',
];

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

/**
 * Audit gap fix: varian requireFinancePermission() khusus endpoint REFERENSI
 * BERSAMA yang dipanggil banyak submenu Finance Add-on sekaligus (mis. daftar
 * Tahun Fiskal dipanggil dari Dashboard, Budget, Transaksi, GL, Rekonsiliasi,
 * Penutupan Periode, Laporan, dan Master Data). Sebelumnya endpoint semacam ini
 * digating ke SATU submenu spesifik (mis. 'finance-master-data'), jadi Custom
 * Role yang cuma dikasih akses submenu lain (mis. cuma 'finance-dashboard')
 * kena 403 padahal cuma butuh baca daftar Tahun Fiskal untuk dropdown. Lolos
 * kalau role punya `action` di SALAH SATU dari 9 submenu Finance Add-on.
 */
export function requireAnyFinancePermission(action?: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (role === 'Admin') { next(); return; }

    const resolvedAction = action ?? METHOD_ACTION[req.method] ?? 'view';

    try {
      const customRoles = await getAll<any>('customRoles').catch(() => []);
      const allowed = await checkAnyPagePermission(role, ALL_FINANCE_PAGES, resolvedAction, customRoles);
      if (!allowed) {
        logger.warn('Finance permission denied (shared reference endpoint)', {
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
