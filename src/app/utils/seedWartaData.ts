import { apiSave } from '../../lib/apiClient';
import type { Event, WorshipSchedule, Marriage, Member } from '../types';

const NOW = '2026-05-22T00:00:00.000Z';

// ─── 1. Events ───────────────────────────────────────────────────────────────

const SEED_EVENTS: Event[] = [
  {
    id: 'evt_wj_01',
    title: 'Ibadah Kenaikan Yesus Kristus',
    description: 'Ibadah Hari Kenaikan Yesus Kristus pagi dan sore',
    date: '2026-05-14',
    time: '09.00 & 17.00',
    location: 'Gereja',
    type: 'Ibadah',
    organizer: 'Panitia Ibadah',
    status: 'Selesai',
  },
  {
    id: 'evt_wj_02',
    title: 'GP Movie Night',
    description: 'Malam film bersama Gerakan Pemuda',
    date: '2026-05-10',
    time: '19.30',
    location: 'Ruang Panbang',
    type: 'Persekutuan',
    organizer: 'Gerakan Pemuda (GP)',
    status: 'Selesai',
  },
  {
    id: 'evt_wj_03',
    title: 'Rapat PHMJ',
    description: 'Rapat Pengurus Harian Majelis Jemaat',
    date: '2026-05-12',
    time: '21.00',
    location: 'Gereja',
    type: 'Lainnya',
    organizer: 'PHMJ',
    status: 'Selesai',
  },
  {
    id: 'evt_wj_04',
    title: 'Ibadah Keluarga Sektor 1-4',
    description: 'Ibadah keluarga gabungan sektor 1 sampai 4',
    date: '2026-05-13',
    time: '19.30',
    location: 'Gereja',
    type: 'Ibadah',
    organizer: 'Majelis Jemaat',
    status: 'Selesai',
  },
  {
    id: 'evt_wj_05',
    title: 'Ibadah Keluarga Sektor 1-4',
    description: 'Ibadah keluarga gabungan sektor 1 sampai 4',
    date: '2026-05-20',
    time: '19.30',
    location: 'Gereja',
    type: 'Ibadah',
    organizer: 'Majelis Jemaat',
    status: 'Selesai',
  },
  {
    id: 'evt_wj_06',
    title: 'Ibadah PKLU',
    description: 'Ibadah Persekutuan Kaum Lanjut Usia — Ibu Selviana Hehanussa',
    date: '2026-05-21',
    time: '10.00',
    location: 'Gereja',
    type: 'Ibadah',
    organizer: 'PKLU',
    status: 'Selesai',
  },
  {
    id: 'evt_wj_07',
    title: 'Ibadah PKP',
    description: 'Ibadah Persekutuan Kaum Perempuan — Ibu Annie Mamesah',
    date: '2026-05-22',
    time: '18.00',
    location: 'Gereja',
    type: 'Ibadah',
    organizer: 'PKP',
    status: 'Akan Datang',
  },
  {
    id: 'evt_wj_08',
    title: 'Ibadah PKB',
    description: 'Ibadah Persekutuan Kaum Bapak — Bp. Rocky Sasabone',
    date: '2026-05-16',
    time: '18.00',
    location: 'Mahogany Residence',
    type: 'Ibadah',
    organizer: 'PKB',
    status: 'Selesai',
  },
  {
    id: 'evt_wj_09',
    title: 'Pemberkatan Perkawinan Rico Montilla & Ria Pattipeiluhu',
    description: 'Pemberkatan perkawinan Rico Montilla dan Ria F. Pattipeiluhu',
    date: '2026-05-23',
    time: '15.00',
    location: 'GPIB Jemaat Agape Jakarta Timur',
    type: 'Ibadah',
    organizer: 'Pdt. Polly Hengkesa',
    status: 'Akan Datang',
  },
  {
    id: 'evt_wj_10',
    title: 'Pertemuan Pengajar Katekisasi',
    description: 'Pertemuan koordinasi pengajar katekisasi jemaat',
    date: '2026-05-16',
    time: '10.00',
    location: 'Gereja',
    type: 'Pelayanan',
    organizer: 'Majelis Jemaat',
    status: 'Selesai',
  },
];

