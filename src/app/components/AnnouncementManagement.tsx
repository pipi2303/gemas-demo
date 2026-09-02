import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { toast } from 'sonner';
import { Megaphone, Plus, Edit2, Trash2, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

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
    switch (priority) {
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
            <AlertTriangle className="w-3 h-3" />
            Mendesak
          </span>
        );
      case 'important':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded">
            <AlertCircle className="w-3 h-3" />
            Penting
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-[#f0ede5] text-blue-800 rounded">
            <Info className="w-3 h-3" />
            Normal
          </span>
        );
    }
  };

  const activeAnnouncements = announcements.filter(a => a.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Pengumuman</h1>
          <p className="text-gray-600">Kelola pengumuman untuk jemaat dan pengurus</p>
        </div>
        <button
          onMouseDown={e=>e.preventDefault()}
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#1A77A3] text-white rounded-lg hover:bg-[#144f6b]"
        >
          <Plus className="w-4 h-4" />
          Buat Pengumuman
        </button>
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
                announcement.priority === 'urgent'
                  ? 'border-red-500'
                  : announcement.priority === 'important'
                  ? 'border-orange-500'
                  : 'border-blue-500'
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
                
                {(can('Pelayanan Kasih & Komunikasi', 'edit') || can('Pelayanan Kasih & Komunikasi', 'delete')) && (
                  <div className="flex gap-2 ml-4">
                    {can('Pelayanan Kasih & Komunikasi', 'edit') && (
                      <button
                        onMouseDown={e=>e.preventDefault()}
                        onClick={() => handleEdit(announcement)}
                        className="p-2 text-blue-600 hover:bg-[#f0f7fb] rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                    {can('Pelayanan Kasih & Komunikasi', 'delete') && (
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