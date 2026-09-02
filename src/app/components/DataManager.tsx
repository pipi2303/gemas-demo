import React from 'react';
import { useApp } from '../context/AppContext';
import { Download, Database, FileSpreadsheet } from 'lucide-react';
import { backupAllData, exportMembersToExcel, exportMembersToPDF, exportAttendanceToExcel, exportFinancialToExcel } from '../utils/exportUtils';
import { toast } from 'sonner';

export function DataManager() {
  const { members, families, attendance, financialRecords, sectors } = useApp();

  const handleBackupAll = () => {
    try {
      backupAllData({ members, families, attendance, financialRecords });
      toast.success('Backup berhasil! File telah diunduh.');
    } catch {
      toast.error('Gagal membuat backup. Coba lagi.');
    }
  };

  const safeExport = (fn: () => void, label: string) => {
    try { fn(); toast.success(`Export ${label} berhasil!`); }
    catch { toast.error(`Gagal export ${label}. Coba lagi.`); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold mb-2">Manajemen Data</h1>
        <p className="text-gray-600">Backup dan export data gereja</p>
      </div>

      {/* Backup Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <Database className="w-6 h-6 text-blue-500" />
          <h2 className="text-lg font-semibold">Backup Data</h2>
        </div>
        <p className="text-gray-600 mb-4">
          Backup semua data gereja ke dalam satu file Excel. Termasuk data jemaat, keluarga, kehadiran, dan keuangan.
        </p>
        <button
          onClick={handleBackupAll}
          className="flex items-center gap-2 px-6 py-3 bg-[#1A77A3] text-white rounded-lg hover:bg-[#144f6b]"
        >
          <Download className="w-5 h-5" />
          Backup Semua Data
        </button>
      </div>

      {/* Export Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <FileSpreadsheet className="w-6 h-6 text-green-500" />
          <h2 className="text-lg font-semibold">Export Data</h2>
        </div>
        <p className="text-gray-600 mb-4">
          Export data spesifik ke format Excel atau PDF untuk laporan.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-medium mb-2">Data Jemaat</h3>
            <p className="text-sm text-gray-600 mb-3">{members.length} jemaat</p>
            <div className="flex gap-2">
              <button onClick={() => safeExport(() => exportMembersToExcel(members, sectors), 'Data Jemaat')} className="flex-1 text-sm px-3 py-2 bg-green-100 text-green-700 rounded hover:bg-green-200">Excel</button>
              <button onClick={() => safeExport(() => exportMembersToPDF(members, sectors), 'Data Jemaat PDF')} className="flex-1 text-sm px-3 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200">PDF</button>
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-medium mb-2">Data Kehadiran</h3>
            <p className="text-sm text-gray-600 mb-3">{attendance.length} record</p>
            <button onClick={() => safeExport(() => exportAttendanceToExcel(attendance, members, sectors), 'Data Kehadiran')} className="w-full text-sm px-3 py-2 bg-green-100 text-green-700 rounded hover:bg-green-200">Excel</button>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-medium mb-2">Data Keuangan</h3>
            <p className="text-sm text-gray-600 mb-3">{financialRecords.length} transaksi</p>
            <button onClick={() => safeExport(() => exportFinancialToExcel(financialRecords), 'Data Keuangan')} className="w-full text-sm px-3 py-2 bg-green-100 text-green-700 rounded hover:bg-green-200">Excel</button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Statistik Data</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-[#f0f7fb] rounded-lg">
            <p className="text-3xl font-bold text-blue-600">{members.length}</p>
            <p className="text-sm text-gray-600 mt-1">Jemaat</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-3xl font-bold text-green-600">{families.length}</p>
            <p className="text-sm text-gray-600 mt-1">Keluarga</p>
          </div>
          <div className="text-center p-4 bg-[#f0f7fb] rounded-lg">
            <p className="text-3xl font-bold text-purple-600">{attendance.length}</p>
            <p className="text-sm text-gray-600 mt-1">Record Kehadiran</p>
          </div>
          <div className="text-center p-4 bg-[#fffce8] rounded-lg">
            <p className="text-3xl font-bold text-orange-600">{financialRecords.length}</p>
            <p className="text-sm text-gray-600 mt-1">Transaksi Keuangan</p>
          </div>
        </div>
      </div>
    </div>
  );
}
