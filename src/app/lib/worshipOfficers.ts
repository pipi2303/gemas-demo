import { WorshipSchedule, WorshipOfficerGroup } from '../types';

// Kategori default kalau Master Data "kategori_petugas_ibadah" masih kosong.
export const DEFAULT_OFFICER_CATEGORIES = [
  'Pengkhotbah / Pendeta',
  'Liturgis',
  'Pemimpin Pujian',
  'Pianis / Organis',
  'Multimedia',
];

// Pemetaan kategori lama (field tunggal) -> kata kunci kategori baru, utk kompatibilitas data lama.
const LEGACY_FIELD_KEYWORDS: { field: keyof WorshipSchedule; keyword: string }[] = [
  { field: 'preacher', keyword: 'pengkhotbah' },
  { field: 'liturgist', keyword: 'liturgis' },
  { field: 'worship_leader', keyword: 'pemimpin pujian' },
  { field: 'pianist', keyword: 'pianis' },
];

/**
 * Bangun peta { kategori: nama[] } utk diedit di form, dari data jadwal yang ada.
 * Prioritas: field `officers` baru. Kalau kosong/belum ada, fallback ke field tunggal lama.
 */
export function buildOfficerRecord(schedule: Partial<WorshipSchedule> | null | undefined, categories: string[]): Record<string, string[]> {
  const rec: Record<string, string[]> = {};
  if (schedule?.officers && schedule.officers.length > 0) {
    schedule.officers.forEach(g => {
      if (!g.category) return;
      rec[g.category] = [...(g.names || [])];
    });
    return rec;
  }
  if (schedule) {
    LEGACY_FIELD_KEYWORDS.forEach(({ field, keyword }) => {
      const val = schedule[field];
      if (typeof val !== 'string' || !val.trim()) return;
      const matchCat = categories.find(c => c.toLowerCase().includes(keyword)) || categories[0];
      if (!matchCat) return;
      rec[matchCat] = [...(rec[matchCat] || []), val];
    });
  }
  return rec;
}

// Turunkan field tunggal lama (preacher/liturgist/worship_leader/pianist) dari peta kategori baru,
// supaya konsumen lama (Dashboard, pencarian global, dll) yang masih baca field tunggal tetap jalan.
export function deriveLegacyOfficerFields(rec: Record<string, string[]>): Pick<WorshipSchedule, 'preacher' | 'liturgist' | 'worship_leader' | 'pianist'> {
  const firstByKeyword = (keyword: string): string | undefined => {
    const entry = Object.entries(rec).find(([cat]) => cat.toLowerCase().includes(keyword));
    const name = entry?.[1]?.find(n => n.trim());
    return name || undefined;
  };
  return {
    preacher: firstByKeyword('pengkhotbah'),
    liturgist: firstByKeyword('liturgis'),
    worship_leader: firstByKeyword('pemimpin pujian'),
    pianist: firstByKeyword('pianis'),
  };
}

// Konversi peta { kategori: nama[] } dari form -> array WorshipOfficerGroup utk disimpan (buang kategori/nama kosong).
export function officerRecordToArray(rec: Record<string, string[]>): WorshipOfficerGroup[] {
  return Object.entries(rec)
    .map(([category, names]) => ({ category, names: (names || []).map(n => n.trim()).filter(Boolean) }))
    .filter(g => g.names.length > 0);
}

// Ambil semua nama dari kategori yang label-nya mengandung `keyword`, dengan fallback ke field tunggal lama.
export function getOfficerNamesByKeyword(schedule: WorshipSchedule, keyword: string, legacyField?: keyof WorshipSchedule): string {
  if (schedule.officers && schedule.officers.length > 0) {
    const names = schedule.officers
      .filter(g => g.category.toLowerCase().includes(keyword))
      .flatMap(g => g.names)
      .filter(Boolean);
    if (names.length > 0) return names.join(', ');
  }
  if (legacyField) {
    const val = schedule[legacyField];
    if (typeof val === 'string') return val;
  }
  return '';
}

// Daftar tampilan petugas (utk kartu/detail): gabungan `officers` baru + fallback field lama, tanpa duplikasi.
export function getDisplayOfficerGroups(schedule: WorshipSchedule): WorshipOfficerGroup[] {
  if (schedule.officers && schedule.officers.length > 0) {
    return schedule.officers.filter(g => g.names && g.names.length > 0);
  }
  const rec = buildOfficerRecord(schedule, DEFAULT_OFFICER_CATEGORIES);
  return Object.entries(rec).map(([category, names]) => ({ category, names }));
}

// Semua nama petugas (flat, unik) — dipakai utk pencarian & ringkasan di kartu list.
export function getAllOfficerNames(schedule: WorshipSchedule): string[] {
  const groups = getDisplayOfficerGroups(schedule);
  const names = groups.flatMap(g => g.names).filter(Boolean);
  return Array.from(new Set(names));
}
