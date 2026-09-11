import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { toast } from 'sonner';
import { Megaphone, Plus, Edit2, Trash2, AlertTriangle, AlertCircle, Info, Download } from 'lucide-react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Master Data 'prioritas_pengumuman' selalu diseed dengan value 'normal'/'important'/'urgent',
// TAPI mengedit label item Master Data di menu admin ikut menimpa value-nya (value = label).
// Jadi kalau admin pernah mengedit label kategori ini, value tersimpan bisa berubah jadi
// teks Indonesia ('Mendesak', dst) dan perbandingan literal di bawah tidak akan cocok lagi.
// Fungsi ini menambah jalur cadangan lewat kata kunci supaya badge & warna tidak diam-diam
// berhenti muncul kalau itu terjadi.
function priorityRank(priority: string): 'urgent' | 'important' | 'normal' {
  const p = (priority || '').toLowerCase();
  if (p === 'urgent' || p.includes('mendesak') || p.includes('darurat') || p.includes('urgent')) return 'urgent';
  if (p === 'important' || p.includes('penting') || p.includes('important')) return 'important';
  return 'normal';
}

export function AnnouncementManagement() {
  const { announcements, sectors, addAnnouncement, updateAnnouncement, deleteAnnouncement, currentUser, can, getMasterDataByCategory } = useApp();
  const prioritasOpts = getMasterDataByCategory('prioritas_pengumuman').map((m: any) => m.value);
  const PRIORITY_OPTS = prioritasOpts.length ? prioritasOpts : ['normal', 'important', 'urgent'];
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    priority: 'normal' as 'normal' | 'important' | 'urgent',
    targetRole: [] as string[],
    targetSectors: [] as string[],
    expiresAt: '',
    isActive: true
  });

  const handleSubmit = () => {
    if (!formData.title || !formData.content) {
      toast.error('Judul dan konten harus diisi');
      return;
    }

    if (!currentUser) return;

    if (editingId) {
      updateAnnouncement(editingId, formData);
      toast.success('Pengumuman berhasil diperbarui!');
    } else {
      addAnnouncement({
        ...formData,
        authorId: currentUser.id,
        authorName: currentUser.name,
        targetRole: formData.targetRole.length > 0 ? formData.targetRole as any : undefined,
        targetSectors: formData.targetSectors.length > 0 ? formData.targetSectors : undefined,
        expiresAt: formData.expiresAt || undefined
      });
      toast.success('Pengumuman berhasil ditambahkan!');
    }

    resetForm();
  };

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      priority: 'normal',
      targetRole: [],
      targetSectors: [],
      expiresAt: '',
      isActive: true
    });
    setEditingId(null);
    setShowModal(false);
  };

  const openAddForm = () => {
    setFormData({
      title: '',
      content: '',
      priority: 'normal',
      targetRole: [],
      targetSectors: [],
      expiresAt: '',
      isActive: true
    });
    setEditingId(null);
    setShowModal(true);
  };

  const handleEdit = (announcement: any) => {
    setFormData({
      title: announcement.title,
      content: announcement.content,
      priority: announcement.priority,
      targetRole: announcement.targetRole || [],
      targetSectors: announcement.targetSectors || [],
      expiresAt: announcement.expiresAt || '',
      isActive: announcement.isActive
    });
    setEditingId(announcement.id);
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Yakin ingin menghapus pengumuman ini?')) {
      deleteAnnouncement(id);
      toast.success('Pengumuman berhasil dihapus!');
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priorityRank(priority)) {
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-[#fdf1ef] text-[#d1553f] rounded">
            <AlertTriangle className="w-3 h-3" />
            Mendesak
          </span>
        );
      case 'important':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-[#fdf6e8] text-[#caa04a] rounded">
            <AlertCircle className="w-3 h-3" />
            Penting
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-[#f6f4f0] text-[#9c9486] rounded">
            <Info className="w-3 h-3" />
            Normal
          </span>
        );
    }
  };

  // Audit gap fix: dulu expiresAt & targetSectors cuma metadata kosmetik yang ditampilkan
  // sebagai label, tidak pernah benar-benar dipakai menyaring apa yang tampil. Sekarang:
  // - Pengumuman yang sudah lewat tanggal "Berlaku hingga" otomatis disembunyikan.
  // - Pengumuman dengan Target Sektor disaring untuk role Ketua Sektor supaya cuma lihat
  //   yang relevan untuk sektornya (assignedSectorId) -- role lain (Admin/Majelis/dst) tetap
  //   melihat semua karena perlu visibilitas lintas sektor untuk pengawasan.
  const now = new Date();
  const visibleAnnouncements = announcements.filter(a => {
    if (!a.isActive) return false;
    if (a.expiresAt && new Date(a.expiresAt) < now) return false;
    if (a.targetSectors && a.targetSectors.length > 0 && currentUser?.role === 'Ketua Sektor') {
      const mySectorId = (currentUser as any)?.assignedSectorId;
      if (!mySectorId || !a.targetSectors.includes(mySectorId)) return false;
    }
    return true;
  });
  const activeAnnouncements = visibleAnnouncements;

  // Unduh daftar pengumuman aktif sebagai PDF (jsPDF + autoTable, berkop surat navy/gold
  // GPIB Trinitas -- konsisten dengan ekspor menu lain).
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const NAVY: [number, number, number] = [20, 79, 107];
    const GOLD: [number, number, number] = [202, 160, 74];
    const SLATE: [number, number, number] = [51, 65, 85];

    const drawHeader = () => {
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, pageWidth, 22, 'F');
      doc.setFillColor(...GOLD);
      doc.rect(0, 22, pageWidth, 1.4, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('DAFTAR WARTA & PENGUMUMAN', pageWidth / 2, 9, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text('GPIB Trinitas', pageWidth / 2, 15, { align: 'center' });
      doc.setFontSize(7.5);
      doc.text(`Dicetak ${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}`, pageWidth / 2, 19.5, { align: 'center' });
    };
    drawHeader();

    const rows = visibleAnnouncements.map((a, i) => [
      String(i + 1),
      a.title,
      priorityRank(a.priority) === 'urgent' ? 'Mendesak' : priorityRank(a.priority) === 'important' ? 'Penting' : 'Normal',
      a.content,
      a.authorName,
      format(new Date(a.createdAt), 'dd MMM yyyy'),
      a.expiresAt ? format(new Date(a.expiresAt), 'dd MMM yyyy') : '-',
    ]);
    autoTable(doc, {
      startY: 28,
      head: [['No', 'Judul', 'Prioritas', 'Isi', 'Oleh', 'Tanggal', 'Berlaku Hingga']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: SLATE, textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 45 }, 2: { cellWidth: 20 }, 3: { cellWidth: 90 }, 4: { cellWidth: 32 }, 5: { cellWidth: 24 }, 6: { cellWidth: 'auto' } },
      margin: { left: 12, right: 12 },
      didDrawPage: () => { if (doc.internal.getNumberOfPages() > 1) drawHeader(); },
    });

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.4);
      doc.line(12, pageHeight - 10, pageWidth - 12, pageHeight - 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text('Dokumen Internal GPIB Trinitas', 12, pageHeight - 6);
      doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - 12, pageHeight - 6, { align: 'right' });
    }

    const now2 = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    doc.save(`Warta-Pengumuman-GPIB-Trinitas-${pad(now2.getDate())}${pad(now2.getMonth()+1)}${now2.getFullYear()}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Warta & Pengumuman</h1>
          <p className="text-gray-600">Kelola pengumuman untuk jemaat dan pengurus</p>
          <p className="text-xs text-gray-400 mt-1">
            Terpisah dari daftar "Pengumuman" bebas di dalam buletin cetak E-Warta Jemaat — pengumuman di sini muncul
            di seluruh aplikasi (termasuk notifikasi), bukan hanya di buletin.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can('announcements', 'export') && (
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-4 py-2 border border-[#b8d5e8] text-[#144f6b] bg-[#f0f7fb] rounded-lg hover:bg-[#e3eef6] transition-colors"
            >
              <Download className="w-4 h-4" /> Unduh PDF
            </button>
          )}
          {can('announcements', 'create') && (
            <button
              onMouseDown={e=>e.preventDefault()}
              onClick={openAddForm}
              className="flex items-center gap-2 px-4 py-2 bg-[#144f6b] text-white rounded-lg hover:bg-[#144f6b]"
            >
              <Plus className="w-4 h-4" />
              Buat Pengumuman
            </button>
          )}
        </div>
      </div>

      {/* Announcements Grid */}
      <div className="grid grid-cols-1 gap-4">
        {activeAnnouncements.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            <Megaphone className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Belum ada pengumuman</p>
          </div>
        ) : (
          activeAnnouncements.map((announcement) => (
            <div
              key={announcement.id}
              className={`bg-white rounded-lg shadow p-6 border-l-4 ${
                priorityRank(announcement.priority) === 'urgent'
                  ? 'border-[#d1553f]'
                  : priorityRank(announcement.priority) === 'important'
                  ? 'border-[#caa04a]'
                  : 'border-[#9c9486]'
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold">{announcement.title}</h3>
                    {getPriorityBadge(announcement.priority)}
                  </div>
                  <p className="text-gray-600 whitespace-pre-wrap">{announcement.content}</p>
                </div>
                
                {(can('announcements', 'edit') || can('announcements', 'delete')) && (
                  <div className="flex gap-2 ml-4">
                    {can('announcements', 'edit') && (
                      <button
                        onMouseDown={e=>e.preventDefault()}
                        onClick={() => handleEdit(announcement)}
                        className="p-2 text-[#144f6b] hover:bg-[#f0f7fb] rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                    {can('announcements', 'delete') && (
                      <button
                        onClick={() => handleDelete(announcement.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-gray-600 pt-4 border-t border-gray-200">
                <span>Oleh: {announcement.authorName}</span>
                <span>•</span>
                <span>{format(new Date(announcement.createdAt), 'dd MMM yyyy, HH:mm')}</span>
                {announcement.expiresAt && (
                  <>
                    <span>•</span>
                    <span>Berlaku hingga: {format(new Date(announcement.expiresAt), 'dd MMM yyyy')}</span>
                  </>
                )}
                {announcement.targetRole && (
                  <>
                    <span>•</span>
                    <span>Target: {announcement.targetRole.join(', ')}</span>
                  </>
                )}
                {announcement.targetSectors && (
                  <>
                    <span>•</span>
                    <span>
                      Sektor: {announcement.targetSectors.map(id => 
                        sectors.find(s => s.id === id)?.name
                      ).join(', ')}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingId ? 'Edit Pengumuman' : 'Buat Pengumuman Baru'}
              </DialogTitle>
              <DialogDescription>
                {editingId ? 'Perbarui pengumuman yang ada' : 'Buat pengumuman baru'}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">Judul</Label>
                <Input
                  autoFocus
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  placeholder="Judul pengumuman"
                />
              </div>

              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">Konten</Label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  rows={6}
                  placeholder="Isi pengumuman"
                />
              </div>

              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">Prioritas</Label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                >
                  {PRIORITY_OPTS.map((p: string) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  Berlaku Hingga (Opsional)
                </Label>
                <Input
                  type="date"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                />
              </div>

              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Sektor (Opsional)
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {sectors.map(sector => (
                    <label key={sector.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.targetSectors.includes(sector.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              targetSectors: [...formData.targetSectors, sector.id]
                            });
                          } else {
                            setFormData({
                              ...formData,
                              targetSectors: formData.targetSectors.filter(id => id !== sector.id)
                            });
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{sector.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={resetForm}
                variant="outline"
              >
                Batal
              </Button>
              <Button
                onClick={handleSubmit}
              >
                {editingId ? 'Perbarui' : 'Publikasikan'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}