// ============================================================
// FINANCE ADD-ON MODULE — High-Fidelity In-Memory Store
// ============================================================
// Menyediakan penyimpanan in-memory relasional lengkap untuk seluruh
// entitas finance.* ketika DATABASE_URL belum terkonfigurasi (mis. di
// Google AI Studio preview sandbox). Mengisi data awal (seed) realistis
// GPIB Trinitas (Bidang I–VI, COA standar, Rekening Kas & Bank,
// Tahun Fiskal 2026–2027 April–Maret, RKA, Voucher & Transaksi contoh)
// serta mengeksekusi query SQL dengan join & agregasi debit/kredit.
// ============================================================

export const FINANCE_ORG = 'gpib-trinitas';

interface TableStore {
  [id: string]: any;
}

const tables: { [tableName: string]: TableStore } = {
  account_groups: {},
  voucher_types: {},
  fields: {},
  programs: {},
  activities: {},
  funds: {},
  cash_accounts: {},
  bank_accounts: {},
  accounts: {},
  fiscal_years: {},
  periods: {},
  budgets: {},
  budget_lines: {},
  budget_revisions: {},
  vouchers: {},
  transactions: {},
  transaction_lines: {},
  journals: {},
  journal_lines: {},
  bank_statements: {},
  bank_statement_lines: {},
  reconciliations: {},
  reconciliation_matches: {},
  period_closings: {},
  voucher_sequences: {},
  journal_sequences: {},
  audit_logs: {},
};

let initialized = false;

