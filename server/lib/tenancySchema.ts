// ============================================================
// MULTI-TENANT FOUNDATION — Fase 0: Database Foundation
// ============================================================
// GEMAS awalnya didesain single-tenant: satu tabel generik `gemas_store`
// (collection, id, data) tanpa kolom tenant sama sekali, dan modul Finance
// sudah punya kolom `organization_id` di tiap tabelnya tapi nilainya konstanta
// hardcode 'gpib-trinitas' (lihat FINANCE_ORG di financeCrud.ts).
//
// Fase 0 ini HANYA membangun fondasi skema + lapisan pertahanan database
// (RLS). Kode aplikasi (route/CRUD helper) BELUM diubah untuk benar-benar
// mengirim organization_id per user login -- itu Fase 1/2. Supaya app yang
// sedang berjalan sekarang (single-tenant, semua data milik GPIB Trinitas)
// TIDAK rusak begitu migrasi ini jalan, RLS policy di bawah punya fallback:
// kalau session belum men-set `app.current_org_id` (karena kode Fase 1/2
// belum jalan), policy default ke 'gpib-trinitas' -- perilaku persis sama
// seperti sebelum migrasi ini ada. Begitu Fase 1/2 selesai dan tiap request
// benar-benar men-set org dari token login, fallback ini otomatis tidak lagi
// relevan (setiap request sudah menyertakan org-nya sendiri).
//
// PENTING soal RLS & role database: RLS SELALU dilewati oleh superuser dan
// oleh owner tabel (kecuali FORCE ROW LEVEL SECURITY diaktifkan). Role yang
// dipakai aplikasi sekarang (POSTGRES_USER bawaan Docker) adalah superuser --
// artinya RLS di bawah TIDAK memproteksi apapun selama aplikasi masih connect
// pakai role itu. Makanya migrasi ini juga menyiapkan role terbatas
// `gemas_app_role` (belum bisa LOGIN, sengaja tanpa password dulu) yang sudah
// diberi hak SELECT/INSERT/UPDATE/DELETE tapi TIDAK superuser/BYPASSRLS.
// Mengaktifkan role ini (kasih LOGIN + password, lalu ganti DATABASE_URL) itu
// langkah operasional terpisah yang harus dilakukan sadar oleh pemilik infra
// -- tidak dilakukan otomatis di sini karena itu rotasi kredensial produksi.
//
// Idempotent: aman dijalankan berulang setiap server start, sama seperti
// initFinanceSchema (CREATE TABLE/INDEX IF NOT EXISTS, DO-block untuk hal
// yang tidak punya varian IF NOT EXISTS bawaan Postgres seperti ALTER
// CONSTRAINT / CREATE ROLE / CREATE POLICY).
// ============================================================

const TENANCY_SCHEMA_SQL = `
-- ── ORGANIZATIONS (tenant) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id            TEXT PRIMARY KEY,
  tenant_code   TEXT NOT NULL,
  name          TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_organizations_tenant_code UNIQUE (tenant_code)
);

-- Seed tenant pertama: data existing yang sudah ada semuanya milik GPIB
-- Trinitas -- id-nya sengaja disamakan dengan konstanta FINANCE_ORG yang
-- sudah dipakai modul Finance sejak awal, supaya data Finance existing tidak
-- perlu dimigrasi ulang saat Fase 3 (FINANCE_ORG jadi dinamis) nanti.
INSERT INTO organizations (id, tenant_code, name)
VALUES ('gpib-trinitas', 'TRINITAS', 'GPIB Trinitas')
ON CONFLICT (id) DO NOTHING;

-- ── GEMAS_STORE: tambah kolom organization_id ────────────────────────────────
-- Default ke tenant pertama supaya SEMUA baris lama otomatis ter-assign ke
-- GPIB Trinitas, bukan NULL (yang akan langsung melanggar constraint/pk baru).
ALTER TABLE gemas_store ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'gpib-trinitas';

-- Primary key TETAP (collection, id), SENGAJA TIDAK diubah di Fase 0 ini.
-- Ditemukan lewat pengujian nyata (bukan cuma node --check): banyak tempat
-- di kode (server/lib/db.ts, server/routes/letterNumbers.ts, backup.ts,
-- financeTransaction.ts/financeAudit jejak audit) masih hardcode
-- INSERT INTO gemas_store ... ON CONFLICT (collection, id) -- begitu PK
-- diganti jadi 3 kolom (collection, organization_id, id), klausa ON CONFLICT
-- 2-kolom itu tidak lagi cocok dengan constraint manapun dan Postgres
-- langsung melempar 42P10 (no unique or exclusion constraint matching ON
-- CONFLICT), yang bikin fitur nomor surat/backup/audit-trail finance semua
-- gagal 500. id yang dipakai di gemas_store praktis UUID, jadi (collection,
-- id) tetap unik secara global walau nanti sungguhan multi-tenant -- PK 3
-- kolom baru benar-benar dibutuhkan di Fase 2, saat semua titik ON CONFLICT
-- di atas memang sedang ditulis ulang bersamaan (CRUD generik jadi
-- transaksi eksplisit + organization_id per request). Sampai saat itu,
-- kolom organization_id + index + RLS di bawah sudah cukup untuk fondasi
-- tanpa merusak apapun yang sedang berjalan.

-- FK ke organizations -- RESTRICT (bukan CASCADE) supaya tenant tidak bisa
-- terhapus kalau masih ada datanya, konsisten dengan prinsip Finance module
-- yang selalu RESTRICT untuk mencegah kehilangan data tanpa sengaja.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_gemas_store_org') THEN
    ALTER TABLE gemas_store
      ADD CONSTRAINT fk_gemas_store_org FOREIGN KEY (organization_id)
      REFERENCES organizations(id) ON DELETE RESTRICT;
  END IF;
END $do$;

CREATE INDEX IF NOT EXISTS idx_gemas_store_org ON gemas_store (organization_id);

-- ── ROW LEVEL SECURITY (jaring pengaman di level database) ───────────────────
-- Tidak pakai FORCE ROW LEVEL SECURITY dengan sengaja -- superuser/owner tabel
-- (role migrasi/admin saat ini) tetap perlu bisa lihat semua tenant untuk
-- keperluan migrasi & (nanti) fitur Admin Pusat lintas-tenant. Yang dibatasi
-- RLS ini adalah role aplikasi biasa (gemas_app_role di bawah).
ALTER TABLE gemas_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON gemas_store;
CREATE POLICY tenant_isolation ON gemas_store
  USING (organization_id = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'gpib-trinitas'))
  WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'gpib-trinitas'));

-- ── ROLE APLIKASI TERBATAS (belum dipakai -- lihat catatan di atas file) ─────
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gemas_app_role') THEN
    CREATE ROLE gemas_app_role NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOLOGIN;
  END IF;
END $do$;

GRANT SELECT, INSERT, UPDATE, DELETE ON gemas_store TO gemas_app_role;
GRANT USAGE ON SCHEMA finance TO gemas_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA finance TO gemas_app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gemas_app_role;
`;

export async function initTenancySchema(pool: { query: (sql: string) => Promise<any> }) {
  await pool.query(TENANCY_SCHEMA_SQL);
}
