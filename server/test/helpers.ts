// ============================================================
// FINANCE ADD-ON MODULE — Test helpers (integrasi terhadap PostgreSQL asli)
// ============================================================
// Bukan mock: helper ini menyalakan schema finance (initSchema) yang sama
// persis dipakai server produksi, lalu membuat Express app lewat createApp()
// (fungsi yang sama dipakai server/index.ts) dan mengujinya lewat supertest —
// jadi test-test yang pakai helper ini benar-benar mengetes routing + SQL,
// bukan cuma unit logic terisolasi. Lihat server/test/README.md.
// ============================================================
import { createApp } from '../app.js';
import { initSchema, getPool } from '../lib/db.js';
import { signToken } from '../lib/jwt.js';

let schemaReady: Promise<void> | null = null;

export async function getTestApp() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL belum diset — test finance ini butuh koneksi PostgreSQL asli ' +
      '(bukan in-memory fallback). Jalankan Postgres lokal/CI service dan set ' +
      'DATABASE_URL sebelum menjalankan `npm test`.'
    );
  }
  if (!schemaReady) {
    schemaReady = initSchema();
  }
  await schemaReady;
  return createApp();
}

export function tokenFor(userId: string, opts: { username?: string; name?: string; role?: string } = {}) {
  return signToken({
    userId,
    username: opts.username ?? userId,
    name: opts.name ?? opts.username ?? userId,
    role: opts.role ?? 'Admin',
  });
}

export function authHeader(userId: string, opts?: { username?: string; name?: string; role?: string }) {
  return `Bearer ${tokenFor(userId, opts)}`;
}

export function uniqueCode(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

/** Cek satu entry di jejak audit (gemas_store, collection activityLogs) — dipakai untuk
 *  memverifikasi recordFinanceAudit() benar-benar menulis, tanpa perlu endpoint API baru. */
export async function findAuditEntry(entityId: string, action: string): Promise<any | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT data FROM gemas_store WHERE collection = 'activityLogs' ORDER BY updated_at DESC LIMIT 500`
  );
  for (const row of result.rows) {
    const parsed = JSON.parse(row.data);
    if (parsed.entityId === entityId && parsed.action === action) return parsed;
  }
  return null;
}

/** Tahun mulai tahun fiskal yang DIJAMIN belum pernah dipakai fiscal year lain di
 *  database yang sama (selalu MAX(tahun) + 1 dari finance.fiscal_years yang sudah
 *  ada). Dipakai HANYA oleh pemanggil yang lolos `uniqueFiscalYear: true` (lihat
 *  seedBaseFinanceData di bawah) -- BUKAN default, supaya tidak mengubah tahun
 *  yang dipakai file test lain yang sudah menghardcode tanggal literal '2031-...'
 *  (mis. financeDepositOfferings.test.ts) relatif terhadap fiscal year default.
 *  Kenapa dibutuhkan: database test ini persisten (tidak di-reset otomatis antar
 *  file/antar run test, lihat README), dan HAMPIR SEMUA pemanggil seedBaseFinanceData
 *  sengaja berbagi tahun fiskal default yang sama (2031) karena mereka menyaring
 *  query-nya sendiri lewat fiscal_year_id/account_id spesifik -- aman dari tabrakan.
 *  TAPI Laporan Arus Kas (GET /reports/cash-flow) sengaja menjumlahkan SEMUA
 *  jurnal satu organisasi dalam rentang tanggal tanpa memandang fiscal_year_id
 *  (benar untuk produksi -- cuma ada 1 organisasi nyata), jadi kalau test-nya
 *  memakai tahun fiskal yang sama dengan file lain, transaksi file lain yang
 *  jatuh di periode Jan/Feb/Mar yang sama ikut kehitung -- financeCashFlow.test.ts
 *  sempat gagal dengan total PERSIS 2x lipat karena ini. */
async function nextUnusedFiscalYearStart(): Promise<string> {
  const pool = getPool();
  const r = await pool.query(
    `SELECT COALESCE(MAX(EXTRACT(YEAR FROM start_date)::int), 2030) AS max_year FROM finance.fiscal_years`
  );
  const nextYear = Number(r.rows[0].max_year) + 1;
  return `${nextYear}-01-01`;
}

/** Seed data dasar (akun, tahun fiskal + 12 periode otomatis, jenis voucher sudah
 *  ter-seed dari initSchema) yang dibutuhkan hampir semua test transaksi/RKA.
 *  `uniqueFiscalYear: true` -- HANYA untuk test yang melakukan query agregat
 *  org-wide berdasarkan rentang tanggal murni (lihat komentar nextUnusedFiscalYearStart
 *  di atas) -- default tetap '2031-01-01' seperti sebelumnya supaya file test lain
 *  yang mengasumsikan tahun itu (tanggal literal, dsb.) tidak berubah perilaku. */
export async function seedBaseFinanceData(
  app: any, request: any, adminHeader: string,
  opts: { uniqueFiscalYear?: boolean } = {}
) {
  const groupsRes = await request(app).get('/api/v1/finance/account-groups').set('Authorization', adminHeader);
  const groups = groupsRes.body.data as any[];
  const expGroup = groups.find(g => g.code === 'EXP');
  const astGroup = groups.find(g => g.code === 'AST');
  if (!expGroup || !astGroup) throw new Error('Kelompok akun EXP/AST tidak ditemukan — cek seed default di financeSchema.ts');

  const expAccRes = await request(app).post('/api/v1/finance/accounts').set('Authorization', adminHeader).send({
    group_id: expGroup.id, code: uniqueCode('EXPACC'), name: 'Beban Test (otomatis dari test suite)',
  });
  const astAccRes = await request(app).post('/api/v1/finance/accounts').set('Authorization', adminHeader).send({
    group_id: astGroup.id, code: uniqueCode('ASTACC'), name: 'Kas Test (otomatis dari test suite)',
  });

  const vtRes = await request(app).get('/api/v1/finance/voucher-types').set('Authorization', adminHeader);
  const voucherType = (vtRes.body.data as any[]).find(v => v.code === 'BM');
  if (!voucherType) throw new Error('Jenis Voucher BM (Bukti Memorial) tidak ditemukan di seed default');

  const fyCode = uniqueCode('FY');
  const fyStartDate = opts.uniqueFiscalYear ? await nextUnusedFiscalYearStart() : '2031-01-01';
  const fyRes = await request(app).post('/api/v1/finance/fiscal-years').set('Authorization', adminHeader).send({
    code: fyCode, name: `Tahun Fiskal Test ${fyCode}`, startDate: fyStartDate,
  });
  const fiscalYear = fyRes.body.data;

  const periodsRes = await request(app)
    .get(`/api/v1/finance/fiscal-years/${fiscalYear.id}/periods`)
    .set('Authorization', adminHeader);
  const periods = periodsRes.body.data as any[];

  return {
    expenseAccountId: expAccRes.body.data.id as string,
    assetAccountId: astAccRes.body.data.id as string,
    voucherTypeId: voucherType.id as string,
    fiscalYearId: fiscalYear.id as string,
    periods,
    transactionDate: periods[0].start_date as string,
  };
}