export function initFinanceInMemorySeed() {
  if (initialized) return;
  initialized = true;

  const now = new Date().toISOString();

  // 1. Account Groups
  const groups = [
    { id: 'ag_ast', organization_id: FINANCE_ORG, code: 'AST', name: 'Aset', account_type: 'ASSET', normal_balance: 'DEBIT', sort_order: 1, is_active: true, created_at: now, created_by: 'system' },
    { id: 'ag_lib', organization_id: FINANCE_ORG, code: 'LIB', name: 'Kewajiban', account_type: 'LIABILITY', normal_balance: 'CREDIT', sort_order: 2, is_active: true, created_at: now, created_by: 'system' },
    { id: 'ag_fbl', organization_id: FINANCE_ORG, code: 'FBL', name: 'Saldo Dana', account_type: 'FUND_BALANCE', normal_balance: 'CREDIT', sort_order: 3, is_active: true, created_at: now, created_by: 'system' },
    { id: 'ag_rev', organization_id: FINANCE_ORG, code: 'REV', name: 'Penerimaan', account_type: 'REVENUE', normal_balance: 'CREDIT', sort_order: 4, is_active: true, created_at: now, created_by: 'system' },
    { id: 'ag_exp', organization_id: FINANCE_ORG, code: 'EXP', name: 'Pengeluaran', account_type: 'EXPENSE', normal_balance: 'DEBIT', sort_order: 5, is_active: true, created_at: now, created_by: 'system' },
    { id: 'ag_trf', organization_id: FINANCE_ORG, code: 'TRF', name: 'Mutasi/Transfer', account_type: 'TRANSFER', normal_balance: 'DEBIT', sort_order: 6, is_active: true, created_at: now, created_by: 'system' },
  ];
  groups.forEach(g => { tables.account_groups[g.id] = g; });

  // 2. Voucher Types
  const voucherTypes = [
    { id: 'vt_bkm', organization_id: FINANCE_ORG, code: 'BKM', name: 'Bukti Kas Masuk', transaction_type: 'CASH_IN', prefix: 'BKM', is_active: true, created_at: now, created_by: 'system' },
    { id: 'vt_bkk', organization_id: FINANCE_ORG, code: 'BKK', name: 'Bukti Kas Keluar', transaction_type: 'CASH_OUT', prefix: 'BKK', is_active: true, created_at: now, created_by: 'system' },
    { id: 'vt_bbm', organization_id: FINANCE_ORG, code: 'BBM', name: 'Bukti Bank Masuk', transaction_type: 'BANK_IN', prefix: 'BBM', is_active: true, created_at: now, created_by: 'system' },
    { id: 'vt_bbk', organization_id: FINANCE_ORG, code: 'BBK', name: 'Bukti Bank Keluar', transaction_type: 'BANK_OUT', prefix: 'BBK', is_active: true, created_at: now, created_by: 'system' },
    { id: 'vt_bm',  organization_id: FINANCE_ORG, code: 'BM',  name: 'Bukti Memorial', transaction_type: 'MEMORIAL', prefix: 'BM', is_active: true, created_at: now, created_by: 'system' },
    { id: 'vt_bt',  organization_id: FINANCE_ORG, code: 'BT',  name: 'Bukti Transfer', transaction_type: 'TRANSFER', prefix: 'BT', is_active: true, created_at: now, created_by: 'system' },
  ];
  voucherTypes.forEach(v => { tables.voucher_types[v.id] = v; });

  // 3. Fields (Bidang Pelayanan GPIB Trinitas)
  const fields = [
    { id: 'fld_31', organization_id: FINANCE_ORG, code: '31', name: 'Bidang I Teologi & Persidangan Gerejawi (TPG)', description: 'Pelayanan Firman, Liturgi, Musik Gereja & Teologi', is_active: true, created_at: now, created_by: 'system' },
    { id: 'fld_32', organization_id: FINANCE_ORG, code: '32', name: 'Bidang II Pelayanan Kasih & Kesehatan (PELKES)', description: 'Diakonia karitatif & reformatif, tanggap bencana & kesehatan jemaat', is_active: true, created_at: now, created_by: 'system' },
    { id: 'fld_33', organization_id: FINANCE_ORG, code: '33', name: 'Bidang III Gereja, Masyarakat & Agama-Agama (GERMASA)', description: 'Kerjasama oikumene, dialog lintas agama & kemasyarakatan', is_active: true, created_at: now, created_by: 'system' },
    { id: 'fld_34', organization_id: FINANCE_ORG, code: '34', name: 'Bidang IV Pembinaan & Pengembangan SDM (PPSDI)', description: 'Kaderisasi, Pelkat PA/PT/GP/PKP/PKB/PKLU & katekisasi', is_active: true, created_at: now, created_by: 'system' },
    { id: 'fld_35', organization_id: FINANCE_ORG, code: '35', name: 'Bidang V Pembangunan Ekonomi Gereja (PEG)', description: 'Pengembangan unit usaha gerejawi, sarana prasarana & dana abadi', is_active: true, created_at: now, created_by: 'system' },
    { id: 'fld_36', organization_id: FINANCE_ORG, code: '36', name: 'Bidang VI Informasi, Komunikasi & Penelitian (INFORKOMLIT)', description: 'E-Warta, multimedia, website, sistem IT & arsip jemaat', is_active: true, created_at: now, created_by: 'system' },
  ];
  fields.forEach(f => { tables.fields[f.id] = f; });

  // 4. Programs & Activities
  const programs = [
    { id: 'prog_31_01', organization_id: FINANCE_ORG, field_id: 'fld_31', code: '31.01', name: 'Ibadah Hari Minggu & Hari Raya Gerejawi', description: 'Pelayanan sakramen dan liturgi', is_active: true, created_at: now, created_by: 'system' },
    { id: 'prog_32_01', organization_id: FINANCE_ORG, field_id: 'fld_32', code: '32.01', name: 'Bantuan Diakonia Kasih & Kedukaan', description: 'Santunan dan beasiswa jemaat', is_active: true, created_at: now, created_by: 'system' },
    { id: 'prog_34_01', organization_id: FINANCE_ORG, field_id: 'fld_34', code: '34.01', name: 'Pembinaan Pelkat PA, PT, GP, PKP, PKB, PKLU', description: 'Kegiatan kategorial', is_active: true, created_at: now, created_by: 'system' },
    { id: 'prog_35_01', organization_id: FINANCE_ORG, field_id: 'fld_35', code: '35.01', name: 'Pemeliharaan Gedung Gereja & Pastori', description: 'Renovasi dan aset gereja', is_active: true, created_at: now, created_by: 'system' },
    { id: 'prog_36_01', organization_id: FINANCE_ORG, field_id: 'fld_36', code: '36.01', name: 'E-Warta & Infrastruktur Digital GEMAS', description: 'Publikasi dan live-streaming', is_active: true, created_at: now, created_by: 'system' },
  ];
  programs.forEach(p => { tables.programs[p.id] = p; });

  const activities = [
    { id: 'act_31_01_01', organization_id: FINANCE_ORG, program_id: 'prog_31_01', code: '31.01.01', name: 'Penyediaan Sakramen Perjamuan Kudus', is_active: true, created_at: now, created_by: 'system' },
    { id: 'act_32_01_01', organization_id: FINANCE_ORG, program_id: 'prog_32_01', code: '32.01.01', name: 'Santunan Sembako Lansia & Yatim Piatu', is_active: true, created_at: now, created_by: 'system' },
    { id: 'act_35_01_01', organization_id: FINANCE_ORG, program_id: 'prog_35_01', code: '35.01.01', name: 'Perawatan AC & Sound System Ruang Ibadah Utama', is_active: true, created_at: now, created_by: 'system' },
  ];
  activities.forEach(a => { tables.activities[a.id] = a; });

  // 5. Funds
  const funds = [
    { id: 'fnd_01', organization_id: FINANCE_ORG, code: 'F-UMUM', name: 'Dana Umum Jemaat', fund_type: 'GENERAL', restriction_type: 'UNRESTRICTED', opening_balance: 50000000, is_active: true, created_at: now, created_by: 'system' },
    { id: 'fnd_02', organization_id: FINANCE_ORG, code: 'F-DIAKONIA', name: 'Dana Diakonia & Kasih', fund_type: 'DIAKONIA', restriction_type: 'RESTRICTED', opening_balance: 35000000, is_active: true, created_at: now, created_by: 'system' },
    { id: 'fnd_03', organization_id: FINANCE_ORG, code: 'F-BANGUNAN', name: 'Dana Pembangunan & Renovasi', fund_type: 'BUILDING', restriction_type: 'RESTRICTED', opening_balance: 85000000, is_active: true, created_at: now, created_by: 'system' },
    { id: 'fnd_04', organization_id: FINANCE_ORG, code: 'F-IBADAH', name: 'Dana Rumah Ibadah & Pastori', fund_type: 'SPECIAL', restriction_type: 'RESTRICTED', opening_balance: 20000000, is_active: true, created_at: now, created_by: 'system' },
    { id: 'fnd_05', organization_id: FINANCE_ORG, code: 'F-SINODAL', name: 'Dana Setoran Sinodal & BPS GPIB', fund_type: 'SINODAL', restriction_type: 'RESTRICTED', opening_balance: 15000000, is_active: true, created_at: now, created_by: 'system' },
  ];
  funds.forEach(f => { tables.funds[f.id] = f; });

  // 6. Chart of Accounts (COA)
  const coa = [
    // Aset Kas & Bank
    { id: 'acc_1101', organization_id: FINANCE_ORG, group_id: 'ag_ast', code: '11.01', name: 'Kas Utama Bendahara', account_type: 'ASSET', normal_balance: 'DEBIT', level: 2, is_postable: true, is_control_account: true, opening_balance: 15000000, is_active: true, created_at: now, created_by: 'system' },
    { id: 'acc_1102', organization_id: FINANCE_ORG, group_id: 'ag_ast', code: '11.02', name: 'Kas Kecil Sekretariat', account_type: 'ASSET', normal_balance: 'DEBIT', level: 2, is_postable: true, is_control_account: false, opening_balance: 5000000, is_active: true, created_at: now, created_by: 'system' },
    { id: 'acc_1201', organization_id: FINANCE_ORG, group_id: 'ag_ast', code: '12.01', name: 'Bank BRI Rekening Operasional (0123-01)', account_type: 'ASSET', normal_balance: 'DEBIT', level: 2, is_postable: true, is_control_account: true, opening_balance: 125000000, is_active: true, created_at: now, created_by: 'system' },
    { id: 'acc_1202', organization_id: FINANCE_ORG, group_id: 'ag_ast', code: '12.02', name: 'Bank BRI Rekening Pembangunan (0123-02)', account_type: 'ASSET', normal_balance: 'DEBIT', level: 2, is_postable: true, is_control_account: true, opening_balance: 85000000, is_active: true, created_at: now, created_by: 'system' },
    { id: 'acc_1203', organization_id: FINANCE_ORG, group_id: 'ag_ast', code: '12.03', name: 'Bank BRI Rekening Diakonia (0123-03)', account_type: 'ASSET', normal_balance: 'DEBIT', level: 2, is_postable: true, is_control_account: true, opening_balance: 35000000, is_active: true, created_at: now, created_by: 'system' },
    // Kewajiban
    { id: 'acc_2100', organization_id: FINANCE_ORG, group_id: 'ag_lib', code: '21.00', name: 'Titipan Setoran Sinodal GPIB', account_type: 'LIABILITY', normal_balance: 'CREDIT', level: 2, is_postable: true, is_control_account: false, opening_balance: 0, is_active: true, created_at: now, created_by: 'system' },
    // Saldo Dana
    { id: 'acc_3100', organization_id: FINANCE_ORG, group_id: 'ag_fbl', code: '31.00', name: 'Saldo Dana Awal Jemaat', account_type: 'FUND_BALANCE', normal_balance: 'CREDIT', level: 2, is_postable: true, is_control_account: false, opening_balance: 265000000, is_active: true, created_at: now, created_by: 'system' },
    // Penerimaan (Revenue)
    { id: 'acc_4101', organization_id: FINANCE_ORG, group_id: 'ag_rev', code: '21.01.01', name: 'Persembahan Ibadah Hari Minggu', account_type: 'REVENUE', normal_balance: 'CREDIT', level: 3, is_postable: true, is_control_account: false, opening_balance: 0, is_active: true, created_at: now, created_by: 'system' },
    { id: 'acc_4102', organization_id: FINANCE_ORG, group_id: 'ag_rev', code: '21.01.02', name: 'Persembahan Syukur & Perpuluhan', account_type: 'REVENUE', normal_balance: 'CREDIT', level: 3, is_postable: true, is_control_account: false, opening_balance: 0, is_active: true, created_at: now, created_by: 'system' },
    { id: 'acc_4103', organization_id: FINANCE_ORG, group_id: 'ag_rev', code: '21.01.03', name: 'Persembahan Perjamuan Kudus', account_type: 'REVENUE', normal_balance: 'CREDIT', level: 3, is_postable: true, is_control_account: false, opening_balance: 0, is_active: true, created_at: now, created_by: 'system' },
    { id: 'acc_4201', organization_id: FINANCE_ORG, group_id: 'ag_rev', code: '22.01.01', name: 'Kolekte Ibadah Pelkat & Sektor', account_type: 'REVENUE', normal_balance: 'CREDIT', level: 3, is_postable: true, is_control_account: false, opening_balance: 0, is_active: true, created_at: now, created_by: 'system' },
    { id: 'acc_4301', organization_id: FINANCE_ORG, group_id: 'ag_rev', code: '23.01.01', name: 'Penerimaan Khusus Dana Pembangunan', account_type: 'REVENUE', normal_balance: 'CREDIT', level: 3, is_postable: true, is_control_account: false, opening_balance: 0, is_active: true, created_at: now, created_by: 'system' },
    // Beban / Pengeluaran (Expense)
    { id: 'acc_5101', organization_id: FINANCE_ORG, group_id: 'ag_exp', code: '51.01.01', name: 'Beban Operasional Sekretariat & Listrik', account_type: 'EXPENSE', normal_balance: 'DEBIT', level: 3, is_postable: true, is_control_account: false, opening_balance: 0, is_active: true, created_at: now, created_by: 'system' },
    { id: 'acc_5102', organization_id: FINANCE_ORG, group_id: 'ag_exp', code: '51.01.02', name: 'Beban Pelayanan Firman & Sakramen', account_type: 'EXPENSE', normal_balance: 'DEBIT', level: 3, is_postable: true, is_control_account: false, opening_balance: 0, is_active: true, created_at: now, created_by: 'system' },
    { id: 'acc_5103', organization_id: FINANCE_ORG, group_id: 'ag_exp', code: '51.01.03', name: 'Beban Bantuan Diakonia & Kasih', account_type: 'EXPENSE', normal_balance: 'DEBIT', level: 3, is_postable: true, is_control_account: false, opening_balance: 0, is_active: true, created_at: now, created_by: 'system' },
    { id: 'acc_5104', organization_id: FINANCE_ORG, group_id: 'ag_exp', code: '51.01.04', name: 'Beban E-Warta, Internet & Multimedia', account_type: 'EXPENSE', normal_balance: 'DEBIT', level: 3, is_postable: true, is_control_account: false, opening_balance: 0, is_active: true, created_at: now, created_by: 'system' },
    { id: 'acc_5105', organization_id: FINANCE_ORG, group_id: 'ag_exp', code: '51.01.05', name: 'Beban Pemeliharaan Sarana & Prasarana', account_type: 'EXPENSE', normal_balance: 'DEBIT', level: 3, is_postable: true, is_control_account: false, opening_balance: 0, is_active: true, created_at: now, created_by: 'system' },
    // Transfer / Kliring
    { id: 'acc_6001', organization_id: FINANCE_ORG, group_id: 'ag_trf', code: '60.01.01', name: 'Kliring Mutasi Kas dan Bank', account_type: 'TRANSFER', normal_balance: 'DEBIT', level: 3, is_postable: true, is_control_account: false, opening_balance: 0, is_active: true, created_at: now, created_by: 'system' },
  ];
  coa.forEach(c => { tables.accounts[c.id] = c; });

  // 7. Cash Accounts
  const cashAccounts = [
    { id: 'csh_01', organization_id: FINANCE_ORG, account_id: 'acc_1101', code: 'KAS-01', name: 'Kas Utama Bendahara', location: 'Brankas Ruang Majelis', opening_balance: 15000000, current_balance: 17200000, is_active: true, created_at: now, created_by: 'system' },
    { id: 'csh_02', organization_id: FINANCE_ORG, account_id: 'acc_1102', code: 'KAS-02', name: 'Kas Kecil Sekretariat', location: 'Kantor Tata Usaha', opening_balance: 5000000, current_balance: 4350000, is_active: true, created_at: now, created_by: 'system' },
  ];
  cashAccounts.forEach(c => { tables.cash_accounts[c.id] = c; });

  // 8. Bank Accounts
  const bankAccounts = [
    { id: 'bnk_01', organization_id: FINANCE_ORG, account_id: 'acc_1201', bank_name: 'Bank Rakyat Indonesia', bank_code: '002', account_number: '0123-01-000456-50-1', account_name: 'GPIB Trinitas - Kas Operasional', currency: 'IDR', opening_balance: 125000000, current_balance: 132450000, is_active: true, created_at: now, created_by: 'system' },
    { id: 'bnk_02', organization_id: FINANCE_ORG, account_id: 'acc_1202', bank_name: 'Bank Rakyat Indonesia', bank_code: '002', account_number: '0123-01-000789-50-2', account_name: 'GPIB Trinitas - Panitia Pembangunan', currency: 'IDR', opening_balance: 85000000, current_balance: 85000000, is_active: true, created_at: now, created_by: 'system' },
    { id: 'bnk_03', organization_id: FINANCE_ORG, account_id: 'acc_1203', bank_name: 'Bank Rakyat Indonesia', bank_code: '002', account_number: '0123-01-000999-50-3', account_name: 'GPIB Trinitas - Dana Pelayanan Diakonia', currency: 'IDR', opening_balance: 35000000, current_balance: 33500000, is_active: true, created_at: now, created_by: 'system' },
  ];
  bankAccounts.forEach(b => { tables.bank_accounts[b.id] = b; });

  // 9. Fiscal Year (2026–2027) & 12 Periods
  const fyId = 'fy_2026_2027';
  const fiscalYear = {
    id: fyId,
    organization_id: FINANCE_ORG,
    code: '2026-2027',
    name: 'Tahun Anggaran 2026–2027 (April – Maret)',
    start_date: '2026-04-01',
    end_date: '2027-03-31',
    status: 'OPEN',
    is_current: true,
    created_at: now,
    created_by: 'system',
  };
  tables.fiscal_years[fyId] = fiscalYear;

  const monthNames = [
    { num: 1,  code: 'APR-2026', name: 'April 2026',     s: '2026-04-01', e: '2026-04-30', q: 1 },
    { num: 2,  code: 'MEI-2026', name: 'Mei 2026',       s: '2026-05-01', e: '2026-05-31', q: 1 },
    { num: 3,  code: 'JUN-2026', name: 'Juni 2026',      s: '2026-06-01', e: '2026-06-30', q: 1 },
    { num: 4,  code: 'JUL-2026', name: 'Juli 2026',      s: '2026-07-01', e: '2026-07-31', q: 2 },
    { num: 5,  code: 'AGS-2026', name: 'Agustus 2026',   s: '2026-08-01', e: '2026-08-31', q: 2 },
    { num: 6,  code: 'SEP-2026', name: 'September 2026', s: '2026-09-01', e: '2026-09-30', q: 2 },
    { num: 7,  code: 'OKT-2026', name: 'Oktober 2026',   s: '2026-10-01', e: '2026-10-31', q: 3 },
    { num: 8,  code: 'NOP-2026', name: 'November 2026',  s: '2026-11-01', e: '2026-11-30', q: 3 },
    { num: 9,  code: 'DES-2026', name: 'Desember 2026',  s: '2026-12-01', e: '2026-12-31', q: 3 },
    { num: 10, code: 'JAN-2027', name: 'Januari 2027',   s: '2027-01-01', e: '2027-01-31', q: 4 },
    { num: 11, code: 'FEB-2027', name: 'Februari 2027',  s: '2027-02-01', e: '2027-02-28', q: 4 },
    { num: 12, code: 'MAR-2027', name: 'Maret 2027',     s: '2027-03-01', e: '2027-03-31', q: 4 },
  ];
  monthNames.forEach(m => {
    const pid = `p_${fyId}_${m.num}`;
    tables.periods[pid] = {
      id: pid,
      fiscal_year_id: fyId,
      period_number: m.num,
      code: m.code,
      name: m.name,
      start_date: m.s,
      end_date: m.e,
      quarter: m.q,
      status: 'OPEN',
      organization_id: FINANCE_ORG,
      created_at: now,
    };
  });

  // 10. Budgets (RKA 2026–2027)
  const budgetId = 'bgt_2026_01';
  tables.budgets[budgetId] = {
    id: budgetId,
    organization_id: FINANCE_ORG,
    fiscal_year_id: fyId,
    code: 'RKA-2026-2027',
    name: 'Rencana Kerja & Anggaran GPIB Trinitas 2026–2027',
    version: 1,
    status: 'ACTIVE',
    submitted_at: '2026-03-25T10:00:00Z',
    submitted_by: 'u_pipi',
    approved_at: '2026-03-28T14:30:00Z',
    approved_by: 'u_pdt_abraham',
    created_at: now,
    created_by: 'system',
  };

  const periodSep = 'p_fy_2026_2027_6'; // Sep 2026
  const budgetLines = [
    { id: 'bl_01', budget_id: budgetId, account_id: 'acc_5101', field_id: 'fld_36', program_id: 'prog_36_01', period_id: periodSep, budget_amount: 35000000, committed_amount: 0, actual_amount: 14500000, available_amount: 20500000, description: 'Operasional Kantor & Publikasi', created_at: now, created_by: 'system' },
    { id: 'bl_02', budget_id: budgetId, account_id: 'acc_5102', field_id: 'fld_31', program_id: 'prog_31_01', period_id: periodSep, budget_amount: 50000000, committed_amount: 0, actual_amount: 18000000, available_amount: 32000000, description: 'Pelayanan Firman & Perjamuan', created_at: now, created_by: 'system' },
    { id: 'bl_03', budget_id: budgetId, account_id: 'acc_5103', field_id: 'fld_32', program_id: 'prog_32_01', period_id: periodSep, budget_amount: 40000000, committed_amount: 0, actual_amount: 12500000, available_amount: 27500000, description: 'Bantuan Diakonia Kasih', created_at: now, created_by: 'system' },
  ];
  budgetLines.forEach(bl => { tables.budget_lines[bl.id] = bl; });

  // 11. Sample Transactions & Vouchers
  const vch1Id = 'vch_001';
  const tx1Id = 'tx_001';
  const jrn1Id = 'jrn_001';

  tables.vouchers[vch1Id] = {
    id: vch1Id,
    organization_id: FINANCE_ORG,
    fiscal_year_id: fyId,
    period_id: periodSep,
    voucher_type_id: 'vt_bbm',
    voucher_number: 'BBM/2026-2027/0001',
    voucher_date: '2026-09-06',
    description: 'Penerimaan Persembahan Ibadah Minggu via Transfer Rekening BRI Operasional',
    status: 'POSTED',
    created_at: now,
    created_by: 'u_pipi',
  };

  tables.transactions[tx1Id] = {
    id: tx1Id,
    organization_id: FINANCE_ORG,
    voucher_id: vch1Id,
    fiscal_year_id: fyId,
    period_id: periodSep,
    transaction_type: 'BANK_IN',
    transaction_date: '2026-09-06',
    payer_name: 'Warga Jemaat Sektor 1-7',
    description: 'Penerimaan Persembahan Ibadah Minggu 6 September 2026',
    total_debit: 7450000,
    total_credit: 7450000,
    status: 'POSTED',
    submitted_at: '2026-09-06T12:00:00Z',
    submitted_by: 'u_pipi',
    verified_at: '2026-09-06T13:00:00Z',
    verified_by: 'u_samuel',
    approved_at: '2026-09-06T14:00:00Z',
    approved_by: 'u_admin',
    posted_at: '2026-09-06T15:00:00Z',
    posted_by: 'u_admin',
    created_at: now,
    created_by: 'u_pipi',
  };

  tables.transaction_lines['txl_001_1'] = {
    id: 'txl_001_1',
    transaction_id: tx1Id,
    line_number: 1,
    account_id: 'acc_1201',
    bank_account_id: 'bnk_01',
    debit: 7450000,
    credit: 0,
    description: 'Debit Rekening BRI Operasional',
    created_at: now,
  };

  tables.transaction_lines['txl_001_2'] = {
    id: 'txl_001_2',
    transaction_id: tx1Id,
    line_number: 2,
    account_id: 'acc_4101',
    debit: 0,
    credit: 7450000,
    description: 'Kredit Pendapatan Persembahan Ibadah Minggu',
    created_at: now,
  };

  // 12. Sample Posted Journal
  tables.journals[jrn1Id] = {
    id: jrn1Id,
    organization_id: FINANCE_ORG,
    transaction_id: tx1Id,
    voucher_id: vch1Id,
    fiscal_year_id: fyId,
    period_id: periodSep,
    journal_number: 'JRN/2026-2027/0001',
    journal_date: '2026-09-06',
    description: 'Penerimaan Persembahan Ibadah Minggu 6 September 2026',
    total_debit: 7450000,
    total_credit: 7450000,
    status: 'POSTED',
    posted_at: '2026-09-06T15:00:00Z',
    posted_by: 'u_admin',
    created_at: now,
  };

  tables.journal_lines['jnl_001_1'] = {
    id: 'jnl_001_1',
    journal_id: jrn1Id,
    line_number: 1,
    account_id: 'acc_1201',
    debit: 7450000,
    credit: 0,
    description: 'Debit Rekening BRI Operasional',
  };

  tables.journal_lines['jnl_001_2'] = {
    id: 'jnl_001_2',
    journal_id: jrn1Id,
    line_number: 2,
    account_id: 'acc_4101',
    debit: 0,
    credit: 7450000,
    description: 'Kredit Pendapatan Persembahan Ibadah Minggu',
  };
}

