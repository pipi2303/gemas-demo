// ============================================================
// FINANCE ADD-ON MODULE — Fase 9: Dashboard & Analitik Eksekutif
// ============================================================
// Ringkasan eksekutif, intelijen kas & bank, tren bulanan, analisis
// penerimaan vs beban, dan audit workflow tata kelola keuangan GPIB.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../../lib/apiClient';
import { useApp } from '../../context/AppContext';
import { toast } from 'sonner';
import {
  Loader2,
  Wallet,
  TrendingUp,
  TrendingDown,
  Inbox,
  Building2,
  Landmark,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Printer,
  FileText,
  ShieldCheck,
  Sparkles,
  PieChart as PieChartIcon,
  BarChart3,
  CalendarCheck,
  Layers,
  CreditCard,
  Banknote,
  ArrowRight,
  Plus,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { FinancePageHeader } from './FinancePageHeader';

function formatRp(n: unknown) {
  const v = Number(n ?? 0);
  return `Rp ${v.toLocaleString('id-ID')}`;
}

function formatRpShort(n: unknown) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}rb`;
  return String(v);
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

const PIE_COLORS = ['#1A77A3', '#caa04a', '#2f8f5b', '#d1553f', '#8b6bb1', '#9c9486'];
const REV_COLORS = ['#1A77A3', '#caa04a', '#2f8f5b', '#d1553f', '#8b6bb1'];

type ActiveTab = 'ringkasan' | 'tren' | 'kas-bank' | 'anggaran' | 'tata-kelola';

export function FinanceDashboard({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { can } = useApp();
  // Audit gap fix: tombol navigasi cepat sebelumnya selalu tampil kalau
  // `onNavigate` ada, tanpa cek apakah role user benar-benar punya akses ke
  // submenu tujuan -- sekarang digating per submenu tujuan.
  const canViewMasterData = can('finance-master-data', 'view');
  const canViewTransaction = can('finance-transaction', 'view');
  const canViewApproval = can('finance-approval', 'view');
  const canViewReconciliation = can('finance-reconciliation', 'view');
  const canViewBudget = can('finance-budget', 'view');
  const canViewLedger = can('finance-ledger', 'view');
  const canViewPeriodClosing = can('finance-period-closing', 'view');
  const canViewReports = can('finance-reports', 'view');
  const [fiscalYears, setFiscalYears] = useState<any[]>([]);
  const [fiscalYearId, setFiscalYearId] = useState('');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('ringkasan');
  const [chartType, setChartType] = useState<'area' | 'bar' | 'net'>('area');

  // Load Fiscal Years
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const years = await callApi<any[]>('/api/v1/finance/fiscal-years');
        setFiscalYears(years);
        setFiscalYearId(prev => prev || years.find((y: any) => y.is_current)?.id || years[0]?.id || '');
      } catch (err: any) {
        toast.error(err?.message || 'Gagal memuat Tahun Fiskal');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load Dashboard Data
  const load = useCallback(async () => {
    if (!fiscalYearId) return;
    setLoadingDashboard(true);
    try {
      const res = await callApi<any>(`/api/v1/finance/dashboard?fiscalYearId=${fiscalYearId}`);
      setData(res);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat dashboard keuangan');
    } finally {
      setLoadingDashboard(false);
    }
  }, [fiscalYearId]);

  useEffect(() => {
    load();
  }, [load]);

  const currentFiscalYear = useMemo(() => {
    return fiscalYears.find(f => f.id === fiscalYearId) || data?.fiscalYear;
  }, [fiscalYears, fiscalYearId, data]);

  // Handle Print Action
  const handlePrint = () => {
    if (typeof window !== 'undefined' && window.self !== window.top) {
      toast.info('Tips: Jika dialog cetak terhalang oleh sandbox preview, buka aplikasi di Tab Baru (Open in New Tab) untuk mencetak langsung.');
    }
    try {
      window.print();
    } catch {
      toast.info('Silakan buka aplikasi di tab baru untuk mencetak dokumen.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-8 flex flex-col items-center justify-center min-h-[400px] text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-[#144f6b]" />
        <p className="text-sm font-medium text-slate-600">Menyiapkan Dashboard Finance…</p>
      </div>
    );
  }

  if (fiscalYears.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center max-w-md mx-auto">
          <AlertTriangle className="w-10 h-10 text-amber-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-amber-900 mb-1">Tahun Fiskal Belum Tersedia</h3>
          <p className="text-xs text-amber-700 mb-4">
            Silakan buat dan aktifkan Tahun Fiskal terlebih dahulu melalui menu Master Data Finance.
          </p>
          {onNavigate && canViewMasterData && (
            <button
              onClick={() => onNavigate('finance-master-data')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#144f6b] text-white text-xs font-medium rounded-lg hover:opacity-90"
            >
              Buka Master Data &amp; Fiskal <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Derived metrics
  const operatingMargin = data && data.ytdRevenue > 0
    ? ((data.ytdNetSurplus / data.ytdRevenue) * 100).toFixed(1)
    : '0';

  const chartData = (data?.monthlyTrend || []).map((m: any) => ({
    // Audit gap fix: sebelumnya hardcode .replace(' 2026','').replace(' 2027','')
    // cuma cocok untuk Tahun Fiskal 2026-2027; sekarang lepas tahun apa pun (4 digit)
    // di akhir nama periode supaya berfungsi untuk Tahun Fiskal manapun.
    name: m.periodName.replace(/ \d{4}$/, ''),
    fullName: m.periodName,
    Pendapatan: m.revenue,
    Beban: m.expense,
    Surplus: m.net,
  }));

  // Bank & Cash composition for donut
  const liquidAssetComposition = [
    ...(data?.cashAccounts || []).map((c: any) => ({
      name: `${c.name} (${c.code})`,
      amount: c.current_balance,
      category: 'KAS',
    })),
    ...(data?.bankAccounts || []).map((b: any) => ({
      name: `${b.bank_name} - ${b.account_name}`,
      amount: b.current_balance,
      category: 'BANK',
    })),
  ].filter(item => item.amount > 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ── Top Header Section (Minimalis, Informatif & Keren) ─────── */}
      <FinancePageHeader
        title="Dashboard Finance"
        currentSection="Dashboard Finance"
        onNavigate={onNavigate}
        statusBadge={
          currentFiscalYear?.is_current
            ? { label: 'Tahun Anggaran Berjalan', variant: 'emerald' }
            : undefined
        }
        fiscalYears={fiscalYears}
        fiscalYearId={fiscalYearId}
        onFiscalYearChange={setFiscalYearId}
        onRefresh={load}
        isRefreshing={loadingDashboard}
        onPrint={handlePrint}
        primaryAction={
          onNavigate && canViewTransaction
            ? {
                label: '+ Input Transaksi',
                icon: Plus,
                onClick: () => onNavigate('finance-transaction'),
              }
            : undefined
        }
        infoStrip={[
          {
            label: 'Periode',
            value: data?.periodStatusCounts ? `${data.periodStatusCounts.OPEN || 0} Terbuka` : 'Aktif',
            color: 'emerald',
          },
          {
            label: 'Kas & Bank',
            value: formatRp(data?.liquidity?.totalLiquidAssets || data?.totalAssets || 0),
            color: 'sky',
          },
          {
            // Audit gap fix: sebelumnya teks statis "Seimbang (Balanced)" apa pun
            // kondisi datanya -- sekarang benar-benar dihitung backend (lihat
            // journalBalanced/unbalancedJournalCount di financeDashboard.ts).
            label: 'Jurnal',
            value: data?.journalBalanced === false
              ? `${data.unbalancedJournalCount} Tidak Seimbang`
              : 'Seimbang (Balanced)',
            color: data?.journalBalanced === false ? 'rose' : 'teal',
          },
          {
            // Ini kebijakan sistem yang selalu ditegakkan di setiap transaksi
            // (lihat tab "Alur Audit & Otorisasi"), bukan metrik yang dihitung per
            // periode -- label diperjelas supaya tidak disalahartikan sebagai status live.
            label: 'Otorisasi',
            value: 'Kebijakan 4-Mata',
            color: 'indigo',
          },
        ]}
      />

      {loadingDashboard && (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-[#144f6b] mr-2.5" />
          <span className="text-sm font-medium text-slate-600">Memperbarui metrik analitik...</span>
        </div>
      )}

      {!loadingDashboard && data && (
        <>
          {/* ── Pending Approvals Alert Bar (if any) ────────────────────────── */}
          {data.pendingApproval > 0 && (
            <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                  <Inbox className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-900">
                    {data.pendingApproval} Transaksi Menunggu Proses Otorisasi
                  </h4>
                  <p className="text-xs text-amber-700">
                    Terdapat voucher transaksi pada status Pengajuan (Submitted), Verifikasi (Verified), atau Persetujuan (Approved) yang membutuhkan tindakan.
                  </p>
                </div>
              </div>
              {onNavigate && canViewApproval && (
                <button
                  onClick={() => onNavigate('finance-approval')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-all shadow-xs"
                >
                  Buka Antrian Verifikasi &rarr;
                </button>
              )}
            </div>
          )}

          {/* ── Hero Executive Metric Cards (4 Pillars) ──────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Posisi Total Aset */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-[#144f6b]/40 transition-all relative overflow-hidden group">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center text-[#144f6b]">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Aset</span>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                  data.totalAssets >= data.totalLiabilities ? 'bg-sky-50 text-[#144f6b]' : 'bg-rose-50 text-rose-700'
                }`}>
                  {data.totalAssets >= data.totalLiabilities ? 'Solven' : 'Perlu Perhatian'}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{formatRp(data.totalAssets)}</p>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Kas &amp; Setara Kas:</span>
                <span className="font-semibold text-slate-700">{formatRp(data.liquidity?.totalLiquidAssets || data.totalAssets)}</span>
              </div>
            </div>

            {/* 2. Surplus / (Defisit) YTD */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-[#144f6b]/40 transition-all relative overflow-hidden group">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${data.ytdNetSurplus >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {data.ytdNetSurplus >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Surplus / (Defisit) YTD</span>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${data.ytdNetSurplus >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {data.ytdNetSurplus >= 0 ? 'Surplus' : 'Defisit'}
                </span>
              </div>
              <p className={`text-2xl font-bold tracking-tight ${data.ytdNetSurplus >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {formatRp(data.ytdNetSurplus)}
              </p>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Margin Operasional:</span>
                <span className={`font-semibold ${data.ytdNetSurplus >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {operatingMargin}%
                </span>
              </div>
            </div>

            {/* 3. Penerimaan (Revenue) YTD */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-[#144f6b]/40 transition-all relative overflow-hidden group">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Penerimaan YTD</span>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700">
                  {data.budget?.revenueRealizationRate || 0}% Target
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{formatRp(data.ytdRevenue)}</p>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Target RKA:</span>
                <span className="font-semibold text-slate-700">{formatRp(data.budget?.totalBudgetRevenue || 0)}</span>
              </div>
            </div>

            {/* 4. Pengeluaran (Expense) YTD */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-[#144f6b]/40 transition-all relative overflow-hidden group">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                    <ArrowDownRight className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Belanja / Beban YTD</span>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-700">
                  Cadangan: {data.liquidity?.runwayMonths ?? 12} Bln
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{formatRp(data.ytdExpense)}</p>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Penyerapan Anggaran:</span>
                <span className="font-semibold text-slate-700">{data.budget?.expenseAbsorptionRate || 0}%</span>
              </div>
            </div>
          </div>

          {/* ── Secondary Indicator Bar: Saldo Dana & Tata Kelola ───────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white rounded-2xl border border-slate-200 p-4 text-xs">
            <div className="border-r border-slate-100 pr-3">
              <p className="text-slate-400 font-medium mb-1">Total Kewajiban (Utang)</p>
              <p className="text-sm font-bold text-slate-800">{formatRp(data.totalLiabilities)}</p>
            </div>
            <div className="border-r border-slate-100 pr-3">
              <p className="text-slate-400 font-medium mb-1">Saldo Dana Efektif</p>
              <p className="text-sm font-bold text-slate-800">{formatRp(data.totalFundBalanceEffective)}</p>
            </div>
            <div className="border-r border-slate-100 pr-3">
              <p className="text-slate-400 font-medium mb-1">Status 12 Periode</p>
              <p className="text-sm font-bold text-slate-800">
                <span className="text-emerald-600">{data.periodStatusCounts?.OPEN || 0} Terbuka</span> &bull; {data.periodStatusCounts?.CLOSED || 0} Ditutup
              </p>
              {onNavigate && canViewPeriodClosing && (
                <button
                  onClick={() => onNavigate('finance-period-closing')}
                  className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-[#144f6b] hover:underline"
                >
                  <CalendarCheck className="w-3 h-3" /> Buka Penutupan Periode
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('tata-kelola')}
              className="text-left hover:opacity-80 transition-opacity"
            >
              <p className="text-slate-400 font-medium mb-1">Kepatuhan Tata Kelola</p>
              <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-sm">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Prinsip 4-Mata Aktif</span>
              </div>
            </button>
          </div>

          {/* ── Perspective Switcher Tabs ──────────────────────────────── */}
          <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto no-scrollbar py-1">
            {[
              { id: 'ringkasan', label: 'Ringkasan Eksekutif', icon: Sparkles },
              { id: 'tren', label: 'Tren Arus Kas Bulanan', icon: BarChart3 },
              { id: 'kas-bank', label: 'Posisi Kas & Bank', icon: Landmark },
              { id: 'anggaran', label: 'Realisasi Anggaran (RKA)', icon: Layers },
              { id: 'tata-kelola', label: 'Alur Audit & Otorisasi', icon: ShieldCheck },
            ].map(t => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as ActiveTab)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-[#144f6b] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* ── TAB 1: RINGKASAN EKSEKUTIF ─────────────────────────────── */}
          {activeTab === 'ringkasan' && (
            <div className="space-y-6">
              {/* Main Chart + Top Expense Split */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Monthly Trend Chart */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-[#144f6b]" />
                        Tren Pendapatan vs Beban per Periode
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Agregasi mutasi jurnal yang sudah diposting di Tahun Fiskal {currentFiscalYear?.name}
                      </p>
                    </div>
                    {/* Chart style toggle */}
                    <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-medium">
                      <button
                        onClick={() => setChartType('area')}
                        className={`px-2.5 py-1 rounded-md transition-all ${chartType === 'area' ? 'bg-white text-[#144f6b] shadow-xs' : 'text-slate-600'}`}
                      >
                        Area
                      </button>
                      <button
                        onClick={() => setChartType('bar')}
                        className={`px-2.5 py-1 rounded-md transition-all ${chartType === 'bar' ? 'bg-white text-[#144f6b] shadow-xs' : 'text-slate-600'}`}
                      >
                        Batang
                      </button>
                      <button
                        onClick={() => setChartType('net')}
                        className={`px-2.5 py-1 rounded-md transition-all ${chartType === 'net' ? 'bg-white text-[#144f6b] shadow-xs' : 'text-slate-600'}`}
                      >
                        Surplus Bersih
                      </button>
                    </div>
                  </div>

                  <div style={{ width: '100%', height: 290 }}>
                    <ResponsiveContainer>
                      <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2f8f5b" stopOpacity={0.28} />
                            <stop offset="95%" stopColor="#2f8f5b" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#d1553f" stopOpacity={0.28} />
                            <stop offset="95%" stopColor="#d1553f" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={formatRpShort} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={55} />
                        <Tooltip
                          formatter={(value: any) => formatRp(value)}
                          labelFormatter={(label: string) => `Periode: ${label}`}
                          contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 8px 24px -4px rgba(15,45,65,0.15)', fontSize: '12px' }}
                          animationDuration={200}
                          animationEasing="ease-out"
                          cursor={{ fill: 'rgba(20,79,107,0.04)' }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} />

                        {chartType === 'area' && (
                          <>
                            <Area type="monotone" dataKey="Pendapatan" stroke="#2f8f5b" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRev)" animationDuration={450} animationEasing="ease-out" />
                            <Area type="monotone" dataKey="Beban" stroke="#d1553f" strokeWidth={2.5} fillOpacity={1} fill="url(#colorExp)" animationDuration={450} animationEasing="ease-out" />
                          </>
                        )}
                        {chartType === 'bar' && (
                          <>
                            <Bar dataKey="Pendapatan" fill="#2f8f5b" radius={[4, 4, 0, 0]} maxBarSize={32} animationDuration={450} animationEasing="ease-out" />
                            <Bar dataKey="Beban" fill="#d1553f" radius={[4, 4, 0, 0]} maxBarSize={32} animationDuration={450} animationEasing="ease-out" />
                          </>
                        )}
                        {chartType === 'net' && (
                          <>
                            <Bar dataKey="Surplus" fill="#1A77A3" radius={[4, 4, 0, 0]} maxBarSize={32} animationDuration={450} animationEasing="ease-out" />
                            <Line type="monotone" dataKey="Surplus" stroke="#144f6b" strokeWidth={3} dot={{ r: 4 }} animationDuration={450} animationEasing="ease-out" />
                          </>
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Right: Top 5 Akun Beban & Pie Chart */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <PieChartIcon className="w-4 h-4 text-rose-500" />
                      Komposisi 5 Beban Terbesar
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Beban operasional &amp; pelayanan YTD</p>

                    {data.topExpenseAccounts.length === 0 ? (
                      <div className="py-16 text-center text-slate-400">
                        <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-xs">Belum ada transaksi pengeluaran/beban yang di-post.</p>
                      </div>
                    ) : (
                      <>
                        <div style={{ width: '100%', height: 160 }} className="mt-2">
                          <ResponsiveContainer>
                            <PieChart>
                              <Pie
                                data={data.topExpenseAccounts}
                                dataKey="amount"
                                nameKey="name"
                                innerRadius={40}
                                outerRadius={65}
                                paddingAngle={3}
                              >
                                {data.topExpenseAccounts.map((_: any, i: number) => (
                                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(v: any) => formatRp(v)} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="space-y-2 mt-2">
                          {data.topExpenseAccounts.map((a: any, i: number) => {
                            const totalExp = data.ytdExpense || 1;
                            const pct = ((a.amount / totalExp) * 100).toFixed(1);
                            return (
                              <div key={a.code} className="text-xs">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-1.5 truncate max-w-[70%]">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                                    <span className="text-slate-700 font-medium truncate" title={a.name}>
                                      {a.name}
                                    </span>
                                  </div>
                                  <span className="font-bold text-slate-900">{formatRp(a.amount)}</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{ width: `${pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>Total Beban YTD:</span>
                    <span className="font-bold text-slate-900">{formatRp(data.ytdExpense)}</span>
                  </div>
                </div>
              </div>

              {/* Top Revenue Streams & Bank Accounts Preview */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Revenue Sources */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                      Sumber Penerimaan Utama (YTD)
                    </h3>
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                      {formatRp(data.ytdRevenue)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">
                    Persembahan jemaat, perpuluhan, kolekte dan penerimaan khusus yang telah dibukukan.
                  </p>

                  {(!data.topRevenueAccounts || data.topRevenueAccounts.length === 0) ? (
                    <p className="text-xs text-slate-400 py-8 text-center">Belum ada data penerimaan.</p>
                  ) : (
                    <div className="space-y-3">
                      {data.topRevenueAccounts.map((rev: any, idx: number) => {
                        const pct = data.ytdRevenue > 0 ? ((rev.amount / data.ytdRevenue) * 100).toFixed(1) : '0';
                        return (
                          <div key={rev.code} className="p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                            <div className="flex items-center justify-between text-xs mb-1.5">
                              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ background: REV_COLORS[idx % REV_COLORS.length] }} />
                                {rev.name}
                              </span>
                              <div className="text-right">
                                <span className="font-bold text-emerald-800">{formatRp(rev.amount)}</span>
                                <span className="text-[11px] text-slate-400 ml-1.5 font-medium">({pct}%)</span>
                              </div>
                            </div>
                            <div className="w-full h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, background: REV_COLORS[idx % REV_COLORS.length] }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Kas & Rekening Bank Highlight */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Landmark className="w-4 h-4 text-[#144f6b]" />
                        Likuiditas Kas &amp; Saldo Bank
                      </h3>
                      <span className="text-xs font-semibold text-[#144f6b] bg-sky-50 px-2 py-0.5 rounded-md">
                        {formatRp(data.liquidity?.totalLiquidAssets || data.totalAssets)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-4">
                      Saldo buku dari akun GL kas dan bank aktif per {data.asOfDate}.
                    </p>

                    <div className="space-y-2.5">
                      {/* Cash accounts */}
                      {(data.cashAccounts || []).map((c: any) => (
                        <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                              <Banknote className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-800">{c.name}</p>
                              <p className="text-[11px] text-slate-400">{c.location || 'Brankas'}</p>
                            </div>
                          </div>
                          <p className="text-xs font-bold text-slate-900">{formatRp(c.current_balance)}</p>
                        </div>
                      ))}

                      {/* Bank accounts */}
                      {(data.bankAccounts || []).slice(0, 2).map((b: any) => (
                        <div key={b.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center">
                              <Building2 className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-800">{b.account_name}</p>
                              <p className="text-[11px] text-slate-400">{b.bank_name} &bull; {b.account_number}</p>
                            </div>
                          </div>
                          <p className="text-xs font-bold text-slate-900">{formatRp(b.current_balance)}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Runway Operasional: <strong className="text-slate-800">{data.liquidity?.runwayMonths ?? 12} Bulan</strong>
                    </span>
                    <button
                      onClick={() => setActiveTab('kas-bank')}
                      className="text-xs font-semibold text-[#144f6b] hover:underline flex items-center gap-1"
                    >
                      Lihat Semua Rekening &rarr;
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 2: TREN ARUS KAS BULANAN ───────────────────────────── */}
          {activeTab === 'tren' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Analisis Arus Kas Bulanan Sepanjang Tahun Fiskal</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Evaluasi stabilitas penerimaan jemaat terhadap pemenuhan beban program dan pelayanan
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                      <span className="w-3 h-3 rounded-full bg-emerald-500" /> Penerimaan
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-700 font-medium">
                      <span className="w-3 h-3 rounded-full bg-rose-500" /> Pengeluaran
                    </span>
                    <span className="flex items-center gap-1.5 text-[#144f6b] font-medium">
                      <span className="w-3 h-3 rounded-full bg-[#144f6b]" /> Surplus Bersih
                    </span>
                  </div>
                </div>

                <div style={{ width: '100%', height: 350 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={formatRpShort} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={60} />
                      <Tooltip formatter={(v: any) => formatRp(v)} />
                      <Bar dataKey="Pendapatan" fill="#2f8f5b" radius={[4, 4, 0, 0]} maxBarSize={36} animationDuration={450} animationEasing="ease-out" />
                      <Bar dataKey="Beban" fill="#d1553f" radius={[4, 4, 0, 0]} maxBarSize={36} animationDuration={450} animationEasing="ease-out" />
                      <Line type="monotone" dataKey="Surplus" stroke="#144f6b" strokeWidth={3} dot={{ r: 5, fill: '#144f6b' }} animationDuration={450} animationEasing="ease-out" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Monthly Breakdown Table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">Tabel Rincian 12 Periode Fiskal</h4>
                  <span className="text-xs text-slate-400">Satuan Mata Uang: Rupiah (IDR)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-5 py-3">Periode</th>
                        <th className="px-5 py-3 text-right">Pendapatan</th>
                        <th className="px-5 py-3 text-right">Beban</th>
                        <th className="px-5 py-3 text-right">Surplus / (Defisit)</th>
                        <th className="px-5 py-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {chartData.map((m: any, idx: number) => {
                        const isSurplus = m.Surplus >= 0;
                        return (
                          <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-5 py-3 font-semibold text-slate-800">{m.fullName}</td>
                            <td className="px-5 py-3 text-right font-medium text-emerald-700">{formatRp(m.Pendapatan)}</td>
                            <td className="px-5 py-3 text-right font-medium text-rose-700">{formatRp(m.Beban)}</td>
                            <td className={`px-5 py-3 text-right font-bold ${isSurplus ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {formatRp(m.Surplus)}
                            </td>
                            <td className="px-5 py-3 text-center">
                              {m.Pendapatan > 0 || m.Beban > 0 ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Ada Transaksi
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                                  Nihil
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 3: POSISI KAS & BANK ───────────────────────────────── */}
          {activeTab === 'kas-bank' && (
            <div className="space-y-6">
              {/* Cash & Bank Matrix */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Donut of Liquid Assets */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <PieChartIcon className="w-4 h-4 text-[#144f6b]" />
                      Proporsi Aset Likuid
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Distribusi Kas Fisik vs Saldo Bank</p>

                    <div style={{ width: '100%', height: 180 }} className="my-2">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={liquidAssetComposition}
                            dataKey="amount"
                            nameKey="name"
                            innerRadius={45}
                            outerRadius={75}
                            paddingAngle={3}
                          >
                            {liquidAssetComposition.map((_: any, i: number) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: any) => formatRp(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="space-y-2 mt-2">
                      <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50">
                        <span className="text-slate-600 font-medium">Total Kas Tunai:</span>
                        <span className="font-bold text-slate-900">{formatRp(data.liquidity?.totalCash || 0)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50">
                        <span className="text-slate-600 font-medium">Total Saldo Bank:</span>
                        <span className="font-bold text-slate-900">{formatRp(data.liquidity?.totalBank || 0)}</span>
                      </div>
                    </div>
                  </div>

                  {onNavigate && canViewReconciliation && (
                    <button
                      onClick={() => onNavigate('finance-reconciliation')}
                      className="mt-4 w-full py-2 bg-slate-100 hover:bg-[#144f6b] hover:text-white text-slate-700 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5"
                    >
                      Buka Rekonsiliasi Bank <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Account Cards Grid */}
                <div className="lg:col-span-2 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-600" />
                    Detail Buku Kas &amp; Rekening Bank Aktif
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* Cash Boxes */}
                    {(data.cashAccounts || []).map((c: any) => (
                      <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs relative">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                              <Banknote className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-900">{c.name}</h4>
                              <p className="text-[11px] text-slate-400">{c.code} &bull; {c.location}</p>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                            Kas Fisik
                          </span>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-xs text-slate-400">Saldo Buku:</span>
                          <span className="text-sm font-bold text-slate-900">{formatRp(c.current_balance)}</span>
                        </div>
                      </div>
                    ))}

                    {/* Bank Accounts */}
                    {(data.bankAccounts || []).map((b: any) => (
                      <div key={b.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs relative">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center font-bold">
                              <Landmark className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-900">{b.account_name}</h4>
                              <p className="text-[11px] text-slate-400">{b.bank_name} &bull; {b.account_number}</p>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-[#144f6b]">
                            Bank
                          </span>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-xs text-slate-400">Saldo Buku:</span>
                          <span className="text-sm font-bold text-slate-900">{formatRp(b.current_balance)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 4: REALISASI ANGGARAN (RKA) ────────────────────────── */}
          {activeTab === 'anggaran' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Evaluasi Realisasi RKA {currentFiscalYear?.name || ''}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Perbandingan target anggaran belanja dan target penerimaan terhadap realisasi aktual per {data.asOfDate}
                    </p>
                  </div>
                  {onNavigate && canViewBudget && (
                    <button
                      onClick={() => onNavigate('finance-budget')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#144f6b] text-white text-xs font-medium hover:opacity-90 transition-all"
                    >
                      Buka RKA &amp; Anggaran <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4">
                  {/* Revenue Target Meter */}
                  <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-emerald-900">Realisasi Penerimaan Anggaran</span>
                      <span className="text-xs font-bold text-emerald-700">{data.budget?.revenueRealizationRate || 0}% Tercapai</span>
                    </div>
                    <div className="w-full h-3 bg-emerald-100 rounded-full overflow-hidden mb-3">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all"
                        style={{ width: `${Math.min(100, data.budget?.revenueRealizationRate || 0)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Realisasi: <strong>{formatRp(data.ytdRevenue)}</strong></span>
                      <span>Target RKA: <strong>{formatRp(data.budget?.totalBudgetRevenue || 0)}</strong></span>
                    </div>
                  </div>

                  {/* Expense Absorption Meter */}
                  <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-amber-900">Penyerapan Alokasi Belanja</span>
                      <span className="text-xs font-bold text-amber-700">{data.budget?.expenseAbsorptionRate || 0}% Terpakai</span>
                    </div>
                    <div className="w-full h-3 bg-amber-100 rounded-full overflow-hidden mb-3">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, data.budget?.expenseAbsorptionRate || 0)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Terealisasi: <strong>{formatRp(data.ytdExpense)}</strong></span>
                      <span>Pagu Anggaran: <strong>{formatRp(data.budget?.totalBudgetExpense || 0)}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-800">Catatan Pengendalian Anggaran Sinodal:</p>
                  <p>
                    &bull; Setiap transaksi dapat dihubungkan ke baris RKA yang sesuai agar realisasinya dapat ditelusuri.
                  </p>
                  <p>
                    &bull; Pagu RKA pada layar ini dipakai sebagai indikator realisasi; blokir otomatis atas anggaran belum diterapkan.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 5: ALUR AUDIT & TATA KELOLA ────────────────────────── */}
          {activeTab === 'tata-kelola' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <h3 className="text-base font-bold text-slate-900 mb-1">Audit Trail &amp; Status Antrian Transaksi</h3>
                <p className="text-xs text-slate-500 mb-6">
                  Distribusi siklus voucher transaksi keuangan GPIB Trinitas berdasarkan tahapan otorisasi.
                </p>

                {/* Workflow Pipeline Stepper */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                  {[
                    { status: 'DRAFT', label: 'Konsep (Draft)', count: data.statusCounts?.DRAFT || 0, color: 'bg-slate-100 text-slate-700 border-slate-200' },
                    { status: 'SUBMITTED', label: 'Diajukan', count: data.statusCounts?.SUBMITTED || 0, color: 'bg-amber-50 text-amber-700 border-amber-200' },
                    { status: 'VERIFIED', label: 'Diverifikasi', count: data.statusCounts?.VERIFIED || 0, color: 'bg-sky-50 text-[#144f6b] border-sky-200' },
                    { status: 'APPROVED', label: 'Disetujui KMJ', count: data.statusCounts?.APPROVED || 0, color: 'bg-purple-50 text-purple-700 border-purple-200' },
                    { status: 'POSTED', label: 'Dibukukan ke GL', count: data.statusCounts?.POSTED || 0, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                  ].map((s, idx) => (
                    <div key={s.status} className={`p-4 rounded-2xl border ${s.color} text-center`}>
                      <span className="text-[10px] font-bold uppercase tracking-wider block opacity-80 mb-1">Tahap {idx + 1}</span>
                      <h4 className="text-xs font-semibold">{s.label}</h4>
                      <p className="text-xl font-bold mt-2">{s.count}</p>
                    </div>
                  ))}
                </div>

                {/* Segregation of Duties Card */}
                <div className="p-4 rounded-2xl bg-sky-50/60 border border-sky-100 flex items-start gap-3.5">
                  <ShieldCheck className="w-6 h-6 text-[#144f6b] shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-700 space-y-1">
                    <p className="font-bold text-slate-900">Penegakan Segregation of Duties (Prinsip 4-Mata Sinodal)</p>
                    <p>
                      Sistem GEMAS memastikan transparansi penuh: pembuat transaksi (inputer) tidak diperkenankan memverifikasi atau menyetujui transaksinya sendiri.
                      Verifikator dan Penyetuju (Ketua / KMJ) harus pengguna yang berbeda sebelum Bendahara memposting jurnal ke Buku Besar.
                    </p>
                  </div>
                </div>

                {/* Quick Action Navigation Buttons */}
                {onNavigate && (
                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-3 flex-wrap">
                    {canViewReports && (
                      <button
                        onClick={() => onNavigate('finance-reports')}
                        className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-all inline-flex items-center gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5" /> Buka Laporan Keuangan
                      </button>
                    )}
                    {canViewLedger && (
                      <button
                        onClick={() => onNavigate('finance-ledger')}
                        className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-all"
                      >
                        Buka Buku Besar (GL)
                      </button>
                    )}
                    {canViewApproval && (
                      <button
                        onClick={() => onNavigate('finance-approval')}
                        className="px-4 py-2 rounded-xl bg-[#144f6b] text-white text-xs font-semibold hover:opacity-90 transition-all shadow-xs"
                      >
                        Buka Antrian Persetujuan
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
