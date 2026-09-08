import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../../lib/apiClient';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, X, Loader2, Layers, BookOpen, MapPin,
  FolderTree, ListTree, Wallet, Building2, CalendarRange, Star, ChevronDown, ChevronRight, ArrowLeft, Ticket,
  Truck, Gift, Target,
} from 'lucide-react';

const FINANCE_MODULE = 'Keuangan (Finance Add-on)';

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
}

function buildConfigs(lk: Lookups): EntityConfig[] {
  const accountGroupOptions = lk.accountGroups.map(g => ({ value: g.id, label: `${g.code} — ${g.name}` }));
  const fieldOptions = lk.fields.map(f => ({ value: f.id, label: `${f.code} — ${f.name}` }));
  const programOptions = lk.programs.map(p => ({ value: p.id, label: `${p.code} — ${p.name}` }));
  const fundOptions = lk.funds.map(f => ({ value: f.id, label: `${f.code} — ${f.name}` }));
  const accountOptions = lk.accounts.map(a => ({ value: a.id, label: `${a.code} — ${a.name}` }));
  const postableAccountOptions = lk.accounts.filter(a => a.is_postable).map(a => ({ value: a.id, label: `${a.code} — ${a.name}` }));
  const costCenterOptions = lk.costCenters.map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }));

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
        { key: 'is_active', label: 'Aktif', render: row => (row.is_active ? 'Ya' : 'Tidak') },
      ],
      fields: [
        { key: 'code', label: 'Kode', type: 'text', required: true, placeholder: 'BKM' },
        { key: 'name', label: 'Nama', type: 'text', required: true, placeholder: 'Bukti Kas Masuk' },
        { key: 'transaction_type', label: 'Tipe Transaksi', type: 'select', required: true, options: TRANSACTION_TYPE_OPTIONS },
        { key: 'prefix', label: 'Prefix Nomor Voucher', type: 'text', required: true, placeholder: 'BKM' },
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
            style={{ background: '#1A77A3' }}
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
                      <button onClick={() => openEdit(row)} className="text-slate-400 hover:text-[#1A77A3] p-1" title="Edit">
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
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]"
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
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]"
                    />
                  )}
                  {f.type === 'checkbox' && (
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={!!form[f.key]}
                        onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.checked }))}
                      />
                      {f.label}
                    </label>
                  )}
                  {f.type === 'number' && (
                    <input
                      type="number"
                      value={form[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]"
                    />
                  )}
                  {f.type === 'text' && (
                    <input
                      type="text"
                      value={form[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]"
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
                style={{ background: '#1A77A3' }}
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
            style={{ background: '#1A77A3' }}
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
                      <button onClick={() => toggleExpand(fy)} className="text-slate-400 hover:text-[#1A77A3]">
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
                          className="text-xs font-medium text-[#1A77A3] hover:underline disabled:opacity-50"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nama <span className="text-red-500">*</span></label>
                <input
                  type="text" value={form.name} placeholder="Tahun Fiskal 2026/2027"
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tanggal Mulai <span className="text-red-500">*</span></label>
                <input
                  type="date" value={form.startDate}
                  onChange={e => setForm(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalOpen(false)} disabled={saving} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200">Batal</button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60"
                style={{ background: '#1A77A3' }}
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

// ── Main page ──────────────────────────────────────────────────────────────────
const TABS: { id: string; label: string; icon: React.ElementType }[] = [
  { id: 'account-groups', label: 'Kelompok Akun', icon: Layers },
  { id: 'accounts', label: 'Chart of Accounts', icon: BookOpen },
  { id: 'fields', label: 'Bidang', icon: MapPin },
  { id: 'programs', label: 'Program', icon: FolderTree },
  { id: 'activities', label: 'Kegiatan', icon: ListTree },
  { id: 'funds', label: 'Dana', icon: Wallet },
  { id: 'cash-accounts', label: 'Kas', icon: Wallet },
  { id: 'bank-accounts', label: 'Bank', icon: Building2 },
  { id: 'voucher-types', label: 'Jenis Voucher', icon: Ticket },
  { id: 'vendors', label: 'Pemasok', icon: Truck },
  { id: 'donors', label: 'Donatur', icon: Gift },
  { id: 'cost-centers', label: 'Pusat Biaya', icon: Target },
  { id: 'fiscal-years', label: 'Tahun Fiskal', icon: CalendarRange },
];

export function FinanceMasterData({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { can: canFn } = useApp();
  const canEdit = canFn(FINANCE_MODULE, 'edit');
  const [activeTab, setActiveTab] = useState<string>('account-groups');
  const [lookups, setLookups] = useState<Lookups>({ accountGroups: [], fields: [], programs: [], funds: [], accounts: [], costCenters: [] });

  const loadLookups = useCallback(async () => {
    try {
      const [accountGroups, fields, programs, funds, accounts, costCenters] = await Promise.all([
        fetchList<any>('/api/v1/finance/account-groups').catch(() => []),
        fetchList<any>('/api/v1/finance/fields').catch(() => []),
        fetchList<any>('/api/v1/finance/programs').catch(() => []),
        fetchList<any>('/api/v1/finance/funds').catch(() => []),
        fetchList<any>('/api/v1/finance/accounts').catch(() => []),
        fetchList<any>('/api/v1/finance/cost-centers').catch(() => []),
      ]);
      setLookups({ accountGroups, fields, programs, funds, accounts, costCenters });
    } catch {
      // Skema belum aktif — masing-masing tab akan menampilkan pesan errornya sendiri.
    }
  }, []);

  useEffect(() => { loadLookups(); }, [loadLookups]);

  const configs = useMemo(() => buildConfigs(lookups), [lookups]);
  const activeConfig = configs.find(c => c.id === activeTab);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('finance-addon')}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#1A77A3] mb-1.5"
            >
              <ArrowLeft className="w-3 h-3" /> Kembali ke Ringkasan Finance
            </button>
          )}
          <h1 className="text-xl font-semibold text-slate-800">Master Data &amp; Periode Fiskal</h1>
          <p className="text-sm text-slate-500 mt-0.5">Fase 1 — data rujukan untuk Budget/RKA, Transaksi, dan Jurnal di fase berikutnya</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors"
              style={active ? { background: '#1A77A3', color: '#fff' } : { color: '#475569' }}
            >
              <Icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'fiscal-years' ? (
        <FiscalYearSection canEdit={canEdit} />
      ) : activeConfig ? (
        <EntitySection key={activeTab} config={activeConfig} canEdit={canEdit} onMutated={loadLookups} />
      ) : null}
    </div>
  );
}