// ─── 2. Worship Schedules ────────────────────────────────────────────────────

const SEED_WORSHIP_SCHEDULES: WorshipSchedule[] = [
  // Jadwal ibadah dari Warta 10 Mei 2026
  {
    id: 'ws_wj_01',
    type: 'Minggu',
    title: 'Ibadah Minggu Pagi — 10 Mei 2026',
    date: '2026-05-10',
    time: '09.00',
    location: 'Gereja',
    preacher: 'Pdt. Polly Hengkesa',
    status: 'Selesai',
    createdAt: NOW,
  },
  {
    id: 'ws_wj_02',
    type: 'Minggu',
    title: 'Ibadah Minggu Sore — 10 Mei 2026',
    date: '2026-05-10',
    time: '17.00',
    location: 'Gereja',
    preacher: 'Pnt. Henry Pattipeiluhu',
    status: 'Selesai',
    createdAt: NOW,
  },
  {
    id: 'ws_wj_03',
    type: 'Khusus',
    title: 'Ibadah Kenaikan Yesus Kristus Pagi',
    date: '2026-05-14',
    time: '09.00',
    location: 'Gereja',
    preacher: 'Pdt. Polly Hengkesa',
    status: 'Selesai',
    createdAt: NOW,
  },
  {
    id: 'ws_wj_04',
    type: 'Khusus',
    title: 'Ibadah Kenaikan Yesus Kristus Sore',
    date: '2026-05-14',
    time: '17.00',
    location: 'Gereja',
    preacher: 'Pdt. Polly Hengkesa',
    status: 'Selesai',
    createdAt: NOW,
  },
  {
    id: 'ws_wj_05',
    type: 'Minggu',
    title: 'Ibadah Minggu Pagi — 17 Mei 2026',
    date: '2026-05-17',
    time: '09.00',
    location: 'Gereja',
    preacher: 'Pdt. Jepry Yuwanto Daminto',
    status: 'Selesai',
    createdAt: NOW,
  },
  {
    id: 'ws_wj_06',
    type: 'Minggu',
    title: 'Ibadah Minggu Sore — 17 Mei 2026',
    date: '2026-05-17',
    time: '17.00',
    location: 'Gereja',
    preacher: 'Pdt. Polly Hengkesa',
    status: 'Selesai',
    createdAt: NOW,
  },
  {
    id: 'ws_wj_07',
    type: 'Minggu',
    title: 'Ibadah Minggu Pagi — 24 Mei 2026',
    date: '2026-05-24',
    time: '09.00',
    location: 'Gereja',
    preacher: 'JABANSIBAR 2',
    status: 'Terjadwal',
    createdAt: NOW,
  },
  {
    id: 'ws_wj_08',
    type: 'Minggu',
    title: 'Ibadah Minggu Sore — 24 Mei 2026',
    date: '2026-05-24',
    time: '17.00',
    location: 'Gereja',
    preacher: 'Pnt. Todo Sihombing',
    status: 'Terjadwal',
    createdAt: NOW,
  },
  {
    id: 'ws_wj_09',
    type: 'Khusus',
    title: 'Pemberkatan Perkawinan Rico & Ria',
    date: '2026-05-23',
    time: '15.00',
    location: 'GPIB Jemaat Agape Jakarta Timur',
    preacher: 'Pdt. Polly Hengkesa',
    status: 'Terjadwal',
    createdAt: NOW,
  },
  // Catatan kehadiran LITBANG 3 Mei 2026 (disimpan di field description)
  {
    id: 'ws_wj_10',
    type: 'Minggu',
    title: 'Ibadah Minggu Pagi — 3 Mei 2026',
    date: '2026-05-03',
    time: '09.00',
    location: 'Gereja',
    status: 'Selesai',
    description: 'Kehadiran LITBANG: 99 orang',
    createdAt: NOW,
  },
  {
    id: 'ws_wj_11',
    type: 'Minggu',
    title: 'Ibadah Minggu Sore — 3 Mei 2026',
    date: '2026-05-03',
    time: '17.00',
    location: 'Gereja',
    status: 'Selesai',
    description: 'Kehadiran LITBANG: 35 orang',
    createdAt: NOW,
  },
  {
    id: 'ws_wj_12',
    type: 'Kategorial',
    category: 'PA',
    title: 'IHMPA (Ibadah HM Pria Dewasa) — 3 Mei 2026',
    date: '2026-05-03',
    time: '09.00',
    location: 'Gazebo',
    status: 'Selesai',
    description: 'Kehadiran LITBANG: 16 orang',
    createdAt: NOW,
  },
  {
    id: 'ws_wj_13',
    type: 'Kategorial',
    category: 'PT',
    title: 'IHMPT (Ibadah HM Perempuan Dewasa) — 3 Mei 2026',
    date: '2026-05-03',
    time: '09.00',
    location: 'Ruang Panbang',
    status: 'Selesai',
    description: 'Kehadiran LITBANG: 11 orang',
    createdAt: NOW,
  },
  {
    id: 'ws_wj_14',
    type: 'Kategorial',
    category: 'GP',
    title: 'Ibadah GP (Gerakan Pemuda) — 3 Mei 2026',
    date: '2026-05-03',
    time: '09.00',
    location: 'Gereja',
    status: 'Selesai',
    description: 'Kehadiran LITBANG: 14 orang',
    createdAt: NOW,
  },
  {
    id: 'ws_wj_15',
    type: 'Keluarga',
    title: 'Ibadah Keluarga Gabungan — Rabu 6 Mei 2026',
    date: '2026-05-06',
    time: '19.00',
    location: 'Gereja',
    status: 'Selesai',
    description: 'Kehadiran LITBANG: 57 orang',
    createdAt: NOW,
  },
  {
    id: 'ws_wj_16',
    type: 'Kategorial',
    category: 'PKLU',
    title: 'Ibadah PKLU — Kamis 7 Mei 2026',
    date: '2026-05-07',
    time: '10.00',
    location: 'Kel. Tumewu',
    status: 'Selesai',
    description: 'Kehadiran LITBANG: 33 orang',
    createdAt: NOW,
  },
  {
    id: 'ws_wj_17',
    type: 'Kategorial',
    category: 'PKP',
    title: 'Ibadah PKP — Jumat 8 Mei 2026',
    date: '2026-05-08',
    time: '10.00',
    location: 'Rumah Ibu Rosli Sitinjak',
    status: 'Selesai',
    description: 'Kehadiran LITBANG: 22 orang',
    createdAt: NOW,
  },
  {
    id: 'ws_wj_18',
    type: 'PJJ',
    title: 'Doa Pagi Zoom — Sabtu 9 Mei 2026',
    date: '2026-05-09',
    time: '05.30',
    location: 'Zoom Online',
    status: 'Selesai',
    description: 'Kehadiran LITBANG: 11 orang',
    createdAt: NOW,
  },
];

