import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useDraggable } from '../../lib/useDraggable';
import type { ChurchAsset, BankAccount, Liability } from '../types';
import {
  FileText, Printer, Scale, Building2, Landmark, Wallet,
  TrendingUp, TrendingDown, BarChart3, Info, Download,
  FileSpreadsheet, ChevronDown, ArrowUpRight, ArrowDownRight,
  CheckCircle2, AlertCircle
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColResizeHandle } from './ui/resizable-th';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

const MONTH_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

// ── Row Types ──────────────────────────────────────────────────────────────────
type AsetTetapRow = { nama: string; nilai: number; akumDep: number; depPerTahun: number };
type BankRow = { nama: string; saldo: number };
type LiabilitasRow = { id: string; nama: string; nilai: number; kategori: string };

// Gunakan 0 jika fiscalYearSettings belum dikonfigurasi — admin harus isi via form
const ASET_NETO_AWAL_FALLBACK = 0;

// ── Sub-components ─────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={3} className="pt-4 pb-1">
        <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#144f6b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{children}</span>
      </td>
    </tr>
  );
}

function SubSection({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={3} className="pt-2 pb-0.5 pl-2">
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#374151', fontStyle: 'italic' }}>{children}</span>
      </td>
    </tr>
  );
}

function DataRow({ label, value, indent = 1, color = '#1e293b', note = '' }: {
  label: string; value: number; indent?: number; color?: string; note?: string;
}) {
  const pl = indent * 16;
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td style={{ paddingLeft: pl, paddingTop: 3, paddingBottom: 3, fontSize: '12px', color: '#374151' }}>{label}</td>
      <td style={{ fontSize: '11px', color: '#94a3b8', paddingRight: 8, textAlign: 'right', paddingTop: 3, paddingBottom: 3 }}>{note}</td>
      <td style={{ textAlign: 'right', fontSize: '12px', fontWeight: 500, color, paddingTop: 3, paddingBottom: 3, whiteSpace: 'nowrap', minWidth: 140 }}>
        {fmt(value)}
      </td>
    </tr>
  );
}

function SubTotalRow({ label, value, color = '#0f172a' }: { label: string; value: number; color?: string }) {
  return (
    <tr style={{ borderTop: '1px solid #e2e8f0' }}>
      <td colSpan={2} style={{ paddingLeft: 24, paddingTop: 4, paddingBottom: 4, fontSize: '12px', fontWeight: 600, color: '#374151' }}>{label}</td>
      <td style={{ textAlign: 'right', fontSize: '12px', fontWeight: 700, color, paddingTop: 4, paddingBottom: 4, whiteSpace: 'nowrap' }}>
        {fmt(value)}
      </td>
    </tr>
  );
}

function TotalRow({ label, value, color = '#0f172a', big = false }: {
  label: string; value: number; color?: string; big?: boolean;
}) {
  return (
    <tr style={{ borderTop: '2px solid #e8e4d8', background: big ? '#f0fdf4' : '#f8fafc' }}>
      <td colSpan={2} style={{ paddingLeft: 8, paddingTop: 6, paddingBottom: 6, fontSize: big ? '13px' : '12.5px', fontWeight: 700, color: '#0f172a' }}>{label}</td>
      <td style={{ textAlign: 'right', fontSize: big ? '14px' : '13px', fontWeight: 800, color, paddingTop: 6, paddingBottom: 6, whiteSpace: 'nowrap' }}>
        {fmt(value)}
      </td>
    </tr>
  );
}

function Spacer() {
  return <tr><td colSpan={3} style={{ height: 8 }} /></tr>;
}

// Lebar kolom default untuk tabel laporan keuangan on-screen (Keterangan | Catatan | Jumlah)
const FIN_STATEMENT_DEFAULT_WIDTHS: Record<string, number> = {
  keterangan: 340, catatan: 160, jumlah: 180,
};

