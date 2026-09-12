import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../../lib/apiClient';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, X, Loader2, Layers, BookOpen, MapPin,
  FolderTree, ListTree, Wallet, Building2, CalendarRange, Star, ChevronDown, ChevronRight, ArrowLeft, Ticket,
  Truck, Gift, Target, QrCode, Check, ToggleRight, ToggleLeft,
} from 'lucide-react';
import { FinancePageHeader } from './FinancePageHeader';
import type { MasterDataCategory } from '../../types';

const FINANCE_MODULE = 'Finance Add-on (Standar Akuntansi)';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatRp(n: unknown) {
  const v = Number(n ?? 0);
  return `Rp ${v.toLocaleString('id-ID')}`;
}

function labelFor(options: { value: string; label: string }[], value: unknown): string {
  return options.find(o => o.value === value)?.label ?? (value ? String(value) : '—');
}

interface ApiListResponse<T> {
  success: boolean;
  data?: T[];
  error?: { code: string; message: string };
}

async function fetchList<T = any>(endpoint: string): Promise<T[]> {
  const res = await api.get<ApiListResponse<T>>(endpoint);
  if (!res.success) throw new Error(res.error?.message || 'Gagal memuat data');
  return res.data ?? [];
}

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'ASSET', label: 'Aset' },
  { value: 'LIABILITY', label: 'Kewajiban' },
  { value: 'FUND_BALANCE', label: 'Saldo Dana' },
  { value: 'REVENUE', label: 'Penerimaan' },
  { value: 'EXPENSE', label: 'Pengeluaran' },
  { value: 'TRANSFER', label: 'Transfer' },
];
const NORMAL_BALANCE_OPTIONS = [
  { value: 'DEBIT', label: 'Debit' },
  { value: 'CREDIT', label: 'Kredit' },
];
const FUND_TYPE_OPTIONS = [
  { value: 'GENERAL', label: 'Umum' },
  { value: 'PROGRAM', label: 'Program' },
  { value: 'SPECIAL', label: 'Khusus' },
  { value: 'BUILDING', label: 'Pembangunan' },
  { value: 'DIAKONIA', label: 'Diakonia' },
  { value: 'SINODAL', label: 'Sinodal' },
  { value: 'OTHER', label: 'Lainnya' },
];
const RESTRICTION_TYPE_OPTIONS = [
  { value: 'UNRESTRICTED', label: 'Tidak Terikat' },
  { value: 'RESTRICTED', label: 'Terikat' },
  { value: 'TEMPORARILY_RESTRICTED', label: 'Terikat Sementara' },
  { value: 'PERMANENTLY_RESTRICTED', label: 'Terikat Permanen' },
];
const TRANSACTION_TYPE_OPTIONS = [
  { value: 'RECEIPT', label: 'Penerimaan' },
  { value: 'PAYMENT', label: 'Pembayaran' },
  { value: 'CASH_IN', label: 'Kas Masuk' },
  { value: 'CASH_OUT', label: 'Kas Keluar' },
  { value: 'BANK_IN', label: 'Bank Masuk' },
  { value: 'BANK_OUT', label: 'Bank Keluar' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'MEMORIAL', label: 'Memorial' },
  { value: 'ADJUSTMENT', label: 'Penyesuaian' },
  { value: 'REVERSAL', label: 'Pembalikan' },
];
const DONOR_TYPE_OPTIONS = [
  { value: 'INDIVIDUAL', label: 'Individu' },
  { value: 'ORGANIZATION', label: 'Organisasi' },
  { value: 'ANONYMOUS', label: 'Anonim' },
];

// ── Generic entity CRUD types ──────────────────────────────────────────────────
type FieldType = 'text' | 'number' | 'select' | 'textarea' | 'checkbox';

interface FormFieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: any;
  hint?: string; // catatan kecil di bawah field, dipakai untuk field yang perlu penjelasan tambahan (mis. konsekuensi mematikan sebuah toggle)
}

interface ColumnDef {
  key: string;
  label: string;
  render?: (row: any) => React.ReactNode;
}

interface EntityConfig {
  id: string;
  label: string;
  endpoint: string;
  columns: ColumnDef[];
  fields: FormFieldDef[];
  emptyHint: string;
  getLabel: (row: any) => string;
}

interface Lookups {
  accountGroups: any[];
  fields: any[];
  programs: any[];
  funds: any[];
  accounts: any[];
  costCenters: any[];
  cashAccounts: any[];
}

