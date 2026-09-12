# Deep Analysis: Menu Persembahan Digital & Dashboard Finance (GEMAS)

**Metode**: review langsung ke kode di repo `gemas-demo` — frontend (`OfferingsQRIS.tsx`, `finance/FinanceDashboard.tsx`), backend (`server/routes/data.ts`, `financeTransaction.ts`, `financeDashboard.ts`), schema (`financeSchema.ts`), test (`financeDepositOfferings.test.ts`, `financeDashboard.test.ts`), dan riwayat git. Bukan asumsi — semua temuan di bawah dirujuk ke file/baris/commit spesifik supaya bisa diverifikasi ulang.

**Koreksi penting atas analisis sebelumnya**: dokumen `Claude outputs/saran-modul-finance-gemas.md` (dibuat 2026-09-10 00:25) menyebut "Modul Persembahan/QRIS lama tidak terhubung ke Finance Add-on" sebagai temuan prioritas tertinggi. Itu **sudah tidak akurat** — commit `ac72cdd` ("Setor ke Buku Besar — jembatani Persembahan/QRIS ke Finance Add-on"), tanggal 2026-09-09, sehari **sebelum** dokumen itu ditulis, sudah menambahkan jembatan agregasi. Jadi status sebenarnya: **sudah terhubung, tapi lewat jembatan manual berjenjang**, bukan "tidak terhubung sama sekali". Detail dan implikasinya di bawah.

---

## 1. Ringkasan Eksekutif

Kedua menu ini sebenarnya bagian dari satu alur yang sama, cuma beda tahap:

**Persembahan Digital** = titik pencatatan mentah (siapa memberi, berapa, lewat apa) → **Dashboard Finance** = cermin hasil akhir setelah data itu melewati alur akuntansi penuh (setor → verifikasi → approval → posting). Ini penting dipahami karena banyak potensi kesalahpahaman pengguna (terutama Majelis) muncul justru dari jarak antara dua tahap ini, bukan dari bug.

Temuan paling signifikan:
1. **Risiko integritas data nyata** — record persembahan yang sudah disetor ke buku besar masih bisa diedit/dihapus tanpa penguncian (Bagian 2.2).
2. **"QRIS" di UI bukan payment gateway sungguhan** — cuma label metode pembayaran yang diinput manual (Bagian 2.3).
3. **Dashboard Finance sudah solid secara teknis** (Fase 9, dibangun dengan beberapa iterasi audit-fix yang cukup matang) — tapi punya satu gap komunikasi: dashboard hanya mencerminkan jurnal yang **sudah diposting**, jadi bisa terlihat "lebih rendah" dari uang yang sebenarnya sudah diterima kalau approval tertunda (Bagian 3).

---

## 2. Menu Persembahan Digital (`offerings`)

### 2.1 Yang sudah baik
- CRUD-nya tercatat di `AUDITED_COLLECTIONS` (`server/routes/data.ts`) — setiap tambah/ubah/hapus otomatis masuk Log Aktivitas dengan before/after diff.
- RBAC ada di level route (`requirePermission()` generik) — bukan cuma disembunyikan di UI.
- Ada jembatan resmi ke Finance Add-on: **"Setor ke Buku Besar"** (`OfferingsQRIS.tsx` baris ~301–360, endpoint `POST /api/v1/finance/transactions/deposit-offerings`). Ini desainnya cukup matang:
  - Agregasi per rentang tanggal, dipisah kategori × metode pembayaran (Tunai → voucher BKM, Transfer/QRIS → voucher BBM) — sesuai kebiasaan bendahara yang menghitung persembahan secara batch, bukan per-transaksi individual.
  - **Idempoten**: setiap offering yang berhasil disetor ditandai `depositedTransactionId`/`depositedAt`, jadi tidak akan ke-agregasi dua kali.
  - **Race-condition aman**: pakai `SELECT ... FOR UPDATE` dalam transaksi Postgres saat setor, supaya dua permintaan setor yang tumpang tindih tanggal tidak menghitung uang yang sama dua kali. ADA test khusus untuk skenario ini (`financeDepositOfferings.test.ts`, "mencegah 2 request setor bersamaan...").
  - Mapping kategori persembahan → akun GL diambil dari tabel `finance.offering_deposit_map` (bukan hardcode), jadi bendahara bisa ubah struktur akun tanpa mematahkan fitur ini.
  - Hasil setoran tetap masuk sebagai transaksi **DRAFT** — tidak auto-posted, tetap harus lewat alur verifikasi/approval yang sama seperti transaksi manual. Ini keputusan desain yang tepat dari sisi kontrol internal.
