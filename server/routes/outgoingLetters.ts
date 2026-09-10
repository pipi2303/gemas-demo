// ============================================================
// MODUL SURAT-MENYURAT — Alur Kerja Surat Keluar (Fase 2)
// ============================================================
// Endpoint transisi status Draft → Diajukan → Diperiksa → Ditandatangani →
// Terkirim → Diarsipkan (dengan "Kembalikan" sebagai cabang dari Diajukan/
// Diperiksa balik ke Draft) — polanya meniru endpoint alur kerja Finance
// (server/routes/financeTransaction.ts: submit/verify/approve/reject), tapi
// disesuaikan ke generic collection store (getOne/upsert), BUKAN raw SQL
// dengan SELECT ... FOR UPDATE seperti Finance — karena outgoingLetters
// disimpan di gemas_store (collection generik, lihat Bagian 1 plan modul
// ini), bukan tabel relasional finance.* yang memang butuh row-level lock
// untuk double-entry accounting.
//
// KONSEKUENSI DESAIN (disengaja, bukan alpa): tanpa SELECT ... FOR UPDATE,
// dua request transisi yang menembak SURAT YANG SAMA persis bersamaan
// (mis. dua staf klik "Ajukan" di detik yang sama) secara teori bisa saling
// menimpa. Ini diterima untuk modul ini karena (a) risikonya cuma status
// surat yang perlu diklik ulang, bukan kehilangan uang/rekonsiliasi seperti
// Finance, dan (b) skala pemakaian (satu gereja, segelintir staf) membuat
// kejadian ini sangat jarang. Yang TETAP dijaga ketat lewat mekanisme atomik
// terpisah (generateLetterNumber() di letterNumbers.ts) adalah PENOMORAN
// SURAT — itu yang benar-benar tidak boleh kembar.
//
// Nomor surat baru di-generate saat transisi "Periksa" (Diajukan→Diperiksa),
// idempotent (kalau sudah pernah ter-generate — mis. surat yang sempat
// dikembalikan dari Diperiksa lalu diajukan ulang — tidak generate ulang).
//
// Field yang berhubungan dengan tahap lanjut HANYA ditulis dari sini, tidak
// pernah dari PUT generik /api/data/outgoingLetters/:id (ditolak begitu
// status sudah lewat Draft — lihat blockNonEditableLetterWrite() di
// server/routes/data.ts).

import { Router, Response } from 'express';
import { getAll, getOne, upsert } from '../lib/db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { checkPagePermission } from '../lib/permissionCache.js';
import { recordLetterAudit } from '../lib/letterAudit.js';
import { generateLetterNumber } from './letterNumbers.js';
import { logger } from '../lib/logger.js';
import { copyToMemberDocuments } from '../lib/memberDocumentSync.js';

const router = Router();

const PAGE_KEY = 'letters-outgoing';
const MAX_FINAL_PDF_BYTES = 5 * 1024 * 1024; // 5MB — PDF final berisi kop surat + gambar TTD + cap

interface OutgoingLetterRecord {
  id: string;
  status: 'Draft' | 'Diajukan' | 'Diperiksa' | 'Ditandatangani' | 'Terkirim' | 'Diarsipkan';
  subject?: string;
  jenisSuratId?: string;
  sectorId?: string;
  memberId?: string;
  letterNumber?: string;
  finalPdfData?: string;
  [key: string]: any;
}

async function hasPermission(req: AuthRequest, action: 'edit' | 'approve'): Promise<boolean> {
  const role = req.user?.role;
  if (!role) return false;
  const customRoles = await getAll<any>('customRoles').catch(() => []);
  return checkPagePermission(role, PAGE_KEY, action, customRoles);
}

async function loadLetter(id: string): Promise<OutgoingLetterRecord | null> {
  return getOne<OutgoingLetterRecord>('outgoingLetters', id).catch(() => null);
}

function letterLabel(letter: OutgoingLetterRecord): string {
  return letter.letterNumber ? `${letter.subject || '(tanpa perihal)'} (${letter.letterNumber})` : (letter.subject || letter.id);
}

// ── Ajukan (Draft → Diajukan) ──────────────────────────────────────────────
router.put('/:id/submit', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await hasPermission(req, 'edit'))) { res.status(403).json({ error: 'Akses ditolak untuk operasi ini' }); return; }

    const letter = await loadLetter(req.params.id);
    if (!letter) { res.status(404).json({ error: 'Surat tidak ditemukan' }); return; }
    if (letter.status !== 'Draft') { res.status(400).json({ error: 'Hanya surat berstatus Draft yang bisa diajukan' }); return; }

    const missing: string[] = [];
    if (!letter.jenisSuratId) missing.push('jenis surat');
    if (!String(letter.subject || '').trim()) missing.push('perihal');
    if (!String(letter.recipientName || '').trim()) missing.push('nama penerima');
    if (!String(letter.body || '').trim()) missing.push('isi surat');
    if (missing.length > 0) {
      res.status(400).json({ error: `Lengkapi dulu: ${missing.join(', ')}` });
      return;
    }

    const now = new Date().toISOString();
    await upsert('outgoingLetters', letter.id, {
      ...letter,
      status: 'Diajukan',
      submittedBy: req.user!.userId,
      submittedAt: now,
      updatedAt: now,
    });

    await recordLetterAudit(req, 'Diajukan', 'OutgoingLetter', letter.id, letterLabel(letter), `Surat "${letter.subject}" diajukan untuk diperiksa`);
    res.json({ success: true });
  } catch (err) {
    logger.error('PUT outgoing-letters/:id/submit', { message: String(err) });
    res.status(500).json({ error: 'Gagal mengajukan surat' });
  }
});