// ── In-Memory SQL Query Interceptor ──────────────────────────────────────────

export function handleFinanceInMemoryQuery(sql: string, params: any[] = []): { rows: any[] } {
  initFinanceInMemorySeed();
  const trimmed = sql.trim().replace(/\s+/g, ' ');

  // Transaction control
  if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(trimmed)) {
    return { rows: [] };
  }

  // 1. Voucher Sequences
  if (/INSERT\s+INTO\s+finance\.voucher_sequences/i.test(trimmed)) {
    const org = params[0] || FINANCE_ORG;
    const fyId = params[1];
    const vtId = params[2];
    const key = `${org}_${fyId}_${vtId}`;
    const cur = (tables.voucher_sequences[key]?.current_number || 0) + 1;
    tables.voucher_sequences[key] = {
      organization_id: org,
      fiscal_year_id: fyId,
      voucher_type_id: vtId,
      current_number: cur,
    };
    return { rows: [{ current_number: cur }] };
  }

  // 2. Journal Sequences
  if (/INSERT\s+INTO\s+finance\.journal_sequences/i.test(trimmed)) {
    const org = params[0] || FINANCE_ORG;
    const fyId = params[1];
    const key = `${org}_${fyId}`;
    const cur = (tables.journal_sequences[key]?.current_number || 0) + 1;
    tables.journal_sequences[key] = {
      organization_id: org,
      fiscal_year_id: fyId,
      current_number: cur,
    };
    return { rows: [{ current_number: cur }] };
  }

  // 2b. Next line number generator
  if (/COALESCE\(MAX\(line_number\),\s*0\)\s*\+\s*1\s+AS\s+next/i.test(trimmed)) {
    const pId = params[0];
    const tName = /journal_lines/i.test(trimmed) ? 'journal_lines' : 'transaction_lines';
    const foreignKey = tName === 'journal_lines' ? 'journal_id' : 'transaction_id';
    const lines = Object.values(tables[tName] || {}).filter((l: any) => l[foreignKey] === pId);
    const maxNum = lines.reduce((max: number, l: any) => Math.max(max, Number(l.line_number || 0)), 0);
    return { rows: [{ next: maxNum + 1 }] };
  }

  // 3. SELECT * FROM finance.periods WHERE fiscal_year_id = $1 AND start_date <= $2 AND end_date >= $2
  if (/FROM\s+finance\.periods/i.test(trimmed) && /start_date\s*<=\s*\$2/i.test(trimmed)) {
    const fyId = params[0];
    const date = String(params[1]);
    const found = Object.values(tables.periods).find(
      (p: any) => p.fiscal_year_id === fyId && p.start_date <= date && p.end_date >= date
    );
    return { rows: found ? [found] : [] };
  }

  // 4. Generic COUNT query with any alias (count, total, n)
  const countMatch = trimmed.match(/SELECT\s+COUNT\(\*\)::int\s+AS\s+(\w+)\s+FROM\s+finance\.(\w+)/i);
  if (countMatch) {
    const alias = countMatch[1];
    const tName = countMatch[2];
    const map = tables[tName] || {};
    let all = Object.values(map);

    if (/WHERE\s+transaction_id\s*=\s*\$1/i.test(trimmed)) {
      const txId = params[0];
      all = all.filter((r: any) => r.transaction_id === txId);
    } else if (tName === 'transactions' && /queueCondition|submitted_by|verified_by|t\.status\s*=\s*'SUBMITTED'/i.test(trimmed)) {
      const userId = params[1];
      all = all.filter((tx: any) => {
        if (tx.status === 'SUBMITTED' && tx.created_by !== userId) return true;
        if (tx.status === 'VERIFIED' && tx.created_by !== userId && tx.verified_by !== userId) return true;
        if (tx.status === 'APPROVED' && tx.created_by !== userId) return true;
        return false;
      });
    } else if (params.length > 0 && params[0] === FINANCE_ORG) {
      all = all.filter((r: any) => !r.organization_id || r.organization_id === FINANCE_ORG);
    }

    const n = all.length;
    return { rows: [{ [alias]: n, count: n, total: n, n }] };
  }

  // 6. SELECT COALESCE(SUM(debit),0) AS total_debit, COALESCE(SUM(credit),0) AS total_credit FROM finance.transaction_lines WHERE transaction_id = $1
  if (/FROM\s+finance\.transaction_lines/i.test(trimmed) && /COALESCE\(SUM\(debit\)/i.test(trimmed)) {
    const txId = params[0];
    const lines = Object.values(tables.transaction_lines).filter((l: any) => l.transaction_id === txId);
    const sumDebit = lines.reduce((acc: number, l: any) => acc + Number(l.debit || 0), 0);
    const sumCredit = lines.reduce((acc: number, l: any) => acc + Number(l.credit || 0), 0);
    return { rows: [{ total_debit: sumDebit, total_credit: sumCredit }] };
  }

  // 7. INSERT statements
  const insertMatch = trimmed.match(/^INSERT\s+INTO\s+finance\.(\w+)/i);
  if (insertMatch) {
    const tName = insertMatch[1];
    return handleInsert(trimmed, params, tName);
  }

  // 8. UPDATE statements
  const updateMatch = trimmed.match(/^UPDATE\s+finance\.(\w+)/i);
  if (updateMatch) {
    const tName = updateMatch[1];
    return handleUpdate(trimmed, params, tName);
  }

  // 9. DELETE statements
  const deleteMatch = trimmed.match(/^DELETE\s+FROM\s+finance\.(\w+)/i);
  if (deleteMatch) {
    const tName = deleteMatch[1];
    return handleDelete(trimmed, params, tName);
  }

  // 10. Dashboard Aggregate Queries
  if (/FROM\s+finance\.journal_lines\s+jl\s+JOIN\s+finance\.journals\s+j/i.test(trimmed) && /account_type\s+IN\s+\('REVENUE','EXPENSE'\)/i.test(trimmed)) {
    // YTD Revenue and Expense
    let revCredit = 0, revDebit = 0, expDebit = 0, expCredit = 0;
    const asOfDate = params[2] || '2099-12-31';
    for (const jl of Object.values(tables.journal_lines) as any[]) {
      const j = tables.journals[jl.journal_id];
      if (!j || j.journal_date > asOfDate) continue;
      const acc = tables.accounts[jl.account_id];
      if (!acc) continue;
      if (acc.account_type === 'REVENUE') {
        revCredit += Number(jl.credit || 0);
        revDebit += Number(jl.debit || 0);
      } else if (acc.account_type === 'EXPENSE') {
        expDebit += Number(jl.debit || 0);
        expCredit += Number(jl.credit || 0);
      }
    }
    return {
      rows: [
        { account_type: 'REVENUE', total_debit: revDebit, total_credit: revCredit },
        { account_type: 'EXPENSE', total_debit: expDebit, total_credit: expCredit },
      ],
    };
  }

  // Dashboard Monthly Trend
  if (/SELECT\s+p\.id\s+AS\s+period_id,\s+p\.period_number/i.test(trimmed) && /FROM\s+finance\.periods\s+p/i.test(trimmed)) {
    const periods = Object.values(tables.periods).sort((a: any, b: any) => a.period_number - b.period_number);
    const rows = periods.map((p: any) => {
      let revenue = 0;
      let expense = 0;
      for (const jl of Object.values(tables.journal_lines) as any[]) {
        const j = tables.journals[jl.journal_id];
        if (!j || j.period_id !== p.id) continue;
        const acc = tables.accounts[jl.account_id];
        if (!acc) continue;
        if (acc.account_type === 'REVENUE') revenue += Number(jl.credit || 0) - Number(jl.debit || 0);
        if (acc.account_type === 'EXPENSE') expense += Number(jl.debit || 0) - Number(jl.credit || 0);
      }
      return {
        period_id: p.id,
        period_number: p.period_number,
        period_name: p.name,
        revenue,
        expense,
      };
    });
    return { rows };
  }

  // Dashboard Status Counts
  if (/SELECT\s+status,\s+COUNT\(\*\)(?:::int)?\s+AS\s+cnt\s+FROM\s+finance\.transactions/i.test(trimmed)) {
    const counts: { [status: string]: number } = {};
    for (const tx of Object.values(tables.transactions) as any[]) {
      counts[tx.status] = (counts[tx.status] || 0) + 1;
    }
    return { rows: Object.entries(counts).map(([status, cnt]) => ({ status, cnt })) };
  }

  // Dashboard Top Expense Accounts
  if (/COALESCE\(SUM\(jl\.debit\s*-\s*jl\.credit\),\s*0\)\s+AS\s+amount/i.test(trimmed)) {
    const expMap: { [code: string]: { code: string; name: string; amount: number } } = {};
    for (const jl of Object.values(tables.journal_lines) as any[]) {
      const acc = tables.accounts[jl.account_id];
      if (!acc || acc.account_type !== 'EXPENSE') continue;
      if (!expMap[acc.code]) expMap[acc.code] = { code: acc.code, name: acc.name, amount: 0 };
      expMap[acc.code].amount += Number(jl.debit || 0) - Number(jl.credit || 0);
    }
    const rows = Object.values(expMap).filter(x => x.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5);
    return { rows };
  }

  // Dashboard Top Revenue Accounts
  if (/COALESCE\(SUM\(jl\.credit\s*-\s*jl\.debit\),\s*0\)\s+AS\s+amount/i.test(trimmed)) {
    const revMap: { [code: string]: { code: string; name: string; amount: number } } = {};
    for (const jl of Object.values(tables.journal_lines) as any[]) {
      const acc = tables.accounts[jl.account_id];
      if (!acc || acc.account_type !== 'REVENUE') continue;
      if (!revMap[acc.code]) revMap[acc.code] = { code: acc.code, name: acc.name, amount: 0 };
      revMap[acc.code].amount += Number(jl.credit || 0) - Number(jl.debit || 0);
    }
    const rows = Object.values(revMap).filter(x => x.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5);
    return { rows };
  }

  // Dashboard Budget summary
  if (/total_budget_revenue/i.test(trimmed)) {
    let bRev = 0, bExp = 0;
    for (const bl of Object.values(tables.budget_lines) as any[]) {
      const acc = tables.accounts[bl.account_id];
      if (!acc) continue;
      if (acc.account_type === 'REVENUE') bRev += Number(bl.budget_amount || bl.amount || 0);
      if (acc.account_type === 'EXPENSE') bExp += Number(bl.budget_amount || bl.amount || 0);
    }
    return { rows: [{ total_budget_revenue: bRev || 385000000, total_budget_expense: bExp || 360000000 }] };
  }

  // Dashboard Period Status Counts
  if (/SELECT\s+status,\s+COUNT\(\*\)(?:::int)?\s+AS\s+cnt\s+FROM\s+finance\.periods/i.test(trimmed)) {
    const counts: { [status: string]: number } = {};
    for (const p of Object.values(tables.periods) as any[]) {
      counts[p.status] = (counts[p.status] || 0) + 1;
    }
    return { rows: Object.entries(counts).map(([status, cnt]) => ({ status, cnt })) };
  }

  // Balance Sheet sum aggregation by account
  if (/SELECT\s+jl\.account_id,\s+COALESCE\(SUM\(jl\.debit\)/i.test(trimmed)) {
    const asOfDate = params[1] || '2099-12-31';
    const sums: { [accId: string]: { account_id: string; total_debit: number; total_credit: number } } = {};
    for (const jl of Object.values(tables.journal_lines) as any[]) {
      const j = tables.journals[jl.journal_id];
      if (!j || j.journal_date > asOfDate) continue;
      if (!sums[jl.account_id]) sums[jl.account_id] = { account_id: jl.account_id, total_debit: 0, total_credit: 0 };
      sums[jl.account_id].total_debit += Number(jl.debit || 0);
      sums[jl.account_id].total_credit += Number(jl.credit || 0);
    }
    return { rows: Object.values(sums) };
  }

  // Budget Realization report query
  if (/FROM\s+finance\.budget_lines\s+bl/i.test(trimmed) && /JOIN\s+finance\.accounts\s+a/i.test(trimmed)) {
    const bls = Object.values(tables.budget_lines);
    const rows = bls.map((bl: any) => {
      const a = tables.accounts[bl.account_id] || {};
      const f = tables.fields[bl.field_id] || {};
      const p = tables.programs[bl.program_id] || {};
      const act = tables.activities[bl.activity_id] || {};

      // Sum actual from posted transaction lines matching budget_line_id
      let realActual = 0;
      for (const tl of Object.values(tables.transaction_lines) as any[]) {
        if (tl.budget_line_id === bl.id) {
          const tx = tables.transactions[tl.transaction_id];
          if (tx && tx.status === 'POSTED') {
            realActual += Number(tl.debit || 0) - Number(tl.credit || 0);
          }
        }
      }

      const effectiveActual = realActual > 0 ? realActual : Number(bl.actual_amount || 0);
      const budgetAmount = Number(bl.budget_amount || 0);
      const variance = budgetAmount - effectiveActual;
      const variancePct = budgetAmount > 0 ? ((variance / budgetAmount) * 100).toFixed(1) : '0';

      return {
        ...bl,
        account_code: a.code || '',
        account_name: a.name || '',
        field_name: f.name || '',
        program_name: p.name || '',
        activity_name: act.name || '',
        actual: effectiveActual,
        variance,
        variancePct,
      };
    });
    return { rows };
  }

  // 11. Regular SELECT queries on tables
  if (/FROM\s+finance\.fiscal_years/i.test(trimmed)) {
    const list = Object.values(tables.fiscal_years);
    if (/is_current\s*=\s*TRUE/i.test(trimmed)) {
      const cur = list.find((fy: any) => fy.is_current);
      return { rows: cur ? [cur] : list.slice(0, 1) };
    }
    if (/WHERE\s+id\s*=\s*\$1/i.test(trimmed)) {
      const id = params[0];
      const found = tables.fiscal_years[id];
      return { rows: found ? [found] : [] };
    }
    return { rows: list };
  }

  if (/FROM\s+finance\.periods/i.test(trimmed)) {
    let list = Object.values(tables.periods);
    if (/fiscal_year_id\s*=\s*\$1/i.test(trimmed) || /fiscal_year_id\s*=\s*\$2/i.test(trimmed)) {
      const fyId = params.find(p => String(p).startsWith('fy_'));
      if (fyId) {
        list = list.filter((p: any) => p.fiscal_year_id === fyId);
      }
    }
    if (/WHERE\s+id\s*=\s*\$1/i.test(trimmed)) {
      const id = params[0];
      const found = tables.periods[id];
      return { rows: found ? [found] : [] };
    }
    list.sort((a: any, b: any) => (a.period_number ?? 0) - (b.period_number ?? 0));
    return { rows: list };
  }

  // Master and general tables SELECT
  const masterTableMatch = trimmed.match(/FROM\s+finance\.(\w+)/i);
  if (masterTableMatch) {
    const tName = masterTableMatch[1];
    const tableMap = tables[tName];
    if (tableMap) {
      // SELECT single by id: WHERE id = $1
      if (/WHERE\s+(?:t\.)?id\s*=\s*\$1/i.test(trimmed)) {
        const id = params[0];
        const row = tableMap[id];
        if (row && tName === 'transactions') {
          return { rows: [hydrateTransaction(row)] };
        }
        return { rows: row ? [row] : [] };
      }

      // SELECT lines by transaction_id: WHERE transaction_id = $1
      if (tName === 'transaction_lines' && /WHERE\s+transaction_id\s*=\s*\$1/i.test(trimmed)) {
        const txId = params[0];
        const lines = Object.values(tableMap).filter((l: any) => l.transaction_id === txId);
        lines.sort((a: any, b: any) => (a.line_number || 0) - (b.line_number || 0));
        return { rows: lines };
      }

      let rows = Object.values(tableMap);

      // Filter active / soft delete
      if (!/deleted_at\s+IS\s+NOT\s+NULL/i.test(trimmed)) {
        rows = rows.filter((r: any) => !r.deleted_at);
      }

      // Order by
      rows.sort((a: any, b: any) => {
        if (a.sort_order !== undefined && b.sort_order !== undefined) return a.sort_order - b.sort_order;
        if (a.code && b.code) return String(a.code).localeCompare(String(b.code));
        if (a.created_at && b.created_at) return String(b.created_at).localeCompare(String(a.created_at));
        return 0;
      });

      // Special JOIN for transactions with vouchers:
      if (tName === 'transactions') {
        let txRows = rows.map(hydrateTransaction);

        // Queue filter
        if (/queueCondition|submitted_by|verified_by|t\.status\s*=\s*'SUBMITTED'/i.test(trimmed)) {
          const userId = params[1];
          txRows = txRows.filter((tx: any) => {
            if (tx.status === 'SUBMITTED' && tx.created_by !== userId) return true;
            if (tx.status === 'VERIFIED' && tx.created_by !== userId && tx.verified_by !== userId) return true;
            if (tx.status === 'APPROVED' && tx.created_by !== userId) return true;
            return false;
          });
        }

        // Status filter if requested in query
        if (params.includes('DRAFT') || params.includes('POSTED') || params.includes('SUBMITTED')) {
          const st = params.find(p => ['DRAFT', 'SUBMITTED', 'VERIFIED', 'APPROVED', 'POSTED', 'REJECTED', 'CANCELLED', 'REVERSED'].includes(p));
          if (st) txRows = txRows.filter((t: any) => t.status === st);
        }

        return paginateRows(txRows, trimmed, params);
      }

      // Special handling for journal_lines JOIN journals:
      if (tName === 'journal_lines' && /JOIN\s+finance\.journals/i.test(trimmed)) {
        if (/COALESCE\(SUM\(jl\.debit\)/i.test(trimmed)) {
          const totalDebit = rows.reduce((sum, r: any) => sum + Number(r.debit || 0), 0);
          const totalCredit = rows.reduce((sum, r: any) => sum + Number(r.credit || 0), 0);
          return { rows: [{ total: rows.length, total_debit: totalDebit, total_credit: totalCredit }] };
        }
      }

      return paginateRows(rows, trimmed, params);
    }
  }

  // Fallback: empty rows
  return { rows: [] };
}

function hydrateTransaction(tx: any) {
  const v = tables.vouchers[tx.voucher_id] || {};
  const vt = tables.voucher_types[v.voucher_type_id] || {};
  const j = Object.values(tables.journals).find((jn: any) => jn.transaction_id === tx.id);
  return {
    ...tx,
    voucher_number: v.voucher_number || '',
    voucher_date: v.voucher_date || tx.transaction_date,
    voucher_type_id: v.voucher_type_id || '',
    voucher_type_code: vt.code || '',
    voucher_type_name: vt.name || '',
    journal_number: (j as any)?.journal_number || null,
    posted_journal_date: (j as any)?.journal_date || null,
  };
}

function paginateRows(rows: any[], trimmed: string, params: any[]): { rows: any[] } {
  const limitMatch = trimmed.match(/LIMIT\s+(\$\d+|\d+)\s+OFFSET\s+(\$\d+|\d+)/i);
  if (limitMatch) {
    let limit = 50;
    let offset = 0;
    if (limitMatch[1].startsWith('$')) {
      const pIdx = parseInt(limitMatch[1].slice(1), 10) - 1;
      limit = Number(params[pIdx]) || 50;
    } else {
      limit = parseInt(limitMatch[1], 10);
    }
    if (limitMatch[2].startsWith('$')) {
      const pIdx = parseInt(limitMatch[2].slice(1), 10) - 1;
      offset = Number(params[pIdx]) || 0;
    } else {
      offset = parseInt(limitMatch[2], 10);
    }
    return { rows: rows.slice(offset, offset + limit) };
  }
  return { rows };
}

function handleInsert(sql: string, params: any[], tName: string): { rows: any[] } {
  if (!tables[tName]) tables[tName] = {};

  const colMatch = sql.match(/INSERT\s+INTO\s+finance\.\w+\s*\(([^)]+)\)/i);
  const prefix = tName === 'transactions' ? 'tx' : tName === 'vouchers' ? 'vch' : tName === 'transaction_lines' ? 'txl' : tName === 'journals' ? 'jrn' : tName === 'journal_lines' ? 'jnl' : tName;
  const newId = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const newRow: any = {
    id: newId,
    organization_id: FINANCE_ORG,
    created_at: new Date().toISOString(),
  };

  if (tName === 'transactions') {
    newRow.status = 'DRAFT';
    newRow.total_debit = 0;
    newRow.total_credit = 0;
  }

  if (colMatch) {
    const cols = colMatch[1].split(',').map(c => c.trim().replace(/"/g, ''));
    cols.forEach((col, idx) => {
      if (params[idx] !== undefined) {
        newRow[col] = params[idx];
      }
    });
  }

  tables[tName][newRow.id] = newRow;

  // If transaction_lines was inserted, update the parent transaction totals
  if (tName === 'transaction_lines' && newRow.transaction_id) {
    const parentTx = tables.transactions[newRow.transaction_id];
    if (parentTx) {
      const lines = Object.values(tables.transaction_lines).filter((l: any) => l.transaction_id === newRow.transaction_id);
      parentTx.total_debit = lines.reduce((sum: number, l: any) => sum + Number(l.debit || 0), 0);
      parentTx.total_credit = lines.reduce((sum: number, l: any) => sum + Number(l.credit || 0), 0);
    }
  }

  return { rows: [newRow] };
}

function handleUpdate(sql: string, params: any[], tName: string): { rows: any[] } {
  if (!tables[tName]) tables[tName] = {};

  // Find id in params (first parameter matching existing id or where id = $1)
  const idParam = params.find(p => typeof p === 'string' && tables[tName]?.[p]);
  if (!idParam) return { rows: [] };

  const row = tables[tName][idParam];
  if (!row) return { rows: [] };

  row.updated_at = new Date().toISOString();

  // Explicit totals update: UPDATE finance.transactions SET total_debit = $2, total_credit = $3, updated_at = NOW() WHERE id = $1
  if (/total_debit\s*=/i.test(sql) && /total_credit\s*=/i.test(sql)) {
    row.total_debit = Number(params[1]);
    row.total_credit = Number(params[2]);
  }

  // Status transitions
  if (/status\s*=\s*'SUBMITTED'/i.test(sql)) {
    row.status = 'SUBMITTED';
    row.submitted_at = new Date().toISOString();
    row.submitted_by = params.find(p => String(p).startsWith('u_')) || 'u_user';
  } else if (/status\s*=\s*'VERIFIED'/i.test(sql)) {
    row.status = 'VERIFIED';
    row.verified_at = new Date().toISOString();
    row.verified_by = params.find(p => String(p).startsWith('u_')) || 'u_user';
  } else if (/status\s*=\s*'APPROVED'/i.test(sql)) {
    row.status = 'APPROVED';
    row.approved_at = new Date().toISOString();
    row.approved_by = params.find(p => String(p).startsWith('u_')) || 'u_user';
  } else if (/status\s*=\s*'POSTED'/i.test(sql)) {
    row.status = 'POSTED';
    row.posted_at = new Date().toISOString();
    row.posted_by = params.find(p => String(p).startsWith('u_')) || 'u_user';

    // Synchronize Budget Lines actuals
    const lines = Object.values(tables.transaction_lines).filter((l: any) => l.transaction_id === row.id);
    for (const line of lines as any[]) {
      if (line.budget_line_id && tables.budget_lines[line.budget_line_id]) {
        const bl = tables.budget_lines[line.budget_line_id];
        const net = Number(line.debit || 0) - Number(line.credit || 0);
        bl.actual_amount = Number(bl.actual_amount || 0) + net;
        bl.available_amount = Number(bl.budget_amount || 0) - bl.actual_amount - Number(bl.committed_amount || 0);
      }
    }
  } else if (/status\s*=\s*'REJECTED'/i.test(sql)) {
    row.status = 'REJECTED';
    row.rejection_reason = params[2] || 'Ditolak saat peninjauan';
  } else if (/status\s*=\s*'DRAFT'/i.test(sql)) {
    row.status = 'DRAFT';
    row.rejection_reason = null;
  } else if (/status\s*=\s*'CANCELLED'/i.test(sql)) {
    row.status = 'CANCELLED';
  }

  return { rows: [row] };
}

function handleDelete(sql: string, params: any[], tName: string): { rows: any[] } {
  if (!tables[tName]) return { rows: [] };
  const idParam = params.find(p => typeof p === 'string' && tables[tName]?.[p]);
  if (idParam && tables[tName]?.[idParam]) {
    const deletedRow = tables[tName][idParam];
    delete tables[tName][idParam];

    // If transaction line was deleted, update transaction totals
    if (tName === 'transaction_lines' && deletedRow?.transaction_id) {
      const parentTx = tables.transactions[deletedRow.transaction_id];
      if (parentTx) {
        const lines = Object.values(tables.transaction_lines).filter((l: any) => l.transaction_id === deletedRow.transaction_id);
        parentTx.total_debit = lines.reduce((sum: number, l: any) => sum + Number(l.debit || 0), 0);
        parentTx.total_credit = lines.reduce((sum: number, l: any) => sum + Number(l.credit || 0), 0);
      }
    }
  }
  return { rows: [] };
}

