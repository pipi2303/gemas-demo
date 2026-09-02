-- cleanup-fake-birthdates.sql
--
-- Bug: scripts/import-jemaat-trinitas.mjs dan scripts/import-excel.py, sebelum diperbaiki,
-- men-default `birthDate` jemaat ke TANGGAL SAAT SKRIP IMPORT DIJALANKAN kalau kolom
-- "Tanggal Lahir" di Excel gagal di-parse (kosong/format aneh). Akibatnya banyak jemaat
-- yang tanggal lahir aslinya tidak diketahui malah tersimpan dengan birthDate yang sama
-- persis (tanggal impor), dan setiap tahun pada tanggal itu mereka muncul serentak sebagai
-- "ulang tahun hari ini" di Dashboard (lihat src/app/components/Dashboard.tsx baris ~592).
--
-- Jalankan tahapan di bawah SATU PER SATU, secara berurutan, langsung terhadap database
-- production Anda (mis. lewat psql atau console DB). Jangan skip langkah diagnostik dan
-- backup — UPDATE di Tahap 3 baru dijalankan setelah Anda mengonfirmasi sendiri daftar
-- tanggal mencurigakan dari Tahap 1.


-- ════════════════════════════════════════════════════════════════════════════
-- TAHAP 1 — DIAGNOSTIK (read-only, aman dijalankan kapan saja)
-- ════════════════════════════════════════════════════════════════════════════
-- Kelompokkan semua jemaat berdasarkan birthDate dan hitung berapa orang per tanggal.
-- Tanggal lahir asli jemaat seharusnya tersebar di banyak tanggal berbeda (paling banter
-- beberapa orang share tanggal yang sama secara kebetulan). Kalau ada SATU tanggal dengan
-- jumlah jauh di atas wajar (puluhan orang), itu hampir pasti korban bug ini, bukan
-- ulang tahun asli.

-- CATATAN: kolom `data` di tabel ini bertipe text (bukan jsonb), jadi perlu di-cast
-- eksplisit dengan `::jsonb` sebelum bisa pakai operator `->>`.

SELECT
  data::jsonb->>'birthDate' AS birth_date,
  COUNT(*)                  AS jumlah_jemaat,
  array_agg(data::jsonb->>'age' ORDER BY data::jsonb->>'age')  AS daftar_umur  -- umur seragam/nol = indikasi tambahan
FROM gemas_store
WHERE collection = 'members'
  AND data::jsonb->>'birthDate' IS NOT NULL
  AND data::jsonb->>'birthDate' <> ''
GROUP BY data::jsonb->>'birthDate'
ORDER BY jumlah_jemaat DESC
LIMIT 20;

-- Cara baca hasilnya:
--   * Baris paling atas dengan jumlah_jemaat jauh lebih besar dari baris lain (misal 88
--     vs baris berikutnya cuma 1-3) → itu tanggal mencurigakan (tanggal saat import dulu
--     dijalankan), catat tanggalnya.
--   * Kalau daftar_umur untuk tanggal itu isinya "0" berulang-ulang, atau isinya seragam
--     semua (misal usia yang sama persis untuk puluhan orang) → makin menguatkan dugaan.
--   * Boleh ada lebih dari satu tanggal mencurigakan kalau importnya dijalankan beberapa
--     kali di hari berbeda — catat SEMUA tanggal yang jumlahnya tidak wajar.
--
-- CATATAN: scripts/seed-birthday-test.sql sengaja menaruh 1 data uji coba dengan
-- birthDate '1990-08-23' (member 'test-birthday-member-1'). Itu data sengaja untuk testing,
-- BUKAN korban bug — biarkan saja kalau muncul di hasil (jumlahnya cuma 1, jadi tidak akan
-- lolos filter jumlah_jemaat besar di Tahap 3 manapun).


-- ════════════════════════════════════════════════════════════════════════════
-- TAHAP 2 — BACKUP (WAJIB sebelum UPDATE, supaya bisa di-rollback)
-- ════════════════════════════════════════════════════════════════════════════
-- Ganti daftar tanggal di bawah ini ('2026-08-29', dst) dengan tanggal-tanggal
-- mencurigakan hasil Tahap 1.

