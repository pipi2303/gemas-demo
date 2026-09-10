import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Sector, Member, Family } from '../types';
import { useDraggable } from '../../lib/useDraggable';
import {
  MapPin, Users, Phone, User, Pencil, X, AlertCircle,
  Home, Heart, Baby, GraduationCap, ChevronRight, ChevronLeft,
  Search, CheckCircle2, BarChart3, Calendar, Download, ArrowRight, Plus, Trash2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { MemberDetail } from './MemberDatabase';
import { roleStyle, sortByRole } from '../../lib/familyRole';
import { normPelkat, PELKAT_LABELS } from '../utils/pelkatUtils';
import { liveAge } from '../../lib/age';

const SECTOR_THEMES = [
  {bg:'#144f6b',light:'#f0fdf4',border:'#b8d5e8',accent:'#144f6b',icon:'#f0fdf4'},
  {bg:'linear-gradient(135deg,#3a7fa0,#144f6b)',light:'#f6f4f0',border:'#bfdbfe',accent:'#144f6b',icon:'#f6f4f0'},
  {bg:'linear-gradient(135deg,#144f6b,#144f6b)',light:'#f6f4f0',border:'#ddd6fe',accent:'#144f6b',icon:'#f6f4f0'},
  {bg:'linear-gradient(135deg,#7290a0,#144f6b)',light:'#fdf2f8',border:'#fbcfe8',accent:'#3a7fa0',icon:'#fdf2f8'},
];

function progressBar(value: number, max: number, color: string) {
  const pct = max>0 ? Math.min(100,(value/max)*100) : 0;
  return (
    <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{background:'#f1f5f9'}}>
      <div className="h-full rounded-full" style={{width:`${pct}%`,background:color}}/>
    </div>
  );
}

