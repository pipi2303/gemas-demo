import { ActivityLog, AuditDiffField } from '../types';

/**
 * Human-friendly field labels for audit diff reporting
 */
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  // Member fields
  fullName: 'Nama Lengkap',
  sectorId: 'Sektor Pelayanan',
  familyId: 'Keluarga (KK)',
  address: 'Alamat Domisili',
  phone: 'No. Handphone / WhatsApp',
  email: 'Alamat Email',
  membershipStatus: 'Status Keanggotaan',
  gender: 'Jenis Kelamin',
  birthPlace: 'Tempat Lahir',
  birthDate: 'Tanggal Lahir',
  bloodType: 'Golongan Darah',
  maritalStatus: 'Status Pernikahan',
  occupation: 'Pekerjaan',
  education: 'Pendidikan',
  isBaptized: 'Status Baptis',
  baptismDate: 'Tanggal Baptis',
  baptismPlace: 'Tempat Baptis',
  isSidi: 'Status Sidi',
  sidiDate: 'Tanggal Sidi',
  sidiPlace: 'Tempat Sidi',
  notes: 'Catatan Khusus',

  // Financial fields
  amount: 'Nominal (Rp)',
  category: 'Kategori Transaksi',
  type: 'Tipe Keuangan',
  description: 'Uraian / Keterangan',
  reference: 'No. Referensi / Bukti',
  payTo: 'Penerima / Vendor',
  receiptNo: 'No. Kuitansi',
  status: 'Status',
  donorName: 'Nama Donatur / Pemberi',
  paymentMethod: 'Metode Pembayaran',
  bankName: 'Nama Bank',
  accountNumber: 'Nomor Rekening',
  accountHolder: 'Nama Pemilik Rekening',
  source: 'Sumber Dana',

  // Asset fields
  name: 'Nama Aset',
  assetCode: 'Kode Inventaris',
  location: 'Lokasi Penempatan',
  condition: 'Kondisi Fisik',
  acquisitionValue: 'Nilai Perolehan (Rp)',
  acquisitionDate: 'Tanggal Perolehan',
  acquisitionMethod: 'Metode Pengadaan',
  responsiblePerson: 'Penanggung Jawab',
  serialNumber: 'Nomor Seri / IMB / SHM',
  vendor: 'Vendor / Pemasok',
  usefulLifeYears: 'Masa Manfaat (Tahun)',
  loanStatus: 'Status Peminjaman',
  cost: 'Biaya Pemeliharaan (Rp)',
  technician: 'Teknisi / Pelaksana',
  result: 'Hasil Tindakan',
};

// Ignore noisy or internal fields when calculating diffs
const IGNORED_DIFF_FIELDS = new Set([
  'id', 'createdAt', 'updatedAt', 'password', 'members'
]);

/**
 * Computes deep differences between old and new state for change audit
 */
export function computeAuditDiff(
  before: Record<string, any> | undefined | null,
  after: Record<string, any> | undefined | null
): AuditDiffField[] {
  if (!before || !after) return [];
  const diffs: AuditDiffField[] = [];

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    if (IGNORED_DIFF_FIELDS.has(key)) continue;

    const oldVal = before[key];
    const newVal = after[key];

    // Normalize empty strings and undefined
    const normalizedOld = oldVal === undefined || oldVal === null ? '' : oldVal;
    const normalizedNew = newVal === undefined || newVal === null ? '' : newVal;

    if (JSON.stringify(normalizedOld) !== JSON.stringify(normalizedNew)) {
      diffs.push({
        field: key,
        label: AUDIT_FIELD_LABELS[key] || key,
        oldValue: oldVal,
        newValue: newVal
      });
    }
  }

  return diffs;
}

/**
 * Determines domain category for an entity type
 */
export function getDomainForEntityType(entityType: string): ActivityLog['domain'] {
  switch (entityType) {
    case 'Member':
    case 'Family':
    case 'Sector':
    case 'Baptism':
    case 'Sidi':
    case 'Marriage':
    case 'Attestation':
    case 'SectorTransfer':
      return 'Member';

    case 'FinancialRecord':
    case 'FinancialCategory':
    case 'Offering':
    case 'PettyCash':
    case 'PcTopUp':
    case 'BankAccount':
    case 'Budget':
    case 'Liability':
      return 'Financial';

    case 'ChurchAsset':
    case 'AssetMaintenance':
    case 'AssetLoan':
    case 'RoomBooking':
    case 'BuildingProject':
      return 'Asset';

    case 'ServiceRequest':
    case 'AidDistribution':
    case 'PrayerRequest':
      return 'Service';

    case 'WorshipSchedule':
    case 'Warta':
    case 'Event':
    case 'Attendance':
    case 'Ministry':
    case 'MinistrySchedule':
      return 'Worship';

    case 'User':
    case 'MasterData':
    default:
      return 'System';
  }
}

/**
 * Determines sensitivity severity level
 */
export function getAuditSeverity(action: string, entityType: string, amount?: number): ActivityLog['severity'] {
  // Critical actions
  if (action === 'Menghapus' || action === 'Restore') {
    if (['Member', 'Family', 'FinancialRecord', 'PettyCash', 'ChurchAsset', 'User', 'BankAccount'].includes(entityType)) {
      return 'critical';
    }
  }

  // Large financial amounts
  if (amount && amount >= 5_000_000) {
    return 'critical';
  }

  // Sensitive modifications
  if (['FinancialRecord', 'PettyCash', 'PcTopUp', 'ChurchAsset', 'BankAccount', 'User', 'Attestation'].includes(entityType)) {
    return 'sensitive';
  }

  if (entityType === 'Member' && (action === 'Menghapus' || action === 'Mengubah')) {
    return 'sensitive';
  }

  return 'normal';
}