-- Dikonfirmasi dari Tahap 1 (dijalankan 2026-09-02): tanggal '2026-09-02' punya 87 jemaat,
-- jauh di atas tanggal lain (maksimal 2) -> ini tanggal bug, bukan ulang tahun asli.
CREATE TABLE IF NOT EXISTS gemas_store_backup_birthdate_fix AS
SELECT *, now() AS backed_up_at
FROM gemas_store
WHERE collection = 'members'
  AND data::jsonb->>'birthDate' IN (
    '2026-09-02'
  );

-- Verifikasi jumlah baris yang ter-backup cocok dengan jumlah_jemaat di Tahap 1:
SELECT COUNT(*) FROM gemas_store_backup_birthdate_fix;


-- ════════════════════════════════════════════════════════════════════════════
-- TAHAP 3 — UPDATE (mengosongkan birthDate yang terbukti palsu)
-- ════════════════════════════════════════════════════════════════════════════
-- Set birthDate jadi '' (string kosong, konsisten dengan fix di kedua skrip import)
-- untuk baris yang sudah dikonfirmasi di Tahap 1 dan sudah di-backup di Tahap 2.
-- Field lain (age, dll) sengaja TIDAK diubah di sini — kalau mau, tangani menyusul
-- setelah verifikasi mana yang age-nya juga ikut salah.

BEGIN;

UPDATE gemas_store
SET data = jsonb_set(data::jsonb, '{birthDate}', '""'::jsonb)::text
WHERE collection = 'members'
  AND data::jsonb->>'birthDate' IN (
    '2026-09-02'   -- << samakan persis dengan daftar tanggal di Tahap 2
  );

-- Cek dulu jumlah baris yang ke-update (harus sama dengan hasil COUNT di Tahap 2)
-- sebelum COMMIT. Kalau ada yang aneh (jumlahnya beda), ROLLBACK dan cek ulang.

COMMIT;
-- atau: ROLLBACK;   -- kalau ragu, batalkan dulu dan cek lagi


-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (kalau ternyata ada yang salah setelah COMMIT di atas)
-- ════════════════════════════════════════════════════════════════════════════
-- Pulihkan birthDate dari tabel backup Tahap 2:

-- UPDATE gemas_store g
-- SET data = b.data
-- FROM gemas_store_backup_birthdate_fix b
-- WHERE g.collection = 'members'
--   AND g.id = b.id
--   AND b.collection = 'members';


-- ════════════════════════════════════════════════════════════════════════════
-- TAHAP 4 — Bersihkan kolom `age` untuk 87 orang yang sama (menyusul temuan Tahap 1:
-- age-nya ikut berantakan, ada nilai seperti "2026" yang jelas bukan umur)
-- ════════════════════════════════════════════════════════════════════════════
-- Pakai id dari gemas_store_backup_birthdate_fix (bukan cocokkan ulang lewat birthDate,
-- karena birthDate 87 orang ini sekarang sudah kosong) supaya tepat sasaran ke baris yang
-- sama persis dengan yang sudah diperbaiki di Tahap 3.

-- 4a. Diagnostik dulu — lihat sebaran age saat ini untuk 87 orang ini:
SELECT data::jsonb->>'age' AS age, COUNT(*)
FROM gemas_store
WHERE collection = 'members'
  AND id IN (SELECT id FROM gemas_store_backup_birthdate_fix)
GROUP BY data::jsonb->>'age'
ORDER BY COUNT(*) DESC;

-- 4b. HASIL DIAGNOSTIK 4a (dijalankan 2026-09-02): dari 87 orang ini, 46 age-nya sudah 0
-- (aman, sesuai kondisi birthDate kosong), 36 punya age wajar (2-74 tahun -- ini umur ASLI
-- dari kolom "usia" Excel, independen dari bug birthDate, JANGAN ditimpa), dan HANYA 5
-- orang age-nya '2026' -- itu jelas bug (bukan umur, kemungkinan kolom usia kebaca angka
-- tahun). Maka hanya 5 baris age='2026' ini yang dibersihkan, bukan semua 87.
BEGIN;