// ── SECTOR DETAIL MODAL ───────────────────────────────────────────────────────
function SectorDetail({ sector, members, families, theme, onClose, onEdit }: {
  sector: Sector; members: Member[]; families: Family[];
  theme: typeof SECTOR_THEMES[0];
  onClose:()=>void; onEdit:()=>void;
}) {
  const { offset, onMouseDown } = useDraggable();
  const { attestations, sectors, can: canFn } = useApp();
  const detailCanEdit = canFn('Sektor Pelayanan', 'edit');
  const [tab, setTab] = useState<'overview'|'members'|'families'>('overview');
  const [search, setSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const sMembers = members.filter(m=>m.sectorId===sector.id);
  const sFamilies = families.filter(f=>f.sectorId===sector.id);

  // Kepengurusan sektor — prioritas ID tersimpan, fallback ke Jabatan Pelayanan anggota
  const ketua = (sector.leaderId ? members.find(m=>m.id===sector.leaderId) : null)
    || sMembers.find(m=>m.position && /ketua sektor/i.test(m.position) && !/wakil/i.test(m.position));
  const wakilKetua = (sector.deputyLeaderId ? members.find(m=>m.id===sector.deputyLeaderId) : null)
    || sMembers.find(m=>m.position && /wakil ketua/i.test(m.position));
  const bendahara = (sector.treasurerId ? members.find(m=>m.id===sector.treasurerId) : null)
    || sMembers.find(m=>m.position && /bendahara/i.test(m.position));

  // Demographics
  const aktif = sMembers.filter(m=>m.membershipStatus==='Aktif').length;
  const laki = sMembers.filter(m=>m.gender==='Laki-laki').length;
  const perempuan = sMembers.filter(m=>m.gender==='Perempuan').length;
  const anak = sMembers.filter(m=>liveAge(m)<18).length;
  const pemuda = sMembers.filter(m=>liveAge(m)>=18&&liveAge(m)<35).length;
  const dewasa = sMembers.filter(m=>liveAge(m)>=35&&liveAge(m)<60).length;
  const lansia = sMembers.filter(m=>liveAge(m)>=60).length;
  const sudahBaptis = sMembers.filter(m=>m.baptismStatus==='Sudah').length;
  const sudahSidi = sMembers.filter(m=>m.sidiStatus==='Sudah').length;
  // Dikelompokkan pakai normPelkat() (bukan string mentah) supaya variasi
  // penulisan seperti "PELKAT-GP" / "PELKAT GP" / "GP" masuk ke hitungan yang
  // sama, tidak pecah jadi baris terpisah-pisah di rekap.
  const pelkatMap: Record<string,number> = {};
  sMembers.forEach(m=>{
    const key = normPelkat(m.pelkatStatus);
    if(key) pelkatMap[key]=(pelkatMap[key]||0)+1;
  });

  const filteredMembers = search ? sMembers.filter(m=>m.fullName.toLowerCase().includes(search.toLowerCase())) : sMembers;

  const TABS = [{id:'overview',label:'Gambaran Umum'},{id:'members',label:`Anggota (${sMembers.length})`},{id:'families',label:`Keluarga (${sFamilies.length})`}] as const;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" style={{maxHeight:'92vh', transform:`translate(${offset.x}px,${offset.y}px)`}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 flex-shrink-0" style={{background:theme.bg,cursor:'move'}} onMouseDown={onMouseDown}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{background:'rgba(255,255,255,0.2)'}}>
                <MapPin className="w-7 h-7 text-white"/>
              </div>
              <div>
                <h3 className="text-white font-bold" style={{fontSize:'18px'}}>{sector.name}</h3>
                <p style={{fontSize:'12px',color:'rgba(255,255,255,0.65)',marginTop:2}}>
                  Koordinator: {(sector.leaderId ? members.find(m=>m.id===sector.leaderId)?.fullName : null) || sector.leader || '—'}
                  {sector.leaderContact ? ` · ${sector.leaderContact}` : ''}
                </p>
                <div className="flex gap-3 mt-3">
                  <div className="text-center"><p style={{fontSize:'20px',fontWeight:800,color:'#fff'}}>{sMembers.length}</p><p style={{fontSize:'10px',color:'rgba(255,255,255,0.6)'}}>Anggota</p></div>
                  <div style={{width:1,background:'rgba(255,255,255,0.2)'}}/>
                  <div className="text-center"><p style={{fontSize:'20px',fontWeight:800,color:'#fff'}}>{sFamilies.length}</p><p style={{fontSize:'10px',color:'rgba(255,255,255,0.6)'}}>Keluarga</p></div>
                  <div style={{width:1,background:'rgba(255,255,255,0.2)'}}/>
                  <div className="text-center"><p style={{fontSize:'20px',fontWeight:800,color:'#fff'}}>{aktif}</p><p style={{fontSize:'10px',color:'rgba(255,255,255,0.6)'}}>Aktif</p></div>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {detailCanEdit && <button data-tooltip="Edit" onClick={onEdit} className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors"><Pencil className="w-4 h-4"/></button>}
              <button data-tooltip="Tutup" onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors"><X className="w-4 h-4"/></button>
            </div>
          </div>
          <div className="flex gap-1 mt-4">
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{background:tab===t.id?'#FFEFB2':'transparent',color:tab===t.id?'#384959':'rgba(255,255,255,0.5)'}}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab==='overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Gender */}
              <div className="rounded-2xl border p-4" style={{borderColor:'#f1f5f9'}}>
                <h4 style={{fontSize:'13px',fontWeight:700,color:'#4b5563',marginBottom:12}}>Jenis Kelamin</h4>
                {[{l:'Laki-laki',v:laki,c:'#144f6b'},{l:'Perempuan',v:perempuan,c:'#3a7fa0'}].map(x=>(
                  <div key={x.l} className="mb-2.5">
                    <div className="flex justify-between" style={{fontSize:'12px',color:'#4b5563'}}>
                      <span>{x.l}</span>
                      <span style={{fontWeight:600}}>{x.v} ({sMembers.length>0?((x.v/sMembers.length)*100).toFixed(0):0}%)</span>
                    </div>
                    {progressBar(x.v,sMembers.length,x.c)}
                  </div>
                ))}
              </div>
              {/* Kepengurusan */}
              <div className="rounded-2xl border p-4" style={{borderColor:'#f1f5f9'}}>
                <h4 style={{fontSize:'13px',fontWeight:700,color:'#4b5563',marginBottom:12}}>Kepengurusan Sektor</h4>
                {[
                  {l:'Koordinator Sektor', v: ketua?.fullName},
                  {l:'Wakil Koordinator Sektor', v: wakilKetua?.fullName},
                  {l:'Bendahara Sektor', v: bendahara?.fullName},
                ].map(x=>(
                  <div key={x.l} className="flex items-center justify-between mb-2.5">
                    <span style={{fontSize:'12px',color:'#4b5563'}}>{x.l}</span>
                    <span style={{fontSize:'12px',fontWeight:600,color: x.v ? '#0f172a' : '#cbd5e1'}}>{x.v || '—'}</span>
                  </div>
                ))}
              </div>

              {/* Usia */}
              <div className="rounded-2xl border p-4" style={{borderColor:'#f1f5f9'}}>
                <h4 style={{fontSize:'13px',fontWeight:700,color:'#4b5563',marginBottom:12}}>Kelompok Usia</h4>
                {[{l:'Anak (<18)',v:anak,c:'#F59E0B'},{l:'Pemuda (18-34)',v:pemuda,c:'#2563EB'},{l:'Dewasa (35-59)',v:dewasa,c:'#059669'},{l:'Lansia (60+)',v:lansia,c:'#7C3AED'}].map(x=>(
                  <div key={x.l} className="mb-2">
                    <div className="flex justify-between" style={{fontSize:'12px',color:'#4b5563'}}>
                      <span>{x.l}</span>
                      <span style={{fontWeight:600}}>{x.v}</span>
                    </div>
                    {progressBar(x.v,sMembers.length,x.c)}
                  </div>
                ))}
              </div>
              {/* Sakramen */}
              <div className="rounded-2xl border p-4" style={{borderColor:'#f1f5f9'}}>
                <h4 style={{fontSize:'13px',fontWeight:700,color:'#4b5563',marginBottom:12}}>Status Sakramen</h4>
                {[{l:'Sudah Baptis',v:sudahBaptis,c:'#3a7fa0'},{l:'Sudah Sidi',v:sudahSidi,c:'#144f6b'},{l:'Belum Baptis',v:sMembers.length-sudahBaptis,c:'#c2baaa'}].map(x=>(
                  <div key={x.l} className="mb-2">
                    <div className="flex justify-between" style={{fontSize:'12px',color:'#4b5563'}}>
                      <span>{x.l}</span><span style={{fontWeight:600}}>{x.v}</span>
                    </div>
                    {progressBar(x.v,sMembers.length,x.c)}
                  </div>
                ))}
              </div>
              {/* Pelkat */}
              <div className="rounded-2xl border p-4" style={{borderColor:'#f1f5f9'}}>
                <h4 style={{fontSize:'13px',fontWeight:700,color:'#4b5563',marginBottom:12}}>Unit Kategorial (Pelkat)</h4>
                {Object.entries(pelkatMap).length===0 ? (
                  <p style={{fontSize:'12px',color:'#94a3b8'}}>Belum ada data pelkat</p>
                ) : Object.entries(pelkatMap).map(([k,v])=>(
                  <div key={k} className="flex items-center justify-between mb-2">
                    <span style={{fontSize:'12px',color:'#4b5563'}}>{PELKAT_LABELS[k] || k}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{background:theme.light,color:theme.accent}}>{v} orang</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab==='members' && (
            <div>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nama anggota..."
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2" style={{borderColor:'#e2e8f0',['--tw-ring-color' as any]:theme.accent}}/>
              </div>
              <div className="space-y-2">
                {filteredMembers.slice(0,50).map(m=>(
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-[#f2f0ea] cursor-pointer transition-all group" 
                    style={{borderColor:'#f1f5f9'}}
                    onClick={() => setSelectedMember(m)}>
                    {(() => { const rs=roleStyle(m.familyRole); return (
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold transition-transform group-hover:scale-105"
                        style={{background:rs.avatarBg,color:rs.avatarText}}>
                        {m.fullName[0]}
                      </div>
                    );})()}
                    <div className="flex-1 min-w-0">
                      <p style={{fontSize:'13px',fontWeight:600,color:'#334155'}} className="group-hover:text-[#144f6b] transition-colors">{m.fullName}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {m.familyRole && (() => { const rs=roleStyle(m.familyRole); return (
                          <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{background:rs.bg,color:rs.text,border:`1px solid ${rs.border}`}}>{m.familyRole}</span>
                        );})()}
                        <span style={{fontSize:'11px',color:'#94a3b8'}}>{liveAge(m)} th · {m.gender}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.membershipStatus==='Aktif'?'bg-[#f0f7fb] text-[#144f6b]':'bg-gray-100 text-gray-500'}`}>
                        {m.membershipStatus||'—'}
                      </span>
                      {m.pelkatStatus && <p style={{fontSize:'10px',color:'#94a3b8',marginTop:2}}>{m.pelkatStatus}</p>}
                    </div>
                  </div>
                ))}
                {filteredMembers.length>50 && <p style={{fontSize:'12px',color:'#94a3b8',textAlign:'center',padding:'8px 0'}}>+{filteredMembers.length-50} anggota lainnya</p>}
              </div>
            </div>
          )}

          {tab==='families' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sFamilies.map(f=>{
                const fmems=members.filter(m=>m.familyId===f.id);
                return (
                  <div key={f.id} className="p-4 rounded-xl border" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background:theme.light}}>
                        <Home className="w-4 h-4" style={{color:theme.accent}}/>
                      </div>
                      <p style={{fontSize:'13px',fontWeight:600,color:'#334155'}}>Kel. {f.headOfFamily}</p>
                    </div>
                    <p style={{fontSize:'11px',color:'#64748b'}}>{fmems.length} anggota · {f.address||'—'}</p>
                    <div className="flex gap-1 mt-2">
                      {sortByRole(fmems).slice(0,4).map(m=>{ const rs=roleStyle(m.familyRole); return (
                        <span key={m.id} className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{background:rs.bg,color:rs.text,border:`1px solid ${rs.border}`}}>{m.familyRole}</span>
                      );})}
                    </div>
                  </div>
                );
              })}
              {sFamilies.length===0 && <p style={{fontSize:'12px',color:'#94a3b8',textAlign:'center',padding:'24px 0',gridColumn:'1/-1'}}>Belum ada data keluarga</p>}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3 flex-shrink-0" style={{borderColor:'#f1f5f9'}}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50" style={{borderColor:'#e2e8f0'}}>Tutup</button>
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
          onEdit={() => setSelectedMember(null)}
          onDelete={() => setSelectedMember(null)}
        />
      )}
    </div>
  );
}

// ── SECTOR FORM ───────────────────────────────────────────────────────────────
function MemberPicker({ label, value, onSelect, members, sectors }: {
  label: string;
  value: Member | null;
  onSelect: (m: Member | null) => void;
  members: Member[];
  sectors: Sector[];
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return members.filter(m =>
      m.fullName.toLowerCase().includes(q) ||
      m.memberNumber?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [search, members]);

  const sectorName = (sectorId: string) =>
    sectors.find(s => s.id === sectorId)?.name || '-';

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{label}</label>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#f0f7fb', border: '1px solid #b8d5e8' }}>
          <User style={{ width: 14, height: 14, color: '#144f6b', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: 0 }}>{value.fullName}</p>
            <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>{sectorName(value.sectorId)}</p>
          </div>
          <button onClick={() => { onSelect(null); setSearch(''); }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#94a3b8' }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Cari nama jemaat..."
            style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
          />
          {open && results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
              {results.map(m => (
                <div key={m.id} onMouseDown={() => { onSelect(m); setSearch(''); setOpen(false); }}
                  style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 2 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0f7fb')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{m.fullName}</span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>{sectorName(m.sectorId)} · {m.memberNumber || '-'}</span>
                </div>
              ))}
            </div>
          )}
          {open && search.trim() && results.length === 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px', textAlign: 'center', fontSize: '12px', color: '#94a3b8', marginTop: 4 }}>
              Tidak ada hasil
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectorForm({ sector, onSave, onClose }: {
  sector?: Partial<Sector>; onSave:(d:Partial<Sector>)=>void; onClose:()=>void;
}) {
  const { offset, onMouseDown } = useDraggable();
  const { members, sectors, updateMember } = useApp();
  const isNew = !sector?.id;

  const findMember = (id?: string) => id ? members.find(m => m.id === id) || null : null;

  const [name, setName] = useState(sector?.name || '');
  const [description, setDescription] = useState(sector?.description || '');
  const [leaderContact, setLeaderContact] = useState(sector?.leaderContact || '');
  const [leader, setLeader] = useState<Member | null>(findMember(sector?.leaderId));
  const [deputy, setDeputy] = useState<Member | null>(findMember(sector?.deputyLeaderId));
  const [treasurer, setTreasurer] = useState<Member | null>(findMember(sector?.treasurerId));

  const handleSave = () => {
    // Auto-update phone di database jemaat jika diisi
    if (leaderContact && leader && leaderContact !== leader.phone) {
      updateMember(leader.id, { phone: leaderContact });
    }

    onSave({
      name,
      description,
      leader: leader?.fullName || '',
      leaderContact,
      leaderId: leader?.id || '',
      deputyLeaderId: deputy?.id || '',
      treasurerId: treasurer?.id || '',
    });
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden bg-white" style={{transform:`translate(${offset.x}px,${offset.y}px)`}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 border-b" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDown}>
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold" style={{fontSize:'15px'}}>{isNew ? 'Tambah Sektor Baru' : `Edit Sektor — ${sector?.name}`}</h3>
            <button data-tooltip="Tutup" onClick={onClose} className="text-white/50 hover:text-white transition-colors"><X className="w-4 h-4"/></button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label style={{display:'block',marginBottom:4,fontSize:'12px',color:'#64748b',fontWeight:600}}>Nama Sektor</label>
            <input autoFocus value={name} onChange={e=>setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]" style={{borderColor:'#e2e8f0'}}/>
          </div>

          <MemberPicker label="Koordinator Sektor" value={leader} onSelect={m => { setLeader(m); if (m?.phone) setLeaderContact(m.phone); }} members={members} sectors={sectors}/>

          <MemberPicker label="Wakil Koord. Sektor" value={deputy} onSelect={setDeputy} members={members} sectors={sectors}/>

          <MemberPicker label="Bendahara Sektor" value={treasurer} onSelect={setTreasurer} members={members} sectors={sectors}/>

          <div>
            <label style={{display:'block',marginBottom:4,fontSize:'12px',color:'#64748b',fontWeight:600}}>
              No. Kontak Koordinator
              {leader && <span style={{fontSize:'11px',color:'#144f6b',marginLeft:6}}>— otomatis tersimpan ke data jemaat</span>}
            </label>
            <input value={leaderContact} onChange={e=>setLeaderContact(e.target.value)}
              placeholder="08xxxxxxxxxx"
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]" style={{borderColor:'#e2e8f0'}}/>
          </div>

          <div>
            <label style={{display:'block',marginBottom:4,fontSize:'12px',color:'#64748b',fontWeight:600}}>Keterangan</label>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3}
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b] resize-none" style={{borderColor:'#e2e8f0'}}/>
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50" style={{borderColor:'#e2e8f0'}}>Batal</button>
          <button onClick={handleSave} className="px-5 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90" style={{background:'#144f6b'}}>Simpan</button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export function SectorDatabase() {
  const { offset: offset1, onMouseDown: onMouseDown1 } = useDraggable();
  const { offset: offset2, onMouseDown: onMouseDown2 } = useDraggable();
  const { sectors, members, families, addSector, updateSector, deleteSector, can } = useApp();

  const canEdit   = can('sectors', 'edit');
  const canDelete = can('sectors', 'delete');
  const [deleteTarget, setDeleteTarget] = useState<Sector | null>(null);

  const [selected, setSelected] = useState<Sector|null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editSector, setEditSector] = useState<Partial<Sector>|null>(null);
  const [kpiDetail, setKpiDetail] = useState<{label:string;type:'members'|'families';items:any[]}|null>(null);
  const [kpiSearch, setKpiSearch] = useState('');

  const totalMembers = members.length;
  const totalFamilies = families.length;

  const sectorStats = useMemo(()=>{
    const sorted = [...sectors].sort((a,b)=>{
      const na = parseInt(a.name.replace(/\D/g,''),10)||0;
      const nb = parseInt(b.name.replace(/\D/g,''),10)||0;
      return na !== nb ? na - nb : a.name.localeCompare(b.name);
    });
    return sorted.map((s,i)=>{
      const sm = members.filter(m=>m.sectorId===s.id);
      const sf = families.filter(f=>f.sectorId===s.id);
      const aktif = sm.filter(m=>m.membershipStatus==='Aktif').length;
      const laki = sm.filter(m=>m.gender==='Laki-laki').length;
      const perempuan = sm.filter(m=>m.gender==='Perempuan').length;
      const avgAge = sm.length ? Math.round(sm.reduce((a,m)=>a+liveAge(m),0)/sm.length) : 0;
      // Prioritas: leaderId/deputyLeaderId → fallback ke position-based lookup
      const ketua = (s.leaderId ? members.find(m => m.id === s.leaderId) : null)
        || sm.find(m => m.position && /ketua sektor/i.test(m.position) && !/wakil/i.test(m.position));
      const wakilKetua = (s.deputyLeaderId ? members.find(m => m.id === s.deputyLeaderId) : null)
        || sm.find(m => m.position && /wakil ketua/i.test(m.position));
      const bendahara = (s.treasurerId ? members.find(m => m.id === s.treasurerId) : null)
        || sm.find(m => m.position && /bendahara/i.test(m.position));
      return { ...s, sm, sf, aktif, laki, perempuan, avgAge, ketua, wakilKetua, bendahara, theme: SECTOR_THEMES[i%SECTOR_THEMES.length] };
    });
  },[sectors,members,families]);

  const exportExcel = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const tgl = `${pad(now.getDate())}${pad(now.getMonth()+1)}${now.getFullYear()}`;
    const jam = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `sektor_pelayanan_${tgl}_${jam}.xlsx`;

    const wb = XLSX.utils.book_new();

    sectorStats.forEach(s => {
      const total = s.sm.length;
      const pct = (n: number) => total ? `${Math.round(n / total * 100)}%` : '0%';

      const anak   = s.sm.filter(m => liveAge(m) < 18).length;
      const pemuda = s.sm.filter(m => liveAge(m) >= 18 && liveAge(m) <= 34).length;
      const dewasa = s.sm.filter(m => liveAge(m) >= 35 && liveAge(m) <= 59).length;
      const lansia = s.sm.filter(m => liveAge(m) >= 60).length;

      // Sort members: by family (headOfFamily), then KK first within each family
      const sectorFamilies = families
        .filter(f => f.sectorId === s.id)
        .sort((a, b) => a.headOfFamily.localeCompare(b.headOfFamily));
      const sortedMembers: typeof s.sm = [];
      sectorFamilies.forEach(f => {
        sortByRole(s.sm.filter(m => m.familyId === f.id)).forEach(m => sortedMembers.push(m));
      });
      const inFamily = new Set(sortedMembers.map(m => m.id));
      s.sm.filter(m => !inFamily.has(m.id)).forEach(m => sortedMembers.push(m));

      const aoa: any[][] = [];
      const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
      const addMerged = (val: string) => {
        const r = aoa.length;
        aoa.push([val, '', '', '', '', '']);
        merges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
      };

      // Title
      addMerged(s.name.toUpperCase());
      aoa.push(['', '', '', '', '', '']);

      // Info rows
      aoa.push(['Ketua Sektor:', s.ketua?.fullName || '-', '', '', '', '']);
      aoa.push(['Wakil Ketua Sektor:', s.wakilKetua?.fullName || '-', '', '', '', '']);
      aoa.push(['Bendahara Sektor:', s.bendahara?.fullName || '-', '', '', '', '']);
      addMerged(`Jenis Kelamin: Laki-Laki: ${s.laki} (${pct(s.laki)}), Perempuan: ${s.perempuan} (${pct(s.perempuan)})`);

      // Age groups
      aoa.push(['Kelompok Usia:', '', '', '', '', '']);
      aoa.push(['', 'Anak (<18)',     anak,   pct(anak),   '', '']);
      aoa.push(['', 'Pemuda (18-34)', pemuda, pct(pemuda), '', '']);
      aoa.push(['', 'Dewasa (35-59)', dewasa, pct(dewasa), '', '']);
      aoa.push(['', 'Lansia (60+)',   lansia, pct(lansia), '', '']);
      aoa.push(['', '', '', '', '', '']);

      // Table header
      aoa.push(['No.', 'No Induk', 'Nama Anggota', 'Jenis Kelamin', 'Usia', 'Status Pelkat']);

      // Member rows
      sortedMembers.forEach((m, i) => {
        aoa.push([
          i + 1,
          m.memberNumber || '',
          m.fullName,
          m.gender === 'Laki-laki' ? 'L' : 'P',
          liveAge(m) ? `${liveAge(m)} tahun` : '',
          m.pelkatStatus || '',
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!merges'] = merges;
      ws['!cols'] = [
        { wch: 24 }, // A: label / No.
        { wch: 18 }, // B: No Induk / age group name
        { wch: 30 }, // C: Nama / count
        { wch: 16 }, // D: Jenis Kelamin / pct
        { wch: 7 },  // E: Usia
        { wch: 16 }, // F: Status Pelkat
      ];

      const sheetName = s.name.substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, filename);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5" style={{fontSize:'22px',fontWeight:700,color:'#0f172a',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:'linear-gradient(135deg,#144f6b,#144f6b)'}}>
              <MapPin className="w-5 h-5 text-white"/>
            </div>
            Sektor Pelayanan
          </h1>
          <p style={{fontSize:'13px',color:'#64748b',marginTop:'2px'}}>GPIB Trinitas · {sectors.length} sektor aktif · {totalMembers} anggota · {totalFamilies} keluarga</p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <button onMouseDown={e=>e.preventDefault()} onClick={()=>{setEditSector({});setShowForm(true);}} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all" style={{background:'#144f6b'}}>
              <Plus className="w-4 h-4"/> Tambah Sektor
            </button>
          )}
          <button onClick={exportExcel} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border hover:bg-gray-50 transition-all" style={{borderColor:'#e2e8f0',color:'#4b5563'}}>
            <Download className="w-4 h-4"/> Export Excel
          </button>
        </div>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {label:'Total Anggota',value:totalMembers,sub:'seluruh sektor',color:'#0f172a',bg:'#f8fafc',border:'#e2e8f0', type:'members' as const, items:members},
          {label:'Total Keluarga',value:totalFamilies,sub:'seluruh sektor',color:'#144f6b',bg:'#f6f4f0',border:'#bfdbfe', type:'families' as const, items:families},
          {label:'Anggota Aktif',value:members.filter(m=>m.membershipStatus==='Aktif').length,sub:`${totalMembers>0?((members.filter(m=>m.membershipStatus==='Aktif').length/totalMembers)*100).toFixed(0):0}% dari total`,color:'#144f6b',bg:'#f0fdf4',border:'#b8d5e8', type:'members' as const, items:members.filter(m=>m.membershipStatus==='Aktif')},
          {label:'Anggota Non-Aktif',value:members.filter(m=>m.membershipStatus==='Tidak Aktif').length,sub:`${totalMembers>0?((members.filter(m=>m.membershipStatus==='Tidak Aktif').length/totalMembers)*100).toFixed(0):0}% dari total`,color:'#b45309',bg:'#fef3c7',border:'#fde68a', type:'members' as const, items:members.filter(m=>m.membershipStatus==='Tidak Aktif')},
          {label:'Rata-rata Umur per Sektor',value:sectorStats.length>0?Math.round(sectorStats.reduce((a,s)=>a+s.avgAge,0)/sectorStats.length):0,sub:'tahun',color:'#144f6b',bg:'#f6f4f0',border:'#ddd6fe', type:'members' as const, items:members},
        ].map((s,i)=>(
          <div key={i} className="rounded-2xl p-4 border cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all" style={{background:s.bg,borderColor:s.border}} onClick={()=>{setKpiDetail({label:s.label,type:s.type,items:s.items});setKpiSearch('');}}>
            <p style={{fontSize:'22px',fontWeight:700,color:s.color,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{s.value}</p>
            <p style={{fontSize:'12.5px',fontWeight:600,color:s.color,opacity:0.8}}>{s.label}</p>
            <p style={{fontSize:'11px',color:'#94a3b8',marginTop:2}}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Sector Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {sectorStats.map(s=>(
          <div 
            key={s.id} 
            className="rounded-2xl border bg-white overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group" 
            style={{borderColor:'#e2e8f0'}}
            onClick={()=>{setSelected(s);setShowDetail(true);}}
          >
            {/* Card header */}
            <div className="p-5" style={{background:s.theme.bg}}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="w-4 h-4 text-white"/>
                    <h3 className="text-white font-bold" style={{fontSize:'15px'}}>{s.name}</h3>
                  </div>
                  <p style={{fontSize:'12px',color:'rgba(255,255,255,0.65)'}}>Koordinator Sektor: {s.ketua?.fullName||'—'}</p>
                  <p style={{fontSize:'12px',color:'rgba(255,255,255,0.65)'}}>Wakil Koord. Sektor: {s.wakilKetua?.fullName||'—'}</p>
                  <p style={{fontSize:'12px',color:'rgba(255,255,255,0.65)'}}>Bendahara Sektor: {s.bendahara?.fullName||'—'}</p>
                </div>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  {canEdit && <button data-tooltip="Edit" onMouseDown={e=>e.preventDefault()} onClick={()=>{setEditSector(s);setShowForm(true);}} className="p-1.5 rounded-lg hover:bg-white/20 text-white/70 hover:text-white transition-colors"><Pencil className="w-3.5 h-3.5"/></button>}
                  {canDelete && <button data-tooltip="Hapus" onMouseDown={e=>e.preventDefault()} onClick={()=>setDeleteTarget(s)} className="p-1.5 rounded-lg hover:bg-red-500/30 text-white/70 hover:text-red-200 transition-colors"><Trash2 className="w-3.5 h-3.5"/></button>}
                  <button data-tooltip="Lihat Detail" onClick={()=>{setSelected(s);setShowDetail(true);}} className="p-1.5 rounded-lg hover:bg-white/20 text-white/70 hover:text-white transition-colors"><ArrowRight className="w-3.5 h-3.5"/></button>
                </div>
              </div>
              {/* Stats row */}
              <div className="flex gap-4 mt-4">
                {[{l:'Anggota',v:s.sm.length},{l:'Keluarga',v:s.sf.length},{l:'Aktif',v:s.aktif},{l:'Rata-rata usia',v:s.avgAge+' th'}].map(x=>(
                  <div key={x.l} className="text-center">
                    <p style={{fontSize:'18px',fontWeight:800,color:'#fff'}}>{x.v}</p>
                    <p style={{fontSize:'10px',color:'rgba(255,255,255,0.6)'}}>{x.l}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Card body */}
            <div className="p-5">
              {/* Gender bar */}
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span style={{fontSize:'11.5px',color:'#64748b'}}>Laki-laki vs Perempuan</span>
                  <span style={{fontSize:'11.5px',color:'#64748b'}}>{s.laki}L / {s.perempuan}P</span>
                </div>
                <div className="flex h-3 rounded-full overflow-hidden">
                  <div style={{width:`${s.sm.length>0?(s.laki/s.sm.length)*100:50}%`,background:'#144f6b'}}/>
                  <div style={{flex:1,background:'#3a7fa0'}}/>
                </div>
              </div>

              {/* Age group donut-like bar */}
              <div className="mb-4">
                <p style={{fontSize:'11.5px',color:'#64748b',marginBottom:6}}>Kelompok Usia</p>
                <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                  {[
                    {v:s.sm.filter(m=>liveAge(m)<18).length,c:'#F59E0B'},
                    {v:s.sm.filter(m=>liveAge(m)>=18&&liveAge(m)<35).length,c:'#2563EB'},
                    {v:s.sm.filter(m=>liveAge(m)>=35&&liveAge(m)<60).length,c:'#059669'},
                    {v:s.sm.filter(m=>liveAge(m)>=60).length,c:'#7C3AED'},
                  ].filter(x=>x.v>0).map((x,i)=>(
                    <div key={i} style={{flex:x.v,background:x.c}}/>
                  ))}
                </div>
                <div className="flex gap-3 mt-1.5">
                  {[{l:'Anak',c:'#F59E0B'},{l:'Pemuda',c:'#2563EB'},{l:'Dewasa',c:'#059669'},{l:'Lansia',c:'#7C3AED'}].map(x=>(
                    <span key={x.l} className="flex items-center gap-1" style={{fontSize:'10px',color:'#64748b'}}>
                      <span className="w-2 h-2 rounded-sm inline-block" style={{background:x.c}}/>{x.l}
                    </span>
                  ))}
                </div>
              </div>

            </div>

            <div className="px-5 pb-4">
              <button onClick={()=>{setSelected(s);setShowDetail(true);}} className="w-full py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80 flex items-center justify-center gap-2"
                style={{background:s.theme.light,color:s.theme.accent,border:`1px solid ${s.theme.border}`}}>
                Lihat Detail Sektor <ArrowRight className="w-3.5 h-3.5"/>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modals */}
      {showDetail && selected && (() => {
        const st = sectorStats.find(s=>s.id===selected.id);
        return st ? (
          <SectorDetail sector={selected} members={members} families={families} theme={st.theme}
            onClose={()=>setShowDetail(false)}
            onEdit={()=>{setEditSector(selected);setShowDetail(false);setShowForm(true);}}/>
        ) : null;
      })()}
      {showForm && editSector !== null && (
        <SectorForm sector={editSector} onSave={d=>{
          if (editSector.id) { updateSector(editSector.id, d); }
          else { addSector(d as Omit<Sector,'id'|'memberCount'>); }
          setShowForm(false);
        }} onClose={()=>setShowForm(false)}/>
      )}
      {/* Modal Konfirmasi Hapus Sektor */}
      {deleteTarget && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={()=>setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6" style={{transform:`translate(${offset1.x}px,${offset1.y}px)`}} onClick={e=>e.stopPropagation()}>
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{background:'#fef2f2',cursor:'move'}} onMouseDown={onMouseDown1}>
                <Trash2 className="w-6 h-6 text-red-500"/>
              </div>
              <h3 style={{fontSize:'16px',fontWeight:700,color:'#0f172a'}}>Hapus Sektor</h3>
              <p style={{fontSize:'13px',color:'#64748b'}}>
                Apakah Anda akan menghapus <strong>{deleteTarget.name}</strong>?<br/>
                <span style={{fontSize:'12px',color:'#94a3b8'}}>Anggota yang terhubung tidak ikut terhapus.</span>
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={()=>setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl border font-medium text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                style={{borderColor:'#e2e8f0'}}>
                Batal
              </button>
              <button
                onClick={()=>{
                  const membersInSector = members.filter(m => m.sectorId === deleteTarget.id);
                  if (membersInSector.length > 0) {
                    toast.warning(`Sektor ini masih memiliki ${membersInSector.length} anggota. Pindahkan anggota terlebih dahulu sebelum menghapus sektor.`);
                    return;
                  }
                  deleteSector(deleteTarget.id);
                  setDeleteTarget(null);
                }}
                className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm transition-colors hover:opacity-90"
                style={{background:'#ef4444'}}>
                Setuju
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Detail Modal */}
      {kpiDetail && (()=>{
        const list = kpiSearch
          ? kpiDetail.items.filter((x:any)=>
              kpiDetail.type==='members'
                ? x.fullName?.toLowerCase().includes(kpiSearch.toLowerCase())
                : x.headOfFamily?.toLowerCase().includes(kpiSearch.toLowerCase())
            )
          : kpiDetail.items;
        return (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.55)'}} onClick={()=>setKpiDetail(null)}>
            <div className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" style={{maxHeight:'85vh', transform:`translate(${offset2.x}px,${offset2.y}px)`}} onClick={e=>e.stopPropagation()}>
              {/* Header */}
              <div className="px-6 py-5 flex-shrink-0 flex items-center justify-between" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDown2}>
                <div>
                  <p style={{fontSize:'11px',color:'rgba(255,255,255,0.65)',fontWeight:500,letterSpacing:'0.05em',textTransform:'uppercase'}}>Detail KPI Sektor</p>
                  <h3 className="text-white font-bold" style={{fontSize:'17px'}}>{kpiDetail.label}</h3>
                  <p style={{fontSize:'12px',color:'rgba(255,255,255,0.7)',marginTop:2}}>{list.length} dari {kpiDetail.items.length} {kpiDetail.type==='members'?'anggota':'keluarga'}</p>
                </div>
                <button data-tooltip="Tutup" onClick={()=>setKpiDetail(null)} className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"><X className="w-5 h-5"/></button>
              </div>
              {/* Search */}
              <div className="px-4 py-3 border-b" style={{borderColor:'#f1f5f9'}}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/>
                  <input value={kpiSearch} onChange={e=>setKpiSearch(e.target.value)}
                    placeholder={kpiDetail.type==='members'?'Cari nama anggota...':'Cari nama kepala keluarga...'}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]" style={{borderColor:'#e2e8f0'}}/>
                </div>
              </div>
              {/* List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {list.length===0 ? (
                  <div className="text-center py-12"><Users className="w-10 h-10 text-gray-200 mx-auto mb-2"/><p style={{fontSize:'13px',color:'#94a3b8'}}>Tidak ada data</p></div>
                ) : kpiDetail.type==='members' ? list.map((m:any)=>{
                  const sec = sectors.find(s=>s.id===m.sectorId);
                  const fam = families.find(f=>f.id===m.familyId);
                  return (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-[#f0f7fb]/50 transition-colors" style={{borderColor:'#f1f5f9'}}>
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0 text-sm font-bold"
                        style={{background:'linear-gradient(135deg,#144f6b,#144f6b)'}}>
                        {m.fullName?.[0]||'?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <p style={{fontSize:'13px',fontWeight:600,color:'#334155'}}>{m.fullName}</p>
                          <span style={{fontSize:'10.5px',color:'#94a3b8',fontWeight:500,flexShrink:0}}>No. {m.memberNumber||'—'}</span>
                        </div>
                        <p style={{fontSize:'11.5px',color:'#64748b'}}>{sec?.name||'—'} · {m.gender||'—'} · {liveAge(m)||'?'} thn</p>
                        <p style={{fontSize:'11px',color:'#94a3b8',marginTop:1}}>KK: {fam?.headOfFamily||'—'}</p>
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-end gap-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.membershipStatus==='Aktif'?'text-[#144f6b] bg-[#f0f7fb]':'text-gray-500 bg-gray-100'}`}>{m.membershipStatus||'—'}</span>
                        {m.pelkatStatus && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{background:'#f6f4f0',color:'#144f6b'}}>{m.pelkatStatus}</span>}
                      </div>
                    </div>
                  );
                }) : list.map((f:any)=>{
                  const sec = sectors.find(s=>s.id===f.sectorId);
                  const fmems = members.filter(m=>m.familyId===f.id);
                  return (
                    <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-[#f0f7fb]/50 transition-colors" style={{borderColor:'#f1f5f9'}}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:'#f6f4f0'}}>
                        <Home className="w-5 h-5 text-[#144f6b]"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{fontSize:'13px',fontWeight:600,color:'#334155'}}>Kel. {f.headOfFamily}</p>
                        <p style={{fontSize:'11.5px',color:'#64748b'}}>{sec?.name||'—'} · {f.address?f.address.substring(0,35)+(f.address.length>35?'...':''):'—'}</p>
                      </div>
                      <span className="text-xs font-bold px-2 py-1 rounded-xl flex-shrink-0" style={{background:'#f6f4f0',color:'#144f6b'}}>{fmems.length} angg.</span>
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