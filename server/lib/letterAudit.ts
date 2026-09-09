// ============================================================
// MODUL SURAT-MENYURAT — Jejak Audit (Audit Trail)
// ============================================================
// Wrapper tipis di atas recordAuditEntry() (server/lib/auditLog.ts), persis
// pola recordFinanceAudit() di server/lib/financeAudit.ts — supaya transisi
// status Surat Keluar (Diajukan/Kembalikan/Diperiksa/Ditandatangani/Terkirim/
// Diarsipkan) otomatis tercatat & bisa difilter di halaman Log Aktivitas
// (domain 'Correspondence'), bukan cuma masuk ke server log yang sementara.
import { recordAuditEntry } from './auditLog.js';
import type { AuditSeverity } from './auditLog.js';
import type { AuthRequest } from '../middleware/auth.js';

export async function recordLetterAudit(
  req: AuthRequest,
  action: string,
  entityType: string,
  entityId: string,
  entityName: string,
  details: string,
  severity: AuditSeverity = 'sensitive'
): Promise<void> {
  await recordAuditEntry(req, {
    action,
    domain: 'Correspondence',
    entityType,
    entityId,
    entityName,
    details,
    severity,
  });
}
