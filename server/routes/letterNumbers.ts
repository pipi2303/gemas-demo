// ============================================================
// MODUL SURAT-MENYURAT — Endpoint atomik generate nomor surat (Fase 1)
// ============================================================
// Kenapa endpoint terpisah (bukan lewat /api/data/:collection generik seperti
// collection lain): nomor surat TIDAK BOLEH kembar walau dua staf submit surat
// bersamaan. Polanya: SATU statement INSERT ... ON CONFLICT (collection, id)
// DO UPDATE SET data = jsonb_set(...) RETURNING data — identik prinsipnya
// dengan finance.voucher_sequences di server/routes/financeTransaction.ts
// (INSERT ... ON CONFLICT DO UPDATE SET current_number = current_number + 1
// RETURNING current_number). Satu statement UPSERT begini atomik dengan
// sendirinya di Postgres (row-level lock internal saat ON CONFLICT), jadi
// TIDAK perlu BEGIN/SELECT ... FOR UPDATE/UPDATE/COMMIT terpisah seperti
// percobaan awal — pola 3-langkah itu malah rawan bug (lihat riwayat commit).
//
// PENTING soal mode in-memory (fallback saat Postgres tidak reachable, dipakai
// unit test & dev tanpa DB): mockQuery() di server/lib/db.ts hanya mengenali
// pola SQL yang didaftarkan eksplisit. Pola generik "INSERT INTO gemas_store"
// SELALU menimpa dengan nilai awal ($3), tidak pernah increment — jadi endpoint
// ini butuh pola khusus di mockQuery() yang dicek LEBIH DULU (lihat db.ts,
// dicari dengan komentar yang menyebut "letterNumbers.ts"), meniru cara
// finance.voucher_sequences juga punya penanganan khusus di financeInMemory.ts.
//
// Fase 2: logika generate nomor diekstrak jadi fungsi generateLetterNumber()
// yang dipakai LANGSUNG (function call, bukan panggilan HTTP internal) oleh
// endpoint transisi "Periksa" di server/routes/outgoingLetters.ts — supaya
// satu transaksi alur kerja tidak perlu 2 request HTTP terpisah. Endpoint
// HTTP POST /api/letters/number/generate di bawah tetap ada (berguna untuk
// keperluan lain, mis. pratinjau format nomor), gate permission-nya sudah
// dipindah ke 'letters-outgoing' (sebelumnya 'letter-settings' sementara di
// Fase 1, karena Fase 1 belum punya halaman Surat Keluar).

import { Router, Response } from 'express';
import { getAll, getOne, getPool } from '../lib/db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { checkPagePermission } from '../lib/permissionCache.js';
import { logger } from '../lib/logger.js';

const router = Router();

// Bentuk minimal yang dibutuhkan endpoint ini saja — sengaja didefinisikan lokal
// (bukan import dari src/app/types) supaya server tetap tidak bergantung ke kode
// frontend, konsisten dengan seluruh file lain di server/.
type ResetPeriod = 'tahunan' | 'bulanan' | 'tidak_pernah';
interface LetterNumberFormat { id: string; jenisSuratId: string; pattern: string; resetPeriod: ResetPeriod }
interface OrgLetterhead { id: string; churchCode?: string }
interface MasterDataItem { id: string; category: string; value?: string; label?: string }

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function scopeKeyFor(jenisSuratId: string, resetPeriod: ResetPeriod, now: Date): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (resetPeriod === 'tahunan') return `${jenisSuratId}-${year}`;
  if (resetPeriod === 'bulanan') return `${jenisSuratId}-${String(month).padStart(2, '0')}-${year}`;
  return jenisSuratId; // 'tidak_pernah' — satu counter selamanya untuk jenis surat ini
}

/** Ganti token {urut}, {urut:N}, {jenis}, {kodeGereja}, {bulanRomawi}, {tahun}, {sektor}
 *  di pattern dengan nilai sebenarnya. Token yang tidak dikenali dibiarkan apa adanya
 *  supaya kesalahan ketik pola langsung kelihatan di hasil, bukan hilang diam-diam. */
export function formatLetterNumber(
  pattern: string,
  values: { urut: number; jenis: string; kodeGereja: string; bulanRomawi: string; tahun: string; sektor: string }
): string {
  return pattern
    .replace(/\{urut(?::(\d+))?\}/g, (_m, pad) => {
      const n = String(values.urut);
      return pad ? n.padStart(Number(pad), '0') : n;
    })
    .replace(/\{jenis\}/g, values.jenis)
    .replace(/\{kodeGereja\}/g, values.kodeGereja)
    .replace(/\{bulanRomawi\}/g, values.bulanRomawi)
    .replace(/\{tahun\}/g, values.tahun)
    .replace(/\{sektor\}/g, values.sektor);
}

