# Rencana Kerja: Master Data QRIS, Konsolidasi Master Data Finance, & Penguncian Setoran Persembahan

**Konteks**: dokumen ini merangkum hasil diskusi desain sebelum eksekusi, lanjutan dari `analisis-persembahan-dashboard-finance.md`. Semua keputusan di bawah sudah disepakati lewat diskusi bertahap — dokumen ini menyatukannya jadi satu rencana kerja yang siap dieksekusi atau direview tim.

---

## Ringkasan 5 item pekerjaan

| # | Item | Lokasi | Sifat |
|---|------|--------|-------|
| 1 | Tab baru **Data QRIS** | Master Data Finance | Fitur baru |
| 2 | Tab baru **Peta Setoran Persembahan** | Master Data Finance | Fitur baru (menutup gap lama) |
| 3 | Pindah **Jenis Persembahan** + **Metode Pembayaran** | Master Data General → Master Data Finance | Pemindahan + guard |
| 4 | Hapus **6 kategori mati** | Master Data General | Pembersihan |
| 5 | **Kunci record persembahan** yang sudah disetor | Backend (`server/routes/data.ts`) | Perbaikan risiko integritas data |

Urutan pengerjaan yang disarankan: **3 → 4 → 2 → 1 → 5** (lihat catatan dependensi di tiap bagian), tapi kelimanya bisa juga dikerjakan sebagai satu paket sekaligus karena saling terkait dan sama-sama menyentuh area Master Data Finance.

---

## 1. Tab baru "Data QRIS"

**Tujuan**: menyimpan gambar kode QRIS (bisa lebih dari satu) yang dipakai aplikasi, dengan dukungan multi-kategori dan multi-tujuan tampil.

**Model data (pendekatan ringan — tanpa migrasi skema besar):**

- `finance.qris_codes` (tabel baru)
  - `label` — nama kode (mis. "QRIS Persembahan Mingguan", "QRIS Natal 2026")
  - `image_data` + `mime_type` — gambar QR (base64), divalidasi format PNG/JPEG + magic bytes + batas ukuran, mengikuti pola validasi dokumen yang sudah ada di `server/routes/data.ts` (`validateDocumentData`), hanya disesuaikan untuk tipe gambar bukan PDF
  - `bank_account_id` / `cash_account_id` — rekening/kas tujuan (opsional, FK ke master data Finance yang sudah ada — boleh sama atau beda antar kode)
  - `event_tag` — label event/musim, teks bebas (mis. "Natal 2026"), tanpa tanggal berlaku otomatis
  - `is_displayed` — toggle tampil/sembunyi di aplikasi (terpisah dari status aktif)
  - `is_active` / soft-delete (`deleted_at`) — **wajib soft-delete, bukan hard delete**, karena record persembahan bisa mereferensikan kode ini (lihat poin di bawah)
  - `sort_order`
- `finance.qris_code_categories` (join table, baru) — `qris_code_id` + `category` (teks, cocok dengan nilai `jenis_persembahan`). Satu kode boleh punya banyak baris kategori → mendukung "1 kode ke banyak kategori".

**Link dari record persembahan ke kode QRIS yang dipakai:**

- Tambah field opsional di record `offerings`: `qrisCodeId` (referensi ke `finance.qris_codes.id`) + `qrisCodeLabel` (**snapshot nama pada saat input**, supaya riwayat lama tidak ikut berubah kalau kode di-rename kemudian).
- Field ini hanya relevan saat `paymentMethod` = Transfer/QRIS; tidak wajib diisi untuk Tunai.
- Di form Persembahan Digital, `qrisReference` (teks bebas) dilengkapi/diganti jadi dropdown pilih dari kode QRIS yang aktif (`is_active`, bukan cuma yang `is_displayed` — karena availability untuk pencatatan internal beda urusan dari tampil-tidaknya ke publik).

**Titik pemakaian di aplikasi:**

- **Persembahan Digital** — panel bantu menampilkan kode QRIS yang sesuai kategori terpilih (untuk ditunjukkan ke jemaat/discan), plus dropdown pemilihan kode saat mencatat transaksi (lihat poin link di atas).
- **E-Warta** — section otomatis "Kode QRIS Persembahan" berisi semua kode dengan `is_displayed = true`, mengikuti pola auto-generate section yang sudah ada di `EWarta.tsx` (section "Jadwal Ibadah" dibangun otomatis dari data lain) — bukan fitur baru dari nol, tinggal ikut pola yang sudah terbukti.

**Catatan risiko yang perlu disadari (bukan diblokir, cukup diketahui):**

- `category` di `qris_code_categories` cocok berdasarkan teks nama kategori, bukan ID stabil — kalau kategori di-rename/dihapus di tab Jenis Persembahan, relasi ini bisa jadi "yatim" tanpa notifikasi eksplisit. Mitigasinya ada di Item #3 (guard pemakaian).
- Peluang pengembangan lanjutan (tidak dikerjakan sekarang): kalau tiap kode QRIS punya rekening tujuan sendiri, fitur "Setor ke Buku Besar" suatu saat bisa dikembangkan untuk memisahkan setoran per rekening sesuai kode yang dipakai, bukan cuma 2 ember Tunai/Transfer seperti sekarang.

---

## 2. Tab baru "Peta Setoran Persembahan"

**Tujuan**: menutup gap yang ditemukan di analisis awal — `finance.offering_deposit_map` (pemetaan kategori persembahan → akun GL/dana/kas untuk fitur "Setor ke Buku Besar") sekarang **tidak punya UI sama sekali**, hanya bisa diisi lewat SQL seed manual oleh developer.

