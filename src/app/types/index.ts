// Types for Gereja Management System

export type MasterDataCategory =
  | 'jabatan_pelayanan'
  | 'pelkat'
  | 'jenis_persembahan'
  | 'kategori_aset'
  | 'jenis_ibadah'
  | 'kategori_ibadah'
  | 'daftar_pelayan'
  | 'tipe_rekening'
  | 'metode_pembayaran'
  | 'status_sakramen'
  | 'jenis_jadwal_ibadah'
  | 'buku_nyanyian'
  | 'tipe_nyanyian_ibadah'
  | 'tempat_sakramen'
  | 'sumber_kas_kecil'
  | 'prioritas_pengumuman'
  | 'status_peminjaman_ruangan'
  | 'status_distribusi_bantuan'
  | 'status_permohonan_surat'
  | 'tipe_atestasi'
  | 'status_event'
  | 'status_pernikahan'
  | 'tipe_keanggotaan'
  | 'golongan_darah'
  | 'status_kas_kecil'
  | 'jenis_kegiatan'
  | 'jenis_pelayanan'
  | 'kategori_bantuan'
  | 'pendidikan'
  | 'kategori_keuangan_masuk'
  | 'kategori_keuangan_keluar'
  | 'kategori_kas_kecil'
  | 'jenis_surat_keluar'
  | 'jenis_surat_masuk';

export interface MasterDataItem {
  id: string;
  category: MasterDataCategory;
  value: string;
  label: string;
  isActive: boolean;
  order: number;
  createdAt: string;
}

export type UserRole = 'Admin' | 'Majelis' | 'Ketua Sektor' | 'Operator';
export type PermissionKey = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export';

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  password: string;
  role: UserRole;
  isActive: boolean;
}

export type MembershipType = 'Warga Jemaat' | 'Warga Tamu' | 'Simpatisan';

export interface Member {
  id: string;
  // Identitas
  familyCode?: string; // Kode Keluarga
  memberNumber?: string; // No Induk
  firstName: string; // Nama Pertama
  lastName: string; // Nama Belakang
  fullName: string; // Nama Lengkap (computed)
  familyName?: string; // Nama Keluarga
  gender: 'Laki-laki' | 'Perempuan';
  familyRole: string; // Hubungan Keluarga
  familyRoleOther?: string; // Status hubungan jika "Lainnya"
  
  // Data Kelahiran
  birthPlace?: string; // Tempat Lahir
  birthDate: string;
  age: number; // Usia (otomatis)
  
  // Data Baptis & Sidi
  baptismStatus?: 'Sudah' | 'Belum'; // Status Baptis
  baptismPlace?: string; // Tempat Baptis
  baptismDate?: string; // Tanggal Baptis
  sidiStatus?: 'Sudah' | 'Belum'; // Status Sidi
  sidiPlace?: string; // Tempat Sidi
  sidiDate?: string; // Tanggal Sidi
  
  // Data Pernikahan
  maritalStatus?: 'Belum Menikah' | 'Menikah' | 'Duda' | 'Janda'; // Status Nikah
  marriageDateChurch?: string; // Tgl Nikah Gereja
  marriageDateCivil?: string; // Tgl Nikah Sipil
  
  // Data Kesehatan & Pendidikan
  bloodType?: 'A' | 'B' | 'AB' | 'O' | 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'; // Gol. Darah
  education?: string; // Pendidikan Terakhir
  degree?: string; // Gelar
  major?: string; // Jurusan
  
  // Data Pekerjaan
  occupation?: string; // Pekerjaan
  profession?: string; // Profesi
  workplace?: string; // Tempat Kerja
  
  // Pengalaman & Kompetensi
  organizationExperience?: string; // Pengalaman Organisasi
  churchExperience?: string; // Pengalaman Gerejawi
  languageSkills?: string; // Penguasaan Bahasa
  skills?: string; // Kompetensi-Skill
  
  // Kontak
  homePhone?: string; // Telp Rumah
  phone?: string; // Handphone
  email?: string;
  
  // Data Gereja
  membershipType?: MembershipType; // Status Keanggotaan (BARU)
  position?: string; // Posisi Jabatan
  pelkatStatus?: string; // Status Pelkat
  familyId: string;
  sectorId: string;
  address: string;
  membershipStatus?: 'Aktif' | 'Pindah' | 'Meninggal' | 'Tidak Aktif'; // Status Aktif
  
