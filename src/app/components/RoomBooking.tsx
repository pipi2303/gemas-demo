import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { toast } from 'sonner';
import { api } from '../../lib/apiClient';
import { RoomBooking, RoomBookingStatus, Room, RoomType } from '../types';
import { 
  Calendar, Clock, Users, CheckCircle, XCircle, Plus, X,
  MapPin, Phone, User, FileText, Pencil, Trash2, Eye,
  Building, DoorOpen, Info, Mail, Settings, Power
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { SearchDropdown } from './ui/SearchDropdown';

export function RoomBookingComponent({ onNavigate }: { onNavigate?: (page: string) => void } = {}) {
  const { roomBookings, members, rooms, addRoomBooking, updateRoomBooking, deleteRoomBooking, addRoom, updateRoom, deleteRoom, getMasterDataByCategory, can, setPendingLetterDraft, currentUser } = useApp();
  const statusRuanganList = getMasterDataByCategory('status_peminjaman_ruangan').map((m: any) => m.value);
  const STATUS_OPTS = statusRuanganList.length ? statusRuanganList : ['Pending', 'Approved', 'Rejected', 'Completed', 'Cancelled'];
  const activeRooms = (rooms || []).filter(r => r.isActive);
  const defaultRoom = activeRooms[0]?.name ?? 'Aula Utama';

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<RoomBooking | null>(null);
  // Audit gap fix (Frontend/UX): cegah submit ganda kalau staf klik tombol
  // berkali-kali dengan cepat sebelum dialog sempat tertutup.
  const [isSubmitting, setIsSubmitting] = useState(false);

  // memberSearch state for SearchDropdown display
  const [memberSearch, setMemberSearch] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    roomName: defaultRoom,
    date: '',
    startTime: '',
    endTime: '',
    purpose: '',
    bookedBy: '',
    memberId: '',
    phone: '',
    organization: '',
    attendees: 0,
    facilities: [] as string[],
    notes: '',
    status: 'Pending' as RoomBookingStatus
  });

  // Kelola Ruangan (Master Data Ruangan) -- audit gap fix: sebelumnya addRoom/
  // updateRoom/deleteRoom sudah ada di AppContext tapi tidak ada UI manapun yang
  // memanggilnya, jadi cuma 3 ruangan seed default yang bisa dipakai selamanya.
  const [isManageRoomsOpen, setIsManageRoomsOpen] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const ROOM_TYPE_OPTS: RoomType[] = ['Ruang Ibadah', 'Aula', 'Ruang Kelas', 'Ruang Pertemuan', 'Lainnya'];
  const [roomForm, setRoomForm] = useState({
    name: '', roomType: 'Lainnya' as RoomType, capacity: 0, facilitiesText: '', location: '', isActive: true,
  });

  const resetRoomForm = () => {
    setRoomForm({ name: '', roomType: 'Lainnya', capacity: 0, facilitiesText: '', location: '', isActive: true });
    setEditingRoomId(null);
  };

  const openEditRoom = (r: Room) => {
    setEditingRoomId(r.id);
    setRoomForm({
      name: r.name,
      roomType: r.roomType ?? 'Lainnya',
      capacity: r.capacity,
      facilitiesText: (r.facilities || []).join(', '),
      location: r.location || '',
      isActive: r.isActive,
    });
  };

  const saveRoomForm = () => {
    if (!roomForm.name.trim()) { toast.error('Nama ruangan wajib diisi'); return; }
    if (!roomForm.capacity || roomForm.capacity <= 0) { toast.error('Kapasitas ruangan harus lebih dari 0 orang'); return; }
    const facilities = roomForm.facilitiesText.split(',').map(s => s.trim()).filter(Boolean);
    const payload = {
      name: roomForm.name.trim(),
      roomType: roomForm.roomType,
      capacity: roomForm.capacity,
      facilities,
      location: roomForm.location.trim() || undefined,
      isActive: roomForm.isActive,
    };
    if (editingRoomId) {
      updateRoom(editingRoomId, payload);
      toast.success('Data ruangan diperbarui');
    } else {
      addRoom(payload);
      toast.success('Ruangan baru ditambahkan');
    }
    resetRoomForm();
  };

  const toggleRoomActive = (r: Room) => {
    updateRoom(r.id, { isActive: !r.isActive });
  };

  const handleDeleteRoom = (r: Room) => {
    const usedInBooking = roomBookings.some(b => b.roomName === r.name);
    if (usedInBooking) {
      toast.error(`Ruangan "${r.name}" masih punya riwayat booking -- nonaktifkan saja (bukan hapus) supaya riwayat booking lama tidak kehilangan referensi nama ruangan.`);
      return;
    }
    const confirmDelete = window.confirm(`Hapus ruangan "${r.name}"? Tindakan ini tidak bisa dibatalkan.`);
    if (confirmDelete) deleteRoom(r.id);
  };

  // Fasilitas dari ruangan yang dipilih, fallback ke semua fasilitas unik dari semua ruangan
  const availableFacilities = useMemo(() => {
    const selectedRoom = activeRooms.find(r => r.name === formData.roomName);
    if (selectedRoom) return selectedRoom.facilities;
    const all = new Set<string>();
    activeRooms.forEach(r => r.facilities.forEach(f => all.add(f)));
    return Array.from(all);
  }, [activeRooms, formData.roomName]);

  // Integration (audit gap fix): sebelumnya form ini tidak pernah mengecek
  // apakah ruangan+waktu yang diajukan sudah dipakai booking lain -- dua unit
  // bisa dapat approval untuk ruangan & jam yang sama tanpa peringatan apapun.
  // Dicek terhadap RoomBooking lain saja (bukan Jadwal Ibadah / Event) karena
  // keduanya hanya punya satu titik waktu (`time`), bukan rentang start-end,
  // dan field lokasinya teks bebas yang tidak selalu identik dengan nama
  // ruangan -- mencocokkan itu berisiko false-positive yang malah memblokir
  // booking yang sah.
  const roomTypeFor = (roomName: string): RoomBooking['roomType'] => {
    return activeRooms.find(r => r.name === roomName)?.roomType ?? 'Lainnya';
  };

  const findRoomConflict = (roomName: string, date: string, startTime: string, endTime: string, excludeId?: string) => {
    return roomBookings.find(b =>
      b.id !== excludeId &&
      b.roomName === roomName &&
      b.date === date &&
      b.status !== 'Rejected' && b.status !== 'Cancelled' &&
      startTime < b.endTime && b.startTime < endTime
    );
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'attendees') {
      setFormData(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleMemberSelect = (memberId: string) => {
    if (memberId) {
      const member = members.find(m => m.id === memberId);
      if (member) {
        setFormData(prev => ({
          ...prev,
          memberId,
          bookedBy: member.fullName,
          phone: member.phone
        }));
      }
    } else {
      setFormData(prev => ({
        ...prev,
        memberId: '',
        bookedBy: '',
        phone: ''
      }));
    }
  };

  const handleFacilityToggle = (facility: string) => {
    setFormData(prev => ({
      ...prev,
      facilities: prev.facilities.includes(facility)
        ? prev.facilities.filter(f => f !== facility)
        : [...prev.facilities, facility]
    }));
  };

  const resetForm = () => {
    setFormData({
      roomName: defaultRoom,
      date: '',
      startTime: '',
      endTime: '',
      purpose: '',
      bookedBy: '',
      memberId: '',
      phone: '',
      organization: '',
      attendees: 0,
      facilities: [],
      notes: '',
      status: 'Pending'
    });
    setMemberSearch('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Validasi
    if (!formData.date || !formData.startTime || !formData.endTime) {
      toast.error('Mohon lengkapi Tanggal, Waktu Mulai, dan Waktu Selesai');
      return;
    }

    if (!formData.bookedBy || !formData.phone || !formData.purpose) {
      toast.error('Mohon lengkapi Nama Pemesan, Telepon, dan Tujuan Peminjaman');
      return;
    }

    if (formData.endTime <= formData.startTime) {
      toast.error('Waktu Selesai harus lebih besar dari Waktu Mulai');
      return;
    }

    const roomCapacity = activeRooms.find(r => r.name === formData.roomName)?.capacity;
    if (roomCapacity != null && formData.attendees > roomCapacity) {
      toast.error(`Jumlah peserta (${formData.attendees}) melebihi kapasitas ruangan ${formData.roomName} (${roomCapacity} orang). Pilih ruangan lain atau kurangi jumlah peserta.`);
      return;
    }

    const conflict = findRoomConflict(formData.roomName, formData.date, formData.startTime, formData.endTime);
    if (conflict) {
      toast.error(`Ruangan ${formData.roomName} sudah dipesan pada jam tersebut oleh ${conflict.bookedBy} (${conflict.startTime}-${conflict.endTime}). Pilih waktu atau ruangan lain.`);
      return;
    }

    setIsSubmitting(true);
    addRoomBooking({ ...formData, roomType: roomTypeFor(formData.roomName), email: '' });
    resetForm();
    setIsCreateDialogOpen(false);
    setIsSubmitting(false);
  };

  const handleEdit = (booking: RoomBooking) => {
    setIsEditMode(true);
    setSelectedBooking(booking);
    setIsDetailDialogOpen(false);
    setFormData({
      roomName: booking.roomName,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      purpose: booking.purpose,
      bookedBy: booking.bookedBy,
      memberId: booking.memberId || '',
      phone: booking.phone,
      organization: booking.organization || '',
      attendees: booking.attendees,
      facilities: booking.facilities || [],
      notes: booking.notes || '',
      status: booking.status
    });
    setMemberSearch(booking.memberId ? members.find(m => m.id === booking.memberId)?.fullName || '' : '');
    setIsCreateDialogOpen(true);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Validasi
    if (!formData.date || !formData.startTime || !formData.endTime) {
      toast.error('Mohon lengkapi Tanggal, Waktu Mulai, dan Waktu Selesai');
      return;
    }

    if (!formData.bookedBy || !formData.phone || !formData.purpose) {
      toast.error('Mohon lengkapi Nama Pemesan, Telepon, dan Tujuan Peminjaman');
      return;
    }

    if (formData.endTime <= formData.startTime) {
      toast.error('Waktu Selesai harus lebih besar dari Waktu Mulai');
      return;
    }

    const roomCapacityUpd = activeRooms.find(r => r.name === formData.roomName)?.capacity;
    if (roomCapacityUpd != null && formData.attendees > roomCapacityUpd) {
      toast.error(`Jumlah peserta (${formData.attendees}) melebihi kapasitas ruangan ${formData.roomName} (${roomCapacityUpd} orang). Pilih ruangan lain atau kurangi jumlah peserta.`);
      return;
    }

    const conflict = findRoomConflict(formData.roomName, formData.date, formData.startTime, formData.endTime, selectedBooking?.id);
    if (conflict) {
      toast.error(`Ruangan ${formData.roomName} sudah dipesan pada jam tersebut oleh ${conflict.bookedBy} (${conflict.startTime}-${conflict.endTime}). Pilih waktu atau ruangan lain.`);
      return;
    }

    setIsSubmitting(true);
    if (selectedBooking) updateRoomBooking(selectedBooking.id, { ...formData, roomType: roomTypeFor(formData.roomName) });
    resetForm();
    setIsCreateDialogOpen(false);
    setIsEditMode(false);
    setSelectedBooking(null);
    setIsSubmitting(false);
  };

  const handleViewDetail = (booking: RoomBooking) => {
    setSelectedBooking(booking);
    setIsDetailDialogOpen(true);
  };

  // Audit gap fix (Fasilitas & Inventaris): sebelumnya hapus booking tidak
  // pernah cek apakah sudah ada Surat Keluar yang ditindaklanjuti dari
  // booking ini -- begitu dihapus, relatedId di surat itu jadi yatim. Ini
  // cuma peringatan (bukan blokir), pola sama seperti ServiceRequests.tsx /
  // AidDistribution.tsx.
  const handleDelete = async (booking: RoomBooking) => {
    let linkedLetterCount = 0;
    try {
      const letters = await api.get<any[]>('/api/data/outgoingLetters');
      linkedLetterCount = (letters || []).filter(l => l.relatedModule === 'RoomBooking' && l.relatedId === booking.id).length;
    } catch {
      // non-blocking: kalau gagal cek, lanjutkan tanpa info surat terkait
    }
    const warning = linkedLetterCount > 0
      ? `\n\nPERINGATAN: ${linkedLetterCount} Surat Keluar sudah dibuat terkait booking ini. Data tertaut TIDAK ikut terhapus dan referensinya akan jadi yatim (tidak bisa dilacak balik ke booking ini).`
      : '';
    const confirmDelete = window.confirm(
      `Apakah Anda yakin ingin menghapus booking:\n\n${booking.roomName} - ${booking.bookedBy}\nTanggal: ${new Date(booking.date).toLocaleDateString('id-ID')}${warning}\n\nData yang dihapus tidak dapat dikembalikan.`
    );

    if (confirmDelete) {
      deleteRoomBooking(booking.id);
      setIsDetailDialogOpen(false);
    }
  };

  const handleStatusChange = (booking: RoomBooking, newStatus: RoomBookingStatus) => {
    const extra = newStatus === 'Approved'
      ? { approvedBy: currentUser?.name || 'Administrator', approvedDate: new Date().toISOString() }
      : {};
    updateRoomBooking(booking.id, { status: newStatus, ...extra });
    setSelectedBooking(prev => prev ? { ...prev, status: newStatus, ...extra } : prev);
  };

  // Integrasi Surat-Menyurat (audit gap fix): begitu peminjaman ruangan DISETUJUI,
  // staf bisa langsung membuat draf Surat Persetujuan Peminjaman Ruangan tanpa
  // mengetik ulang detail (ruang, tanggal, jam, keperluan) secara manual.
  const handleBuatSurat = (booking: RoomBooking) => {
    setPendingLetterDraft({
      relatedModule: 'RoomBooking',
      relatedId: booking.id,
      memberId: booking.memberId || undefined,
      recipientName: booking.bookedBy,
      recipientInstitution: booking.organization,
      subject: `Persetujuan Peminjaman ${booking.roomName}`,
      body: `Sehubungan dengan permohonan peminjaman ${booking.roomName} pada tanggal ${new Date(booking.date).toLocaleDateString('id-ID')} pukul ${booking.startTime}-${booking.endTime} untuk keperluan ${booking.purpose}, dengan ini kami sampaikan bahwa permohonan Saudara/i telah DISETUJUI.`,
    });
    onNavigate?.('letters-outgoing');
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'Pending': 'bg-[#f0ede5] text-[#144f6b] border-[#e8e4d8]',
      'Approved': 'bg-green-100 text-green-800 border-green-200',
      'Rejected': 'bg-red-100 text-red-800 border-red-200',
      'Completed': 'bg-[#f0ede5] text-blue-800 border-[#b8d5e8]',
      'Cancelled': 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  // Calculate statistics
  const stats = {
    total: roomBookings.length,
    pending: roomBookings.filter(b => b.status === 'Pending').length,
    approved: roomBookings.filter(b => b.status === 'Approved').length,
    completed: roomBookings.filter(b => b.status === 'Completed').length
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Reservasi Ruangan</h1>
          <p className="text-gray-600">Sistem peminjaman gedung dan sarana gereja</p>
        </div>
        <div className="flex items-center gap-2">
          {can('room-booking', 'edit') && (
            <button
              onClick={() => { resetRoomForm(); setIsManageRoomsOpen(true); }}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Kelola Ruangan
            </button>
          )}
          <button 
            onClick={() => {
              resetForm();
              setIsEditMode(false);
              setSelectedBooking(null);
              setIsCreateDialogOpen(true);
            }}
            className="px-4 py-2 bg-[#144f6b] text-white rounded-lg hover:bg-[#144f6b] transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Booking Ruangan
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#144f6b] rounded-lg shadow-sm border border-blue-400 p-5 text-white">
          <p className="text-blue-100 text-sm mb-1">Total Booking</p>
          <p className="text-3xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-[#e8e4d8] p-5">
          <p className="text-[#144f6b] text-sm mb-1">Pending</p>
          <p className="text-3xl font-bold text-[#144f6b]">{stats.pending}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-green-200 p-5">
          <p className="text-green-700 text-sm mb-1">Approved</p>
          <p className="text-3xl font-bold text-green-900">{stats.approved}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-[#b8d5e8] p-5">
          <p className="text-[#144f6b] text-sm mb-1">Completed</p>
          <p className="text-3xl font-bold text-blue-900">{stats.completed}</p>
        </div>
      </div>

      {/* Calendar View Placeholder */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600" />
          Kalender Reservasi
        </h3>
        <div className="bg-[#f0f7fb] rounded-lg p-8 text-center border border-blue-200">
          <Calendar className="w-12 h-12 text-blue-400 mx-auto mb-3" />
          <p className="text-[#144f6b] font-medium">Kalender reservasi akan ditampilkan di sini</p>
          <p className="text-sm text-blue-600 mt-1">Lihat jadwal booking ruangan per bulan</p>
        </div>
      </div>

      {/* Booking List */}
      <div className="space-y-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <DoorOpen className="w-5 h-5 text-green-600" />
          Daftar Booking
        </h3>
        {roomBookings.map((booking) => (
          <div 
            key={booking.id} 
            onClick={() => handleViewDetail(booking)}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <Building className="w-5 h-5 text-gray-400" />
                  <h3 className="font-semibold text-gray-900 text-lg">{booking.roomName}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(booking.status)}`}>
                    {booking.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600 ml-8">{booking.purpose}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">
                    {new Date(booking.date).toLocaleDateString('id-ID', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">
                    {booking.startTime} - {booking.endTime} WIB
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">{booking.attendees} peserta</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm">
                  <span className="font-medium text-gray-700">Pemesan:</span>
                  <span className="text-gray-600 ml-2">{booking.bookedBy}</span>
                </div>
                {booking.organization && (
                  <div className="text-sm">
                    <span className="font-medium text-gray-700">Organisasi:</span>
                    <span className="text-gray-600 ml-2">{booking.organization}</span>
                  </div>
                )}
                <div className="text-sm">
                  <span className="font-medium text-gray-700">Kontak:</span>
                  <span className="text-gray-600 ml-2">{booking.phone}</span>
                </div>
              </div>
            </div>

            {booking.facilities && booking.facilities.length > 0 && (
              <div className="mb-4 pb-4 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-2">Fasilitas:</p>
                <div className="flex flex-wrap gap-2">
                  {booking.facilities.map((facility, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-[#f0f7fb] text-[#144f6b] rounded text-xs border border-blue-200"
                    >
                      {facility}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {booking.notes && (
              <div className="bg-[#f6f4f0] border border-[#e8e4d8] rounded-lg p-3 mb-4">
                <p className="text-sm text-[#144f6b] line-clamp-2">{booking.notes}</p>
              </div>
            )}

            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              {/* Audit gap fix: sebelumnya tombol Setujui/Tolak/Tandai Selesai
                  tidak digate sama sekali -- siapa pun yang bisa lihat halaman
                  ini (termasuk role yang cuma punya izin 'view') bisa
                  menyetujui/menolak booking dari UI. Digate can('room-booking',
                  'edit') supaya konsisten dengan hak edit booking yang sudah
                  ada (bukan 'approve' -- lihat catatan di handleStatusChange). */}
              {can('room-booking', 'edit') && booking.status === 'Pending' && (
                <>
                  <button 
                    onClick={() => handleStatusChange(booking, 'Approved')}
                    className="px-4 py-2 bg-[#144f6b] text-white rounded-lg hover:bg-[#144f6b] transition-colors text-sm flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Setujui
                  </button>
                  <button 
                    onClick={() => handleStatusChange(booking, 'Rejected')}
                    className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm flex items-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    Tolak
                  </button>
                </>
              )}
              {can('room-booking', 'edit') && booking.status === 'Approved' && (
                <button 
                  onClick={() => handleStatusChange(booking, 'Completed')}
                  className="px-4 py-2 bg-[#144f6b] text-white rounded-lg hover:bg-[#144f6b] transition-colors text-sm"
                >
                  Tandai Selesai
                </button>
              )}
              {booking.status === 'Completed' && (
                <button className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg cursor-default text-sm">
                  <CheckCircle className="w-4 h-4 inline mr-1" />
                  Selesai
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Kelola Ruangan Dialog (Master Data Ruangan) */}
      <Dialog open={isManageRoomsOpen} onOpenChange={(open) => { setIsManageRoomsOpen(open); if (!open) resetRoomForm(); }}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 max-h-[85vh] flex flex-col">
          <div className="bg-white border-b border-gray-200 px-6 pt-6 pb-4 flex-shrink-0">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-gray-900">Kelola Ruangan</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                Daftar ruangan yang bisa dipesan lewat Reservasi Ruangan. Nonaktifkan ruangan yang sudah tidak dipakai, jangan dihapus kalau sudah punya riwayat booking.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
            {/* Form tambah/edit ruangan */}
            <div className="bg-[#f0f7fb] rounded-lg p-4 border border-blue-100 space-y-3">
              <h3 className="font-semibold text-gray-900 text-sm">{editingRoomId ? 'Edit Ruangan' : 'Tambah Ruangan Baru'}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="roomFormName">Nama Ruangan *</Label>
                  <Input id="roomFormName" value={roomForm.name} onChange={(e) => setRoomForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Contoh: Ruang Sekolah Minggu" />
                </div>
                <div>
                  <Label htmlFor="roomFormType">Jenis Ruangan</Label>
                  <select
                    id="roomFormType"
                    value={roomForm.roomType}
                    onChange={(e) => setRoomForm(prev => ({ ...prev, roomType: e.target.value as RoomType }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  >
                    {ROOM_TYPE_OPTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="roomFormCapacity">Kapasitas (orang) *</Label>
                  <Input id="roomFormCapacity" type="number" min="1" value={roomForm.capacity || ''} onChange={(e) => setRoomForm(prev => ({ ...prev, capacity: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label htmlFor="roomFormLocation">Lokasi</Label>
                  <Input id="roomFormLocation" value={roomForm.location} onChange={(e) => setRoomForm(prev => ({ ...prev, location: e.target.value }))} placeholder="Contoh: Lantai 2 Gedung Utama" />
                </div>
              </div>
              <div>
                <Label htmlFor="roomFormFacilities">Fasilitas (pisahkan dengan koma)</Label>
                <Input id="roomFormFacilities" value={roomForm.facilitiesText} onChange={(e) => setRoomForm(prev => ({ ...prev, facilitiesText: e.target.value }))} placeholder="Contoh: AC, Proyektor, Sound System" />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={roomForm.isActive} onChange={(e) => setRoomForm(prev => ({ ...prev, isActive: e.target.checked }))} />
                  Aktif (bisa dipesan)
                </label>
                <div className="flex gap-2">
                  {editingRoomId && (
                    <Button type="button" variant="outline" onClick={resetRoomForm}>Batal Edit</Button>
                  )}
                  <Button type="button" onClick={saveRoomForm}>{editingRoomId ? 'Simpan Perubahan' : 'Tambah Ruangan'}</Button>
                </div>
              </div>
            </div>

            {/* Daftar ruangan */}
            <div className="space-y-2">
              {(rooms || []).length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">Belum ada ruangan terdaftar.</p>
              )}
              {(rooms || []).map(r => (
                <div key={r.id} className={`rounded-lg border p-3 flex items-center justify-between gap-3 ${r.isActive ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-70'}`}>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{r.name} <span className="text-xs font-normal text-gray-500">({r.roomType ?? 'Lainnya'})</span></p>
                    <p className="text-xs text-gray-500">Kapasitas {r.capacity} orang{r.location ? ` • ${r.location}` : ''}{!r.isActive ? ' • Nonaktif' : ''}</p>
                    {(r.facilities || []).length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">{(r.facilities || []).join(', ')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button type="button" onClick={() => toggleRoomActive(r)} title={r.isActive ? 'Nonaktifkan' : 'Aktifkan'} className="p-1.5 text-gray-500 hover:text-[#144f6b] hover:bg-blue-50 rounded">
                      <Power className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => openEditRoom(r)} title="Edit" className="p-1.5 text-gray-500 hover:text-[#144f6b] hover:bg-blue-50 rounded">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => handleDeleteRoom(r)} title="Hapus" className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false);
          setIsEditMode(false);
          setSelectedBooking(null);
          resetForm();
        }
      }}>
        <DialogContent className="sm:max-w-3xl p-0 gap-0 max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 pt-6 pb-4 flex-shrink-0">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-gray-900">
                {isEditMode ? 'Edit Booking Ruangan' : 'Booking Ruangan Baru'}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                {isEditMode ? 'Ubah informasi booking ruangan yang sudah ada.' : 'Buat reservasi ruangan untuk kegiatan gereja.'}
              </DialogDescription>
            </DialogHeader>
          </div>
          
          {/* Form */}
          <form onSubmit={isEditMode ? handleUpdate : handleSubmit} className="flex flex-col flex-1 min-h-0">
            {/* Scrollable Content */}
            <div className="overflow-y-auto flex-1 px-6 min-h-0">
              <div className="space-y-6 py-4">
                {/* Informasi Ruangan */}
                <div className="bg-[#f0f7fb] rounded-lg p-4 border border-blue-100">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-[#144f6b] rounded-lg flex items-center justify-center">
                      <Building className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Informasi Ruangan</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="roomName">Nama Ruangan *</Label>
                      <select
                        id="roomName"
                        name="roomName"
                        value={formData.roomName}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        required
                      >
                        {activeRooms.map(r => (
                          <option key={r.id} value={r.name}>{r.name} (kapasitas {r.capacity} orang)</option>
                        ))}
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
                        {STATUS_OPTS.map((s: string) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4">
                    <Label htmlFor="purpose">Tujuan Peminjaman *</Label>
                    <Input
                      id="purpose"
                      name="purpose"
                      value={formData.purpose}
                      onChange={handleInputChange}
                      placeholder="Contoh: Rapat Majelis, Persekutuan Pemuda, dll"
                      required
                    />
                  </div>
                </div>

                {/* Waktu Peminjaman */}
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <Calendar className="w-4 h-4 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Waktu Peminjaman</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="date">Tanggal *</Label>
                      <Input
                        id="date"
                        name="date"
                        type="date"
                        value={formData.date}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="startTime">Waktu Mulai *</Label>
                      <Input
                        id="startTime"
                        name="startTime"
                        type="time"
                        value={formData.startTime}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="endTime">Waktu Selesai *</Label>
                      <Input
                        id="endTime"
                        name="endTime"
                        type="time"
                        value={formData.endTime}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <Label htmlFor="attendees">Jumlah Peserta *</Label>
                    <Input
                      id="attendees"
                      name="attendees"
                      type="number"
                      min="0"
                      value={formData.attendees}
                      onChange={handleInputChange}
                      placeholder="0"
                      required
                    />
                  </div>
                </div>

                {/* Informasi Pemesan */}
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-[#f0ede5] rounded-lg flex items-center justify-center">
                      <User className="w-4 h-4 text-purple-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Informasi Pemesan</h3>
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
                          <Label htmlFor="bookedBy">Nama Pemesan *</Label>
                          <Input
                            id="bookedBy"
                            name="bookedBy"
                            value={formData.bookedBy}
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
                            <Label htmlFor="organization">Organisasi</Label>
                            <Input
                              id="organization"
                              name="organization"
                              value={formData.organization}
                              onChange={handleInputChange}
                              placeholder="Nama organisasi (opsional)"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Fasilitas yang Dibutuhkan */}
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-[#f0ede5] rounded-lg flex items-center justify-center">
                      <DoorOpen className="w-4 h-4 text-[#144f6b]" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Fasilitas yang Dibutuhkan</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {availableFacilities.map((facility) => (
                      <label
                        key={facility}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                          formData.facilities.includes(facility)
                            ? 'bg-[#f0f7fb] border-blue-300 text-blue-900'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-[#f2f0ea] cursor-pointer group'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.facilities.includes(facility)}
                          onChange={() => handleFacilityToggle(facility)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm">{facility}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    Terpilih: {formData.facilities.length} fasilitas
                  </p>
                </div>

                {/* Catatan Tambahan */}
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-4 h-4 text-gray-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Catatan Tambahan</h3>
                  </div>
                  <Textarea
                    id="notes"
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    placeholder="Catatan atau permintaan khusus..."
                    rows={3}
                  />
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
                <Button type="submit" disabled={isSubmitting}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  {isSubmitting ? 'Menyimpan...' : (isEditMode ? 'Simpan Perubahan' : 'Buat Booking')}
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
                    Detail Booking Ruangan
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-xs">
                    {selectedBooking?.roomName} - {selectedBooking?.bookedBy}
                  </DialogDescription>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${selectedBooking ? getStatusColor(selectedBooking.status) : ''}`}>
                  {selectedBooking?.status}
                </span>
              </div>
            </DialogHeader>
          </div>
          
          {/* Scrollable Content */}
          <div className="overflow-y-auto flex-1 px-6 min-h-0">
            <div className="space-y-4 py-4">
              {/* Room Info Card */}
              <div className="bg-[#f0f7fb] rounded-lg p-5 border border-blue-200">
                <div className="flex items-center gap-3 mb-2">
                  <Building className="w-6 h-6 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-[#144f6b] mb-0.5">Ruangan</p>
                    <p className="text-2xl font-bold text-blue-900">{selectedBooking?.roomName}</p>
                  </div>
                </div>
                <p className="text-sm text-blue-800 mt-3">{selectedBooking?.purpose}</p>
              </div>

              {/* Schedule Info */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-5 h-5 text-green-600" />
                  <h3 className="font-semibold text-gray-900">Jadwal</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Tanggal</span>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedBooking && new Date(selectedBooking.date).toLocaleDateString('id-ID', {
                        weekday: 'long',
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Waktu</span>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedBooking?.startTime} - {selectedBooking?.endTime} WIB
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Jumlah Peserta</span>
                    <span className="text-sm font-medium text-gray-900">
                      {selectedBooking?.attendees} orang
                    </span>
                  </div>
                </div>
              </div>

              {/* Booker Info */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-5 h-5 text-purple-600" />
                  <h3 className="font-semibold text-gray-900">Informasi Pemesan</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Nama</span>
                    <span className="text-sm font-medium text-gray-900">{selectedBooking?.bookedBy}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Telepon</span>
                    <span className="text-sm font-medium text-gray-900">{selectedBooking?.phone}</span>
                  </div>
                  {selectedBooking?.organization && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Organisasi</span>
                      <span className="text-sm font-medium text-gray-900">{selectedBooking.organization}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Facilities */}
              {selectedBooking?.facilities && selectedBooking.facilities.length > 0 && (
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-3">
                    <DoorOpen className="w-5 h-5 text-[#144f6b]" />
                    <h3 className="font-semibold text-gray-900">Fasilitas yang Dibutuhkan</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedBooking.facilities.map((facility, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 bg-[#f0f7fb] text-[#144f6b] rounded-lg text-sm border border-[#b8d5e8] font-medium"
                      >
                        {facility}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedBooking?.notes && (
                <div className="bg-[#f6f4f0] border border-[#e8e4d8] rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-[#144f6b]" />
                    <h3 className="font-semibold text-[#144f6b]">Catatan</h3>
                  </div>
                  <p className="text-sm text-[#144f6b] whitespace-pre-wrap">{selectedBooking.notes}</p>
                </div>
              )}

              {/* Status Actions */}
              {can('room-booking', 'edit') && selectedBooking && selectedBooking.status !== 'Completed' && selectedBooking.status !== 'Cancelled' && selectedBooking.status !== 'Rejected' && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-3">Ubah Status</h3>
                  <div className="flex gap-2">
                    {selectedBooking.status === 'Pending' && (
                      <>
                        <Button 
                          onClick={() => handleStatusChange(selectedBooking, 'Approved')}
                          size="sm"
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                          Setujui
                        </Button>
                        <Button 
                          onClick={() => handleStatusChange(selectedBooking, 'Rejected')}
                          size="sm"
                          variant="destructive"
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1.5" />
                          Tolak
                        </Button>
                      </>
                    )}
                    {selectedBooking.status === 'Approved' && (
                      <>
                        <Button 
                          onClick={() => handleStatusChange(selectedBooking, 'Completed')}
                          size="sm"
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                          Tandai Selesai
                        </Button>
                        {can('letters-outgoing', 'create') && (
                          <Button
                            onClick={() => handleBuatSurat(selectedBooking)}
                            size="sm"
                            variant="outline"
                          >
                            <Mail className="w-3.5 h-3.5 mr-1.5" />
                            Buat Surat
                          </Button>
                        )}
                      </>
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
              {can('room-booking', 'edit') && (
                <Button type="button" onClick={() => handleEdit(selectedBooking!)} className="flex-1">
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Edit
                </Button>
              )}
              {can('room-booking', 'delete') && (
                <Button type="button" onClick={() => handleDelete(selectedBooking!)} variant="destructive" className="flex-1">
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