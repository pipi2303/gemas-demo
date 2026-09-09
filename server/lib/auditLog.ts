// ============================================================
// Jejak Audit Generik — dipakai modul-modul yang TIDAK lewat
// recordAuditLog() di server/routes/data.ts (collection generik /api/data)
// ============================================================
// recordAuditLog() di data.ts otomatis mencatat create/update/delete per
// collection ke `activityLogs`, tapi cuma cocok untuk operasi CRUD 1
// entity/1 collection dengan before/after diff. Modul yang aksinya tidak
// berbentuk begitu (transisi status finance, atau operasi sistem seperti
// export/restore/reset seluruh database) butuh jalur sendiri yang tetap
// menulis ke koleksi `activityLogs` yang sama, supaya otomatis tampil &
// bisa difilter di halaman Log Aktivitas Sistem tanpa perlu tabel/UI baru.
//
// Dipakai oleh: server/lib/financeAudit.ts (domain 'Financial') dan
// server/routes/backup.ts (domain 'System', untuk export/restore/reset).
import { upsert } from './db.js';
import { logger } from './logger.js';
import type { AuthRequest } from '../middleware/auth.js';

export type AuditSeverity = 'normal' | 'sensitive' | 'critical';
export type AuditDomain = 'Member' | 'Financial' | 'Asset' | 'System' | 'Correspondence';

export async function recordAuditEntry(
  req: AuthRequest,
  params: {
    action: string;
    domain: AuditDomain;
    entityType: string;
    entityId: string;
    entityName: string;
    details: string;
    severity?: AuditSeverity;
  }
): Promise<void> {
  const { action, domain, entityType, entityId, entityName, details, severity = 'sensitive' } = params;
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
    domain,
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
    // Sengaja TIDAK dilempar ulang -- aksi yang memicu ini (posting finance,
    // export/restore backup, dst) sudah berhasil & tidak boleh dibatalkan
    // gara-gara jejak auditnya gagal ditulis -- tapi di-escalate ke
    // logger.error (bukan warn) supaya kehilangan 1 entri audit trail cukup
    // terlihat oleh monitoring, bukan cuma warning yang gampang tenggelam.
    logger.error('Failed to persist audit trail', {
      message: String(err), action, domain, entityType, entityId, severity,
    });
  }
}
