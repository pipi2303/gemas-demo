-- cleanup-duplicate-notifications.sql
--
-- Bug (fix di commit 8e25dcb): sebelum diperbaiki, beberapa notifikasi
-- digenerate ULANG TERUS-MENERUS untuk event/entity yang sama -- gabungan
-- race condition saat startup (notifications belum selesai load saat
-- effect pengecekan duplikat lain sudah jalan) dan stale closure di
-- reminder livestream 60 detik (closure dedup-check-nya beku sejak mount,
-- jadi setiap tick 60 detik nambah 1 duplikat baru selama window
-- reminder-nya masih terbuka). Fix sudah masuk dan mencegah duplikat BARU,
-- tapi baris-baris duplikat yang SUDAH terlanjur ada di database (terhitung
-- ~527 baris per audit terakhir) tetap perlu dibersihkan manual -- itu yang
-- dilakukan script ini.
--
-- Aturan "siapa yang disimpan" per grup duplikat -- dikelompokkan
-- berdasarkan (`link`, `targetUserId`): `link` menunjuk ke event/entity yang
-- sama, dan `targetUserId` ikut disertakan supaya notifikasi privat (mis.
-- disposisi Surat Masuk ke beberapa penerima berbeda untuk surat yang sama)
-- TIDAK ikut ke-merge jadi satu walau link-nya sama -- itu bukan duplikat,
-- itu memang notifikasi berbeda untuk orang berbeda.
--   1. Kalau ADA baris yang sudah `read: true` dalam grup, simpan yang
--      PALING LAMA (createdAt terkecil) di antara yang sudah dibaca --
--      supaya waktu kejadian aslinya tetap akurat.
--   2. Kalau TIDAK ADA satu pun yang sudah dibaca, simpan baris PALING LAMA
--      dari semuanya.
-- Notifikasi TANPA `link` (broadcast lama, dll -- ~246 baris per audit
-- terakhir) SAMA SEKALI TIDAK disentuh -- tidak ada cara aman
-- mengelompokkannya sebagai duplikat, jadi dibiarkan seperti apa adanya.
--
-- Jalankan tahapan di bawah SATU PER SATU, berurutan, langsung ke database
-- production (mis. lewat psql atau console DB, di dalam/terhubung ke
-- container yang sama dipakai server). Backup di Tahap 2 WAJIB dijalankan
-- dan dicek jumlahnya SEBELUM menjalankan DELETE di Tahap 3.


-- ════════════════════════════════════════════════════════════════════════════
-- TAHAP 1 — DIAGNOSTIK (read-only, aman dijalankan kapan saja, boleh diulang)
-- ════════════════════════════════════════════════════════════════════════════

-- 1a. Ringkasan angka: berapa baris yang akan dihapus vs disimpan.
WITH ranked AS (
  SELECT
    id,
    data::jsonb->>'link'          AS link,
    data::jsonb->>'targetUserId'  AS target_user_id,
    (data::jsonb->>'read')::boolean AS is_read,
    data::jsonb->>'createdAt'     AS created_at,
    ROW_NUMBER() OVER (
      PARTITION BY data::jsonb->>'link', COALESCE(data::jsonb->>'targetUserId', '')
      ORDER BY (data::jsonb->>'read')::boolean DESC NULLS LAST, data::jsonb->>'createdAt' ASC
    ) AS rn,
    COUNT(*) OVER (
      PARTITION BY data::jsonb->>'link', COALESCE(data::jsonb->>'targetUserId', '')
    ) AS group_size
  FROM gemas_store
  WHERE collection = 'notifications'
    AND data::jsonb->>'link' IS NOT NULL
    AND data::jsonb->>'link' <> ''
)
SELECT
  (SELECT COUNT(*) FROM gemas_store WHERE collection = 'notifications')              AS total_notifikasi_sekarang,
  COUNT(*) FILTER (WHERE group_size = 1)                                              AS baris_tanpa_duplikat,
  COUNT(DISTINCT (link, target_user_id)) FILTER (WHERE group_size > 1)                AS jumlah_grup_duplikat,
  COUNT(*) FILTER (WHERE rn = 1 AND group_size > 1)                                   AS baris_disimpan_dari_grup_duplikat,
  COUNT(*) FILTER (WHERE rn > 1)                                                      AS baris_AKAN_DIHAPUS
FROM ranked;

