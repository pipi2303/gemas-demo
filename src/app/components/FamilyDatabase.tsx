import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../../lib/apiClient';
import { useDraggable } from '../../lib/useDraggable';
import { Family, Member } from '../types';
import { SearchDropdown } from './ui/SearchDropdown';
import {
  Home, Users, MapPin, Search, Plus, Eye, Pencil, Trash2,
  ChevronLeft, ChevronRight, X, AlertCircle, Phone, Mail,
  User, Baby, Heart, LayoutGrid, List, Download, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { MemberDetail } from './MemberDatabase';
import { roleStyle, sortByRole, isKK } from '../../lib/familyRole';

// ── Helpers ───────────────────────────────────────────────────────────────────
const initials = (name: string) => name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();

function AvatarFamily({ name, role, size=36 }: { name:string; role?:string; size?:number }) {
  const rs = roleStyle(role);
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{width:size,height:size,background:rs.avatarBg,color:rs.avatarText,fontSize:size*0.35,fontWeight:700}}>
      {initials(name)}
    </div>
  );
}

// ── FAMILY DETAIL MODAL ───────────────────────────────────────────────────────
function FamilyDetail({ family, members, sectors, onClose, onEdit, onDelete }: {
  family: Family; members: Member[]; sectors: any[];
  onClose:()=>void; onEdit:()=>void; onDelete:()=>void;
}) {
  const { offset, onMouseDown } = useDraggable();
  const { attestations, updateMember, deleteMember, can: canFn } = useApp();
  const detailCanEdit   = canFn('Data Keluarga', 'edit');
  const detailCanDelete = canFn('Data Keluarga', 'delete');
  const fam = members.filter(m=>m.familyId===family.id);
  const sector = sectors.find(s=>s.id===family.sectorId);
  const head = members.find(m=>m.id===family.headMemberId);

  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const sorted = sortByRole(fam);

  const ages = fam.map(m=>m.age);
  const avgAge = ages.length ? Math.round(ages.reduce((s,a)=>s+a,0)/ages.length) : 0;
  const anak = fam.filter(m=>['AN','Anak'].includes(m.familyRole||'')).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" style={{maxHeight:'90vh', transform:`translate(${offset.x}px,${offset.y}px)`}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 flex-shrink-0" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDown}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{background:'rgba(255,255,255,0.15)'}}>
                <Home className="w-7 h-7 text-white"/>
              </div>
              <div>
                <h3 className="text-white font-bold" style={{fontSize:'17px'}}>Keluarga {family.headOfFamily}</h3>
                <p style={{fontSize:'12px',color:'rgba(255,255,255,0.6)',marginTop:2}}>
                  {sector?.name||'—'} · {fam.length} anggota keluarga
                </p>
                <div className="flex gap-2 mt-2">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'rgba(255,255,255,0.15)',color:'#fff'}}>{anak} anak</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'rgba(255,255,255,0.15)',color:'#fff'}}>Rata-rata usia {avgAge} th</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {detailCanEdit && <button onClick={onEdit} data-tooltip="Edit" className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors"><Pencil className="w-4 h-4"/></button>}
              {detailCanDelete && <button onClick={onDelete} data-tooltip="Hapus" className="p-2 rounded-xl hover:bg-red-500/20 text-white/60 hover:text-red-300 transition-colors"><Trash2 className="w-4 h-4"/></button>}
              <button onClick={onClose} data-tooltip="Tutup" className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors"><X className="w-4 h-4"/></button>
            </div>
          </div>
        </div>

        {/* Info Strip */}
        <div className="px-6 py-3 border-b grid grid-cols-3 gap-4" style={{borderColor:'#f1f5f9',background:'#fafbff'}}>
          <div className="text-center">
            <p style={{fontSize:'10.5px',color:'#94a3b8',fontWeight:600}}>ALAMAT</p>
            <p style={{fontSize:'12px',color:'#4b5563',fontWeight:500,lineHeight:1.5}}>{family.address||'—'}</p>
          </div>
          <div className="text-center">
            <p style={{fontSize:'10.5px',color:'#94a3b8',fontWeight:600}}>KEPALA KELUARGA</p>
            <p style={{fontSize:'12px',color:'#4b5563',fontWeight:500}}>{family.headOfFamily}</p>
            {head?.phone && <p style={{fontSize:'11px',color:'#64748b'}}>{head.phone}</p>}
          </div>
          <div className="text-center">
            <p style={{fontSize:'10.5px',color:'#94a3b8',fontWeight:600}}>SEKTOR</p>
            <p style={{fontSize:'12px',color:'#4b5563',fontWeight:500}}>{sector?.name||'—'}</p>
          </div>
        </div>

        {/* Members list */}
        <div className="flex-1 overflow-y-auto p-6">
          <h4 style={{fontSize:'13px',fontWeight:700,color:'#4b5563',marginBottom:12}}>Anggota Keluarga ({fam.length})</h4>
          {sorted.length===0 ? (
            <p style={{fontSize:'13px',color:'#94a3b8',textAlign:'center',padding:'24px 0'}}>Belum ada anggota terhubung</p>
          ) : (
            <div className="space-y-2.5">
              {sorted.map(m=>(
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-[#f2f0ea] cursor-pointer transition-colors group" 
                  style={{borderColor:'#f1f5f9',background:'#fafbfc'}}
                  onClick={() => setSelectedMember(m)}>
                  <AvatarFamily name={m.fullName} role={m.familyRole} size={38}/>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p style={{fontSize:'13px',fontWeight:600,color:'#334155'}} className="group-hover:#144f6b transition-colors">{m.fullName}</p>
                      {m.familyRole && (() => { const rs = roleStyle(m.familyRole); return (
                        <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{background:rs.bg,color:rs.text,border:`1px solid ${rs.border}`}}>{m.familyRole}</span>
                      ); })()}
                    </div>
                    <p style={{fontSize:'11.5px',color:'#64748b'}}>
                      {m.gender} · {m.age} tahun · {m.maritalStatus||'—'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p style={{fontSize:'11px',color:'#64748b'}}>{m.phone||'—'}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.membershipStatus==='Aktif'?'text-[#144f6b] bg-[#f0f7fb]':'text-gray-500 bg-gray-100'}`}>
                      {m.membershipStatus||'—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3 flex-shrink-0" style={{borderColor:'#f1f5f9'}}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}>Tutup</button>
          {detailCanEdit && (
            <button onClick={onEdit} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold" style={{background:'linear-gradient(135deg,#3a7fa0,#1A77A3)'}}>
              <Pencil className="w-3.5 h-3.5"/> Edit Keluarga
            </button>
          )}
        </div>
      </div>

      {/* Nested Member Detail Modal */}
      {selectedMember && (
        <MemberDetail 
          member={selectedMember}
          sectors={sectors}
          attestations={attestations}
          members={members}
          onClose={() => setSelectedMember(null)}
          onEdit={() => {
            // Option to trigger edit if needed, but for now just viewing
            setSelectedMember(null);
          }}
          onDelete={() => {
            // Delete logic from MemberDatabase if shared, but here we just view
            setSelectedMember(null);
          }}
        />
      )}
    </div>
  );
}

// ── FAMILY FORM ───────────────────────────────────────────────────────────────
function FamilyForm({ mode, initial, sectors, members, onSave, onClose }: {
  mode:'add'|'edit'; initial?: Partial<Family>;
  sectors:any[]; members:Member[];
  onSave:(data:Partial<Family>)=>void; onClose:()=>void;
}) {
  const { offset, onMouseDown } = useDraggable();
  const genCode = (name: string) =>
    'fam_' + name.toUpperCase().trim().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');

  const [form, setForm] = useState<Partial<Family> & { id?: string }>({
    id: initial?.id || (initial?.headOfFamily ? genCode(initial.headOfFamily) : ''),
    headOfFamily: initial?.headOfFamily||'',
    headMemberId: initial?.headMemberId||'',
    sectorId: initial?.sectorId||'',
    address: initial?.address||'',
    memberCount: initial?.memberCount||1,
    members: initial?.members||[],
  });
  const [err, setErr] = useState('');
  const h=(k:string,v:any)=>setForm(p=>({...p,[k]:v}));
  const handleHeadOfFamily = (v: string) => {
    setForm(p => ({ ...p, headOfFamily: v, ...(mode==='add' ? { id: genCode(v) } : {}) }));
  };

  const sectorMembers = members.filter(m=>m.sectorId===form.sectorId);

  const submit = () => {
    if(!form.headOfFamily){setErr('Nama kepala keluarga wajib diisi');return;}
    if(!form.sectorId){setErr('Sektor wajib dipilih');return;}
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden bg-white" style={{transform:`translate(${offset.x}px,${offset.y}px)`}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDown}>
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold" style={{fontSize:'15px'}}>{mode==='add'?'Tambah Keluarga Baru':'Edit Data Keluarga'}</h3>
            <button onClick={onClose} data-tooltip="Tutup" className="text-white/50 hover:text-white transition-colors"><X className="w-4 h-4"/></button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Nama Kepala Keluarga <span className="text-red-400">*</span></label>
            <input autoFocus value={form.headOfFamily||''} onChange={e=>handleHeadOfFamily(e.target.value)} placeholder="Contoh: Keluarga Bpk. Johannes Tan"
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/>
          </div>
          <div>
            <label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Kode Keluarga</label>
            <input value={form.id||''} readOnly
              className="w-full px-3 py-2 rounded-lg border text-sm font-mono" style={{borderColor:'#e2e8f0',background:'#f8fafc',color:'#64748b'}}/>
          </div>
          <div>
            <label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Sektor <span className="text-red-400">*</span></label>
            <select value={form.sectorId||''} onChange={e=>h('sectorId',e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}>
              <option value="">— Pilih Sektor —</option>
              {[...sectors].sort((a,b)=>a.name.localeCompare(b.name,'id',{numeric:true})).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {sectorMembers.length>0 && (
            <div>
              <label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Kepala Keluarga (Anggota)</label>
              <select value={form.headMemberId||''} onChange={e=>h('headMemberId',e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}>
                <option value="">— Pilih dari anggota —</option>
                {[...sectorMembers].sort((a,b)=>a.fullName.localeCompare(b.fullName,'id')).map(m=><option key={m.id} value={m.id}>{m.fullName}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Alamat</label>
            <textarea value={form.address||''} onChange={e=>h('address',e.target.value)} rows={3}
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3] resize-none" style={{borderColor:'#e2e8f0'}}/>
          </div>
          {err && <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{background:'#fef2f2',color:'#dc2626'}}><AlertCircle className="w-4 h-4"/>{err}</div>}
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}>Batal</button>
          <button onClick={submit} className="px-5 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90" style={{background:'linear-gradient(135deg,#3a7fa0,#1A77A3)'}}>
            {mode==='add'?'Simpan Keluarga':'Perbarui'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export function FamilyDatabase() {
  const { offset: offset1, onMouseDown: onMouseDown1 } = useDraggable();
  const { offset: offset2, onMouseDown: onMouseDown2 } = useDraggable();
  const { families, members, sectors, addFamily, updateFamily, deleteFamily, can, reloadData } = useApp();

  const canCreate = can('Data Keluarga', 'create');
  const canEdit   = can('Data Keluarga', 'edit');
  const canDelete = can('Data Keluarga', 'delete');
  const canExport = can('Data Keluarga', 'export');
  const [syncing, setSyncing] = useState(false);
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.post<{ok:boolean;familiesCreated:number;rolesNormalized:number;sectorsUpdated:number}>('/api/admin/sync',{});
      await reloadData();
      toast.success(`Sinkronisasi selesai · ${res.familiesCreated} keluarga dibuat, ${res.sectorsUpdated} sektor diperbarui`);
    } catch {
      toast.error('Gagal sinkronisasi');
    } finally {
      setSyncing(false);
    }
  };

  const [searchQ, setSearchQ] = useState('');
  const [sectorF, setSectorF] = useState('all');
  const [sizeF, setSizeF] = useState('all');
  const [sort, setSort] = useState<{col:string;dir:'asc'|'desc'}>({col:'headOfFamily',dir:'asc'});
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Family|null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'add'|'edit'>('add');
  const [deleteTarget, setDeleteTarget] = useState<Family|null>(null);
  const [kpiDetail, setKpiDetail] = useState<{label:string;items:Family[]}|null>(null);
  const [kpiSearch, setKpiSearch] = useState('');
  const ITEMS = 20;

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(()=>({
    total: families.length,
    withKK: families.filter(f=>members.some(m=>m.id===f.headMemberId&&m.familyRole==='KK')).length,
    avgSize: families.length ? (families.reduce((s,f)=>s+f.memberCount,0)/families.length).toFixed(1) : '0',
    bySector: [...sectors]
      .sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))
      .map(s=>({...s,count:families.filter(f=>f.sectorId===s.id).length})),
  }),[families,members,sectors]);

  // ── Filtered ───────────────────────────────────────────────────────────────
  const filtered = useMemo(()=>{
    let r = families;
    if(searchQ){const q=searchQ.toLowerCase();r=r.filter(f=>
      f.headOfFamily.toLowerCase().includes(q)||
      f.address?.toLowerCase().includes(q)||
      members.some(m=>m.familyId===f.id&&m.fullName.toLowerCase().includes(q))
    );}
    if(sectorF!=='all') r=r.filter(f=>f.sectorId===sectorF);
    if(sizeF==='single') r=r.filter(f=>f.memberCount===1);
    else if(sizeF==='small') r=r.filter(f=>f.memberCount>=2&&f.memberCount<=3);
    else if(sizeF==='medium') r=r.filter(f=>f.memberCount>=4&&f.memberCount<=5);
    else if(sizeF==='large') r=r.filter(f=>f.memberCount>=6);
    return [...r].sort((a,b)=>{
      const av=(a as any)[sort.col]??'', bv=(b as any)[sort.col]??'';
      return sort.dir==='asc'?String(av).localeCompare(String(bv)):String(bv).localeCompare(String(av));
    });
  },[families,searchQ,sectorF,sizeF,sort]);

  const totalPages = Math.max(1,Math.ceil(filtered.length/ITEMS));
  const pageItems = filtered.slice((page-1)*ITEMS,page*ITEMS);

  const handleSave = (data: Partial<Family>) => {
    const memberIds = members.filter(m=>m.sectorId===data.sectorId).map(m=>m.id);
    if(formMode==='add'){
      addFamily({...data,memberCount:memberIds.length,members:memberIds,id:(data as any).id||undefined} as any);
    } else if(selected){
      updateFamily(selected.id,data);
    }
    setShowForm(false);setSelected(null);
  };

  const exportExcel = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const tgl = `${pad(now.getDate())}${pad(now.getMonth()+1)}${now.getFullYear()}`;
    const jam = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `data_keluarga_${tgl}_${jam}.xlsx`;

    const sortedSectors = [...sectors].sort((a, b) => a.name.localeCompare(b.name));

    const aoa: any[][] = [];
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];

    sortedSectors.forEach(sector => {
      const sectorFamilies = [...filtered]
        .filter(f => f.sectorId === sector.id)
        .sort((a, b) => a.headOfFamily.localeCompare(b.headOfFamily));

      if (sectorFamilies.length === 0) return;

      // Sector header — merged across all 6 columns
      const sectorRow = aoa.length;
      aoa.push([sector.name.toUpperCase(), '', '', '', '', '']);
      merges.push({ s: { r: sectorRow, c: 0 }, e: { r: sectorRow, c: 5 } });

      sectorFamilies.forEach((family, fi) => {
        // Family header — merged
        const famRow = aoa.length;
        aoa.push([`${fi + 1}. Nama Keluarga: ${family.headOfFamily}`, '', '', '', '', '']);
        merges.push({ s: { r: famRow, c: 0 }, e: { r: famRow, c: 5 } });

        // Members sorted KK first
        const fmem = sortByRole(members.filter(m => m.familyId === family.id));
        fmem.forEach(m => {
          aoa.push([
            m.familyRole || '',
            m.memberNumber || '',
            m.fullName,
            m.gender === 'Laki-laki' ? 'L' : 'P',
            m.age ? `${m.age} tahun` : '',
            m.pelkatStatus || '',
          ]);
        });

        // Blank separator between families
        aoa.push(['', '', '', '', '', '']);
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 30 }, { wch: 5 }, { wch: 12 }, { wch: 14 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Keluarga');
    XLSX.writeFile(wb, filename);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5" style={{fontSize:'22px',fontWeight:700,color:'#0f172a',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:'linear-gradient(135deg,#3a7fa0,#1A77A3)'}}>
              <Home className="w-5 h-5 text-white"/>
            </div>
            Data Keluarga Jemaat
          </h1>
          <p style={{fontSize:'13px',color:'#64748b',marginTop:'2px'}}>GPIB Trinitas · {stats.total} keluarga terdaftar</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSync} disabled={syncing} data-tooltip="Update Jumlah Anggota Sektor" className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border hover:bg-gray-50 transition-all disabled:opacity-50" style={{borderColor:'#e2e8f0',color:'#4b5563'}}>
            <RefreshCw className={`w-4 h-4 ${syncing?'animate-spin':''}`}/> Sinkronisasi
          </button>
          {canCreate && (
            <button onMouseDown={e=>e.preventDefault()} onClick={()=>{setFormMode('add');setSelected(null);setShowForm(true);}} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow hover:opacity-90 transition-all" style={{background:'linear-gradient(135deg,#3a7fa0,#1A77A3)'}}>
              <Plus className="w-4 h-4"/> Tambah Keluarga
            </button>
          )}
          {canExport && (
            <button onClick={exportExcel} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border hover:bg-gray-50 transition-all" style={{borderColor:'#e2e8f0',color:'#4b5563'}}>
              <Download className="w-4 h-4"/> Excel
            </button>
          )}
        </div>
      </div>

      {/* KPI Information */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
        {/* Total Keluarga Card */}
        <div
          className={`rounded-2xl p-4 sm:p-5 border transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${
            sectorF === 'all' ? 'bg-blue-50/40 border-blue-200' : 'bg-white border-slate-200'
          }`}
          style={{ borderColor: sectorF === 'all' ? '#bfdbfe' : '#e2e8f0' }}
          onClick={() => {
            setSectorF('all');
            setPage(1);
            setKpiDetail({ label: 'Total Semua Keluarga', items: families });
            setKpiSearch('');
          }}
          title="Klik untuk melihat semua keluarga"
        >
          <p
            className="text-2xl sm:text-[26px] font-bold leading-none tracking-tight"
            style={{ color: '#1d4ed8', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            {stats.total}
          </p>
          <p className="text-xs sm:text-[13px] text-slate-500 font-normal mt-2">Total Keluarga</p>
        </div>

        {/* Sector Cards */}
        {stats.bySector.map((s) => {
          const isSelected = sectorF === s.id;
          const sectorFamilies = families.filter((f) => f.sectorId === s.id);
          return (
            <div
              key={s.id}
              className={`rounded-2xl p-4 sm:p-5 border transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${
                isSelected ? 'bg-blue-50/40 border-blue-300' : 'bg-white border-slate-200'
              }`}
              style={{ borderColor: isSelected ? '#93c5fd' : '#e2e8f0' }}
              onClick={() => {
                setSectorF(s.id);
                setPage(1);
                setKpiDetail({ label: `Keluarga ${s.name}`, items: sectorFamilies });
                setKpiSearch('');
              }}
              title={`Klik untuk memfilter ${s.name}`}
            >
              <p
                className="text-2xl sm:text-[26px] font-bold leading-none tracking-tight"
                style={{ color: '#1e293b', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                {s.count} KK
              </p>
              <p className="text-xs sm:text-[13px] text-slate-500 font-normal mt-2">{s.name}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border bg-white overflow-hidden" style={{borderColor:'#e2e8f0',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
        <div className="flex items-center gap-3 p-3 border-b" style={{borderColor:'#f1f5f9'}}>
          <div className="flex-1">
            <SearchDropdown<Family>
              value={searchQ}
              onChange={v => { setSearchQ(v); setPage(1); }}
              placeholder="Cari nama keluarga, nama anggota, atau alamat..."
              items={families}
              filterFn={(f, q) => {
                const lq = q.toLowerCase();
                return f.headOfFamily.toLowerCase().includes(lq)
                  || (f.address?.toLowerCase() || '').includes(lq)
                  || members.some(m => m.familyId === f.id && m.fullName.toLowerCase().includes(lq));
              }}
              renderResult={f => (
                <div>
                  <p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{f.headOfFamily}</p>
                  <p style={{fontSize:'11px',color:'#64748b',margin:0}}>{sectors.find(s=>s.id===f.sectorId)?.name||'-'} · {f.memberCount} anggota</p>
                </div>
              )}
              onSelect={f => { setSearchQ(f.headOfFamily); setPage(1); }}
              onClear={() => setPage(1)}
            />
          </div>
        </div>
        <div className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'0.08em',color:'#b0bec5',textTransform:'uppercase',minWidth:'68px'}}>Filter</span>
            {([
              {val:sectorF,set:(v:string)=>{setSectorF(v);setPage(1);},opts:[{v:'all',l:'Semua Sektor'},...sectors.map(s=>({v:s.id,l:s.name}))]},
              {val:sizeF,set:(v:string)=>{setSizeF(v);setPage(1);},opts:[{v:'all',l:'Semua Ukuran'},{v:'single',l:'1 Orang'},{v:'small',l:'2–3 Orang'},{v:'medium',l:'4–5 Orang'},{v:'large',l:'6+ Orang'}]},
            ] as {val:string;set:(v:string)=>void;opts:{v:string;l:string}[]}[]).map((f,i)=>{
              const active=f.val!=='all';
              return <select key={i} value={f.val} onChange={e=>f.set(e.target.value)} className="px-2.5 py-1 text-sm rounded-full border focus:outline-none transition-all cursor-pointer" style={{borderColor:active?'#1A77A3':'#e2e8f0',background:active?'#f0f7fb':'#fafafa',color:active?'#1A77A3':'#64748b',fontWeight:active?600:400}}>{f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>;
            })}
          </div>
        </div>
        {(searchQ||sectorF!=='all'||sizeF!=='all') ? (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
            <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,whiteSpace:'nowrap'}}>Filter aktif:</span>
            {searchQ && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}><Search className="w-3 h-3"/>"{searchQ.length>18?searchQ.slice(0,18)+'…':searchQ}"<button onClick={()=>{setSearchQ('');setPage(1);}} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
            {sectorF!=='all' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}><MapPin className="w-3 h-3"/>{sectors.find(s=>s.id===sectorF)?.name||sectorF}<button onClick={()=>{setSectorF('all');setPage(1);}} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
            {sizeF!=='all' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}><Users className="w-3 h-3"/>{{single:'1 Orang',small:'2–3 Orang',medium:'4–5 Orang',large:'6+ Orang'}[sizeF]||sizeF}<button onClick={()=>{setSizeF('all');setPage(1);}} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
            <button onClick={()=>{setSearchQ('');setSectorF('all');setSizeF('all');setPage(1);}} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all hover:bg-red-50" style={{borderColor:'#fca5a5',color:'#ef4444'}}><X className="w-3 h-3"/>Reset Semua</button>
            <span className="ml-auto text-xs font-semibold" style={{color:'#1A77A3'}}>{filtered.length} keluarga ditemukan</span>
          </div>
        ) : (
          <div className="px-3 pb-2 flex justify-end"><span style={{fontSize:'12px',color:'#94a3b8',fontWeight:500}}>{filtered.length} keluarga total</span></div>
        )}
      </div>

      {/* List View */}
      <div className="rounded-2xl border bg-white overflow-hidden" style={{borderColor:'#e2e8f0',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
        {/* List header */}
        <div className="grid px-4 py-2.5 border-b" style={{gridTemplateColumns:'2fr 1fr 1.6fr 1fr 80px',borderColor:'#f1f5f9',background:'#f8fafc'}}>
          {[{label:'Keluarga',col:'headOfFamily'},{label:'Sektor',col:'sectorId'},{label:'Anggota',col:''},{label:'Alamat',col:'address'},{label:'Aksi',col:''}].map(h=>(
            <button key={h.col||h.label} onClick={()=>h.col&&setSort(s=>({col:h.col,dir:s.col===h.col&&s.dir==='asc'?'desc':'asc'}))}
              className={`text-left flex items-center gap-1 ${h.col?'cursor-pointer hover:text-[#1A77A3]':''}`}
              style={{fontSize:'11px',fontWeight:700,letterSpacing:'0.05em',textTransform:'uppercase',color:sort.col===h.col?'#1A77A3':'#94a3b8'}}>
              {h.label}
              {h.col && (sort.col===h.col ? (sort.dir==='asc'?<ArrowUp className="w-3 h-3"/>:<ArrowDown className="w-3 h-3"/>):<ArrowUpDown className="w-3 h-3 opacity-40"/>)}
            </button>
          ))}
        </div>

        {/* Rows */}
        {pageItems.length === 0 ? (
          <div className="py-16 text-center" style={{color:'#94a3b8',fontSize:'13px'}}>Belum ada data keluarga</div>
        ) : pageItems.map((f, idx) => {
          const sec   = sectors.find(s=>s.id===f.sectorId);
          const fmems = sortByRole(members.filter(m=>m.familyId===f.id));
          const head  = members.find(m=>m.id===f.headMemberId);
          const kk    = fmems.find(m=>isKK(m.familyRole)) || fmems[0];
          const rest  = fmems.filter(m=>m.id!==kk?.id);
          const isLast = idx === pageItems.length - 1;

          return (
            <div key={f.id}
              className="grid px-4 py-3 hover:bg-[#f6f4f0]/60 transition-colors cursor-pointer group"
              style={{gridTemplateColumns:'2fr 1fr 1.6fr 1fr 80px', borderBottom: isLast?'none':'1px solid #f1f5f9', alignItems:'center'}}
              onClick={()=>{setSelected(f);setShowDetail(true);}}>

              {/* Col 1: Keluarga */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform"
                  style={{background:'linear-gradient(135deg,#e8f4fb,#d0eaf8)'}}>
                  <Home className="w-5 h-5" style={{color:'#1A77A3'}}/>
                </div>
                <div className="min-w-0">
                  <p className="truncate" style={{fontSize:'13.5px',fontWeight:700,color:'#1e293b'}} data-tooltip={`Keluarga ${f.headOfFamily}`} data-tooltip-truncate>
                    Kel. {f.headOfFamily}
                  </p>
                  {kk && (
                    <p style={{fontSize:'11px',color:'#94a3b8',marginTop:1}}>
                      KK: {kk.fullName}
                    </p>
                  )}
                </div>
              </div>

              {/* Col 2: Sektor */}
              <div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #d0eaf8'}}>
                  <MapPin className="w-2.5 h-2.5"/>
                  {sec?.name?.replace(/Sektor \d+ - /,'')||'—'}
                </span>
              </div>

              {/* Col 3: Anggota avatars + count */}
              <div className="flex items-center gap-2">
                <div className="flex items-center">
                  {fmems.slice(0,5).map((m,i)=>{ const rs=roleStyle(m.familyRole); return (
                    <div key={m.id} data-tooltip={`${m.fullName} (${m.familyRole||'—'})`}
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-transform hover:scale-110 hover:z-10"
                      style={{background:rs.avatarBg,color:rs.avatarText,fontSize:9,fontWeight:700,
                        marginLeft:i>0?-8:0,zIndex:fmems.slice(0,5).length-i,position:'relative',
                        border:'2px solid #fff',boxSizing:'border-box'}}>
                      {m.fullName[0]}
                    </div>
                  );})}
                  {fmems.length>5 && (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center border-2 border-white flex-shrink-0"
                      style={{background:'#e2e8f0',fontSize:9,fontWeight:700,color:'#64748b',marginLeft:-8,position:'relative',zIndex:0}}>
                      +{fmems.length-5}
                    </div>
                  )}
                </div>
                <div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{background:'#f6f4f0',color:'#384959'}}>
                    {fmems.length} orang
                  </span>
                  {fmems.length > 0 && (
                    <p style={{fontSize:'10px',color:'#b0bec5',marginTop:1}}>
                      {[
                        fmems.filter(m=>['AN','Anak'].includes(m.familyRole||'')).length > 0 && `${fmems.filter(m=>['AN','Anak'].includes(m.familyRole||'')).length} anak`,
                        fmems.filter(m=>m.age>=60).length > 0 && `${fmems.filter(m=>m.age>=60).length} lansia`,
                      ].filter(Boolean).join(' · ') || `rata ${Math.round(fmems.reduce((s,m)=>s+m.age,0)/fmems.length)} th`}
                    </p>
                  )}
                </div>
              </div>

              {/* Col 4: Alamat */}
              <div className="min-w-0">
                <p className="truncate text-xs" style={{color:'#64748b'}} data-tooltip={f.address||'—'} data-tooltip-truncate>
                  {f.address||<span style={{color:'#cbd5e1'}}>—</span>}
                </p>
              </div>

              {/* Col 5: Aksi */}
              <div className="flex gap-1 justify-end" onClick={e=>e.stopPropagation()}>
                <button onClick={()=>{setSelected(f);setShowDetail(true);}} data-tooltip="Lihat Detail"
                  className="p-1.5 rounded-lg hover:bg-[#e8f4fb] transition-colors opacity-0 group-hover:opacity-100">
                  <Eye className="w-3.5 h-3.5" style={{color:'#1A77A3'}}/>
                </button>
                {canEdit && (
                  <button onMouseDown={e=>e.preventDefault()} onClick={()=>{setSelected(f);setFormMode('edit');setShowForm(true);}} data-tooltip="Edit"
                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100">
                    <Pencil className="w-3.5 h-3.5 text-gray-400"/>
                  </button>
                )}
                {canDelete && (
                  <button onClick={()=>setDeleteTarget(f)} data-tooltip="Hapus"
                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-3.5 h-3.5 text-red-400"/>
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
          <span style={{fontSize:'12px',color:'#94a3b8',fontWeight:500}}>{filtered.length} keluarga · hal. {page}/{totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page===1} onClick={()=>setPage(p=>p-1)} data-tooltip="Halaman Sebelumnya"
              className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50 transition-all" style={{borderColor:'#e2e8f0'}}>
              <ChevronLeft className="w-4 h-4 text-gray-500"/>
            </button>
            {Array.from({length:Math.min(totalPages,7)},(_,i)=>{
              const pg = totalPages<=7 ? i+1 : (page<=4 ? i+1 : page+i-3);
              if(pg<1||pg>totalPages) return null;
              return (
                <button key={pg} onClick={()=>setPage(pg)}
                  className="w-8 h-8 rounded-lg text-xs font-semibold transition-all"
                  style={{background:page===pg?'#384959':'transparent',color:page===pg?'#fff':'#64748b',border:page===pg?'none':'1px solid #e2e8f0'}}>
                  {pg}
                </button>
              );
            })}
            <button disabled={page===totalPages} onClick={()=>setPage(p=>p+1)} data-tooltip="Halaman Berikutnya"
              className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50 transition-all" style={{borderColor:'#e2e8f0'}}>
              <ChevronRight className="w-4 h-4 text-gray-500"/>
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showDetail && selected && (
        <FamilyDetail family={selected} members={members} sectors={sectors} onClose={()=>setShowDetail(false)}
          onEdit={()=>{setFormMode('edit');setShowDetail(false);setShowForm(true);}}
          onDelete={()=>{setDeleteTarget(selected);setShowDetail(false);}}/>
      )}
      {showForm && (
        <FamilyForm mode={formMode} initial={selected||undefined} sectors={sectors} members={members}
          onSave={handleSave} onClose={()=>{setShowForm(false);setSelected(null);}}/>
      )}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={()=>setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center" style={{transform:`translate(${offset1.x}px,${offset1.y}px)`}} onClick={e=>e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{background:'#fef2f2',cursor:'move'}} onMouseDown={onMouseDown1}><Trash2 className="w-6 h-6 text-red-500"/></div>
            <h3 style={{fontSize:'16px',fontWeight:700,color:'#0f172a',marginBottom:8}}>Hapus Data Keluarga?</h3>
            <p style={{fontSize:'13px',color:'#64748b',marginBottom:24}}>Data keluarga <strong>{deleteTarget.headOfFamily}</strong> akan dihapus permanen.</p>
            <div className="flex gap-3">
              <button onClick={()=>setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl border font-medium text-gray-600 hover:bg-gray-50 text-sm" style={{borderColor:'#e2e8f0'}}>Batal</button>
              <button onClick={()=>{
                const membersInFamily = members.filter(m => m.familyId === deleteTarget.id);
                if (membersInFamily.length > 0) {
                  toast.warning(`Keluarga ini masih memiliki ${membersInFamily.length} anggota. Pindahkan anggota terlebih dahulu.`);
                  setDeleteTarget(null);
                  return;
                }
                deleteFamily(deleteTarget.id);setDeleteTarget(null);
              }} className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm hover:opacity-90" style={{background:'#ef4444'}}>Hapus</button>
            </div>
          </div>
        </div>
      )}
      {/* KPI Detail Modal */}
      {kpiDetail && (()=>{
        const filtered = kpiSearch ? kpiDetail.items.filter(f=>f.headOfFamily.toLowerCase().includes(kpiSearch.toLowerCase())||f.address?.toLowerCase().includes(kpiSearch.toLowerCase())) : kpiDetail.items;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.55)'}} onClick={()=>setKpiDetail(null)}>
            <div className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" style={{maxHeight:'85vh', transform:`translate(${offset2.x}px,${offset2.y}px)`}} onClick={e=>e.stopPropagation()}>
              {/* Header */}
              <div className="px-6 py-5 flex-shrink-0 flex items-center justify-between" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDown2}>
                <div>
                  <p style={{fontSize:'11px',color:'rgba(255,255,255,0.65)',fontWeight:500,letterSpacing:'0.05em',textTransform:'uppercase'}}>Detail KPI Keluarga</p>
                  <h3 className="text-white font-bold" style={{fontSize:'17px'}}>{kpiDetail.label}</h3>
                  <p style={{fontSize:'12px',color:'rgba(255,255,255,0.7)',marginTop:2}}>{filtered.length} dari {kpiDetail.items.length} keluarga</p>
                </div>
                <button onClick={()=>setKpiDetail(null)} data-tooltip="Tutup" className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"><X className="w-5 h-5"/></button>
              </div>
              {/* Search */}
              <div className="px-4 py-3 border-b" style={{borderColor:'#f1f5f9'}}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/>
                  <input value={kpiSearch} onChange={e=>setKpiSearch(e.target.value)} placeholder="Cari nama kepala keluarga / alamat..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/>
                </div>
              </div>
              {/* List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {filtered.length===0 ? (
                  <div className="text-center py-12"><Home className="w-10 h-10 text-gray-200 mx-auto mb-2"/><p style={{fontSize:'13px',color:'#94a3b8'}}>Tidak ada data keluarga</p></div>
                ) : filtered.map(f=>{
                  const sec=sectors.find(s=>s.id===f.sectorId);
                  const fmems=members.filter(m=>m.familyId===f.id);
                  return (
                    <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-[#f2f0ea] cursor-pointer transition-colors" style={{borderColor:'#f1f5f9'}}
                      onClick={()=>{setKpiDetail(null);setSelected(f);setShowDetail(true);}}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:'#f6f4f0'}}>
                        <Home className="w-5 h-5 #1A77A3"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{fontSize:'13px',fontWeight:600,color:'#334155'}}>Kel. {f.headOfFamily}</p>
                        <p style={{fontSize:'11.5px',color:'#64748b'}}>{sec?.name||'—'} · {f.address?f.address.substring(0,40)+(f.address.length>40?'...':''):'Alamat tidak tersedia'}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className="text-xs font-bold px-2 py-1 rounded-xl" style={{background:'#f6f4f0',color:'#2563eb'}}>{fmems.length} angg.</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-3 border-t flex justify-end" style={{borderColor:'#f1f5f9'}}>
                <button onClick={()=>setKpiDetail(null)} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}>Tutup</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}