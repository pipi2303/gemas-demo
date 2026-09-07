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

/** Seed data dasar (akun, tahun fiskal + 12 periode otomatis, jenis voucher sudah
 *  ter-seed dari initSchema) yang dibutuhkan hampir semua test transaksi/RKA. */
export async function seedBaseFinanceData(app: any, request: any, adminHeader: string) {
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
  const fyRes = await request(app).post('/api/v1/finance/fiscal-years').set('Authorization', adminHeader).send({
    code: fyCode, name: `Tahun Fiskal Test ${fyCode}`, startDate: '2031-01-01',
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
