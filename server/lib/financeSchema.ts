// ============================================================
// FINANCE ADD-ON MODULE — Fase 0: Database Foundation
// ============================================================
// Skema PostgreSQL untuk domain akuntansi Finance Add-on, diadaptasi dari
// spesifikasi "Finance_Addon_PostgreSQL_Schema_v1.0.sql".
//
// Adaptasi terhadap spesifikasi asli (diizinkan oleh dokumen sumber —
// lihat BRD v2 §55 "Final Recommendation": nama tabel/tipe data/constraint
// boleh disesuaikan dengan standar aplikasi existing, prinsip akuntansi
// tidak boleh dihilangkan):
//   • Kolom referensi user Admin System (created_by/updated_by/verified_by/
//     approved_by/posted_by/dst) dan organization_id diubah dari UUID → TEXT,
//     karena GEMAS menyimpan id user sebagai string (mis. "u_pipi"), bukan UUID.
//   • organization_id memakai konstanta single-tenant 'gpib-trinitas' karena
//     GEMAS belum punya konsep multi-organisasi.
//   • Entity milik Finance sendiri (accounts, budgets, transactions, journals,
//     dst.) tetap UUID sesuai spesifikasi asli — relasi antar tabel finance
//     tidak berubah.
//   • Idempotent: aman dijalankan berulang setiap server start (CREATE TABLE/
//     INDEX IF NOT EXISTS, DO-block untuk enum, CREATE OR REPLACE untuk
//     fungsi/view/trigger).
//
// Prinsip akuntansi yang TETAP dijaga di level database:
//   • debit >= 0, credit >= 0, exactly-one-side per baris transaksi/jurnal.
//   • total_debit = total_credit pada finance.journals (CHECK constraint).
//   • Posted journal tidak boleh dihapus (tidak ada ON DELETE CASCADE ke
//     journals/journal_lines dari sisi manapun; FK selalu RESTRICT).
//   • Voucher number & journal number unique per organization.
// ============================================================

