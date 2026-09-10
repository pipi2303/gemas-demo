import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { toast } from 'sonner';
import { Event } from '../types';
import { useDraggable } from '../../lib/useDraggable';
import { SearchDropdown } from './ui/SearchDropdown';
import {
  Calendar, Clock, MapPin, Plus, Eye, Pencil, Trash2, X, ChevronLeft,
  ChevronRight, Search, Users, CalendarDays, LayoutGrid, List,
  CheckCircle, AlertCircle, PlayCircle, XCircle, Star, Mic2,
  Flag, Activity, Filter
} from 'lucide-react';

// ─── Config ──────────────────────────────────────────────────────────────────
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const DAYS_ID   = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

const TYPE_CONFIG: Record<Event['type'], { gradient: string; bg: string; text: string; border: string; dot: string }> = {
  Ibadah:      { gradient: 'from-[#144f6b] to-[#144f6b]',  bg: 'bg-[#f0f7fb]', text: 'text-[#144f6b]', border: 'border-[#b8d5e8]', dot: 'bg-[#144f6b]' },
  Persekutuan: { gradient: 'from-[#144f6b] to-[#1A77A3]',     bg: 'bg-[#f0f7fb]',    text: 'text-[#144f6b]',    border: 'border-[#b8d5e8]',    dot: 'bg-[#144f6b]'    },
  Retreat:     { gradient: 'from-purple-600 to-violet-600',  bg: 'bg-[#f0f7fb]',  text: 'text-[#3a7fa0]',  border: 'border-[#b8d5e8]',  dot: 'bg-[#3a7fa0]'  },
  Seminar:     { gradient: 'from-[#144f6b] to-[#3a7fa0]',   bg: 'bg-[#f6f4f0]',  text: 'text-orange-700',  border: 'border-[#b8d5e8]',  dot: 'bg-[#9c9486]'  },
  Pelayanan:   { gradient: 'from-pink-600 to-rose-600',      bg: 'bg-[#f0f7fb]',    text: 'text-[#144f6b]',    border: 'border-pink-200',    dot: 'bg-[#144f6b]'    },
  Lainnya:     { gradient: 'from-slate-600 to-gray-600',     bg: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-200',   dot: 'bg-slate-500'   },
};

const PELAYANAN_OPTIONS = [
  { key: 'PA',   label: 'Pelayanan Anak (PA)' },
  { key: 'PT',   label: 'Persekutuan Teruna (PT)' },
  { key: 'GP',   label: 'Gerakan Pemuda (GP)' },
  { key: 'PKLU', label: 'Persekutuan Kaum Lanjut Usia (PKLU)' },
  { key: 'PKP',  label: 'Persekutuan Kaum Perempuan (PKP)' },
  { key: 'PKB',  label: 'Persekutuan Kaum Bapak (PKB)' },
];

const PELAYANAN_COLOR: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  PA:   { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500'  },
  PT:   { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', dot: 'bg-yellow-400' },
  GP:   { bg: 'bg-[#e8ecf0]', text: 'text-[#144f6b]',  border: 'border-[#b8d5e8]',  dot: 'bg-[#144f6b]'  },
  PKLU: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  PKP:  { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-400' },
  PKB:  { bg: 'bg-slate-100', text: 'text-slate-600',  border: 'border-slate-300',  dot: 'bg-slate-400'  },
};

const STATUS_CONFIG: Record<Event['status'], { label: string; bg: string; text: string; icon: any }> = {
  'Akan Datang': { label: 'Akan Datang', bg: 'bg-[#f0ede5]',   text: 'text-[#144f6b]',  icon: CalendarDays },
  'Berlangsung': { label: 'Berlangsung', bg: 'bg-green-100',  text: 'text-green-700', icon: PlayCircle   },
  'Selesai':     { label: 'Selesai',     bg: 'bg-gray-100',   text: 'text-gray-600',  icon: CheckCircle  },
  'Dibatalkan':  { label: 'Dibatalkan',  bg: 'bg-red-100',    text: 'text-red-700',   icon: XCircle      },
};

const EVENT_TYPES: Event['type'][] = ['Ibadah','Persekutuan','Retreat','Seminar','Pelayanan','Lainnya'];

const EMPTY_FORM = {
  title: '', description: '', date: '', time: '', location: '',
  type: 'Ibadah' as Event['type'], organizer: '', status: 'Akan Datang' as Event['status'],
  pelayanan: '',
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function getEventStyle(ev: { type: Event['type']; pelayanan?: string }): { gradient: string; bg: string; text: string; border: string; dot: string } {
  const tc = TYPE_CONFIG[ev.type] || TYPE_CONFIG['Lainnya'];
  if (ev.pelayanan && PELAYANAN_COLOR[ev.pelayanan]) {
    return { gradient: tc.gradient, ...PELAYANAN_COLOR[ev.pelayanan] };
  }
  return { ...tc, dot: 'bg-[#013E37]' };
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}
function formatShort(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
}
function countdown(d: string): { days: number; label: string; urgent: boolean } {
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  if (diff < 0) return { days: diff, label: `${Math.abs(diff)}h lalu`, urgent: false };
  if (diff === 0) return { days: 0, label: 'Hari ini', urgent: true };
  if (diff === 1) return { days: 1, label: 'Besok', urgent: true };
  if (diff <= 7) return { days: diff, label: `${diff}h lagi`, urgent: true };
  return { days: diff, label: `${diff}h lagi`, urgent: false };
}

// ─── Komponen Utama ──────────────────────────────────────────────────────────
export function EventCalendar() {
  const { events, addEvent, updateEvent, deleteEvent, addNotification, currentUser, getMasterDataByCategory, can } = useApp();
  const eventTypeList = getMasterDataByCategory('jenis_kegiatan').map(m => m.value) as Event['type'][];
  const EVENT_TYPES_LIST: Event['type'][] = eventTypeList.length ? eventTypeList : EVENT_TYPES;
  const statusEventList = getMasterDataByCategory('status_event').map(m => m.value);
  const STATUS_EVENT = statusEventList.length ? statusEventList : ['Akan Datang','Berlangsung','Selesai','Dibatalkan'];
  const [viewMode, setViewMode] = useState<'calendar' | 'grid' | 'list'>('calendar');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Event | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<Event['type'] | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<Event['status'] | 'all'>('all');
  const [reminderSetId, setReminderSetId] = useState<string | null>(null);

  const canCreate = can('events', 'create');
  const canEdit   = can('events', 'edit');
  const canDelete = can('events', 'delete');

  const { offset: offsetDetail, onMouseDown: onMouseDownDetail } = useDraggable();
  const { offset: offsetForm, onMouseDown: onMouseDownForm } = useDraggable();
  const { offset: offsetDeleteEvent, onMouseDown: onMouseDownDeleteEvent } = useDraggable();

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const now = new Date();
    const curM = now.getMonth(), curY = now.getFullYear();
    const thisMonth = events.filter(e => { const d = new Date(e.date); return d.getMonth() === curM && d.getFullYear() === curY; });
    const upcoming = events.filter(e => new Date(e.date) >= now && e.status === 'Akan Datang');
    const byType = EVENT_TYPES_LIST.reduce((acc, t) => { acc[t] = events.filter(e => e.type === t).length; return acc; }, {} as Record<string,number>);
    return { total: events.length, thisMonth: thisMonth.length, upcoming: upcoming.length, byType };
  }, [events]);

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    return [...events]
      .filter(e => {
        const matchSearch = !searchTerm ||
          e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          e.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
          e.organizer.toLowerCase().includes(searchTerm.toLowerCase());
        const matchType   = filterType === 'all' || e.type === filterType;
        const matchStatus = filterStatus === 'all' || e.status === filterStatus;
        return matchSearch && matchType && matchStatus;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events, searchTerm, filterType, filterStatus]);

  // ── Calendar data ──────────────────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear(), month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = Array(firstDay).fill(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(i);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [currentMonth]);

  const getEventsForDay = (day: number) => {
    const year = currentMonth.getFullYear(), month = currentMonth.getMonth();
    return events.filter(e => {
      const d = new Date(e.date);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  };

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const openAdd = (date?: string) => {
    setEditingId(null);
    setFormData({ ...EMPTY_FORM, date: date || '' });
    setShowForm(true);
  };

  const openEdit = (e: Event) => {
    setEditingId(e.id);
    setFormData({ title: e.title, description: e.description, date: e.date, time: e.time, location: e.location, type: e.type, organizer: e.organizer, status: e.status, pelayanan: e.pelayanan || '' });
    setShowDetail(false);
    setShowForm(true);
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!formData.title.trim() || !formData.date) { toast.error('Mohon lengkapi Judul dan Tanggal'); return; }
    if (editingId) {
      updateEvent(editingId, formData);
      if (selectedEvent?.id === editingId) setSelectedEvent({ ...selectedEvent, ...formData });
    } else {
      addEvent(formData);
    }
    setShowForm(false);
    setEditingId(null);
  };

  const handleDelete = (e: Event) => {
    deleteEvent(e.id);
    if (selectedEvent?.id === e.id) { setShowDetail(false); setSelectedEvent(null); }
    setShowDeleteConfirm(null);
  };

  const openDetail = (e: Event) => { setSelectedEvent(e); setShowDetail(true); };

  const handleSetReminder = (e: Event) => {
    const daysUntil = Math.ceil((new Date(e.date).getTime() - Date.now()) / 86400000);
    if (daysUntil < 0) return;
    const timeLabel = daysUntil === 0 ? 'Hari ini' : daysUntil === 1 ? 'Besok' : `${daysUntil} hari lagi`;
    addNotification({
      type: 'event',
      title: `🔔 Pengingat: ${e.title}`,
      message: `${timeLabel} · ${e.time} WIB · ${e.location}${e.organizer ? ` · ${e.organizer}` : ''}`,
      read: false,
      link: `ev-manual-${e.id}-${Date.now()}`,
      priority: daysUntil <= 1 ? 'high' : daysUntil <= 3 ? 'medium' : 'low',
    });
    setReminderSetId(e.id);
    setTimeout(() => setReminderSetId(null), 2500);
  };

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-6 space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#144f6b] to-[#144f6b] rounded-xl flex items-center justify-center shadow">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Kalender Gerejawi</h1>
            <p className="text-sm text-gray-500">Jadwal kegiatan & acara jemaat GPIB Bahtera Kasih</p>
          </div>
        </div>
        {canCreate && (
          <button onMouseDown={e=>e.preventDefault()} onClick={() => openAdd()}
            className="flex items-center gap-2 px-4 py-2 bg-[#144f6b] text-white rounded-lg hover:bg-[#144f6b] transition-colors text-sm">
            <Plus className="w-4 h-4" /> Tambah Acara
          </button>
        )}
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Acara', value: stats.total, icon: Calendar, color: 'text-[#144f6b]', bg: 'bg-[#f0f7fb]' },
          { label: 'Bulan Ini', value: stats.thisMonth, icon: CalendarDays, color: 'text-[#144f6b]', bg: 'bg-[#f0f7fb]' },
          { label: 'Akan Datang', value: stats.upcoming, icon: AlertCircle, color: 'text-[#144f6b]', bg: 'bg-[#f6f4f0]' },
          { label: 'Ibadah & Pelayanan', value: (stats.byType['Ibadah']||0) + (stats.byType['Pelayanan']||0), icon: Star, color: 'text-[#144f6b]', bg: 'bg-[#f0f7fb]' },
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

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-white overflow-hidden" style={{borderColor:'#e2e8f0',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
        <div className="flex items-center gap-3 p-3 border-b" style={{borderColor:'#f1f5f9'}}>
          <div className="flex-1">
            <SearchDropdown<any>
              value={searchTerm}
              onChange={v => setSearchTerm(v)}
              placeholder="Cari acara, lokasi, penyelenggara..."
              items={events}
              filterFn={(e, q) => {
                const lq = q.toLowerCase();
                return e.title.toLowerCase().includes(lq)
                  || e.location?.toLowerCase().includes(lq)
                  || e.organizer?.toLowerCase().includes(lq);
              }}
              renderResult={e => (
                <div>
                  <p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{e.title}</p>
                  <p style={{fontSize:'11px',color:'#64748b',margin:0}}>{e.date} · {e.location||'-'}</p>
                </div>
              )}
              onSelect={e => setSearchTerm(e.title)}
            />
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl border" style={{borderColor:'#e2e8f0',background:'#f8fafc'}}>
            {([['calendar','Kalender',CalendarDays],['grid','Grid',LayoutGrid],['list','Daftar',List]] as const).map(([mode,label,Icon])=>(
              <button key={mode} onClick={()=>setViewMode(mode as any)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all" style={{background:viewMode===mode?'#144f6b':'transparent',color:viewMode===mode?'#fff':'#94a3b8'}}>
                <Icon className="w-3.5 h-3.5"/>{label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'0.08em',color:'#b0bec5',textTransform:'uppercase',minWidth:'68px'}}>Filter</span>
            {([
              {val:filterType,set:(v:string)=>setFilterType(v as any),opts:[{v:'all',l:'Semua Jenis'},...EVENT_TYPES_LIST.map(t=>({v:t,l:t}))]},
              {val:filterStatus,set:(v:string)=>setFilterStatus(v as any),opts:[{v:'all',l:'Semua Status'},...STATUS_EVENT.map(s=>({v:s,l:s}))]},
            ] as {val:string;set:(v:string)=>void;opts:{v:string;l:string}[]}[]).map((f,i)=>{
              const active=f.val!=='all';
              return <select key={i} value={f.val} onChange={e=>f.set(e.target.value)} className="px-2.5 py-1 text-sm rounded-full border focus:outline-none transition-all cursor-pointer" style={{borderColor:active?'#144f6b':'#e2e8f0',background:active?'#f0f7fb':'#fafafa',color:active?'#144f6b':'#64748b',fontWeight:active?600:400}}>{f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>;
            })}
          </div>
        </div>
        {(searchTerm||filterType!=='all'||filterStatus!=='all') ? (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
            <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,whiteSpace:'nowrap'}}>Filter aktif:</span>
            {searchTerm && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#144f6b',border:'1px solid #b8d5e8'}}><Search className="w-3 h-3"/>"{searchTerm.length>15?searchTerm.slice(0,15)+'…':searchTerm}"<button onClick={()=>setSearchTerm('')} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
            {filterType!=='all' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#144f6b',border:'1px solid #b8d5e8'}}>{filterType}<button onClick={()=>setFilterType('all')} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
            {filterStatus!=='all' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#144f6b',border:'1px solid #b8d5e8'}}>{filterStatus}<button onClick={()=>setFilterStatus('all')} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
            <button onClick={()=>{setSearchTerm('');setFilterType('all');setFilterStatus('all');}} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all hover:bg-red-50" style={{borderColor:'#fca5a5',color:'#ef4444'}}><X className="w-3 h-3"/>Reset Semua</button>
            <span className="ml-auto text-xs font-semibold" style={{color:'#144f6b'}}>{filteredEvents.length} acara ditemukan</span>
          </div>
        ) : (
          <div className="px-3 pb-2 flex justify-end"><span style={{fontSize:'12px',color:'#94a3b8',fontWeight:500}}>{filteredEvents.length} acara total</span></div>
        )}
      </div>

      {/* ── CALENDAR VIEW ───────────────────────────────────────────────── */}
      {viewMode === 'calendar' && (() => {
        const eventsForSelected = selectedDate 
          ? events.filter(e => {
              const d = new Date(e.date);
              return d.getFullYear() === selectedDate.getFullYear() && 
                     d.getMonth() === selectedDate.getMonth() && 
                     d.getDate() === selectedDate.getDate();
            })
          : [];

        return (
          <div className="flex flex-col lg:flex-row gap-5">
            {/* Left: Calendar Grid */}
            <div className="flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm self-start">
              {/* Nav */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <button onClick={() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1))}
                  data-tooltip="Bulan Sebelumnya"
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <div className="text-center">
                  <h2 className="font-bold text-gray-900">{MONTHS_ID[currentMonth.getMonth()]} {currentMonth.getFullYear()}</h2>
                  <p className="text-xs text-gray-400">{events.filter(e => { const d = new Date(e.date); return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear(); }).length} acara bulan ini</p>
                </div>
                <button onClick={() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1))}
                  data-tooltip="Bulan Berikutnya"
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ChevronRight className="w-5 h-5" /></button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50">
                {DAYS_ID.map((d, i) => (
                  <div key={d} className={`py-3 text-center text-[11px] font-bold uppercase tracking-wider ${i === 0 ? 'text-red-500' : i === 6 ? 'text-[#144f6b]' : 'text-gray-500'}`}>{d}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7">
                {calendarDays.map((day, i) => {
                  const today = new Date();
                  const isToday = day !== null && today.getDate() === day && today.getMonth() === currentMonth.getMonth() && today.getFullYear() === currentMonth.getFullYear();
                  const isSelected = day !== null && selectedDate && selectedDate.getDate() === day && selectedDate.getMonth() === currentMonth.getMonth() && selectedDate.getFullYear() === currentMonth.getFullYear();
                  const isSun = i % 7 === 0, isSat = i % 7 === 6;
                  const dayEvents = day !== null ? getEventsForDay(day) : [];
                  
                  return (
                    <div key={i} className={`min-h-[100px] p-2 border-b border-r border-gray-100 relative group ${
                      day === null ? 'bg-gray-50/30' : 'cursor-pointer transition-all'
                    } ${isSelected ? 'bg-[#f0f7fb] ring-2 ring-inset ring-[#144f6b] z-10' : day !== null ? 'hover:bg-gray-50' : ''}`}
                      onClick={() => { if (day) { const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day); setSelectedDate(d); } }}>
                      {day && (
                        <>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-1.5 transition-colors ${
                            isToday ? 'bg-[#144f6b] text-white shadow-sm' : isSelected ? 'text-[#144f6b]' : isSun ? 'text-red-500' : isSat ? 'text-[#144f6b]' : 'text-gray-700'
                          }`}>{day}</div>
                          
                          <div className="space-y-1">
                            {dayEvents.slice(0, 3).map(ev => {
                              const cfg = getEventStyle(ev);
                              return (
                                <div key={ev.id}
                                  data-tooltip={ev.title} data-tooltip-truncate
                                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${cfg.border} ${cfg.bg} ${cfg.text} truncate`}>
                                  {ev.title}
                                </div>
                              );
                            })}
                            {dayEvents.length > 3 && (
                              <div className="text-[9px] text-gray-400 font-medium pl-1">+{dayEvents.length - 3} lagi</div>
                            )}
                          </div>
                          
                          {canCreate && dayEvents.length === 0 && (
                            <button onClick={e => { e.stopPropagation(); openAdd(`${currentMonth.getFullYear()}-${String(currentMonth.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`); }}
                              data-tooltip="Tambah"
                              className="absolute bottom-1 right-1 w-5 h-5 rounded-lg bg-white border border-gray-200 text-gray-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:text-[#144f6b] hover:border-[#144f6b] shadow-sm">
                              <Plus className="w-3 h-3" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Type Legend */}
              <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap gap-4 bg-gray-50/30">
                {EVENT_TYPES_LIST.map(t => (
                  <div key={t} className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${(TYPE_CONFIG[t]||TYPE_CONFIG['Lainnya']).dot} ring-2 ring-white shadow-sm`} />
                    <span className="text-[11px] font-medium text-gray-600">{t}</span>
                  </div>
                ))}
              </div>
              {/* Pelayanan Legend */}
              <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap gap-4 bg-gray-50/10">
                <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'0.08em',color:'#b0bec5',textTransform:'uppercase',alignSelf:'center'}}>Pelayanan</span>
                {PELAYANAN_OPTIONS.map(p => (
                  <div key={p.key} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${PELAYANAN_COLOR[p.key].dot} ring-2 ring-white shadow-sm`} />
                    <span className="text-[11px] font-medium text-gray-600">{p.key}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Side Detail Panel */}
            <div className="w-full lg:w-80 space-y-4 flex-shrink-0">
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm flex flex-col h-full min-h-[400px]">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 text-sm">Kegiatan Hari Ini</h3>
                  {selectedDate && (
                    <span className="text-[11px] font-bold text-[#144f6b] bg-[#f0f7fb] px-2 py-0.5 rounded-full border border-[#b8d5e8]">
                      {selectedDate.getDate()} {MONTHS_ID[selectedDate.getMonth()].slice(0,3)}
                    </span>
                  )}
                </div>

                <div className="p-4 flex-1 overflow-y-auto max-h-[600px] scrollbar-hide">
                  {!selectedDate ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 py-20">
                      <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                        <Calendar className="w-6 h-6 text-gray-300" />
                      </div>
                      <p className="text-xs text-gray-500 font-medium">Klik tanggal di kalender untuk melihat detail acara</p>
                    </div>
                  ) : eventsForSelected.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 py-20">
                      <div className="w-12 h-12 bg-[#f6f4f0] rounded-full flex items-center justify-center mb-3">
                        <Activity className="w-6 h-6 text-[#9c9486]" />
                      </div>
                      <p className="text-xs text-gray-500 font-medium">Tidak ada kegiatan terjadwal</p>
                      {canCreate && (
                        <button onClick={() => openAdd(`${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`)}
                          className="mt-3 text-[11px] font-bold text-[#144f6b] hover:underline">+ Tambah Acara</button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {eventsForSelected.map(ev => {
                        const cfg = getEventStyle(ev);
                        const st = STATUS_CONFIG[ev.status];
                        return (
                          <div 
                            key={ev.id} 
                            onClick={() => openDetail(ev)}
                            className="group p-3 rounded-xl border border-gray-100 bg-white hover:border-[#144f6b] hover:shadow-sm transition-all cursor-pointer relative overflow-hidden"
                          >
                            <div className={`absolute top-0 left-0 w-1 h-full ${cfg.dot}`} />
                            <div className="flex items-center justify-between mb-1.5">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>{ev.type}</span>
                              <span className="text-[10px] text-gray-400 font-medium">{ev.time} WIB</span>
                            </div>
                            <h4 className="text-sm font-bold text-gray-900 group-hover:text-[#144f6b] transition-colors line-clamp-2">{ev.title}</h4>
                            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-500">
                              <MapPin className="w-3 h-3" />
                              <span data-tooltip={ev.location} data-tooltip-truncate className="truncate">{ev.location}</span>
                            </div>
                            <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50">
                              <span className={`text-[9px] font-bold flex items-center gap-1 ${st.text}`}>
                                <st.icon className="w-2.5 h-2.5" /> {st.label}
                              </span>
                              <ChevronRight className="w-3 h-3 text-gray-300 group-hover:text-[#144f6b] transition-all" />
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
        );
      })()}

      {/* ── GRID VIEW ───────────────────────────────────────────────────── */}
      {viewMode === 'grid' && (
        filteredEvents.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Tidak ada acara ditemukan</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredEvents.map(ev => {
              const typeCfg = TYPE_CONFIG[ev.type] || TYPE_CONFIG['Lainnya'];
              const cfg = getEventStyle(ev);
              const stCfg = STATUS_CONFIG[ev.status];
              const cd = countdown(ev.date);
              return (
                <div key={ev.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-all cursor-pointer group" onClick={() => openDetail(ev)}>
                  {/* Colored Header */}
                  <div className={`bg-gradient-to-br ${typeCfg.gradient} p-4 text-white`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20">{ev.type}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ev.status === 'Akan Datang' ? 'bg-blue-300/30 text-blue-100' :
                        ev.status === 'Berlangsung' ? 'bg-green-400/30 text-green-100' :
                        ev.status === 'Selesai' ? 'bg-white/20 text-white/70' :
                        'bg-red-400/30 text-red-100'
                      }`}>{ev.status}</span>
                    </div>
                    <h3 className="font-bold text-base leading-tight">{ev.title}</h3>
                    <div className="flex items-center gap-2 mt-1.5 text-white/75 text-xs">
                      <Calendar className="w-3 h-3" />
                      {formatShort(ev.date)} · {ev.time} WIB
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-3">
                    {/* Countdown badge */}
                    {ev.status !== 'Selesai' && ev.status !== 'Dibatalkan' && (
                      <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold mb-3 ${
                        cd.urgent ? 'bg-red-100 text-red-700' : 'bg-[#f0ede5] text-[#144f6b]'
                      }`}>
                        <Clock className="w-3 h-3" />{cd.label}
                      </div>
                    )}

                    <p className="text-xs text-gray-600 line-clamp-2 mb-3">{ev.description}</p>

                    <div className="space-y-1.5 mb-3">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${cfg.text}`} />
                        <span data-tooltip={ev.location} data-tooltip-truncate className="truncate">{ev.location}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Users className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                        <span>Penyelenggara: {ev.organizer}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openDetail(ev)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#144f6b] text-white rounded-lg text-xs hover:bg-[#144f6b] transition-colors">
                        <Eye className="w-3.5 h-3.5" /> Detail
                      </button>
                      {ev.status === 'Akan Datang' && (
                        <button
                          onClick={() => handleSetReminder(ev)}
                          data-tooltip="Pasang Pengingat"
                          className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                            reminderSetId === ev.id
                              ? 'bg-green-100 text-green-700 border border-green-300'
                              : 'border border-[#e8e4d8] text-[#144f6b] hover:bg-[#f6f4f0]'
                          }`}>
                          {reminderSetId === ev.id ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      {canEdit && (
                        <button onMouseDown={e=>e.preventDefault()} onClick={() => openEdit(ev)}
                          data-tooltip="Edit"
                          className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-gray-50 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setShowDeleteConfirm(ev)}
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
          {filteredEvents.length === 0 ? (
            <div className="py-16 text-center">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Tidak ada acara ditemukan</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredEvents.map(ev => {
                const typeCfg = TYPE_CONFIG[ev.type] || TYPE_CONFIG['Lainnya'];
                const cfg = getEventStyle(ev);
                const stCfg = STATUS_CONFIG[ev.status];
                const cd = countdown(ev.date);
                const StatusIcon = stCfg.icon;
                return (
                  <div key={ev.id} className="flex items-center gap-4 px-5 py-4 hover:bg-[#f2f0ea] transition-colors cursor-pointer group" onClick={() => openDetail(ev)}>
                    {/* Date Box */}
                    <div className={`w-12 h-12 bg-gradient-to-br ${typeCfg.gradient} rounded-xl flex flex-col items-center justify-center flex-shrink-0`}>
                      <span className="text-white font-bold text-sm leading-none">{new Date(ev.date).getDate()}</span>
                      <span className="text-white/75 text-[9px]">{MONTHS_ID[new Date(ev.date).getMonth()].slice(0,3)}</span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p data-tooltip={ev.title} data-tooltip-truncate className="font-semibold text-gray-900 text-sm truncate">{ev.title}</p>
                        <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{ev.type}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{ev.time} WIB</span>
                        <span data-tooltip={ev.location} data-tooltip-truncate className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3" />{ev.location}</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{ev.organizer}</span>
                      </div>
                    </div>

                    {/* Status & Countdown */}
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${stCfg.bg} ${stCfg.text}`}>
                        <StatusIcon className="w-2.5 h-2.5" />{stCfg.label}
                      </span>
                      {ev.status !== 'Selesai' && ev.status !== 'Dibatalkan' && (
                        <span className={`text-[10px] font-medium ${cd.urgent ? 'text-red-600' : 'text-gray-400'}`}>{cd.label}</span>
                      )}
                    </div>

                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 group-hover:text-[#144f6b] transition-colors" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* DETAIL MODAL */}
      {showDetail && selectedEvent && (() => {
        const ev = selectedEvent;
        const typeCfg = TYPE_CONFIG[ev.type] || TYPE_CONFIG['Lainnya'];
        const cfg = getEventStyle(ev);
        const stCfg = STATUS_CONFIG[ev.status];
        const cd = countdown(ev.date);
        return (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>{setShowDetail(false);setSelectedEvent(null);}}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetDetail.x}px, ${offsetDetail.y}px)` }}>
              {/* Header */}
              <div className={`bg-gradient-to-br ${typeCfg.gradient} px-6 py-5`} onMouseDown={onMouseDownDetail} style={{ cursor: 'move' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white">{ev.type}</span>
                  <button onClick={() => setShowDetail(false)} data-tooltip="Tutup" className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
                <h2 className="text-xl font-bold text-white mb-1">{ev.title}</h2>
                <p className="text-white/75 text-sm">{formatDate(ev.date)}</p>
              </div>

              <div className="p-6 space-y-4">
                {/* Status & Countdown */}
                <div className="flex items-center gap-3">
                  <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${stCfg.bg} ${stCfg.text}`}>
                    <stCfg.icon className="w-4 h-4" />{stCfg.label}
                  </span>
                  {ev.status !== 'Selesai' && ev.status !== 'Dibatalkan' && (
                    <span className={`text-sm font-medium ${cd.urgent ? 'text-red-600' : 'text-gray-500'}`}>{cd.label}</span>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-3">
                  {[
                    { icon: Clock, label: 'Waktu', value: `${ev.time} WIB` },
                    { icon: MapPin, label: 'Lokasi', value: ev.location },
                    { icon: Users, label: 'Penyelenggara', value: ev.organizer },
                  ].map((row, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`w-8 h-8 ${cfg.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                        <row.icon className={`w-4 h-4 ${cfg.text}`} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{row.label}</p>
                        <p className="font-medium text-gray-800 text-sm">{row.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {ev.pelayanan && PELAYANAN_COLOR[ev.pelayanan] && (() => {
                  const pc = PELAYANAN_COLOR[ev.pelayanan!];
                  const opt = PELAYANAN_OPTIONS.find(o => o.key === ev.pelayanan);
                  return (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${pc.border} ${pc.bg}`}>
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${pc.dot}`} />
                      <span className={`text-sm font-semibold ${pc.text}`}>{opt?.label || ev.pelayanan}</span>
                    </div>
                  );
                })()}

                {ev.description && (
                  <div className={`p-4 rounded-xl ${cfg.bg} border ${cfg.border}`}>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Deskripsi</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{ev.description}</p>
                  </div>
                )}

                {/* Reminder Button */}
                {ev.status === 'Akan Datang' && (
                  <button
                    onClick={() => handleSetReminder(ev)}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                      reminderSetId === ev.id
                        ? 'bg-green-50 text-green-700 border-green-300'
                        : `${cfg.bg} ${cfg.text} ${cfg.border} hover:opacity-80`
                    }`}>
                    {reminderSetId === ev.id ? (
                      <><CheckCircle className="w-4 h-4" /> Pengingat Dipasang!</>
                    ) : (
                      <><AlertCircle className="w-4 h-4" /> Pasang Pengingat</>
                    )}
                  </button>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  {canEdit && (
                    <button onMouseDown={e=>e.preventDefault()} onClick={() => openEdit(ev)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#144f6b] text-white rounded-lg text-sm hover:bg-[#144f6b] transition-colors">
                      <Pencil className="w-4 h-4" /> Edit Acara
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => { setShowDetail(false); setShowDeleteConfirm(ev); }}
                      data-tooltip="Hapus"
                      className="px-4 py-2 border border-red-200 text-red-500 rounded-lg text-sm hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* FORM MODAL */}
      {showForm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetForm.x}px, ${offsetForm.y}px)` }}>
            <div className="bg-gradient-to-r from-[#144f6b] to-[#144f6b] px-6 py-5 flex items-center justify-between flex-shrink-0" onMouseDown={onMouseDownForm} style={{ cursor: 'move' }}>
              <div>
                <h2 className="text-xl font-bold text-white">{editingId ? 'Edit Acara' : 'Tambah Acara Baru'}</h2>
                <p className="text-indigo-200 text-sm mt-0.5">Kalender Gerejawi GPIB Bahtera Kasih</p>
              </div>
              <button onClick={() => setShowForm(false)} data-tooltip="Tutup" className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Judul Acara *</label>
                  <input autoFocus type="text" value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} required
                    placeholder="Nama acara / kegiatan"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal *</label>
                    <input type="date" value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))} required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Waktu *</label>
                    <input type="time" value={formData.time} onChange={e => setFormData(p => ({ ...p, time: e.target.value }))} required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Lokasi *</label>
                  <input type="text" value={formData.location} onChange={e => setFormData(p => ({ ...p, location: e.target.value }))} required
                    placeholder="Gedung, ruangan, atau alamat"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Jenis Acara *</label>
                    <select value={formData.type} onChange={e => setFormData(p => ({ ...p, type: e.target.value as Event['type'] }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]">
                      {EVENT_TYPES_LIST.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                    <select value={formData.status} onChange={e => setFormData(p => ({ ...p, status: e.target.value as Event['status'] }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]">
                      {STATUS_EVENT.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ibadah Pelayanan</label>
                  <select value={formData.pelayanan} onChange={e => setFormData(p => ({ ...p, pelayanan: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]">
                    <option value="">— Tidak Spesifik —</option>
                    {PELAYANAN_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Penyelenggara</label>
                  <input type="text" value={formData.organizer} onChange={e => setFormData(p => ({ ...p, organizer: e.target.value }))}
                    placeholder="Tim / Komisi penyelenggara"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Deskripsi</label>
                  <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                    rows={3} placeholder="Deskripsi singkat kegiatan..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b] resize-none" />
                </div>
              </div>
              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex gap-3 justify-end flex-shrink-0">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-100 transition-colors">Batal</button>
                <button type="submit"
                  className="flex items-center gap-2 px-5 py-2 bg-[#144f6b] text-white rounded-lg text-sm hover:bg-[#144f6b] transition-colors">
                  <CheckCircle className="w-4 h-4" />{editingId ? 'Simpan Perubahan' : 'Tambah Acara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setShowDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetDeleteEvent.x}px, ${offsetDeleteEvent.y}px)` }}>
            <div className="flex items-center gap-4 mb-4" onMouseDown={onMouseDownDeleteEvent} style={{ cursor: 'move' }}>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div><h3 className="font-bold text-gray-900">Hapus Acara</h3><p className="text-sm text-gray-500">Tindakan tidak dapat dibatalkan</p></div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5">
              <p className="text-sm font-medium text-gray-800">{showDeleteConfirm.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatShort(showDeleteConfirm.date)} · {showDeleteConfirm.location}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors">Batal</button>
              <button onClick={() => handleDelete(showDeleteConfirm)} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors">Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
