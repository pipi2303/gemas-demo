// ============================================================
// MODUL SURAT-MENYURAT — Auto-link ke Dokumen Jemaat (gap-fix Sept 2026)
// ============================================================
// Dipanggil dari outgoingLetters.ts & incomingLetters.ts di endpoint /arsipkan
// masing-masing — keputusan desain yang sudah dikonfirmasi user: penyalinan
// ke Dokumen Jemaat terjadi HANYA saat surat mencapai status 'Diarsipkan',
// karena itu titik paling stabil (surat sudah final, tidak akan direvisi lagi),
// bukan saat Ditandatangani (PDF final memang sudah ada di titik itu, tapi
// surat secara alur belum tentu Terkirim/final). Kalau letter.memberId tidak
// diisi (surat bukan untuk/dari jemaat tertentu, mis. surat ke instansi luar),
// fungsi ini tidak melakukan apa-apa.
//
// Batas ukuran 2MB (sama seperti MAX_DOCUMENT_BYTES di server/routes/data.ts
// untuk semua collection dokumen PDF lain) SENGAJA dipertahankan di sini juga,
// walau upsert() langsung ke collection generik 'memberDocuments' TIDAK lewat
// validateDocumentData() di data.ts (itu cuma jalan untuk POST/PUT lewat
// endpoint /api/data/memberDocuments biasa) — supaya invarian "semua dokumen
// jemaat maksimal 2MB" yang dipegang jalur upload manual (MemberDatabase.tsx)
// tetap konsisten dipegang jalur otomatis ini juga. finalPdfData Surat Keluar
// boleh sampai 5MB (MAX_FINAL_PDF_BYTES di outgoingLetters.ts) — kalau
// melebihi 2MB, entri Dokumen Jemaat OTOMATIS DILEWATI (bukan galat; arsip
// surat tetap berhasil) supaya staf tidak kaget file besar tiba-tiba nyangkut
// di tab Dokumentasi jemaat; surat aslinya tetap bisa diunduh penuh dari
// halaman Surat Keluar/Surat Masuk itu sendiri.
import { upsert } from './db.js';
import { logger } from './logger.js';

const MAX_MEMBER_DOCUMENT_BYTES = 2 * 1024 * 1024;

export async function copyToMemberDocuments(params: {
  memberId?: string;
  fileName: string;
  fileData: string; // base64, tanpa prefix data URL
  mimeType: string;
  uploadedByLabel: string;
}): Promise<void> {
  const { memberId, fileName, fileData, mimeType, uploadedByLabel } = params;
  if (!memberId || !fileData) return;
  try {
    const buf = Buffer.from(fileData, 'base64');
    if (buf.length === 0) return;
    if (buf.length > MAX_MEMBER_DOCUMENT_BYTES) {
      logger.info('Lewati auto-link Dokumen Jemaat: ukuran file melebihi batas 2MB', { memberId, fileName, bytes: buf.length });
      return;
    }
    const now = new Date().toISOString();
    const id = `mdoc_letter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await upsert('memberDocuments', id, {
      id,
      memberId,
      fileName,
      fileSize: buf.length,
      mimeType,
      fileData,
      uploadedAt: now,
      uploadedBy: uploadedByLabel,
    });
  } catch (err) {
    // Auto-link adalah efek SAMPING dari proses arsip surat, bukan bagian inti
    // alurnya — kalau gagal (mis. data korup), surat tetap berhasil diarsipkan,
    // cuma dicatat di log supaya bisa ditelusuri, tidak melempar error ke klien.
    logger.error('Gagal auto-link surat ke Dokumen Jemaat', { memberId, fileName, message: String(err) });
  }
}