export const FINANCE_SCHEMA_SQL = `
BEGIN;

CREATE SCHEMA IF NOT EXISTS finance;

-- ── ENUM TYPES (idempotent via DO-block) ────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE finance.account_type AS ENUM
    ('ASSET','LIABILITY','FUND_BALANCE','REVENUE','EXPENSE','TRANSFER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE finance.normal_balance AS ENUM ('DEBIT','CREDIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE finance.period_status AS ENUM
    ('OPEN','SOFT_CLOSED','CLOSED','LOCKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE finance.budget_status AS ENUM
    ('DRAFT','SUBMITTED','REVIEWED','APPROVED','ACTIVE','REVISED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Catatan: REVISION_REQUIRED sengaja BELUM dipakai oleh kode manapun (lihat
-- komentar di server/routes/financeTransaction.ts) — alur REJECTED -> revisi
-- -> DRAFT yang sudah ada sekarang sudah mencakup kasus "kembalikan untuk
-- diperbaiki". Nilai enum ini tetap dipertahankan (bukan dihapus) supaya
-- siap dipakai kalau suatu saat ada keputusan produk yang membedakannya
-- secara jelas dari REJECTED.
DO $$ BEGIN
  CREATE TYPE finance.transaction_status AS ENUM
    ('DRAFT','SUBMITTED','VERIFIED','REJECTED','REVISION_REQUIRED',
     'APPROVED','POSTED','REVERSED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE finance.transaction_type AS ENUM
    ('RECEIPT','PAYMENT','CASH_IN','CASH_OUT','BANK_IN','BANK_OUT',
     'TRANSFER','MEMORIAL','ADJUSTMENT','REVERSAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE finance.restriction_type AS ENUM
    ('UNRESTRICTED','RESTRICTED','TEMPORARILY_RESTRICTED','PERMANENTLY_RESTRICTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE finance.fund_type AS ENUM
    ('GENERAL','PROGRAM','SPECIAL','BUILDING','DIAKONIA','SINODAL','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE finance.reconciliation_status AS ENUM
    ('DRAFT','IN_PROGRESS','COMPLETED','APPROVED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE finance.matching_status AS ENUM
    ('MATCHED','PARTIAL','UNMATCHED','ADJUSTMENT','RECONCILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── COMMON TRIGGER FUNCTION ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION finance.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $f$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$f$;

-- ── ACCOUNT GROUPS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.account_groups (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   TEXT NOT NULL DEFAULT 'gpib-trinitas',
  code              VARCHAR(20) NOT NULL,
  name              VARCHAR(100) NOT NULL,
  account_type      finance.account_type NOT NULL,
  normal_balance    finance.normal_balance NOT NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        TEXT,
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT uq_account_group_code UNIQUE (organization_id, code)
);
CREATE INDEX IF NOT EXISTS idx_account_groups_org_type
  ON finance.account_groups (organization_id, account_type);

-- ── CHART OF ACCOUNTS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      TEXT NOT NULL DEFAULT 'gpib-trinitas',
  group_id             UUID NOT NULL REFERENCES finance.account_groups(id) ON DELETE RESTRICT,
  parent_id            UUID REFERENCES finance.accounts(id) ON DELETE RESTRICT,
  code                 VARCHAR(30) NOT NULL,
  name                 VARCHAR(200) NOT NULL,
  account_type         finance.account_type NOT NULL,
  normal_balance       finance.normal_balance NOT NULL,
  level                SMALLINT NOT NULL DEFAULT 1,
  is_postable          BOOLEAN NOT NULL DEFAULT TRUE,
  is_control_account   BOOLEAN NOT NULL DEFAULT FALSE,
  opening_balance      NUMERIC(20,2) NOT NULL DEFAULT 0,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by           TEXT NOT NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by           TEXT,
  deleted_at           TIMESTAMPTZ,
  CONSTRAINT uq_account_code UNIQUE (organization_id, code),
  CONSTRAINT ck_account_level CHECK (level >= 1),
  CONSTRAINT ck_account_opening_balance CHECK (opening_balance >= 0),
  CONSTRAINT ck_account_not_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX IF NOT EXISTS idx_accounts_org_parent ON finance.accounts (organization_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_accounts_org_type ON finance.accounts (organization_id, account_type);
CREATE INDEX IF NOT EXISTS idx_accounts_org_postable ON finance.accounts (organization_id, is_postable);

-- ── FIELDS (Bidang/Unit) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.fields (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   TEXT NOT NULL DEFAULT 'gpib-trinitas',
  parent_id         UUID REFERENCES finance.fields(id) ON DELETE RESTRICT,
  code              VARCHAR(30) NOT NULL,
  name              VARCHAR(150) NOT NULL,
  description       TEXT,
  manager_user_id   TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        TEXT,
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT uq_field_code UNIQUE (organization_id, code),
  CONSTRAINT ck_field_not_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX IF NOT EXISTS idx_fields_org_parent ON finance.fields (organization_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_fields_manager ON finance.fields (manager_user_id);

-- ── PROGRAMS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.programs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   TEXT NOT NULL DEFAULT 'gpib-trinitas',
  field_id          UUID NOT NULL REFERENCES finance.fields(id) ON DELETE RESTRICT,
  code              VARCHAR(30) NOT NULL,
  name              VARCHAR(200) NOT NULL,
  description       TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        TEXT,
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT uq_program_code UNIQUE (organization_id, field_id, code)
);
CREATE INDEX IF NOT EXISTS idx_programs_field ON finance.programs (field_id);

-- ── ACTIVITIES (Kegiatan) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.activities (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   TEXT NOT NULL DEFAULT 'gpib-trinitas',
  program_id        UUID NOT NULL REFERENCES finance.programs(id) ON DELETE RESTRICT,
  code              VARCHAR(30) NOT NULL,
  name              VARCHAR(200) NOT NULL,
  description       TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        TEXT,
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT uq_activity_code UNIQUE (organization_id, program_id, code)
);
CREATE INDEX IF NOT EXISTS idx_activities_program ON finance.activities (program_id);

-- ── FUNDS ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.funds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   TEXT NOT NULL DEFAULT 'gpib-trinitas',
  parent_id         UUID REFERENCES finance.funds(id) ON DELETE RESTRICT,
  code              VARCHAR(30) NOT NULL,
  name              VARCHAR(150) NOT NULL,
  fund_type         finance.fund_type NOT NULL,
  restriction_type  finance.restriction_type NOT NULL,
  opening_balance   NUMERIC(20,2) NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        TEXT,
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT uq_fund_code UNIQUE (organization_id, code),
  CONSTRAINT ck_fund_opening_balance CHECK (opening_balance >= 0),
  CONSTRAINT ck_fund_not_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX IF NOT EXISTS idx_funds_org_type ON finance.funds (organization_id, fund_type);

-- ── FISCAL YEARS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.fiscal_years (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   TEXT NOT NULL DEFAULT 'gpib-trinitas',
  code              VARCHAR(20) NOT NULL,
  name              VARCHAR(100) NOT NULL,
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  is_current        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        TEXT,
  CONSTRAINT uq_fiscal_year_code UNIQUE (organization_id, code),
  CONSTRAINT ck_fiscal_year_dates CHECK (start_date < end_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_year_current
  ON finance.fiscal_years (organization_id) WHERE is_current = TRUE;

-- ── PERIODS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.periods (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id   UUID NOT NULL REFERENCES finance.fiscal_years(id) ON DELETE RESTRICT,
  period_number    SMALLINT NOT NULL,
  code             VARCHAR(20) NOT NULL,
  name             VARCHAR(50) NOT NULL,
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  quarter          SMALLINT NOT NULL,
  status           finance.period_status NOT NULL DEFAULT 'OPEN',
  closed_at        TIMESTAMPTZ,
  closed_by        TEXT,
  CONSTRAINT uq_period_number UNIQUE (fiscal_year_id, period_number),
  CONSTRAINT uq_period_code UNIQUE (fiscal_year_id, code),
  CONSTRAINT ck_period_number CHECK (period_number BETWEEN 1 AND 12),
  CONSTRAINT ck_period_quarter CHECK (quarter BETWEEN 1 AND 4),
  CONSTRAINT ck_period_dates CHECK (start_date <= end_date)
);
CREATE INDEX IF NOT EXISTS idx_periods_status ON finance.periods (status);

-- ── CASH ACCOUNTS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.cash_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   TEXT NOT NULL DEFAULT 'gpib-trinitas',
  account_id        UUID NOT NULL REFERENCES finance.accounts(id) ON DELETE RESTRICT,
  code              VARCHAR(30) NOT NULL,
  name              VARCHAR(150) NOT NULL,
  location          VARCHAR(200),
  opening_balance   NUMERIC(20,2) NOT NULL DEFAULT 0,
  current_balance   NUMERIC(20,2) NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        TEXT,
  CONSTRAINT uq_cash_account_code UNIQUE (organization_id, code),
  CONSTRAINT ck_cash_balance CHECK (current_balance >= 0)
);
CREATE INDEX IF NOT EXISTS idx_cash_accounts_gl ON finance.cash_accounts (account_id);

-- ── BANK ACCOUNTS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.bank_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   TEXT NOT NULL DEFAULT 'gpib-trinitas',
  account_id        UUID NOT NULL REFERENCES finance.accounts(id) ON DELETE RESTRICT,
  bank_name         VARCHAR(100) NOT NULL,
  bank_code         VARCHAR(20),
  account_number    VARCHAR(100) NOT NULL,
  account_name      VARCHAR(200) NOT NULL,
  currency          CHAR(3) NOT NULL DEFAULT 'IDR',
  opening_balance   NUMERIC(20,2) NOT NULL DEFAULT 0,
  current_balance   NUMERIC(20,2) NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        TEXT,
  CONSTRAINT uq_bank_account_number UNIQUE (organization_id, account_number),
  CONSTRAINT ck_bank_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_bank_balance CHECK (current_balance >= 0)
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_gl ON finance.bank_accounts (account_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_bank ON finance.bank_accounts (organization_id, bank_name);

-- ── VOUCHER TYPES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.voucher_types (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    TEXT NOT NULL DEFAULT 'gpib-trinitas',
  code               VARCHAR(20) NOT NULL,
  name               VARCHAR(100) NOT NULL,
  transaction_type   finance.transaction_type NOT NULL,
  prefix             VARCHAR(20) NOT NULL,
  sequence_scope     VARCHAR(30) NOT NULL DEFAULT 'FISCAL_YEAR',
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         TEXT NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         TEXT,
  CONSTRAINT uq_voucher_type_code UNIQUE (organization_id, code)
);

-- ── VOUCHER SEQUENCES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.voucher_sequences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   TEXT NOT NULL DEFAULT 'gpib-trinitas',
  fiscal_year_id    UUID NOT NULL REFERENCES finance.fiscal_years(id) ON DELETE RESTRICT,
  voucher_type_id   UUID NOT NULL REFERENCES finance.voucher_types(id) ON DELETE RESTRICT,
  current_number    BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT uq_voucher_sequence UNIQUE (organization_id, fiscal_year_id, voucher_type_id),
  CONSTRAINT ck_voucher_sequence_number CHECK (current_number >= 0)
);

-- ── JOURNAL SEQUENCES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.journal_sequences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   TEXT NOT NULL DEFAULT 'gpib-trinitas',
  fiscal_year_id    UUID NOT NULL REFERENCES finance.fiscal_years(id) ON DELETE RESTRICT,
  current_number    BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT uq_journal_sequence UNIQUE (organization_id, fiscal_year_id),
  CONSTRAINT ck_journal_sequence_number CHECK (current_number >= 0)
);

-- ── BUDGETS / RKA ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.budgets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    TEXT NOT NULL DEFAULT 'gpib-trinitas',
  fiscal_year_id     UUID NOT NULL REFERENCES finance.fiscal_years(id) ON DELETE RESTRICT,
  version            INTEGER NOT NULL DEFAULT 1,
  code               VARCHAR(50) NOT NULL,
  name               VARCHAR(200) NOT NULL,
  status             finance.budget_status NOT NULL DEFAULT 'DRAFT',
  submitted_at       TIMESTAMPTZ,
  submitted_by       TEXT,
  approved_at        TIMESTAMPTZ,
  approved_by        TEXT,
  revision_reason    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         TEXT NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         TEXT,
  CONSTRAINT uq_budget_code UNIQUE (organization_id, code),
  CONSTRAINT uq_budget_version UNIQUE (organization_id, fiscal_year_id, version),
  CONSTRAINT ck_budget_version CHECK (version >= 1)
);
CREATE INDEX IF NOT EXISTS idx_budgets_fiscal_status ON finance.budgets (fiscal_year_id, status);

CREATE TABLE IF NOT EXISTS finance.budget_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id          UUID NOT NULL REFERENCES finance.budgets(id) ON DELETE RESTRICT,
  account_id         UUID NOT NULL REFERENCES finance.accounts(id) ON DELETE RESTRICT,
  field_id           UUID REFERENCES finance.fields(id) ON DELETE RESTRICT,
  program_id         UUID REFERENCES finance.programs(id) ON DELETE RESTRICT,
  activity_id        UUID REFERENCES finance.activities(id) ON DELETE RESTRICT,
  fund_id            UUID REFERENCES finance.funds(id) ON DELETE RESTRICT,
  period_id          UUID NOT NULL REFERENCES finance.periods(id) ON DELETE RESTRICT,
  description        TEXT,
  budget_amount      NUMERIC(20,2) NOT NULL DEFAULT 0,
  committed_amount   NUMERIC(20,2) NOT NULL DEFAULT 0,
  actual_amount      NUMERIC(20,2) NOT NULL DEFAULT 0,
  available_amount   NUMERIC(20,2) GENERATED ALWAYS AS
    (budget_amount - committed_amount - actual_amount) STORED,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         TEXT NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         TEXT,
  CONSTRAINT ck_budget_amount CHECK (budget_amount >= 0),
  CONSTRAINT ck_budget_committed CHECK (committed_amount >= 0),
  CONSTRAINT ck_budget_actual CHECK (actual_amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_budget_lines_budget ON finance.budget_lines (budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_account_period ON finance.budget_lines (account_id, period_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_field ON finance.budget_lines (field_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_program ON finance.budget_lines (program_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_fund ON finance.budget_lines (fund_id);

-- ── VOUCHERS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.vouchers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    TEXT NOT NULL DEFAULT 'gpib-trinitas',
  fiscal_year_id     UUID NOT NULL REFERENCES finance.fiscal_years(id) ON DELETE RESTRICT,
  period_id          UUID NOT NULL REFERENCES finance.periods(id) ON DELETE RESTRICT,
  voucher_type_id    UUID NOT NULL REFERENCES finance.voucher_types(id) ON DELETE RESTRICT,
  voucher_number     VARCHAR(60) NOT NULL,
  voucher_date       DATE NOT NULL,
  reference_number   VARCHAR(100),
  description        TEXT,
  status             finance.transaction_status NOT NULL DEFAULT 'DRAFT',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         TEXT NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         TEXT,
  CONSTRAINT uq_voucher_number UNIQUE (organization_id, fiscal_year_id, voucher_number)
);
CREATE INDEX IF NOT EXISTS idx_vouchers_period_date ON finance.vouchers (period_id, voucher_date);

-- ── TRANSACTIONS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    TEXT NOT NULL DEFAULT 'gpib-trinitas',
  voucher_id         UUID NOT NULL UNIQUE REFERENCES finance.vouchers(id) ON DELETE RESTRICT,
  fiscal_year_id     UUID NOT NULL REFERENCES finance.fiscal_years(id) ON DELETE RESTRICT,
  period_id          UUID NOT NULL REFERENCES finance.periods(id) ON DELETE RESTRICT,
  transaction_type   finance.transaction_type NOT NULL,
  transaction_date   DATE NOT NULL,
  payer_name         VARCHAR(200),
  payee_name         VARCHAR(200),
  description        TEXT NOT NULL,
  reference_number   VARCHAR(100),
  total_debit        NUMERIC(20,2) NOT NULL DEFAULT 0,
  total_credit       NUMERIC(20,2) NOT NULL DEFAULT 0,
  status             finance.transaction_status NOT NULL DEFAULT 'DRAFT',
  submitted_at       TIMESTAMPTZ,
  submitted_by       TEXT,
  verified_at        TIMESTAMPTZ,
  verified_by        TEXT,
  approved_at        TIMESTAMPTZ,
  approved_by        TEXT,
  posted_at          TIMESTAMPTZ,
  posted_by          TEXT,
  rejection_reason   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         TEXT NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         TEXT,
  CONSTRAINT ck_transaction_totals CHECK (total_debit >= 0 AND total_credit >= 0)
);
CREATE INDEX IF NOT EXISTS idx_transactions_org_date ON finance.transactions (organization_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_org_status ON finance.transactions (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_period_status ON finance.transactions (period_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON finance.transactions (organization_id, transaction_type);

CREATE TABLE IF NOT EXISTS finance.transaction_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id     UUID NOT NULL REFERENCES finance.transactions(id) ON DELETE CASCADE,
  line_number        INTEGER NOT NULL,
  account_id         UUID NOT NULL REFERENCES finance.accounts(id) ON DELETE RESTRICT,
  field_id           UUID REFERENCES finance.fields(id) ON DELETE RESTRICT,
  program_id         UUID REFERENCES finance.programs(id) ON DELETE RESTRICT,
  activity_id        UUID REFERENCES finance.activities(id) ON DELETE RESTRICT,
  fund_id            UUID REFERENCES finance.funds(id) ON DELETE RESTRICT,
  cash_account_id    UUID REFERENCES finance.cash_accounts(id) ON DELETE RESTRICT,
  bank_account_id    UUID REFERENCES finance.bank_accounts(id) ON DELETE RESTRICT,
  description        TEXT,
  debit              NUMERIC(20,2) NOT NULL DEFAULT 0,
  credit             NUMERIC(20,2) NOT NULL DEFAULT 0,
  budget_line_id     UUID REFERENCES finance.budget_lines(id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_transaction_line UNIQUE (transaction_id, line_number),
  CONSTRAINT ck_transaction_line_amount CHECK (debit >= 0 AND credit >= 0),
  CONSTRAINT ck_transaction_line_one_side CHECK
    ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);
CREATE INDEX IF NOT EXISTS idx_transaction_lines_account ON finance.transaction_lines (account_id);
CREATE INDEX IF NOT EXISTS idx_transaction_lines_field ON finance.transaction_lines (field_id);
CREATE INDEX IF NOT EXISTS idx_transaction_lines_program ON finance.transaction_lines (program_id);
CREATE INDEX IF NOT EXISTS idx_transaction_lines_fund ON finance.transaction_lines (fund_id);
CREATE INDEX IF NOT EXISTS idx_transaction_lines_budget ON finance.transaction_lines (budget_line_id);

-- ── JOURNALS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.journals (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          TEXT NOT NULL DEFAULT 'gpib-trinitas',
  transaction_id           UUID NOT NULL REFERENCES finance.transactions(id) ON DELETE RESTRICT,
  voucher_id               UUID NOT NULL REFERENCES finance.vouchers(id) ON DELETE RESTRICT,
  fiscal_year_id           UUID NOT NULL REFERENCES finance.fiscal_years(id) ON DELETE RESTRICT,
  period_id                UUID NOT NULL REFERENCES finance.periods(id) ON DELETE RESTRICT,
  journal_number           VARCHAR(60) NOT NULL,
  journal_date             DATE NOT NULL,
  description              TEXT,
  total_debit              NUMERIC(20,2) NOT NULL DEFAULT 0,
  total_credit             NUMERIC(20,2) NOT NULL DEFAULT 0,
  status                   VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  posted_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_by                TEXT NOT NULL,
  reversal_of_journal_id   UUID REFERENCES finance.journals(id) ON DELETE RESTRICT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_journal_number UNIQUE (organization_id, journal_number),
  CONSTRAINT ck_journal_totals CHECK (total_debit = total_credit)
);
CREATE INDEX IF NOT EXISTS idx_journals_org_date ON finance.journals (organization_id, journal_date);
CREATE INDEX IF NOT EXISTS idx_journals_period ON finance.journals (period_id);
-- Migrasi untuk instalasi lama: konstrain UNIQUE polos di transaction_id (dari versi
-- schema sebelumnya) membuat /:id/reverse SELALU gagal dengan duplicate-key, karena
-- jurnal pembalik sengaja memakai transaction_id yang SAMA dengan jurnal asal. Diganti
-- dengan unique index parsial: hanya jurnal ASLI (reversal_of_journal_id IS NULL) yang
-- wajib unik per transaksi, jurnal pembalik (reversal_of_journal_id IS NOT NULL)
-- dikecualikan.
ALTER TABLE finance.journals DROP CONSTRAINT IF EXISTS journals_transaction_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_transaction_original
  ON finance.journals (transaction_id) WHERE reversal_of_journal_id IS NULL;

CREATE TABLE IF NOT EXISTS finance.journal_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id     UUID NOT NULL REFERENCES finance.journals(id) ON DELETE RESTRICT,
  line_number    INTEGER NOT NULL,
  account_id     UUID NOT NULL REFERENCES finance.accounts(id) ON DELETE RESTRICT,
  field_id       UUID REFERENCES finance.fields(id) ON DELETE RESTRICT,
  program_id     UUID REFERENCES finance.programs(id) ON DELETE RESTRICT,
  activity_id    UUID REFERENCES finance.activities(id) ON DELETE RESTRICT,
  fund_id        UUID REFERENCES finance.funds(id) ON DELETE RESTRICT,
  debit          NUMERIC(20,2) NOT NULL DEFAULT 0,
  credit         NUMERIC(20,2) NOT NULL DEFAULT 0,
  description    TEXT,
  CONSTRAINT uq_journal_line UNIQUE (journal_id, line_number),
  CONSTRAINT ck_journal_line_amount CHECK (debit >= 0 AND credit >= 0),
  CONSTRAINT ck_journal_line_one_side CHECK
    ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON finance.journal_lines (account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_field ON finance.journal_lines (field_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_program ON finance.journal_lines (program_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_fund ON finance.journal_lines (fund_id);

-- ── BANK STATEMENTS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.bank_statements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    TEXT NOT NULL DEFAULT 'gpib-trinitas',
  bank_account_id    UUID NOT NULL REFERENCES finance.bank_accounts(id) ON DELETE RESTRICT,
  statement_number   VARCHAR(100),
  statement_date     DATE NOT NULL,
  opening_balance    NUMERIC(20,2) NOT NULL,
  closing_balance    NUMERIC(20,2) NOT NULL,
  source_type        VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  file_id            TEXT,
  imported_at        TIMESTAMPTZ,
  imported_by        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bank_statements_account_date ON finance.bank_statements (bank_account_id, statement_date);

CREATE TABLE IF NOT EXISTS finance.bank_statement_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id       UUID NOT NULL REFERENCES finance.bank_statements(id) ON DELETE CASCADE,
  line_number        INTEGER NOT NULL,
  transaction_date   DATE NOT NULL,
  value_date         DATE,
  reference_number   VARCHAR(200),
  description        TEXT,
  debit              NUMERIC(20,2) NOT NULL DEFAULT 0,
  credit             NUMERIC(20,2) NOT NULL DEFAULT 0,
  balance            NUMERIC(20,2),
  matching_status    finance.matching_status NOT NULL DEFAULT 'UNMATCHED',
  external_hash      VARCHAR(128),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_bank_statement_line UNIQUE (statement_id, line_number),
  CONSTRAINT ck_statement_line_amount CHECK (debit >= 0 AND credit >= 0),
  CONSTRAINT ck_statement_line_one_side CHECK
    ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statement_external_hash
  ON finance.bank_statement_lines (statement_id, external_hash) WHERE external_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_matching ON finance.bank_statement_lines (statement_id, matching_status);

-- ── RECONCILIATION ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.reconciliations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    TEXT NOT NULL DEFAULT 'gpib-trinitas',
  bank_account_id    UUID NOT NULL REFERENCES finance.bank_accounts(id) ON DELETE RESTRICT,
  period_id          UUID NOT NULL REFERENCES finance.periods(id) ON DELETE RESTRICT,
  statement_id       UUID REFERENCES finance.bank_statements(id) ON DELETE RESTRICT,
  system_balance     NUMERIC(20,2) NOT NULL,
  bank_balance       NUMERIC(20,2) NOT NULL,
  difference         NUMERIC(20,2) NOT NULL,
  status             finance.reconciliation_status NOT NULL DEFAULT 'DRAFT',
  completed_at       TIMESTAMPTZ,
  completed_by       TEXT,
  approved_at        TIMESTAMPTZ,
  approved_by        TEXT,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         TEXT NOT NULL,
  CONSTRAINT ck_reconciliation_difference CHECK (difference = bank_balance - system_balance)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reconciliation_period
  ON finance.reconciliations (bank_account_id, period_id) WHERE status <> 'CANCELLED';

CREATE TABLE IF NOT EXISTS finance.reconciliation_matches (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id    UUID NOT NULL REFERENCES finance.reconciliations(id) ON DELETE CASCADE,
  statement_line_id    UUID NOT NULL REFERENCES finance.bank_statement_lines(id) ON DELETE RESTRICT,
  transaction_id       UUID REFERENCES finance.transactions(id) ON DELETE RESTRICT,
  journal_id           UUID REFERENCES finance.journals(id) ON DELETE RESTRICT,
  matched_amount       NUMERIC(20,2) NOT NULL,
  match_type           VARCHAR(20) NOT NULL,
  confidence_score     NUMERIC(5,2),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by           TEXT NOT NULL,
  CONSTRAINT ck_match_amount CHECK (matched_amount > 0),
  CONSTRAINT ck_match_confidence CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS idx_recon_matches_statement ON finance.reconciliation_matches (statement_line_id);
CREATE INDEX IF NOT EXISTS idx_recon_matches_transaction ON finance.reconciliation_matches (transaction_id);

-- ── PERIOD CLOSING ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance.period_closings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id          UUID NOT NULL UNIQUE REFERENCES finance.periods(id) ON DELETE RESTRICT,
  checklist_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  unresolved_count   INTEGER NOT NULL DEFAULT 0,
  status             VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  closed_at          TIMESTAMPTZ,
  closed_by          TEXT,
  reopened_at        TIMESTAMPTZ,
  reopened_by        TEXT,
  reopen_reason      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_closing_unresolved CHECK (unresolved_count >= 0)
);

-- ── UPDATED_AT TRIGGERS (idempotent via CREATE OR REPLACE TRIGGER, PG14+) ────
CREATE OR REPLACE TRIGGER trg_account_groups_updated
  BEFORE UPDATE ON finance.account_groups FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();
CREATE OR REPLACE TRIGGER trg_accounts_updated
  BEFORE UPDATE ON finance.accounts FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();
CREATE OR REPLACE TRIGGER trg_fields_updated
  BEFORE UPDATE ON finance.fields FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();
CREATE OR REPLACE TRIGGER trg_programs_updated
  BEFORE UPDATE ON finance.programs FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();
CREATE OR REPLACE TRIGGER trg_activities_updated
  BEFORE UPDATE ON finance.activities FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();
CREATE OR REPLACE TRIGGER trg_funds_updated
  BEFORE UPDATE ON finance.funds FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();
CREATE OR REPLACE TRIGGER trg_fiscal_years_updated
  BEFORE UPDATE ON finance.fiscal_years FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();
CREATE OR REPLACE TRIGGER trg_cash_accounts_updated
  BEFORE UPDATE ON finance.cash_accounts FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();
CREATE OR REPLACE TRIGGER trg_bank_accounts_updated
  BEFORE UPDATE ON finance.bank_accounts FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();
CREATE OR REPLACE TRIGGER trg_budgets_updated
  BEFORE UPDATE ON finance.budgets FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();
CREATE OR REPLACE TRIGGER trg_transactions_updated
  BEFORE UPDATE ON finance.transactions FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

-- ── ACCOUNTING VALIDATION FUNCTIONS ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION finance.validate_transaction_balance(p_transaction_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql AS $f$
DECLARE v_debit NUMERIC(20,2); v_credit NUMERIC(20,2);
BEGIN
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO v_debit, v_credit
    FROM finance.transaction_lines WHERE transaction_id = p_transaction_id;
  RETURN v_debit = v_credit AND v_debit > 0;
END;
$f$;

CREATE OR REPLACE FUNCTION finance.validate_journal_balance(p_journal_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql AS $f$
DECLARE v_debit NUMERIC(20,2); v_credit NUMERIC(20,2);
BEGIN
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO v_debit, v_credit
    FROM finance.journal_lines WHERE journal_id = p_journal_id;
  RETURN v_debit = v_credit AND v_debit > 0;
END;
$f$;

-- ── REPORTING VIEWS ───────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW finance.v_general_ledger AS
SELECT
  j.organization_id, j.id AS journal_id, j.journal_number, j.journal_date,
  j.period_id, j.fiscal_year_id,
  jl.id AS journal_line_id, jl.account_id, a.code AS account_code, a.name AS account_name,
  jl.field_id, f.code AS field_code, f.name AS field_name,
  jl.program_id, p.code AS program_code, p.name AS program_name,
  jl.fund_id, fu.code AS fund_code, fu.name AS fund_name,
  jl.debit, jl.credit, jl.description
FROM finance.journals j
JOIN finance.journal_lines jl ON jl.journal_id = j.id
JOIN finance.accounts a ON a.id = jl.account_id
LEFT JOIN finance.fields f ON f.id = jl.field_id
LEFT JOIN finance.programs p ON p.id = jl.program_id
LEFT JOIN finance.funds fu ON fu.id = jl.fund_id
WHERE j.status = 'POSTED';

CREATE OR REPLACE VIEW finance.v_budget_vs_actual AS
SELECT
  b.organization_id, b.id AS budget_id, b.code AS budget_code, b.fiscal_year_id,
  bl.id AS budget_line_id, a.code AS account_code, a.name AS account_name,
  bl.field_id, bl.program_id, bl.activity_id, bl.fund_id, bl.period_id,
  bl.budget_amount, bl.committed_amount, bl.actual_amount, bl.available_amount,
  CASE WHEN bl.budget_amount = 0 THEN 0
       ELSE ROUND((bl.actual_amount / bl.budget_amount) * 100, 2) END AS utilization_percent
FROM finance.budgets b
JOIN finance.budget_lines bl ON bl.budget_id = b.id
JOIN finance.accounts a ON a.id = bl.account_id;

COMMIT;
`;

