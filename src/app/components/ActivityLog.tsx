import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Activity,
  UserPlus,
  Edit,
  Trash2,
  Users,
  Home,
  MapPin,
  Calendar,
  Heart,
  DollarSign,
  Package,
  Shield,
  Search,
  Download,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Clock,
  User,
  Building,
  Key,
  Layers,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Info,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { ActivityLog as ActivityLogType, AuditDiffField } from '../types';
import { AUDIT_FIELD_LABELS } from '../lib/auditUtils';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

export function ActivityLog() {
  const { activityLogs } = useApp();
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Extract unique users
  const uniqueUsers = useMemo(() => {
    const userMap = new Map<string, string>();
    activityLogs.forEach(l => {
      if (l.userId && l.userName) {
        userMap.set(l.userId, l.userName);
      }
    });
    return Array.from(userMap.entries()).map(([id, name]) => ({ id, name }));
  }, [activityLogs]);

  // Summary Metrics
  const stats = useMemo(() => {
    const total = activityLogs.length;
    const sensitiveCount = activityLogs.filter(l => l.severity === 'sensitive' || l.severity === 'critical').length;
    const memberOps = activityLogs.filter(l => l.domain === 'Member' || ['Member', 'Family', 'Sector', 'Baptism', 'Sidi', 'Marriage', 'Attestation'].includes(l.entityType)).length;
    const financialOps = activityLogs.filter(l => l.domain === 'Financial' || ['FinancialRecord', 'PettyCash', 'PcTopUp', 'Offering', 'BankAccount', 'Budget', 'Liability'].includes(l.entityType)).length;
    const assetOps = activityLogs.filter(l => l.domain === 'Asset' || ['ChurchAsset', 'AssetMaintenance', 'AssetLoan', 'RoomBooking', 'BuildingProject'].includes(l.entityType)).length;

    return { total, sensitiveCount, memberOps, financialOps, assetOps };
  }, [activityLogs]);

  const filteredLogs = useMemo(() => {
    let list = [...activityLogs];

    // Filter by Domain (Member, Financial, Asset, System, etc.)
    if (filterDomain !== 'all') {
      list = list.filter(l => {
        if (l.domain) return l.domain === filterDomain;
        if (filterDomain === 'Member') return ['Member', 'Family', 'Sector', 'Baptism', 'Sidi', 'Marriage', 'Attestation', 'SectorTransfer'].includes(l.entityType);
        if (filterDomain === 'Financial') return ['FinancialRecord', 'FinancialCategory', 'Offering', 'PettyCash', 'PcTopUp', 'BankAccount', 'Budget', 'Liability'].includes(l.entityType);
        if (filterDomain === 'Asset') return ['ChurchAsset', 'AssetMaintenance', 'AssetLoan', 'RoomBooking', 'BuildingProject'].includes(l.entityType);
        if (filterDomain === 'System') return ['User', 'MasterData'].includes(l.entityType);
        return true;
      });
    }

    // Filter by Action
    if (filterAction !== 'all') {
      list = list.filter(l => l.action === filterAction);
    }

    // Filter by Severity
    if (filterSeverity !== 'all') {
      list = list.filter(l => (l.severity || 'normal') === filterSeverity);
    }

    // Filter by User
    if (selectedUser !== 'all') {
      list = list.filter(l => l.userId === selectedUser);
    }

    // Search keyword
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(l =>
        l.userName.toLowerCase().includes(q) ||
        l.entityName.toLowerCase().includes(q) ||
        (l.details && l.details.toLowerCase().includes(q)) ||
        (l.entityType && l.entityType.toLowerCase().includes(q)) ||
        (l.userRole && l.userRole.toLowerCase().includes(q))
      );
    }

    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [activityLogs, filterDomain, filterAction, filterSeverity, selectedUser, searchTerm]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'Menambahkan':
        return <UserPlus className="w-4 h-4 text-emerald-600" />;
      case 'Mengubah':
        return <Edit className="w-4 h-4 text-[#144f6b]" />;
      case 'Menghapus':
        return <Trash2 className="w-4 h-4 text-rose-600" />;
      default:
        return <Activity className="w-4 h-4 text-slate-600" />;
    }
  };

  const getEntityIcon = (entityType: string, domain?: string) => {
    if (domain === 'Financial' || ['FinancialRecord', 'PettyCash', 'PcTopUp', 'Offering', 'BankAccount', 'Budget', 'Liability'].includes(entityType)) {
      return <DollarSign className="w-4 h-4 text-emerald-600" />;
    }
    if (domain === 'Asset' || ['ChurchAsset', 'AssetMaintenance', 'AssetLoan', 'RoomBooking', 'BuildingProject'].includes(entityType)) {
      return <Package className="w-4 h-4 text-amber-600" />;
    }
    switch (entityType) {
      case 'Member':
        return <Users className="w-4 h-4 text-sky-600" />;
      case 'Family':
        return <Home className="w-4 h-4 text-blue-600" />;
      case 'Sector':
        return <MapPin className="w-4 h-4 text-teal-600" />;
      case 'User':
        return <Key className="w-4 h-4 text-purple-600" />;
      case 'Ministry':
        return <Heart className="w-4 h-4 text-pink-600" />;
      case 'Event':
        return <Calendar className="w-4 h-4 text-orange-600" />;
      default:
        return <Layers className="w-4 h-4 text-slate-600" />;
    }
  };

  const getSeverityBadge = (severity?: string) => {
    if (severity === 'critical') {
      return <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[10px] font-bold">Kritis</Badge>;
    }
    if (severity === 'sensitive') {
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-bold">Sensitif</Badge>;
    }
    return <Badge variant="outline" className="text-slate-600 text-[10px]">Standar</Badge>;
  };

  const getDomainBadge = (log: ActivityLogType) => {
    const dom = log.domain || (['Member', 'Family', 'Sector'].includes(log.entityType) ? 'Member' : ['FinancialRecord', 'PettyCash', 'Offering'].includes(log.entityType) ? 'Financial' : ['ChurchAsset'].includes(log.entityType) ? 'Asset' : 'System');
    const colorMap: Record<string, string> = {
      Member: 'bg-sky-50 text-sky-700 border-sky-200',
      Financial: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      Asset: 'bg-amber-50 text-amber-700 border-amber-200',
      System: 'bg-purple-50 text-purple-700 border-purple-200',
      Service: 'bg-rose-50 text-rose-700 border-rose-200',
      Worship: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-[10.5px] font-semibold border ${colorMap[dom] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
        {dom === 'Member' ? 'Sensus / Jemaat' : dom === 'Financial' ? 'Keuangan' : dom === 'Asset' ? 'Aset & Inventaris' : dom}
      </span>
    );
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Export to Excel
  const exportToExcel = () => {
    const dataToExport = filteredLogs.map((l, i) => ({
      No: i + 1,
      Waktu: formatTimestamp(l.timestamp),
      Pengguna: l.userName,
      Peran: l.userRole || 'User',
      Aksi: l.action,
      Domain: l.domain || 'Lainnya',
      Entitas: l.entityType,
      'Nama Objek': l.entityName,
      Tingkat: l.severity || 'normal',
      Keterangan: l.details || '',
      'IP Address': l.ipAddress || '—',
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Trail');
    XLSX.writeFile(wb, `Audit_Trail_GPIB_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Audit trail berhasil diekspor ke Excel!');
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(16);
    doc.text('GPIB Jemaat — Laporan Audit Trail & Akuntabilitas Data', 14, 15);
    doc.setFontSize(9);
    doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')} | Total entri: ${filteredLogs.length}`, 14, 22);

    const rows = filteredLogs.map((l, idx) => [
      idx + 1,
      formatTimestamp(l.timestamp),
      `${l.userName} (${l.userRole || 'User'})`,
      l.action,
      l.domain || l.entityType,
      l.entityName,
      l.severity || 'normal',
      l.details || '—',
    ]);

    autoTable(doc, {
      startY: 26,
      head: [['No', 'Waktu', 'Pengguna / Peran', 'Aksi', 'Domain', 'Nama Objek Data', 'Tingkat', 'Detail Perubahan']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [15, 45, 65] },
      styles: { fontSize: 8 },
    });

    doc.save(`Laporan_Audit_Trail_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success('Laporan audit berhasil diekspor ke PDF!');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#0f2d41' }}>
              <Shield className="w-5 h-5 text-[#f0ede5]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Audit Trail & Jejak Modifikasi Data</h2>
              <p className="text-xs text-slate-500">
                Pencatatan otomatis seluruh operasi sensitif (Jemaat, Keuangan, Aset) untuk transparansi dan akuntabilitas
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Ekspor Excel
          </button>
          <button
            onClick={exportToPDF}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#144f6b] bg-[#f0ede5] hover:bg-[#e4dfd3] border border-[#144f6b]/20 rounded-xl transition-colors shadow-sm"
          >
            <FileText className="w-3.5 h-3.5" />
            Ekspor PDF
          </button>
        </div>
      </div>

      {/* Metrics Card Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Log Tercatat</span>
            <Activity className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{stats.total}</p>
          <span className="text-[10px] text-slate-400">Seluruh modul sistem</span>
        </div>

        <div className="p-4 rounded-xl bg-sky-50/50 border border-sky-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-sky-800">Operasi Jemaat</span>
            <Users className="w-4 h-4 text-sky-600" />
          </div>
          <p className="text-2xl font-bold text-sky-950 mt-2">{stats.memberOps}</p>
          <span className="text-[10px] text-sky-600">Sensus, KK, Sakramen, Atestasi</span>
        </div>

        <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800">Operasi Keuangan</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-950 mt-2">{stats.financialOps}</p>
          <span className="text-[10px] text-emerald-600">Kas, Persembahan, Rekening</span>
        </div>

        <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800">Operasi Aset & Barang</span>
            <Package className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-950 mt-2">{stats.assetOps}</p>
          <span className="text-[10px] text-amber-600">Inventaris & Pemeliharaan</span>
        </div>

        <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-800">Aktivitas Sensitif</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-bold text-rose-950 mt-2">{stats.sensitiveCount}</p>
          <span className="text-[10px] text-rose-600">Penghapusan & Nominal Besar</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4 shadow-sm border-slate-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Keyword Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Cari user, nama objek, detail..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
            />
          </div>

          {/* Domain Filter */}
          <div>
            <Select value={filterDomain} onValueChange={setFilterDomain}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Domain Modul" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Domain Modul</SelectItem>
                <SelectItem value="Member">Sensus / Database Jemaat</SelectItem>
                <SelectItem value="Financial">Keuangan & Perbendaharaan</SelectItem>
                <SelectItem value="Asset">Aset & Inventaris Gereja</SelectItem>
                <SelectItem value="Worship">Ibadah & Pelayanan</SelectItem>
                <SelectItem value="Service">Diakonia & Komunikasi</SelectItem>
                <SelectItem value="System">Pengguna & Konfigurasi</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Action Filter */}
          <div>
            <Select value={filterAction} onValueChange={setFilterAction}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Jenis Aksi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Aksi</SelectItem>
                <SelectItem value="Menambahkan">Menambahkan</SelectItem>
                <SelectItem value="Mengubah">Mengubah</SelectItem>
                <SelectItem value="Menghapus">Menghapus</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* User Filter */}
          <div>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Filter Pengguna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Pengguna</SelectItem>
                {uniqueUsers.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Severity Filter */}
          <div>
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Tingkat Sensitivitas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tingkat Sensitivitas</SelectItem>
                <SelectItem value="normal">Standar (Operasi Biasa)</SelectItem>
                <SelectItem value="sensitive">Sensitif (Modifikasi Penting)</SelectItem>
                <SelectItem value="critical">Kritis (Hapus / Nominal Besar)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Audit Log Timeline Table & Cards */}
      <Card className="p-0 overflow-hidden shadow-sm border-slate-200">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-700">Daftar Rekaman Audit ({filteredLogs.length})</span>
          </div>
          <span className="text-[11px] text-slate-500">Klik baris entri untuk melihat rincian sebelum & sesudah</span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Info className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">Tidak ada catatan audit yang cocok</p>
            <p className="text-xs text-slate-400 mt-1">Coba sesuaikan kata kunci atau filter pencarian Anda</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredLogs.map(log => {
              const isExpanded = expandedLogId === log.id;
              const hasDiff = log.diff && log.diff.length > 0;
              const hasStates = Boolean(log.beforeState || log.afterState);

              return (
                <div
                  key={log.id}
                  className={`transition-colors ${isExpanded ? 'bg-slate-50/80' : 'hover:bg-slate-50/40'}`}
                >
                  <div
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="p-4 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    {/* Left details */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white border border-slate-200 shadow-2xs flex-shrink-0 mt-0.5">
                        {getActionIcon(log.action)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-slate-900">{log.userName}</span>
                          {log.userRole && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {log.userRole}
                            </span>
                          )}
                          <Badge
                            className={`text-[10px] font-semibold px-2 py-0.2 ${
                              log.action === 'Menambahkan'
                                ? 'bg-emerald-100 text-emerald-800'
                                : log.action === 'Mengubah'
                                ? 'bg-[#f0ede5] text-[#144f6b]'
                                : log.action === 'Menghapus'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {log.action}
                          </Badge>
                          {getDomainBadge(log)}
                          {getSeverityBadge(log.severity)}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                          {getEntityIcon(log.entityType, log.domain)}
                          <span className="text-slate-500 font-normal">{log.entityType}:</span>
                          <span className="font-semibold text-slate-900 truncate max-w-md">{log.entityName}</span>
                        </div>

                        {log.details && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-1">{log.details}</p>
                        )}
                      </div>
                    </div>

                    {/* Right timestamp & expand indicator */}
                    <div className="flex items-center justify-between md:justify-end gap-3 flex-shrink-0 text-right">
                      <div className="flex flex-col items-start md:items-end">
                        <div className="flex items-center gap-1 text-xs font-medium text-slate-600">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{formatTimestamp(log.timestamp)}</span>
                        </div>
                        {log.ipAddress && (
                          <span className="text-[10px] text-slate-400">IP: {log.ipAddress}</span>
                        )}
                      </div>
                      <button className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Detail Panel (Deep Inspection & Diff View) */}
                  {isExpanded && (
                    <div className="px-6 pb-6 pt-2 border-t border-slate-200/60 bg-white mx-4 my-2 rounded-xl border">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5 text-[#144f6b]" />
                          Rincian & Jejak Perubahan (Audit Inspection)
                        </h4>
                        <span className="text-[10px] text-slate-400">ID Entitas: {log.entityId}</span>
                      </div>

                      {/* Field Differences Table if any */}
                      {hasDiff ? (
                        <div className="space-y-2 mb-4">
                          <p className="text-[11px] font-semibold text-slate-600">Atribut yang Diubah:</p>
                          <div className="rounded-lg border border-slate-200 overflow-hidden text-xs">
                            <table className="w-full text-left">
                              <thead className="bg-slate-50 border-b border-slate-200 text-[10.5px] font-semibold text-slate-600">
                                <tr>
                                  <th className="p-2.5">Nama Atribut</th>
                                  <th className="p-2.5 bg-rose-50/50 text-rose-800">Nilai Sebelum (Lama)</th>
                                  <th className="p-2.5 bg-emerald-50/50 text-emerald-800">Nilai Sesudah (Baru)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {log.diff!.map((d, i) => (
                                  <tr key={i} className="hover:bg-slate-50/50">
                                    <td className="p-2.5 font-medium text-slate-800">{d.label || AUDIT_FIELD_LABELS[d.field] || d.field}</td>
                                    <td className="p-2.5 font-mono text-[11px] text-rose-700 bg-rose-50/30">
                                      {d.oldValue !== undefined && d.oldValue !== null && d.oldValue !== '' ? String(d.oldValue) : '— (Kosong)'}
                                    </td>
                                    <td className="p-2.5 font-mono text-[11px] text-emerald-700 bg-emerald-50/30">
                                      {d.newValue !== undefined && d.newValue !== null && d.newValue !== '' ? String(d.newValue) : '— (Dikosongkan)'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-600 mb-3">
                          <p className="font-medium text-slate-800">Informasi Operasi:</p>
                          <p className="text-slate-600 mt-0.5">{log.details || 'Operasi tercatat pada database.'}</p>
                        </div>
                      )}

                      {/* Snapshot Before/After JSON inspection for Administrators */}
                      {hasStates && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                          {log.beforeState && (
                            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/70">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">State Sebelum Perubahan</p>
                              <pre className="text-[10.5px] font-mono text-slate-700 overflow-x-auto max-h-40 bg-white p-2 rounded border border-slate-200">
                                {JSON.stringify(log.beforeState, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.afterState && (
                            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/70">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">State Setelah Perubahan</p>
                              <pre className="text-[10.5px] font-mono text-slate-700 overflow-x-auto max-h-40 bg-white p-2 rounded border border-slate-200">
                                {JSON.stringify(log.afterState, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