  // Lain-lain
  otherHistory?: string; // Riwayat Lain
  ministries?: string[]; // Array of ministry IDs
  photo?: string;
  notes?: string;
  joinDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Family {
  id: string;
  headOfFamily: string;
  headMemberId: string;
  sectorId: string;
  address: string;
  memberCount: number;
  members: string[]; // Array of member IDs
}

export interface Sector {
  id: string;
  name: string;
  leader: string;
  leaderContact: string;
  memberCount: number;
  description?: string;
  leaderId?: string;      // ID member Koordinator Sektor
  deputyLeaderId?: string; // ID member Wakil Koord. Sektor
}

export type AgeGroup = 'Anak' | 'Pemuda' | 'Dewasa' | 'Lansia';

export interface Statistics {
  totalMembers: number;
  totalFamilies: number;
  membersBySector: { sectorId: string; count: number }[];
  membersByAge: { ageGroup: AgeGroup; count: number }[];
  birthdaysThisMonth: Member[];
}

export interface Attendance {
  id: string;
  date: string;
  serviceType: 'Minggu Pagi' | 'Minggu Sore' | 'Rabu' | 'Jumat' | 'Doa Pagi' | 'Pemuda' | 'Khusus';
  memberId: string;
  present: boolean;
  notes?: string;
}

export interface Ministry {
  id: string;
  name: string;
  description: string;
  leader: string;
  leaderMemberId: string;
  memberIds: string[];
  isActive: boolean;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  type: 'Ibadah' | 'Persekutuan' | 'Retreat' | 'Seminar' | 'Pelayanan' | 'Lainnya';
  organizer: string;
  attendees?: string[]; // member IDs
  status: 'Akan Datang' | 'Berlangsung' | 'Selesai' | 'Dibatalkan';
  pelayanan?: string;
}

export interface PrayerRequest {
  id: string;
  memberId: string;
  request: string;
  category: 'Kesehatan' | 'Keuangan' | 'Keluarga' | 'Pekerjaan' | 'Rohani' | 'Lainnya';
  isPrivate: boolean;
  status: 'Aktif' | 'Terjawab' | 'Ditutup';
  createdAt: string;
  answeredAt?: string;
  answer?: string;
}

export interface AuditDiffField {
  field: string;
  label?: string;
  oldValue: any;
  newValue: any;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userRole?: string;
  action: 'Menambahkan' | 'Mengubah' | 'Menghapus' | 'Login' | 'Logout' | 'Export' | 'Import' | 'Restore' | 'StatusChange' | string;
  domain?: 'Member' | 'Financial' | 'Asset' | 'System' | 'Service' | 'Worship';
  entityType: 'Member' | 'Family' | 'Sector' | 'User' | 'Ministry' | 'Event' | 'Attendance' | 'Warta' | 'Baptism' | 'Sidi' | 'Marriage' | 'ServiceRequest' | 'AidDistribution' | 'Resource' | 'RoomBooking' | 'BuildingProject' | 'FinancialCategory' | 'Offering' | 'WorshipSchedule' | 'MasterData' | 'Attestation' | 'MinistrySchedule' | 'PrayerRequest' | 'Announcement' | 'FinancialRecord' | 'PettyCash' | 'PcTopUp' | 'ChurchAsset' | 'AssetMaintenance' | 'AssetLoan' | 'BankAccount' | 'Budget' | 'Liability' | 'SectorTransfer' | string;
  entityId: string;
  entityName: string;
  timestamp: string;
  details?: string;
  ipAddress?: string;
  severity?: 'normal' | 'sensitive' | 'critical';
  amount?: number; // nominal transaksi, dipakai getAuditSeverity() untuk klasifikasi kritis otomatis
  diff?: AuditDiffField[];
  beforeState?: Record<string, any>;
  afterState?: Record<string, any>;
}

// New types for enhanced features

export interface Notification {
  id: string;
  type: 'birthday' | 'event' | 'prayer' | 'announcement' | 'attendance' | 'system';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  link?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  targetRole?: UserRole[];
  targetSectors?: string[];
  priority: 'normal' | 'important' | 'urgent';
  createdAt: string;
  expiresAt?: string;
  isActive: boolean;
}

export interface FinancialRecord {
  id: string;
  date: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description: string;
  reference?: string;
  recordedBy: string;
  recordedById: string;
  createdAt: string;
}

export interface FinancialCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  description?: string;
  reportGroup?: 'program' | 'admin' | 'pemeliharaan' | 'terikat' | null;
}

