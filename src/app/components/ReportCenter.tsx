import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { liveAge } from '../../lib/age';
import { calcDep } from '../../lib/assetDepreciation';
import { ConsolidatedReportSnapshot } from '../types';
import {
  FileText, Download, Printer, CheckSquare, Square,
  Users, DollarSign, Package, Cross, Church, HeartHandshake,
  Calendar, CheckCircle2, ShieldCheck, Sparkles, Filter,
  Settings2, Eye, RefreshCw, FileCheck, Layers, Building2,
  TrendingUp, Award, Clock, ArrowRight, BookOpen, AlertCircle
} from 'lucide-react';

interface ReportModuleConfig {
  id: 'sensus' | 'keuangan' | 'inventaris' | 'sakramen' | 'peribadahan' | 'diakonia' | 'presensi';
  name: string;
  category: string;
  description: string;
  icon: React.ElementType;
  color: string;
  selected: boolean;
}

function formatRp(n: number): string {
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('id-ID');
}

type PeriodKey = 'annual' | 'semester1' | 'semester2' | 'q1' | 'q2' | 'q3' | 'q4';

function getPeriodRange(yearStr: string, period: PeriodKey): { start: Date; end: Date } {
  const y = parseInt(yearStr, 10) || new Date().getFullYear();
  const endOfDay = (mo: number, d: number) => new Date(y, mo, d, 23, 59, 59, 999);
  switch (period) {
    case 'semester1': return { start: new Date(y, 0, 1), end: endOfDay(5, 30) };
    case 'semester2': return { start: new Date(y, 6, 1), end: endOfDay(11, 31) };
    case 'q1': return { start: new Date(y, 0, 1), end: endOfDay(2, 31) };
    case 'q2': return { start: new Date(y, 3, 1), end: endOfDay(5, 30) };
    case 'q3': return { start: new Date(y, 6, 1), end: endOfDay(8, 30) };
    case 'q4': return { start: new Date(y, 9, 1), end: endOfDay(11, 31) };
    default: return { start: new Date(y, 0, 1), end: endOfDay(11, 31) };
  }
}

function inPeriod(dateStr: string | undefined | null, range: { start: Date; end: Date }): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d >= range.start && d <= range.end;
}

