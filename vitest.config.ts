import { defineConfig } from 'vitest/config';

// Suite ini adalah test INTEGRASI terhadap PostgreSQL asli (bukan mock/in-memory),
// sengaja meniru metodologi yang dipakai untuk memverifikasi modul Finance secara
// manual sebelumnya (lihat server/test/README.md) — beberapa file test berbagi satu
// skema database finance yang sama (organization_id konstan FINANCE_ORG), jadi
// dijalankan SATU FILE PADA SATU WAKTU (bukan paralel) supaya tidak saling
// menimpa data satu sama lain.
export default defineConfig({
  test: {
    include: ['server/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