export interface MinistrySchedule {
  id: string;
  date: string;
  serviceType: string;
  ministryId: string;
  assignedMembers: {
    memberId: string;
    role: string;
  }[];
  notes?: string;
}


export interface ThemePreference {
  mode: 'light' | 'dark' | 'auto';
  primaryColor?: string;
}

// ========================================
// MODUL BARU: Peribadahan & Kegiatan
// ========================================

export type WorshipType = string;

export interface WorshipSchedule {
  id: string;
  type: WorshipType;
  category?: string;
  title: string;
  date: string;
  time: string;
  location: string;
  preacher?: string;
  liturgist?: string;
  worship_leader?: string;
  pianist?: string;
  sermon_theme?: string;
  bible_verse?: string;
  description?: string;
  status?: 'Terjadwal' | 'Berlangsung' | 'Selesai' | 'Dibatalkan';
  createdAt: string;
  updatedAt?: string;
}

export interface Warta {
  id: string;
  week: number;
  month: number;
  year: number;
  title: string;
  date: string;
  coverImage?: string;
  sections: {
    id: string;
    title: string;
    content: string;
    order: number;
  }[];
  announcements: string[];
  worshipSchedules: string[]; // reference to WorshipSchedule IDs
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Liturgy {
  id: string;
  date: string;
  worshipType: WorshipType;
  theme: string;
  scripture: {
    book: string;
    chapter: number;
    verse: string;
  }[];
  hymns: {
    type: 'opening' | 'offering' | 'communion' | 'closing';
    book: 'Gita Bakti' | 'Kidung Jemaat' | 'Lainnya';
    number: string;
    title: string;
  }[];
  liturgyOrder: {
    order: number;
    title: string;
    content?: string;
  }[];
  sermon?: {
    title: string;
    preacher: string;
    summary?: string;
  };
  createdAt: string;
}

// ========================================
// MODUL BARU: Keuangan & Persembahan
// ========================================

export type OfferingType = 'Mingguan' | 'Syukur' | 'Persepuluhan' | 'Pembangunan' | 'Diakonia' | 'Lainnya';
export type PaymentMethod = string;

export interface Offering {
  id: string;
  type: OfferingType;
  amount: number;
  paymentMethod: PaymentMethod;
  donorName?: string;
  donorPhone?: string;
  donorEmail?: string;
  memberId?: string;
  date: string;
  description?: string;
  qrisReference?: string;
  createdAt: string;
  /** Diisi otomatis oleh fitur "Setor ke Buku Besar" (OfferingsQRIS.tsx /
   *  server/routes/financeTransaction.ts POST /deposit-offerings) begitu
   *  persembahan ini sudah diagregasi jadi transaksi Finance Add-on —
   *  mencegah persembahan yang sama disetor dua kali. */
  depositedTransactionId?: string;
  depositedAt?: string;
}

export interface BuildingProject {
  id: string;
  name: string;
  description: string;
  targetAmount: number;
  collectedAmount: number;
  startDate: string;
  targetDate: string;
  status: 'Planning' | 'Active' | 'Completed' | 'On Hold';
  progress: number; // percentage
  expenses: {
    id: string;
    description: string;
    amount: number;
    date: string;
    receipt?: string;
  }[];
  donations: string[]; // reference to Offering IDs
  createdAt: string;
  updatedAt: string;
}

// ========================================
// MODUL BARU: Pelayanan Kasih & Diakonia
// ========================================

export type ServiceRequestType = 'Kunjungan' | 'Doa Khusus' | 'Pelayanan Duka' | 'Konseling' | 'Lainnya';
export type ServiceStatus = 'Pending' | 'Scheduled' | 'Completed' | 'Cancelled';

export interface ServiceRequest {
  id: string;
  type: ServiceRequestType;
  requestedBy: string;
  memberId?: string;
  phone: string;
  address: string;
  preferredDate?: string;
  preferredTime?: string;
  description: string;
  status: ServiceStatus;
  assignedTo?: string; // user ID (majelis/pendeta)
  scheduledDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type AidType = 'Ekonomi' | 'Beasiswa' | 'Kesehatan' | 'Bencana' | 'Lainnya';
export type AidStatus = 'Pengajuan' | 'Verifikasi' | 'Disetujui' | 'Ditolak' | 'Disalurkan';

export interface AidDistribution {
  id: string;
  type: AidType;
  recipientName: string;
  memberId?: string;
  serviceRequestId?: string; // audit gap fix: jejak balik ke Permohonan Diakonia asal
  phone: string;
  address: string;
  amount?: number;
  description: string;
  reason: string;
  status: AidStatus;
  requestedDate: string;
  approvedBy?: string;
  approvedDate?: string;
  distributedDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ========================================
// MODUL BARU: Komunikasi & Pembinaan
// ========================================

export type ResourceType = 'Khotbah' | 'Materi PJJ' | 'Artikel' | 'Video' | 'Audio' | 'Dokumen';
export type ResourceCategory = 'Pembinaan' | 'Liturgi' | 'Musik' | 'Administrasi' | 'Lainnya';

export interface Resource {
  id: string;
  title: string;
  type: ResourceType;
  category: ResourceCategory;
  description?: string;
  author?: string;
  uploadedBy?: string;
  fileUrl?: string;
  fileSize?: string;
  duration?: string;
  thumbnailUrl?: string;
  tags: string[];
  downloads: number;
  views: number;
  publishedDate: string;
  createdAt: string;
  /** Nats Alkitab — hanya relevan untuk type 'Khotbah' */
  bibleVerse?: string;
  /** Naskah lengkap khotbah — hanya relevan untuk type 'Khotbah' */
  fullTranscript?: string;
}

export type RoomType = 'Ruang Ibadah' | 'Aula' | 'Ruang Kelas' | 'Ruang Pertemuan' | 'Lainnya';
export type BookingStatus = 'Pending' | 'Approved' | 'Rejected' | 'Completed' | 'Cancelled';
export type RoomBookingStatus = BookingStatus;

export interface RoomBooking {
  id: string;
  roomName: string;
  roomType: RoomType;
  bookedBy: string;
  organization?: string; // unit kategorial
  phone: string;
  email?: string;
  purpose: string;
  date: string;
  startTime: string;
  endTime: string;
  attendees: number;
  facilities?: string[]; // sound system, projector, dll
  status: BookingStatus;
  approvedBy?: string;
  approvedDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ========================================
// MODUL TAMBAHAN: Atestasi
// ========================================

export type AttestationType = 'Pindah Masuk' | 'Pindah Keluar';
export type AttestationStatus = 'Diajukan' | 'Diproses' | 'Selesai' | 'Ditolak';

export interface Attestation {
  id: string;
  type: AttestationType;
  memberId: string;
  memberName: string;
  fromChurch: string;
  toChurch: string;
  reason: string;
  requestDate: string;
  processedBy?: string;
  processedDate?: string;
  completedDate?: string;
  status: AttestationStatus;
  letterNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  familyId?: string; // diisi kalau atestasi ini diajukan sekaligus untuk 1 keluarga (batch) - setiap anggota tetap punya record sendiri, familyId menandai mereka sebagai satu pengajuan
}

// ========================================
// MODUL TAMBAHAN: Sakramen (Baptis, Sidi, Pernikahan)
// ========================================

export type BaptismType = 'Anak' | 'Dewasa';
export type BaptismStatus = 'Terjadwal' | 'Selesai' | 'Ditunda' | 'Dibatalkan';

export interface Baptism {
  id: string;
  memberId: string;
  memberName: string;
  type: BaptismType;
  baptismDate: string;
  baptismPlace: string;
  minister: string; // Pendeta
  witness1?: string;
  witness2?: string;
  parents?: {
    fatherName: string;
    motherName: string;
  };
  certificateNumber?: string;
  status: BaptismStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type SidiStatus = 'Terjadwal' | 'Selesai' | 'Ditunda' | 'Dibatalkan';

export interface Sidi {
  id: string;
  memberId: string;
  memberName: string;
  sidiDate: string;
  sidiPlace: string;
  minister: string; // Pendeta
  baptismDate: string; // Tanggal baptis sebelumnya
  baptismPlace: string;
  certificateNumber?: string;
  status: SidiStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type MarriageStatus = 'Terjadwal' | 'Selesai' | 'Ditunda' | 'Dibatalkan';

export interface Marriage {
  id: string;
  groomMemberId?: string;
  groomName: string;
  groomBirthDate: string;
  groomBaptismDate?: string;
  brideMemberId?: string;
  brideName: string;
  brideBirthDate: string;
  brideBaptismDate?: string;
  marriageDate: string;
  marriagePlace: string;
  minister: string; // Pendeta
  witness1?: string;
  witness2?: string;
  civilRegistrationNumber?: string; // No. Akta Sipil
  civilRegistrationDate?: string;
  certificateNumber?: string; // No. Surat Nikah Gereja
  status: MarriageStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ========================================
// Petty Cash
// ========================================
export type PettyCashStatus = 'Lunas' | 'Pending';

export interface PettyCash {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  payTo: string;
  receiptNo: string;
  status: PettyCashStatus;
  createdBy: string;
  createdAt: string;
}

export interface PcTopUp {
  id: string;
  date: string;
  amount: number;
  source: string;
  description: string;
  approvedBy: string;
  createdBy: string;
  createdAt: string;
}

// ========================================
// Church Asset Management
// ========================================
export type AssetCategory = 'Tanah' | 'Bangunan' | 'Kendaraan' | 'Inventaris' | 'Elektronik' | 'Peralatan Ibadah' | 'Lainnya';
export type AssetCondition = 'Baik' | 'Cukup Baik' | 'Rusak Ringan' | 'Rusak Berat' | 'Tidak Layak';
export type AcquisitionMethod = 'Pembelian' | 'Donasi' | 'Hibah' | 'Pembangunan' | 'Wakaf';
export type MaintenanceType = 'Perawatan Rutin' | 'Perbaikan' | 'Penggantian Komponen' | 'Inspeksi';
export type MaintenanceResult = 'Selesai' | 'Dalam Proses' | 'Perlu Tindak Lanjut';
export type AssetLoanStatus = 'Tersedia' | 'Dipinjam' | 'Dalam Pemeliharaan';

export interface MaintenanceRecord {
  id: string;
  assetId: string;
  date: string;
  type: MaintenanceType;
  description: string;
  cost: number;
  technician: string;
  result: MaintenanceResult;
  notes?: string;
}

export interface ChurchAsset {
  id: string;
  assetCode: string;
  name: string;
  category: AssetCategory;
  description?: string;
  location: string;
  condition: AssetCondition;
  acquisitionDate: string;
  acquisitionValue: number;
  acquisitionMethod: AcquisitionMethod;
  usefulLifeYears: number;
  responsiblePerson?: string;
  memberId?: string;
  ministryUnit?: string;
  serialNumber?: string;
  vendor?: string;
  notes?: string;
  photo?: string;
  loanStatus?: AssetLoanStatus;
  borrowedById?: string;
  borrowedByName?: string;
  loanDate?: string;
  expectedReturnDate?: string;
  loanNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoanHistoryRecord {
  id: string;
  assetId: string;
  assetName?: string;
  assetCode?: string;
  borrowedById?: string;
  borrowedByName: string;
  loanDate: string;
  expectedReturnDate?: string;
  actualReturnDate?: string;
  loanNotes?: string;
  status: 'Aktif' | 'Dikembalikan' | 'Terlambat';
}

// ========================================
// Keuangan: Rekening Bank & Anggaran
// ========================================
export type BankAccountType = string;

export interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  balance: number;
  type: BankAccountType;
  color: string;
  lastUpdated: string;
}

export interface Budget {
  id: string;
  category: string;
  type: 'income' | 'expense';
  budgeted: number;
  year: number;
}

// ========================================
// Livestream & Reminder Ibadah
// ========================================
export type LivestreamPlatform = 'YouTube' | 'Zoom' | 'Google Meet' | 'Facebook Live' | 'Lainnya';

export interface LivestreamLink {
  id: string;
  scheduleId: string;
  title: string;
  date: string;
  time: string;
  platform: LivestreamPlatform;
  url: string;
  isActive: boolean;
  views: number;
}

export interface ReminderSetting {
  id: string;
  name: string;
  enabled: boolean;
  timing: string;
  channel: string;
  serviceType: string;
}

export interface Liability {
  id: string;
  nama: string;
  nilai: number;
  kategori: 'Jangka Pendek' | 'Jangka Panjang';
}

export interface FiscalYearSetting {
  id: string;
  year: number;
  asetNetoAwal: number;
  investasiPeralatan?: number;
  investasiGedung?: number;
  notes?: string;
}

export interface SectorTransfer {
  id: string;
  memberId: string;
  memberName: string;
  fromSectorId: string;
  fromSectorName: string;
  toSectorId: string;
  toSectorName: string;
  reason: string;
  requestDate: string;
  processedDate?: string | null;
  status: 'Pending' | 'Diproses' | 'Selesai';
  processedBy?: string | null;
  notes?: string;
  familyId?: string; // diisi kalau mutasi ini diajukan sekaligus untuk 1 keluarga (batch) - setiap anggota tetap punya record sendiri, familyId menandai mereka sebagai satu pengajuan
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  facilities: string[];
  location?: string;
  isActive: boolean;
}

export interface CustomRole {
  id: string;
  name: string;
  description: string;
  tanggung: string;
  warna: string;
  modulePermissions?: Record<string, string[]>;
}

export interface BuiltinRoleOverride {
  id: string;
  role: string;
  desc: string;
  tanggung: string;
  warna: string;
}
// ============================================================
// MODUL SURAT-MENYURAT — Fase 1 (Fondasi & Master Data)
// ============================================================
// Jenis surat (jenis_surat_keluar / jenis_surat_masuk) sengaja jadi Master Data
// biasa (lihat MasterDataCategory di atas) supaya admin bebas menambah/mengubah
// sendiri — beda dengan status alur kerja (Draft/Diajukan/Ditandatangani, dst)
// yang nanti tetap union type tetap di kode (bukan Master Data), karena status
// itu menggerakkan logika alur kerja & immutability, bukan sekadar label.

/** Profil & kop surat organisasi — single/few-record settings collection,
 *  polanya sama seperti FiscalYearSetting. Dibangun kosong, diisi admin sendiri
 *  lewat halaman Pengaturan Surat Menyurat (tab "Kop Surat"). */
export interface OrgLetterhead {
  id: string; // konvensi: id tetap 'default' (single record)
  churchName?: string;
  churchCode?: string; // dipakai sebagai token {kodeGereja} di format nomor surat
  address?: string;
  phone?: string;
  email?: string;
  logoData?: string; // base64 (tanpa prefix data URL), PNG/JPG
  logoMimeType?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/** Template surat keluar. Isi (bodyTemplate) & manajemen penuhnya dibangun di
 *  Fase 2 bersamaan alur pembuatan surat — di Fase 1 baru collection & tipenya
 *  yang didaftarkan supaya jenisSuratId (Master Data) sudah bisa dirujuk. */
export interface LetterTemplate {
  id: string;
  name: string;
  jenisSuratId: string; // = id dari MasterDataItem berkategori 'jenis_surat_keluar'
  bodyTemplate?: string; // placeholder: {namaPenerima} {tanggal} {perihal} {nomorSurat} dst
  isActive: boolean;
  createdBy?: string;
  createdAt?: string;
}

/** Konfigurasi format nomor surat otomatis — satu record per jenis surat.
 *  Token yang didukung endpoint generator: {urut}, {urut:N} (zero-pad N digit),
 *  {jenis} (kode jenis surat), {kodeGereja}, {bulanRomawi}, {tahun}, {sektor}. */
export interface LetterNumberFormat {
  id: string;
  jenisSuratId: string; // = id dari MasterDataItem berkategori 'jenis_surat_keluar'
  pattern: string; // contoh: "{urut:3}/{jenis}/{kodeGereja}/{bulanRomawi}/{tahun}"
  resetPeriod: 'tahunan' | 'bulanan' | 'tidak_pernah';
  updatedAt?: string;
  updatedBy?: string;
}

/** Counter internal atomik di balik LetterNumberFormat — TIDAK untuk diedit
 *  manual lewat UI. id = scope key (mis. "UND-2026" atau "UND-09-2026"
 *  tergantung resetPeriod). Diakses lewat endpoint server yang mengunci baris
 *  (SELECT ... FOR UPDATE) supaya tidak ada nomor kembar saat submit bersamaan. */
export interface LetterNumberCounter {
  id: string;
  lastNumber: number;
  updatedAt: string;
}

/** Gambar tanda tangan & cap. type 'signature' = TTD milik satu user (ownerType
 *  'user', ownerId = User.id); type 'stamp' = cap organisasi (ownerType
 *  'organization', ownerId = 'org' — satu cap untuk semua surat, sesuai
 *  keputusan awal; struktur ownerId ini tetap mendukung banyak cap kalau nanti
 *  dibutuhkan, cukup pakai ownerId lain, tanpa ubah skema). */
export interface SignatureAsset {
  id: string;
  ownerType: 'user' | 'organization';
  ownerId: string;
  type: 'signature' | 'stamp';
  imageData: string; // base64 (tanpa prefix data URL), idealnya PNG transparan
  mimeType: string;
  isActive: boolean;
  uploadedAt: string;
  uploadedBy?: string;
}

// ============================================================
// MODUL SURAT-MENYURAT — Fase 2 (Surat Keluar, alur inti)
// ============================================================
/** Status alur kerja Surat Keluar. Tidak ada status 'Ditolak' terpisah —
 *  penolakan di tahap Diajukan/Diperiksa mengembalikan status ke 'Draft'
 *  (dengan rejectReason terisi), bukan status baru — lihat catatan di
 *  OutgoingLetter.status di bawah dan Bagian 4 rencana Fase 2. */
export type OutgoingLetterStatus =
  | 'Draft'
  | 'Diajukan'
  | 'Diperiksa'
  | 'Ditandatangani'
  | 'Terkirim'
  | 'Diarsipkan';

/** Surat Keluar — inti Fase 2. Field yang berhubungan dengan tahap
 *  Diperiksa/Ditandatangani/Terkirim/Diarsipkan (letterNumber, checkedBy,
 *  signedBy, finalPdfData, dst) HANYA diisi lewat endpoint transisi
 *  /api/outgoing-letters/:id/... (server/routes/outgoingLetters.ts) — PUT
 *  generik /api/data/outgoingLetters/:id ditolak begitu status sudah
 *  lewat 'Draft', supaya integritas nomor surat & TTD tidak bisa "diam-diam"
 *  diubah lewat jalur CRUD biasa (lihat guard di server/routes/data.ts). */
export interface OutgoingLetter {
  id: string;
  status: OutgoingLetterStatus;
  letterNumber?: string; // baru terisi setelah tahap Diperiksa (nomor di-generate atomik)
  letterDate: string;
  templateId?: string; // ref LetterTemplate — opsional, bisa juga ditulis bebas tanpa template
  jenisSuratId: string; // ref MasterDataItem kategori 'jenis_surat_keluar'
  subject: string; // perihal
  recipientName: string;
  recipientInstitution?: string;
  body: string; // isi surat setelah placeholder template terisi
  sectorId?: string; // opsional — kalau surat dibuat per-sektor

