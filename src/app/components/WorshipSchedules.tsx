import React, { useState, useMemo } from 'react';
import {
  Calendar, Clock, MapPin, User, Plus, Search, X, Church, BookOpen,
  ChevronLeft, ChevronRight, Edit2, Trash2, Eye, FileText, Users,
  Music, Mic2, Piano, Filter, LayoutGrid, List, Star, AlertCircle,
  CheckCircle, PlayCircle, XCircle, Printer
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { WorshipSchedule, WorshipType } from '../types';
import { useDraggable } from '../../lib/useDraggable';

// ─── Tipe Filter ─────────────────────────────────────────────────────────────
type FilterType = WorshipType | 'All';
type StatusFilter = 'Terjadwal' | 'Berlangsung' | 'Selesai' | 'Dibatalkan' | 'All';

// ─── Warna per tipe ──────────────────────────────────────────────────────────
type TypeStyle = { bg: string; text: string; border: string; badge: string };
const TYPE_DEFAULT: TypeStyle = { bg: 'bg-[#f0f7fb]', text: 'text-[#144f6b]', border: 'border-[#b8d5e8]', badge: 'bg-[#1A77A3]' };
const TYPE_CONFIG: Partial<Record<string, TypeStyle>> = {
  'Doa Pagi':                { bg: 'bg-yellow-50',  text: 'text-yellow-800',  border: 'border-yellow-200', badge: 'bg-yellow-600' },
  'Ibadah GP':               { bg: 'bg-[#f0f7fb]',  text: 'text-blue-800',    border: 'border-[#b8d5e8]',  badge: 'bg-[#1A77A3]' },
  'Ibadah Keluarga Sektor 1':{ bg: 'bg-green-50',   text: 'text-green-800',   border: 'border-green-200',  badge: 'bg-green-600' },
  'Ibadah Keluarga Sektor 2':{ bg: 'bg-green-50',   text: 'text-green-800',   border: 'border-green-200',  badge: 'bg-green-600' },
  'Ibadah Keluarga Sektor 3':{ bg: 'bg-green-50',   text: 'text-green-800',   border: 'border-green-200',  badge: 'bg-green-600' },
  'Ibadah Keluarga Sektor 4':{ bg: 'bg-green-50',   text: 'text-green-800',   border: 'border-green-200',  badge: 'bg-green-600' },
  'Ibadah Minggu Pagi':      { bg: 'bg-[#f0f7fb]',  text: 'text-blue-800',    border: 'border-[#b8d5e8]',  badge: 'bg-[#1A77A3]' },
  'Ibadah Minggu Sore':      { bg: 'bg-indigo-50',  text: 'text-indigo-800',  border: 'border-indigo-200', badge: 'bg-indigo-600' },
  'Ibadah PKB':              { bg: 'bg-purple-50',  text: 'text-purple-800',  border: 'border-purple-200', badge: 'bg-purple-600' },
  'Ibadah PKLU':             { bg: 'bg-purple-50',  text: 'text-purple-800',  border: 'border-purple-200', badge: 'bg-purple-600' },
  'Ibadah PKP':              { bg: 'bg-purple-50',  text: 'text-purple-800',  border: 'border-purple-200', badge: 'bg-purple-600' },
  'IHMPA':                   { bg: 'bg-teal-50',    text: 'text-teal-800',    border: 'border-teal-200',   badge: 'bg-teal-600' },
  'IHMPT':                   { bg: 'bg-teal-50',    text: 'text-teal-800',    border: 'border-teal-200',   badge: 'bg-teal-600' },
};

const STATUS_CONFIG = {
  Terjadwal:  { icon: AlertCircle,   color: 'text-blue-600',  bg: 'bg-[#f0ede5]',  label: 'Terjadwal' },
  Berlangsung:{ icon: PlayCircle,    color: 'text-green-600', bg: 'bg-green-100', label: 'Berlangsung' },
  Selesai:    { icon: CheckCircle,   color: 'text-gray-600',  bg: 'bg-gray-100',  label: 'Selesai' },
  Dibatalkan: { icon: XCircle,       color: 'text-red-600',   bg: 'bg-red-100',   label: 'Dibatalkan' },
};

const DAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

const EMPTY_FORM = {
  title: '', type: 'Minggu' as WorshipType, category: '',
  date: '', time: '', location: '',
  preacher: '', liturgist: '', worship_leader: '', pianist: '',
  sermon_theme: '', bible_verse: '', description: '',
  status: 'Terjadwal' as 'Terjadwal' | 'Berlangsung' | 'Selesai' | 'Dibatalkan',
};

export function WorshipSchedules() {
  const { worshipSchedules, addWorshipSchedule, updateWorshipSchedule, deleteWorshipSchedule, currentUser, logActivity, getMasterDataByCategory, can } = useApp();
  const worshipTypeList = getMasterDataByCategory('jenis_ibadah').map(m => m.value) as WorshipType[];
  const WORSHIP_TYPE_LIST: WorshipType[] = worshipTypeList.length ? worshipTypeList : [
    'Doa Pagi','Ibadah GP','Ibadah Keluarga Sektor 1','Ibadah Keluarga Sektor 2',
    'Ibadah Keluarga Sektor 3','Ibadah Keluarga Sektor 4','Ibadah Minggu Pagi',
    'Ibadah Minggu Sore','Ibadah PKB','Ibadah PKLU','Ibadah PKP','IHMPA','IHMPT',
  ];
  const kategoriList = getMasterDataByCategory('kategori_ibadah').map(m => m.value);
  const KATEGORI_LIST = kategoriList.length ? kategoriList : ['GP','PA','PKB','PKLU','PKP','PT'];
  const PELAYAN_LIST = getMasterDataByCategory('daftar_pelayan').map(m => m.value);
  const { offset: offsetDetail, onMouseDown: onMouseDownDetail } = useDraggable();
  const { offset: offsetForm, onMouseDown: onMouseDownForm } = useDraggable();
  const { offset: offsetDelete, onMouseDown: onMouseDownDelete } = useDraggable();

  // ─── View & navigation ────────────────────────────────────────────────────
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const today = new Date();
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth()); // 0-based

  // ─── Filter & Search ──────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('All');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('All');

  // ─── Modal state ──────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [showDetail, setShowDetail] = useState<WorshipSchedule | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<WorshipSchedule | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});


  // ─── Derived data ─────────────────────────────────────────────────────────
  const currentMonthSchedules = useMemo(() => {
    return worshipSchedules.filter(s => {
      const d = new Date(s.date);
      return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
    });
  }, [worshipSchedules]);

  const filteredSchedules = useMemo(() => {
    return worshipSchedules
      .filter(s => {
        const matchSearch =
          s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (s.preacher || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchType = filterType === 'All' || s.type === filterType;
        const matchStatus = filterStatus === 'All' || s.status === filterStatus;
        return matchSearch && matchType && matchStatus;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [worshipSchedules, searchTerm, filterType, filterStatus]);

  // Calendar: days in month
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const cells: (number | null)[] = Array(firstDay).fill(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(i);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarYear, calendarMonth]);

  const schedulesForCalendarMonth = useMemo(() => {
    return worshipSchedules.filter(s => {
      const d = new Date(s.date);
      return d.getFullYear() === calendarYear && d.getMonth() === calendarMonth;
    });
  }, [worshipSchedules, calendarYear, calendarMonth]);

  const getSchedulesForDay = (day: number) => {
    return schedulesForCalendarMonth.filter(s => new Date(s.date).getDate() === day);
  };

  // ─── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: currentMonthSchedules.length,
    minggu: currentMonthSchedules.filter(s => s.type === 'Minggu').length,
    kategorial: currentMonthSchedules.filter(s => s.type === 'Kategorial').length,
    khusus: currentMonthSchedules.filter(s => s.type === 'Khusus').length,
    upcoming: worshipSchedules.filter(s => s.status === 'Terjadwal').length,
  }), [currentMonthSchedules, worshipSchedules]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null);
    setFormData({ ...EMPTY_FORM });
    setFormErrors({});
    setShowForm(true);
  };

  const openEdit = (schedule: WorshipSchedule) => {
    setEditingId(schedule.id);
    setFormData({
      title: schedule.title,
      type: schedule.type,
      category: schedule.category || '',
      date: schedule.date,
      time: schedule.time,
      location: schedule.location,
      preacher: schedule.preacher || '',
      liturgist: schedule.liturgist || '',
      worship_leader: schedule.worship_leader || '',
      pianist: schedule.pianist || '',
      sermon_theme: schedule.sermon_theme || '',
      bible_verse: schedule.bible_verse || '',
      description: schedule.description || '',
      status: schedule.status || 'Terjadwal',
    });
    setFormErrors({});
    setShowForm(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.title.trim()) errors.title = 'Judul wajib diisi';
    if (!formData.date) errors.date = 'Tanggal wajib diisi';
    if (!formData.time) errors.time = 'Waktu wajib diisi';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const payload = {
      title: formData.title,
      type: formData.type,
      category: formData.category || undefined,
      date: formData.date,
      time: formData.time,
      location: formData.location,
      preacher: formData.preacher || undefined,
      liturgist: formData.liturgist || undefined,
      worship_leader: formData.worship_leader || undefined,
      pianist: formData.pianist || undefined,
      sermon_theme: formData.sermon_theme || undefined,
      bible_verse: formData.bible_verse || undefined,
      description: formData.description || undefined,
      status: formData.status,
    };

    if (editingId) {
      updateWorshipSchedule(editingId, payload);
      if (currentUser) {
        logActivity({
          userId: currentUser.id,
          userName: currentUser.name,
          action: 'Mengubah',
          entityType: 'Event',
          entityId: editingId,
          entityName: formData.title,
          details: 'Jadwal ibadah diperbarui',
        });
      }
    } else {
      addWorshipSchedule(payload);
      if (currentUser) {
        logActivity({
          userId: currentUser.id,
          userName: currentUser.name,
          action: 'Menambahkan',
          entityType: 'Event',
          entityId: `ws${Date.now()}`,
          entityName: formData.title,
          details: 'Jadwal ibadah baru ditambahkan',
        });
      }
    }
    setShowForm(false);
    setEditingId(null);
    setFormData({ ...EMPTY_FORM });
  };

  const handleDelete = (schedule: WorshipSchedule) => {
    deleteWorshipSchedule(schedule.id);
    if (currentUser) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Menghapus',
        entityType: 'Event',
        entityId: schedule.id,
        entityName: schedule.title,
        details: 'Jadwal ibadah dihapus',
      });
    }
    setShowDeleteConfirm(null);
  };

  const handlePrint = () => {
    window.print();
  };

  const navigateMonth = (dir: 1 | -1) => {
    let m = calendarMonth + dir;
    let y = calendarYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setCalendarMonth(m);
    setCalendarYear(y);
  };

  const isToday = (day: number) => {
    return day === today.getDate() && calendarMonth === today.getMonth() && calendarYear === today.getFullYear();
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const formatShortDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  // ─── Render helpers ───────────────────────────────────────────────────────
  const TypeBadge = ({ type }: { type: WorshipType }) => {
    const c = TYPE_CONFIG[type] ?? TYPE_DEFAULT;
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}>
        {type}
      </span>
    );
  };

  const StatusBadge = ({ status }: { status?: string }) => {
    const s = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.Terjadwal;
    const Icon = s.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.color}`}>
        <Icon className="w-3 h-3" />
        {s.label}
      </span>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-6 space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-gradient-to-br from-[#1A77A3] to-green-700 rounded-xl flex items-center justify-center shadow">
              <Church className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Jadwal Ibadah & Kegiatan</h1>
              <p className="text-sm text-gray-500">Kelola jadwal ibadah dan petugas gereja GPIB Bahtera Kasih</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-[#f2f0ea] cursor-pointer group transition-colors text-sm"
          >
            <Printer className="w-4 h-4" />
            Cetak
          </button>
          {can('Peribadahan & Kegiatan', 'create') && (
            <button
              onMouseDown={e=>e.preventDefault()}
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-[#1A77A3] text-white rounded-lg hover:bg-[#144f6b] transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Tambah Jadwal
            </button>
          )}
        </div>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-white overflow-hidden" style={{borderColor:'#e2e8f0',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
        <div className="flex items-center gap-3 p-3 border-b" style={{borderColor:'#f1f5f9'}}>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4"/>
            <input type="text" placeholder="Cari jadwal, lokasi, pengkhotbah..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border focus:outline-none transition-all"
              style={{borderColor:searchTerm?'#1A77A3':'#e2e8f0',background:'#fafafa'}}/>
            {searchTerm && <button onClick={()=>setSearchTerm('')} data-tooltip="Hapus pencarian" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-gray-200 transition-all" style={{color:'#94a3b8'}}><X className="w-3.5 h-3.5"/></button>}
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl border" style={{borderColor:'#e2e8f0',background:'#f8fafc'}}>
            <button onClick={()=>setView('list')} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-all" style={{background:view==='list'?'#1A77A3':'transparent',color:view==='list'?'#fff':'#94a3b8'}}>
              <List className="w-4 h-4"/>Daftar
            </button>
            <button onClick={()=>setView('calendar')} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-all" style={{background:view==='calendar'?'#1A77A3':'transparent',color:view==='calendar'?'#fff':'#94a3b8'}}>
              <Calendar className="w-4 h-4"/>Kalender
            </button>
          </div>
        </div>
        <div className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'0.08em',color:'#b0bec5',textTransform:'uppercase',minWidth:'68px'}}>Filter</span>
            {([
              {val:filterType,set:(v:string)=>setFilterType(v as FilterType),opts:[{v:'All',l:'Semua Tipe'},...WORSHIP_TYPE_LIST.map(t=>({v:t,l:t}))]},
              {val:filterStatus,set:(v:string)=>setFilterStatus(v as StatusFilter),opts:[{v:'All',l:'Semua Status'},{v:'Terjadwal',l:'Terjadwal'},{v:'Berlangsung',l:'Berlangsung'},{v:'Selesai',l:'Selesai'},{v:'Dibatalkan',l:'Dibatalkan'}]},
            ] as {val:string;set:(v:string)=>void;opts:{v:string;l:string}[]}[]).map((f,i)=>{
              const active=f.val!=='All';
              return <select key={i} value={f.val} onChange={e=>f.set(e.target.value)} className="px-2.5 py-1 text-sm rounded-full border focus:outline-none transition-all cursor-pointer" style={{borderColor:active?'#1A77A3':'#e2e8f0',background:active?'#f0f7fb':'#fafafa',color:active?'#1A77A3':'#64748b',fontWeight:active?600:400}}>{f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>;
            })}
          </div>
        </div>
        {(searchTerm||filterType!=='All'||filterStatus!=='All') ? (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
            <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,whiteSpace:'nowrap'}}>Filter aktif:</span>
            {searchTerm && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}><Search className="w-3 h-3"/>"{`${searchTerm.length>15?searchTerm.slice(0,15)+'…':searchTerm}`}"<button onClick={()=>setSearchTerm('')} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
            {filterType!=='All' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>{filterType}<button onClick={()=>setFilterType('All')} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
            {filterStatus!=='All' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>{filterStatus}<button onClick={()=>setFilterStatus('All')} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
            <button onClick={()=>{setSearchTerm('');setFilterType('All');setFilterStatus('All');}} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all hover:bg-red-50" style={{borderColor:'#fca5a5',color:'#ef4444'}}><X className="w-3 h-3"/>Reset Semua</button>
            <span className="ml-auto text-xs font-semibold" style={{color:'#1A77A3'}}>{filteredSchedules.length} jadwal ditemukan</span>
          </div>
        ) : (
          <div className="px-3 pb-2 flex justify-end"><span style={{fontSize:'12px',color:'#94a3b8',fontWeight:500}}>{filteredSchedules.length} jadwal total</span></div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* LIST VIEW */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {view === 'list' && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Menampilkan <span className="font-medium text-gray-900">{filteredSchedules.length}</span> dari <span className="font-medium text-gray-900">{worshipSchedules.length}</span> jadwal
            </p>
          </div>

          {filteredSchedules.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
              <Calendar className="w-14 h-14 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Tidak ada jadwal yang sesuai</p>
              <p className="text-sm text-gray-400 mt-1">Coba ubah filter atau tambahkan jadwal baru</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredSchedules.map(schedule => {
                const cfg = TYPE_CONFIG[schedule.type] ?? TYPE_DEFAULT;
                return (
                  <div
                    key={schedule.id}
                    className={`bg-white rounded-xl border ${cfg.border} hover:bg-[#f2f0ea] transition-all overflow-hidden cursor-pointer group`}
                    onClick={() => setShowDetail(schedule)}
                  >
                    {/* Card top stripe */}
                    <div className={`h-1.5 w-full ${cfg.badge}`} />

                    <div className="p-3">
                      {/* Title row */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 truncate group-hover:text-[#1A77A3] transition-colors">{schedule.title}</h3>
                          {schedule.sermon_theme && (
                            <p className="text-xs text-gray-500 mt-0.5 italic truncate">"{schedule.sermon_theme}"</p>
                          )}
                        </div>
                        <TypeBadge type={schedule.type} />
                      </div>

                      {/* Status */}
                      <div className="mb-3">
                        <StatusBadge status={schedule.status} />
                        {schedule.category && (
                          <span className="ml-2 text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                            {schedule.category}
                          </span>
                        )}
                      </div>

                      {/* Info rows */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                          <span>{formatShortDate(schedule.date)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Clock className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                          <span>{schedule.time} WIB</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                          <span className="truncate">{schedule.location}</span>
                        </div>
                        {schedule.preacher && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Mic2 className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                            <span className="truncate">{schedule.preacher}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setShowDetail(schedule)}
                        className="flex items-center gap-1.5 text-xs text-[#1A77A3] hover:text-[#144f6b] font-medium"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Detail
                      </button>
                      {(can('Peribadahan & Kegiatan', 'edit') || can('Peribadahan & Kegiatan', 'delete')) && (
                        <div className="flex gap-1">
                          {can('Peribadahan & Kegiatan', 'edit') && (
                            <button
                              onMouseDown={e=>e.preventDefault()}
                              onClick={() => openEdit(schedule)}
                              className="p-1.5 text-[#1A77A3] hover:bg-[#f0ede5] rounded-lg transition-colors"
                              data-tooltip="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {can('Peribadahan & Kegiatan', 'delete') && (
                            <button
                              onClick={() => setShowDeleteConfirm(schedule)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              data-tooltip="Hapus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CALENDAR VIEW */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {view === 'calendar' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Calendar header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-green-700 to-[#144f6b]">
            <button
              onClick={() => navigateMonth(-1)}
              className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors"
              data-tooltip="Bulan Sebelumnya"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">
                {MONTHS_ID[calendarMonth]} {calendarYear}
              </h2>
              <p className="text-green-100 text-xs mt-0.5">
                {schedulesForCalendarMonth.length} jadwal bulan ini
              </p>
            </div>
            <button
              onClick={() => navigateMonth(1)}
              className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors"
              data-tooltip="Bulan Berikutnya"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Day labels */}
          <div className="grid grid-cols-7 border-b border-gray-200">
            {DAYS_ID.map(d => (
              <div key={d} className={`py-3 text-center text-xs font-semibold ${d === 'Min' ? 'text-red-600' : 'text-gray-600'}`}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, idx) => {
              const daySchedules = day ? getSchedulesForDay(day) : [];
              const isTodayCell = day ? isToday(day) : false;
              const isSunday = idx % 7 === 0;
              return (
                <div
                  key={idx}
                  className={`min-h-[100px] border-b border-r border-gray-100 p-1.5 ${
                    !day ? 'bg-gray-50' : isTodayCell ? 'bg-green-50' : 'bg-white'
                  } ${isSunday && day ? 'bg-red-50/30' : ''}`}
                >
                  {day && (
                    <>
                      <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm mb-1 font-medium ${
                        isTodayCell
                          ? 'bg-green-600 text-white'
                          : isSunday
                          ? 'text-red-600'
                          : 'text-gray-700'
                      }`}>
                        {day}
                      </div>
                      <div className="space-y-1">
                        {daySchedules.slice(0, 3).map(s => (
                          <button
                            key={s.id}
                            onClick={() => setShowDetail(s)}
                            className={`w-full text-left px-1.5 py-0.5 rounded text-xs font-medium truncate ${(TYPE_CONFIG[s.type]??TYPE_DEFAULT).badge} text-white hover:opacity-90 transition-opacity`}
                            title={s.title}
                          >
                            {s.time} {s.title}
                          </button>
                        ))}
                        {daySchedules.length > 3 && (
                          <span className="text-xs text-gray-500 pl-1">+{daySchedules.length - 3} lainnya</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Calendar legend */}
          <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex flex-wrap gap-x-4 gap-y-1">
            {(Object.keys(TYPE_CONFIG) as WorshipType[]).map(type => (
              <div key={type} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className={`w-3 h-3 rounded ${(TYPE_CONFIG[type]??TYPE_DEFAULT).badge}`} />
                {type}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DETAIL MODAL */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {showDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setShowDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetDetail.x}px, ${offsetDetail.y}px)` }}>
            {/* Header */}
            <div className={`${(TYPE_CONFIG[showDetail.type]??TYPE_DEFAULT).bg} ${(TYPE_CONFIG[showDetail.type]??TYPE_DEFAULT).border} border-b px-6 py-5`} onMouseDown={onMouseDownDetail} style={{ cursor: 'move' }}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <TypeBadge type={showDetail.type} />
                    {showDetail.category && (
                      <span className="px-2 py-0.5 bg-white/60 text-gray-700 rounded-full text-xs">{showDetail.category}</span>
                    )}
                    <StatusBadge status={showDetail.status} />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">{showDetail.title}</h2>
                  {showDetail.sermon_theme && (
                    <p className="text-sm text-gray-600 mt-1 italic">"{showDetail.sermon_theme}"</p>
                  )}
                </div>
                <button onClick={() => setShowDetail(null)} data-tooltip="Tutup" className="p-2 hover:bg-black/10 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Waktu & Tempat */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Waktu & Tempat</h4>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{formatDate(showDetail.date)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{showDetail.time} WIB</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{showDetail.location}</span>
                    </div>
                    {showDetail.bible_verse && (
                      <div className="flex items-center gap-3">
                        <BookOpen className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <span className="text-sm text-gray-700">{showDetail.bible_verse}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Petugas */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Petugas Ibadah</h4>
                  <div className="space-y-2.5">
                    {showDetail.preacher && (
                      <div className="flex items-center gap-3">
                        <Mic2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <div>
                          <div className="text-xs text-gray-400">Pengkhotbah</div>
                          <div className="text-sm text-gray-700">{showDetail.preacher}</div>
                        </div>
                      </div>
                    )}
                    {showDetail.liturgist && (
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-purple-500 flex-shrink-0" />
                        <div>
                          <div className="text-xs text-gray-400">Liturgis</div>
                          <div className="text-sm text-gray-700">{showDetail.liturgist}</div>
                        </div>
                      </div>
                    )}
                    {showDetail.worship_leader && (
                      <div className="flex items-center gap-3">
                        <Music className="w-4 h-4 text-[#1A77A3] flex-shrink-0" />
                        <div>
                          <div className="text-xs text-gray-400">Pemimpin Pujian</div>
                          <div className="text-sm text-gray-700">{showDetail.worship_leader}</div>
                        </div>
                      </div>
                    )}
                    {showDetail.pianist && (
                      <div className="flex items-center gap-3">
                        <Piano className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <div>
                          <div className="text-xs text-gray-400">Pianis / Organis</div>
                          <div className="text-sm text-gray-700">{showDetail.pianist}</div>
                        </div>
                      </div>
                    )}
                    {!showDetail.preacher && !showDetail.liturgist && !showDetail.worship_leader && !showDetail.pianist && (
                      <p className="text-sm text-gray-400 italic">Belum ada petugas ditentukan</p>
                    )}
                  </div>
                </div>
              </div>

              {showDetail.description && (
                <div className="mt-5 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Deskripsi / Catatan</h4>
                  <p className="text-sm text-gray-700 leading-relaxed">{showDetail.description}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between bg-gray-50">
              <p className="text-xs text-gray-400">
                Dibuat: {new Date(showDetail.createdAt).toLocaleDateString('id-ID')}
              </p>
              <div className="flex gap-2">
                {can('Peribadahan & Kegiatan', 'edit') && (
                  <button
                    onMouseDown={e=>e.preventDefault()}
                    onClick={() => { setShowDetail(null); openEdit(showDetail); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A77A3] text-white rounded-lg text-sm hover:bg-[#144f6b] transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}
                <button
                  onClick={() => setShowDetail(null)}
                  className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-[#f2f0ea] cursor-pointer group transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ADD/EDIT FORM MODAL */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetForm.x}px, ${offsetForm.y}px)` }}>
            {/* Header */}
            <div className="px-6 py-5 flex items-center justify-between" style={{ background:'linear-gradient(135deg,#0a1e2c,#0f2d41)', cursor: 'move' }} onMouseDown={onMouseDownForm}>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {editingId ? 'Edit Jadwal Ibadah' : 'Tambah Jadwal Ibadah'}
                </h2>
                <p className="text-green-100 text-sm mt-0.5">
                  {editingId ? 'Perbarui informasi jadwal ibadah' : 'Isi formulir untuk menambah jadwal baru'}
                </p>
              </div>
              <button onClick={() => setShowForm(false)} data-tooltip="Tutup" className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

                {/* Informasi Dasar */}
                <div className="bg-[#f0f7fb] rounded-xl p-4 border border-[#f0ede5] space-y-4">
                  <div className="flex items-center gap-2 pb-1">
                    <div className="w-7 h-7 bg-[#1A77A3] rounded-lg flex items-center justify-center">
                      <Calendar className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="font-semibold text-gray-800 text-sm">Informasi Dasar</span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Judul Ibadah <span className="text-red-500">*</span>
                    </label>
                    <input
                      autoFocus
                      type="text"
                      value={formData.title}
                      onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                      placeholder="Misal: Ibadah Minggu Pagi"
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${formErrors.title ? 'border-red-400' : 'border-gray-300'}`}
                    />
                    {formErrors.title && <p className="text-xs text-red-500 mt-1">{formErrors.title}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Jenis Ibadah <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.type}
                        onChange={e => setFormData(p => ({ ...p, type: e.target.value as WorshipType }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        {WORSHIP_TYPE_LIST.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Kategori</label>
                      <select
                        value={formData.category}
                        onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="">— Pilih —</option>
                        {KATEGORI_LIST.map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={e => setFormData(p => ({ ...p, status: e.target.value as typeof formData.status }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="Terjadwal">Terjadwal</option>
                      <option value="Berlangsung">Berlangsung</option>
                      <option value="Selesai">Selesai</option>
                      <option value="Dibatalkan">Dibatalkan</option>
                    </select>
                  </div>
                </div>

                {/* Waktu & Tempat */}
                <div className="bg-[#f0f7fb] rounded-xl p-4 border border-[#f0ede5] space-y-4">
                  <div className="flex items-center gap-2 pb-1">
                    <div className="w-7 h-7 bg-[#3a7fa0] rounded-lg flex items-center justify-center">
                      <Clock className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="font-semibold text-gray-800 text-sm">Waktu & Tempat</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Tanggal <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={formData.date}
                        onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                        className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${formErrors.date ? 'border-red-400' : 'border-gray-300'}`}
                      />
                      {formErrors.date && <p className="text-xs text-red-500 mt-1">{formErrors.date}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Waktu <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="time"
                        value={formData.time}
                        onChange={e => setFormData(p => ({ ...p, time: e.target.value }))}
                        className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${formErrors.time ? 'border-red-400' : 'border-gray-300'}`}
                      />
                      {formErrors.time && <p className="text-xs text-red-500 mt-1">{formErrors.time}</p>}
                    </div>
                  </div>

                </div>

                {/* Petugas Ibadah */}
                <div className="bg-green-50 rounded-xl p-4 border border-green-100 space-y-4">
                  <div className="flex items-center gap-2 pb-1">
                    <div className="w-7 h-7 bg-green-600 rounded-lg flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="font-semibold text-gray-800 text-sm">Petugas Ibadah</span>
                  </div>

                  {(['preacher','liturgist','worship_leader','pianist'] as const).map(key => {
                    const labels: Record<string,string> = { preacher:'Pengkhotbah / Pendeta', liturgist:'Liturgis', worship_leader:'Pemimpin Pujian', pianist:'Pianis / Organis' };
                    return (
                      <div key={key}>
                        <label className="block text-xs font-medium text-gray-700 mb-1">{labels[key]}</label>
                        {PELAYAN_LIST.length > 0 ? (
                          <select value={(formData as any)[key]} onChange={e => setFormData(p => ({ ...p, [key]: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                            <option value="">— Pilih —</option>
                            {PELAYAN_LIST.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        ) : (
                          <input type="text" value={(formData as any)[key]} onChange={e => setFormData(p => ({ ...p, [key]: e.target.value }))}
                            placeholder={`Nama ${labels[key].toLowerCase()}`}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"/>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Info Tambahan */}
                <div className="bg-[#f6f4f0] rounded-xl p-4 border border-[#e8e4d8] space-y-4">
                  <div className="flex items-center gap-2 pb-1">
                    <div className="w-7 h-7 bg-[#f6f4f0]0 rounded-lg flex items-center justify-center">
                      <BookOpen className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="font-semibold text-gray-800 text-sm">Informasi Khotbah</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Tema Khotbah</label>
                      <input
                        type="text"
                        value={formData.sermon_theme}
                        onChange={e => setFormData(p => ({ ...p, sermon_theme: e.target.value }))}
                        placeholder="Misal: Kasih yang Sejati"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Bacaan Alkitab</label>
                      <input
                        type="text"
                        value={formData.bible_verse}
                        onChange={e => setFormData(p => ({ ...p, bible_verse: e.target.value }))}
                        placeholder="Misal: Yohanes 3:16"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Deskripsi / Catatan</label>
                    <textarea
                      value={formData.description}
                      onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                      rows={3}
                      placeholder="Informasi tambahan tentang ibadah ini..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-100 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  {editingId ? 'Simpan Perubahan' : 'Tambah Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DELETE CONFIRM MODAL */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setShowDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetDelete.x}px, ${offsetDelete.y}px)` }}>
            <div className="flex items-center gap-4 mb-4" onMouseDown={onMouseDownDelete} style={{ cursor: 'move' }}>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Hapus Jadwal Ibadah</h3>
                <p className="text-sm text-gray-500">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5">
              <p className="text-sm font-medium text-gray-800">{showDeleteConfirm.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatShortDate(showDeleteConfirm.date)} · {showDeleteConfirm.time} WIB</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-[#f2f0ea] cursor-pointer group transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
