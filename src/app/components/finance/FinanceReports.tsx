// ============================================================
// FINANCE ADD-ON MODULE — Fase 8: Laporan Keuangan
// ============================================================
// Tiga laporan (tab): Neraca, Laporan Aktivitas, Realisasi Anggaran — semua
// dihitung real-time di backend (financeReports.ts) dari jurnal yang sudah
// diposting, tidak ada state tersendiri yang perlu disinkronkan di sini.
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../../lib/apiClient';
import { toast } from 'sonner';
import { FileBarChart, Loader2, Scale, TrendingUp, PieChart, Wallet, FileDown, FileSpreadsheet } from 'lucide-react';
import { FinancePageHeader } from './FinancePageHeader';
import { exportFinanceReportPdf, exportFinanceReportExcel, type FinanceReportSection } from '../../utils/financeReportExport';

function formatRp(n: unknown) {
  const v = Number(n ?? 0);
  return `Rp ${v.toLocaleString('id-ID')}`;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function callApi<T = any>(url: string): Promise<T> {
  const res = await (api as any).get<ApiResponse<T>>(url);
  if (!res.success) throw new Error(res.error?.message || 'Terjadi kesalahan');
  return res.data as T;
}

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]';
const labelCls = 'block text-xs font-medium text-slate-600 mb-1';

type Tab = 'balance-sheet' | 'activity-statement' | 'cash-flow' | 'budget-realization';