**Cakupan:**
- CRUD untuk `finance.offering_deposit_map`, mengikuti pola `createMasterDataRouter` yang sudah dipakai 13 entitas lain di Master Data Finance.
- Tetap pakai `map_key` string seperti sekarang (tidak diubah jadi FK ID di putaran ini — konsisten dengan keputusan "pendekatan ringan").
- Field yang dikelola: kategori (map_key), akun GL tujuan, dana terkait, kas/rekening terkait.

**Dependensi**: sebaiknya dikerjakan setelah Item #3 & #4 (supaya daftar kategori yang muncul di dropdown pemetaan ini sudah bersih dari 6 kategori mati dan sudah berada di lokasi final Master Data Finance).

---

## 3. Pindah "Jenis Persembahan" & "Metode Pembayaran" ke Master Data Finance

**Cakupan (pendekatan ringan):**
- Pindahkan tab `jenis_persembahan` dan `metode_pembayaran` dari halaman Master Data General (`MasterData.tsx`, grup "Keuangan") ke Master Data Finance — sebagai tab baru di sana.
- **Tidak ada migrasi skema** — data tetap di collection generik yang sama, fungsi `addMasterDataItem`/`updateMasterDataItem`/`deleteMasterDataItem` di `AppContext.tsx` tetap dipakai apa adanya. Ini murni pemindahan lokasi tampilan.
- **Tambahkan guard pemakaian**: sebelum admin rename/hapus item kategori `jenis_persembahan`, cek dulu apakah nama itu masih dipakai di `finance.offering_deposit_map` dan/atau `finance.qris_code_categories` — kalau ya, tampilkan peringatan jumlah pemakaian sebelum submit. Ini mitigasi murah untuk risiko "yatim" yang disebut di Item #1 dan gap lama di Item #2, tanpa perlu foreign key sungguhan.

**Konsekuensi yang perlu dikomunikasikan:**
- RBAC berubah: yang bisa mengedit dua kategori ini jadi terbatas ke pemegang akses Finance (`finance-master-data`), bukan lagi siapa pun yang punya akses Master Data umum. Perlu dikonfirmasi tidak ada user non-Finance yang selama ini mengelolanya.
- Data historis (persembahan lama yang sudah tersimpan dengan kategori/metode tertentu) tidak terpengaruh.

---

## 4. Hapus 6 kategori mati di Master Data General

**Yang dihapus**: `tipe_rekening`, `kategori_keuangan_masuk`, `kategori_keuangan_keluar`, `kategori_kas_kecil`, `sumber_kas_kecil`, `status_kas_kecil` — sudah dikonfirmasi lewat pengecekan kode (`getMasterDataByCategory(...)` tidak pernah dipanggil untuk keenamnya di komponen manapun) bahwa ini peninggalan modul klasik "Keuangan & Persembahan" (ChurchFinanceHub/FinancialManagement) yang sudah dihapus total kodenya, tapi master data-nya lupa ikut dibersihkan.

**File yang berubah:**
- `src/app/components/MasterData.tsx` — buang 6 entri dari `GROUPS` (grup "Keuangan") dan `CAT_META`.
- `src/app/context/AppContext.tsx` — buang baris seed default untuk 6 kategori itu.
- `src/app/types/index.ts` — buang 6 nilai itu dari union type `MasterDataCategory`.

**Catatan sebelum eksekusi**: cek dulu apakah ada data existing di database production untuk 6 kategori ini (kemungkinan besar tidak ada karena modulnya sudah lama dihapus, tapi baik dipastikan supaya tidak ada yang kaget kalau ternyata ada isinya yang jadi tidak terlihat lagi di UI).

---

## 5. Kunci record persembahan yang sudah disetor

**Gap** (dari analisis awal): record `offerings` yang sudah ditandai `depositedTransactionId` (sudah jadi bagian voucher resmi di Finance Add-on) masih bisa di-PUT/DELETE lewat endpoint CRUD generik tanpa penguncian — padahal codebase sudah punya pola yang sama persis untuk modul Surat Menyurat (`blockNonEditableLetterWrite`).

**Perbaikan:**
- Tambahkan fungsi setara `blockNonEditableOfferingWrite()` di `server/routes/data.ts`, dipanggil di `PUT`/`DELETE /api/data/offerings/:id` — menolak perubahan kalau `depositedTransactionId` sudah terisi, dengan pesan jelas mengarahkan ke alur resmi (reversal/adjustment di Finance Add-on) untuk koreksi.
- Tambah test: PUT/DELETE ke offering ber-`depositedTransactionId` harus ditolak (403); offering yang belum disetor tetap bisa diedit normal.

**Independen** dari 4 item lainnya — bisa dikerjakan kapan saja, termasuk lebih dulu, tanpa menunggu yang lain.

---

## Pertanyaan yang masih perlu dikonfirmasi sebelum eksekusi

1. Kode QRIS: dropdown pemilihan di form Persembahan Digital menampilkan kode `is_active`, tanpa syarat `is_displayed` — apakah ini sesuai (yaitu, kode boleh dipakai mencatat transaksi internal meski sedang disembunyikan dari tampilan publik E-Warta)?
2. Apakah ada user non-Finance yang saat ini mengelola `jenis_persembahan`/`metode_pembayaran` lewat Master Data umum, yang perlu diberi akses Finance setelah dipindah?
3. Konfirmasi tidak ada data existing di 6 kategori mati sebelum dihapus (Item #4).

---

Kalau seluruh rencana ini sudah final, langkah berikutnya adalah menyusun spesifikasi teknis rinci (skema SQL, endpoint per tabel, perubahan komponen per file, dan skenario test) untuk masing-masing dari 5 item di atas.
