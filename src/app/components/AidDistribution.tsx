import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { toast } from 'sonner';
import { api } from '../../lib/apiClient';
import { AidDistribution, AidType, AidStatus } from '../types';
import {
  HandHeart, Plus, X, Calendar, DollarSign, User,
  Phone, MapPin, FileText, Pencil, Trash2, Eye,
  CheckCircle, XCircle, Clock, AlertCircle, Gift,
  ArrowUp, ArrowDown, ArrowUpDown, Upload, Loader2, Mail
} from 'lucide-react';
import { useSortable } from '../../hooks/useSortable';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { SearchDropdown } from './ui/SearchDropdown';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColResizeHandle } from './ui/resizable-th';

const AID_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  recipientName: 200, type: 120, amount: 140, reason: 220, requestedDate: 130, status: 130, aksi: 90,
};

// Master Data 'status_distribusi_bantuan' menyediakan opsi dropdown status, tapi mengedit
// label item Master Data di menu admin ikut menimpa value-nya (value = label). Fungsi ini
// menambah jalur cadangan lewat kata kunci supaya warna badge, KPI, dan tombol Verifikasi/
// Setujui/Tolak/Tandai Disalurkan tidak diam-diam berhenti mengenali status kalau label
// salah satu dari 5 status ini pernah diedit.
function normStatusBantuan(status: string): AidStatus {
  const s = (status || '').toLowerCase();
  if (s === 'pengajuan' || s.includes('ajuan')) return 'Pengajuan';
  if (s === 'verifikasi' || s.includes('verifikasi')) return 'Verifikasi';
  if (s === 'disetujui' || s.includes('setuju')) return 'Disetujui';
  if (s === 'ditolak' || s.includes('tolak')) return 'Ditolak';
  if (s === 'disalurkan' || s.includes('salur')) return 'Disalurkan';
  return 'Pengajuan';
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb/1024).toFixed(2)} MB`;
};
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024; // 2MB

interface AidDocument {
  id: string;
  aidId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileData: string; // base64
  uploadedAt: string;
  uploadedBy: string;
}

export function AidDistributionComponent({ onNavigate }: { onNavigate?: (page: string) => void } = {}) {
  const { aidDistributions, members, getMasterDataByCategory, addAidDistribution, updateAidDistribution, deleteAidDistribution, can: canFn, currentUser, setPendingLetterDraft } = useApp();
  // Audit gap fix: sebelumnya dipanggil dengan NAMA MODUL kasar
  // ('Pelayanan Kasih & Komunikasi'), bukan page id ('aid-distribution') --
  // can() dirancang menerima id submenu (lihat catatan di AppContext.tsx),
  // jadi pengecekan granular per Custom Role diam-diam salah/selalu fallback
  // ke izin modul lama.
  const canEditDocs = canFn('aid-distribution', 'edit');
  const canDeleteDocs = canFn('aid-distribution', 'delete');
  const canCreate = canFn('aid-distribution', 'create');
  const canEdit = canFn('aid-distribution', 'edit');
  const canDelete = canFn('aid-distribution', 'delete');
  const statusBantuanList = getMasterDataByCategory('status_distribusi_bantuan').map((m: any) => m.value);
  const STATUS_BANTUAN_OPTS = statusBantuanList.length ? statusBantuanList : ['Pengajuan', 'Verifikasi', 'Disetujui', 'Ditolak', 'Disalurkan'];
  const aidTypeList = getMasterDataByCategory('kategori_bantuan').map(m => m.value) as AidType[];
  const AID_TYPE_LIST: AidType[] = aidTypeList.length ? aidTypeList : ['Ekonomi','Beasiswa','Kesehatan','Bencana','Lainnya'];
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  // Audit gap fix (Frontend/UX): cegah submit ganda kalau staf klik tombol
  // berkali-kali dengan cepat sebelum dialog sempat tertutup.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAid, setSelectedAid] = useState<AidDistribution | null>(null);

  // memberSearch state for SearchDropdown display
  const [memberSearch, setMemberSearch] = useState('');

  // Dokumen pendukung: bukti serah terima (PDF, maks 2MB per file)
  const [aidDocs, setAidDocs] = useState<AidDocument[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const docFileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedAid) { setAidDocs([]); return; }
    api.get<AidDocument[]>('/api/data/aidDistributionDocuments').then(all => {
      setAidDocs((all || []).filter(d => d.aidId === selectedAid.id));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAid?.id]);

  // Form State
  const [formData, setFormData] = useState({
    type: 'Ekonomi' as AidType,
    recipientName: '',
    memberId: '',
    phone: '',
    address: '',
    amount: 0,
    description: '',
    reason: '',
    status: 'Pengajuan' as AidStatus,
    requestedDate: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'amount') {
      setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleMemberSelect = (memberId: string) => {
    if (memberId) {
      const member = members.find(m => m.id === memberId);
      if (member) {
        setFormData(prev => ({
          ...prev,
          memberId,
          recipientName: member.fullName,
          phone: member.phone,
          address: member.address
        }));
      }
    } else {
      setFormData(prev => ({
        ...prev,
        memberId: '',
        recipientName: '',
        phone: '',
        address: ''
      }));
    }
  };

  const resetForm = () => {
    setFormData({
      type: 'Ekonomi',
      recipientName: '',
      memberId: '',
      phone: '',
      address: '',
      amount: 0,
      description: '',
      reason: '',
      status: 'Pengajuan',
      requestedDate: new Date().toISOString().split('T')[0],
      notes: ''
    });
    setMemberSearch('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!formData.recipientName || !formData.phone || !formData.reason) {
      toast.error('Mohon lengkapi Nama Penerima, Telepon, dan Alasan Pengajuan');
      return;
    }
    setIsSubmitting(true);
    addAidDistribution(formData);
    resetForm();
    setIsCreateDialogOpen(false);
    setIsSubmitting(false);
  };

  const handleEdit = (aid: AidDistribution) => {
    setIsEditMode(true);
    setSelectedAid(aid);
    setIsDetailDialogOpen(false);
    setFormData({
      type: aid.type,
      recipientName: aid.recipientName,
      memberId: aid.memberId || '',
      phone: aid.phone,
      address: aid.address,
      amount: aid.amount || 0,
      description: aid.description,
      reason: aid.reason,
      status: aid.status,
      requestedDate: aid.requestedDate,
      notes: aid.notes || ''
    });
    setMemberSearch(aid.memberId ? members.find(m => m.id === aid.memberId)?.fullName || '' : '');
    setIsCreateDialogOpen(true);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!formData.recipientName || !formData.phone || !formData.reason) {
      toast.error('Mohon lengkapi Nama Penerima, Telepon, dan Alasan Pengajuan');
      return;
    }
    setIsSubmitting(true);
    if (selectedAid) updateAidDistribution(selectedAid.id, formData);
    resetForm();
    setIsCreateDialogOpen(false);
    setIsEditMode(false);
    setSelectedAid(null);
    setIsSubmitting(false);
  };

  const handleViewDetail = (aid: AidDistribution) => {
    setSelectedAid(aid);
    setIsDetailDialogOpen(true);
  };

  // Audit gap fix (item #8, Pelayanan Kasih & Doa): sebelumnya hapus
  // pengajuan tidak pernah cek apakah sudah ada Surat Keluar (Tanda Terima
  // Bantuan) yang ditindaklanjuti dari pengajuan ini -- begitu dihapus,
  // relatedId di surat itu jadi yatim. Ini cuma peringatan (bukan blokir).
  const handleDelete = async (aid: AidDistribution) => {
    let linkedLetterCount = 0;
    try {
      const letters = await api.get<any[]>('/api/data/outgoingLetters');
      linkedLetterCount = (letters || []).filter(l => l.relatedModule === 'AidDistribution' && l.relatedId === aid.id).length;
    } catch {
      // non-blocking: kalau gagal cek, lanjutkan tanpa info surat terkait
    }
    const warning = linkedLetterCount > 0
      ? `\n\nPERINGATAN: ${linkedLetterCount} Surat Keluar sudah dibuat terkait pengajuan ini. Data tertaut TIDAK ikut terhapus dan referensinya akan jadi yatim (tidak bisa dilacak balik ke pengajuan ini).`
      : '';
    if (!window.confirm(`Hapus pengajuan bantuan:\n\n${aid.type} - ${aid.recipientName}${warning}\n\nData tidak dapat dikembalikan.`)) return;
    deleteAidDistribution(aid.id);
    // Audit gap fix: sebelumnya dokumen pendukung (aidDistributionDocuments,
    // mis. bukti transfer) TIDAK PERNAH dibersihkan saat pengajuan induknya
    // dihapus -- jadi jadi sampah base64 permanen, sama seperti bug yang
    // sudah diperbaiki di AssetManagement/ResourceLibrary.
    try {
      const allDocs = await api.get<AidDocument[]>('/api/data/aidDistributionDocuments');
      const orphaned = (allDocs || []).filter(d => d.aidId === aid.id);
      await Promise.all(orphaned.map(d => api.delete(`/api/data/aidDistributionDocuments/${d.id}`).catch(() => {})));
      if (selectedAid?.id === aid.id) setAidDocs([]);
    } catch {
      // non-blocking: pengajuan tetap terhapus walau cleanup dokumen gagal
    }
    setIsDetailDialogOpen(false);
  };

  // Integrasi Surat-Menyurat (audit gap fix): begitu bantuan DISALURKAN, staf
  // bisa langsung membuat draf Surat Tanda Terima Bantuan.
  const handleBuatSurat = (aid: AidDistribution) => {
    setPendingLetterDraft({
      relatedModule: 'AidDistribution',
      relatedId: aid.id,
      memberId: aid.memberId,
      recipientName: aid.recipientName,
      subject: `Tanda Terima Bantuan ${aid.type} — ${aid.recipientName}`,
      body: `Dengan ini menerangkan bahwa bantuan ${aid.type}${aid.amount ? ` sebesar Rp ${aid.amount.toLocaleString('id-ID')}` : ''} telah disalurkan kepada Saudara/i ${aid.recipientName}${aid.distributedDate ? ` pada tanggal ${new Date(aid.distributedDate).toLocaleDateString('id-ID')}` : ''}. Keperluan: ${aid.reason}.`,
    });
    onNavigate?.('letters-outgoing');
  };

  // Audit gap fix: approvedBy/approvedDate/distributedDate sudah ada di tipe
  // data (bahkan distributedDate dipakai handleBuatSurat di atas), tapi
  // sebelumnya tidak PERNAH ditulis di mana pun -- jadi tidak ada jejak siapa
  // yang menyetujui/menyalurkan bantuan dan kapan.
  const handleStatusChange = (aid: AidDistribution, newStatus: AidStatus) => {
    const patch: Partial<AidDistribution> = { status: newStatus };
    if (newStatus === 'Disetujui') {
      patch.approvedBy = currentUser?.name || 'Administrator';
      patch.approvedDate = new Date().toISOString();
    }
    if (newStatus === 'Disalurkan') {
      patch.distributedDate = new Date().toISOString();
    }
    updateAidDistribution(aid.id, patch);
    setSelectedAid(prev => prev ? { ...prev, ...patch } : prev);
  };

  const handleUploadDocClick = () => docFileInputRef.current?.click();

  const handleDocFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedAid) return;
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
      const id = 'aiddoc' + Date.now();
      const doc: AidDocument = {
        id, aidId: selectedAid.id, fileName: file.name, fileSize: file.size,
        mimeType: 'application/pdf', fileData: base64,
        uploadedAt: new Date().toISOString(), uploadedBy: currentUser?.name || 'Administrator',
      };
      await api.put(`/api/data/aidDistributionDocuments/${id}`, doc);
      setAidDocs(prev => [doc, ...prev]);
      toast.success(`Dokumen "${file.name}" berhasil diunggah`);
    } catch (err) {
      toast.error('Gagal mengunggah dokumen. Silakan coba lagi');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleViewDocument = (doc: AidDocument) => {
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

  const handleDeleteDocument = async (doc: AidDocument) => {
    if (!window.confirm(`Hapus dokumen "${doc.fileName}"?`)) return;
    try {
      await api.delete(`/api/data/aidDistributionDocuments/${doc.id}`);
      setAidDocs(prev => prev.filter(d => d.id !== doc.id));
      toast.success(`Dokumen "${doc.fileName}" dihapus`);
    } catch {
      toast.error('Gagal menghapus dokumen');
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'Pengajuan': 'bg-[#f0ede5] text-[#144f6b] border-[#e8e4d8]',
      'Verifikasi': 'bg-[#f0ede5] text-blue-800 border-[#b8d5e8]',
      'Disetujui': 'bg-green-100 text-green-800 border-green-200',
      'Ditolak': 'bg-red-100 text-red-800 border-red-200',
      'Disalurkan': 'bg-[#f0ede5] text-purple-800 border-[#b8d5e8]'
    };
    return colors[normStatusBantuan(status)];
  };

  // Calculate statistics
  const stats = {
    total: aidDistributions.length,
    pengajuan: aidDistributions.filter(a => normStatusBantuan(a.status) === 'Pengajuan').length,
    verifikasi: aidDistributions.filter(a => normStatusBantuan(a.status) === 'Verifikasi').length,
    disetujui: aidDistributions.filter(a => normStatusBantuan(a.status) === 'Disetujui').length,
    disalurkan: aidDistributions.filter(a => normStatusBantuan(a.status) === 'Disalurkan').length,
    totalAmount: aidDistributions.reduce((sum, a) => sum + (a.amount || 0), 0)
  };

  const { sorted: sortedAids, sortKey, sortDir, requestSort } = useSortable(aidDistributions);
  const { widths: colW, startResize } = useResizableColumns('aid-distribution-main', AID_TABLE_DEFAULT_WIDTHS);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Penyaluran Bantuan</h1>
          <p className="text-gray-600">Kelola bantuan ekonomi, beasiswa, kesehatan, dan bencana</p>
        </div>
        {canCreate && (
          <button 
            onClick={() => {
              resetForm();
              setIsEditMode(false);
              setSelectedAid(null);
              setIsCreateDialogOpen(true);
            }}
            className="px-4 py-2 bg-[#144f6b] text-white rounded-lg hover:bg-[#144f6b] transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Pengajuan Bantuan
          </button>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-[#144f6b] rounded-lg shadow-sm border border-blue-400 p-4 text-white">
          <p className="text-blue-100 text-xs mb-1">Total Pengajuan</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-[#e8e4d8] p-4">
          <p className="text-[#144f6b] text-xs mb-1">Pengajuan</p>
          <p className="text-2xl font-bold text-[#144f6b]">{stats.pengajuan}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-[#b8d5e8] p-4">
          <p className="text-[#144f6b] text-xs mb-1">Verifikasi</p>
          <p className="text-2xl font-bold text-blue-900">{stats.verifikasi}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-green-200 p-4">
          <p className="text-green-700 text-xs mb-1">Disetujui</p>
          <p className="text-2xl font-bold text-green-900">{stats.disetujui}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-[#b8d5e8] p-4">
          <p className="text-[#3a7fa0] text-xs mb-1">Disalurkan</p>
          <p className="text-2xl font-bold text-purple-900">{stats.disalurkan}</p>
        </div>
        <div className="bg-[#144f6b] rounded-lg shadow-sm border border-[#7290a0] p-4 text-white">
          <p className="text-[#f0ede5] text-xs mb-1">Total Bantuan</p>
          <p className="text-lg font-bold">Rp {(stats.totalAmount / 1000000).toFixed(1)}M</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0]">
        <div className="p-6 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Daftar Pengajuan Bantuan</h3>
          <p className="text-sm text-gray-600 mt-1">
            Klik pada baris untuk melihat detail lengkap
          </p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0]">
          <table className="w-full" style={{tableLayout:'fixed'}}>
            <thead style={{background:'#f6f4f0',borderBottom:'1px solid #e8e4d8'}}>
              <tr>
                <th className="px-6 py-3 text-left" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',textTransform:'uppercase',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none',width:colW.recipientName,position:'relative'}} onClick={() => requestSort('recipientName')}>
                  <div className="flex items-center gap-1">
                    Penerima
                    {sortKey === 'recipientName' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#144f6b]" /> : <ArrowDown className="w-3 h-3 text-[#144f6b]" />) : <ArrowUpDown className="w-3 h-3 text-[#c2baaa]" />}
                  </div>
                  <ColResizeHandle onMouseDown={startResize('recipientName')} />
                </th>
                <th className="px-6 py-3 text-left" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',textTransform:'uppercase',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none',width:colW.type,position:'relative'}} onClick={() => requestSort('type')}>
                  <div className="flex items-center gap-1">
                    Tipe
                    {sortKey === 'type' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#144f6b]" /> : <ArrowDown className="w-3 h-3 text-[#144f6b]" />) : <ArrowUpDown className="w-3 h-3 text-[#c2baaa]" />}
                  </div>
                  <ColResizeHandle onMouseDown={startResize('type')} />
                </th>
                <th className="px-6 py-3 text-left" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',textTransform:'uppercase',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none',width:colW.amount,position:'relative'}} onClick={() => requestSort('amount')}>
                  <div className="flex items-center gap-1">
                    Jumlah
                    {sortKey === 'amount' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#144f6b]" /> : <ArrowDown className="w-3 h-3 text-[#144f6b]" />) : <ArrowUpDown className="w-3 h-3 text-[#c2baaa]" />}
                  </div>
                  <ColResizeHandle onMouseDown={startResize('amount')} />
                </th>
                <th className="px-6 py-3 text-left" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',textTransform:'uppercase',whiteSpace:'nowrap',width:colW.reason,position:'relative'}}>
                  Alasan
                  <ColResizeHandle onMouseDown={startResize('reason')} />
                </th>
                <th className="px-6 py-3 text-left" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',textTransform:'uppercase',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none',width:colW.requestedDate,position:'relative'}} onClick={() => requestSort('requestedDate')}>
                  <div className="flex items-center gap-1">
                    Tanggal
                    {sortKey === 'requestedDate' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#144f6b]" /> : <ArrowDown className="w-3 h-3 text-[#144f6b]" />) : <ArrowUpDown className="w-3 h-3 text-[#c2baaa]" />}
                  </div>
                  <ColResizeHandle onMouseDown={startResize('requestedDate')} />
                </th>
                <th className="px-6 py-3 text-left" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',textTransform:'uppercase',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none',width:colW.status,position:'relative'}} onClick={() => requestSort('status')}>
                  <div className="flex items-center gap-1">
                    Status
                    {sortKey === 'status' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#144f6b]" /> : <ArrowDown className="w-3 h-3 text-[#144f6b]" />) : <ArrowUpDown className="w-3 h-3 text-[#c2baaa]" />}
                  </div>
                  <ColResizeHandle onMouseDown={startResize('status')} />
                </th>
                <th className="px-6 py-3 text-center" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',textTransform:'uppercase',whiteSpace:'nowrap',width:colW.aksi,position:'relative'}}>
                  Aksi
                  <ColResizeHandle onMouseDown={startResize('aksi')} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2f0ea]">
              {sortedAids.map((aid) => (
                <tr 
                  key={aid.id} 
                  onClick={() => handleViewDetail(aid)}
                  className="hover:bg-[#f6f4f0]/20 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-500">{aid.recipientName}</div>
                      <div className="text-sm text-gray-500">{aid.phone}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      aid.type === 'Ekonomi' ? 'bg-[#f0ede5] text-blue-800' :
                      aid.type === 'Beasiswa' ? 'bg-green-100 text-green-800' :
                      aid.type === 'Kesehatan' ? 'bg-red-100 text-red-800' :
                      aid.type === 'Bencana' ? 'bg-orange-100 text-orange-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {aid.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-500">
                    {aid.amount ? `Rp ${aid.amount.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                    {aid.reason}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(aid.requestedDate).toLocaleDateString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(aid.status)}`}>
                      {aid.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {canEdit && (
                        <button
                          onClick={() => handleEdit(aid)}
                          className="text-gray-600 hover:text-gray-800"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(aid)}
                          className="text-red-600 hover:text-red-800"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false);
          setIsEditMode(false);
          setSelectedAid(null);
          resetForm();
        }
      }}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 pt-6 pb-4 flex-shrink-0">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-gray-900">
                {isEditMode ? 'Edit Pengajuan Bantuan' : 'Pengajuan Bantuan Baru'}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                {isEditMode ? 'Ubah informasi pengajuan bantuan yang sudah ada.' : 'Catat pengajuan bantuan dari jemaat yang membutuhkan.'}
              </DialogDescription>
            </DialogHeader>
          </div>
          
          {/* Form */}
          <form onSubmit={isEditMode ? handleUpdate : handleSubmit} className="flex flex-col flex-1 min-h-0">
            {/* Scrollable Content */}
            <div className="overflow-y-auto flex-1 px-6 min-h-0">
              <div className="space-y-6 py-4">
                {/* Jenis Bantuan */}
                <div className="bg-[#f0f7fb] rounded-lg p-4 border border-blue-100">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-[#144f6b] rounded-lg flex items-center justify-center">
                      <HandHeart className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Jenis Bantuan</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="type">Tipe Bantuan *</Label>
                      <select
                        id="type"
                        name="type"
                        value={formData.type}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        required
                      >
                        {AID_TYPE_LIST.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="status">Status *</Label>
                      <select
                        id="status"
                        name="status"
                        value={formData.status}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        required
                      >
                        {STATUS_BANTUAN_OPTS.map((s: string) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <Label htmlFor="amount">Jumlah Bantuan (Rp)</Label>
                      <Input
                        id="amount"
                        name="amount"
                        type="number"
                        min="0"
                        step="10000"
                        value={formData.amount}
                        onChange={handleInputChange}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label htmlFor="requestedDate">Tanggal Pengajuan *</Label>
                      <Input
                        id="requestedDate"
                        name="requestedDate"
                        type="date"
                        value={formData.requestedDate}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Informasi Penerima */}
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <User className="w-4 h-4 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Informasi Penerima</h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label>Pilih Jemaat Terdaftar</Label>
                      <SearchDropdown<any>
                        value={memberSearch}
                        onChange={v => {
                          setMemberSearch(v);
                          if (!v) handleMemberSelect('');
                        }}
                        placeholder="Cari nama jemaat..."
                        items={members}
                        filterFn={(m, q) => {
                          const lq = q.toLowerCase();
                          return m.fullName.toLowerCase().includes(lq) || m.memberNumber?.toLowerCase().includes(lq);
                        }}
                        renderResult={m => (
                          <div>
                            <p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{m.fullName}</p>
                            <p style={{fontSize:'11px',color:'#64748b',margin:0}}>{m.memberNumber||'-'}</p>
                          </div>
                        )}
                        onSelect={m => {
                          handleMemberSelect(m.id);
                          setMemberSearch(m.fullName);
                        }}
                        onClear={() => { handleMemberSelect(''); setMemberSearch(''); }}
                      />
                    </div>
                    <div className="border-t border-gray-200 pt-4">
                      <p className="text-xs text-gray-500 mb-3">Atau isi manual:</p>
                      <div className="space-y-3">
                        <div>
                          <Label htmlFor="recipientName">Nama Penerima *</Label>
                          <Input
                            id="recipientName"
                            name="recipientName"
                            value={formData.recipientName}
                            onChange={handleInputChange}
                            placeholder="Nama lengkap"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="phone">Telepon *</Label>
                            <Input
                              id="phone"
                              name="phone"
                              value={formData.phone}
                              onChange={handleInputChange}
                              placeholder="08xx"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="address">Alamat</Label>
                            <Input
                              id="address"
                              name="address"
                              value={formData.address}
                              onChange={handleInputChange}
                              placeholder="Alamat lengkap"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detail Pengajuan */}
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-[#f0ede5] rounded-lg flex items-center justify-center">
                      <FileText className="w-4 h-4 text-[#144f6b]" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Detail Pengajuan</h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="reason">Alasan Pengajuan *</Label>
                      <Textarea
                        id="reason"
                        name="reason"
                        value={formData.reason}
                        onChange={handleInputChange}
                        placeholder="Jelaskan alasan pengajuan bantuan..."
                        rows={3}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Deskripsi Kondisi</Label>
                      <Textarea
                        id="description"
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        placeholder="Deskripsi lengkap kondisi penerima..."
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="notes">Catatan Tambahan</Label>
                      <Textarea
                        id="notes"
                        name="notes"
                        value={formData.notes}
                        onChange={handleInputChange}
                        placeholder="Catatan untuk verifikator atau majelis..."
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0">
              <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  <X className="w-4 h-4 mr-1.5" />
                  Batal
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  {isSubmitting ? 'Menyimpan...' : (isEditMode ? 'Simpan Perubahan' : 'Simpan Pengajuan')}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 pt-6 pb-4 flex-shrink-0">
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <DialogTitle className="text-xl font-bold text-gray-900">
                    Detail Pengajuan Bantuan
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-xs">
                    {selectedAid && new Date(selectedAid.requestedDate).toLocaleDateString('id-ID', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </DialogDescription>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${selectedAid ? getStatusColor(selectedAid.status) : ''}`}>
                  {selectedAid?.status}
                </span>
              </div>
            </DialogHeader>
          </div>
          
          {/* Scrollable Content */}
          <div className="overflow-y-auto flex-1 px-6 min-h-0">
            <div className="space-y-4 py-4">
              {/* Jenis & Jumlah */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#f0f7fb] rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Gift className="w-5 h-5 text-blue-600" />
                    <p className="text-sm text-[#144f6b] font-medium">Jenis Bantuan</p>
                  </div>
                  <p className="text-xl font-bold text-blue-900">{selectedAid?.type}</p>
                </div>
                {selectedAid?.amount && (
                  <div className="bg-[#f0f7fb] rounded-lg p-4 border border-green-200">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-5 h-5 text-green-600" />
                      <p className="text-sm text-green-700 font-medium">Jumlah Bantuan</p>
                    </div>
                    <p className="text-xl font-bold text-green-900">
                      Rp {selectedAid.amount.toLocaleString('id-ID')}
                    </p>
                  </div>
                )}
              </div>

              {/* Penerima Info */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-5 h-5 text-green-600" />
                  <h3 className="font-semibold text-gray-900">Informasi Penerima</h3>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-600">Nama</p>
                    <p className="font-medium text-gray-900">{selectedAid?.recipientName}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-600">Telepon</p>
                      <p className="font-medium text-gray-900">{selectedAid?.phone}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Alamat</p>
                      <p className="font-medium text-gray-900">{selectedAid?.address}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Alasan */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-[#144f6b]" />
                  <h3 className="font-semibold text-gray-900">Alasan Pengajuan</h3>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedAid?.reason}</p>
              </div>

              {/* Description */}
              {selectedAid?.description && (
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-gray-600" />
                    <h3 className="font-semibold text-gray-900">Deskripsi Kondisi</h3>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedAid.description}</p>
                </div>
              )}

              {/* Notes */}
              {selectedAid?.notes && (
                <div className="bg-[#f0f7fb] border border-[#b8d5e8] rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-blue-900">Catatan</h3>
                  </div>
                  <p className="text-sm text-blue-800 whitespace-pre-wrap">{selectedAid.notes}</p>
                </div>
              )}

              {/* Dokumen Pendukung */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-5 h-5 text-gray-600" />
                  <h3 className="font-semibold text-gray-900">Dokumen Pendukung ({aidDocs.length})</h3>
                </div>
                <input ref={docFileInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleDocFileSelected}/>
                {canEditDocs && (
                  <button onClick={handleUploadDocClick} disabled={uploadingDoc}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed text-sm font-semibold transition-colors disabled:opacity-60 mb-3"
                    style={{ borderColor:'#b8d5e8',color:'#144f6b',background:'#f0fdf4' }}>
                    {uploadingDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Upload className="w-3.5 h-3.5"/>}
                    {uploadingDoc ? 'Mengunggah...' : 'Unggah Bukti Serah Terima (PDF)'}
                  </button>
                )}
                {aidDocs.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">Belum ada dokumen pendukung</p>
                ) : (
                  <div className="space-y-2">
                    {aidDocs.map(doc => (
                      <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 bg-[#fafbfc]">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-red-50">
                          <FileText className="w-4 h-4 text-red-600"/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-xs font-semibold text-gray-700">{doc.fileName}</p>
                          <p className="text-[11px] text-gray-400">{formatBytes(doc.fileSize)} · {new Date(doc.uploadedAt).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})} · {doc.uploadedBy}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button title="Lihat" onClick={()=>handleViewDocument(doc)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-[#144f6b] transition-colors"><Eye className="w-3.5 h-3.5"/></button>
                          {canDeleteDocs && (
                            <button title="Hapus" onClick={()=>handleDeleteDocument(doc)} className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5"/></button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Actions */}
              {canEdit && selectedAid && normStatusBantuan(selectedAid.status) !== 'Disalurkan' && normStatusBantuan(selectedAid.status) !== 'Ditolak' && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-3">Ubah Status</h3>
                  <div className="flex gap-2">
                    {normStatusBantuan(selectedAid.status) === 'Pengajuan' && (
                      <>
                        <Button 
                          onClick={() => handleStatusChange(selectedAid, 'Verifikasi')}
                          size="sm"
                          variant="outline"
                        >
                          <Clock className="w-3.5 h-3.5 mr-1.5" />
                          Verifikasi
                        </Button>
                        <Button 
                          onClick={() => handleStatusChange(selectedAid, 'Ditolak')}
                          size="sm"
                          variant="destructive"
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1.5" />
                          Tolak
                        </Button>
                      </>
                    )}
                    {normStatusBantuan(selectedAid.status) === 'Verifikasi' && (
                      <>
                        <Button 
                          onClick={() => handleStatusChange(selectedAid, 'Disetujui')}
                          size="sm"
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                          Setujui
                        </Button>
                        <Button 
                          onClick={() => handleStatusChange(selectedAid, 'Ditolak')}
                          size="sm"
                          variant="destructive"
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1.5" />
                          Tolak
                        </Button>
                      </>
                    )}
                    {normStatusBantuan(selectedAid.status) === 'Disetujui' && (
                      <Button 
                        onClick={() => handleStatusChange(selectedAid, 'Disalurkan')}
                        size="sm"
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                        Tandai Disalurkan
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Integrasi Surat-Menyurat: hanya muncul setelah bantuan benar-benar
                  disalurkan, konsisten dengan filosofi "trigger saat selesai" yang
                  sudah dipakai di seluruh modul Surat-Menyurat. */}
              {selectedAid && normStatusBantuan(selectedAid.status) === 'Disalurkan' && canFn('letters-outgoing', 'create') && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <Button
                    onClick={() => handleBuatSurat(selectedAid)}
                    size="sm"
                    variant="outline"
                  >
                    <Mail className="w-3.5 h-3.5 mr-1.5" />
                    Buat Surat
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDetailDialogOpen(false)} className="flex-1">
                <X className="w-3.5 h-3.5 mr-1.5" />
                Tutup
              </Button>
              {canEdit && (
                <Button type="button" onClick={() => handleEdit(selectedAid!)} className="flex-1">
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Edit
                </Button>
              )}
              {canDelete && (
                <Button type="button" onClick={() => handleDelete(selectedAid!)} variant="destructive" className="flex-1">
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Hapus
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}