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
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Key,
  Lock,
  AlertTriangle,
  Search,
  FileSpreadsheet,
  FileText,
  Clock,
  ChevronDown,
  ChevronUp,
  User,
  DollarSign,
  Package,
  Info,
  Calendar,
  Layers,
  ArrowRight,
  Database,
  Users,
  Eye,
  RefreshCw
} from 'lucide-react';
import { ActivityLog as ActivityLogType, AuditDiffField } from '../types';
import { AUDIT_FIELD_LABELS } from '../lib/auditUtils';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

export type AuditCategoryFilter = 'all' | 'role_access' | 'deletion' | 'financial_critical';

interface AuditLogProps {
  embedded?: boolean;
  limit?: number;
  initialCategory?: AuditCategoryFilter;
  onViewAll?: () => void;
}

/**
 * Checks if an activity log represents a critical system event:
 * - User role updates & access control modifications
 * - Data deletions across all modules
 * - Critical / sensitive operations
 */
export function isCriticalAuditEntry(log: ActivityLogType): boolean {
  if (log.severity === 'critical') return true;
  if (log.action === 'Menghapus' || (log.action && log.action.toLowerCase().includes('hapus'))) return true;
  if (log.action === 'Ubah Peran' || log.action === 'Ubah Hak Akses' || log.action === 'Reset Password' || log.action === 'Ubah Status Akun') return true;
  if (['User', 'CustomRole', 'RolePermission'].includes(log.entityType) && log.action !== 'Login' && log.action !== 'Logout') return true;
  if (log.diff && log.diff.some(d => ['role', 'permissions', 'isActive', 'password'].includes(d.field))) return true;

  const desc = (log.details || '').toLowerCase();
  if (desc.includes('peran') || desc.includes('role') || desc.includes('hak akses') || desc.includes('dihapus') || desc.includes('reset kata sandi')) {
    return true;
  }
  return false;
}

/**
 * Categorizes the critical event into specific audit classification
 */
export function classifyAuditEntry(log: ActivityLogType): 'role_access' | 'deletion' | 'financial_critical' | 'system_critical' {
  if (log.action === 'Menghapus' || (log.details || '').toLowerCase().includes('dihapus')) {
    return 'deletion';
  }
  if (
    log.action === 'Ubah Peran' ||
    log.action === 'Ubah Hak Akses' ||
    log.action === 'Ubah Status Akun' ||
    log.action === 'Reset Password' ||
    ['User', 'CustomRole', 'RolePermission'].includes(log.entityType) ||
    (log.diff && log.diff.some(d => ['role', 'permissions', 'isActive'].includes(d.field))) ||
    (log.details || '').toLowerCase().includes('peran') ||
    (log.details || '').toLowerCase().includes('role') ||
    (log.details || '').toLowerCase().includes('hak akses')
  ) {
    return 'role_access';
  }
  if (log.domain === 'Financial' || ['FinancialRecord', 'PettyCash', 'PcTopUp', 'Offering', 'BankAccount', 'Budget', 'Liability'].includes(log.entityType)) {
    return 'financial_critical';
  }
  return 'system_critical';
}