function buildConfigs(lk: Lookups): EntityConfig[] {
  const accountGroupOptions = lk.accountGroups.map(g => ({ value: g.id, label: `${g.code} — ${g.name}` }));
  const fieldOptions = lk.fields.map(f => ({ value: f.id, label: `${f.code} — ${f.name}` }));
  const programOptions = lk.programs.map(p => ({ value: p.id, label: `${p.code} — ${p.name}` }));
  const fundOptions = lk.funds.map(f => ({ value: f.id, label: `${f.code} — ${f.name}` }));
  const accountOptions = lk.accounts.map(a => ({ value: a.id, label: `${a.code} — ${a.name}` }));
  const postableAccountOptions = lk.accounts.filter(a => a.is_postable).map(a => ({ value: a.id, label: `${a.code} — ${a.name}` }));
  const costCenterOptions = lk.costCenters.map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }));
  const cashAccountOptions = lk.cashAccounts.map(c => ({ value: c.id, label: c.name }));

  return [
    {
      id: 'account-groups',
      label: 'Kelompok Akun',
      endpoint: '/api/v1/finance/account-groups',
      emptyHint: 'Belum ada Kelompok Akun.',
      getLabel: row => row.name,
      columns: [
        { key: 'code', label: 'Kode' },
        { key: 'name', label: 'Nama' },
        { key: 'account_type', label: 'Tipe', render: row => labelFor(ACCOUNT_TYPE_OPTIONS, row.account_type) },
        { key: 'normal_balance', label: 'Saldo Normal', render: row => labelFor(NORMAL_BALANCE_OPTIONS, row.normal_balance) },
        { key: 'sort_order', label: 'Urutan' },
      ],
      fields: [
        { key: 'code', label: 'Kode', type: 'text', required: true, placeholder: 'AST' },
        { key: 'name', label: 'Nama', type: 'text', required: true, placeholder: 'Aset' },
        { key: 'account_type', label: 'Tipe Akun', type: 'select', required: true, options: ACCOUNT_TYPE_OPTIONS },
        { key: 'normal_balance', label: 'Saldo Normal', type: 'select', required: true, options: NORMAL_BALANCE_OPTIONS },
        { key: 'sort_order', label: 'Urutan Tampil', type: 'number', defaultValue: 0 },
      ],
    },
    {
      id: 'accounts',
      label: 'Chart of Accounts',
      endpoint: '/api/v1/finance/accounts',
      emptyHint: 'Belum ada Akun. Buat Kelompok Akun dulu sebelum menambah akun.',
      getLabel: row => row.name,
      columns: [
        { key: 'code', label: 'Kode' },
        { key: 'name', label: 'Nama Akun' },
        { key: 'group_id', label: 'Kelompok', render: row => lk.accountGroups.find(g => g.id === row.group_id)?.name ?? '—' },
        { key: 'parent_id', label: 'Induk', render: row => row.parent_id ? (lk.accounts.find(a => a.id === row.parent_id)?.name ?? '—') : '—' },
        { key: 'is_postable', label: 'Postable', render: row => (row.is_postable ? 'Ya' : 'Tidak (induk)') },
        { key: 'opening_balance', label: 'Saldo Awal', render: row => formatRp(row.opening_balance) },
      ],
      fields: [
        { key: 'group_id', label: 'Kelompok Akun', type: 'select', required: true, options: accountGroupOptions },
        { key: 'parent_id', label: 'Akun Induk (opsional)', type: 'select', options: accountOptions },
        { key: 'code', label: 'Kode Akun', type: 'text', required: true, placeholder: '1-1000' },
        { key: 'name', label: 'Nama Akun', type: 'text', required: true, placeholder: 'Kas Utama' },
        { key: 'is_postable', label: 'Bisa dipakai transaksi (postable)', type: 'checkbox', defaultValue: true },
        { key: 'is_control_account', label: 'Akun kontrol (rekap, tidak dipakai langsung)', type: 'checkbox', defaultValue: false },
        { key: 'opening_balance', label: 'Saldo Awal', type: 'number', defaultValue: 0 },
      ],
    },
    {
      id: 'fields',
      label: 'Bidang',
      endpoint: '/api/v1/finance/fields',
      emptyHint: 'Belum ada Bidang.',
      getLabel: row => row.name,
      columns: [
        { key: 'code', label: 'Kode' },
        { key: 'name', label: 'Nama Bidang' },
        { key: 'parent_id', label: 'Induk', render: row => row.parent_id ? (lk.fields.find(f => f.id === row.parent_id)?.name ?? '—') : '—' },
        { key: 'description', label: 'Deskripsi', render: row => row.description || '—' },
      ],
      fields: [
        { key: 'parent_id', label: 'Bidang Induk (opsional)', type: 'select', options: fieldOptions },
        { key: 'code', label: 'Kode', type: 'text', required: true, placeholder: 'BID-01' },
        { key: 'name', label: 'Nama Bidang', type: 'text', required: true, placeholder: 'Bidang Pelayanan' },
        { key: 'description', label: 'Deskripsi', type: 'textarea' },
      ],
    },
    {
      id: 'programs',
      label: 'Program',
      endpoint: '/api/v1/finance/programs',
      emptyHint: 'Belum ada Program. Buat Bidang dulu sebelum menambah program.',
      getLabel: row => row.name,
      columns: [
        { key: 'code', label: 'Kode' },
        { key: 'name', label: 'Nama Program' },
        { key: 'field_id', label: 'Bidang', render: row => lk.fields.find(f => f.id === row.field_id)?.name ?? '—' },
        { key: 'description', label: 'Deskripsi', render: row => row.description || '—' },
      ],
      fields: [
        { key: 'field_id', label: 'Bidang', type: 'select', required: true, options: fieldOptions },
        { key: 'code', label: 'Kode', type: 'text', required: true, placeholder: 'PRG-01' },
        { key: 'name', label: 'Nama Program', type: 'text', required: true },
        { key: 'description', label: 'Deskripsi', type: 'textarea' },
      ],
    },
    {
      id: 'activities',
      label: 'Kegiatan',
      endpoint: '/api/v1/finance/activities',
      emptyHint: 'Belum ada Kegiatan. Buat Program dulu sebelum menambah kegiatan.',
      getLabel: row => row.name,
      columns: [
        { key: 'code', label: 'Kode' },
        { key: 'name', label: 'Nama Kegiatan' },
        { key: 'program_id', label: 'Program', render: row => lk.programs.find(p => p.id === row.program_id)?.name ?? '—' },
        { key: 'description', label: 'Deskripsi', render: row => row.description || '—' },
      ],
      fields: [
        { key: 'program_id', label: 'Program', type: 'select', required: true, options: programOptions },
        { key: 'code', label: 'Kode', type: 'text', required: true, placeholder: 'KEG-01' },
        { key: 'name', label: 'Nama Kegiatan', type: 'text', required: true },
        { key: 'description', label: 'Deskripsi', type: 'textarea' },
      ],
    },
    {
      id: 'funds',
      label: 'Dana',
      endpoint: '/api/v1/finance/funds',
      emptyHint: 'Belum ada Dana.',
      getLabel: row => row.name,
      columns: [
        { key: 'code', label: 'Kode' },
        { key: 'name', label: 'Nama Dana' },
        { key: 'fund_type', label: 'Tipe', render: row => labelFor(FUND_TYPE_OPTIONS, row.fund_type) },
        { key: 'restriction_type', label: 'Restriksi', render: row => labelFor(RESTRICTION_TYPE_OPTIONS, row.restriction_type) },
        { key: 'opening_balance', label: 'Saldo Awal', render: row => formatRp(row.opening_balance) },
      ],
      fields: [
        { key: 'parent_id', label: 'Dana Induk (opsional)', type: 'select', options: fundOptions },
        { key: 'code', label: 'Kode', type: 'text', required: true, placeholder: 'DN-01' },
        { key: 'name', label: 'Nama Dana', type: 'text', required: true },
        { key: 'fund_type', label: 'Tipe Dana', type: 'select', required: true, options: FUND_TYPE_OPTIONS },
        { key: 'restriction_type', label: 'Restriksi', type: 'select', required: true, options: RESTRICTION_TYPE_OPTIONS },
        { key: 'opening_balance', label: 'Saldo Awal', type: 'number', defaultValue: 0 },
      ],
    },
    {
      id: 'cash-accounts',
      label: 'Kas',
      endpoint: '/api/v1/finance/cash-accounts',
      emptyHint: 'Belum ada Kas. Buat Akun (Chart of Accounts) yang postable dulu.',
      getLabel: row => row.name,
      columns: [
        { key: 'code', label: 'Kode' },
        { key: 'name', label: 'Nama Kas' },
        { key: 'account_id', label: 'Akun GL', render: row => lk.accounts.find(a => a.id === row.account_id)?.name ?? '—' },
        { key: 'location', label: 'Lokasi', render: row => row.location || '—' },
        { key: 'current_balance', label: 'Saldo Berjalan', render: row => formatRp(row.current_balance) },
      ],
      fields: [
        { key: 'account_id', label: 'Akun GL (postable)', type: 'select', required: true, options: postableAccountOptions },
        { key: 'code', label: 'Kode', type: 'text', required: true, placeholder: 'KAS-01' },
        { key: 'name', label: 'Nama Kas', type: 'text', required: true, placeholder: 'Kas Kecil Sekretariat' },
        { key: 'location', label: 'Lokasi', type: 'text' },
        { key: 'opening_balance', label: 'Saldo Awal', type: 'number', defaultValue: 0 },
      ],
    },
    {
      id: 'bank-accounts',
      label: 'Rekening Bank',
      endpoint: '/api/v1/finance/bank-accounts',
      emptyHint: 'Belum ada Rekening Bank. Buat Akun (Chart of Accounts) yang postable dulu.',
      getLabel: row => `${row.bank_name} — ${row.account_number}`,
      columns: [
        { key: 'bank_name', label: 'Bank' },
        { key: 'account_number', label: 'No. Rekening' },
        { key: 'account_name', label: 'Atas Nama' },
        { key: 'account_id', label: 'Akun GL', render: row => lk.accounts.find(a => a.id === row.account_id)?.name ?? '—' },
        { key: 'currency', label: 'Mata Uang' },
        { key: 'current_balance', label: 'Saldo Berjalan', render: row => formatRp(row.current_balance) },
      ],
      fields: [
        { key: 'account_id', label: 'Akun GL (postable)', type: 'select', required: true, options: postableAccountOptions },
        { key: 'bank_name', label: 'Nama Bank', type: 'text', required: true, placeholder: 'BCA' },
        { key: 'bank_code', label: 'Kode Bank', type: 'text' },
        { key: 'account_number', label: 'Nomor Rekening', type: 'text', required: true },
        { key: 'account_name', label: 'Atas Nama', type: 'text', required: true, placeholder: 'GPIB Trinitas' },
        { key: 'currency', label: 'Mata Uang', type: 'text', defaultValue: 'IDR', placeholder: 'IDR' },
        { key: 'opening_balance', label: 'Saldo Awal', type: 'number', defaultValue: 0 },
      ],
    },
    {
      id: 'offering-deposit-map',
      label: 'Peta Setoran Persembahan',
      endpoint: '/api/v1/finance/offering-deposit-map',
      emptyHint: 'Belum ada Peta Setoran. Tambahkan pemetaan untuk tiap kategori di tab Jenis Persembahan (dan CASH_DEBIT/BANK_DEBIT untuk sisi debit kas/bank) supaya fitur "Setor ke Buku Besar" di Persembahan Digital bisa dipakai.',
      getLabel: row => row.map_key,
      columns: [
        { key: 'map_key', label: 'Kategori / Kunci' },
        { key: 'account_id', label: 'Akun GL', render: row => lk.accounts.find(a => a.id === row.account_id)?.name ?? '—' },
        { key: 'fund_id', label: 'Dana', render: row => lk.funds.find(f => f.id === row.fund_id)?.name ?? '—' },
        { key: 'cash_account_id', label: 'Kas', render: row => lk.cashAccounts.find(c => c.id === row.cash_account_id)?.name ?? '—' },
      ],
      fields: [
        {
          key: 'map_key', label: 'Kategori / Kunci', type: 'text', required: true,
          placeholder: 'mis. Mingguan, atau CASH_DEBIT / BANK_DEBIT',
          hint: 'Harus persis sama (huruf besar/kecil & ejaan) dengan nilai di tab Jenis Persembahan, atau salah satu dari CASH_DEBIT / BANK_DEBIT untuk sisi debit kas/bank saat setor. Ini dicocokkan sebagai teks biasa, bukan dropdown — kalau kategori di-rename di tab Jenis Persembahan, mapping ini TIDAK ikut berubah otomatis.',
        },
        { key: 'account_id', label: 'Akun GL (postable)', type: 'select', required: true, options: postableAccountOptions },
        { key: 'fund_id', label: 'Dana (opsional)', type: 'select', options: fundOptions },
        { key: 'cash_account_id', label: 'Kas (opsional, khusus CASH_DEBIT)', type: 'select', options: cashAccountOptions },
      ],
    },
    {
      id: 'voucher-types',
      label: 'Jenis Voucher',
      endpoint: '/api/v1/finance/voucher-types',
      emptyHint: 'Belum ada Jenis Voucher.',
      getLabel: row => row.name,
      columns: [
        { key: 'code', label: 'Kode' },
        { key: 'name', label: 'Nama' },
        { key: 'transaction_type', label: 'Tipe Transaksi', render: row => labelFor(TRANSACTION_TYPE_OPTIONS, row.transaction_type) },
        { key: 'prefix', label: 'Prefix Nomor' },
        { key: 'requires_approval', label: 'Wajib Approval', render: row => (row.requires_approval === false ? 'Tidak (langsung posting)' : 'Ya') },
        { key: 'is_active', label: 'Aktif', render: row => (row.is_active ? 'Ya' : 'Tidak') },
      ],
      fields: [
        { key: 'code', label: 'Kode', type: 'text', required: true, placeholder: 'BKM' },
        { key: 'name', label: 'Nama', type: 'text', required: true, placeholder: 'Bukti Kas Masuk' },
        { key: 'transaction_type', label: 'Tipe Transaksi', type: 'select', required: true, options: TRANSACTION_TYPE_OPTIONS },
        { key: 'prefix', label: 'Prefix Nomor Voucher', type: 'text', required: true, placeholder: 'BKM' },
        {
          key: 'requires_approval',
          label: 'Wajib alur approval (Submit → Verifikasi → Setuju → Posting)',
          type: 'checkbox',
          defaultValue: true,
          hint: 'Kalau dimatikan, transaksi jenis voucher ini langsung diposting ke General Ledger begitu diajukan — tanpa verifikasi/persetujuan, dan tanpa cek segregation-of-duties. Setiap perubahan tercatat di Audit Trail Finance.',
        },
      ],
    },
    {
      id: 'vendors',
      label: 'Pemasok',
      endpoint: '/api/v1/finance/vendors',
      emptyHint: 'Belum ada data Pemasok.',
      getLabel: row => row.name,
      columns: [
        { key: 'code', label: 'Kode' },
        { key: 'name', label: 'Nama' },
        { key: 'contact_person', label: 'Kontak', render: row => row.contact_person || '—' },
        { key: 'phone', label: 'Telepon', render: row => row.phone || '—' },
        { key: 'is_active', label: 'Aktif', render: row => (row.is_active ? 'Ya' : 'Tidak') },
      ],
      fields: [
        { key: 'code', label: 'Kode', type: 'text', required: true, placeholder: 'VND-01' },
        { key: 'name', label: 'Nama Pemasok', type: 'text', required: true, placeholder: 'CV Sumber Berkat' },
        { key: 'contact_person', label: 'Narahubung', type: 'text' },
        { key: 'phone', label: 'Telepon', type: 'text' },
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'address', label: 'Alamat', type: 'textarea' },
        { key: 'npwp', label: 'NPWP', type: 'text' },
        { key: 'bank_name', label: 'Nama Bank', type: 'text' },
        { key: 'bank_account_number', label: 'Nomor Rekening', type: 'text' },
        { key: 'notes', label: 'Catatan', type: 'textarea' },
      ],
    },
    {
      id: 'donors',
      label: 'Donatur',
      endpoint: '/api/v1/finance/donors',
      emptyHint: 'Belum ada data Donatur.',
      getLabel: row => row.name,
      columns: [
        { key: 'code', label: 'Kode' },
        { key: 'name', label: 'Nama' },
        { key: 'donor_type', label: 'Tipe', render: row => labelFor(DONOR_TYPE_OPTIONS, row.donor_type) },
        { key: 'phone', label: 'Telepon', render: row => row.phone || '—' },
        { key: 'is_active', label: 'Aktif', render: row => (row.is_active ? 'Ya' : 'Tidak') },
      ],
      fields: [
        { key: 'code', label: 'Kode', type: 'text', required: true, placeholder: 'DNR-01' },
        { key: 'name', label: 'Nama Donatur', type: 'text', required: true },
        { key: 'donor_type', label: 'Tipe Donatur', type: 'select', required: true, options: DONOR_TYPE_OPTIONS, defaultValue: 'INDIVIDUAL' },
        { key: 'contact_person', label: 'Narahubung', type: 'text' },
        { key: 'phone', label: 'Telepon', type: 'text' },
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'address', label: 'Alamat', type: 'textarea' },
        { key: 'notes', label: 'Catatan', type: 'textarea' },
      ],
    },
    {
      id: 'cost-centers',
      label: 'Pusat Biaya',
      endpoint: '/api/v1/finance/cost-centers',
      emptyHint: 'Belum ada data Pusat Biaya.',
      getLabel: row => row.name,
      columns: [
        { key: 'code', label: 'Kode' },
        { key: 'name', label: 'Nama' },
        { key: 'parent_id', label: 'Induk', render: row => row.parent_id ? (lk.costCenters.find(c => c.id === row.parent_id)?.name ?? '—') : '—' },
        { key: 'description', label: 'Deskripsi', render: row => row.description || '—' },
        { key: 'is_active', label: 'Aktif', render: row => (row.is_active ? 'Ya' : 'Tidak') },
      ],
      fields: [
        { key: 'parent_id', label: 'Pusat Biaya Induk (opsional)', type: 'select', options: costCenterOptions },
        { key: 'code', label: 'Kode', type: 'text', required: true, placeholder: 'PB-01' },
        { key: 'name', label: 'Nama Pusat Biaya', type: 'text', required: true, placeholder: 'Sekretariat' },
        { key: 'description', label: 'Deskripsi', type: 'textarea' },
        { key: 'manager_user_id', label: 'Penanggung Jawab', type: 'text' },
      ],
    },
  ];
}

