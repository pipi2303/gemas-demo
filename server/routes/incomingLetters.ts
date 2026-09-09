// ============================================================
// MODUL SURAT-MENYURAT — Alur Kerja Surat Masuk & Disposisi (Fase 3)
// ============================================================
// Endpoint transisi status Diterima → Didisposisikan → DitindakLanjuti →
// Selesai → Diarsipkan, pola yang sama seperti server/routes/outgoingLetters.ts
// (generic collection store getOne/upsert, bukan raw SQL — surat masuk juga
// tidak butuh row-level lock seperti Finance, lihat rationale di file itu).
//
// DUA KEPUTUSAN DESAIN yang sudah dikonfirmasi user sebelum implementasi ini:
// 1) Lampiran scan surat masuk memakai pola MULTI-LAMPIRAN yang sama dengan
//    Surat Keluar Fase 2 (collection terpisah incomingLetterAttachments,
//    bukan satu field scanFileData tunggal di record surat).
// 2) Siapa pun yang DITUGASKAN sebagai penerima disposisi (disposisi.assignedToUserId)
//    SELALU boleh menandai tindak-lanjut/selesai untuk surat itu — walau role-nya
//    (mis. Operator/Ketua Sektor) tidak punya izin modul 'letters-incoming' sama
//    sekali. Ini "assignee override": diperiksa TERPISAH dari & SEBELUM
//    checkPagePermission() biasa, bukan menggantikannya — staf pemegang izin
//    modul (Admin/Majelis) tetap selalu boleh juga.
//
// Disposisikan (assign) BOLEH dipanggil ulang selama status masih Didisposisikan
// (mis. salah tunjuk staf, perlu dikoreksi) — begitu sudah DitindakLanjuti+,
// disposisi terkunci (endpoint ini menolak, harus lewat proses barunya sendiri
// kalau memang perlu re-assign, di luar cakupan Fase 3).
//
// Setiap kali disposisikan berhasil, sebuah notifications record BARU ditulis
// dengan targetUserId = assignedToUserId, supaya cuma staf yang ditugaskan itu
// yang melihatnya di NotificationBell (lihat perluasan Notification.targetUserId
// & filter di NotificationCenter.tsx/NotificationBell — notifikasi lama tanpa
// targetUserId tetap tampil ke semua orang seperti sebelumnya, tidak berubah).
//
// Field yang berhubungan dengan tahap lanjut HANYA ditulis dari sini, tidak
// pernah dari PUT generik /api/data/incomingLetters/:id (ditolak begitu status
// sudah lewat Diterima — lihat blockNonEditableLetterWrite() di server/routes/data.ts).

import { Router, Response } from 'express';
import { getAll, getOne, upsert } from '../lib/db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { checkPagePermission } from '../lib/permissionCache.js';
import { recordLetterAudit } from '../lib/letterAudit.js';
import { logger } from '../lib/logger.js';

const router = Router();

const PAGE_KEY = 'letters-incoming';

interface IncomingLetterDisposition {
  assignedToUserId: string;
  instruction: string;
  dueDate?: string;
  assignedBy?: string;
  assignedAt?: string;
}

interface IncomingLetterRecord {
  id: string;
  status: 'Diterima' | 'Didisposisikan' | 'DitindakLanjuti' | 'Selesai' | 'Diarsipkan';
  subject?: string;
  senderName?: string;
  disposisi?: IncomingLetterDisposition;
  [key: string]: any;
}

async function hasPermission(req: AuthRequest, action: 'edit' | 'approve'): Promise<boolean> {
  const role = req.user?.role;
  if (!role) return false;
  const customRoles = await getAll<any>('customRoles').catch(() => []);
  return checkPagePermission(role, PAGE_KEY, action, customRoles);
}

// "Assignee override" — dipakai HANYA oleh endpoint tindak-lanjut & selesai:
// staf yang ditugaskan lewat disposisi selalu boleh, di luar & di samping izin
// modul biasa (bukan menggantikannya — pemegang izin 'edit' modul tetap boleh juga).
async function canActOnDisposition(req: AuthRequest, letter: IncomingLetterRecord): Promise<boolean> {
  if (letter.disposisi?.assignedToUserId && req.user?.userId === letter.disposisi.assignedToUserId) {
    return true;
  }
  return hasPermission(req, 'edit');
}