export function AuditLog({
  embedded = false,
  limit,
  initialCategory = 'all',
  onViewAll,
}: AuditLogProps) {
  const { activityLogs, activityLogsLoaded, ensureActivityLogsLoaded } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<AuditCategoryFilter>(initialCategory);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEntity, setFilterEntity] = useState<string>('all');
  const [filterTimeframe, setFilterTimeframe] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Filter only critical logs
  const allCriticalLogs = useMemo(() => {
    return activityLogs.filter(isCriticalAuditEntry);
  }, [activityLogs]);

  // Statistics
  const stats = useMemo(() => {
    const total = allCriticalLogs.length;
    const roleCount = allCriticalLogs.filter(l => classifyAuditEntry(l) === 'role_access').length;
    const deletionCount = allCriticalLogs.filter(l => classifyAuditEntry(l) === 'deletion').length;
    const financialCount = allCriticalLogs.filter(l => classifyAuditEntry(l) === 'financial_critical').length;
    const distinctUsers = new Set(allCriticalLogs.map(l => l.userName)).size;

    return { total, roleCount, deletionCount, financialCount, distinctUsers };
  }, [allCriticalLogs]);

  // Filtered dataset
  const filteredCriticalLogs = useMemo(() => {
    let list = [...allCriticalLogs];

    // Category Filter
    if (selectedCategory !== 'all') {
      list = list.filter(l => classifyAuditEntry(l) === selectedCategory);
    }

    // Entity Filter
    if (filterEntity !== 'all') {
      list = list.filter(l => l.entityType === filterEntity);
    }

    // Timeframe filter
    if (filterTimeframe !== 'all') {
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      if (filterTimeframe === '24h') {
        list = list.filter(l => now - new Date(l.timestamp).getTime() <= oneDayMs);
      } else if (filterTimeframe === '7d') {
        list = list.filter(l => now - new Date(l.timestamp).getTime() <= 7 * oneDayMs);
      } else if (filterTimeframe === '30d') {
        list = list.filter(l => now - new Date(l.timestamp).getTime() <= 30 * oneDayMs);
      }
    }

    // Search query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(l =>
        (l.userName && l.userName.toLowerCase().includes(q)) ||
        (l.entityName && l.entityName.toLowerCase().includes(q)) ||
        (l.entityType && l.entityType.toLowerCase().includes(q)) ||
        (l.details && l.details.toLowerCase().includes(q)) ||
        (l.userRole && l.userRole.toLowerCase().includes(q)) ||
        (l.ipAddress && l.ipAddress.toLowerCase().includes(q))
      );
    }

    // Sort newest first
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (limit && limit > 0) {
      return list.slice(0, limit);
    }
    return list;
  }, [allCriticalLogs, selectedCategory, filterEntity, filterTimeframe, searchTerm, limit]);

  // Unique entities for filtering
  const uniqueEntities = useMemo(() => {
    const set = new Set<string>();
    allCriticalLogs.forEach(l => {
      if (l.entityType) set.add(l.entityType);
    });
    return Array.from(set).sort();
  }, [allCriticalLogs]);

  const formatTimestamp = (timestamp: string) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getRelativeTime = (timestamp: string) => {
    const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (diff < 60) return 'Baru saja';
    if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
    const days = Math.floor(diff / 86400);
    if (days === 1) return 'Kemarin';
    if (days < 30) return `${days} hari lalu`;
    return `${Math.floor(days / 30)} bulan lalu`;
  };

  // Export to Excel
  const exportToExcel = () => {
    const exportData = filteredCriticalLogs.map((l, i) => ({
      No: i + 1,
      Waktu: formatTimestamp(l.timestamp),
      'Kategori Audit': classifyAuditEntry(l) === 'role_access' ? 'Perubahan Role / Akses' : classifyAuditEntry(l) === 'deletion' ? 'Penghapusan Data' : 'Finansial / Sistem Kritis',
      Pengguna: l.userName,
      'Peran Pengguna': l.userRole || 'User',
      Aksi: l.action,
      'Tipe Objek': l.entityType,
      'Nama Objek': l.entityName,
      'Detail Perubahan': l.details || '',
      'IP Address': l.ipAddress || '—',
      'Tingkat Keamanan': l.severity || 'critical',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Kritis');
    XLSX.writeFile(wb, `Audit_Log_Kritis_GPIB_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Audit log kritis berhasil diekspor ke Excel!');
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(16);
    doc.text('GPIB Jemaat — Laporan Audit Log Perubahan Kritis Sistem', 14, 15);
    doc.setFontSize(9);
    doc.text(`Waktu cetak: ${new Date().toLocaleString('id-ID')} | Total rekaman kritis: ${filteredCriticalLogs.length}`, 14, 22);

    const rows = filteredCriticalLogs.map((l, idx) => [
      idx + 1,
      formatTimestamp(l.timestamp),
      `${l.userName} (${l.userRole || 'Admin'})`,
      l.action,
      l.entityType,
      l.entityName,
      classifyAuditEntry(l) === 'role_access' ? 'Role / Akses' : classifyAuditEntry(l) === 'deletion' ? 'Hapus Data' : 'Kritis',
      l.details || '—',
    ]);

    autoTable(doc, {
      startY: 26,
      head: [['No', 'Waktu', 'Pengguna / Role', 'Aksi', 'Tipe Entitas', 'Nama Objek', 'Kategori', 'Detail Jejak Audit']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [159, 18, 57] }, // deep rose / ruby
      styles: { fontSize: 8 },
    });

    doc.save(`Audit_Log_Kritis_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success('Laporan audit log kritis berhasil diekspor ke PDF!');
  };

  return (
    <div className={`space-y-6 ${embedded ? 'pt-2' : ''}`}>
      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-950 text-rose-100 shadow-sm">
              <ShieldAlert className="w-5 h-5 text-rose-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">Audit Log Perubahan Kritis</h3>
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                  {stats.total} Peristiwa Kritis
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Monitoring terpusat atas perubahan peran pengguna (user role updates), hak akses, dan penghapusan data (data deletions).
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {!activityLogsLoaded && (
            <button
              onClick={() => ensureActivityLogsLoaded()}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Memuat data
            </button>
          )}

          <button
            onClick={exportToExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors shadow-2xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Ekspor Excel
          </button>
          <button
            onClick={exportToPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors shadow-2xs"
          >
            <FileText className="w-3.5 h-3.5" />
            Ekspor PDF
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Total Critical */}
        <div
          onClick={() => setSelectedCategory('all')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            selectedCategory === 'all'
              ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-200 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">Semua Perubahan Kritis</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{stats.total}</p>
          <span className="text-[10.5px] text-slate-500">Seluruh modul sistem</span>
        </div>

        {/* Card 2: Role & Access Changes */}
        <div
          onClick={() => setSelectedCategory('role_access')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            selectedCategory === 'role_access'
              ? 'bg-purple-50/70 border-purple-300 ring-2 ring-purple-200 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-900">Peran & Hak Akses</span>
            <Key className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-purple-950 mt-2">{stats.roleCount}</p>
          <span className="text-[10.5px] text-purple-600">Update role, izin & status akun</span>
        </div>

        {/* Card 3: Data Deletions */}
        <div
          onClick={() => setSelectedCategory('deletion')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            selectedCategory === 'deletion'
              ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-200 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-900">Penghapusan Data</span>
            <Trash2 className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-bold text-rose-950 mt-2">{stats.deletionCount}</p>
          <span className="text-[10.5px] text-rose-600">Jemaat, Kas, Aset, Pengguna</span>
        </div>

        {/* Card 4: Financial & System Operations */}
        <div
          onClick={() => setSelectedCategory('financial_critical')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            selectedCategory === 'financial_critical'
              ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-200 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-900">Finansial Bernilai Tinggi</span>
            <DollarSign className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-950 mt-2">{stats.financialCount}</p>
          <span className="text-[10.5px] text-amber-600">Transaksi &gt;= Rp 5 Juta</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-3.5 shadow-2xs border-slate-200 bg-white">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari user, nama objek, rincian diff..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400 bg-white"
            />
          </div>

          {/* Category Filter */}
          <div>
            <Select value={selectedCategory} onValueChange={(val) => setSelectedCategory(val as AuditCategoryFilter)}>
              <SelectTrigger className="text-xs h-8.5">
                <SelectValue placeholder="Kategori Audit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Peristiwa Kritis ({stats.total})</SelectItem>
                <SelectItem value="role_access">Peran & Hak Akses ({stats.roleCount})</SelectItem>
                <SelectItem value="deletion">Penghapusan Data ({stats.deletionCount})</SelectItem>
                <SelectItem value="financial_critical">Finansial Kritis ({stats.financialCount})</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Entity Type Filter */}
          <div>
            <Select value={filterEntity} onValueChange={setFilterEntity}>
              <SelectTrigger className="text-xs h-8.5">
                <SelectValue placeholder="Semua Tipe Objek" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tipe Entitas</SelectItem>
                {uniqueEntities.map(ent => (
                  <SelectItem key={ent} value={ent}>
                    {ent === 'User' ? 'Pengguna (User)' :
                     ent === 'Member' ? 'Jemaat (Member)' :
                     ent === 'Family' ? 'Keluarga (KK)' :
                     ent === 'FinancialRecord' ? 'Buku Kas / Keuangan' :
                     ent === 'ChurchAsset' ? 'Aset Gereja' :
                     ent === 'RolePermission' ? 'Hak Akses Role' :
                     ent === 'CustomRole' ? 'Custom Role' :
                     ent}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Timeframe Filter */}
          <div>
            <Select value={filterTimeframe} onValueChange={setFilterTimeframe}>
              <SelectTrigger className="text-xs h-8.5">
                <SelectValue placeholder="Rentang Waktu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Rentang Waktu</SelectItem>
                <SelectItem value="24h">24 Jam Terakhir</SelectItem>
                <SelectItem value="7d">7 Hari Terakhir</SelectItem>
                <SelectItem value="30d">30 Hari Terakhir</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Critical Audit Stream Table */}
      <Card className="p-0 overflow-hidden shadow-2xs border-slate-200 bg-white">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-rose-700" />
            <span className="text-xs font-bold text-slate-800">
              Daftar Rekaman Audit Kritis ({filteredCriticalLogs.length})
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Klik baris untuk memeriksa jejak sebelum/sesudah perubahan (Diff & Snapshot)
          </span>
        </div>

        {filteredCriticalLogs.length === 0 ? (
          <div className="text-center py-12 px-4">
            <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-800">Tidak ada rekaman kritis yang ditemukan</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Tidak ada operasi perubahan peran pengguna atau penghapusan data yang cocok dengan kriteria filter saat ini. Integritas sistem terjaga dengan baik.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredCriticalLogs.map((log, idx) => {
              const category = classifyAuditEntry(log);
              const isExpanded = expandedLogId === log.id;
              const hasDiff = Boolean(log.diff && log.diff.length > 0);
              const hasBeforeState = Boolean(log.beforeState);
              const hasAfterState = Boolean(log.afterState);

              const isRoleUpdate = category === 'role_access';
              const isDeletion = category === 'deletion';

              return (
                <div
                  key={`${log.id}-${idx}`}
                  className={`transition-colors ${isExpanded ? 'bg-slate-50/90' : 'hover:bg-slate-50/50'}`}
                >
                  <div
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="p-4 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    {/* Left Icon & Information */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {/* Action Visual Badge */}
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 border shadow-2xs ${
                          isDeletion
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : isRoleUpdate
                            ? 'bg-purple-50 border-purple-200 text-purple-700'
                            : 'bg-amber-50 border-amber-200 text-amber-700'
                        }`}
                      >
                        {isDeletion ? (
                          <Trash2 className="w-4 h-4" />
                        ) : isRoleUpdate ? (
                          <Key className="w-4 h-4" />
                        ) : (
                          <AlertTriangle className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          {/* User tag */}
                          <span className="text-xs font-bold text-slate-900">{log.userName}</span>
                          {log.userRole && (
                            <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {log.userRole}
                            </span>
                          )}

                          {/* Event Classification Tag */}
                          {isDeletion ? (
                            <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[10px] font-bold">
                              Penghapusan Data
                            </Badge>
                          ) : isRoleUpdate ? (
                            <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] font-bold">
                              Pembaruan Role / Hak Akses
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-bold">
                              Operasi Finansial Kritis
                            </Badge>
                          )}

                          {/* Entity Type Pill */}
                          <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                            {log.entityType}
                          </span>

                          <Badge className="bg-rose-900 text-white text-[9.5px] font-semibold">
                            Kritis
                          </Badge>
                        </div>

                        {/* Target Object Name */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-800 font-medium">
                          <span className="text-slate-400 font-normal">Objek:</span>
                          <span className="font-semibold text-slate-900 truncate max-w-md">{log.entityName}</span>
                          {log.amount && (
                            <span className="text-emerald-700 font-semibold ml-1">
                              (Rp {log.amount.toLocaleString('id-ID')})
                            </span>
                          )}
                        </div>

                        {/* Details */}
                        {log.details && (
                          <p className="text-xs text-slate-600 mt-1 line-clamp-1">{log.details}</p>
                        )}
                      </div>
                    </div>

                    {/* Right Timestamp and Toggle */}
                    <div className="flex items-center justify-between md:justify-end gap-3 flex-shrink-0 text-right">
                      <div className="flex flex-col items-start md:items-end">
                        <div className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{getRelativeTime(log.timestamp)}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">{formatTimestamp(log.timestamp)}</span>
                        {log.ipAddress && (
                          <span className="text-[9.5px] text-slate-400 font-mono">IP: {log.ipAddress}</span>
                        )}
                      </div>
                      <button className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Detail Panel */}
                  {isExpanded && (
                    <div className="px-6 pb-6 pt-2 border-t border-slate-200 bg-white mx-4 my-2 rounded-xl border">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5 text-rose-700" />
                          Jejak Audit Mendalam & Verifikasi Integritas
                        </h4>
                        <span className="text-[10.5px] font-mono text-slate-400">ID Entitas: {log.entityId}</span>
                      </div>

                      {/* Case 1: Role Update Highlight Box */}
                      {isRoleUpdate && (
                        <div className="p-3.5 rounded-lg bg-purple-50/50 border border-purple-200 mb-4">
                          <p className="text-xs font-bold text-purple-950 mb-2 flex items-center gap-1.5">
                            <Key className="w-3.5 h-3.5 text-purple-700" />
                            Ringkasan Perubahan Peran & Hak Akses
                          </p>
                          <p className="text-xs text-purple-900 leading-relaxed mb-3">
                            {log.details || 'Pembaruan peran atau izin pengguna dalam sistem.'}
                          </p>

                          {hasDiff && (
                            <div className="rounded-lg border border-purple-200/80 bg-white overflow-hidden text-xs">
                              <table className="w-full text-left">
                                <thead className="bg-purple-100/50 border-b border-purple-200 text-[10.5px] font-semibold text-purple-900">
                                  <tr>
                                    <th className="p-2.5">Atribut</th>
                                    <th className="p-2.5 bg-rose-50/50 text-rose-900">Nilai Sebelumnya</th>
                                    <th className="p-2.5 bg-emerald-50/50 text-emerald-900">Nilai Ditetapkan</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-purple-100">
                                  {log.diff!.map((d, i) => (
                                    <tr key={i} className="hover:bg-purple-50/30">
                                      <td className="p-2.5 font-medium text-slate-800">
                                        {d.label || AUDIT_FIELD_LABELS[d.field] || d.field}
                                      </td>
                                      <td className="p-2.5 font-mono text-[11px] text-rose-700 bg-rose-50/30 font-semibold">
                                        {d.oldValue !== undefined && d.oldValue !== null ? String(d.oldValue) : '—'}
                                      </td>
                                      <td className="p-2.5 font-mono text-[11px] text-emerald-700 bg-emerald-50/30 font-semibold">
                                        {d.newValue !== undefined && d.newValue !== null ? String(d.newValue) : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Case 2: Data Deletion Snapshot Box */}
                      {isDeletion && (
                        <div className="p-3.5 rounded-lg bg-rose-50/50 border border-rose-200 mb-4">
                          <p className="text-xs font-bold text-rose-950 mb-1 flex items-center gap-1.5">
                            <Trash2 className="w-3.5 h-3.5 text-rose-700" />
                            Data yang Telah Dihapus dari Sistem
                          </p>
                          <p className="text-xs text-rose-900 mb-3">
                            {log.details || `Objek ${log.entityType} dengan nama "${log.entityName}" telah dihapus secara permanen.`}
                          </p>

                          {log.beforeState ? (
                            <div>
                              <p className="text-[10px] font-bold text-rose-800 uppercase tracking-wider mb-1">
                                Snapshot Rekaman Terakhir Sebelum Penghapusan:
                              </p>
                              <div className="bg-white p-3 rounded-lg border border-rose-200 overflow-x-auto text-xs">
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                  {Object.entries(log.beforeState)
                                    .filter(([k]) => !['password', 'members'].includes(k))
                                    .map(([key, val]) => (
                                      <div key={key} className="p-2 rounded bg-slate-50 border border-slate-100">
                                        <span className="text-[10px] font-semibold text-slate-400 block uppercase">
                                          {AUDIT_FIELD_LABELS[key] || key}
                                        </span>
                                        <span className="text-xs font-medium text-slate-800 truncate block">
                                          {typeof val === 'object' ? JSON.stringify(val) : String(val ?? '—')}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-500 italic">
                              Catatan: Snapshot rincian data tersimpan pada log ID #{log.id}.
                            </p>
                          )}
                        </div>
                      )}

                      {/* General Diff table if any other event */}
                      {!isRoleUpdate && !isDeletion && hasDiff && (
                        <div className="space-y-2 mb-4">
                          <p className="text-[11px] font-semibold text-slate-700">Rincian Nilai yang Dimodifikasi:</p>
                          <div className="rounded-lg border border-slate-200 overflow-hidden text-xs">
                            <table className="w-full text-left">
                              <thead className="bg-slate-50 border-b border-slate-200 text-[10.5px] font-semibold text-slate-600">
                                <tr>
                                  <th className="p-2.5">Atribut</th>
                                  <th className="p-2.5 bg-rose-50/50 text-rose-800">Sebelum</th>
                                  <th className="p-2.5 bg-emerald-50/50 text-emerald-800">Sesudah</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {log.diff!.map((d, i) => (
                                  <tr key={i} className="hover:bg-slate-50/50">
                                    <td className="p-2.5 font-medium text-slate-800">{d.label || AUDIT_FIELD_LABELS[d.field] || d.field}</td>
                                    <td className="p-2.5 font-mono text-[11px] text-rose-700 bg-rose-50/30">
                                      {d.oldValue !== undefined && d.oldValue !== null ? String(d.oldValue) : '—'}
                                    </td>
                                    <td className="p-2.5 font-mono text-[11px] text-emerald-700 bg-emerald-50/30">
                                      {d.newValue !== undefined && d.newValue !== null ? String(d.newValue) : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Technical Audit Metadata Footer */}
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-[10.5px] text-slate-400 gap-2">
                        <span>Pengguna Pelaksana: <strong className="text-slate-600">{log.userName}</strong> ({log.userRole || 'Admin'})</span>
                        <span>IP Address: <strong className="font-mono text-slate-600">{log.ipAddress || '127.0.0.1'}</strong></span>
                        <span>Waktu Sistem: {log.timestamp}</span>
                      </div>
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
