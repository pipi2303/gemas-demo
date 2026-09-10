import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useDraggable } from '../../lib/useDraggable';
import {
  FileText, BookOpen, Plus, X, Pencil, Trash2, Eye,
  Calendar, MessageSquare, ChevronRight, Church, Zap,
  Globe, Clock, MapPin, Users, CheckCircle, ExternalLink, Printer
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Warta, WorshipSchedule } from '../types';
import { getOfficerNamesByKeyword } from '../lib/worshipOfficers';

// ─── Helpers ────────────────────────────────────────────────────────────────
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function getWeekOfMonth(date: Date): number {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  return Math.ceil((date.getDate() + firstDay) / 7);
}

function formatShortDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatLongDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const TYPE_COLOR: Record<string, string> = {
  Minggu: '#3a7fa0', Keluarga: '#144f6b', PJJ: '#3b82f6', Kategorial: '#c2baaa', Khusus: '#ef4444'
};
const TYPE_BG: Record<string, string> = {
  Minggu: '#f5f3ff', Keluarga: '#f0f7fb', PJJ: '#eff6ff', Kategorial: '#fef3c7', Khusus: '#fef2f2'
};

// ─── Empty form ──────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  week: 1,
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  title: '',
  date: '',
  coverImage: '',
  sections: [
    { id: 's1', title: 'Jadwal Ibadah', content: '', order: 1 },
    { id: 's2', title: 'Renungan Firman', content: '', order: 2 },
    { id: 's3', title: 'Pokok-Pokok Doa', content: '', order: 3 },
  ] as { id: string; title: string; content: string; order: number }[],
  announcements: [''] as string[],
  worshipSchedules: [] as string[],
  published: false,
};

