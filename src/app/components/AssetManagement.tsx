import React, { useState, useMemo, useEffect } from 'react';
import { PieChart, Pie, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { useApp } from '../context/AppContext';
import { useDraggable } from '../../lib/useDraggable';
import { api } from '../../lib/apiClient';
import { calcDep } from '../../lib/assetDepreciation';
import {
  Building2, Package, Truck, Monitor, Church, MapPin, Layers,
  Plus, X, Pencil, Trash2, Search, Eye, Wrench,
  TrendingDown, AlertCircle, CheckCircle2, Clock, Info,
  FileText, FileSpreadsheet, ChevronDown, BarChart3, Calendar,
  DollarSign, Tag, Users, AlertTriangle, ChevronLeft, ChevronRight,
  Filter, Shield, ArrowUpRight, History, RefreshCw,
  ArrowUp, ArrowDown, ArrowUpDown, Upload, Loader2
} from 'lucide-react';
import { useSortable } from '../../hooks/useSortable';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColResizeHandle } from './ui/resizable-th';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import type {
  ChurchAsset, MaintenanceRecord, LoanHistoryRecord,
  AssetCategory, AssetCondition, AcquisitionMethod,
  MaintenanceType, MaintenanceResult, AssetLoanStatus,
} from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
const compactRp = (n: number) => {
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(2)}M`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toFixed(1)}Jt`;
  return `Rp ${n.toLocaleString('id-ID')}`;
};

const isOverdue = (a: ChurchAsset): boolean => {
  if ((a.loanStatus || 'Tersedia') !== 'Dipinjam') return false;
  if (!a.expectedReturnDate) return false;
  return new Date(a.expectedReturnDate).getTime() < Date.now();
};