// ── Kembalikan ke Draft (Diajukan|Diperiksa → Draft, wajib alasan) ─────────
router.put('/:id/kembalikan', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const letter = await loadLetter(req.params.id);
    if (!letter) { res.status(404).json({ error: 'Surat tidak ditemukan' }); return; }
    if (letter.status !== 'Diajukan' && letter.status !== 'Diperiksa') {
      res.status(400).json({ error: 'Hanya surat berstatus Diajukan atau Diperiksa yang bisa dikembalikan' });
      return;
    }

    // Diajukan dikembalikan oleh pemeriksa (permission 'edit'); Diperiksa dikembalikan
    // oleh pejabat penandatangan yang menolak menandatangani (permission 'approve').
    const requiredAction: 'edit' | 'approve' = letter.status === 'Diperiksa' ? 'approve' : 'edit';
    if (!(await hasPermission(req, requiredAction))) { res.status(403).json({ error: 'Akses ditolak untuk operasi ini' }); return; }

    const reason = String((req.body ?? {}).reason || '').trim();
    if (!reason) { res.status(400).json({ error: 'Alasan pengembalian wajib diisi' }); return; }

    const now = new Date().toISOString();
    await upsert('outgoingLetters', letter.id, {
      ...letter,
      status: 'Draft',
      rejectReason: reason,
      updatedAt: now,
    });

    await recordLetterAudit(req, 'Dikembalikan', 'OutgoingLetter', letter.id, letterLabel(letter), `Surat "${letter.subject}" dikembalikan ke Draft: ${reason}`);
    res.json({ success: true });
  } catch (err) {
    logger.error('PUT outgoing-letters/:id/kembalikan', { message: String(err) });
    res.status(500).json({ error: 'Gagal mengembalikan surat' });
  }
});

// ── Periksa & setujui untuk ditandatangani (Diajukan → Diperiksa) ──────────
// Di titik inilah nomor surat di-generate (atomik, lihat generateLetterNumber())
// — supaya nomor urut hanya "dibakar" untuk surat yang sudah lolos pemeriksaan,
// bukan untuk draft yang mungkin dibatalkan.
router.put('/:id/periksa', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await hasPermission(req, 'edit'))) { res.status(403).json({ error: 'Akses ditolak untuk operasi ini' }); return; }

    const letter = await loadLetter(req.params.id);
    if (!letter) { res.status(404).json({ error: 'Surat tidak ditemukan' }); return; }
    if (letter.status !== 'Diajukan') { res.status(400).json({ error: 'Hanya surat berstatus Diajukan yang bisa diperiksa' }); return; }

    let letterNumber = letter.letterNumber;
    if (!letterNumber) {
      try {
        const generated = await generateLetterNumber(letter.jenisSuratId, letter.sectorId);
        letterNumber = generated.letterNumber;
      } catch (err: any) {
        if (err?.status === 400) { res.status(400).json({ error: err.message }); return; }
        throw err;
      }
    }

    const now = new Date().toISOString();
    await upsert('outgoingLetters', letter.id, {
      ...letter,
      status: 'Diperiksa',
      letterNumber,
      checkedBy: req.user!.userId,
      checkedAt: now,
      updatedAt: now,
    });

    await recordLetterAudit(req, 'Diperiksa', 'OutgoingLetter', letter.id, `${letter.subject} (${letterNumber})`, `Surat "${letter.subject}" diperiksa & disetujui untuk ditandatangani — nomor surat: ${letterNumber}`);
    res.json({ success: true, letterNumber });
  } catch (err) {
    logger.error('PUT outgoing-letters/:id/periksa', { message: String(err) });
    res.status(500).json({ error: 'Gagal memeriksa surat' });
  }
});