-- 1b. Contoh grup duplikat terbesar (untuk sanity-check manual sebelum lanjut) --
-- title/message harus terlihat sebagai notifikasi yang masuk akal untuk diduplikasi
-- (mis. "Acara: ...", "Ulang Tahun Hari Ini", "Pengumuman Baru"), BUKAN sesuatu yang
-- kebetulan kosong/generic yang berisiko salah dikelompokkan.
SELECT
  data::jsonb->>'title'         AS title,
  data::jsonb->>'link'          AS link,
  data::jsonb->>'targetUserId'  AS target_user_id,
  COUNT(*)                      AS jumlah_duplikat
FROM gemas_store
WHERE collection = 'notifications'
  AND data::jsonb->>'link' IS NOT NULL
  AND data::jsonb->>'link' <> ''
GROUP BY 1, 2, 3
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
LIMIT 20;


-- ════════════════════════════════════════════════════════════════════════════
-- TAHAP 2 — BACKUP (WAJIB sebelum DELETE, supaya bisa di-rollback)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gemas_store_backup_notification_dedup AS
WITH ranked AS (
  SELECT
    id,
    data::jsonb->>'link'         AS link,
    data::jsonb->>'targetUserId' AS target_user_id,
    ROW_NUMBER() OVER (
      PARTITION BY data::jsonb->>'link', COALESCE(data::jsonb->>'targetUserId', '')
      ORDER BY (data::jsonb->>'read')::boolean DESC NULLS LAST, data::jsonb->>'createdAt' ASC
    ) AS rn
  FROM gemas_store
  WHERE collection = 'notifications'
    AND data::jsonb->>'link' IS NOT NULL
    AND data::jsonb->>'link' <> ''
)
SELECT g.*, now() AS backed_up_at
FROM gemas_store g
JOIN ranked r ON r.id = g.id
WHERE g.collection = 'notifications' AND r.rn > 1;

-- Cocokkan angka ini dengan "baris_AKAN_DIHAPUS" dari Tahap 1a sebelum lanjut ke Tahap 3.
SELECT COUNT(*) FROM gemas_store_backup_notification_dedup;


-- ════════════════════════════════════════════════════════════════════════════
-- TAHAP 3 — DELETE (baris duplikat yang sudah dikonfirmasi & dibackup)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

WITH ranked AS (
  SELECT
    id,
    data::jsonb->>'link'         AS link,
    data::jsonb->>'targetUserId' AS target_user_id,
    ROW_NUMBER() OVER (
      PARTITION BY data::jsonb->>'link', COALESCE(data::jsonb->>'targetUserId', '')
      ORDER BY (data::jsonb->>'read')::boolean DESC NULLS LAST, data::jsonb->>'createdAt' ASC
    ) AS rn
  FROM gemas_store
  WHERE collection = 'notifications'
    AND data::jsonb->>'link' IS NOT NULL
    AND data::jsonb->>'link' <> ''
)
DELETE FROM gemas_store g
USING ranked r
WHERE g.collection = 'notifications'
  AND g.id = r.id
  AND r.rn > 1;

-- psql akan menampilkan "DELETE <n>" di atas -- WAJIB cocokkan <n> dengan angka
-- "baris_AKAN_DIHAPUS" dari Tahap 1a dan jumlah baris tabel backup Tahap 2
-- SEBELUM mengetik COMMIT. Kalau beda atau ragu, ketik ROLLBACK dan cek ulang.

COMMIT;
-- atau: ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- TAHAP 4 — VERIFIKASI
-- ════════════════════════════════════════════════════════════════════════════

-- Total sekarang harus = total_notifikasi_sekarang (Tahap 1a) dikurangi baris_AKAN_DIHAPUS.
SELECT COUNT(*) AS total_notifikasi_setelah_cleanup FROM gemas_store WHERE collection = 'notifications';

-- Tidak boleh ada lagi grup duplikat tersisa (harus 0 baris):
SELECT data::jsonb->>'link' AS link, data::jsonb->>'targetUserId' AS target_user_id, COUNT(*)
FROM gemas_store
WHERE collection = 'notifications'
  AND data::jsonb->>'link' IS NOT NULL
  AND data::jsonb->>'link' <> ''
GROUP BY 1, 2
HAVING COUNT(*) > 1;


-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (kalau ternyata ada yang salah setelah COMMIT Tahap 3)
-- ════════════════════════════════════════════════════════════════════════════
-- Pulihkan baris yang terhapus dari tabel backup Tahap 2:

-- INSERT INTO gemas_store (collection, id, data, updated_at)
-- SELECT collection, id, data, updated_at
-- FROM gemas_store_backup_notification_dedup
-- ON CONFLICT (collection, id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- BERES-BERES (opsional, setelah yakin hasilnya benar dan tidak perlu rollback lagi)
-- ════════════════════════════════════════════════════════════════════════════
-- DROP TABLE gemas_store_backup_notification_dedup;