- Test coverage untuk fitur setor ini cukup baik: 6 skenario termasuk data rusak (nominal ≤ 0), kode akun yang diganti setelah seed, dan race condition.

### 2.2 Gap — record yang sudah disetor masih bisa diubah/dihapus (prioritas tertinggi)

Setelah offering ditandai `depositedTransactionId` (artinya sudah jadi bagian dari voucher resmi di Finance Add-on), record aslinya di collection `offerings` **masih bisa di-PUT atau di-DELETE lewat endpoint CRUD generik** (`PUT/DELETE /api/data/offerings/:id`, di `server/routes/data.ts`) — tidak ada pengecekan status setor sama sekali di kedua handler tersebut.

Yang membuat ini terasa seperti gap yang seharusnya bisa dihindari: codebase **sudah punya pola yang sama** untuk kasus serupa. Modul Surat Menyurat punya `blockNonEditableLetterWrite()` yang menolak PUT/DELETE begitu status surat sudah lewat tahap awal ("Surat ini sudah diproses lebih lanjut dan tidak bisa diedit langsung"). Persembahan yang sudah disetor secara konsep sama persis — statusnya sudah "lewat tahap awal" — tapi belum punya guard yang setara.

**Dampak konkret**: kalau seseorang (sengaja atau tidak) mengubah nominal atau menghapus record persembahan yang sudah disetor, angka di voucher/jurnal Finance Add-on **tidak ikut berubah** (karena Finance Add-on sudah punya salinan datanya di `transaction_lines`), tapi sumber data mentahnya sudah tidak sinkron. Ini bikin rekonsiliasi dan audit trail persembahan jadi tidak bisa dipercaya penuh — justru di titik yang paling sensitif (uang persembahan jemaat).

### 2.3 Gap — "QRIS" adalah label manual, bukan payment gateway

Field `paymentMethod: 'QRIS'` dan `qrisReference` (`OfferingsQRIS.tsx`) murni input teks manual oleh admin/bendahara setelah transfer diterima — tidak ada integrasi payment gateway (Midtrans/Xendit/dsb.), tidak ada generate kode QR dinamis, tidak ada webhook konfirmasi otomatis. Ini valid sebagai *pencatatan* pembayaran QRIS yang diterima lewat kanal lain (misal EDC/QRIS statis gereja), tapi nama menu "Persembahan Digital" + label "QRIS" berpotensi memberi ekspektasi ke Majelis/jemaat bahwa ada alur bayar digital end-to-end. Perlu diluruskan supaya ekspektasi (dan rencana ke depan, kalau memang mau bangun gateway asli) jelas.

### 2.4 Gap lain (prioritas lebih rendah, konsisten dengan temuan sebelumnya)
- Tidak ada generator kwitansi/bukti sumbangan bernomor urut.
- Tidak ada kolom NPWP di data donatur (relevan untuk donatur korporat yang butuh bukti potong pajak).
- RBAC untuk `offerings` masih lewat `checkPermission` generik (submenu tunggal), belum sedetail RBAC Finance Add-on yang granular per-aksi (view/create/approve terpisah).

---

## 3. Menu Dashboard Finance

### 3.1 Yang sudah baik
Ini modul yang paling matang dari yang saya tinjau di add-on Finance:
- Semua angka dihitung **real-time dari jurnal yang sudah diposting** (`finance.journals`/`finance.journal_lines`) — tidak ada tabel ringkasan/cache yang berisiko basi.
- Sudah melalui **beberapa iterasi audit-fix yang terdokumentasi jelas di komentar kode** — ini sinyal proses QA yang sehat, bukan cuma dibangun sekali lalu dilupakan:
  - Perhitungan realisasi anggaran disamakan dengan Laporan Realisasi Anggaran (dulu beda status budget yang dihitung → dua angka berbeda untuk data yang sama).
  - Estimasi *runway* likuiditas dulu hardcode asumsi tahun fiskal mulai April — sekarang dihitung dari `start_date` Tahun Fiskal yang sebenarnya.
  - Badge "Jurnal Seimbang" dulu teks statis — sekarang benar-benar mengecek `total_debit == total_credit` di semua jurnal sebagai jaring pengaman audit.