UPDATE gemas_store
SET data = jsonb_set(data::jsonb, '{age}', '0'::jsonb)::text
WHERE collection = 'members'
  AND id IN (SELECT id FROM gemas_store_backup_birthdate_fix)
  AND data::jsonb->>'age' = '2026';

-- Cek dulu jumlah baris yang ke-update harus 5 sebelum COMMIT.

COMMIT;
-- atau: ROLLBACK;


-- ════════════════════════════════════════════════════════════════════════════
-- TAHAP 5 — Cek total jemaat & scan field tanggal lain untuk pola bug serupa
-- ════════════════════════════════════════════════════════════════════════════
-- Dicek di kode: marriageDateChurch/marriageDateCivil/baptismDate/sidiDate/joinDate di
-- kedua skrip import TIDAK punya fallback "|| now" seperti birthDate -- jadi secara kode
-- bug ini seharusnya hanya menimpa birthDate. Query di bawah untuk memastikan tidak ada
-- residu cluster mencurigakan di field lain dari sumber lain (input manual, import lama,
-- dll), murni read-only.

-- 5a. Total jemaat saat ini:
SELECT COUNT(*) AS total_jemaat
FROM gemas_store
WHERE collection = 'members';

-- 5b. Scan tiap field tanggal: tampilkan nilai yang paling sering muncul per field.
-- Kalau salah satu field punya satu nilai dengan jumlah jauh di atas yang lain (pola sama
-- seperti birthDate kemarin: 87 vs maksimal 2), itu tandanya field itu juga kena masalah
-- serupa dan perlu diselidiki/cleanup terpisah.
SELECT 'marriageDateChurch' AS field, data::jsonb->>'marriageDateChurch' AS value, COUNT(*)
FROM gemas_store WHERE collection = 'members' AND data::jsonb->>'marriageDateChurch' IS NOT NULL AND data::jsonb->>'marriageDateChurch' <> ''
GROUP BY 1,2 ORDER BY 3 DESC LIMIT 3;

SELECT 'marriageDateCivil' AS field, data::jsonb->>'marriageDateCivil' AS value, COUNT(*)
FROM gemas_store WHERE collection = 'members' AND data::jsonb->>'marriageDateCivil' IS NOT NULL AND data::jsonb->>'marriageDateCivil' <> ''
GROUP BY 1,2 ORDER BY 3 DESC LIMIT 3;

SELECT 'baptismDate' AS field, data::jsonb->>'baptismDate' AS value, COUNT(*)
FROM gemas_store WHERE collection = 'members' AND data::jsonb->>'baptismDate' IS NOT NULL AND data::jsonb->>'baptismDate' <> ''
GROUP BY 1,2 ORDER BY 3 DESC LIMIT 3;

SELECT 'sidiDate' AS field, data::jsonb->>'sidiDate' AS value, COUNT(*)
FROM gemas_store WHERE collection = 'members' AND data::jsonb->>'sidiDate' IS NOT NULL AND data::jsonb->>'sidiDate' <> ''
GROUP BY 1,2 ORDER BY 3 DESC LIMIT 3;

SELECT 'joinDate' AS field, data::jsonb->>'joinDate' AS value, COUNT(*)
FROM gemas_store WHERE collection = 'members' AND data::jsonb->>'joinDate' IS NOT NULL AND data::jsonb->>'joinDate' <> ''
GROUP BY 1,2 ORDER BY 3 DESC LIMIT 3;

-- Cara baca: bandingkan angka COUNT teratas tiap field dengan total_jemaat dari 5a dan
-- dengan baris-baris di bawahnya. Kalau wajar (tersebar, tidak ada satu nilai yang jauh
-- lebih tinggi dari yang lain), field itu bersih -- tidak perlu tindakan lanjutan.


-- ════════════════════════════════════════════════════════════════════════════
-- BERES-BERES (opsional, setelah yakin hasilnya benar dan tidak perlu rollback lagi)
-- ════════════════════════════════════════════════════════════════════════════
-- DROP TABLE gemas_store_backup_birthdate_fix;
