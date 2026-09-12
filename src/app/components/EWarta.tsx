import React, { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/apiClient';
import { useDraggable } from '../../lib/useDraggable';
import {
  FileText, BookOpen, Plus, X, Pencil, Trash2, Eye,
  Calendar, MessageSquare, ChevronRight, Church, Zap,
  Globe, Clock, MapPin, Users, CheckCircle, ExternalLink, Printer,
  Download, AlertTriangle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Warta, WorshipSchedule } from '../types';
import { getOfficerNamesByKeyword } from '../lib/worshipOfficers';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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

// Kode QRIS yang ditampilkan (is_displayed=true) -- dipakai baik di tampilan layar
// maupun di export PDF di bawah, supaya E-Warta cetak/unduh konsisten dengan versi digital.
interface EWartaQrisCode { id: string; label: string; image_data: string; mime_type: string; is_displayed: boolean; }

// Unduh E-Warta sebagai PDF berkop surat navy GPIB Trinitas (jsPDF + autoTable).
function generateWartaPDF(warta: Warta, qrisCodes: EWartaQrisCode[] = []) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const NAVY: [number, number, number] = [20, 79, 107];
  const GOLD: [number, number, number] = [202, 160, 74];
  let y = 34;

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 26, pageWidth, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('WARTA JEMAAT', pageWidth / 2, 11, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('GPIB Trinitas', pageWidth / 2, 17, { align: 'center' });
  doc.setFontSize(8);
  doc.text(`Minggu ke-${warta.week} · ${MONTHS_ID[warta.month - 1]} ${warta.year}`, pageWidth / 2, 22.5, { align: 'center' });

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const titleLines = doc.splitTextToSize(warta.title, pageWidth - 28);
  doc.text(titleLines, 14, y);
  y += titleLines.length * 5 + 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(formatLongDate(warta.date), 14, y);
  y += 8;

  warta.sections.forEach(section => {
    if (!section.content.trim() && !section.title.trim()) return;
    if (y > pageHeight - 30) { doc.addPage(); y = 16; }
    doc.setFillColor(240, 247, 251);
    doc.roundedRect(14, y, pageWidth - 28, 6.5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(20, 79, 107);
    doc.text(section.title || 'Tanpa Judul', 17, y + 4.6);
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    const bodyLines = doc.splitTextToSize(section.content || '-', pageWidth - 28);
    bodyLines.forEach((line: string) => {
      if (y > pageHeight - 20) { doc.addPage(); y = 16; }
      doc.text(line, 14, y);
      y += 4.6;
    });
    y += 4;
  });

  const anns = warta.announcements.filter(a => a.trim());
  if (anns.length > 0) {
    if (y > pageHeight - 30) { doc.addPage(); y = 16; }
    doc.setFillColor(240, 247, 251);
    doc.roundedRect(14, y, pageWidth - 28, 6.5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(20, 79, 107);
    doc.text('Pengumuman', 17, y + 4.6);
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    anns.forEach((a, i) => {
      const lines = doc.splitTextToSize(`${i + 1}. ${a}`, pageWidth - 30);
      lines.forEach((line: string) => {
        if (y > pageHeight - 20) { doc.addPage(); y = 16; }
        doc.text(line, 14, y);
        y += 4.6;
      });
      y += 1.5;
    });
  }

  // Kode QRIS Persembahan (is_displayed=true) -- sama seperti section lain, dilewati kalau kosong.
  const activeQris = qrisCodes.filter(q => q.is_displayed);
  if (activeQris.length > 0) {
    if (y > pageHeight - 40) { doc.addPage(); y = 16; }
    doc.setFillColor(240, 247, 251);
    doc.roundedRect(14, y, pageWidth - 28, 6.5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(20, 79, 107);
    doc.text('Kode QRIS Persembahan', 17, y + 4.6);
    y += 10;

    const imgSize = 32;
    const gap = 6;
    const perRow = Math.max(1, Math.floor((pageWidth - 28 + gap) / (imgSize + gap)));
    let col = 0;
    activeQris.forEach(q => {
      if (col === 0 && y + imgSize + 8 > pageHeight - 20) { doc.addPage(); y = 16; }
      const x = 14 + col * (imgSize + gap);
      try {
        const format = /png/i.test(q.mime_type) ? 'PNG' : 'JPEG';
        doc.addImage(`data:${q.mime_type};base64,${q.image_data}`, format, x, y, imgSize, imgSize);
      } catch {
        // Gambar korup/format tak dikenal -- jangan gagalkan seluruh PDF, cukup lewati satu kode ini.
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(51, 65, 85);
      const labelLines = doc.splitTextToSize(q.label, imgSize);
      doc.text(labelLines, x + imgSize / 2, y + imgSize + 4, { align: 'center' });
      col += 1;
      if (col >= perRow) { col = 0; y += imgSize + 10; }
    });
    if (col !== 0) y += imgSize + 10;
    y += 2;
  }

  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Dokumen Warta Jemaat GPIB Trinitas', 14, pageHeight - 7.5);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - 14, pageHeight - 7.5, { align: 'right' });
  }

  doc.save(`Warta-GPIB-Trinitas-Minggu${warta.week}-${warta.month}-${warta.year}.pdf`);
}

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

  // Kode QRIS Persembahan (Master Data Finance) yang sedang ditampilkan
  // (is_displayed = true) -- ditampilkan sebagai gambar scannable di tampilan
  // baca E-Warta. Endpoint publik view-only ini TIDAK memfilter is_active di
  // sisi query (server sudah default hanya is_active=TRUE), jadi cukup
  // dipanggil apa adanya di sini.
  const [displayedQrisCodes, setDisplayedQrisCodes] = useState<EWartaQrisCode[]>([]);
  useEffect(() => {
    api.get<{ success: boolean; data?: EWartaQrisCode[] }>('/api/v1/finance/qris-codes/displayed')
      .then(res => setDisplayedQrisCodes(res.data || []))
      .catch(() => setDisplayedQrisCodes([]));
  }, []);

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

  const canCreate  = can('e-warta', 'create');
  const canEdit    = can('e-warta', 'edit');
  const canDelete  = can('e-warta', 'delete');
  const canExport  = can('e-warta', 'export');
  const canApprove = can('e-warta', 'approve');

  const { offset: offsetGenerate, onMouseDown: onMouseDownGenerate } = useDraggable();
  const { offset: offsetForm, onMouseDown: onMouseDownForm } = useDraggable();
  const { offset: offsetDeleteWarta, onMouseDown: onMouseDownDeleteWarta } = useDraggable();

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">

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
                <button onClick={openGenerateModal} className="mt-4 px-4 py-2 bg-[#f0ede5] text-[#3a7fa0] rounded-lg text-sm hover:bg-[#8b6bb1]/15 transition-colors">
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
                          warta.published ? 'bg-[#f0f9f4] text-[#2f8f5b]' : 'bg-[#f0ede5] text-[#144f6b]'
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
                      {warta.worshipSchedules.length > linked.length && (
                        <div className="flex items-center gap-1 mb-3 px-2 py-0.5 rounded-full text-xs w-fit" style={{ background: 'rgba(209,85,63,0.1)', color: '#d1553f' }}>
                          <AlertTriangle className="w-3 h-3" />
                          {warta.worshipSchedules.length - linked.length} jadwal tertaut sudah dihapus
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
                            className="px-3 py-1.5 border border-[#d1553f]/30 text-[#d1553f] rounded-lg text-xs hover:bg-[#d1553f]/10 transition-colors">
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
                    selectedWarta.published ? 'bg-[#2f8f5b]/40 text-[#d9f5e3]' : 'bg-[#c2baaa]/30 text-[#f0ede5]'
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

                {canExport && (
                  <button onClick={() => generateWartaPDF(selectedWarta, displayedQrisCodes)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 text-white rounded-lg text-sm hover:bg-white/30 transition-colors">
                    <Download className="w-3.5 h-3.5" /> Unduh PDF
                  </button>
                )}
                {canExport && (
                  <button onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 text-white rounded-lg text-sm hover:bg-white/30 transition-colors">
                    <Printer className="w-3.5 h-3.5" /> Cetak
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Linked worship schedules */}
            {selectedWarta.worshipSchedules.length > 0 && getLinkedSchedules(selectedWarta).length < selectedWarta.worshipSchedules.length && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm" style={{ background: 'rgba(209,85,63,0.08)', color: '#b8442f' }}>
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{selectedWarta.worshipSchedules.length - getLinkedSchedules(selectedWarta).length} jadwal ibadah yang tertaut ke warta ini sudah dihapus dari Jadwal Ibadah. Konten yang sudah ditulis di seksi terkait mungkin sudah tidak sesuai lagi &mdash; periksa kembali sebelum dipublikasikan.</span>
              </div>
            )}
            {getLinkedSchedules(selectedWarta).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Church className="w-4 h-4 text-[#8b6bb1]" />
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

            {/* Kode QRIS Persembahan (Master Data Finance > Data QRIS, is_displayed = true) */}
            {displayedQrisCodes.length > 0 && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                  <h4 className="font-semibold text-gray-800 text-sm">Kode QRIS Persembahan</h4>
                </div>
                <div className="px-4 py-3 flex flex-wrap gap-4">
                  {displayedQrisCodes.map(q => (
                    <div key={q.id} className="flex flex-col items-center gap-1.5 text-center" style={{ width: 120 }}>
                      <img src={`data:${q.mime_type};base64,${q.image_data}`} alt={q.label} className="w-28 h-28 object-contain rounded-lg border border-gray-200" />
                      <span className="text-xs text-gray-600">{q.label}</span>
                    </div>
                  ))}
                </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setShowGenerateModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetGenerate.x}px, ${offsetGenerate.y}px)` }}>
            {/* Header */}
            <div className="px-6 py-5" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDownGenerate}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Generate E-Warta</h2>
                  <p className="text-[#c9bfe0] text-sm mt-0.5">
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
                          ? 'border-[#8b6bb1] bg-[#f0f7fb]'
                          : 'border-gray-200 hover:border-[#b8d5e8] hover:bg-[#f2f0ea] cursor-pointer group'
                      }`}>
                      <input type="radio" name="sunday" value={sun.date}
                        checked={selectedGenerateDate === sun.date}
                        onChange={() => setSelectedGenerateDate(sun.date)}
                        className="mt-0.5 accent-[#8b6bb1]" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setShowForm(false)}>
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
                    <CheckCircle className="w-5 h-5 text-[#8b6bb1] flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-[#6d5590]">Auto-Generated dari Jadwal Ibadah</p>
                      <p className="text-xs text-[#8b6bb1] mt-0.5">
                        Warta ini terhubung dengan {formData.worshipSchedules.length} jadwal ibadah dan konten jadwal sudah terisi otomatis.
                      </p>
                    </div>
                  </div>
                )}
                {formData.worshipSchedules.length > 0 && formData.worshipSchedules.filter(id => worshipSchedules.some(ws => ws.id === id)).length < formData.worshipSchedules.length && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm" style={{ background: 'rgba(209,85,63,0.08)', color: '#b8442f' }}>
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{formData.worshipSchedules.length - formData.worshipSchedules.filter(id => worshipSchedules.some(ws => ws.id === id)).length} jadwal ibadah yang tadinya tertaut sudah dihapus. Periksa kembali isi seksi "Jadwal Ibadah" secara manual sebelum menyimpan.</span>
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
                        disabled={!canApprove}
                        onChange={e => setFormData(p => ({ ...p, published: e.target.value === 'true' }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400">
                        <option value="false">○ Draft</option>
                        <option value="true">● Published</option>
                      </select>
                      {!canApprove && (
                        <p className="text-xs text-gray-400 mt-1">Hanya role dengan izin approve yang dapat mengubah status publikasi.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sections */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-[#8b6bb1]" />
                      <span className="font-semibold text-gray-800 text-sm">Konten Warta</span>
                    </div>
                    <button type="button" onClick={addSection}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-[#f0ede5] text-[#3a7fa0] rounded-lg text-xs hover:bg-[#8b6bb1]/15 transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Tambah Seksi
                    </button>
                  </div>
                  {formData.sections.map((section, idx) => (
                    <div key={section.id} className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-500">Seksi {idx + 1}</span>
                        {formData.sections.length > 1 && (
                          <button type="button" onClick={() => removeSection(idx)} data-tooltip="Hapus Seksi"
                            className="p-1 text-[#d1553f]/70 hover:text-[#d1553f] hover:bg-[#d1553f]/10 rounded transition-colors">
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
                  <p className="text-xs text-gray-400 -mt-1">
                    Teks bebas khusus buletin cetak edisi ini — terpisah dari menu "Warta & Pengumuman" (tidak saling terhubung).
                  </p>
                  {formData.announcements.map((ann, idx) => (
                    <div key={idx} className="flex gap-2">
                      <textarea value={ann}
                        onChange={e => updateAnnouncement(idx, e.target.value)}
                        rows={2}
                        placeholder={`Pengumuman ${idx + 1}...`}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b] resize-none" />
                      {formData.announcements.length > 1 && (
                        <button type="button" onClick={() => removeAnnouncement(idx)} data-tooltip="Hapus Pengumuman"
                          className="p-2 text-[#d1553f]/70 hover:text-[#d1553f] self-start hover:bg-[#d1553f]/10 rounded-lg transition-colors">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setShowDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetDeleteWarta.x}px, ${offsetDeleteWarta.y}px)` }}>
            <div className="flex items-center gap-4 mb-4" onMouseDown={onMouseDownDeleteWarta} style={{ cursor: 'move' }}>
              <div className="w-12 h-12 bg-[#d1553f]/15 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-[#d1553f]" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Hapus Warta</h3>
                <p className="text-sm text-gray-500">Tindakan tidak dapat dibatalkan</p>
              </div>
            </div>
            <div className="bg-[#d1553f]/10 border border-[#d1553f]/30 rounded-lg p-3 mb-5">
              <p className="text-sm font-medium text-gray-800">{showDeleteConfirm.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatShortDate(showDeleteConfirm.date)}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-[#f2f0ea] cursor-pointer group transition-colors">
                Batal
              </button>
              <button onClick={() => handleDelete(showDeleteConfirm)}
                className="flex-1 px-4 py-2 bg-[#d1553f] text-white rounded-lg text-sm hover:bg-[#b8442f] transition-colors">
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}