/** Inti logika generate nomor surat atomik — dipakai baik oleh endpoint HTTP
 *  di bawah maupun langsung (function call) oleh endpoint transisi "Periksa"
 *  Surat Keluar (server/routes/outgoingLetters.ts). Melempar Error dengan
 *  properti `status` (mengikuti pola createDepositTransaction() di
 *  financeTransaction.ts) kalau format nomor untuk jenis surat itu belum diatur. */
export async function generateLetterNumber(
  jenisSuratId: string,
  sectorCode?: string
): Promise<{ letterNumber: string; lastNumber: number; scopeKey: string }> {
  const formats = await getAll<LetterNumberFormat>('letterNumberFormats');
  const format = formats.find(f => f.jenisSuratId === jenisSuratId);
  if (!format) {
    throw Object.assign(
      new Error('Format nomor untuk jenis surat ini belum diatur. Atur dulu di Pengaturan Surat Menyurat.'),
      { status: 400 }
    );
  }

  const masterItems = await getAll<MasterDataItem>('masterData');
  const jenisItem = masterItems.find(m => m.id === jenisSuratId && m.category === 'jenis_surat_keluar');
  const jenisCode = jenisItem?.value || jenisItem?.label || jenisSuratId;

  const letterhead = await getOne<OrgLetterhead>('orgLetterhead', 'default');
  const kodeGereja = letterhead?.churchCode || '';

  const now = new Date();
  const scopeKey = scopeKeyFor(jenisSuratId, format.resetPeriod, now);
  const initialData = JSON.stringify({ id: scopeKey, lastNumber: 1, updatedAt: now.toISOString() });

  const pool = getPool();
  // Satu statement UPSERT atomik: kalau baris counter belum ada, dibuat dengan
  // lastNumber = 1 (nilai $3 dipakai apa adanya); kalau sudah ada, Postgres
  // mengunci baris itu sendiri lalu increment lastNumber dari nilai TERBARU-nya
  // (bukan dari $3) — sehingga dua request bersamaan tidak pernah dapat nomor
  // yang sama. Lihat komentar panjang di atas file ini untuk perbandingan
  // dengan pola finance.voucher_sequences yang jadi acuan.
  const result = await pool.query<{ data: string }>(
    `INSERT INTO gemas_store (collection, id, data, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (collection, id) DO UPDATE SET
       data = jsonb_set(
         gemas_store.data::jsonb,
         '{lastNumber}',
         to_jsonb((COALESCE((gemas_store.data::jsonb->>'lastNumber')::int, 0)) + 1)
       )::text,
       updated_at = NOW()
     RETURNING data`,
    ['letterNumberCounters', scopeKey, initialData]
  );

  const counterData = JSON.parse(result.rows[0].data) as { lastNumber: number };
  const nextNumber = counterData.lastNumber;

  const letterNumber = formatLetterNumber(format.pattern, {
    urut: nextNumber,
    jenis: jenisCode,
    kodeGereja,
    bulanRomawi: ROMAN_MONTHS[now.getMonth()],
    tahun: String(now.getFullYear()),
    sektor: sectorCode || '',
  });

  return { letterNumber, lastNumber: nextNumber, scopeKey };
}

router.post('/number/generate', requireAuth, async (req: AuthRequest, res: Response) => {
  const role = req.user?.role;
  if (!role) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const customRoles = await getAll<any>('customRoles').catch(() => []);
    const allowed = await checkPagePermission(role, 'letters-outgoing', 'edit', customRoles);
    if (!allowed) { res.status(403).json({ error: 'Akses ditolak untuk operasi ini' }); return; }
  } catch (err) {
    logger.error('Permission check error (letter number generate)', { message: String(err) });
    res.status(500).json({ error: 'Gagal memverifikasi akses' });
    return;
  }

  const { jenisSuratId, sectorCode } = (req.body ?? {}) as { jenisSuratId?: string; sectorCode?: string };
  if (!jenisSuratId || typeof jenisSuratId !== 'string') {
    res.status(400).json({ error: 'jenisSuratId wajib diisi' });
    return;
  }

  try {
    const { letterNumber, lastNumber, scopeKey } = await generateLetterNumber(jenisSuratId, sectorCode);
    logger.info('Letter number generated', { user: req.user!.username, jenisSuratId, scopeKey, lastNumber });
    res.json({ success: true, letterNumber, lastNumber, scopeKey });
  } catch (err: any) {
    if (err?.status === 400) { res.status(400).json({ error: err.message }); return; }
    logger.error('Generate letter number error', { message: String(err) });
    res.status(500).json({ error: 'Gagal membuat nomor surat' });
  }
});

export default router;
