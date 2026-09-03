import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Heart, Plus, Check, X } from 'lucide-react';
import { PrayerRequest } from '../types';

export function PrayerRequests() {
  const { prayerRequests, members, addPrayerRequest, updatePrayerRequest, currentUser } = useApp();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [formData, setFormData] = useState({
    memberId: '',
    request: '',
    category: 'Rohani' as PrayerRequest['category'],
    isPrivate: false,
    status: 'Aktif' as PrayerRequest['status']
  });

  const filteredRequests = filterStatus === 'all'
    ? prayerRequests
    : prayerRequests.filter(r => r.status === filterStatus);

  const activeRequests = filteredRequests.filter(r => r.status === 'Aktif');
  const answeredRequests = filteredRequests.filter(r => r.status === 'Terjawab');
  const closedRequests = filteredRequests.filter(r => r.status === 'Ditutup');

  const openAddForm = () => {
    setFormData({
      memberId: currentUser?.id || '',
      request: '',
      category: 'Rohani',
      isPrivate: false,
      status: 'Aktif'
    });
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addPrayerRequest(formData);
    setIsFormOpen(false);
  };

  const getMemberName = (memberId: string) => {
    return members.find(m => m.id === memberId)?.fullName || 'Unknown';
  };

  const markAsAnswered = (requestId: string) => {
    updatePrayerRequest(requestId, {
      status: 'Terjawab',
      answeredAt: new Date().toISOString(),
      answer: 'Puji Tuhan! Doa telah dijawab.'
    });
  };

  const getCategoryColor = (category: PrayerRequest['category']) => {
    const colors = {
      'Kesehatan': 'bg-red-100 text-red-700',
      'Keuangan': 'bg-green-100 text-green-700',
      'Keluarga': 'bg-[#f0ede5] text-[#144f6b]',
      'Pekerjaan': 'bg-[#f0ede5] text-[#3a7fa0]',
      'Rohani': 'bg-[#f0ede5] text-[#1A77A3]',
      'Lainnya': 'bg-gray-100 text-gray-700'
    };
    return colors[category];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Daftar Pokok Doa</h2>
          <p className="text-sm text-gray-600 mt-1">
            {activeRequests.length} pokok doa aktif
          </p>
        </div>
        <Button onClick={openAddForm} className="gap-2 bg-[#144f6b] hover:bg-[#0f2d41]">
          <Plus className="w-4 h-4" />
          Tambah Pokok Doa
        </Button>
      </div>

      {/* Filter */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <Label className="text-sm font-medium">Filter Status:</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="Aktif">Aktif</SelectItem>
              <SelectItem value="Terjawab">Terjawab</SelectItem>
              <SelectItem value="Ditutup">Ditutup</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Active Requests */}
      {activeRequests.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-500" />
            Pokok Doa Aktif
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeRequests.map((request) => (
              <Card key={request.id} className="p-5">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <Badge className={getCategoryColor(request.category)}>
                      {request.category}
                    </Badge>
                    {request.isPrivate && (
                      <Badge variant="secondary" className="text-xs">
                        Pribadi
                      </Badge>
                    )}
                  </div>

                  <div>
                    <p className="text-sm text-gray-600">Dari:</p>
                    <p className="font-medium text-gray-900">
                      {getMemberName(request.memberId)}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-600 mb-1">Pokok Doa:</p>
                    <p className="text-gray-900">{request.request}</p>
                  </div>

                  <div className="text-xs text-gray-500">
                    {new Date(request.createdAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </div>

                  <Button
                    size="sm"
                    className="w-full bg-[#144f6b] hover:bg-[#0f2d41]"
                    onClick={() => markAsAnswered(request.id)}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Tandai Sebagai Terjawab
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Answered Requests */}
      {answeredRequests.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-900 mb-4">Doa yang Telah Dijawab</h3>
          <div className="space-y-3">
            {answeredRequests.map((request) => (
              <Card key={request.id} className="p-4 bg-green-50 border-green-200">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <Check className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-gray-900">
                        {getMemberName(request.memberId)}
                      </p>
                      <Badge className={getCategoryColor(request.category)} >
                        {request.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{request.request}</p>
                    {request.answer && (
                      <p className="text-sm text-green-700 italic">"{request.answer}"</p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      Terjawab: {request.answeredAt && new Date(request.answeredAt).toLocaleDateString('id-ID')}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Closed Requests */}
      {closedRequests.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-900 mb-4">Pokok Doa Ditutup</h3>
          <div className="space-y-3">
            {closedRequests.map((request) => (
              <Card key={request.id} className="p-4 bg-gray-50 border-gray-200">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-gray-400 rounded-full flex items-center justify-center flex-shrink-0">
                    <X className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-gray-900">
                        {getMemberName(request.memberId)}
                      </p>
                      <Badge className={getCategoryColor(request.category)} >
                        {request.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-700">{request.request}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {filteredRequests.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Heart className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Tidak ada pokok doa untuk filter ini</p>
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-[90vw] w-[900px] max-h-[90vh] overflow-y-auto bg-gray-50">
          <DialogHeader className="pb-2 border-b border-gray-200">
            <DialogTitle className="text-xl text-gray-800">
              Tambah Pokok Doa
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              Isi formulir di bawah untuk menambahkan pokok doa baru
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="bg-white rounded-lg p-6 mt-4 shadow-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="request">Pokok Doa *</Label>
                  <Textarea
                    id="request"
                    value={formData.request}
                    onChange={(e) => setFormData({ ...formData, request: e.target.value })}
                    placeholder="Tuliskan pokok doa Anda..."
                    required
                    className="mt-1.5"
                    rows={4}
                  />
                </div>

                <div>
                  <Label>Kategori *</Label>
                  <Select 
                    value={formData.category} 
                    onValueChange={(value: PrayerRequest['category']) => 
                      setFormData({ ...formData, category: value })
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Kesehatan">Kesehatan</SelectItem>
                      <SelectItem value="Keuangan">Keuangan</SelectItem>
                      <SelectItem value="Keluarga">Keluarga</SelectItem>
                      <SelectItem value="Pekerjaan">Pekerjaan</SelectItem>
                      <SelectItem value="Rohani">Rohani</SelectItem>
                      <SelectItem value="Lainnya">Lainnya</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <Label htmlFor="isPrivate">Pokok Doa Pribadi</Label>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {formData.isPrivate ? 'Hanya akan dilihat oleh majelis' : 'Akan ditampilkan ke semua jemaat'}
                    </p>
                  </div>
                  <Switch
                    id="isPrivate"
                    checked={formData.isPrivate}
                    onCheckedChange={(checked) => setFormData({ ...formData, isPrivate: checked })}
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons - Sticky */}
            <div className="sticky bottom-0 flex justify-end gap-3 pt-6 border-t mt-6 bg-white -mx-6 -mb-6 px-6 py-4 rounded-b-lg shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-10">
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Batal
              </Button>
              <Button type="submit" className="bg-[#144f6b] hover:bg-[#0f2d41]">
                Tambah Pokok Doa
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}