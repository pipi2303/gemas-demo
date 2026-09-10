import { Member, Sector } from '../types';

// Kode singkat nama gereja, dipakai di format No. Induk & No. KK di bawah.
export const CHURCH_CODE = 'TRIN'; // GPIB Trinitas

// Ambil nomor sektor dari nama sektor, mis. "Sektor 4" -> 4. Sama seperti pola
// yang sudah dipakai di SectorDatabase.tsx utk mengurutkan kartu sektor.
export function sectorNumber(sector: Sector): number {
  return parseInt(sector.name.replace(/\D/g, ''), 10) || 0;
}

const MEMBER_NUMBER_RE = /^TRIN-S\d+-(\d+)$/i;
const FAMILY_NUMBER_RE = /^FAM_KK_TRIN_S\d+_(\d+)$/i;

/**
 * Saran No. Induk berikutnya utk sektor tertentu, format: TRIN-S{sektor}-{00000}
 * (contoh nyata: TRIN-S4-00740). Nomor urut GLOBAL lintas sektor (bukan reset
 * per sektor) — diambil dari nomor urut TERTINGGI yang sudah dipakai + 1 di
 * SELURUH data anggota, supaya tidak pernah bentrok walau anggota pindah sektor.
 */
export function suggestNextMemberNumber(members: Member[], sector: Sector): string {
  let max = 0;
  members.forEach(m => {
    const match = m.memberNumber?.match(MEMBER_NUMBER_RE);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  });
  return `${CHURCH_CODE}-S${sectorNumber(sector)}-${String(max + 1).padStart(5, '0')}`;
}

/**
 * Saran No. KK berikutnya utk sektor tertentu, format: FAM_KK_TRIN_S{sektor}_{urut}
 * (contoh nyata: FAM_KK_TRIN_S4_227, tanpa zero-padding). Sumbernya adalah
 * field Kode Keluarga (Member.familyCode) yang sudah tersimpan — global lintas
 * sektor, sama seperti No. Induk.
 */
export function suggestNextFamilyNumber(members: Member[], sector: Sector): string {
  let max = 0;
  members.forEach(m => {
    const match = m.familyCode?.match(FAMILY_NUMBER_RE);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  });
  return `FAM_KK_${CHURCH_CODE}_S${sectorNumber(sector)}_${max + 1}`;
}
