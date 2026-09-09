import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { liveAge } from '../../lib/age';

// Extend jsPDF type
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export const exportToExcel = (data: any[], filename: string, sheetName: string = 'Sheet1') => {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const exportToPDF = (
  title: string,
  headers: string[],
  data: any[][],
  filename: string
) => {
  const doc = new jsPDF();
  
  // Add title
  doc.setFontSize(18);
  doc.text(title, 14, 20);
  
  // Add date
  doc.setFontSize(10);
  doc.text(`Dicetak: ${new Date().toLocaleDateString('id-ID')}`, 14, 30);
  
  // Add table
  (doc as any).autoTable({
    head: [headers],
    body: data,
    startY: 40,
    styles: { font: 'helvetica', fontSize: 9 },
    headStyles: { fillColor: [59, 130, 246] }
  });
  
  doc.save(`${filename}.pdf`);
};

export const exportMembersToExcel = (members: any[], sectors: any[]) => {
  const data = members.map(member => ({
    'Nama Lengkap': member.fullName,
    'Jenis Kelamin': member.gender,
    'Tanggal Lahir': member.birthDate,
    'Umur': liveAge(member),
    'Sektor': sectors.find(s => s.id === member.sectorId)?.name || '-',
    'Alamat': member.address,
    'Telepon': member.phone || '-',
    'Email': member.email || '-',
    'Status': member.membershipStatus || 'Aktif'
  }));
  
  exportToExcel(data, 'Data_Jemaat', 'Jemaat');
};

export const exportMembersToPDF = (members: any[], sectors: any[]) => {
  const headers = ['No', 'Nama', 'Jenis Kelamin', 'Umur', 'Sektor', 'Telepon'];
  const data = members.map((member, index) => [
    (index + 1).toString(),
    member.fullName,
    member.gender,
    liveAge(member).toString(),
    sectors.find(s => s.id === member.sectorId)?.name || '-',
    member.phone || '-'
  ]);
  
  exportToPDF('Daftar Jemaat', headers, data, 'Daftar_Jemaat');
};

export const exportAttendanceToExcel = (attendance: any[], members: any[], sectors: any[]) => {
  const data = attendance.map(att => {
    const member = members.find(m => m.id === att.memberId);
    return {
      'Tanggal': att.date,
      'Jenis Ibadah': att.serviceType,
      'Nama': member?.fullName || '-',
      'Sektor': member ? (sectors.find(s => s.id === member.sectorId)?.name || '-') : '-',
      'Kehadiran': att.present ? 'Hadir' : 'Tidak Hadir',
      'Catatan': att.notes || '-'
    };
  });
  
  exportToExcel(data, 'Data_Kehadiran', 'Kehadiran');
};

export const exportFinancialToExcel = (records: any[]) => {
  const data = records.map(record => ({
    'Tanggal': record.date,
    'Tipe': record.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
    'Kategori': record.category,
    'Jumlah': record.amount,
    'Deskripsi': record.description,
    'Referensi': record.reference || '-',
    'Dicatat Oleh': record.recordedBy
  }));
  
  exportToExcel(data, 'Laporan_Keuangan', 'Keuangan');
};

/**
 * Backup Excel generik -- sebelumnya fungsi ini cuma tahu 4 sheet tetap
 * (Jemaat/Keluarga/Kehadiran/Keuangan), sehingga tombol "Backup Semua Data"
 * di DataManager.tsx & "Excel Backup" di BackupRestore.tsx cuma pernah
 * mengekspor sebagian kecil dari puluhan koleksi yang sebenarnya ada.
 * Sekarang menerima peta { label sheet -> array data } sembarang panjang --
 * caller (BackupRestore.tsx) yang menentukan seberapa lengkap cakupannya.
 * Sheet Excel dibatasi 31 karakter & tidak boleh berisi karakter \/ \ ? * [ ] --
 * nama disanitasi otomatis, dan ditambah suffix angka kalau ada tabrakan nama
 * setelah disanitasi/dipotong.
 */
export const backupAllData = (sheets: Record<string, any[] | undefined | null>) => {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  const sanitizeSheetName = (raw: string): string => {
    const cleaned = raw.replace(/[\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
    let name = cleaned;
    let n = 2;
    while (usedNames.has(name)) {
      const suffix = `_${n++}`;
      name = cleaned.slice(0, 31 - suffix.length) + suffix;
    }
    usedNames.add(name);
    return name;
  };

  Object.entries(sheets).forEach(([label, data]) => {
    if (!data || data.length === 0) return; // skip koleksi kosong, bukan berarti gagal
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(label));
  });

  if (wb.SheetNames.length === 0) {
    // XLSX tidak bisa menyimpan workbook tanpa sheet sama sekali
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Tidak ada data']]), 'Kosong');
  }

  const timestamp = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `Backup_Data_Gereja_${timestamp}.xlsx`);
};

export const importFromExcel = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(reader.error);
    reader.readAsBinaryString(file);
  });
};