// ── Generic list + modal form section ──────────────────────────────────────────
function EntitySection({ config, canEdit, onMutated }: { config: EntityConfig; canEdit: boolean; onMutated: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchList<any>(config.endpoint);
      setRows(data);
    } catch (err: any) {
      setLoadError(err?.message || `Gagal memuat ${config.label}`);
    } finally {
      setLoading(false);
    }
  }, [config.endpoint, config.label]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    const initial: Record<string, any> = {};
    config.fields.forEach(f => { initial[f.key] = f.defaultValue ?? (f.type === 'checkbox' ? false : ''); });
    setForm(initial);
    setEditingRow(null);
    setModalOpen(true);
  };

  const openEdit = (row: any) => {
    const initial: Record<string, any> = {};
    config.fields.forEach(f => { initial[f.key] = row[f.key] ?? (f.type === 'checkbox' ? false : ''); });
    setForm(initial);
    setEditingRow(row);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const missing = config.fields.filter(f => f.required && (form[f.key] === undefined || form[f.key] === null || form[f.key] === ''));
    if (missing.length > 0) {
      toast.error(`Lengkapi dulu: ${missing.map(f => f.label).join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      if (editingRow) {
        const res = await api.put<{ success: boolean; error?: { message: string } }>(`${config.endpoint}/${editingRow.id}`, form);
        if (!res.success) throw new Error(res.error?.message || 'Gagal menyimpan');
        toast.success(`${config.label} diperbarui`);
      } else {
        const res = await api.post<{ success: boolean; error?: { message: string } }>(config.endpoint, form);
        if (!res.success) throw new Error(res.error?.message || 'Gagal menyimpan');
        toast.success(`${config.label} ditambahkan`);
      }
      setModalOpen(false);
      await load();
      onMutated();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan data');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await api.delete<{ success: boolean; error?: { message: string } }>(`${config.endpoint}/${deleteTarget.id}`);
      if (!res.success) throw new Error(res.error?.message || 'Gagal menghapus');
      toast.success(`${config.label} dinonaktifkan`);
      setDeleteTarget(null);
      await load();
      onMutated();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus data');
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{loading ? 'Memuat…' : `${rows.length} data`}</p>
        {canEdit && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-lg hover:opacity-90"
            style={{ background: '#144f6b' }}
          >
            <Plus className="w-3.5 h-3.5" /> Tambah {config.label}
          </button>
        )}
      </div>

      {loadError && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{loadError}</div>
      )}

      {!loadError && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                {config.columns.map(c => <th key={c.key} className="px-4 py-2.5 font-medium whitespace-nowrap">{c.label}</th>)}
                {canEdit && <th className="px-4 py-2.5 font-medium text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={config.columns.length + 1} className="px-4 py-6 text-center text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Memuat…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={config.columns.length + 1} className="px-4 py-6 text-center text-slate-400">{config.emptyHint}</td>
                </tr>
              )}
              {!loading && rows.map(row => (
                <tr key={row.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  {config.columns.map(c => (
                    <td key={c.key} className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                      {c.render ? c.render(row) : (row[c.key] ?? '—')}
                    </td>
                  ))}
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(row)} className="text-slate-400 hover:text-[#144f6b] p-1" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(row)} className="text-slate-400 hover:text-red-500 p-1" title="Nonaktifkan">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.45)' }}
          onClick={() => !saving && setModalOpen(false)}
        >
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">{editingRow ? `Edit ${config.label}` : `Tambah ${config.label}`}</h3>
              <button onClick={() => setModalOpen(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              {config.fields.map(f => (
                <div key={f.key}>
                  {f.type !== 'checkbox' && (
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      {f.label}{f.required && <span className="text-red-500"> *</span>}
                    </label>
                  )}
                  {f.type === 'select' && (
                    <select
                      value={form[f.key] ?? ''}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                    >
                      <option value="">— pilih —</option>
                      {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  {f.type === 'textarea' && (
                    <textarea
                      value={form[f.key] ?? ''}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                    />
                  )}
                  {f.type === 'checkbox' && (
                    <div>
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={!!form[f.key]}
                          onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.checked }))}
                        />
                        {f.label}
                      </label>
                      {f.hint && <p className="mt-1 text-xs text-slate-400">{f.hint}</p>}
                    </div>
                  )}
                  {f.type === 'number' && (
                    <input
                      type="number"
                      value={form[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                    />
                  )}
                  {f.type === 'text' && (
                    <input
                      type="text"
                      value={form[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalOpen(false)} disabled={saving} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200">
                Batal
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60"
                style={{ background: '#144f6b' }}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.45)' }}
          onClick={() => setDeleteTarget(null)}
        >
          <div className="bg-white rounded-xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-800">Nonaktifkan {config.label}?</h3>
            <p className="text-sm text-slate-500">
              "{config.getLabel(deleteTarget)}" akan disembunyikan dari daftar aktif. Data historis yang sudah memakainya tidak akan terpengaruh.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setDeleteTarget(null)} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200">Batal</button>
              <button onClick={handleDelete} className="px-3 py-1.5 rounded-lg text-sm text-white bg-red-500 hover:bg-red-600">Nonaktifkan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tahun Fiskal & Periode (custom — bukan generic CRUD) ──────────────────────
function FiscalYearSection({ canEdit }: { canEdit: boolean }) {
  const [years, setYears] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', startDate: '' });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [periodsByYear, setPeriodsByYear] = useState<Record<string, any[]>>({});
  const [periodsLoading, setPeriodsLoading] = useState<string | null>(null);
  const [settingCurrent, setSettingCurrent] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchList<any>('/api/v1/finance/fiscal-years');
      setYears(data);
    } catch (err: any) {
      setLoadError(err?.message || 'Gagal memuat Tahun Fiskal');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = async (fy: any) => {
    if (expanded === fy.id) { setExpanded(null); return; }
    setExpanded(fy.id);
    if (!periodsByYear[fy.id]) {
      setPeriodsLoading(fy.id);
      try {
        const data = await fetchList<any>(`/api/v1/finance/fiscal-years/${fy.id}/periods`);
        setPeriodsByYear(prev => ({ ...prev, [fy.id]: data }));
      } catch (err: any) {
        toast.error(err?.message || 'Gagal memuat periode');
      } finally {
        setPeriodsLoading(null);
      }
    }
  };

  const handleCreate = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.startDate) {
      toast.error('Kode, nama, dan tanggal mulai wajib diisi');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<{ success: boolean; error?: { message: string } }>('/api/v1/finance/fiscal-years', form);
      if (!res.success) throw new Error(res.error?.message || 'Gagal menyimpan');
      toast.success('Tahun Fiskal dibuat beserta 12 periode bulanan');
      setModalOpen(false);
      setForm({ code: '', name: '', startDate: '' });
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal membuat Tahun Fiskal');
    } finally {
      setSaving(false);
    }
  };

  const handleSetCurrent = async (fy: any) => {
    setSettingCurrent(fy.id);
    try {
      const res = await api.put<{ success: boolean; error?: { message: string } }>(`/api/v1/finance/fiscal-years/${fy.id}/set-current`, {});
      if (!res.success) throw new Error(res.error?.message || 'Gagal mengaktifkan');
      toast.success(`${fy.name} dijadikan Tahun Fiskal aktif`);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengaktifkan Tahun Fiskal');
    } finally {
      setSettingCurrent(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{loading ? 'Memuat…' : `${years.length} Tahun Fiskal`}</p>
        {canEdit && (
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-lg hover:opacity-90"
            style={{ background: '#144f6b' }}
          >
            <Plus className="w-3.5 h-3.5" /> Tambah Tahun Fiskal
          </button>
        )}
      </div>

      {loadError && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{loadError}</div>
      )}

      {!loadError && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium w-6"></th>
                <th className="px-4 py-2.5 font-medium">Kode</th>
                <th className="px-4 py-2.5 font-medium">Nama</th>
                <th className="px-4 py-2.5 font-medium">Periode</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Memuat…</td></tr>
              )}
              {!loading && years.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Belum ada Tahun Fiskal.</td></tr>
              )}
              {!loading && years.map(fy => (
                <React.Fragment key={fy.id}>
                  <tr className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <button onClick={() => toggleExpand(fy)} className="text-slate-400 hover:text-[#144f6b]">
                        {expanded === fy.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{fy.code}</td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {fy.name}
                      {fy.is_current && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                          <Star className="w-3 h-3" /> Aktif
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{fy.start_date} s/d {fy.end_date}</td>
                    <td className="px-4 py-2.5 text-slate-500">{fy.status}</td>
                    <td className="px-4 py-2.5 text-right">
                      {canEdit && !fy.is_current && (
                        <button
                          onClick={() => handleSetCurrent(fy)}
                          disabled={settingCurrent === fy.id}
                          className="text-xs font-medium text-[#144f6b] hover:underline disabled:opacity-50"
                        >
                          {settingCurrent === fy.id ? 'Memproses…' : 'Jadikan Aktif'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === fy.id && (
                    <tr>
                      <td colSpan={6} className="px-4 py-3 bg-slate-50/60">
                        {periodsLoading === fy.id ? (
                          <div className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Memuat periode…</div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {(periodsByYear[fy.id] ?? []).map(p => (
                              <div key={p.id} className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                                <p className="text-xs font-medium text-slate-700">{p.name}</p>
                                <p className="text-[11px] text-slate-400">{p.start_date} – {p.end_date} · Q{p.quarter} · {p.status}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => !saving && setModalOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Tambah Tahun Fiskal</h3>
              <button onClick={() => setModalOpen(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <p className="text-xs text-slate-500">
              12 periode bulanan akan dibuat otomatis mulai dari tanggal mulai yang dipilih (mis. 1 April untuk tahun fiskal April–Maret).
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Kode <span className="text-red-500">*</span></label>
                <input
                  type="text" value={form.code} placeholder="2026-2027"
                  onChange={e => setForm(prev => ({ ...prev, code: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nama <span className="text-red-500">*</span></label>
                <input
                  type="text" value={form.name} placeholder="Tahun Fiskal 2026/2027"
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tanggal Mulai <span className="text-red-500">*</span></label>
                <input
                  type="date" value={form.startDate}
                  onChange={e => setForm(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalOpen(false)} disabled={saving} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200">Batal</button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60"
                style={{ background: '#144f6b' }}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Data QRIS (custom — bukan generic CRUD karena ada upload gambar & relasi
// many-to-many ke kategori persembahan) ────────────────────────────────────────
function QrisCodesSection({ canEdit }: { canEdit: boolean }) {
  const { getMasterDataByCategory } = useApp();
  const categoryOptions = getMasterDataByCategory('jenis_persembahan').map((m: any) => m.value);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lookups, setLookups] = useState<{ bankAccounts: any[]; cashAccounts: any[] }>({ bankAccounts: [], cashAccounts: [] });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [data, bankAccounts, cashAccounts] = await Promise.all([
        fetchList<any>('/api/v1/finance/qris-codes?all=1'),
        fetchList<any>('/api/v1/finance/bank-accounts').catch(() => []),
        fetchList<any>('/api/v1/finance/cash-accounts').catch(() => []),
      ]);
      setRows(data);
      setLookups({ bankAccounts, cashAccounts });
    } catch (err: any) {
      setLoadError(err?.message || 'Gagal memuat Data QRIS');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const emptyForm = () => ({
    label: '', image_data: '', mime_type: '', event_tag: '',
    bank_account_id: '', cash_account_id: '', is_displayed: true, categories: [] as string[],
  });

  const openCreate = () => { setForm(emptyForm()); setEditingRow(null); setModalOpen(true); };
  const openEdit = (row: any) => {
    setForm({
      label: row.label, image_data: '', mime_type: row.mime_type, event_tag: row.event_tag || '',
      bank_account_id: row.bank_account_id || '', cash_account_id: row.cash_account_id || '',
      is_displayed: !!row.is_displayed, categories: row.categories || [],
    });
    setEditingRow(row);
    setModalOpen(true);
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast.error('Gambar QRIS harus berformat PNG atau JPEG');
      return;
    }
    if (file.size > 1 * 1024 * 1024) {
      toast.error('Ukuran gambar melebihi batas 1MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.split(',')[1] || '';
      setForm((prev: any) => ({ ...prev, image_data: base64, mime_type: file.type, _previewUrl: result }));
    };
    reader.readAsDataURL(file);
  };

  const toggleCategory = (cat: string) => {
    setForm((prev: any) => {
      const has = prev.categories.includes(cat);
      return { ...prev, categories: has ? prev.categories.filter((c: string) => c !== cat) : [...prev.categories, cat] };
    });
  };

  const handleSubmit = async () => {
    if (!form.label.trim()) { toast.error('Label wajib diisi'); return; }
    if (!editingRow && !form.image_data) { toast.error('Gambar QRIS wajib diunggah'); return; }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        label: form.label.trim(),
        event_tag: form.event_tag || null,
        bank_account_id: form.bank_account_id || null,
        cash_account_id: form.cash_account_id || null,
        is_displayed: form.is_displayed,
        categories: form.categories,
      };
      if (form.image_data) { payload.image_data = form.image_data; payload.mime_type = form.mime_type; }

      if (editingRow) {
        const res = await api.put<{ success: boolean; error?: { message: string } }>(`/api/v1/finance/qris-codes/${editingRow.id}`, payload);
        if (!res.success) throw new Error(res.error?.message || 'Gagal menyimpan');
        toast.success('Kode QRIS diperbarui');
      } else {
        const res = await api.post<{ success: boolean; error?: { message: string } }>('/api/v1/finance/qris-codes', payload);
        if (!res.success) throw new Error(res.error?.message || 'Gagal menyimpan');
        toast.success('Kode QRIS ditambahkan');
      }
      setModalOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan Kode QRIS');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await api.delete<{ success: boolean; error?: { message: string } }>(`/api/v1/finance/qris-codes/${deleteTarget.id}`);
      if (!res.success) throw new Error(res.error?.message || 'Gagal menonaktifkan');
      toast.success('Kode QRIS dinonaktifkan');
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menonaktifkan Kode QRIS');
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {loading ? 'Memuat…' : `${rows.length} kode`} — gambar QR statis untuk ditampilkan ke jemaat, bukan integrasi payment gateway
        </p>
        {canEdit && (
          <button onClick={openCreate} className="flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-lg hover:opacity-90" style={{ background: '#144f6b' }}>
            <Plus className="w-3.5 h-3.5" /> Tambah Kode QRIS
          </button>
        )}
      </div>

      {loadError && <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{loadError}</div>}

      {!loadError && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">Gambar</th>
                <th className="px-4 py-2.5 font-medium">Label</th>
                <th className="px-4 py-2.5 font-medium">Kategori</th>
                <th className="px-4 py-2.5 font-medium">Event/Musim</th>
                <th className="px-4 py-2.5 font-medium">Tampil?</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                {canEdit && <th className="px-4 py-2.5 font-medium text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Memuat…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Belum ada Kode QRIS. Tambahkan kode pertama untuk ditampilkan di Persembahan Digital/E-Warta.</td></tr>
              )}
              {!loading && rows.map(row => (
                <tr key={row.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <img src={`data:${row.mime_type};base64,${row.image_data}`} alt={row.label} className="w-10 h-10 object-contain rounded border border-slate-200" />
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{row.label}</td>
                  <td className="px-4 py-2.5 text-slate-600">{(row.categories || []).join(', ') || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{row.event_tag || '—'}</td>
                  <td className="px-4 py-2.5">{row.is_displayed ? 'Ya' : 'Tidak'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${row.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {row.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(row)} className="text-slate-400 hover:text-[#144f6b] p-1" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                      {row.is_active && (
                        <button onClick={() => setDeleteTarget(row)} className="text-slate-400 hover:text-red-500 p-1" title="Nonaktifkan"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => !saving && setModalOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">{editingRow ? 'Edit Kode QRIS' : 'Tambah Kode QRIS'}</h3>
              <button onClick={() => setModalOpen(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Label <span className="text-red-500">*</span></label>
                <input type="text" value={form.label} placeholder="mis. QRIS Persembahan Mingguan" onChange={e => setForm((p: any) => ({ ...p, label: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Gambar QR (PNG/JPEG, maks 1MB){!editingRow && <span className="text-red-500"> *</span>}
                </label>
                <input type="file" accept="image/png,image/jpeg" onChange={e => handleFile(e.target.files?.[0])} className="w-full text-sm" />
                {(form._previewUrl || (editingRow && !form.image_data)) && (
                  <img
                    src={form._previewUrl || `data:${editingRow?.mime_type};base64,${editingRow?.image_data}`}
                    alt="Preview"
                    className="mt-2 w-20 h-20 object-contain rounded border border-slate-200"
                  />
                )}
                {editingRow && <p className="mt-1 text-xs text-slate-400">Biarkan kosong kalau tidak ingin mengganti gambar.</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Kategori Persembahan (boleh lebih dari satu)</label>
                <div className="flex flex-wrap gap-2">
                  {categoryOptions.length === 0 && <p className="text-xs text-slate-400">Belum ada kategori di tab Jenis Persembahan.</p>}
                  {categoryOptions.map((cat: string) => (
                    <label key={cat} className={`text-xs px-2.5 py-1 rounded-full border cursor-pointer ${form.categories.includes(cat) ? 'bg-[#144f6b] text-white border-[#144f6b]' : 'text-slate-600 border-slate-200'}`}>
                      <input type="checkbox" className="hidden" checked={form.categories.includes(cat)} onChange={() => toggleCategory(cat)} />
                      {cat}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Event/Musim (opsional)</label>
                <input type="text" value={form.event_tag} placeholder="mis. Natal 2026" onChange={e => setForm((p: any) => ({ ...p, event_tag: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Rekening Bank tujuan (opsional)</label>
                <select value={form.bank_account_id} onChange={e => setForm((p: any) => ({ ...p, bank_account_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]">
                  <option value="">— tidak ditautkan —</option>
                  {lookups.bankAccounts.map((b: any) => <option key={b.id} value={b.id}>{b.bank_name} — {b.account_number}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Kas tujuan (opsional)</label>
                <select value={form.cash_account_id} onChange={e => setForm((p: any) => ({ ...p, cash_account_id: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]">
                  <option value="">— tidak ditautkan —</option>
                  {lookups.cashAccounts.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={form.is_displayed} onChange={e => setForm((p: any) => ({ ...p, is_displayed: e.target.checked }))} />
                  Tampilkan di Persembahan Digital & E-Warta
                </label>
                <p className="mt-1 text-xs text-slate-400">Nonaktifkan kalau kode ini cuma untuk pencatatan internal, tidak untuk ditampilkan ke jemaat.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalOpen(false)} disabled={saving} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200">Batal</button>
              <button onClick={handleSubmit} disabled={saving} className="px-3 py-1.5 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#144f6b' }}>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-800">Nonaktifkan Kode QRIS?</h3>
            <p className="text-sm text-slate-500">
              "{deleteTarget.label}" akan disembunyikan dari Persembahan Digital & E-Warta. Riwayat persembahan yang sudah memakai kode ini tidak akan terpengaruh.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setDeleteTarget(null)} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200">Batal</button>
              <button onClick={handleDelete} className="px-3 py-1.5 rounded-lg text-sm text-white bg-red-500 hover:bg-red-600">Nonaktifkan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Jenis Persembahan / Metode Pembayaran (custom — bukan tabel finance.*,
// tetap disimpan di collection generik master data lewat AppContext, cuma
// tabnya dipindah tampil di sini) ────────────────────────────────────────────
interface UsageCheckResult { count: number; sources: string[]; }

async function checkOfferingCategoryUsage(categoryValue: string): Promise<UsageCheckResult> {
  const sources: string[] = [];
  let count = 0;
  try {
    const mapRows = await fetchList<any>('/api/v1/finance/offering-deposit-map');
    const matches = mapRows.filter((r: any) => r.map_key === categoryValue);
    if (matches.length > 0) { count += matches.length; sources.push(`${matches.length} Peta Setoran Persembahan`); }
  } catch { /* endpoint belum aktif / gagal dimuat -- jangan blokir aksi user karena ini */ }
  try {
    const res = await api.get<{ success: boolean; data?: { count: number; labels: string[] } }>(
      `/api/v1/finance/qris-codes/usage/${encodeURIComponent(categoryValue)}`
    );
    if (res.success && res.data && res.data.count > 0) {
      count += res.data.count;
      sources.push(`${res.data.count} Kode QRIS (${res.data.labels.join(', ')})`);
    }
  } catch { /* idem */ }
  return { count, sources };
}

function OfferingCategorySection({ category, entityLabel, checkUsage }: { category: MasterDataCategory; entityLabel: string; checkUsage: boolean }) {
  const { masterDataItems, addMasterDataItem, updateMasterDataItem, deleteMasterDataItem } = useApp();
  const items = useMemo(
    () => masterDataItems.filter((m: any) => m.category === category).sort((a: any, b: any) => a.order - b.order),
    [masterDataItems, category]
  );
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newQrisEligible, setNewQrisEligible] = useState(false);
  const showQrisToggle = category === 'metode_pembayaran';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [pendingWarning, setPendingWarning] = useState<{ action: 'rename' | 'delete' | 'deactivate'; item: any; nextLabel?: string; usage: UsageCheckResult } | null>(null);
  const [checking, setChecking] = useState(false);

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    const maxOrder = items.reduce((max: number, m: any) => Math.max(max, m.order), 0);
    addMasterDataItem({
      category, value: newLabel.trim(), label: newLabel.trim(), isActive: true, order: maxOrder + 1,
      ...(showQrisToggle ? { isQrisEligible: newQrisEligible } : {}),
    });
    setNewLabel(''); setNewQrisEligible(false); setAdding(false);
  };

  const applyRename = (item: any, label: string) => { updateMasterDataItem(item.id, { label, value: label }); setEditingId(null); };
  const applyDelete = (item: any) => { deleteMasterDataItem(item.id); };
  const applyToggle = (item: any) => { updateMasterDataItem(item.id, { isActive: !item.isActive }); };
  const applyToggleQris = (item: any) => { updateMasterDataItem(item.id, { isQrisEligible: !item.isQrisEligible }); };
  // Hanya relevan untuk tab Metode Pembayaran -- menandai metode mana yang menampilkan
  // panel pemilihan Kode QRIS di form Persembahan Digital (lihat isQrisCapablePaymentMethod
  // di OfferingsQRIS.tsx). Data-driven, bukan cek string label, supaya tahan rename.

  const guardedRename = async (item: any, label: string) => {
    if (!checkUsage || label === item.label) { applyRename(item, label); return; }
    setChecking(true);
    const usage = await checkOfferingCategoryUsage(item.value);
    setChecking(false);
    if (usage.count > 0) setPendingWarning({ action: 'rename', item, nextLabel: label, usage });
    else applyRename(item, label);
  };

  const guardedDelete = async (item: any) => {
    if (!checkUsage) { applyDelete(item); return; }
    setChecking(true);
    const usage = await checkOfferingCategoryUsage(item.value);
    setChecking(false);
    if (usage.count > 0) setPendingWarning({ action: 'delete', item, usage });
    else applyDelete(item);
  };

  const confirmPending = () => {
    if (!pendingWarning) return;
    if (pendingWarning.action === 'rename' && pendingWarning.nextLabel) applyRename(pendingWarning.item, pendingWarning.nextLabel);
    else if (pendingWarning.action === 'delete') applyDelete(pendingWarning.item);
    setPendingWarning(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{items.length} item{checking ? ' — mengecek pemakaian…' : ''}</p>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-lg hover:opacity-90" style={{ background: '#144f6b' }}>
          <Plus className="w-3.5 h-3.5" /> Tambah {entityLabel}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {items.length === 0 && <p className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada {entityLabel}.</p>}
        {items.map((item: any) => (
          <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
            {editingId === item.id ? (
              <input
                value={editingLabel}
                onChange={e => setEditingLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') guardedRename(item, editingLabel); if (e.key === 'Escape') setEditingId(null); }}
                autoFocus
                className="px-2 py-1 rounded-lg border border-slate-200 text-sm flex-1 mr-3"
              />
            ) : (
              <span className={`text-sm ${item.isActive ? 'text-slate-700' : 'text-slate-400 line-through'}`}>{item.label}</span>
            )}
            <div className="flex items-center gap-1">
              {editingId === item.id ? (
                <>
                  <button onClick={() => guardedRename(item, editingLabel)} className="text-emerald-600 hover:text-emerald-700 p-1"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-3.5 h-3.5" /></button>
                </>
              ) : (
                <>
                  {showQrisToggle && (
                    <button
                      onClick={() => applyToggleQris(item)}
                      className={`p-1 ${item.isQrisEligible ? 'text-violet-600 hover:text-violet-700' : 'text-slate-300 hover:text-slate-400'}`}
                      title={item.isQrisEligible ? 'Metode ini menampilkan pemilihan Kode QRIS (klik untuk matikan)' : 'Metode ini TIDAK menampilkan pemilihan Kode QRIS (klik untuk aktifkan)'}
                    >
                      <QrCode className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button onClick={() => { setEditingId(item.id); setEditingLabel(item.label); }} className="text-slate-400 hover:text-[#144f6b] p-1" title="Ubah nama"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => applyToggle(item)} className="text-slate-400 hover:text-[#144f6b] p-1" title={item.isActive ? 'Nonaktifkan' : 'Aktifkan'}>
                    {item.isActive ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => guardedDelete(item)} className="text-slate-400 hover:text-red-500 p-1" title="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => setAdding(false)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-800">Tambah {entityLabel}</h3>
            <input
              value={newLabel} onChange={e => setNewLabel(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="Nama"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
            {showQrisToggle && (
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={newQrisEligible} onChange={e => setNewQrisEligible(e.target.checked)} className="rounded border-slate-300" />
                Tampilkan pemilihan Kode QRIS untuk metode ini (mis. Transfer, QRIS)
              </label>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setAdding(false)} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200">Batal</button>
              <button onClick={handleAdd} className="px-3 py-1.5 rounded-lg text-sm text-white" style={{ background: '#144f6b' }}>Simpan</button>
            </div>
          </div>
        </div>
      )}

      {pendingWarning && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => setPendingWarning(null)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-amber-700">Kategori ini masih dipakai</h3>
            <p className="text-sm text-slate-600">
              "{pendingWarning.item.label}" masih dipakai di: {pendingWarning.usage.sources.join('; ')}.
              {pendingWarning.action === 'delete'
                ? ' Menghapusnya akan membuat referensi itu tidak terhubung ke kategori manapun lagi.'
                : ' Mengubah namanya TIDAK akan otomatis memperbarui referensi tersebut — perlu disesuaikan manual.'}
              {' '}Lanjutkan?
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setPendingWarning(null)} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200">Batal</button>
              <button onClick={confirmPending} className="px-3 py-1.5 rounded-lg text-sm text-white bg-amber-600 hover:bg-amber-700">Lanjutkan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
const TAB_GROUPS: { label: string; tabs: { id: string; label: string; icon: React.ElementType }[] }[] = [
  { label: 'Struktur Akuntansi', tabs: [
    { id: 'account-groups', label: 'Kelompok Akun', icon: Layers },
    { id: 'accounts', label: 'Chart of Accounts', icon: BookOpen },
    { id: 'funds', label: 'Dana', icon: Wallet },
  ] },
  { label: 'Struktur Pelayanan', tabs: [
    { id: 'fields', label: 'Bidang', icon: MapPin },
    { id: 'programs', label: 'Program', icon: FolderTree },
    { id: 'activities', label: 'Kegiatan', icon: ListTree },
    { id: 'cost-centers', label: 'Pusat Biaya', icon: Target },
  ] },
  { label: 'Operasional', tabs: [
    { id: 'cash-accounts', label: 'Kas', icon: Wallet },
    { id: 'bank-accounts', label: 'Bank', icon: Building2 },
    { id: 'voucher-types', label: 'Jenis Voucher', icon: Ticket },
  ] },
  { label: 'Pihak Terkait', tabs: [
    { id: 'vendors', label: 'Pemasok', icon: Truck },
    { id: 'donors', label: 'Donatur', icon: Gift },
  ] },
  { label: 'Kalender', tabs: [
    { id: 'fiscal-years', label: 'Tahun Fiskal', icon: CalendarRange },
  ] },
  { label: 'Integrasi Persembahan', tabs: [
    { id: 'jenis-persembahan', label: 'Jenis Persembahan', icon: Gift },
    { id: 'metode-pembayaran', label: 'Metode Pembayaran', icon: Ticket },
    { id: 'offering-deposit-map', label: 'Peta Setoran Persembahan', icon: Layers },
    { id: 'qris-codes', label: 'Data QRIS', icon: QrCode },
  ] },
];

export function FinanceMasterData({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { can: canFn } = useApp();
  const canEdit = canFn(FINANCE_MODULE, 'edit');
  const [activeTab, setActiveTab] = useState<string>('account-groups');
  const [lookups, setLookups] = useState<Lookups>({ accountGroups: [], fields: [], programs: [], funds: [], accounts: [], costCenters: [], cashAccounts: [] });

  const loadLookups = useCallback(async () => {
    try {
      const [accountGroups, fields, programs, funds, accounts, costCenters, cashAccounts] = await Promise.all([
        fetchList<any>('/api/v1/finance/account-groups').catch(() => []),
        fetchList<any>('/api/v1/finance/fields').catch(() => []),
        fetchList<any>('/api/v1/finance/programs').catch(() => []),
        fetchList<any>('/api/v1/finance/funds').catch(() => []),
        fetchList<any>('/api/v1/finance/accounts').catch(() => []),
        fetchList<any>('/api/v1/finance/cost-centers').catch(() => []),
        fetchList<any>('/api/v1/finance/cash-accounts').catch(() => []),
      ]);
      setLookups({ accountGroups, fields, programs, funds, accounts, costCenters, cashAccounts });
    } catch {
      // Skema belum aktif — masing-masing tab akan menampilkan pesan errornya sendiri.
    }
  }, []);

  useEffect(() => { loadLookups(); }, [loadLookups]);

  const configs = useMemo(() => buildConfigs(lookups), [lookups]);
  const activeConfig = configs.find(c => c.id === activeTab);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <FinancePageHeader
        title="Master Data Finance"
        currentSection="Master Data & Konfigurasi"
        onNavigate={onNavigate}
        systemBadge="Standar Kodefikasi Sinodal"
        metaBadge="Enterprise COA Architecture"
        onRefresh={loadLookups}
        infoStrip={[
          {
            label: 'Kelompok Master',
            value: '13 Entitas + Fiskal',
            color: 'emerald',
          },
          {
            label: 'Chart of Accounts',
            value: `${lookups.accounts.length} Akun Terdaftar`,
            color: 'sky',
          },
          {
            label: 'Bidang Sinodal',
            value: `${lookups.fields.length} Bidang Pelayanan`,
            color: 'indigo',
          },
          {
            label: 'Sistem Kas & Bank',
            value: 'Multi-Rekening Terpisah',
            color: 'teal',
          },
        ]}
      />

      <div className="space-y-3 border-b border-slate-200 pb-3">
        {TAB_GROUPS.map(group => (
          <div key={group.label} className="flex flex-wrap items-center gap-1.5">
            <span className="w-full text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:w-auto sm:mr-1">{group.label}</span>
            {group.tabs.map(tab => {
              const Icon = tab.icon;
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors"
                  style={active ? { background: '#144f6b', color: '#fff' } : { color: '#475569' }}
                >
                  <Icon className="w-3.5 h-3.5" /> {tab.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {activeTab === 'fiscal-years' ? (
        <FiscalYearSection canEdit={canEdit} />
      ) : activeTab === 'qris-codes' ? (
        <QrisCodesSection canEdit={canEdit} />
      ) : activeTab === 'jenis-persembahan' ? (
        <OfferingCategorySection category="jenis_persembahan" entityLabel="Jenis Persembahan" checkUsage />
      ) : activeTab === 'metode-pembayaran' ? (
        <OfferingCategorySection category="metode_pembayaran" entityLabel="Metode Pembayaran" checkUsage={false} />
      ) : activeConfig ? (
        <EntitySection key={activeTab} config={activeConfig} canEdit={canEdit} onMutated={loadLookups} />
      ) : null}
    </div>
  );
}
