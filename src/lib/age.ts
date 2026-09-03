// Util bersama untuk menghitung usia jemaat.
//
// Field `age` pada data Member cuma snapshot: dihitung SEKALI saat data
// dibuat/diimport/terakhir diedit, lalu disimpan begitu saja — tidak
// otomatis nambah tiap kali ulang tahun lewat. Kalau dipakai apa adanya,
// semua rekap/laporan berbasis kelompok usia (Anak/Remaja/Pemuda/Dewasa/
// Lansia, rata-rata usia, dsb) lama-lama meleset dari kenyataan karena
// orang "naik kelompok usia" di dunia nyata tapi datanya tidak ikut naik
// sampai recordnya disentuh lagi.
//
// liveAge() menghitung ulang usia dari birthDate setiap kali dipanggil,
// jadi selalu akurat terhadap tanggal hari ini. Pakai ini (bukan field
// `m.age` mentah) di mana pun usia dipakai untuk pengelompokan/laporan.
export function calcAge(birthDate?: string): number {
  if (!birthDate) return 0;
  return Math.floor((Date.now() - new Date(birthDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

export function liveAge(m: { birthDate?: string; age?: number }): number {
  return m.birthDate ? calcAge(m.birthDate) : (m.age ?? 0);
}
