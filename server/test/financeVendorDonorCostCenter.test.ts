// ============================================================
// FINANCE ADD-ON MODULE — Test integrasi: Pemasok, Donatur, Pusat Biaya
// ============================================================
// Menguji 3 master data baru (vendors/donors/cost_centers, CRUD generik lewat
// createMasterDataRouter — sama seperti master data lain) DAN yang paling
// penting: bahwa dimensi ini benar-benar mengalir sampai ke General Ledger.
// cost_center_id ditambahkan ke finance.transaction_lines DAN
// finance.journal_lines lewat ALTER TABLE (bukan CREATE TABLE, karena kedua
// tabel itu sudah live sebelum fitur ini ada) — test ini adalah bukti bahwa
// migrasi ALTER TABLE ADD COLUMN IF NOT EXISTS benar-benar diterapkan dan
// bahwa logic posting & pembalikan jurnal (financeTransaction.ts, kode yang
// sama yang pernah punya bug kritis "Balik Jurnal selalu gagal") menyalin
// cost_center_id dengan benar ke kedua arah.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, seedBaseFinanceData, uniqueCode } from './helpers.js';
import { getPool } from '../lib/db.js';

describe('Finance — Pemasok, Donatur, Pusat Biaya', () => {
  let app: any;
  let seed: Awaited<ReturnType<typeof seedBaseFinanceData>>;
  const admin = authHeader('user-admin-vdc');
  const verifier = authHeader('user-verifier-vdc');
  const approver = authHeader('user-approver-vdc');

  beforeAll(async () => {
    app = await getTestApp();
    seed = await seedBaseFinanceData(app, request, admin);
  });

  it('CRUD Pemasok (vendor)', async () => {
    const createRes = await request(app).post('/api/v1/finance/vendors').set('Authorization', admin).send({
      code: uniqueCode('VND'), name: 'CV Sumber Berkat Test', contact_person: 'Budi', phone: '0812xxxx',
    });
    expect(createRes.status).toBe(201);
    const vendor = createRes.body.data;
    expect(vendor.is_active).toBe(true);

    const listRes = await request(app).get('/api/v1/finance/vendors').set('Authorization', admin);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.find((v: any) => v.id === vendor.id)).toBeTruthy();

    const updateRes = await request(app).put(`/api/v1/finance/vendors/${vendor.id}`).set('Authorization', admin).send({ phone: '0813yyyy' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.phone).toBe('0813yyyy');

    const delRes = await request(app).delete(`/api/v1/finance/vendors/${vendor.id}`).set('Authorization', admin);
    expect(delRes.status).toBe(200);
    const afterDelete = await request(app).get('/api/v1/finance/vendors').set('Authorization', admin);
    expect(afterDelete.body.data.find((v: any) => v.id === vendor.id)).toBeUndefined();
  });

  it('CRUD Donatur (donor), wajib pilih tipe donatur', async () => {
    const missingType = await request(app).post('/api/v1/finance/donors').set('Authorization', admin).send({ code: uniqueCode('DNR'), name: 'Anonim Test' });
    expect(missingType.status).toBe(400);

    const createRes = await request(app).post('/api/v1/finance/donors').set('Authorization', admin).send({
      code: uniqueCode('DNR'), name: 'Ibu Sari Test', donor_type: 'INDIVIDUAL',
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.donor_type).toBe('INDIVIDUAL');
  });

  it('CRUD Pusat Biaya (cost center) dengan hierarki induk-anak', async () => {
    const parentRes = await request(app).post('/api/v1/finance/cost-centers').set('Authorization', admin).send({
      code: uniqueCode('PB'), name: 'Sekretariat Test',
    });
    expect(parentRes.status).toBe(201);
    const parent = parentRes.body.data;

    const childRes = await request(app).post('/api/v1/finance/cost-centers').set('Authorization', admin).send({
      code: uniqueCode('PB'), name: 'Sekretariat - Umum Test', parent_id: parent.id,
    });
    expect(childRes.status).toBe(201);
    expect(childRes.body.data.parent_id).toBe(parent.id);
  });

  it('vendor_id/donor_id tersimpan di header transaksi & bisa diedit', async () => {
    const vendorRes = await request(app).post('/api/v1/finance/vendors').set('Authorization', admin).send({ code: uniqueCode('VND'), name: 'Vendor A' });
    const vendorA = vendorRes.body.data;
    const vendorRes2 = await request(app).post('/api/v1/finance/vendors').set('Authorization', admin).send({ code: uniqueCode('VND'), name: 'Vendor B' });
    const vendorB = vendorRes2.body.data;
    const donorRes = await request(app).post('/api/v1/finance/donors').set('Authorization', admin).send({ code: uniqueCode('DNR'), name: 'Donor A', donor_type: 'ORGANIZATION' });
    const donorA = donorRes.body.data;

    const createTxRes = await request(app).post('/api/v1/finance/transactions').set('Authorization', admin).send({
      voucher_type_id: seed.voucherTypeId, fiscal_year_id: seed.fiscalYearId, transaction_date: seed.transactionDate,
      description: 'Bayar ke vendor', vendor_id: vendorA.id, donor_id: donorA.id,
    });
    expect(createTxRes.status).toBe(201);
    const tx = createTxRes.body.data;
    expect(tx.vendor_id).toBe(vendorA.id);
    expect(tx.donor_id).toBe(donorA.id);

    const editRes = await request(app).put(`/api/v1/finance/transactions/${tx.id}`).set('Authorization', admin).send({ vendor_id: vendorB.id });
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.vendor_id).toBe(vendorB.id);
    // donor_id tidak dikirim di body edit ini — harus tetap seperti semula (COALESCE), bukan tertimpa null
    expect(editRes.body.data.donor_id).toBe(donorA.id);
  });

  it('cost_center_id di baris transaksi ikut mengalir ke journal_lines saat posting & pembalikan', async () => {
    const ccRes = await request(app).post('/api/v1/finance/cost-centers').set('Authorization', admin).send({ code: uniqueCode('PB'), name: 'Pusat Biaya Flow Test' });
    const costCenter = ccRes.body.data;

    const createTxRes = await request(app).post('/api/v1/finance/transactions').set('Authorization', admin).send({
      voucher_type_id: seed.voucherTypeId, fiscal_year_id: seed.fiscalYearId, transaction_date: seed.transactionDate,
      description: 'Transaksi dengan pusat biaya',
    });
    const tx = createTxRes.body.data;

    const l1 = await request(app).post(`/api/v1/finance/transactions/${tx.id}/lines`).set('Authorization', admin).send({
      account_id: seed.expenseAccountId, side: 'debit', amount: 50000, cost_center_id: costCenter.id,
    });
    expect(l1.status).toBe(201);
    expect(l1.body.data.cost_center_id).toBe(costCenter.id);
    await request(app).post(`/api/v1/finance/transactions/${tx.id}/lines`).set('Authorization', admin).send({
      account_id: seed.assetAccountId, side: 'credit', amount: 50000,
    });

    const submitRes = await request(app).put(`/api/v1/finance/transactions/${tx.id}/submit`).set('Authorization', admin);
    expect(submitRes.status).toBe(200);
    const verifyRes = await request(app).put(`/api/v1/finance/transactions/${tx.id}/verify`).set('Authorization', verifier);
    expect(verifyRes.status).toBe(200);
    const approveRes = await request(app).put(`/api/v1/finance/transactions/${tx.id}/approve`).set('Authorization', approver);
    expect(approveRes.status).toBe(200);
    const postRes = await request(app).put(`/api/v1/finance/transactions/${tx.id}/post`).set('Authorization', approver);
    expect(postRes.status).toBe(200);

    // Cek langsung ke database: baris jurnal (journal_lines) hasil posting harus
    // membawa cost_center_id yang sama dengan baris transaksi asalnya — ini bukti
    // ALTER TABLE ADD COLUMN sukses diterapkan DAN logic /:id/post benar menyalinnya.
    const pool = getPool();
    const journalLinesRes = await pool.query(
      `SELECT jl.cost_center_id FROM finance.journal_lines jl
       JOIN finance.journals j ON j.id = jl.journal_id
       WHERE j.journal_number = $1 AND jl.debit > 0`,
      [postRes.body.data.journal_number]
    );
    expect(journalLinesRes.rows.length).toBeGreaterThan(0);
    expect(journalLinesRes.rows[0].cost_center_id).toBe(costCenter.id);

    const reverseRes = await request(app).put(`/api/v1/finance/transactions/${tx.id}/reverse`).set('Authorization', approver).send({ reason: 'test' });
    expect(reverseRes.status).toBe(200);
    expect(reverseRes.body.data.status).toBe('REVERSED');

    // Jurnal pembalik juga harus membawa cost_center_id yang sama (kredit kali ini,
    // karena sisi debit/kredit dibalik) — regression untuk logic /:id/reverse.
    const reversalLinesRes = await pool.query(
      `SELECT jl.cost_center_id FROM finance.journal_lines jl
       JOIN finance.journals j ON j.id = jl.journal_id
       WHERE j.journal_number = $1 AND jl.credit > 0`,
      [reverseRes.body.data.reversal_journal_number]
    );
    expect(reversalLinesRes.rows.length).toBeGreaterThan(0);
    expect(reversalLinesRes.rows[0].cost_center_id).toBe(costCenter.id);
  });
});
