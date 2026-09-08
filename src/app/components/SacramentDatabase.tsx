import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Baptism, Sidi, Marriage } from '../types';
import { useDraggable } from '../../lib/useDraggable';
import { api } from '../../lib/apiClient';
import { toast } from 'sonner';
import { SearchDropdown } from './ui/SearchDropdown';
import {
  Droplet, CheckCircle2, Heart, Plus, Pencil, Trash2, Eye, X,
  Search, Filter, Download, AlertCircle, ChevronLeft, ChevronRight,
  Baby, Users2, HeartHandshake, Calendar, User, FileText, Printer,
  BadgeCheck, Clock, Ban, CheckCircle, ArrowUp, ArrowDown, ArrowUpDown,
  Upload, Loader2
} from 'lucide-react';
import { useSortable } from '../../hooks/useSortable';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColResizeHandle } from './ui/resizable-th';

const SACRAMENT_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  memberName: 200, type: 100, baptismDate: 140, baptismPlace: 160, minister: 150, certificateNumber: 140, status: 120,
  sidiDate: 140, sidiPlace: 160,
  groomName: 180, brideName: 180, marriageDate: 140, marriagePlace: 160,
  aksi: 90,
};

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' }) : '—';
const formatBytes = (bytes: number) => {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb/1024).toFixed(2)} MB`;
};
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024; // 2MB

interface SacramentDocument {
  id: string;
  sacramentId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileData: string; // base64
  uploadedAt: string;
  uploadedBy: string;
}

// Master Data 'status_sakramen' menyediakan opsi dropdown status, tapi mengedit label item
// Master Data di menu admin ikut menimpa value-nya (value = label). Fungsi ini menambah
// jalur cadangan lewat kata kunci supaya warna badge dan KPI "Selesai" tidak diam-diam
// berhenti mengenali status kalau label salah satu dari 4 status ini pernah diedit.
function normStatusSakramen(status: string): 'Terjadwal' | 'Selesai' | 'Ditunda' | 'Dibatalkan' {
  const s = (status || '').toLowerCase();
  if (s === 'terjadwal' || s.includes('jadwal')) return 'Terjadwal';
  if (s === 'selesai' || s.includes('selesai')) return 'Selesai';
  if (s === 'ditunda' || s.includes('tunda')) return 'Ditunda';
  if (s === 'dibatalkan' || s.includes('batal')) return 'Dibatalkan';
  return 'Terjadwal';
}

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
    'Terjadwal': { bg:'#f0ede5', color:'#1A77A3', icon:<Clock className="w-3 h-3"/> },
    'Selesai':   { bg:'#f0fdf4', color:'#1A77A3', icon:<CheckCircle className="w-3 h-3"/> },
    'Ditunda':   { bg:'#f6f4f0', color:'#9c9486', icon:<Clock className="w-3 h-3"/> },
    'Dibatalkan':{ bg:'#fef2f2', color:'#dc2626', icon:<Ban className="w-3 h-3"/> },
  };
  const c = cfg[normStatusSakramen(status)];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{background:c.bg,color:c.color}}>
      {c.icon}{status}
    </span>
  );
}

// ── Shared Field — didefinisikan di module level agar tidak re-mount tiap render ──
function SacramentField({ label, value, onChange, type='text', opts, autoFocus, ring='ring-[#1A77A3]' }: {
  label:string; value:string; onChange:(v:string)=>void;
  type?:string; opts?:string[]; autoFocus?:boolean; ring?:string;
}) {
  return (
    <div>
      <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>{label}</label>
      {opts
        ? <select autoFocus={autoFocus} value={value} onChange={e=>onChange(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:${ring}`}
            style={{borderColor:'#e2e8f0'}}>
            {opts.map(o=><option key={o} value={o}>{o}</option>)}
          </select>
        : <input autoFocus={autoFocus} type={type} value={value} onChange={e=>onChange(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:${ring}`}
            style={{borderColor:'#e2e8f0'}}/>
      }
    </div>
  );
}

// ── BAPTISM ───────────────────────────────────────────────────────────────────
function BaptismForm({ initial, onSave, onClose }: { initial?: Partial<Baptism>; onSave:(d:any)=>void; onClose:()=>void }) {
  const { offset, onMouseDown } = useDraggable();
  const { members, getMasterDataByCategory } = useApp();
  const pelayanOpts = getMasterDataByCategory('daftar_pelayan').map(m => m.value);
  const tempatOpts = getMasterDataByCategory('tempat_sakramen').map(m => m.value);
  const statusSakramenOpts = getMasterDataByCategory('status_sakramen').map(m => m.value);
  const STATUS_OPTS = statusSakramenOpts.length ? statusSakramenOpts : ['Terjadwal','Selesai','Ditunda','Dibatalkan'];
  const [f, setF] = useState({
    memberName:initial?.memberName||'', type:initial?.type||'Anak',
    baptismDate:initial?.baptismDate||'', baptismPlace:initial?.baptismPlace||'GPIB Trinitas',
    minister:initial?.minister||'',
    witness1:initial?.witness1||'', witness2:initial?.witness2||'',
    fatherName:initial?.parents?.fatherName||'', motherName:initial?.parents?.motherName||'',
    certificateNumber:initial?.certificateNumber||'', status:initial?.status||'Terjadwal', notes:initial?.notes||''
  });
  const [err, setErr] = useState('');
  const h = (k:string,v:string)=>setF(p=>({...p,[k]:v}));
  const submit = ()=>{
    if(!f.memberName||!f.baptismDate){setErr('Nama dan tanggal baptis wajib diisi');return;}
    onSave({...f,parents:{fatherName:f.fatherName,motherName:f.motherName}});
  };
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" style={{maxHeight:'90vh', transform:`translate(${offset.x}px,${offset.y}px)`}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDown}>
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold flex items-center gap-2" style={{fontSize:'15px'}}>
              <Droplet className="w-4 h-4"/> {initial?.memberName?'Edit Catatan Baptisan':'Tambah Catatan Baptisan'}
            </h3>
            <button onClick={onClose} data-tooltip="Tutup" className="text-white/50 hover:text-white"><X className="w-4 h-4"/></button>
          </div>
        </div>
        <div className="p-5 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{display:'block',marginBottom:4,fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Nama Jemaat*</label>
              <SearchDropdown<any>
                value={f.memberName}
                onChange={v=>h('memberName',v)}
                placeholder="Cari nama jemaat..."
                items={members}
                filterFn={(m,q)=>m.fullName.toLowerCase().includes(q.toLowerCase())||m.memberNumber?.toLowerCase().includes(q.toLowerCase())}
                renderResult={m=>(
                  <div>
                    <p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{m.fullName}</p>
                    <p style={{fontSize:'11px',color:'#64748b',margin:0}}>{m.memberNumber||'-'}</p>
                  </div>
                )}
                onSelect={m=>h('memberName',m.fullName)}
              />
            </div>
            <SacramentField label="Tipe Baptisan" value={f.type} onChange={v=>h('type',v)} opts={['Anak','Dewasa']}/>
            <SacramentField label="Tanggal Baptis*" value={f.baptismDate} onChange={v=>h('baptismDate',v)} type="date"/>
            <SacramentField label="Tempat Baptis" value={f.baptismPlace} onChange={v=>h('baptismPlace',v)} opts={tempatOpts.length ? tempatOpts : undefined}/>
            <SacramentField label="Pendeta / Pelayan" value={f.minister} onChange={v=>h('minister',v)} opts={pelayanOpts.length ? pelayanOpts : undefined}/>
            <SacramentField label="Saksi 1" value={f.witness1} onChange={v=>h('witness1',v)}/>
            <SacramentField label="Saksi 2" value={f.witness2} onChange={v=>h('witness2',v)}/>
            <SacramentField label="No. Surat Baptis" value={f.certificateNumber} onChange={v=>h('certificateNumber',v)}/>
            {f.type==='Anak'&&<><SacramentField label="Nama Ayah" value={f.fatherName} onChange={v=>h('fatherName',v)}/><SacramentField label="Nama Ibu" value={f.motherName} onChange={v=>h('motherName',v)}/></>}
            <SacramentField label="Status" value={f.status} onChange={v=>h('status',v)} opts={STATUS_OPTS}/>
            <div className="col-span-2">
              <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Catatan</label>
              <textarea value={f.notes} onChange={e=>h('notes',e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3] resize-none" style={{borderColor:'#e2e8f0'}}/>
            </div>
          </div>
          {err&&<div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{background:'#fef2f2',color:'#dc2626'}}><AlertCircle className="w-4 h-4"/>{err}</div>}
        </div>
        <div className="px-6 pb-5 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50" style={{borderColor:'#e2e8f0'}}>Batal</button>
          <button onClick={submit} className="px-5 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90" style={{background:'#1A77A3'}}>Simpan</button>
        </div>
      </div>
    </div>
  );
}

// ── SIDI ──────────────────────────────────────────────────────────────────────
function SidiForm({ initial, onSave, onClose }: { initial?: Partial<Sidi>; onSave:(d:any)=>void; onClose:()=>void }) {
  const { offset, onMouseDown } = useDraggable();
  const { members, getMasterDataByCategory } = useApp();
  const pelayanOpts = getMasterDataByCategory('daftar_pelayan').map(m => m.value);
  const tempatOpts = getMasterDataByCategory('tempat_sakramen').map(m => m.value);
  const statusSakramenOpts = getMasterDataByCategory('status_sakramen').map(m => m.value);
  const STATUS_OPTS = statusSakramenOpts.length ? statusSakramenOpts : ['Terjadwal','Selesai','Ditunda','Dibatalkan'];
  const [f, setF] = useState({
    memberName:initial?.memberName||'', sidiDate:initial?.sidiDate||'',
    sidiPlace:initial?.sidiPlace||'GPIB Trinitas',
    minister:initial?.minister||'',
    baptismDate:initial?.baptismDate||'', baptismPlace:initial?.baptismPlace||'',
    certificateNumber:initial?.certificateNumber||'', status:initial?.status||'Terjadwal', notes:initial?.notes||''
  });
  const [err, setErr] = useState('');
  const h=(k:string,v:string)=>setF(p=>({...p,[k]:v}));
  const submit=()=>{if(!f.memberName||!f.sidiDate){setErr('Nama dan tanggal sidi wajib diisi');return;}onSave(f);};
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" style={{maxHeight:'90vh', transform:`translate(${offset.x}px,${offset.y}px)`}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDown}>
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold flex items-center gap-2" style={{fontSize:'15px'}}><CheckCircle2 className="w-4 h-4"/> {initial?.memberName?'Edit Catatan Sidi':'Tambah Catatan Sidi'}</h3>
            <button onClick={onClose} data-tooltip="Tutup" className="text-white/50 hover:text-white"><X className="w-4 h-4"/></button>
          </div>
        </div>
        <div className="p-5 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{display:'block',marginBottom:4,fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Nama Jemaat*</label>
              <SearchDropdown<any>
                value={f.memberName}
                onChange={v=>h('memberName',v)}
                placeholder="Cari nama jemaat..."
                items={members}
                filterFn={(m,q)=>m.fullName.toLowerCase().includes(q.toLowerCase())||m.memberNumber?.toLowerCase().includes(q.toLowerCase())}
                renderResult={m=>(
                  <div>
                    <p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{m.fullName}</p>
                    <p style={{fontSize:'11px',color:'#64748b',margin:0}}>{m.memberNumber||'-'} · {m.baptismDate?'Sudah Baptis':''}</p>
                  </div>
                )}
                onSelect={m=>{
                  h('memberName',m.fullName);
                  if(m.baptismDate) h('baptismDate',m.baptismDate);
                }}
              />
            </div>
            <SacramentField label="Tanggal Sidi*" value={f.sidiDate} onChange={v=>h('sidiDate',v)} type="date"/>
            <SacramentField label="Tempat Sidi" value={f.sidiPlace} onChange={v=>h('sidiPlace',v)} opts={tempatOpts.length ? tempatOpts : undefined}/>
            <SacramentField label="Pendeta / Pelayan" value={f.minister} onChange={v=>h('minister',v)} opts={pelayanOpts.length ? pelayanOpts : undefined}/>
            <SacramentField label="Tanggal Baptis Sebelumnya" value={f.baptismDate} onChange={v=>h('baptismDate',v)} type="date"/>
            <SacramentField label="Tempat Baptis" value={f.baptismPlace} onChange={v=>h('baptismPlace',v)} opts={tempatOpts.length ? tempatOpts : undefined}/>
            <SacramentField label="No. Surat Sidi" value={f.certificateNumber} onChange={v=>h('certificateNumber',v)}/>
            <SacramentField label="Status" value={f.status} onChange={v=>h('status',v)} opts={STATUS_OPTS}/>
            <div className="col-span-2"><label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Catatan</label>
              <textarea value={f.notes} onChange={e=>h('notes',e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3] resize-none" style={{borderColor:'#e2e8f0'}}/></div>
          </div>
          {err&&<div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{background:'#fef2f2',color:'#dc2626'}}><AlertCircle className="w-4 h-4"/>{err}</div>}
        </div>
        <div className="px-6 pb-5 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50" style={{borderColor:'#e2e8f0'}}>Batal</button>
          <button onClick={submit} className="px-5 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90" style={{background:'#1A77A3'}}>Simpan</button>
        </div>
      </div>
    </div>
  );
}

// ── MARRIAGE ──────────────────────────────────────────────────────────────────
function MarriageForm({ initial, onSave, onClose }: { initial?: Partial<Marriage>; onSave:(d:any)=>void; onClose:()=>void }) {
  const { offset, onMouseDown } = useDraggable();
  const { members, getMasterDataByCategory } = useApp();
  const pelayanOpts = getMasterDataByCategory('daftar_pelayan').map(m => m.value);
  const tempatOpts = getMasterDataByCategory('tempat_sakramen').map(m => m.value);
  const statusSakramenOpts = getMasterDataByCategory('status_sakramen').map(m => m.value);
  const STATUS_OPTS = statusSakramenOpts.length ? statusSakramenOpts : ['Terjadwal','Selesai','Ditunda','Dibatalkan'];
  const [f, setF] = useState({
    groomName:initial?.groomName||'', groomBirthDate:initial?.groomBirthDate||'', groomBaptismDate:initial?.groomBaptismDate||'',
    brideName:initial?.brideName||'', brideBirthDate:initial?.brideBirthDate||'', brideBaptismDate:initial?.brideBaptismDate||'',
    marriageDate:initial?.marriageDate||'', marriagePlace:initial?.marriagePlace||'GPIB Trinitas',
    minister:initial?.minister||'',
    witness1:initial?.witness1||'', witness2:initial?.witness2||'',
    civilRegistrationNumber:initial?.civilRegistrationNumber||'', civilRegistrationDate:initial?.civilRegistrationDate||'',
    certificateNumber:initial?.certificateNumber||'', status:initial?.status||'Terjadwal', notes:initial?.notes||''
  });
  const [err, setErr]=useState('');
  const h=(k:string,v:string)=>setF(p=>({...p,[k]:v}));
  const submit=()=>{if(!f.groomName||!f.brideName||!f.marriageDate){setErr('Nama mempelai dan tanggal nikah wajib diisi');return;}onSave(f);};
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" style={{maxHeight:'92vh', transform:`translate(${offset.x}px,${offset.y}px)`}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDown}>
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold flex items-center gap-2" style={{fontSize:'15px'}}><Heart className="w-4 h-4"/> {initial?.groomName?'Edit Catatan Pernikahan':'Tambah Catatan Pernikahan'}</h3>
            <button onClick={onClose} data-tooltip="Tutup" className="text-white/50 hover:text-white"><X className="w-4 h-4"/></button>
          </div>
        </div>
        <div className="p-5 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 p-3 rounded-xl" style={{background:'#fdf2f8',border:'1px solid #fbcfe8'}}>
              <p style={{fontSize:'11.5px',color:'#1A77A3',fontWeight:600,marginBottom:8}}>DATA MEMPELAI PRIA</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label style={{display:'block',marginBottom:4,fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Nama Mempelai Pria*</label>
                  <SearchDropdown<any>
                    value={f.groomName} onChange={v=>h('groomName',v)}
                    placeholder="Cari nama jemaat..."
                    items={members}
                    filterFn={(m,q)=>m.fullName.toLowerCase().includes(q.toLowerCase())||m.memberNumber?.toLowerCase().includes(q.toLowerCase())}
                    renderResult={m=><div><p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{m.fullName}</p><p style={{fontSize:'11px',color:'#64748b',margin:0}}>{m.memberNumber||'-'}</p></div>}
                    onSelect={m=>{h('groomName',m.fullName);if(m.birthDate)h('groomBirthDate',m.birthDate);if(m.baptismDate)h('groomBaptismDate',m.baptismDate);}}
                  />
                </div>
                <SacramentField label="Tgl Lahir" value={f.groomBirthDate} onChange={v=>h('groomBirthDate',v)} type="date" ring="ring-pink-400"/>
                <SacramentField label="Tgl Baptis" value={f.groomBaptismDate} onChange={v=>h('groomBaptismDate',v)} type="date" ring="ring-pink-400"/>
              </div>
            </div>
            <div className="col-span-2 p-3 rounded-xl" style={{background:'#fdf2f8',border:'1px solid #fbcfe8'}}>
              <p style={{fontSize:'11.5px',color:'#1A77A3',fontWeight:600,marginBottom:8}}>DATA MEMPELAI WANITA</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label style={{display:'block',marginBottom:4,fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Nama Mempelai Wanita*</label>
                  <SearchDropdown<any>
                    value={f.brideName} onChange={v=>h('brideName',v)}
                    placeholder="Cari nama jemaat..."
                    items={members}
                    filterFn={(m,q)=>m.fullName.toLowerCase().includes(q.toLowerCase())||m.memberNumber?.toLowerCase().includes(q.toLowerCase())}
                    renderResult={m=><div><p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{m.fullName}</p><p style={{fontSize:'11px',color:'#64748b',margin:0}}>{m.memberNumber||'-'}</p></div>}
                    onSelect={m=>{h('brideName',m.fullName);if(m.birthDate)h('brideBirthDate',m.birthDate);if(m.baptismDate)h('brideBaptismDate',m.baptismDate);}}
                  />
                </div>
                <SacramentField label="Tgl Lahir" value={f.brideBirthDate} onChange={v=>h('brideBirthDate',v)} type="date" ring="ring-pink-400"/>
                <SacramentField label="Tgl Baptis" value={f.brideBaptismDate} onChange={v=>h('brideBaptismDate',v)} type="date" ring="ring-pink-400"/>
              </div>
            </div>
            <SacramentField label="Tanggal Pemberkatan*" value={f.marriageDate} onChange={v=>h('marriageDate',v)} type="date" ring="ring-pink-400"/>
            <SacramentField label="Tempat Pemberkatan" value={f.marriagePlace} onChange={v=>h('marriagePlace',v)} opts={tempatOpts.length ? tempatOpts : undefined} ring="ring-pink-400"/>
            <SacramentField label="Pendeta / Pelayan" value={f.minister} onChange={v=>h('minister',v)} opts={pelayanOpts.length ? pelayanOpts : undefined} ring="ring-pink-400"/>
            <SacramentField label="Status" value={f.status} onChange={v=>h('status',v)} opts={STATUS_OPTS} ring="ring-pink-400"/>
            <SacramentField label="Saksi 1" value={f.witness1} onChange={v=>h('witness1',v)} ring="ring-pink-400"/>
            <SacramentField label="Saksi 2" value={f.witness2} onChange={v=>h('witness2',v)} ring="ring-pink-400"/>
            <SacramentField label="No. Akta Sipil" value={f.civilRegistrationNumber} onChange={v=>h('civilRegistrationNumber',v)} ring="ring-pink-400"/>
            <SacramentField label="Tgl Akta Sipil" value={f.civilRegistrationDate} onChange={v=>h('civilRegistrationDate',v)} type="date" ring="ring-pink-400"/>
            <div className="col-span-2"><SacramentField label="No. Surat Nikah Gereja" value={f.certificateNumber} onChange={v=>h('certificateNumber',v)} ring="ring-pink-400"/></div>
            <div className="col-span-2"><label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Catatan</label>
              <textarea value={f.notes} onChange={e=>h('notes',e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none" style={{borderColor:'#e2e8f0'}}/></div>
          </div>
          {err&&<div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{background:'#fef2f2',color:'#dc2626'}}><AlertCircle className="w-4 h-4"/>{err}</div>}
        </div>
        <div className="px-6 pb-5 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50" style={{borderColor:'#e2e8f0'}}>Batal</button>
          <button onClick={submit} className="px-5 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90" style={{background:'#1A77A3'}}>Simpan</button>
        </div>
      </div>
    </div>
  );
}

// ── DOKUMEN PENDUKUNG (per baris Baptis/Sidi/Nikah) ────────────────────────────
function SacramentDocumentsModal({ item, label, onClose }: { item: any; label: string; onClose: () => void }) {
  const { offset, onMouseDown } = useDraggable();
  const { can: canFn, currentUser } = useApp();
  const canEditDocs   = canFn('Sakramen & Atestasi', 'edit');
  const canDeleteDocs = canFn('Sakramen & Atestasi', 'delete');

  const [docs, setDocs] = useState<SacramentDocument[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const docFileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<SacramentDocument[]>('/api/data/sacramentDocuments').then(all => {
      setDocs((all || []).filter(d => d.sacramentId === item.id));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const handleUploadDocClick = () => docFileInputRef.current?.click();

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
      const id = 'sacdoc' + Date.now();
      const doc: SacramentDocument = {
        id, sacramentId: item.id, fileName: file.name, fileSize: file.size,
        mimeType: 'application/pdf', fileData: base64,
        uploadedAt: new Date().toISOString(), uploadedBy: currentUser?.name || 'Administrator',
      };
      await api.put(`/api/data/sacramentDocuments/${id}`, doc);
      setDocs(prev => [doc, ...prev]);
      toast.success(`Dokumen "${file.name}" berhasil diunggah`);
    } catch (err) {
      toast.error('Gagal mengunggah dokumen. Silakan coba lagi');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleViewDocument = (doc: SacramentDocument) => {
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

  const handleDeleteDocument = async (doc: SacramentDocument) => {
    if (!window.confirm(`Hapus dokumen "${doc.fileName}"?`)) return;
    try {
      await api.delete(`/api/data/sacramentDocuments/${doc.id}`);
      setDocs(prev => prev.filter(d => d.id !== doc.id));
      toast.success(`Dokumen "${doc.fileName}" dihapus`);
    } catch {
      toast.error('Gagal menghapus dokumen');
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" style={{maxHeight:'85vh', transform:`translate(${offset.x}px,${offset.y}px)`}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 flex-shrink-0 border-b" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',borderColor:'#1e3a2a',cursor:'move'}} onMouseDown={onMouseDown}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-semibold" style={{fontSize:'15px'}}>Dokumen Pendukung</h3>
              <p style={{fontSize:'12px',color:'rgba(255,255,255,0.6)',marginTop:2}}>{label}</p>
            </div>
            <button onClick={onClose} data-tooltip="Tutup" className="text-white/50 hover:text-white transition-colors"><X className="w-4 h-4"/></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <input ref={docFileInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleDocFileSelected}/>
          {canEditDocs && (
            <button onClick={handleUploadDocClick} disabled={uploadingDoc}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed text-sm font-semibold transition-colors disabled:opacity-60 mb-3"
              style={{borderColor:'#b8d5e8',color:'#1A77A3',background:'#f0fdf4'}}>
              {uploadingDoc ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
              {uploadingDoc ? 'Mengunggah...' : 'Unggah Dokumen PDF'}
            </button>
          )}
          {docs.length === 0 ? (
            <p style={{fontSize:'12px',color:'#94a3b8',textAlign:'center',padding:'16px 0'}}>Belum ada dokumen pendukung</p>
          ) : (
            <div className="space-y-2">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg border" style={{borderColor:'#f1f5f9'}}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{background:'#fef2f2'}}>
                    <FileText className="w-4 h-4 text-[#dc2626]"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate" style={{fontSize:'12.5px',fontWeight:600,color:'#334155'}}>{doc.fileName}</p>
                    <p style={{fontSize:'11px',color:'#94a3b8'}}>{formatBytes(doc.fileSize)} · {fmtDate(doc.uploadedAt)} · {doc.uploadedBy}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button data-tooltip="Lihat" onClick={()=>handleViewDocument(doc)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-[#1A77A3] transition-colors"><Eye className="w-4 h-4"/></button>
                    {canDeleteDocs && (
                      <button data-tooltip="Hapus" onClick={()=>handleDeleteDocument(doc)} className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4"/></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t flex justify-end flex-shrink-0" style={{borderColor:'#f1f5f9'}}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}>Tutup</button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export function SacramentDatabase() {
  const { offset: offset1, onMouseDown: onMouseDown1 } = useDraggable();
  const { offset: offset2, onMouseDown: onMouseDown2 } = useDraggable();
  const { baptisms, sidis, marriages, addBaptism, updateBaptism, deleteBaptism, addSidi, updateSidi, deleteSidi, addMarriage, updateMarriage, deleteMarriage, currentUser, can, getMasterDataByCategory } = useApp();

  const canCreate = can('sacraments', 'create');
  const canEdit   = can('sacraments', 'edit');
  const canDelete = can('sacraments', 'delete');

  const [tab, setTab] = useState<'baptism'|'sidi'|'marriage'>('baptism');
  const [searchQ, setSearchQ] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [yearF, setYearF] = useState('all');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any|null>(null);
  const [kpiDetail, setKpiDetail] = useState<{label:string;type:'baptism'|'sidi'|'marriage';items:any[]}|null>(null);
  const [kpiSearch, setKpiSearch] = useState('');
  const [showDetail, setShowDetail] = useState<any>(null);
  const [showDocsFor, setShowDocsFor] = useState<any>(null);
  const ITEMS = 12;

  const YEARS = ['all','2026','2025','2024','2023'];
  const statusSakramenOptsMain = getMasterDataByCategory('status_sakramen').map(m => m.value);
  const STATUS_OPTS = statusSakramenOptsMain.length ? statusSakramenOptsMain : ['Terjadwal','Selesai','Ditunda','Dibatalkan'];

  const filteredBaptisms = useMemo(()=>{
    let r=[...baptisms];
    if(searchQ){const q=searchQ.toLowerCase();r=r.filter(x=>x.memberName.toLowerCase().includes(q)||x.certificateNumber?.toLowerCase().includes(q));}
    if(statusF!=='all') r=r.filter(x=>x.status===statusF);
    if(yearF!=='all') r=r.filter(x=>x.baptismDate?.startsWith(yearF));
    return r.sort((a,b)=>new Date(b.baptismDate).getTime()-new Date(a.baptismDate).getTime());
  },[baptisms,searchQ,statusF,yearF]);

  const filteredSidis = useMemo(()=>{
    let r=[...sidis];
    if(searchQ){const q=searchQ.toLowerCase();r=r.filter(x=>x.memberName.toLowerCase().includes(q)||x.certificateNumber?.toLowerCase().includes(q));}
    if(statusF!=='all') r=r.filter(x=>x.status===statusF);
    if(yearF!=='all') r=r.filter(x=>x.sidiDate?.startsWith(yearF));
    return r.sort((a,b)=>new Date(b.sidiDate).getTime()-new Date(a.sidiDate).getTime());
  },[sidis,searchQ,statusF,yearF]);

  const filteredMarriages = useMemo(()=>{
    let r=[...marriages];
    if(searchQ){const q=searchQ.toLowerCase();r=r.filter(x=>x.groomName.toLowerCase().includes(q)||x.brideName.toLowerCase().includes(q)||x.certificateNumber?.toLowerCase().includes(q));}
    if(statusF!=='all') r=r.filter(x=>x.status===statusF);
    if(yearF!=='all') r=r.filter(x=>x.marriageDate?.startsWith(yearF));
    return r.sort((a,b)=>new Date(b.marriageDate).getTime()-new Date(a.marriageDate).getTime());
  },[marriages,searchQ,statusF,yearF]);

  const { sorted: sortedBaptisms, sortKey: skB, sortDir: sdB, requestSort: rsB } = useSortable(filteredBaptisms);
  const { sorted: sortedSidis,    sortKey: skS, sortDir: sdS, requestSort: rsS } = useSortable(filteredSidis);
  const { sorted: sortedMarriages,sortKey: skM, sortDir: sdM, requestSort: rsM } = useSortable(filteredMarriages);

  const data = tab==='baptism'?sortedBaptisms:tab==='sidi'?sortedSidis:sortedMarriages;
  const sortKey = tab==='baptism'?skB:tab==='sidi'?skS:skM;
  const sortDir = tab==='baptism'?sdB:tab==='sidi'?sdS:sdM;
  const requestSort = tab==='baptism'?rsB:tab==='sidi'?rsS:rsM;

  const sacramentItems = tab === 'baptism' ? baptisms : tab === 'sidi' ? sidis : marriages;

  const SortIcon = ({col}:{col:string}) => {
    if(sortKey!==col) return <ArrowUpDown className="w-3 h-3 opacity-40"/>;
    return sortDir==='asc'?<ArrowUp className="w-3 h-3 text-[#1A77A3]"/>:<ArrowDown className="w-3 h-3 text-[#1A77A3]"/>;
  };

  const totalPages = Math.max(1,Math.ceil(data.length/ITEMS));
  const pageData = data.slice((page-1)*ITEMS,page*ITEMS);
  const { widths: colW, startResize } = useResizableColumns('sacrament-database-main', SACRAMENT_TABLE_DEFAULT_WIDTHS);

  const stats = {
    baptisms: baptisms.length,
    baptismsSelesai: baptisms.filter(b=>normStatusSakramen(b.status)==='Selesai').length,
    baptismsAnak: baptisms.filter(b=>b.type==='Anak').length,
    baptismsSelesaiAnak: baptisms.filter(b=>normStatusSakramen(b.status)==='Selesai'&&b.type==='Anak').length,
    baptismsSelesaiDewasa: baptisms.filter(b=>normStatusSakramen(b.status)==='Selesai'&&b.type==='Dewasa').length,
    sidis: sidis.length,
    sidisSelesai: sidis.filter(s=>normStatusSakramen(s.status)==='Selesai').length,
    marriages: marriages.length,
    marriagesSelesai: marriages.filter(m=>normStatusSakramen(m.status)==='Selesai').length,
  };

  const handleSave = (d:any) => {
    if(tab==='baptism'){
      if(editItem) updateBaptism(editItem.id,d); else addBaptism(d);
    } else if(tab==='sidi'){
      if(editItem) updateSidi(editItem.id,d); else addSidi(d);
    } else {
      if(editItem) updateMarriage(editItem.id,d); else addMarriage(d);
    }
    setShowForm(false); setEditItem(null);
  };

  const handleDelete = () => {
    if(!deleteTarget) return;
    if(tab==='baptism') deleteBaptism(deleteTarget.id);
    else if(tab==='sidi') deleteSidi(deleteTarget.id);
    else deleteMarriage(deleteTarget.id);
    setDeleteTarget(null);
  };

  const exportPDF = () => {
    const doc = new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const W = doc.internal.pageSize.getWidth();
    const TITLE = tab==='baptism'?'CATATAN BAPTISAN':tab==='sidi'?'CATATAN SIDI':'CATATAN PERNIKAHAN';
    doc.setFillColor(13,40,24);doc.rect(0,0,W,20,'F');
    doc.setTextColor(255,255,255);doc.setFontSize(12);doc.setFont('helvetica','bold');
    doc.text(`${TITLE} — GPIB TRINITAS`,W/2,13,{align:'center'});
    if(tab==='baptism'){
      autoTable(doc,{startY:25,head:[['No','Nama','Tipe','Tanggal','Tempat','Pendeta','No. Surat','Status']],
        body:filteredBaptisms.map((b,i)=>[i+1,b.memberName,b.type,fmtDate(b.baptismDate),b.baptismPlace,b.minister,b.certificateNumber||'',b.status]),
        headStyles:{fillColor:[14,116,144],textColor:255,fontSize:8},bodyStyles:{fontSize:7.5},margin:{left:10,right:10}});
    } else if(tab==='sidi'){
      autoTable(doc,{startY:25,head:[['No','Nama','Tanggal Sidi','Tempat','Tgl Baptis','Pendeta','No. Surat','Status']],
        body:filteredSidis.map((s,i)=>[i+1,s.memberName,fmtDate(s.sidiDate),s.sidiPlace,fmtDate(s.baptismDate),s.minister,s.certificateNumber||'',s.status]),
        headStyles:{fillColor:[5,150,105],textColor:255,fontSize:8},bodyStyles:{fontSize:7.5},margin:{left:10,right:10}});
    } else {
      autoTable(doc,{startY:25,head:[['No','Mempelai Pria','Mempelai Wanita','Tanggal','Tempat','Pendeta','No. Surat','Status']],
        body:filteredMarriages.map((m,i)=>[i+1,m.groomName,m.brideName,fmtDate(m.marriageDate),m.marriagePlace,m.minister,m.certificateNumber||'',m.status]),
        headStyles:{fillColor:[190,24,93],textColor:255,fontSize:8},bodyStyles:{fontSize:7.5},margin:{left:10,right:10}});
    }
    doc.save(`${tab==='baptism'?'Baptisan':tab==='sidi'?'Sidi':'Pernikahan'}-GPIB-Trinitas.pdf`);
  };

  const TAB_CFG = {
    baptism: {label:'Baptisan',color:'#1A77A3',bg:'#1A77A3',light:'#ecfeff',border:'#a5f3fc',icon:<Droplet className="w-4 h-4"/>},
    sidi:    {label:'Sidi',    color:'#1A77A3',bg:'#1A77A3',light:'#f0fdf4',border:'#b8d5e8',icon:<CheckCircle2 className="w-4 h-4"/>},
    marriage:{label:'Pernikahan',color:'#1A77A3',bg:'#1A77A3',light:'#fdf2f8',border:'#fbcfe8',icon:<Heart className="w-4 h-4"/>},
  };
  const tc = TAB_CFG[tab];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5" style={{fontSize:'22px',fontWeight:700,color:'#0f172a',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:'#1A77A3'}}>
              <Droplet className="w-5 h-5 text-white"/>
            </div>
            Catatan Sakramen
          </h1>
          <p style={{fontSize:'13px',color:'#64748b',marginTop:'2px'}}>GPIB Trinitas · Baptisan · Sidi · Pernikahan</p>
        </div>
        <div className="flex gap-2">
          {canCreate && (
            <button onMouseDown={e=>e.preventDefault()} onClick={()=>{setEditItem(null);setShowForm(true);}} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow hover:opacity-90" style={{background:tc.bg}}>
              <Plus className="w-4 h-4"/> Tambah {tc.label}
            </button>
          )}
          <button onClick={exportPDF} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border hover:bg-gray-50" style={{borderColor:'#e2e8f0',color:'#4b5563'}}>
            <Printer className="w-4 h-4"/> PDF
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {l:'Total Baptisan',v:stats.baptisms,sub:'semua tipe',c:'#3a7fa0',bg:'#ecfeff',bo:'#a5f3fc', type:'baptism' as const, items:baptisms},
          {l:'Baptisan Selesai',v:stats.baptismsSelesai,sub:`${stats.baptismsSelesaiAnak} anak, ${stats.baptismsSelesaiDewasa} dewasa`,c:'#1A77A3',bg:'#f0fdf4',bo:'#b8d5e8', type:'baptism' as const, items:baptisms.filter(b=>normStatusSakramen(b.status)==='Selesai')},
          {l:'Total Sidi',v:stats.sidis,sub:'semua status',c:'#1A77A3',bg:'#f0fdf4',bo:'#b8d5e8', type:'sidi' as const, items:sidis},
          {l:'Sidi Selesai',v:stats.sidisSelesai,sub:'sudah sidi',c:'#1A77A3',bg:'#f0fdf4',bo:'#b8d5e8', type:'sidi' as const, items:sidis.filter(s=>normStatusSakramen(s.status)==='Selesai')},
          {l:'Total Pernikahan',v:stats.marriages,sub:'semua status',c:'#1A77A3',bg:'#fdf2f8',bo:'#fbcfe8', type:'marriage' as const, items:marriages},
          {l:'Nikah Selesai',v:stats.marriagesSelesai,sub:'sudah diberkati',c:'#1A77A3',bg:'#fdf2f8',bo:'#fbcfe8', type:'marriage' as const, items:marriages.filter(m=>normStatusSakramen(m.status)==='Selesai')},
        ].map((s,i)=>(
          <div key={i} className="rounded-xl p-3 border text-center cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all" style={{background:s.bg,borderColor:s.bo}} onClick={()=>{setKpiDetail({label:s.l,type:s.type,items:s.items});setKpiSearch('');}}>
            <p style={{fontSize:'20px',fontWeight:700,color:s.c,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{s.v}</p>
            <p style={{fontSize:'10.5px',color:s.c,fontWeight:600}}>{s.l}</p>
            <p style={{fontSize:'10px',color:'#94a3b8'}}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{background:'#f1f5f9',width:'fit-content'}}>
        {(['baptism','sidi','marriage'] as const).map(t=>(
          <button key={t} onClick={()=>{setTab(t);setPage(1);}} className="flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all"
            style={{fontSize:'12.5px',fontWeight:tab===t?600:500,background:tab===t?'#FFEFB2':'transparent',color:tab===t?'#384959':'#64748b',boxShadow:tab===t?'0 1px 4px rgba(0,0,0,0.08)':'none'}}>
            {TAB_CFG[t].icon}{TAB_CFG[t].label}
            <span className="px-1.5 py-0.5 rounded-full text-xs font-bold ml-1" style={{background:tab===t?'rgba(56,73,89,0.15)':'#e2e8f0',color:tab===t?'#384959':'#64748b'}}>
              {t==='baptism'?baptisms.length:t==='sidi'?sidis.length:marriages.length}
            </span>
          </button>
        ))}
      </div>

            {/* Filters */}
      <div className="rounded-2xl border bg-white overflow-hidden" style={{borderColor:'#e2e8f0',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
        <div className="flex items-center gap-3 p-3 border-b" style={{borderColor:'#f1f5f9'}}>
          <div className="flex-1">
            <SearchDropdown<any>
              value={searchQ}
              onChange={v => { setSearchQ(v); setPage(1); }}
              placeholder="Cari nama / no. surat..."
              items={sacramentItems}
              filterFn={(x, q) => {
                const lq = q.toLowerCase();
                return x.memberName?.toLowerCase().includes(lq)
                  || x.certificateNumber?.toLowerCase().includes(lq)
                  || x.groomName?.toLowerCase().includes(lq)
                  || x.brideName?.toLowerCase().includes(lq);
              }}
              renderResult={x => (
                <div>
                  <p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{x.memberName||x.groomName||'-'}</p>
                  <p style={{fontSize:'11px',color:'#64748b',margin:0}}>{x.status} · {x.certificateNumber||'-'}</p>
                </div>
              )}
              onSelect={x => { setSearchQ(x.memberName || x.groomName || ''); setPage(1); }}
              onClear={() => setPage(1)}
            />
          </div>
        </div>
        <div className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'0.08em',color:'#b0bec5',textTransform:'uppercase',minWidth:'68px'}}>Filter</span>
            {([
              {val:statusF,set:(v:string)=>{setStatusF(v);setPage(1);},opts:[{v:'all',l:'Semua Status'},...STATUS_OPTS.map(s=>({v:s,l:s}))]},
              {val:yearF,set:(v:string)=>{setYearF(v);setPage(1);},opts:YEARS.map(y=>({v:y,l:y==='all'?'Semua Tahun':y}))},
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
            <span className="ml-auto text-xs font-semibold" style={{color:'#1A77A3'}}>{data.length} catatan ditemukan</span>
          </div>
        ) : (
          <div className="px-3 pb-2 flex justify-end"><span style={{fontSize:'12px',color:'#94a3b8',fontWeight:500}}>{data.length} catatan total</span></div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border bg-white overflow-hidden" style={{borderColor:'#e2e8f0'}}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{tableLayout:'fixed'}}>
            <thead>
              <tr style={{background:'#f6f4f0',borderBottom:'1px solid #e8e4d8'}}>
                {tab==='baptism' && (
                  <>
                    {[{l:'Nama Jemaat',k:'memberName'},{l:'Tipe',k:'type'},{l:'Tanggal Baptis',k:'baptismDate'},{l:'Tempat',k:'baptismPlace'},{l:'Pendeta',k:'minister'},{l:'No. Surat',k:'certificateNumber'},{l:'Status',k:'status'}].map(h=>(
                      <th key={h.k} className="px-4 py-3 text-left cursor-pointer select-none" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',whiteSpace:'nowrap',width:colW[h.k],position:'relative'}} onClick={()=>requestSort(h.k as any)}>
                        <span className="flex items-center gap-1">{h.l}<SortIcon col={h.k}/></span>
                        <ColResizeHandle onMouseDown={startResize(h.k)} />
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',width:colW.aksi,position:'relative'}}>
                      Aksi
                      <ColResizeHandle onMouseDown={startResize('aksi')} />
                    </th>
                  </>
                )}
                {tab==='sidi' && (
                  <>
                    {[{l:'Nama Jemaat',k:'memberName'},{l:'Tanggal Sidi',k:'sidiDate'},{l:'Tempat',k:'sidiPlace'},{l:'Tgl Baptis Sblm',k:'baptismDate'},{l:'Pendeta',k:'minister'},{l:'No. Surat',k:'certificateNumber'},{l:'Status',k:'status'}].map(h=>(
                      <th key={h.k} className="px-4 py-3 text-left cursor-pointer select-none" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',whiteSpace:'nowrap',width:colW[h.k],position:'relative'}} onClick={()=>requestSort(h.k as any)}>
                        <span className="flex items-center gap-1">{h.l}<SortIcon col={h.k}/></span>
                        <ColResizeHandle onMouseDown={startResize(h.k)} />
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',width:colW.aksi,position:'relative'}}>
                      Aksi
                      <ColResizeHandle onMouseDown={startResize('aksi')} />
                    </th>
                  </>
                )}
                {tab==='marriage' && (
                  <>
                    {[{l:'Mempelai Pria',k:'groomName'},{l:'Mempelai Wanita',k:'brideName'},{l:'Tanggal',k:'marriageDate'},{l:'Tempat',k:'marriagePlace'},{l:'Pendeta',k:'minister'},{l:'No. Surat',k:'certificateNumber'},{l:'Status',k:'status'}].map(h=>(
                      <th key={h.k} className="px-4 py-3 text-left cursor-pointer select-none" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',whiteSpace:'nowrap',width:colW[h.k],position:'relative'}} onClick={()=>requestSort(h.k as any)}>
                        <span className="flex items-center gap-1">{h.l}<SortIcon col={h.k}/></span>
                        <ColResizeHandle onMouseDown={startResize(h.k)} />
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',width:colW.aksi,position:'relative'}}>
                      Aksi
                      <ColResizeHandle onMouseDown={startResize('aksi')} />
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {pageData.length===0 ? (
                <tr><td colSpan={8} className="py-16 text-center" style={{color:'#94a3b8',fontSize:'13px'}}>Belum ada catatan {tc.label.toLowerCase()}</td></tr>
              ) : pageData.map((item:any)=>(
                <tr 
                  key={item.id} 
                  className="border-b hover:bg-[#f2f0ea] transition-colors cursor-pointer group" 
                  style={{borderColor:'#f8fafc'}}
                  onMouseDown={e=>e.preventDefault()} onClick={() => { setEditItem(item); setShowForm(true); }}
                >
                  {tab==='baptism' && <>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center group-hover:bg-white transition-colors" style={{background:'#ecfeff'}}><Droplet className="w-3.5 h-3.5 text-[#1A77A3]"/></div>
                        <span style={{fontSize:'13px',fontWeight:600,color:'#334155'}} className="group-hover:text-[#1A77A3] transition-colors">{item.memberName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{background:item.type==='Anak'?'#f0ede5':'#fdf2f8',color:item.type==='Anak'?'#1A77A3':'#1A77A3'}}>{item.type}</span></td>
                    <td className="px-4 py-3 text-sm" style={{color:'#4b5563',whiteSpace:'nowrap'}}>{fmtDate(item.baptismDate)}</td>
                    <td className="px-4 py-3 text-sm" style={{color:'#64748b'}}>{item.baptismPlace}</td>
                    <td className="px-4 py-3 text-sm" style={{color:'#4b5563'}}>{item.minister}</td>
                    <td className="px-4 py-3 text-xs font-mono" style={{color:'#94a3b8'}}>{item.certificateNumber||'—'}</td>
                    <td className="px-4 py-3"><StatusPill status={item.status}/></td>
                  </>}
                  {tab==='sidi' && <>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center group-hover:bg-white transition-colors" style={{background:'#f0fdf4'}}><CheckCircle2 className="w-3.5 h-3.5 text-[#1A77A3]"/></div>
                        <span style={{fontSize:'13px',fontWeight:600,color:'#334155'}} className="group-hover:text-[#1A77A3] transition-colors">{item.memberName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{color:'#4b5563',whiteSpace:'nowrap'}}>{fmtDate(item.sidiDate)}</td>
                    <td className="px-4 py-3 text-sm" style={{color:'#64748b'}}>{item.sidiPlace}</td>
                    <td className="px-4 py-3 text-sm" style={{color:'#4b5563',whiteSpace:'nowrap'}}>{fmtDate(item.baptismDate)}</td>
                    <td className="px-4 py-3 text-sm" style={{color:'#4b5563'}}>{item.minister}</td>
                    <td className="px-4 py-3 text-xs font-mono" style={{color:'#94a3b8'}}>{item.certificateNumber||'—'}</td>
                    <td className="px-4 py-3"><StatusPill status={item.status}/></td>
                  </>}
                  {tab==='marriage' && <>
                    <td className="px-4 py-3" style={{fontSize:'13px',fontWeight:600,color:'#334155'}}>{item.groomName}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Heart className="w-3 h-3 text-pink-400 flex-shrink-0"/>
                        <span style={{fontSize:'13px',fontWeight:600,color:'#334155'}}>{item.brideName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{color:'#4b5563',whiteSpace:'nowrap'}}>{fmtDate(item.marriageDate)}</td>
                    <td className="px-4 py-3 text-sm" style={{color:'#64748b'}}>{item.marriagePlace}</td>
                    <td className="px-4 py-3 text-sm" style={{color:'#4b5563'}}>{item.minister}</td>
                    <td className="px-4 py-3 text-xs font-mono" style={{color:'#94a3b8'}}>{item.certificateNumber||'—'}</td>
                    <td className="px-4 py-3"><StatusPill status={item.status}/></td>
                  </>}
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button onClick={()=>setShowDocsFor(item)} data-tooltip="Dokumen" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><FileText className="w-3.5 h-3.5 text-gray-400"/></button>
                      {canEdit && <button onMouseDown={e=>e.preventDefault()} onClick={()=>{setEditItem(item);setShowForm(true);}} data-tooltip="Edit" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><Pencil className="w-3.5 h-3.5 text-gray-400"/></button>}
                      {canDelete && <button onClick={()=>setDeleteTarget(item)} data-tooltip="Hapus" className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-400"/></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages>1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{borderColor:'#f1f5f9'}}>
            <span style={{fontSize:'12px',color:'#64748b'}}>{data.length} catatan · Halaman {page}/{totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page===1} onClick={()=>setPage(p=>p-1)} data-tooltip="Halaman Sebelumnya" className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50" style={{borderColor:'#e2e8f0'}}><ChevronLeft className="w-4 h-4 text-gray-500"/></button>
              <button disabled={page===totalPages} onClick={()=>setPage(p=>p+1)} data-tooltip="Halaman Berikutnya" className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50" style={{borderColor:'#e2e8f0'}}><ChevronRight className="w-4 h-4 text-gray-500"/></button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showForm && tab==='baptism' && <BaptismForm initial={editItem} onSave={handleSave} onClose={()=>{setShowForm(false);setEditItem(null);}}/>}
      {showForm && tab==='sidi' && <SidiForm initial={editItem} onSave={handleSave} onClose={()=>{setShowForm(false);setEditItem(null);}}/>}
      {showForm && tab==='marriage' && <MarriageForm initial={editItem} onSave={handleSave} onClose={()=>{setShowForm(false);setEditItem(null);}}/>}
      {showDocsFor && (
        <SacramentDocumentsModal
          item={showDocsFor}
          label={showDocsFor.groomName ? `${showDocsFor.groomName} & ${showDocsFor.brideName}` : showDocsFor.memberName}
          onClose={()=>setShowDocsFor(null)}
        />
      )}

      {deleteTarget && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={()=>setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center" style={{transform:`translate(${offset1.x}px,${offset1.y}px)`}} onClick={e=>e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{background:'#fef2f2',cursor:'move'}} onMouseDown={onMouseDown1}><Trash2 className="w-6 h-6 text-red-500"/></div>
            <h3 style={{fontSize:'16px',fontWeight:700,color:'#0f172a',marginBottom:8}}>Hapus Catatan {tc.label}?</h3>
            <p style={{fontSize:'13px',color:'#64748b',marginBottom:24}}>Data ini akan dihapus permanen dan tidak dapat dikembalikan.</p>
            <div className="flex gap-3">
              <button onClick={()=>setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl border font-medium text-gray-600 hover:bg-gray-50 text-sm" style={{borderColor:'#e2e8f0'}}>Batal</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm hover:opacity-90" style={{background:'#ef4444'}}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Detail Modal */}
      {kpiDetail && (()=>{
        const typeLabel = kpiDetail.type==='baptism'?'Baptisan':kpiDetail.type==='sidi'?'Sidi':'Pernikahan';
        const typeColor = kpiDetail.type==='baptism'?'#1A77A3':kpiDetail.type==='sidi'?'#1A77A3':'#1A77A3';
        const typeGradient = kpiDetail.type==='baptism'?'#1A77A3':kpiDetail.type==='sidi'?'#1A77A3':'#1A77A3';
        const list = kpiSearch
          ? kpiDetail.items.filter((x:any)=>{
              const q = kpiSearch.toLowerCase();
              if(kpiDetail.type==='marriage') return x.groomName?.toLowerCase().includes(q)||x.brideName?.toLowerCase().includes(q);
              return x.memberName?.toLowerCase().includes(q);
            })
          : kpiDetail.items;
        return (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.55)'}} onClick={()=>setKpiDetail(null)}>
            <div className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" style={{maxHeight:'85vh', transform:`translate(${offset2.x}px,${offset2.y}px)`}} onClick={e=>e.stopPropagation()}>
              {/* Header */}
              <div className="px-6 py-5 flex-shrink-0 flex items-center justify-between" style={{background:typeGradient,cursor:'move'}} onMouseDown={onMouseDown2}>
                <div>
                  <p style={{fontSize:'11px',color:'rgba(255,255,255,0.65)',fontWeight:500,letterSpacing:'0.05em',textTransform:'uppercase'}}>Detail KPI Sakramen · {typeLabel}</p>
                  <h3 className="text-white font-bold" style={{fontSize:'17px'}}>{kpiDetail.label}</h3>
                  <p style={{fontSize:'12px',color:'rgba(255,255,255,0.7)',marginTop:2}}>{list.length} dari {kpiDetail.items.length} catatan</p>
                </div>
                <button onClick={()=>setKpiDetail(null)} data-tooltip="Tutup" className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"><X className="w-5 h-5"/></button>
              </div>
              {/* Search */}
              <div className="px-4 py-3 border-b" style={{borderColor:'#f1f5f9'}}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/>
                  <input value={kpiSearch} onChange={e=>setKpiSearch(e.target.value)}
                    placeholder={kpiDetail.type==='marriage'?'Cari nama mempelai...':'Cari nama jemaat...'}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2" style={{borderColor:'#e2e8f0'}}/>
                </div>
              </div>
              {/* List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {list.length===0 ? (
                  <div className="text-center py-12">
                    {kpiDetail.type==='baptism'?<Droplet className="w-10 h-10 text-gray-200 mx-auto mb-2"/>:kpiDetail.type==='sidi'?<CheckCircle2 className="w-10 h-10 text-gray-200 mx-auto mb-2"/>:<Heart className="w-10 h-10 text-gray-200 mx-auto mb-2"/>}
                    <p style={{fontSize:'13px',color:'#94a3b8'}}>Tidak ada catatan</p>
                  </div>
                ) : list.map((item:any)=>(
                  <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-gray-50/80 transition-colors" style={{borderColor:'#f1f5f9'}}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{background:kpiDetail.type==='baptism'?'#ecfeff':kpiDetail.type==='sidi'?'#f0fdf4':'#fdf2f8'}}>
                      {kpiDetail.type==='baptism'?<Droplet className="w-5 h-5 text-[#1A77A3]"/>:kpiDetail.type==='sidi'?<CheckCircle2 className="w-5 h-5 text-[#1A77A3]"/>:<Heart className="w-5 h-5 text-pink-500"/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      {kpiDetail.type==='marriage' ? (
                        <>
                          <p style={{fontSize:'13px',fontWeight:600,color:'#334155'}}>{item.groomName} <span style={{color:'#f472b6'}}>♥</span> {item.brideName}</p>
                          <p style={{fontSize:'11.5px',color:'#64748b'}}>{fmtDate(item.marriageDate)} · {item.marriagePlace}</p>
                        </>
                      ) : (
                        <>
                          <p style={{fontSize:'13px',fontWeight:600,color:'#334155'}}>{item.memberName}</p>
                          <p style={{fontSize:'11.5px',color:'#64748b'}}>
                            {kpiDetail.type==='baptism'?fmtDate(item.baptismDate):fmtDate(item.sidiDate)} · {kpiDetail.type==='baptism'?item.baptismPlace:item.sidiPlace}
                            {kpiDetail.type==='baptism'&&item.type&&<span className="ml-1.5 px-1.5 py-0.5 rounded text-xs font-medium" style={{background:'#f0ede5',color:'#1A77A3'}}>{item.type}</span>}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end gap-1">
                      <StatusPill status={item.status}/>
                      {item.minister&&<p style={{fontSize:'10px',color:'#94a3b8'}}>{item.minister}</p>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t flex justify-between items-center" style={{borderColor:'#f1f5f9'}}>
                <span style={{fontSize:'12px',color:'#94a3b8'}}>{list.length} catatan {typeLabel.toLowerCase()}</span>
                <button onClick={()=>setKpiDetail(null)} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}>Tutup</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}