  createdBy: string;
  createdAt: string;
  updatedAt?: string;

  submittedBy?: string;
  submittedAt?: string;

  checkedBy?: string;
  checkedAt?: string;

  signedBy?: string;
  signedAt?: string;
  signatureAssetId?: string;
  stampAssetId?: string;
  finalPdfData?: string; // base64 PDF hasil render final — immutable setelah Ditandatangani

  sentAt?: string;
  sentVia?: string; // opsional: pos/email/diambil langsung

  archivedAt?: string;
  archivedBy?: string;

  rejectReason?: string; // alasan "Kembalikan" terbaru (dari tahap Diajukan/Diperiksa)

  relatedModule?: string; // opsional: mis. 'Atestasi', 'Sakramen', 'IncomingLetter'
  relatedId?: string;
  replacesLetterId?: string; // opsional: kalau surat ini revisi/pengganti surat yang sudah ditandatangani
}

/** Lampiran pendukung Surat Keluar — pola sama seperti attestationDocuments
 *  (base64, maks 2MB, PDF saja — lihat DOCUMENT_COLLECTIONS di data.ts). */
export interface OutgoingLetterAttachment {
  id: string;
  letterId: string; // ref OutgoingLetter.id
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileData: string; // base64
  uploadedAt: string;
  uploadedBy?: string;
}
