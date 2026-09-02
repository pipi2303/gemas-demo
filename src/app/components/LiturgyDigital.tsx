import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { toast } from 'sonner';
import { Liturgy, WorshipType } from '../types';
import { useDraggable } from '../../lib/useDraggable';
import { SearchDropdown } from './ui/SearchDropdown';
import {
  BookOpen, Calendar, Plus, X, Music, Pencil, Trash2, Eye, ChevronRight,
  BookMarked, Mic2, FileText, List, Hash, Download, Copy, Search, Filter,
  CheckCircle, AlertCircle, Piano, Church, Star, Printer
} from 'lucide-react';
import jsPDF from 'jspdf';

// ─── PDF Bulletin Export ───────────────────────────────────────────────────────
function exportBulletinPDF(l: Liturgy) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  let y = 0;

  // ── Header Bar ──
  doc.setFillColor(88, 28, 135);
  doc.rect(0, 0, W, 32, 'F');
  doc.setFillColor(109, 40, 217);
  doc.rect(0, 22, W, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text('GPIB BAHTERA KASIH', W / 2, 11, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Buletin Ibadah', W / 2, 19, { align: 'center' });
  doc.setFontSize(8);
  doc.text(
    l.worshipType.toUpperCase() + '  \u2022  ' +
    new Date(l.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    W / 2, 28.5, { align: 'center' }
  );

  y = 42;

  // ── Tema ──
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 14, 64);
  const themeLines = doc.splitTextToSize(l.theme, W - 36);
  doc.text(themeLines, W / 2, y, { align: 'center' });
  y += themeLines.length * 8 + 2;

  if (l.sermon?.preacher) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(109, 40, 217);
    doc.text(`Pengkhotbah: ${l.sermon.preacher}`, W / 2, y, { align: 'center' });
    y += 7;
  }

  doc.setDrawColor(200, 180, 240);
  doc.setLineWidth(0.4);
  doc.line(16, y, W - 16, y);
  y += 7;

  // ── Bacaan Alkitab ──
  if (l.scripture.length > 0) {
    const blockH = 9 + l.scripture.length * 6.5;
    doc.setFillColor(238, 232, 255);
    doc.roundedRect(14, y - 2, W - 28, blockH, 2, 2, 'F');
    doc.setDrawColor(167, 139, 250);
    doc.roundedRect(14, y - 2, W - 28, blockH, 2, 2, 'S');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(88, 28, 135);
    doc.text('BACAAN ALKITAB', 20, y + 4);
    y += 9;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(31, 14, 64);
    l.scripture.forEach(s => {
      doc.text(`\u2022  ${s.book}  ${s.chapter}:${s.verse}`, 22, y + 1);
      y += 6.5;
    });
    y += 5;
  }

  // ── Tata Urutan ──
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 14, 64);
  doc.text('TATA URUTAN IBADAH', 16, y);
  y += 3;
  doc.setDrawColor(109, 40, 217);
  doc.setLineWidth(0.6);
  doc.line(16, y, 72, y);
  doc.setLineWidth(0.3);
  y += 6;

  doc.setFontSize(8.5);
  l.liturgyOrder.forEach(o => {
    if (y > 270) { doc.addPage(); y = 18; }
    doc.setFillColor(237, 233, 254);
    doc.circle(20, y + 1.8, 3.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(88, 28, 135);
    doc.text(String(o.order), 20, y + 2.6, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 10, 40);
    doc.text(o.title, 26, y + 2.6);
    if (o.content) {
      const cLines = doc.splitTextToSize(o.content, W - 52);
      doc.setFontSize(7.5);
      doc.setTextColor(100, 80, 150);
      doc.text(cLines, 26, y + 8);
      y += cLines.length * 4.5 + 5;
    } else {
      y += 8;
    }
  });

  // ── Nyanyian ──
  if (l.hymns.length > 0) {
    if (y > 245) { doc.addPage(); y = 18; }
    y += 4;
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 14, 64);
    doc.text('NYANYIAN JEMAAT', 16, y);
    y += 3;
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.6);
    doc.line(16, y, 66, y);
    doc.setLineWidth(0.3);
    y += 6;
    const labelMap: Record<string, string> = { opening: 'Pembukaan', offering: 'Persembahan', communion: 'Komuni', closing: 'Penutup' };
    l.hymns.forEach(h => {
      if (y > 272) { doc.addPage(); y = 18; }
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(146, 64, 14);
      doc.text(`[${labelMap[h.type] || h.type}]`, 19, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 10, 40);
      doc.text(`${h.book}  #${h.number}  \u2014  \u201c${h.title}\u201d`, 49, y);
      y += 7;
    });
  }

  // ── Khotbah ──
  if (l.sermon?.title) {
    if (y > 248) { doc.addPage(); y = 18; }
    y += 4;
    const sH = l.sermon.summary ? 38 : 22;
    doc.setFillColor(245, 243, 255);
    doc.roundedRect(14, y - 1, W - 28, sH, 2, 2, 'F');
    doc.setDrawColor(167, 139, 250);
    doc.roundedRect(14, y - 1, W - 28, sH, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(88, 28, 135);
    doc.text('KHOTBAH', 20, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(22, 14, 64);
    const stLines = doc.splitTextToSize(l.sermon.title, W - 44);
    doc.text(stLines, 20, y + 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(75, 55, 120);
    doc.text(`Pengkhotbah: ${l.sermon.preacher}`, 20, y + 12 + stLines.length * 6);
    if (l.sermon.summary) {
      doc.setFontSize(8);
      doc.setTextColor(80, 60, 100);
      const sumLines = doc.splitTextToSize(l.sermon.summary, W - 44);
      doc.text(sumLines, 20, y + 12 + stLines.length * 6 + 6);
    }
    y += sH + 4;
  }

  // ── Footer ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(245, 243, 255);
    doc.rect(0, 286, W, 11, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(109, 40, 217);
    doc.text('GPIB Bahtera Kasih \u2022 Dokumen Internal', W / 2, 292, { align: 'center' });
    doc.setTextColor(160, 130, 200);
    doc.text(`Hal. ${i} / ${totalPages}`, W - 16, 292, { align: 'right' });
  }

  const dateStr = new Date(l.date)
    .toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .replace(/\//g, '-');
  doc.save(`Buletin-${l.worshipType}-${dateStr}.pdf`);
}

// ─── Konstanta ────────────────────────────────────────────────────────────────
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const WORSHIP_TYPES: WorshipType[] = ['Minggu','Keluarga','PJJ','Kategorial','Khusus'];

const TYPE_CONFIG: Record<WorshipType, { gradient: string; bg: string; text: string; border: string }> = {
  Minggu:    { gradient: 'from-blue-600 to-indigo-600',   bg: 'bg-[#f0f7fb]',   text: 'text-[#144f6b]',   border: 'border-[#b8d5e8]' },
  Keluarga:  { gradient: 'from-[#1A77A3] to-[#1A77A3]', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  PJJ:       { gradient: 'from-purple-600 to-violet-600', bg: 'bg-[#f0f7fb]', text: 'text-[#3a7fa0]', border: 'border-[#b8d5e8]' },
  Kategorial:{ gradient: 'from-[#1A77A3] to-[#3a7fa0]',  bg: 'bg-[#f6f4f0]',  text: 'text-[#1A77A3]',  border: 'border-[#e8e4d8]' },
  Khusus:    { gradient: 'from-red-600 to-rose-600',      bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200' },
};

const HYMN_TYPE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  opening:   { label: 'Pembukaan', color: 'text-[#144f6b]', bg: 'bg-[#f0f7fb]' },
  offering:  { label: 'Persembahan', color: 'text-[#1A77A3]', bg: 'bg-[#f6f4f0]' },
  communion: { label: 'Komuni', color: 'text-[#3a7fa0]', bg: 'bg-[#f0f7fb]' },
  closing:   { label: 'Penutup', color: 'text-green-700', bg: 'bg-green-50' },
};

const EMPTY_FORM = {
  date: '',
  worshipType: 'Minggu' as WorshipType,
  theme: '',
  scripture: [{ book: '', chapter: 1, verse: '' }] as { book: string; chapter: number; verse: string }[],
  hymns: [{ type: 'opening' as const, book: 'Kidung Jemaat' as const, number: '', title: '' }] as {
    type: 'opening' | 'offering' | 'communion' | 'closing';
    book: 'Gita Bakti' | 'Kidung Jemaat' | 'Lainnya';
    number: string; title: string;
  }[],
  liturgyOrder: [
    { order: 1, title: 'Prelude', content: '' },
    { order: 2, title: 'Votum & Salam', content: '' },
    { order: 3, title: 'Nyanyian Pembukaan', content: '' },
    { order: 4, title: 'Pengakuan Dosa & Pengampunan', content: '' },
    { order: 5, title: 'Doa Pembacaan Alkitab', content: '' },
    { order: 6, title: 'Pembacaan Alkitab', content: '' },
    { order: 7, title: 'Khotbah', content: '' },
    { order: 8, title: 'Persembahan', content: '' },
    { order: 9, title: 'Doa Syafaat & Bapa Kami', content: '' },
    { order: 10, title: 'Nyanyian Penutup', content: '' },
    { order: 11, title: 'Pengutusan & Berkat', content: '' },
    { order: 12, title: 'Postlude', content: '' },
  ] as { order: number; title: string; content?: string }[],
  sermon: { title: '', preacher: '', summary: '' },
};

// ─── Komponen Utama ────────────────────────────────────────────────────────────
export function LiturgyDigital() {
  const { liturgies, addLiturgy, updateLiturgy, deleteLiturgy, currentUser, can, getMasterDataByCategory } = useApp();
  const pelayanList = getMasterDataByCategory('daftar_pelayan').map(m => m.value);
  const bukuNyanyianList = getMasterDataByCategory('buku_nyanyian').map(m => m.value);
  const BUKU_NYANYIAN = bukuNyanyianList.length ? bukuNyanyianList : ['Kidung Jemaat','Gita Bakti','Lainnya'];
  const tipeNyanyianList = getMasterDataByCategory('tipe_nyanyian_ibadah');
  const TIPE_NYANYIAN_OPTS = tipeNyanyianList.length ? tipeNyanyianList.map(m => ({ value: m.value, label: m.label })) : Object.entries(HYMN_TYPE_LABEL).map(([k,v]) => ({ value: k, label: v.label }));
  const [view, setView] = useState<'grid' | 'detail'>('grid');
  const [selectedLiturgy, setSelectedLiturgy] = useState<Liturgy | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Liturgy | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<WorshipType | 'all'>('all');


  const [activeDetailTab, setActiveDetailTab] = useState<'urutan' | 'nyanyian' | 'alkitab' | 'khotbah'>('urutan');
  const [exportingPdf, setExportingPdf] = useState(false);

  const canCreate = can('Peribadahan & Kegiatan', 'create');
  const canEdit   = can('Peribadahan & Kegiatan', 'edit');
  const canDelete = can('Peribadahan & Kegiatan', 'delete');

  const { offset: offsetTemplate, onMouseDown: onMouseDownTemplate } = useDraggable();
  const { offset: offsetForm, onMouseDown: onMouseDownForm } = useDraggable();
  const { offset: offsetDeleteLiturgy, onMouseDown: onMouseDownDeleteLiturgy } = useDraggable();

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const now = new Date();
    const curM = now.getMonth(), curY = now.getFullYear();
    const thisMonth = liturgies.filter(l => {
      const d = new Date(l.date);
      return d.getMonth() === curM && d.getFullYear() === curY;
    });
    const byType = WORSHIP_TYPES.reduce((acc, t) => {
      acc[t] = liturgies.filter(l => l.worshipType === t).length;
      return acc;
    }, {} as Record<string, number>);
    return { total: liturgies.length, thisMonth: thisMonth.length, byType };
  }, [liturgies]);

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filteredLiturgies = useMemo(() => {
    return [...liturgies]
      .filter(l => {
        const matchSearch = !searchTerm ||
          l.theme.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (l.sermon?.preacher || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          l.worshipType.toLowerCase().includes(searchTerm.toLowerCase());
        const matchType = filterType === 'all' || l.worshipType === filterType;
        return matchSearch && matchType;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [liturgies, searchTerm, filterType]);

  // ── CRUD Handlers ──────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null);
    setFormData({ ...EMPTY_FORM,
      scripture: [{ book: '', chapter: 1, verse: '' }],
      hymns: [{ type: 'opening', book: 'Kidung Jemaat', number: '', title: '' }],
      liturgyOrder: EMPTY_FORM.liturgyOrder.map(o => ({ ...o })),
      sermon: { title: '', preacher: '', summary: '' },
    });
    setShowForm(true);
  };

  const openEdit = (l: Liturgy) => {
    setEditingId(l.id);
    setFormData({
      date: l.date,
      worshipType: l.worshipType,
      theme: l.theme,
      scripture: l.scripture.map(s => ({ ...s })),
      hymns: l.hymns.map(h => ({ ...h })),
      liturgyOrder: l.liturgyOrder.map(o => ({ ...o })),
      sermon: l.sermon ? { ...l.sermon } : { title: '', preacher: '', summary: '' },
    });
    setShowForm(true);
    setView('grid');
  };

  const useAsTemplate = (l: Liturgy) => {
    setEditingId(null);
    setFormData({
      date: '',
      worshipType: l.worshipType,
      theme: '',
      scripture: l.scripture.map(s => ({ ...s })),
      hymns: l.hymns.map(h => ({ ...h })),
      liturgyOrder: l.liturgyOrder.map(o => ({ ...o })),
      sermon: { title: '', preacher: l.sermon?.preacher || '', summary: '' },
    });
    setShowTemplateModal(false);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.date || !formData.theme.trim()) {
      toast.error('Mohon lengkapi Tanggal dan Tema Liturgi');
      return;
    }
    const basePayload = {
      date: formData.date,
      worshipType: formData.worshipType,
      theme: formData.theme,
      scripture: formData.scripture.filter(s => s.book.trim()),
      hymns: formData.hymns.filter(h => h.number.trim() || h.title.trim()),
      liturgyOrder: formData.liturgyOrder.filter(o => o.title.trim()),
      sermon: formData.sermon.title.trim() ? formData.sermon : undefined,
    };
    if (editingId) {
      updateLiturgy(editingId, basePayload);
      if (selectedLiturgy && selectedLiturgy.id === editingId) {
        setSelectedLiturgy({ ...selectedLiturgy, ...basePayload });
      }
    } else {
      addLiturgy(basePayload);
    }
    setShowForm(false);
    setEditingId(null);
  };

  const handleDelete = (l: Liturgy) => {
    deleteLiturgy(l.id);
    if (selectedLiturgy?.id === l.id) { setSelectedLiturgy(null); setView('grid'); }
    setShowDeleteConfirm(null);
  };

  const handleExportPDF = (l: Liturgy) => {
    setExportingPdf(true);
    try { exportBulletinPDF(l); }
    finally { setTimeout(() => setExportingPdf(false), 1200); }
  };

  // ── Scripture helpers ──────────────────────────────────────────────────────
  const addScripture = () => setFormData(p => ({ ...p, scripture: [...p.scripture, { book: '', chapter: 1, verse: '' }] }));
  const removeScripture = (i: number) => setFormData(p => ({ ...p, scripture: p.scripture.filter((_, idx) => idx !== i) }));
  const updateScripture = (i: number, field: string, value: string | number) =>
    setFormData(p => { const s = [...p.scripture]; s[i] = { ...s[i], [field]: value }; return { ...p, scripture: s }; });

  // ── Hymn helpers ──────────────────────────────────────────────────────────
  const addHymn = () => setFormData(p => ({ ...p, hymns: [...p.hymns, { type: 'closing', book: 'Kidung Jemaat', number: '', title: '' }] }));
  const removeHymn = (i: number) => setFormData(p => ({ ...p, hymns: p.hymns.filter((_, idx) => idx !== i) }));
  const updateHymn = (i: number, field: string, value: string) =>
    setFormData(p => { const h = [...p.hymns]; h[i] = { ...h[i], [field]: value } as any; return { ...p, hymns: h }; });

  // ── Order helpers ──────────────────────────────────────────────────────────
  const addOrder = () => setFormData(p => ({ ...p, liturgyOrder: [...p.liturgyOrder, { order: p.liturgyOrder.length + 1, title: '', content: '' }] }));
  const removeOrder = (i: number) => setFormData(p => ({ ...p, liturgyOrder: p.liturgyOrder.filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, order: idx + 1 })) }));
  const updateOrder = (i: number, field: string, value: string) =>
    setFormData(p => { const o = [...p.liturgyOrder]; o[i] = { ...o[i], [field]: value } as any; return { ...p, liturgyOrder: o }; });

  const formatDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const formatShort = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-6 space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-violet-600 rounded-xl flex items-center justify-center shadow">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Liturgi Digital</h1>
            <p className="text-sm text-gray-500">Tata Ibadah terstruktur & Nyanyian Jemaat</p>
          </div>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <button onClick={() => setShowTemplateModal(true)}
              className="flex items-center gap-2 px-4 py-2 border border-purple-300 text-[#3a7fa0] bg-[#f0f7fb] rounded-lg hover:bg-[#f0ede5] transition-colors text-sm">
              <Copy className="w-4 h-4" /> Salin Template
            </button>
            <button onMouseDown={e=>e.preventDefault()} onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-[#3a7fa0] text-white rounded-lg hover:bg-[#144f6b] transition-colors text-sm">
              <Plus className="w-4 h-4" /> Buat Liturgi
            </button>
          </div>
        )}
      </div>

      {/* ── Filter & Search ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-3">
        <SearchDropdown<any>
          value={searchTerm}
          onChange={v => setSearchTerm(v)}
          placeholder="Cari tema, pengkhotbah..."
          items={liturgies}
          filterFn={(l, q) => {
            const lq = q.toLowerCase();
            return l.theme?.toLowerCase().includes(lq)
              || l.sermon?.preacher?.toLowerCase().includes(lq);
          }}
          renderResult={l => (
            <div>
              <p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{l.theme}</p>
              <p style={{fontSize:'11px',color:'#64748b',margin:0}}>{l.date} · {l.sermon?.preacher||'-'}</p>
            </div>
          )}
          onSelect={l => setSearchTerm(l.theme)}
        />
        <div className="flex gap-1.5 flex-wrap">
          {(['all', ...WORSHIP_TYPES] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterType === t
                  ? 'bg-[#3a7fa0] text-white'
                  : t === 'all' ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : `${TYPE_CONFIG[t as WorshipType]?.bg} ${TYPE_CONFIG[t as WorshipType]?.text} hover:opacity-80`
              }`}>
              {t === 'all' ? 'Semua' : t}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{filteredLiturgies.length} liturgi</span>
      </div>

      {/* ── Grid View ───────────────────────────────────────────────────── */}
      {view === 'grid' && (
        filteredLiturgies.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Belum ada data liturgi</p>
            {canCreate && (
              <button onMouseDown={e=>e.preventDefault()} onClick={openAdd} className="mt-4 px-4 py-2 bg-[#f0ede5] text-[#3a7fa0] rounded-lg text-sm hover:bg-purple-200 transition-colors">
                + Buat Liturgi Baru
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredLiturgies.map(l => {
              const cfg = TYPE_CONFIG[l.worshipType];
              return (
                <div 
                  key={l.id} 
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:bg-[#f2f0ea] transition-all cursor-pointer group"
                  onClick={() => { setSelectedLiturgy(l); setActiveDetailTab('urutan'); setView('detail'); }}
                >
                  {/* Gradient Header */}
                  <div className={`bg-gradient-to-br ${cfg.gradient} p-4 text-white group-hover:opacity-90 transition-opacity`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20">{l.worshipType}</span>
                      <span className="text-xs text-white/70">{formatShort(l.date)}</span>
                    </div>
                    <h3 className="font-bold text-base leading-tight line-clamp-2">{l.theme}</h3>
                    {l.sermon?.preacher && (
                      <p className="text-xs text-white/80 mt-1.5 flex items-center gap-1">
                        <Mic2 className="w-3 h-3" />{l.sermon.preacher}
                      </p>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-4">
                    {/* Bacaan */}
                    {l.scripture.length > 0 && (
                      <div className="flex items-start gap-2 mb-3">
                        <BookMarked className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.text}`} />
                        <div>
                          {l.scripture.map((s, i) => (
                            <p key={i} className="text-xs text-gray-600">{s.book} {s.chapter}:{s.verse}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Hymns summary */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {l.hymns.slice(0, 4).map((h, i) => {
                        const hl = HYMN_TYPE_LABEL[h.type];
                        return (
                          <span key={i} className={`px-2 py-0.5 rounded-full text-xs font-medium ${hl.bg} ${hl.color}`}>
                            {h.book === 'Kidung Jemaat' ? 'KJ' : h.book === 'Gita Bakti' ? 'GB' : ''} {h.number}
                          </span>
                        );
                      })}
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
                      <span className="flex items-center gap-1"><List className="w-3 h-3" />{l.liturgyOrder.length} urutan</span>
                      <span className="flex items-center gap-1"><Music className="w-3 h-3" />{l.hymns.length} nyanyian</span>
                      <span className="flex items-center gap-1"><BookMarked className="w-3 h-3" />{l.scripture.length} bacaan</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { setSelectedLiturgy(l); setActiveDetailTab('urutan'); setView('detail'); }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#1A77A3] text-white rounded-lg text-xs hover:bg-[#144f6b] transition-colors">
                        <Eye className="w-3.5 h-3.5" /> Lihat
                      </button>
                      <button onClick={() => handleExportPDF(l)} data-tooltip="Export PDF Buletin"
                        className="px-3 py-1.5 border border-[#b8d5e8] text-[#1A77A3] rounded-lg text-xs hover:bg-white transition-colors">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      {canEdit && (
                        <button onMouseDown={e=>e.preventDefault()} onClick={() => openEdit(l)} data-tooltip="Edit"
                          className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-white transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setShowDeleteConfirm(l)} data-tooltip="Hapus"
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

      {/* ── Detail View ──────────────────────────────────────────────────── */}
      {view === 'detail' && selectedLiturgy && (() => {
        const l = selectedLiturgy;
        const cfg = TYPE_CONFIG[l.worshipType];
        return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className={`bg-gradient-to-br ${cfg.gradient} px-6 py-5`}>
              <button onClick={() => setView('grid')} className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm mb-4 transition-colors">
                <ChevronRight className="w-4 h-4 rotate-180" /> Kembali
              </button>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white mb-2 inline-block">{l.worshipType}</span>
                  <h2 className="text-xl font-bold text-white mt-1">{l.theme}</h2>
                  <p className="text-white/75 text-sm mt-1">{formatDate(l.date)}</p>
                  {l.sermon?.preacher && (
                    <p className="text-white/70 text-sm mt-0.5 flex items-center gap-1.5">
                      <Mic2 className="w-3.5 h-3.5" />{l.sermon.preacher}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {canEdit && (
                    <button onMouseDown={e=>e.preventDefault()} onClick={() => openEdit(l)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 text-white rounded-lg text-sm hover:bg-white/30 transition-colors">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                  )}
                  <button
                    onClick={() => handleExportPDF(l)}
                    disabled={exportingPdf}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 text-white rounded-lg text-sm hover:bg-white/30 transition-colors disabled:opacity-60">
                    <Download className="w-3.5 h-3.5" />
                    {exportingPdf ? 'Mengekspor...' : 'Export PDF'}
                  </button>
                  <button onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 text-white rounded-lg text-sm hover:bg-white/30 transition-colors">
                    <Printer className="w-3.5 h-3.5" /> Cetak
                  </button>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 bg-gray-50">
              {([
                { key: 'urutan', label: 'Urutan Liturgi', icon: List },
                { key: 'nyanyian', label: 'Nyanyian', icon: Music },
                { key: 'alkitab', label: 'Bacaan Alkitab', icon: BookMarked },
                { key: 'khotbah', label: 'Khotbah', icon: Mic2 },
              ] as const).map(tab => (
                <button key={tab.key} onClick={() => setActiveDetailTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeDetailTab === tab.key
                      ? 'border-purple-600 text-[#3a7fa0] bg-white'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  <tab.icon className="w-4 h-4" />{tab.label}
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* Tab: Urutan Liturgi */}
              {activeDetailTab === 'urutan' && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <List className="w-4 h-4 text-purple-600" /> Tata Urutan Ibadah
                  </h3>
                  <div className="space-y-2">
                    {l.liturgyOrder.map((o, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                        <span className="w-7 h-7 bg-[#f0ede5] text-[#3a7fa0] rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{o.order}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 text-sm">{o.title}</p>
                          {o.content && <p className="text-xs text-gray-500 mt-0.5">{o.content}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab: Nyanyian */}
              {activeDetailTab === 'nyanyian' && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Music className="w-4 h-4 text-purple-600" /> Nyanyian Jemaat
                  </h3>
                  {l.hymns.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">Belum ada nyanyian</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {l.hymns.map((h, i) => {
                        const hl = HYMN_TYPE_LABEL[h.type];
                        return (
                          <div key={i} className={`p-4 rounded-xl border ${cfg.border} ${cfg.bg}`}>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${hl.bg} ${hl.color}`}>{hl.label}</span>
                            <div className="mt-2">
                              <p className="font-bold text-gray-900">{h.book} #{h.number}</p>
                              <p className="text-sm text-gray-600 italic">"{h.title}"</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Bacaan Alkitab */}
              {activeDetailTab === 'alkitab' && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <BookMarked className="w-4 h-4 text-purple-600" /> Bacaan Alkitab
                  </h3>
                  {l.scripture.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">Belum ada bacaan Alkitab</p>
                  ) : (
                    <div className="space-y-3">
                      {l.scripture.map((s, i) => (
                        <div key={i} className={`p-4 rounded-xl border ${cfg.border} ${cfg.bg} flex items-center gap-3`}>
                          <div className={`w-8 h-8 rounded-lg bg-white/70 flex items-center justify-center ${cfg.text} font-bold text-sm`}>{i + 1}</div>
                          <div>
                            <p className={`font-bold ${cfg.text}`}>{s.book}</p>
                            <p className="text-sm text-gray-700">Pasal {s.chapter} : {s.verse}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Khotbah */}
              {activeDetailTab === 'khotbah' && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Mic2 className="w-4 h-4 text-purple-600" /> Informasi Khotbah
                  </h3>
                  {!l.sermon?.title ? (
                    <p className="text-gray-400 text-sm text-center py-8">Belum ada informasi khotbah</p>
                  ) : (
                    <div className={`p-5 rounded-xl border ${cfg.border} ${cfg.bg}`}>
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Judul Khotbah</p>
                        <p className={`text-lg font-bold ${cfg.text}`}>{l.sermon.title}</p>
                      </div>
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Pengkhotbah</p>
                        <p className="font-medium text-gray-800 flex items-center gap-2">
                          <Mic2 className={`w-4 h-4 ${cfg.text}`} />{l.sermon.preacher}
                        </p>
                      </div>
                      {l.sermon.summary && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Ringkasan</p>
                          <p className="text-sm text-gray-700 leading-relaxed italic">{l.sermon.summary}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TEMPLATE MODAL */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setShowTemplateModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetTemplate.x}px, ${offsetTemplate.y}px)` }}>
            <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDownTemplate}>
              <div>
                <h2 className="text-lg font-bold text-white">Salin sebagai Template</h2>
                <p className="text-purple-200 text-sm">Pilih liturgi untuk dijadikan dasar</p>
              </div>
              <button onClick={() => setShowTemplateModal(false)} data-tooltip="Tutup" className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {liturgies.map(l => {
                const cfg = TYPE_CONFIG[l.worshipType];
                return (
                  <button key={l.id} onClick={() => useAsTemplate(l)}
                    className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-[#f0f7fb] transition-all group">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 bg-gradient-to-br ${cfg.gradient} rounded-lg flex-shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm truncate">{l.theme}</p>
                        <p className="text-xs text-gray-400">{l.worshipType} · {formatShort(l.date)}</p>
                      </div>
                      <Copy className="w-4 h-4 text-gray-300 group-hover:text-purple-500 transition-colors flex-shrink-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* FORM MODAL */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetForm.x}px, ${offsetForm.y}px)` }}>
            <div className="px-6 py-5 flex items-center justify-between flex-shrink-0" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDownForm}>
              <div>
                <h2 className="text-xl font-bold text-white">{editingId ? 'Edit Liturgi' : 'Buat Liturgi Baru'}</h2>
                <p className="text-purple-200 text-sm mt-0.5">Tata Ibadah Gereja GPIB Bahtera Kasih</p>
              </div>
              <button onClick={() => setShowForm(false)} data-tooltip="Tutup" className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
                {/* Info Dasar */}
                <section className="bg-[#f0f7fb] rounded-xl p-4 border border-[#f0ede5] space-y-4">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-purple-600" />
                    <span className="font-semibold text-gray-800 text-sm">Informasi Dasar</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal Ibadah *</label>
                      <input type="date" value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))} required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Jenis Ibadah *</label>
                      <select autoFocus value={formData.worshipType} onChange={e => setFormData(p => ({ ...p, worshipType: e.target.value as WorshipType }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                        {WORSHIP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Tema Ibadah *</label>
                    <input type="text" value={formData.theme} onChange={e => setFormData(p => ({ ...p, theme: e.target.value }))}
                      placeholder="Misal: Kasih yang Sempurna" required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                </section>

                {/* Bacaan Alkitab */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><BookMarked className="w-4 h-4 text-blue-600" /><span className="font-semibold text-gray-800 text-sm">Bacaan Alkitab</span></div>
                    <button type="button" onClick={addScripture}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-[#f0ede5] text-[#144f6b] rounded-lg text-xs hover:bg-blue-200 transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Tambah
                    </button>
                  </div>
                  {formData.scripture.map((s, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input type="text" value={s.book} onChange={e => updateScripture(i, 'book', e.target.value)} placeholder="Kitab"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="number" value={s.chapter} onChange={e => updateScripture(i, 'chapter', parseInt(e.target.value) || 1)} min={1} placeholder="Ps."
                        className="w-16 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="text" value={s.verse} onChange={e => updateScripture(i, 'verse', e.target.value)} placeholder="Ay. 1-5"
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      {formData.scripture.length > 1 && (
                        <button type="button" onClick={() => removeScripture(i)} data-tooltip="Hapus bacaan" className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </section>

                {/* Nyanyian */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><Music className="w-4 h-4 text-[#1A77A3]" /><span className="font-semibold text-gray-800 text-sm">Nyanyian Jemaat</span></div>
                    <button type="button" onClick={addHymn}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-[#f0ede5] text-[#1A77A3] rounded-lg text-xs hover:bg-[#e8e4d8] transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Tambah
                    </button>
                  </div>
                  {formData.hymns.map((h, i) => (
                    <div key={i} className="grid grid-cols-4 gap-2 items-center">
                      <select value={h.type} onChange={e => updateHymn(i, 'type', e.target.value)}
                        className="px-2 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1A77A3]">
                        {TIPE_NYANYIAN_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <select value={h.book} onChange={e => updateHymn(i, 'book', e.target.value)}
                        className="px-2 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1A77A3]">
                        {BUKU_NYANYIAN.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <input type="text" value={h.number} onChange={e => updateHymn(i, 'number', e.target.value)} placeholder="No. lagu"
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" />
                      <div className="flex gap-1">
                        <input type="text" value={h.title} onChange={e => updateHymn(i, 'title', e.target.value)} placeholder="Judul"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" />
                        {formData.hymns.length > 1 && (
                          <button type="button" onClick={() => removeHymn(i)} data-tooltip="Hapus nyanyian" className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </section>

                {/* Urutan Liturgi */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><List className="w-4 h-4 text-green-600" /><span className="font-semibold text-gray-800 text-sm">Urutan Tata Ibadah</span></div>
                    <button type="button" onClick={addOrder}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs hover:bg-green-200 transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Tambah
                    </button>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {formData.liturgyOrder.map((o, i) => (
                      <div key={i} className="flex gap-2 items-center bg-gray-50 rounded-xl p-2">
                        <span className="w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">{o.order}</span>
                        <input type="text" value={o.title} onChange={e => updateOrder(i, 'title', e.target.value)} placeholder="Judul bagian..."
                          className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                        <input type="text" value={o.content || ''} onChange={e => updateOrder(i, 'content', e.target.value)} placeholder="Keterangan (opsional)"
                          className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                        {formData.liturgyOrder.length > 3 && (
                          <button type="button" onClick={() => removeOrder(i)} data-tooltip="Hapus urutan" className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                {/* Khotbah */}
                <section className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
                  <div className="flex items-center gap-2"><Mic2 className="w-4 h-4 text-gray-600" /><span className="font-semibold text-gray-800 text-sm">Informasi Khotbah</span></div>
                  <input type="text" value={formData.sermon.title} onChange={e => setFormData(p => ({ ...p, sermon: { ...p.sermon, title: e.target.value } }))}
                    placeholder="Judul khotbah"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  {pelayanList.length > 0 ? (
                    <select value={formData.sermon.preacher} onChange={e => setFormData(p => ({ ...p, sermon: { ...p.sermon, preacher: e.target.value } }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                      <option value="">— Pilih Pengkhotbah —</option>
                      {pelayanList.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={formData.sermon.preacher} onChange={e => setFormData(p => ({ ...p, sermon: { ...p.sermon, preacher: e.target.value } }))}
                      placeholder="Nama pengkhotbah"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  )}
                  <textarea value={formData.sermon.summary} onChange={e => setFormData(p => ({ ...p, sermon: { ...p.sermon, summary: e.target.value } }))}
                    placeholder="Ringkasan khotbah (opsional)" rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
                </section>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex gap-3 justify-end flex-shrink-0">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-100 transition-colors">
                  Batal
                </button>
                <button type="submit"
                  className="flex items-center gap-2 px-5 py-2 bg-[#3a7fa0] text-white rounded-lg text-sm hover:bg-[#144f6b] transition-colors">
                  <CheckCircle className="w-4 h-4" />
                  {editingId ? 'Simpan Perubahan' : 'Simpan Liturgi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ───────────────────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={()=>setShowDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offsetDeleteLiturgy.x}px, ${offsetDeleteLiturgy.y}px)` }}>
            <div className="flex items-center gap-4 mb-4" onMouseDown={onMouseDownDeleteLiturgy} style={{ cursor: 'move' }}>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Hapus Liturgi</h3>
                <p className="text-sm text-gray-500">Tindakan tidak dapat dibatalkan</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5">
              <p className="text-sm font-medium text-gray-800">{showDeleteConfirm.theme}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatShort(showDeleteConfirm.date)} · {showDeleteConfirm.worshipType}</p>
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