export function ReportCenter() {
  const {
    members,
    families,
    sectors,
    baptisms,
    sidis,
    marriages,
    attestations,
    financialRecords,
    financialSummary,
    bankAccounts,
    pettyCash,
    budgets,
    churchAssets,
    worshipSchedules,
    events,
    ministries,
    serviceRequests,
    aidDistributions,
    prayerRequests,
    rooms,
    roomBookings,
    currentUser,
    attendance,
    consolidatedReportSnapshots,
    archiveConsolidatedReportSnapshot,
  } = useApp();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));
  const [selectedPeriod, setSelectedPeriod] = useState<'annual' | 'semester1' | 'semester2' | 'q1' | 'q2' | 'q3' | 'q4'>('annual');
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [includeExecutiveSummary, setIncludeExecutiveSummary] = useState<boolean>(true);
  const [includeSignatures, setIncludeSignatures] = useState<boolean>(true);
  const [includeDetailTables, setIncludeDetailTables] = useState<boolean>(true);
  const [includeNotes, setIncludeNotes] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isArchiving, setIsArchiving] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'config' | 'preview'>('config');

  // Signatory settings
  const [signLocation, setSignLocation] = useState<string>('Jakarta');
  const [signDate, setSignDate] = useState<string>(new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }));
  const [kmjName, setKmjName] = useState<string>('Pdt. Melkisedek, M.Th.');
  const [secName, setSecName] = useState<string>('Pnt. Yohanes Pratama, S.E.');
  const [treasurerName, setTreasurerName] = useState<string>('Dkn. Maria Christina, Ak.');
  const [reportTitle, setReportTitle] = useState<string>('LAPORAN KONSOLIDASI PELAYANAN & MANAJEMEN GEREJA');
  const [reportDocNo, setReportDocNo] = useState<string>(`GPIB-TRIN/LAP-KONS/${currentYear}/001`);
  const [customNotes, setCustomNotes] = useState<string>(
    'Laporan konsolidasi ini disahkan oleh Majelis Jemaat GPIB Trinitas sebagai bahan evaluasi triwulan/tahunan serta pertanggungjawaban dalam Sidang Majelis Jemaat (SMJ).'
  );

  // Modules selection state
  const [modules, setModules] = useState<ReportModuleConfig[]>([
    {
      id: 'sensus',
      name: 'Sensus & Database Warga',
      category: 'Bidang Teologi & Organisasi',
      description: 'Demografi jemaat, rekapitulasi keluarga (KK), statistik sektor, komposisi usia Pelkat, dan status sakramen.',
      icon: Users,
      color: '#144f6b', // navy (house palette)
      selected: true,
    },
    {
      id: 'keuangan',
      name: 'Keuangan & Perbendaharaan',
      category: 'Bidang Perbendaharaan',
      description: 'Rekapitulasi kas dan bank, ringkasan penerimaan vs pengeluaran, saldo berjalan, kas kecil, dan serapan RAPB.',
      icon: DollarSign,
      color: '#2f8f5b', // hijau (house palette)
      selected: true,
    },
    {
      id: 'inventaris',
      name: 'Inventaris, Aset & Fasilitas',
      category: 'Bidang Sarana & Prasarana',
      description: 'Daftar nilai perolehan dan nilai buku aset fisik, kondisi fisik sarana prasarana, serta pemanfaatan ruangan gereja.',
      icon: Package,
      color: '#caa04a', // emas (house palette)
      selected: true,
    },
    {
      id: 'sakramen',
      name: 'Sakramen & Atestasi Gereja',
      category: 'Bidang Keesaan & Teologi',
      description: 'Pelayanan Sakramen Baptisan Anak/Dewasa, Peneguhan Sidi, Pernikahan Kudus, dan mutasi warga masuk/keluar.',
      icon: Cross,
      color: '#8b6bb1', // ungu (house palette)
      selected: false,
    },
    {
      id: 'peribadahan',
      name: 'Peribadahan & Kegiatan Jemaat',
      category: 'Bidang Pembinaan Jemaat',
      description: 'Jadwal dan frekuensi ibadah hari minggu/sektor, kalender kegiatan gerejawi, serta keaktifan komisi/pelkat.',
      icon: Church,
      color: '#1A77A3', // biru aksen (house palette)
      selected: false,
    },
    {
      id: 'diakonia',
      name: 'Pelayanan Kasih & Bantuan Sosial',
      category: 'Bidang Pelayanan Kasih (Diakonia)',
      description: 'Penyaluran bantuan sosial, santunan jemaat, permohonan layanan pastoral, dan rekap permohonan doa syafaat.',
      icon: HeartHandshake,
      color: '#d1553f', // terracotta (house palette)
      selected: false,
    },
    {
      id: 'presensi',
      name: 'Presensi & Partisipasi Ibadah',
      category: 'Bidang Pembinaan Jemaat',
      description: 'Rekapitulasi kehadiran jemaat dalam ibadah, tingkat partisipasi, dan rata-rata jemaat hadir per ibadah pada periode berjalan.',
      icon: Clock,
      color: '#9c9486', // abu netral (house palette)
      selected: false,
    },
  ]);

  const toggleModule = (id: string) => {
    setModules(prev => prev.map(m => m.id === id ? { ...m, selected: !m.selected } : m));
  };

  const selectAllModules = () => {
    setModules(prev => prev.map(m => ({ ...m, selected: true })));
  };

  const clearAllModules = () => {
    setModules(prev => prev.map(m => ({ ...m, selected: false })));
  };

  // Presets
  const applyPreset = (preset: 'executive' | 'full' | 'pastoral' | 'finance_asset') => {
    if (preset === 'full') {
      setModules(prev => prev.map(m => ({ ...m, selected: true })));
      setReportTitle('LAPORAN KONSOLIDASI TAHUNAN GEREJA (KOMPREHENSIF)');
    } else if (preset === 'executive') {
      setModules(prev => prev.map(m => ({ ...m, selected: ['sensus', 'keuangan', 'inventaris'].includes(m.id) })));
      setReportTitle('LAPORAN EKSEKUTIF MAJELIS JEMAAT (SENSUS, KEUANGAN & ASET)');
    } else if (preset === 'pastoral') {
      setModules(prev => prev.map(m => ({ ...m, selected: ['sensus', 'sakramen', 'peribadahan', 'diakonia', 'presensi'].includes(m.id) })));
      setReportTitle('LAPORAN BIDANG PELAYANAN TEOLOGI, IBADAH & DIAKONIA');
    } else if (preset === 'finance_asset') {
      setModules(prev => prev.map(m => ({ ...m, selected: ['keuangan', 'inventaris'].includes(m.id) })));
      setReportTitle('LAPORAN PERBENDAHARAAN, ANGGARAN & SARANA PRASARANA');
    }
    toast.success('Preset laporan berhasil diterapkan');
  };

  // ── FILTERED DATA CALCULATIONS ───────────────────────────────────────
  const selectedModuleCount = modules.filter(m => m.selected).length;

  const filteredMembers = useMemo(() => {
    if (selectedSector === 'all') return members;
    return members.filter(m => m.sectorId === selectedSector);
  }, [members, selectedSector]);

  const filteredFamilies = useMemo(() => {
    if (selectedSector === 'all') return families;
    return families.filter(f => f.sectorId === selectedSector);
  }, [families, selectedSector]);

  // Rentang tanggal aktual dari kombinasi Tahun + Periode yang dipilih.
  // Semua metrik "arus" (transaksi, pelayanan, permohonan) di bawah ini difilter
  // terhadap rentang ini agar laporan benar-benar mencerminkan periode yang tertera
  // di judul dokumen — bukan data sepanjang masa (all-time) seperti sebelumnya.
  const periodRange = useMemo(() => getPeriodRange(selectedYear, selectedPeriod), [selectedYear, selectedPeriod]);

  const periodFinancialRecords = useMemo(() => financialRecords.filter(t => inPeriod(t.date, periodRange)), [financialRecords, periodRange]);
  const periodBaptisms = useMemo(() => baptisms.filter(b => inPeriod(b.baptismDate, periodRange)), [baptisms, periodRange]);
  const periodSidis = useMemo(() => sidis.filter(s => inPeriod(s.sidiDate, periodRange)), [sidis, periodRange]);
  const periodMarriages = useMemo(() => marriages.filter(m => inPeriod(m.marriageDate, periodRange)), [marriages, periodRange]);
  const periodAttestations = useMemo(() => attestations.filter(a => inPeriod(a.requestDate, periodRange)), [attestations, periodRange]);
  const periodWorshipSchedules = useMemo(() => worshipSchedules.filter(w => inPeriod(w.date, periodRange)), [worshipSchedules, periodRange]);
  const periodEvents = useMemo(() => events.filter(e => inPeriod(e.date, periodRange)), [events, periodRange]);
  const periodAidDistributions = useMemo(() => aidDistributions.filter(a => inPeriod(a.distributedDate || a.requestedDate, periodRange)), [aidDistributions, periodRange]);
  const periodServiceRequests = useMemo(() => serviceRequests.filter(sr => inPeriod(sr.createdAt, periodRange)), [serviceRequests, periodRange]);
  const periodPrayerRequests = useMemo(() => prayerRequests.filter(p => inPeriod(p.createdAt, periodRange)), [prayerRequests, periodRange]);

  // Sensus metrics
  const totalMembersCount = filteredMembers.length;
  const totalFamiliesCount = filteredFamilies.length;
  const maleCount = filteredMembers.filter(m => m.gender === 'Laki-laki').length;
  const femaleCount = filteredMembers.filter(m => m.gender === 'Perempuan').length;
  const baptisCount = filteredMembers.filter(m => m.baptismStatus === 'Sudah').length;
  const sidiCount = filteredMembers.filter(m => m.sidiStatus === 'Sudah').length;
  // Pakai liveAge() (usia dihitung ulang dari birthDate), bukan field `age` yang
  // tersimpan statis sejak data terakhir diedit — supaya laporan Pelkat per usia
  // ini tidak meleset seiring waktu.
  const paCount = filteredMembers.filter(m => liveAge(m) <= 12).length;
  const ptCount = filteredMembers.filter(m => liveAge(m) >= 13 && liveAge(m) <= 16).length;
  const gpCount = filteredMembers.filter(m => liveAge(m) >= 17 && liveAge(m) <= 35).length;
  const pkbPkpCount = filteredMembers.filter(m => liveAge(m) >= 36 && liveAge(m) <= 59).length;
  const pkluCount = filteredMembers.filter(m => liveAge(m) >= 60).length;

  // Keuangan metrics
  const totalIncome = useMemo(() => {
    return periodFinancialRecords.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  }, [periodFinancialRecords]);

  const totalExpense = useMemo(() => {
    return periodFinancialRecords.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  }, [periodFinancialRecords]);

  const totalBankBalance = useMemo(() => {
    return bankAccounts.reduce((s, b) => s + (b.balance || 0), 0);
  }, [bankAccounts]);

  const totalPettyCash = useMemo(() => {
    return pettyCash.reduce((s, p) => s + (p.amount || 0), 0);
  }, [pettyCash]);

  const totalCashBalance = (financialSummary?.totalBalance || 0) || (totalIncome - totalExpense) || totalBankBalance;

  // Inventaris metrics
  const totalAssetsCount = churchAssets.length;
  const totalAssetAcquisitionValue = useMemo(() => {
    return churchAssets.reduce((s, a) => s + (a.acquisitionValue || 0), 0);
  }, [churchAssets]);
  const totalAssetBookValue = useMemo(() => {
    return churchAssets.reduce((s, a) => s + calcDep(a).bookValue, 0);
  }, [churchAssets]);
  // Nilai kondisi aset asli (lihat AssetCondition di types/index.ts): 'Baik' | 'Cukup Baik' | 'Rusak Ringan' | 'Rusak Berat' | 'Tidak Layak'
  const goodConditionAssets = churchAssets.filter(a => a.condition === 'Baik').length;
  const fairConditionAssets = churchAssets.filter(a => a.condition === 'Cukup Baik').length;
  const badConditionAssets = churchAssets.filter(a => a.condition === 'Rusak Ringan' || a.condition === 'Rusak Berat' || a.condition === 'Tidak Layak').length;

  // Sakramen metrics (difilter periode: tanggal pelaksanaan/permohonan masing-masing)
  const baptisEvents = periodBaptisms.length;
  const sidiEvents = periodSidis.length;
  const marriageEvents = periodMarriages.length;
  const attestationIn = periodAttestations.filter(a => a.type === 'Masuk').length;
  const attestationOut = periodAttestations.filter(a => a.type === 'Keluar').length;

  // Peribadahan metrics (difilter periode)
  const worshipCount = periodWorshipSchedules.length;
  const eventsCount = periodEvents.length;
  const ministriesCount = ministries.length;

  // Diakonia metrics (difilter periode)
  const aidTotalDistributed = useMemo(() => {
    return periodAidDistributions.reduce((s, a) => s + (a.amount || a.cost || 0), 0);
  }, [periodAidDistributions]);
  const aidRecipientsCount = periodAidDistributions.length;
  const serviceRequestsCount = periodServiceRequests.length;
  const prayerRequestsCount = periodPrayerRequests.length;

  // Presensi metrics (difilter periode)
  const periodAttendance = useMemo(() => attendance.filter(a => inPeriod(a.date, periodRange)), [attendance, periodRange]);
  const attendanceRecordsCount = periodAttendance.length;
  const attendancePresentCount = periodAttendance.filter(a => a.present).length;
  const attendanceRate = attendanceRecordsCount > 0 ? Math.round((attendancePresentCount / attendanceRecordsCount) * 100) : 0;
  const attendanceServiceDatesCount = useMemo(() => new Set(periodAttendance.map(a => a.date)).size, [periodAttendance]);
  const avgAttendancePerService = attendanceServiceDatesCount > 0 ? Math.round(attendancePresentCount / attendanceServiceDatesCount) : 0;

  // Arsip laporan periode yang sama tahun lalu (perbandingan apel-ke-apel: periode yg sama, tahun sebelumnya)
  const lastReportSnapshot = useMemo(() => {
    return consolidatedReportSnapshots.find(sn => sn.id === `report-center-${parseInt(selectedYear, 10) - 1}-${selectedPeriod}`);
  }, [consolidatedReportSnapshots, selectedYear, selectedPeriod]);

  // ── GENERATE CONSOLIDATED PDF ENGINE ─────────────────────────────────
  const generateConsolidatedPDF = () => {
    if (selectedModuleCount === 0) {
      toast.error('Pilih minimal satu modul untuk membuat laporan konsolidasi.');
      return;
    }

    setIsGenerating(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let y = 14;

      const primaryNavy = [13, 26, 45]; // #0d1a2d
      const goldAccent = [212, 175, 55]; // #d4af37
      const softGold = [223, 183, 116];
      const darkText = [30, 41, 59];
      const lightBg = [248, 250, 252];

      const drawHeaderKop = () => {
        // Navy Header Banner
        doc.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
        doc.rect(0, 0, pageWidth, 28, 'F');

        // Gold Stripe Line
        doc.setFillColor(goldAccent[0], goldAccent[1], goldAccent[2]);
        doc.rect(0, 28, pageWidth, 1.8, 'F');

        // Header Texts
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('GEREJA PROTESTAN DI INDONESIA BAGIAN BARAT (GPIB)', pageWidth / 2, 8.5, { align: 'center' });

        doc.setFontSize(14);
        doc.setTextColor(softGold[0], softGold[1], softGold[2]);
        doc.text('JEMAAT "TRINITAS"', pageWidth / 2, 15, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(203, 213, 225);
        doc.text('Sistem Informasi Manajemen Pelayanan Gereja Terpadu (GEMAS)', pageWidth / 2, 20.5, { align: 'center' });
        doc.text(`Alamat: Jakarta | No. Dok: ${reportDocNo} | Periode: ${selectedYear} (${selectedPeriod.toUpperCase()})`, pageWidth / 2, 25, { align: 'center' });

        y = 35;
      };

      const checkPageBreak = (neededHeight: number) => {
        if (y + neededHeight > pageHeight - 25) {
          doc.addPage();
          drawHeaderKop();
        }
      };

      const addSectionTitle = (title: string, badgeText: string) => {
        checkPageBreak(16);
        doc.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
        doc.roundedRect(14, y, pageWidth - 28, 7.5, 1.5, 1.5, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text(title.toUpperCase(), 18, y + 5);

        doc.setFontSize(7.5);
        doc.setTextColor(softGold[0], softGold[1], softGold[2]);
        doc.text(`[ ${badgeText} ]`, pageWidth - 18, y + 5, { align: 'right' });

        y += 11;
      };

      // ── START DRAWING DOCUMENT ──
      drawHeaderKop();

      // Main Report Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
      doc.text(reportTitle, pageWidth / 2, y, { align: 'center' });
      y += 5.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      const sectorLabel = selectedSector === 'all' ? 'Seluruh Sektor Pelayanan (1 s/d 7)' : `Sektor Pelayanan ${selectedSector}`;
      doc.text(`Cakupan Data: ${sectorLabel}  |  Tanggal Terbit: ${signDate}`, pageWidth / 2, y, { align: 'center' });
      y += 8;

      // ── EXECUTIVE SUMMARY KPI ──
      if (includeExecutiveSummary) {
        addSectionTitle('I. RINGKASAN EKSEKUTIF KONSOLIDASI (KEY METRICS)', 'EXECUTIVE SUMMARY');

        const kpiRows = [
          [
            'Total Warga Jemaat Terdata', `${formatNumber(totalMembersCount)} Jiwa`,
            'Total Posisi Kas & Bank', formatRp(totalCashBalance)
          ],
          [
            'Total Kepala Keluarga (KK)', `${formatNumber(totalFamiliesCount)} KK`,
            'Realisasi Penerimaan Kas', formatRp(totalIncome)
          ],
          [
            'Status Anggota Sudah Sidi', `${formatNumber(sidiCount)} (${totalMembersCount > 0 ? Math.round((sidiCount / totalMembersCount) * 100) : 0}%)`,
            'Realisasi Pengeluaran Kas', formatRp(totalExpense)
          ],
          [
            'Total Aset & Inventaris', `${formatNumber(totalAssetsCount)} Unit (${formatRp(totalAssetBookValue)})`,
            'Penyaluran Diakonia/Bantuan', `${formatNumber(aidRecipientsCount)} Bantuan (${formatRp(aidTotalDistributed)})`
          ]
        ];

        autoTable(doc, {
          startY: y,
          head: [['Indikator Kunci', 'Nilai / Status', 'Indikator Finansial & Sosial', 'Nilai / Status']],
          body: kpiRows,
          theme: 'grid',
          headStyles: {
            fillColor: [30, 58, 138],
            textColor: [255, 255, 255],
            fontSize: 7.5,
            fontStyle: 'bold',
            halign: 'center',
          },
          bodyStyles: {
            fontSize: 7.5,
            textColor: [30, 41, 59],
            cellPadding: 2,
          },
          columnStyles: {
            0: { cellWidth: 50, fontStyle: 'bold' },
            1: { cellWidth: 40, halign: 'right' },
            2: { cellWidth: 55, fontStyle: 'bold' },
            3: { cellWidth: 37, halign: 'right' },
          },
          margin: { left: 14, right: 14 },
        });

        // @ts-ignore
        y = doc.lastAutoTable.finalY + 8;
      }

      // ── MODULE 1: SENSUS & DATABASE JEMAAT ──
      const sensusModule = modules.find(m => m.id === 'sensus');
      if (sensusModule?.selected) {
        addSectionTitle('II. SENSUS & DEMOGRAFI WARGA JEMAAT', 'DATABASE JEMAAT');

        // Demographic breakdown table
        const demoData = [
          ['Total Warga Jemaat', `${formatNumber(totalMembersCount)} Jiwa`, '100%'],
          ['Laki-laki', `${formatNumber(maleCount)} Jiwa`, `${totalMembersCount > 0 ? ((maleCount / totalMembersCount) * 100).toFixed(1) : 0}%`],
          ['Perempuan', `${formatNumber(femaleCount)} Jiwa`, `${totalMembersCount > 0 ? ((femaleCount / totalMembersCount) * 100).toFixed(1) : 0}%`],
          ['Kepala Keluarga (KK)', `${formatNumber(totalFamiliesCount)} KK`, '-'],
          ['Status Sakramen Baptis (Sudah)', `${formatNumber(baptisCount)} Jiwa`, `${totalMembersCount > 0 ? ((baptisCount / totalMembersCount) * 100).toFixed(1) : 0}%`],
          ['Status Sakramen Sidi (Sudah)', `${formatNumber(sidiCount)} Jiwa`, `${totalMembersCount > 0 ? ((sidiCount / totalMembersCount) * 100).toFixed(1) : 0}%`],
          ['Pelkat PA (0–12 Tahun)', `${formatNumber(paCount)} Jiwa`, `${totalMembersCount > 0 ? ((paCount / totalMembersCount) * 100).toFixed(1) : 0}%`],
          ['Pelkat PT (13–16 Tahun)', `${formatNumber(ptCount)} Jiwa`, `${totalMembersCount > 0 ? ((ptCount / totalMembersCount) * 100).toFixed(1) : 0}%`],
          ['Pelkat GP (17–35 Tahun)', `${formatNumber(gpCount)} Jiwa`, `${totalMembersCount > 0 ? ((gpCount / totalMembersCount) * 100).toFixed(1) : 0}%`],
          ['Pelkat PKP & PKB (36–59 Tahun)', `${formatNumber(pkbPkpCount)} Jiwa`, `${totalMembersCount > 0 ? ((pkbPkpCount / totalMembersCount) * 100).toFixed(1) : 0}%`],
          ['Pelkat PKLU (60+ Tahun)', `${formatNumber(pkluCount)} Jiwa`, `${totalMembersCount > 0 ? ((pkluCount / totalMembersCount) * 100).toFixed(1) : 0}%`],
        ];

        // Sector summary
        const sectorRows = sectors.map(sec => {
          const secMembers = members.filter(m => m.sectorId === sec.id);
          const secFam = families.filter(f => f.sectorId === sec.id);
          return [
            sec.name,
            `${secMembers.length || sec.memberCount || 0} Jiwa`,
            `${secFam.length || 0} KK`,
            `${secMembers.filter(m => m.gender === 'Laki-laki').length} L / ${secMembers.filter(m => m.gender === 'Perempuan').length} P`,
            `${secMembers.filter(m => m.sidiStatus === 'Sudah').length} Jiwa`,
          ];
        });

        autoTable(doc, {
          startY: y,
          head: [['Kategori Demografi', 'Jumlah (Jiwa/KK)', 'Persentase / Rasio']],
          body: demoData,
          theme: 'striped',
          headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7, cellPadding: 1.8 },
          columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 50, halign: 'right' }, 2: { cellWidth: 42, halign: 'right' } },
          margin: { left: 14, right: 14 },
        });

        // @ts-ignore
        y = doc.lastAutoTable.finalY + 6;

        if (includeDetailTables && sectorRows.length > 0) {
          checkPageBreak(30);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(30, 41, 59);
          doc.text('Tabel Distribusi Warga per Sektor Pelayanan:', 14, y);
          y += 4;

          autoTable(doc, {
            startY: y,
            head: [['Nama Sektor', 'Jumlah Jiwa', 'Jumlah KK', 'Gender (L / P)', 'Sudah Sidi']],
            body: sectorRows,
            theme: 'grid',
            headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
            bodyStyles: { fontSize: 6.8, cellPadding: 1.5 },
            columnStyles: { 0: { cellWidth: 55 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'center' }, 4: { halign: 'right' } },
            margin: { left: 14, right: 14 },
          });

          // @ts-ignore
          y = doc.lastAutoTable.finalY + 8;
        }
      }

      // ── MODULE 2: KEUANGAN & PERBENDAHARAAN ──
      const keuanganModule = modules.find(m => m.id === 'keuangan');
      if (keuanganModule?.selected) {
        addSectionTitle('III. KEUANGAN, KAS & REKENING GEREJA', 'PERBENDAHARAAN');

        const finRows = [
          ['Total Saldo Kas & Bank Berjalan', formatRp(totalCashBalance), 'Posisi Likuiditas Gereja'],
          ['Total Pemasukan / Penerimaan Transaksi', formatRp(totalIncome), 'Penerimaan Kas Berjalan'],
          ['Total Pengeluaran / Beban Operasional', formatRp(totalExpense), 'Beban Kas Operasional'],
          ['Surplus / (Defisit) Bersih Berjalan', formatRp(totalIncome - totalExpense), totalIncome >= totalExpense ? 'Surplus Kas' : 'Defisit Kas'],
          ['Total Saldo pada Rekening Bank', formatRp(totalBankBalance), `${bankAccounts.length} Rekening Aktif`],
          ['Total Saldo Kas Kecil (Petty Cash)', formatRp(totalPettyCash), 'Dana Operasional Mendesak'],
        ];

        autoTable(doc, {
          startY: y,
          head: [['Komponen Keuangan', 'Nominal (Rupiah)', 'Keterangan Finansial']],
          body: finRows,
          theme: 'striped',
          headStyles: { fillColor: [4, 120, 87], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7, cellPadding: 1.8 },
          columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 50, halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 42 } },
          margin: { left: 14, right: 14 },
        });

        // @ts-ignore
        y = doc.lastAutoTable.finalY + 6;

        // Bank Accounts detail
        if (includeDetailTables && bankAccounts.length > 0) {
          checkPageBreak(25);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(30, 41, 59);
          doc.text('Rincian Saldo Rekening Bank & Kas Resmi:', 14, y);
          y += 4;

          const bankRows = bankAccounts.map(b => [
            b.bankName,
            b.accountNumber || '-',
            b.accountHolder || 'GPIB Jemaat Trinitas',
            formatRp(b.balance || 0),
          ]);

          autoTable(doc, {
            startY: y,
            head: [['Nama Bank', 'Nomor Rekening', 'Atas Nama', 'Saldo Terkini']],
            body: bankRows,
            theme: 'grid',
            headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' },
            bodyStyles: { fontSize: 6.8, cellPadding: 1.5 },
            columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 45 }, 2: { cellWidth: 45 }, 3: { cellWidth: 42, halign: 'right' } },
            margin: { left: 14, right: 14 },
          });

          // @ts-ignore
          y = doc.lastAutoTable.finalY + 8;
        }
      }

      // ── MODULE 3: INVENTARIS & ASET FASILITAS ──
      const inventarisModule = modules.find(m => m.id === 'inventaris');
      if (inventarisModule?.selected) {
        addSectionTitle('IV. INVENTARIS, ASET & FASILITAS GEREJA', 'SARANA & PRASARANA');

        const assetRows = [
          ['Total Jumlah Aset Terdata', `${formatNumber(totalAssetsCount)} Unit Aset`, 'Seluruh Inventaris'],
          ['Total Nilai Perolehan Aset', formatRp(totalAssetAcquisitionValue), 'Harga Beli/Perolehan Awal'],
          ['Total Nilai Buku Terkini', formatRp(totalAssetBookValue), 'Estimasi Nilai Buku Berjalan'],
          ['Kondisi Aset: Baik / Sangat Baik', `${formatNumber(goodConditionAssets)} Unit (${totalAssetsCount > 0 ? Math.round((goodConditionAssets / totalAssetsCount) * 100) : 0}%)`, 'Siap Digunakan'],
          ['Kondisi Aset: Cukup / Perlu Perbaikan', `${formatNumber(fairConditionAssets)} Unit (${totalAssetsCount > 0 ? Math.round((fairConditionAssets / totalAssetsCount) * 100) : 0}%)`, 'Dalam Pemeliharaan'],
          ['Kondisi Aset: Rusak / Afkir', `${formatNumber(badConditionAssets)} Unit (${totalAssetsCount > 0 ? Math.round((badConditionAssets / totalAssetsCount) * 100) : 0}%)`, 'Perlu Penghapusan/Ganti'],
          ['Total Ruangan Gereja Terdaftar', `${formatNumber(rooms.length)} Ruangan`, 'Gedung Gereja & Konsistori'],
          ['Riwayat Peminjaman Ruangan', `${formatNumber(roomBookings.length)} Kali Peminjaman`, 'Kegiatan Kategorial & Umum'],
        ];

        autoTable(doc, {
          startY: y,
          head: [['Parameter Aset & Fasilitas', 'Statistik / Nilai', 'Status Kondisi']],
          body: assetRows,
          theme: 'striped',
          headStyles: { fillColor: [180, 83, 9], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7, cellPadding: 1.8 },
          columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 50, halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 42 } },
          margin: { left: 14, right: 14 },
        });

        // @ts-ignore
        y = doc.lastAutoTable.finalY + 8;
      }

      // ── MODULE 4: SAKRAMEN & ATESTASI ──
      const sakramenModule = modules.find(m => m.id === 'sakramen');
      if (sakramenModule?.selected) {
        addSectionTitle('V. SAKRAMEN, PERNIKAHAN & ATESTASI WARGA', 'PELAYANAN KEESAAN');

        const sakramenRows = [
          ['Pelayanan Sakramen Baptis (Anak/Dewasa)', `${formatNumber(baptisEvents)} Orang Terlayani`],
          ['Pelayanan Peneguhan Sidi', `${formatNumber(sidiEvents)} Orang Diteguhkan`],
          ['Pemberkatan Pernikahan Kudus', `${formatNumber(marriageEvents)} Pasangan Diberkati`],
          ['Atestasi Pindah Masuk (Warga Baru)', `${formatNumber(attestationIn)} Jiwa / Keluarga Masuk`],
          ['Atestasi Pindah Keluar', `${formatNumber(attestationOut)} Jiwa / Keluarga Keluar`],
        ];

        autoTable(doc, {
          startY: y,
          head: [['Bentuk Pelayanan Sakramen & Mutasi', 'Total Pelayanan']],
          body: sakramenRows,
          theme: 'striped',
          headStyles: { fillColor: [124, 58, 237], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7, cellPadding: 1.8 },
          columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 62, halign: 'right', fontStyle: 'bold' } },
          margin: { left: 14, right: 14 },
        });

        // @ts-ignore
        y = doc.lastAutoTable.finalY + 8;
      }

      // ── MODULE 5: PERIBADAHAN & KEGIATAN ──
      const peribadahanModule = modules.find(m => m.id === 'peribadahan');
      if (peribadahanModule?.selected) {
        addSectionTitle('VI. PERIBADAHAN & KEGIATAN GEREJAWI', 'PEMBINAAN JEMAAT');

        const ibadahRows = [
          ['Jadwal Ibadah Hari Minggu Terjadwal', `${formatNumber(worshipCount)} Ibadah`],
          ['Kalender Agenda & Kegiatan Terlaksana', `${formatNumber(eventsCount)} Kegiatan`],
          ['Pelkat & Komisi Aktif', `${formatNumber(ministriesCount)} Kategorial/Komisi`],
        ];

        autoTable(doc, {
          startY: y,
          head: [['Aktivitas Peribadahan & Pembinaan', 'Jumlah / Status']],
          body: ibadahRows,
          theme: 'striped',
          headStyles: { fillColor: [2, 132, 199], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7, cellPadding: 1.8 },
          columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 62, halign: 'right', fontStyle: 'bold' } },
          margin: { left: 14, right: 14 },
        });

        // @ts-ignore
        y = doc.lastAutoTable.finalY + 8;
      }

      // ── MODULE 6: DIAKONIA & PELAYANAN KASIH ──
      const diakoniaModule = modules.find(m => m.id === 'diakonia');
      if (diakoniaModule?.selected) {
        addSectionTitle('VII. PELAYANAN KASIH (DIAKONIA) & POKOK DOA', 'PELAYANAN SOSIAL');

        const diakoniaRows = [
          ['Total Dana Distribusi Bantuan Kasih', formatRp(aidTotalDistributed)],
          ['Jumlah Penerima Bantuan / Santunan', `${formatNumber(aidRecipientsCount)} Penerima Bantuan`],
          ['Permohonan Pelayanan Diakonia & Pastoral', `${formatNumber(serviceRequestsCount)} Permohonan`],
          ['Pokok Pergumulan Doa Syafaat Terdata', `${formatNumber(prayerRequestsCount)} Pokok Doa`],
        ];

        autoTable(doc, {
          startY: y,
          head: [['Layanan Kasih & Pastoral', 'Realisasi / Jumlah']],
          body: diakoniaRows,
          theme: 'striped',
          headStyles: { fillColor: [225, 29, 72], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7, cellPadding: 1.8 },
          columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 62, halign: 'right', fontStyle: 'bold' } },
          margin: { left: 14, right: 14 },
        });

        // @ts-ignore
        y = doc.lastAutoTable.finalY + 8;
      }

      // ── MODULE 7: PRESENSI & PARTISIPASI IBADAH ──
      const presensiModule = modules.find(m => m.id === 'presensi');
      if (presensiModule?.selected) {
        addSectionTitle('VIII. PRESENSI & PARTISIPASI IBADAH', 'PEMBINAAN JEMAAT');

        const presensiRows = [
          ['Total Data Presensi Tercatat', `${formatNumber(attendanceRecordsCount)} Entri Kehadiran`],
          ['Jumlah Kehadiran (Hadir)', `${formatNumber(attendancePresentCount)} Kehadiran`],
          ['Tingkat Partisipasi Ibadah', `${attendanceRate}%`],
          ['Jumlah Ibadah Tercatat Presensinya', `${formatNumber(attendanceServiceDatesCount)} Ibadah`],
          ['Rata-rata Jemaat Hadir per Ibadah', `${formatNumber(avgAttendancePerService)} Orang`],
        ];

        autoTable(doc, {
          startY: y,
          head: [['Indikator Presensi & Partisipasi', 'Nilai / Jumlah']],
          body: presensiRows,
          theme: 'striped',
          headStyles: { fillColor: [156, 148, 134], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7, cellPadding: 1.8 },
          columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 62, halign: 'right', fontStyle: 'bold' } },
          margin: { left: 14, right: 14 },
        });

        // @ts-ignore
        y = doc.lastAutoTable.finalY + 8;
      }

      // ── PERBANDINGAN DENGAN PERIODE YANG SAMA TAHUN LALU (ARSIP) ──
      if (lastReportSnapshot) {
        addSectionTitle(`IX. PERBANDINGAN DENGAN PERIODE ${selectedPeriod.toUpperCase()} TAHUN ${lastReportSnapshot.year}`, 'ARSIP TAHUN KE TAHUN');

        const compareRows = [
          ['Total Warga Jemaat', formatNumber(lastReportSnapshot.totalMembers), formatNumber(totalMembersCount), formatNumber(totalMembersCount - lastReportSnapshot.totalMembers)],
          ['Total Kepala Keluarga', formatNumber(lastReportSnapshot.totalFamilies), formatNumber(totalFamiliesCount), formatNumber(totalFamiliesCount - lastReportSnapshot.totalFamilies)],
          ['Realisasi Penerimaan Kas', formatRp(lastReportSnapshot.totalIncome), formatRp(totalIncome), formatRp(totalIncome - lastReportSnapshot.totalIncome)],
          ['Realisasi Pengeluaran Kas', formatRp(lastReportSnapshot.totalExpense), formatRp(totalExpense), formatRp(totalExpense - lastReportSnapshot.totalExpense)],
          ['Nilai Buku Aset', formatRp(lastReportSnapshot.totalAssetBookValue), formatRp(totalAssetBookValue), formatRp(totalAssetBookValue - lastReportSnapshot.totalAssetBookValue)],
          ['Pelayanan Sakramen (Baptis+Sidi+Nikah)', formatNumber(lastReportSnapshot.baptisEvents + lastReportSnapshot.sidiEvents + lastReportSnapshot.marriageEvents), formatNumber(baptisEvents + sidiEvents + marriageEvents), formatNumber((baptisEvents + sidiEvents + marriageEvents) - (lastReportSnapshot.baptisEvents + lastReportSnapshot.sidiEvents + lastReportSnapshot.marriageEvents))],
          ['Penyaluran Diakonia/Bantuan', formatRp(lastReportSnapshot.aidTotalDistributed), formatRp(aidTotalDistributed), formatRp(aidTotalDistributed - lastReportSnapshot.aidTotalDistributed)],
        ];

        autoTable(doc, {
          startY: y,
          head: [['Indikator', `${selectedPeriod.toUpperCase()} ${lastReportSnapshot.year}`, `${selectedPeriod.toUpperCase()} ${selectedYear}`, 'Selisih']],
          body: compareRows,
          theme: 'grid',
          headStyles: { fillColor: [13, 26, 45], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold', halign: 'center' },
          bodyStyles: { fontSize: 6.8, cellPadding: 1.8 },
          columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 38, halign: 'right' }, 2: { cellWidth: 38, halign: 'right' }, 3: { cellWidth: 36, halign: 'right', fontStyle: 'bold' } },
          margin: { left: 14, right: 14 },
        });

        // @ts-ignore
        y = doc.lastAutoTable.finalY + 8;
      }

      // ── CATATAN EVALUASI & KESIMPULAN MAJELIS ──
      if (includeNotes && customNotes) {
        checkPageBreak(25);
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(14, y, pageWidth - 28, 18, 2, 2, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(14, y, pageWidth - 28, 18, 2, 2, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(30, 41, 59);
        doc.text('Catatan Evaluasi Majelis Jemaat:', 18, y + 5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        const splitNotes = doc.splitTextToSize(customNotes, pageWidth - 36);
        doc.text(splitNotes, 18, y + 10);

        y += 24;
      }

      // ── LEMBAR PENGESAHAN / TANDA TANGAN (SIGNATURES) ──
      if (includeSignatures) {
        checkPageBreak(38);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(30, 41, 59);
        doc.text(`${signLocation}, ${signDate}`, pageWidth - 14, y, { align: 'right' });
        y += 4;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('PELAKSANA HARIAN MAJELIS JEMAAT (PHMJ) GPIB "TRINITAS"', pageWidth / 2, y, { align: 'center' });
        y += 6;

        const colWidth = (pageWidth - 28) / 3;

        // Ketua
        const col1X = 14 + colWidth / 2;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text('Ketua Majelis Jemaat,', col1X, y, { align: 'center' });
        doc.text('(KMJ)', col1X, y + 3.5, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text(kmjName, col1X, y + 22, { align: 'center' });
        doc.setLineWidth(0.3);
        doc.line(col1X - 25, y + 23, col1X + 25, y + 23);

        // Sekretaris
        const col2X = 14 + colWidth + colWidth / 2;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text('Sekretaris PHMJ,', col2X, y, { align: 'center' });
        doc.text('(Sekretaris 1)', col2X, y + 3.5, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text(secName, col2X, y + 22, { align: 'center' });
        doc.line(col2X - 25, y + 23, col2X + 25, y + 23);

        // Bendahara
        const col3X = 14 + colWidth * 2 + colWidth / 2;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text('Bendahara PHMJ,', col3X, y, { align: 'center' });
        doc.text('(Bendahara 1)', col3X, y + 3.5, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text(treasurerName, col3X, y + 22, { align: 'center' });
        doc.line(col3X - 25, y + 23, col3X + 25, y + 23);

        y += 28;
      }

      // ── FOOTER & PAGE NUMBERING ON ALL PAGES ──
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`Dokumen Resmi Internal GPIB Jemaat Trinitas | Dicetak oleh: ${currentUser?.fullName || 'Administrator'} pada ${new Date().toLocaleString('id-ID')}`, 14, pageHeight - 7.5);
        doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - 14, pageHeight - 7.5, { align: 'right' });
      }

      const fileName = `Laporan_Konsolidasi_GPIB_Trinitas_${selectedYear}_${selectedPeriod.toUpperCase()}.pdf`;
      doc.save(fileName);
      toast.success(`Laporan konsolidasi berhasil dibuat (${fileName})`);
    } catch (err: any) {
      console.error('Failed to generate consolidated PDF:', err);
      toast.error(`Gagal membuat PDF: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── ARSIPKAN LAPORAN (SNAPSHOT PERIODE INI, UNTUK PERBANDINGAN TAHUN DEPAN) ──
  const handleArchiveSnapshot = async () => {
    setIsArchiving(true);
    try {
      const snapshot: ConsolidatedReportSnapshot = {
        id: `report-center-${selectedYear}-${selectedPeriod}`,
        year: parseInt(selectedYear, 10),
        period: selectedPeriod,
        archivedAt: new Date().toISOString(),
        archivedBy: currentUser?.fullName || currentUser?.name,
        selectedSector,
        moduleIds: modules.filter(m => m.selected).map(m => m.id),
        totalMembers: totalMembersCount,
        totalFamilies: totalFamiliesCount,
        totalIncome,
        totalExpense,
        totalCashBalance,
        totalAssetBookValue,
        baptisEvents,
        sidiEvents,
        marriageEvents,
        worshipCount,
        eventsCount,
        aidTotalDistributed,
        aidRecipientsCount,
      };
      await archiveConsolidatedReportSnapshot(snapshot);
      toast.success(`Laporan periode ${selectedPeriod.toUpperCase()} ${selectedYear} berhasil diarsipkan untuk perbandingan tahun depan.`);
    } catch (err: any) {
      console.error('Failed to archive report snapshot:', err);
      toast.error(`Gagal mengarsipkan laporan: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setIsArchiving(false);
    }
  };

  // ── EKSPOR EXCEL (MULTI-SHEET, MENGIKUTI MODUL YANG DIPILIH) ──
  const handleExportExcel = () => {
    if (selectedModuleCount === 0) {
      toast.error('Pilih minimal satu modul untuk membuat laporan konsolidasi.');
      return;
    }
    try {
      const wb = XLSX.utils.book_new();
      const sectorLabel = selectedSector === 'all' ? 'Seluruh Sektor Pelayanan' : `Sektor Pelayanan ${selectedSector}`;

      const ringkasan: any[][] = [
        [reportTitle],
        [`GPIB Jemaat "Trinitas" | Periode: ${selectedYear} (${selectedPeriod.toUpperCase()}) | Cakupan: ${sectorLabel}`],
        [`No. Dokumen: ${reportDocNo} | Dicetak: ${signDate}`],
        [],
        ['Indikator Kunci', 'Nilai / Status'],
        ['Total Warga Jemaat Terdata', totalMembersCount],
        ['Total Kepala Keluarga (KK)', totalFamiliesCount],
        ['Total Posisi Kas & Bank', totalCashBalance],
        ['Realisasi Penerimaan Kas', totalIncome],
        ['Realisasi Pengeluaran Kas', totalExpense],
        ['Total Aset & Inventaris (Nilai Buku)', totalAssetBookValue],
        ['Penyaluran Diakonia/Bantuan', aidTotalDistributed],
      ];
      const wsRingkasan = XLSX.utils.aoa_to_sheet(ringkasan);
      wsRingkasan['!cols'] = [{ wch: 38 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsRingkasan, 'Ringkasan');

      if (modules.find(m => m.id === 'sensus')?.selected) {
        const sensusRows: any[][] = [
          ['Kategori Demografi', 'Jumlah', 'Persentase'],
          ['Total Warga Jemaat', totalMembersCount, '100%'],
          ['Laki-laki', maleCount, totalMembersCount > 0 ? `${((maleCount / totalMembersCount) * 100).toFixed(1)}%` : '0%'],
          ['Perempuan', femaleCount, totalMembersCount > 0 ? `${((femaleCount / totalMembersCount) * 100).toFixed(1)}%` : '0%'],
          ['Kepala Keluarga (KK)', totalFamiliesCount, '-'],
          ['Sudah Baptis', baptisCount, totalMembersCount > 0 ? `${((baptisCount / totalMembersCount) * 100).toFixed(1)}%` : '0%'],
          ['Sudah Sidi', sidiCount, totalMembersCount > 0 ? `${((sidiCount / totalMembersCount) * 100).toFixed(1)}%` : '0%'],
          ['Pelkat PA (0-12 Tahun)', paCount, '-'],
          ['Pelkat PT (13-16 Tahun)', ptCount, '-'],
          ['Pelkat GP (17-35 Tahun)', gpCount, '-'],
          ['Pelkat PKP & PKB (36-59 Tahun)', pkbPkpCount, '-'],
          ['Pelkat PKLU (60+ Tahun)', pkluCount, '-'],
        ];
        const wsSensus = XLSX.utils.aoa_to_sheet(sensusRows);
        wsSensus['!cols'] = [{ wch: 32 }, { wch: 12 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, wsSensus, 'Sensus');
      }

      if (modules.find(m => m.id === 'keuangan')?.selected) {
        const keuanganRows: any[][] = [
          ['Komponen Keuangan', 'Nominal (Rupiah)'],
          ['Total Saldo Kas & Bank Berjalan', totalCashBalance],
          ['Total Pemasukan/Penerimaan (Periode)', totalIncome],
          ['Total Pengeluaran/Beban (Periode)', totalExpense],
          ['Surplus / (Defisit) Bersih', totalIncome - totalExpense],
          ['Total Saldo Rekening Bank', totalBankBalance],
          ['Total Saldo Kas Kecil', totalPettyCash],
        ];
        const wsKeuangan = XLSX.utils.aoa_to_sheet(keuanganRows);
        wsKeuangan['!cols'] = [{ wch: 36 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, wsKeuangan, 'Keuangan');
      }

      if (modules.find(m => m.id === 'inventaris')?.selected) {
        const inventarisRows: any[][] = [
          ['Parameter Aset & Fasilitas', 'Nilai'],
          ['Total Jumlah Aset Terdata', totalAssetsCount],
          ['Total Nilai Perolehan Aset', totalAssetAcquisitionValue],
          ['Total Nilai Buku Terkini', totalAssetBookValue],
          ['Kondisi: Baik', goodConditionAssets],
          ['Kondisi: Cukup Baik', fairConditionAssets],
          ['Kondisi: Rusak/Afkir', badConditionAssets],
          ['Total Ruangan Gereja', rooms.length],
          ['Riwayat Peminjaman Ruangan', roomBookings.length],
        ];
        const wsInventaris = XLSX.utils.aoa_to_sheet(inventarisRows);
        wsInventaris['!cols'] = [{ wch: 34 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, wsInventaris, 'Inventaris');
      }

      if (modules.find(m => m.id === 'sakramen')?.selected) {
        const sakramenRows: any[][] = [
          ['Bentuk Pelayanan Sakramen & Mutasi (Periode)', 'Total'],
          ['Pelayanan Sakramen Baptis', baptisEvents],
          ['Pelayanan Peneguhan Sidi', sidiEvents],
          ['Pemberkatan Pernikahan Kudus', marriageEvents],
          ['Atestasi Pindah Masuk', attestationIn],
          ['Atestasi Pindah Keluar', attestationOut],
        ];
        const wsSakramen = XLSX.utils.aoa_to_sheet(sakramenRows);
        wsSakramen['!cols'] = [{ wch: 40 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, wsSakramen, 'Sakramen');
      }

      if (modules.find(m => m.id === 'peribadahan')?.selected) {
        const peribadahanRows: any[][] = [
          ['Aktivitas Peribadahan & Pembinaan (Periode)', 'Jumlah'],
          ['Jadwal Ibadah Terjadwal', worshipCount],
          ['Kalender Agenda & Kegiatan', eventsCount],
          ['Pelkat & Komisi Aktif', ministriesCount],
        ];
        const wsPeribadahan = XLSX.utils.aoa_to_sheet(peribadahanRows);
        wsPeribadahan['!cols'] = [{ wch: 40 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, wsPeribadahan, 'Peribadahan');
      }

      if (modules.find(m => m.id === 'diakonia')?.selected) {
        const diakoniaRows2: any[][] = [
          ['Layanan Kasih & Pastoral (Periode)', 'Realisasi / Jumlah'],
          ['Total Dana Distribusi Bantuan Kasih', aidTotalDistributed],
          ['Jumlah Penerima Bantuan/Santunan', aidRecipientsCount],
          ['Permohonan Pelayanan Diakonia & Pastoral', serviceRequestsCount],
          ['Pokok Pergumulan Doa Syafaat', prayerRequestsCount],
        ];
        const wsDiakonia = XLSX.utils.aoa_to_sheet(diakoniaRows2);
        wsDiakonia['!cols'] = [{ wch: 40 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, wsDiakonia, 'Diakonia');
      }

      if (modules.find(m => m.id === 'presensi')?.selected) {
        const presensiRows2: any[][] = [
          ['Indikator Presensi & Partisipasi (Periode)', 'Nilai'],
          ['Total Data Presensi Tercatat', attendanceRecordsCount],
          ['Jumlah Kehadiran (Hadir)', attendancePresentCount],
          ['Tingkat Partisipasi Ibadah (%)', attendanceRate],
          ['Jumlah Ibadah Tercatat Presensinya', attendanceServiceDatesCount],
          ['Rata-rata Jemaat Hadir per Ibadah', avgAttendancePerService],
        ];
        const wsPresensi = XLSX.utils.aoa_to_sheet(presensiRows2);
        wsPresensi['!cols'] = [{ wch: 42 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, wsPresensi, 'Presensi');
      }

      if (lastReportSnapshot) {
        const bandingRows: any[][] = [
          ['Indikator', `${selectedPeriod.toUpperCase()} ${lastReportSnapshot.year}`, `${selectedPeriod.toUpperCase()} ${selectedYear}`, 'Selisih'],
          ['Total Warga Jemaat', lastReportSnapshot.totalMembers, totalMembersCount, totalMembersCount - lastReportSnapshot.totalMembers],
          ['Total Kepala Keluarga', lastReportSnapshot.totalFamilies, totalFamiliesCount, totalFamiliesCount - lastReportSnapshot.totalFamilies],
          ['Realisasi Penerimaan Kas', lastReportSnapshot.totalIncome, totalIncome, totalIncome - lastReportSnapshot.totalIncome],
          ['Realisasi Pengeluaran Kas', lastReportSnapshot.totalExpense, totalExpense, totalExpense - lastReportSnapshot.totalExpense],
          ['Nilai Buku Aset', lastReportSnapshot.totalAssetBookValue, totalAssetBookValue, totalAssetBookValue - lastReportSnapshot.totalAssetBookValue],
          ['Penyaluran Diakonia/Bantuan', lastReportSnapshot.aidTotalDistributed, aidTotalDistributed, aidTotalDistributed - lastReportSnapshot.aidTotalDistributed],
        ];
        const wsBanding = XLSX.utils.aoa_to_sheet(bandingRows);
        wsBanding['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, wsBanding, 'Perbandingan Tahunan');
      }

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const filename = `Laporan_Konsolidasi_GPIB_Trinitas_${selectedYear}_${selectedPeriod.toUpperCase()}_${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast.success(`Laporan konsolidasi berhasil diekspor ke Excel (${filename})`);
    } catch (err: any) {
      console.error('Failed to export consolidated Excel:', err);
      toast.error(`Gagal mengekspor Excel: ${err.message || 'Terjadi kesalahan'}`);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* ── Top Header Banner ── */}
      <div className="rounded-2xl p-6 relative overflow-hidden shadow-xl border border-white/10"
        style={{ background: 'linear-gradient(135deg, #0d1a2d 0%, #172a45 50%, #1e3a5f 100%)' }}
      >
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-400/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-300 text-xs font-semibold tracking-wider uppercase">
              <Layers className="w-3.5 h-3.5" />
              Pusat Laporan Konsolidasi Terpadu (Report Center)
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight font-serif-church">
              Laporan Konsolidasi Lintas Modul
            </h1>
            <p className="text-slate-300 text-sm max-w-2xl leading-relaxed">
              Pilih dan gabungkan modul-modul sistem (Sensus Jemaat, Keuangan, Inventaris/Aset, Sakramen, Ibadah, dan Diakonia) menjadi satu berkas dokumen PDF resmi terintegrasi untuk kebutuhan sidang majelis dan evaluasi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => setActiveView(activeView === 'config' ? 'preview' : 'config')}
              variant="outline"
              className="bg-white/10 text-white hover:bg-white/20 border-white/20 text-xs h-10 px-4"
            >
              {activeView === 'config' ? (
                <>
                  <Eye className="w-4 h-4 mr-2 text-amber-300" />
                  Pratinjau Ringkasan
                </>
              ) : (
                <>
                  <Settings2 className="w-4 h-4 mr-2 text-amber-300" />
                  Pengaturan Modul
                </>
              )}
            </Button>

            <Button
              onClick={handleArchiveSnapshot}
              disabled={isArchiving || selectedModuleCount === 0}
              variant="outline"
              className="bg-white/10 text-white hover:bg-white/20 border-white/20 text-xs h-10 px-4"
            >
              {isArchiving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Mengarsipkan...
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4 mr-2 text-amber-300" />
                  Arsipkan Laporan Ini
                </>
              )}
            </Button>

            <Button
              onClick={handleExportExcel}
              disabled={selectedModuleCount === 0}
              variant="outline"
              className="bg-white/10 text-white hover:bg-white/20 border-white/20 text-xs h-10 px-4"
            >
              <FileText className="w-4 h-4 mr-2 text-amber-300" />
              Ekspor Excel
            </Button>

            <Button
              onClick={generateConsolidatedPDF}
              disabled={isGenerating || selectedModuleCount === 0}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs h-10 px-5 shadow-lg hover:shadow-amber-500/20 transition-all border border-amber-300/40"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Memproses Dokumen...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Generate & Unduh PDF ({selectedModuleCount} Modul)
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Quick 1-Click Presets Bar ── */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 px-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          Preset Cepat:
        </span>
        <button
          onClick={() => applyPreset('executive')}
          className="text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium transition-colors flex items-center gap-1.5"
        >
          <Award className="w-3 h-3 text-emerald-500" />
          Eksekutif PHMJ (Sensus + Keuangan + Aset)
        </button>
        <button
          onClick={() => applyPreset('full')}
          className="text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium transition-colors flex items-center gap-1.5"
        >
          <Layers className="w-3 h-3 text-blue-500" />
          Konsolidasi Lengkap (Semua Modul)
        </button>
        <button
          onClick={() => applyPreset('pastoral')}
          className="text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium transition-colors flex items-center gap-1.5"
        >
          <HeartHandshake className="w-3 h-3 text-rose-500" />
          Teologi & Pelayanan Kasih
        </button>
        <button
          onClick={() => applyPreset('finance_asset')}
          className="text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium transition-colors flex items-center gap-1.5"
        >
          <Building2 className="w-3 h-3 text-amber-500" />
          Keuangan & Sarana Prasarana
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={selectAllModules}
            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline px-2"
          >
            Pilih Semua
          </button>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <button
            onClick={clearAllModules}
            className="text-[11px] text-slate-500 hover:underline px-2"
          >
            Hapus Semua
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT: CONFIG & MODULE SELECTION ── */}
      {activeView === 'config' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Module Selection Cards */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-blue-600" />
                Daftar Modul Konsolidasi ({selectedModuleCount} terpilih)
              </h2>
              <span className="text-xs text-slate-500">
                Klik kartu modul untuk mengaktifkan / menonaktifkan
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {modules.map((mod) => {
                const IconComponent = mod.icon;
                return (
                  <div
                    key={mod.id}
                    onClick={() => toggleModule(mod.id)}
                    className={`cursor-pointer rounded-xl p-4.5 border transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
                      mod.selected
                        ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-400 dark:border-blue-700 shadow-md ring-1 ring-blue-400/50'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-75 hover:opacity-100 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm flex-shrink-0"
                          style={{ backgroundColor: mod.color }}
                        >
                          <IconComponent className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                            {mod.category}
                          </span>
                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">
                            {mod.name}
                          </h3>
                        </div>
                      </div>

                      <div className="flex-shrink-0">
                        {mod.selected ? (
                          <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-sm">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full border-2 border-slate-300 dark:border-slate-700 flex items-center justify-center" />
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 line-clamp-2 leading-relaxed">
                      {mod.description}
                    </p>

                    {/* Quick Metric Pill inside card */}
                    <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Data Terkini:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {mod.id === 'sensus' && `${totalMembersCount} Jiwa (${totalFamiliesCount} KK)`}
                        {mod.id === 'keuangan' && `Saldo: ${formatRp(totalCashBalance)}`}
                        {mod.id === 'inventaris' && `${totalAssetsCount} Aset (${formatRp(totalAssetBookValue)})`}
                        {mod.id === 'sakramen' && `${periodBaptisms.length + periodSidis.length + periodMarriages.length} Sakramen, ${periodAttestations.length} Atestasi`}
                        {mod.id === 'peribadahan' && `${worshipCount} Ibadah, ${eventsCount} Acara`}
                        {mod.id === 'diakonia' && `${aidRecipientsCount} Bantuan (${formatRp(aidTotalDistributed)})`}
                        {mod.id === 'presensi' && `${attendanceRate}% Partisipasi (${attendanceServiceDatesCount} Ibadah)`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Parameters & Signature Form */}
          <div className="lg:col-span-4 space-y-5">
            <Card className="p-5 border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <Filter className="w-4 h-4 text-amber-500" />
                Parameter & Periode Dokumen
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    Tahun Laporan:
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="w-full text-xs h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  >
                    <option value="2026">Tahun 2026 (Tahun Berjalan)</option>
                    <option value="2025">Tahun 2025</option>
                    <option value="2024">Tahun 2024</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    Rentang Periode:
                  </label>
                  <select
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value as any)}
                    className="w-full text-xs h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  >
                    <option value="annual">Tahunan Penuh (Januari - Desember)</option>
                    <option value="semester1">Semester I (Januari - Juni)</option>
                    <option value="semester2">Semester II (Juli - Desember)</option>
                    <option value="q1">Kuartal I (Jan - Mar)</option>
                    <option value="q2">Kuartal II (Apr - Jun)</option>
                    <option value="q3">Kuartal III (Jul - Sep)</option>
                    <option value="q4">Kuartal IV (Okt - Des)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    Filter Sektor:
                  </label>
                  <select
                    value={selectedSector}
                    onChange={(e) => setSelectedSector(e.target.value)}
                    className="w-full text-xs h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  >
                    <option value="all">Semua Sektor (Sektor 1 s/d 7)</option>
                    {sectors.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    Nomor Dokumen Resmi:
                  </label>
                  <input
                    type="text"
                    value={reportDocNo}
                    onChange={(e) => setReportDocNo(e.target.value)}
                    className="w-full text-xs h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>
            </Card>

            <Card className="p-5 border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Opsi & Pengesahan PHMJ
              </h3>

              <div className="space-y-2.5">
                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeExecutiveSummary}
                    onChange={(e) => setIncludeExecutiveSummary(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Sertakan Ringkasan Eksekutif (KPI Key Metrics)</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeDetailTables}
                    onChange={(e) => setIncludeDetailTables(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Sertakan Tabel Rinci (Distribusi Sektor & Akun)</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeNotes}
                    onChange={(e) => setIncludeNotes(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Sertakan Catatan Evaluasi Majelis</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSignatures}
                    onChange={(e) => setIncludeSignatures(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Sertakan Kolom Tanda Tangan Resmi PHMJ</span>
                </label>
              </div>

              {includeSignatures && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-0.5">Ketua Majelis Jemaat (KMJ):</label>
                    <input
                      type="text"
                      value={kmjName}
                      onChange={(e) => setKmjName(e.target.value)}
                      className="w-full text-xs h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-0.5">Sekretaris PHMJ:</label>
                    <input
                      type="text"
                      value={secName}
                      onChange={(e) => setSecName(e.target.value)}
                      className="w-full text-xs h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-0.5">Bendahara PHMJ:</label>
                    <input
                      type="text"
                      value={treasurerName}
                      onChange={(e) => setTreasurerName(e.target.value)}
                      className="w-full text-xs h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : (
        /* ── LIVE PREVIEW VIEW ── */
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="border-b pb-4 mb-6 text-center space-y-1">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white font-serif-church uppercase">
                {reportTitle}
              </h2>
              <p className="text-xs text-slate-500">
                GEREJA PROTESTAN DI INDONESIA BAGIAN BARAT (GPIB) JEMAAT "TRINITAS" | PERIODE: {selectedYear} ({selectedPeriod.toUpperCase()})
              </p>
            </div>

            {/* Live KPI Grid Preview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/40">
                <span className="text-xs text-blue-700 dark:text-blue-300 font-semibold block">Total Jemaat</span>
                <span className="text-xl font-bold text-slate-900 dark:text-white">{formatNumber(totalMembersCount)} Jiwa</span>
                <span className="text-[11px] text-slate-500 block mt-0.5">{totalFamiliesCount} Kepala Keluarga</span>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/40">
                <span className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold block">Posisi Kas & Bank</span>
                <span className="text-xl font-bold text-slate-900 dark:text-white">{formatRp(totalCashBalance)}</span>
                <span className="text-[11px] text-slate-500 block mt-0.5">Penerimaan: {formatRp(totalIncome)}</span>
              </div>
              <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/40">
                <span className="text-xs text-amber-700 dark:text-amber-300 font-semibold block">Total Nilai Aset</span>
                <span className="text-xl font-bold text-slate-900 dark:text-white">{formatRp(totalAssetBookValue)}</span>
                <span className="text-[11px] text-slate-500 block mt-0.5">{totalAssetsCount} Unit Inventaris</span>
              </div>
              <div className="p-4 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-800/40">
                <span className="text-xs text-rose-700 dark:text-rose-300 font-semibold block">Layanan Diakonia</span>
                <span className="text-xl font-bold text-slate-900 dark:text-white">{formatRp(aidTotalDistributed)}</span>
                <span className="text-[11px] text-slate-500 block mt-0.5">{aidRecipientsCount} Penerima Bantuan</span>
              </div>
            </div>

            {/* Selected Modules Preview summary */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-600" />
                Modul yang Masuk Dalam Laporan ({selectedModuleCount} Modul):
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {modules.filter(m => m.selected).map(mod => {
                  const Icon = mod.icon;
                  return (
                    <div key={mod.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: mod.color }}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block truncate">{mod.name}</span>
                        <span className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-medium">Siap di-generate</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Signatures Preview */}
            {includeSignatures && (
              <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
                <p className="text-xs text-right text-slate-500 mb-6">{signLocation}, {signDate}</p>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="space-y-12">
                    <p className="text-xs text-slate-600 dark:text-slate-300">Ketua Majelis Jemaat,</p>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100 underline">{kmjName}</p>
                      <p className="text-[10px] text-slate-400">KMJ GPIB Trinitas</p>
                    </div>
                  </div>
                  <div className="space-y-12">
                    <p className="text-xs text-slate-600 dark:text-slate-300">Sekretaris PHMJ,</p>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100 underline">{secName}</p>
                      <p className="text-[10px] text-slate-400">Sekretaris 1</p>
                    </div>
                  </div>
                  <div className="space-y-12">
                    <p className="text-xs text-slate-600 dark:text-slate-300">Bendahara PHMJ,</p>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100 underline">{treasurerName}</p>
                      <p className="text-[10px] text-slate-400">Bendahara 1</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