async function loadLetter(id: string): Promise<IncomingLetterRecord | null> {
  return getOne<IncomingLetterRecord>('incomingLetters', id).catch(() => null);
}

function letterLabel(letter: IncomingLetterRecord): string {
  return letter.senderName ? `${letter.subject || '(tanpa perihal)'} — dari ${letter.senderName}` : (letter.subject || letter.id);
}

async function notifyAssignee(letter: IncomingLetterRecord, assignedToUserId: string, instruction: string): Promise<void> {
  const now = new Date();
  const id = `not${now.getTime()}_${Math.random().toString(36).slice(2, 8)}_${Math.floor(Math.random() * 10000)}`;
  await upsert('notifications', id, {
    id,
    type: 'disposition',
    title: `Disposisi surat masuk: ${letter.subject || '(tanpa perihal)'}`,
    message: instruction ? `Instruksi: ${instruction}` : `Anda ditugaskan menindaklanjuti surat dari ${letter.senderName || '-'}`,
    read: false,
    createdAt: now.toISOString(),
    link: `disposisi-${letter.id}-${now.getTime()}`,
    priority: 'medium',
    targetUserId: assignedToUserId,
  });
}

// ── Disposisikan (Diterima|Didisposisikan → Didisposisikan) ────────────────
// Boleh dipanggil ulang selama masih Didisposisikan untuk mengoreksi penugasan
// yang salah — begitu DitindakLanjuti+, disposisi terkunci (lihat komentar atas).
router.put('/:id/disposisikan', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await hasPermission(req, 'edit'))) { res.status(403).json({ error: 'Akses ditolak untuk operasi ini' }); return; }

    const letter = await loadLetter(req.params.id);
    if (!letter) { res.status(404).json({ error: 'Surat tidak ditemukan' }); return; }
    if (letter.status !== 'Diterima' && letter.status !== 'Didisposisikan') {
      res.status(400).json({ error: 'Surat ini sudah ditindaklanjuti — disposisi tidak bisa diubah lagi' });
      return;
    }

    const { assignedToUserId, instruction, dueDate } = (req.body ?? {}) as {
      assignedToUserId?: string; instruction?: string; dueDate?: string;
    };
    if (!assignedToUserId || typeof assignedToUserId !== 'string') {
      res.status(400).json({ error: 'Staf yang didisposisikan wajib dipilih' });
      return;
    }
    if (!instruction || !String(instruction).trim()) {
      res.status(400).json({ error: 'Instruksi disposisi wajib diisi' });
      return;
    }

    const users = await getAll<any>('users').catch(() => []);
    const assignee = users.find((u: any) => u.id === assignedToUserId);
    if (!assignee) { res.status(400).json({ error: 'Staf yang dipilih tidak ditemukan' }); return; }

    const now = new Date().toISOString();
    const disposisi: IncomingLetterDisposition = {
      assignedToUserId,
      instruction: String(instruction).trim(),
      dueDate: dueDate || undefined,
      assignedBy: req.user!.userId,
      assignedAt: now,
    };

    await upsert('incomingLetters', letter.id, {
      ...letter,
      status: 'Didisposisikan',
      disposisi,
      updatedAt: now,
    });

    await notifyAssignee(letter, assignedToUserId, disposisi.instruction);

    await recordLetterAudit(req, 'Didisposisikan', 'IncomingLetter', letter.id, letterLabel(letter), `Surat "${letter.subject}" didisposisikan ke ${assignee.name || assignee.fullName || assignee.username || assignedToUserId}: ${disposisi.instruction}`);
    res.json({ success: true });
  } catch (err) {
    logger.error('PUT incoming-letters/:id/disposisikan', { message: String(err) });
    res.status(500).json({ error: 'Gagal mendisposisikan surat' });
  }
});