- Cakupan cukup lengkap: Neraca ringkas, YTD revenue/expense, tren bulanan, status transaksi, top 5 akun beban & pendapatan, likuiditas kas+bank, ringkasan anggaran, status periode.
- UI sudah eksplisit memberi tahu pengguna bahwa data yang ditampilkan adalah "Agregasi mutasi jurnal yang **sudah diposting**" — jadi tim sadar akan batasan ini dan sudah dikomunikasikan, bagus.

### 3.2 Gap — jarak antara "uang sudah masuk" dan "tampil di dashboard"
Karena dashboard murni dari jurnal yang sudah **diposting**, ada 3 gerbang manual antara persembahan masuk dan angka itu muncul di Dashboard Finance: **Setor ke Buku Besar → Verifikasi → Approval + Posting**. Kalau salah satu gerbang ini tertunda (misal penyetuju sedang cuti), Dashboard Finance akan menunjukkan pendapatan yang lebih rendah dari uang yang sebenarnya sudah diterima jemaat/gereja pada tanggal itu.

Ini **bukan bug** — justru konsisten dengan prinsip akuntansi (jangan akui pendapatan sebelum diverifikasi/diposting) dan dashboard sudah cukup transparan soal ini di teksnya. Tapi kalau Majelis/Sinode melihat dashboard sebagai "laporan real-time keuangan gereja" tanpa tahu ada gerbang manual ini, penurunan angka bisa disalahartikan sebagai penurunan persembahan jemaat, padahal cuma keterlambatan approval administratif. Dashboard sebenarnya sudah menghitung `pendingApproval` (jumlah transaksi berstatus SUBMITTED+VERIFIED+APPROVED) — pertanyaannya apakah angka ini ditampilkan cukup mencolok di UI untuk mengatasi kesalahpahaman itu.

### 3.3 Gap lain
- **Tidak ada perbandingan antar-Tahun Fiskal** (YoY) di satu layar — user harus ganti dropdown Tahun Fiskal manual untuk bandingkan. Cukup untuk kebutuhan operasional harian, tapi kurang untuk laporan tahunan ke Sinode yang biasanya butuh perbandingan tahun berjalan vs tahun lalu.
- **Tidak ada auto-refresh** — data dimuat sekali saat halaman dibuka / ganti Tahun Fiskal, tidak polling. Untuk dashboard yang mungkin dibuka lama di layar TV/command center, ini berarti data bisa basi kalau tidak di-reload manual (relevan kalau ada rencana menampilkan ini di HDCC-style command center — lihat catatan proyek HDCC Anda).
- **Test coverage baru 3 skenario** — jauh lebih tipis dibanding modul deposit-offerings (6 skenario). Untuk modul dengan logika kalkulasi sekompleks ini (realisasi anggaran, runway, balance sheet), risiko regresi cukup tinggi kalau perubahan skema akun/jurnal di masa depan tidak tertangkap test.
- Query real-time tanpa caching — untuk volume transaksi satu jemaat/tahun kemungkinan besar masih aman, tapi worth dipantau kalau jumlah jurnal tahunan bertambah signifikan (misal kalau nanti dipakai multi-jemaat/sinode).

---

## 4. Insight yang menghubungkan keduanya

- **Data lineage-nya sekarang: Persembahan Digital (sumber) → Setor ke Buku Besar (batch, manual, per-tanggal) → alur approval Finance Add-on → Dashboard Finance (hasil akhir).** Empat tahap ini perlu dipahami bersama sebagai satu alur oleh siapa pun yang menjelaskan ke Majelis, karena kalau dijelaskan terpisah-pisah ("ini menu persembahan", "ini menu dashboard") orang bisa mengira keduanya independen, padahal satu memberi makan yang lain dengan jeda manual di tengahnya.
- **Titik integritas data paling rapuh justru ada di ujung sumber (2.2), bukan di ujung dashboard.** Dashboard-nya sendiri sudah dijaga ketat (double-entry, balance check, segregation of duties yang matang di Finance Add-on) — tapi kalau data mentah persembahan bisa diubah diam-diam setelah disetor, kekuatan kontrol di hilir jadi kurang berarti karena hulu-nya belum terkunci.
- **Label "QRIS" berisiko membentuk ekspektasi yang salah** baik ke jemaat (mengira ada scan-to-pay) maupun ke Majelis (mengira ada rekonsiliasi otomatis dengan bank/PJP) — ini bukan soal kode yang salah, tapi soal komunikasi produk yang perlu diluruskan lebih dulu sebelum diputuskan apakah akan dibangun sungguhan.