// ── SEED DATA (idempotent, ON CONFLICT DO NOTHING) ───────────────────────────
// Default account groups (satu per account_type) + jenis voucher standar
// (BKM/BKK/BBM/BBK/BM/BT) sesuai contoh di BRD/SRS, supaya Chart of Accounts
// dan Voucher Engine punya data rujukan sejak modul pertama kali aktif.
export const FINANCE_SEED_SQL = `
INSERT INTO finance.account_groups (organization_id, code, name, account_type, normal_balance, sort_order, created_by)
VALUES
  ('gpib-trinitas', 'AST', 'Aset',              'ASSET',        'DEBIT',  1, 'system'),
  ('gpib-trinitas', 'LIB', 'Kewajiban',         'LIABILITY',    'CREDIT', 2, 'system'),
  ('gpib-trinitas', 'FBL', 'Saldo Dana',        'FUND_BALANCE', 'CREDIT', 3, 'system'),
  ('gpib-trinitas', 'REV', 'Penerimaan',        'REVENUE',      'CREDIT', 4, 'system'),
  ('gpib-trinitas', 'EXP', 'Pengeluaran',       'EXPENSE',      'DEBIT',  5, 'system'),
  ('gpib-trinitas', 'TRF', 'Mutasi/Transfer',   'TRANSFER',     'DEBIT',  6, 'system')
ON CONFLICT (organization_id, code) DO NOTHING;

INSERT INTO finance.voucher_types (organization_id, code, name, transaction_type, prefix, created_by)
VALUES
  ('gpib-trinitas', 'BKM', 'Bukti Kas Masuk',   'CASH_IN',   'BKM', 'system'),
  ('gpib-trinitas', 'BKK', 'Bukti Kas Keluar',  'CASH_OUT',  'BKK', 'system'),
  ('gpib-trinitas', 'BBM', 'Bukti Bank Masuk',  'BANK_IN',   'BBM', 'system'),
  ('gpib-trinitas', 'BBK', 'Bukti Bank Keluar', 'BANK_OUT',  'BBK', 'system'),
  ('gpib-trinitas', 'BM',  'Bukti Memorial',    'MEMORIAL',  'BM',  'system'),
  ('gpib-trinitas', 'BT',  'Bukti Transfer',    'TRANSFER',  'BT',  'system')
ON CONFLICT (organization_id, code) DO NOTHING;
`;

export async function initFinanceSchema(pool: { query: (sql: string) => Promise<any> }) {
  await pool.query(FINANCE_SCHEMA_SQL);
  await pool.query(FINANCE_SEED_SQL);
}