// ── Tindak Lanjuti (Didisposisikan → DitindakLanjuti) ──────────────────────
router.put('/:id/tindak-lanjut', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const letter = await loadLetter(req.params.id);
    if (!letter) { res.status(404).json({ error: 'Surat tidak ditemukan' }); return; }
    if (letter.status !== 'Didisposisikan') { res.status(400).json({ error: 'Hanya surat berstatus Didisposisikan yang bisa ditindaklanjuti' }); return; }

    if (!(await canActOnDisposition(req, letter))) { res.status(403).json({ error: 'Akses ditolak untuk operasi ini' }); return; }

    const { followUpNotes } = (req.body ?? {}) as { followUpNotes?: string };
    const now = new Date().toISOString();
    await upsert('incomingLetters', letter.id, {
      ...letter,
      status: 'DitindakLanjuti',
      followUpNotes: followUpNotes || undefined,
      followUpAt: now,
      followUpBy: req.user!.userId,
      updatedAt: now,
    });

    await recordLetterAudit(req, 'DitindakLanjuti', 'IncomingLetter', letter.id, letterLabel(letter), `Surat "${letter.subject}" ditindaklanjuti${followUpNotes ? `: ${followUpNotes}` : ''}`);
    res.json({ success: true });
  } catch (err) {
    logger.error('PUT incoming-letters/:id/tindak-lanjut', { message: String(err) });
    res.status(500).json({ error: 'Gagal menandai tindak lanjut surat' });
  }
});

// ── Selesaikan (DitindakLanjuti → Selesai) ─────────────────────────────────
router.put('/:id/selesai', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const letter = await loadLetter(req.params.id);
    if (!letter) { res.status(404).json({ error: 'Surat tidak ditemukan' }); return; }
    if (letter.status !== 'DitindakLanjuti') { res.status(400).json({ error: 'Hanya surat berstatus DitindakLanjuti yang bisa diselesaikan' }); return; }

    if (!(await canActOnDisposition(req, letter))) { res.status(403).json({ error: 'Akses ditolak untuk operasi ini' }); return; }

    const now = new Date().toISOString();
    await upsert('incomingLetters', letter.id, {
      ...letter,
      status: 'Selesai',
      completedAt: now,
      completedBy: req.user!.userId,
      updatedAt: now,
    });

    await recordLetterAudit(req, 'Selesai', 'IncomingLetter', letter.id, letterLabel(letter), `Surat "${letter.subject}" ditandai selesai`);
    res.json({ success: true });
  } catch (err) {
    logger.error('PUT incoming-letters/:id/selesai', { message: String(err) });
    res.status(500).json({ error: 'Gagal menyelesaikan surat' });
  }
});

// ── Arsipkan (Selesai → Diarsipkan) ────────────────────────────────────────
// Tindakan administratif (mis. staf arsip), BUKAN assignee-gated — beda dari
// tindak-lanjut/selesai di atas, harus izin modul 'edit' biasa.
router.put('/:id/arsipkan', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await hasPermission(req, 'edit'))) { res.status(403).json({ error: 'Akses ditolak untuk operasi ini' }); return; }

    const letter = await loadLetter(req.params.id);
    if (!letter) { res.status(404).json({ error: 'Surat tidak ditemukan' }); return; }
    if (letter.status !== 'Selesai') { res.status(400).json({ error: 'Hanya surat berstatus Selesai yang bisa diarsipkan' }); return; }

    const now = new Date().toISOString();
    await upsert('incomingLetters', letter.id, {
      ...letter,
      status: 'Diarsipkan',
      archivedAt: now,
      archivedBy: req.user!.userId,
      updatedAt: now,
    });

    await recordLetterAudit(req, 'Diarsipkan', 'IncomingLetter', letter.id, letterLabel(letter), `Surat "${letter.subject}" diarsipkan`);
    res.json({ success: true });
  } catch (err) {
    logger.error('PUT incoming-letters/:id/arsipkan', { message: String(err) });
    res.status(500).json({ error: 'Gagal mengarsipkan surat' });
  }
});

export default router;