const fmtDateShort = (d?: string) =>
  d ? new Date(d).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' }) : '—';

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb/1024).toFixed(2)} MB`;
};
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024; // 2MB

interface AssetDocument {
  id: string;
  assetId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileData: string; // base64
  uploadedAt: string;
  uploadedBy: string;
}

// ── Colors & Constants ────────────────────────────────────────────────────────
const CAT_COLOR: Record<AssetCategory, string> = {
  'Tanah': '#3a7fa0', 'Bangunan': '#3b82f6', 'Kendaraan': '#c2baaa',
  'Inventaris': '#64748b', 'Elektronik': '#06b6d4',
  'Peralatan Ibadah': '#1A77A3', 'Lainnya': '#ec4899',
};
const CAT_BG: Record<AssetCategory, string> = {
  'Tanah': '#f5f3ff', 'Bangunan': '#eff6ff', 'Kendaraan': '#f6f4f0',
  'Inventaris': '#f8fafc', 'Elektronik': '#ecfeff',
  'Peralatan Ibadah': '#f0fdf4', 'Lainnya': '#fdf4ff',
};
const COND_CFG: Record<AssetCondition, { text: string; bg: string; border: string }> = {
  'Baik':         { text: '#1A77A3', bg: '#f0fdf4', border: '#b8d5e8' },
  'Cukup Baik':   { text: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  'Rusak Ringan': { text: '#9c9486', bg: '#f6f4f0', border: '#e8e4d8' },
  'Rusak Berat':  { text: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  'Tidak Layak':  { text: '#7f1d1d', bg: '#fff1f2', border: '#fca5a5' },
};
const DEFAULT_ASSET_CATEGORIES: AssetCategory[] = ['Tanah', 'Bangunan', 'Kendaraan', 'Inventaris', 'Elektronik', 'Peralatan Ibadah', 'Lainnya'];
const CONDITIONS: AssetCondition[] = ['Baik', 'Cukup Baik', 'Rusak Ringan', 'Rusak Berat', 'Tidak Layak'];
const ACQ_METHODS: AcquisitionMethod[] = ['Pembelian', 'Donasi', 'Hibah', 'Pembangunan', 'Wakaf'];
const MAINT_TYPES: MaintenanceType[] = ['Perawatan Rutin', 'Perbaikan', 'Penggantian Komponen', 'Inspeksi'];
const MAINT_RESULTS: MaintenanceResult[] = ['Selesai', 'Dalam Proses', 'Perlu Tindak Lanjut'];
const RESULT_CFG: Record<MaintenanceResult, { text: string; bg: string }> = {
  'Selesai':             { text: '#1A77A3', bg: '#f0fdf4' },
  'Dalam Proses':        { text: '#9c9486', bg: '#f6f4f0' },
  'Perlu Tindak Lanjut': { text: '#dc2626', bg: '#fef2f2' },
};
const LOAN_STATUS_CFG: Record<AssetLoanStatus, { text: string; bg: string; border: string }> = {
  'Tersedia':          { text: '#1A77A3', bg: '#f0fdf4', border: '#b8d5e8' },
  'Dipinjam':          { text: '#9c9486', bg: '#f6f4f0', border: '#e8e4d8' },
  'Dalam Pemeliharaan':{ text: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
};
const LOAN_STATUSES: AssetLoanStatus[] = ['Tersedia', 'Dipinjam', 'Dalam Pemeliharaan'];
const PAGE_SIZE = 10;

// ── Icon helper ───────────────────────────────────────────────────────────────
function CatIcon({ cat }: { cat: AssetCategory }) {
  const props = { style: { width: 15, height: 15 } };
  switch (cat) {
    case 'Tanah':            return <MapPin {...props} />;
    case 'Bangunan':         return <Building2 {...props} />;
    case 'Kendaraan':        return <Truck {...props} />;
    case 'Inventaris':       return <Package {...props} />;
    case 'Elektronik':       return <Monitor {...props} />;
    case 'Peralatan Ibadah': return <Church {...props} />;
    default:                 return <Layers {...props} />;
  }
}

function CondBadge({ cond }: { cond: AssetCondition }) {
  const c = COND_CFG[cond];
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ color: c.text, background: c.bg, borderColor: c.border }}>
      {cond}
    </span>
  );
}

function LoanBadge({ status }: { status?: AssetLoanStatus }) {
  const s = status || 'Tersedia';
  const c = LOAN_STATUS_CFG[s];
  const icons: Record<AssetLoanStatus, string> = {
    'Tersedia': '✓', 'Dipinjam': '↗', 'Dalam Pemeliharaan': '🔧'
  };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ color: c.text, background: c.bg, borderColor: c.border }}>
      <span style={{ fontSize: 9 }}>{icons[s]}</span>{s}
    </span>
  );
}

// ── BLANK ASSET form state ────────────────────────────────────────────────────
const blankAsset = (): Omit<ChurchAsset,'id'|'assetCode'|'createdAt'|'updatedAt'> => ({
  name:'', category:'Elektronik', description:'', location:'',
  condition:'Baik', acquisitionDate: new Date().toISOString().slice(0,10),
  acquisitionValue:0, acquisitionMethod:'Pembelian', usefulLifeYears:5,
  responsiblePerson:'', memberId:'', ministryUnit:'', serialNumber:'', vendor:'', notes:'',
  photo:'', loanStatus:'Tersedia', borrowedById:'', borrowedByName:'',
  loanDate:'', expectedReturnDate:'', loanNotes:''
});

// ── Donut center overlay ──────────────────────────────────────────────────────
function DonutCenter({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ position:'absolute',top:0,left:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none' }}>
      <div style={{ textAlign:'center' }}>
        <p style={{ fontSize:9.5, color:'#94a3b8', fontWeight:500, marginBottom:1 }}>{label}</p>
        <p style={{ fontSize:11.5, fontWeight:800, color:'#0f172a', fontFamily:"'Plus Jakarta Sans',sans-serif", lineHeight:1 }}>{value}</p>
      </div>
    </div>
  );
}

// ── Resizable table column defaults ──────────────────────────────────────────
const DAFTAR_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  photo: 56, assetCode: 100, name: 220, category: 120, condition: 110,
  loanStatus: 140, acquisitionValue: 130, bookValue: 120, location: 150,
  responsiblePerson: 150, aksi: 110,
};
const PEMELIHARAAN_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  tanggal: 100, aset: 160, jenis: 130, deskripsi: 220, biaya: 110, teknisi: 140, hasil: 130,
};
const PENYUSUTAN_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  kode: 90, nama: 180, kategori: 110, tglPerolehan: 110, nilaiPerolehan: 120,
  masaManfaat: 110, rate: 80, penyusutanThn: 120, akumPenyusutan: 130, nilaiBuku: 120, sisaMasa: 100,
};
const LAPORAN_PERHATIAN_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  kode: 90, nama: 200, kategori: 130, kondisi: 110, nilaiBuku: 120, lokasi: 150, status: 160,
};
const LAPORAN_RIWAYAT_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  tanggal: 100, aset: 160, jenis: 130, deskripsi: 220, biaya: 110, teknisi: 140, hasil: 130,
};
const MODAL_KATEGORI_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  kode: 90, nama: 200, kondisi: 110, tglPerolehan: 110, nilaiPerolehan: 130,
  penyusutanThn: 120, nilaiBuku: 120, lokasi: 150,
};
const MODAL_KONDISI_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  kode: 90, nama: 200, kategori: 120, tglPerolehan: 110, nilaiPerolehan: 130,
  nilaiBuku: 120, penanggungjawab: 150, lokasi: 150,
};

// ── Main Component ─────────────────────────────────────────────────────────────
export function AssetManagement() {
  const {
    members, ministries, addFinancialRecord, currentUser, can,
    churchAssets: assets, assetMaintenances: maintenances, assetLoanHistories: loanHistories,
    addChurchAsset, updateChurchAsset, deleteChurchAsset,
    addAssetMaintenance, addAssetLoanHistory, updateAssetLoanHistory,
    getMasterDataByCategory,
  } = useApp();

  const kategoriAsetOpts = getMasterDataByCategory('kategori_aset').map(m => m.value) as AssetCategory[];
  const CATEGORIES = kategoriAsetOpts.length ? kategoriAsetOpts : DEFAULT_ASSET_CATEGORIES;

  const canCreate = can('assets', 'create');
  const canEdit   = can('assets', 'edit');
  const canDelete = can('assets', 'delete');

  const { offset: offsetLaporanKategori, onMouseDown: onMouseDownLaporanKategori } = useDraggable();
  const { offset: offsetLaporanKondisi, onMouseDown: onMouseDownLaporanKondisi } = useDraggable();
  const { offset: offsetLaporanAsset, onMouseDown: onMouseDownLaporanAsset } = useDraggable();
  const { offset: offsetLaporanMaint, onMouseDown: onMouseDownLaporanMaint } = useDraggable();
  const { offset: offsetAssetModal, onMouseDown: onMouseDownAssetModal } = useDraggable();
  const { offset: offsetDetailModal, onMouseDown: onMouseDownDetailModal } = useDraggable();
  const { offset: offsetMaintModal, onMouseDown: onMouseDownMaintModal } = useDraggable();
  const { offset: offsetDeleteConfirm, onMouseDown: onMouseDownDeleteConfirm } = useDraggable();

  // ── UI State ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState('ringkasan');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterCond, setFilterCond] = useState('');
  const [filterMinistry, setFilterMinistry] = useState('');
  const [filterLoan, setFilterLoan] = useState('');
  const [page, setPage] = useState(1);

  // Modal states
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showMaintModal, setShowMaintModal] = useState(false);
  const [editAsset, setEditAsset] = useState<ChurchAsset | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<ChurchAsset | null>(null);
  const [maintForAsset, setMaintForAsset] = useState<ChurchAsset | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string|null>(null);
  const [maintPage, setMaintPage] = useState(1);
  const [maintFilter, setMaintFilter] = useState('');

  // Dokumen pendukung: PDF dilampirkan ke aset ini (maks 2MB per file)
  const [assetDocs, setAssetDocs] = useState<AssetDocument[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const docFileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedAsset) { setAssetDocs([]); return; }
    api.get<AssetDocument[]>('/api/data/assetDocuments').then(all => {
      setAssetDocs((all || []).filter(d => d.assetId === selectedAsset.id));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAsset?.id]);
  const [laporanModal, setLaporanModal] = useState<
    | { type: 'kategori'; cat: string }
    | { type: 'kondisi'; cond: string }
    | { type: 'asset'; assetId: string }
    | { type: 'maintenance'; maintId: string }
    | null
  >(null);

  // Asset form state
  const [form, setForm] = useState(blankAsset());

  // Maintenance form
  const [maintForm, setMaintForm] = useState<Omit<MaintenanceRecord,'id'|'assetId'>>({
    date: new Date().toISOString().slice(0,10), type:'Perawatan Rutin',
    description:'', cost:0, technician:'', result:'Selesai', notes:''
  });

  // ── Derived / computed ────────────────────────────────────────────────────
  const totalAcqValue = useMemo(() => assets.reduce((s,a) => s + a.acquisitionValue, 0), [assets]);
  const totalBookValue = useMemo(() => assets.reduce((s,a) => s + calcDep(a).bookValue, 0), [assets]);
  const totalAnnualDep = useMemo(() => assets.reduce((s,a) => s + calcDep(a).annual, 0), [assets]);
  const assetsNeedingAttn = useMemo(() =>
    assets.filter(a => a.condition === 'Rusak Ringan' || a.condition === 'Rusak Berat' || a.condition === 'Tidak Layak' ||
      maintenances.filter(m => m.assetId === a.id && m.result === 'Perlu Tindak Lanjut').length > 0 ||
      maintenances.filter(m => m.assetId === a.id && m.result === 'Dalam Proses').length > 0), [assets, maintenances]);

  const loanedAssets = useMemo(() => assets.filter(a => (a.loanStatus||'Tersedia') === 'Dipinjam'), [assets]);
  const overdueAssets = useMemo(() => assets.filter(a => isOverdue(a)), [assets]);

  const catSummary = useMemo(() => {
    const map: Record<string,{ count:number; value:number; bookValue:number }> = {};
    assets.forEach(a => {
      if (!map[a.category]) map[a.category] = { count:0, value:0, bookValue:0 };
      map[a.category].count += 1;
      map[a.category].value += a.acquisitionValue;
      map[a.category].bookValue += calcDep(a).bookValue;
    });
    return Object.entries(map).sort((x,y) => y[1].value - x[1].value);
  }, [assets]);

  const condSummary = useMemo(() => {
    const map: Record<string,number> = {};
    assets.forEach(a => { map[a.condition] = (map[a.condition]||0) + 1; });
    return CONDITIONS.filter(c => map[c]).map(c => ({ name:c, value:map[c]||0 }));
  }, [assets]);

  const filteredAssets = useMemo(() => {
    let r = assets;
    if (search) r = r.filter(a => a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.assetCode.toLowerCase().includes(search.toLowerCase()) || a.location.toLowerCase().includes(search.toLowerCase()));
    if (filterCat) r = r.filter(a => a.category === filterCat);
    if (filterCond) r = r.filter(a => a.condition === filterCond);
    if (filterMinistry) r = r.filter(a => a.ministryUnit === filterMinistry);
    if (filterLoan) r = r.filter(a => (a.loanStatus || 'Tersedia') === filterLoan);
    return r;
  }, [assets, search, filterCat, filterCond, filterMinistry, filterLoan]);

  const { sorted: sortedAssets, sortKey: aSortKey, sortDir: aSortDir, requestSort: aRequestSort } = useSortable(filteredAssets);

  const { widths: daftarColW, startResize: daftarStartResize } = useResizableColumns('asset-management-daftar', DAFTAR_TABLE_DEFAULT_WIDTHS);
  const { widths: pemeliharaanColW, startResize: pemeliharaanStartResize } = useResizableColumns('asset-management-pemeliharaan', PEMELIHARAAN_TABLE_DEFAULT_WIDTHS);
  const { widths: penyusutanColW, startResize: penyusutanStartResize } = useResizableColumns('asset-management-penyusutan', PENYUSUTAN_TABLE_DEFAULT_WIDTHS);
  const { widths: laporanPerhatianColW, startResize: laporanPerhatianStartResize } = useResizableColumns('asset-management-laporan-perhatian', LAPORAN_PERHATIAN_TABLE_DEFAULT_WIDTHS);
  const { widths: laporanRiwayatColW, startResize: laporanRiwayatStartResize } = useResizableColumns('asset-management-laporan-riwayat', LAPORAN_RIWAYAT_TABLE_DEFAULT_WIDTHS);
  const { widths: modalKategoriColW, startResize: modalKategoriStartResize } = useResizableColumns('asset-management-modal-kategori', MODAL_KATEGORI_TABLE_DEFAULT_WIDTHS);
  const { widths: modalKondisiColW, startResize: modalKondisiStartResize } = useResizableColumns('asset-management-modal-kondisi', MODAL_KONDISI_TABLE_DEFAULT_WIDTHS);

  const totalPages = Math.ceil(sortedAssets.length / PAGE_SIZE);
  const pagedAssets = sortedAssets.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  const filteredMaints = useMemo(() => {
    let r = maintenances;
    if (maintFilter) r = r.filter(m => m.assetId === maintFilter);
    return r.sort((a,b) => b.date.localeCompare(a.date));
  }, [maintenances, maintFilter]);
  const maintTotalPages = Math.ceil(filteredMaints.length / PAGE_SIZE);
  const pagedMaints = filteredMaints.slice((maintPage-1)*PAGE_SIZE, maintPage*PAGE_SIZE);

  const ministryUnits = useMemo(() => {
    const units = new Set(assets.map(a => a.ministryUnit).filter(Boolean) as string[]);
    ministries.forEach(m => units.add(m.name));
    return Array.from(units).sort();
  }, [assets, ministries]);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const nextCode = () => {
    const nums = assets.map(a => parseInt(a.assetCode.replace('AST-',''))).filter(n => !isNaN(n));
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return `AST-${String(max + 1).padStart(3,'0')}`;
  };

  const openAdd = () => {
    setEditAsset(null);
    setForm(blankAsset());
    setShowAssetModal(true);
  };

  const openEdit = (a: ChurchAsset) => {
    setEditAsset(a);
    setForm({ name:a.name, category:a.category, description:a.description||'', location:a.location,
      condition:a.condition, acquisitionDate:a.acquisitionDate, acquisitionValue:a.acquisitionValue,
      acquisitionMethod:a.acquisitionMethod, usefulLifeYears:a.usefulLifeYears,
      responsiblePerson:a.responsiblePerson||'', memberId:a.memberId||'',
      ministryUnit:a.ministryUnit||'',
      serialNumber:a.serialNumber||'', vendor:a.vendor||'', notes:a.notes||'',
      photo:a.photo||'', loanStatus:a.loanStatus||'Tersedia',
      borrowedById:a.borrowedById||'', borrowedByName:a.borrowedByName||'',
      loanDate:a.loanDate||'', expectedReturnDate:a.expectedReturnDate||'', loanNotes:a.loanNotes||''
    });
    setShowAssetModal(true);
  };

  const saveAsset = () => {
    if (!form.name.trim()) return;
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    if (editAsset) {
      const prevStatus = editAsset.loanStatus || 'Tersedia';
      const newStatus  = form.loanStatus   || 'Tersedia';
      const borrowerChanged = form.borrowedById !== (editAsset.borrowedById || '') ||
                              form.borrowedByName !== (editAsset.borrowedByName || '');

      // Close previous active loan record when returning the asset
      if (prevStatus === 'Dipinjam' && (newStatus !== 'Dipinjam' || borrowerChanged)) {
        loanHistories
          .filter(h => h.assetId === editAsset.id && h.status === 'Aktif')
          .forEach(h => updateAssetLoanHistory(h.id, {
            actualReturnDate: today,
            status: isOverdue(editAsset) ? 'Terlambat' : 'Dikembalikan',
          }));
      }
      // Open new loan record when lending the asset
      if (newStatus === 'Dipinjam' && (prevStatus !== 'Dipinjam' || borrowerChanged)) {
        addAssetLoanHistory({
          assetId: editAsset.id, assetName: form.name, assetCode: editAsset.assetCode,
          borrowedById: form.borrowedById || '', borrowedByName: form.borrowedByName || '',
          loanDate: form.loanDate || today, expectedReturnDate: form.expectedReturnDate || '',
          loanNotes: form.loanNotes || '', status: 'Aktif',
        });
      }
      updateChurchAsset(editAsset.id, { ...form });
    } else {
      const assetCode = nextCode();
      const newAsset = addChurchAsset({ ...form, assetCode });
      // Record initial loan if asset is being added already-loaned
      if ((form.loanStatus || 'Tersedia') === 'Dipinjam' && form.borrowedByName) {
        addAssetLoanHistory({
          assetId: newAsset.id, assetName: form.name, assetCode,
          borrowedById: form.borrowedById || '', borrowedByName: form.borrowedByName,
          loanDate: form.loanDate || today, expectedReturnDate: form.expectedReturnDate || '',
          loanNotes: form.loanNotes || '', status: 'Aktif',
        });
      }
      // Integration: Auto-record purchase to financial records
      if (form.acquisitionMethod === 'Pembelian' && form.acquisitionValue > 0) {
        try {
          addFinancialRecord({
            date: form.acquisitionDate, type:'expense',
            category:'Pemeliharaan Aset',
            amount: form.acquisitionValue,
            description: `Pengadaan Aset: ${form.name} (${assetCode})`,
            reference: assetCode,
            recordedBy: currentUser?.name || 'Sistem',
            recordedById: currentUser?.id || 'sys',
          });
        } catch (_e) {}
      }
    }
    setShowAssetModal(false);
  };

  const deleteAsset = (id: string) => {
    deleteChurchAsset(id);
    setDeleteConfirmId(null);
  };

  const openMaint = (asset: ChurchAsset) => {
    setMaintForAsset(asset);
    setMaintForm({ date:new Date().toISOString().slice(0,10), type:'Perawatan Rutin', description:'', cost:0, technician:'', result:'Selesai', notes:'' });
    setShowMaintModal(true);
  };

  const saveMaintenance = () => {
    if (!maintForAsset || !maintForm.description.trim()) return;
    addAssetMaintenance({ ...maintForm, assetId: maintForAsset.id });
    if (maintForm.result === 'Selesai') {
      updateChurchAsset(maintForAsset.id, { updatedAt: new Date().toISOString() });
    }
    setShowMaintModal(false);
  };

  const getAssetMaints = (assetId: string) =>
    maintenances.filter(m => m.assetId === assetId).sort((a,b) => b.date.localeCompare(a.date));

  const getAssetLoanHistory = (assetId: string) =>
    loanHistories.filter(h => h.assetId === assetId).sort((a,b) => b.loanDate.localeCompare(a.loanDate));

  const handleUploadDocClick = () => docFileInputRef.current?.click();

  const handleDocFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedAsset) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      toast.error('Hanya file PDF yang diperbolehkan');
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      toast.error(`Ukuran file melebihi batas 2MB (file ini ${formatBytes(file.size)})`);
      return;
    }
    setUploadingDoc(true);
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('Gagal membaca file'));
        reader.readAsDataURL(file);
      });
      const id = 'assetdoc' + Date.now();
      const doc: AssetDocument = {
        id, assetId: selectedAsset.id, fileName: file.name, fileSize: file.size,
        mimeType: 'application/pdf', fileData: base64,
        uploadedAt: new Date().toISOString(), uploadedBy: currentUser?.name || 'Administrator',
      };
      await api.put(`/api/data/assetDocuments/${id}`, doc);
      setAssetDocs(prev => [doc, ...prev]);
      toast.success(`Dokumen "${file.name}" berhasil diunggah`);
    } catch (err) {
      toast.error('Gagal mengunggah dokumen. Silakan coba lagi');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleViewDocument = (doc: AssetDocument) => {
    try {
      const byteChars = atob(doc.fileData);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error('Gagal membuka dokumen');
    }
  };

  const handleDeleteDocument = async (doc: AssetDocument) => {
    if (!window.confirm(`Hapus dokumen "${doc.fileName}"?`)) return;
    try {
      await api.delete(`/api/data/assetDocuments/${doc.id}`);
      setAssetDocs(prev => prev.filter(d => d.id !== doc.id));
      toast.success(`Dokumen "${doc.fileName}" dihapus`);
    } catch {
      toast.error('Gagal menghapus dokumen');
    }
  };

  // ── EXPORT ────────────────────────────────────────────────────────────────
  const exportPDF = () => {
    const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
    doc.setFontSize(14);
    doc.setFont('helvetica','bold');
    doc.text('GPIB TRINITAS – DAFTAR ASET GEREJA', 14, 14);
    doc.setFontSize(9);
    doc.setFont('helvetica','normal');
    doc.text(`Dicetak: ${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})} | Total: ${assets.length} aset | Nilai Buku: ${compactRp(totalBookValue)}`, 14, 21);
    autoTable(doc, {
      startY: 26,
      head: [['Kode','Nama Aset','Kategori','Kondisi','Nilai Perolehan','Nilai Buku','Lokasi','Penanggungjawab']],
      body: assets.map(a => {
        const dep = calcDep(a);
        return [a.assetCode, a.name, a.category, a.condition,
          formatRp(a.acquisitionValue), formatRp(dep.bookValue), a.location, a.responsiblePerson||'-'];
      }),
      styles:{ fontSize:7.5 },
      headStyles:{ fillColor:[5,150,105], textColor:255, fontStyle:'bold', fontSize:8 },
      alternateRowStyles:{ fillColor:[248,250,252] },
      columnStyles:{ 0:{cellWidth:18}, 1:{cellWidth:48}, 2:{cellWidth:22}, 3:{cellWidth:22}, 4:{cellWidth:28}, 5:{cellWidth:28} },
    });
    doc.save(`Daftar-Aset-GPIB-${new Date().toLocaleDateString('id-ID').replace(/\//g,'-')}.pdf`);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const asetData = [
      ['Kode Aset','Nama Aset','Kategori','Kondisi','Status Posisi','Peminjam','Tgl Pinjam','Est. Kembali','Metode Perolehan','Tanggal Perolehan','Nilai Perolehan','Masa Manfaat (Thn)','Penyusutan/Thn','Akum. Penyusutan','Nilai Buku','Lokasi','Penanggungjawab','Unit Pelayanan','No. Seri','Vendor'],
      ...assets.map(a => {
        const d = calcDep(a);
        return [a.assetCode,a.name,a.category,a.condition,a.loanStatus||'Tersedia',a.borrowedByName||'-',a.loanDate||'-',a.expectedReturnDate||'-',a.acquisitionMethod,a.acquisitionDate,a.acquisitionValue,a.usefulLifeYears,d.annual,d.accumulated,d.bookValue,a.location,a.responsiblePerson||'-',a.ministryUnit||'-',a.serialNumber||'-',a.vendor||'-'];
      })
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(asetData), 'Daftar Aset');
    const maintData = [
      ['Kode Aset','Nama Aset','Tanggal','Jenis','Deskripsi','Biaya','Teknisi','Hasil','Catatan'],
      ...maintenances.map(m => {
        const a = assets.find(x => x.id === m.assetId);
        return [a?.assetCode||'-',a?.name||'-',m.date,m.type,m.description,m.cost,m.technician,m.result,m.notes||''];
      })
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(maintData), 'Pemeliharaan');
    XLSX.writeFile(wb, `Aset-GPIB-${new Date().toLocaleDateString('id-ID').replace(/\//g,'-')}.xlsx`);
  };

  // ── TAB: Ringkasan ────────────────────────────────────────────────────────
  // Embed fill into data so <Cell> children are not needed (avoids Recharts duplicate-key warning)
  const catColors = catSummary.map(([cat]) => CAT_COLOR[cat as AssetCategory] || '#64748b');
  const pieData = catSummary.map(([cat, d], i) => ({ name: cat, value: d.bookValue, fill: catColors[i] }));
  const condData = condSummary.map(c => ({ ...c, fill: COND_CFG[c.name as AssetCondition]?.text || '#64748b' }));
  const maxCondVal = Math.max(...condData.map(d => d.value), 1);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0];
    return (
      <div className="rounded-xl shadow-xl px-3 py-2 border bg-white" style={{ borderColor:'#e2e8f0' }}>
        <p style={{ fontSize:12,fontWeight:700,color:'#0f172a' }}>{item.name}</p>
        <p style={{ fontSize:12,fontWeight:800,color:item.payload.fill }}>{compactRp(item.value)}</p>
        <p style={{ fontSize:10.5,color:'#64748b' }}>Nilai Buku</p>
      </div>
    );
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  const TABS = [
    { id:'ringkasan',   label:'Ringkasan', icon:BarChart3 },
    { id:'daftar',      label:'Daftar Aset', icon:Package },
    { id:'pemeliharaan',label:'Pemeliharaan', icon:Wrench },
    { id:'laporan',     label:'Laporan', icon:FileText },
  ];

  return (
    <div className="min-h-screen" style={{ background:'#f8fafc' }}>
      {/* Header */}
      <div className="sticky top-0 z-30 border-b" style={{ background:'white', borderColor:'#e2e8f0' }}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 style={{ fontSize:17,fontWeight:800,color:'#0f172a',fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Manajemen Aset Gereja</h1>
              <p style={{ fontSize:12,color:'#64748b',marginTop:1 }}>{assets.length} aset terdaftar · Nilai Buku {compactRp(totalBookValue)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={exportPDF} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all hover:opacity-80"
                style={{ borderColor:'#e2e8f0', color:'#dc2626', background:'#fef2f2' }}>
                <FileText style={{ width:13,height:13 }} /> PDF
              </button>
              <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all hover:opacity-80"
                style={{ borderColor:'#e2e8f0', color:'#1A77A3', background:'#f0fdf4' }}>
                <FileSpreadsheet style={{ width:13,height:13 }} /> Excel
              </button>
              {canCreate && (
                <button onClick={openAdd} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90"
                  style={{ background:'#1A77A3' }}>
                  <Plus style={{ width:14,height:14 }} /> Tambah Aset
                </button>
              )}
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-1">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: active ? '#1A77A3' : 'transparent', color: active ? '#f0ede5' : '#64748b',
                    fontWeight: active ? 700 : 500 }}>
                  <Icon style={{ width:13,height:13 }} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-3">
        {/* ── TAB: RINGKASAN ── */}
        {tab === 'ringkasan' && (
          <div className="space-y-4">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {[
                { label:'Total Aset', value:assets.length+' unit', sub:'Terdaftar aktif', color:'#2563eb', bg:'#eff6ff', icon:Package, overdueMark:false },
                { label:'Nilai Perolehan', value:compactRp(totalAcqValue), sub:'Total investasi aset', color:'#1A77A3', bg:'#f0fdf4', icon:DollarSign, overdueMark:false },
                { label:'Total Nilai Buku', value:compactRp(totalBookValue), sub:'Setelah penyusutan', color:'#7c3aed', bg:'#f5f3ff', icon:TrendingDown, overdueMark:false },
                { label:'Dipinjam Jemaat', value:loanedAssets.length+' aset', sub:'Sedang di luar gereja', color:'#9c9486', bg:'#f6f4f0', icon:Users, overdueMark:false },
                { label:'Jatuh Tempo', value:overdueAssets.length+' aset', sub:'Melebihi batas kembali', color:'#dc2626', bg:'#fef2f2', icon:AlertTriangle, overdueMark: overdueAssets.length > 0 },
                { label:'Perlu Perhatian', value:assetsNeedingAttn.length+' aset', sub:'Rusak / dalam proses', color:'#b45309', bg:'#fff7ed', icon:AlertCircle, overdueMark:false },
              ].map((k,i) => {
                const Icon = k.icon;
                return (
                  <div key={i} className="rounded-2xl border p-4 bg-white relative overflow-hidden" style={{ borderColor: k.overdueMark ? '#fca5a5' : '#e2e8f0' }}>
                    {k.overdueMark && <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background:'#dc2626' }} />}
                    <div className="flex items-start justify-between mb-2">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:k.bg }}>
                        <Icon style={{ width:18,height:18,color:k.color }} />
                      </div>
                    </div>
                    <p style={{ fontSize:19,fontWeight:800,color: k.overdueMark ? '#dc2626' : '#0f172a',fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{k.value}</p>
                    <p style={{ fontSize:11.5,fontWeight:600,color:'#4b5563',marginTop:1 }}>{k.label}</p>
                    <p style={{ fontSize:10.5,color:'#94a3b8',marginTop:1 }}>{k.sub}</p>
                  </div>
                );
              })}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Donut – Nilai per Kategori */}
              <div className="rounded-2xl border bg-white p-5" style={{ borderColor:'#e2e8f0' }}>
                <h3 style={{ fontSize:14,fontWeight:600,color:'#0f172a',marginBottom:14 }}>Nilai Buku per Kategori</h3>
                <div style={{ height:180, position:'relative' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={74} paddingAngle={2} dataKey="value" stroke="none" isAnimationActive={false} />
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <DonutCenter value={compactRp(totalBookValue)} label="Nilai Buku" />
                </div>
                <div className="space-y-1.5 mt-2">
                  {catSummary.map(([cat, d], i) => (
                    <div key={cat} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: catColors[i] }} />
                      <span data-tooltip={`${cat} (${d.count})`} data-tooltip-truncate className="flex-1 truncate" style={{ fontSize:11.5,color:'#4b5563' }}>{cat} ({d.count})</span>
                      <span style={{ fontSize:11,color:'#94a3b8',flexShrink:0 }}>{compactRp(d.bookValue)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bar – Kondisi Aset (CSS pure, no Recharts) */}
              <div className="rounded-2xl border bg-white p-5" style={{ borderColor:'#e2e8f0' }}>
                <h3 style={{ fontSize:14,fontWeight:600,color:'#0f172a',marginBottom:14 }}>Sebaran Kondisi Aset</h3>
                <div style={{ height:180, display:'flex', alignItems:'flex-end', gap:6, paddingBottom:28, position:'relative' }}>
                  {/* horizontal grid lines */}
                  {[25,50,75,100].map(pct => (
                    <div key={pct} style={{ position:'absolute', left:0, right:0, bottom:`calc(28px + ${pct}% * (180px - 28px) / 100)`,
                      borderTop:'1px dashed #f1f5f9', pointerEvents:'none' }} />
                  ))}
                  {condData.map(c => {
                    const barPct = (c.value / maxCondVal) * 100;
                    return (
                      <div key={c.name} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
                        height:'100%', justifyContent:'flex-end', position:'relative', zIndex:1 }}>
                        <div style={{ fontSize:10,fontWeight:700,color:c.fill,marginBottom:2,lineHeight:1 }}>{c.value}</div>
                        <div style={{ width:'70%', maxWidth:36,
                          height:`${Math.max(barPct, 4)}%`,
                          background:c.fill,
                          borderRadius:'5px 5px 0 0',
                          transition:'height 0.4s ease',
                          opacity:0.9
                        }} />
                        <div style={{ position:'absolute', bottom:0, fontSize:8.5, color:'#64748b',
                          textAlign:'center', lineHeight:1.2, width:'100%', paddingTop:4 }}>
                          {c.name.split(' ').map((word, wi) => (
                            <span key={wi} style={{ display:'block' }}>{word}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {condSummary.map(c => (
                    <div key={c.name} className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                      style={{ background: COND_CFG[c.name as AssetCondition]?.bg }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: COND_CFG[c.name as AssetCondition]?.text }} />
                      <span style={{ fontSize:10.5,color:COND_CFG[c.name as AssetCondition]?.text,fontWeight:600 }}>{c.name}: {c.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Aset Sedang Dipinjam */}
            {loanedAssets.length > 0 && (
              <div className="rounded-2xl border bg-white p-5" style={{ borderColor:'#e8e4d8' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Users style={{ width:17,height:17,color:'#9c9486' }} />
                  <h3 style={{ fontSize:14,fontWeight:600,color:'#0f172a' }}>Aset Sedang Dipinjam Jemaat</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background:'#f6f4f0',color:'#9c9486',border:'1px solid #e8e4d8' }}>{loanedAssets.length}</span>
                </div>
                <div className="space-y-2">
                  {loanedAssets.map(a => {
                    const od = isOverdue(a);
                    return (
                    <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border relative overflow-hidden"
                      style={{ borderColor: od ? '#fca5a5' : '#e8e4d8', background: od ? '#fff5f5' : '#f6f4f0' }}>
                      {od && <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background:'#dc2626' }} />}
                      {a.photo ? (
                        <img src={a.photo} alt={a.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border"
                          style={{ borderColor: od ? '#fca5a5' : '#e8e4d8' }}
                          onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                      ) : (
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:CAT_BG[a.category] }}>
                          <span style={{ color:CAT_COLOR[a.category] }}><CatIcon cat={a.category} /></span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p data-tooltip={`${a.assetCode} · ${a.name}`} data-tooltip-truncate className="truncate" style={{ fontSize:12.5,fontWeight:600,color:'#0f172a' }}>{a.assetCode} · {a.name}</p>
                          {od && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold flex-shrink-0"
                              style={{ background:'#dc2626',color:'white' }}>
                              <AlertTriangle style={{ width:8,height:8 }} /> Jatuh Tempo
                            </span>
                          )}
                        </div>
                        <div className="flex gap-3 flex-wrap">
                          {a.borrowedByName && <p style={{ fontSize:11,color: od ? '#dc2626' : '#9c9486' }}>→ {a.borrowedByName}</p>}
                          {a.loanDate && <p style={{ fontSize:11,color:'#78350f' }}>Pinjam: {fmtDateShort(a.loanDate)}</p>}
                          {a.expectedReturnDate && <p style={{ fontSize:11,color: od ? '#dc2626' : '#78350f',fontWeight: od ? 700 : 400 }}>
                            {od ? '⚠ Batas' : 'Kembali'}: {fmtDateShort(a.expectedReturnDate)}
                          </p>}
                        </div>
                        {a.loanNotes && <p style={{ fontSize:10.5,color:'#144f6b',fontStyle:'italic' }}>{a.loanNotes}</p>}
                      </div>
                      <div className="flex-shrink-0">
                        <CondBadge cond={a.condition} />
                        <button onClick={() => { setSelectedAsset(a); setShowDetailModal(true); }}
                          className="mt-1 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-80"
                          style={{ background: od ? '#dc2626' : '#9c9486',color:'white' }}>
                          <Eye style={{ width:10,height:10 }} /> Detail
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Aset Perlu Perhatian */}
            {assetsNeedingAttn.length > 0 && (
              <div className="rounded-2xl border bg-white p-5" style={{ borderColor:'#e2e8f0' }}>
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle style={{ width:17,height:17,color:'#dc2626' }} />
                  <h3 style={{ fontSize:14,fontWeight:600,color:'#0f172a' }}>Aset Memerlukan Perhatian</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background:'#fef2f2',color:'#dc2626' }}>{assetsNeedingAttn.length}</span>
                </div>
                <div className="space-y-2.5">
                  {assetsNeedingAttn.map(a => {
                    const pending = maintenances.filter(m => m.assetId === a.id && (m.result === 'Perlu Tindak Lanjut' || m.result === 'Dalam Proses'));
                    return (
                      <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border"
                        style={{ borderColor: COND_CFG[a.condition].border, background: COND_CFG[a.condition].bg }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: CAT_BG[a.category] }}>
                          <span style={{ color: CAT_COLOR[a.category] }}><CatIcon cat={a.category} /></span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p data-tooltip={`${a.assetCode} · ${a.name}`} data-tooltip-truncate className="truncate" style={{ fontSize:12.5,fontWeight:600,color:'#0f172a' }}>{a.assetCode} · {a.name}</p>
                          <p style={{ fontSize:11,color:'#64748b' }}>{a.location}</p>
                          {pending.length > 0 && (
                            <p style={{ fontSize:10.5,color:'#dc2626',marginTop:1 }}>⚠ {pending[0].description.slice(0,60)}...</p>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <CondBadge cond={a.condition} />
                          <button onClick={() => openMaint(a)} className="mt-1.5 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-80"
                            style={{ background:'#1A77A3',color:'white' }}>
                            <Wrench style={{ width:10,height:10 }} /> Catat
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ringkasan per Kategori */}
            <div className="rounded-2xl border bg-white p-5" style={{ borderColor:'#e2e8f0' }}>
              <h3 style={{ fontSize:14,fontWeight:600,color:'#0f172a',marginBottom:14 }}>Ringkasan Nilai per Kategori</h3>
              <div className="overflow-x-auto">
                <table style={{ width:'100%', fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:'2px solid #f1f5f9' }}>
                      {['Kategori','Jml Aset','Nilai Perolehan','Total Penyusutan','Nilai Buku'].map(h => (
                        <th key={h} style={{ textAlign:'left',paddingBottom:8,paddingRight:12,fontSize:11,fontWeight:700,color:'#144f6b',whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {catSummary.map(([cat,d]) => (
                      <tr key={cat} style={{ borderBottom:'1px solid #f8fafc' }}>
                        <td style={{ padding:'8px 12px 8px 0' }}>
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background:CAT_BG[cat as AssetCategory] }}>
                              <span style={{ color:CAT_COLOR[cat as AssetCategory] }}><CatIcon cat={cat as AssetCategory} /></span>
                            </div>
                            <span style={{ fontWeight:600,color:'#4b5563' }}>{cat}</span>
                          </div>
                        </td>
                        <td style={{ paddingRight:12 }}><span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background:CAT_BG[cat as AssetCategory],color:CAT_COLOR[cat as AssetCategory] }}>{d.count}</span></td>
                        <td style={{ paddingRight:12,color:'#4b5563',fontWeight:600 }}>{compactRp(d.value)}</td>
                        <td style={{ paddingRight:12,color:'#dc2626' }}>{compactRp(d.value - d.bookValue)}</td>
                        <td style={{ fontWeight:700,color:'#1A77A3' }}>{compactRp(d.bookValue)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop:'2px solid #f1f5f9', background:'#f8fafc' }}>
                      <td style={{ padding:'8px 12px 8px 0',fontWeight:800,color:'#1e293b',fontSize:12.5 }}>TOTAL</td>
                      <td style={{ paddingRight:12,fontWeight:800,color:'#1e293b' }}>{assets.length}</td>
                      <td style={{ paddingRight:12,fontWeight:800,color:'#1e293b' }}>{compactRp(totalAcqValue)}</td>
                      <td style={{ paddingRight:12,fontWeight:800,color:'#dc2626' }}>{compactRp(totalAcqValue - totalBookValue)}</td>
                      <td style={{ fontWeight:800,color:'#1A77A3' }}>{compactRp(totalBookValue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: DAFTAR ASET ── */}
        {tab === 'daftar' && (
          <div className="space-y-4">
            {/* Filter bar */}
            <div className="rounded-2xl border bg-white overflow-hidden" style={{borderColor:'#e2e8f0',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
              <div className="flex items-center gap-3 p-3 border-b" style={{borderColor:'#f1f5f9'}}>
                <div className="relative flex-1">
                  <Search style={{width:14,height:14,color:'#94a3b8',position:'absolute',left:10,top:'50%',transform:'translateY(-50%)'}}/>
                  <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Cari nama, kode, lokasi aset..."
                    className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border focus:outline-none transition-all"
                    style={{borderColor:search?'#1A77A3':'#e2e8f0',background:'#fafafa',fontSize:13}}/>
                  {search && <button onClick={()=>{setSearch('');setPage(1);}} data-tooltip="Hapus pencarian" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-gray-200 transition-all" style={{color:'#94a3b8'}}><X style={{width:14,height:14}}/></button>}
                </div>
              </div>
              <div className="p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'0.08em',color:'#b0bec5',textTransform:'uppercase',minWidth:'68px'}}>Aset</span>
                  {([
                    {val:filterCat,set:(v:string)=>{setFilterCat(v);setPage(1);},opts:[{v:'',l:'Semua Kategori'},...CATEGORIES.map(c=>({v:c,l:c}))]},
                    {val:filterCond,set:(v:string)=>{setFilterCond(v);setPage(1);},opts:[{v:'',l:'Semua Kondisi'},...CONDITIONS.map(c=>({v:c,l:c}))]},
                    {val:filterMinistry,set:(v:string)=>{setFilterMinistry(v);setPage(1);},opts:[{v:'',l:'Semua Unit Pelayanan'},...ministryUnits.map(m=>({v:m,l:m}))]},
                    {val:filterLoan,set:(v:string)=>{setFilterLoan(v);setPage(1);},opts:[{v:'',l:'Semua Posisi Aset'},...LOAN_STATUSES.map(s=>({v:s,l:s}))]},
                  ] as {val:string;set:(v:string)=>void;opts:{v:string;l:string}[]}[]).map((f,i)=>{
                    const active=f.val!=='';
                    return <select key={i} value={f.val} onChange={e=>f.set(e.target.value)} className="px-2.5 py-1 text-sm rounded-full border focus:outline-none transition-all cursor-pointer" style={{borderColor:active?'#1A77A3':'#e2e8f0',background:active?'#f0f7fb':'#fafafa',color:active?'#1A77A3':'#64748b',fontWeight:active?600:400,fontSize:12}}>{f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>;
                  })}
                </div>
              </div>
              {(search||filterCat||filterCond||filterMinistry||filterLoan) ? (
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
                  <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,whiteSpace:'nowrap'}}>Filter aktif:</span>
                  {search && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}><Search style={{width:10,height:10}}/>"{search.length>15?search.slice(0,15)+'…':search}"<button onClick={()=>{setSearch('');setPage(1);}} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X style={{width:10,height:10}}/></button></span>}
                  {filterCat && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>{filterCat}<button onClick={()=>{setFilterCat('');setPage(1);}} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X style={{width:10,height:10}}/></button></span>}
                  {filterCond && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>{filterCond}<button onClick={()=>{setFilterCond('');setPage(1);}} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X style={{width:10,height:10}}/></button></span>}
                  {filterMinistry && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>{filterMinistry.length>12?filterMinistry.slice(0,12)+'…':filterMinistry}<button onClick={()=>{setFilterMinistry('');setPage(1);}} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X style={{width:10,height:10}}/></button></span>}
                  {filterLoan && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>{filterLoan}<button onClick={()=>{setFilterLoan('');setPage(1);}} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X style={{width:10,height:10}}/></button></span>}
                  <button onClick={()=>{setSearch('');setFilterCat('');setFilterCond('');setFilterMinistry('');setFilterLoan('');setPage(1);}} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all hover:bg-red-50" style={{borderColor:'#fca5a5',color:'#ef4444'}}><X style={{width:10,height:10}}/>Reset Semua</button>
                  <span className="ml-auto text-xs font-semibold" style={{color:'#1A77A3'}}>{filteredAssets.length} aset ditemukan</span>
                </div>
              ) : (
                <div className="px-3 pb-2 flex justify-end"><span style={{fontSize:'12px',color:'#94a3b8',fontWeight:500}}>{filteredAssets.length} aset total</span></div>
              )}
            </div>

            {/* Overdue warning banner */}
            {overdueAssets.length > 0 && (
              <div className="rounded-xl p-3 flex items-center gap-3" style={{ background:'#fef2f2',border:'1px solid #fca5a5' }}>
                <AlertTriangle style={{ width:16,height:16,color:'#dc2626',flexShrink:0 }} />
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize:12,fontWeight:700,color:'#dc2626' }}>
                    {overdueAssets.length} aset melebihi batas tanggal pengembalian!
                  </p>
                  <p data-tooltip={overdueAssets.map(a => `${a.assetCode} (${a.borrowedByName||'—'})`).join(' · ')} data-tooltip-truncate className="truncate" style={{ fontSize:11,color:'#b91c1c' }}>
                    {overdueAssets.map(a => `${a.assetCode} (${a.borrowedByName||'—'})`).join(' · ')}
                  </p>
                </div>
                <button onClick={() => setFilterLoan('Dipinjam')}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-80"
                  style={{ background:'#dc2626' }}>
                  Lihat
                </button>
              </div>
            )}

            {/* Table */}
            <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor:'#e2e8f0' }}>
              <div className="overflow-x-auto">
                <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse', tableLayout:'fixed' }}>
                  <thead>
                    <tr style={{ background:'#f8fafc', borderBottom:'2px solid #f1f5f9' }}>
                      <th style={{ padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'#144f6b',whiteSpace:'nowrap',width:daftarColW.photo,position:'relative' }}>
                        <ColResizeHandle onMouseDown={daftarStartResize('photo')} />
                      </th>
                      <th style={{ padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'#144f6b',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none',width:daftarColW.assetCode,position:'relative' }} onClick={() => aRequestSort('assetCode' as keyof ChurchAsset)}>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          Kode
                          {aSortKey === 'assetCode'
                            ? (aSortDir === 'asc' ? <ArrowUp style={{width:10,height:10,color:'#144f6b'}} /> : <ArrowDown style={{width:10,height:10,color:'#144f6b'}} />)
                            : <ArrowUpDown style={{width:10,height:10,color:'#1A77A3',opacity:0.5}} />}
                        </div>
                        <ColResizeHandle onMouseDown={daftarStartResize('assetCode')} />
                      </th>
                      <th style={{ padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'#144f6b',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none',width:daftarColW.name,position:'relative' }} onClick={() => aRequestSort('name' as keyof ChurchAsset)}>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          Nama Aset
                          {aSortKey === 'name'
                            ? (aSortDir === 'asc' ? <ArrowUp style={{width:10,height:10,color:'#144f6b'}} /> : <ArrowDown style={{width:10,height:10,color:'#144f6b'}} />)
                            : <ArrowUpDown style={{width:10,height:10,color:'#1A77A3',opacity:0.5}} />}
                        </div>
                        <ColResizeHandle onMouseDown={daftarStartResize('name')} />
                      </th>
                      <th style={{ padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'#144f6b',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none',width:daftarColW.category,position:'relative' }} onClick={() => aRequestSort('category' as keyof ChurchAsset)}>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          Kategori
                          {aSortKey === 'category'
                            ? (aSortDir === 'asc' ? <ArrowUp style={{width:10,height:10,color:'#144f6b'}} /> : <ArrowDown style={{width:10,height:10,color:'#144f6b'}} />)
                            : <ArrowUpDown style={{width:10,height:10,color:'#1A77A3',opacity:0.5}} />}
                        </div>
                        <ColResizeHandle onMouseDown={daftarStartResize('category')} />
                      </th>
                      <th style={{ padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'#144f6b',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none',width:daftarColW.condition,position:'relative' }} onClick={() => aRequestSort('condition' as keyof ChurchAsset)}>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          Kondisi
                          {aSortKey === 'condition'
                            ? (aSortDir === 'asc' ? <ArrowUp style={{width:10,height:10,color:'#144f6b'}} /> : <ArrowDown style={{width:10,height:10,color:'#144f6b'}} />)
                            : <ArrowUpDown style={{width:10,height:10,color:'#1A77A3',opacity:0.5}} />}
                        </div>
                        <ColResizeHandle onMouseDown={daftarStartResize('condition')} />
                      </th>
                      <th style={{ padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'#144f6b',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none',width:daftarColW.loanStatus,position:'relative' }} onClick={() => aRequestSort('loanStatus' as keyof ChurchAsset)}>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          Posisi
                          {aSortKey === 'loanStatus'
                            ? (aSortDir === 'asc' ? <ArrowUp style={{width:10,height:10,color:'#144f6b'}} /> : <ArrowDown style={{width:10,height:10,color:'#144f6b'}} />)
                            : <ArrowUpDown style={{width:10,height:10,color:'#1A77A3',opacity:0.5}} />}
                        </div>
                        <ColResizeHandle onMouseDown={daftarStartResize('loanStatus')} />
                      </th>
                      <th style={{ padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'#144f6b',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none',width:daftarColW.acquisitionValue,position:'relative' }} onClick={() => aRequestSort('acquisitionValue' as keyof ChurchAsset)}>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          Nilai Perolehan
                          {aSortKey === 'acquisitionValue'
                            ? (aSortDir === 'asc' ? <ArrowUp style={{width:10,height:10,color:'#144f6b'}} /> : <ArrowDown style={{width:10,height:10,color:'#144f6b'}} />)
                            : <ArrowUpDown style={{width:10,height:10,color:'#1A77A3',opacity:0.5}} />}
                        </div>
                        <ColResizeHandle onMouseDown={daftarStartResize('acquisitionValue')} />
                      </th>
                      <th style={{ padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'#144f6b',whiteSpace:'nowrap',width:daftarColW.bookValue,position:'relative' }}>
                        Nilai Buku
                        <ColResizeHandle onMouseDown={daftarStartResize('bookValue')} />
                      </th>
                      <th style={{ padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'#144f6b',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none',width:daftarColW.location,position:'relative' }} onClick={() => aRequestSort('location' as keyof ChurchAsset)}>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          Lokasi
                          {aSortKey === 'location'
                            ? (aSortDir === 'asc' ? <ArrowUp style={{width:10,height:10,color:'#144f6b'}} /> : <ArrowDown style={{width:10,height:10,color:'#144f6b'}} />)
                            : <ArrowUpDown style={{width:10,height:10,color:'#1A77A3',opacity:0.5}} />}
                        </div>
                        <ColResizeHandle onMouseDown={daftarStartResize('location')} />
                      </th>
                      <th style={{ padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'#144f6b',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none',width:daftarColW.responsiblePerson,position:'relative' }} onClick={() => aRequestSort('responsiblePerson' as keyof ChurchAsset)}>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          Penanggungjawab
                          {aSortKey === 'responsiblePerson'
                            ? (aSortDir === 'asc' ? <ArrowUp style={{width:10,height:10,color:'#144f6b'}} /> : <ArrowDown style={{width:10,height:10,color:'#144f6b'}} />)
                            : <ArrowUpDown style={{width:10,height:10,color:'#1A77A3',opacity:0.5}} />}
                        </div>
                        <ColResizeHandle onMouseDown={daftarStartResize('responsiblePerson')} />
                      </th>
                      <th style={{ padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'#144f6b',whiteSpace:'nowrap',width:daftarColW.aksi,position:'relative' }}>
                        Aksi
                        <ColResizeHandle onMouseDown={daftarStartResize('aksi')} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedAssets.length === 0 && (
                      <tr><td colSpan={11} style={{ textAlign:'center',padding:'32px',color:'#94a3b8',fontSize:12 }}>Tidak ada aset yang sesuai filter</td></tr>
                    )}
                    {pagedAssets.map((a) => {
                      const dep = calcDep(a);
                      const maints = getAssetMaints(a.id);
                      const hasAlert = maintenances.some(m => m.assetId === a.id && (m.result === 'Perlu Tindak Lanjut' || m.result === 'Dalam Proses'));
                      const loanSt = a.loanStatus || 'Tersedia';
                      const od = isOverdue(a);
                      return (
                        <tr key={a.id} onClick={() => { setSelectedAsset(a); setShowDetailModal(true); }}
                          style={{ borderBottom:'1px solid #f1f5f9', background: od ? '#fff5f5' : undefined, borderLeft: od ? '3px solid #dc2626' : '3px solid transparent' }}
                          className="hover:bg-[#f2f0ea] transition-colors cursor-pointer group">
                          {/* Foto thumbnail */}
                          <td style={{ padding:'8px 8px 8px 12px', width:48 }}>
                            {a.photo ? (
                              <img src={a.photo} alt={a.name}
                                className="w-10 h-10 rounded-xl object-cover border"
                                style={{ borderColor:'#e2e8f0', flexShrink:0 }}
                                onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                            ) : (
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{ background:CAT_BG[a.category], border:'1px dashed #e2e8f0' }}>
                                <span style={{ color:CAT_COLOR[a.category] }}><CatIcon cat={a.category} /></span>
                              </div>
                            )}
                          </td>
                          <td style={{ padding:'10px 12px' }}>
                            <span style={{ fontSize:11,fontFamily:'monospace',color:'#1A77A3',fontWeight:700 }}>{a.assetCode}</span>
                            {hasAlert && <AlertCircle style={{ width:10,height:10,color:'#dc2626',display:'inline',marginLeft:4 }} />}
                          </td>
                          <td style={{ padding:'10px 12px' }}>
                            <div className="min-w-0">
                              <p data-tooltip={a.name} data-tooltip-truncate className="truncate" style={{ fontWeight:600,color:'#1e293b',maxWidth:180 }}>{a.name}</p>
                              <p style={{ fontSize:10,color:'#94a3b8' }}>{maints.length} riwayat pemeliharaan</p>
                            </div>
                          </td>
                          <td style={{ padding:'10px 12px' }}>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background:CAT_BG[a.category],color:CAT_COLOR[a.category] }}>{a.category}</span>
                          </td>
                          <td style={{ padding:'10px 12px' }}><CondBadge cond={a.condition} /></td>
                          <td style={{ padding:'10px 12px' }}>
                            <div>
                              <div className="flex items-center gap-1 flex-wrap">
                                <LoanBadge status={loanSt} />
                                {od && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-bold"
                                    style={{ background:'#dc2626',color:'white',fontSize:9 }}>
                                    <AlertTriangle style={{ width:7,height:7 }} /> Jatuh Tempo
                                  </span>
                                )}
                              </div>
                              {loanSt === 'Dipinjam' && a.borrowedByName && (
                                <p style={{ fontSize:10,color: od ? '#dc2626' : '#9c9486',marginTop:2,fontWeight: od ? 600 : 400 }}>→ {a.borrowedByName}</p>
                              )}
                              {od && a.expectedReturnDate && (
                                <p style={{ fontSize:9.5,color:'#dc2626',fontWeight:600 }}>⚠ Batas: {fmtDateShort(a.expectedReturnDate)}</p>
                              )}
                            </div>
                          </td>
                          <td style={{ padding:'10px 12px',fontWeight:600,color:'#4b5563',whiteSpace:'nowrap' }}>{compactRp(a.acquisitionValue)}</td>
                          <td style={{ padding:'10px 12px',fontWeight:700,color:'#1A77A3',whiteSpace:'nowrap' }}>{compactRp(dep.bookValue)}</td>
                          <td data-tooltip={a.location} data-tooltip-truncate style={{ padding:'10px 12px',color:'#64748b',fontSize:11.5,maxWidth:140 }} className="truncate">{a.location}</td>
                          <td style={{ padding:'10px 12px',color:'#64748b',fontSize:11.5 }}>{a.responsiblePerson||'-'}</td>
                          <td style={{ padding:'10px 12px' }}>
                            <div className="flex items-center gap-1">
                              <button onClick={()=>{ setSelectedAsset(a); setShowDetailModal(true); }} data-tooltip="Detail"
                                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#f0f7fb] transition-all"
                                style={{ color:'#2563eb' }}>
                                <Eye style={{ width:13,height:13 }} />
                              </button>
                              {canEdit && (
                                <button onClick={()=>openEdit(a)} data-tooltip="Edit"
                                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#f6f4f0] transition-all"
                                  style={{ color:'#9c9486' }}>
                                  <Pencil style={{ width:13,height:13 }} />
                                </button>
                              )}
                              {canEdit && (
                                <button onClick={()=>openMaint(a)} data-tooltip="Catat Pemeliharaan"
                                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-green-50 transition-all"
                                  style={{ color:'#1A77A3' }}>
                                  <Wrench style={{ width:13,height:13 }} />
                                </button>
                              )}
                              {canDelete && (
                                <button onClick={()=>setDeleteConfirmId(a.id)} data-tooltip="Hapus"
                                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 transition-all"
                                  style={{ color:'#dc2626' }}>
                                  <Trash2 style={{ width:13,height:13 }} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor:'#f1f5f9' }}>
                <p style={{ fontSize:11.5,color:'#64748b' }}>Menampilkan {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,filteredAssets.length)} dari {filteredAssets.length} aset</p>
                <div className="flex items-center gap-1">
                  <button disabled={page===1} onClick={()=>setPage(p=>p-1)} data-tooltip="Halaman Sebelumnya" className="w-7 h-7 rounded-lg flex items-center justify-center border disabled:opacity-40 hover:bg-gray-50" style={{ borderColor:'#e2e8f0' }}>
                    <ChevronLeft style={{ width:13,height:13 }} />
                  </button>
                  {Array.from({length:totalPages},(_,i)=>i+1).map(n=>(
                    <button key={n} onClick={()=>setPage(n)} className="w-7 h-7 rounded-lg text-xs font-medium transition-all"
                      style={{ background:n===page?'#1A77A3':'transparent', color:n===page?'white':'#64748b', border: n===page?'none':'1px solid #e2e8f0' }}>{n}</button>
                  ))}
                  <button disabled={page===totalPages||totalPages===0} onClick={()=>setPage(p=>p+1)} data-tooltip="Halaman Berikutnya" className="w-7 h-7 rounded-lg flex items-center justify-center border disabled:opacity-40 hover:bg-gray-50" style={{ borderColor:'#e2e8f0' }}>
                    <ChevronRight style={{ width:13,height:13 }} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: PEMELIHARAAN ── */}
        {tab === 'pemeliharaan' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <select value={maintFilter} onChange={e=>{ setMaintFilter(e.target.value); setMaintPage(1); }}
                  className="px-3 py-2 rounded-xl border text-xs outline-none" style={{ borderColor:'#e2e8f0', color:'#4b5563', background:'white' }}>
                  <option value="">Semua Aset</option>
                  {[...assets].sort((a,b)=>a.name.localeCompare(b.name,'id')).map(a => <option key={a.id} value={a.id}>{a.assetCode} – {a.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color:'#64748b' }}>
                <span>Total biaya: <strong style={{ color:'#dc2626' }}>{compactRp(maintenances.reduce((s,m)=>s+m.cost,0))}</strong></span>
              </div>
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label:'Selesai', count:maintenances.filter(m=>m.result==='Selesai').length, color:'#1A77A3', bg:'#f0fdf4' },
                { label:'Dalam Proses', count:maintenances.filter(m=>m.result==='Dalam Proses').length, color:'#9c9486', bg:'#f6f4f0' },
                { label:'Perlu Tindak Lanjut', count:maintenances.filter(m=>m.result==='Perlu Tindak Lanjut').length, color:'#dc2626', bg:'#fef2f2' },
              ].map(s => (
                <div key={s.label} className="rounded-2xl border bg-white p-4" style={{ borderColor:'#e2e8f0' }}>
                  <p style={{ fontSize:22,fontWeight:800,color:s.color,fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{s.count}</p>
                  <p style={{ fontSize:12,color:'#4b5563',marginTop:2 }}>{s.label}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor:'#e2e8f0' }}>
              <div className="overflow-x-auto">
                <table style={{ width:'100%',fontSize:12,borderCollapse:'collapse',tableLayout:'fixed' }}>
                  <thead>
                    <tr style={{ background:'#f8fafc',borderBottom:'2px solid #f1f5f9' }}>
                      {[
                        { label:'Tanggal', col:'tanggal' },
                        { label:'Aset', col:'aset' },
                        { label:'Jenis', col:'jenis' },
                        { label:'Deskripsi', col:'deskripsi' },
                        { label:'Biaya', col:'biaya' },
                        { label:'Teknisi/Vendor', col:'teknisi' },
                        { label:'Hasil', col:'hasil' },
                      ].map(h => (
                        <th key={h.col} style={{ padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'#144f6b',whiteSpace:'nowrap',width:pemeliharaanColW[h.col],position:'relative' }}>
                          {h.label}
                          <ColResizeHandle onMouseDown={pemeliharaanStartResize(h.col)} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedMaints.map(m => {
                      const asset = assets.find(a => a.id === m.assetId);
                      const rc = RESULT_CFG[m.result];
                      return (
                        <tr key={m.id} style={{ borderBottom:'1px solid #f1f5f9' }} className="hover:bg-slate-50">
                          <td style={{ padding:'10px 12px',whiteSpace:'nowrap',color:'#4b5563' }}>
                            {new Date(m.date).toLocaleDateString('id-ID',{ day:'numeric',month:'short',year:'numeric' })}
                          </td>
                          <td style={{ padding:'10px 12px' }}>
                            {asset && (
                              <div>
                                <p style={{ fontWeight:600,color:'#1e293b',fontSize:11.5 }}>{asset.assetCode}</p>
                                <p data-tooltip={asset.name} data-tooltip-truncate style={{ fontSize:10.5,color:'#64748b' }} className="truncate max-w-36">{asset.name}</p>
                              </div>
                            )}
                          </td>
                          <td style={{ padding:'10px 12px' }}>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background:'#f1f5f9',color:'#4b5563' }}>{m.type}</span>
                          </td>
                          <td style={{ padding:'10px 12px',maxWidth:200 }}>
                            <p data-tooltip={m.description} data-tooltip-truncate style={{ color:'#4b5563' }} className="truncate">{m.description}</p>
                            {m.notes && <p data-tooltip={m.notes} data-tooltip-truncate style={{ fontSize:10.5,color:'#94a3b8' }} className="truncate">{m.notes}</p>}
                          </td>
                          <td style={{ padding:'10px 12px',fontWeight:600,color:'#4b5563',whiteSpace:'nowrap' }}>{compactRp(m.cost)}</td>
                          <td data-tooltip={m.technician} data-tooltip-truncate style={{ padding:'10px 12px',color:'#64748b',fontSize:11.5 }} className="max-w-32 truncate">{m.technician}</td>
                          <td style={{ padding:'10px 12px' }}>
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                              style={{ background:rc.bg, color:rc.text }}>{m.result}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {pagedMaints.length === 0 && (
                      <tr><td colSpan={7} style={{ textAlign:'center',padding:'32px',color:'#94a3b8',fontSize:12 }}>Belum ada riwayat pemeliharaan</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {/* Pagination maintenance */}
              <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor:'#f1f5f9' }}>
                <p style={{ fontSize:11.5,color:'#64748b' }}>{filteredMaints.length} riwayat pemeliharaan</p>
                <div className="flex items-center gap-1">
                  <button disabled={maintPage===1} onClick={()=>setMaintPage(p=>p-1)} data-tooltip="Halaman Sebelumnya" className="w-7 h-7 rounded-lg flex items-center justify-center border disabled:opacity-40 hover:bg-gray-50" style={{ borderColor:'#e2e8f0' }}><ChevronLeft style={{ width:13,height:13 }} /></button>
                  {Array.from({length:maintTotalPages},(_,i)=>i+1).map(n=>(
                    <button key={n} onClick={()=>setMaintPage(n)} className="w-7 h-7 rounded-lg text-xs font-medium"
                      style={{ background:n===maintPage?'#1A77A3':'transparent',color:n===maintPage?'white':'#64748b',border:n===maintPage?'none':'1px solid #e2e8f0' }}>{n}</button>
                  ))}
                  <button disabled={maintPage===maintTotalPages||maintTotalPages===0} onClick={()=>setMaintPage(p=>p+1)} data-tooltip="Halaman Berikutnya" className="w-7 h-7 rounded-lg flex items-center justify-center border disabled:opacity-40 hover:bg-gray-50" style={{ borderColor:'#e2e8f0' }}><ChevronRight style={{ width:13,height:13 }} /></button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: PENYUSUTAN ── */}
        {tab === 'penyusutan' && (
          <div className="space-y-4">
            {/* KPI summary */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label:'Total Penyusutan/Thn', value:compactRp(totalAnnualDep), color:'#7c3aed', bg:'#f5f3ff' },
                { label:'Total Akum. Penyusutan', value:compactRp(totalAcqValue - totalBookValue), color:'#dc2626', bg:'#fef2f2' },
                { label:'Total Nilai Buku', value:compactRp(totalBookValue), color:'#1A77A3', bg:'#f0fdf4' },
                { label:'Aset Tersusut Penuh', value:assets.filter(a=>calcDep(a).bookValue===0&&a.usefulLifeYears>0).length+' unit', color:'#64748b', bg:'#f8fafc' },
              ].map((k,i) => (
                <div key={i} className="rounded-2xl border p-4 bg-white" style={{ borderColor:'#e2e8f0' }}>
                  <p style={{ fontSize:18,fontWeight:800,color:k.color,fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{k.value}</p>
                  <p style={{ fontSize:11.5,color:'#4b5563',marginTop:3 }}>{k.label}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor:'#e2e8f0' }}>
              <div className="px-5 py-3 border-b" style={{ borderColor:'#f1f5f9' }}>
                <h3 style={{ fontSize:13.5,fontWeight:700,color:'#0f172a' }}>Tabel Penyusutan Aset (Metode Garis Lurus)</h3>
                <p style={{ fontSize:11,color:'#94a3b8',marginTop:1 }}>Per tanggal {new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</p>
              </div>
              <div className="overflow-x-auto">
                <table style={{ width:'100%',fontSize:11.5,borderCollapse:'collapse',tableLayout:'fixed' }}>
                  <thead>
                    <tr style={{ background:'#f8fafc',borderBottom:'2px solid #f1f5f9' }}>
                      {[
                        { label:'Kode', col:'kode' },
                        { label:'Nama Aset', col:'nama' },
                        { label:'Kategori', col:'kategori' },
                        { label:'Tgl Perolehan', col:'tglPerolehan' },
                        { label:'Nilai Perolehan', col:'nilaiPerolehan' },
                        { label:'Masa Manfaat', col:'masaManfaat' },
                        { label:'Rate/Thn', col:'rate' },
                        { label:'Penyusutan/Thn', col:'penyusutanThn' },
                        { label:'Akum. Penyusutan', col:'akumPenyusutan' },
                        { label:'Nilai Buku', col:'nilaiBuku' },
                        { label:'Sisa Masa', col:'sisaMasa' },
                      ].map(h=>(
                        <th key={h.col} style={{ padding:'9px 10px',textAlign:'left',fontSize:10.5,fontWeight:700,color:'#144f6b',whiteSpace:'nowrap',width:penyusutanColW[h.col],position:'relative' }}>
                          {h.label}
                          <ColResizeHandle onMouseDown={penyusutanStartResize(h.col)} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map(a => {
                      const dep = calcDep(a);
                      const fullyDep = dep.bookValue === 0 && a.usefulLifeYears > 0;
                      return (
                        <tr key={a.id} onClick={() => { setSelectedAsset(a); setShowDetailModal(true); }} style={{ borderBottom:'1px solid #f1f5f9', background: fullyDep ? '#f6f4f0' : 'white' }}
                          className="hover:bg-slate-50">
                          <td style={{ padding:'9px 10px',fontFamily:'monospace',color:'#1A77A3',fontWeight:700,fontSize:11 }}>{a.assetCode}</td>
                          <td style={{ padding:'9px 10px',maxWidth:160 }} className="truncate">
                            <p data-tooltip={a.name} data-tooltip-truncate style={{ fontWeight:600,color:'#1e293b' }} className="truncate max-w-40">{a.name}</p>
                          </td>
                          <td style={{ padding:'9px 10px' }}>
                            <span className="px-1.5 py-0.5 rounded text-xs" style={{ background:CAT_BG[a.category],color:CAT_COLOR[a.category],fontWeight:600,fontSize:10 }}>{a.category}</span>
                          </td>
                          <td style={{ padding:'9px 10px',color:'#64748b',whiteSpace:'nowrap' }}>{new Date(a.acquisitionDate).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}</td>
                          <td style={{ padding:'9px 10px',fontWeight:600,color:'#4b5563',whiteSpace:'nowrap' }}>{compactRp(a.acquisitionValue)}</td>
                          <td style={{ padding:'9px 10px',color:'#64748b',whiteSpace:'nowrap' }}>{a.usefulLifeYears > 0 ? a.usefulLifeYears+' thn' : 'Tidak disusutkan'}</td>
                          <td style={{ padding:'9px 10px',color:'#7c3aed',fontWeight:600 }}>{dep.rate > 0 ? dep.rate.toFixed(1)+'%' : '–'}</td>
                          <td style={{ padding:'9px 10px',color:'#dc2626',fontWeight:600,whiteSpace:'nowrap' }}>{dep.annual > 0 ? compactRp(dep.annual) : '–'}</td>
                          <td style={{ padding:'9px 10px',color:'#ef4444',fontWeight:700,whiteSpace:'nowrap' }}>{dep.accumulated > 0 ? compactRp(dep.accumulated) : '–'}</td>
                          <td style={{ padding:'9px 10px',fontWeight:800,color:fullyDep?'#dc2626':'#1A77A3',whiteSpace:'nowrap' }}>
                            {compactRp(dep.bookValue)}
                            {fullyDep && <span style={{ fontSize:9,background:'#f2f0ea',color:'#854d0e',padding:'1px 4px',borderRadius:4,marginLeft:4 }}>Habis</span>}
                          </td>
                          <td style={{ padding:'9px 10px',color:'#64748b',whiteSpace:'nowrap' }}>
                            {a.usefulLifeYears > 0 ? (dep.remaining > 0 ? dep.remaining.toFixed(1)+' thn' : 'Habis') : '–'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'#f0fdf4',borderTop:'2px solid #b8d5e8' }}>
                      <td colSpan={4} style={{ padding:'10px',fontWeight:800,color:'#1e293b',fontSize:12 }}>TOTAL</td>
                      <td style={{ padding:'10px',fontWeight:800,color:'#1e293b',whiteSpace:'nowrap' }}>{compactRp(totalAcqValue)}</td>
                      <td colSpan={2} />
                      <td style={{ padding:'10px',fontWeight:800,color:'#dc2626',whiteSpace:'nowrap' }}>{compactRp(totalAnnualDep)}/thn</td>
                      <td style={{ padding:'10px',fontWeight:800,color:'#ef4444',whiteSpace:'nowrap' }}>{compactRp(totalAcqValue-totalBookValue)}</td>
                      <td style={{ padding:'10px',fontWeight:800,color:'#1A77A3',whiteSpace:'nowrap' }}>{compactRp(totalBookValue)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: LAPORAN ── */}
        {tab === 'laporan' && (() => {
          const totalMaintCost = maintenances.reduce((s,m) => s + m.cost, 0);
          const recentMaints = [...maintenances].sort((a,b) => b.date.localeCompare(a.date)).slice(0,8);
          const totalAccumDep = assets.reduce((s,a) => s + calcDep(a).accumulated, 0);
          const depPct = totalAcqValue > 0 ? (totalAccumDep / totalAcqValue * 100).toFixed(1) : '0';
          const maxCatVal = Math.max(...catSummary.map(([,d]) => d.value), 1);
          const printDate = new Date().toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });

          return (
            <div className="space-y-5">

              {/* ── Laporan Header ── */}
              <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor:'#e2e8f0' }}>
                <div className="px-6 py-5 flex items-start justify-between" style={{ background:'linear-gradient(135deg,#0a1e2c 0%,#0f2d41 100%)' }}>
                  <div>
                    <p style={{ fontSize:10.5, color:'rgba(255,255,255,0.5)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:4 }}>Laporan Manajemen Aset</p>
                    <h2 style={{ fontSize:18, fontWeight:800, color:'#fff', fontFamily:"'Plus Jakarta Sans',sans-serif", marginBottom:2 }}>GPIB TRINITAS</h2>
                    <p style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>Jl. Anggrek No. 12, Jakarta Selatan</p>
                  </div>
                  <div className="text-right">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)' }}>
                      <Calendar style={{ width:13,height:13,color:'#f0ede5' }} />
                      <span style={{ fontSize:11.5, color:'rgba(255,255,255,0.85)', fontWeight:600 }}>{printDate}</span>
                    </div>
                    <p style={{ fontSize:10.5, color:'rgba(255,255,255,0.4)', marginTop:6 }}>{assets.length} aset terdaftar · {maintenances.length} catatan pemeliharaan</p>
                  </div>
                </div>
                <div className="h-1" style={{ background:'linear-gradient(90deg,#1A77A3,#f0ede5,#0d9488)' }} />
              </div>

              {/* ── KPI Ringkasan ── */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { label:'Total Aset', value:`${assets.length} unit`, sub:'Unit terdaftar aktif', color:'#2563eb', bg:'#eff6ff', icon:Package, border:'#bfdbfe' },
                  { label:'Nilai Perolehan', value:compactRp(totalAcqValue), sub:'Total investasi aset', color:'#1A77A3', bg:'#f0fdf4', icon:DollarSign, border:'#b8d5e8' },
                  { label:'Nilai Buku', value:compactRp(totalBookValue), sub:`Penyusutan ${depPct}%`, color:'#7c3aed', bg:'#f5f3ff', icon:TrendingDown, border:'#ddd6fe' },
                  { label:'Biaya Pemeliharaan', value:compactRp(totalMaintCost), sub:`${maintenances.length} catatan`, color:'#9c9486', bg:'#f6f4f0', icon:Wrench, border:'#e8e4d8' },
                ].map((k,i) => {
                  const Icon = k.icon;
                  return (
                    <div key={i} className="rounded-2xl border p-4 bg-white" style={{ borderColor:k.border }}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background:k.bg }}>
                        <Icon style={{ width:18,height:18,color:k.color }} />
                      </div>
                      <p style={{ fontSize:18,fontWeight:800,color:'#1e293b',fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1 }}>{k.value}</p>
                      <p style={{ fontSize:12,fontWeight:600,color:'#4b5563',marginTop:4 }}>{k.label}</p>
                      <p style={{ fontSize:10.5,color:'#94a3b8',marginTop:2 }}>{k.sub}</p>
                    </div>
                  );
                })}
              </div>

              {/* ── Neraca per Kategori + Kondisi ── */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Neraca per Kategori */}
                <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor:'#e2e8f0' }}>
                  <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor:'#f1f5f9', background:'#fafafa' }}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:'#eff6ff' }}>
                        <Layers style={{ width:14,height:14,color:'#2563eb' }} />
                      </div>
                      <span style={{ fontSize:13,fontWeight:700,color:'#1e293b' }}>Neraca Aset per Kategori</span>
                    </div>
                    <span className="flex items-center gap-1" style={{ fontSize:10.5, color:'#94a3b8' }}>
                      <Eye style={{ width:11,height:11 }} /> klik baris untuk detail
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full" style={{ fontSize:11.5 }}>
                      <thead>
                        <tr style={{ background:'#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                          <th className="text-left px-4 py-2.5" style={{ color:'#144f6b',fontWeight:600,fontSize:11 }}>Kategori</th>
                          <th className="text-right px-3 py-2.5" style={{ color:'#144f6b',fontWeight:600,fontSize:11 }}>Unit</th>
                          <th className="text-right px-3 py-2.5" style={{ color:'#144f6b',fontWeight:600,fontSize:11 }}>Nilai Perolehan</th>
                          <th className="text-right px-4 py-2.5" style={{ color:'#144f6b',fontWeight:600,fontSize:11 }}>Nilai Buku ↗</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catSummary.map(([cat,d]) => {
                          const barPct = Math.round(d.value / maxCatVal * 100);
                          return (
                            <tr key={cat}
                              onClick={() => setLaporanModal({ type:'kategori', cat })}
                              style={{ borderBottom:'1px solid #f8fafc', cursor:'pointer', transition:'background 0.12s' }}
                              onMouseEnter={e => (e.currentTarget.style.background='#f0fdf4')}
                              onMouseLeave={e => (e.currentTarget.style.background='')}>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background:CAT_COLOR[cat as AssetCategory]||'#64748b' }} />
                                  <span style={{ color:'#4b5563',fontWeight:500 }}>{cat}</span>
                                </div>
                                <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background:'#f1f5f9' }}>
                                  <div className="h-full rounded-full" style={{ width:`${barPct}%`, background:CAT_COLOR[cat as AssetCategory]||'#64748b', opacity:0.6 }} />
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right" style={{ color:'#4b5563',fontWeight:600 }}>{d.count}</td>
                              <td className="px-3 py-2.5 text-right" style={{ color:'#4b5563' }}>{compactRp(d.value)}</td>
                              <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  <span style={{ color:'#1A77A3',fontWeight:600 }}>{compactRp(d.bookValue)}</span>
                                  <Eye style={{ width:12,height:12,color:'#94a3b8',flexShrink:0 }} />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background:'#f0fdf4', borderTop:'2px solid #b8d5e8' }}>
                          <td className="px-4 py-2.5" style={{ fontSize:12,fontWeight:700,color:'#1e293b' }}>TOTAL</td>
                          <td className="px-3 py-2.5 text-right" style={{ fontSize:12,fontWeight:700,color:'#1e293b' }}>{assets.length}</td>
                          <td className="px-3 py-2.5 text-right" style={{ fontSize:12,fontWeight:700,color:'#1e293b' }}>{compactRp(totalAcqValue)}</td>
                          <td className="px-4 py-2.5 text-right" style={{ fontSize:12,fontWeight:700,color:'#1A77A3' }}>{compactRp(totalBookValue)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Sebaran Kondisi */}
                <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor:'#e2e8f0' }}>
                  <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor:'#f1f5f9', background:'#fafafa' }}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:'#f0fdf4' }}>
                        <Shield style={{ width:14,height:14,color:'#1A77A3' }} />
                      </div>
                      <span style={{ fontSize:13,fontWeight:700,color:'#0f172a' }}>Sebaran Kondisi Aset</span>
                    </div>
                    <span className="flex items-center gap-1" style={{ fontSize:10.5,color:'#94a3b8' }}>
                      <Eye style={{ width:11,height:11 }} /> klik untuk detail
                    </span>
                  </div>
                  <div className="p-5 space-y-3">
                    {condSummary.map(c => {
                      const cfg = COND_CFG[c.name as AssetCondition];
                      const pct = Math.round(c.value / assets.length * 100);
                      return (
                        <div key={c.name} onClick={() => setLaporanModal({ type:'kondisi', cond: c.name })}
                          className="rounded-xl p-2 -mx-2 transition-all duration-100"
                          style={{ cursor:'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background=cfg.bg)}
                          onMouseLeave={e => (e.currentTarget.style.background='')}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="inline-block w-2 h-2 rounded-full" style={{ background:cfg.text }} />
                              <span style={{ fontSize:12,color:'#4b5563',fontWeight:500 }}>{c.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span style={{ fontSize:11,color:'#94a3b8' }}>{pct}%</span>
                              <span className="px-2 py-0.5 rounded-full border" style={{ fontSize:11,fontWeight:700,color:cfg.text,background:cfg.bg,borderColor:cfg.border }}>{c.value} unit</span>
                              <Eye style={{ width:11,height:11,color:'#94a3b8' }} />
                            </div>
                          </div>
                          <div className="h-2.5 rounded-full overflow-hidden" style={{ background:'#f1f5f9' }}>
                            <div className="h-full rounded-full transition-all duration-500" style={{ width:`${pct}%`, background:cfg.text, opacity:0.8 }} />
                          </div>
                        </div>
                      );
                    })}
                    <div className="mt-4 pt-4 border-t" style={{ borderColor:'#f1f5f9' }}>
                      <p style={{ fontSize:11.5,fontWeight:700,color:'#4b5563',marginBottom:8 }}>Ringkasan Penyusutan</p>
                      <div className="space-y-2">
                        {[
                          { label:'Akumulasi Penyusutan', value:compactRp(totalAccumDep), color:'#dc2626' },
                          { label:'Penyusutan Tahunan', value:compactRp(totalAnnualDep), color:'#9c9486' },
                          { label:'Rasio Penyusutan', value:`${depPct}%`, color:'#7c3aed' },
                        ].map((r,i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background:'#f8fafc' }}>
                            <span style={{ fontSize:11.5,color:'#64748b' }}>{r.label}</span>
                            <span style={{ fontSize:12,fontWeight:700,color:r.color }}>{r.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Aset Perlu Perhatian ── */}
              {assetsNeedingAttn.length > 0 && (
                <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor:'#fecaca' }}>
                  <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor:'#fecaca', background:'#fef2f2' }}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:'#fee2e2' }}>
                        <AlertTriangle style={{ width:14,height:14,color:'#dc2626' }} />
                      </div>
                      <span style={{ fontSize:13,fontWeight:700,color:'#991b1b' }}>Aset Perlu Perhatian</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1" style={{ fontSize:10.5,color:'#b91c1c' }}>
                        <Eye style={{ width:11,height:11 }} /> klik baris
                      </span>
                      <span className="px-2.5 py-1 rounded-full" style={{ background:'#dc2626',color:'#fff',fontSize:11,fontWeight:700 }}>{assetsNeedingAttn.length} aset</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full" style={{ fontSize:11.5, tableLayout:'fixed' }}>
                      <thead>
                        <tr style={{ background:'#fff7f7', borderBottom:'1px solid #fecaca' }}>
                          {[
                            { label:'Kode', col:'kode' },
                            { label:'Nama Aset', col:'nama' },
                            { label:'Kategori', col:'kategori' },
                            { label:'Kondisi', col:'kondisi' },
                            { label:'Nilai Buku', col:'nilaiBuku' },
                            { label:'Lokasi', col:'lokasi' },
                            { label:'Status', col:'status' },
                          ].map(h => (
                            <th key={h.col} className="text-left px-4 py-2.5" style={{ color:'#991b1b',fontWeight:600,fontSize:11,width:laporanPerhatianColW[h.col],position:'relative' }}>
                              {h.label}
                              <ColResizeHandle onMouseDown={laporanPerhatianStartResize(h.col)} />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {assetsNeedingAttn.map((a,i) => {
                          const dep = calcDep(a);
                          const hasPendingMaint = maintenances.some(m => m.assetId === a.id && (m.result === 'Perlu Tindak Lanjut' || m.result === 'Dalam Proses'));
                          return (
                            <tr key={a.id} onClick={() => { setSelectedAsset(a); setShowDetailModal(true); setLaporanModal({ type:'asset', assetId: a.id }); }}
                              style={{ borderBottom:'1px solid #fff1f2', background:i%2===0?'#fff':'#fffbfb', cursor:'pointer', transition:'background 0.12s' }}
                              onMouseEnter={e => (e.currentTarget.style.background='#fff7f7')}
                              onMouseLeave={e => (e.currentTarget.style.background=i%2===0?'#fff':'#fffbfb')}>
                              <td className="px-4 py-2.5" style={{ color:'#dc2626',fontWeight:700,fontFamily:'monospace',fontSize:11 }}>{a.assetCode}</td>
                              <td className="px-4 py-2.5" style={{ color:'#1e293b',fontWeight:500,maxWidth:180 }}>
                                <span data-tooltip={a.name} data-tooltip-truncate className="truncate block">{a.name}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full" style={{ background:CAT_COLOR[a.category]||'#64748b' }} />
                                  <span style={{ color:'#4b5563' }}>{a.category}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5"><CondBadge cond={a.condition} /></td>
                              <td className="px-4 py-2.5" style={{ color:'#4b5563',fontWeight:600 }}>{compactRp(dep.bookValue)}</td>
                              <td className="px-4 py-2.5" style={{ color:'#64748b',maxWidth:140 }}>
                                <span data-tooltip={a.location} data-tooltip-truncate className="truncate block">{a.location}</span>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  {hasPendingMaint
                                    ? <span className="px-2 py-0.5 rounded-full" style={{ fontSize:10.5,fontWeight:600,background:'#f2f0ea',color:'#854d0e',border:'1px solid #fde047' }}>Pemeliharaan Aktif</span>
                                    : <span className="px-2 py-0.5 rounded-full" style={{ fontSize:10.5,fontWeight:600,background:'#fef2f2',color:'#dc2626',border:'1px solid #fecaca' }}>Perlu Tindakan</span>
                                  }
                                  <Eye style={{ width:12,height:12,color:'#94a3b8',flexShrink:0 }} />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Rekap Pemeliharaan ── */}
              <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor:'#e2e8f0' }}>
                <div className="px-5 py-3.5 border-b" style={{ borderColor:'#f1f5f9', background:'#fafafa' }}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:'#fff7ed' }}>
                        <History style={{ width:14,height:14,color:'#9c9486' }} />
                      </div>
                      <span style={{ fontSize:13,fontWeight:700,color:'#0f172a' }}>Riwayat Pemeliharaan Terkini</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {[
                        { label:'Selesai', count:maintenances.filter(m=>m.result==='Selesai').length, color:'#1A77A3', bg:'#f0fdf4' },
                        { label:'Dalam Proses', count:maintenances.filter(m=>m.result==='Dalam Proses').length, color:'#2563eb', bg:'#eff6ff' },
                        { label:'Tindak Lanjut', count:maintenances.filter(m=>m.result==='Perlu Tindak Lanjut').length, color:'#dc2626', bg:'#fef2f2' },
                      ].map(s => (
                        <span key={s.label} className="px-2.5 py-1 rounded-full" style={{ fontSize:10.5,fontWeight:700,color:s.color,background:s.bg }}>
                          {s.label}: {s.count}
                        </span>
                      ))}
                      <span style={{ fontSize:10.5,color:'#94a3b8',marginLeft:4 }}>Total: {compactRp(totalMaintCost)}</span>
                      <span className="flex items-center gap-1 ml-1" style={{ fontSize:10.5,color:'#9c9486' }}>
                        <Eye style={{ width:11,height:11 }} /> klik baris
                      </span>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ fontSize:11.5, tableLayout:'fixed' }}>
                    <thead>
                      <tr style={{ background:'#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                        {[
                          { label:'Tanggal', col:'tanggal' },
                          { label:'Aset', col:'aset' },
                          { label:'Jenis', col:'jenis' },
                          { label:'Deskripsi', col:'deskripsi' },
                          { label:'Biaya', col:'biaya' },
                          { label:'Teknisi', col:'teknisi' },
                          { label:'Hasil', col:'hasil' },
                        ].map(h => (
                          <th key={h.col} className="text-left px-4 py-2.5" style={{ color:'#144f6b',fontWeight:600,fontSize:11,width:laporanRiwayatColW[h.col],position:'relative' }}>
                            {h.label}
                            <ColResizeHandle onMouseDown={laporanRiwayatStartResize(h.col)} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentMaints.map((m,i) => {
                        const asset = assets.find(a => a.id === m.assetId);
                        const rc = RESULT_CFG[m.result];
                        return (
                          <tr key={m.id}
                            onClick={() => setLaporanModal({ type:'maintenance', maintId: m.id })}
                            style={{ borderBottom:'1px solid #f8fafc', background:i%2===0?'#fff':'#fafafa', cursor:'pointer', transition:'background 0.12s' }}
                            onMouseEnter={e => (e.currentTarget.style.background='#f6f4f0')}
                            onMouseLeave={e => (e.currentTarget.style.background=i%2===0?'#fff':'#fafafa')}>
                            <td className="px-4 py-2.5" style={{ color:'#4b5563',whiteSpace:'nowrap' }}>
                              {new Date(m.date).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}
                            </td>
                            <td className="px-4 py-2.5" style={{ maxWidth:150 }}>
                              <p data-tooltip={asset?.name||'-'} data-tooltip-truncate style={{ color:'#1e293b',fontWeight:600,fontSize:11 }} className="truncate">{asset?.name||'-'}</p>
                              <p style={{ color:'#94a3b8',fontSize:10.5 }}>{asset?.assetCode}</p>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="px-2 py-0.5 rounded-lg" style={{ fontSize:10.5,background:'#f1f5f9',color:'#475569',fontWeight:500 }}>{m.type}</span>
                            </td>
                            <td className="px-4 py-2.5" style={{ color:'#4b5563',maxWidth:200 }}>
                              <span data-tooltip={m.description} data-tooltip-truncate className="truncate block">{m.description}</span>
                            </td>
                            <td className="px-4 py-2.5" style={{ color:'#4b5563',fontWeight:600,whiteSpace:'nowrap' }}>{compactRp(m.cost)}</td>
                            <td className="px-4 py-2.5" style={{ color:'#64748b',maxWidth:130 }}>
                              <span data-tooltip={m.technician} data-tooltip-truncate className="truncate block">{m.technician}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded-full" style={{ fontSize:10.5,fontWeight:600,color:rc.text,background:rc.bg }}>{m.result}</span>
                                <Eye style={{ width:12,height:12,color:'#94a3b8',flexShrink:0 }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Export ── */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border bg-white p-5" style={{ borderColor:'#e2e8f0' }}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background:'#fef2f2' }}>
                      <FileText style={{ width:20,height:20,color:'#dc2626' }} />
                    </div>
                    <div>
                      <h3 style={{ fontSize:13,fontWeight:700,color:'#0f172a' }}>Cetak Neraca Aset (PDF)</h3>
                      <p style={{ fontSize:11,color:'#94a3b8' }}>Daftar lengkap seluruh aset gereja</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 mb-4">
                    {[`${assets.length} aset terdaftar`,`Nilai Perolehan: ${compactRp(totalAcqValue)}`,`Nilai Buku: ${compactRp(totalBookValue)}`,`Penyusutan/Thn: ${compactRp(totalAnnualDep)}`].map((s,i) => (
                      <div key={i} className="flex items-center gap-2">
                        <CheckCircle2 style={{ width:12,height:12,color:'#1A77A3',flexShrink:0 }} />
                        <p style={{ fontSize:11.5,color:'#4b5563' }}>{s}</p>
                      </div>
                    ))}
                  </div>
                  <button onClick={exportPDF} className="w-full py-2.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                    style={{ background:'linear-gradient(135deg,#dc2626,#b91c1c)', fontSize:13 }}>
                    <FileText style={{ width:14,height:14 }} /> Cetak PDF
                  </button>
                </div>
                <div className="rounded-2xl border bg-white p-5" style={{ borderColor:'#e2e8f0' }}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background:'#f0fdf4' }}>
                      <FileSpreadsheet style={{ width:20,height:20,color:'#1A77A3' }} />
                    </div>
                    <div>
                      <h3 style={{ fontSize:13,fontWeight:700,color:'#0f172a' }}>Unduh Rekap Excel</h3>
                      <p style={{ fontSize:11,color:'#94a3b8' }}>Daftar aset + pemeliharaan + penyusutan</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 mb-4">
                    {['Sheet 1: Daftar Aset lengkap','Sheet 2: Riwayat Pemeliharaan',`${maintenances.length} catatan pemeliharaan`,`Biaya: ${compactRp(totalMaintCost)}`].map((s,i) => (
                      <div key={i} className="flex items-center gap-2">
                        <CheckCircle2 style={{ width:12,height:12,color:'#1A77A3',flexShrink:0 }} />
                        <p style={{ fontSize:11.5,color:'#4b5563' }}>{s}</p>
                      </div>
                    ))}
                  </div>
                  <button onClick={exportExcel} className="w-full py-2.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                    style={{ background:'#1A77A3', fontSize:13 }}>
                    <FileSpreadsheet style={{ width:14,height:14 }} /> Unduh Excel
                  </button>
                </div>
              </div>

              {/* Integrasi info */}
              <div className="rounded-2xl border p-5" style={{ borderColor:'#bfdbfe', background:'#eff6ff' }}>
                <div className="flex items-start gap-3">
                  <Info style={{ width:18,height:18,color:'#2563eb',flexShrink:0,marginTop:1 }} />
                  <div>
                    <p style={{ fontSize:13,fontWeight:700,color:'#1d4ed8',marginBottom:6 }}>Integrasi dengan Modul Lain</p>
                    <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                      {[
                        '📊 Laporan Keuangan: Nilai aset otomatis tercermin di Laporan Posisi Keuangan (ISAK 35)',
                        '💰 Keuangan Gereja: Pembelian aset baru dicatat otomatis sebagai pengeluaran',
                        '🏛 Budget Planning: Biaya pemeliharaan aset dapat dimasukkan ke anggaran operasional',
                        '👤 Data Jemaat: Penanggungjawab aset terhubung ke database anggota',
                        '⛪ Unit Pelayanan: Aset dapat diklasifikasikan per unit pelayanan gereja',
                      ].map((t,i) => (
                        <p key={i} style={{ fontSize:11.5,color:'#1e40af' }}>{t}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          );
        })()}
      </div>

      {/* ── MODAL: LAPORAN DETAIL ── */}
      {laporanModal && (() => {
        const closeLaporan = () => setLaporanModal(null);

        /* ── MODAL: KATEGORI ── */
        if (laporanModal.type === 'kategori') {
          const { cat } = laporanModal;
          const catAssets = assets.filter(a => a.category === cat).sort((a,b) => b.acquisitionValue - a.acquisitionValue);
          const catColor = CAT_COLOR[cat as AssetCategory] || '#64748b';
          const catBg = CAT_BG[cat as AssetCategory] || '#f8fafc';
          const totalCatAcq = catAssets.reduce((s,a) => s + a.acquisitionValue, 0);
          const totalCatBook = catAssets.reduce((s,a) => s + calcDep(a).bookValue, 0);
          const totalCatDep = catAssets.reduce((s,a) => s + calcDep(a).annual, 0);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background:'rgba(0,0,0,0.55)' }}
              onClick={e => { if(e.target===e.currentTarget) closeLaporan(); }}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden" style={{ transform:`translate(${offsetLaporanKategori.x}px,${offsetLaporanKategori.y}px)` }}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor:'#f1f5f9', background:catBg, cursor:'move' }} onMouseDown={onMouseDownLaporanKategori}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background:catColor+'22', border:`1.5px solid ${catColor}33` }}>
                      <CatIcon cat={cat as AssetCategory} />
                    </div>
                    <div>
                      <h2 style={{ fontSize:15,fontWeight:800,color:'#0f172a' }}>Kategori: {cat}</h2>
                      <p style={{ fontSize:11,color:'#64748b',marginTop:1 }}>{catAssets.length} aset terdaftar dalam kategori ini</p>
                    </div>
                  </div>
                  <button onClick={closeLaporan} data-tooltip="Tutup" className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white transition-all" style={{ border:'1px solid #e2e8f0' }}>
                    <X style={{ width:15,height:15,color:'#64748b' }} />
                  </button>
                </div>
                {/* KPI Strip */}
                <div className="grid grid-cols-3 border-b flex-shrink-0" style={{ borderColor:'#f1f5f9' }}>
                  {[
                    { label:'Nilai Perolehan', value:compactRp(totalCatAcq), color:catColor },
                    { label:'Nilai Buku', value:compactRp(totalCatBook), color:'#1A77A3' },
                    { label:'Penyusutan/Thn', value:compactRp(totalCatDep), color:'#9c9486' },
                  ].map((k,i) => (
                    <div key={i} className="px-5 py-3 border-r last:border-r-0" style={{ borderColor:'#f1f5f9' }}>
                      <p style={{ fontSize:10.5,color:'#94a3b8',marginBottom:2 }}>{k.label}</p>
                      <p style={{ fontSize:14,fontWeight:800,color:k.color,fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{k.value}</p>
                    </div>
                  ))}
                </div>
                {/* Table */}
                <div className="overflow-y-auto flex-1">
                  <table className="w-full" style={{ fontSize:12, tableLayout:'fixed' }}>
                    <thead className="sticky top-0" style={{ background:'#f8fafc' }}>
                      <tr style={{ borderBottom:'1px solid #f1f5f9' }}>
                        {[
                          { label:'Kode', col:'kode' },
                          { label:'Nama Aset', col:'nama' },
                          { label:'Kondisi', col:'kondisi' },
                          { label:'Tgl Perolehan', col:'tglPerolehan' },
                          { label:'Nilai Perolehan', col:'nilaiPerolehan' },
                          { label:'Penyusutan/Thn', col:'penyusutanThn' },
                          { label:'Nilai Buku', col:'nilaiBuku' },
                          { label:'Lokasi', col:'lokasi' },
                        ].map(h => (
                          <th key={h.col} className="text-left px-4 py-2.5" style={{ color:'#144f6b',fontWeight:600,fontSize:11,whiteSpace:'nowrap',width:modalKategoriColW[h.col],position:'relative' }}>
                            {h.label}
                            <ColResizeHandle onMouseDown={modalKategoriStartResize(h.col)} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {catAssets.map((a,i) => {
                        const dep = calcDep(a);
                        return (
                          <tr key={a.id} onClick={() => { setSelectedAsset(a); setShowDetailModal(true); }} style={{ borderBottom:'1px solid #f8fafc', background:i%2===0?'#fff':'#fafafa' }}>
                            <td className="px-4 py-2.5" style={{ color:catColor,fontWeight:700,fontFamily:'monospace',fontSize:11 }}>{a.assetCode}</td>
                            <td className="px-4 py-2.5" style={{ maxWidth:200 }}>
                              <p data-tooltip={a.name} data-tooltip-truncate style={{ color:'#1e293b',fontWeight:600 }} className="truncate">{a.name}</p>
                              {a.serialNumber && a.serialNumber !== '-' && <p style={{ fontSize:10,color:'#94a3b8' }}>{a.serialNumber}</p>}
                            </td>
                            <td className="px-4 py-2.5"><CondBadge cond={a.condition} /></td>
                            <td className="px-4 py-2.5 whitespace-nowrap" style={{ color:'#64748b' }}>
                              {new Date(a.acquisitionDate).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}
                            </td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap" style={{ color:'#4b5563',fontWeight:500 }}>{compactRp(a.acquisitionValue)}</td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap" style={{ color:'#9c9486' }}>{dep.annual>0?compactRp(dep.annual):'-'}</td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap" style={{ color:'#1A77A3',fontWeight:700 }}>{compactRp(dep.bookValue)}</td>
                            <td className="px-4 py-2.5" style={{ color:'#64748b',maxWidth:150 }}>
                              <span data-tooltip={a.location} data-tooltip-truncate className="truncate block">{a.location}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:'#f0fdf4', borderTop:'2px solid #b8d5e8' }}>
                        <td className="px-4 py-2.5" colSpan={4} style={{ fontSize:12,fontWeight:700,color:'#1e293b' }}>TOTAL ({catAssets.length} aset)</td>
                        <td className="px-4 py-2.5 text-right" style={{ fontSize:12,fontWeight:700,color:'#4b5563' }}>{compactRp(totalCatAcq)}</td>
                        <td className="px-4 py-2.5 text-right" style={{ fontSize:12,fontWeight:700,color:'#9c9486' }}>{compactRp(totalCatDep)}</td>
                        <td className="px-4 py-2.5 text-right" style={{ fontSize:12,fontWeight:700,color:'#1A77A3' }}>{compactRp(totalCatBook)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          );
        }

        /* ── MODAL: KONDISI ── */
        if (laporanModal.type === 'kondisi') {
          const { cond } = laporanModal;
          const condAssets = assets.filter(a => a.category !== undefined && a.condition === cond)
            .sort((a,b) => b.acquisitionValue - a.acquisitionValue);
          const cfg = COND_CFG[cond as AssetCondition] || { text:'#64748b', bg:'#f8fafc', border:'#e2e8f0' };
          const totalCondAcq = condAssets.reduce((s,a) => s + a.acquisitionValue, 0);
          const totalCondBook = condAssets.reduce((s,a) => s + calcDep(a).bookValue, 0);
          const condIcons: Record<string,string> = {
            'Baik':'✅','Cukup Baik':'🟡','Rusak Ringan':'🟠','Rusak Berat':'🔴','Tidak Layak':'⛔'
          };
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background:'rgba(0,0,0,0.55)' }}
              onClick={e => { if(e.target===e.currentTarget) closeLaporan(); }}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden" style={{ transform:`translate(${offsetLaporanKondisi.x}px,${offsetLaporanKondisi.y}px)` }}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor:cfg.border, background:cfg.bg, cursor:'move' }} onMouseDown={onMouseDownLaporanKondisi}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background:cfg.text+'18', border:`1.5px solid ${cfg.border}` }}>
                      {condIcons[cond] || '📦'}
                    </div>
                    <div>
                      <h2 style={{ fontSize:15,fontWeight:800,color:'#1e293b' }}>Kondisi: {cond}</h2>
                      <p style={{ fontSize:11,color:'#64748b',marginTop:1 }}>{condAssets.length} aset dengan kondisi ini</p>
                    </div>
                  </div>
                  <button onClick={closeLaporan} data-tooltip="Tutup" className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-white" style={{ border:'1px solid #e2e8f0' }}>
                    <X style={{ width:15,height:15,color:'#64748b' }} />
                  </button>
                </div>
                {/* KPI Strip */}
                <div className="grid grid-cols-3 border-b flex-shrink-0" style={{ borderColor:'#f1f5f9' }}>
                  {[
                    { label:'Jumlah Aset', value:`${condAssets.length} unit`, color:cfg.text },
                    { label:'Total Nilai Perolehan', value:compactRp(totalCondAcq), color:'#4b5563' },
                    { label:'Total Nilai Buku', value:compactRp(totalCondBook), color:'#1A77A3' },
                  ].map((k,i) => (
                    <div key={i} className="px-5 py-3 border-r last:border-r-0" style={{ borderColor:'#f1f5f9' }}>
                      <p style={{ fontSize:10.5,color:'#94a3b8',marginBottom:2 }}>{k.label}</p>
                      <p style={{ fontSize:14,fontWeight:800,color:k.color,fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{k.value}</p>
                    </div>
                  ))}
                </div>
                {/* Table */}
                <div className="overflow-y-auto flex-1">
                  <table className="w-full" style={{ fontSize:12, tableLayout:'fixed' }}>
                    <thead className="sticky top-0" style={{ background:'#f8fafc' }}>
                      <tr style={{ borderBottom:'1px solid #f1f5f9' }}>
                        {[
                          { label:'Kode', col:'kode' },
                          { label:'Nama Aset', col:'nama' },
                          { label:'Kategori', col:'kategori' },
                          { label:'Tgl Perolehan', col:'tglPerolehan' },
                          { label:'Nilai Perolehan', col:'nilaiPerolehan' },
                          { label:'Nilai Buku', col:'nilaiBuku' },
                          { label:'Penanggungjawab', col:'penanggungjawab' },
                          { label:'Lokasi', col:'lokasi' },
                        ].map(h => (
                          <th key={h.col} className="text-left px-4 py-2.5" style={{ color:'#144f6b',fontWeight:600,fontSize:11,whiteSpace:'nowrap',width:modalKondisiColW[h.col],position:'relative' }}>
                            {h.label}
                            <ColResizeHandle onMouseDown={modalKondisiStartResize(h.col)} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {condAssets.map((a,i) => {
                        const dep = calcDep(a);
                        return (
                          <tr key={a.id} onClick={() => { setSelectedAsset(a); setShowDetailModal(true); }} style={{ borderBottom:'1px solid #f8fafc', background:i%2===0?'#fff':'#fafafa' }}>
                            <td className="px-4 py-2.5" style={{ color:cfg.text,fontWeight:700,fontFamily:'monospace',fontSize:11 }}>{a.assetCode}</td>
                            <td className="px-4 py-2.5" style={{ maxWidth:200 }}>
                              <p data-tooltip={a.name} data-tooltip-truncate style={{ color:'#1e293b',fontWeight:600 }} className="truncate">{a.name}</p>
                              {a.ministryUnit && <p style={{ fontSize:10,color:'#94a3b8' }}>{a.ministryUnit}</p>}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full" style={{ background:CAT_COLOR[a.category]||'#64748b' }} />
                                <span style={{ color:'#4b5563' }}>{a.category}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap" style={{ color:'#64748b' }}>
                              {new Date(a.acquisitionDate).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}
                            </td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap" style={{ color:'#4b5563',fontWeight:500 }}>{compactRp(a.acquisitionValue)}</td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap" style={{ color:'#1A77A3',fontWeight:700 }}>{compactRp(dep.bookValue)}</td>
                            <td className="px-4 py-2.5" style={{ color:'#4b5563',maxWidth:130 }}>
                              <span data-tooltip={a.responsiblePerson||'-'} data-tooltip-truncate className="truncate block">{a.responsiblePerson||'-'}</span>
                            </td>
                            <td className="px-4 py-2.5" style={{ color:'#64748b',maxWidth:140 }}>
                              <span data-tooltip={a.location} data-tooltip-truncate className="truncate block">{a.location}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:'#f0fdf4', borderTop:'2px solid #b8d5e8' }}>
                        <td className="px-4 py-2.5" colSpan={4} style={{ fontSize:12,fontWeight:700,color:'#1e293b' }}>TOTAL ({condAssets.length} aset)</td>
                        <td className="px-4 py-2.5 text-right" style={{ fontSize:12,fontWeight:700,color:'#4b5563' }}>{compactRp(totalCondAcq)}</td>
                        <td className="px-4 py-2.5 text-right" style={{ fontSize:12,fontWeight:700,color:'#1A77A3' }}>{compactRp(totalCondBook)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          );
        }

        /* ── MODAL: DETAIL ASET ── */
        if (laporanModal.type === 'asset') {
          const asset = assets.find(a => a.id === laporanModal.assetId);
          if (!asset) return null;
          const dep = calcDep(asset);
          const assetMaints = getAssetMaints(asset.id);
          const totalMaintCostAsset = assetMaints.reduce((s,m) => s+m.cost, 0);
          const catColor = CAT_COLOR[asset.category] || '#64748b';
          const catBg = CAT_BG[asset.category] || '#f8fafc';
          const depPctAsset = asset.acquisitionValue > 0 ? (dep.accumulated / asset.acquisitionValue * 100).toFixed(1) : '0';
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background:'rgba(0,0,0,0.55)' }}
              onClick={e => { if(e.target===e.currentTarget) closeLaporan(); }}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" style={{ transform:`translate(${offsetLaporanAsset.x}px,${offsetLaporanAsset.y}px)` }}>
                {/* Header */}
                <div className="px-6 py-4 border-b flex-shrink-0" style={{ borderColor:'#f1f5f9', cursor:'move' }} onMouseDown={onMouseDownLaporanAsset}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {asset.photo ? (
                        <img src={asset.photo} alt={asset.name} className="w-14 h-14 rounded-xl object-cover border flex-shrink-0" style={{ borderColor:'#e2e8f0' }}
                          onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                      ) : (
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:catBg, border:`1.5px solid ${catColor}33` }}>
                          <CatIcon cat={asset.category} />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span style={{ fontSize:12,fontWeight:700,color:catColor,fontFamily:'monospace' }}>{asset.assetCode}</span>
                          <CondBadge cond={asset.condition} />
                        </div>
                        <h2 style={{ fontSize:15,fontWeight:800,color:'#0f172a',marginTop:2 }}>{asset.name}</h2>
                        <p style={{ fontSize:11,color:'#64748b',marginTop:1 }}>{asset.category} · {asset.location}</p>
                      </div>
                    </div>
                    <button onClick={closeLaporan} data-tooltip="Tutup" className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-100 transition-all flex-shrink-0" style={{ border:'1px solid #e2e8f0' }}>
                      <X style={{ width:15,height:15,color:'#64748b' }} />
                    </button>
                  </div>
                </div>
                <div className="overflow-y-auto flex-1">
                  {/* Finansial Strip */}
                  <div className="grid grid-cols-2 gap-px border-b" style={{ background:'#f1f5f9', borderColor:'#f1f5f9' }}>
                    {[
                      { label:'Nilai Perolehan', value:compactRp(asset.acquisitionValue), color:'#4b5563' },
                      { label:'Nilai Buku', value:compactRp(dep.bookValue), color:'#1A77A3' },
                      { label:'Penyusutan/Tahun', value:dep.annual>0?compactRp(dep.annual):'-', color:'#9c9486' },
                      { label:'Rasio Penyusutan', value:`${depPctAsset}%`, color:'#7c3aed' },
                    ].map((k,i) => (
                      <div key={i} className="bg-white px-5 py-3">
                        <p style={{ fontSize:10.5,color:'#94a3b8',marginBottom:2 }}>{k.label}</p>
                        <p style={{ fontSize:16,fontWeight:800,color:k.color,fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{k.value}</p>
                      </div>
                    ))}
                  </div>
                  {/* Info Grid */}
                  <div className="p-5 space-y-4">
                    {/* Depreciation bar */}
                    <div className="rounded-xl p-4" style={{ background:'#f8fafc', border:'1px solid #f1f5f9' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span style={{ fontSize:11.5,color:'#4b5563',fontWeight:600 }}>Progres Penyusutan</span>
                        <span style={{ fontSize:11,color:'#64748b' }}>{depPctAsset}% dari nilai perolehan</span>
                      </div>
                      <div className="h-3 rounded-full overflow-hidden" style={{ background:'#e2e8f0' }}>
                        <div className="h-full rounded-full" style={{ width:`${Math.min(100,parseFloat(depPctAsset))}%`, background:`linear-gradient(90deg,#1A77A3,#1A77A3)` }} />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span style={{ fontSize:10,color:'#94a3b8' }}>Perolehan: {compactRp(asset.acquisitionValue)}</span>
                        <span style={{ fontSize:10,color:'#94a3b8' }}>Sisa: {dep.remaining > 0 ? `${dep.remaining.toFixed(1)} thn` : 'Habis'}</span>
                      </div>
                    </div>
                    {/* Loan banner in laporan modal */}
                    {(asset.loanStatus||'Tersedia') === 'Dipinjam' && (
                      <div className="rounded-xl p-3 flex items-start gap-2" style={{ background:'#f6f4f0',border:'1px solid #e8e4d8' }}>
                        <Users style={{ width:14,height:14,color:'#9c9486',flexShrink:0,marginTop:2 }} />
                        <div>
                          <p style={{ fontSize:11.5,fontWeight:700,color:'#144f6b' }}>Dipinjam oleh: {asset.borrowedByName||'-'}</p>
                          <div className="flex gap-3 flex-wrap">
                            {asset.loanDate && <span style={{ fontSize:10.5,color:'#78350f' }}>Tgl Pinjam: {new Date(asset.loanDate).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</span>}
                            {asset.expectedReturnDate && <span style={{ fontSize:10.5,color:'#78350f' }}>Estimasi Kembali: {new Date(asset.expectedReturnDate).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</span>}
                          </div>
                          {asset.loanNotes && <p style={{ fontSize:10.5,color:'#144f6b',fontStyle:'italic',marginTop:2 }}>{asset.loanNotes}</p>}
                        </div>
                      </div>
                    )}
                    {/* Detail Rows */}
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label:'Metode Perolehan', value: asset.acquisitionMethod },
                        { label:'Tanggal Perolehan', value: new Date(asset.acquisitionDate).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}) },
                        { label:'Masa Manfaat', value: asset.usefulLifeYears > 0 ? `${asset.usefulLifeYears} tahun` : 'Tidak disusutkan' },
                        { label:'Unit Pelayanan', value: asset.ministryUnit || '-' },
                        { label:'Status Posisi', value: asset.loanStatus || 'Tersedia' },
                        { label:'Penanggungjawab', value: asset.responsiblePerson || '-' },
                        { label:'No. Seri / IMB', value: asset.serialNumber || '-' },
                        { label:'Vendor / Supplier', value: asset.vendor || '-' },
                        { label:'Akumulasi Penyusutan', value: compactRp(dep.accumulated) },
                      ].map((r,i) => (
                        <div key={i} className="rounded-lg px-3 py-2.5" style={{ background:'#f8fafc', border:'1px solid #f1f5f9' }}>
                          <p style={{ fontSize:10,color:'#94a3b8',marginBottom:2 }}>{r.label}</p>
                          <p style={{ fontSize:12,color:'#0f172a',fontWeight:600 }}>{r.value}</p>
                        </div>
                      ))}
                    </div>
                    {asset.description && (
                      <div className="rounded-lg px-3 py-2.5" style={{ background:'#f8fafc', border:'1px solid #f1f5f9' }}>
                        <p style={{ fontSize:10,color:'#94a3b8',marginBottom:2 }}>Deskripsi</p>
                        <p style={{ fontSize:12,color:'#4b5563' }}>{asset.description}</p>
                      </div>
                    )}
                    {/* Riwayat Pemeliharaan */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p style={{ fontSize:12,fontWeight:700,color:'#0f172a' }}>Riwayat Pemeliharaan ({assetMaints.length})</p>
                        <span style={{ fontSize:11,color:'#64748b' }}>Total: {compactRp(totalMaintCostAsset)}</span>
                      </div>
                      {assetMaints.length === 0 ? (
                        <div className="rounded-xl py-6 flex flex-col items-center justify-center" style={{ background:'#f8fafc', border:'1px dashed #e2e8f0' }}>
                          <Wrench style={{ width:24,height:24,color:'#cbd5e1',marginBottom:6 }} />
                          <p style={{ fontSize:11.5,color:'#94a3b8' }}>Belum ada catatan pemeliharaan</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {assetMaints.map(m => {
                            const rc = RESULT_CFG[m.result];
                            return (
                              <div key={m.id} className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ background:'#f8fafc', border:'1px solid #f1f5f9' }}>
                                <div className="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5" style={{ background:rc.text, minHeight:36 }} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <span style={{ fontSize:11,color:'#64748b',whiteSpace:'nowrap' }}>{new Date(m.date).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</span>
                                    <span className="px-1.5 py-0.5 rounded-lg" style={{ fontSize:10,background:'#f1f5f9',color:'#475569' }}>{m.type}</span>
                                    <span className="px-1.5 py-0.5 rounded-full" style={{ fontSize:10,fontWeight:600,color:rc.text,background:rc.bg }}>{m.result}</span>
                                  </div>
                                  <p style={{ fontSize:12,color:'#0f172a',fontWeight:500 }}>{m.description}</p>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span style={{ fontSize:10.5,color:'#64748b' }}>🔧 {m.technician}</span>
                                    <span style={{ fontSize:10.5,color:'#9c9486',fontWeight:600 }}>{compactRp(m.cost)}</span>
                                  </div>
                                  {m.notes && <p style={{ fontSize:10.5,color:'#94a3b8',marginTop:2,fontStyle:'italic' }}>Catatan: {m.notes}</p>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        /* ── MODAL: DETAIL PEMELIHARAAN ── */
        if (laporanModal.type === 'maintenance') {
          const maint = maintenances.find(m => m.id === laporanModal.maintId);
          if (!maint) return null;
          const asset = assets.find(a => a.id === maint.assetId);
          const rc = RESULT_CFG[maint.result];
          const dep = asset ? calcDep(asset) : null;
          const catColor = asset ? (CAT_COLOR[asset.category] || '#64748b') : '#64748b';
          const catBg = asset ? (CAT_BG[asset.category] || '#f8fafc') : '#f8fafc';
          const allAssetMaints = asset ? getAssetMaints(asset.id) : [];
          const maintIndex = allAssetMaints.findIndex(m => m.id === maint.id);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background:'rgba(0,0,0,0.55)' }}
              onClick={e => { if(e.target===e.currentTarget) closeLaporan(); }}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden" style={{ transform:`translate(${offsetLaporanMaint.x}px,${offsetLaporanMaint.y}px)` }}>
                {/* Header */}
                <div className="px-6 py-4 border-b flex-shrink-0" style={{ borderColor:'#f1f5f9', background:'#f6f4f0', cursor:'move' }} onMouseDown={onMouseDownLaporanMaint}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background:'#fff7ed', border:'1.5px solid #fed7aa' }}>
                        <Wrench style={{ width:18,height:18,color:'#9c9486' }} />
                      </div>
                      <div>
                        <h2 style={{ fontSize:15,fontWeight:800,color:'#0f172a' }}>Detail Pemeliharaan</h2>
                        <p style={{ fontSize:11,color:'#64748b',marginTop:1 }}>{maint.type} · {new Date(maint.date).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</p>
                      </div>
                    </div>
                    <button onClick={closeLaporan} data-tooltip="Tutup" className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white transition-all" style={{ border:'1px solid #fed7aa' }}>
                      <X style={{ width:15,height:15,color:'#64748b' }} />
                    </button>
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 p-5 space-y-4">
                  {/* Status badge + biaya */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="px-3 py-1.5 rounded-full" style={{ fontSize:12,fontWeight:700,color:rc.text,background:rc.bg,border:`1px solid ${rc.text}33` }}>{maint.result}</span>
                    <span className="px-3 py-1.5 rounded-full" style={{ fontSize:12,fontWeight:700,color:'#9c9486',background:'#f6f4f0',border:'1px solid #fed7aa' }}>{compactRp(maint.cost)}</span>
                    <span className="px-3 py-1.5 rounded-full" style={{ fontSize:12,color:'#475569',background:'#f1f5f9',border:'1px solid #e2e8f0' }}>{maint.type}</span>
                    {maintIndex >= 0 && <span style={{ fontSize:11,color:'#94a3b8' }}>Pemeliharaan ke-{allAssetMaints.length - maintIndex} dari {allAssetMaints.length}</span>}
                  </div>
                  {/* Deskripsi */}
                  <div className="rounded-xl p-4" style={{ background:'#f8fafc', border:'1px solid #f1f5f9' }}>
                    <p style={{ fontSize:10.5,color:'#94a3b8',marginBottom:4 }}>DESKRIPSI PEKERJAAN</p>
                    <p style={{ fontSize:13,color:'#0f172a',fontWeight:500,lineHeight:1.6 }}>{maint.description}</p>
                  </div>
                  {maint.notes && (
                    <div className="rounded-xl p-4" style={{ background:'#f6f4f0', border:'1px solid #fed7aa' }}>
                      <p style={{ fontSize:10.5,color:'#144f6b',marginBottom:4,fontWeight:600 }}>CATATAN HASIL</p>
                      <p style={{ fontSize:12.5,color:'#78350f',lineHeight:1.6,fontStyle:'italic' }}>{maint.notes}</p>
                    </div>
                  )}
                  {/* Grid detail */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label:'Teknisi / Vendor', value: maint.technician },
                      { label:'Biaya', value: formatRp(maint.cost) },
                      { label:'Tanggal', value: new Date(maint.date).toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) },
                      { label:'Jenis Pemeliharaan', value: maint.type },
                    ].map((r,i) => (
                      <div key={i} className="rounded-lg px-3 py-2.5" style={{ background:'#f8fafc', border:'1px solid #f1f5f9' }}>
                        <p style={{ fontSize:10,color:'#94a3b8',marginBottom:2 }}>{r.label}</p>
                        <p style={{ fontSize:12.5,color:'#0f172a',fontWeight:600 }}>{r.value}</p>
                      </div>
                    ))}
                  </div>
                  {/* Aset terkait */}
                  {asset && (
                    <div>
                      <p style={{ fontSize:12,fontWeight:700,color:'#0f172a',marginBottom:8 }}>Aset Terkait</p>
                      <div className="rounded-xl p-4 flex items-start gap-3" style={{ background:catBg, border:`1.5px solid ${catColor}33` }}>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:catColor+'22' }}>
                          <CatIcon cat={asset.category} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span style={{ fontSize:11,fontWeight:700,color:catColor,fontFamily:'monospace' }}>{asset.assetCode}</span>
                            <CondBadge cond={asset.condition} />
                          </div>
                          <p data-tooltip={asset.name} data-tooltip-truncate style={{ fontSize:13,fontWeight:700,color:'#0f172a' }} className="truncate">{asset.name}</p>
                          <p style={{ fontSize:11,color:'#64748b',marginTop:2 }}>{asset.category} · {asset.location}</p>
                          {dep && (
                            <div className="flex items-center gap-4 mt-2 flex-wrap">
                              <span style={{ fontSize:11,color:'#4b5563' }}>Nilai Buku: <strong style={{ color:'#1A77A3' }}>{compactRp(dep.bookValue)}</strong></span>
                              <span style={{ fontSize:11,color:'#4b5563' }}>Perolehan: <strong>{compactRp(asset.acquisitionValue)}</strong></span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Riwayat lain aset ini */}
                  {allAssetMaints.length > 1 && (
                    <div>
                      <p style={{ fontSize:12,fontWeight:700,color:'#0f172a',marginBottom:8 }}>Riwayat Lain Aset Ini ({allAssetMaints.length - 1} catatan lainnya)</p>
                      <div className="space-y-2">
                        {allAssetMaints.filter(m => m.id !== maint.id).slice(0,4).map(m2 => {
                          const rc2 = RESULT_CFG[m2.result];
                          return (
                            <div key={m2.id}
                              onClick={() => setLaporanModal({ type:'maintenance', maintId: m2.id })}
                              className="flex items-center gap-3 rounded-xl px-4 py-2.5 transition-all"
                              style={{ background:'#f8fafc', border:'1px solid #f1f5f9', cursor:'pointer' }}
                              onMouseEnter={e => (e.currentTarget.style.background='#f6f4f0')}
                              onMouseLeave={e => (e.currentTarget.style.background='#f8fafc')}>
                              <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ background:rc2.text }} />
                              <div className="flex-1 min-w-0">
                                <p data-tooltip={m2.description} data-tooltip-truncate style={{ fontSize:12,color:'#0f172a',fontWeight:500 }} className="truncate">{m2.description}</p>
                                <p style={{ fontSize:10.5,color:'#64748b' }}>{new Date(m2.date).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})} · {m2.type}</p>
                              </div>
                              <div className="flex-shrink-0 text-right">
                                <span className="block px-2 py-0.5 rounded-full" style={{ fontSize:10,fontWeight:600,color:rc2.text,background:rc2.bg }}>{m2.result}</span>
                                <span style={{ fontSize:10.5,color:'#9c9486',fontWeight:600 }}>{compactRp(m2.cost)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        }

        return null;
      })()}

      {/* ── MODAL: TAMBAH/EDIT ASET ── */}
      {showAssetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background:'rgba(0,0,0,0.5)' }}
          onClick={e=>{ if(e.target===e.currentTarget) setShowAssetModal(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ transform:`translate(${offsetAssetModal.x}px,${offsetAssetModal.y}px)` }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor:'#f1f5f9', cursor:'move' }} onMouseDown={onMouseDownAssetModal}>
              <div>
                <h2 style={{ fontSize:15,fontWeight:800,color:'#0f172a' }}>{editAsset ? 'Edit Aset' : 'Tambah Aset Baru'}</h2>
                <p style={{ fontSize:11,color:'#94a3b8' }}>{editAsset ? editAsset.assetCode : `Kode: ${nextCode()}`}</p>
              </div>
              <button onClick={()=>setShowAssetModal(false)} data-tooltip="Tutup" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
                <X style={{ width:16,height:16 }} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Nama Aset *</label>
                  <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Nama lengkap aset"
                    className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:13 }} />
                </div>
                <div>
                  <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Kategori</label>
                  <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value as AssetCategory}))}
                    className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:13 }}>
                    {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Kondisi</label>
                  <select value={form.condition} onChange={e=>setForm(f=>({...f,condition:e.target.value as AssetCondition}))}
                    className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:13 }}>
                    {CONDITIONS.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Lokasi</label>
                  <input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} placeholder="Lokasi aset di gereja"
                    className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:13 }} />
                </div>
                <div>
                  <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Metode Perolehan</label>
                  <select value={form.acquisitionMethod} onChange={e=>setForm(f=>({...f,acquisitionMethod:e.target.value as AcquisitionMethod}))}
                    className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:13 }}>
                    {ACQ_METHODS.map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Tanggal Perolehan</label>
                  <input type="date" value={form.acquisitionDate} onChange={e=>setForm(f=>({...f,acquisitionDate:e.target.value}))}
                    className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:13 }} />
                </div>
                <div>
                  <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>
                    Nilai Perolehan (Rp)
                    {form.acquisitionMethod==='Pembelian' && !editAsset && <span style={{ color:'#1A77A3',fontSize:9.5,marginLeft:4 }}>→ otomatis ke Keuangan</span>}
                  </label>
                  <input type="number" value={form.acquisitionValue||''} onChange={e=>setForm(f=>({...f,acquisitionValue:Number(e.target.value)}))} placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:13 }} />
                </div>
                <div>
                  <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Masa Manfaat (Tahun)</label>
                  <input type="number" value={form.usefulLifeYears||''} onChange={e=>setForm(f=>({...f,usefulLifeYears:Number(e.target.value)}))} placeholder="0 = tidak disusutkan"
                    className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:13 }} />
                </div>
                <div>
                  <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Penanggungjawab</label>
                  <select
                    value={form.memberId||''}
                    onChange={e => {
                      const id = e.target.value;
                      const m = members.find(mb => mb.id === id);
                      setForm(f => ({ ...f, memberId: id, responsiblePerson: m?.fullName || '' }));
                    }}
                    className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:13 }}>
                    <option value="">– Pilih –</option>
                    {[...members].sort((a:any,b:any)=>a.fullName.localeCompare(b.fullName,'id')).map((m:any)=><option key={m.id} value={m.id}>{m.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Unit Pelayanan</label>
                  <select value={form.ministryUnit} onChange={e=>setForm(f=>({...f,ministryUnit:e.target.value}))}
                    className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:13 }}>
                    <option value="">– Tidak ada –</option>
                    {ministryUnits.map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Nomor Seri / Kode IMB</label>
                  <input value={form.serialNumber} onChange={e=>setForm(f=>({...f,serialNumber:e.target.value}))} placeholder="SN / IMB / Plat"
                    className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:13 }} />
                </div>
                <div>
                  <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Vendor / Pemasok</label>
                  <input value={form.vendor} onChange={e=>setForm(f=>({...f,vendor:e.target.value}))} placeholder="Nama vendor/toko"
                    className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:13 }} />
                </div>
                <div className="col-span-2">
                  <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Deskripsi</label>
                  <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={2} placeholder="Deskripsi singkat aset"
                    className="w-full px-3 py-2 rounded-xl border outline-none text-sm resize-none" style={{ borderColor:'#e2e8f0', fontSize:12.5 }} />
                </div>
                <div className="col-span-2">
                  <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Catatan Tambahan</label>
                  <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} placeholder="Catatan tambahan"
                    className="w-full px-3 py-2 rounded-xl border outline-none text-sm resize-none" style={{ borderColor:'#e2e8f0', fontSize:12.5 }} />
                </div>
              </div>

              {/* ── Foto Aset ── */}
              <div className="rounded-xl p-4 border" style={{ borderColor:'#e2e8f0', background:'#fafafa' }}>
                <p style={{ fontSize:12,fontWeight:700,color:'#0f172a',marginBottom:10 }}>📷 Foto Aset</p>
                <div className="grid grid-cols-2 gap-3 items-start">
                  <div>
                    <label style={{ fontSize:11,fontWeight:600,color:'#4b5563',display:'block',marginBottom:4 }}>URL Foto</label>
                    <input value={form.photo||''} onChange={e=>setForm(f=>({...f,photo:e.target.value}))}
                      placeholder="https://... atau biarkan kosong"
                      className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:12 }} />
                    <p style={{ fontSize:10,color:'#94a3b8',marginTop:3 }}>Masukkan URL gambar aset</p>
                  </div>
                  <div>
                    <label style={{ fontSize:11,fontWeight:600,color:'#4b5563',display:'block',marginBottom:4 }}>Upload Foto</label>
                    <input type="file" accept="image/*"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) { toast.error('Ukuran foto maksimal 2MB'); return; }
                        const reader = new FileReader();
                        reader.onload = ev => setForm(f => ({ ...f, photo: ev.target?.result as string }));
                        reader.readAsDataURL(file);
                      }}
                      className="w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#f0f7fb] file:text-[#144f6b] hover:file:bg-[#f0ede5]"
                    />
                    <p style={{ fontSize:10,color:'#94a3b8',marginTop:3 }}>Maks. 2 MB (JPG/PNG)</p>
                  </div>
                </div>
                {form.photo && (
                  <div className="mt-3 flex items-start gap-3">
                    <img src={form.photo} alt="Preview" className="w-24 h-20 rounded-xl object-cover border" style={{ borderColor:'#e2e8f0' }}
                      onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                    <div>
                      <p style={{ fontSize:11,color:'#1A77A3',fontWeight:600 }}>✓ Foto tersedia</p>
                      <button type="button" onClick={() => setForm(f => ({ ...f, photo: '' }))}
                        className="mt-1 text-xs text-red-500 hover:text-red-700">Hapus foto</button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Posisi & Peminjaman Aset ── */}
              <div className="rounded-xl p-4 border" style={{ borderColor:'#e2e8f0', background:'#fafafa' }}>
                <p style={{ fontSize:12,fontWeight:700,color:'#0f172a',marginBottom:10 }}>📍 Posisi & Status Peminjaman</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 md:col-span-1">
                    <label style={{ fontSize:11,fontWeight:600,color:'#4b5563',display:'block',marginBottom:4 }}>Status Posisi Aset</label>
                    <div className="flex gap-2 flex-wrap">
                      {LOAN_STATUSES.map(s => {
                        const c = LOAN_STATUS_CFG[s];
                        const active = (form.loanStatus||'Tersedia') === s;
                        return (
                          <button key={s} type="button"
                            onClick={() => setForm(f => ({
                              ...f, loanStatus: s,
                              ...(s !== 'Dipinjam' ? { borrowedById:'', borrowedByName:'', loanDate:'', expectedReturnDate:'', loanNotes:'' } : {})
                            }))}
                            className="px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all"
                            style={{
                              background: active ? c.bg : 'white',
                              color: active ? c.text : '#64748b',
                              borderColor: active ? c.border : '#e2e8f0',
                              boxShadow: active ? `0 0 0 2px ${c.border}` : 'none',
                            }}>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Loan fields — only visible when Dipinjam */}
                  {(form.loanStatus||'Tersedia') === 'Dipinjam' && (
                    <>
                      <div className="col-span-2">
                        <div className="h-px my-2" style={{ background:'#e8e4d8' }} />
                        <p style={{ fontSize:11,fontWeight:700,color:'#9c9486',marginBottom:8 }}>Detail Peminjaman</p>
                      </div>
                      <div>
                        <label style={{ fontSize:11,fontWeight:600,color:'#4b5563',display:'block',marginBottom:4 }}>Dipinjam oleh (Jemaat)</label>
                        <select
                          value={form.borrowedById||''}
                          onChange={e => {
                            const id = e.target.value;
                            const m = members.find((mb:any) => mb.id === id);
                            setForm(f => ({ ...f, borrowedById: id, borrowedByName: m?.fullName || '' }));
                          }}
                          className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:12 }}>
                          <option value="">– Pilih jemaat –</option>
                          {[...members].sort((a:any,b:any)=>a.fullName.localeCompare(b.fullName,'id')).map((m:any) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize:11,fontWeight:600,color:'#4b5563',display:'block',marginBottom:4 }}>Tanggal Pinjam</label>
                        <input type="date" value={form.loanDate||''} onChange={e=>setForm(f=>({...f,loanDate:e.target.value}))}
                          className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:12 }} />
                      </div>
                      <div>
                        <label style={{ fontSize:11,fontWeight:600,color:'#4b5563',display:'block',marginBottom:4 }}>Estimasi Kembali</label>
                        <input type="date" value={form.expectedReturnDate||''} onChange={e=>setForm(f=>({...f,expectedReturnDate:e.target.value}))}
                          className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:12 }} />
                      </div>
                      <div>
                        <label style={{ fontSize:11,fontWeight:600,color:'#4b5563',display:'block',marginBottom:4 }}>Catatan Peminjaman</label>
                        <input value={form.loanNotes||''} onChange={e=>setForm(f=>({...f,loanNotes:e.target.value}))}
                          placeholder="Tujuan peminjaman, syarat, dll."
                          className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0', fontSize:12 }} />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Preview depreciation */}
              {form.acquisitionValue > 0 && form.usefulLifeYears > 0 && (
                <div className="rounded-xl p-3" style={{ background:'#f0fdf4',border:'1px solid #b8d5e8' }}>
                  <p style={{ fontSize:11,fontWeight:700,color:'#1A77A3',marginBottom:4 }}>Estimasi Penyusutan (Garis Lurus)</p>
                  <div className="flex gap-4 flex-wrap">
                    <span style={{ fontSize:11.5,color:'#4b5563' }}>Rate: <strong>{((1/form.usefulLifeYears)*100).toFixed(1)}%/thn</strong></span>
                    <span style={{ fontSize:11.5,color:'#4b5563' }}>Penyusutan/thn: <strong style={{ color:'#dc2626' }}>{compactRp(form.acquisitionValue/form.usefulLifeYears)}</strong></span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={()=>setShowAssetModal(false)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-gray-50" style={{ borderColor:'#e2e8f0', color:'#64748b' }}>Batal</button>
              <button onClick={saveAsset} disabled={!form.name.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                style={{ background:'#1A77A3' }}>
                {editAsset ? 'Simpan Perubahan' : 'Tambah Aset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DETAIL ASET ── */}
      {showDetailModal && selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background:'rgba(0,0,0,0.5)' }}
          onClick={e=>{ if(e.target===e.currentTarget) setShowDetailModal(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" style={{ transform:`translate(${offsetDetailModal.x}px,${offsetDetailModal.y}px)` }}>
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor:'#f1f5f9', cursor:'move' }} onMouseDown={onMouseDownDetailModal}>
              <div className="flex items-center gap-3">
                {selectedAsset.photo ? (
                  <img src={selectedAsset.photo} alt={selectedAsset.name}
                    className="w-12 h-12 rounded-xl object-cover border flex-shrink-0" style={{ borderColor:'#e2e8f0' }}
                    onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                ) : (
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:CAT_BG[selectedAsset.category] }}>
                    <span style={{ color:CAT_COLOR[selectedAsset.category] }}><CatIcon cat={selectedAsset.category} /></span>
                  </div>
                )}
                <div>
                  <h2 style={{ fontSize:14,fontWeight:800,color:'#0f172a' }}>{selectedAsset.name}</h2>
                  <p style={{ fontSize:11,color:'#94a3b8' }}>{selectedAsset.assetCode} · {selectedAsset.category}</p>
                  <div className="mt-1"><LoanBadge status={selectedAsset.loanStatus||'Tersedia'} /></div>
                </div>
              </div>
              <button onClick={()=>setShowDetailModal(false)} data-tooltip="Tutup" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100"><X style={{ width:16,height:16 }} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Foto Aset (large preview) */}
              {selectedAsset.photo && (
                <div className="rounded-xl overflow-hidden border" style={{ borderColor:'#e2e8f0' }}>
                  <img src={selectedAsset.photo} alt={selectedAsset.name}
                    className="w-full object-cover" style={{ maxHeight:200 }}
                    onError={e => { (e.target as HTMLImageElement).parentElement!.style.display='none'; }} />
                </div>
              )}

              {/* Loan Info banner when Dipinjam */}
              {(selectedAsset.loanStatus||'Tersedia') === 'Dipinjam' && (() => {
                const od2 = isOverdue(selectedAsset);
                return (
                <div className="rounded-xl p-3 flex items-start gap-3"
                  style={{ background: od2 ? '#fef2f2' : '#f6f4f0', border: od2 ? '1px solid #fca5a5' : '1px solid #e8e4d8' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: od2 ? '#fee2e2' : '#fef3c7' }}>
                    {od2
                      ? <AlertTriangle style={{ width:16,height:16,color:'#dc2626' }} />
                      : <Users style={{ width:16,height:16,color:'#9c9486' }} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p style={{ fontSize:12,fontWeight:700,color: od2 ? '#dc2626' : '#144f6b' }}>
                        {od2 ? '⚠ Aset Melewati Batas Pengembalian!' : 'Aset Sedang Dipinjam'}
                      </p>
                    </div>
                    {selectedAsset.borrowedByName && <p style={{ fontSize:11.5,color: od2 ? '#dc2626' : '#9c9486',marginTop:1 }}>Peminjam: <strong>{selectedAsset.borrowedByName}</strong></p>}
                    <div className="flex gap-3 mt-1 flex-wrap">
                      {selectedAsset.loanDate && <span style={{ fontSize:10.5,color:'#78350f' }}>Tanggal pinjam: {fmtDateShort(selectedAsset.loanDate)}</span>}
                      {selectedAsset.expectedReturnDate && (
                        <span style={{ fontSize:10.5,color: od2 ? '#dc2626' : '#78350f',fontWeight: od2 ? 700 : 400 }}>
                          {od2 ? '⚠ Batas kembali' : 'Kembali'}: {fmtDateShort(selectedAsset.expectedReturnDate)}
                        </span>
                      )}
                    </div>
                    {selectedAsset.loanNotes && <p style={{ fontSize:10.5,color:'#144f6b',marginTop:2,fontStyle:'italic' }}>{selectedAsset.loanNotes}</p>}
                  </div>
                </div>
                );
              })()}

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label:'Kondisi', value:<CondBadge cond={selectedAsset.condition} /> },
                  { label:'Status Posisi', value:<LoanBadge status={selectedAsset.loanStatus||'Tersedia'} /> },
                  { label:'Metode Perolehan', value:selectedAsset.acquisitionMethod },
                  { label:'Tanggal Perolehan', value:new Date(selectedAsset.acquisitionDate).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}) },
                  { label:'Masa Manfaat', value:selectedAsset.usefulLifeYears > 0 ? selectedAsset.usefulLifeYears+' tahun' : 'Tidak disusutkan' },
                  { label:'Nilai Perolehan', value:<span style={{ color:'#4b5563',fontWeight:700 }}>{formatRp(selectedAsset.acquisitionValue)}</span> },
                  { label:'Nilai Buku', value:<span style={{ color:'#1A77A3',fontWeight:700 }}>{formatRp(calcDep(selectedAsset).bookValue)}</span> },
                  { label:'Lokasi', value:selectedAsset.location },
                  { label:'Penanggungjawab', value:selectedAsset.responsiblePerson||'-' },
                  { label:'Unit Pelayanan', value:selectedAsset.ministryUnit||'-' },
                  { label:'No. Seri', value:selectedAsset.serialNumber||'-' },
                  { label:'Vendor', value:selectedAsset.vendor||'-' },
                ].map((row,i) => (
                  <div key={i} className="rounded-xl p-3" style={{ background:'#f8fafc' }}>
                    <p style={{ fontSize:10,fontWeight:700,color:'#94a3b8',marginBottom:3 }}>{row.label}</p>
                    <div style={{ fontSize:12.5,color:'#4b5563' }}>{row.value}</div>
                  </div>
                ))}
              </div>
              {selectedAsset.description && (
                <div className="rounded-xl p-3" style={{ background:'#f8fafc' }}>
                  <p style={{ fontSize:10,fontWeight:700,color:'#94a3b8',marginBottom:2 }}>Deskripsi</p>
                  <p style={{ fontSize:12,color:'#4b5563' }}>{selectedAsset.description}</p>
                </div>
              )}

              {/* Dokumen Pendukung */}
              <div className="rounded-xl p-3 border" style={{ borderColor:'#f1f5f9',background:'#fafbfc' }}>
                <p style={{ fontSize:12,color:'#64748b',fontWeight:700,marginBottom:10 }}>Dokumen Pendukung ({assetDocs.length})</p>
                <input ref={docFileInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleDocFileSelected}/>
                {canEdit && (
                  <button onClick={handleUploadDocClick} disabled={uploadingDoc}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed text-sm font-semibold transition-colors disabled:opacity-60 mb-3"
                    style={{ borderColor:'#b8d5e8',color:'#1A77A3',background:'#f0fdf4' }}>
                    {uploadingDoc ? <Loader2 style={{ width:14,height:14 }} className="animate-spin"/> : <Upload style={{ width:14,height:14 }}/>}
                    {uploadingDoc ? 'Mengunggah...' : 'Unggah Dokumen PDF'}
                  </button>
                )}
                {assetDocs.length === 0 ? (
                  <p style={{ fontSize:12,color:'#94a3b8',textAlign:'center',padding:'8px 0' }}>Belum ada dokumen pendukung</p>
                ) : (
                  <div className="space-y-2">
                    {assetDocs.map(doc => (
                      <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-white" style={{ borderColor:'#f1f5f9' }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background:'#fef2f2' }}>
                          <FileText style={{ width:16,height:16 }} className="text-[#dc2626]"/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate" style={{ fontSize:12.5,fontWeight:600,color:'#334155' }}>{doc.fileName}</p>
                          <p style={{ fontSize:11,color:'#94a3b8' }}>{formatBytes(doc.fileSize)} · {fmtDateShort(doc.uploadedAt)} · {doc.uploadedBy}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button data-tooltip="Lihat" onClick={()=>handleViewDocument(doc)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-[#1A77A3] transition-colors"><Eye style={{ width:14,height:14 }}/></button>
                          {canDelete && (
                            <button data-tooltip="Hapus" onClick={()=>handleDeleteDocument(doc)} className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"><Trash2 style={{ width:14,height:14 }}/></button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Maintenance history */}
              <div>
                <h3 style={{ fontSize:13,fontWeight:700,color:'#0f172a',marginBottom:8 }}>Riwayat Pemeliharaan ({getAssetMaints(selectedAsset.id).length})</h3>
                <div className="space-y-2">
                  {getAssetMaints(selectedAsset.id).length === 0 && (
                    <p style={{ fontSize:12,color:'#94a3b8',textAlign:'center',padding:'16px 0' }}>Belum ada catatan pemeliharaan</p>
                  )}
                  {getAssetMaints(selectedAsset.id).slice(0,5).map(m => (
                    <div key={m.id} className="rounded-xl p-3 border" style={{ borderColor:'#f1f5f9' }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p style={{ fontSize:12,fontWeight:600,color:'#0f172a' }}>{m.description}</p>
                          <p style={{ fontSize:10.5,color:'#64748b',marginTop:1 }}>{m.type} · {m.technician} · {new Date(m.date).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</p>
                          {m.notes && <p style={{ fontSize:10.5,color:'#94a3b8',marginTop:1 }}>{m.notes}</p>}
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p style={{ fontSize:12,fontWeight:700,color:'#4b5563',whiteSpace:'nowrap' }}>{compactRp(m.cost)}</p>
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ background:RESULT_CFG[m.result].bg,color:RESULT_CFG[m.result].text }}>{m.result}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Loan history */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <History style={{ width:14,height:14,color:'#7c3aed' }} />
                  <h3 style={{ fontSize:13,fontWeight:700,color:'#0f172a' }}>
                    Riwayat Peminjaman ({getAssetLoanHistory(selectedAsset.id).length})
                  </h3>
                </div>
                {getAssetLoanHistory(selectedAsset.id).length === 0 ? (
                  <div className="rounded-xl p-4 text-center" style={{ background:'#f8fafc',border:'1.5px dashed #e2e8f0' }}>
                    <History style={{ width:20,height:20,color:'#cbd5e1',margin:'0 auto 6px' }} />
                    <p style={{ fontSize:12,color:'#94a3b8' }}>Belum ada riwayat peminjaman</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {getAssetLoanHistory(selectedAsset.id).map((h, idx) => {
                      const LOAN_HIST_CFG = {
                        'Aktif':        { bg:'#f6f4f0',border:'#e8e4d8',color:'#9c9486',label:'Aktif' },
                        'Dikembalikan': { bg:'#f0fdf4',border:'#b8d5e8',color:'#1A77A3',label:'Dikembalikan' },
                        'Terlambat':    { bg:'#fef2f2',border:'#fecaca',color:'#dc2626',label:'Terlambat' },
                      };
                      const cfg = LOAN_HIST_CFG[h.status];
                      return (
                        <div key={h.id || idx} className="rounded-xl p-3 border" style={{ background:cfg.bg,borderColor:cfg.border }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p style={{ fontSize:12,fontWeight:700,color:'#0f172a' }}>{h.borrowedByName}</p>
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                                  style={{ background:cfg.border,color:cfg.color }}>{cfg.label}</span>
                              </div>
                              <div className="flex gap-3 mt-1 flex-wrap">
                                <span style={{ fontSize:10.5,color:'#64748b' }}>Pinjam: {fmtDateShort(h.loanDate)}</span>
                                {h.expectedReturnDate && <span style={{ fontSize:10.5,color:'#64748b' }}>Est. kembali: {fmtDateShort(h.expectedReturnDate)}</span>}
                                {h.actualReturnDate && <span style={{ fontSize:10.5,color:'#1A77A3',fontWeight:600 }}>✓ Kembali: {fmtDateShort(h.actualReturnDate)}</span>}
                              </div>
                              {h.loanNotes && <p style={{ fontSize:10.5,color:'#64748b',marginTop:2,fontStyle:'italic' }}>{h.loanNotes}</p>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              {canEdit && (
                <button onClick={()=>{ openMaint(selectedAsset); setShowDetailModal(false); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90"
                  style={{ background:'#1A77A3' }}>
                  <Wrench style={{ width:14,height:14,display:'inline',marginRight:6 }} />Catat Pemeliharaan
                </button>
              )}
              {canEdit && (
                <button onClick={()=>{ openEdit(selectedAsset); setShowDetailModal(false); }}
                  className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-gray-50" style={{ borderColor:'#e2e8f0',color:'#4b5563' }}>
                  <Pencil style={{ width:14,height:14,display:'inline',marginRight:6 }} />Edit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CATAT PEMELIHARAAN ── */}
      {showMaintModal && maintForAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background:'rgba(0,0,0,0.5)' }}
          onClick={e=>{ if(e.target===e.currentTarget) setShowMaintModal(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" style={{ transform:`translate(${offsetMaintModal.x}px,${offsetMaintModal.y}px)` }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor:'#f1f5f9', cursor:'move' }} onMouseDown={onMouseDownMaintModal}>
              <div>
                <h2 style={{ fontSize:14,fontWeight:800,color:'#0f172a' }}>Catat Pemeliharaan</h2>
                <p style={{ fontSize:11,color:'#94a3b8' }}>{maintForAsset.assetCode} · {maintForAsset.name}</p>
              </div>
              <button onClick={()=>setShowMaintModal(false)} data-tooltip="Tutup" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100"><X style={{ width:16,height:16 }} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Tanggal</label>
                <input type="date" value={maintForm.date} onChange={e=>setMaintForm(f=>({...f,date:e.target.value}))}
                  className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0',fontSize:13 }} />
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Jenis Pemeliharaan</label>
                <select value={maintForm.type} onChange={e=>setMaintForm(f=>({...f,type:e.target.value as MaintenanceType}))}
                  className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0',fontSize:13 }}>
                  {MAINT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Deskripsi Pekerjaan *</label>
                <textarea value={maintForm.description} onChange={e=>setMaintForm(f=>({...f,description:e.target.value}))} rows={2}
                  placeholder="Jelaskan pekerjaan yang dilakukan..." className="w-full px-3 py-2 rounded-xl border outline-none text-sm resize-none" style={{ borderColor:'#e2e8f0',fontSize:12.5 }} />
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Biaya (Rp)</label>
                <input type="number" value={maintForm.cost||''} onChange={e=>setMaintForm(f=>({...f,cost:Number(e.target.value)}))} placeholder="0"
                  className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0',fontSize:13 }} />
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Teknisi / Vendor</label>
                <input value={maintForm.technician} onChange={e=>setMaintForm(f=>({...f,technician:e.target.value}))} placeholder="Nama teknisi atau vendor"
                  className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0',fontSize:13 }} />
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Hasil</label>
                <select value={maintForm.result} onChange={e=>setMaintForm(f=>({...f,result:e.target.value as MaintenanceResult}))}
                  className="w-full px-3 py-2 rounded-xl border outline-none text-sm" style={{ borderColor:'#e2e8f0',fontSize:13 }}>
                  {MAINT_RESULTS.map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:'#4b5563',display:'block',marginBottom:4 }}>Catatan</label>
                <textarea value={maintForm.notes||''} onChange={e=>setMaintForm(f=>({...f,notes:e.target.value}))} rows={2}
                  placeholder="Catatan tambahan..." className="w-full px-3 py-2 rounded-xl border outline-none text-sm resize-none" style={{ borderColor:'#e2e8f0',fontSize:12.5 }} />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={()=>setShowMaintModal(false)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-gray-50" style={{ borderColor:'#e2e8f0',color:'#64748b' }}>Batal</button>
                <button onClick={saveMaintenance} disabled={!maintForm.description.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  style={{ background:'#1A77A3' }}>Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Konfirmasi Hapus ── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background:'rgba(0,0,0,0.5)' }}
          onClick={e=>{ if(e.target===e.currentTarget) setDeleteConfirmId(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ transform:`translate(${offsetDeleteConfirm.x}px,${offsetDeleteConfirm.y}px)` }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background:'#fef2f2', cursor:'move' }} onMouseDown={onMouseDownDeleteConfirm}>
              <Trash2 style={{ width:22,height:22,color:'#dc2626' }} />
            </div>
            <h2 style={{ fontSize:15,fontWeight:800,color:'#0f172a',textAlign:'center',marginBottom:4 }}>Hapus Aset?</h2>
            <p style={{ fontSize:12,color:'#64748b',textAlign:'center',marginBottom:20 }}>
              Aset "<strong>{assets.find(a=>a.id===deleteConfirmId)?.name}</strong>" dan seluruh riwayat pemeliharaannya akan dihapus permanen.
            </p>
            <div className="flex gap-2">
              <button onClick={()=>setDeleteConfirmId(null)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-gray-50" style={{ borderColor:'#e2e8f0',color:'#64748b' }}>Batal</button>
              <button onClick={()=>deleteAsset(deleteConfirmId)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90" style={{ background:'#dc2626' }}>Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
