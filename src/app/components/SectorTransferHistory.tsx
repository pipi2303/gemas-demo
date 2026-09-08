import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useDraggable } from '../../lib/useDraggable';
import { Card } from './ui/card';
import { SearchDropdown } from './ui/SearchDropdown';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Search, ArrowRightLeft, MapPin, Users, TrendingUp, TrendingDown,
  History, Calendar, User, ChevronRight, Plus, Eye,
  AlertCircle, CheckCircle2, Clock, X, CheckCheck, Loader2, Trash2
} from 'lucide-react';
import { MemberDetail } from './MemberDatabase';
import { Member, SectorTransfer } from '../types';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  'Selesai': { label: 'Selesai', color: 'bg-[#f0ede5] text-[#144f6b]', icon: CheckCircle2 },
  'Diproses': { label: 'Diproses', color: 'bg-[#f0ede5] text-[#144f6b]', icon: Clock },
  'Pending': { label: 'Menunggu', color: 'bg-[#f0ede5] text-[#1A77A3]', icon: AlertCircle },
};

export function SectorTransferHistory() {
  const { members, sectors, families, attestations, sectorTransfers, addSectorTransfer, addSectorTransferBatch, updateSectorTransfer, deleteSectorTransfer, updateMember, currentUser, can } = useApp();
  const { offset, onMouseDown } = useDraggable();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSector, setFilterSector] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<SectorTransfer | null>(null);

  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SectorTransfer | null>(null);

  const transfers = sectorTransfers;

  const [memberSearch, setMemberSearch] = useState('');
  const [form, setForm] = useState({
    memberId: '', fromSectorId: '', toSectorId: '', reason: '', notes: ''
  });

  // Mode "keluarga": ajukan mutasi sektor untuk 1 keluarga sekaligus. Setiap anggota tetap
  // punya record SectorTransfer sendiri (fromSectorId ikut sektor asal masing-masing orang),
  // tapi semua ditandai familyId yang sama sehingga tampil sebagai satu pengajuan batch.
  const [transferMode, setTransferMode] = useState<'individu'|'keluarga'>('individu');
  const [selectedFamily, setSelectedFamily] = useState<any|null>(null);
  const [familyQuery, setFamilyQuery] = useState('');
  const familyMembers = selectedFamily ? members.filter(m => m.familyId === selectedFamily.id) : [];

  const filtered = useMemo(() => transfers.filter(t => {
    const matchSearch = t.memberName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || t.status === filterStatus;
    const matchSector = filterSector === 'all' || t.fromSectorId === filterSector || t.toSectorId === filterSector;
    return matchSearch && matchStatus && matchSector;
  }).sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime()), [transfers, search, filterStatus, filterSector]);

  const sectorStats = useMemo(() => sectors.map(sector => ({
    ...sector,
    incoming: transfers.filter(t => t.toSectorId === sector.id && t.status === 'Selesai').length,
    outgoing: transfers.filter(t => t.fromSectorId === sector.id && t.status === 'Selesai').length,
  })), [sectors, transfers]);

  const memberStatusHistory = useMemo(() => members.slice(0, 20).map(m => ({
    ...m,
    lastTransfer: sectorTransfers.find(t => t.memberId === m.id),
    isActive: !m.membershipStatus || m.membershipStatus === 'Aktif',
  })), [members, sectorTransfers]);

  const openAddForm = () => {
    setMemberSearch('');
    setForm({ memberId: '', fromSectorId: '', toSectorId: '', reason: '', notes: '' });
    setTransferMode('individu');
    setSelectedFamily(null);
    setFamilyQuery('');
    setShowForm(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
        </div>
        <Button className="gap-2 bg-[#144f6b] hover:bg-[#0f2d41]" onMouseDown={(e: React.MouseEvent) => e.preventDefault()} onClick={openAddForm}>
          <Plus className="w-4 h-4" />
          Ajukan Perpindahan
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Perpindahan', value: transfers.length, color: 'text-gray-900', bg: 'bg-white border' },
          { label: 'Selesai', value: transfers.filter(t => t.status === 'Selesai').length, color: 'text-[#144f6b]', bg: 'bg-[#f6f4f0]' },
          { label: 'Diproses', value: transfers.filter(t => t.status === 'Diproses').length, color: 'text-[#144f6b]', bg: 'bg-[#f6f4f0]' },
          { label: 'Menunggu', value: transfers.filter(t => t.status === 'Pending').length, color: 'text-[#1A77A3]', bg: 'bg-[#f6f4f0]' },
        ].map((stat, i) => (
          <Card key={i} className={`p-4 ${stat.bg}`}>
            <p className="text-sm text-gray-600">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="history">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="history">Riwayat Transfer</TabsTrigger>
          <TabsTrigger value="sectors">Statistik Sektor</TabsTrigger>
          <TabsTrigger value="status">Status Jemaat</TabsTrigger>
        </TabsList>

        {/* Tab 1: History */}
        <TabsContent value="history" className="space-y-4">
          {/* Filters */}
          <div className="rounded-2xl border bg-white overflow-hidden" style={{borderColor:'#e2e8f0',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
            <div className="flex items-center gap-3 p-3 border-b" style={{borderColor:'#f1f5f9'}}>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nama jemaat..."
                  className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border focus:outline-none transition-all"
                  style={{borderColor:search?'#1A77A3':'#e2e8f0',background:'#fafafa'}}/>
                {search && <button onClick={()=>setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-gray-200 transition-all" style={{color:'#94a3b8'}}><X className="w-3.5 h-3.5"/></button>}
              </div>
            </div>
            <div className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'0.08em',color:'#b0bec5',textTransform:'uppercase',minWidth:'68px'}}>Filter</span>
                {([
                  {val:filterStatus,set:setFilterStatus,opts:[{v:'all',l:'Semua Status'},{v:'Selesai',l:'Selesai'},{v:'Diproses',l:'Diproses'},{v:'Pending',l:'Menunggu'}]},
                  {val:filterSector,set:setFilterSector,opts:[{v:'all',l:'Semua Sektor'},...sectors.map(s=>({v:s.id,l:s.name}))]},
                ] as {val:string;set:(v:string)=>void;opts:{v:string;l:string}[]}[]).map((f,i)=>{
                  const active=f.val!=='all';
                  return <select key={i} value={f.val} onChange={e=>f.set(e.target.value)} className="px-2.5 py-1 text-sm rounded-full border focus:outline-none transition-all cursor-pointer" style={{borderColor:active?'#1A77A3':'#e2e8f0',background:active?'#f0f7fb':'#fafafa',color:active?'#1A77A3':'#64748b',fontWeight:active?600:400}}>{f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>;
                })}
              </div>
            </div>
            {(search||filterStatus!=='all'||filterSector!=='all') ? (
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
                <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,whiteSpace:'nowrap'}}>Filter aktif:</span>
                {search && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}><Search className="w-3 h-3"/>"{search.length>15?search.slice(0,15)+'…':search}"<button onClick={()=>setSearch('')} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
                {filterStatus!=='all' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>{filterStatus}<button onClick={()=>setFilterStatus('all')} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
                {filterSector!=='all' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}><MapPin className="w-3 h-3"/>{sectors.find(s=>s.id===filterSector)?.name||filterSector}<button onClick={()=>setFilterSector('all')} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
                <button onClick={()=>{setSearch('');setFilterStatus('all');setFilterSector('all');}} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all hover:bg-red-50" style={{borderColor:'#fca5a5',color:'#ef4444'}}><X className="w-3 h-3"/>Reset Semua</button>
                <span className="ml-auto text-xs font-semibold" style={{color:'#1A77A3'}}>{filtered.length} ditemukan</span>
              </div>
            ) : (
              <div className="px-3 pb-2 flex justify-end"><span style={{fontSize:'12px',color:'#94a3b8',fontWeight:500}}>{filtered.length} total</span></div>
            )}
          </div>

          {/* Timeline */}
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <Card className="p-12 text-center">
                <ArrowRightLeft className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Tidak ada riwayat perpindahan ditemukan</p>
              </Card>
            ) : (
              filtered.map(transfer => {
                const cfg = STATUS_CONFIG[transfer.status];
                const StatusIcon = cfg.icon;
                return (
                  <Card 
                    key={transfer.id} 
                    className="p-4 hover:bg-[#f2f0ea] transition-all cursor-pointer group"
                    onClick={() => setSelectedTransfer(transfer)}
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-[#f0ede5] flex items-center justify-center flex-shrink-0 group-hover:bg-white transition-colors">
                        <User className="w-5 h-5 text-[#144f6b]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-900 group-hover:text-[#1A77A3] transition-colors">{transfer.memberName}</p>
                          <Badge className={`text-xs ${cfg.color}`}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {cfg.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                          <MapPin className="w-3.5 h-3.5 text-red-400" />
                          <span className="text-red-600 text-xs">{transfer.fromSectorName}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                          <MapPin className="w-3.5 h-3.5 text-[#3a7fa0]" />
                          <span className="text-[#144f6b] text-xs">{transfer.toSectorName}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Alasan: {transfer.reason}</p>
                      </div>
                      <div className="text-right text-xs text-gray-500 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(transfer.requestDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                        {transfer.processedDate && (
                          <p className="text-[#1A77A3] mt-0.5">
                            Selesai: {new Date(transfer.processedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                          </p>
                        )}
                        <Button variant="ghost" size="sm" className="mt-1 h-6 text-xs px-2"
                          onClick={() => setSelectedTransfer(transfer)}>
                          <Eye className="w-3 h-3 mr-1" />
                          Detail
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Sector Stats */}
        <TabsContent value="sectors" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sectorStats.map(sector => (
              <Card key={sector.id} className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{sector.name}</h3>
                    <p className="text-sm text-gray-500">Pimpinan: {sector.leader}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-[#144f6b]">{sector.memberCount}</p>
                    <p className="text-xs text-gray-500">Total Anggota</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#f6f4f0] rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <TrendingUp className="w-4 h-4 text-[#1A77A3]" />
                      <span className="text-xs text-[#144f6b]">Masuk</span>
                    </div>
                    <p className="text-2xl font-bold text-[#144f6b]">{sector.incoming}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <TrendingDown className="w-4 h-4 text-red-600" />
                      <span className="text-xs text-red-700">Keluar</span>
                    </div>
                    <p className="text-2xl font-bold text-red-600">{sector.outgoing}</p>
                  </div>
                </div>
                {/* Net change bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Pertumbuhan Bersih</span>
                    <span className={sector.incoming - sector.outgoing >= 0 ? 'text-[#1A77A3]' : 'text-red-600'}>
                      {sector.incoming - sector.outgoing >= 0 ? '+' : ''}{sector.incoming - sector.outgoing}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${sector.incoming >= sector.outgoing ? 'bg-[#1A77A3]' : 'bg-red-400'}`}
                      style={{ width: `${Math.min(100, (sector.incoming / Math.max(1, sector.incoming + sector.outgoing)) * 100)}%` }}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Member Status */}
        <TabsContent value="status" className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-[#f6f4f0] rounded-lg border border-border-[#b8d5e8]">
            <AlertCircle className="w-4 h-4 text-[#1A77A3] shrink-0" />
            <p className="text-sm text-[#144f6b]">
              Status aktif/tidak aktif diperbarui otomatis berdasarkan kehadiran ibadah dan data keanggotaan.
              Jemaat yang tidak hadir selama 3 bulan berturut-turut akan ditandai sebagai "Perlu Perhatian".
            </p>
          </div>
          <div className="space-y-2">
            {memberStatusHistory.map(member => {
              const sector = sectors.find(s => s.id === member.sectorId);
              return (
                <Card 
                  key={member.id} 
                  className="p-3 hover:bg-[#f2f0ea] transition-all cursor-pointer group"
                  onClick={() => setSelectedMember(member)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#f0ede5] flex items-center justify-center group-hover:bg-white transition-colors">
                      <span className="text-[#144f6b] font-semibold">{member.fullName.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 group-hover:text-[#1A77A3] transition-colors">{member.fullName}</p>
                      <p className="text-xs text-gray-500">{sector?.name || '-'} • {member.membershipType || 'Warga Jemaat'}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Transfer</p>
                      <p className="font-medium text-sm text-gray-700">{member.lastTransfer ? '✓ Pernah' : '—'}</p>
                    </div>
                    <Badge className={
                      member.isActive
                        ? 'bg-[#f0ede5] text-[#144f6b] border-[#a5b4bf]'
                        : 'bg-gray-100 text-gray-600'
                    }>
                      {member.isActive ? '● Aktif' : '○ Tidak Aktif'}
                    </Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) { setMemberSearch(''); setForm({ memberId: '', fromSectorId: '', toSectorId: '', reason: '', notes: '' }); setTransferMode('individu'); setSelectedFamily(null); setFamilyQuery(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajukan Perpindahan Sektor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setTransferMode('individu')} className="py-2 rounded-xl border-2 transition-all text-xs font-semibold flex items-center justify-center gap-2"
                style={{borderColor: transferMode==='individu' ? '#144f6b' : '#e2e8f0', background: transferMode==='individu' ? '#eff6ff' : '#fff', color: transferMode==='individu' ? '#144f6b' : '#64748b'}}>
                <User className="w-3.5 h-3.5"/>Per Anggota
              </button>
              <button type="button" onClick={() => setTransferMode('keluarga')} className="py-2 rounded-xl border-2 transition-all text-xs font-semibold flex items-center justify-center gap-2"
                style={{borderColor: transferMode==='keluarga' ? '#144f6b' : '#e2e8f0', background: transferMode==='keluarga' ? '#eff6ff' : '#fff', color: transferMode==='keluarga' ? '#144f6b' : '#64748b'}}>
                <Users className="w-3.5 h-3.5"/>1 Keluarga
              </button>
            </div>
            {transferMode==='keluarga' ? (
              <div>
                <Label>Cari Keluarga (Kepala Keluarga)</Label>
                <SearchDropdown<any>
                  value={familyQuery}
                  onChange={v => { setFamilyQuery(v); if(!v) setSelectedFamily(null); }}
                  placeholder="Ketik nama kepala keluarga..."
                  items={families || []}
                  filterFn={(fam, q) => (fam.headOfFamily||'').toLowerCase().includes(q.toLowerCase())}
                  renderResult={fam => (
                    <div>
                      <p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{fam.headOfFamily}</p>
                      <p style={{fontSize:'11px',color:'#64748b',margin:0}}>{members.filter(m=>m.familyId===fam.id).length} anggota terdaftar</p>
                    </div>
                  )}
                  onSelect={fam => { setSelectedFamily(fam); setFamilyQuery(fam.headOfFamily||''); }}
                  onClear={() => setSelectedFamily(null)}
                />
                {selectedFamily && (
                  <div className="mt-2 px-3 py-2.5 rounded-xl border" style={{background:'#f0fdf4', borderColor:'#86efac'}}>
                    <p style={{fontSize:12,fontWeight:700,color:'#144f6b'}}>Keluarga {selectedFamily.headOfFamily}</p>
                    {familyMembers.length===0 ? (
                      <p style={{fontSize:11,color:'#dc2626'}} className="mt-1">Belum ada anggota dengan familyId keluarga ini.</p>
                    ) : (
                      <ul className="mt-1 space-y-0.5">
                        {familyMembers.map(m => <li key={m.id} style={{fontSize:11.5,color:'#16a34a'}}>• {m.fullName} ({sectors.find(s=>s.id===m.sectorId)?.name||'-'})</li>)}
                      </ul>
                    )}
                    <p style={{fontSize:10.5,color:'#64748b'}} className="mt-1.5">Mutasi akan diajukan untuk {familyMembers.length} anggota di atas sekaligus, masing-masing dari sektor asalnya sendiri.</p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <Label>Nama Jemaat</Label>
                <SearchDropdown<any>
                  value={memberSearch}
                  onChange={v => { setMemberSearch(v); if(!v) setForm(f=>({...f, memberId:'', fromSectorId:''})); }}
                  placeholder="Cari nama jemaat..."
                  items={members}
                  filterFn={(m, q) => m.fullName.toLowerCase().includes(q.toLowerCase()) || m.memberNumber?.toLowerCase().includes(q.toLowerCase())}
                  renderResult={m => (
                    <div>
                      <p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{m.fullName}</p>
                      <p style={{fontSize:'11px',color:'#64748b',margin:0}}>{sectors.find(s=>s.id===m.sectorId)?.name||'-'} · {m.memberNumber||'-'}</p>
                    </div>
                  )}
                  onSelect={m => {
                    setMemberSearch(m.fullName);
                    setForm(f => ({...f, memberId: m.id, fromSectorId: m.sectorId||''}));
                  }}
                  onClear={() => { setMemberSearch(''); setForm(f=>({...f, memberId:'', fromSectorId:''})); }}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              {transferMode!=='keluarga' && (
              <div>
                <Label>Sektor Asal</Label>
                <Select value={form.fromSectorId} onValueChange={v => setForm(f => ({ ...f, fromSectorId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Dari sektor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {[...sectors].sort((a,b)=>a.name.localeCompare(b.name,'id',{numeric:true})).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              )}
              <div>
                <Label>Sektor Tujuan</Label>
                <Select value={form.toSectorId} onValueChange={v => setForm(f => ({ ...f, toSectorId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Ke sektor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {[...sectors].sort((a,b)=>a.name.localeCompare(b.name,'id',{numeric:true})).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Alasan Perpindahan</Label>
              <Select value={form.reason} onValueChange={v => setForm(f => ({ ...f, reason: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih alasan..." />
                </SelectTrigger>
                <SelectContent>
                  {['Perpindahan domisili', 'Permintaan pribadi', 'Pernikahan', 'Ikut keluarga',
                    'Penyesuaian wilayah sektor', 'Penyeimbangan jumlah anggota sektor'].map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Catatan Tambahan</Label>
              <Input autoFocus placeholder="Catatan (opsional)..." value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Batal</Button>
              <Button className="flex-1 bg-[#144f6b] hover:bg-[#0f2d41]" onClick={() => {
                const toSec = sectors.find(s => s.id === form.toSectorId);
                if (!toSec || !form.reason) return;
                if (transferMode === 'keluarga') {
                  if (!selectedFamily || familyMembers.length === 0) return;
                  const familyId = 'fam-st-' + Date.now();
                  const rows = familyMembers.map(m => {
                    const fromSec = sectors.find(s => s.id === m.sectorId);
                    return {
                      memberId: m.id,
                      memberName: m.fullName,
                      fromSectorId: fromSec?.id || '',
                      fromSectorName: fromSec?.name || '-',
                      toSectorId: toSec.id,
                      toSectorName: toSec.name,
                      reason: form.reason,
                      requestDate: new Date().toISOString().split('T')[0],
                      status: 'Pending' as const,
                      notes: form.notes || '',
                      processedBy: null,
                      processedDate: null,
                      familyId,
                    };
                  });
                  addSectorTransferBatch(rows);
                } else {
                  if (!form.memberId || !form.fromSectorId) return;
                  const member = members.find(m => m.id === form.memberId);
                  const fromSec = sectors.find(s => s.id === form.fromSectorId);
                  if (!member || !fromSec) return;
                  addSectorTransfer({
                    memberId: member.id,
                    memberName: member.fullName,
                    fromSectorId: fromSec.id,
                    fromSectorName: fromSec.name,
                    toSectorId: toSec.id,
                    toSectorName: toSec.name,
                    reason: form.reason,
                    requestDate: new Date().toISOString().split('T')[0],
                    status: 'Pending',
                    notes: form.notes || '',
                    processedBy: null,
                    processedDate: null,
                  });
                }
                setShowForm(false);
                setMemberSearch('');
                setForm({ memberId: '', fromSectorId: '', toSectorId: '', reason: '', notes: '' });
                setTransferMode('individu');
                setSelectedFamily(null);
                setFamilyQuery('');
              }}>
                {transferMode==='keluarga' ? `Ajukan untuk ${familyMembers.length || 0} Anggota` : 'Ajukan Perpindahan'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!selectedTransfer} onOpenChange={() => setSelectedTransfer(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detail Perpindahan Sektor</DialogTitle>
          </DialogHeader>
          {selectedTransfer && (
            <div className="space-y-4 py-2">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                {[
                  { label: 'Nama Jemaat', value: selectedTransfer.memberName },
                  { label: 'Dari Sektor', value: selectedTransfer.fromSectorName },
                  { label: 'Ke Sektor', value: selectedTransfer.toSectorName },
                  { label: 'Alasan', value: selectedTransfer.reason },
                  { label: 'Tanggal Permohonan', value: new Date(selectedTransfer.requestDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) },
                  { label: 'Status', value: selectedTransfer.status },
                  { label: 'Diproses Oleh', value: selectedTransfer.processedBy || '-' },
                  { label: 'Tanggal Selesai', value: selectedTransfer.processedDate ? new Date(selectedTransfer.processedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-' },
                  { label: 'Catatan', value: selectedTransfer.notes || '-' },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-500">{item.label}</span>
                    <span className="text-gray-900 font-medium text-right max-w-[200px]">{item.value}</span>
                  </div>
                ))}
              </div>
              {can('attestations', 'edit') && selectedTransfer.status !== 'Selesai' && (
                <div className="flex gap-2 pt-2 border-t">
                  {selectedTransfer.status === 'Pending' && (
                    <Button variant="outline" className="flex-1 text-[#1A77A3] border-[#b8d5e8] hover:bg-[#f0f7fb]" onClick={() => {
                      updateSectorTransfer(selectedTransfer.id, { status: 'Diproses', processedBy: currentUser?.name || 'Admin' });
                      setSelectedTransfer(null);
                    }}>
                      <Loader2 className="w-3.5 h-3.5 mr-1" />Tandai Diproses
                    </Button>
                  )}
                  <Button className="flex-1 bg-[#144f6b] hover:bg-[#0f2d41]" onClick={() => {
                    updateSectorTransfer(selectedTransfer.id, { status: 'Selesai', processedDate: new Date().toISOString().split('T')[0], processedBy: currentUser?.name || 'Admin' });
                    updateMember(selectedTransfer.memberId, { sectorId: selectedTransfer.toSectorId });
                    setSelectedTransfer(null);
                  }}>
                    <CheckCheck className="w-3.5 h-3.5 mr-1" />Selesaikan & Pindahkan
                  </Button>
                </div>
              )}
              {can('attestations', 'delete') && (
                <Button variant="outline" className="w-full text-red-500 border-red-200 hover:bg-red-50" onClick={() => { setDeleteTarget(selectedTransfer); setSelectedTransfer(null); }}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" />Hapus Permohonan
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={()=>setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{background:'#fef2f2', cursor:'move'}} onMouseDown={onMouseDown}><Trash2 className="w-6 h-6 text-red-500"/></div>
            <h3 style={{fontSize:'16px',fontWeight:700,color:'#0f172a',marginBottom:8}}>Hapus Permohonan?</h3>
            <p style={{fontSize:'13px',color:'#64748b',marginBottom:24}}>Permohonan perpindahan sektor <strong>{deleteTarget.memberName}</strong> akan dihapus permanen.</p>
            <div className="flex gap-3">
              <button onClick={()=>setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl border font-medium text-gray-600 hover:bg-gray-50 text-sm" style={{borderColor:'#e2e8f0'}}>Batal</button>
              <button onClick={()=>{deleteSectorTransfer(deleteTarget.id);setDeleteTarget(null);}} className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm hover:opacity-90" style={{background:'#ef4444'}}>Hapus</button>
            </div>
          </div>
        </div>
      )}

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
