import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { liveAge } from '../../lib/age';
import { calcDep } from '../../lib/assetDepreciation';
import {
  FileText, Download, Printer, CheckSquare, Square,
  Users, DollarSign, Package, Cross, Church, HeartHandshake,
  Calendar, CheckCircle2, ShieldCheck, Sparkles, Filter,
  Settings2, Eye, RefreshCw, FileCheck, Layers, Building2,
  TrendingUp, Award, Clock, ArrowRight, BookOpen, AlertCircle
} from 'lucide-react';

interface ReportModuleConfig {
  id: 'sensus' | 'keuangan' | 'inventaris' | 'sakramen' | 'peribadahan' | 'diakonia';
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
      color: '#1e3a8a', // navy
      selected: true,
    },
    {
      id: 'keuangan',
      name: 'Keuangan & Perbendaharaan',
      category: 'Bidang Perbendaharaan',
      description: 'Rekapitulasi kas dan bank, ringkasan penerimaan vs pengeluaran, saldo berjalan, kas kecil, dan serapan RAPB.',
      icon: DollarSign,
      color: '#047857', // emerald
      selected: true,
    },
    {
      id: 'inventaris',
      name: 'Inventaris, Aset & Fasilitas',
      category: 'Bidang Sarana & Prasarana',
      description: 'Daftar nilai perolehan dan nilai buku aset fisik, kondisi fisik sarana prasarana, serta pemanfaatan ruangan gereja.',
      icon: Package,
      color: '#b45309', // amber
      selected: true,
    },
    {
      id: 'sakramen',
      name: 'Sakramen & Atestasi Gereja',
      category: 'Bidang Keesaan & Teologi',
      description: 'Pelayanan Sakramen Baptisan Anak/Dewasa, Peneguhan Sidi, Pernikahan Kudus, dan mutasi warga masuk/keluar.',
      icon: Cross,
      color: '#7c3aed', // purple
      selected: false,
    },
    {
      id: 'peribadahan',
      name: 'Peribadahan & Kegiatan Jemaat',
      category: 'Bidang Pembinaan Jemaat',
      description: 'Jadwal dan frekuensi ibadah hari minggu/sektor, kalender kegiatan gerejawi, serta keaktifan komisi/pelkat.',
      icon: Church,
      color: '#0284c7', // sky
      selected: false,
    },
    {
      id: 'diakonia',
      name: 'Pelayanan Kasih & Bantuan Sosial',
      category: 'Bidang Pelayanan Kasih (Diakonia)',
      description: 'Penyaluran bantuan sosial, santunan jemaat, permohonan layanan pastoral, dan rekap permohonan doa syafaat.',
      icon: HeartHandshake,
      color: '#e11d48', // rose
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
      setModules(prev => prev.map(m => ({ ...m, selected: ['sensus', 'sakramen', 'peribadahan', 'diakonia'].includes(m.id) })));
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
    return financialRecords.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  }, [financialRecords]);

  const totalExpense = useMemo(() => {
    return financialRecords.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  }, [financialRecords]);

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

  // Sakramen metrics
  const baptisEvents = baptisms.length;
  const sidiEvents = sidis.length;
  const marriageEvents = marriages.length;
  const attestationIn = attestations.filter(a => a.type === 'Masuk').length;
  const attestationOut = attestations.filter(a => a.type === 'Keluar').length;

  // Peribadahan metrics
  const worshipCount = worshipSchedules.length;
  const eventsCount = events.length;
  const ministriesCount = ministries.length;

  // Diakonia metrics
  const aidTotalDistributed = useMemo(() => {
    return aidDistributions.reduce((s, a) => s + (a.amount || a.cost || 0), 0);
  }, [aidDistributions]);
  const aidRecipientsCount = aidDistributions.length;
  const serviceRequestsCount = serviceRequests.length;
  const prayerRequestsCount = prayerRequests.length;

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
                        {mod.id === 'sakramen' && `${baptisms.length + sidis.length + marriages.length} Sakramen, ${attestations.length} Atestasi`}
                        {mod.id === 'peribadahan' && `${worshipCount} Ibadah, ${eventsCount} Acara`}
                        {mod.id === 'diakonia' && `${aidRecipientsCount} Bantuan (${formatRp(aidTotalDistributed)})`}
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
