import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  HardDrive, Download, RefreshCw, AlertCircle, CheckCircle2,
  WifiOff, FileJson, FileSpreadsheet,
  Database, Activity, Users, Upload,
} from 'lucide-react';
import { Card } from './ui/card';
import { api } from '../../lib/apiClient';
import { toast } from 'sonner';
import {
  backupAllData, exportMembersToExcel, exportMembersToPDF,
  exportAttendanceToExcel, exportFinancialToExcel,
} from '../utils/exportUtils';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColResizeHandle } from './ui/resizable-th';

const COLLECTION_LABELS: Record<string, string> = {
  members:            'Data Jemaat',
  families:           'Data Keluarga',
  sectors:            'Sektor Pelayanan',
  users:              'Pengguna',
  ministries:         'Kategorial',
  events:             'Kalender Gerejawi',
  prayerRequests:     'Permintaan Doa',
  attendance:         'Kehadiran',
  activityLogs:       'Log Aktivitas',
  announcements:      'Pengumuman',
  financialRecords:   'Transaksi Keuangan',
  financialCategories:'Kategori Keuangan',
  worshipSchedules:   'Jadwal Ibadah',
  wartas:             'E-Warta',
  liturgies:          'Tata Ibadah',
  offerings:          'Persembahan',
  attestations:       'Atestasi',
  baptisms:           'Baptisan',
  sidis:              'Sidi',
  marriages:          'Perkawinan',
};

const ORDERED_COLLECTIONS = Object.keys(COLLECTION_LABELS);

type SyncStatus = 'idle' | 'loading' | 'ok' | 'error';

function downloadJSON(data: object, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const BACKUP_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  koleksi: 220, browser: 110, server: 110, status: 120,
};