// ─── Component ───────────────────────────────────────────────────────────────
export function EWarta() {
  const {
    wartas, addWarta, updateWarta, deleteWarta,
    worshipSchedules, currentUser, can,
  } = useApp();

  const [view, setView] = useState<'grid' | 'detail'>('grid');
  const [selectedWarta, setSelectedWarta] = useState<Warta | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Warta | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedGenerateDate, setSelectedGenerateDate] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all');


  // Upcoming Sundays for auto-generate
  const upcomingSundays = useMemo(() => {
    const now = new Date();
    const sundays: { date: string; label: string; schedules: WorshipSchedule[] }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      if (d.getDay() === 0) { // Sunday
        const dateStr = d.toISOString().split('T')[0];
        // get schedules for this week (Sun–Sat)
        const weekStart = new Date(d);
        const weekEnd = new Date(d);
        weekEnd.setDate(d.getDate() + 6);
        const weekSchedules = worshipSchedules.filter(ws => {
          const wsDate = new Date(ws.date);
          return wsDate >= weekStart && wsDate <= weekEnd;
        });
        sundays.push({
          date: dateStr,
          label: d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
          schedules: weekSchedules,
        });
        if (sundays.length >= 5) break;
      }
    }
    return sundays;
  }, [worshipSchedules]);

  const filteredWartas = useMemo(() => {
    return [...wartas]
      .filter(w => filterStatus === 'all' || (filterStatus === 'published' ? w.published : !w.published))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [wartas, filterStatus]);

  // ── Form helpers ────────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null);
    setFormData({ ...EMPTY_FORM, sections: EMPTY_FORM.sections.map(s => ({ ...s })), announcements: [''] });
    setShowForm(true);
  };

  const openGenerateModal = () => {
    setSelectedGenerateDate('');
    setShowGenerateModal(true);
  };

  const openEdit = (warta: Warta) => {
    setEditingId(warta.id);
    setFormData({
      week: warta.week,
      month: warta.month,
      year: warta.year,
      title: warta.title,
      date: warta.date,
      coverImage: warta.coverImage || '',
      sections: warta.sections.map(s => ({ ...s })),
      announcements: [...warta.announcements],
      worshipSchedules: [...warta.worshipSchedules],
      published: warta.published,
    });
    setSelectedWarta(null);
    setView('grid');
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.date) {
      toast.error('Mohon lengkapi Judul dan Tanggal Warta');
      return;
    }
    const payload = {
      week: formData.week,
      month: formData.month,
      year: formData.year,
      title: formData.title,
      date: formData.date,
      coverImage: formData.coverImage || undefined,
      sections: formData.sections.filter(s => s.title || s.content),
      announcements: formData.announcements.filter(a => a.trim()),
      worshipSchedules: formData.worshipSchedules,
      published: formData.published,
    };
    if (editingId) {
      updateWarta(editingId, payload);
    } else {
      addWarta(payload);
    }
    setShowForm(false);
    setEditingId(null);
  };

  const handleDelete = (warta: Warta) => {
    deleteWarta(warta.id);
    setShowDeleteConfirm(null);
    if (view === 'detail') setView('grid');
  };

  // ── Auto-generate from worship schedule ─────────────────────────────────────
  const handleGenerate = () => {
    if (!selectedGenerateDate) {
      toast.error('Pilih tanggal Minggu terlebih dahulu');
      return;
    }
    const sunday = upcomingSundays.find(s => s.date === selectedGenerateDate);
    if (!sunday) return;

    const date = new Date(selectedGenerateDate);
    const weekNum = getWeekOfMonth(date);
    const monthNum = date.getMonth() + 1;
    const yearNum = date.getFullYear();
    const dateLabel = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    // Build "Jadwal Ibadah" section content from this week's schedules
    let scheduleContent = '';
    if (sunday.schedules.length > 0) {
      scheduleContent = sunday.schedules
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map(ws => {
          const wsDate = new Date(ws.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
          let line = `📅 ${wsDate} · ${ws.time} WIB\n${ws.title}`;
          if (ws.location) line += `\n📍 ${ws.location}`;
          const wsPreacher = getOfficerNamesByKeyword(ws, 'pengkhotbah', 'preacher');
          const wsLiturgist = getOfficerNamesByKeyword(ws, 'liturgis', 'liturgist');
          if (wsPreacher) line += `\n🎤 Pengkhotbah: ${wsPreacher}`;
          if (wsLiturgist) line += `\n📖 Liturgis: ${wsLiturgist}`;
          if (ws.sermon_theme) line += `\n✝️ Tema: "${ws.sermon_theme}"`;
          if (ws.bible_verse) line += `\n📜 Bacaan: ${ws.bible_verse}`;
          return line;
        })
        .join('\n\n─────────────────────\n\n');
    } else {
      scheduleContent = 'Jadwal ibadah minggu ini belum tersedia.';
    }

    // Build announcements
    const announcements: string[] = sunday.schedules
      .filter(ws => /minggu/i.test(ws.type))
      .map(ws => { const p = getOfficerNamesByKeyword(ws, 'pengkhotbah', 'preacher'); return `${ws.title} · ${ws.time} WIB di ${ws.location}${p ? ` · ${p}` : ''}`; });
    if (announcements.length === 0) announcements.push('');

    setFormData({
      week: weekNum,
      month: monthNum,
      year: yearNum,
      title: `Warta Jemaat - Minggu, ${dateLabel}`,
      date: selectedGenerateDate,
      coverImage: '',
      sections: [
        { id: 's1', title: 'Jadwal Ibadah Pekan Ini', content: scheduleContent, order: 1 },
        { id: 's2', title: 'Renungan Firman', content: '', order: 2 },
        { id: 's3', title: 'Pokok-Pokok Doa', content: '', order: 3 },
        { id: 's4', title: 'Berita Jemaat', content: '', order: 4 },
      ],
      announcements,
      worshipSchedules: sunday.schedules.map(ws => ws.id),
      published: false,
    });
    setEditingId(null);
    setShowGenerateModal(false);
    setSelectedGenerateDate('');
    setShowForm(true);
  };

  // ── Section / Announcement helpers ─────────────────────────────────────────
  const addSection = () =>
    setFormData(p => ({
      ...p,
      sections: [...p.sections, { id: `s${Date.now()}`, title: '', content: '', order: p.sections.length + 1 }]
    }));

  const removeSection = (idx: number) =>
    setFormData(p => ({ ...p, sections: p.sections.filter((_, i) => i !== idx) }));

  const updateSection = (idx: number, field: 'title' | 'content', value: string) =>
    setFormData(p => {
      const sections = [...p.sections];
      sections[idx] = { ...sections[idx], [field]: value };
      return { ...p, sections };
    });

  const addAnnouncement = () =>
    setFormData(p => ({ ...p, announcements: [...p.announcements, ''] }));

  const removeAnnouncement = (idx: number) =>
    setFormData(p => ({ ...p, announcements: p.announcements.filter((_, i) => i !== idx) }));

  const updateAnnouncement = (idx: number, value: string) =>
    setFormData(p => {
      const ann = [...p.announcements];
      ann[idx] = value;
      return { ...p, announcements: ann };
    });

  // ── Linked schedule helper ─────────────────────────────────────────────────
  const getLinkedSchedules = (warta: Warta): WorshipSchedule[] =>
    warta.worshipSchedules
      .map(id => worshipSchedules.find(ws => ws.id === id))
      .filter(Boolean) as WorshipSchedule[];

  const canCreate = can('e-warta', 'create');
  const canEdit   = can('e-warta', 'edit');
  const canDelete = can('e-warta', 'delete');

  const { offset: offsetGenerate, onMouseDown: onMouseDownGenerate } = useDraggable();
  const { offset: offsetForm, onMouseDown: onMouseDownForm } = useDraggable();
  const { offset: offsetDeleteWarta, onMouseDown: onMouseDownDeleteWarta } = useDraggable();

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-6 space-y-6">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#144f6b] rounded-xl flex items-center justify-center shadow">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">E-Warta Jemaat</h1>
            <p className="text-sm text-gray-500">Warta digital terintegrasi dengan Jadwal Ibadah</p>
          </div>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <button
              onClick={openGenerateModal}
              className="flex items-center gap-2 px-4 py-2 bg-[#3a7fa0] text-white rounded-lg hover:bg-[#144f6b] transition-colors text-sm"
            >
              <Zap className="w-4 h-4" />
              Generate dari Jadwal
            </button>
            <button
              onMouseDown={e=>e.preventDefault()}
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-[#144f6b] text-white rounded-lg hover:bg-[#144f6b] transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Buat Warta Baru
            </button>
          </div>
        )}
      </div>

      {/* ── Filter ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-2">
        {(['all', 'published', 'draft'] as const).map(f => (
          <button key={f} onClick={() => setFilterStatus(f)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === f ? 'bg-[#144f6b] text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}>
            {f === 'all' ? 'Semua' : f === 'published' ? 'Published' : 'Draft'}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">{filteredWartas.length} warta</span>
      </div>

      {/* ── Grid View ─────────────────────────────────────────────────────── */}
      {view === 'grid' && (
        <div>
          {filteredWartas.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Belum ada warta jemaat</p>
              {canCreate && (
                <button onClick={openGenerateModal} className="mt-4 px-4 py-2 bg-[#f0ede5] text-[#3a7fa0] rounded-lg text-sm hover:bg-purple-200 transition-colors">
                  Generate dari Jadwal Ibadah
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredWartas.map(warta => {
                const linked = getLinkedSchedules(warta);
                return (
                  <div 
                    key={warta.id} 
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:bg-[#f2f0ea] transition-all cursor-pointer group"
                    onClick={() => { setSelectedWarta(warta); setView('detail'); }}
                  >
                    {/* Cover image */}
                    {warta.coverImage && (
                      <div className="h-36 overflow-hidden">
                        <img src={warta.coverImage} alt={warta.title} className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500" />
                      </div>
                    )}
                    {!warta.coverImage && (
                      <div className="h-24 bg-[#144f6b] flex items-center justify-center">
                        <FileText className="w-10 h-10 text-white/40" />
                      </div>
                    )}

                    <div className="p-4">
                      {/* Status + Week */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          warta.published ? 'bg-green-100 text-green-800' : 'bg-[#f0ede5] text-[#144f6b]'
                        }`}>
                          {warta.published ? '● Published' : '○ Draft'}
                        </span>
                        <span className="text-xs text-gray-400">
                          Minggu ke-{warta.week} · {MONTHS_ID[warta.month - 1]} {warta.year}
                        </span>
                      </div>

                      <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2 group-hover:text-[#144f6b] transition-colors">{warta.title}</h3>
                      <p className="text-xs text-gray-400 mb-3">{formatShortDate(warta.date)}</p>

                      {/* Linked schedules badges */}
                      {linked.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {linked.slice(0, 3).map(ws => (
                            <span key={ws.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                              style={{ background: TYPE_BG[ws.type] || '#f8fafc', color: TYPE_COLOR[ws.type] || '#64748b' }}>
                              <Church className="w-2.5 h-2.5" />
                              {ws.type}
                            </span>
                          ))}
                          {linked.length > 3 && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
                              +{linked.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Meta */}
                      <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
                        <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{warta.sections.length} seksi</span>
                        <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{warta.announcements.length} pengumuman</span>
                        {linked.length > 0 && (
                          <span className="flex items-center gap-1"><Church className="w-3 h-3" />{linked.length} jadwal</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { setSelectedWarta(warta); setView('detail'); }}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#144f6b] text-white rounded-lg text-xs hover:bg-[#144f6b] transition-colors">
                          <Eye className="w-3.5 h-3.5" /> Lihat
                        </button>
                        {canEdit && (
                          <button onMouseDown={e=>e.preventDefault()} onClick={() => openEdit(warta)} data-tooltip="Edit"
                            className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-white transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => setShowDeleteConfirm(warta)} data-tooltip="Hapus"
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
          )}
        </div>
      )}

      {/* ── Detail View ───────────────────────────────────────────────────── */}
      {view === 'detail' && selectedWarta && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)'}}>
            <button onClick={() => setView('grid')} className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm mb-4 transition-colors">
              <ChevronRight className="w-4 h-4 rotate-180" /> Kembali ke Daftar
            </button>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    selectedWarta.published ? 'bg-green-400/30 text-green-100' : 'bg-[#c2baaa]/30 text-[#f0ede5]'
                  }`}>
                    {selectedWarta.published ? '● Published' : '○ Draft'}
                  </span>
                  <span className="text-blue-200 text-xs">
                    Minggu ke-{selectedWarta.week} · {MONTHS_ID[selectedWarta.month - 1]} {selectedWarta.year}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white">{selectedWarta.title}</h2>
                <p className="text-blue-200 text-sm mt-1">{formatLongDate(selectedWarta.date)}</p>
              </div>
              <div className="flex gap-2">
                {canEdit && (
                  <button onMouseDown={e=>e.preventDefault()} onClick={() => openEdit(selectedWarta)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 text-white rounded-lg text-sm hover:bg-white/30 transition-colors">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                )}

                <button onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 text-white rounded-lg text-sm hover:bg-white/30 transition-colors">
                  <Printer className="w-3.5 h-3.5" /> Cetak
                </button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Linked worship schedules */}
            {getLinkedSchedules(selectedWarta).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Church className="w-4 h-4 text-purple-500" />
                  <h3 className="font-semibold text-gray-800 text-sm">Jadwal Ibadah Terhubung</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {getLinkedSchedules(selectedWarta).map(ws => (
                    <div key={ws.id} className="p-3 rounded-xl border"
                      style={{ background: TYPE_BG[ws.type] || '#f8fafc', borderColor: `${TYPE_COLOR[ws.type]}30` || '#e2e8f0' }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold" style={{ color: TYPE_COLOR[ws.type] }}>{ws.type}</span>
                        {ws.status && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/70 text-gray-600">{ws.status}</span>
                        )}
                      </div>
                      <p className="font-medium text-gray-800 text-sm mb-1">{ws.title}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatShortDate(ws.date)}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{ws.time} WIB</span>
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{ws.location}</span>
                      </div>
                      {getOfficerNamesByKeyword(ws, 'pengkhotbah', 'preacher') && <p className="text-xs text-gray-400 mt-1">🎤 {getOfficerNamesByKeyword(ws, 'pengkhotbah', 'preacher')}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cover image */}
            {selectedWarta.coverImage && (
              <img src={selectedWarta.coverImage} alt="Cover" className="w-full max-h-64 object-cover rounded-xl" />
            )}

            {/* Sections */}
            {selectedWarta.sections.length > 0 && (
              <div className="space-y-4">
                {selectedWarta.sections.map((section, i) => (
                  <div key={section.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                      <span className="w-5 h-5 bg-[#144f6b] text-white rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
                      <h4 className="font-semibold text-gray-800 text-sm">{section.title}</h4>
                    </div>
                    {section.content ? (
                      <div className="px-4 py-3">
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{section.content}</p>
                      </div>
                    ) : (
                      <div className="px-4 py-3">
                        <p className="text-sm text-gray-400 italic">Belum ada konten</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Announcements */}
            {selectedWarta.announcements.filter(a => a.trim()).length > 0 && (
              <div className="bg-[#f6f4f0] rounded-xl border border-[#e8e4d8] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-4 h-4 text-[#144f6b]" />
                  <h4 className="font-semibold text-gray-800 text-sm">Pengumuman</h4>
                </div>
                <ul className="space-y-2">
                  {selectedWarta.announcements.filter(a => a.trim()).map((ann, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="text-[#144f6b] flex-shrink-0">•</span>
                      <span>{ann}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* GENERATE FROM SCHEDULE MODAL */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {showGenerateModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setShowGenerateModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetGenerate.x}px, ${offsetGenerate.y}px)` }}>
            {/* Header */}
            <div className="px-6 py-5" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDownGenerate}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Generate E-Warta</h2>
                  <p className="text-purple-200 text-sm mt-0.5">
                    Buat warta otomatis dari jadwal ibadah
                  </p>
                </div>
                <button onClick={() => setShowGenerateModal(false)} data-tooltip="Tutup" className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Pilih tanggal Minggu untuk membuat warta yang sudah terisi otomatis dengan jadwal ibadah minggu tersebut.
              </p>

              {/* Sunday selector */}
              <div className="space-y-2">
                {upcomingSundays.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Tidak ada jadwal ibadah mendatang</p>
                  </div>
                ) : (
                  upcomingSundays.map(sun => (
                    <label key={sun.date}
                      className={`flex items-start gap-3 p-4 rounded-xl border  transition-all ${
                        selectedGenerateDate === sun.date
                          ? 'border-purple-500 bg-[#f0f7fb]'
                          : 'border-gray-200 hover:border-[#b8d5e8] hover:bg-[#f2f0ea] cursor-pointer group'
                      }`}>
                      <input type="radio" name="sunday" value={sun.date}
                        checked={selectedGenerateDate === sun.date}
                        onChange={() => setSelectedGenerateDate(sun.date)}
                        className="mt-0.5 accent-purple-600" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 text-sm">{sun.label}</div>
                        {sun.schedules.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {sun.schedules.map(ws => (
                              <span key={ws.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                                style={{ background: TYPE_BG[ws.type], color: TYPE_COLOR[ws.type] }}>
                                <Church className="w-2.5 h-2.5" />
                                {ws.title}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 mt-1">Belum ada jadwal minggu ini</p>
                        )}
                      </div>
                      <span className="flex-shrink-0 text-xs text-gray-400 mt-1">
                        {sun.schedules.length} jadwal
                      </span>
                    </label>
                  ))
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowGenerateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-[#f2f0ea] cursor-pointer group transition-colors">
                  Batal
                </button>
                <button onClick={handleGenerate} disabled={!selectedGenerateDate}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#3a7fa0] text-white rounded-lg text-sm hover:bg-[#144f6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  <Zap className="w-4 h-4" />
                  Generate Warta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ADD/EDIT FORM MODAL */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {showForm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetForm.x}px, ${offsetForm.y}px)` }}>
            {/* Header */}
            <div className="px-6 py-5 flex items-center justify-between flex-shrink-0" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDownForm}>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {editingId ? 'Edit Warta Jemaat' : 'Buat Warta Baru'}
                </h2>
                <p className="text-blue-200 text-sm mt-0.5">
                  {formData.worshipSchedules.length > 0
                    ? `✓ Terhubung dengan ${formData.worshipSchedules.length} jadwal ibadah`
                    : 'Lengkapi informasi warta jemaat'}
                </p>
              </div>
              <button onClick={() => setShowForm(false)} data-tooltip="Tutup" className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

                {/* Linked schedule notice */}
                {formData.worshipSchedules.length > 0 && (
                  <div className="bg-[#f0f7fb] border border-[#b8d5e8] rounded-xl p-3 flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-purple-800">Auto-Generated dari Jadwal Ibadah</p>
                      <p className="text-xs text-purple-600 mt-0.5">
                        Warta ini terhubung dengan {formData.worshipSchedules.length} jadwal ibadah dan konten jadwal sudah terisi otomatis.
                      </p>
                    </div>
                  </div>
                )}

                {/* Info Warta */}
                <div className="bg-[#f0f7fb] rounded-xl p-4 border border-[#f0ede5] space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-[#144f6b] rounded-lg flex items-center justify-center">
                      <FileText className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="font-semibold text-gray-800 text-sm">Informasi Warta</span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Minggu Ke- *</label>
                      <input autoFocus type="number" min="1" max="5"
                        value={formData.week}
                        onChange={e => setFormData(p => ({ ...p, week: parseInt(e.target.value) || 1 }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Bulan *</label>
                      <select value={formData.month}
                        onChange={e => setFormData(p => ({ ...p, month: parseInt(e.target.value) }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {MONTHS_ID.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Tahun *</label>
                      <input type="number" min="2020" max="2050"
                        value={formData.year}
                        onChange={e => setFormData(p => ({ ...p, year: parseInt(e.target.value) || 2026 }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Judul Warta *</label>
                      <input type="text" value={formData.title}
                        onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                        placeholder="Warta Jemaat - Minggu, ..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal *</label>
                      <input type="date" value={formData.date}
                        onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">URL Gambar Sampul</label>
                      <input type="text" value={formData.coverImage}
                        onChange={e => setFormData(p => ({ ...p, coverImage: e.target.value }))}
                        placeholder="https://..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Status Publikasi</label>
                      <select value={formData.published ? 'true' : 'false'}
                        onChange={e => setFormData(p => ({ ...p, published: e.target.value === 'true' }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="false">○ Draft</option>
                        <option value="true">● Published</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Sections */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-purple-600" />
                      <span className="font-semibold text-gray-800 text-sm">Konten Warta</span>
                    </div>
                    <button type="button" onClick={addSection}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-[#f0ede5] text-[#3a7fa0] rounded-lg text-xs hover:bg-purple-200 transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Tambah Seksi
                    </button>
                  </div>
                  {formData.sections.map((section, idx) => (
                    <div key={section.id} className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-500">Seksi {idx + 1}</span>
                        {formData.sections.length > 1 && (
                          <button type="button" onClick={() => removeSection(idx)} data-tooltip="Hapus Seksi"
                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <input type="text" value={section.title}
                        onChange={e => updateSection(idx, 'title', e.target.value)}
                        placeholder="Judul seksi..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
                      <textarea value={section.content}
                        onChange={e => updateSection(idx, 'content', e.target.value)}
                        rows={4}
                        placeholder="Isi konten seksi..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    </div>
                  ))}
                </div>

                {/* Announcements */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-[#144f6b]" />
                      <span className="font-semibold text-gray-800 text-sm">Pengumuman</span>
                    </div>
                    <button type="button" onClick={addAnnouncement}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-[#f0ede5] text-[#144f6b] rounded-lg text-xs hover:bg-[#e8e4d8] transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Tambah
                    </button>
                  </div>
                  {formData.announcements.map((ann, idx) => (
                    <div key={idx} className="flex gap-2">
                      <textarea value={ann}
                        onChange={e => updateAnnouncement(idx, e.target.value)}
                        rows={2}
                        placeholder={`Pengumuman ${idx + 1}...`}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b] resize-none" />
                      {formData.announcements.length > 1 && (
                        <button type="button" onClick={() => removeAnnouncement(idx)} data-tooltip="Hapus Pengumuman"
                          className="p-2 text-red-400 hover:text-red-600 self-start hover:bg-red-50 rounded-lg transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex gap-3 justify-end flex-shrink-0">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-100 transition-colors">
                  Batal
                </button>
                <button type="submit"
                  className="flex items-center gap-2 px-5 py-2 bg-[#144f6b] text-white rounded-lg text-sm hover:bg-[#144f6b] transition-colors">
                  <CheckCircle className="w-4 h-4" />
                  {editingId ? 'Simpan Perubahan' : 'Simpan Warta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ─────────────────────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setShowDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetDeleteWarta.x}px, ${offsetDeleteWarta.y}px)` }}>
            <div className="flex items-center gap-4 mb-4" onMouseDown={onMouseDownDeleteWarta} style={{ cursor: 'move' }}>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Hapus Warta</h3>
                <p className="text-sm text-gray-500">Tindakan tidak dapat dibatalkan</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5">
              <p className="text-sm font-medium text-gray-800">{showDeleteConfirm.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatShortDate(showDeleteConfirm.date)}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-[#f2f0ea] cursor-pointer group transition-colors">
                Batal
              </button>
              <button onClick={() => handleDelete(showDeleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors">
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}