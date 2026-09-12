# Status Progress — 12 September 2026

Catatan status supaya pekerjaan bisa dilanjutkan tanpa perlu dijelaskan ulang dari awal.

## 1. Sudah selesai & tersimpan di folder ini (belum di-commit ke git)

### Rename menu
"Peminjaman Ruangan" → "Manajemen Ruangan" di 5 lokasi (sidebar, judul halaman,
pencarian global, label Backup & Restore, label permission). 4 lokasi lain
SENGAJA tidak diubah karena maknanya beda (status booking, riwayat booking,
komentar kode) — lihat `src/app/components/RoomBooking.tsx`,
`src/app/context/AppContext.tsx`, `src/app/components/DashboardLayout.tsx`,
`src/app/components/BackupRestore.tsx`, `src/lib/permissions.ts`.

### Manajemen Aset (`src/app/components/AssetManagement.tsx`)
- Hapus teks UI yang mengklaim integrasi otomatis ke Finance (padahal sudah
  sengaja dihapus sebelumnya karena bug double-counting) — panel "Integrasi
  dengan Modul Lain" & label form sekarang jujur bilang TIDAK terhubung.

### Manajemen Ruangan (`src/app/components/RoomBooking.tsx`, `src/app/types/index.ts`, `src/app/context/AppContext.tsx`)
- Field `roomType` ditambahkan ke `Room` (master data ruangan) — sebelumnya
  tidak ada, sehingga booking selalu hardcode `roomType: 'Aula'`. Sekarang
  diambil dari ruangan yang dipilih.
- Dialog "Kelola Ruangan" baru: tambah/edit ruangan, nonaktifkan (bukan hapus)
  ruangan yang masih punya riwayat booking, log aktivitas untuk perubahan
  ruangan. Fungsi `addRoom/updateRoom/deleteRoom` sudah lama ada di
  `AppContext` tapi sebelumnya tidak dipakai UI manapun.
- Validasi baru: jam selesai harus > jam mulai, jumlah peserta tidak boleh
  melebihi kapasitas ruangan.
- `approvedBy`/`approvedDate` sekarang otomatis terisi saat status booking
  diubah jadi Approved.

**Belum dikerjakan dari rencana perbaikan modul ini**: cek konflik jadwal
lintas modul (RoomBooking vs Jadwal Ibadah/Event Kalender — via nama ruangan
yang cocok persis, kalau tidak cocok dilewati saja sesuai jawaban user:
"bisa ada 2 kemungkinan karena ruangan gereja terbatas"), pindahkan validasi
ke server-side, validasi server-side untuk data Aset, pisahkan permission
`approve` dari `edit`, alur pelepasan/penghapusbukuan aset, keputusan soal
integrasi akuntansi aset tetap ke Finance (lihat poin 2 di bawah).

## 2. Proyek besar: GEMAS jadi multi-tenant (ratusan gereja)

Keputusan yang SUDAH disepakati user:
1. Skala: ratusan gereja
2. Provisioning tenant baru: Admin Pusat (bukan self-service)
3. Satu user cuma terikat ke satu tenant (tidak ada user lintas-tenant)
4. GPIB Trinitas jadi tenant pertama (id `gpib-trinitas`, data existing
   otomatis milik tenant ini)
5. Identifikasi tenant saat login: kode tenant di form login (3 field: Kode
   Gereja + Username + Password) — bukan subdomain, bukan username gabungan
6. Model database: shared database (bukan silo per gereja) + Postgres
   Row-Level Security (RLS) sebagai lapisan pertahanan tambahan, karena infra
   saat ini kecil (1 CPU/512MB, self-hosted Docker) — database-per-tenant
   berisiko kehabisan resource/koneksi di skala ratusan tenant

### Rencana fase (lihat detail lengkap di riwayat chat sesi ini)
0. **Skema dasar + RLS — SUDAH DITULIS, BELUM TERVERIFIKASI KE DATABASE**
   (lihat detail di bawah)