// Tombol Export PDF/Excel yang dipakai di keempat tab laporan -- lihat
// src/app/utils/financeReportExport.ts untuk implementasi & catatan penting
// soal area tanda tangan di PDF (bukan tanda tangan sungguhan).
function ExportButtons({ onPdf, onExcel, disabled }: { onPdf: () => void; onExcel: () => void; disabled?: boolean }) {
  return (
    <div className="flex gap-2">
      <button type="button" disabled={disabled} onClick={onPdf} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
        <FileDown className="w-3.5 h-3.5" /> Export PDF
      </button>
      <button type="button" disabled={disabled} onClick={onExcel} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
        <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
      </button>
    </div>
  );
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
// Preset "Laporan Berkala" (1/3/6/12 bulan) — hitung tanggal mulai N bulan ke
// belakang dari hari ini, dipakai ActivityStatementTab supaya pengguna tidak
// perlu isi tanggal manual untuk laporan periodik rutin (mis. audit triwulan).
function monthsAgoStr(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

// ── Tab: Neraca ───────────────────────────────────────────────────────────────
function BalanceSheetTab() {
  const [asOfDate, setAsOfDate] = useState(todayStr());
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!asOfDate) return;
    setLoading(true);
    try { setData(await callApi<any>(`/api/v1/finance/reports/balance-sheet?asOfDate=${asOfDate}`)); }
    catch (err: any) { toast.error(err?.message || 'Gagal memuat Neraca'); }
    finally { setLoading(false); }
  }, [asOfDate]);
  useEffect(() => { load(); }, [load]);

  const Section = ({ title, rows, total }: { title: string; rows: any[]; total: number }) => (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 text-xs font-semibold text-slate-600">{title}</div>
      <div className="divide-y divide-slate-50">
        {rows.length === 0 && <p className="p-3 text-xs text-slate-400">Tidak ada akun dengan saldo.</p>}
        {rows.map((r: any) => (
          <div key={r.id} className="px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-slate-600">{r.code} — {r.name}</span>
            <span className="font-medium text-slate-800 whitespace-nowrap">{formatRp(r.balance)}</span>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 border-t border-slate-100 flex items-center justify-between text-sm font-semibold bg-slate-50">
        <span>Total {title}</span><span>{formatRp(total)}</span>
      </div>
    </div>
  );

  const doExportPdf = () => {
    if (!data) return;
    exportFinanceReportPdf({
      filename: `Neraca_${asOfDate}`,
      reportTitle: 'Neraca',
      periodLabel: `Per Tanggal ${asOfDate}`,
      noteText: data.balanced ? undefined : 'Peringatan: Neraca belum balance — periksa data jurnal sebelum dibagikan.',
      noteIsWarning: !data.balanced,
      sections: [
        { heading: 'Aset', columns: ['Kode', 'Nama Akun', 'Saldo'], rows: data.assets.map((r: any) => [r.code, r.name, formatRp(r.balance)]), totalRow: ['', 'Total Aset', formatRp(data.totalAssets)] },
        { heading: 'Kewajiban', columns: ['Kode', 'Nama Akun', 'Saldo'], rows: data.liabilities.map((r: any) => [r.code, r.name, formatRp(r.balance)]), totalRow: ['', 'Total Kewajiban', formatRp(data.totalLiabilities)] },
        { heading: 'Saldo Dana', columns: ['Uraian', 'Jumlah'], rows: [['Saldo Dana (akun)', formatRp(data.totalFundBalanceRaw)], ['Surplus/(Defisit) Berjalan', formatRp(data.netSurplus)]], totalRow: ['Total Saldo Dana', formatRp(data.totalFundBalanceEffective)] },
      ],
    });
  };
  const doExportExcel = () => {
    if (!data) return;
    exportFinanceReportExcel(`Neraca_${asOfDate}`, [
      { name: 'Aset', rows: [['Kode', 'Nama Akun', 'Saldo'], ...data.assets.map((r: any) => [r.code, r.name, r.balance]), ['', 'Total Aset', data.totalAssets]] },
      { name: 'Kewajiban', rows: [['Kode', 'Nama Akun', 'Saldo'], ...data.liabilities.map((r: any) => [r.code, r.name, r.balance]), ['', 'Total Kewajiban', data.totalLiabilities]] },
      { name: 'Saldo Dana', rows: [['Uraian', 'Jumlah'], ['Saldo Dana (akun)', data.totalFundBalanceRaw], ['Surplus/(Defisit) Berjalan', data.netSurplus], ['Total Saldo Dana', data.totalFundBalanceEffective]] },
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><label className={labelCls}>Per Tanggal</label>
          <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className={inputCls + ' max-w-xs'} /></div>
        <ExportButtons onPdf={doExportPdf} onExcel={doExportExcel} disabled={!data} />
      </div>
      {loading && <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat…</div>}
      {!loading && data && (
        <>
          <div className={`rounded-xl border p-3 text-sm font-medium ${data.balanced ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
            {data.balanced ? '✓ Neraca balance — Aset = Kewajiban + Saldo Dana' : '⚠ Neraca belum balance — periksa data jurnal'}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Section title="Aset" rows={data.assets} total={data.totalAssets} />
            <div className="space-y-4">
              <Section title="Kewajiban" rows={data.liabilities} total={data.totalLiabilities} />
              <div className="bg-white rounded-xl border border-slate-200 p-3 text-sm space-y-1">
                <div className="flex justify-between text-slate-600"><span>Saldo Dana (akun)</span><span>{formatRp(data.totalFundBalanceRaw)}</span></div>
                <div className="flex justify-between text-slate-600"><span>Surplus/(Defisit) Berjalan</span><span>{formatRp(data.netSurplus)}</span></div>
                <div className="flex justify-between font-semibold border-t border-slate-100 pt-1"><span>Total Saldo Dana</span><span>{formatRp(data.totalFundBalanceEffective)}</span></div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab: Laporan Aktivitas ────────────────────────────────────────────────────
function ActivityStatementTab({ funds }: { funds: any[] }) {
  const d = new Date();
  const [from, setFrom] = useState(`${d.getFullYear()}-01-01`);
  const [to, setTo] = useState(todayStr());
  const [fundId, setFundId] = useState('');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (fundId) params.set('fundId', fundId);
      setData(await callApi<any>(`/api/v1/finance/reports/activity-statement?${params.toString()}`));
    } catch (err: any) { toast.error(err?.message || 'Gagal memuat Laporan Aktivitas'); }
    finally { setLoading(false); }
  }, [from, to, fundId]);
  useEffect(() => { load(); }, [load]);

  const applyPreset = (months: number) => {
    setFrom(monthsAgoStr(months));
    setTo(todayStr());
  };
  const PRESETS: { months: number; label: string }[] = [
    { months: 1, label: '1 Bulan' },
    { months: 3, label: '3 Bulan (Triwulan)' },
    { months: 6, label: '6 Bulan (Semester)' },
    { months: 12, label: '12 Bulan (Tahunan)' },
  ];

  const doExportPdf = () => {
    if (!data) return;
    const sections: FinanceReportSection[] = [
      { heading: 'Pendapatan', columns: ['Kode', 'Nama Akun', 'Jumlah'], rows: data.revenue.map((r: any) => [r.code, r.name, formatRp(r.amount)]), totalRow: ['', 'Total Pendapatan', formatRp(data.totalRevenue)] },
      { heading: 'Beban', columns: ['Kode', 'Nama Akun', 'Jumlah'], rows: data.expense.map((r: any) => [r.code, r.name, formatRp(r.amount)]), totalRow: ['', 'Total Beban', formatRp(data.totalExpense)] },
      { heading: 'Surplus/(Defisit) Bersih', columns: ['Uraian', 'Jumlah'], rows: [['Surplus/(Defisit) Bersih', formatRp(data.netSurplus)]] },
    ];
    if (data.isak35Rollup) {
      sections.push({
        heading: 'Perubahan Aset Neto — Klasifikasi ISAK 35', columns: ['Kategori', 'Pendapatan', 'Beban', 'Perubahan Bersih'],
        rows: [
          ['Tanpa Pembatasan dari Penyumbang', formatRp(data.isak35Rollup.unrestricted.revenue), formatRp(data.isak35Rollup.unrestricted.expense), formatRp(data.isak35Rollup.unrestricted.net)],
          ['Dengan Pembatasan dari Penyumbang', formatRp(data.isak35Rollup.restricted.revenue), formatRp(data.isak35Rollup.restricted.expense), formatRp(data.isak35Rollup.restricted.net)],
        ],
      });
    }
    exportFinanceReportPdf({
      filename: `Laporan_Aktivitas_${from}_sd_${to}`,
      reportTitle: 'Laporan Aktivitas',
      periodLabel: `${from} s/d ${to}`,
      sections,
    });
  };
  const doExportExcel = () => {
    if (!data) return;
    const sheets: { name: string; rows: (string | number)[][] }[] = [
      { name: 'Pendapatan', rows: [['Kode', 'Nama Akun', 'Jumlah'], ...data.revenue.map((r: any) => [r.code, r.name, r.amount]), ['', 'Total Pendapatan', data.totalRevenue]] },
      { name: 'Beban', rows: [['Kode', 'Nama Akun', 'Jumlah'], ...data.expense.map((r: any) => [r.code, r.name, r.amount]), ['', 'Total Beban', data.totalExpense]] },
      { name: 'Per Dana', rows: [['Dana', 'Restriksi', 'Pendapatan', 'Beban', 'Net'], ...data.byFund.map((f: any) => [f.name, f.restriction_type, f.revenue, f.expense, f.net])] },
    ];
    if (data.isak35Rollup) {
      sheets.push({ name: 'ISAK 35', rows: [
        ['Kategori', 'Pendapatan', 'Beban', 'Perubahan Bersih'],
        ['Tanpa Pembatasan dari Penyumbang', data.isak35Rollup.unrestricted.revenue, data.isak35Rollup.unrestricted.expense, data.isak35Rollup.unrestricted.net],
        ['Dengan Pembatasan dari Penyumbang', data.isak35Rollup.restricted.revenue, data.isak35Rollup.restricted.expense, data.isak35Rollup.restricted.net],
      ] });
    }
    exportFinanceReportExcel(`Laporan_Aktivitas_${from}_sd_${to}`, sheets);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <label className={labelCls}>Laporan Berkala (cepat)</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {PRESETS.map(p => (
              <button
                key={p.months}
                type="button"
                onClick={() => applyPreset(p.months)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <ExportButtons onPdf={doExportPdf} onExcel={doExportExcel} disabled={!data} />
      </div>
      <div className="flex flex-wrap gap-3">
        <div><label className={labelCls}>Dari</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} /></div>
        <div><label className={labelCls}>Sampai</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} /></div>
        <div><label className={labelCls}>Dana (opsional)</label>
          <select value={fundId} onChange={e => setFundId(e.target.value)} className={inputCls + ' min-w-[160px]'}>
            <option value="">Semua Dana</option>
            {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      </div>
      {loading && <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat…</div>}
      {!loading && data && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 text-xs font-semibold text-slate-600">Pendapatan</div>
              <div className="divide-y divide-slate-50">
                {data.revenue.map((r: any) => (
                  <div key={r.account_id} className="px-3 py-2 flex justify-between text-sm"><span className="text-slate-600">{r.code} — {r.name}</span><span className="font-medium">{formatRp(r.amount)}</span></div>
                ))}
              </div>
              <div className="px-3 py-2 border-t border-slate-100 flex justify-between text-sm font-semibold bg-slate-50"><span>Total Pendapatan</span><span>{formatRp(data.totalRevenue)}</span></div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 text-xs font-semibold text-slate-600">Beban</div>
              <div className="divide-y divide-slate-50">
                {data.expense.map((r: any) => (
                  <div key={r.account_id} className="px-3 py-2 flex justify-between text-sm"><span className="text-slate-600">{r.code} — {r.name}</span><span className="font-medium">{formatRp(r.amount)}</span></div>
                ))}
              </div>
              <div className="px-3 py-2 border-t border-slate-100 flex justify-between text-sm font-semibold bg-slate-50"><span>Total Beban</span><span>{formatRp(data.totalExpense)}</span></div>
            </div>
          </div>
          <div className={`rounded-xl border p-3 text-sm font-semibold ${data.netSurplus >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            Surplus/(Defisit) Bersih: {formatRp(data.netSurplus)}
          </div>
          {!fundId && data.isak35Rollup && (data.isak35Rollup.unrestricted.revenue !== 0 || data.isak35Rollup.unrestricted.expense !== 0 || data.isak35Rollup.restricted.revenue !== 0 || data.isak35Rollup.restricted.expense !== 0) && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 text-xs font-semibold text-slate-600">Perubahan Aset Neto — Klasifikasi ISAK 35</div>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-100"><th className="px-3 py-1.5">Kategori</th><th className="px-3 py-1.5 text-right">Pendapatan</th><th className="px-3 py-1.5 text-right">Beban</th><th className="px-3 py-1.5 text-right">Perubahan Bersih</th></tr></thead>
                <tbody>
                  <tr className="border-b border-slate-50"><td className="px-3 py-1.5">Tanpa Pembatasan dari Penyumbang</td><td className="px-3 py-1.5 text-right">{formatRp(data.isak35Rollup.unrestricted.revenue)}</td><td className="px-3 py-1.5 text-right">{formatRp(data.isak35Rollup.unrestricted.expense)}</td><td className="px-3 py-1.5 text-right font-medium">{formatRp(data.isak35Rollup.unrestricted.net)}</td></tr>
                  <tr className="border-b border-slate-50 last:border-0"><td className="px-3 py-1.5">Dengan Pembatasan dari Penyumbang</td><td className="px-3 py-1.5 text-right">{formatRp(data.isak35Rollup.restricted.revenue)}</td><td className="px-3 py-1.5 text-right">{formatRp(data.isak35Rollup.restricted.expense)}</td><td className="px-3 py-1.5 text-right font-medium">{formatRp(data.isak35Rollup.restricted.net)}</td></tr>
                </tbody>
              </table>
              <p className="px-3 py-2 text-xs text-slate-400 border-t border-slate-100">Roll-up dari 4 tingkat Restriksi Dana (lihat rincian di "Ringkasan per Dana" di bawah) ke 2 kategori sesuai ISAK 35 — untuk tampilan resmi ke Sinode/auditor. Rincian 4 tingkat tetap tersedia untuk pencatatan internal.</p>
            </div>
          )}
          {!fundId && data.byFund.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 text-xs font-semibold text-slate-600">Ringkasan per Dana</div>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-100"><th className="px-3 py-1.5">Dana</th><th className="px-3 py-1.5 text-right">Pendapatan</th><th className="px-3 py-1.5 text-right">Beban</th><th className="px-3 py-1.5 text-right">Net</th></tr></thead>
                <tbody>
                  {data.byFund.map((f: any) => (
                    <tr key={f.fund_id} className="border-b border-slate-50 last:border-0"><td className="px-3 py-1.5">{f.name}</td><td className="px-3 py-1.5 text-right">{formatRp(f.revenue)}</td><td className="px-3 py-1.5 text-right">{formatRp(f.expense)}</td><td className="px-3 py-1.5 text-right font-medium">{formatRp(f.net)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Tab: Laporan Arus Kas ─────────────────────────────────────────────────────
function CashFlowTab() {
  const d = new Date();
  const [from, setFrom] = useState(`${d.getFullYear()}-01-01`);
  const [to, setTo] = useState(todayStr());
  const [method, setMethod] = useState<'direct' | 'indirect'>('direct');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, method });
      setData(await callApi<any>(`/api/v1/finance/reports/cash-flow?${params.toString()}`));
    } catch (err: any) { toast.error(err?.message || 'Gagal memuat Laporan Arus Kas'); }
    finally { setLoading(false); }
  }, [from, to, method]);
  useEffect(() => { load(); }, [load]);

  const applyPreset = (months: number) => { setFrom(monthsAgoStr(months)); setTo(todayStr()); };
  const PRESETS: { months: number; label: string }[] = [
    { months: 1, label: '1 Bulan' },
    { months: 3, label: '3 Bulan (Triwulan)' },
    { months: 6, label: '6 Bulan (Semester)' },
    { months: 12, label: '12 Bulan (Tahunan)' },
  ];

  const lineRows = (lines: { code?: string; name: string; amount: number }[]) => lines.map(l => [l.code ?? '', l.name, formatRp(l.amount)]);
  const doExportPdf = () => {
    if (!data) return;
    exportFinanceReportPdf({
      filename: `Arus_Kas_${from}_sd_${to}`,
      reportTitle: `Laporan Arus Kas (Metode ${method === 'direct' ? 'Langsung' : 'Tidak Langsung'})`,
      periodLabel: `${from} s/d ${to}`,
      noteText: data.balanced ? undefined : 'Peringatan: total arus kas tidak sama dengan selisih Saldo Kas Awal/Akhir — periksa data jurnal sebelum dibagikan.',
      noteIsWarning: !data.balanced,
      sections: [
        { heading: 'Aktivitas Operasi', columns: ['Kode', 'Uraian', 'Jumlah'], rows: lineRows(data.operating.lines), totalRow: ['', 'Arus Kas Bersih — Operasi', formatRp(data.operating.total)] },
        { heading: 'Aktivitas Investasi', columns: ['Kode', 'Uraian', 'Jumlah'], rows: lineRows(data.investing.lines), totalRow: ['', 'Arus Kas Bersih — Investasi', formatRp(data.investing.total)] },
        { heading: 'Aktivitas Pendanaan', columns: ['Kode', 'Uraian', 'Jumlah'], rows: lineRows(data.financing.lines), totalRow: ['', 'Arus Kas Bersih — Pendanaan', formatRp(data.financing.total)] },
        { heading: 'Ringkasan', columns: ['Uraian', 'Jumlah'], rows: [
          ['Saldo Kas & Setara Kas Awal', formatRp(data.beginningCash)],
          ['Kenaikan/(Penurunan) Kas Bersih', formatRp(data.netChange)],
        ], totalRow: ['Saldo Kas & Setara Kas Akhir', formatRp(data.endingCash)] },
      ],
    });
  };
  const doExportExcel = () => {
    if (!data) return;
    const toRows = (lines: { code?: string; name: string; amount: number }[]) => lines.map(l => [l.code ?? '', l.name, l.amount]);
    exportFinanceReportExcel(`Arus_Kas_${from}_sd_${to}`, [
      { name: 'Operasi', rows: [['Kode', 'Uraian', 'Jumlah'], ...toRows(data.operating.lines), ['', 'Total Operasi', data.operating.total]] },
      { name: 'Investasi', rows: [['Kode', 'Uraian', 'Jumlah'], ...toRows(data.investing.lines), ['', 'Total Investasi', data.investing.total]] },
      { name: 'Pendanaan', rows: [['Kode', 'Uraian', 'Jumlah'], ...toRows(data.financing.lines), ['', 'Total Pendanaan', data.financing.total]] },
      { name: 'Ringkasan', rows: [['Uraian', 'Jumlah'], ['Saldo Kas Awal', data.beginningCash], ['Kenaikan/(Penurunan) Bersih', data.netChange], ['Saldo Kas Akhir', data.endingCash]] },
    ]);
  };

  const Section = ({ title, lines, total }: { title: string; lines: { code?: string; name: string; amount: number }[]; total: number }) => (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 text-xs font-semibold text-slate-600">{title}</div>
      <div className="divide-y divide-slate-50">
        {lines.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">Tidak ada mutasi.</div>}
        {lines.map((l, i) => (
          <div key={l.code ?? `${l.name}-${i}`} className="px-3 py-2 flex justify-between text-sm">
            <span className="text-slate-600">{l.code ? `${l.code} — ${l.name}` : l.name}</span>
            <span className={`font-medium ${l.amount >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatRp(l.amount)}</span>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 border-t border-slate-100 flex justify-between text-sm font-semibold bg-slate-50">
        <span>Arus Kas Bersih — {title}</span><span>{formatRp(total)}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Laporan Berkala (cepat)</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {PRESETS.map(p => (
            <button key={p.months} type="button" onClick={() => applyPreset(p.months)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300">{p.label}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex flex-wrap gap-3 items-end">
          <div><label className={labelCls}>Dari</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Sampai</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} /></div>
          <div>
            <label className={labelCls}>Metode Penyajian</label>
            <div className="flex gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
              {(['direct', 'indirect'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${method === m ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {m === 'direct' ? 'Langsung' : 'Tidak Langsung'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <ExportButtons onPdf={doExportPdf} onExcel={doExportExcel} disabled={!data} />
      </div>
      {loading && <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat…</div>}
      {!loading && data && (
        <>
          {!data.balanced && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-sm px-3 py-2">
              Peringatan: total arus kas (Operasi+Investasi+Pendanaan) tidak sama dengan selisih Saldo Kas Awal/Akhir — periksa jurnal dengan klasifikasi akun yang tidak terduga.
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            <Section title="Aktivitas Operasi" lines={data.operating.lines} total={data.operating.total} />
            <Section title="Aktivitas Investasi" lines={data.investing.lines} total={data.investing.total} />
          </div>
          <Section title="Aktivitas Pendanaan" lines={data.financing.lines} total={data.financing.total} />
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="divide-y divide-slate-50 text-sm">
              <div className="px-3 py-2 flex justify-between"><span className="text-slate-600">Saldo Kas & Setara Kas Awal</span><span className="font-medium">{formatRp(data.beginningCash)}</span></div>
              <div className="px-3 py-2 flex justify-between"><span className="text-slate-600">Kenaikan/(Penurunan) Kas Bersih</span><span className="font-medium">{formatRp(data.netChange)}</span></div>
              <div className="px-3 py-2 flex justify-between font-semibold bg-slate-50"><span>Saldo Kas & Setara Kas Akhir</span><span>{formatRp(data.endingCash)}</span></div>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            "Kas & Setara Kas" = seluruh akun yang terdaftar di Master Data Finance &gt; Kas Kecil/Rekening Bank. Mutasi antar-kas (mis. setor tunai ke bank) tidak dihitung sebagai arus kas eksternal.
          </p>
        </>
      )}
    </div>
  );
}

// ── Tab: Realisasi Anggaran ───────────────────────────────────────────────────
function BudgetRealizationTab({ fiscalYears, periodsByFy }: { fiscalYears: any[]; periodsByFy: (fyId: string) => Promise<any[]> }) {
  const [fiscalYearId, setFiscalYearId] = useState(fiscalYears.find(fy => fy.is_current)?.id || fiscalYears[0]?.id || '');
  const [periodId, setPeriodId] = useState('');
  const [periods, setPeriods] = useState<any[]>([]);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { (async () => setPeriods(fiscalYearId ? await periodsByFy(fiscalYearId) : []))(); }, [fiscalYearId, periodsByFy]);

  const load = useCallback(async () => {
    if (!fiscalYearId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ fiscalYearId });
      if (periodId) params.set('periodId', periodId);
      setData(await callApi<any>(`/api/v1/finance/reports/budget-realization?${params.toString()}`));
    } catch (err: any) { toast.error(err?.message || 'Gagal memuat Realisasi Anggaran'); }
    finally { setLoading(false); }
  }, [fiscalYearId, periodId]);
  useEffect(() => { load(); }, [load]);

  const fyLabel = fiscalYears.find(fy => fy.id === fiscalYearId)?.name || fiscalYearId;
  const doExportPdf = () => {
    if (!data) return;
    exportFinanceReportPdf({
      filename: `Realisasi_Anggaran_${fyLabel}`,
      reportTitle: 'Realisasi Anggaran',
      periodLabel: `Tahun Fiskal ${fyLabel}`,
      sections: [{
        heading: 'Rincian Realisasi', columns: ['Akun', 'Bidang/Program/Kegiatan', 'Periode', 'Anggaran', 'Realisasi', 'Selisih', '%'],
        rows: data.lines.map((l: any) => [
          `${l.account_code} — ${l.account_name}`,
          [l.field_name, l.program_name, l.activity_name].filter(Boolean).join(' / ') || '—',
          l.period_name, formatRp(l.budget_amount), formatRp(l.actual), formatRp(l.variance), `${l.variancePct.toFixed(1)}%`,
        ]),
        totalRow: ['Total', '', '', formatRp(data.totalBudget), formatRp(data.totalActual), formatRp(data.totalVariance), ''],
      }],
    });
  };
  const doExportExcel = () => {
    if (!data) return;
    exportFinanceReportExcel(`Realisasi_Anggaran_${fyLabel}`, [{
      name: 'Realisasi Anggaran',
      rows: [
        ['Akun', 'Bidang/Program/Kegiatan', 'Periode', 'Anggaran', 'Realisasi', 'Selisih', '%'],
        ...data.lines.map((l: any) => [
          `${l.account_code} — ${l.account_name}`,
          [l.field_name, l.program_name, l.activity_name].filter(Boolean).join(' / ') || '—',
          l.period_name, l.budget_amount, l.actual, l.variance, Number(l.variancePct.toFixed(1)),
        ]),
        ['Total', '', '', data.totalBudget, data.totalActual, data.totalVariance, ''],
      ],
    }]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex flex-wrap gap-3">
          <div><label className={labelCls}>Tahun Fiskal</label>
            <select value={fiscalYearId} onChange={e => { setFiscalYearId(e.target.value); setPeriodId(''); }} className={inputCls + ' min-w-[160px]'}>
              {fiscalYears.map(fy => <option key={fy.id} value={fy.id}>{fy.name}{fy.is_current ? ' (Aktif)' : ''}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Periode (opsional)</label>
            <select value={periodId} onChange={e => setPeriodId(e.target.value)} className={inputCls + ' min-w-[160px]'}>
              <option value="">Semua Periode</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <ExportButtons onPdf={doExportPdf} onExcel={doExportExcel} disabled={!data} />
      </div>
      {loading && <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat…</div>}
      {!loading && data && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-3 py-2 font-medium">Akun</th>
                <th className="px-3 py-2 font-medium">Bidang/Program/Kegiatan</th>
                <th className="px-3 py-2 font-medium">Periode</th>
                <th className="px-3 py-2 font-medium text-right">Anggaran</th>
                <th className="px-3 py-2 font-medium text-right">Realisasi</th>
                <th className="px-3 py-2 font-medium text-right">Selisih</th>
                <th className="px-3 py-2 font-medium text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Belum ada Anggaran (RKA) untuk Tahun Fiskal ini.</td></tr>}
              {data.lines.map((l: any) => (
                <tr key={l.budget_line_id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-1.5 whitespace-nowrap">{l.account_code} — {l.account_name}</td>
                  <td className="px-3 py-1.5 text-slate-500">{[l.field_name, l.program_name, l.activity_name].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{l.period_name}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatRp(l.budget_amount)}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatRp(l.actual)}</td>
                  <td className={`px-3 py-1.5 text-right whitespace-nowrap ${l.variance < 0 ? 'text-red-600' : 'text-slate-700'}`}>{formatRp(l.variance)}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">{l.variancePct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
            {data.lines.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <td colSpan={3} className="px-3 py-2 text-right">Total</td>
                  <td className="px-3 py-2 text-right">{formatRp(data.totalBudget)}</td>
                  <td className="px-3 py-2 text-right">{formatRp(data.totalActual)}</td>
                  <td className={`px-3 py-2 text-right ${data.totalVariance < 0 ? 'text-red-600' : ''}`}>{formatRp(data.totalVariance)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

// ── Halaman Utama ─────────────────────────────────────────────────────────────────
export function FinanceReports({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [tab, setTab] = useState<Tab>('balance-sheet');
  const [fiscalYears, setFiscalYears] = useState<any[]>([]);
  const [funds, setFunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [years, fundList] = await Promise.all([
          callApi<any[]>('/api/v1/finance/fiscal-years'),
          callApi<any[]>('/api/v1/finance/funds'),
        ]);
        setFiscalYears(years);
        setFunds(fundList.filter((f: any) => f.is_active));
      } catch (err: any) {
        toast.error(err?.message || 'Gagal memuat Tahun Fiskal / Dana');
      } finally { setLoading(false); }
    })();
  }, []);

  const periodsByFy = useCallback(async (fyId: string) => {
    try { return await callApi<any[]>(`/api/v1/finance/fiscal-years/${fyId}/periods`); } catch { return []; }
  }, []);

  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined' && window.self !== window.top) {
      toast.info('Tips: Jika dialog cetak terhalang oleh sandbox preview, buka aplikasi di Tab Baru (Open in New Tab) untuk mencetak langsung.');
    }
    try {
      window.print();
    } catch {
      toast.info('Silakan buka aplikasi di tab baru untuk mencetak dokumen.');
    }
  }, []);

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'balance-sheet', label: 'Neraca', icon: Scale },
    { key: 'activity-statement', label: 'Laporan Aktivitas', icon: TrendingUp },
    { key: 'cash-flow', label: 'Arus Kas', icon: Wallet },
    { key: 'budget-realization', label: 'Realisasi Anggaran', icon: PieChart },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <FinancePageHeader
        title="Laporan Keuangan Sinodal"
        currentSection="Laporan Keuangan"
        onNavigate={onNavigate}
        systemBadge="ISAK 35 (2020)"
        metaBadge="Real-time Financials"
        onRefresh={handleRefresh}
        onPrint={handlePrint}
        secondaryActions={
          <div className="flex gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  tab === t.key
                    ? 'bg-white text-[#144f6b] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        }
        infoStrip={[
          {
            label: 'Format Laporan',
            value: 'Standar Akuntansi Sinode GPIB',
            color: 'emerald',
          },
          {
            label: 'Basis Perhitungan',
            value: 'Jurnal Terposting (Double-Entry)',
            color: 'sky',
          },
          {
            label: 'Klasifikasi Dana',
            value: `${funds.length} Kelompok Dana`,
            color: 'indigo',
          },
          {
            label: 'Integritas Laporan',
            value: 'Aset = Kewajiban + Aset Neto',
            color: 'teal',
          },
        ]}
      />

      {loading && <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat…</div>}
      {!loading && fiscalYears.length === 0 && <p className="text-sm text-slate-500">Belum ada Tahun Fiskal — buat dulu lewat menu Master Data Finance.</p>}
      {!loading && fiscalYears.length > 0 && (
        <>
          {tab === 'balance-sheet' && <BalanceSheetTab key={`bs-${refreshKey}`} />}
          {tab === 'activity-statement' && <ActivityStatementTab key={`as-${refreshKey}`} funds={funds} />}
          {tab === 'cash-flow' && <CashFlowTab key={`cf-${refreshKey}`} />}
          {tab === 'budget-realization' && <BudgetRealizationTab key={`br-${refreshKey}`} fiscalYears={fiscalYears} periodsByFy={periodsByFy} />}
        </>
      )}
    </div>
  );
}
