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
//
// Implementasinya sekarang cuma wrapper tipis di atas recordAuditEntry()
// (server/lib/auditLog.ts) — helper generik yang sama juga dipakai oleh
// server/routes/backup.ts untuk mencatat operasi Backup/Restore. Signature
// recordFinanceAudit() sengaja TIDAK diubah supaya ke-4 call site yang ada
// (financeBudget.ts, financePeriodClosing.ts, financeReconciliation.ts,
// financeTransaction.ts) tidak perlu disentuh.
// ============================================================

import { recordAuditEntry } from './auditLog.js';
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
  await recordAuditEntry(req, {
    action,
    domain: 'Financial',
    entityType,
    entityId,
    entityName,
    details,
    severity,
  });
}
