// ============================================================
// FINANCE ADD-ON MODULE — Jejak Audit (Audit Trail)
// ============================================================
// Modul finance memakai SQL relasional langsung (bukan collection generik
// /api/data), jadi tidak lewat recordAuditLog() di server/routes/data.ts
// yang otomatis mencatat setiap create/update/delete collection ke
// activityLogs. Akibatnya aksi-aksi transisi status finance (submit,
// verifikasi, approve, reject, revisi, posting, pembalikan jurnal,
// aktivasi RKA, tutup/buka periode, selesai/setujui/batal rekonsiliasi)
// tidak pernah tercatat di halaman Log Aktivitas (ActivityLog.tsx) — hanya
// masuk ke server log (logger.info) yang sifatnya sementara dan tidak bisa
// di-query dari UI.
//
// Helper ini menulis entry dengan BENTUK YANG SAMA ke collection
// `activityLogs` yang sudah dipakai data.ts, supaya otomatis tampil &
// bisa difilter (per domain "Financial", per severity) di halaman Log
// Aktivitas yang sudah ada — tidak perlu tabel atau UI baru.
// ============================================================

import { upsert } from './db.js';
import { logger } from './logger.js';
import type { AuthRequest } from '../middleware/auth.js';

export type FinanceAuditSeverity = 'normal' | 'sensitive' | 'critical';

export async function recordFinanceAudit(
  req: AuthRequest,
  action: string,
  entityType: string,
  entityId: string,
  entityName: string,
  details: string,
  severity: FinanceAuditSeverity = 'sensitive'
): Promise<void> {
  const user = req.user;
  const userId = user?.userId || 'system';
  const userName = user?.name || user?.username || 'System';
  const userRole = user?.role || '-';
  const ipAddress =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  const logEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    userId,
    userName,
    userRole,
    action,
    domain: 'Financial' as const,
    entityType,
    entityId,
    entityName: String(entityName),
    timestamp: new Date().toISOString(),
    details,
    ipAddress,
    severity,
  };

  try {
    await upsert('activityLogs', logEntry.id, logEntry);
  } catch (err) {
    // Sengaja TIDAK dilempar ulang (aksi finance yang memicu ini -- posting,
    // approve, dst -- sudah berhasil & tidak boleh dibatalkan gara-gara jejak
    // auditnya gagal ditulis) tapi di-escalate ke logger.error (bukan warn)
    // supaya kehilangan 1 entri audit trail cukup terlihat oleh monitoring,
    // bukan cuma warning yang gampang tenggelam di log.
    logger.error('Failed to persist finance audit trail', {
      message: String(err), action, entityType, entityId, severity,
    });
  }
}