1. Login & Auth (3 field, JWT + organizationId, user lookup per-tenant)
2. CRUD generik `db.ts` — 8 fungsi + route `/api/data/:collection` + mock
   in-memory, semua pakai transaksi eksplisit (`BEGIN`+`SET LOCAL`+query+
   `COMMIT`) supaya RLS jalan benar
3. Finance module — ganti konstanta `FINANCE_ORG='gpib-trinitas'` jadi
   dinamis dari `req.user.organizationId`, pola transaksi sama seperti Fase 2
4. Admin Pusat — portal/role baru untuk bikin tenant baru
5. Re-scoping Backup/Restore & Pencarian Global supaya per-tenant
6. Test isolasi tenant (termasuk test SQL mentah yang membuktikan RLS
   benar-benar fail-closed)

### Fase 0 — detail teknis yang sudah dikerjakan
File baru: `server/lib/tenancySchema.ts` (idempotent, pola sama seperti
`financeSchema.ts`), sudah di-wire ke `server/lib/db.ts` (`initSchema()`,
dipanggil sebelum `initFinanceSchema`). Isinya:
- Tabel `organizations` (id, tenant_code, name, is_active), seed tenant
  pertama `gpib-trinitas` / kode `TRINITAS`
- Kolom `organization_id` ditambahkan ke `gemas_store`, default
  `'gpib-trinitas'` supaya data lama otomatis ter-assign
- Primary key `gemas_store` diganti dari `(collection, id)` jadi
  `(collection, organization_id, id)`, plus FK RESTRICT ke `organizations`
  dan index
- RLS diaktifkan di `gemas_store` dengan **fallback transisi**: kalau session
  belum set `app.current_org_id` (karena Fase 1/2 belum jalan), policy
  default ke `gpib-trinitas` — supaya app yang sedang jalan sekarang TIDAK
  rusak begitu migrasi ini aktif
- Role terbatas `gemas_app_role` disiapkan (SELECT/INSERT/UPDATE/DELETE ke
  `gemas_store` + skema `finance`, TAPI belum bisa LOGIN) — mengaktifkannya
  (kasih password + ganti `DATABASE_URL`) itu langkah manual terpisah,
  BELUM dilakukan karena itu rotasi kredensial produksi

**PENTING — belum terverifikasi ke database sungguhan.** Sudah lolos cek
sintaks (`node --check`) tapi belum pernah benar-benar dijalankan lawan
Postgres asli karena database dev lokal belum berhasil dinyalakan di port
yang sesuai `.env` (`DATABASE_URL` menunjuk `127.0.0.1:5433`, tapi container
`gemas_dev_db` ternyata terpasang ke port 5434 — belum ketemu container mana
yang benar untuk port 5433, atau `.env` perlu disesuaikan).

### Hal yang menggantung, perlu dijawab user saat lanjut
1. Ada container `gemas-multitenant` (image
   `ghcr.io/pipi2303/gemas-multitenant:latest`) yang sudah jalan 5 hari,
   lengkap dengan database sendiri (`gemas-multitenant_db`) — **belum
   dikonfirmasi user** apakah ini percobaan/prototipe multi-tenant yang
   sudah ada sebelumnya (yang mungkin perlu dilihat dulu isinya supaya
   tidak duplikat kerjaan), atau proyek lain yang tidak berhubungan.
2. Port database dev yang benar untuk repo `gemas-demo` ini belum ketemu —
   perlu dicek `docker start gemas_db && docker port gemas_db`, atau kalau
   tidak ada yang cocok dengan 5433, putuskan mau pakai container mana
   (mis. `gemas_dev_db` di port 5434, tinggal `.env` disesuaikan) atau buat
   container baru.

## 3. Commit git

4 commit terakhir sudah masuk ke `main` (rename menu & perbaikan Aset/
Ruangan BELUM ikut ter-commit, masih uncommitted sejak sesi ini):
- Laporan Arus Kas + ISAK 35 rollup + export PDF/Excel
- Integrasi QRIS & kunci Persembahan yang sudah disetor ke Buku Besar
- Perbaikan Dashboard Finance
- Dokumen analisis (2 file di folder ini)