---

## 5. Rencana Tindak Lanjut

**Prioritas tinggi (risiko integritas data — sebaiknya jangan ditunda)**

1. **Kunci record `offerings` setelah `depositedTransactionId` terisi.** Tambahkan fungsi setara `blockNonEditableLetterWrite()` — sebut saja `blockNonEditableOfferingWrite()` — dipanggil di `PUT` dan `DELETE /api/data/offerings/:id` (`server/routes/data.ts`). Kalau memang perlu koreksi setelah disetor (misal salah input nominal), arahkan ke alur resmi: reversal/adjustment di Finance Add-on, bukan edit langsung di sumber.
   - *Effort*: kecil — pola sudah ada di codebase untuk letters, tinggal direplikasi untuk collection `offerings`.
   - *Verifikasi*: tambah test — PUT/DELETE ke offering ber-`depositedTransactionId` harus ditolak (403), offering yang belum disetor tetap bisa diedit normal.

**Prioritas sedang**

2. **Perjelas status "pending approval" di Dashboard Finance.** Backend sudah menghitung `pendingApproval` — pastikan ini ditampilkan cukup mencolok (misal badge/notice di bagian atas dashboard: "N transaksi senilai Rp X masih menunggu verifikasi/approval, belum tercermin di angka di atas") supaya penurunan YTD revenue tidak disalahartikan sebagai penurunan persembahan riil.
3. **Luruskan label "QRIS" di menu Persembahan Digital.** Minimal ubah jadi sesuatu seperti "Transfer/QRIS (dicatat manual)" plus tooltip singkat, supaya jelas ini pencatatan manual, bukan payment gateway otomatis. Kalau ke depan memang ada rencana integrasi QRIS sungguhan (perlu kerja sama PJP/acquirer, webhook, rekonsiliasi otomatis), itu jadi keputusan produk terpisah dengan effort jauh lebih besar — sebaiknya didiskusikan dulu dengan Pak Wisnu/Pak Rivel apakah ini memang jadi arah roadmap.
4. **Tambah test coverage Dashboard Finance** untuk skenario yang belum tercakup: Tahun Fiskal tanpa periode terdefinisi, kondisi jurnal tidak seimbang (memastikan badge audit benar-benar mendeteksi), campuran status budget (APPROVED/ACTIVE/REVISED sekaligus).

**Prioritas rendah / nice-to-have**

5. Generator kwitansi/bukti sumbangan bernomor urut + kolom NPWP di `finance.donors` (relevan untuk donatur korporat).
6. Tampilan perbandingan antar-Tahun Fiskal (YoY) di Dashboard Finance, kalau memang dibutuhkan untuk laporan tahunan ke Sinode.
7. Auto-refresh berkala di Dashboard Finance kalau rencananya ditampilkan di layar command center (relevan dengan konteks proyek HDCC).

---

## 6. Yang perlu dikonfirmasi (asumsi, bukan fakta)

- Apakah GEMAS memang berencana punya payment gateway QRIS sungguhan suatu saat, atau pencatatan manual seperti sekarang memang sudah cukup untuk kebutuhan operasional? (menentukan apakah item #3 relevan sebagai roadmap atau cukup perbaikan label saja)
- Apakah memang pernah/akan ada kebutuhan mengoreksi persembahan yang sudah disetor? Kalau ya, alur resminya (reversal transaksi vs edit langsung) perlu disepakati sebelum implementasi #1.
- Skala volume transaksi tahunan saat ini — untuk menilai apakah query real-time tanpa cache di Dashboard Finance (Bagian 3.3) memang perlu dioptimasi sekarang atau bisa ditunda.

Kalau mau, saya bisa langsung buat spesifikasi teknis (perubahan skema/endpoint kalau ada, kode guard, dan test) untuk item prioritas #1 — itu yang paling mendesak dari sisi risiko.
