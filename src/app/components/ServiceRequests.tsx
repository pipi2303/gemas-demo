import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { toast } from 'sonner';
import { api } from '../../lib/apiClient';
import { ServiceRequest, ServiceRequestType, ServiceStatus } from '../types';
import { 
  Heart, HandHeart, Calendar, MapPin, Phone, CheckCircle, 
  Clock, XCircle, Plus, X, User, FileText, Pencil, Trash2, Eye
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { SearchDropdown } from './ui/SearchDropdown';

export function ServiceRequestsComponent({ onNavigate }: { onNavigate?: (page: string) => void } = {}) {
  const { serviceRequests, members, getMasterDataByCategory, addServiceRequest, updateServiceRequest, deleteServiceRequest, aidDistributions, addAidDistribution, currentUser, can, setPendingLetterDraft } = useApp();
  const serviceTypeList = getMasterDataByCategory('jenis_pelayanan').map(m => m.value) as ServiceRequestType[];
  const SERVICE_TYPE_LIST: ServiceRequestType[] = serviceTypeList.length ? serviceTypeList : ['Kunjungan','Doa Khusus','Pelayanan Duka','Konseling','Lainnya'];
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);

  // memberSearch state for SearchDropdown display
  const [memberSearch, setMemberSearch] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    type: 'Kunjungan' as ServiceRequestType,
    requestedBy: '',
    memberId: '',
    phone: '',
    address: '',
    description: '',
    preferredDate: '',
    preferredTime: '',
    status: 'Pending' as ServiceStatus,
    notes: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleMemberSelect = (memberId: string) => {
    if (memberId) {
      const member = members.find(m => m.id === memberId);
      if (member) {
        setFormData(prev => ({
          ...prev,
          memberId,
          requestedBy: member.fullName,
          phone: member.phone,
          address: member.address
        }));
      }
    } else {
      setFormData(prev => ({
        ...prev,
        memberId: '',
        requestedBy: '',
        phone: '',
        address: ''
      }));
    }
  };

  const resetForm = () => {
    setFormData({
      type: 'Kunjungan',
      requestedBy: '',
      memberId: '',
      phone: '',
      address: '',
      description: '',
      preferredDate: '',
      preferredTime: '',
      status: 'Pending',
      notes: ''
    });
    setMemberSearch('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.requestedBy || !formData.phone || !formData.description) {
      toast.error('Mohon lengkapi Nama, Telepon, dan Deskripsi Permohonan');
      return;
    }
    addServiceRequest(formData);
    resetForm();
    setIsCreateDialogOpen(false);
  };

  const handleEdit = (request: ServiceRequest) => {
    setIsEditMode(true);
    setSelectedRequest(request);
    setIsDetailDialogOpen(false);
    setFormData({
      type: request.type,
      requestedBy: request.requestedBy,
      memberId: request.memberId || '',
      phone: request.phone,
      address: request.address,
      description: request.description,
      preferredDate: request.preferredDate || '',
      preferredTime: request.preferredTime || '',
      status: request.status,
      notes: request.notes || ''
    });
    setMemberSearch(request.memberId ? members.find(m => m.id === request.memberId)?.fullName || '' : '');
    setIsCreateDialogOpen(true);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.requestedBy || !formData.phone || !formData.description) {
      toast.error('Mohon lengkapi Nama, Telepon, dan Deskripsi Permohonan');
      return;
    }
    if (selectedRequest) updateServiceRequest(selectedRequest.id, formData);
    resetForm();
    setIsCreateDialogOpen(false);
    setIsEditMode(false);
    setSelectedRequest(null);
  };

  const handleViewDetail = (request: ServiceRequest) => {
    setSelectedRequest(request);
    setIsDetailDialogOpen(true);
  };

  // Audit gap fix (item #8, Pelayanan Kasih & Doa): sebelumnya hapus permohonan
  // tidak pernah cek apakah sudah ada Distribusi Bantuan atau Surat Keluar yang
  // ditindaklanjuti dari permohonan ini -- begitu dihapus, referensi
  // (serviceRequestId / relatedId) di data lain jadi yatim dan tidak bisa
  // dilacak balik, padahal jejak lacak (audit trail) adalah tujuan utama
  // modul ini. Ini cuma peringatan (bukan blokir) karena mungkin memang ada
  // alasan sah untuk tetap menghapus.
  const handleDelete = async (request: ServiceRequest) => {
    const linkedAid = aidDistributions.some(a => a.serviceRequestId === request.id);
    let linkedLetterCount = 0;
    try {
      const letters = await api.get<any[]>('/api/data/outgoingLetters');
      linkedLetterCount = (letters || []).filter(l => l.relatedModule === 'ServiceRequest' && l.relatedId === request.id).length;
    } catch {
      // non-blocking: kalau gagal cek, lanjutkan tanpa info surat terkait
    }
    const warnLines: string[] = [];
    if (linkedAid) warnLines.push('- Sudah ada Distribusi Bantuan yang ditindaklanjuti dari permohonan ini');
    if (linkedLetterCount > 0) warnLines.push(`- ${linkedLetterCount} Surat Keluar sudah dibuat terkait permohonan ini`);
    const warning = warnLines.length
      ? `\n\nPERINGATAN: permohonan ini masih tertaut ke data lain:\n${warnLines.join('\n')}\nData tertaut TIDAK ikut terhapus dan referensinya akan jadi yatim (tidak bisa dilacak balik ke permohonan ini).`
      : '';
    if (!window.confirm(`Hapus permohonan:\n\n${request.type} - ${request.requestedBy}${warning}\n\nData tidak dapat dikembalikan.`)) return;
    deleteServiceRequest(request.id);
    setIsDetailDialogOpen(false);
  };

  const handleStatusChange = (request: ServiceRequest, newStatus: ServiceStatus) => {
    updateServiceRequest(request.id, { status: newStatus });
    setSelectedRequest(prev => prev ? { ...prev, status: newStatus } : prev);
  };

  // Integrasi Surat-Menyurat (audit gap fix): begitu permohonan diakonia SELESAI,
  // staf bisa langsung membuat draf Surat Keterangan Pelayanan Diakonia.
  const handleBuatSurat = (request: ServiceRequest) => {
    setPendingLetterDraft({
      relatedModule: 'ServiceRequest',
      relatedId: request.id,
      memberId: request.memberId,
      recipientName: request.requestedBy,
      subject: `Surat Keterangan Pelayanan Diakonia — ${request.requestedBy}`,
      body: `Dengan ini menerangkan bahwa Saudara/i ${request.requestedBy} telah menerima pelayanan diakonia berupa ${request.type} sehubungan dengan: ${request.description}.`,
    });
    onNavigate?.('letters-outgoing');
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'Pending': 'bg-[#f0ede5] text-[#144f6b] border-[#e8e4d8]',
      'Scheduled': 'bg-[#f0ede5] text-blue-800 border-[#b8d5e8]',
      'Completed': 'bg-green-100 text-green-800 border-green-200',
      'Cancelled': 'bg-red-100 text-red-800 border-red-200'
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  // Calculate statistics
  const stats = {
    total: serviceRequests.length,
    pending: serviceRequests.filter(r => r.status === 'Pending').length,
    scheduled: serviceRequests.filter(r => r.status === 'Scheduled').length,
    completed: serviceRequests.filter(r => r.status === 'Completed').length
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Permohonan Layanan</h1>
          <p className="text-gray-600">Kelola permohonan kunjungan, doa khusus, dan pelayanan duka</p>
        </div>
        {can('service-requests', 'create') && (
          <button 
            onClick={() => {
              resetForm();
              setIsEditMode(false);
              setSelectedRequest(null);
              setIsCreateDialogOpen(true);
            }}
            className="px-4 py-2 bg-[#144f6b] text-white rounded-lg hover:bg-[#144f6b] transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Permohonan Baru
          </button>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#144f6b] rounded-lg shadow-sm border border-blue-400 p-5 text-white">
          <p className="text-blue-100 text-sm mb-1">Total Permohonan</p>
          <p className="text-3xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-[#e8e4d8] p-5">
          <p className="text-[#144f6b] text-sm mb-1">Pending</p>
          <p className="text-3xl font-bold text-[#144f6b]">{stats.pending}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-[#b8d5e8] p-5">
          <p className="text-[#144f6b] text-sm mb-1">Scheduled</p>
          <p className="text-3xl font-bold text-blue-900">{stats.scheduled}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-green-200 p-5">
          <p className="text-green-700 text-sm mb-1">Completed</p>
          <p className="text-3xl font-bold text-green-900">{stats.completed}</p>
        </div>
      </div>

      {/* Service Requests Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {serviceRequests.map((request) => (
          <div 
            key={request.id} 
            onClick={() => handleViewDetail(request)}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">{request.requestedBy}</h3>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                  request.type === 'Kunjungan' ? 'bg-[#f0ede5] text-blue-800' :
                  request.type === 'Doa Khusus' ? 'bg-[#f0ede5] text-purple-800' :
                  request.type === 'Pelayanan Duka' ? 'bg-gray-100 text-gray-800' :
                  request.type === 'Konseling' ? 'bg-green-100 text-green-800' :
                  'bg-orange-100 text-orange-800'
                }`}>
                  {request.type}
                </span>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(request.status)}`}>
                {request.status}
              </span>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex items-start gap-3 text-sm">
                <Phone className="w-4 h-4 text-gray-400 mt-0.5" />
                <span className="text-gray-600">{request.phone}</span>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                <span className="text-gray-600">{request.address}</span>
              </div>
              {request.preferredDate && (
                <div className="flex items-start gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                  <span className="text-gray-600">
                    {new Date(request.preferredDate).toLocaleDateString('id-ID')} | {request.preferredTime}
                  </span>
                </div>
              )}
            </div>

            <p className="text-sm text-gray-600 mb-4 pb-4 border-b border-gray-100 line-clamp-2">
              {request.description}
            </p>

            {request.notes && (
              <div className="bg-[#f0f7fb] border border-[#b8d5e8] rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800 line-clamp-2">{request.notes}</p>
              </div>
            )}

            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              {/* Audit gap fix: tombol ubah status sebelumnya tidak digate sama
                  sekali -- siapa pun yang bisa lihat halaman ini (termasuk role
                  hanya-lihat) bisa menjadwalkan/menolak/menyelesaikan permohonan. */}
              {can('service-requests', 'edit') && request.status === 'Pending' && (
                <>
                  <button 
                    onClick={() => handleStatusChange(request, 'Scheduled')}
                    className="flex-1 px-3 py-2 bg-[#144f6b] text-white rounded-lg hover:bg-[#144f6b] transition-colors text-sm"
                  >
                    Jadwalkan
                  </button>
                  <button 
                    onClick={() => handleStatusChange(request, 'Cancelled')}
                    className="px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm"
                  >
                    Tolak
                  </button>
                </>
              )}
              {can('service-requests', 'edit') && request.status === 'Scheduled' && (
                <button 
                  onClick={() => handleStatusChange(request, 'Completed')}
                  className="flex-1 px-3 py-2 bg-[#144f6b] text-white rounded-lg hover:bg-[#144f6b] transition-colors text-sm"
                >
                  Tandai Selesai
                </button>
              )}
              {request.status === 'Completed' && (
                <>
                  <button className="flex-1 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg cursor-default text-sm">
                    <CheckCircle className="w-4 h-4 inline mr-1" />
                    Selesai
                  </button>
                  {/* Integration (audit gap fix): sebelumnya permohonan yang sudah selesai
                      tidak punya jalur apapun ke Distribusi Bantuan -- admin harus catat
                      ulang manual di menu terpisah, tanpa jejak permohonan asalnya. */}
                  {aidDistributions.some(a => a.serviceRequestId === request.id) ? (
                    <span className="flex-1 px-3 py-2 bg-[#f0ede5] text-purple-800 rounded-lg text-sm text-center">
                      Sudah ada Distribusi Bantuan
                    </span>
                  ) : can('aid-distribution', 'create') ? (
                    <button
                      onClick={() => {
                        addAidDistribution({
                          type: 'Lainnya',
                          recipientName: request.requestedBy,
                          memberId: request.memberId,
                          serviceRequestId: request.id,
                          phone: request.phone,
                          address: request.address,
                          description: request.description,
                          reason: `Tindak lanjut Permohonan Diakonia (${request.type}) — ${request.description}`,
                          status: 'Pengajuan',
                          requestedDate: new Date().toISOString().slice(0, 10),
                        });
                        toast.success('Draf Distribusi Bantuan dibuat — lengkapi jenis & jumlah bantuan di menu Distribusi Bantuan.');
                      }}
                      className="flex-1 px-3 py-2 border border-[#144f6b] text-[#144f6b] rounded-lg hover:bg-[#f0f7fb] transition-colors text-sm"
                    >
                      Buat Distribusi Bantuan
                    </button>
                  ) : null}
                  {can('letters-outgoing', 'create') && (
                    <button
                      onClick={() => handleBuatSurat(request)}
                      className="flex-1 px-3 py-2 border border-[#144f6b] text-[#144f6b] rounded-lg hover:bg-[#f0f7fb] transition-colors text-sm"
                    >
                      Buat Surat
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false);
          setIsEditMode(false);
          setSelectedRequest(null);
          resetForm();
        }
      }}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 pt-6 pb-4 flex-shrink-0">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-gray-900">
                {isEditMode ? 'Edit Permohonan Layanan' : 'Permohonan Layanan Baru'}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                {isEditMode ? 'Ubah informasi permohonan layanan yang sudah ada.' : 'Catat permohonan kunjungan, doa khusus, atau pelayanan dari jemaat.'}
              </DialogDescription>
            </DialogHeader>
          </div>
          
          {/* Form */}
          <form onSubmit={isEditMode ? handleUpdate : handleSubmit} className="flex flex-col flex-1 min-h-0">
            {/* Scrollable Content */}
            <div className="overflow-y-auto flex-1 px-6 min-h-0">
              <div className="space-y-6 py-4">
                {/* Jenis Layanan */}
                <div className="bg-[#f0f7fb] rounded-lg p-4 border border-purple-100">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-[#3a7fa0] rounded-lg flex items-center justify-center">
                      <HandHeart className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Jenis Layanan</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="type">Tipe Layanan *</Label>
                      <select
                        id="type"
                        name="type"
                        value={formData.type}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        required
                      >
                        {SERVICE_TYPE_LIST.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="status">Status *</Label>
                      <select
                        id="status"
                        name="status"
                        value={formData.status}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        required
                      >
                        <option value="Pending">Pending</option>
                        <option value="Scheduled">Scheduled</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Informasi Pemohon */}
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-[#f0ede5] rounded-lg flex items-center justify-center">
                      <User className="w-4 h-4 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Informasi Pemohon</h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label>Pilih Jemaat Terdaftar</Label>
                      <SearchDropdown<any>
                        value={memberSearch}
                        onChange={v => {
                          setMemberSearch(v);
                          if (!v) handleMemberSelect('');
                        }}
                        placeholder="Cari nama jemaat..."
                        items={members}
                        filterFn={(m, q) => {
                          const lq = q.toLowerCase();
                          return m.fullName.toLowerCase().includes(lq) || m.memberNumber?.toLowerCase().includes(lq);
                        }}
                        renderResult={m => (
                          <div>
                            <p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{m.fullName}</p>
                            <p style={{fontSize:'11px',color:'#64748b',margin:0}}>{m.memberNumber||'-'}</p>
                          </div>
                        )}
                        onSelect={m => {
                          handleMemberSelect(m.id);
                          setMemberSearch(m.fullName);
                        }}
                        onClear={() => { handleMemberSelect(''); setMemberSearch(''); }}
                      />
                    </div>
                    <div className="border-t border-gray-200 pt-4">
                      <p className="text-xs text-gray-500 mb-3">Atau isi manual:</p>
                      <div className="space-y-3">
                        <div>
                          <Label htmlFor="requestedBy">Nama Pemohon *</Label>
                          <Input
                            id="requestedBy"
                            name="requestedBy"
                            value={formData.requestedBy}
                            onChange={handleInputChange}
                            placeholder="Nama lengkap"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="phone">Telepon *</Label>
                            <Input
                              id="phone"
                              name="phone"
                              value={formData.phone}
                              onChange={handleInputChange}
                              placeholder="08xx"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="address">Alamat *</Label>
                            <Input
                              id="address"
                              name="address"
                              value={formData.address}
                              onChange={handleInputChange}
                              placeholder="Alamat lengkap"
                              required
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Jadwal Pilihan */}
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <Calendar className="w-4 h-4 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Jadwal yang Diinginkan (Opsional)</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="preferredDate">Tanggal</Label>
                      <Input
                        id="preferredDate"
                        name="preferredDate"
                        type="date"
                        value={formData.preferredDate}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div>
                      <Label htmlFor="preferredTime">Waktu</Label>
                      <Input
                        id="preferredTime"
                        name="preferredTime"
                        type="time"
                        value={formData.preferredTime}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                </div>

                {/* Detail Permohonan */}
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-[#f0ede5] rounded-lg flex items-center justify-center">
                      <FileText className="w-4 h-4 text-[#144f6b]" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Detail Permohonan</h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="description">Deskripsi Permohonan *</Label>
                      <Textarea
                        id="description"
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        placeholder="Jelaskan detail permohonan layanan..."
                        rows={4}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="notes">Catatan Tambahan</Label>
                      <Textarea
                        id="notes"
                        name="notes"
                        value={formData.notes}
                        onChange={handleInputChange}
                        placeholder="Catatan untuk majelis atau pelayan..."
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0">
              <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  <X className="w-4 h-4 mr-1.5" />
                  Batal
                </Button>
                <Button type="submit">
                  <Plus className="w-4 h-4 mr-1.5" />
                  {isEditMode ? 'Simpan Perubahan' : 'Simpan Permohonan'}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 pt-6 pb-4 flex-shrink-0">
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <DialogTitle className="text-xl font-bold text-gray-900">
                    Detail Permohonan Layanan
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-xs">
                    {selectedRequest?.requestedBy}
                  </DialogDescription>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${selectedRequest ? getStatusColor(selectedRequest.status) : ''}`}>
                  {selectedRequest?.status}
                </span>
              </div>
            </DialogHeader>
          </div>
          
          {/* Scrollable Content */}
          <div className="overflow-y-auto flex-1 px-6 min-h-0">
            <div className="space-y-4 py-4">
              {/* Type Card */}
              <div className={`rounded-lg p-5 ${
                selectedRequest?.type === 'Kunjungan' ? 'bg-[#f0f7fb] border border-[#b8d5e8]' :
                selectedRequest?.type === 'Doa Khusus' ? 'bg-[#f0f7fb] border border-[#b8d5e8]' :
                selectedRequest?.type === 'Pelayanan Duka' ? 'bg-[#f0f7fb] border border-gray-200' :
                selectedRequest?.type === 'Konseling' ? 'bg-[#f0f7fb] border border-green-200' :
                'bg-[#f0f7fb] border border-[#b8d5e8]'
              }`}>
                <p className="text-sm font-medium mb-1 opacity-70">Jenis Layanan</p>
                <p className="text-2xl font-bold">{selectedRequest?.type}</p>
              </div>

              {/* Contact Info */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900">Informasi Kontak</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-900">{selectedRequest?.phone}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <span className="text-sm text-gray-900">{selectedRequest?.address}</span>
                  </div>
                </div>
              </div>

              {/* Schedule */}
              {selectedRequest?.preferredDate && (
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-5 h-5 text-green-600" />
                    <h3 className="font-semibold text-gray-900">Jadwal yang Diinginkan</h3>
                  </div>
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xs text-gray-600">Tanggal</p>
                      <p className="font-medium text-gray-900">
                        {new Date(selectedRequest.preferredDate).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                    {selectedRequest.preferredTime && (
                      <>
                        <div className="w-px h-8 bg-gray-300"></div>
                        <div>
                          <p className="text-xs text-gray-600">Waktu</p>
                          <p className="font-medium text-gray-900">{selectedRequest.preferredTime}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-gray-600" />
                  <h3 className="font-semibold text-gray-900">Deskripsi Permohonan</h3>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedRequest?.description}</p>
              </div>

              {/* Notes */}
              {selectedRequest?.notes && (
                <div className="bg-[#f0f7fb] border border-[#b8d5e8] rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-blue-900">Catatan</h3>
                  </div>
                  <p className="text-sm text-blue-800 whitespace-pre-wrap">{selectedRequest.notes}</p>
                </div>
              )}

              {/* Status Actions */}
              {can('service-requests', 'edit') && selectedRequest && selectedRequest.status !== 'Completed' && selectedRequest.status !== 'Cancelled' && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-3">Ubah Status</h3>
                  <div className="flex gap-2">
                    {selectedRequest.status === 'Pending' && (
                      <>
                        <Button 
                          onClick={() => handleStatusChange(selectedRequest, 'Scheduled')}
                          size="sm"
                        >
                          <Calendar className="w-3.5 h-3.5 mr-1.5" />
                          Jadwalkan
                        </Button>
                        <Button 
                          onClick={() => handleStatusChange(selectedRequest, 'Cancelled')}
                          size="sm"
                          variant="destructive"
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1.5" />
                          Batalkan
                        </Button>
                      </>
                    )}
                    {selectedRequest.status === 'Scheduled' && (
                      <Button 
                        onClick={() => handleStatusChange(selectedRequest, 'Completed')}
                        size="sm"
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                        Tandai Selesai
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDetailDialogOpen(false)} className="flex-1">
                <X className="w-3.5 h-3.5 mr-1.5" />
                Tutup
              </Button>
              {can('service-requests', 'edit') && (
                <Button type="button" onClick={() => handleEdit(selectedRequest!)} className="flex-1">
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Edit
                </Button>
              )}
              {can('service-requests', 'delete') && (
                <Button type="button" onClick={() => handleDelete(selectedRequest!)} variant="destructive" className="flex-1">
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