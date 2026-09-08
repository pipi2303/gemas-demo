import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { toast } from 'sonner';
import { Ministry, MinistrySchedule } from '../types';
import { useDraggable } from '../../lib/useDraggable';
import { SearchDropdown } from './ui/SearchDropdown';
import {
  Heart, Users, Plus, Pencil, Trash2, Eye, X, Search,
  ChevronRight, CheckCircle, UserCheck, Star, Award,
  Filter, LayoutGrid, List, UserPlus,
  Music, BookOpen, HandHeart, Laptop, UsersRound,
  Coffee, Church, Zap, Calendar, Clock
} from 'lucide-react';

// ─── Kategori Pelayanan ───────────────────────────────────────────────────────
type MinistryCategory = 'Pujian & Musik' | 'Pengajaran' | 'Pemuda' | 'Diakonia' | 'Teknologi' | 'Kaum Bapak' | 'Kaum Ibu' | 'Lansia' | 'Protokol' | 'Lainnya';

const CATEGORY_CONFIG: Record<MinistryCategory, { color: string; bg: string; text: string; icon: any; border: string }> = {
  'Pujian & Musik': { color: 'bg-pink-500',    bg: 'bg-pink-50',    text: 'text-pink-700',    icon: Music,      border: 'border-pink-200' },
  'Pengajaran':     { color: 'bg-blue-500',  bg: 'bg-blue-50',    text: 'text-blue-700',    icon: BookOpen,   border: 'border-blue-200' },
  'Pemuda':         { color: 'bg-purple-500',bg: 'bg-purple-50',  text: 'text-purple-700',  icon: Zap,        border: 'border-purple-200' },
  'Diakonia':       { color: 'bg-[#1A77A3]',bg: 'bg-[#f0f7fb]', text: 'text-[#144f6b]', icon: HandHeart,  border: 'border-[#b8d5e8]' },
  'Teknologi':      { color: 'bg-[#1A77A3]',    bg: 'bg-[#f0f7fb]',    text: 'text-cyan-700',    icon: Laptop,     border: 'border-cyan-200' },
  'Kaum Bapak':     { color: 'bg-[#f6f4f0]0', bg: 'bg-[#f6f4f0]',   text: 'text-[#1A77A3]',   icon: UsersRound, border: 'border-[#e8e4d8]' },
  'Kaum Ibu':       { color: 'bg-fuchsia-500', bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: Heart,      border: 'border-fuchsia-200' },
  'Lansia':         { color: 'bg-[#1A77A3]',    bg: 'bg-[#f0f7fb]',    text: 'text-[#144f6b]',    icon: Coffee,     border: 'border-teal-200' },
  'Protokol':       { color: 'bg-slate-500',   bg: 'bg-slate-50',   text: 'text-slate-700',   icon: Award,      border: 'border-slate-200' },
  'Lainnya':        { color: 'bg-gray-500',   bg: 'bg-gray-50',    text: 'text-gray-700',    icon: Church,     border: 'border-gray-200' },
};

const CATEGORIES = Object.keys(CATEGORY_CONFIG) as MinistryCategory[];

// Deteksi kategori berdasarkan nama komisi
function detectCategory(name: string): MinistryCategory {
  const n = name.toLowerCase();
  if (n.includes('pujian') || n.includes('musik') || n.includes('paduan suara')) return 'Pujian & Musik';
  if (n.includes('sekolah') || n.includes('pengajaran') || n.includes('pembinaaan')) return 'Pengajaran';
  if (n.includes('pemuda') || n.includes('remaja')) return 'Pemuda';
  if (n.includes('diakonia') || n.includes('kasih')) return 'Diakonia';
  if (n.includes('multimedia') || n.includes('teknologi') || n.includes('it') || n.includes('media')) return 'Teknologi';
  if (n.includes('bapak') || n.includes('pkb')) return 'Kaum Bapak';
  if (n.includes('ibu') || n.includes('wanita') || n.includes('pki') || n.includes('pw') || n.includes('pkp')) return 'Kaum Ibu';
  if (n.includes('lansia') || n.includes('pklu')) return 'Lansia';
  if (n.includes('tamu') || n.includes('protokol') || n.includes('kebersihan') || n.includes('dekorasi')) return 'Protokol';
  return 'Lainnya';
}

const EMPTY_FORM = { name: '', description: '', leader: '', leaderMemberId: '', memberIds: [] as string[], isActive: true };

