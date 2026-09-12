// ============================================================
// FINANCE ADD-ON MODULE — Export PDF/Excel untuk Laporan Keuangan Sinodal
// ============================================================
// Sebelumnya laporan cuma bisa "dicetak" lewat window.print() (dialog print
// browser) -- layoutnya gampang berantakan kalau dikirim/diarsipkan sebagai
// file. Util ini membuat PDF berkop-surat (pola sama seperti generateWartaPDF
// di EWarta.tsx) + area tanda tangan pengesahan (Bendahara/Ketua Majelis),
// dan Excel multi-sheet -- dipakai oleh BalanceSheetTab, ActivityStatementTab,
// CashFlowTab, BudgetRealizationTab di FinanceReports.tsx.
//
// Catatan yang PERLU diketahui pengguna: area tanda tangan di PDF cuma berupa
// GARIS + LABEL JABATAN kosong ("Bendahara", "Ketua Majelis Jemaat") -- bukan
// tanda tangan digital sungguhan atau nama orang, karena sistem ini tidak
// mengarang siapa yang menjabat. Dokumen tetap perlu ditandatangani basah/
// digital di luar sistem setelah dicetak, sama seperti laporan kertas biasa.
// jspdf & jspdf-autotable serta xlsx SUDAH menjadi dependency proyek ini
// (dipakai modul lain seperti E-Warta & exportUtils.ts) -- tidak ada paket
// baru yang perlu diinstal.
// ============================================================
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

export interface FinanceReportSection {
  heading: string;
  columns: string[];
  rows: (string | number)[][];
  totalRow?: (string | number)[];
}

export interface FinanceReportPdfOptions {
  filename: string;
  reportTitle: string;
  periodLabel: string;
  sections: FinanceReportSection[];
  /** Catatan kecil di bawah judul (mis. status "Neraca belum balance"). Opsional. */
  noteText?: string;
  noteIsWarning?: boolean;
}

export function exportFinanceReportPdf(opts: FinanceReportPdfOptions) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const NAVY: [number, number, number] = [20, 79, 107];
  const GOLD: [number, number, number] = [202, 160, 74];

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 26, pageWidth, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('LAPORAN KEUANGAN SINODAL', pageWidth / 2, 11, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('GPIB Trinitas', pageWidth / 2, 17, { align: 'center' });
  doc.setFontSize(8);
  doc.text(opts.periodLabel, pageWidth / 2, 22.5, { align: 'center' });

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(opts.reportTitle, 14, 34);

  let y = 39;
  if (opts.noteText) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...(opts.noteIsWarning ? ([180, 83, 9] as [number, number, number]) : ([71, 85, 105] as [number, number, number])));
    const lines = doc.splitTextToSize(opts.noteText, pageWidth - 28);
    doc.text(lines, 14, y);
    y += lines.length * 4 + 3;
  }

  for (const section of opts.sections) {
    if (y > pageHeight - 40) { doc.addPage(); y = 16; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(20, 79, 107);
    doc.text(section.heading, 14, y);
    y += 3;
    const body = section.rows.slice();
    const totalRowIndex = section.totalRow ? body.push(section.totalRow) - 1 : -1;
    doc.autoTable({
      head: [section.columns],
      body,
      startY: y,
      margin: { left: 14, right: 14 },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: NAVY, fontSize: 8 },
      didParseCell: (data: any) => {
        if (totalRowIndex >= 0 && data.row.section === 'body' && data.row.index === totalRowIndex) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 247, 251];
        }
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // Area tanda tangan pengesahan -- garis + label jabatan saja (lihat catatan di
  // komentar berkas ini soal kenapa bukan nama/tanda tangan sungguhan).
  if (y > pageHeight - 45) { doc.addPage(); y = 16; }
  y += 8;
  const colW = (pageWidth - 28) / 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text('Bendahara,', 14, y);
  doc.text('Ketua Majelis Jemaat,', 14 + colW, y);
  y += 20;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(14, y, 14 + colW - 14, y);
  doc.line(14 + colW, y, 14 + colW * 2 - 14, y);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('(nama & tanda tangan)', 14, y);
  doc.text('(nama & tanda tangan)', 14 + colW, y);

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Dokumen Laporan Keuangan GPIB Trinitas — dibuat otomatis dari sistem GEMAS', 14, pageHeight - 7.5);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - 14, pageHeight - 7.5, { align: 'right' });
  }

  doc.save(`${opts.filename}.pdf`);
}

export function exportFinanceReportExcel(filename: string, sheets: { name: string; rows: (string | number)[][] }[]) {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  for (const sheet of sheets) {
    let name = sheet.name.replace(/[\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
    let n = 2;
    while (usedNames.has(name)) { const suffix = `_${n++}`; name = name.slice(0, 31 - suffix.length) + suffix; }
    usedNames.add(name);
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
