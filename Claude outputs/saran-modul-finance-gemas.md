# Saran Penguatan Modul Finance Add-on GEMAS

**Konteks**: review ini saya lakukan langsung dari kode Finance Add-on di branch `main` repo `gemas-demo` (skema database, 9 route backend, komponen laporan, dan modul lama Persembahan/QRIS yang masih berjalan paralel). Catatan penting: fitur pencarian web tidak bisa diakses di sesi ini, jadi rujukan standar akuntansi (ISAK 35, dst.) di bawah ini berdasarkan pengetahuan saya — mohon dikonfirmasi ulang ke akuntan/bendahara sinode atau dokumen resmi IAI sebelum dijadikan dasar keputusan formal, terutama untuk hal yang menyangkut kepatuhan/audit.

## Yang sudah kuat (jangan diubah, ini fondasi yang bagus)

Modul ini sebenarnya sudah jauh lebih matang dari kebanyakan aplikasi keuangan gereja yang saya tahu:

- **Double-entry accounting asli**, bukan pencatatan kas sederhana — setiap transaksi menghasilkan jurnal dengan `total_debit = total_credit` (dijaga di level database via CHECK constraint), bukan cuma di level aplikasi.
- **Fund accounting** sudah ada secara struktural: tabel `finance.funds` dengan `fund_type` (GENERAL/PROGRAM/SPECIAL/BUILDING/DIAKONIA/SINODAL/OTHER) dan `restriction_type` (UNRESTRICTED/RESTRICTED/TEMPORARILY_RESTRICTED/PERMANENTLY_RESTRICTED) — ini konsep yang sama dipakai standar akuntansi nirlaba, dan kategorinya (Pembangunan, Diakonia, Sinodal) sudah cocok dengan istilah yang lazim dipakai gereja di Indonesia.
- **Segregation of duties** end-to-end: pembuat transaksi tidak bisa verifikasi/approve/posting transaksinya sendiri, berlaku untuk semua role termasuk Admin, ditegakkan di backend bukan cuma UI.
- **Jejak audit terpusat** — semua aksi sensitif (submit/verify/approve/reject/post/reverse, dst.) tercatat di log aktivitas.
- **Penutupan periode** dengan checklist dan pencegahan reopen periode kalau periode setelahnya sudah closed — ini kontrol yang sering dilewatkan aplikasi serupa.
- **RBAC granular sampai ke submenu** (baru selesai) — bisa atur siapa boleh lihat/approve di level "Verifikasi & Persetujuan" terpisah dari "Transaksi & Voucher".
- Sudah ada label eksplisit **"PSAK 45 / ISAK 35"** dan **"Standar Akuntansi Sinode GPIB"** di halaman Laporan Keuangan — jadi arah standarnya memang sudah disengaja sejak desain awal, bukan ditempel belakangan.

## Gap terhadap standar akuntansi nonlaba Indonesia

1. **Label "PSAK 45 / ISAK 35" perlu diluruskan.** Setahu saya PSAK 45 sudah dicabut dan digantikan ISAK 35 (efektif 2020) — keduanya bukan dua standar yang berlaku bersamaan. Kalau laporan ini akan dilihat auditor/sinode, sebaiknya badge-nya cukup "ISAK 35" saja (atau tambahkan tahun efektifnya), supaya tidak menimbulkan pertanyaan soal standar mana yang sebenarnya dipakai.
2. **Laporan Arus Kas belum ada.** Tab laporan saat ini cuma tiga: Neraca, Laporan Aktivitas, Realisasi Anggaran. Laporan Arus Kas (metode langsung/tidak langsung) itu salah satu dari 5 laporan keuangan lengkap yang biasanya diharapkan untuk entitas nonlaba — dan justru ini yang paling sering ditanyakan Majelis/Sinode karena langsung menjawab "uang kas gereja sebenarnya berapa, masuk-keluar dari mana". Karena datanya (jurnal, cash_accounts, bank_accounts) sudah lengkap di skema, ini kemungkinan besar bisa dibangun tanpa perubahan skema, murni laporan baru dari data yang sudah ada.
3. **Catatan atas Laporan Keuangan (CaLK) belum ada sebagai fitur.** Ini bagian yang sering dianggap "cuma pelengkap" padahal isinya penting: kebijakan akuntansi, rincian saldo per akun, pengungkapan dana terikat vs tidak terikat, dsb. Tanpa ini, Neraca dan Laporan Aktivitas jadi angka tanpa konteks buat pembaca yang bukan bendahara.
4. **Laporan Perubahan Aset Neto** — biasanya berdiri sendiri (atau minimal jadi section eksplisit di dalam Laporan Aktivitas) yang menunjukkan pergerakan saldo tiap kelompok dana dari awal ke akhir periode. Kalau saat ini itu belum ada rinciannya per fund_type di Laporan Aktivitas, ini titik yang gampang jadi pertanyaan auditor.
5. **Klasifikasi 4 tingkat (`restriction_type`) vs standar saat ini.** ISAK 35 (setahu saya) menyederhanakan klasifikasi aset neto jadi 2 kategori utama (dengan pembatasan / tanpa pembatasan dari penyumbang), bukan 4 tingkat gaya lama. Skema `finance.funds` yang sekarang tidak perlu diubah (4 tingkat itu tetap berguna untuk pencatatan internal yang lebih detail), tapi laporan yang tampil ke sinode idealnya me-roll-up otomatis ke 2 kategori itu supaya formatnya sesuai standar yang berlaku, dengan rincian 4 tingkat tadi dipindah ke CaLK.

