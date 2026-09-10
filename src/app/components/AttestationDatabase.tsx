import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Attestation } from '../types';
import { useDraggable } from '../../lib/useDraggable';
import { api, apiSave, apiRemove } from '../../lib/apiClient';
import { suggestNextMemberNumber, suggestNextFamilyNumber } from '../lib/attestationNumbering';
import { SectorTransferHistory } from './SectorTransferHistory';
import { SearchDropdown } from './ui/SearchDropdown';
import {
  FileText, Plus, Pencil, Trash2, Eye, X, Search, Download,
  AlertCircle, ChevronLeft, ChevronRight, CheckCircle2, Clock,
  ArrowRight, ArrowLeft, Ban, User, Users, Calendar, Church, MapPin,
  Printer, FileCheck, RefreshCw, Filter, Lock, Upload, Loader2, Mail
} from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColResizeHandle } from './ui/resizable-th';

const ATTESTATION_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  type: 130, memberName: 220, churchTransfer: 220, requestDate: 130, letterNumber: 140, status: 120, aksi: 100,
};

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' }) : '—';
const formatBytes = (bytes: number) => {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb/1024).toFixed(2)} MB`;
};
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024; // 2MB

interface AttestationDocument {
  id: string;
  attestationId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileData: string; // base64
  uploadedAt: string;
  uploadedBy: string;
  docType?: string; // id dari DOCUMENT_CHECKLIST_ITEMS di bawah — kalau kosong, file ini adalah dokumen lain di luar 9 syarat tetap (upload lama sebelum fitur checklist ada, tetap tampil di bagian "Dokumen Lain")
}

// ── Syarat kelengkapan Atestasi Masuk (gap-fix Sept 2026) ────────────────────
// 9 item tetap sesuai formulir kertas yang dipakai gereja. id dipakai sebagai
// key di Attestation.documentChecklist DAN di AttestationDocument.docType —
// sengaja bukan teks label supaya tidak rusak kalau labelnya nanti direvisi.
// HANYA ditampilkan untuk type 'Pindah Masuk' (lihat insight/diskusi sebelum
// fitur ini dibangun: untuk Pindah Keluar anggotanya sudah terdaftar, jadi
// checklist pendaftaran-anggota-baru ini tidak relevan).
const DOCUMENT_CHECKLIST_ITEMS: { id: string; label: string }[] = [
  { id: 'surat_atestasi_asal', label: 'Atestasi dari Gereja Asal (proses)' },
  { id: 'ktp', label: 'KTP' },
  { id: 'kk', label: 'KK' },
  { id: 'akte_lahir', label: 'Akte Kelahiran' },
  { id: 'surat_baptis', label: 'Surat Baptis' },
  { id: 'surat_sidi', label: 'Surat Sidi' },
  { id: 'surat_nikah_sipil', label: 'Surat Nikah Catatan Sipil' },
  { id: 'surat_nikah_gereja', label: 'Surat Nikah Gereja' },
  { id: 'foto', label: 'Foto (untuk multimedia dan warta)' },
];

// ── Status & type configs ──────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { bg:string; color:string; label:string; icon: React.ReactNode }> = {
  'Diajukan':  { bg:'#f6f4f0', color:'#9c9486', label:'Diajukan',  icon:<Clock className="w-3 h-3"/> },
  'Diproses':  { bg:'#eff6ff', color:'#2563eb', label:'Diproses',  icon:<RefreshCw className="w-3 h-3"/> },
  'Selesai':   { bg:'#f0fdf4', color:'#144f6b', label:'Selesai',   icon:<CheckCircle2 className="w-3 h-3"/> },
  'Ditolak':   { bg:'#fef2f2', color:'#dc2626', label:'Ditolak',   icon:<Ban className="w-3 h-3"/> },
};

// Master Data 'status_permohonan_surat' menyediakan opsi dropdown status, tapi mengedit
// label item Master Data di menu admin ikut menimpa value-nya (value = label). Fungsi ini
// menambah jalur cadangan lewat kata kunci supaya badge, stepper, KPI, dan tombol proses
// tidak diam-diam berhenti mengenali status kalau label salah satu dari 4 status ini
// pernah diedit.
function normStatusSurat(status: string): 'Diajukan' | 'Diproses' | 'Selesai' | 'Ditolak' {
  const s = (status || '').toLowerCase();
  if (s === 'diajukan' || s.includes('ajuan')) return 'Diajukan';
  if (s === 'diproses' || s.includes('proses')) return 'Diproses';
  if (s === 'selesai' || s.includes('selesai') || s.includes('terbit')) return 'Selesai';
  if (s === 'ditolak' || s.includes('tolak')) return 'Ditolak';
  return 'Diajukan';
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[normStatusSurat(status)];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{background:c.bg,color:c.color}}>
      {c.icon}{c.label}
    </span>
  );
}

// ── STATUS STEPPER ─────────────────────────────────────────────────────────────
function StatusStepper({ status }: { status: string }) {
  const STEPS = ['Diajukan','Diproses','Selesai'];
  const curr = STEPS.indexOf(normStatusSurat(status));
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s,i)=>(
        <React.Fragment key={s}>
          <div className="flex flex-col items-center">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
              style={{background:i<=curr?'#144f6b':'#e2e8f0',color:i<=curr?'#fff':'#94a3b8'}}>
              {i<curr?'✓':i+1}
            </div>
            <p style={{fontSize:'9px',color:i<=curr?'#144f6b':'#94a3b8',marginTop:3,textAlign:'center',width:56}}>{s}</p>
          </div>
          {i<STEPS.length-1 && <div className="h-0.5 w-8 flex-shrink-0 mb-3" style={{background:i<curr?'#144f6b':'#e2e8f0'}}/>}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── DETAIL MODAL ──────────────────────────────────────────────────────────────
function AttestationDetail({ att, onClose, onEdit, onUpdateStatus, onBuatSurat, onUpdateChecklist }: {
  att: Attestation; onClose:()=>void; onEdit:()=>void;
  onUpdateStatus:(id:string,status:Attestation['status'])=>void;
  onBuatSurat?: (att: Attestation) => void;
  onUpdateChecklist:(id:string,checklist:Record<string,boolean>)=>void;
}) {
  const { offset, onMouseDown } = useDraggable();
  const { can: canFn, currentUser } = useApp();
  const canBuatSurat = onBuatSurat && canFn('letters-outgoing', 'create');
  const canEditDocs   = canFn('Sakramen & Atestasi', 'edit');
  const canDeleteDocs = canFn('Sakramen & Atestasi', 'delete');
  const isIn = att.type === 'Pindah Masuk';

  // Dokumen pendukung: PDF dilampirkan ke atestasi ini (maks 2MB per file)
  const [attDocuments, setAttDocuments] = useState<AttestationDocument[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const docFileInputRef = React.useRef<HTMLInputElement>(null);
  // Kalau diisi id item checklist, upload berikutnya ditag ke item itu (dan
  // otomatis mencentang item itu) — undefined berarti unggahan umum/lepas.
  const [uploadTargetDocType, setUploadTargetDocType] = useState<string | undefined>(undefined);
  const checklistDone = DOCUMENT_CHECKLIST_ITEMS.filter(it => !!att.documentChecklist?.[it.id]).length;

  useEffect(() => {
    api.get<AttestationDocument[]>('/api/data/attestationDocuments').then(all => {
      setAttDocuments((all || []).filter(d => d.attestationId === att.id));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [att.id]);

  const handleUploadDocClick = (docType?: string) => { setUploadTargetDocType(docType); docFileInputRef.current?.click(); };

  const handleDocFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const id = 'attdoc' + Date.now();
      const doc: AttestationDocument = {
        id, attestationId: att.id, fileName: file.name, fileSize: file.size,
        mimeType: 'application/pdf', fileData: base64,
        uploadedAt: new Date().toISOString(), uploadedBy: currentUser?.name || 'Administrator',
        docType: uploadTargetDocType,
      };
      await api.put(`/api/data/attestationDocuments/${id}`, doc);
      setAttDocuments(prev => [doc, ...prev]);
      if (uploadTargetDocType) {
        onUpdateChecklist(att.id, { ...(att.documentChecklist||{}), [uploadTargetDocType]: true });
      }
      toast.success(`Dokumen "${file.name}" berhasil diunggah`);
    } catch (err) {
      toast.error('Gagal mengunggah dokumen. Silakan coba lagi');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleViewDocument = (doc: AttestationDocument) => {
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

  const handleDeleteDocument = async (doc: AttestationDocument) => {
    if (!window.confirm(`Hapus dokumen "${doc.fileName}"?`)) return;
    try {
      await api.delete(`/api/data/attestationDocuments/${doc.id}`);
      setAttDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast.success(`Dokumen "${doc.fileName}" dihapus`);
    } catch {
      toast.error('Gagal menghapus dokumen');
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" style={{maxHeight:'90vh', transform:`translate(${offset.x}px,${offset.y}px)`}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-5 flex-shrink-0" style={{background:isIn?'#144f6b':'#9c9486',cursor:'move'}} onMouseDown={onMouseDown}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {isIn?<ArrowRight className="w-5 h-5 text-white"/>:<ArrowLeft className="w-5 h-5 text-white"/>}
                <h3 className="text-white font-bold" style={{fontSize:'16px'}}>{att.type}</h3>
              </div>
              <p style={{fontSize:'13px',fontWeight:600,color:'#fff'}}>{att.memberName}</p>
              <p style={{fontSize:'11px',color:'rgba(255,255,255,0.6)',marginTop:2}}>
                Diajukan: {fmtDate(att.requestDate)} · Surat No: {att.letterNumber||'—'}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={onEdit} data-tooltip="Edit" className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white"><Pencil className="w-4 h-4"/></button>
              <button onClick={onClose} data-tooltip="Tutup" className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white"><X className="w-4 h-4"/></button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Status stepper */}
          <div className="flex justify-center py-2">
            {normStatusSurat(att.status)!=='Ditolak' ? <StatusStepper status={att.status}/> : (
              <span className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{background:'#fef2f2',color:'#dc2626'}}>
                <Ban className="w-4 h-4"/> Permohonan Ditolak
              </span>
            )}
          </div>

          {/* Info grid */}
          <div className="space-y-2.5">
            {[
              {label:'Nama Jemaat',value:att.memberName},
              {label:'Jenis Atestasi',value:att.type},
              {label:'Gereja Asal',value:att.fromChurch},
              {label:'Gereja Tujuan',value:att.toChurch},
              {label:'Alasan',value:att.reason},
              {label:'Tanggal Permohonan',value:fmtDate(att.requestDate)},
              {label:'No. Surat',value:att.letterNumber||'—'},
              {label:'Diproses Oleh',value:att.processedBy||'—'},
              {label:'Tanggal Diproses',value:fmtDate(att.processedDate)},
              {label:'Tanggal Selesai',value:fmtDate(att.completedDate)},
              {label:'Catatan',value:att.notes||'—'},
            ].map(({label,value})=>(
              <div key={label} className="flex gap-2 border-b py-2" style={{borderColor:'#f8fafc'}}>
                <span className="w-40 flex-shrink-0" style={{fontSize:'12px',color:'#94a3b8',fontWeight:500}}>{label}</span>
                <span className="flex-1" style={{fontSize:'12.5px',color:'#334155',fontWeight:500}}>{value}</span>
              </div>
            ))}
          </div>

          {/* Kelengkapan Dokumen Atestasi Masuk (9 syarat tetap) — hanya Pindah Masuk */}
          {isIn && (
            <div className="p-4 rounded-xl border" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
              <div className="flex items-center justify-between mb-3">
                <p style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Kelengkapan Dokumen</p>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{background: checklistDone===DOCUMENT_CHECKLIST_ITEMS.length?'#f0fdf4':'#fef3c7', color: checklistDone===DOCUMENT_CHECKLIST_ITEMS.length?'#16a34a':'#b45309'}}>
                  {checklistDone}/{DOCUMENT_CHECKLIST_ITEMS.length} lengkap
                </span>
              </div>
              <div className="space-y-1.5">
                {DOCUMENT_CHECKLIST_ITEMS.map(item => {
                  const checked = !!att.documentChecklist?.[item.id];
                  const docsForItem = attDocuments.filter(d => d.docType === item.id);
                  return (
                    <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg border bg-white" style={{borderColor: checked?'#bbf7d0':'#f1f5f9'}}>
                      <input type="checkbox" checked={checked} disabled={!canEditDocs}
                        onChange={e=>onUpdateChecklist(att.id, { ...(att.documentChecklist||{}), [item.id]: e.target.checked })}/>
                      <span className="flex-1" style={{fontSize:'12px',color:checked?'#144f6b':'#334155',fontWeight:checked?600:500}}>{item.label}</span>
                      {docsForItem.length>0 ? (
                        <button data-tooltip="Lihat file" onClick={()=>handleViewDocument(docsForItem[0])} className="p-1.5 rounded-lg hover:bg-gray-100 text-[#144f6b]"><Eye className="w-3.5 h-3.5"/></button>
                      ) : canEditDocs && (
                        <button data-tooltip="Unggah PDF" onClick={()=>handleUploadDocClick(item.id)} disabled={uploadingDoc} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#144f6b]"><Upload className="w-3.5 h-3.5"/></button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dokumen Pendukung — untuk Pindah Masuk cuma tampilkan file yang tidak terkait
              salah satu dari 9 checklist di atas (docType kosong = unggahan bebas / lama) */}
          <div className="p-4 rounded-xl border" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
            {(() => {
              const otherDocs = isIn ? attDocuments.filter(d => !d.docType) : attDocuments;
              return (
                <>
                  <p style={{fontSize:'12px',color:'#64748b',fontWeight:600,marginBottom:10}}>{isIn ? `Dokumen Lain (${otherDocs.length})` : `Dokumen Pendukung (${otherDocs.length})`}</p>
                  <input ref={docFileInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleDocFileSelected}/>
                  {canEditDocs && (
                    <button onClick={()=>handleUploadDocClick(undefined)} disabled={uploadingDoc}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed text-sm font-semibold transition-colors disabled:opacity-60 mb-3"
                      style={{borderColor:'#b8d5e8',color:'#144f6b',background:'#f0fdf4'}}>
                      {uploadingDoc ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
                      {uploadingDoc ? 'Mengunggah...' : 'Unggah Dokumen PDF'}
                    </button>
                  )}
                  {otherDocs.length === 0 ? (
                    <p style={{fontSize:'12px',color:'#94a3b8',textAlign:'center',padding:'8px 0'}}>{isIn ? 'Tidak ada dokumen lain di luar checklist' : 'Belum ada dokumen pendukung'}</p>
                  ) : (
                    <div className="space-y-2">
                      {otherDocs.map(doc => (
                        <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-white" style={{borderColor:'#f1f5f9'}}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{background:'#fef2f2'}}>
                            <FileText className="w-4 h-4 text-[#dc2626]"/>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="truncate" style={{fontSize:'12.5px',fontWeight:600,color:'#334155'}}>{doc.fileName}</p>
                            <p style={{fontSize:'11px',color:'#94a3b8'}}>{formatBytes(doc.fileSize)} · {fmtDate(doc.uploadedAt)} · {doc.uploadedBy}</p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button data-tooltip="Lihat" onClick={()=>handleViewDocument(doc)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-[#144f6b] transition-colors"><Eye className="w-4 h-4"/></button>
                            {canDeleteDocs && (
                              <button data-tooltip="Hapus" onClick={()=>handleDeleteDocument(doc)} className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4"/></button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Quick status update */}
          {normStatusSurat(att.status)!=='Selesai' && normStatusSurat(att.status)!=='Ditolak' && (
            <div className="p-4 rounded-xl border" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
              <p style={{fontSize:'12px',color:'#64748b',fontWeight:600,marginBottom:8}}>Perbarui Status Cepat</p>
              <div className="flex gap-2 flex-wrap">
                {normStatusSurat(att.status)==='Diajukan' && (
                  <button onClick={()=>onUpdateStatus(att.id,'Diproses')} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{background:'#2563eb'}}>
                    → Tandai Diproses
                  </button>
                )}
                {normStatusSurat(att.status)==='Diproses' && (
                  <button onClick={()=>onUpdateStatus(att.id,'Selesai')} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{background:'#144f6b'}}>
                    ✓ Tandai Selesai
                  </button>
                )}
                <button onClick={()=>onUpdateStatus(att.id,'Ditolak')} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{background:'#ef4444'}}>
                  ✕ Tolak Permohonan
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3 flex-shrink-0" style={{borderColor:'#f1f5f9'}}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50" style={{borderColor:'#e2e8f0'}}>Tutup</button>
          {canBuatSurat && (
            <button onClick={()=>onBuatSurat!(att)} className="px-4 py-2 rounded-xl border text-sm font-semibold hover:bg-gray-50" style={{borderColor:'#e2e8f0',color:'#144f6b'}}>
              <Mail className="w-3.5 h-3.5 mr-1.5 inline"/> Buat Surat
            </button>
          )}
          <button onClick={onEdit} className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90" style={{background:'#144f6b'}}>
            <Pencil className="w-3.5 h-3.5 mr-1.5 inline"/> Edit
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FORM ──────────────────────────────────────────────────────────────────────
export function AttestationForm({ initial, members, families, onSave, onSaveBatch, onClose }: {
  initial?: Partial<Attestation>; members: any[]; families?: any[];
  onSave:(d:any)=>void; onSaveBatch?:(rows:any[])=>void; onClose:()=>void;
}) {
  const { offset, onMouseDown } = useDraggable();
  const { getMasterDataByCategory, attestations: allAttestations, sectors } = useApp();
  const statusSuratList = getMasterDataByCategory('status_permohonan_surat').map(m => m.value);
  const STATUS_SURAT_OPTS = statusSuratList.length ? statusSuratList : ['Diajukan', 'Diproses', 'Selesai', 'Ditolak'];
  const tipeAtestasi = getMasterDataByCategory('tipe_atestasi').map(m => m.value);
  const TIPE_ATESTASI = tipeAtestasi.length ? tipeAtestasi : ['Pindah Masuk','Pindah Keluar'];
  // Detect if the form is opened in "locked-member" mode (from a member's detail popup)
  const lockedMember = !!(initial?.memberId && initial?.memberName && !initial?.id);

  // Mode "keluarga": ajukan Atestasi untuk 1 keluarga sekaligus. Setiap anggota keluarga
  // tetap mendapat record Attestation sendiri (agar status/riwayat per orang tetap jalan),
  // tapi semua record itu ditandai familyId yang sama sehingga tampil sebagai satu batch.
  // Hanya tersedia untuk permohonan baru yang tidak dikunci ke satu anggota tertentu.
  const canBatchFamily = !lockedMember && !initial?.id && !!onSaveBatch;
  const [mode, setMode] = useState<'individu'|'keluarga'>('individu');
  const [selectedFamily, setSelectedFamily] = useState<any|null>(null);
  const [familyQuery, setFamilyQuery] = useState('');
  const familyMembers = selectedFamily ? members.filter((m:any)=>m.familyId===selectedFamily.id) : [];

  const defaultType = initial?.type || 'Pindah Masuk';

  // Auto-suggest letter number for new attestations
  const suggestedLetterNumber = (() => {
    if (initial?.letterNumber) return initial.letterNumber;
    const yr = new Date().getFullYear();
    const count = (allAttestations || []).filter((a: any) => a.createdAt?.startsWith(String(yr))).length;
    return `ATT-${yr}-${String(count + 1).padStart(3, '0')}`;
  })();

  const [f, setF] = useState({
    type: defaultType,
    memberId: initial?.memberId||'',
    memberName: initial?.memberName||'',
    fromChurch: initial?.fromChurch || (defaultType === 'Pindah Masuk' ? '' : 'GPIB Trinitas'),
    toChurch: initial?.toChurch || (defaultType === 'Pindah Masuk' ? 'GPIB Trinitas' : ''),
    reason: initial?.reason||'',
    requestDate: initial?.requestDate||new Date().toISOString().split('T')[0],
    letterNumber: suggestedLetterNumber,
    status: initial?.status||'Diajukan',
    processedBy: initial?.processedBy||'',
    processedDate: initial?.processedDate||'',
    completedDate: initial?.completedDate||'',
    notes: initial?.notes||'',
    // Data Kontak & Domisili — cuma relevan untuk Pindah Masuk (lihat komentar
    // di Attestation.phone/address/familyCode di types/index.ts).
    phone: initial?.phone||'',
    address: initial?.address||'',
    sectorId: initial?.sectorId||'',
    memberNumber: initial?.memberNumber||'',
    familyCode: initial?.familyCode||'',
  });
  // Lacak nilai No. Induk/No. KK yang TERAKHIR disarankan otomatis, supaya kalau
  // admin sudah mengedit manual nilainya, ganti sektor tidak menimpa balik.
  const [lastSuggested, setLastSuggested] = useState<{memberNumber:string;familyCode:string}>({memberNumber:'',familyCode:''});
  const [err, setErr] = useState('');
  const h=(k:string,v:string)=>setF(p=>({...p,[k]:v}));

  // Auto-set fromChurch/toChurch based on type
  const handleType = (t:string) => {
    if(t==='Pindah Masuk') setF(p=>({...p,type:t,fromChurch:'',toChurch:'GPIB Trinitas'}));
    else setF(p=>({...p,type:t,fromChurch:'GPIB Trinitas',toChurch:''}));
  };

  // Auto-fill name (+ kontak/domisili kalau ada) saat anggota dipilih dari
  // dropdown (mode non-locked). Tetap bisa diedit manual sesudahnya.
  const handleMember = (id:string) => {
    const m=members.find(m=>m.id===id);
    setF(p=>({
      ...p,memberId:id,memberName:m?.fullName||'',
      phone: m?.phone || p.phone,
      address: m?.address || p.address,
      familyCode: m?.familyCode || p.familyCode,
    }));
  };

  // Sektor dipilih -> otomatis saran No. Induk & No. KK berikutnya sesuai
  // format per sektor (lihat src/app/lib/attestationNumbering.ts). Tidak
  // menimpa kalau field-nya sudah diedit manual dari saran sebelumnya.
  const handleSector = (sectorId: string) => {
    const sector = sectors.find((s: any) => s.id === sectorId);
    if (!sector) { setF(p => ({ ...p, sectorId })); return; }
    const suggestedMemberNumber = suggestNextMemberNumber(members, sector);
    const suggestedFamilyCode = suggestNextFamilyNumber(members, sector);
    setF(p => ({
      ...p,
      sectorId,
      memberNumber: (!p.memberNumber || p.memberNumber === lastSuggested.memberNumber) ? suggestedMemberNumber : p.memberNumber,
      familyCode: (!p.familyCode || p.familyCode === lastSuggested.familyCode) ? suggestedFamilyCode : p.familyCode,
    }));
    setLastSuggested({ memberNumber: suggestedMemberNumber, familyCode: suggestedFamilyCode });
  };

  const submit=()=>{
    if(mode==='keluarga'){
      if(!selectedFamily){setErr('Pilih keluarga terlebih dahulu');return;}
      if(familyMembers.length===0){setErr('Keluarga ini belum punya anggota terdaftar (cek familyId anggota)');return;}
      if(!f.requestDate||!f.toChurch){setErr('Tanggal permohonan dan gereja tujuan wajib diisi');return;}
      const familyId = 'fam-att-'+Date.now();
      const rows = familyMembers.map((m:any)=>({ ...f, memberId:m.id, memberName:m.fullName, familyId }));
      if(onSaveBatch) onSaveBatch(rows); else onSave(rows[0]);
      return;
    }
    if(!f.memberName||!f.requestDate||!f.toChurch){setErr('Nama, tanggal permohonan, dan gereja tujuan wajib diisi');return;}
    onSave(f);
  };

  const isIn = f.type==='Pindah Masuk';

  // Avatar initials helper
  const memberInitials = f.memberName.split(' ').slice(0,2).map((w:string)=>w[0]||'').join('').toUpperCase();

  return (
    // z-[60] so this stacks above MemberDetail modal (z-50)
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.55)'}} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" style={{maxHeight:'90vh', transform:`translate(${offset.x}px,${offset.y}px)`}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b" style={{background:isIn?'#144f6b':'#9c9486',cursor:'move'}} onMouseDown={onMouseDown}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-semibold flex items-center gap-2" style={{fontSize:'15px'}}>
                {isIn?<ArrowRight className="w-4 h-4"/>:<ArrowLeft className="w-4 h-4"/>}
                {initial?.id ? 'Edit Atestasi' : lockedMember ? 'Ajukan Atestasi Baru' : mode==='keluarga' ? 'Ajukan Atestasi 1 Keluarga' : 'Tambah Permohonan Atestasi'}
              </h3>
              {lockedMember && (
                <p className="mt-0.5" style={{fontSize:'11.5px',color:'rgba(255,255,255,0.65)'}}>
                  Untuk: {f.memberName}
                </p>
              )}
            </div>
            <button onClick={onClose} data-tooltip="Tutup" className="text-white/50 hover:text-white"><X className="w-4 h-4"/></button>
          </div>
        </div>
        <div className="p-5 flex-1 overflow-y-auto">
          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {TIPE_ATESTASI.map(t=>(
              <button key={t} onClick={()=>handleType(t)} className="py-2.5 rounded-xl border-2 transition-all text-sm font-semibold flex items-center justify-center gap-2"
                style={{borderColor:f.type===t?(t==='Pindah Masuk'?'#144f6b':'#9c9486'):'#e2e8f0',background:f.type===t?(t==='Pindah Masuk'?'#f0fdf4':'#f6f4f0'):'#fff',color:f.type===t?(t==='Pindah Masuk'?'#144f6b':'#9c9486'):'#64748b'}}>
                {t==='Pindah Masuk'?<ArrowRight className="w-4 h-4"/>:<ArrowLeft className="w-4 h-4"/>}{t}
              </button>
            ))}
          </div>

          {canBatchFamily && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={()=>setMode('individu')} className="py-2 rounded-xl border-2 transition-all text-xs font-semibold flex items-center justify-center gap-2"
                style={{borderColor:mode==='individu'?'#144f6b':'#e2e8f0',background:mode==='individu'?'#eff6ff':'#fff',color:mode==='individu'?'#144f6b':'#64748b'}}>
                <User className="w-3.5 h-3.5"/>Per Anggota
              </button>
              <button onClick={()=>setMode('keluarga')} className="py-2 rounded-xl border-2 transition-all text-xs font-semibold flex items-center justify-center gap-2"
                style={{borderColor:mode==='keluarga'?'#144f6b':'#e2e8f0',background:mode==='keluarga'?'#eff6ff':'#fff',color:mode==='keluarga'?'#144f6b':'#64748b'}}>
                <Users className="w-3.5 h-3.5"/>1 Keluarga
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* ── Member section: locked vs free vs keluarga ── */}
            {lockedMember ? (
              <div className="col-span-2">
                <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Anggota Jemaat</label>
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
                  style={{background:'#f0fdf4',borderColor:'#86efac'}}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                    style={{background:'#144f6b',fontSize:13,fontWeight:800}}>
                    {memberInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{fontSize:'13px',fontWeight:700,color:'#144f6b'}} className="truncate" data-tooltip={f.memberName} data-tooltip-truncate>{f.memberName}</p>
                    <p style={{fontSize:'10.5px',color:'#16a34a'}}>Anggota dipilih otomatis dari profil</p>
                  </div>
                  <Lock className="w-3.5 h-3.5 flex-shrink-0" style={{color:'#16a34a'}}/>
                </div>
              </div>
            ) : mode==='keluarga' ? (
              <div className="col-span-2">
                <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Cari Keluarga (Kepala Keluarga) <span className="text-red-400">*</span></label>
                <SearchDropdown
                  value={familyQuery}
                  onChange={setFamilyQuery}
                  placeholder="Ketik nama kepala keluarga..."
                  items={families||[]}
                  filterFn={(fam:any,q:string)=>(fam.headOfFamily||'').toLowerCase().includes(q.toLowerCase())}
                  renderResult={(fam:any)=>(
                    <div>
                      <p style={{fontSize:13,fontWeight:600,color:'#1e293b'}}>{fam.headOfFamily}</p>
                      <p style={{fontSize:11,color:'#94a3b8'}}>{members.filter((m:any)=>m.familyId===fam.id).length} anggota terdaftar</p>
                    </div>
                  )}
                  onSelect={(fam:any)=>{setSelectedFamily(fam);setFamilyQuery(fam.headOfFamily||'');}}
                  onClear={()=>setSelectedFamily(null)}
                />
                {selectedFamily && (
                  <div className="mt-2 px-3 py-2.5 rounded-xl border" style={{background:'#f0fdf4',borderColor:'#86efac'}}>
                    <p style={{fontSize:12,fontWeight:700,color:'#144f6b'}}>Keluarga {selectedFamily.headOfFamily}</p>
                    {familyMembers.length===0 ? (
                      <p style={{fontSize:11,color:'#dc2626'}} className="mt-1">Belum ada anggota dengan familyId keluarga ini.</p>
                    ) : (
                      <ul className="mt-1 space-y-0.5">
                        {familyMembers.map((m:any)=><li key={m.id} style={{fontSize:11.5,color:'#16a34a'}}>• {m.fullName}</li>)}
                      </ul>
                    )}
                    <p style={{fontSize:10.5,color:'#64748b'}} className="mt-1.5">Atestasi akan dibuat untuk {familyMembers.length} anggota di atas sekaligus, dengan data gereja/tanggal/status yang sama.</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="col-span-2">
                  <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Pilih dari Anggota Terdaftar</label>
                  <select autoFocus value={f.memberId} onChange={e=>handleMember(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none" style={{borderColor:'#e2e8f0'}}>
                    <option value="">— Pilih anggota atau isi manual —</option>
                    {[...members].sort((a,b)=>a.fullName.localeCompare(b.fullName,'id')).map(m=><option key={m.id} value={m.id}>{m.fullName}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Nama Jemaat <span className="text-red-400">*</span></label>
                  <input value={f.memberName} onChange={e=>h('memberName',e.target.value)} placeholder="Nama lengkap"
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none" style={{borderColor:'#e2e8f0'}}/>
                </div>
              </>
            )}

            <div>
              <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>
                {isIn ? 'Gereja Asal' : 'Gereja Asal'}
              </label>
              <input value={f.fromChurch} onChange={e=>h('fromChurch',e.target.value)}
                placeholder={isIn ? 'Nama gereja asal anggota' : 'GPIB Trinitas'}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none" style={{borderColor:'#e2e8f0'}}/>
            </div>
            <div>
              <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Gereja Tujuan <span className="text-red-400">*</span></label>
              <input value={f.toChurch} onChange={e=>h('toChurch',e.target.value)}
                placeholder={isIn ? 'GPIB Trinitas' : 'Nama gereja tujuan'}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none" style={{borderColor:'#e2e8f0'}}/>
            </div>
            <div>
              <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Tanggal Permohonan <span className="text-red-400">*</span></label>
              <input type="date" value={f.requestDate} onChange={e=>h('requestDate',e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none" style={{borderColor:'#e2e8f0'}}/>
            </div>
            <div>
              <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>No. Surat Atestasi</label>
              <input value={f.letterNumber} onChange={e=>h('letterNumber',e.target.value)} placeholder="AT/001/III/26"
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none" style={{borderColor:'#e2e8f0'}}/>
            </div>
            <div>
              <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Status</label>
              <select value={f.status} onChange={e=>h('status',e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none" style={{borderColor:'#e2e8f0'}}>
                {STATUS_SURAT_OPTS.map((s: string)=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Diproses Oleh</label>
              <input value={f.processedBy} onChange={e=>h('processedBy',e.target.value)} placeholder="Nama majelis"
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none" style={{borderColor:'#e2e8f0'}}/>
            </div>
            <div>
              <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Tgl Diproses</label>
              <input type="date" value={f.processedDate} onChange={e=>h('processedDate',e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none" style={{borderColor:'#e2e8f0'}}/>
            </div>
            <div>
              <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Tgl Selesai</label>
              <input type="date" value={f.completedDate} onChange={e=>h('completedDate',e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none" style={{borderColor:'#e2e8f0'}}/>
            </div>
            {isIn && mode!=='keluarga' && (
              <div className="col-span-2 p-3 rounded-xl" style={{background:'#f0fdf4',border:'1px solid #bbf7d0'}}>
                <p style={{fontSize:'11px',fontWeight:700,color:'#144f6b',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.03em'}}>Data Kontak & Domisili</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>No. HP</label>
                    <input value={f.phone} onChange={e=>h('phone',e.target.value)} placeholder="08xxxxxxxxxx"
                      className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none" style={{borderColor:'#e2e8f0'}}/>
                  </div>
                  <div>
                    <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Sektor</label>
                    <select value={f.sectorId} onChange={e=>handleSector(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none" style={{borderColor:'#e2e8f0'}}>
                      <option value="">— Pilih Sektor —</option>
                      {sectors.map((s: any)=><option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Alamat (Sekarang)</label>
                    <textarea value={f.address} onChange={e=>h('address',e.target.value)} rows={2}
                      className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none resize-none" style={{borderColor:'#e2e8f0'}}/>
                  </div>
                  {f.sectorId && (
                    <>
                      <div>
                        <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>No. Induk</label>
                        <input value={f.memberNumber} onChange={e=>h('memberNumber',e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border text-sm font-mono focus:outline-none" style={{borderColor:'#e2e8f0'}}/>
                        <p style={{fontSize:'10px',color:'#94a3b8',marginTop:3}}>Saran otomatis mengikuti format sektor terpilih, bisa diedit manual.</p>
                      </div>
                      <div>
                        <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>No. KK</label>
                        <input value={f.familyCode} onChange={e=>h('familyCode',e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border text-sm font-mono focus:outline-none" style={{borderColor:'#e2e8f0'}}/>
                        <p style={{fontSize:'10px',color:'#94a3b8',marginTop:3}}>Saran otomatis mengikuti format sektor terpilih, bisa diedit manual.</p>
                      </div>
                    </>
                  )}
                </div>
                <p style={{fontSize:'10.5px',color:'#64748b',marginTop:6}}>Dipakai untuk pra-isi data saat mendaftarkan anggota ini di Database Warga, kalau belum terdaftar.</p>
              </div>
            )}
            <div className="col-span-2">
              <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Alasan</label>
              <textarea value={f.reason} onChange={e=>h('reason',e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none resize-none" style={{borderColor:'#e2e8f0'}}/>
            </div>
            <div className="col-span-2">
              <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Catatan</label>
              <textarea value={f.notes} onChange={e=>h('notes',e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none resize-none" style={{borderColor:'#e2e8f0'}}/>
            </div>
          </div>
          {err&&<div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{background:'#fef2f2',color:'#dc2626'}}><AlertCircle className="w-4 h-4"/>{err}</div>}
        </div>
        <div className="px-6 pb-5 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50" style={{borderColor:'#e2e8f0'}}>Batal</button>
          <button onClick={submit} className="px-5 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90"
            style={{background:isIn?'#144f6b':'#9c9486'}}>Simpan</button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export function AttestationDatabase({ onNavigate }: { onNavigate?: (page: string) => void } = {}) {
  const { offset, onMouseDown } = useDraggable();
  const { attestations, members, families, currentUser, addAttestation: _addAttestation, updateAttestation: _updateAttestation, updateMember, getMasterDataByCategory, can, setPendingLetterDraft, setPendingMemberDraft } = useApp();

  // Use context attestations as source of truth; sync via API
  const [items, setItems] = useState<Attestation[]>(attestations||[]);
  React.useEffect(()=>{ setItems(attestations||[]); },[attestations]);

  // Reload from API when another component saves a new attestation
  React.useEffect(() => {
    const handler = () => {
      api.get<Attestation[]>('/api/data/attestations')
        .then(data => { if (data) setItems(data); })
        .catch(() => {});
    };
    window.addEventListener('gpib:attestations:updated', handler);
    return () => window.removeEventListener('gpib:attestations:updated', handler);
  }, []);

  const [outerTab, setOuterTab] = useState<'atestasi'|'mutasi'>('atestasi');
  const [tab, setTab] = useState<'all'|'masuk'|'keluar'>('all');
  const [searchQ, setSearchQ] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [yearF, setYearF] = useState('all');
  const [page, setPage] = useState(1);
  const [showDetail, setShowDetail] = useState<Attestation|null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Attestation|null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Attestation|null>(null);
  const ITEMS = 12;
  const statusSuratListMain = getMasterDataByCategory('status_permohonan_surat').map(m => m.value);
  const STATUS_SURAT_OPTS = statusSuratListMain.length ? statusSuratListMain : ['Diajukan', 'Diproses', 'Selesai', 'Ditolak'];

  const filtered = useMemo(()=>{
    let r=[...items];
    if(tab==='masuk') r=r.filter(a=>a.type==='Pindah Masuk');
    else if(tab==='keluar') r=r.filter(a=>a.type==='Pindah Keluar');
    if(searchQ){const q=searchQ.toLowerCase();r=r.filter(a=>a.memberName.toLowerCase().includes(q)||a.fromChurch?.toLowerCase().includes(q)||a.toChurch?.toLowerCase().includes(q)||a.letterNumber?.toLowerCase().includes(q));}
    if(statusF!=='all') r=r.filter(a=>a.status===statusF);
    if(yearF!=='all') r=r.filter(a=>a.requestDate?.startsWith(yearF));
    return r.sort((a,b)=>new Date(b.requestDate||'').getTime()-new Date(a.requestDate||'').getTime());
  },[items,tab,searchQ,statusF,yearF]);

  const totalPages = Math.max(1,Math.ceil(filtered.length/ITEMS));
  const pageItems = filtered.slice((page-1)*ITEMS,page*ITEMS);
  const { widths: colW, startResize } = useResizableColumns('attestation-database-main', ATTESTATION_TABLE_DEFAULT_WIDTHS);

  const stats = {
    total: items.length,
    masuk: items.filter(a=>a.type==='Pindah Masuk').length,
    keluar: items.filter(a=>a.type==='Pindah Keluar').length,
    diajukan: items.filter(a=>normStatusSurat(a.status)==='Diajukan').length,
    diproses: items.filter(a=>normStatusSurat(a.status)==='Diproses').length,
    selesai: items.filter(a=>normStatusSurat(a.status)==='Selesai').length,
    ditolak: items.filter(a=>normStatusSurat(a.status)==='Ditolak').length,
  };

  const handleSave = async (d:any) => {
    if(editItem){
      let merged: Attestation = {...editItem,...d,updatedAt:new Date().toISOString()};
      // gap-fix: kalau status berubah lewat form Edit ini, jalankan validasi &
      // efek samping yang sama seperti tombol status cepat (lihat applyStatusChange)
      // — sebelumnya form Edit bisa melompat langsung ke "Selesai" tanpa cek
      // kelengkapan dokumen/surat dan tanpa memperbarui membershipStatus anggota.
      if(d.status && d.status !== editItem.status){
        const withEffects = await applyStatusChange(merged, d.status);
        if(!withEffects){ return; } // dibatalkan oleh admin di tengah konfirmasi
        merged = withEffects;
      }
      setItems(p=>p.map(a=>a.id===editItem.id?merged:a));
      apiSave('attestations', merged.id, merged);
    } else {
      const newItem: Attestation = { ...d, id:'at'+Date.now(), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
      setItems(p=>[newItem,...p]);
      apiSave('attestations', newItem.id, newItem);
    }
    setShowForm(false); setEditItem(null);
  };

  // Simpan sekaligus untuk beberapa anggota (fitur "1 Keluarga") - satu record Attestation
  // per anggota, memakai id unik per baris agar tidak bentrok dengan Date.now() yang sama.
  const handleSaveBatch = (rows:any[]) => {
    const now = new Date().toISOString();
    const newItems: Attestation[] = rows.map((d,i)=>({ ...d, id:'at'+Date.now()+'-'+i, createdAt:now, updatedAt:now }));
    setItems(p=>[...newItems,...p]);
    newItems.forEach(it=>apiSave('attestations', it.id, it));
    setShowForm(false); setEditItem(null);
  };

  // Buat Surat (gap-fix Sept 2026): kirim data atestasi ini sebagai prefill ke
  // form Surat Keluar baru — surat pengantar/keterangan atestasi biasanya
  // ditujukan ke gereja tujuan (Pindah Keluar) atau merujuk gereja asal
  // (Pindah Masuk), makanya recipientName mengikuti arah att.type.
  const handleBuatSurat = (att: Attestation) => {
    const isIn = att.type === 'Pindah Masuk';
    const recipientName = isIn ? att.fromChurch : att.toChurch;
    setPendingLetterDraft({
      relatedModule: 'Atestasi',
      relatedId: att.id,
      memberId: att.memberId,
      recipientName,
      subject: `Surat ${att.type} — ${att.memberName}`,
      body: `Dengan ini kami ${isIn ? 'menerangkan penerimaan' : 'mengajukan permohonan'} ${att.type.toLowerCase()} atas nama ${att.memberName}, dari ${att.fromChurch} ke ${att.toChurch}. Alasan: ${att.reason || '-'}.`,
    });
    onNavigate?.('letters-outgoing');
  };

  // Toggle satu item checklist kelengkapan dokumen (Atestasi Masuk) — dipanggil
  // dari AttestationDetail, disimpan penuh via apiSave (persis pola handleUpdateStatus).
  const handleUpdateChecklist = (id:string, checklist:Record<string,boolean>) => {
    setItems(p=>p.map(a=>{
      if(a.id!==id) return a;
      const updated = {...a, documentChecklist:checklist, updatedAt:new Date().toISOString()};
      apiSave('attestations', id, updated);
      return updated;
    }));
    setShowDetail(prev=>prev&&prev.id===id?{...prev,documentChecklist:checklist}:prev);
  };

  // Terapkan satu perubahan status secara konsisten, dari MANA PUN ia dipicu
  // (tombol status cepat di detail, ATAU form Edit). Sebelum gap-fix ini, form
  // Edit bisa langsung menyimpan status baru lewat handleSave tanpa melalui
  // validasi kelengkapan dokumen/surat maupun sinkronisasi membershipStatus di
  // bawah — sehingga atestasi bisa "Selesai" tanpa anggota benar-benar tercatat
  // pindah. Mengembalikan null berarti admin membatalkan (lewat window.confirm)
  // di tengah proses, dan caller TIDAK boleh menyimpan perubahan apa pun.
  const applyStatusChange = async (att: Attestation, status: Attestation['status']): Promise<Attestation | null> => {
    if(status==='Selesai'){
      if(att.type==='Pindah Masuk'){
        const missing = DOCUMENT_CHECKLIST_ITEMS.filter(it=>!att.documentChecklist?.[it.id]);
        if(missing.length>0){
          const proceed = window.confirm(
            `Dokumen belum lengkap (${DOCUMENT_CHECKLIST_ITEMS.length-missing.length}/${DOCUMENT_CHECKLIST_ITEMS.length}):

