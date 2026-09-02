/**
 * import-jemaat-trinitas.mjs — Import data jemaat dari
 * "Data_Jemaat_Merged_Sektor_3_4.xlsx" (format kolom GPIB: No_induk, Nama_Lengkap_Jemaat,
 * Sektor_Pelayanan, dst) ke aplikasi gemas-demo lewat REST API-nya.
 *
 * Jalankan:
 *   GEMAS_BASE_URL=http://localhost:3000 \
 *   GEMAS_USERNAME=admin \
 *   GEMAS_PASSWORD=admin123 \
 *   GEMAS_EXCEL_FILE="C:/Users/user/Documents/Data Trinitas/Data_Jemaat_Merged_Sektor_3_4.xlsx" \
 *   node scripts/import-jemaat-trinitas.mjs
 */
import XLSX from 'xlsx';

const BASE_URL   = process.env.GEMAS_BASE_URL;
const USERNAME   = process.env.GEMAS_USERNAME;
const PASSWORD   = process.env.GEMAS_PASSWORD;
const EXCEL_FILE = process.env.GEMAS_EXCEL_FILE;
const SHEET_NAME = process.env.GEMAS_SHEET_NAME || 'daftar_jemaat_gpib_2026-08-29';
const BATCH_SIZE = 100;

if (!BASE_URL || !USERNAME || !PASSWORD || !EXCEL_FILE) {
  console.error('❌ Set env var: GEMAS_BASE_URL, GEMAS_USERNAME, GEMAS_PASSWORD, GEMAS_EXCEL_FILE');
  process.exit(1);
}

const MONTHS = {
  jan: '01', januari: '01',
  feb: '02', februari: '02',
  mar: '03', maret: '03',
  apr: '04', april: '04',
  mei: '05', may: '05',
  jun: '06', juni: '06', june: '06',
  jul: '07', juli: '07', july: '07',
  agu: '08', agt: '08', agustus: '08', aug: '08',
  sep: '09', sept: '09', september: '09',
  okt: '10', oktober: '10', oct: '10', october: '10',
  nov: '11', november: '11',
  des: '12', desember: '12', dec: '12', december: '12',
};

function safeStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s && !['none', 'nan', '-', ''].includes(s.toLowerCase()) ? s : null;
}

function parseIndoDate(v) {
  const s = safeStr(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/);
  if (!m) return null;
  const [, day, monName, year] = m;
  const mm = MONTHS[monName.toLowerCase()];
  if (!mm) return null;
  return `${year}-${mm}-${day.padStart(2, '0')}`;
}