## Gap terhadap praktik umum gereja di Indonesia

1. **Modul Persembahan/QRIS lama tidak terhubung ke Finance Add-on.** Ini temuan paling penting menurut saya. `offerings` (Persembahan Digital) masih collection JSON terpisah (`server/routes/data.ts`), sama sekali tidak menyentuh `finance.transactions`/`finance.donors`. Artinya persembahan yang masuk lewat QRIS harus dicatat ULANG secara manual ke Finance Add-on kalau mau masuk pembukuan resmi — risiko selisih pencatatan dan kerja dobel buat bendahara. Ini sejalan dengan catatan lama bahwa cutover dari ChurchFinanceHub belum dilakukan; kalau fokus penguatan berikutnya cuma boleh pilih satu hal, saya sarankan ini.
2. **Belum ada kwitansi/bukti sumbangan formal.** Untuk donatur korporat/CSR yang butuh bukti resmi (apalagi kalau menyangkut pengurangan pajak penghasilan atas sumbangan keagamaan), tidak ada generator kwitansi/bukti terima sumbangan bernomor urut. Tabel `finance.donors` juga belum punya kolom NPWP — perlu kalau donatur korporat minta bukti potong/pengurang pajak resmi.
3. **Tidak ada export PDF/Excel untuk laporan** — cuma `window.print()` (dialog print browser). Untuk laporan yang harus dikirim ke Majelis Sinode atau diarsipkan, PDF terformat rapi (dengan kop, nomor halaman, tanda tangan Ketua Majelis/Bendahara) jauh lebih praktis daripada hasil print-to-PDF dari browser yang layout-nya bisa berantakan.
4. **Tidak ada jejak tanda tangan/pengesahan pada laporan tercetak.** Laporan keuangan gereja biasanya perlu pengesahan berjenjang (Bendahara → Ketua Majelis Jemaat → kadang diketahui Sinode). Saat ini validasi cuma ada di alur digital (approve/post transaksi), tapi laporan akhir yang dicetak tidak punya area/metadata "disetujui oleh, tanggal" yang tercatat di sistem.

## Pertimbangan lain yang sering terlewat

- **UU Pelindungan Data Pribadi (PDP)** — tabel `finance.donors` menyimpan nama, telepon, email, alamat. Kalau nanti ada fitur ekspor/laporan yang menyertakan data ini, pastikan aksesnya dibatasi RBAC (sudah ada) dan tidak ikut ter-export tanpa kontrol ke pihak luar sistem.
- **Retensi dokumen** — kalau jemaat/yayasan punya NPWP dan melapor pajak, dokumen pendukung transaksi keuangan lazimnya perlu disimpan minimal 10 tahun sesuai ketentuan perpajakan. Cek apakah kebijakan backup/retensi database & lampiran dokumen sudah mengakomodasi ini (di luar cakupan kode yang saya tinjau sesi ini).
- **Rekonsiliasi bank sudah ada** — bagus, tapi pastikan ada laporan/reminder rutin (misal bulanan) supaya rekonsiliasi tidak menumpuk, karena ini modul yang gampang "dilewatkan" kalau tidak ada pengingat.

## Rekomendasi prioritas

**Prioritas tinggi** (dampak besar, risiko kalau dibiarkan):
1. Integrasikan Persembahan/QRIS ke Finance Add-on (satu sumber data, bukan dua sistem paralel).
2. Tambah Laporan Arus Kas.
3. Perbaiki label standar (ISAK 35 saja, bukan "PSAK 45 / ISAK 35").

**Prioritas sedang**:
4. Tambah Catatan atas Laporan Keuangan (CaLK) — minimal versi sederhana: kebijakan akuntansi, rincian saldo akun signifikan, catatan dana terikat.
5. Export PDF/Excel untuk ketiga laporan yang sudah ada, dengan area tanda tangan pengesahan.
6. Roll-up otomatis 4 tingkat `restriction_type` ke 2 kategori ISAK 35 di tampilan laporan resmi.

**Prioritas rendah / nice-to-have**:
7. Generator kwitansi/bukti sumbangan bernomor urut + kolom NPWP di data donatur.
8. Laporan Perubahan Aset Neto sebagai section terpisah.
9. Pengingat rutin rekonsiliasi bank bulanan.

Kalau mau, saya bisa langsung buat rencana implementasi teknis (skema, endpoint, komponen) untuk salah satu prioritas di atas — mulai dari yang mana?
