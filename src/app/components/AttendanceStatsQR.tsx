import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useDraggable } from '../../lib/useDraggable';
import { toast } from 'sonner';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColResizeHandle } from './ui/resizable-th';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import {
  Users, CheckCircle,
  Search, RefreshCw, Clock, Plus, Pencil, Trash2, X, AlertTriangle, Download, QrCode,
} from 'lucide-react';
import { api } from '../../lib/apiClient';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Absensi Kegiatan ─────────────────────────────────────────────────────────
interface AbsensiRecord {
  id: string;
  kegiatan: string;
  tempat: string;
  tanggal: string; // "YYYY-MM-DD"
  kehadiran: number | null;
}

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function getHari(tanggal: string): string {
  if (!tanggal) return '-';
  return HARI_ID[new Date(tanggal + 'T00:00:00').getDay()];
}

function formatTanggalDisplay(tanggal: string): string {
  if (!tanggal) return '-';
  const d = new Date(tanggal + 'T00:00:00');
  return `${getHari(tanggal)}, ${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
}

const SEED_ABSENSI: AbsensiRecord[] = [
  { id: 'abs1', kegiatan: 'Ibadah Minggu Pagi',       tempat: 'Gereja',               tanggal: '2026-05-03', kehadiran: 99 },
  { id: 'abs2', kegiatan: 'Ibadah Minggu Sore',       tempat: 'Gereja',               tanggal: '2026-05-03', kehadiran: 35 },
  { id: 'abs3', kegiatan: 'IHMPA',                    tempat: 'Gazebo',               tanggal: '2026-05-03', kehadiran: 16 },
  { id: 'abs4', kegiatan: 'IHMPT',                    tempat: 'Ruang Panbang',        tanggal: '2026-05-03', kehadiran: 11 },
  { id: 'abs5', kegiatan: 'Ibadah GP',                tempat: 'Sdr. Prisci Piubatti', tanggal: '2026-05-03', kehadiran: 14 },
  { id: 'abs6', kegiatan: 'Ibadah Keluarga Gabungan', tempat: 'Gereja',               tanggal: '2026-05-06', kehadiran: 57 },
  { id: 'abs7', kegiatan: 'Ibadah PKLU',              tempat: 'Kel. Tumewu',          tanggal: '2026-05-07', kehadiran: 33 },
  { id: 'abs8', kegiatan: 'Ibadah PKP',               tempat: 'Ibu Rosli Sitinjak',   tanggal: '2026-05-08', kehadiran: 22 },
  { id: 'abs9', kegiatan: 'Ibadah PKB',               tempat: '-',                    tanggal: '2026-05-08', kehadiran: null },
  { id: 'abs10', kegiatan: 'Doa Pagi',                tempat: 'Zoom Meeting',         tanggal: '2026-05-09', kehadiran: 11 },
];

const EMPTY_ABSENSI_FORM = { kegiatan: '', tempat: '', tanggal: '', kehadiran: '' };

type ChartCategory = 'Minggu Pagi' | 'Minggu Sore' | 'Rabu' | 'Pemuda';

function categorizeKegiatan(kegiatan: string): ChartCategory | null {
  const k = kegiatan.toLowerCase();
  if (k.includes('sore')) return 'Minggu Sore';
  if (k.includes('minggu') || k.includes('ihmpa') || k.includes('ihmpt')) return 'Minggu Pagi';
  if (k.includes('gp') || k.includes('pemuda')) return 'Pemuda';
  if (k.includes('rabu') || k.includes('pkp') || k.includes('pkb') || k.includes('pklu') || k.includes('keluarga')) return 'Rabu';
  return null;
}

const COLORS = ['#1A77A3', '#caa04a', '#2f8f5b', '#d1553f', '#8b6bb1'];

const LAPORAN_MINGGUAN_DEFAULT_WIDTHS: Record<string, number> = {
  kegiatan: 220, tempat: 180, tanggal: 180, kehadiran: 140, aksi: 110,
};

export function AttendanceStatsQR() {
  const { members, sectors, worshipSchedules, can } = useApp();
  const canCreate = can('attendance', 'create');
  const canEdit   = can('attendance', 'edit');
  const canDelete = can('attendance', 'delete');
  const canExport = can('attendance', 'export');
  const { widths: colW, startResize } = useResizableColumns('attendance-laporan-mingguan', LAPORAN_MINGGUAN_DEFAULT_WIDTHS);
  const { offset: offsetDeleteAbsensi, onMouseDown: onMouseDownDeleteAbsensi } = useDraggable();
  const [isScanning, setIsScanning] = useState(false);
  const [scannedMembers, setScannedMembers] = useState<any[]>([]);
  const [searchScan, setSearchScan] = useState('');
  const [activeSession, setActiveSession] = useState('');
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Integration (audit gap fix): sebelumnya hasil scan/check-in manual hanya
  // hidup di state React lokal (scannedMembers) -- tidak ada panggilan API sama
  // sekali, jadi refresh halaman menghapus semua presensi hari itu. Koleksi
  // `attendanceCheckins` (BUKAN `attendance` yang sudah dipakai fitur Absensi
  // Mingguan di bawah dengan skema AbsensiRecord yang berbeda total -- menimpa
  // koleksi yang sama akan merusak tabel Absensi Mingguan) menyimpan 1 baris per
  // jemaat per sesi per hari, id-nya deterministik (memberId+tanggal+sesi) supaya
  // scan ulang jemaat yang sama otomatis idempoten, bukan menumpuk duplikat.
  useEffect(() => {
    api.get<any[]>('/api/data/attendanceCheckins')
      .then(rows => {
        const todays = (rows || []).filter(r => r.scanDate === todayKey);
        if (todays.length > 0) {
          setScannedMembers(todays.sort((a, b) => (b.scannedAt || '').localeCompare(a.scannedAt || '')));
        }
      })
      .catch(err => console.error('[AttendanceStatsQR] load check-ins:', err));
  }, [todayKey]);

  const persistCheckin = (record: any) => {
    const checkinId = `${record.id}_${todayKey}_${record.session}`.replace(/\s+/g, '_');
    api.put(`/api/data/attendanceCheckins/${checkinId}`, {
      id: checkinId, memberId: record.id, fullName: record.fullName,
      scanDate: todayKey, scanTime: record.scanTime, scannedAt: new Date().toISOString(),
      session: record.session, manual: !!record.manual, present: true,
    }).catch(err => console.error('[AttendanceStatsQR] save check-in:', err));
  };

  // ── Absensi CRUD state ──
  const [absensiRecords, setAbsensiRecords] = useState<AbsensiRecord[]>([]);

  // Audit gap fix: dulu koleksi ini bernama 'attendance', SAMA dengan koleksi asli
  // AppContext untuk tipe Attendance (per-jemaat, dipakai Dashboard/ReportCenter/BackupRestore/
  // DataManager) -- dua skema data yang sama sekali berbeda saling menimpa di koleksi yang sama.
  // Direname jadi 'attendanceKegiatan' supaya data Absensi Mingguan (AbsensiRecord, agregat per
  // kegiatan) tidak lagi bentrok dengan data Attendance (per jemaat, present/absent).
  useEffect(() => {
    api.get<AbsensiRecord[]>('/api/data/attendanceKegiatan')
      .then(data => {
        if (data && data.length > 0) {
          setAbsensiRecords(data);
        } else {
          // Seed initial data
          setAbsensiRecords(SEED_ABSENSI);
          SEED_ABSENSI.forEach(item => {
            api.put(`/api/data/attendanceKegiatan/${item.id}`, item)
              .catch(err => console.error('[AttendanceStatsQR] seed:', err));
          });
        }
      })
      .catch(() => setAbsensiRecords(SEED_ABSENSI));
  }, []);
  const [inlineForm, setInlineForm] = useState({ kegiatan: '', tempat: '', tanggal: '', kehadiran: '' });
  const [inlineError, setInlineError] = useState('');
  const [editingAbsensiId, setEditingAbsensiId] = useState<string | null>(null);
  const [deleteAbsensiId, setDeleteAbsensiId] = useState<string | null>(null);
  const [filterBulanMingguan, setFilterBulanMingguan] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });

  const sortedAbsensi = useMemo(
    () => [...absensiRecords].sort((a, b) => a.tanggal.localeCompare(b.tanggal)),
    [absensiRecords]
  );

  const filteredMingguan = useMemo(
    () => sortedAbsensi.filter(r => r.tanggal.startsWith(filterBulanMingguan)),
    [sortedAbsensi, filterBulanMingguan]
  );

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthlyAbsensi = sortedAbsensi.filter(r => r.tanggal.startsWith(currentMonthKey));
  const totalKegiatanBulan = monthlyAbsensi.length;
  const totalKehadiranBulan = monthlyAbsensi.reduce((sum, r) => sum + (r.kehadiran || 0), 0);
  const rataRataBulan = totalKegiatanBulan > 0 ? Math.round(totalKehadiranBulan / totalKegiatanBulan) : 0;
  const periodeBulan = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const openEditAbsensi = (r: AbsensiRecord) => {
    setEditingAbsensiId(r.id);
    setInlineForm({ kegiatan: r.kegiatan, tempat: r.tempat, tanggal: r.tanggal, kehadiran: r.kehadiran != null ? String(r.kehadiran) : '' });
    setInlineError('');
  };

  const cancelEdit = () => {
    setEditingAbsensiId(null);
    setInlineForm({ kegiatan: '', tempat: '', tanggal: '', kehadiran: '' });
    setInlineError('');
  };

  const simpanAbsensi = () => {
    setInlineError('');
    if (!inlineForm.kegiatan.trim()) { setInlineError('Nama kegiatan wajib diisi.'); return; }
    if (!inlineForm.tempat.trim()) { setInlineError('Tempat wajib diisi.'); return; }
    if (!inlineForm.tanggal) { setInlineError('Tanggal wajib diisi.'); return; }
    if (!inlineForm.kehadiran) { setInlineError('Jumlah kehadiran wajib diisi.'); return; }
    const kehadiran = parseInt(inlineForm.kehadiran);
    if (isNaN(kehadiran)) { setInlineError('Kehadiran harus berupa angka.'); return; }
    let updated: AbsensiRecord[];
    let upsertRecord: AbsensiRecord;
    if (editingAbsensiId) {
      upsertRecord = { ...absensiRecords.find(r => r.id === editingAbsensiId)!, kegiatan: inlineForm.kegiatan.trim(), tempat: inlineForm.tempat.trim(), tanggal: inlineForm.tanggal, kehadiran };
      updated = absensiRecords.map(r => r.id === editingAbsensiId ? upsertRecord : r);
      setEditingAbsensiId(null);
    } else {
      upsertRecord = { id: `abs${Date.now()}`, kegiatan: inlineForm.kegiatan.trim(), tempat: inlineForm.tempat.trim(), tanggal: inlineForm.tanggal, kehadiran };
      updated = [...absensiRecords, upsertRecord];
    }
    setAbsensiRecords(updated);
    api.put(`/api/data/attendanceKegiatan/${upsertRecord.id}`, upsertRecord)
      .catch(err => console.error('[AttendanceStatsQR] save:', err));
    setInlineForm({ kegiatan: '', tempat: '', tanggal: '', kehadiran: '' });
  };

  const deleteAbsensi = (id: string) => {
    const updated = absensiRecords.filter(r => r.id !== id);
    setAbsensiRecords(updated);
    api.delete(`/api/data/attendanceKegiatan/${id}`)
      .catch(err => console.error('[AttendanceStatsQR] delete:', err));
    setDeleteAbsensiId(null);
  };

  // ── Grafik Tren Mingguan (8 minggu terakhir, dari absensiRecords nyata) ───────
  const weeklyData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sundayOffset = today.getDay(); // 0=Sun
    return Array.from({ length: 8 }, (_, i) => {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - sundayOffset - (7 - i) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      const sum: Record<ChartCategory, number> = { 'Minggu Pagi': 0, 'Minggu Sore': 0, 'Rabu': 0, 'Pemuda': 0 };
      absensiRecords.forEach(r => {
        if (r.kehadiran == null) return;
        const d = new Date(r.tanggal + 'T00:00:00');
        if (d >= weekStart && d < weekEnd) {
          const cat = categorizeKegiatan(r.kegiatan);
          if (cat) sum[cat] += r.kehadiran;
        }
      });
      return { name: `Mg ${i + 1}`, ...sum };
    });
  }, [absensiRecords]);

  // ── Grafik Per Sektor (total anggota nyata + proporsi kehadiran terkini) ──────
  const sectorData = useMemo(() => {
    const latestPagi = absensiRecords
      .filter(r => categorizeKegiatan(r.kegiatan) === 'Minggu Pagi' && r.kehadiran != null)
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    const latestAttendance = latestPagi[0]?.kehadiran ?? 0;
    const totalMembers = members.length || 1;
    const rate = Math.min(latestAttendance / totalMembers, 1);

    return sectors.map(sector => {
      const sectorMembers = members.filter(m => m.sectorId === sector.id);
      const total = sectorMembers.length || (sector as any).memberCount || 0;
      const hadir = Math.round(total * rate);
      return {
        sector: sector.name.replace('Sektor ', 'Sek. '),
        fullName: sector.name,
        hadir,
        total,
        persen: total > 0 ? Math.round((hadir / total) * 100) : 0,
      };
    });
  }, [absensiRecords, sectors, members]);

  const serviceTypes = ['Minggu Pagi', 'Minggu Sore', 'Rabu', 'Pemuda', 'Khusus'];

  const simulateScan = () => {
    if (!activeSession) {
      toast.error('Pilih sesi ibadah terlebih dahulu!');
      return;
    }
    const notScanned = members.filter(m => !scannedMembers.find(s => s.id === m.id));
    if (notScanned.length === 0) { toast.success('Semua jemaat sudah di-scan.'); return; }
    setIsScanning(true);
    setTimeout(() => {
      const randomMember = notScanned[Math.floor(Math.random() * notScanned.length)];
      const record = {
        ...randomMember,
        scanTime: new Date().toLocaleTimeString('id-ID'),
        session: activeSession,
      };
      setScannedMembers(prev => [record, ...prev]);
      persistCheckin(record);
      setIsScanning(false);
      toast.success(`${randomMember.fullName} berhasil di-scan.`);
    }, 600);
  };

  const manualCheckin = (member: any) => {
    if (!activeSession) { toast.error('Pilih sesi ibadah terlebih dahulu!'); return; }
    if (scannedMembers.find(s => s.id === member.id)) {
      toast.success(`${member.fullName} sudah tercatat hadir.`);
      return;
    }
    const record = {
      ...member,
      scanTime: new Date().toLocaleTimeString('id-ID'),
      session: activeSession,
      manual: true,
    };
    setScannedMembers(prev => [record, ...prev]);
    persistCheckin(record);
  };

  const filteredMembers = members.filter(m =>
    m.fullName.toLowerCase().includes(searchScan.toLowerCase())
  );

  // Overview stats (dari data absensi nyata)
  const todayTotal = scannedMembers.length;
  const avgAttendance = useMemo(() => {
    const recs = absensiRecords.filter(r => r.tanggal.startsWith(currentMonthKey) && r.kehadiran != null);
    if (recs.length === 0) return 0;
    return Math.round(recs.reduce((s, r) => s + (r.kehadiran || 0), 0) / recs.length);
  }, [absensiRecords, currentMonthKey]);

  const lastMonthRate = useMemo(() => {
    if (!members.length || !avgAttendance) return 0;
    return Math.round((avgAttendance / members.length) * 100);
  }, [avgAttendance, members.length]);

  // Monthly trend dari absensiRecords nyata (total kehadiran per bulan tahun berjalan)
  const currentYear = currentMonthKey.substring(0, 4);
  const monthlyTrend = useMemo(() => {
    const byMonth: Record<string, number> = {};
    absensiRecords.forEach(r => {
      if (r.kehadiran == null || !r.tanggal.startsWith(currentYear)) return;
      const mo = r.tanggal.substring(0, 7);
      byMonth[mo] = (byMonth[mo] || 0) + r.kehadiran;
    });
    return ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'].map((m, i) => ({
      name: m,
      kehadiran: byMonth[`${currentYear}-${String(i + 1).padStart(2, '0')}`] || 0,
    }));
  }, [absensiRecords, currentYear]);

  // Unduh Laporan Absensi Mingguan (bulan terpilih) sebagai PDF (jsPDF + autoTable,
  // berkop surat navy/gold GPIB Trinitas -- konsisten dengan ekspor menu lain).
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const NAVY: [number, number, number] = [20, 79, 107];
    const GOLD: [number, number, number] = [202, 160, 74];
    const SLATE: [number, number, number] = [51, 65, 85];

    const drawHeader = () => {
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, pageWidth, 22, 'F');
      doc.setFillColor(...GOLD);
      doc.rect(0, 22, pageWidth, 1.4, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('LAPORAN ABSENSI KEGIATAN IBADAH', pageWidth / 2, 9, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text('GPIB Trinitas', pageWidth / 2, 15, { align: 'center' });
      doc.setFontSize(7.5);
      doc.text(`Periode ${periodeBulan} · Dicetak ${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}`, pageWidth / 2, 19.5, { align: 'center' });
    };
    drawHeader();

    const rows = filteredMingguan.map((r, i) => [
      String(i + 1), r.kegiatan, r.tempat, formatTanggalDisplay(r.tanggal),
      r.kehadiran != null ? `${r.kehadiran} orang` : '-',
    ]);
    autoTable(doc, {
      startY: 28,
      head: [['No', 'Kegiatan', 'Tempat', 'Hari, Tanggal', 'Kehadiran']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: SLATE, textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 70 }, 2: { cellWidth: 60 }, 3: { cellWidth: 60 }, 4: { cellWidth: 'auto', halign: 'center' } },
      margin: { left: 12, right: 12 },
      didDrawPage: () => { if (doc.internal.getNumberOfPages() > 1) drawHeader(); },
    });

    const summaryY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(20, 79, 107);
    doc.text(`Total Kegiatan: ${totalKegiatanBulan}   ·   Total Kehadiran: ${totalKehadiranBulan}   ·   Rata-rata: ${rataRataBulan}`, 12, summaryY);

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.4);
      doc.line(12, pageHeight - 10, pageWidth - 12, pageHeight - 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text('Dokumen Internal GPIB Trinitas', 12, pageHeight - 6);
      doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - 12, pageHeight - 6, { align: 'right' });
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    doc.save(`Absensi-Ibadah-GPIB-Trinitas-${pad(now.getDate())}${pad(now.getMonth()+1)}${now.getFullYear()}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Presensi Ibadah & QR</h1>
          <p className="text-gray-500 mt-1">Catat absensi kegiatan ibadah, presensi jemaat via QR/manual, dan pantau statistik kehadiran</p>
        </div>
        <div className="flex gap-2">
          {canExport && (
            <button onClick={handleExportPDF}
              className="flex items-center gap-2 px-4 py-2 border border-[#b8d5e8] text-[#144f6b] bg-[#f0f7fb] rounded-lg hover:bg-[#e3eef6] transition-colors text-sm">
              <Download className="w-4 h-4" /> Unduh PDF
            </button>
          )}
          <Button variant="outline" className="gap-2" onClick={() => setScannedMembers([])}>
            <RefreshCw className="w-4 h-4" />
            Reset Sesi
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Hadir Sesi Ini', value: todayTotal, sub: `dari ${members.length} jemaat`, color: 'text-[#144f6b]', bg: 'bg-[#f0f7fb]' },
          { label: 'Rata-rata Bulanan', value: `${lastMonthRate}%`, sub: 'kehadiran ibadah', color: 'text-[#144f6b]', bg: 'bg-[#f0f7fb]' },
          { label: 'Total Ibadah', value: worshipSchedules.length || 24, sub: 'jadwal terdaftar', color: 'text-[#3a7fa0]', bg: 'bg-[#f0f7fb]' },
          { label: 'Scan Manual', value: scannedMembers.filter(s => s.manual).length, sub: 'check-in manual', color: 'text-[#8b6bb1]', bg: 'bg-[#f5f2fa]' },
        ].map((stat, i) => (
          <Card key={i} className={`p-4 ${stat.bg}`}>
            <p className="text-sm text-gray-600">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.sub}</p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="qr">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="qr" className="gap-1"><QrCode className="w-3.5 h-3.5" />Presensi & QR</TabsTrigger>
          <TabsTrigger value="absensi">Absensi</TabsTrigger>
          <TabsTrigger value="weekly">Tren Mingguan</TabsTrigger>
          <TabsTrigger value="sector">Per Sektor</TabsTrigger>
        </TabsList>

        {/* Tab: Presensi & QR (scan/check-in jemaat per sesi hari ini) */}
        <TabsContent value="qr" className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 mb-4">
              <div className="flex-1 w-full">
                <label className="text-sm font-semibold text-gray-700 mb-1 block">Sesi Ibadah</label>
                <Select value={activeSession} onValueChange={setActiveSession}>
                  <SelectTrigger><SelectValue placeholder="Pilih sesi ibadah hari ini" /></SelectTrigger>
                  <SelectContent>
                    {serviceTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {canCreate && (
                <Button className="gap-2 bg-[#144f6b] hover:bg-[#0f2d41]" disabled={!activeSession || isScanning} onClick={simulateScan}>
                  <QrCode className="w-4 h-4" />
                  {isScanning ? 'Memindai...' : 'Simulasikan Scan QR'}
                </Button>
              )}
            </div>

            <div className="relative mb-4">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input placeholder="Cari nama jemaat untuk check-in manual..." value={searchScan}
                onChange={e => setSearchScan(e.target.value)} className="pl-9 pr-9" />
              {searchScan && (
                <button onClick={() => setSearchScan('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {searchScan && (
              <div className="max-h-56 overflow-y-auto border rounded-lg divide-y mb-4" style={{ borderColor: '#e2e8f0' }}>
                {filteredMembers.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Tidak ada jemaat ditemukan</p>
                ) : filteredMembers.slice(0, 20).map(m => {
                  const already = scannedMembers.find(s => s.id === m.id);
                  return (
                    <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm text-gray-800">{m.fullName}</span>
                      {already ? (
                        <span className="flex items-center gap-1 text-xs text-[#2f8f5b] font-medium">
                          <CheckCircle className="w-3.5 h-3.5" /> Sudah hadir
                        </span>
                      ) : (
                        <button onClick={() => canCreate && manualCheckin(m)} disabled={!canCreate}
                          className="text-xs font-medium px-3 py-1 rounded-lg border border-[#b8d5e8] text-[#144f6b] bg-[#f0f7fb] hover:bg-[#e3eef6] disabled:opacity-40">
                          Check-in Manual
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div>
              <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-600" />
                Sudah Check-in Hari Ini ({scannedMembers.length})
              </h4>
              {scannedMembers.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6 border rounded-lg" style={{ borderColor: '#e2e8f0' }}>
                  Belum ada jemaat yang check-in hari ini
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-1.5">
                  {scannedMembers.map((s, i) => (
                    <div key={s.id + i} className="flex items-center justify-between px-4 py-2 rounded-lg bg-[#f0f9f4]">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-[#2f8f5b]" />
                        <span className="text-sm text-gray-800">{s.fullName}</span>
                        {s.manual && <Badge className="bg-[#f5f2fa] text-[#8b6bb1] text-xs">Manual</Badge>}
                      </div>
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" /> {s.scanTime} · {s.session}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Tab Absensi */}
        <TabsContent value="absensi" className="space-y-5">
          {/* Form Input Kegiatan */}
          <div className="bg-white rounded-2xl overflow-hidden border" style={{ borderColor: '#e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <div className="px-5 py-3.5 text-base font-bold" style={{ background: '#fdf6e8', color: '#144f6b' }}>
              Form Input Kegiatan
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {([
                  { label: 'Kegiatan', key: 'kegiatan', type: 'text', placeholder: 'Contoh: Ibadah Minggu' },
                  { label: 'Tempat', key: 'tempat', type: 'text', placeholder: 'Contoh: Gereja' },
                ] as { label: string; key: 'kegiatan' | 'tempat'; type: string; placeholder: string }[]).map(f => (
                  <div key={f.key} className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold" style={{ color: '#144f6b' }}>{f.label}</label>
                    <input type={f.type} value={inlineForm[f.key]} placeholder={f.placeholder}
                      onChange={e => setInlineForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                      style={{ borderColor: '#d1d5db' }} />
                  </div>
                ))}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold" style={{ color: '#144f6b' }}>Tanggal</label>
                  <input type="date" value={inlineForm.tanggal}
                    onChange={e => setInlineForm(p => ({ ...p, tanggal: e.target.value }))}
                    className="px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                    style={{ borderColor: '#d1d5db' }} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold" style={{ color: '#144f6b' }}>Jumlah Kehadiran</label>
                  <input type="number" min="0" value={inlineForm.kehadiran} placeholder="0"
                    onChange={e => setInlineForm(p => ({ ...p, kehadiran: e.target.value }))}
                    className="px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                    style={{ borderColor: '#d1d5db' }} />
                </div>
              </div>
              {inlineError && <p className="text-red-500 text-xs mb-3">{inlineError}</p>}
              <div className="flex items-center gap-2">
                {(canCreate || (editingAbsensiId && canEdit)) && (
                  <button onClick={simpanAbsensi}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors hover:opacity-90"
                    style={{ background: '#144f6b', color: '#fff' }}>
                    <Plus className="w-4 h-4" />
                    {editingAbsensiId ? 'Simpan Perubahan' : 'Tambah Data'}
                  </button>
                )}
                {editingAbsensiId && (
                  <button onClick={cancelEdit}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors hover:bg-gray-50"
                    style={{ borderColor: '#e2e8f0', color: '#64748b' }}>
                    Batal
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Laporan Mingguan */}
          <div className="bg-white rounded-2xl overflow-hidden border" style={{ borderColor: '#e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <div className="flex items-center justify-between px-5 py-3.5" style={{ background: '#fdf6e8' }}>
              <span className="text-base font-bold" style={{ color: '#144f6b' }}>Laporan Mingguan</span>
              <input
                type="month"
                value={filterBulanMingguan}
                onChange={e => setFilterBulanMingguan(e.target.value)}
                className="px-2.5 py-1 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                style={{ borderColor: '#eddca8', background: '#fdf6e8', color: '#144f6b', fontWeight: 600 }}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                <thead style={{ background: '#f6f4f0' }}>
                  <tr>
                    {[
                      { label: 'Kegiatan', col: 'kegiatan' },
                      { label: 'Tempat', col: 'tempat' },
                      { label: 'Hari, Tanggal', col: 'tanggal' },
                      { label: 'Kehadiran', col: 'kehadiran' },
                      { label: 'Aksi', col: 'aksi' },
                    ].map(h => (
                      <th key={h.col} className="px-5 py-3.5 text-left text-base font-semibold" style={{ color: '#144f6b', borderTop: '2px solid #e8e4d8', width: colW[h.col], position: 'relative' }}>
                        {h.label}
                        <ColResizeHandle onMouseDown={startResize(h.col)} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMingguan.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400 text-sm">Tidak ada catatan untuk bulan ini</td></tr>
                  ) : (() => {
                    const rowspans: Record<string, number> = {};
                    filteredMingguan.forEach(r => { rowspans[r.tanggal] = (rowspans[r.tanggal] || 0) + 1; });
                    const rendered = new Set<string>();
                    return filteredMingguan.map((r, i) => {
                      const isFirstOfDate = !rendered.has(r.tanggal);
                      if (isFirstOfDate) rendered.add(r.tanggal);
                      return (
                        <tr key={r.id} className="hover:bg-[#f9fafb] transition-colors" style={{ borderTop: '1px solid #e5e7eb' }}>
                          <td className="px-5 py-4 text-base text-gray-800">{r.kegiatan}</td>
                          <td className="px-5 py-4 text-base text-gray-600">{r.tempat}</td>
                          {isFirstOfDate && (
                            <td className="px-5 py-4 text-base font-medium text-gray-700 text-center" rowSpan={rowspans[r.tanggal]}
                              style={{ verticalAlign: 'middle', background: '#f9fafb', borderLeft: '1px solid #e5e7eb' }}>
                              {formatTanggalDisplay(r.tanggal)}
                            </td>
                          )}
                          <td className="px-5 py-4 text-center">
                            <span className="font-bold text-lg" style={{ color: '#144f6b' }}>
                              {r.kehadiran != null ? `${r.kehadiran} orang` : '—'}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1.5">
                              {canEdit && (
                                <button onClick={() => openEditAbsensi(r)} title="Edit"
                                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-blue-50"
                                  style={{ color: '#144f6b' }}>
                                  <Pencil className="w-4 h-4" />
                                </button>
                              )}
                              {canDelete && (
                                <button onClick={() => setDeleteAbsensiId(r.id)} title="Hapus"
                                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-red-50"
                                  style={{ color: '#ef4444' }}>
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Laporan Bulanan */}
          <div className="bg-white rounded-2xl overflow-hidden border" style={{ borderColor: '#e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <div className="px-5 py-3.5 text-base font-bold" style={{ background: '#fdf6e8', color: '#144f6b' }}>
              Laporan Bulanan
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5 p-5">
              {[
                { id: 'kegiatan', label: 'Total Kegiatan Bulan Ini', value: totalKegiatanBulan },
                { id: 'kehadiran', label: 'Total Kehadiran Bulanan', value: totalKehadiranBulan },
                { id: 'rata', label: 'Rata-rata Kehadiran', value: rataRataBulan },
              ].map(box => (
                <div key={box.id} className="rounded-2xl border p-6 text-center" style={{ background: '#f8fafc', borderColor: '#e5e7eb' }}>
                  <p className="text-4xl font-bold mb-2" style={{ color: '#144f6b' }}>{box.value}</p>
                  <p className="text-sm" style={{ color: '#6b7280' }}>{box.label}</p>
                </div>
              ))}
              <div className="rounded-2xl border p-6 text-center" style={{ background: '#f8fafc', borderColor: '#e5e7eb' }}>
                <p className="text-3xl font-bold mb-2">
                  <span className="inline-block px-4 py-1.5 rounded-full text-base font-bold" style={{ background: '#f0f7fb', color: '#144f6b' }}>
                    {periodeBulan}
                  </span>
                </p>
                <p className="text-sm mt-2" style={{ color: '#6b7280' }}>Periode Laporan</p>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Weekly */}
        <TabsContent value="weekly" className="space-y-4">
          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Tren Kehadiran 8 Minggu Terakhir</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weeklyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Minggu Pagi" fill="#1A77A3" radius={[3, 3, 0, 0]} animationDuration={400} animationEasing="ease-out" />
                <Bar dataKey="Minggu Sore" fill="#caa04a" radius={[3, 3, 0, 0]} animationDuration={400} animationEasing="ease-out" />
                <Bar dataKey="Rabu" fill="#2f8f5b" radius={[3, 3, 0, 0]} animationDuration={400} animationEasing="ease-out" />
                <Bar dataKey="Pemuda" fill="#8b6bb1" radius={[3, 3, 0, 0]} animationDuration={400} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Tren Kehadiran Sepanjang Tahun</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={monthlyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="kehadiran" stroke="#1A77A3" strokeWidth={2.5}
                  dot={{ fill: '#144f6b', r: 4 }} activeDot={{ r: 6 }} name="Jumlah Hadir" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </TabsContent>

        {/* Tab 3: Per Sector */}
        <TabsContent value="sector" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Kehadiran per Sektor</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={sectorData} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="sector" type="category" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="hadir" fill="#1A77A3" name="Hadir" radius={[0, 3, 3, 0]} animationDuration={400} animationEasing="ease-out" />
                  <Bar dataKey="total" fill="#caa04a" name="Total" radius={[0, 3, 3, 0]} animationDuration={400} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Persentase Kehadiran</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={sectorData} dataKey="hadir" nameKey="sector" cx="50%" cy="50%"
                    outerRadius={100} label={({ sector, persen }) => `${sector}: ${persen}%`}>
                    {sectorData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v, name) => [v, name]} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Per sector detail cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {sectorData.map((sec, i) => (
              <Card key={i} className="p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">{sec.fullName}</p>
                <div className="flex items-end justify-between mb-2">
                  <p className="text-2xl font-bold text-[#144f6b]">{sec.persen}%</p>
                  <p className="text-sm text-gray-500">{sec.hadir}/{sec.total}</p>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#144f6b] rounded-full" style={{ width: `${sec.persen}%` }} />
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Modal Konfirmasi Hapus ── */}
      {deleteAbsensiId && (() => {
        const rec = absensiRecords.find(r => r.id === deleteAbsensiId);
        return rec ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={e => e.target === e.currentTarget && setDeleteAbsensiId(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ transform: `translate(${offsetDeleteAbsensi.x}px, ${offsetDeleteAbsensi.y}px)` }}>
              <div className="flex items-center gap-3 mb-4" onMouseDown={onMouseDownDeleteAbsensi} style={{ cursor: 'move' }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.08)' }}>
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Hapus Catatan?</h3>
                  <p className="text-xs text-gray-500">{rec.kegiatan} · {formatTanggalDisplay(rec.tanggal)}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-5">Catatan absensi ini akan dihapus permanen.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteAbsensiId(null)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium border"
                  style={{ border: '1px solid #e2e8f0', color: '#64748b' }}>Batal</button>
                <button onClick={() => deleteAbsensi(deleteAbsensiId)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium"
                  style={{ background: '#ef4444', color: '#fff' }}>Ya, Hapus</button>
              </div>
            </div>
          </div>
        ) : null;
      })()}
    </div>
  );
}
