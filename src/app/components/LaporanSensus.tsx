import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import {
  FileText, Download, Printer, Users, Home, Church, TrendingUp,
  Search, Filter, X, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle2, Loader2
} from 'lucide-react';
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
  fullName: 180, total: 110, laki: 100, perempuan: 100, keluarga: 100, aktif: 90, baptis: 90, sidi: 90,
};

export function LaporanSensus() {
  const { members, sectors, families } = useApp();
  const [activeTab, setActiveTab] = useState('sensus');
  // Laporan ini selalu menampilkan data per hari ini (bukan snapshot historis per tahun -
  // dropdown pilih tahun yang sebelumnya ada di sini cuma mengubah teks judul/nama file,
  // tidak benar-benar memfilter data, jadi berpotensi menyesatkan kalau dipakai sebagai arsip
  // resmi. Dihapus atas keputusan pemilik aplikasi.)
  const currentYear = new Date().getFullYear();

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

      y = (doc as any).lastAutoTable.finalY + 12;

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
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Total Jemaat', value: formatNumber(totalMembers), icon: Users, color: 'emerald' },
          { label: 'Total KK', value: formatNumber(totalFamilies), icon: Home, color: 'blue' },
          { label: 'Laki-laki', value: formatNumber(maleCount), icon: Users, color: 'indigo' },
          { label: 'Perempuan', value: formatNumber(femaleCount), icon: Users, color: 'pink' },
          { label: 'Jumlah Sektor', value: sectors.length, icon: Church, color: 'purple' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i} className={`p-4 bg-${stat.color}-50`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 text-${stat.color}-600`} />
                <p className="text-xs text-gray-600">{stat.label}</p>
              </div>
              <p className={`text-2xl font-bold text-${stat.color}-700`}>{stat.value}</p>
            </Card>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="sensus">Sensus Tahunan</TabsTrigger>
          <TabsTrigger value="comparison">Perbandingan Sektor</TabsTrigger>
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

      </Tabs>
    </div>
  );
}