// ─── 3. Marriage ─────────────────────────────────────────────────────────────

const SEED_MARRIAGES: Marriage[] = [
  {
    id: 'mar_wj_01',
    groomName: 'Rico Montilla',
    groomBirthDate: '',
    brideName: 'Ria F. Pattipeiluhu',
    brideBirthDate: '',
    marriageDate: '2026-05-23',
    marriagePlace: 'GPIB Jemaat Agape Jakarta Timur',
    minister: 'Pdt. Polly Hengkesa',
    status: 'Terjadwal',
    notes: 'Pemberkatan perkawinan — Warta Jemaat 10 Mei 2026',
    createdAt: NOW,
    updatedAt: NOW,
  },
];

// ─── 4. Member updates ───────────────────────────────────────────────────────

interface MemberUpdate {
  searchName: string;
  phone?: string;
  position?: string;
}

const MEMBER_UPDATES: MemberUpdate[] = [
  // Direktori nomor telepon (hal. 15)
  { searchName: 'Polly Hengkesa', phone: '081225343389' },
  { searchName: 'Henry Pattipeiluhu', phone: '0811892625' },
  { searchName: 'Edward Mandry', phone: '081802123283' },
  { searchName: 'Julian Monsangi', phone: '087810520008' },
  { searchName: 'Krisni Irianti Purnomo', phone: '085219680042' },
  { searchName: 'Djemmy Wagiu', phone: '077783013143' },
  { searchName: 'Meyke Novita Pasaribu', phone: '085810183833' },
  { searchName: 'Emmy Wismaningsih', phone: '0818856708' },
  // Korsek / Wakorsek + HP
  { searchName: 'Jeane Mamesah', phone: '082113561185', position: 'Koordinator Sektor 1' },
  { searchName: 'Alfa Reza Cristiansyah', phone: '0895346142755', position: 'Wakil Koordinator Sektor 1' },
  { searchName: 'Gezer Sowandito', phone: '081807924573', position: 'Koordinator Sektor 2' },
  { searchName: 'Himawan Tirtos', phone: '0895622819785', position: 'Wakil Koordinator Sektor 2' },
  { searchName: 'Maya Pandeiroot', phone: '087873362815', position: 'Koordinator Sektor 3' },
  { searchName: 'Vivi Walalangi', phone: '082110868790', position: 'Wakil Koordinator Sektor 3' },
  { searchName: 'Treisye Pantouw', phone: '085716124014', position: 'Koordinator Sektor 4' },
  { searchName: 'Frans Simbiak', phone: '081212718885', position: 'Wakil Koordinator Sektor 4' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .replace(/^(Pdt\.|Pnt\.|Dkn\.|Bp\.|Ibu\.)\s*/gi, '')
    .replace(/[-]/g, ' ')
    .trim()
    .toLowerCase();
}

function memberMatchesSearch(member: Member, searchName: string): boolean {
  const memberNorm = normalizeName(member.fullName);
  const searchNorm = normalizeName(searchName);
  return memberNorm === searchNorm ||
    memberNorm.includes(searchNorm) ||
    searchNorm.includes(memberNorm);
}

// ─── Main export ─────────────────────────────────────────────────────────────

export interface SeedResult {
  events: Event[];
  worshipSchedules: WorshipSchedule[];
  marriages: Marriage[];
  members: Member[];
  applied: boolean;
}

export function applySeedWartaData(
  currentEvents: Event[],
  currentWS: WorshipSchedule[],
  currentMarriages: Marriage[],
  currentMembers: Member[]
): SeedResult {
  const evtIds = new Set(currentEvents.map(e => e.id));
  const wsIds = new Set(currentWS.map(w => w.id));
  const marIds = new Set(currentMarriages.map(m => m.id));

  const newEvents = SEED_EVENTS.filter(e => !evtIds.has(e.id));
  const newWS = SEED_WORSHIP_SCHEDULES.filter(w => !wsIds.has(w.id));
  const newMarriages = SEED_MARRIAGES.filter(m => !marIds.has(m.id));

  // If all seed data already exists, skip
  if (newEvents.length === 0 && newWS.length === 0 && newMarriages.length === 0) {
    return {
      events: currentEvents,
      worshipSchedules: currentWS,
      marriages: currentMarriages,
      members: currentMembers,
      applied: false,
    };
  }

  const updatedMembers = currentMembers.map(member => {
    const update = MEMBER_UPDATES.find(u => memberMatchesSearch(member, u.searchName));
    if (!update) return member;
    const changes: Partial<Member> = {};
    if (update.phone) changes.phone = update.phone;
    if (update.position) changes.position = update.position;
    return { ...member, ...changes };
  });

  newEvents.forEach(e => apiSave('events', e.id, e));
  newWS.forEach(w => apiSave('worshipSchedules', w.id, w));
  newMarriages.forEach(m => apiSave('marriages', m.id, m));
  updatedMembers.forEach((member, i) => {
    if (member !== currentMembers[i]) apiSave('members', member.id, member);
  });

  console.log(`[seed] Warta 10 Mei 2026: +${newEvents.length} events, +${newWS.length} jadwal ibadah, +${newMarriages.length} pernikahan, member diperbarui`);

  return {
    events: [...currentEvents, ...newEvents],
    worshipSchedules: [...currentWS, ...newWS],
    marriages: [...currentMarriages, ...newMarriages],
    members: updatedMembers,
    applied: true,
  };
}