// ── Tandatangani (Diperiksa → Ditandatangani) — mengunci finalPdfData ──────
router.put('/:id/tandatangani', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await hasPermission(req, 'approve'))) { res.status(403).json({ error: 'Akses ditolak untuk operasi ini' }); return; }

    const letter = await loadLetter(req.params.id);
    if (!letter) { res.status(404).json({ error: 'Surat tidak ditemukan' }); return; }
    if (letter.status !== 'Diperiksa') { res.status(400).json({ error: 'Hanya surat berstatus Diperiksa yang bisa ditandatangani' }); return; }

    const { finalPdfData, signatureAssetId, stampAssetId } = (req.body ?? {}) as {
      finalPdfData?: string; signatureAssetId?: string; stampAssetId?: string;
    };
    if (!finalPdfData || typeof finalPdfData !== 'string') { res.status(400).json({ error: 'PDF final surat wajib disertakan' }); return; }

    let buf: Buffer;
    try {
      buf = Buffer.from(finalPdfData, 'base64');
    } catch {
      res.status(400).json({ error: 'Data PDF final tidak valid' });
      return;
    }
    if (buf.length === 0) { res.status(400).json({ error: 'Data PDF final tidak valid' }); return; }
    if (buf.length > MAX_FINAL_PDF_BYTES) { res.status(400).json({ error: 'Ukuran PDF final melebihi batas 5MB' }); return; }
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') { res.status(400).json({ error: 'File bukan PDF yang valid' }); return; }

    const now = new Date().toISOString();
    await upsert('outgoingLetters', letter.id, {
      ...letter,
      status: 'Ditandatangani',
      signedBy: req.user!.userId,
      signedAt: now,
      signatureAssetId: signatureAssetId || undefined,
      stampAssetId: stampAssetId || undefined,
      finalPdfData,
      updatedAt: now,
    });

    await recordLetterAudit(req, 'Ditandatangani', 'OutgoingLetter', letter.id, letterLabel(letter), `Surat "${letter.subject}" (${letter.letterNumber || '-'}) ditandatangani`);
    res.json({ success: true });
  } catch (err) {
    logger.error('PUT outgoing-letters/:id/tandatangani', { message: String(err) });
    res.status(500).json({ error: 'Gagal menandatangani surat' });
  }
});

// ── Tandai Terkirim (Ditandatangani → Terkirim) ────────────────────────────
router.put('/:id/kirim', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await hasPermission(req, 'edit'))) { res.status(403).json({ error: 'Akses ditolak untuk operasi ini' }); return; }

    const letter = await loadLetter(req.params.id);
    if (!letter) { res.status(404).json({ error: 'Surat tidak ditemukan' }); return; }
    if (letter.status !== 'Ditandatangani') { res.status(400).json({ error: 'Hanya surat berstatus Ditandatangani yang bisa ditandai terkirim' }); return; }

    const { sentVia } = (req.body ?? {}) as { sentVia?: string };
    const now = new Date().toISOString();
    await upsert('outgoingLetters', letter.id, {
      ...letter,
      status: 'Terkirim',
      sentAt: now,
      sentVia: sentVia || undefined,
      updatedAt: now,
    });

    await recordLetterAudit(req, 'Terkirim', 'OutgoingLetter', letter.id, letterLabel(letter), `Surat "${letter.subject}" (${letter.letterNumber || '-'}) ditandai terkirim${sentVia ? ` via ${sentVia}` : ''}`);
    res.json({ success: true });
  } catch (err) {
    logger.error('PUT outgoing-letters/:id/kirim', { message: String(err) });
    res.status(500).json({ error: 'Gagal menandai surat terkirim' });
  }
});

// ── Arsipkan (Terkirim → Diarsipkan) ───────────────────────────────────────
router.put('/:id/arsipkan', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await hasPermission(req, 'edit'))) { res.status(403).json({ error: 'Akses ditolak untuk operasi ini' }); return; }

    const letter = await loadLetter(req.params.id);
    if (!letter) { res.status(404).json({ error: 'Surat tidak ditemukan' }); return; }
    if (letter.status !== 'Terkirim') { res.status(400).json({ error: 'Hanya surat berstatus Terkirim yang bisa diarsipkan' }); return; }

    const now = new Date().toISOString();
    await upsert('outgoingLetters', letter.id, {
      ...letter,
      status: 'Diarsipkan',
      archivedAt: now,
      archivedBy: req.user!.userId,
      updatedAt: now,
    });

    // Auto-link ke Dokumen Jemaat (gap-fix Sept 2026) — hanya kalau surat ini
    // terhubung ke satu jemaat tertentu (letter.memberId) DAN sudah punya PDF
    // final (harusnya selalu ada di titik ini, karena Diarsipkan hanya bisa
    // dicapai dari Terkirim yang mensyaratkan Ditandatangani lebih dulu).
    if (letter.memberId && letter.finalPdfData) {
      const users = await getAll<any>('users').catch(() => []);
      const archiver = users.find((u: any) => u.id === req.user!.userId);
      await copyToMemberDocuments({
        memberId: letter.memberId,
        fileName: `Surat Keluar - ${letter.subject || letter.id}${letter.letterNumber ? ` (${letter.letterNumber})` : ''}.pdf`,
        fileData: letter.finalPdfData,
        mimeType: 'application/pdf',
        uploadedByLabel: `${archiver?.name || archiver?.username || 'Sistem'} (otomatis dari Surat Keluar${letter.letterNumber ? ' ' + letter.letterNumber : ''})`,
      });
    }

    await recordLetterAudit(req, 'Diarsipkan', 'OutgoingLetter', letter.id, letterLabel(letter), `Surat "${letter.subject}" (${letter.letterNumber || '-'}) diarsipkan`);
    res.json({ success: true });
  } catch (err) {
    logger.error('PUT outgoing-letters/:id/arsipkan', { message: String(err) });
    res.status(500).json({ error: 'Gagal mengarsipkan surat' });
  }
});

export default router;