export function BackupRestore() {
  const {
    members, families, sectors, users, ministries, events,
    prayerRequests, attendance, activityLogs, announcements,
    financialRecords, financialCategories, ministrySchedules,
    worshipSchedules, wartas, liturgies, offerings,
    attestations, baptisms, sidis, marriages,
    activityLogsLoaded, ensureActivityLogsLoaded,
  } = useApp();

  const { widths: colW, startResize } = useResizableColumns('backup-restore-main', BACKUP_TABLE_DEFAULT_WIDTHS);
  const [serverCounts, setServerCounts] = useState<Record<string, number>>({});
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const localCounts: Record<string, number> = {
    members: members.length, families: families.length, sectors: sectors.length,
    users: users.length, ministries: ministries.length, events: events.length,
    prayerRequests: prayerRequests.length, attendance: attendance.length,
    activityLogs: activityLogs.length, announcements: announcements.length,
    financialRecords: financialRecords.length, financialCategories: financialCategories.length,
    ministrySchedules: ministrySchedules.length, worshipSchedules: worshipSchedules.length,
    wartas: wartas.length, liturgies: liturgies.length, offerings: offerings.length,
    attestations: attestations.length, baptisms: baptisms.length,
    sidis: sidis.length, marriages: marriages.length,
  };

  const totalLocal  = Object.values(localCounts).reduce((a, b) => a + b, 0);
  const totalServer = Object.values(serverCounts).reduce((a, b) => a + b, 0);

  const fetchServerCounts = useCallback(async () => {
    setSyncStatus('loading');
    try {
      const counts = await api.get<Record<string, number>>('/api/backup/counts');
      setServerCounts(counts);
      setSyncStatus('ok');
      setLastSync(new Date());
    } catch {
      setSyncStatus('error');
    }
  }, []);

  useEffect(() => { fetchServerCounts(); }, [fetchServerCounts]);
  // activityLogs tidak lagi dimuat otomatis saat boot aplikasi (lihat AppContext) —
  // halaman ini butuh histori lengkap untuk hitung jumlah & export JSON, jadi
  // muat sekali saat dibuka.
  useEffect(() => { ensureActivityLogsLoaded(); }, [ensureActivityLogsLoaded]);

  const handleBackupJSON = () => {
    const now = new Date().toISOString().split('T')[0];
    downloadJSON({
      exportedAt: new Date().toISOString(),
      system: 'GEMAS - GPIB Bahtera Kasih',
      version: '2.0',
      collections: {
        members, families, sectors, users, ministries, events,
        prayerRequests, attendance, activityLogs, announcements,
        financialRecords, financialCategories, ministrySchedules,
        worshipSchedules, wartas, liturgies, offerings,
        attestations, baptisms, sidis, marriages,
      },
    }, `gemas-backup-${now}.json`);
  };

  const handleBackupExcel = () => {
    backupAllData({ members, families, attendance, financialRecords });
  };

  const handleRestore = async (file: File) => {
    try {
      const text = await file.text();
      const isEncrypted = text.startsWith('GEMAS_ENC_V1:');

      let payload: { data?: Record<string, unknown>; encrypted?: string; clearFirst: boolean };

      if (isEncrypted) {
        payload = { encrypted: text, clearFirst: true };
      } else {
        const parsed = JSON.parse(text);
        if (!parsed.data) { toast.error('Format backup tidak valid'); return; }
        payload = { data: parsed.data, clearFirst: true };
      }

      const collections = isEncrypted ? '?' : String(Object.keys((payload as any).data || {}).length);
      if (!confirm(`Restore akan menimpa data yang ada (kecuali pengguna). ${collections} koleksi akan di-restore. Lanjutkan?`)) return;

      setRestoring(true);
      const result = await api.post<{ restored: number; collections: number }>('/api/backup/restore', payload);
      toast.success(`Restore berhasil: ${result.restored} data dari ${result.collections} koleksi`);
      window.location.reload();
    } catch {
      toast.error('Restore gagal. Pastikan file backup valid.');
    } finally {
      setRestoring(false);
    }
  };

  // Integrity check
  const sectorIds     = new Set(sectors.map(s => s.id));
  const orphanFamilies = families.filter(f => !f.sectorId || !sectorIds.has(f.sectorId));
  const familyIds     = new Set(families.map(f => f.id));
  const orphanMembers = members.filter(m => m.familyCode && !familyIds.has(m.familyCode));
  const orphanMembersByFamilyId = members.filter(m => m.familyId && !familyIds.has(m.familyId));
  const inactiveUsers = users.filter(u => !u.isActive);
  const integrityOk   = orphanFamilies.length === 0 && orphanMembers.length === 0 && orphanMembersByFamilyId.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Backup Data & Aplikasi</h2>
          <p className="text-sm text-gray-500 mt-1">Kelola backup, status server, dan integritas data</p>
        </div>
        <div className="flex items-center gap-2">
          {syncStatus === 'ok' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }}>
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-xs font-medium text-green-700">Server Terhubung</span>
            </div>
          )}
          {syncStatus === 'error' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <WifiOff className="w-4 h-4 text-red-500" />
              <span className="text-xs font-medium text-red-600">Server Offline</span>
            </div>
          )}
          {syncStatus === 'loading' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{ background: '#f0f7fb', border: '1px solid #b8d5e8' }}>
              <RefreshCw className="w-4 h-4 text-[#1A77A3] animate-spin" />
              <span className="text-xs font-medium text-[#144f6b]">Memeriksa...</span>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.08)' }}>
              <Users className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{members.length.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Total Jemaat</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#f0f7fb' }}>
              <Database className="w-4 h-4 text-[#1A77A3]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{families.length.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Total Keluarga</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: syncStatus === 'ok' && totalLocal === totalServer ? 'rgba(22,163,74,0.08)' : 'rgba(245,158,11,0.08)' }}>
              <HardDrive className="w-4 h-4" style={{ color: syncStatus === 'ok' && totalLocal === totalServer ? '#16a34a' : '#f59e0b' }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: syncStatus === 'ok' && totalLocal === totalServer ? '#16a34a' : '#f59e0b' }}>
                {syncStatus === 'loading' ? '...' : syncStatus === 'ok' && totalLocal === totalServer ? 'Sinkron' : 'Periksa'}
              </p>
              <p className="text-xs text-gray-500">Status Sinkronisasi</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: integrityOk ? 'rgba(22,163,74,0.08)' : 'rgba(245,158,11,0.08)' }}>
              <Activity className="w-4 h-4" style={{ color: integrityOk ? '#16a34a' : '#f59e0b' }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: integrityOk ? '#16a34a' : '#f59e0b' }}>
                {integrityOk ? 'Baik' : 'Perlu Cek'}
              </p>
              <p className="text-xs text-gray-500">Integritas Data</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Server Database Panel */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100"
          style={{ background: '#f8fafc' }}>
          <div className="flex items-center gap-2.5">
            <Database className="w-4 h-4 text-[#1A77A3]" />
            <h3 className="font-semibold text-gray-800 text-sm">Status Data Server</h3>
          </div>
          <div className="flex items-center gap-3">
            {lastSync && (
              <span className="text-xs text-gray-400">
                Terakhir: {lastSync.toLocaleTimeString('id-ID')}
              </span>
            )}
            <button
              onClick={fetchServerCounts}
              disabled={syncStatus === 'loading'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: '#f0f7fb', color: '#1A77A3', border: '1px solid #b8d5e8' }}
            >
              <RefreshCw className={`w-3 h-3 ${syncStatus === 'loading' ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ width: colW.koleksi, position: 'relative' }}>
                  Koleksi
                  <ColResizeHandle onMouseDown={startResize('koleksi')} />
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ width: colW.browser, position: 'relative' }}>
                  Browser
                  <ColResizeHandle onMouseDown={startResize('browser')} />
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ width: colW.server, position: 'relative' }}>
                  Server
                  <ColResizeHandle onMouseDown={startResize('server')} />
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ width: colW.status, position: 'relative' }}>
                  Status
                  <ColResizeHandle onMouseDown={startResize('status')} />
                </th>
              </tr>
            </thead>
            <tbody>
              {ORDERED_COLLECTIONS.map((col, i) => {
                // activityLogs tidak lagi dimuat otomatis saat boot (lihat AppContext) —
                // selama ensureActivityLogsLoaded() belum selesai, tampilkan sebagai
                // "memuat" alih-alih membandingkan 0 lokal vs server (yang akan salah
                // terlihat sebagai "Beda" padahal cuma belum sempat diambil).
                const activityLogsPending = col === 'activityLogs' && !activityLogsLoaded;
                const local  = localCounts[col] ?? 0;
                const server = serverCounts[col] ?? 0;
                const synced = local === server;
                return (
                  <tr key={col}
                    style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc', borderBottom: '1px solid #f1f5f9' }}
                  >
                    <td className="px-5 py-2.5 text-sm text-gray-700">{COLLECTION_LABELS[col]}</td>
                    <td className="px-4 py-2.5 text-sm text-right font-mono text-gray-600">
                      {activityLogsPending ? <span className="text-gray-300">...</span> : local.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right font-mono text-gray-600">
                      {syncStatus === 'loading' ? (
                        <span className="text-gray-300">...</span>
                      ) : syncStatus === 'error' ? (
                        <span className="text-red-400">—</span>
                      ) : (
                        server.toLocaleString()
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {activityLogsPending ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : syncStatus === 'ok' ? (
                        synced
                          ? <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a' }}>✓ Sinkron</span>
                          : <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(245,158,11,0.1)', color: '#1A77A3' }}>⚠ Beda</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f0f7fb', borderTop: '2px solid #b8d5e8' }}>
                <td className="px-5 py-3 text-sm font-bold text-[#144f6b]">TOTAL</td>
                <td className="px-4 py-3 text-sm text-right font-bold font-mono text-[#144f6b]">{totalLocal.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-right font-bold font-mono text-[#144f6b]">{totalServer.toLocaleString()}</td>
                <td className="px-4 py-3 text-center">
                  {syncStatus === 'ok' && (
                    totalLocal === totalServer
                      ? <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(22,163,74,0.15)', color: '#16a34a' }}>✓ Seimbang</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(245,158,11,0.15)', color: '#1A77A3' }}>⚠ Periksa</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Backup Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#f0f7fb' }}>
              <HardDrive className="w-4 h-4 text-[#1A77A3]" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">Backup Lengkap</h3>
              <p className="text-xs text-gray-500">Semua {ORDERED_COLLECTIONS.length} koleksi</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Download semua data sistem ke file lokal untuk arsip atau pemulihan darurat.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleBackupJSON}
              disabled={!activityLogsLoaded}
              title={!activityLogsLoaded ? 'Menunggu riwayat aktivitas selesai dimuat...' : undefined}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#f0f7fb', color: '#1A77A3', border: '1px solid #b8d5e8' }}
              onMouseOver={e => (e.currentTarget.style.background = '#f0ede5')}
              onMouseOut={e => (e.currentTarget.style.background = '#f0f7fb')}
            >
              <FileJson className="w-4 h-4" />
              JSON Backup
            </button>
            <button
              onClick={handleBackupExcel}
              disabled={!activityLogsLoaded}
              title={!activityLogsLoaded ? 'Menunggu riwayat aktivitas selesai dimuat...' : undefined}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'rgba(22,163,74,0.08)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.2)' }}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(22,163,74,0.15)')}
              onMouseOut={e => (e.currentTarget.style.background = 'rgba(22,163,74,0.08)')}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel Backup
            </button>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.08)' }}>
              <Download className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">Export Per Modul</h3>
              <p className="text-xs text-gray-500">Excel atau PDF per kategori</p>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { label: `Data Jemaat (${members.length})`, onExcel: () => exportMembersToExcel(members, sectors), onPDF: () => exportMembersToPDF(members, sectors), hasPDF: true },
              { label: `Data Kehadiran (${attendance.length})`, onExcel: () => exportAttendanceToExcel(attendance, members, sectors), hasPDF: false },
              { label: `Transaksi Keuangan (${financialRecords.length})`, onExcel: () => exportFinancialToExcel(financialRecords), hasPDF: false },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-50">
                <span className="text-sm text-gray-700">{item.label}</span>
                <div className="flex gap-2">
                  <button onClick={item.onExcel} className="px-2.5 py-1 rounded text-xs font-medium" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a' }}>Excel</button>
                  {item.hasPDF && (
                    <button onClick={item.onPDF} className="px-2.5 py-1 rounded text-xs font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>PDF</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Restore dari Backup */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.08)' }}>
            <Upload className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">Restore dari Backup</h3>
            <p className="text-xs text-gray-500">Pulihkan data dari file backup JSON</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Unggah file backup JSON untuk memulihkan data. Data yang ada (kecuali pengguna) akan ditimpa. Pastikan file backup berasal dari sistem ini.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleRestore(file);
            e.target.value = ''; // reset agar file yang sama bisa dipilih lagi
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={restoring}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)', opacity: restoring ? 0.6 : 1, cursor: restoring ? 'not-allowed' : 'pointer' }}
          onMouseOver={e => { if (!restoring) e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; }}
          onMouseOut={e => { if (!restoring) e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
        >
          <Upload className="w-4 h-4" />
          {restoring ? 'Memulihkan...' : 'Pilih File Backup'}
        </button>
      </Card>

      {/* Integritas Data */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: integrityOk ? 'rgba(22,163,74,0.08)' : 'rgba(245,158,11,0.08)' }}>
            <Activity className="w-4 h-4" style={{ color: integrityOk ? '#16a34a' : '#1A77A3' }} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">Pemeriksaan Integritas Data</h3>
            <p className="text-xs text-gray-500">Deteksi record yang tidak konsisten</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Jemaat dengan Keluarga Tidak Valid', count: orphanMembersByFamilyId.length, desc: 'Jemaat dengan familyId yang tidak ditemukan di data keluarga' },
            { label: 'Jemaat tanpa Kode Keluarga', count: orphanMembers.length, desc: 'Jemaat dengan familyCode yang tidak ditemukan di data keluarga' },
            { label: 'Keluarga tanpa Sektor Valid', count: orphanFamilies.length, desc: 'Keluarga yang sectorId-nya tidak cocok dengan sektor yang ada' },
            { label: 'Pengguna Nonaktif', count: inactiveUsers.length, desc: 'Akun yang statusnya dinonaktifkan di sistem' },
          ].map(item => (
            <div key={item.label} className="p-4 rounded-lg border"
              style={{ borderColor: item.count === 0 ? 'rgba(22,163,74,0.2)' : 'rgba(245,158,11,0.3)', background: item.count === 0 ? 'rgba(22,163,74,0.04)' : 'rgba(245,158,11,0.04)' }}>
              <div className="flex items-start justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">{item.label}</p>
                <span className="text-lg font-bold" style={{ color: item.count === 0 ? '#16a34a' : '#1A77A3' }}>{item.count}</span>
              </div>
              <p className="text-xs text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
        {integrityOk && (
          <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-lg"
            style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)' }}>
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-700">Semua data dalam kondisi baik dan konsisten.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