// ── Laporan Posisi Keuangan ────────────────────────────────────────────────────
function LaporanPosisiKeuangan({ pettyCashBalance, asOfLabel, bankRows, asetTetapRows, liabilitasRows, netoTerikatSementara }: {
  pettyCashBalance: number; asOfLabel: string;
  bankRows: BankRow[]; asetTetapRows: AsetTetapRow[]; liabilitasRows: LiabilitasRow[];
  netoTerikatSementara: number;
}) {
  const { widths: colW, startResize } = useResizableColumns('laporan-posisi-keuangan', FIN_STATEMENT_DEFAULT_WIDTHS);
  const totalBank = bankRows.reduce((s, b) => s + b.saldo, 0);
  const totalLancar = totalBank + pettyCashBalance;
  const totalTetapBruto = asetTetapRows.reduce((s, a) => s + a.nilai, 0);
  const totalAkumDep = asetTetapRows.reduce((s, a) => s + a.akumDep, 0);
  const totalTetapBersih = totalTetapBruto - totalAkumDep;
  const totalAset = totalLancar + totalTetapBersih;
  const totalLiabilitas = liabilitasRows.reduce((s, l) => s + l.nilai, 0);
  const totalAsetNeto = totalAset - totalLiabilitas;

  // Pembagian aset neto
  const tanahRow = asetTetapRows.find(a => a.nama === 'Tanah Gereja');
  const gedungRow = asetTetapRows.find(a => a.nama === 'Gedung & Bangunan');
  const netoTerikatPermanen = (tanahRow?.nilai ?? 0) + ((gedungRow?.nilai ?? 0) - (gedungRow?.akumDep ?? 0));
  const netoTidakTerikat = totalAsetNeto - netoTerikatPermanen - netoTerikatSementara;

  const handleExportPdf = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 14;

      // Header Banner
      doc.setFillColor(13, 26, 45);
      doc.rect(0, 0, pageWidth, 26, 'F');
      doc.setFillColor(212, 175, 55);
      doc.rect(0, 26, pageWidth, 1.5, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('GEREJA PROTESTAN DI INDONESIA BAGIAN BARAT (GPIB)', pageWidth / 2, 9, { align: 'center' });

      doc.setFontSize(15);
      doc.setTextColor(223, 183, 116);
      doc.text('JEMAAT "TRINITAS"', pageWidth / 2, 16, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(203, 213, 225);
      doc.text('LAPORAN POSISI KEUANGAN (NERACA) · ISAK 35 (Entitas Nonlaba)', pageWidth / 2, 22, { align: 'center' });

      y = 34;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(`LAPORAN POSISI KEUANGAN`, 14, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Per Tanggal ${asOfLabel} · Standar Akuntansi Nonlaba Indonesia (ISAK 35)`, 14, y + 5);
      y += 10;

      // Table rows
      const tableData: (string[])[] = [
        ['ASET', '', ''],
        ['  Aset Lancar', '', ''],
        ...bankRows.map(b => [`    ${b.nama}`, 'Kas/Bank', fmt(b.saldo)]),
        ['    Kas Kecil (Petty Cash)', 'Kas Operasional', fmt(pettyCashBalance)],
        ['  Jumlah Aset Lancar', '', fmt(totalLancar)],
        ['  Aset Tidak Lancar (Tetap)', '', ''],
        ...asetTetapRows.map(a => [`    ${a.nama}`, 'Harga Perolehan', fmt(a.nilai)]),
        ['    Dikurangi: Akumulasi Penyusutan', 'Metode Garis Lurus', `(${fmt(totalAkumDep)})`],
        ['  Jumlah Aset Tidak Lancar – Bersih', '', fmt(totalTetapBersih)],
        ['JUMLAH ASET', '', fmt(totalAset)],
        ['', '', ''],
        ['LIABILITAS', '', ''],
        ['  Liabilitas Jangka Pendek', '', ''],
        ...liabilitasRows.map(l => [`    ${l.nama}`, l.kategori || 'Kewajiban', fmt(l.nilai)]),
        ['  Jumlah Liabilitas Jangka Pendek', '', fmt(totalLiabilitas)],
        ['JUMLAH LIABILITAS', '', fmt(totalLiabilitas)],
        ['', '', ''],
        ['ASET NETO', '', ''],
        ['    Tidak Terikat (Dana Bebas Operasional)', 'Operasional', fmt(netoTidakTerikat)],
        ['    Terikat Sementara (Dana Pembangunan / Program)', 'Temporer', fmt(netoTerikatSementara)],
        ['    Terikat Permanen (Tanah & Gedung Gereja)', 'Permanen', fmt(netoTerikatPermanen)],
        ['  Jumlah Aset Neto', '', fmt(totalAsetNeto)],
        ['JUMLAH LIABILITAS DAN ASET NETO', '', fmt(totalLiabilitas + totalAsetNeto)],
      ];

      autoTable(doc, {
        startY: y,
        head: [['Keterangan Akun', 'Catatan / Sifat Akun', 'Jumlah (Rp)']],
        body: tableData,
        theme: 'plain',
        headStyles: { fillColor: [13, 26, 45], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 100 },
          1: { cellWidth: 45, halign: 'center' },
          2: { cellWidth: 40, halign: 'right' },
        },
        didParseCell: (data) => {
          const rowText = (data.row.raw as string[])[0] || '';
          if (rowText === 'ASET' || rowText === 'LIABILITAS' || rowText === 'ASET NETO') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [13, 26, 45];
            data.cell.styles.fillColor = [241, 245, 249];
          } else if (rowText === 'JUMLAH ASET' || rowText === 'JUMLAH LIABILITAS' || rowText === 'JUMLAH LIABILITAS DAN ASET NETO') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [13, 26, 45];
            data.cell.styles.fillColor = [238, 246, 255];
          } else if (rowText.startsWith('  Jumlah')) {
            data.cell.styles.fontStyle = 'bold';
          }
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 8;

      if (y > 235) {
        doc.addPage();
        y = 25;
      }

      // Footnote
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text('* Laporan disusun sesuai standar ISAK 35 tentang Penyajian Laporan Keuangan Entitas Nonlaba.', 14, y);
      y += 6;

      // Signatures
      const signY = y + 2;
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      doc.text('Mengetahui / Mengesahkan,', 20, signY);
      doc.text('Bendahara Jemaat,', pageWidth - 70, signY);
      doc.setFont('helvetica', 'bold');
      doc.text('Ketua Majelis Jemaat', 20, signY + 4);
      doc.text('Bendahara I / II', pageWidth - 70, signY + 4);

      doc.text('( ............................................ )', 20, signY + 24);
      doc.text('( ............................................ )', pageWidth - 70, signY + 24);

      // Page numbers
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`GPIB Trinitas · Laporan Posisi Keuangan · Halaman ${p} dari ${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 7, { align: 'center' });
      }

      doc.save(`Laporan-Posisi-Keuangan-GPIB-Trinitas.pdf`);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html><head><title>Laporan Posisi Keuangan</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:11px;color:#111;margin:24px}
        h2{color:#1A77A3;margin:0 0 2px;font-size:15px}
        p.sub{color:#64748b;margin:0 0 16px;font-size:10px}
        table{width:100%;border-collapse:collapse;margin-bottom:14px}
        .sec{font-size:10px;font-weight:700;color:#1A77A3;text-transform:uppercase;letter-spacing:.05em;padding:8px 0 2px;border-bottom:1px solid #f0ede5}
        .sub-sec{font-size:10px;font-weight:600;color:#374151;font-style:italic;padding:4px 0 2px}
        .row td{padding:2px 4px;font-size:10px;color:#1e293b}
        .row td:last-child{text-align:right;font-weight:500}
        .subtotal td{padding:3px 4px;font-size:10px;font-weight:600;border-top:1px solid #e2e8f0}
        .subtotal td:last-child{text-align:right;font-weight:700}
        .total td{padding:5px 6px;font-size:11px;font-weight:800;border-top:2px solid #e8e4d8;background:#f6f4f0}
        .total td:last-child{text-align:right}
        .note{font-size:9px;color:#94a3b8;font-style:italic;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:8px}
      </style></head><body>
      <h2>GPIB TRINITAS</h2>
      <h3 style="margin:0 0 2px;font-size:12px">LAPORAN POSISI KEUANGAN</h3>
      <p class="sub">Per Tanggal ${asOfLabel} · Disusun berdasarkan ISAK 35 (Entitas Berorientasi Nonlaba)</p>
      <table>
        <tr><td colspan="2" class="sec">ASET</td></tr>
        <tr><td colspan="2" class="sub-sec">&nbsp;&nbsp;Aset Lancar</td></tr>
        ${bankRows.map(b=>`<tr class="row"><td style="padding-left:20px">${b.nama}</td><td>${fmt(b.saldo)}</td></tr>`).join('')}
        <tr class="row"><td style="padding-left:20px">Kas Kecil (Petty Cash)</td><td>${fmt(pettyCashBalance)}</td></tr>
        <tr class="subtotal"><td style="padding-left:20px">Jumlah Aset Lancar</td><td>${fmt(totalLancar)}</td></tr>
        <tr><td colspan="2" class="sub-sec">&nbsp;&nbsp;Aset Tidak Lancar (Tetap)</td></tr>
        ${asetTetapRows.map(a=>`<tr class="row"><td style="padding-left:20px">${a.nama}</td><td>${fmt(a.nilai)}</td></tr>`).join('')}
        <tr class="row"><td style="padding-left:20px">Dikurangi: Akumulasi Penyusutan</td><td>(${fmt(totalAkumDep)})</td></tr>
        <tr class="subtotal"><td style="padding-left:20px">Jumlah Aset Tidak Lancar – Bersih</td><td>${fmt(totalTetapBersih)}</td></tr>
        <tr class="total"><td>JUMLAH ASET</td><td>${fmt(totalAset)}</td></tr>
        <tr><td colspan="2" style="height:10px"></td></tr>
        <tr><td colspan="2" class="sec">LIABILITAS</td></tr>
        ${liabilitasRows.map(l=>`<tr class="row"><td style="padding-left:20px">${l.nama}</td><td>${fmt(l.nilai)}</td></tr>`).join('')}
        <tr class="subtotal"><td style="padding-left:20px">Jumlah Liabilitas</td><td>${fmt(totalLiabilitas)}</td></tr>
        <tr><td colspan="2" style="height:10px"></td></tr>
        <tr><td colspan="2" class="sec">ASET NETO</td></tr>
        <tr class="row"><td style="padding-left:20px">Tidak Terikat</td><td>${fmt(netoTidakTerikat)}</td></tr>
        <tr class="row"><td style="padding-left:20px">Terikat Sementara (Dana Pembangunan)</td><td>${fmt(netoTerikatSementara)}</td></tr>
        <tr class="row"><td style="padding-left:20px">Terikat Permanen (Tanah & Gedung)</td><td>${fmt(netoTerikatPermanen)}</td></tr>
        <tr class="subtotal"><td style="padding-left:20px">Jumlah Aset Neto</td><td>${fmt(totalAsetNeto)}</td></tr>
        <tr class="total"><td>JUMLAH LIABILITAS DAN ASET NETO</td><td>${fmt(totalLiabilitas + totalAsetNeto)}</td></tr>
      </table>
      <p class="note">* Laporan ini disusun sesuai ISAK 35 tentang Penyajian Laporan Keuangan Entitas Berorientasi Nonlaba.<br/>
      * Nilai aset tetap berdasarkan harga perolehan dikurangi akumulasi penyusutan.<br/>
      * Dicetak: ${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</p>
      </body></html>`);
    w.document.close(); w.print();
  };

  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b flex-wrap gap-3" style={{ background: 'linear-gradient(135deg,#0a1e2c,#0f2d41)', borderColor: '#1a3a22' }}>
        <div>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginBottom: 2 }}>ISAK 35 · Entitas Nonlaba</p>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'white', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Laporan Posisi Keuangan</h3>
          <p style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>Per Tanggal {asOfLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportPdf} className="flex items-center gap-2 px-3 py-2 rounded-xl text-white text-xs font-semibold transition-all hover:opacity-90 shadow-sm" style={{ background: '#caa049', color: '#0d1a2d' }}>
            <Download className="w-3.5 h-3.5" /> Ekspor PDF
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 rounded-xl text-white text-xs font-semibold transition-all hover:opacity-80" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <Printer className="w-3.5 h-3.5" /> Cetak
          </button>
        </div>
      </div>

      <div className="p-6 overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e8e4d8' }}>
              <th className="text-left" style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', paddingBottom: 4, width: colW.keterangan, position: 'relative' }}>
                Keterangan
                <ColResizeHandle onMouseDown={startResize('keterangan')} />
              </th>
              <th className="text-right" style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', paddingBottom: 4, paddingRight: 8, width: colW.catatan, position: 'relative' }}>
                Catatan
                <ColResizeHandle onMouseDown={startResize('catatan')} />
              </th>
              <th className="text-right" style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', paddingBottom: 4, width: colW.jumlah, position: 'relative' }}>
                Jumlah (Rp)
                <ColResizeHandle onMouseDown={startResize('jumlah')} />
              </th>
            </tr>
          </thead>
          <tbody>
            {/* ── ASET ── */}
            <SectionTitle>ASET</SectionTitle>
            <SubSection>Aset Lancar</SubSection>
            {bankRows.map((b, i) => <DataRow key={i} label={b.nama} value={b.saldo} indent={2} />)}
            <DataRow label="Kas Kecil (Petty Cash)" value={pettyCashBalance} indent={2} />
            <SubTotalRow label="Jumlah Aset Lancar" value={totalLancar} color="#1A77A3" />
            <Spacer />

            <SubSection>Aset Tidak Lancar (Tetap)</SubSection>
            {asetTetapRows.map((a, i) => <DataRow key={i} label={a.nama} value={a.nilai} indent={2} />)}
            <DataRow label="Dikurangi: Akumulasi Penyusutan" value={-totalAkumDep} indent={2} color="#ef4444" />
            <SubTotalRow label="Jumlah Aset Tidak Lancar – Bersih" value={totalTetapBersih} color="#1A77A3" />
            <Spacer />
            <TotalRow label="JUMLAH ASET" value={totalAset} color="#1A77A3" big />

            {/* ── LIABILITAS ── */}
            <Spacer /><Spacer />
            <SectionTitle>LIABILITAS</SectionTitle>
            <SubSection>Liabilitas Jangka Pendek</SubSection>
            {liabilitasRows.map((l, i) => <DataRow key={i} label={l.nama} value={l.nilai} indent={2} />)}
            <SubTotalRow label="Jumlah Liabilitas Jangka Pendek" value={totalLiabilitas} color="#ef4444" />
            <Spacer />
            <TotalRow label="JUMLAH LIABILITAS" value={totalLiabilitas} color="#dc2626" />

            {/* ── ASET NETO ── */}
            <Spacer /><Spacer />
            <SectionTitle>ASET NETO</SectionTitle>
            <DataRow label="Tidak Terikat" value={netoTidakTerikat} indent={2} color="#1A77A3" note="Dana operasional" />
            <DataRow label="Terikat Sementara (Dana Pembangunan)" value={netoTerikatSementara} indent={2} color="#9c9486" note="Terikat tujuan" />
            <DataRow label="Terikat Permanen (Tanah & Gedung Gereja)" value={netoTerikatPermanen} indent={2} color="#2563eb" note="Terikat permanen" />
            <SubTotalRow label="Jumlah Aset Neto" value={totalAsetNeto} color="#1A77A3" />
            <Spacer />
            <TotalRow label="JUMLAH LIABILITAS DAN ASET NETO" value={totalLiabilitas + totalAsetNeto} color="#1A77A3" big />
          </tbody>
        </table>

        {/* Footnote */}
        <div className="mt-6 p-3 rounded-xl flex gap-2" style={{ background: '#f6f4f0', border: '1px solid #b8d5e8' }}>
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#1A77A3' }} />
          <p style={{ fontSize: '11px', color: '#144f6b', lineHeight: 1.6 }}>
            Laporan ini disusun sesuai <strong>ISAK 35</strong> tentang Penyajian Laporan Keuangan Entitas Berorientasi Nonlaba yang berlaku di Indonesia.
            Nilai aset tetap berdasarkan harga perolehan dikurangi akumulasi penyusutan. Nilai aset tetap & liabilitas bersifat referensi — harap diperbarui oleh Bendahara sesuai kondisi aktual.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Laporan Aktivitas ──────────────────────────────────────────────────────────
function LaporanAktivitas({ records, periodeLabel, periodeType, asOfLabel, asetTetapRows, financialCategories, asetNetoAwal }: {
  records: any[]; periodeLabel: string; periodeType: 'tahunan' | 'bulanan'; asOfLabel: string;
  asetTetapRows: AsetTetapRow[];
  financialCategories: { name: string; reportGroup?: string | null }[];
  asetNetoAwal: number;
}) {
  const { widths: colW, startResize } = useResizableColumns('laporan-aktivitas', FIN_STATEMENT_DEFAULT_WIDTHS);
  const incRecs = records.filter((r: any) => r.type === 'income');
  const expRecs = records.filter((r: any) => r.type === 'expense');

  // Build category maps
  const incByCat: Record<string, number> = {};
  incRecs.forEach((r: any) => { incByCat[r.category] = (incByCat[r.category] || 0) + r.amount; });

  const expByCat: Record<string, number> = {};
  expRecs.forEach((r: any) => { expByCat[r.category] = (expByCat[r.category] || 0) + r.amount; });

  // Penerimaan: gunakan reportGroup dari financialCategories
  const catGroupMap = new Map(financialCategories.map(c => [c.name, c.reportGroup ?? null]));
  const penTidakTerikat = Object.entries(incByCat).filter(([cat]) => catGroupMap.get(cat) !== 'terikat');
  const penTerikat = Object.entries(incByCat).filter(([cat]) => catGroupMap.get(cat) === 'terikat');
  const totalPenTidakTerikat = penTidakTerikat.reduce((s, [, v]) => s + v, 0);
  const totalPenTerikat = penTerikat.reduce((s, [, v]) => s + v, 0);
  const totalPenerimaan = totalPenTidakTerikat + totalPenTerikat;

  // Beban per kelompok (dari reportGroup DB, bukan hardcoded string)
  const bebanProgramEntries = Object.entries(expByCat).filter(([cat]) => catGroupMap.get(cat) === 'program');
  const bebanAdminEntries = Object.entries(expByCat).filter(([cat]) => catGroupMap.get(cat) === 'admin');
  const bebanPemeliharaanEntries = Object.entries(expByCat).filter(([cat]) => catGroupMap.get(cat) === 'pemeliharaan');
  const bebanLainEntries = Object.entries(expByCat).filter(([cat]) => {
    const g = catGroupMap.get(cat);
    return g !== 'program' && g !== 'admin' && g !== 'pemeliharaan';
  });

  const depreciationAnnual = asetTetapRows.reduce((s, a) => s + a.depPerTahun, 0);
  const depreciationPeriod = periodeType === 'tahunan' ? depreciationAnnual : Math.round(depreciationAnnual / 12);

  const totalBebanProgram = bebanProgramEntries.reduce((s, [, v]) => s + v, 0);
  const totalBebanAdmin = bebanAdminEntries.reduce((s, [, v]) => s + v, 0);
  const totalBebanPemeliharaan = bebanPemeliharaanEntries.reduce((s, [, v]) => s + v, 0);
  const totalBebanLain = bebanLainEntries.reduce((s, [, v]) => s + v, 0);
  const totalBeban = totalBebanProgram + totalBebanAdmin + totalBebanPemeliharaan + totalBebanLain + depreciationPeriod;

  const surplusDefisit = totalPenerimaan - totalBeban;
  const isSurplus = surplusDefisit >= 0;

  const asetNetoAkhir = asetNetoAwal + surplusDefisit;

  const handleExportPdf = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 14;

      // Header Banner
      doc.setFillColor(13, 26, 45);
      doc.rect(0, 0, pageWidth, 26, 'F');
      doc.setFillColor(212, 175, 55);
      doc.rect(0, 26, pageWidth, 1.5, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('GEREJA PROTESTAN DI INDONESIA BAGIAN BARAT (GPIB)', pageWidth / 2, 9, { align: 'center' });

      doc.setFontSize(15);
      doc.setTextColor(223, 183, 116);
      doc.text('JEMAAT "TRINITAS"', pageWidth / 2, 16, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(203, 213, 225);
      doc.text('LAPORAN AKTIVITAS (SURPLUS / DEFISIT) · ISAK 35 (Entitas Nonlaba)', pageWidth / 2, 22, { align: 'center' });

      y = 34;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(`LAPORAN AKTIVITAS`, 14, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Untuk ${periodeType === 'tahunan' ? 'Tahun Yang Berakhir' : 'Periode'} ${asOfLabel} · Standar Akuntansi Nonlaba (ISAK 35)`, 14, y + 5);
      y += 10;

      const tableData: (string[])[] = [
        ['PENERIMAAN', '', ''],
        ['  Penerimaan Tidak Terikat', '', ''],
        ...penTidakTerikat.map(([cat, val]) => [`    ${cat}`, 'Penerimaan Operasional', fmt(val)]),
        ['  Jumlah Penerimaan Tidak Terikat', '', fmt(totalPenTidakTerikat)],
        ...(penTerikat.length > 0 ? [
          ['  Penerimaan Terikat Sementara (Temporer)', '', ''],
          ...penTerikat.map(([cat, val]) => [`    ${cat}`, 'Penerimaan Khusus', fmt(val)]),
          ['  Jumlah Penerimaan Terikat Sementara', '', fmt(totalPenTerikat)],
        ] : []),
        ['JUMLAH PENERIMAAN', '', fmt(totalPenerimaan)],
        ['', '', ''],
        ['BEBAN', '', ''],
        ['  Beban Program Pelayanan', '', ''],
        ...bebanProgramEntries.map(([cat, val]) => [`    ${cat}`, 'Pelayanan', fmt(val)]),
        ['  Jumlah Beban Program Pelayanan', '', fmt(totalBebanProgram)],
        ['  Beban Penunjang Administrasi & Umum', '', ''],
        ...bebanAdminEntries.map(([cat, val]) => [`    ${cat}`, 'Administrasi', fmt(val)]),
        ['  Jumlah Beban Administrasi & Umum', '', fmt(totalBebanAdmin)],
        ...(bebanPemeliharaanEntries.length > 0 ? [
          ['  Beban Pemeliharaan Aset', '', ''],
          ...bebanPemeliharaanEntries.map(([cat, val]) => [`    ${cat}`, 'Pemeliharaan', fmt(val)]),
          ['  Jumlah Beban Pemeliharaan', '', fmt(totalBebanPemeliharaan)],
        ] : []),
        ['  Beban Penyusutan Aset Tetap', 'Metode Garis Lurus', fmt(depreciationPeriod)],
        ['JUMLAH BEBAN', '', fmt(totalBeban)],
        ['', '', ''],
        ['KENAIKAN (PENURUNAN) ASET NETO BERSIH', isSurplus ? 'Surplus Operasional' : 'Defisit Operasional', `${isSurplus ? '+' : ''}${fmt(surplusDefisit)}`],
        ['', '', ''],
        ['ASET NETO AWAL PERIODE', 'Saldo Awal', fmt(asetNetoAwal)],
        ['Kenaikan (Penurunan) Aset Neto Periode Berjalan', 'Surplus/Defisit', `${isSurplus ? '+' : ''}${fmt(surplusDefisit)}`],
        ['ASET NETO AKHIR PERIODE', 'Saldo Akhir', fmt(asetNetoAkhir)],
      ];

      autoTable(doc, {
        startY: y,
        head: [['Keterangan Akun', 'Catatan Pos Laporan', 'Jumlah (Rp)']],
        body: tableData,
        theme: 'plain',
        headStyles: { fillColor: [13, 26, 45], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 100 },
          1: { cellWidth: 45, halign: 'center' },
          2: { cellWidth: 40, halign: 'right' },
        },
        didParseCell: (data) => {
          const rowText = (data.row.raw as string[])[0] || '';
          if (rowText === 'PENERIMAAN' || rowText === 'BEBAN' || rowText.startsWith('KENAIKAN (PENURUNAN)')) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [13, 26, 45];
            data.cell.styles.fillColor = [241, 245, 249];
          } else if (rowText === 'JUMLAH PENERIMAAN' || rowText === 'JUMLAH BEBAN' || rowText === 'ASET NETO AKHIR PERIODE') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [13, 26, 45];
            data.cell.styles.fillColor = [238, 246, 255];
          } else if (rowText.startsWith('  Jumlah')) {
            data.cell.styles.fontStyle = 'bold';
          }
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 8;

      if (y > 235) {
        doc.addPage();
        y = 25;
      }

      // Footnote & Signatures
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text('* Beban penyusutan dihitung berdasarkan metode garis lurus sesuai ISAK 35.', 14, y);
      y += 6;

      const signY = y + 2;
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      doc.text('Mengetahui / Mengesahkan,', 20, signY);
      doc.text('Bendahara Jemaat,', pageWidth - 70, signY);
      doc.setFont('helvetica', 'bold');
      doc.text('Ketua Majelis Jemaat', 20, signY + 4);
      doc.text('Bendahara I / II', pageWidth - 70, signY + 4);

      doc.text('( ............................................ )', 20, signY + 24);
      doc.text('( ............................................ )', pageWidth - 70, signY + 24);

      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`GPIB Trinitas · Laporan Aktivitas · Halaman ${p} dari ${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 7, { align: 'center' });
      }

      doc.save(`Laporan-Aktivitas-GPIB-Trinitas.pdf`);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Laporan Aktivitas</title>
      <style>body{font-family:Arial,sans-serif;font-size:11px;color:#111;margin:24px}
      h2{color:#1A77A3;margin:0 0 2px;font-size:15px}p.sub{color:#64748b;margin:0 0 16px;font-size:10px}
      table{width:100%;border-collapse:collapse;margin-bottom:14px}
      .sec{font-size:10px;font-weight:700;color:#1A77A3;text-transform:uppercase;letter-spacing:.05em;padding:8px 0 2px;border-bottom:1px solid #f0ede5}
      .sub{font-size:10px;font-weight:600;color:#374151;font-style:italic;padding:4px 0 2px}
      .row td{padding:2px 4px;font-size:10px}.row td:last-child{text-align:right;font-weight:500}
      .sub-total td{padding:3px 4px;font-size:10px;font-weight:600;border-top:1px solid #e2e8f0}
      .sub-total td:last-child{text-align:right;font-weight:700}
      .total td{padding:5px 6px;font-size:11px;font-weight:800;border-top:2px solid #e8e4d8;background:#f6f4f0}
      .total td:last-child{text-align:right}
      .surplus{color:#1A77A3}.defisit{color:#dc2626}</style></head><body>
      <h2>GPIB TRINITAS</h2>
      <h3 style="margin:0 0 2px;font-size:12px">LAPORAN AKTIVITAS</h3>
      <p class="sub">Untuk ${periodeType === 'tahunan' ? 'Tahun Yang Berakhir' : 'Periode'} ${asOfLabel}</p>
      <table>
        <tr><td colspan="2" class="sec">PENERIMAAN</td></tr>
        <tr><td colspan="2" class="sub">&nbsp;&nbsp;Tidak Terikat</td></tr>
        ${penTidakTerikat.map(([c,v])=>`<tr class="row"><td style="padding-left:20px">${c}</td><td>${fmt(v)}</td></tr>`).join('')}
        <tr class="sub-total"><td style="padding-left:20px">Jumlah Penerimaan Tidak Terikat</td><td>${fmt(totalPenTidakTerikat)}</td></tr>
        ${totalPenTerikat > 0 ? `
        <tr><td colspan="2" class="sub">&nbsp;&nbsp;Terikat Sementara</td></tr>
        ${penTerikat.map(([c,v])=>`<tr class="row"><td style="padding-left:20px">${c}</td><td>${fmt(v)}</td></tr>`).join('')}
        <tr class="sub-total"><td style="padding-left:20px">Jumlah Penerimaan Terikat Sementara</td><td>${fmt(totalPenTerikat)}</td></tr>` : ''}
        <tr class="total"><td>JUMLAH PENERIMAAN</td><td class="surplus">${fmt(totalPenerimaan)}</td></tr>
        <tr><td colspan="2" class="sec" style="padding-top:12px">BEBAN</td></tr>
        <tr><td colspan="2" class="sub">&nbsp;&nbsp;Beban Program Pelayanan</td></tr>
        ${bebanProgramEntries.map(([c,v])=>`<tr class="row"><td style="padding-left:20px">${c}</td><td>${fmt(v)}</td></tr>`).join('')}
        <tr class="sub-total"><td style="padding-left:20px">Jumlah Beban Program Pelayanan</td><td>${fmt(totalBebanProgram)}</td></tr>
        <tr><td colspan="2" class="sub">&nbsp;&nbsp;Beban Penunjang Administrasi &amp; Umum</td></tr>
        ${bebanAdminEntries.map(([c,v])=>`<tr class="row"><td style="padding-left:20px">${c}</td><td>${fmt(v)}</td></tr>`).join('')}
        <tr class="sub-total"><td style="padding-left:20px">Jumlah Beban Administrasi &amp; Umum</td><td>${fmt(totalBebanAdmin)}</td></tr>
        ${totalBebanPemeliharaan>0?`
        <tr><td colspan="2" class="sub">&nbsp;&nbsp;Beban Pemeliharaan Aset</td></tr>
        ${bebanPemeliharaanEntries.map(([c,v])=>`<tr class="row"><td style="padding-left:20px">${c}</td><td>${fmt(v)}</td></tr>`).join('')}
        <tr class="sub-total"><td style="padding-left:20px">Jumlah Beban Pemeliharaan</td><td>${fmt(totalBebanPemeliharaan)}</td></tr>`:''}
        ${totalBebanLain>0?`
        <tr><td colspan="2" class="sub">&nbsp;&nbsp;Beban Lain-lain</td></tr>
        ${bebanLainEntries.map(([c,v])=>`<tr class="row"><td style="padding-left:20px">${c}</td><td>${fmt(v)}</td></tr>`).join('')}
        <tr class="sub-total"><td style="padding-left:20px">Jumlah Beban Lain-lain</td><td>${fmt(totalBebanLain)}</td></tr>`:''}
        <tr><td colspan="2" class="sub">&nbsp;&nbsp;Beban Penyusutan</td></tr>
        <tr class="row"><td style="padding-left:20px">Penyusutan Aset Tetap (Gedung, Kendaraan, Peralatan)</td><td>${fmt(depreciationPeriod)}</td></tr>
        <tr class="sub-total"><td style="padding-left:20px">Jumlah Beban Penyusutan</td><td>${fmt(depreciationPeriod)}</td></tr>
        <tr class="total"><td>JUMLAH BEBAN</td><td class="defisit">${fmt(totalBeban)}</td></tr>
        <tr style="border-top:2px solid #144f6b"><td colspan="2" style="height:6px"></td></tr>
        <tr class="total" style="background:${isSurplus?'#f0fdf4':'#fef2f2'}">
          <td>KENAIKAN (PENURUNAN) ASET NETO BERSIH</td>
          <td class="${isSurplus?'surplus':'defisit'}">${isSurplus?'+':''}${fmt(surplusDefisit)}</td>
        </tr>
        <tr><td colspan="2" style="height:12px"></td></tr>
        <tr class="row"><td>Aset Neto Awal Periode</td><td>${fmt(asetNetoAwal)}</td></tr>
        <tr class="row"><td>Kenaikan (Penurunan) Aset Neto</td><td class="${isSurplus?'surplus':'defisit'}">${isSurplus?'+':''}${fmt(surplusDefisit)}</td></tr>
        <tr class="total"><td>ASET NETO AKHIR PERIODE</td><td class="surplus">${fmt(asetNetoAkhir)}</td></tr>
      </table>
      <p style="font-size:9px;color:#94a3b8;font-style:italic;margin-top:12px;border-top:1px solid #e2e8f0;padding-top:8px">
        * Beban penyusutan dihitung berdasarkan metode garis lurus (straight-line method).<br/>
        * Dicetak: ${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}
      </p></body></html>`);
    w.document.close(); w.print();
  };

  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
      <div className="flex items-center justify-between px-6 py-4 border-b flex-wrap gap-3" style={{ background: 'linear-gradient(135deg,#0a1e2c,#0f2d41)' }}>
        <div>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginBottom: 2 }}>ISAK 35 · Entitas Nonlaba</p>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'white', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Laporan Aktivitas</h3>
          <p style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>
            Untuk {periodeType === 'tahunan' ? 'Tahun Yang Berakhir' : 'Periode'} {asOfLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportPdf} className="flex items-center gap-2 px-3 py-2 rounded-xl text-white text-xs font-semibold transition-all hover:opacity-90 shadow-sm" style={{ background: '#caa049', color: '#0d1a2d' }}>
            <Download className="w-3.5 h-3.5" /> Ekspor PDF
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 rounded-xl text-white text-xs font-semibold transition-all hover:opacity-80" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <Printer className="w-3.5 h-3.5" /> Cetak
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-3 divide-x border-b" style={{ borderColor: '#e2e8f0' }}>
        {[
          { label: 'Jumlah Penerimaan', value: totalPenerimaan, color: '#1A77A3', bg: '#f0fdf4', icon: ArrowUpRight },
          { label: 'Jumlah Beban', value: totalBeban, color: '#dc2626', bg: '#fef2f2', icon: ArrowDownRight },
          { label: isSurplus ? 'Surplus Bersih' : 'Defisit Bersih', value: Math.abs(surplusDefisit), color: isSurplus ? '#1A77A3' : '#dc2626', bg: isSurplus ? '#f0fdf4' : '#fef2f2', icon: isSurplus ? TrendingUp : TrendingDown },
        ].map((k, i) => (
          <div key={i} className="px-3 py-2" style={{ background: k.bg }}>
            <p style={{ fontSize: '9px', color: k.color, fontWeight: 600, opacity: 0.75 }}>{k.label}</p>
            <p style={{ fontSize: '13px', fontWeight: 800, color: k.color, fontFamily: "'Plus Jakarta Sans',sans-serif", marginTop: 2 }}>{fmt(k.value)}</p>
          </div>
        ))}
      </div>

      <div className="p-6 overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e8e4d8' }}>
              <th className="text-left" style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', paddingBottom: 4, width: colW.keterangan, position: 'relative' }}>
                Keterangan
                <ColResizeHandle onMouseDown={startResize('keterangan')} />
              </th>
              <th className="text-right" style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', paddingBottom: 4, paddingRight: 8, width: colW.catatan, position: 'relative' }}>
                Catatan
                <ColResizeHandle onMouseDown={startResize('catatan')} />
              </th>
              <th className="text-right" style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', paddingBottom: 4, width: colW.jumlah, position: 'relative' }}>
                Jumlah (Rp)
                <ColResizeHandle onMouseDown={startResize('jumlah')} />
              </th>
            </tr>
          </thead>
          <tbody>
            {/* ── PENERIMAAN ── */}
            <SectionTitle>PENERIMAAN</SectionTitle>

            {penTidakTerikat.length > 0 && (
              <>
                <SubSection>Penerimaan Tidak Terikat</SubSection>
                {penTidakTerikat.map(([cat, val], i) => (
                  <DataRow key={i} label={cat} value={val} indent={2} color="#1A77A3" />
                ))}
                <SubTotalRow label="Jumlah Penerimaan Tidak Terikat" value={totalPenTidakTerikat} color="#1A77A3" />
              </>
            )}

            {penTerikat.length > 0 && (
              <>
                <Spacer />
                <SubSection>Penerimaan Terikat Sementara (Temporer)</SubSection>
                {penTerikat.map(([cat, val], i) => (
                  <DataRow key={i} label={cat} value={val} indent={2} color="#9c9486" />
                ))}
                <SubTotalRow label="Jumlah Penerimaan Terikat Sementara" value={totalPenTerikat} color="#9c9486" />
              </>
            )}

            <Spacer />
            <TotalRow label="JUMLAH PENERIMAAN" value={totalPenerimaan} color="#1A77A3" big />

            {/* ── BEBAN ── */}
            <Spacer /><Spacer />
            <SectionTitle>BEBAN</SectionTitle>

            {bebanProgramEntries.length > 0 && (
              <>
                <SubSection>Beban Program Pelayanan</SubSection>
                {bebanProgramEntries.map(([cat, val], i) => (
                  <DataRow key={i} label={cat} value={val} indent={2} color="#374151" />
                ))}
                <SubTotalRow label="Jumlah Beban Program Pelayanan" value={totalBebanProgram} color="#dc2626" />
                <Spacer />
              </>
            )}

            {bebanAdminEntries.length > 0 && (
              <>
                <SubSection>Beban Penunjang Administrasi & Umum</SubSection>
                {bebanAdminEntries.map(([cat, val], i) => (
                  <DataRow key={i} label={cat} value={val} indent={2} color="#374151" />
                ))}
                <SubTotalRow label="Jumlah Beban Administrasi & Umum" value={totalBebanAdmin} color="#dc2626" />
                <Spacer />
              </>
            )}

            {bebanPemeliharaanEntries.length > 0 && (
              <>
                <SubSection>Beban Pemeliharaan Aset</SubSection>
                {bebanPemeliharaanEntries.map(([cat, val], i) => (
                  <DataRow key={i} label={cat} value={val} indent={2} color="#374151" />
                ))}
                <SubTotalRow label="Jumlah Beban Pemeliharaan" value={totalBebanPemeliharaan} color="#dc2626" />
                <Spacer />
              </>
            )}

            {bebanLainEntries.length > 0 && (
              <>
                <SubSection>Beban Lain-lain</SubSection>
                {bebanLainEntries.map(([cat, val], i) => (
                  <DataRow key={i} label={cat} value={val} indent={2} color="#374151" />
                ))}
                <SubTotalRow label="Jumlah Beban Lain-lain" value={totalBebanLain} color="#dc2626" />
                <Spacer />
              </>
            )}

            <SubSection>Beban Penyusutan</SubSection>
            <DataRow label="Penyusutan Aset Tetap (Gedung, Kendaraan, Peralatan & Inventaris)" value={depreciationPeriod} indent={2} color="#374151" note="Garis lurus" />
            <SubTotalRow label="Jumlah Beban Penyusutan" value={depreciationPeriod} color="#dc2626" />

            <Spacer />
            <TotalRow label="JUMLAH BEBAN" value={totalBeban} color="#dc2626" big />

            {/* ── SURPLUS / DEFISIT ── */}
            <Spacer /><Spacer />
            <tr style={{ background: isSurplus ? '#f0f7fb' : '#fef2f2', borderTop: '2px solid #144f6b', borderBottom: '2px solid #144f6b' }}>
              <td colSpan={2} style={{ paddingLeft: 8, paddingTop: 8, paddingBottom: 8, fontSize: '13px', fontWeight: 800, color: isSurplus ? '#144f6b' : '#7f1d1d' }}>
                {isSurplus ? '↑ KENAIKAN' : '↓ PENURUNAN'} ASET NETO BERSIH
              </td>
              <td style={{ textAlign: 'right', fontSize: '15px', fontWeight: 900, color: isSurplus ? '#1A77A3' : '#dc2626', paddingTop: 8, paddingBottom: 8, whiteSpace: 'nowrap' }}>
                {isSurplus ? '+' : ''}{fmt(surplusDefisit)}
              </td>
            </tr>

            {/* ── REKONSILIASI ASET NETO ── */}
            <Spacer /><Spacer />
            <SectionTitle>REKONSILIASI ASET NETO</SectionTitle>
            <DataRow label="Aset Neto Awal Periode" value={asetNetoAwal} indent={1} />
            <DataRow label={isSurplus ? 'Kenaikan Aset Neto' : 'Penurunan Aset Neto'} value={surplusDefisit} indent={1} color={isSurplus ? '#1A77A3' : '#dc2626'} />
            <TotalRow label="ASET NETO AKHIR PERIODE" value={asetNetoAkhir} color="#1A77A3" big />
          </tbody>
        </table>

        <div className="mt-4 p-3 rounded-xl flex gap-2" style={{ background: '#f6f4f0', border: '1px solid #e8e4d8' }}>
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#9c9486' }} />
          <p style={{ fontSize: '11px', color: '#144f6b', lineHeight: 1.6 }}>
            Beban penyusutan dihitung menggunakan <strong>metode garis lurus (straight-line)</strong>. 
            Penerimaan terikat sementara adalah dana yang penggunaannya dibatasi untuk tujuan tertentu (pembangunan gedung).
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Laporan Arus Kas ──────────────────────────────────────────────────────────
function LaporanArusKas({ records, periodeLabel, periodeType, asOfLabel, pettyCashBalance, bankRows, investasiPeralatanAnnual, investasiGedungAnnual, onEditInvestasi }: {
  records: any[]; periodeLabel: string; periodeType: 'tahunan' | 'bulanan'; asOfLabel: string; pettyCashBalance: number;
  bankRows: BankRow[];
  investasiPeralatanAnnual: number;
  investasiGedungAnnual: number;
  onEditInvestasi: (type: 'peralatan' | 'gedung') => void;
}) {
  const { widths: colW, startResize } = useResizableColumns('laporan-arus-kas', FIN_STATEMENT_DEFAULT_WIDTHS);
  const incRecs = records.filter((r: any) => r.type === 'income');
  const expRecs = records.filter((r: any) => r.type === 'expense');

  const totalPenerimaan = incRecs.reduce((s: number, r: any) => s + r.amount, 0);
  const totalBebanKas   = expRecs.reduce((s: number, r: any) => s + r.amount, 0); // non-cash (depr) excluded

  // Kategorisasi penerimaan kas operasi
  const penFromJemaat = incRecs
    .filter((r: any) => ['Persembahan Minggu','Persepuluhan','Persembahan Syukur','Persembahan Khusus'].includes(r.category))
    .reduce((s: number, r: any) => s + r.amount, 0);
  const penDonasi = incRecs
    .filter((r: any) => ['Hibah & Donasi'].includes(r.category))
    .reduce((s: number, r: any) => s + r.amount, 0);
  const penSewa = incRecs
    .filter((r: any) => ['Sewa Fasilitas'].includes(r.category))
    .reduce((s: number, r: any) => s + r.amount, 0);
  const penLain = incRecs
    .filter((r: any) => !['Persembahan Minggu','Persepuluhan','Persembahan Syukur','Persembahan Khusus','Hibah & Donasi','Sewa Fasilitas','Dana Pembangunan'].includes(r.category))
    .reduce((s: number, r: any) => s + r.amount, 0);

  const danaPembangunan = incRecs
    .filter((r: any) => r.category === 'Dana Pembangunan')
    .reduce((s: number, r: any) => s + r.amount, 0);

  // Pembayaran kas operasi (direct method)
  const bayarGaji = expRecs
    .filter((r: any) => ['Gaji & Tunjangan','Gaji Pelayan'].includes(r.category))
    .reduce((s: number, r: any) => s + r.amount, 0);
  const bayarOperasional = expRecs
    .filter((r: any) => ['Operasional Gedung','Listrik & Air','Komunikasi'].includes(r.category))
    .reduce((s: number, r: any) => s + r.amount, 0);
  const bayarPelayanan = expRecs
    .filter((r: any) => ['Pelayanan & Diakonia','Kegiatan Kategorial','Pelayanan Sosial','Perlengkapan Ibadah'].includes(r.category))
    .reduce((s: number, r: any) => s + r.amount, 0);
  const bayarATK = expRecs
    .filter((r: any) => ['ATK & Perlengkapan'].includes(r.category))
    .reduce((s: number, r: any) => s + r.amount, 0);
  const bayarPemeliharaan = expRecs
    .filter((r: any) => ['Pemeliharaan Aset','Pemeliharaan Gedung'].includes(r.category))
    .reduce((s: number, r: any) => s + r.amount, 0);
  const bayarLain = expRecs
    .filter((r: any) => !['Gaji & Tunjangan','Gaji Pelayan','Operasional Gedung','Listrik & Air','Komunikasi','Pelayanan & Diakonia','Kegiatan Kategorial','Pelayanan Sosial','Perlengkapan Ibadah','ATK & Perlengkapan','Pemeliharaan Aset','Pemeliharaan Gedung'].includes(r.category))
    .reduce((s: number, r: any) => s + r.amount, 0);

  const totalPenOperasi = penFromJemaat + penDonasi + penSewa + penLain;
  const totalBayarOperasi = bayarGaji + bayarOperasional + bayarPelayanan + bayarATK + bayarPemeliharaan + bayarLain;
  const kasOperasi = totalPenOperasi - totalBayarOperasi;

  // Investasi — dari fiscalYearSettings (dapat diedit admin)
  const beliPeralatan = periodeType === 'tahunan' ? -investasiPeralatanAnnual : -Math.round(investasiPeralatanAnnual / 12);
  const renovasiGedung = periodeType === 'tahunan' ? -investasiGedungAnnual : -Math.round(investasiGedungAnnual / 12);
  const kasInvestasi = beliPeralatan + renovasiGedung;

  // Pendanaan
  const kasPendanaan = danaPembangunan; // penerimaan dana terikat

  const kenaikananKas = kasOperasi + kasInvestasi + kasPendanaan;
  const totalBank = bankRows.reduce((s, b) => s + b.saldo, 0);
  const kasAkhir = totalBank + pettyCashBalance;
  const kasAwal = kasAkhir - kenaikananKas;

  type CashRow = { label: string; value: number; indent?: number; isSub?: boolean; isTotal?: boolean };

  function CashStatRow({ row, onEdit }: { row: CashRow; onEdit?: () => void }) {
    const pl = (row.indent ?? 0) * 16 + 8;
    if (row.isTotal) {
      return (
        <tr style={{ background: row.value >= 0 ? '#f0fdf4' : '#fef2f2', borderTop: '2px solid #e8e4d8' }}>
          <td style={{ paddingLeft: pl, paddingTop: 6, paddingBottom: 6, fontSize: '12.5px', fontWeight: 800, color: '#0f172a' }}>{row.label}</td>
          <td style={{ textAlign: 'right', fontSize: '13px', fontWeight: 900, color: row.value >= 0 ? '#1A77A3' : '#dc2626', paddingTop: 6, paddingBottom: 6, whiteSpace: 'nowrap' }}>
            {row.value >= 0 ? '+' : ''}{fmt(row.value)}
          </td>
        </tr>
      );
    }
    if (row.isSub) {
      return (
        <tr style={{ borderTop: '1px solid #e2e8f0' }}>
          <td style={{ paddingLeft: pl, paddingTop: 4, paddingBottom: 4, fontSize: '12px', fontWeight: 700, color: '#374151' }}>{row.label}</td>
          <td style={{ textAlign: 'right', fontSize: '12px', fontWeight: 700, color: row.value >= 0 ? '#1A77A3' : '#dc2626', paddingTop: 4, paddingBottom: 4, whiteSpace: 'nowrap' }}>
            {row.value >= 0 ? '+' : ''}{fmt(row.value)}
          </td>
        </tr>
      );
    }
    return (
      <tr className="hover:bg-gray-50 transition-colors">
        <td style={{ paddingLeft: pl, paddingTop: 3, paddingBottom: 3, fontSize: '12px', color: '#374151' }}>{row.label}</td>
        <td style={{ textAlign: 'right', fontSize: '12px', fontWeight: 500, color: row.value >= 0 ? '#1e293b' : '#dc2626', paddingTop: 3, paddingBottom: 3, whiteSpace: 'nowrap' }}>
          {row.value >= 0 ? '' : '('}{fmt(Math.abs(row.value))}{row.value < 0 ? ')' : ''}
          {onEdit && <button onClick={onEdit} title="Edit nilai" style={{ fontSize: '10px', color: '#94a3b8', marginLeft: 4 }} className="hover:text-[#1A77A3] transition-colors">✎</button>}
        </td>
      </tr>
    );
  }

  const handleExportPdf = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 14;

      // Header Banner
      doc.setFillColor(13, 26, 45);
      doc.rect(0, 0, pageWidth, 26, 'F');
      doc.setFillColor(212, 175, 55);
      doc.rect(0, 26, pageWidth, 1.5, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('GEREJA PROTESTAN DI INDONESIA BAGIAN BARAT (GPIB)', pageWidth / 2, 9, { align: 'center' });

      doc.setFontSize(15);
      doc.setTextColor(223, 183, 116);
      doc.text('JEMAAT "TRINITAS"', pageWidth / 2, 16, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(203, 213, 225);
      doc.text('LAPORAN ARUS KAS (METODE LANGSUNG) · ISAK 35 (Entitas Nonlaba)', pageWidth / 2, 22, { align: 'center' });

      y = 34;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(`LAPORAN ARUS KAS`, 14, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Untuk ${periodeType === 'tahunan' ? 'Tahun Yang Berakhir' : 'Periode'} ${asOfLabel} · Standar Akuntansi Nonlaba (ISAK 35)`, 14, y + 5);
      y += 10;

      const tableData: (string[])[] = [
        ['I. AKTIVITAS OPERASI', '', ''],
        ['  Penerimaan Kas dari Jemaat & Donasi', '', ''],
        ...(penFromJemaat > 0 ? [['    Penerimaan dari Jemaat (Persembahan & Persepuluhan)', 'Penerimaan Rutin', fmt(penFromJemaat)]] : []),
        ...(penDonasi > 0 ? [['    Penerimaan dari Donatur & Hibah', 'Donasi/Hibah', fmt(penDonasi)]] : []),
        ...(penSewa > 0 ? [['    Penerimaan Sewa Fasilitas Gereja', 'Sewa', fmt(penSewa)]] : []),
        ...(penLain > 0 ? [['    Penerimaan Lain-lain', 'Lain-lain', fmt(penLain)]] : []),
        ['  Pembayaran Kas Operasional', '', ''],
        ...(bayarGaji > 0 ? [['    Pembayaran Gaji, Honorarium & Tunjangan', 'Beban Pegawai', `(${fmt(bayarGaji)})`]] : []),
        ...(bayarOperasional > 0 ? [['    Pembayaran Beban Operasional Gedung', 'Operasional', `(${fmt(bayarOperasional)})`]] : []),
        ...(bayarPelayanan > 0 ? [['    Pembayaran Beban Pelayanan & Diakonia', 'Program Pelayanan', `(${fmt(bayarPelayanan)})`]] : []),
        ...(bayarATK > 0 ? [['    Pembayaran ATK & Perlengkapan Kantor', 'Kantor & ATK', `(${fmt(bayarATK)})`]] : []),
        ...(bayarPemeliharaan > 0 ? [['    Pembayaran Pemeliharaan Aset', 'Pemeliharaan', `(${fmt(bayarPemeliharaan)})`]] : []),
        ...(bayarLain > 0 ? [['    Pembayaran Beban Lainnya', 'Lain-lain', `(${fmt(bayarLain)})`]] : []),
        ['KAS BERSIH DARI AKTIVITAS OPERASI', '', `${kasOperasi >= 0 ? '+' : ''}${fmt(kasOperasi)}`],
        ['', '', ''],
        ['II. AKTIVITAS INVESTASI', '', ''],
        ['    Pembelian Peralatan & Inventaris Gereja', 'Investasi Aset', `(${fmt(Math.abs(beliPeralatan))})`],
        ['    Renovasi & Pemeliharaan Gedung', 'Investasi Bangunan', `(${fmt(Math.abs(renovasiGedung))})`],
        ['KAS BERSIH DARI AKTIVITAS INVESTASI', '', `${kasInvestasi >= 0 ? '+' : ''}${fmt(kasInvestasi)}`],
        ['', '', ''],
        ['III. AKTIVITAS PENDANAAN', '', ''],
        ['    Penerimaan Dana Terikat (Dana Pembangunan)', 'Dana Terikat', fmt(danaPembangunan)],
        ['KAS BERSIH DARI AKTIVITAS PENDANAAN', '', `${kasPendanaan >= 0 ? '+' : ''}${fmt(kasPendanaan)}`],
        ['', '', ''],
        ['KENAIKAN (PENURUNAN) BERSIH KAS', 'Total Arus Kas', `${kenaikananKas >= 0 ? '+' : ''}${fmt(kenaikananKas)}`],
        ['Kas dan Setara Kas pada Awal Periode', 'Saldo Awal', fmt(kasAwal)],
        ['KAS DAN SETARA KAS PADA AKHIR PERIODE', 'Saldo Akhir', fmt(kasAkhir)],
      ];

      autoTable(doc, {
        startY: y,
        head: [['Arus Kas Masuk / (Keluar)', 'Kategori / Keterangan', 'Jumlah (Rp)']],
        body: tableData,
        theme: 'plain',
        headStyles: { fillColor: [13, 26, 45], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 100 },
          1: { cellWidth: 45, halign: 'center' },
          2: { cellWidth: 40, halign: 'right' },
        },
        didParseCell: (data) => {
          const rowText = (data.row.raw as string[])[0] || '';
          if (rowText.startsWith('I. ') || rowText.startsWith('II. ') || rowText.startsWith('III. ')) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [13, 26, 45];
            data.cell.styles.fillColor = [241, 245, 249];
          } else if (rowText.startsWith('KAS BERSIH') || rowText.startsWith('KENAIKAN') || rowText.startsWith('KAS DAN SETARA KAS PADA AKHIR')) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [13, 26, 45];
            data.cell.styles.fillColor = [238, 246, 255];
          } else if (rowText.startsWith('  Penerimaan') || rowText.startsWith('  Pembayaran')) {
            data.cell.styles.fontStyle = 'bold';
          }
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 8;

      if (y > 235) {
        doc.addPage();
        y = 25;
      }

      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text('* Laporan Arus Kas disajikan menggunakan metode langsung (direct method) sesuai standar ISAK 35.', 14, y);
      y += 6;

      const signY = y + 2;
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      doc.text('Mengetahui / Mengesahkan,', 20, signY);
      doc.text('Bendahara Jemaat,', pageWidth - 70, signY);
      doc.setFont('helvetica', 'bold');
      doc.text('Ketua Majelis Jemaat', 20, signY + 4);
      doc.text('Bendahara I / II', pageWidth - 70, signY + 4);

      doc.text('( ............................................ )', 20, signY + 24);
      doc.text('( ............................................ )', pageWidth - 70, signY + 24);

      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`GPIB Trinitas · Laporan Arus Kas · Halaman ${p} dari ${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 7, { align: 'center' });
      }

      doc.save(`Laporan-Arus-Kas-GPIB-Trinitas.pdf`);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Laporan Arus Kas</title>
      <style>body{font-family:Arial,sans-serif;font-size:11px;color:#111;margin:24px}
      h2{color:#1A77A3;margin:0 0 2px;font-size:15px}p.sub{color:#64748b;margin:0 0 16px;font-size:10px}
      table{width:100%;border-collapse:collapse}tr td{padding:3px 6px}
      .sec{font-size:10px;font-weight:700;color:#1A77A3;text-transform:uppercase;border-bottom:1px solid #f0ede5;padding-top:10px}
      .sub-total{font-weight:700;border-top:1px solid #e2e8f0;color:#1A77A3}
      .total{font-weight:800;font-size:11px;border-top:2px solid #e8e4d8;background:#f6f4f0}
      .neg{color:#dc2626}.pos{color:#1A77A3}</style></head><body>
      <h2>GPIB TRINITAS</h2>
      <h3 style="margin:0 0 2px;font-size:12px">LAPORAN ARUS KAS (METODE LANGSUNG)</h3>
      <p class="sub">Untuk ${periodeType === 'tahunan' ? 'Tahun Yang Berakhir' : 'Periode'} ${asOfLabel}</p>
      <table>
        <tr><td colspan="2" class="sec">I. AKTIVITAS OPERASI</td></tr>
        <tr><td colspan="2" style="font-size:10px;font-style:italic;color:#64748b;padding-top:4px">&nbsp;&nbsp;PENERIMAAN KAS</td></tr>
        ${penFromJemaat>0?`<tr><td style="padding-left:20px">Penerimaan dari Jemaat (Persembahan & Persepuluhan)</td><td style="text-align:right" class="pos">${fmt(penFromJemaat)}</td></tr>`:''}
        ${penDonasi>0?`<tr><td style="padding-left:20px">Penerimaan dari Donatur & Hibah</td><td style="text-align:right" class="pos">${fmt(penDonasi)}</td></tr>`:''}
        ${penSewa>0?`<tr><td style="padding-left:20px">Penerimaan Sewa Fasilitas Gereja</td><td style="text-align:right" class="pos">${fmt(penSewa)}</td></tr>`:''}
        ${penLain>0?`<tr><td style="padding-left:20px">Penerimaan Lain-lain</td><td style="text-align:right" class="pos">${fmt(penLain)}</td></tr>`:''}
        <tr><td colspan="2" style="font-size:10px;font-style:italic;color:#64748b;padding-top:6px">&nbsp;&nbsp;PEMBAYARAN KAS</td></tr>
        ${bayarGaji>0?`<tr><td style="padding-left:20px">Pembayaran Gaji, Honorarium & Tunjangan</td><td style="text-align:right" class="neg">(${fmt(bayarGaji)})</td></tr>`:''}
        ${bayarOperasional>0?`<tr><td style="padding-left:20px">Pembayaran Beban Operasional Gedung</td><td style="text-align:right" class="neg">(${fmt(bayarOperasional)})</td></tr>`:''}
        ${bayarPelayanan>0?`<tr><td style="padding-left:20px">Pembayaran Beban Pelayanan & Diakonia</td><td style="text-align:right" class="neg">(${fmt(bayarPelayanan)})</td></tr>`:''}
        ${bayarATK>0?`<tr><td style="padding-left:20px">Pembayaran ATK & Perlengkapan Kantor</td><td style="text-align:right" class="neg">(${fmt(bayarATK)})</td></tr>`:''}
        ${bayarPemeliharaan>0?`<tr><td style="padding-left:20px">Pembayaran Pemeliharaan Aset</td><td style="text-align:right" class="neg">(${fmt(bayarPemeliharaan)})</td></tr>`:''}
        ${bayarLain>0?`<tr><td style="padding-left:20px">Pembayaran Beban Lainnya</td><td style="text-align:right" class="neg">(${fmt(bayarLain)})</td></tr>`:''}
        <tr class="sub-total"><td style="padding-left:8px">KAS BERSIH DARI AKTIVITAS OPERASI</td><td style="text-align:right" class="${kasOperasi>=0?'pos':'neg'}">${kasOperasi>=0?'+':''}${fmt(kasOperasi)}</td></tr>
        <tr><td colspan="2" class="sec">II. AKTIVITAS INVESTASI</td></tr>
        <tr><td style="padding-left:20px">Pembelian Peralatan & Perlengkapan</td><td style="text-align:right" class="neg">(${fmt(Math.abs(beliPeralatan))})</td></tr>
        <tr><td style="padding-left:20px">Renovasi & Pemeliharaan Besar Gedung</td><td style="text-align:right" class="neg">(${fmt(Math.abs(renovasiGedung))})</td></tr>
        <tr class="sub-total"><td style="padding-left:8px">KAS BERSIH DARI AKTIVITAS INVESTASI</td><td style="text-align:right" class="${kasInvestasi>=0?'pos':'neg'}">${kasInvestasi>=0?'+':''}${fmt(kasInvestasi)}</td></tr>
        <tr><td colspan="2" class="sec">III. AKTIVITAS PENDANAAN</td></tr>
        <tr><td style="padding-left:20px">Penerimaan Dana Terikat (Dana Pembangunan)</td><td style="text-align:right" class="pos">${fmt(danaPembangunan)}</td></tr>
        <tr class="sub-total"><td style="padding-left:8px">KAS BERSIH DARI AKTIVITAS PENDANAAN</td><td style="text-align:right" class="${kasPendanaan>=0?'pos':'neg'}">${kasPendanaan>=0?'+':''}${fmt(kasPendanaan)}</td></tr>
        <tr><td colspan="2" style="height:10px"></td></tr>
        <tr class="total"><td>KENAIKAN (PENURUNAN) BERSIH KAS</td><td style="text-align:right" class="${kenaikananKas>=0?'pos':'neg'}">${kenaikananKas>=0?'+':''}${fmt(kenaikananKas)}</td></tr>
        <tr><td style="padding-left:8px">Kas dan Setara Kas Awal Periode</td><td style="text-align:right">${fmt(kasAwal)}</td></tr>
        <tr class="total" style="background:#f0f7fb"><td>KAS DAN SETARA KAS AKHIR PERIODE</td><td style="text-align:right" class="pos">${fmt(kasAkhir)}</td></tr>
      </table>
      <p style="font-size:9px;color:#94a3b8;margin-top:12px;border-top:1px solid #e2e8f0;padding-top:8px">
        * Laporan Arus Kas disajikan menggunakan metode langsung (direct method) sesuai ISAK 35.<br/>
        * Kas dan setara kas mencakup kas di bank dan kas kecil yang dimiliki gereja.<br/>
        * Dicetak: ${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}
      </p></body></html>`);
    w.document.close(); w.print();
  };

  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
      <div className="flex items-center justify-between px-6 py-4 border-b flex-wrap gap-3" style={{ background: 'linear-gradient(135deg,#0a1e2c,#0f2d41)' }}>
        <div>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginBottom: 2 }}>ISAK 35 · Metode Langsung</p>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'white', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Laporan Arus Kas</h3>
          <p style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>
            Untuk {periodeType === 'tahunan' ? 'Tahun Yang Berakhir' : 'Periode'} {asOfLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportPdf} className="flex items-center gap-2 px-3 py-2 rounded-xl text-white text-xs font-semibold transition-all hover:opacity-90 shadow-sm" style={{ background: '#caa049', color: '#0d1a2d' }}>
            <Download className="w-3.5 h-3.5" /> Ekspor PDF
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 rounded-xl text-white text-xs font-semibold transition-all hover:opacity-80" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <Printer className="w-3.5 h-3.5" /> Cetak
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x border-b" style={{ borderColor: '#e2e8f0' }}>
        {[
          { label: 'Kas dari Operasi', value: kasOperasi, color: kasOperasi >= 0 ? '#1A77A3' : '#dc2626', bg: kasOperasi >= 0 ? '#f0fdf4' : '#fef2f2' },
          { label: 'Kas dari Investasi', value: kasInvestasi, color: '#dc2626', bg: '#fef2f2' },
          { label: 'Kas dari Pendanaan', value: kasPendanaan, color: '#9c9486', bg: '#f6f4f0' },
          { label: 'Kenaikan Bersih Kas', value: kenaikananKas, color: kenaikananKas >= 0 ? '#1A77A3' : '#dc2626', bg: kenaikananKas >= 0 ? '#f0fdf4' : '#fef2f2' },
        ].map((k, i) => (
          <div key={i} className="px-3 py-2" style={{ background: k.bg }}>
            <p style={{ fontSize: '9px', color: k.color, fontWeight: 600, opacity: 0.75 }}>{k.label}</p>
            <p style={{ fontSize: '11px', fontWeight: 800, color: k.color, marginTop: 2 }}>{k.value >= 0 ? '+' : ''}{fmt(k.value)}</p>
          </div>
        ))}
      </div>

      <div className="p-6 overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e8e4d8' }}>
              <th className="text-left" style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', paddingBottom: 4, width: colW.keterangan, position: 'relative' }}>
                Keterangan
                <ColResizeHandle onMouseDown={startResize('keterangan')} />
              </th>
              <th className="text-right" style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', paddingBottom: 4, paddingRight: 8, width: colW.catatan, position: 'relative' }}>
                Catatan
                <ColResizeHandle onMouseDown={startResize('catatan')} />
              </th>
              <th className="text-right" style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', paddingBottom: 4, width: colW.jumlah, position: 'relative' }}>
                Jumlah (Rp)
                <ColResizeHandle onMouseDown={startResize('jumlah')} />
              </th>
            </tr>
          </thead>
          <tbody>
            {/* ── I. AKTIVITAS OPERASI ── */}
            <SectionTitle>I. Aktivitas Operasi</SectionTitle>
            <SubSection>Penerimaan Kas</SubSection>
            {penFromJemaat > 0 && <CashStatRow row={{ label: 'Penerimaan dari Jemaat (Persembahan & Persepuluhan)', value: penFromJemaat, indent: 2 }} />}
            {penDonasi > 0 && <CashStatRow row={{ label: 'Penerimaan dari Donatur & Hibah', value: penDonasi, indent: 2 }} />}
            {penSewa > 0 && <CashStatRow row={{ label: 'Penerimaan Sewa Fasilitas Gereja', value: penSewa, indent: 2 }} />}
            {penLain > 0 && <CashStatRow row={{ label: 'Penerimaan Lain-lain', value: penLain, indent: 2 }} />}

            <SubSection>Pembayaran Kas</SubSection>
            {bayarGaji > 0 && <CashStatRow row={{ label: 'Pembayaran Gaji, Honorarium & Tunjangan', value: -bayarGaji, indent: 2 }} />}
            {bayarOperasional > 0 && <CashStatRow row={{ label: 'Pembayaran Beban Operasional Gedung', value: -bayarOperasional, indent: 2 }} />}
            {bayarPelayanan > 0 && <CashStatRow row={{ label: 'Pembayaran Beban Pelayanan & Diakonia', value: -bayarPelayanan, indent: 2 }} />}
            {bayarATK > 0 && <CashStatRow row={{ label: 'Pembayaran ATK & Perlengkapan Kantor', value: -bayarATK, indent: 2 }} />}
            {bayarPemeliharaan > 0 && <CashStatRow row={{ label: 'Pembayaran Pemeliharaan & Perbaikan Aset', value: -bayarPemeliharaan, indent: 2 }} />}
            {bayarLain > 0 && <CashStatRow row={{ label: 'Pembayaran Beban Lainnya', value: -bayarLain, indent: 2 }} />}
            <CashStatRow row={{ label: 'KAS BERSIH DARI AKTIVITAS OPERASI', value: kasOperasi, isSub: true }} />

            {/* ── II. AKTIVITAS INVESTASI ── */}
            <Spacer />
            <SectionTitle>II. Aktivitas Investasi</SectionTitle>
            <CashStatRow row={{ label: 'Pembelian Peralatan, Inventaris & Teknologi', value: beliPeralatan, indent: 1 }} onEdit={() => onEditInvestasi('peralatan')} />
            <CashStatRow row={{ label: 'Renovasi & Pemeliharaan Besar Gedung Gereja', value: renovasiGedung, indent: 1 }} onEdit={() => onEditInvestasi('gedung')} />
            <CashStatRow row={{ label: 'KAS BERSIH DARI AKTIVITAS INVESTASI', value: kasInvestasi, isSub: true }} />

            {/* ── III. AKTIVITAS PENDANAAN ── */}
            <Spacer />
            <SectionTitle>III. Aktivitas Pendanaan</SectionTitle>
            <CashStatRow row={{ label: 'Penerimaan Dana Terikat – Dana Pembangunan Gedung', value: danaPembangunan, indent: 1 }} />
            <CashStatRow row={{ label: 'KAS BERSIH DARI AKTIVITAS PENDANAAN', value: kasPendanaan, isSub: true }} />

            {/* ── SALDO KAS ── */}
            <Spacer /><Spacer />
            <CashStatRow row={{ label: 'KENAIKAN (PENURUNAN) BERSIH KAS DAN SETARA KAS', value: kenaikananKas, isTotal: true }} />
            <DataRow label="Kas dan Setara Kas Awal Periode" value={kasAwal} indent={1} />
            <TotalRow label="KAS DAN SETARA KAS AKHIR PERIODE" value={kasAkhir} color="#1A77A3" big />
          </tbody>
        </table>

        {/* Verification */}
        <div className="mt-4 p-3 rounded-xl border" style={{ background: '#f6f4f0', borderColor: '#b8d5e8' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#144f6b', marginBottom: 4 }}>
            <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> Rekonsiliasi Saldo Kas Akhir
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
            {bankRows.map((b, i) => (
              <div key={i}>
                <p style={{ fontSize: '10px', color: '#64748b' }}>{b.nama.replace('Kas di Bank ', '')}</p>
                <p style={{ fontSize: '11px', fontWeight: 600, color: '#1A77A3' }}>{fmt(b.saldo)}</p>
              </div>
            ))}
            <div>
              <p style={{ fontSize: '10px', color: '#64748b' }}>Kas Kecil</p>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#1A77A3' }}>{fmt(pettyCashBalance)}</p>
            </div>
            <div style={{ borderTop: '1px solid #b8d5e8', paddingTop: 4, gridColumn: 'span 1' }}>
              <p style={{ fontSize: '10px', color: '#144f6b', fontWeight: 700 }}>Total Kas & Setara Kas</p>
              <p style={{ fontSize: '12px', fontWeight: 800, color: '#1A77A3' }}>{fmt(kasAkhir)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
interface Props {
  allRecords: any[];
  pettyCashBalance: number;
}

const CAT_LABELS: Record<string, string> = {
  Tanah: 'Tanah Gereja',
  Bangunan: 'Gedung & Bangunan',
  Kendaraan: 'Kendaraan Operasional',
  Elektronik: 'Peralatan Teknis & Elektronik',
  Inventaris: 'Inventaris & Mebel',
  'Peralatan Ibadah': 'Peralatan Ibadah',
  Lainnya: 'Aset Lainnya',
};
const CAT_ORDER = ['Tanah Gereja','Gedung & Bangunan','Kendaraan Operasional','Peralatan Ibadah','Peralatan Teknis & Elektronik','Inventaris & Mebel','Aset Lainnya'];

export function LaporanKeuanganTab({ allRecords, pettyCashBalance }: Props) {
  const { churchAssets, bankAccounts, liabilities, financialCategories, fiscalYearSettings, updateFiscalYearSetting, addFiscalYearSetting } = useApp();
  const { offset, onMouseDown } = useDraggable();
  const [subTab, setSubTab] = useState<'posisi' | 'aktivitas' | 'arus-kas'>('posisi');
  const [editingOpeningBalance, setEditingOpeningBalance] = useState(false);
  const [openingBalanceInput, setOpeningBalanceInput] = useState('');
  const [editingInvestasi, setEditingInvestasi] = useState<'peralatan' | 'gedung' | null>(null);
  const [investasiInput, setInvestasiInput] = useState('');
  const [periodeType, setPeriodeType] = useState<'tahunan' | 'bulanan'>('tahunan');
  const [selectedYear, setSelectedYear] = useState(2025);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

  const periodRecords = useMemo(() => {
    return allRecords.filter((r: any) => {
      const d = new Date(r.date);
      if (periodeType === 'tahunan') return d.getFullYear() === selectedYear;
      return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
    });
  }, [allRecords, selectedYear, selectedMonth, periodeType]);

  const periodeLabel = periodeType === 'tahunan'
    ? `Tahun ${selectedYear}`
    : `${MONTH_FULL[selectedMonth]} ${selectedYear}`;

  const asOfLabel = periodeType === 'tahunan'
    ? `31 Desember ${selectedYear}`
    : `${new Date(selectedYear, selectedMonth + 1, 0).getDate()} ${MONTH_FULL[selectedMonth]} ${selectedYear}`;

  // ── Computed rows dari context ───────────────────────────────────────────────
  const asetTetapRows = useMemo((): AsetTetapRow[] => {
    const groups: Record<string, { nilai: number; akumDep: number; depPerTahun: number }> = {};
    (churchAssets || []).forEach((a: ChurchAsset) => {
      const nama = CAT_LABELS[a.category] || a.category;
      if (!groups[nama]) groups[nama] = { nilai: 0, akumDep: 0, depPerTahun: 0 };
      const depPerTahun = a.usefulLifeYears > 0 ? a.acquisitionValue / a.usefulLifeYears : 0;
      const yearsOwned = Math.max(0, new Date().getFullYear() - new Date(a.acquisitionDate + 'T00:00:00').getFullYear());
      const akumDep = Math.min(yearsOwned * depPerTahun, a.acquisitionValue);
      groups[nama].nilai += a.acquisitionValue;
      groups[nama].akumDep += akumDep;
      groups[nama].depPerTahun += depPerTahun;
    });
    return CAT_ORDER.filter(n => groups[n]).map(n => ({
      nama: n,
      nilai: groups[n].nilai,
      akumDep: Math.round(groups[n].akumDep),
      depPerTahun: Math.round(groups[n].depPerTahun),
    }));
  }, [churchAssets]);

  const bankRows = useMemo((): BankRow[] =>
    (bankAccounts || []).map((a: BankAccount) => ({
      nama: `Kas di Bank ${a.bankName} (Rekening ${a.type})`,
      saldo: a.balance,
    })),
  [bankAccounts]);

  const liabilitasRows = useMemo((): LiabilitasRow[] =>
    (liabilities || []).map((l: Liability) => ({ ...l })),
  [liabilities]);

  const netoTerikatSementara = useMemo(() => {
    const pembangunanBank = (bankAccounts || []).find((a: BankAccount) => a.type === 'Pembangunan');
    return pembangunanBank?.balance ?? 143_750_000;
  }, [bankAccounts]);

  const currentFiscalYear = useMemo(() => {
    return (fiscalYearSettings || []).find(s => s.year === selectedYear);
  }, [fiscalYearSettings, selectedYear]);

  const asetNetoAwal = currentFiscalYear?.asetNetoAwal ?? ASET_NETO_AWAL_FALLBACK;
  const investasiPeralatanAnnual = currentFiscalYear?.investasiPeralatan ?? 0;
  const investasiGedungAnnual = currentFiscalYear?.investasiGedung ?? 0;

  const saveOpeningBalance = () => {
    const val = parseFloat(openingBalanceInput.replace(/[^0-9]/g, ''));
    if (isNaN(val) || val < 0) return;
    if (currentFiscalYear) {
      updateFiscalYearSetting(currentFiscalYear.id, { asetNetoAwal: val });
    } else {
      addFiscalYearSetting({ year: selectedYear, asetNetoAwal: val, notes: `Saldo awal tahun ${selectedYear}` });
    }
    setEditingOpeningBalance(false);
  };

  const saveInvestasi = () => {
    const val = parseFloat(investasiInput.replace(/[^0-9]/g, ''));
    if (isNaN(val) || val < 0) return;
    const update = editingInvestasi === 'peralatan' ? { investasiPeralatan: val } : { investasiGedung: val };
    if (currentFiscalYear) {
      updateFiscalYearSetting(currentFiscalYear.id, update);
    } else {
      addFiscalYearSetting({ year: selectedYear, asetNetoAwal: 0, ...update, notes: `Pengaturan tahun ${selectedYear}` });
    }
    setEditingInvestasi(null);
  };

  const SUB_TABS = [
    { id: 'posisi' as const, label: 'Posisi Keuangan', icon: Scale, desc: 'Neraca Aset, Liabilitas & Aset Neto' },
    { id: 'aktivitas' as const, label: 'Laporan Aktivitas', icon: BarChart3, desc: 'Penerimaan, Beban & Surplus/Defisit' },
    { id: 'arus-kas' as const, label: 'Arus Kas', icon: Wallet, desc: 'Operasi, Investasi & Pendanaan' },
  ];

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        style={{ background: 'linear-gradient(135deg,#0a1e2c 0%,#1a4a2e 50%,#0a1e2c 100%)', border: '1px solid #1a3a22' }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(26,119,163,0.12)' }}>
              <FileText className="w-3.5 h-3.5" style={{ color: '#f0ede5' }} />
            </div>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Berdasarkan ISAK 35 / PSAK 45 · Entitas Nonlaba</span>
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'white', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Laporan Keuangan</h2>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>GPIB TRINITAS · Standar Akuntansi Keuangan Indonesia</p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tipe Periode */}
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
            {(['tahunan', 'bulanan'] as const).map(t => (
              <button key={t} onClick={() => setPeriodeType(t)}
                className="px-3 py-1.5 text-xs font-semibold transition-all capitalize"
                style={{
                  background: periodeType === t ? 'rgba(26,119,163,0.25)' : 'transparent',
                  color: periodeType === t ? '#f0ede5' : 'rgba(255,255,255,0.5)',
                }}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Year */}
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.15)' }}>
            {[2024, 2025, 2026].map(y => <option key={y} value={y} style={{ color: '#0f172a', background: 'white' }}>{y}</option>)}
          </select>

          {/* Month (if bulanan) */}
          {periodeType === 'bulanan' && (
            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.15)' }}>
              {MONTH_FULL.map((m, i) => <option key={i} value={i} style={{ color: '#0f172a', background: 'white' }}>{m}</option>)}
            </select>
          )}

          <div className="px-3 py-1.5 rounded-xl" style={{ background: 'rgba(26,119,163,0.15)', border: '1px solid rgba(26,119,163,0.25)' }}>
            <span style={{ fontSize: '11px', color: '#f0ede5', fontWeight: 600 }}>Periode: {periodeLabel}</span>
          </div>

          {/* Opening Balance Editor */}
          {periodeType === 'tahunan' && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
              {editingOpeningBalance ? (
                <>
                  <input
                    type="number"
                    value={openingBalanceInput}
                    onChange={e => setOpeningBalanceInput(e.target.value)}
                    placeholder="Saldo awal aset neto"
                    className="bg-transparent text-white text-xs w-36 focus:outline-none"
                    onKeyDown={e => { if (e.key === 'Enter') saveOpeningBalance(); if (e.key === 'Escape') setEditingOpeningBalance(false); }}
                    autoFocus
                  />
                  <button onClick={saveOpeningBalance} className="text-green-300 text-xs font-bold hover:text-green-100">✓</button>
                  <button onClick={() => setEditingOpeningBalance(false)} className="text-red-300 text-xs hover:text-red-100">✕</button>
                </>
              ) : (
                <>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>Saldo Awal {selectedYear}:</span>
                  <span style={{ fontSize: '11px', color: '#f0ede5', fontWeight: 600 }}>{fmt(asetNetoAwal)}</span>
                  <button
                    onClick={() => { setOpeningBalanceInput(String(asetNetoAwal)); setEditingOpeningBalance(true); }}
                    style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}
                    className="hover:text-white transition-colors"
                    title="Edit saldo awal aset neto"
                  >✎</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="grid grid-cols-3 gap-3">
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className="flex items-center gap-3 p-4 rounded-2xl border text-left transition-all hover:shadow-md"
            style={{
              background: subTab === t.id ? 'linear-gradient(135deg,#0a1e2c,#0f2d41)' : 'white',
              borderColor: subTab === t.id ? '#144f6b' : '#e2e8f0',
              boxShadow: subTab === t.id ? '0 4px 12px rgba(26,119,163,0.2)' : undefined,
            }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: subTab === t.id ? 'rgba(26,119,163,0.12)' : '#f0fdf4' }}>
              <t.icon className="w-4.5 h-4.5" style={{ color: subTab === t.id ? '#f0ede5' : '#1A77A3', width: 18, height: 18 }} />
            </div>
            <div className="min-w-0">
              <p style={{ fontSize: '12.5px', fontWeight: 700, color: subTab === t.id ? 'white' : '#0f172a', lineHeight: 1.2 }}>{t.label}</p>
              <p className="truncate" style={{ fontSize: '10px', color: subTab === t.id ? 'rgba(255,255,255,0.5)' : '#94a3b8', marginTop: 2 }}>{t.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Data notice if no records */}
      {periodRecords.length === 0 && subTab !== 'posisi' && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border" style={{ background: '#f6f4f0', borderColor: '#e8e4d8' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#9c9486' }} />
          <div>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#144f6b' }}>Belum ada data transaksi untuk periode {periodeLabel}</p>
            <p style={{ fontSize: '12px', color: '#144f6b', marginTop: 2 }}>Laporan aktivitas dan arus kas akan tampil setelah ada transaksi pada periode tersebut. Laporan Posisi Keuangan tetap tersedia.</p>
          </div>
        </div>
      )}

      {/* Report content */}
      {subTab === 'posisi' && (
        <LaporanPosisiKeuangan
          pettyCashBalance={pettyCashBalance} asOfLabel={asOfLabel}
          bankRows={bankRows} asetTetapRows={asetTetapRows}
          liabilitasRows={liabilitasRows} netoTerikatSementara={netoTerikatSementara}
        />
      )}
      {subTab === 'aktivitas' && (
        <LaporanAktivitas records={periodRecords} periodeLabel={periodeLabel} periodeType={periodeType} asOfLabel={asOfLabel} asetTetapRows={asetTetapRows} financialCategories={financialCategories || []} asetNetoAwal={asetNetoAwal} />
      )}
      {subTab === 'arus-kas' && (
        <LaporanArusKas
          records={periodRecords} periodeLabel={periodeLabel} periodeType={periodeType} asOfLabel={asOfLabel}
          pettyCashBalance={pettyCashBalance} bankRows={bankRows}
          investasiPeralatanAnnual={investasiPeralatanAnnual}
          investasiGedungAnnual={investasiGedungAnnual}
          onEditInvestasi={type => { setInvestasiInput(String(type === 'peralatan' ? investasiPeralatanAnnual : investasiGedungAnnual)); setEditingInvestasi(type); }}
        />
      )}

      {/* Investasi Edit Modal */}
      {editingInvestasi && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6" onClick={e=>e.stopPropagation()} style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
            <h3 className="font-semibold text-gray-900 mb-1" style={{fontSize:'15px', cursor:'move'}} onMouseDown={onMouseDown}>
              Edit Nilai Investasi — {editingInvestasi === 'peralatan' ? 'Peralatan & Teknologi' : 'Renovasi Gedung'}
            </h3>
            <p className="text-xs text-gray-500 mb-4">Masukkan jumlah tahunan (bulanan akan dihitung otomatis ÷ 12)</p>
            <input
              type="text" value={investasiInput} onChange={e => setInvestasiInput(e.target.value)}
              placeholder="Contoh: 45000000"
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3] mb-4" style={{borderColor:'#e2e8f0'}}
              onKeyDown={e => { if (e.key === 'Enter') saveInvestasi(); if (e.key === 'Escape') setEditingInvestasi(null); }}
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => setEditingInvestasi(null)} className="flex-1 py-2.5 rounded-xl border font-medium text-gray-600 hover:bg-gray-50 text-sm" style={{borderColor:'#e2e8f0'}}>Batal</button>
              <button onClick={saveInvestasi} className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm hover:opacity-90" style={{background:'#1A77A3'}}>Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
