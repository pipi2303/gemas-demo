import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { SensusSnapshot } from '../types';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import {
  FileText, Download, Printer, Users, Home, Church, TrendingUp,
  Search, Filter, X, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle2, Loader2,
  Archive, Lock, Minus, FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { useSortable } from '../../hooks/useSortable';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColResizeHandle } from './ui/resizable-th';
import { liveAge } from '../../lib/age';

const COLORS = ['#1A77A3', '#caa04a', '#2f8f5b', '#d1553f', '#8b6bb1', '#9c9486'];

function formatNumber(n: number) { return n.toLocaleString('id-ID'); }

const SENSUS_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  fullName: 180, total: 110, laki: 100, perempuan: 100, keluarga: 100, aktif: 90, baptis: 90, sidi: 90, tamu: 90, simpatisan: 100,
};

export function LaporanSensus() {
  const { members, sectors, families, baptisms, sidis, marriages, sensusSnapshots, archiveSensusSnapshot } = useApp();
  const [activeTab, setActiveTab] = useState('sensus');
  // Laporan ini selalu menampilkan data per hari ini (bukan snapshot historis per tahun -
  // dropdown pilih tahun yang sebelumnya ada di sini cuma mengubah teks judul/nama file,
  // tidak benar-benar memfilter data, jadi berpotensi menyesatkan kalau dipakai sebagai arsip
  // resmi. Dihapus atas keputusan pemilik aplikasi.)
  const currentYear = new Date().getFullYear();

  // Capaian sakramen tahun berjalan — dipakai untuk laporan sensus tahunan
  const baptismsThisYear  = (baptisms  || []).filter(b => new Date(b.baptismDate).getFullYear()  === currentYear).length;
  const sidisThisYear     = (sidis     || []).filter(s => new Date(s.sidiDate).getFullYear()     === currentYear).length;
  const marriagesThisYear = (marriages || []).filter(m => new Date(m.marriageDate).getFullYear() === currentYear).length;

  // ---- Sensus Calculations ----
  const totalMembers = members.length;
  const totalFamilies = families.length;
  const maleCount = members.filter(m => m.gender === 'Laki-laki').length;
  const femaleCount = members.filter(m => m.gender === 'Perempuan').length;

  // Dihitung dari liveAge() (usia real-time dari birthDate), bukan field `age` yang
  // tersimpan statis sejak data terakhir diedit — supaya kelompok usia di sensus ini
  // selalu akurat, tidak meleset dari kenyataan seiring berjalannya waktu.
  const ageGroups = [
    { name: 'Anak (0–12)', value: members.filter(m => liveAge(m) <= 12).length },
    { name: 'Remaja (13–17)', value: members.filter(m => liveAge(m) >= 13 && liveAge(m) <= 17).length },
    { name: 'Pemuda (18–35)', value: members.filter(m => liveAge(m) >= 18 && liveAge(m) <= 35).length },
    { name: 'Dewasa (36–60)', value: members.filter(m => liveAge(m) >= 36 && liveAge(m) <= 60).length },
    { name: 'Lansia (60+)', value: members.filter(m => liveAge(m) > 60).length },
  ];

  const statusData = [
    { name: 'Aktif', value: members.filter(m => !m.membershipStatus || m.membershipStatus === 'Aktif').length },
    { name: 'Tidak Aktif', value: members.filter(m => m.membershipStatus === 'Tidak Aktif').length },
    { name: 'Pindah', value: members.filter(m => m.membershipStatus === 'Pindah').length },
    { name: 'Meninggal', value: members.filter(m => m.membershipStatus === 'Meninggal').length },
  ];

  const membershipTypeData = [
    { name: 'Warga Jemaat', value: members.filter(m => !m.membershipType || m.membershipType === 'Warga Jemaat').length },
    { name: 'Warga Tamu', value: members.filter(m => m.membershipType === 'Warga Tamu').length },
    { name: 'Simpatisan', value: members.filter(m => m.membershipType === 'Simpatisan').length },
  ];

  const baptismData = [
    { name: 'Sudah Baptis', value: members.filter(m => m.baptismStatus === 'Sudah').length },
    { name: 'Belum Baptis', value: members.filter(m => m.baptismStatus !== 'Sudah').length },
  ];

  const sidiData = [
    { name: 'Sudah Sidi', value: members.filter(m => m.sidiStatus === 'Sudah').length },
    { name: 'Belum Sidi', value: members.filter(m => m.sidiStatus !== 'Sudah').length },
  ];

  const maritalData = [
    { name: 'Belum Menikah', value: members.filter(m => m.maritalStatus === 'Belum Menikah').length },
    { name: 'Menikah', value: members.filter(m => m.maritalStatus === 'Menikah').length },
    { name: 'Duda/Janda', value: members.filter(m => m.maritalStatus === 'Duda' || m.maritalStatus === 'Janda').length },
  ];

  const sectorSensus = useMemo(() => {
    const sorted = [...sectors].sort((a, b) => {
      const na = parseInt(a.name.replace(/\D/g, ''), 10) || 0;
      const nb = parseInt(b.name.replace(/\D/g, ''), 10) || 0;
      return na !== nb ? na - nb : a.name.localeCompare(b.name);
    });
    return sorted.map(sector => {
      const sm = members.filter(m => m.sectorId === sector.id);
      const total = sm.length || sector.memberCount;
      return {
        name: sector.name.replace('Sektor ', 'Sek. '),
        fullName: sector.name,
        total,
        laki: sm.filter(m => m.gender === 'Laki-laki').length,
        perempuan: sm.filter(m => m.gender === 'Perempuan').length,
        keluarga: families.filter(f => f.sectorId === sector.id).length,
        aktif: sm.filter(m => !m.membershipStatus || m.membershipStatus === 'Aktif').length,
        baptis: sm.filter(m => m.baptismStatus === 'Sudah').length,
        sidi: sm.filter(m => m.sidiStatus === 'Sudah').length,
        tamu: sm.filter(m => m.membershipType === 'Warga Tamu').length,
        simpatisan: sm.filter(m => m.membershipType === 'Simpatisan').length,
      };
    });
  }, [sectors, members, families]);

  const { sorted: sortedSensus, sortKey: sensusSortKey, sortDir: sensusSortDir, requestSort: sensusSort } = useSortable(sectorSensus);
  const { widths: sensusColW, startResize: sensusStartResize } = useResizableColumns('laporan-sensus-detail', SENSUS_TABLE_DEFAULT_WIDTHS);

  type SensusRow = typeof sectorSensus[number];
  const SortIcon = ({ col }: { col: keyof SensusRow }) => {
    if (sensusSortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-40 ml-1 inline" />;
    return sensusSortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1 inline" />
      : <ArrowDown className="w-3 h-3 ml-1 inline" />;
  };

  // Radar data for sector comparison
  const radarData = sectorSensus.map(s => ({
    subject: s.name,
    Anggota: s.total,
    Keluarga: s.keluarga,
    'Laki-laki': s.laki,
    Perempuan: s.perempuan,
  }));

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  // ── Arsip Sensus Tahunan (perbandingan tahun-ke-tahun) ──────────────────────
  const currentSnapshot  = sensusSnapshots.find(sn => sn.id === `sensus-${currentYear}`);
  const lastYearSnapshot = sensusSnapshots.find(sn => sn.id === `sensus-${currentYear - 1}`);
  const archivedYears = [...sensusSnapshots].sort((a, b) => b.year - a.year);

  const buildCurrentSnapshot = (): SensusSnapshot => ({
    id: `sensus-${currentYear}`,
    year: currentYear,
    archivedAt: new Date().toISOString(),
    totalMembers,
    totalFamilies,
    totalSectors: sectors.length,
    maleCount,
    femaleCount,
    statusData,
    membershipTypeData,
    maritalData,
    ageGroups,
    baptismCount: baptismData[0].value,
    sidiCount: sidiData[0].value,
    baptismsThisYear,
    sidisThisYear,
    marriagesThisYear,
    sectorSensus,
  });

  const handleArchiveSensus = async () => {
    if (currentSnapshot) {
      const tgl = new Date(currentSnapshot.archivedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      const confirmed = window.confirm(`Sensus tahun ${currentYear} sudah pernah diarsipkan pada ${tgl}. Timpa dengan data terbaru?`);
      if (!confirmed) return;
    }
    setIsArchiving(true);
    try {
      await archiveSensusSnapshot(buildCurrentSnapshot());
      toast.success(`Sensus jemaat tahun ${currentYear} berhasil dikunci & diarsipkan!`);
    } catch (err) {
      console.error('Error archiving sensus:', err);
      toast.error('Gagal mengarsipkan sensus jemaat.');
    } finally {
      setIsArchiving(false);
    }
  };

  const DeltaBadge = ({ current, previous }: { current: number; previous: number }) => {
    const diff = current - previous;
    const pct = previous > 0 ? ((diff / previous) * 100).toFixed(1) : (current > 0 ? '100.0' : '0.0');
    if (diff === 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color: '#94a3b8' }}>
          <Minus className="w-3 h-3" /> Tetap
        </span>
      );
    }
    const up = diff > 0;
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color: up ? '#2f8f5b' : '#d1553f' }}>
        {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
        {up ? '+' : ''}{diff} ({up ? '+' : ''}{pct}%)
      </span>
    );
  };

  const handleExportPdf = () => {
    setIsExportingPdf(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 14;

      // ── Header Banner ──
      doc.setFillColor(13, 26, 45); // #0d1a2d GPIB Navy
      doc.rect(0, 0, pageWidth, 26, 'F');

      doc.setFillColor(212, 175, 55); // #d4af37 GPIB Gold stripe
      doc.rect(0, 26, pageWidth, 1.5, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('GEREJA PROTESTAN DI INDONESIA BAGIAN BARAT (GPIB)', pageWidth / 2, 9, { align: 'center' });

      doc.setFontSize(15);
      doc.setTextColor(223, 183, 116); // Gold text
      doc.text('JEMAAT "TRINITAS"', pageWidth / 2, 16, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(203, 213, 225);
      doc.text('Gereja Manajemen Sistem (GEMAS) · Dokumen Laporan Resmi', pageWidth / 2, 22, { align: 'center' });

      y = 34;

      // ── Title & Meta ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(`LAPORAN SENSUS & DEMOGRAFI JEMAAT TAHUN ${currentYear}`, 14, y);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      const printDateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      doc.text(`Dicetak pada: ${printDateStr} · Total Jiwa: ${formatNumber(totalMembers)} · Total KK: ${formatNumber(totalFamilies)}`, 14, y + 5);
      y += 11;

      // ── Section A: REKAPITULASI DEMOGRAFI & STATUS ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(13, 26, 45);
      doc.text('I. REKAPITULASI UMUM DEMOGRAFI JEMAAT', 14, y);
      y += 4;

      const pMale = totalMembers > 0 ? ((maleCount / totalMembers) * 100).toFixed(1) : '0';
      const pFemale = totalMembers > 0 ? ((femaleCount / totalMembers) * 100).toFixed(1) : '0';
      const pAktif = totalMembers > 0 ? ((statusData[0].value / totalMembers) * 100).toFixed(1) : '0';
      const pBaptis = totalMembers > 0 ? ((baptismData[0].value / totalMembers) * 100).toFixed(1) : '0';
      const pSidi = totalMembers > 0 ? ((sidiData[0].value / totalMembers) * 100).toFixed(1) : '0';

      autoTable(doc, {
        startY: y,
        head: [['Kategori Indikator', 'Jumlah / Angka', 'Persentase', 'Keterangan Sinodal']],
        body: [
          ['Total Warga Jemaat', `${formatNumber(totalMembers)} Jiwa`, '100.0%', 'Terdaftar di Database'],
          ['Jumlah Kepala Keluarga (KK)', `${formatNumber(totalFamilies)} KK`, '—', 'Kartu Keluarga Jemaat'],
          ['Laki-laki', `${formatNumber(maleCount)} Jiwa`, `${pMale}%`, 'Warga Jemaat Laki-laki'],
          ['Perempuan', `${formatNumber(femaleCount)} Jiwa`, `${pFemale}%`, 'Warga Jemaat Perempuan'],
          ['Status Warga Aktif', `${formatNumber(statusData[0].value)} Jiwa`, `${pAktif}%`, 'Aktif Bersekutu & Pelayanan'],
          ['Sudah Menerima Sakramen Baptis', `${formatNumber(baptismData[0].value)} Jiwa`, `${pBaptis}%`, 'Baptis Anak / Dewasa'],
          ['Sudah Menerima Sakramen Sidi', `${formatNumber(sidiData[0].value)} Jiwa`, `${pSidi}%`, 'Mengaku Percaya / Anggota Penuh'],
          ['Warga Sudah Menikah', `${formatNumber(maritalData[1].value)} Jiwa`, `${totalMembers > 0 ? ((maritalData[1].value / totalMembers) * 100).toFixed(1) : '0'}%`, 'Pemberkatan Nikah Gereja'],
        ],
        theme: 'grid',
        headStyles: { fillColor: [13, 26, 45], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 70, fontStyle: 'bold' },
          1: { cellWidth: 35, halign: 'center' },
          2: { cellWidth: 25, halign: 'center' },
          3: { cellWidth: 52 },
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 8;

      // ── Section B: DATA PER SEKTOR PELAYANAN ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(13, 26, 45);
      doc.text('II. DISTRIBUSI WARGA PER SEKTOR PELAYANAN', 14, y);
      y += 4;

      autoTable(doc, {
        startY: y,
        head: [['No', 'Sektor Pelayanan', 'Total Jiwa', 'Laki-laki', 'Perempuan', 'Jml KK', 'Aktif', 'Baptis', 'Sidi']],
        body: [
          ...sectorSensus.map((s, idx) => [
            String(idx + 1),
            s.fullName,
            formatNumber(s.total),
            formatNumber(s.laki),
            formatNumber(s.perempuan),
            formatNumber(s.keluarga),
            formatNumber(s.aktif),
            formatNumber(s.baptis),
            formatNumber(s.sidi),
          ]),
          [
            '—',
            'TOTAL KESELURUHAN',
            formatNumber(totalMembers),
            formatNumber(maleCount),
            formatNumber(femaleCount),
            formatNumber(totalFamilies),
            formatNumber(statusData[0].value),
            formatNumber(baptismData[0].value),
            formatNumber(sidiData[0].value),
          ],
        ],
        theme: 'striped',
        headStyles: { fillColor: [20, 79, 107], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 42, fontStyle: 'bold' },
          2: { halign: 'center', fontStyle: 'bold' },
          3: { halign: 'center' },
          4: { halign: 'center' },
          5: { halign: 'center' },
          6: { halign: 'center' },
          7: { halign: 'center' },
          8: { halign: 'center' },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index === sectorSensus.length) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 247, 251];
            data.cell.styles.textColor = [20, 79, 107];
          }
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 8;

      // Check for page break before section C
      if (y > 210) {
        doc.addPage();
        y = 20;
      }

      // ── Section C: DISTRIBUSI USIA & KATEGORIAL PELAYANAN ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(13, 26, 45);
      doc.text('III. DISTRIBUSI KELOMPOK USIA (KATEGORIAL PELKAT)', 14, y);
      y += 4;

      const pelkatMap: Record<string, string> = {
        'Anak (0–12)': 'Pelayanan Anak (PA)',
        'Remaja (13–17)': 'Persekutuan Teruna (PT)',
        'Pemuda (18–35)': 'Gerakan Pemuda (GP)',
        'Dewasa (36–60)': 'Persekutuan Kaum Perempuan (PKP) / Kaum Bapak (PKB)',
        'Lansia (60+)': 'Persekutuan Kaum Lanjut Usia (PKLU)',
      };

      autoTable(doc, {
        startY: y,
        head: [['Kelompok Usia', 'Pelkat Terkait', 'Jumlah Warga', 'Persentase']],
        body: [
          ...ageGroups.map(ag => [
            ag.name,
            pelkatMap[ag.name] || '—',
            `${formatNumber(ag.value)} Jiwa`,
            totalMembers > 0 ? `${((ag.value / totalMembers) * 100).toFixed(1)}%` : '0%',
          ]),
          [
            'TOTAL',
            'Seluruh Kategorial',
            `${formatNumber(totalMembers)} Jiwa`,
            '100.0%',
          ]
        ],
        theme: 'grid',
        headStyles: { fillColor: [13, 26, 45], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 40, fontStyle: 'bold' },
          1: { cellWidth: 80 },
          2: { cellWidth: 32, halign: 'center' },
          3: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index === ageGroups.length) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 247, 251];
            data.cell.styles.textColor = [13, 26, 45];
          }
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 8;

      // Check for page break before section D
      if (y > 240) {
        doc.addPage();
        y = 20;
      }

      // ── Section D: STATUS & TIPE KEANGGOTAAN, STATUS PERNIKAHAN ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(13, 26, 45);
      doc.text('IV. STATUS & TIPE KEANGGOTAAN, STATUS PERNIKAHAN', 14, y);
      y += 4;

      autoTable(doc, {
        startY: y,
        head: [['Kategori', 'Rincian', 'Jumlah', 'Persentase']],
        body: [
          ...statusData.map(d => ['Status Keanggotaan', d.name, formatNumber(d.value), totalMembers > 0 ? `${((d.value / totalMembers) * 100).toFixed(1)}%` : '0%']),
          ...membershipTypeData.map(d => ['Tipe Keanggotaan', d.name, formatNumber(d.value), totalMembers > 0 ? `${((d.value / totalMembers) * 100).toFixed(1)}%` : '0%']),
          ...maritalData.map(d => ['Status Pernikahan', d.name, formatNumber(d.value), totalMembers > 0 ? `${((d.value / totalMembers) * 100).toFixed(1)}%` : '0%']),
        ],
        theme: 'grid',
        headStyles: { fillColor: [13, 26, 45], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 42, fontStyle: 'bold' },
          1: { cellWidth: 60 },
          2: { cellWidth: 30, halign: 'center' },
          3: { cellWidth: 30, halign: 'center' },
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 8;

      if (y > 240) {
        doc.addPage();
        y = 20;
      }

      // ── Section E: CAPAIAN SAKRAMEN TAHUN BERJALAN ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(13, 26, 45);
      doc.text(`V. CAPAIAN SAKRAMEN TAHUN BERJALAN (${currentYear})`, 14, y);
      y += 4;

      autoTable(doc, {
        startY: y,
        head: [['Sakramen / Peristiwa', `Jumlah Tahun ${currentYear}`]],
        body: [
          ['Baptis Baru', `${formatNumber(baptismsThisYear)} Jiwa`],
          ['Sidi Baru', `${formatNumber(sidisThisYear)} Jiwa`],
          ['Pemberkatan Nikah', `${formatNumber(marriagesThisYear)} Pasang`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [13, 26, 45], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 90, fontStyle: 'bold' },
          1: { cellWidth: 60, halign: 'center' },
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 8;

      if (lastYearSnapshot) {
        if (y > 235) {
          doc.addPage();
          y = 20;
        }

        // ── Section F: PERBANDINGAN DENGAN SENSUS TAHUN LALU ──
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(13, 26, 45);
        doc.text(`VI. PERBANDINGAN DENGAN SENSUS TAHUN ${lastYearSnapshot.year}`, 14, y);
        y += 4;

        const cmpRows: [string, number, number][] = [
          ['Total Jemaat', lastYearSnapshot.totalMembers, totalMembers],
          ['Total Kepala Keluarga', lastYearSnapshot.totalFamilies, totalFamilies],
          ['Laki-laki', lastYearSnapshot.maleCount, maleCount],
          ['Perempuan', lastYearSnapshot.femaleCount, femaleCount],
          ['Sudah Baptis', lastYearSnapshot.baptismCount, baptismData[0].value],
          ['Sudah Sidi', lastYearSnapshot.sidiCount, sidiData[0].value],
        ];

        autoTable(doc, {
          startY: y,
          head: [['Indikator', String(lastYearSnapshot.year), `${currentYear} (hari ini)`, 'Selisih']],
          body: cmpRows.map(([label, prev, cur]) => {
            const diff = cur - prev;
            return [label, formatNumber(prev), formatNumber(cur), `${diff > 0 ? '+' : ''}${formatNumber(diff)}`];
          }),
          theme: 'grid',
          headStyles: { fillColor: [13, 26, 45], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
          columnStyles: {
            0: { cellWidth: 60, fontStyle: 'bold' },
            1: { cellWidth: 40, halign: 'center' },
            2: { cellWidth: 40, halign: 'center' },
            3: { cellWidth: 40, halign: 'center' },
          },
          margin: { left: 14, right: 14 },
        });

        y = (doc as any).lastAutoTable.finalY + 12;
      } else {
        y += 4;
      }

      // Check space for signature
      if (y > 235) {
        doc.addPage();
        y = 25;
      }

      // ── Signature Blocks ──
      const signY = y + 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);

      doc.text('Mengetahui / Mengesahkan,', 20, signY);
      doc.text('Pelaksana Sensus / Tata Usaha,', pageWidth - 70, signY);

      doc.setFont('helvetica', 'bold');
      doc.text('Majelis Jemaat GPIB Trinitas', 20, signY + 5);
      doc.text('Komisi Pengelola Data Jemaat', pageWidth - 70, signY + 5);

      doc.text('( .................................................... )', 20, signY + 28);
      doc.text('( .................................................... )', pageWidth - 70, signY + 28);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text('Ketua Majelis Jemaat / PHMJ', 20, signY + 33);
      doc.text('Sekretaris / Pengelola Sensus', pageWidth - 70, signY + 33);

      // ── Footer on all pages ──
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `GPIB Trinitas · Laporan Sensus & Demografi Tahun ${currentYear} · Halaman ${p} dari ${totalPages}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 7,
          { align: 'center' }
        );
      }

      doc.save(`Laporan-Sensus-Jemaat-GPIB-Trinitas-${currentYear}.pdf`);
      toast.success(`Laporan Sensus Jemaat Tahun ${currentYear} berhasil diekspor ke PDF!`);
    } catch (err) {
      console.error('Error generating Sensus PDF:', err);
      toast.error('Gagal mengekspor laporan sensus ke PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Ringkasan
      const ringkasan: any[][] = [
        [`LAPORAN SENSUS & DEMOGRAFI JEMAAT TAHUN ${currentYear}`],
        [`Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`],
        [],
        ['Kategori Indikator', 'Jumlah'],
        ['Total Warga Jemaat', totalMembers],
        ['Jumlah Kepala Keluarga (KK)', totalFamilies],
        ['Laki-laki', maleCount],
        ['Perempuan', femaleCount],
        ['Jumlah Sektor', sectors.length],
        [],
        ['Status Keanggotaan', ''],
        ...statusData.map(d => [d.name, d.value]),
        [],
        ['Tipe Keanggotaan', ''],
        ...membershipTypeData.map(d => [d.name, d.value]),
        [],
        ['Status Pernikahan', ''],
        ...maritalData.map(d => [d.name, d.value]),
        [],
        ['Sakramen', ''],
        ['Sudah Baptis (kumulatif)', baptismData[0].value],
        ['Sudah Sidi (kumulatif)', sidiData[0].value],
        [`Baptis Baru Tahun ${currentYear}`, baptismsThisYear],
        [`Sidi Baru Tahun ${currentYear}`, sidisThisYear],
        [`Pernikahan Tahun ${currentYear}`, marriagesThisYear],
      ];
      const wsRingkasan = XLSX.utils.aoa_to_sheet(ringkasan);
      wsRingkasan['!cols'] = [{ wch: 32 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsRingkasan, 'Ringkasan');

      // Sheet 2: Distribusi Usia
      const usia: any[][] = [
        ['Kelompok Usia', 'Jumlah', 'Persentase'],
        ...ageGroups.map(ag => [ag.name, ag.value, totalMembers > 0 ? `${((ag.value / totalMembers) * 100).toFixed(1)}%` : '0%']),
      ];
      const wsUsia = XLSX.utils.aoa_to_sheet(usia);
      wsUsia['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsUsia, 'Distribusi Usia');

      // Sheet 3: Per Sektor
      const perSektor: any[][] = [
        ['No', 'Sektor', 'Total', 'Laki-laki', 'Perempuan', 'Jml KK', 'Aktif', 'Baptis', 'Sidi', 'Tamu', 'Simpatisan'],
        ...sectorSensus.map((s, i) => [i + 1, s.fullName, s.total, s.laki, s.perempuan, s.keluarga, s.aktif, s.baptis, s.sidi, s.tamu, s.simpatisan]),
        ['—', 'TOTAL', totalMembers, maleCount, femaleCount, totalFamilies, statusData[0].value, baptismData[0].value, sidiData[0].value, membershipTypeData[1].value, membershipTypeData[2].value],
      ];
      const wsSektor = XLSX.utils.aoa_to_sheet(perSektor);
      wsSektor['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 9 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 11 }];
      XLSX.utils.book_append_sheet(wb, wsSektor, 'Per Sektor');

      // Sheet 4: Perbandingan Tahunan (jika ada arsip tahun lalu)
      if (lastYearSnapshot) {
        const banding: any[][] = [
          ['Indikator', String(lastYearSnapshot.year), `${currentYear} (hari ini)`, 'Selisih'],
          ['Total Jemaat', lastYearSnapshot.totalMembers, totalMembers, totalMembers - lastYearSnapshot.totalMembers],
          ['Total Kepala Keluarga', lastYearSnapshot.totalFamilies, totalFamilies, totalFamilies - lastYearSnapshot.totalFamilies],
          ['Laki-laki', lastYearSnapshot.maleCount, maleCount, maleCount - lastYearSnapshot.maleCount],
          ['Perempuan', lastYearSnapshot.femaleCount, femaleCount, femaleCount - lastYearSnapshot.femaleCount],
          ['Sudah Baptis', lastYearSnapshot.baptismCount, baptismData[0].value, baptismData[0].value - lastYearSnapshot.baptismCount],
          ['Sudah Sidi', lastYearSnapshot.sidiCount, sidiData[0].value, sidiData[0].value - lastYearSnapshot.sidiCount],
        ];
        const wsBanding = XLSX.utils.aoa_to_sheet(banding);
        wsBanding['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, wsBanding, 'Perbandingan Tahunan');
      }

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const filename = `Sensus-Jemaat-${currentYear}-${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast.success('Laporan sensus berhasil diekspor ke Excel!');
    } catch (err) {
      console.error('Error exporting Sensus Excel:', err);
      toast.error('Gagal mengekspor laporan sensus ke Excel.');
    }
  };

  const handlePrintSensus = () => {
    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) return;
    printWin.document.write(`
      <html><head><title>Laporan Jemaat ${currentYear}</title>
      <style>body{font-family:Arial;padding:20px;font-size:12px}
      table{width:100%;border-collapse:collapse;margin:10px 0}
      th,td{border:1px solid #ccc;padding:6px}th{background:#144f6b;color:white}
      h2,h3{color:#144f6b}.section{margin-top:20px}</style></head>
      <body>
        <div style="text-align:center;margin-bottom:20px">
          <h2>GEREJA PROTESTAN INDONESIA DI BAGIAN BARAT</h2>
          <h2>GPIB TRINITAS</h2>
          <h3>LAPORAN SENSUS JEMAAT TAHUN ${currentYear}</h3>
        </div>
        
        <div class="section"><h3>A. REKAP UMUM JEMAAT</h3>
        <table>
          <tr><th>Keterangan</th><th>Jumlah</th></tr>
          <tr><td>Total Warga Jemaat</td><td>${formatNumber(totalMembers)} jiwa</td></tr>
          <tr><td>Jumlah Kepala Keluarga</td><td>${formatNumber(totalFamilies)} KK</td></tr>
          <tr><td>Jemaat Laki-laki</td><td>${formatNumber(maleCount)} jiwa</td></tr>
          <tr><td>Jemaat Perempuan</td><td>${formatNumber(femaleCount)} jiwa</td></tr>
          <tr><td>Jemaat Aktif</td><td>${formatNumber(statusData[0].value)} jiwa</td></tr>
          <tr><td>Jemaat Sudah Baptis</td><td>${formatNumber(baptismData[0].value)} jiwa</td></tr>
          <tr><td>Jemaat Sudah Sidi</td><td>${formatNumber(sidiData[0].value)} jiwa</td></tr>
        </table></div>

        <div class="section"><h3>B. DATA PER SEKTOR</h3>
        <table>
          <tr><th>Sektor</th><th>Total Jemaat</th><th>Laki-laki</th><th>Perempuan</th><th>Jumlah KK</th></tr>
          ${sectorSensus.map(s => `<tr><td>${s.fullName}</td><td>${s.total}</td><td>${s.laki}</td><td>${s.perempuan}</td><td>${s.keluarga}</td></tr>`).join('')}
          <tr><td><strong>TOTAL</strong></td><td><strong>${totalMembers}</strong></td><td><strong>${maleCount}</strong></td><td><strong>${femaleCount}</strong></td><td><strong>${totalFamilies}</strong></td></tr>
        </table></div>

        <div class="section"><h3>C. DISTRIBUSI USIA</h3>
        <table>
          <tr><th>Kelompok Usia</th><th>Jumlah</th><th>Persentase</th></tr>
          ${ageGroups.map(ag => `<tr><td>${ag.name}</td><td>${ag.value}</td><td>${totalMembers > 0 ? ((ag.value/totalMembers)*100).toFixed(1) : 0}%</td></tr>`).join('')}
        </table></div>

        <div class="section"><h3>D. STATUS & TIPE KEANGGOTAAN, STATUS PERNIKAHAN</h3>
        <table>
          <tr><th>Kategori</th><th>Rincian</th><th>Jumlah</th></tr>
          ${statusData.map(d => `<tr><td>Status Keanggotaan</td><td>${d.name}</td><td>${d.value}</td></tr>`).join('')}
          ${membershipTypeData.map(d => `<tr><td>Tipe Keanggotaan</td><td>${d.name}</td><td>${d.value}</td></tr>`).join('')}
          ${maritalData.map(d => `<tr><td>Status Pernikahan</td><td>${d.name}</td><td>${d.value}</td></tr>`).join('')}
        </table></div>

        <div class="section"><h3>E. CAPAIAN SAKRAMEN TAHUN BERJALAN (${currentYear})</h3>
        <table>
          <tr><th>Sakramen / Peristiwa</th><th>Jumlah Tahun ${currentYear}</th></tr>
          <tr><td>Baptis Baru</td><td>${baptismsThisYear} Jiwa</td></tr>
          <tr><td>Sidi Baru</td><td>${sidisThisYear} Jiwa</td></tr>
          <tr><td>Pemberkatan Nikah</td><td>${marriagesThisYear} Pasang</td></tr>
        </table></div>

        ${lastYearSnapshot ? `
        <div class="section"><h3>F. PERBANDINGAN DENGAN SENSUS TAHUN ${lastYearSnapshot.year}</h3>
        <table>
          <tr><th>Indikator</th><th>${lastYearSnapshot.year}</th><th>${currentYear} (hari ini)</th><th>Selisih</th></tr>
          <tr><td>Total Jemaat</td><td>${lastYearSnapshot.totalMembers}</td><td>${totalMembers}</td><td>${totalMembers - lastYearSnapshot.totalMembers > 0 ? '+' : ''}${totalMembers - lastYearSnapshot.totalMembers}</td></tr>
          <tr><td>Total Kepala Keluarga</td><td>${lastYearSnapshot.totalFamilies}</td><td>${totalFamilies}</td><td>${totalFamilies - lastYearSnapshot.totalFamilies > 0 ? '+' : ''}${totalFamilies - lastYearSnapshot.totalFamilies}</td></tr>
          <tr><td>Sudah Baptis</td><td>${lastYearSnapshot.baptismCount}</td><td>${baptismData[0].value}</td><td>${baptismData[0].value - lastYearSnapshot.baptismCount > 0 ? '+' : ''}${baptismData[0].value - lastYearSnapshot.baptismCount}</td></tr>
          <tr><td>Sudah Sidi</td><td>${lastYearSnapshot.sidiCount}</td><td>${sidiData[0].value}</td><td>${sidiData[0].value - lastYearSnapshot.sidiCount > 0 ? '+' : ''}${sidiData[0].value - lastYearSnapshot.sidiCount}</td></tr>
        </table></div>
        ` : ''}

        <p>Dicetak: ${new Date().toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}</p>
      </body></html>
    `);
    printWin.document.close();
    printWin.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan Sensus Jemaat</h1>
          <p className="text-gray-500 mt-1">Laporan demografi & statistik kependudukan warga gereja GPIB Trinitas</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="gap-2 text-white font-semibold shadow-sm transition-all"
            style={{ background: '#0d1a2d', border: '1px solid #caa049' }}
          >
            {isExportingPdf ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                <span>Mengekspor...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-amber-300" />
                <span>Ekspor PDF</span>
              </>
            )}
          </Button>

          <Button variant="outline" className="gap-2 border-gray-300" onClick={handlePrintSensus}>
            <Printer className="w-4 h-4 text-gray-600" />
            <span>Cetak Sensus</span>
          </Button>

          <Button variant="outline" className="gap-2 border-gray-300" onClick={handleExportExcel}>
            <FileSpreadsheet className="w-4 h-4 text-gray-600" />
            <span>Ekspor Excel</span>
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Total Jemaat', value: formatNumber(totalMembers), icon: Users, color: '#1A77A3', bg: '#f0f7fb' },
          { label: 'Total KK', value: formatNumber(totalFamilies), icon: Home, color: '#144f6b', bg: '#e8ecf0' },
          { label: 'Laki-laki', value: formatNumber(maleCount), icon: Users, color: '#8b6bb1', bg: '#f5f3ff' },
          { label: 'Perempuan', value: formatNumber(femaleCount), icon: Users, color: '#d1553f', bg: '#fdf2f0' },
          { label: 'Jumlah Sektor', value: sectors.length, icon: Church, color: '#2f8f5b', bg: '#f0f9f4' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i} className="p-4" style={{ background: stat.bg }}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" style={{ color: stat.color }} />
                <p className="text-xs text-gray-600">{stat.label}</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
            </Card>
          );
        })}
      </div>

      {/* Capaian Sakramen Tahun Ini */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4" style={{ background: '#f0f7fb' }}>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4" style={{ color: '#1A77A3' }} />
            <p className="text-xs text-gray-600">Baptis Baru Tahun {currentYear}</p>
          </div>
          <p className="text-2xl font-bold" style={{ color: '#1A77A3' }}>{formatNumber(baptismsThisYear)}</p>
        </Card>
        <Card className="p-4" style={{ background: '#e8ecf0' }}>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4" style={{ color: '#144f6b' }} />
            <p className="text-xs text-gray-600">Sidi Baru Tahun {currentYear}</p>
          </div>
          <p className="text-2xl font-bold" style={{ color: '#144f6b' }}>{formatNumber(sidisThisYear)}</p>
        </Card>
        <Card className="p-4" style={{ background: '#f5f3ff' }}>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4" style={{ color: '#8b6bb1' }} />
            <p className="text-xs text-gray-600">Pernikahan Tahun {currentYear}</p>
          </div>
          <p className="text-2xl font-bold" style={{ color: '#8b6bb1' }}>{formatNumber(marriagesThisYear)}</p>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="sensus">Sensus Tahunan</TabsTrigger>
          <TabsTrigger value="comparison">Perbandingan Sektor</TabsTrigger>
          <TabsTrigger value="arsip">Arsip Tahunan</TabsTrigger>
        </TabsList>

        {/* Sensus */}
        <TabsContent value="sensus" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-3">
              <h3 className="font-semibold text-sm text-gray-900 mb-3">Distribusi Usia</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={ageGroups} layout="vertical" margin={{ left: 60, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#1A77A3" radius={[0, 3, 3, 0]} name="Jumlah" animationDuration={400} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-3">
              <h3 className="font-semibold text-sm text-gray-900 mb-3">Status Keanggotaan</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusData.filter(d => d.value > 0)} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                    {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-3">
              <h3 className="font-semibold text-sm text-gray-900 mb-3">Status Pernikahan</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={maritalData.filter(d => d.value > 0)} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                    {maritalData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Detailed Table */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Tabel Sensus Lengkap per Sektor - {currentYear}</h3>
              <Button variant="outline" size="sm" className="gap-1" onClick={handlePrintSensus}>
                <Download className="w-3.5 h-3.5" />
                Export
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{tableLayout:'fixed'}}>
                <thead>
                  <tr className="bg-[#144f6b] text-white">
                    {([
                      ['fullName', 'Sektor', 'text-left'],
                      ['total', 'Total Jemaat', 'text-center'],
                      ['laki', 'Laki-laki', 'text-center'],
                      ['perempuan', 'Perempuan', 'text-center'],
                      ['keluarga', 'Jumlah KK', 'text-center'],
                      ['aktif', 'Aktif', 'text-center'],
                      ['baptis', 'Baptis', 'text-center'],
                      ['sidi', 'Sidi', 'text-center'],
                      ['tamu', 'Tamu', 'text-center'],
                      ['simpatisan', 'Simpatisan', 'text-center'],
                    ] as [keyof SensusRow, string, string][]).map(([col, label, align]) => (
                      <th key={col} className={`px-3 py-2 ${align} cursor-pointer select-none hover:bg-[#1a5f80] transition-colors`}
                        style={{fontSize:'11.5px',fontWeight:600,color:'#FFEFB2',width:sensusColW[col],position:'relative'}}
                        onClick={() => sensusSort(col)}>
                        {label}<SortIcon col={col} />
                        <ColResizeHandle onMouseDown={sensusStartResize(col)} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedSensus.map((s, i) => (
                    <tr key={s.fullName} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 font-medium">{s.fullName}</td>
                      <td className="px-3 py-2 text-center">{s.total}</td>
                      <td className="px-3 py-2 text-center">{s.laki}</td>
                      <td className="px-3 py-2 text-center">{s.perempuan}</td>
                      <td className="px-3 py-2 text-center">{s.keluarga}</td>
                      <td className="px-3 py-2 text-center">{s.aktif}</td>
                      <td className="px-3 py-2 text-center">{s.baptis}</td>
                      <td className="px-3 py-2 text-center">{s.sidi}</td>
                      <td className="px-3 py-2 text-center">{s.tamu}</td>
                      <td className="px-3 py-2 text-center">{s.simpatisan}</td>
                    </tr>
                  ))}
                  <tr className="bg-[#f0f7fb] font-bold">
                    <td className="px-3 py-2">TOTAL</td>
                    <td className="px-3 py-2 text-center">{totalMembers}</td>
                    <td className="px-3 py-2 text-center">{maleCount}</td>
                    <td className="px-3 py-2 text-center">{femaleCount}</td>
                    <td className="px-3 py-2 text-center">{totalFamilies}</td>
                    <td className="px-3 py-2 text-center">{statusData[0].value}</td>
                    <td className="px-3 py-2 text-center">{baptismData[0].value}</td>
                    <td className="px-3 py-2 text-center">{sidiData[0].value}</td>
                    <td className="px-3 py-2 text-center">{membershipTypeData[1].value}</td>
                    <td className="px-3 py-2 text-center">{membershipTypeData[2].value}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* Comparison */}
        <TabsContent value="comparison" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Jumlah Anggota per Sektor</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={sectorSensus} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="laki" fill="#1A77A3" name="Laki-laki" radius={[2, 2, 0, 0]} animationDuration={400} animationEasing="ease-out" />
                  <Bar dataKey="perempuan" fill="#caa04a" name="Perempuan" radius={[2, 2, 0, 0]} animationDuration={400} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Proporsi per Sektor</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={sectorSensus} dataKey="total" nameKey="fullName" cx="50%" cy="50%"
                    outerRadius={100} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                    {sectorSensus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {sectorSensus.map((s, i) => (
              <Card key={i} className="p-3">
                <p className="font-medium text-sm text-gray-900 mb-2">{s.fullName}</p>
                <p className="text-3xl font-bold text-[#144f6b]">{s.total}</p>
                <p className="text-xs text-gray-500 mb-2">jiwa terdaftar</p>
                <div className="flex justify-between text-xs">
                  <span className="text-blue-600">L: {s.laki}</span>
                  <span className="text-pink-600">P: {s.perempuan}</span>
                  <span className="text-gray-500">KK: {s.keluarga}</span>
                </div>
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#144f6b] rounded-full"
                    style={{ width: `${totalMembers > 0 ? (s.total / totalMembers) * 100 : 0}%` }} />
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Arsip Sensus Tahunan */}
        <TabsContent value="arsip" className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#e8ecf0' }}>
                  <Archive className="w-4 h-4" style={{ color: '#144f6b' }} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Arsip Sensus Tahun {currentYear}</h3>
                  <p className="text-xs text-gray-500">
                    {currentSnapshot
                      ? `Terakhir dikunci: ${new Date(currentSnapshot.archivedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
                      : 'Belum diarsipkan tahun ini.'}
                  </p>
                </div>
              </div>
              <Button onClick={handleArchiveSensus} disabled={isArchiving} className="gap-2 text-white font-semibold" style={{ background: '#144f6b' }}>
                {isArchiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {currentSnapshot ? 'Kunci Ulang Sensus Tahun Ini' : 'Kunci & Arsipkan Sensus Tahun Ini'}
              </Button>
            </div>
            <p className="text-xs text-gray-400">
              Mengunci sensus akan menyimpan snapshot angka hari ini sebagai catatan resmi tahun {currentYear}, sehingga tahun depan bisa dibandingkan pertumbuhan/penurunannya secara nyata.
            </p>
          </Card>

          {!lastYearSnapshot ? (
            <Card className="p-8 text-center">
              <Archive className="w-8 h-8 mx-auto mb-2 text-gray-200" />
              <p className="text-sm text-gray-500">Belum ada arsip sensus tahun {currentYear - 1} untuk dibandingkan.</p>
              <p className="text-xs text-gray-400 mt-1">Kunci & arsipkan sensus tahun ini, lalu bandingkan lagi di tahun {currentYear + 1}.</p>
            </Card>
          ) : (
            <Card className="p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Perbandingan vs Sensus {lastYearSnapshot.year}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#144f6b] text-white">
                      <th className="px-3 py-2 text-left" style={{ fontSize: '11.5px', fontWeight: 600 }}>Indikator</th>
                      <th className="px-3 py-2 text-center" style={{ fontSize: '11.5px', fontWeight: 600 }}>{lastYearSnapshot.year}</th>
                      <th className="px-3 py-2 text-center" style={{ fontSize: '11.5px', fontWeight: 600 }}>{currentYear} (hari ini)</th>
                      <th className="px-3 py-2 text-center" style={{ fontSize: '11.5px', fontWeight: 600 }}>Perubahan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Total Jemaat', prev: lastYearSnapshot.totalMembers, cur: totalMembers },
                      { label: 'Total Kepala Keluarga', prev: lastYearSnapshot.totalFamilies, cur: totalFamilies },
                      { label: 'Laki-laki', prev: lastYearSnapshot.maleCount, cur: maleCount },
                      { label: 'Perempuan', prev: lastYearSnapshot.femaleCount, cur: femaleCount },
                      { label: 'Sudah Baptis', prev: lastYearSnapshot.baptismCount, cur: baptismData[0].value },
                      { label: 'Sudah Sidi', prev: lastYearSnapshot.sidiCount, cur: sidiData[0].value },
                      { label: 'Baptis Baru (tahun berjalan)', prev: lastYearSnapshot.baptismsThisYear, cur: baptismsThisYear },
                      { label: 'Sidi Baru (tahun berjalan)', prev: lastYearSnapshot.sidisThisYear, cur: sidisThisYear },
                      { label: 'Pernikahan (tahun berjalan)', prev: lastYearSnapshot.marriagesThisYear, cur: marriagesThisYear },
                    ].map((row, i) => (
                      <tr key={row.label} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 font-medium">{row.label}</td>
                        <td className="px-3 py-2 text-center text-gray-500">{formatNumber(row.prev)}</td>
                        <td className="px-3 py-2 text-center font-semibold">{formatNumber(row.cur)}</td>
                        <td className="px-3 py-2 text-center"><DeltaBadge current={row.cur} previous={row.prev} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {archivedYears.length > 0 && (
            <Card className="p-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">Riwayat arsip tersimpan</p>
              <div className="flex flex-wrap gap-2">
                {archivedYears.map(sn => (
                  <span key={sn.id} className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: '#e8ecf0', color: '#144f6b' }}>
                    Sensus {sn.year} · {formatNumber(sn.totalMembers)} jiwa
                  </span>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>

      </Tabs>
    </div>
  );
}