const SERVICE_TYPES = [
  'Ibadah Minggu Pagi', 'Ibadah Minggu Sore', 'Ibadah Hari Rabu',
  'Ibadah PKP / PKB / PKL', 'Ibadah Pemuda & Remaja', 'Kegiatan Khusus',
  'Persekutuan Doa', 'Pelatihan / Pembinaan', 'Rapat Komisi', 'Lainnya',
];

// ─── Komponen ─────────────────────────────────────────────────────────────────
export function MinistryManagement() {
  const { ministries, members, addMinistry, updateMinistry, deleteMinistry, ministrySchedules, addMinistrySchedule, updateMinistrySchedule, deleteMinistrySchedule, currentUser, can, getMasterDataByCategory } = useApp();
  const jenisJadwalList = getMasterDataByCategory('jenis_jadwal_ibadah').map((m: any) => m.value);
  const SERVICE_TYPES_MD = jenisJadwalList.length ? jenisJadwalList : SERVICE_TYPES;
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [selectedMinistry, setSelectedMinistry] = useState<Ministry | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Ministry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<MinistryCategory | 'all'>('all');
  const [filterActive, setFilterActive] = useState<'all' | 'aktif' | 'nonaktif'>('all');
  const [memberSearch, setMemberSearch] = useState('');
  const [showMemberSelector, setShowMemberSelector] = useState(false);

  // ── Jadwal state ───────────────────────────────────────────────────────────
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleDeleteTarget, setScheduleDeleteTarget] = useState<MinistrySchedule | null>(null);
  const [scheduleMinistryId, setScheduleMinistryId] = useState('');
  const [scheduleForm, setScheduleForm] = useState<{ date: string; serviceType: string; notes: string; assignedMembers: { memberId: string; role: string }[] }>({
    date: '', serviceType: '', notes: '', assignedMembers: [],
  });
  const [scheduleMemberSearch, setScheduleMemberSearch] = useState('');


  const canCreate = can('ministries', 'create');
  const canEdit   = can('ministries', 'edit');
  const canDelete = can('ministries', 'delete');

  const { offset: offsetDetail, onMouseDown: onMouseDownDetail } = useDraggable();
  const { offset: offsetForm, onMouseDown: onMouseDownForm } = useDraggable();
  const { offset: offsetDeleteMinistry, onMouseDown: onMouseDownDeleteMinistry } = useDraggable();
  const { offset: offsetScheduleForm, onMouseDown: onMouseDownScheduleForm } = useDraggable();
  const { offset: offsetScheduleDelete, onMouseDown: onMouseDownScheduleDelete } = useDraggable();

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const aktif = ministries.filter(m => m.isActive);
    const totalMembers = ministries.reduce((s, m) => s + m.memberIds.length, 0);
    const byCategory = CATEGORIES.reduce((acc, c) => {
      acc[c] = ministries.filter(m => detectCategory(m.name) === c).length;
      return acc;
    }, {} as Record<string, number>);
    return { total: ministries.length, aktif: aktif.length, nonaktif: ministries.length - aktif.length, totalMembers, byCategory };
  }, [ministries]);

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filteredMinistries = useMemo(() => {
    return [...ministries].filter(m => {
      const matchSearch = !searchTerm || m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.leader.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCategory = filterCategory === 'all' || detectCategory(m.name) === filterCategory;
      const matchActive = filterActive === 'all' || (filterActive === 'aktif' ? m.isActive : !m.isActive);
      return matchSearch && matchCategory && matchActive;
    }).sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [ministries, searchTerm, filterCategory, filterActive]);

  // ── Member helpers ─────────────────────────────────────────────────────────
  const getMemberName = (id: string) => {
    const m = members.find(x => x.id === id);
    return m ? (m.fullName || `${m.firstName || ''} ${m.lastName || ''}`.trim()) : id;
  };

  const getMembersBySearch = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const q = memberSearch.toLowerCase();
    return members.filter(m => {
      const name = m.fullName || `${m.firstName || ''} ${m.lastName || ''}`.trim();
      return name.toLowerCase().includes(q) || m.memberNumber?.toLowerCase().includes(q);
    });
  }, [members, memberSearch]);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null);
    setFormData({ ...EMPTY_FORM, memberIds: [] });
    setMemberSearch('');
    setShowForm(true);
  };

  const openEdit = (m: Ministry) => {
    setEditingId(m.id);
    setFormData({ name: m.name, description: m.description, leader: m.leader, leaderMemberId: m.leaderMemberId, memberIds: [...m.memberIds], isActive: m.isActive });
    setMemberSearch('');
    setShowDetail(false);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { toast.error('Nama komisi wajib diisi'); return; }
    if (editingId) {
      updateMinistry(editingId, formData);
      if (selectedMinistry?.id === editingId) setSelectedMinistry({ ...selectedMinistry, ...formData });
    } else {
      addMinistry(formData);
    }
    setShowForm(false);
    setEditingId(null);
  };

  const handleDelete = (m: Ministry) => {
    deleteMinistry(m.id);
    setShowDeleteConfirm(null);
    if (selectedMinistry?.id === m.id) { setShowDetail(false); setSelectedMinistry(null); }
  };

  const toggleMember = (id: string) => {
    setFormData(p => ({
      ...p,
      memberIds: p.memberIds.includes(id) ? p.memberIds.filter(x => x !== id) : [...p.memberIds, id]
    }));
  };

  const openDetail = (m: Ministry) => { setSelectedMinistry(m); setShowDetail(true); };

  // ── Jadwal handlers ────────────────────────────────────────────────────────
  const openAddSchedule = (ministryId: string) => {
    setScheduleMinistryId(ministryId);
    setEditingScheduleId(null);
    setScheduleForm({ date: new Date().toISOString().split('T')[0], serviceType: '', notes: '', assignedMembers: [] });
    setScheduleMemberSearch('');
    setShowScheduleForm(true);
  };

  const openEditSchedule = (sch: MinistrySchedule) => {
    setScheduleMinistryId(sch.ministryId);
    setEditingScheduleId(sch.id);
    setScheduleForm({ date: sch.date, serviceType: sch.serviceType, notes: sch.notes || '', assignedMembers: [...sch.assignedMembers] });
    setScheduleMemberSearch('');
    setShowScheduleForm(true);
  };

  const handleSaveSchedule = () => {
    if (!scheduleForm.date || !scheduleForm.serviceType) return;
    if (editingScheduleId) {
      updateMinistrySchedule(editingScheduleId, scheduleForm);
    } else {
      addMinistrySchedule({ ...scheduleForm, ministryId: scheduleMinistryId });
    }
    setShowScheduleForm(false);
  };

  const toggleScheduleMember = (memberId: string) => {
    setScheduleForm(prev => {
      const exists = prev.assignedMembers.find(m => m.memberId === memberId);
      return {
        ...prev,
        assignedMembers: exists
          ? prev.assignedMembers.filter(m => m.memberId !== memberId)
          : [...prev.assignedMembers, { memberId, role: '' }],
      };
    });
  };

  const updateScheduleMemberRole = (memberId: string, role: string) => {
    setScheduleForm(prev => ({
      ...prev,
      assignedMembers: prev.assignedMembers.map(m => m.memberId === memberId ? { ...m, role } : m),
    }));
  };

  // ── Color palette for index-based ─────────────────────────────────────────
  const PALETTES = [
    'bg-blue-500',
    'bg-[#1A77A3]',
    'bg-purple-500',
    'bg-[#f6f4f0]0',
    'bg-[#f6f4f0]0',
    'bg-[#1A77A3]',
    'bg-fuchsia-500',
    'from-lime-500 to-[#144f6b]',
    'bg-slate-500',
    'bg-red-500',
  ];

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-6 space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#1A77A3] rounded-xl flex items-center justify-center shadow">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Unit Pelayanan</h1>
            <p className="text-sm text-gray-500">Komisi & unit pelayanan aktif GPIB Trinitas</p>
          </div>
        </div>
        {canCreate && (
          <button onMouseDown={e=>e.preventDefault()} onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-[#1A77A3] text-white rounded-lg hover:bg-[#144f6b] transition-colors text-sm">
            <Plus className="w-4 h-4" /> Tambah Komisi
          </button>
        )}
      </div>

      {/* ── Stats Row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Komisi', value: stats.total, icon: Church, color: 'text-[#1A77A3]', bg: 'bg-[#f6f4f0]' },
          { label: 'Aktif', value: stats.aktif, icon: CheckCircle, color: 'text-[#1A77A3]', bg: 'bg-[#f0f7fb]' },
          { label: 'Tidak Aktif', value: stats.nonaktif, icon: X, color: 'text-gray-500', bg: 'bg-gray-100' },
          { label: 'Total Anggota', value: stats.totalMembers, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 ${s.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Category Overview ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Komisi per Kategori</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.filter(c => stats.byCategory[c] > 0).map(c => {
            const cfg = CATEGORY_CONFIG[c];
            const Icon = cfg.icon;
            return (
              <button key={c} onClick={() => setFilterCategory(filterCategory === c ? 'all' : c)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  filterCategory === c ? `${cfg.color} text-white border-transparent` : `${cfg.bg} ${cfg.text} ${cfg.border} hover:opacity-80`
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {c}
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  filterCategory === c ? 'bg-white/25 text-white' : 'bg-white/60'
                }`}>{stats.byCategory[c]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {([['grid', LayoutGrid], ['list', List]] as const).map(([mode, Icon]) => (
            <button key={mode} onClick={() => setViewMode(mode as any)}
              className={`p-2 transition-colors ${viewMode === mode ? 'bg-[#1A77A3] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <SearchDropdown<any>
          value={searchTerm}
          onChange={v => setSearchTerm(v)}
          placeholder="Cari nama komisi, ketua..."
          items={ministries}
          filterFn={(m, q) => {
            const lq = q.toLowerCase();
            return m.name.toLowerCase().includes(lq) || m.leader?.toLowerCase().includes(lq);
          }}
          renderResult={m => (
            <div>
              <p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{m.name}</p>
              <p style={{fontSize:'11px',color:'#64748b',margin:0}}>{m.leader||'-'}</p>
            </div>
          )}
          onSelect={m => setSearchTerm(m.name)}
        />
        <div className="flex gap-1.5">
          {([['all','Semua'],['aktif','Aktif'],['nonaktif','Nonaktif']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilterActive(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterActive === v ? 'bg-[#1A77A3] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>{l}</button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{filteredMinistries.length} komisi</span>
      </div>

      {/* ── GRID VIEW ───────────────────────────────────────────────────── */}
      {viewMode === 'grid' && (
        filteredMinistries.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
            <Heart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Belum ada komisi pelayanan</p>
            {canCreate && (
              <button onMouseDown={e=>e.preventDefault()} onClick={openAdd} className="mt-4 px-4 py-2 bg-[#f0ede5] text-[#1A77A3] rounded-lg text-sm hover:bg-[#e8e4d8] transition-colors">
                + Tambah Komisi
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredMinistries.map((ministry, idx) => {
              const category = detectCategory(ministry.name);
              const cfg = CATEGORY_CONFIG[category];
              const Icon = cfg.icon;
              const palette = PALETTES[idx % PALETTES.length];
              return (
                <div key={ministry.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-all cursor-pointer group" onClick={() => openDetail(ministry)}>
                  {/* Header */}
                  <div className={`${palette} p-5 text-white`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                        ministry.isActive ? 'bg-white/25 text-white' : 'bg-black/25 text-white/70'
                      }`}>
                        {ministry.isActive ? '● Aktif' : '○ Nonaktif'}
                      </span>
                    </div>
                    <h3 className="font-bold text-base leading-tight">{ministry.name}</h3>
                    <p className="text-white/70 text-xs mt-0.5">{category}</p>
                  </div>

                  {/* Body */}
                  <div className="p-4">
                    <p className="text-xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">{ministry.description}</p>

                    {/* Leader */}
                    <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-gray-50">
                      <div className={`w-8 h-8 rounded-full ${palette} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                        {ministry.leader.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Ketua</p>
                        <p className="text-sm font-semibold text-gray-800 leading-tight">{ministry.leader}</p>
                      </div>
                    </div>

                    {/* Member avatars */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex -space-x-1.5">
                        {ministry.memberIds.slice(0, 5).map((id, i) => (
                          <div key={id} className={`w-7 h-7 rounded-full ${PALETTES[i % PALETTES.length]} flex items-center justify-center text-white text-[10px] font-bold border-2 border-white`}
                            title={getMemberName(id)}>
                            {getMemberName(id).charAt(0)}
                          </div>
                        ))}
                        {ministry.memberIds.length > 5 && (
                          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-[9px] font-bold border-2 border-white">
                            +{ministry.memberIds.length - 5}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 ml-1">{ministry.memberIds.length} anggota</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-3 border-t border-gray-100">
                      <button onClick={() => openDetail(ministry)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#1A77A3] text-white rounded-lg text-xs hover:bg-[#144f6b] transition-colors">
                        <Eye className="w-3.5 h-3.5" /> Lihat Detail
                      </button>
                      {canEdit && (
                        <button onMouseDown={e=>e.preventDefault()} onClick={() => openEdit(ministry)}
                          data-tooltip="Edit"
                          className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-[#f2f0ea] transition-colors cursor-pointer group">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setShowDeleteConfirm(ministry)}
                          data-tooltip="Hapus"
                          className="px-3 py-1.5 border border-red-200 text-red-500 rounded-lg text-xs hover:bg-red-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── LIST VIEW ────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {filteredMinistries.length === 0 ? (
            <div className="py-16 text-center">
              <Heart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Tidak ada komisi ditemukan</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredMinistries.map((ministry, idx) => {
                const category = detectCategory(ministry.name);
                const cfg = CATEGORY_CONFIG[category];
                const Icon = cfg.icon;
                const palette = PALETTES[idx % PALETTES.length];
                return (
                  <div key={ministry.id} className="flex items-center gap-4 px-5 py-4 hover:bg-[#f2f0ea] transition-colors cursor-pointer group cursor-pointer" onClick={() => openDetail(ministry)}>
                    <div className={`w-12 h-12 ${palette} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p data-tooltip={ministry.name} data-tooltip-truncate className="font-semibold text-gray-900 text-sm truncate">{ministry.name}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text} border ${cfg.border}`}>{category}</span>
                        {!ministry.isActive && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Nonaktif</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><UserCheck className="w-3 h-3" />Ketua: {ministry.leader}</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{ministry.memberIds.length} anggota</span>
                      </div>
                    </div>
                    {(canEdit || canDelete) && (
                      <div className="flex gap-1.5">
                        {canEdit && (
                          <button onMouseDown={e=>e.preventDefault()} onClick={e => { e.stopPropagation(); openEdit(ministry); }}
                            data-tooltip="Edit"
                            className="p-2 border border-gray-200 text-gray-500 rounded-lg hover:bg-[#f2f0ea] transition-colors cursor-pointer group">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={e => { e.stopPropagation(); setShowDeleteConfirm(ministry); }}
                            data-tooltip="Hapus"
                            className="p-2 border border-red-200 text-red-400 rounded-lg hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* DETAIL MODAL */}
      {showDetail && selectedMinistry && (() => {
        const ministry = selectedMinistry;
        const category = detectCategory(ministry.name);
        const cfg = CATEGORY_CONFIG[category];
        const Icon = cfg.icon;
        const ministryIdx = ministries.findIndex(m => m.id === ministry.id);
        const palette = PALETTES[ministryIdx % PALETTES.length];
        const ministryMembers = ministry.memberIds.map(id => members.find(m => m.id === id)).filter(Boolean) as any[];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>{setShowDetail(false);setSelectedMinistry(null);}}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetDetail.x}px, ${offsetDetail.y}px)` }}>
              {/* Header */}
              <div className={`${palette} px-6 py-5 flex-shrink-0`} onMouseDown={onMouseDownDetail} style={{ cursor: 'move' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <button onMouseDown={e=>e.preventDefault()} onClick={() => openEdit(ministry)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 text-white rounded-lg text-sm hover:bg-white/30 transition-colors">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                    )}

                    <button onClick={() => setShowDetail(false)} data-tooltip="Tutup" className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xl font-bold text-white">{ministry.name}</h2>
                  {!ministry.isActive && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/25 text-white/70">Nonaktif</span>}
                </div>
                <p className="text-white/70 text-sm">{category}</p>
              </div>

              {/* Body */}
              <div className="overflow-y-auto flex-1 p-5 space-y-5">
                {/* Description */}
                <div className={`p-4 rounded-xl ${cfg.bg} border ${cfg.border}`}>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Deskripsi</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{ministry.description || 'Belum ada deskripsi'}</p>
                </div>

                {/* Leader */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Pimpinan</p>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className={`w-10 h-10 rounded-full ${palette} flex items-center justify-center text-white font-bold`}>
                      {ministry.leader.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{ministry.leader}</p>
                      <p className="text-xs text-gray-400">Ketua Komisi</p>
                    </div>
                    <Award className={`w-5 h-5 ml-auto ${cfg.text}`} />
                  </div>
                </div>

                {/* Members */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Anggota Tim ({ministry.memberIds.length})</p>
                  </div>
                  {ministryMembers.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Belum ada anggota terdaftar</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {ministryMembers.map((m, i) => {
                        const name = m.fullName || `${m.firstName || ''} ${m.lastName || ''}`.trim();
                        const isLeader = m.id === ministry.leaderMemberId;
                        return (
                          <div key={m.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                            <div className={`w-7 h-7 rounded-full ${PALETTES[i % PALETTES.length]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                              {name.charAt(0)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p data-tooltip={name} data-tooltip-truncate className="text-xs font-medium text-gray-800 truncate">{name}</p>
                              {isLeader && <p className="text-[10px] text-[#1A77A3] font-semibold">Ketua</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-3 rounded-xl text-center ${cfg.bg} border ${cfg.border}`}>
                    <p className="text-2xl font-bold" style={{ color: 'currentColor' }}>{ministry.memberIds.length}</p>
                    <p className={`text-xs font-medium mt-0.5 ${cfg.text}`}>Total Anggota</p>
                  </div>
                  <div className={`p-3 rounded-xl text-center ${ministry.isActive ? 'bg-[#f0f7fb] border border-[#b8d5e8]' : 'bg-gray-100 border border-gray-200'}`}>
                    <CheckCircle className={`w-7 h-7 mx-auto mb-0.5 ${ministry.isActive ? 'text-[#1A77A3]' : 'text-gray-400'}`} />
                    <p className={`text-xs font-semibold ${ministry.isActive ? 'text-[#144f6b]' : 'text-gray-500'}`}>
                      {ministry.isActive ? 'Aktif Melayani' : 'Nonaktif'}
                    </p>
                  </div>
                </div>

                {/* Jadwal Pelayanan */}
                {(() => {
                  const schedules = (ministrySchedules || [])
                    .filter(s => s.ministryId === ministry.id)
                    .sort((a, b) => b.date.localeCompare(a.date));
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Jadwal Pelayanan ({schedules.length})</p>
                        {canCreate && (
                          <button onMouseDown={e=>e.preventDefault()} onClick={() => openAddSchedule(ministry.id)}
                            className="flex items-center gap-1 text-xs text-[#1A77A3] hover:text-[#144f6b] font-medium transition-colors">
                            <Plus className="w-3.5 h-3.5" />Tambah
                          </button>
                        )}
                      </div>
                      {schedules.length === 0 ? (
                        <div className="text-center py-4 rounded-xl bg-gray-50 border border-gray-100">
                          <Calendar className="w-7 h-7 text-gray-300 mx-auto mb-1" />
                          <p className="text-xs text-gray-400">Belum ada jadwal pelayanan</p>
                          {canCreate && (
                            <button onMouseDown={e=>e.preventDefault()} onClick={() => openAddSchedule(ministry.id)} className="mt-2 text-xs text-[#1A77A3] hover:underline">+ Tambah sekarang</button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {schedules.slice(0, 5).map(sch => (
                            <div key={sch.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-50 border border-gray-100 hover:border-[#b8d5e8] transition-colors">
                              <div className="w-8 h-8 rounded-lg bg-[#f0f7fb] flex items-center justify-center flex-shrink-0">
                                <Calendar className="w-4 h-4 text-[#1A77A3]" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-800">
                                  {new Date(sch.date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                                <p className="text-[10px] text-gray-500">{sch.serviceType} · {sch.assignedMembers.length} ditugaskan</p>
                                {sch.notes && <p className="text-[10px] text-gray-400 italic truncate">{sch.notes}</p>}
                              </div>
                              {(canEdit || canDelete) && (
                                <div className="flex gap-1 flex-shrink-0">
                                  {canEdit && (
                                    <button onMouseDown={e=>e.preventDefault()} onClick={() => openEditSchedule(sch)} data-tooltip="Edit jadwal"
                                      className="p-1.5 rounded-lg hover:bg-white hover:shadow-sm transition-all text-gray-400 hover:text-[#1A77A3]">
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  )}
                                  {canDelete && (
                                    <button onClick={() => setScheduleDeleteTarget(sch)} data-tooltip="Hapus jadwal"
                                      className="p-1.5 rounded-lg hover:bg-red-50 transition-all text-gray-400 hover:text-red-500">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                          {schedules.length > 5 && (
                            <p className="text-center text-xs text-gray-400 py-1">+{schedules.length - 5} jadwal lainnya</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* FORM MODAL */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetForm.x}px, ${offsetForm.y}px)` }}>
            <div className="px-6 py-5 flex items-center justify-between flex-shrink-0" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDownForm}>
              <div>
                <h2 className="text-xl font-bold text-white">{editingId ? 'Edit Komisi' : 'Tambah Komisi Baru'}</h2>
                <p className="text-[#f0ede5] text-sm mt-0.5">Unit Pelayanan GPIB Trinitas</p>
              </div>
              <button onClick={() => setShowForm(false)} data-tooltip="Tutup" className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nama Komisi / Unit Pelayanan *</label>
                  <input autoFocus type="text" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} required
                    placeholder="Misal: Pujian & Penyembahan"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" />
                  {formData.name && (
                    <p className="text-xs text-gray-400 mt-1">
                      Kategori terdeteksi: <span className="font-medium text-[#1A77A3]">{detectCategory(formData.name)}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Deskripsi</label>
                  <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                    rows={3} placeholder="Deskripsi kegiatan dan tujuan komisi..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3] resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nama Ketua *</label>
                    <input type="text" value={formData.leader} onChange={e => setFormData(p => ({ ...p, leader: e.target.value }))} required
                      placeholder="Nama ketua komisi"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                    <select value={formData.isActive ? 'aktif' : 'nonaktif'}
                      onChange={e => setFormData(p => ({ ...p, isActive: e.target.value === 'aktif' }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]">
                      <option value="aktif">● Aktif</option>
                      <option value="nonaktif">○ Nonaktif</option>
                    </select>
                  </div>
                </div>

                {/* Member Selector */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-700">Anggota Tim ({formData.memberIds.length} dipilih)</label>
                    <button type="button" onClick={() => setShowMemberSelector(!showMemberSelector)}
                      className="flex items-center gap-1 text-xs text-[#1A77A3] hover:text-[#1A77A3] font-medium">
                      <UserPlus className="w-3.5 h-3.5" />
                      {showMemberSelector ? 'Tutup' : 'Pilih Anggota'}
                    </button>
                  </div>

                  {/* Selected members */}
                  {formData.memberIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {formData.memberIds.map(id => (
                        <span key={id} className="flex items-center gap-1 px-2 py-1 bg-[#f0ede5] text-[#1A77A3] rounded-full text-xs font-medium">
                          {getMemberName(id)}
                          <button type="button" onClick={() => toggleMember(id)} className="hover:text-rose-900">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Member picker */}
                  {showMemberSelector && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          <input type="text" placeholder="Cari anggota jemaat..." value={memberSearch}
                            onChange={e => setMemberSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" />
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {getMembersBySearch.map(m => {
                          const name = m.fullName || `${m.firstName || ''} ${m.lastName || ''}`.trim();
                          const selected = formData.memberIds.includes(m.id);
                          return (
                            <button key={m.id} type="button" onClick={() => toggleMember(m.id)}
                              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[#f2f0ea] transition-colors cursor-pointer group ${selected ? 'bg-[#f6f4f0]' : ''}`}>
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${selected ? 'bg-[#1A77A3] text-white' : 'bg-gray-200 text-gray-600'}`}>
                                {name.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p data-tooltip={name} data-tooltip-truncate className="text-sm font-medium text-gray-800 truncate">{name}</p>
                                <p className="text-xs text-gray-400">{m.membershipType || 'Warga Jemaat'}</p>
                              </div>
                              {selected && <CheckCircle className="w-4 h-4 text-[#1A77A3] flex-shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex gap-3 justify-end flex-shrink-0">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-100 transition-colors">Batal</button>
                <button type="submit"
                  className="flex items-center gap-2 px-5 py-2 bg-[#1A77A3] text-white rounded-lg text-sm hover:bg-[#144f6b] transition-colors">
                  <CheckCircle className="w-4 h-4" />{editingId ? 'Simpan Perubahan' : 'Tambah Komisi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setShowDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetDeleteMinistry.x}px, ${offsetDeleteMinistry.y}px)` }}>
            <div className="flex items-center gap-4 mb-4" onMouseDown={onMouseDownDeleteMinistry} style={{ cursor: 'move' }}>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div><h3 className="font-bold text-gray-900">Hapus Komisi</h3><p className="text-sm text-gray-500">Tindakan tidak dapat dibatalkan</p></div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5">
              <p className="text-sm font-medium text-gray-800">{showDeleteConfirm.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">Ketua: {showDeleteConfirm.leader} · {showDeleteConfirm.memberIds.length} anggota</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-[#f2f0ea] transition-colors cursor-pointer group">Batal</button>
              <button onClick={() => handleDelete(showDeleteConfirm)} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors">Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SCHEDULE FORM MODAL */}
      {showScheduleForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={() => setShowScheduleForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()} style={{ transform: `translate(${offsetScheduleForm.x}px, ${offsetScheduleForm.y}px)` }}>
            <div className="px-6 py-5 flex items-center justify-between flex-shrink-0" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDownScheduleForm}>
              <div>
                <h2 className="text-xl font-bold text-white">{editingScheduleId ? 'Edit Jadwal' : 'Tambah Jadwal Pelayanan'}</h2>
                <p className="text-[#f0ede5] text-sm mt-0.5">
                  {ministries.find(m => m.id === scheduleMinistryId)?.name ?? ''}
                </p>
              </div>
              <button onClick={() => setShowScheduleForm(false)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {/* Tanggal */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal *</label>
                <input
                  type="date"
                  value={scheduleForm.date}
                  onChange={e => setScheduleForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]"
                />
              </div>

              {/* Jenis Ibadah */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Jenis Ibadah / Kegiatan *</label>
                <select autoFocus
                  value={scheduleForm.serviceType}
                  onChange={e => setScheduleForm(p => ({ ...p, serviceType: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]"
                >
                  <option value="">-- Pilih jenis --</option>
                  {SERVICE_TYPES_MD.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Penugasan Anggota */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-700">
                    Anggota Bertugas ({scheduleForm.assignedMembers.length} dipilih)
                  </label>
                </div>

                {/* Search picker */}
                <div className="border border-gray-200 rounded-xl overflow-hidden mb-2">
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Cari anggota..."
                        value={scheduleMemberSearch}
                        onChange={e => setScheduleMemberSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A77A3]"
                      />
                    </div>
                  </div>
                  <div className="max-h-36 overflow-y-auto">
                    {(() => {
                      const pool = scheduleMinistryId
                        ? (ministries.find(m => m.id === scheduleMinistryId)?.memberIds ?? [])
                            .map(id => members.find(m => m.id === id))
                            .filter(Boolean)
                        : members;
                      const filtered = scheduleMemberSearch.trim()
                        ? pool.filter(m => {
                            const name = m!.fullName || `${m!.firstName || ''} ${m!.lastName || ''}`.trim();
                            return name.toLowerCase().includes(scheduleMemberSearch.toLowerCase());
                          })
                        : pool;
                      return filtered.map(m => {
                        const name = m!.fullName || `${m!.firstName || ''} ${m!.lastName || ''}`.trim();
                        const selected = scheduleForm.assignedMembers.some(a => a.memberId === m!.id);
                        return (
                          <button key={m!.id} type="button" onClick={() => toggleScheduleMember(m!.id)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#f2f0ea] transition-colors ${selected ? 'bg-[#f6f4f0]' : ''}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${selected ? 'bg-[#1A77A3] text-white' : 'bg-gray-200 text-gray-600'}`}>
                              {name.charAt(0)}
                            </div>
                            <span className="text-sm text-gray-800 truncate flex-1">{name}</span>
                            {selected && <CheckCircle className="w-3.5 h-3.5 text-[#1A77A3] flex-shrink-0" />}
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Role inputs for selected members */}
                {scheduleForm.assignedMembers.length > 0 && (
                  <div className="space-y-1.5">
                    {scheduleForm.assignedMembers.map(({ memberId, role }) => (
                      <div key={memberId} className="flex items-center gap-2">
                        <span className="text-xs text-gray-700 flex-1 truncate">{getMemberName(memberId)}</span>
                        <input
                          type="text"
                          placeholder="Peran (misal: Pemain Gitar)"
                          value={role}
                          onChange={e => updateScheduleMemberRole(memberId, e.target.value)}
                          className="w-40 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#1A77A3]"
                        />
                        <button type="button" onClick={() => toggleScheduleMember(memberId)}
                          className="p-1 hover:text-red-500 text-gray-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Catatan */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Catatan</label>
                <textarea
                  value={scheduleForm.notes}
                  onChange={e => setScheduleForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  placeholder="Catatan tambahan jadwal..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3] resize-none"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex gap-3 justify-end flex-shrink-0">
              <button type="button" onClick={() => setShowScheduleForm(false)}
                className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-100 transition-colors">
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveSchedule}
                disabled={!scheduleForm.date || !scheduleForm.serviceType}
                className="flex items-center gap-2 px-5 py-2 bg-[#1A77A3] text-white rounded-lg text-sm hover:bg-[#144f6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <Calendar className="w-4 h-4" />
                {editingScheduleId ? 'Simpan Perubahan' : 'Tambah Jadwal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SCHEDULE DELETE CONFIRM */}
      {scheduleDeleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={() => setScheduleDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()} style={{ transform: `translate(${offsetScheduleDelete.x}px, ${offsetScheduleDelete.y}px)` }}>
            <div className="flex items-center gap-4 mb-4" onMouseDown={onMouseDownScheduleDelete} style={{ cursor: 'move' }}>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Hapus Jadwal</h3>
                <p className="text-sm text-gray-500">Tindakan tidak dapat dibatalkan</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5">
              <p className="text-sm font-medium text-gray-800">
                {new Date(scheduleDeleteTarget.date + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {scheduleDeleteTarget.serviceType} · {scheduleDeleteTarget.assignedMembers.length} anggota bertugas
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setScheduleDeleteTarget(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-[#f2f0ea] transition-colors">
                Batal
              </button>
              <button onClick={() => { deleteMinistrySchedule(scheduleDeleteTarget.id); setScheduleDeleteTarget(null); }}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors">
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}