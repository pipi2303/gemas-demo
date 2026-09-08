# Test Finance Add-on

Suite ini adalah test **integrasi terhadap PostgreSQL asli** (lihat catatan
di `helpers.ts`), bukan mock — dipilih karena bug produksi paling berbahaya
yang pernah ditemukan di modul ini (`journals.transaction_id` sempat UNIQUE
polos, membuat fitur Balik Jurnal selalu gagal) hanya bisa ketahuan lewat
eksekusi SQL sungguhan, bukan lewat `npm run build` (repo ini tidak punya
`tsconfig.json`, jadi tidak ada pengecekan tipe saat build).

## Menjalankan di lokal

**JANGAN** arahkan `DATABASE_URL` ke database dev/production yang sama
dipakai `npm run dev` (lihat `.env`) — test ini membuat & menghapus data
(tahun fiskal, transaksi, RKA, dst.) dan akan mengotori data yang sama.
Selalu pakai database KOSONG/disposable, mis. lewat Postgres lokal terpisah:

```bash
# Contoh: Postgres lokal terpisah khusus test, database baru "gemas_test"
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/gemas_test" \
JWT_SECRET="ganti-dengan-secret-minimal-32-karakter-untuk-test" \
npm test
```

Test dijalankan SATU FILE PADA SATU WAKTU (`vitest.config.ts` set
`fileParallelism: false`) karena semua file berbagi satu skema finance yang
sama (organization_id konstan `gpib-trinitas`) — menjalankan paralel bisa
membuat test saling menimpa data (mis. RKA "aktif" satu test dianggap
"revised" oleh test lain di tahun fiskal yang sama).

## Di CI

Lihat `.github/workflows/deploy.yml` — job `test` menyediakan Postgres lewat
GitHub Actions service container, terisolasi otomatis per run, dan
`build-and-push`/`deploy` hanya jalan kalau `test` lolos.

## Cakupan

- `financeCrud.unit.test.ts` — unit test murni (tanpa DB) untuk helper
  pagination (`parsePagination`/`paginationMeta`).
- `financeTransaction.test.ts` — siklus hidup DRAFT→POSTED→REVERSED,
  segregation of duties, pagination list & antrian approval. Termasuk
  regression test untuk bug kritis "Balik Jurnal selalu gagal" (4cc90a3).
- `financeBudget.test.ts` — siklus hidup RKA, segregation of duties,
  aktivasi versi baru menurunkan versi lama ke REVISED.
- `financePeriodClosing.test.ts` — checklist penutupan periode, dan
  regression test gap #4 (reopen periode diblokir selama periode
  setelahnya masih tertutup — c8962da).
- `financeReconciliation.test.ts` — segregation of duties pada
  penyelesaian/persetujuan sesi rekonsiliasi bank.
- `dataPagination.test.ts` — pagination opsional di endpoint generik
  `GET /api/data/:collection` (dipakai modul non-finance: Log Aktivitas, dll).
  Termasuk regression test untuk bug nyata yang ditemukan saat menulis test
  ini sendiri: memindahkan `parsePagination`/`paginationMeta` ke
  `pagination.ts` sempat memakai `export { x } from './y.js'` di
  `financeCrud.ts`, yang HANYA mengekspor ulang tanpa membuat binding lokal —
  menyebabkan `ReferenceError` saat runtime yang tidak akan ketahuan dari
  `npm run build` saja (lihat komentar di file test).

Tidak semua endpoint tercakup (lihat memori proyek untuk gap yang belum
diuji) — suite ini fokus pada risiko regresi yang sudah pernah nyata
ditemukan di modul ini, bukan cakupan 100%.
