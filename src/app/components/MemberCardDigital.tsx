import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import {
  Search, Download, Printer, Building, Eye, ChevronLeft, ChevronRight,
  ArrowUp, ArrowDown, ArrowUpDown
} from 'lucide-react';
import { useSortable } from '../../hooks/useSortable';
import { sortByRole, isKK } from '../../lib/familyRole';

// Urutkan: KK -> Istri -> Anak (tertua ke termuda), sesuai konvensi Kartu Keluarga
const sortFamilyMembers = <T extends { familyRole?: string; birthDate?: string }>(arr: T[]): T[] =>
  sortByRole(
    [...arr].sort((a, b) => new Date(a.birthDate || 0).getTime() - new Date(b.birthDate || 0).getTime())
  );

// Helper to format family role
const formatFamilyRole = (role: string) => {
  const mapping: Record<string, string> = {
    'KK': 'Kepala Keluarga',
    'IS': 'Istri',
    'AN': 'Anak',
    'OT': 'Orang Tua',
    'DL': 'Dan Lain-lain',
  };
  return mapping[role] || role || 'Anggota Keluarga';
};

// Family Card Preview Component (Traditional Kartu Keluarga design)
function FamilyCardPreview({ family, members, sectors }: { family: any; members: any[]; sectors: any[] }) {
  const sector = sectors.find(s => s.id === family.sectorId);
  const familyMembers = sortFamilyMembers(members.filter(m => m.familyId === family.id));
  const headMember = familyMembers.find(m => isKK(m.familyRole)) || members.find((m: any) => m.id === family.headMemberId);
  const sectorLeaderName = (sector?.leaderId && members.find((m: any) => m.id === sector.leaderId)?.fullName) || sector?.leader || '';

  return (
    <div className="w-full bg-white border-2 border-gray-800 p-6 font-mono text-[10px] text-gray-900 shadow-sm overflow-x-auto">
      {/* Header */}
      <div className="text-center border-b-2 border-gray-800 pb-4 mb-4">
        <h2 className="text-lg font-bold uppercase tracking-widest">Kartu Keluarga Jemaat</h2>
        <h3 className="text-sm font-bold uppercase">GPIB Trinitas</h3>
        <p className="mt-2 font-bold">No. {family.id.toUpperCase()}</p>
      </div>

      {/* Family Info */}
      <div className="grid grid-cols-2 gap-8 mb-4">
        <div className="space-y-1">
          <div className="flex">
            <span className="w-28 font-bold">Keluarga</span>
            <span className="mx-2">:</span>
            <span className="font-bold uppercase">{family.headOfFamily}</span>
          </div>
          <div className="flex">
            <span className="w-28">Alamat</span>
            <span className="mx-2">:</span>
            <span>{family.address || '-'}</span>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex">
            <span className="w-28">Sektor</span>
            <span className="mx-2">:</span>
            <span>{sector?.name || '-'}</span>
          </div>
          <div className="flex">
            <span className="w-28">Kabupaten/Kota</span>
            <span className="mx-2">:</span>
            <span>{family.address?.split(',').slice(-1)[0]?.trim() || '-'}</span>
          </div>
        </div>
      </div>

      {/* Members Table */}
      <table className="w-full border-collapse border border-gray-800 mb-6">
        <thead>
          <tr className="bg-gray-50">
            <th className="border border-gray-800 p-1 text-center w-6">No</th>
            <th className="border border-gray-800 p-1 text-center w-20">No. Induk</th>
            <th className="border border-gray-800 p-1 text-left">Nama Lengkap</th>
            <th className="border border-gray-800 p-1 text-center w-24">Hubungan</th>
            <th className="border border-gray-800 p-1 text-center w-10">L/P</th>
            <th className="border border-gray-800 p-1 text-left w-24">Tempat Lahir</th>
            <th className="border border-gray-800 p-1 text-center w-20">Tgl Lahir</th>
            <th className="border border-gray-800 p-1 text-center w-16">Status</th>
          </tr>
        </thead>
        <tbody>
          {familyMembers.map((m, i) => (
            <tr key={m.id}>
              <td className="border border-gray-800 p-1 text-center">{i + 1}</td>
              <td className="border border-gray-800 p-1 font-mono text-[9px] text-center">{m.memberNumber || m.id.slice(0, 8).toUpperCase()}</td>
              <td className="border border-gray-800 p-1 font-bold">{m.fullName.toUpperCase()}</td>
              <td className="border border-gray-800 p-1 text-center">{formatFamilyRole(m.familyRole)}</td>
              <td className="border border-gray-800 p-1 text-center">{m.gender === 'Laki-laki' ? 'L' : 'P'}</td>
              <td className="border border-gray-800 p-1">{m.birthPlace || '-'}</td>
              <td className="border border-gray-800 p-1 text-center">{m.birthDate}</td>
              <td className="border border-gray-800 p-1 text-center">{m.membershipStatus || 'Aktif'}</td>
            </tr>
          ))}
          {/* Fill empty rows to maintain structure if needed */}
          {Array.from({ length: Math.max(0, 5 - familyMembers.length) }).map((_, i) => (
            <tr key={`empty-${i}`} className="h-6">
              <td className="border border-gray-800 p-1"></td>
              <td className="border border-gray-800 p-1"></td>
              <td className="border border-gray-800 p-1"></td>
              <td className="border border-gray-800 p-1"></td>
              <td className="border border-gray-800 p-1"></td>
              <td className="border border-gray-800 p-1"></td>
              <td className="border border-gray-800 p-1"></td>
              <td className="border border-gray-800 p-1"></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer / Signatures */}
      <div className="flex justify-between items-start mt-8 px-4">
        <div className="text-center">
          <p>Dikeluarkan Tanggal:</p>
          <p className="font-bold border-b border-gray-800 pb-1">{new Date().toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}</p>
          <p className="mt-12 font-bold">( {sectorLeaderName ? sectorLeaderName.toUpperCase() : '..................................'} )</p>
          <p className="text-[8px]">Ketua Sektor / Majelis</p>
        </div>
        <div className="text-center">
          <p className="mb-14">Kepala Keluarga,</p>
          <p className="font-bold">( {(headMember?.fullName || family.headOfFamily).toUpperCase()} )</p>
        </div>
      </div>
    </div>
  );
}

export function MemberCardDigital() {
  const { members, families, sectors } = useApp();
  const [search, setSearch] = useState('');
  const [filterSector, setFilterSector] = useState('all');
  const [selectedFamily, setSelectedFamily] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 10;

  // Filter families
  const filteredFamilies = families.filter(f => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      f.headOfFamily.toLowerCase().includes(q) ||
      f.id.toLowerCase().includes(q) ||
      members.some(m => m.familyId === f.id && m.fullName.toLowerCase().includes(q));
    const matchSector = filterSector === 'all' || f.sectorId === filterSector;
    return matchSearch && matchSector;
  });

  const totalPages = Math.ceil(filteredFamilies.length / perPage);
  const { sorted: sortedFamilies, sortKey, sortDir, requestSort } = useSortable(filteredFamilies);
  const paginatedSorted = sortedFamilies.slice((page - 1) * perPage, page * perPage);
  const SortIcon = ({col}:{col:string}) => {
    if(sortKey!==col) return <ArrowUpDown className="w-3 h-3 opacity-40"/>;
    return sortDir==='asc'?<ArrowUp className="w-3 h-3 text-[#1A77A3]"/>:<ArrowDown className="w-3 h-3 text-[#1A77A3]"/>;
  };

  const handlePrint = (family: any) => {
    const printWin = window.open('', '_blank', 'width=900,height=600');
    if (!printWin) return;
    
    const familyMembers = sortFamilyMembers(members.filter(m => m.familyId === family.id));
    const sector = sectors.find(s => s.id === family.sectorId);
    const headMember = familyMembers.find(m => isKK(m.familyRole)) || members.find((m: any) => m.id === family.headMemberId);
    const sectorLeaderName = (sector?.leaderId && members.find((m: any) => m.id === sector.leaderId)?.fullName) || sector?.leader || '';

    const rows = familyMembers.map((m, i) => `
      <tr>
        <td style="border: 1px solid black; padding: 4px; text-align: center;">${i + 1}</td>
        <td style="border: 1px solid black; padding: 4px; font-family: monospace; font-size: 10px; text-align: center;">${m.memberNumber || m.id.slice(0, 8).toUpperCase()}</td>
        <td style="border: 1px solid black; padding: 4px; font-weight: bold;">${m.fullName.toUpperCase()}</td>
        <td style="border: 1px solid black; padding: 4px; text-align: center;">${formatFamilyRole(m.familyRole)}</td>
        <td style="border: 1px solid black; padding: 4px; text-align: center;">${m.gender === 'Laki-laki' ? 'L' : 'P'}</td>
        <td style="border: 1px solid black; padding: 4px;">${m.birthPlace || '-'}</td>
        <td style="border: 1px solid black; padding: 4px; text-align: center;">${m.birthDate}</td>
        <td style="border: 1px solid black; padding: 4px; text-align: center;">${m.membershipStatus || 'Aktif'}</td>
      </tr>
    `).join('');

    printWin.document.write(`
      <html>
      <head>
        <title>Kartu Keluarga - ${family.headOfFamily}</title>
        <style>
          body { font-family: 'Courier New', Courier, monospace; padding: 40px; color: black; font-size: 12px; }
          .header { text-align: center; border-bottom: 2px solid black; margin-bottom: 20px; padding-bottom: 10px; }
          .info { display: flex; justify-content: space-between; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th, td { border: 1px solid black; padding: 6px; }
          .footer { display: flex; justify-content: space-between; margin-top: 50px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h2 style="margin: 0; text-transform: uppercase; letter-spacing: 2px;">Kartu Keluarga Jemaat</h2>
          <h3 style="margin: 5px 0; text-transform: uppercase;">GPIB Trinitas</h3>
          <p style="margin: 10px 0; font-weight: bold;">No. ${family.id.toUpperCase()}</p>
        </div>
        
        <div class="info">
          <div>
            <p><strong>Kepala Keluarga :</strong> ${family.headOfFamily.toUpperCase()}</p>
            <p><strong>Alamat :</strong> ${family.address || '-'}</p>
          </div>
          <div style="text-align: right;">
            <p><strong>Sektor :</strong> ${sector?.name || '-'}</p>
            <p><strong>Kota :</strong> ${family.address?.split(',').slice(-1)[0]?.trim() || '-'}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr style="background-color: #f0f0f0;">
              <th>No</th>
              <th>No. Induk</th>
              <th>Nama Lengkap</th>
              <th>Hubungan</th>
              <th>L/P</th>
              <th>Tempat Lahir</th>
              <th>Tgl Lahir</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <div class="footer">
          <div style="text-align: center;">
            <p>Dikeluarkan Tanggal: ${new Date().toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}</p>
            <br><br><br>
            <p style="font-weight: bold;">( ${sectorLeaderName ? sectorLeaderName.toUpperCase() : '..................................'} )</p>
            <p style="font-size: 10px;">Ketua Sektor / Majelis</p>
          </div>
          <div style="text-align: center;">
            <p>Kepala Keluarga,</p>
            <br><br><br>
            <p><strong>( ${(headMember?.fullName || family.headOfFamily).toUpperCase()} )</strong></p>
          </div>
        </div>
      </body>
      </html>
    `);
    printWin.document.close();
    printWin.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kartu Keluarga Digital</h1>
          <p className="text-gray-500 mt-1">Kelola dan cetak kartu keluarga digital jemaat</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1 px-3 py-1">
            <Building className="w-3.5 h-3.5" />
            {families.length} Keluarga Terdaftar
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Keluarga', value: families.length, color: 'text-[#144f6b]', bg: 'bg-[#f0f7fb]' },
          { label: 'Total Jemaat', value: members.length, color: 'text-[#144f6b]', bg: 'bg-[#f0f7fb]' },
          { label: 'Sektor Aktif', value: sectors.length, color: 'text-orange-700', bg: 'bg-[#fffce8]' },
          { label: 'Rata-rata Anggota', value: families.length > 0 ? (members.length / families.length).toFixed(1) : 0, color: 'text-[#3a7fa0]', bg: 'bg-[#f0f7fb]' },
        ].map((stat, i) => (
          <Card key={i} className={`p-4 ${stat.bg}`}>
            <p className="text-sm text-gray-600">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Cari nama kepala keluarga, nama jemaat, atau no. KK..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9" />
        </div>
        <Select value={filterSector} onValueChange={v => { setFilterSector(v); setPage(1); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Semua Sektor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Sektor</SelectItem>
            {[...sectors].sort((a,b)=>a.name.localeCompare(b.name,'id',{numeric:true})).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Family List (Table View) */}
      <Card className="overflow-hidden border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
              <tr>
                {[{l:'No. KK',k:'id'},{l:'Kepala Keluarga',k:'headOfFamily'},{l:'Sektor',k:'sectorId'},{l:'Anggota',k:'memberCount'}].map(h=>(
                  <th key={h.k} className="px-6 py-3 text-left cursor-pointer select-none" onClick={()=>requestSort(h.k as any)}>
                    <span className="flex items-center gap-1">{h.l}<SortIcon col={h.k}/></span>
                  </th>
                ))}
                <th className="px-6 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedSorted.length > 0 ? (
                paginatedSorted.map(family => {
                  const sector = sectors.find(s => s.id === family.sectorId);
                  const familyMembersCount = members.filter(m => m.familyId === family.id).length;
                  return (
                    <tr 
                      key={family.id} 
                      className="hover:bg-gray-50 transition-colors cursor-pointer group"
                      onClick={() => { setSelectedFamily(family); setShowPreview(true); }}
                    >
                      <td className="px-6 py-4 font-mono text-xs text-[#144f6b] font-bold">
                        {family.id.toUpperCase()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs group-hover:bg-blue-200 transition-colors">
                            {family.headOfFamily.charAt(0)}
                          </div>
                          <span className="font-semibold text-gray-900 group-hover:text-[#144f6b] transition-colors">{family.headOfFamily}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {sector?.name || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                          {familyMembersCount} Orang
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" className="h-8 px-3 text-xs gap-1.5"
                            onClick={() => { setSelectedFamily(family); setShowPreview(true); }}>
                            <Eye className="w-3.5 h-3.5" />
                            Lihat
                          </Button>
                          <Button size="sm" className="h-8 px-3 text-xs gap-1.5 bg-[#144f6b] hover:bg-[#0f2d41]"
                            onClick={() => handlePrint(family)}>
                            <Printer className="w-3.5 h-3.5" />
                            Cetak
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                    Tidak ada data keluarga ditemukan
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Menampilkan {(page - 1) * perPage + 1}–{Math.min(page * perPage, filteredFamilies.length)} dari {filteredFamilies.length} keluarga
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-gray-700">Hal {page} / {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview Kartu Keluarga Digital</DialogTitle>
          </DialogHeader>
          {selectedFamily && (
            <div className="space-y-6 py-4">
              <FamilyCardPreview family={selectedFamily} members={members} sectors={sectors} />

              <div className="flex gap-3 justify-end">
                <Button variant="outline" className="gap-2" onClick={() => handlePrint(selectedFamily)}>
                  <Printer className="w-4 h-4" />
                  Cetak Kartu
                </Button>
                <Button className="gap-2 bg-[#144f6b] hover:bg-[#0f2d41]" onClick={() => handlePrint(selectedFamily)}>
                  <Download className="w-4 h-4" />
                  Unduh PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