`+
            missing.map(m=>`• ${m.label}`).join(`
`)+
            `

Tetap tandai Selesai?`
          );
          if(!proceed) return null;
        }
      } else if(att.type==='Pindah Keluar'){
        try{
          const letters = await api.get<any[]>('/api/data/outgoingLetters');
          const related = (letters||[]).filter(l=>l.relatedModule==='Atestasi'&&l.relatedId===att.id);
          const latest = related.sort((a,b)=>new Date(b.updatedAt||b.createdAt||0).getTime()-new Date(a.updatedAt||a.createdAt||0).getTime())[0];
          const doneStatuses = ['Ditandatangani','Terkirim','Diarsipkan'];
          if(!latest || !doneStatuses.includes(latest.status)){
            const label = latest ? latest.status : 'belum dibuat';
            const proceed = window.confirm(`Surat Atestasi untuk ${att.memberName} belum ditandatangani (status surat saat ini: ${label}).

Tetap tandai Selesai?`);
            if(!proceed) return null;
          }
        }catch{ /* kalau gagal cek status surat, jangan blokir aksi utama */ }
      }
    }

    const updated: Attestation = {...att,status,updatedAt:new Date().toISOString(),
      ...(status==='Selesai'?{completedDate:new Date().toISOString().split('T')[0]}:{}),
      ...(status==='Diproses'?{processedDate:new Date().toISOString().split('T')[0],processedBy:currentUser?.name||'Admin'}:{}),
    };

    if(status==='Selesai'){
      if(att.type==='Pindah Masuk' && !att.memberId){
        setPendingMemberDraft({
          relatedModule:'Atestasi', relatedId:att.id, fullName:att.memberName,
          phone:att.phone, address:att.address, familyCode:att.familyCode,
          sectorId:att.sectorId, memberNumber:att.memberNumber,
        });
        onNavigate?.('members');
      } else if(att.type==='Pindah Keluar' && att.memberId){
        updateMember(att.memberId, { membershipStatus:'Pindah' as any });
      }
    }

    return updated;
  };

  const handleUpdateStatus = async (id:string, status:Attestation['status']) => {
    const att = items.find(a=>a.id===id);
    if(!att) return;
    const updated = await applyStatusChange(att, status);
    if(!updated) return;
    setItems(p=>p.map(a=>a.id===id?updated:a));
    apiSave('attestations', id, updated);
    setShowDetail(prev=>prev&&prev.id===id?{...prev,status}:prev);
  };

  const exportPDF = () => {
    const doc = new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(13,40,24);doc.rect(0,0,W,20,'F');
    doc.setTextColor(255,255,255);doc.setFontSize(12);doc.setFont('helvetica','bold');
    doc.text('DAFTAR ATESTASI — GPIB TRINITAS',W/2,13,{align:'center'});
    autoTable(doc,{startY:25,
      head:[['No','Nama Jemaat','Tipe','Gereja Asal','Gereja Tujuan','Tgl Permohonan','No. Surat','Status']],
      body:filtered.map((a,i)=>[i+1,a.memberName,a.type,a.fromChurch,a.toChurch,fmtDate(a.requestDate),a.letterNumber||'',a.status]),
      headStyles:{fillColor:[13,40,24],textColor:255,fontSize:8},bodyStyles:{fontSize:7.5},margin:{left:10,right:10}});
    doc.save('Atestasi-GPIB-Trinitas.pdf');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5" style={{fontSize:'22px',fontWeight:700,color:'#0f172a',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:'#144f6b'}}>
              <FileText className="w-5 h-5 text-white"/>
            </div>
            Administrasi Perpindahan Jemaat
          </h1>
          <p style={{fontSize:'13px',color:'#64748b',marginTop:'2px'}}>GPIB Trinitas · Surat Atestasi & Mutasi Sektor</p>
        </div>
        {outerTab === 'atestasi' && (
          <div className="flex gap-2">
            <button onMouseDown={e=>e.preventDefault()} onClick={()=>{setEditItem(null);setShowForm(true);}} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow hover:opacity-90" style={{background:'#144f6b'}}>
              <Plus className="w-4 h-4"/> Tambah Atestasi
            </button>
            <button onClick={exportPDF} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border hover:bg-gray-50" style={{borderColor:'#e2e8f0',color:'#4b5563'}}>
              <Printer className="w-4 h-4"/> PDF
            </button>
          </div>
        )}
      </div>

      {/* Outer Tab Bar */}
      <div className="flex gap-1 p-1 rounded-xl self-start" style={{background:'#f1f5f9'}}>
        {([{id:'atestasi',l:'Surat Atestasi'},{id:'mutasi',l:'Mutasi Sektor'}] as const).map(t=>(
          <button key={t.id} onClick={()=>setOuterTab(t.id)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{background:outerTab===t.id?'#FFEFB2':'transparent',color:outerTab===t.id?'#384959':'#64748b',fontWeight:outerTab===t.id?700:500,boxShadow:outerTab===t.id?'0 1px 4px rgba(0,0,0,0.08)':'none'}}>
            {t.l}
          </button>
        ))}
      </div>

      {outerTab === 'mutasi' && <SectorTransferHistory />}

      {outerTab === 'atestasi' && <>
      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          {l:'Total',v:stats.total,c:'#374151',bg:'#f8fafc',bo:'#e2e8f0'},
          {l:'Pindah Masuk',v:stats.masuk,c:'#144f6b',bg:'#f0fdf4',bo:'#b8d5e8'},
          {l:'Pindah Keluar',v:stats.keluar,c:'#9c9486',bg:'#f6f4f0',bo:'#e8e4d8'},
          {l:'Diajukan',v:stats.diajukan,c:'#9c9486',bg:'#f6f4f0',bo:'#e8e4d8'},
          {l:'Diproses',v:stats.diproses,c:'#2563eb',bg:'#eff6ff',bo:'#bfdbfe'},
          {l:'Selesai',v:stats.selesai,c:'#144f6b',bg:'#f0fdf4',bo:'#b8d5e8'},
          {l:'Ditolak',v:stats.ditolak,c:'#dc2626',bg:'#fef2f2',bo:'#fecaca'},
        ].map((s,i)=>(
          <div key={i} className="rounded-xl p-3 border text-center" style={{background:s.bg,borderColor:s.bo}}>
            <p style={{fontSize:'20px',fontWeight:700,color:s.c,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{s.v}</p>
            <p style={{fontSize:'10px',color:s.c,fontWeight:600}}>{s.l}</p>
          </div>
        ))}
      </div>

      {/* Tabs + Filters */}
      <div className="rounded-2xl border bg-white overflow-hidden" style={{borderColor:'#e2e8f0',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
        <div className="flex items-center gap-3 p-3 border-b" style={{borderColor:'#f1f5f9'}}>
          <div className="flex gap-1 p-1 rounded-xl" style={{background:'#f1f5f9'}}>
            {[{id:'all',l:'Semua'},{id:'masuk',l:'Pindah Masuk'},{id:'keluar',l:'Pindah Keluar'}].map(t=>(
              <button key={t.id} onClick={()=>{setTab(t.id as any);setPage(1);}}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                style={{background:tab===t.id?'#FFEFB2':'transparent',color:tab===t.id?'#384959':'#64748b',fontWeight:tab===t.id?700:500,boxShadow:tab===t.id?'0 1px 4px rgba(0,0,0,0.08)':'none'}}>
                {t.id==='masuk'&&<ArrowRight className="w-3 h-3"/>}
                {t.id==='keluar'&&<ArrowLeft className="w-3 h-3"/>}
                {t.l}
              </button>
            ))}
          </div>
          <div className="flex-1">
            <SearchDropdown<any>
              value={searchQ}
              onChange={v => { setSearchQ(v); setPage(1); }}
              placeholder="Cari nama / gereja / no. surat..."
              items={attestations}
              filterFn={(a, q) => {
                const lq = q.toLowerCase();
                return a.memberName?.toLowerCase().includes(lq)
                  || a.fromChurch?.toLowerCase().includes(lq)
                  || a.toChurch?.toLowerCase().includes(lq)
                  || a.letterNumber?.toLowerCase().includes(lq);
              }}
              renderResult={a => (
                <div>
                  <p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{a.memberName}</p>
                  <p style={{fontSize:'11px',color:'#64748b',margin:0}}>{a.type} · {a.status}</p>
                </div>
              )}
              onSelect={a => { setSearchQ(a.memberName); setPage(1); }}
              onClear={() => setPage(1)}
            />
          </div>
        </div>
        <div className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'0.08em',color:'#b0bec5',textTransform:'uppercase',minWidth:'68px'}}>Filter</span>
            {([
              {val:statusF,set:(v:string)=>{setStatusF(v);setPage(1);},opts:[{v:'all',l:'Semua Status'},...STATUS_SURAT_OPTS.map(s=>({v:s,l:s}))]},
              {val:yearF,set:(v:string)=>{setYearF(v);setPage(1);},opts:[{v:'all',l:'Semua Tahun'},...Array.from({length:5},(_,i)=>String(new Date().getFullYear()-i)).map(y=>({v:y,l:y}))]},
            ] as {val:string;set:(v:string)=>void;opts:{v:string;l:string}[]}[]).map((f,i)=>{
              const active=f.val!=='all';
              return <select key={i} value={f.val} onChange={e=>f.set(e.target.value)} className="px-2.5 py-1 text-sm rounded-full border focus:outline-none transition-all cursor-pointer" style={{borderColor:active?'#144f6b':'#e2e8f0',background:active?'#f0f7fb':'#fafafa',color:active?'#144f6b':'#64748b',fontWeight:active?600:400}}>{f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>;
            })}
          </div>
        </div>
        {(searchQ||statusF!=='all'||yearF!=='all') ? (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
            <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,whiteSpace:'nowrap'}}>Filter aktif:</span>
            {searchQ && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#144f6b',border:'1px solid #b8d5e8'}}><Search className="w-3 h-3"/>"{searchQ.length>15?searchQ.slice(0,15)+'…':searchQ}"<button onClick={()=>{setSearchQ('');setPage(1);}} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
            {statusF!=='all' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#144f6b',border:'1px solid #b8d5e8'}}>{statusF}<button onClick={()=>{setStatusF('all');setPage(1);}} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
            {yearF!=='all' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#144f6b',border:'1px solid #b8d5e8'}}>{yearF}<button onClick={()=>{setYearF('all');setPage(1);}} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
            <button onClick={()=>{setSearchQ('');setStatusF('all');setYearF('all');setPage(1);}} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all hover:bg-red-50" style={{borderColor:'#fca5a5',color:'#ef4444'}}><X className="w-3 h-3"/>Reset Semua</button>
            <span className="ml-auto text-xs font-semibold" style={{color:'#144f6b'}}>{filtered.length} permohonan ditemukan</span>
          </div>
        ) : (
          <div className="px-3 pb-2 flex justify-end"><span style={{fontSize:'12px',color:'#94a3b8',fontWeight:500}}>{filtered.length} permohonan total</span></div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border bg-white overflow-hidden" style={{borderColor:'#e2e8f0'}}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{tableLayout:'fixed'}}>
            <thead>
              <tr style={{background:'#f6f4f0',borderBottom:'1px solid #e8e4d8'}}>
                {[
                  {label:'Jenis',col:'type'},
                  {label:'Nama Jemaat',col:'memberName'},
                  {label:'Gereja Asal → Tujuan',col:'churchTransfer'},
                  {label:'Tgl Permohonan',col:'requestDate'},
                  {label:'No. Surat',col:'letterNumber'},
                  {label:'Status',col:'status'},
                  {label:'Aksi',col:'aksi'},
                ].map(h=>(
                  <th key={h.col} className="px-4 py-3 text-left" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',whiteSpace:'nowrap',width:colW[h.col],position:'relative'}}>
                    {h.label}
                    <ColResizeHandle onMouseDown={startResize(h.col)} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.length===0 ? (
                <tr><td colSpan={7} className="py-16 text-center" style={{color:'#94a3b8',fontSize:'13px'}}>Belum ada data atestasi</td></tr>
              ) : pageItems.map(a=>(
                <tr key={a.id} className="border-b hover:bg-[#f6f4f0]/20 transition-colors cursor-pointer" style={{borderColor:'#f2f0ea'}} onClick={()=>setShowDetail(a)}>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold"
                      style={{background:a.type==='Pindah Masuk'?'#f0fdf4':'#f6f4f0',color:a.type==='Pindah Masuk'?'#144f6b':'#9c9486'}}>
                      {a.type==='Pindah Masuk'?<ArrowRight className="w-3 h-3"/>:<ArrowLeft className="w-3 h-3"/>}{a.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{background:a.type==='Pindah Masuk'?'#144f6b':'#9c9486'}}>
                        {a.memberName[0]}
                      </div>
                      <div>
                        <p style={{fontSize:'13px',fontWeight:600,color:'#334155'}}>{a.memberName}</p>
                        {a.reason && <p className="truncate max-w-xs" style={{fontSize:'10.5px',color:'#94a3b8'}} data-tooltip={a.reason} data-tooltip-truncate>{a.reason}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div style={{fontSize:'12px',color:'#4b5563'}}>
                      <span style={{color:'#94a3b8'}}>{a.fromChurch}</span>
                      <span className="mx-1.5">→</span>
                      <span style={{fontWeight:600}}>{a.toChurch}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap" style={{color:'#4b5563'}}>{fmtDate(a.requestDate)}</td>
                  <td className="px-4 py-3 text-xs font-mono" style={{color:'#94a3b8'}}>{a.letterNumber||'—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={a.status}/>
                      {a.type==='Pindah Masuk' && (()=>{ const done=DOCUMENT_CHECKLIST_ITEMS.filter(it=>!!a.documentChecklist?.[it.id]).length; return (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{background:done===DOCUMENT_CHECKLIST_ITEMS.length?'#f0fdf4':'#fef3c7',color:done===DOCUMENT_CHECKLIST_ITEMS.length?'#16a34a':'#b45309'}}>
                          {done}/{DOCUMENT_CHECKLIST_ITEMS.length}
                        </span>
                      );})()}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1" onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>setShowDetail(a)} data-tooltip="Lihat Detail" className="p-1.5 rounded-lg hover:bg-[#f6f4f0] transition-colors"><Eye className="w-3.5 h-3.5 text-[#144f6b]"/></button>
                      {can('letters-outgoing','create') && <button onClick={()=>handleBuatSurat(a)} data-tooltip="Buat Surat" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><Mail className="w-3.5 h-3.5 text-gray-400"/></button>}
                      <button onMouseDown={e=>e.preventDefault()} onClick={()=>{setEditItem(a);setShowForm(true);}} data-tooltip="Edit" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><Pencil className="w-3.5 h-3.5 text-gray-400"/></button>
                      <button onClick={()=>setDeleteTarget(a)} data-tooltip="Hapus" className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-400"/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages>1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{borderColor:'#f1f5f9'}}>
            <span style={{fontSize:'12px',color:'#64748b'}}>{filtered.length} permohonan · Hal. {page}/{totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page===1} onClick={()=>setPage(p=>p-1)} data-tooltip="Halaman Sebelumnya" className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50" style={{borderColor:'#e2e8f0'}}><ChevronLeft className="w-4 h-4 text-gray-500"/></button>
              <button disabled={page===totalPages} onClick={()=>setPage(p=>p+1)} data-tooltip="Halaman Berikutnya" className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50" style={{borderColor:'#e2e8f0'}}><ChevronRight className="w-4 h-4 text-gray-500"/></button>
            </div>
          </div>
        )}
      </div>

      </>}

      {/* Modals */}
      {showDetail && (
        <AttestationDetail att={showDetail} onClose={()=>setShowDetail(null)}
          onEdit={()=>{setEditItem(showDetail);setShowDetail(null);setShowForm(true);}}
          onUpdateStatus={handleUpdateStatus}
          onBuatSurat={handleBuatSurat}
          onUpdateChecklist={handleUpdateChecklist}/>
      )}
      {showForm && (
        <AttestationForm initial={editItem||undefined} members={members} families={families}
          onSave={handleSave} onSaveBatch={handleSaveBatch} onClose={()=>{setShowForm(false);setEditItem(null);}}/>
      )}
      {deleteTarget && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={()=>setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center" style={{transform:`translate(${offset.x}px,${offset.y}px)`}} onClick={e=>e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{background:'#f6f4f0',cursor:'move'}} onMouseDown={onMouseDown}><Trash2 className="w-6 h-6 text-[#144f6b]"/></div>
            <h3 style={{fontSize:'16px',fontWeight:700,color:'#0f172a',marginBottom:8}}>Hapus Data Atestasi?</h3>
            <p style={{fontSize:'13px',color:'#64748b',marginBottom:24}}>Atestasi <strong>{deleteTarget.memberName}</strong> akan dihapus permanen.</p>
            <div className="flex gap-3">
              <button onClick={()=>setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl border font-medium text-gray-600 hover:bg-gray-50 text-sm" style={{borderColor:'#e2e8f0'}}>Batal</button>
              <button onClick={()=>{apiRemove('attestations',deleteTarget.id);setItems(p=>p.filter(a=>a.id!==deleteTarget.id));setDeleteTarget(null);}} className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm hover:opacity-90" style={{background:'#c2baaa'}}>Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}