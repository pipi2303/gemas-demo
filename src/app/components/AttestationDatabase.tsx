import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Attestation } from '../types';
import { useDraggable } from '../../lib/useDraggable';
import { api, apiSave, apiRemove } from '../../lib/apiClient';
import { SectorTransferHistory } from './SectorTransferHistory';
import { SearchDropdown } from './ui/SearchDropdown';
import {
  FileText, Plus, Pencil, Trash2, Eye, X, Search, Download,
  AlertCircle, ChevronLeft, ChevronRight, CheckCircle2, Clock,
  ArrowRight, ArrowLeft, Ban, User, Calendar, Church, MapPin,
  Printer, FileCheck, RefreshCw, Filter, Lock
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColResizeHandle } from './ui/resizable-th';

const ATTESTATION_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  type: 130, memberName: 220, churchTransfer: 220, requestDate: 130, letterNumber: 140, status: 120, aksi: 100,
};

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' }) : '—';

// ── Status & type configs ──────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { bg:string; color:string; label:string; icon: React.ReactNode }> = {
  'Diajukan':  { bg:'#f6f4f0', color:'#9c9486', label:'Diajukan',  icon:<Clock className="w-3 h-3"/> },
  'Diproses':  { bg:'#eff6ff', color:'#2563eb', label:'Diproses',  icon:<RefreshCw className="w-3 h-3"/> },
  'Selesai':   { bg:'#f0fdf4', color:'#1A77A3', label:'Selesai',   icon:<CheckCircle2 className="w-3 h-3"/> },
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
              style={{background:i<=curr?'#1A77A3':'#e2e8f0',color:i<=curr?'#fff':'#94a3b8'}}>
              {i<curr?'✓':i+1}
            </div>
            <p style={{fontSize:'9px',color:i<=curr?'#1A77A3':'#94a3b8',marginTop:3,textAlign:'center',width:56}}>{s}</p>
          </div>
          {i<STEPS.length-1 && <div className="h-0.5 w-8 flex-shrink-0 mb-3" style={{background:i<curr?'#1A77A3':'#e2e8f0'}}/>}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── DETAIL MODAL ──────────────────────────────────────────────────────────────