function calcAge(birthDate) {
  if (!birthDate) return 0;
  const bd = new Date(birthDate);
  if (Number.isNaN(bd.getTime())) return 0;
  return Math.floor((Date.now() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function mapGender(v) {
  const s = safeStr(v);
  if (s && s.toLowerCase().startsWith('p')) return 'Perempuan';
  return 'Laki-laki';
}

function mapYn(v) {
  const s = safeStr(v);
  if (!s) return null;
  return /sudah/i.test(s) ? 'Sudah' : /belum/i.test(s) ? 'Belum' : null;
}

function normalizeFamilyRole(v) {
  const s = safeStr(v) || '';
  const low = s.toLowerCase();
  if (low.includes('kepala keluarga')) return 'Kepala Keluarga';
  if (low.includes('istri') || low.includes('suami')) return 'Istri/Suami';
  if (low.startsWith('anak')) return 'Anak';
  if (low.includes('cucu')) return 'Cucu';
  if (low.includes('keponakan')) return 'Keponakan';
  if (low.includes('orang tua') || low.includes('ortu')) return 'Orang Tua';
  return 'Famili';
}

function makeId(prefix, value) {
  if (!value) return null;
  return `${prefix}_${String(value).replace(/[^a-zA-Z0-9]/g, '_')}`;
}

// ── Login ─────────────────────────────────────────────────────────────────────
console.log(`\n🔐 Login ke ${BASE_URL}...`);
let cookie = '';
{
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!r.ok) { console.error('❌ Login gagal:', await r.text()); process.exit(1); }
  const setCookie = r.headers.get('set-cookie') || '';
  cookie = setCookie.split(';')[0]; // ambil "gemas_token=xxx" saja, buang atribut cookie lainnya
  console.log('✅ Login berhasil');
}

function authHeaders() {
  return { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) };
}

// ── Pastikan sector Sektor 1-4 ada ────────────────────────────────────────────
console.log('\n📌 Memastikan data sektor...');
{
  const r = await fetch(`${BASE_URL}/api/data/sectors`, { headers: authHeaders() });
  const existing = r.ok ? await r.json() : [];
  const existingIds = new Set(existing.map(s => s.id));
  for (let n = 1; n <= 4; n++) {
    const id = `sec_${n}`;
    if (existingIds.has(id)) continue;
    await fetch(`${BASE_URL}/api/data/sectors/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        id, name: `Sektor ${n}`, leader: '', leaderContact: '',
        memberCount: 0, description: '',
      }),
    });
    console.log(`✅ Sektor ${n} dibuat`);
  }
}

// ── Baca Excel ────────────────────────────────────────────────────────────────
console.log(`\n📂 Membaca ${EXCEL_FILE}...`);
const wb = XLSX.readFile(EXCEL_FILE);
const ws = wb.Sheets[SHEET_NAME] || wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
console.log(`✅ ${rows.length} baris ditemukan`);

const now = new Date().toISOString();
const members = rows.map(r => {
  const fullName = safeStr(r.Nama_Lengkap_Jemaat) || '';
  const nameParts = fullName.split(/\s+/);
  const birthDate = parseIndoDate(r.Tanggal_Lahir);
  const familyCode = safeStr(r.No_KK);
  const sektorNum = safeStr(r.Sektor_Pelayanan);
  const otherHistoryParts = [];
  if (safeStr(r.Asal_Gereja)) otherHistoryParts.push(`Asal gereja: ${safeStr(r.Asal_Gereja)}`);
  if (safeStr(r.Gereja_tujuan)) otherHistoryParts.push(`Gereja tujuan: ${safeStr(r.Gereja_tujuan)}`);
  if (safeStr(r.tgl_keluar)) otherHistoryParts.push(`Tgl keluar: ${safeStr(r.tgl_keluar)}`);

  return {
    memberNumber: safeStr(r.No_induk),
    fullName,
    firstName: nameParts[0] || '',
    lastName: nameParts.slice(1).join(' '),
    familyName: safeStr(r.Nama_keluarga),
    gender: mapGender(r.Jenis_Kelamin),
    birthPlace: safeStr(r.Tempat_lahir),
    // Kosongkan (bukan default ke tanggal import) agar tidak dihitung sebagai "ulang tahun hari ini" di Dashboard
    birthDate: birthDate || '',
    age: safeStr(r.usia) && !Number.isNaN(Number(r.usia)) ? Number(r.usia) : calcAge(birthDate),
    baptismStatus: mapYn(r.Status_Baptis),
    sidiStatus: mapYn(r.Status_Sidi),
    pelkatStatus: safeStr(r.Pelkat_Kategorial),
    familyRole: normalizeFamilyRole(r.Hubungan_Keluarga),
    position: safeStr(r.Jabatan_Atau_Tugas),
    phone: safeStr(r.No_Telepon_WA),
    email: safeStr(r.Email),
    address: safeStr(r.Alamat_Domisili) || '',
    familyCode,
    familyId: makeId('fam', familyCode) || `fam_unknown_${safeStr(r.No)}`,
    sectorId: sektorNum ? `sec_${sektorNum}` : '',
    membershipType: 'Warga Jemaat',
    membershipStatus: 'Aktif',
    otherHistory: otherHistoryParts.join(' | ') || undefined,
    joinDate: safeStr(r.Tahun_Bergabung) ? `${r.Tahun_Bergabung}-01-01` : undefined,
    createdAt: now,
    updatedAt: now,
  };
});
console.log(`✅ ${members.length} data siap diimport`);

// ── Import batch ──────────────────────────────────────────────────────────────
let totalImported = 0, totalDuplicate = 0;
for (let i = 0; i < members.length; i += BATCH_SIZE) {
  const batch = members.slice(i, i + BATCH_SIZE);
  const r = await fetch(`${BASE_URL}/api/admin/members/import`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ members: batch }),
  });
  const batchNo = i / BATCH_SIZE + 1;
  const totalBatches = Math.ceil(members.length / BATCH_SIZE);
  if (r.ok) {
    const d = await r.json();
    totalImported += d.imported || 0;
    totalDuplicate += d.duplicates || 0;
    console.log(`  Batch ${batchNo}/${totalBatches}: ✅ imported=${d.imported} duplicates=${d.duplicates}`);
  } else {
    console.log(`  Batch ${batchNo}/${totalBatches}: ❌ ERROR ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log('✅ Import selesai!');
console.log(`   Total imported  : ${totalImported}`);
console.log(`   Total duplicate : ${totalDuplicate}`);
console.log('='.repeat(50));

// ── Tambal celah: /api/admin/members/import menganggap fullName sama = duplikat,
// padahal beberapa jemaat (terutama anak-anak, hanya nama depan) punya nama sama
// tapi No_induk beda-beda. Cek ulang berdasarkan memberNumber (No_induk) yang
// benar-benar unik, lalu masukkan satu-satu lewat /api/data (tanpa cek fullName).
if (totalDuplicate > 0) {
  console.log(`\n🔍 Mengecek ${totalDuplicate} data yang ditandai duplikat (kemungkinan nama sama, No_induk beda)...`);
  const r = await fetch(`${BASE_URL}/api/data/members`, { headers: authHeaders() });
  const existing = r.ok ? await r.json() : [];
  const existingNums = new Set(existing.map(m => String(m.memberNumber || '').toLowerCase()));

  const missing = members.filter(m => m.memberNumber && !existingNums.has(m.memberNumber.toLowerCase()));
  console.log(`   ${missing.length} data benar-benar belum masuk, menambahkan langsung...`);
  for (const m of missing) {
    const id = `m${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const putRes = await fetch(`${BASE_URL}/api/data/members/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ ...m, id, createdAt: now, updatedAt: now }),
    });
    console.log(`   ${putRes.ok ? '✅' : '❌'} ${m.memberNumber} — ${m.fullName}`);
  }
  // Sinkronkan ulang keluarga & hitungan sektor setelah penambahan manual
  await fetch(`${BASE_URL}/api/admin/sync`, { method: 'POST', headers: authHeaders() });
  console.log('✅ Sinkronisasi keluarga/sektor selesai');
}
