// Util bersama untuk menyamakan variasi penulisan Status Pelkat.
//
// Data anggota hasil import Excel menyimpan kolom "Pelkat" apa adanya sesuai
// isian file sumber (mis. "GP", "Pelkat GP", "PELKAT-GP"), sedangkan pilihan
// di Master Data / filter dropdown punya format sendiri (mis. "PELKAT GP").
// Perbandingan string persis (===) gampang gagal cocok padahal secara makna
// sama. normPelkat() membuang kata "PELKAT" dan semua karakter non-alfanumerik
// supaya "PELKAT-GP" / "PELKAT GP" / "Pelkat GP" / "GP" semuanya dianggap sama.
export function normPelkat(val: any): string {
  return String(val || '').toUpperCase().replace(/PELKAT/g, '').replace(/[^A-Z0-9]/g, '');
}

// Label tampilan untuk kode Pelkat yang sudah dinormalisasi (dipakai saat
// menampilkan rekap/breakdown, bukan data mentah dari database).
export const PELKAT_LABELS: Record<string, string> = {
  PA: 'Pelayanan Anak',
  PT: 'Persekutuan Teruna',
  GP: 'Gerakan Pemuda',
  PKP: 'Persekutuan Kaum Perempuan',
  PKB: 'Persekutuan Kaum Bapak',
  PKLU: 'Persekutuan Kaum Lanjut Usia',
};