function AttestationDetail({ att, onClose, onEdit, onUpdateStatus }: {
  att: Attestation; onClose:()=>void; onEdit:()=>void;
  onUpdateStatus:(id:string,status:Attestation['status'])=>void;
}) {
  const { offset, onMouseDown } = useDraggable();
  const isIn = att.type === 'Pindah Masuk';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" style={{maxHeight:'90vh', transform:`translate(${offset.x}px,${offset.y}px)`}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-5 flex-shrink-0" style={{background:isIn?'#1A77A3':'#9c9486',cursor:'move'}} onMouseDown={onMouseDown}>
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
                  <button onClick={()=>onUpdateStatus(att.id,'Selesai')} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{background:'#1A77A3'}}>
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
          <button onClick={onEdit} className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90" style={{background:'#1A77A3'}}>
            <Pencil className="w-3.5 h-3.5 mr-1.5 inline"/> Edit
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FORM ──────────────────────────────────────────────────────────────────────
export function AttestationForm({ initial, members, onSave, onClose }: {
  initial?: Partial<Attestation>; members: any[];
  onSave:(d:any)=>void; onClose:()=>void;
}) {
  const { offset, onMouseDown } = useDraggable();
  const { getMasterDataByCategory, attestations: allAttestations } = useApp();
  const statusSuratList = getMasterDataByCategory('status_permohonan_surat').map(m => m.value);
  const STATUS_SURAT_OPTS = statusSuratList.length ? statusSuratList : ['Diajukan', 'Diproses', 'Selesai', 'Ditolak'];
  const tipeAtestasi = getMasterDataByCategory('tipe_atestasi').map(m => m.value);
  const TIPE_ATESTASI = tipeAtestasi.length ? tipeAtestasi : ['Pindah Masuk','Pindah Keluar'];
  // Detect if the form is opened in "locked-member" mode (from a member's detail popup)
  const lockedMember = !!(initial?.memberId && initial?.memberName && !initial?.id);

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
  });
  const [err, setErr] = useState('');
  const h=(k:string,v:string)=>setF(p=>({...p,[k]:v}));

  // Auto-set fromChurch/toChurch based on type
  const handleType = (t:string) => {
    if(t==='Pindah Masuk') setF(p=>({...p,type:t,fromChurch:'',toChurch:'GPIB Trinitas'}));
    else setF(p=>({...p,type:t,fromChurch:'GPIB Trinitas',toChurch:''}));
  };

  // Auto-fill name when member selected (only in non-locked mode)
  const handleMember = (id:string) => {
    const m=members.find(m=>m.id===id);
    setF(p=>({...p,memberId:id,memberName:m?.fullName||''}));
  };

  const submit=()=>{
    if(!f.memberName||!f.requestDate||!f.toChurch){setErr('Nama, tanggal permohonan, dan gereja tujuan wajib diisi');return;}
    onSave(f);
  };

  const isIn = f.type==='Pindah Masuk';

  // Avatar initials helper
  const memberInitials = f.memberName.split(' ').slice(0,2).map((w:string)=>w[0]||'').join('').toUpperCase();

  return (
    // z-[60] so this stacks above MemberDetail modal (z-50)
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.55)'}} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" style={{maxHeight:'90vh', transform:`translate(${offset.x}px,${offset.y}px)`}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b" style={{background:isIn?'#1A77A3':'#9c9486',cursor:'move'}} onMouseDown={onMouseDown}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-semibold flex items-center gap-2" style={{fontSize:'15px'}}>
                {isIn?<ArrowRight className="w-4 h-4"/>:<ArrowLeft className="w-4 h-4"/>}
                {initial?.id ? 'Edit Atestasi' : lockedMember ? 'Ajukan Atestasi Baru' : 'Tambah Permohonan Atestasi'}
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
                style={{borderColor:f.type===t?(t==='Pindah Masuk'?'#1A77A3':'#9c9486'):'#e2e8f0',background:f.type===t?(t==='Pindah Masuk'?'#f0fdf4':'#f6f4f0'):'#fff',color:f.type===t?(t==='Pindah Masuk'?'#1A77A3':'#9c9486'):'#64748b'}}>
                {t==='Pindah Masuk'?<ArrowRight className="w-4 h-4"/>:<ArrowLeft className="w-4 h-4"/>}{t}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* ── Member section: locked vs free ── */}
            {lockedMember ? (
              <div className="col-span-2">
                <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Anggota Jemaat</label>
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
                  style={{background:'#f0fdf4',borderColor:'#86efac'}}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                    style={{background:'#1A77A3',fontSize:13,fontWeight:800}}>
                    {memberInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{fontSize:'13px',fontWeight:700,color:'#1A77A3'}} className="truncate" data-tooltip={f.memberName} data-tooltip-truncate>{f.memberName}</p>
                    <p style={{fontSize:'10.5px',color:'#16a34a'}}>Anggota dipilih otomatis dari profil</p>
                  </div>
                  <Lock className="w-3.5 h-3.5 flex-shrink-0" style={{color:'#16a34a'}}/>
                </div>
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
            style={{background:isIn?'#1A77A3':'#9c9486'}}>Simpan</button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export function AttestationDatabase() {
  const { offset, onMouseDown } = useDraggable();
  const { attestations, members, currentUser, addAttestation: _addAttestation, updateAttestation: _updateAttestation, getMasterDataByCategory } = useApp();

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

  const handleSave = (d:any) => {
    if(editItem){
      const updated: Attestation = {...editItem,...d,updatedAt:new Date().toISOString()};
      setItems(p=>p.map(a=>a.id===editItem.id?updated:a));
      apiSave('attestations', updated.id, updated);
    } else {
      const newItem: Attestation = { ...d, id:'at'+Date.now(), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
      setItems(p=>[newItem,...p]);
      apiSave('attestations', newItem.id, newItem);
    }
    setShowForm(false); setEditItem(null);
  };

  const handleUpdateStatus = (id:string, status:Attestation['status']) => {
    setItems(p=>p.map(a=>{
      if(a.id!==id) return a;
      const updated = {...a,status,updatedAt:new Date().toISOString(),
        ...(status==='Selesai'?{completedDate:new Date().toISOString().split('T')[0]}:{}),
        ...(status==='Diproses'?{processedDate:new Date().toISOString().split('T')[0],processedBy:currentUser?.name||'Admin'}:{}),
      };
      apiSave('attestations', id, updated);
      return updated;
    }));
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
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:'#1A77A3'}}>
              <FileText className="w-5 h-5 text-white"/>
            </div>
            Administrasi Perpindahan Jemaat
          </h1>
          <p style={{fontSize:'13px',color:'#64748b',marginTop:'2px'}}>GPIB Trinitas · Surat Atestasi & Mutasi Sektor</p>
        </div>
        {outerTab === 'atestasi' && (
          <div className="flex gap-2">
            <button onMouseDown={e=>e.preventDefault()} onClick={()=>{setEditItem(null);setShowForm(true);}} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow hover:opacity-90" style={{background:'#1A77A3'}}>
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
          {l:'Pindah Masuk',v:stats.masuk,c:'#1A77A3',bg:'#f0fdf4',bo:'#b8d5e8'},
          {l:'Pindah Keluar',v:stats.keluar,c:'#9c9486',bg:'#f6f4f0',bo:'#e8e4d8'},
          {l:'Diajukan',v:stats.diajukan,c:'#9c9486',bg:'#f6f4f0',bo:'#e8e4d8'},
          {l:'Diproses',v:stats.diproses,c:'#2563eb',bg:'#eff6ff',bo:'#bfdbfe'},
          {l:'Selesai',v:stats.selesai,c:'#1A77A3',bg:'#f0fdf4',bo:'#b8d5e8'},
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
              return <select key={i} value={f.val} onChange={e=>f.set(e.target.value)} className="px-2.5 py-1 text-sm rounded-full border focus:outline-none transition-all cursor-pointer" style={{borderColor:active?'#1A77A3':'#e2e8f0',background:active?'#f0f7fb':'#fafafa',color:active?'#1A77A3':'#64748b',fontWeight:active?600:400}}>{f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>;
            })}
          </div>
        </div>
        {(searchQ||statusF!=='all'||yearF!=='all') ? (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
            <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,whiteSpace:'nowrap'}}>Filter aktif:</span>
            {searchQ && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}><Search className="w-3 h-3"/>"{searchQ.length>15?searchQ.slice(0,15)+'…':searchQ}"<button onClick={()=>{setSearchQ('');setPage(1);}} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
            {statusF!=='all' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>{statusF}<button onClick={()=>{setStatusF('all');setPage(1);}} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
            {yearF!=='all' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>{yearF}<button onClick={()=>{setYearF('all');setPage(1);}} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
            <button onClick={()=>{setSearchQ('');setStatusF('all');setYearF('all');setPage(1);}} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all hover:bg-red-50" style={{borderColor:'#fca5a5',color:'#ef4444'}}><X className="w-3 h-3"/>Reset Semua</button>
            <span className="ml-auto text-xs font-semibold" style={{color:'#1A77A3'}}>{filtered.length} permohonan ditemukan</span>
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
                      style={{background:a.type==='Pindah Masuk'?'#f0fdf4':'#f6f4f0',color:a.type==='Pindah Masuk'?'#1A77A3':'#9c9486'}}>
                      {a.type==='Pindah Masuk'?<ArrowRight className="w-3 h-3"/>:<ArrowLeft className="w-3 h-3"/>}{a.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{background:a.type==='Pindah Masuk'?'#1A77A3':'#9c9486'}}>
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
                  <td className="px-4 py-3"><StatusBadge status={a.status}/></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1" onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>setShowDetail(a)} data-tooltip="Lihat Detail" className="p-1.5 rounded-lg hover:bg-[#f6f4f0] transition-colors"><Eye className="w-3.5 h-3.5 text-[#1A77A3]"/></button>
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
          onUpdateStatus={handleUpdateStatus}/>
      )}
      {showForm && (
        <AttestationForm initial={editItem||undefined} members={members}
          onSave={handleSave} onClose={()=>{setShowForm(false);setEditItem(null);}}/>
      )}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={()=>setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center" style={{transform:`translate(${offset.x}px,${offset.y}px)`}} onClick={e=>e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{background:'#f6f4f0',cursor:'move'}} onMouseDown={onMouseDown}><Trash2 className="w-6 h-6 text-[#1A77A3]"/></div>
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