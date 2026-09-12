import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { toast } from 'sonner';
import { Resource, ResourceType, ResourceCategory } from '../types';
import { getOfficerNamesByKeyword } from '../lib/worshipOfficers';
import { api } from '../../lib/apiClient';
import { 
  Video, Download, Eye, FileText, Upload, X, Play, Music,
  File, Image, Plus, Pencil, Trash2, Calendar, User, ExternalLink,
  BookOpen, Headphones, Film, FileImage
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

// Audit gap fix: sebelumnya "upload file" di modul ini cuma simulasi
// (URL.createObjectURL, mati begitu tab ditutup/reload) -- lihat catatan di
// handleRealFileSelect di bawah. Untuk type Khotbah/Materi PJJ/Artikel/Dokumen,
// file PDF/DOC sekarang benar-benar disimpan (base64, pola sama seperti
// AssetDocument di AssetManagement.tsx) di collection terpisah resourceFiles.
// Untuk type Video/Audio, file TIDAK diupload ke database sama sekali --
// database production cuma 1 CPU/512MB, tidak cocok untuk menyimpan file
// video/audio yang bisa puluhan MB. Untuk kedua type itu, user cukup isi
// link eksternal (YouTube/Google Drive/SoundCloud/dst).
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024; // 2MB, sama seperti AssetDocument
const usesExternalLink = (t: ResourceType) => t === 'Video' || t === 'Audio';
const formatBytes = (bytes: number) => {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(2)} MB`;
};

interface ResourceFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileData: string; // base64
  uploadedAt: string;
  uploadedBy: string;
}

export function ResourceLibrary() {
  const { resources, addResource, updateResource, deleteResource, worshipSchedules, can, currentUser } = useApp();
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [filterType, setFilterType] = useState('All');
  const [filterCategory, setFilterCategory] = useState('All');

  // Dokumen (PDF/DOC) yang benar-benar tersimpan -- lihat catatan di atas file
  const [resourceFiles, setResourceFiles] = useState<ResourceFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  useEffect(() => {
    api.get<ResourceFile[]>('/api/data/resourceFiles').then(all => {
      setResourceFiles(Array.isArray(all) ? all : []);
    }).catch(() => {});
  }, []);
  
  // Form State
  const [formData, setFormData] = useState({
    title: '',
    type: 'Khotbah' as ResourceType,
    category: 'Pembinaan' as ResourceCategory,
    description: '',
    author: '',
    uploadedBy: '',
    fileUrl: '',
    fileId: '',
    externalUrl: '',
    thumbnailUrl: '',
    fileSize: '',
    duration: '',
    uploadDate: new Date().toISOString().split('T')[0],
    bibleVerse: '',
    fullTranscript: '',
    worshipScheduleId: '',
    tagsInput: ''
  });

  // File state -- untuk type Dokumen/Materi PJJ/Artikel/Khotbah (upload asli, base64)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Thumbnail: BELUM diubah -- masih simulasi blob URL sementara (lihat catatan
  // di bawah file), di luar cakupan perbaikan Fase 1 modul ini.
  const [selectedThumbnail, setSelectedThumbnail] = useState<File | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Audit gap fix: dulu hanya simulasi (URL.createObjectURL, hilang begitu tab
  // ditutup/reload). Sekarang file benar-benar diupload sebagai base64 ke
  // collection resourceFiles (pola sama seperti AssetDocument), hanya untuk
  // type yang bukan Video/Audio (lihat usesExternalLink di atas file).
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      toast.error(`Ukuran file melebihi batas 2MB (file ini ${formatBytes(file.size)})`);
      return;
    }
    setSelectedFile(file);
    setUploadingFile(true);
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('Gagal membaca file'));
        reader.readAsDataURL(file);
      });
      const id = 'resourcefile' + Date.now();
      const doc: ResourceFile = {
        id,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        fileData: base64,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser?.name || 'Administrator',
      };
      await api.put(`/api/data/resourceFiles/${id}`, doc);
      setResourceFiles(prev => [doc, ...prev]);
      setFormData(prev => ({
        ...prev,
        fileId: id,
        fileSize: formatBytes(file.size),
      }));
      toast.success(`File "${file.name}" berhasil diunggah`);
    } catch (err) {
      toast.error('Gagal mengunggah file. Silakan coba lagi');
      setSelectedFile(null);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedThumbnail(file);
      setFormData(prev => ({ 
        ...prev, 
        thumbnailUrl: URL.createObjectURL(file) // Temporary URL for preview
      }));
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      type: 'Khotbah',
      category: 'Pembinaan',
      description: '',
      author: '',
      uploadedBy: '',
      fileUrl: '',
      fileId: '',
      externalUrl: '',
      thumbnailUrl: '',
      fileSize: '',
      duration: '',
      uploadDate: new Date().toISOString().split('T')[0],
      bibleVerse: '',
      fullTranscript: '',
      worshipScheduleId: '',
      tagsInput: ''
    });
    setSelectedFile(null);
    setSelectedThumbnail(null);
  };

  const parseTags = (input: string) =>
    input.split(',').map(t => t.trim()).filter(Boolean);

  const handleScheduleSelect = (scheduleId: string) => {
    const ws = worshipSchedules.find(w => w.id === scheduleId);
    setFormData(prev => {
      const next = { ...prev, worshipScheduleId: scheduleId };
      if (ws) {
        if (!next.bibleVerse) next.bibleVerse = ws.bible_verse || '';
        if (!next.author) next.author = getOfficerNamesByKeyword(ws, 'pengkhotbah', 'preacher') || prev.author;
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.author) {
      toast.error('Mohon lengkapi Judul dan Pembuat/Penulis');
      return;
    }
    addResource({
      title: formData.title,
      type: formData.type,
      category: formData.category,
      description: formData.description,
      author: formData.author,
      uploadedBy: formData.uploadedBy,
      fileId: usesExternalLink(formData.type) ? undefined : (formData.fileId || undefined),
      externalUrl: usesExternalLink(formData.type) ? (formData.externalUrl || undefined) : undefined,
      thumbnailUrl: formData.thumbnailUrl,
      fileSize: formData.fileSize,
      duration: formData.duration,
      publishedDate: formData.uploadDate,
      tags: parseTags(formData.tagsInput),
      downloads: 0,
      views: 0,
      bibleVerse: formData.bibleVerse,
      fullTranscript: formData.fullTranscript,
      worshipScheduleId: formData.worshipScheduleId || undefined,
    });
    resetForm();
    setIsUploadDialogOpen(false);
  };

  const handleEdit = (resource: Resource) => {
    setIsEditMode(true);
    setSelectedResource(resource);
    setIsDetailDialogOpen(false);
    setFormData({
      title: resource.title,
      type: resource.type,
      category: resource.category,
      description: resource.description || '',
      author: resource.author || '',
      uploadedBy: resource.uploadedBy || '',
      fileUrl: resource.fileUrl || '',
      fileId: resource.fileId || '',
      externalUrl: resource.externalUrl || '',
      thumbnailUrl: resource.thumbnailUrl || '',
      fileSize: resource.fileSize || '',
      duration: resource.duration || '',
      // Bug fix: field ini sebelumnya baca resource.uploadDate yang TIDAK ADA
      // di tipe Resource (hanya publishedDate) -- akibatnya tanggal upload
      // selalu ter-reset ke hari ini setiap kali materi diedit.
      uploadDate: resource.publishedDate || new Date().toISOString().split('T')[0],
      bibleVerse: resource.bibleVerse || '',
      fullTranscript: resource.fullTranscript || '',
      worshipScheduleId: resource.worshipScheduleId || '',
      tagsInput: (resource.tags || []).join(', ')
    });
    setIsUploadDialogOpen(true);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.author) {
      toast.error('Mohon lengkapi Judul dan Pembuat/Penulis');
      return;
    }
    if (selectedResource) {
      updateResource(selectedResource.id, {
        title: formData.title,
        type: formData.type,
        category: formData.category,
        description: formData.description,
        author: formData.author,
        uploadedBy: formData.uploadedBy,
        fileId: usesExternalLink(formData.type) ? undefined : (formData.fileId || undefined),
        externalUrl: usesExternalLink(formData.type) ? (formData.externalUrl || undefined) : undefined,
        thumbnailUrl: formData.thumbnailUrl,
        fileSize: formData.fileSize,
        duration: formData.duration,
        publishedDate: formData.uploadDate,
        tags: parseTags(formData.tagsInput),
        bibleVerse: formData.bibleVerse,
        fullTranscript: formData.fullTranscript,
        worshipScheduleId: formData.worshipScheduleId || undefined,
      });
    }
    resetForm();
    setIsUploadDialogOpen(false);
    setIsEditMode(false);
    setSelectedResource(null);
  };

  const handleViewDetail = (resource: Resource) => {
    setSelectedResource(resource);
    setIsDetailDialogOpen(true);
    updateResource(resource.id, { views: (resource.views || 0) + 1 });
  };

  const handleDelete = async (resource: Resource) => {
    if (!window.confirm(`Hapus materi:\n\n${resource.title}\n\nData tidak dapat dikembalikan.`)) return;
    deleteResource(resource.id);
    // Bersihkan juga file fisik (base64) yang tersimpan di resourceFiles, kalau ada
    if (resource.fileId) {
      try {
        await api.delete(`/api/data/resourceFiles/${resource.fileId}`);
        setResourceFiles(prev => prev.filter(f => f.id !== resource.fileId));
      } catch {
        // non-blocking: materi tetap terhapus walau cleanup file gagal
      }
    }
    setIsDetailDialogOpen(false);
  };

  // Unified opener: dokumen tersimpan (fileId, decode base64) atau link
  // eksternal (externalUrl, Video/Audio). Bug fix: counter downloads dulu
  // selalu bertambah walau tidak ada file/link sama sekali -- sekarang hanya
  // bertambah kalau benar-benar ada sesuatu yang dibuka.
  const openResourceFile = (resource: Resource) => {
    if (resource.externalUrl) {
      window.open(resource.externalUrl, '_blank');
      return true;
    }
    if (resource.fileId) {
      const doc = resourceFiles.find(f => f.id === resource.fileId);
      if (!doc) {
        toast.error('File tidak ditemukan (mungkin sudah dihapus)');
        return false;
      }
      try {
        const byteChars = atob(doc.fileData);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: doc.mimeType });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return true;
      } catch {
        toast.error('Gagal membuka file');
        return false;
      }
    }
    toast.error('Belum ada file atau link untuk materi ini');
    return false;
  };

  const handleDownload = (resource: Resource) => {
    const opened = openResourceFile(resource);
    if (opened) {
      updateResource(resource.id, { downloads: (resource.downloads || 0) + 1 });
    }
  };

  const filteredResources = resources.filter(r => {
    const matchesType = filterType === 'All' || r.type === filterType;
    const matchesCategory = filterCategory === 'All' || r.category === filterCategory;
    return matchesType && matchesCategory;
  });

  // Calculate statistics
  const stats = {
    total: resources.length,
    khotbah: resources.filter(r => r.type === 'Khotbah').length,
    video: resources.filter(r => r.type === 'Video').length,
    totalViews: resources.reduce((sum, r) => sum + (r.views || 0), 0)
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Khotbah': return <BookOpen className="w-4 h-4" />;
      case 'Video': return <Film className="w-4 h-4" />;
      case 'Audio': return <Headphones className="w-4 h-4" />;
      case 'Artikel': return <FileText className="w-4 h-4" />;
      case 'Materi PJJ': return <BookOpen className="w-4 h-4" />;
      case 'Dokumen': return <File className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Materi Pembinaan</h1>
          <p className="text-gray-600">Repository khotbah, materi PJJ, dan artikel edukasi</p>
        </div>
        {can('resource-library', 'create') && (
          <button 
            onClick={() => {
              resetForm();
              setIsEditMode(false);
              setSelectedResource(null);
              setIsUploadDialogOpen(true);
            }}
            className="px-4 py-2 bg-[#144f6b] text-white rounded-lg hover:bg-[#144f6b] transition-colors flex items-center gap-2"
          >
            <Upload className="w-5 h-5" />
            Upload Materi
          </button>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#144f6b] rounded-lg shadow-sm border border-blue-400 p-5 text-white">
          <p className="text-blue-100 text-sm mb-1">Total Materi</p>
          <p className="text-3xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-[#b8d5e8] p-5">
          <p className="text-[#3a7fa0] text-sm mb-1">Khotbah</p>
          <p className="text-3xl font-bold text-purple-900">{stats.khotbah}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-red-200 p-5">
          <p className="text-red-700 text-sm mb-1">Video</p>
          <p className="text-3xl font-bold text-red-900">{stats.video}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-green-200 p-5">
          <p className="text-green-700 text-sm mb-1">Total Views</p>
          <p className="text-3xl font-bold text-green-900">{stats.totalViews.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="All">Semua Tipe</option>
            <option value="Khotbah">Khotbah</option>
            <option value="Materi PJJ">Materi PJJ</option>
            <option value="Artikel">Artikel</option>
            <option value="Video">Video</option>
            <option value="Audio">Audio</option>
            <option value="Dokumen">Dokumen</option>
          </select>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="All">Semua Kategori</option>
            <option value="Pembinaan">Pembinaan</option>
            <option value="Liturgi">Liturgi</option>
            <option value="Musik">Musik</option>
            <option value="Administrasi">Administrasi</option>
            <option value="Lainnya">Lainnya</option>
          </select>

          <div className="flex-1 text-right text-sm text-gray-600 self-center">
            Menampilkan {filteredResources.length} dari {resources.length} materi
          </div>
        </div>
      </div>

      {/* Resources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredResources.map((resource) => (
          <div 
            key={resource.id} 
            onClick={() => handleViewDetail(resource)}
            className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
          >
            {resource.thumbnailUrl ? (
              <img
                src={resource.thumbnailUrl}
                alt={resource.title}
                className="w-full h-40 object-cover"
              />
            ) : (
              <div className={`w-full h-40 flex items-center justify-center ${
                resource.type === 'Khotbah' ? 'bg-gradient-to-br from-blue-100 to-blue-200' :
                resource.type === 'Video' ? 'bg-gradient-to-br from-red-100 to-red-200' :
                resource.type === 'Audio' ? 'bg-gradient-to-br from-purple-100 to-purple-200' :
                resource.type === 'Artikel' ? 'bg-gradient-to-br from-green-100 to-green-200' :
                'bg-gradient-to-br from-gray-100 to-gray-200'
              }`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                  resource.type === 'Khotbah' ? 'bg-[#144f6b]' :
                  resource.type === 'Video' ? 'bg-red-500' :
                  resource.type === 'Audio' ? 'bg-[#3a7fa0]' :
                  resource.type === 'Artikel' ? 'bg-green-500' :
                  'bg-gray-500'
                } bg-opacity-80`}>
                  <span className="text-white text-2xl">
                    {getTypeIcon(resource.type)}
                  </span>
                </div>
              </div>
            )}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                  resource.type === 'Khotbah' ? 'bg-[#f0ede5] text-blue-800' :
                  resource.type === 'Video' ? 'bg-red-100 text-red-800' :
                  resource.type === 'Audio' ? 'bg-[#f0ede5] text-purple-800' :
                  resource.type === 'Artikel' ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {getTypeIcon(resource.type)}
                  {resource.type}
                </span>
                <span className="text-xs text-gray-500">{resource.category}</span>
              </div>

              <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{resource.title}</h3>
              
              {resource.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{resource.description}</p>
              )}

              {resource.author && (
                <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {resource.author}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                <span className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  {resource.views || 0}
                </span>
                <span className="flex items-center gap-1">
                  <Download className="w-3 h-3" />
                  {resource.downloads || 0}
                </span>
                {resource.fileSize && (
                  <span>{resource.fileSize}</span>
                )}
                {resource.duration && (
                  <span>{resource.duration}</span>
                )}
              </div>

              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={() => handleViewDetail(resource)}
                  className="flex-1 px-3 py-2 bg-[#144f6b] text-white rounded-lg hover:bg-[#144f6b] transition-colors text-sm flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Lihat
                </button>
                <button
                  onClick={() => handleDownload(resource)}
                  className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-[#f2f0ea] cursor-pointer group transition-colors text-sm"
                  data-tooltip="Unduh"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Upload/Edit Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsUploadDialogOpen(false);
          setIsEditMode(false);
          setSelectedResource(null);
          resetForm();
        }
      }}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 pt-6 pb-4 flex-shrink-0">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-gray-900">
                {isEditMode ? 'Edit Materi Pembinaan' : 'Upload Materi Baru'}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                {isEditMode ? 'Ubah informasi materi yang sudah diupload.' : 'Upload khotbah, video, audio, atau dokumen pembinaan.'}
              </DialogDescription>
            </DialogHeader>
          </div>
          
          {/* Form */}
          <form onSubmit={isEditMode ? handleUpdate : handleSubmit} className="flex flex-col flex-1 min-h-0">
            {/* Scrollable Content */}
            <div className="overflow-y-auto flex-1 px-6 min-h-0">
              <div className="space-y-6 py-4">
                {/* Informasi Dasar */}
                <div className="bg-[#f0f7fb] rounded-lg p-4 border border-blue-100">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-[#144f6b] rounded-lg flex items-center justify-center">
                      <FileText className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Informasi Dasar</h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="title">Judul Materi *</Label>
                      <Input
                        id="title"
                        name="title"
                        value={formData.title}
                        onChange={handleInputChange}
                        placeholder="Contoh: Renungan Minggu Paskah"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="type">Tipe Materi *</Label>
                        <select
                          id="type"
                          name="type"
                          value={formData.type}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                          required
                        >
                          <option value="Khotbah">Khotbah</option>
                          <option value="Materi PJJ">Materi PJJ</option>
                          <option value="Artikel">Artikel</option>
                          <option value="Video">Video</option>
                          <option value="Audio">Audio</option>
                          <option value="Dokumen">Dokumen</option>
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="category">Kategori *</Label>
                        <select
                          id="category"
                          name="category"
                          value={formData.category}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                          required
                        >
                          <option value="Pembinaan">Pembinaan</option>
                          <option value="Liturgi">Liturgi</option>
                          <option value="Musik">Musik</option>
                          <option value="Administrasi">Administrasi</option>
                          <option value="Lainnya">Lainnya</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="description">Deskripsi Materi</Label>
                      <Textarea
                        id="description"
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        placeholder="Jelaskan isi atau ringkasan materi..."
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="tagsInput">Tag / Musim Liturgi (pisahkan dengan koma)</Label>
                      <Input
                        id="tagsInput"
                        name="tagsInput"
                        value={formData.tagsInput}
                        onChange={handleInputChange}
                        placeholder="Contoh: Mingguan, Paskah"
                      />
                    </div>
                  </div>
                </div>

                {/* Upload File */}
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <Upload className="w-4 h-4 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">File Upload</h3>
                  </div>
                  <div className="space-y-4">
                    {usesExternalLink(formData.type) ? (
                      <div>
                        <Label htmlFor="externalUrl">Link {formData.type} * (YouTube, Google Drive, SoundCloud, dll.)</Label>
                        <div className="mt-2">
                          <Input
                            id="externalUrl"
                            name="externalUrl"
                            type="url"
                            value={formData.externalUrl}
                            onChange={handleInputChange}
                            placeholder="https://..."
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          File {formData.type.toLowerCase()} tidak diupload ke server -- cukup isi link eksternal.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <Label htmlFor="file">File Materi {!isEditMode && '*'} (PDF, DOC, PPT, max 2MB)</Label>
                        <div className="mt-2">
                          <input
                            id="file"
                            name="file"
                            type="file"
                            onChange={handleFileSelect}
                            accept=".pdf,.doc,.docx,.ppt,.pptx"
                            disabled={uploadingFile}
                            className="block w-full text-sm text-gray-500
                              file:mr-4 file:py-2 file:px-4
                              file:rounded-lg file:border-0
                              file:text-sm file:font-semibold
                              file:bg-green-50 file:text-green-700
                              hover:file:bg-green-100 cursor-pointer"
                          />
                        </div>
                        {uploadingFile && (
                          <p className="text-xs text-gray-500 mt-2">Mengunggah file...</p>
                        )}
                        {selectedFile && !uploadingFile && (
                          <p className="text-xs text-green-600 mt-2">
                            ✓ File terpilih: {selectedFile.name} ({formData.fileSize})
                          </p>
                        )}
                        {isEditMode && formData.fileId && !selectedFile && (
                          <p className="text-xs text-gray-500 mt-2">
                            File saat ini: {resourceFiles.find(f => f.id === formData.fileId)?.fileName || formData.fileId}
                          </p>
                        )}
                      </div>
                    )}
                    <div>
                      <Label htmlFor="thumbnail">Thumbnail/Cover (Opsional)</Label>
                      <div className="mt-2">
                        <input
                          id="thumbnail"
                          name="thumbnail"
                          type="file"
                          onChange={handleThumbnailSelect}
                          accept="image/*"
                          className="block w-full text-sm text-gray-500
                            file:mr-4 file:py-2 file:px-4
                            file:rounded-lg file:border-0
                            file:text-sm file:font-semibold
                            file:bg-[#f0f7fb] file:text-blue-700
                            hover:file:bg-[#f0ede5] cursor-pointer"
                        />
                      </div>
                      {selectedThumbnail && (
                        <div className="mt-3">
                          <img 
                            src={formData.thumbnailUrl} 
                            alt="Preview" 
                            className="w-32 h-32 object-cover rounded-lg border border-gray-200"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Metadata */}
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-[#f0ede5] rounded-lg flex items-center justify-center">
                      <User className="w-4 h-4 text-purple-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Metadata</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="author">Pembuat/Penulis *</Label>
                      <Input
                        id="author"
                        name="author"
                        value={formData.author}
                        onChange={handleInputChange}
                        placeholder="Nama pengkhotbah/penulis"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="uploadDate">Tanggal Upload</Label>
                      <Input
                        id="uploadDate"
                        name="uploadDate"
                        type="date"
                        value={formData.uploadDate}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div>
                      <Label htmlFor="duration">Durasi (untuk Audio/Video)</Label>
                      <Input
                        id="duration"
                        name="duration"
                        value={formData.duration}
                        onChange={handleInputChange}
                        placeholder="Contoh: 45:30"
                      />
                    </div>
                    <div>
                      <Label htmlFor="uploadedBy">Diupload Oleh</Label>
                      <Input
                        id="uploadedBy"
                        name="uploadedBy"
                        value={formData.uploadedBy}
                        onChange={handleInputChange}
                        placeholder="Nama uploader"
                      />
                    </div>
                  </div>
                </div>

                {/* Khotbah — Arsip Khotbah & Renungan */}
                {formData.type === 'Khotbah' && (
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 bg-[#f0ede5] rounded-lg flex items-center justify-center">
                        <BookOpen className="w-4 h-4 text-[#144f6b]" />
                      </div>
                      <h3 className="font-semibold text-gray-900">Detail Khotbah</h3>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="worshipScheduleId">Jadwal Ibadah Terkait</Label>
                        <select
                          id="worshipScheduleId"
                          name="worshipScheduleId"
                          value={formData.worshipScheduleId}
                          onChange={e => handleScheduleSelect(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                          <option value="">— Tidak ditautkan —</option>
                          {[...worshipSchedules].sort((a, b) => b.date.localeCompare(a.date)).map(ws => (
                            <option key={ws.id} value={ws.id}>
                              {new Date(ws.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} — {ws.title}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-400 mt-1">Menautkan mengisi otomatis Nats Alkitab &amp; Pelayan Firman dari jadwal ibadah tersebut (bila masih kosong).</p>
                      </div>
                      <div>
                        <Label htmlFor="bibleVerse">Nats Alkitab</Label>
                        <Input
                          id="bibleVerse"
                          name="bibleVerse"
                          value={formData.bibleVerse}
                          onChange={handleInputChange}
                          placeholder="Contoh: Filipi 4:4-9"
                        />
                      </div>
                      <div>
                        <Label htmlFor="fullTranscript">Naskah Khotbah Lengkap</Label>
                        <Textarea
                          id="fullTranscript"
                          name="fullTranscript"
                          value={formData.fullTranscript}
                          onChange={handleInputChange}
                          placeholder="Tempel naskah lengkap khotbah di sini..."
                          rows={6}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0">
              <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsUploadDialogOpen(false)}
                >
                  <X className="w-4 h-4 mr-1.5" />
                  Batal
                </Button>
                <Button type="submit">
                  <Upload className="w-4 h-4 mr-1.5" />
                  {isEditMode ? 'Simpan Perubahan' : 'Upload Materi'}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-3xl p-0 gap-0 max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 pt-6 pb-4 flex-shrink-0">
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <DialogTitle className="text-xl font-bold text-gray-900 mb-2">
                    {selectedResource?.title}
                  </DialogTitle>
                  <DialogDescription className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                      selectedResource?.type === 'Khotbah' ? 'bg-[#f0ede5] text-blue-800' :
                      selectedResource?.type === 'Video' ? 'bg-red-100 text-red-800' :
                      selectedResource?.type === 'Audio' ? 'bg-[#f0ede5] text-purple-800' :
                      selectedResource?.type === 'Artikel' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedResource && getTypeIcon(selectedResource.type)}
                      {selectedResource?.type}
                    </span>
                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full">
                      {selectedResource?.category}
                    </span>
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>
          
          {/* Scrollable Content */}
          <div className="overflow-y-auto flex-1 px-6 min-h-0">
            <div className="space-y-4 py-4">
              {/* Thumbnail/Preview */}
              {selectedResource?.thumbnailUrl ? (
                <img
                  src={selectedResource.thumbnailUrl}
                  alt={selectedResource.title}
                  className="w-full h-64 object-cover rounded-lg border border-gray-200"
                />
              ) : (
                <div className={`w-full h-64 rounded-lg flex items-center justify-center ${
                  selectedResource?.type === 'Khotbah' ? 'bg-gradient-to-br from-blue-100 to-blue-200' :
                  selectedResource?.type === 'Video' ? 'bg-gradient-to-br from-red-100 to-red-200' :
                  selectedResource?.type === 'Audio' ? 'bg-gradient-to-br from-purple-100 to-purple-200' :
                  selectedResource?.type === 'Artikel' ? 'bg-gradient-to-br from-green-100 to-green-200' :
                  'bg-gradient-to-br from-gray-100 to-gray-200'
                } border border-gray-200`}>
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center ${
                    selectedResource?.type === 'Khotbah' ? 'bg-[#144f6b]' :
                    selectedResource?.type === 'Video' ? 'bg-red-500' :
                    selectedResource?.type === 'Audio' ? 'bg-[#3a7fa0]' :
                    selectedResource?.type === 'Artikel' ? 'bg-green-500' :
                    'bg-gray-500'
                  } bg-opacity-80`}>
                    <span className="text-white text-4xl">
                      {selectedResource && getTypeIcon(selectedResource.type)}
                    </span>
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#f0f7fb] rounded-lg p-3 text-center border border-blue-200">
                  <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
                    <Eye className="w-4 h-4" />
                    <span className="text-xs font-medium">Views</span>
                  </div>
                  <p className="text-xl font-bold text-blue-900">{selectedResource?.views || 0}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                  <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                    <Download className="w-4 h-4" />
                    <span className="text-xs font-medium">Downloads</span>
                  </div>
                  <p className="text-xl font-bold text-green-900">{selectedResource?.downloads || 0}</p>
                </div>
                <div className="bg-[#f0f7fb] rounded-lg p-3 text-center border border-purple-200">
                  <div className="flex items-center justify-center gap-1 text-purple-600 mb-1">
                    <File className="w-4 h-4" />
                    <span className="text-xs font-medium">Size</span>
                  </div>
                  <p className="text-lg font-bold text-purple-900">{selectedResource?.fileSize || '-'}</p>
                </div>
              </div>

              {/* Description */}
              {selectedResource?.description && (
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-gray-600" />
                    <h3 className="font-semibold text-gray-900">Deskripsi</h3>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedResource.description}</p>
                </div>
              )}

              {/* Metadata */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-5 h-5 text-gray-600" />
                  <h3 className="font-semibold text-gray-900">Informasi Detail</h3>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selectedResource?.author && (
                    <div>
                      <p className="text-gray-600 mb-0.5">Pembuat/Penulis</p>
                      <p className="font-medium text-gray-900">{selectedResource.author}</p>
                    </div>
                  )}
                  {selectedResource?.uploadedBy && (
                    <div>
                      <p className="text-gray-600 mb-0.5">Diupload Oleh</p>
                      <p className="font-medium text-gray-900">{selectedResource.uploadedBy}</p>
                    </div>
                  )}
                  {selectedResource?.uploadDate && (
                    <div>
                      <p className="text-gray-600 mb-0.5">Tanggal Upload</p>
                      <p className="font-medium text-gray-900">
                        {new Date(selectedResource.uploadDate).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  )}
                  {selectedResource?.duration && (
                    <div>
                      <p className="text-gray-600 mb-0.5">Durasi</p>
                      <p className="font-medium text-gray-900">{selectedResource.duration}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Card */}
              <div className="bg-[#f0f7fb] rounded-lg p-4 border border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 mb-1">Download Materi</p>
                    <p className="text-xs text-gray-600">
                      {selectedResource?.fileSize && `Ukuran file: ${selectedResource.fileSize}`}
                    </p>
                  </div>
                  <Button 
                    onClick={() => selectedResource && handleDownload(selectedResource)}
                    size="sm"
                  >
                    <Download className="w-4 h-4 mr-1.5" />
                    Download
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDetailDialogOpen(false)} className="flex-1">
                <X className="w-3.5 h-3.5 mr-1.5" />
                Tutup
              </Button>
              {can('resource-library', 'edit') && (
                <Button type="button" onClick={() => handleEdit(selectedResource!)} className="flex-1">
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Edit
                </Button>
              )}
              {can('resource-library', 'delete') && (
                <Button type="button" onClick={() => handleDelete(selectedResource!)} variant="destructive" className="flex-1">
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Hapus
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}