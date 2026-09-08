// ============================================================
// FINANCE ADD-ON MODULE — Fase 9: Dashboard & Analitik
// ============================================================
// Ringkasan eksekutif satu Tahun Fiskal: KPI utama, tren Pendapatan vs
// Beban per bulan, top 5 akun Beban, dan status antrian transaksi — semua
// dari satu endpoint (financeDashboard.ts) yang menghitung ulang dari
// jurnal yang sudah diposting, tidak ada state tersendiri.
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../../lib/apiClient';
import { toast } from 'sonner';
import { LayoutDashboard, Loader2, Wallet, Scale3D, TrendingUp, TrendingDown, Inbox } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';

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

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]';
const labelCls = 'block text-xs font-medium text-slate-600 mb-1';
const PIE_COLORS = ['#1A77A3', '#0891b2', '#0d9488', '#65a30d', '#ca8a04'];

function KpiCard({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone?: 'default' | 'positive' | 'negative' }) {
  const color = tone === 'positive' ? '#166534' : tone === 'negative' ? '#991b1b' : '#1e293b';
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-slate-400 mb-1.5">
        <Icon className="w-4 h-4" /> <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-lg font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}

export function FinanceDashboard({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [fiscalYears, setFiscalYears] = useState<any[]>([]);
  const [fiscalYearId, setFiscalYearId] = useState('');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const years = await callApi<any[]>('/api/v1/finance/fiscal-years');
        setFiscalYears(years);
        setFiscalYearId(prev => prev || years.find((y: any) => y.is_current)?.id || years[0]?.id || '');
      } catch (err: any) {
        toast.error(err?.message || 'Gagal memuat Tahun Fiskal');
      } finally { setLoading(false); }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!fiscalYearId) return;
    setLoadingDashboard(true);
    try {
      setData(await callApi<any>(`/api/v1/finance/dashboard?fiscalYearId=${fiscalYearId}`));
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat dashboard keuangan');
    } finally { setLoadingDashboard(false); }
  }, [fiscalYearId]);
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat…</div>;
  }
  if (fiscalYears.length === 0) {
    return <div className="max-w-6xl mx-auto p-4 md:p-6"><p className="text-sm text-slate-500">Belum ada Tahun Fiskal — buat dulu lewat menu Master Data &amp; Fiskal.</p></div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          {onNavigate && (
            <button onClick={() => onNavigate('finance-addon')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#1A77A3] mb-1.5">
              &larr; Kembali ke Ringkasan Finance
            </button>
          )}
          <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5" style={{ color: '#1A77A3' }} /> Dashboard &amp; Analitik
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Ringkasan eksekutif keuangan — diperbarui real-time dari jurnal yang sudah diposting</p>
        </div>
        <div className="min-w-[180px]">
          <label className={labelCls}>Tahun Fiskal</label>
          <select value={fiscalYearId} onChange={e => setFiscalYearId(e.target.value)} className={inputCls}>
            {fiscalYears.map(fy => <option key={fy.id} value={fy.id}>{fy.name}{fy.is_current ? ' (Aktif)' : ''}</option>)}
          </select>
        </div>
      </div>

      {loadingDashboard && <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat…</div>}

      {!loadingDashboard && data && (
        <>
          <p className="text-xs text-slate-400">Per {data.asOfDate}</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={Wallet} label="Total Aset" value={formatRp(data.totalAssets)} />
            <KpiCard icon={Scale3D} label="Total Kewajiban" value={formatRp(data.totalLiabilities)} />
            <KpiCard icon={Wallet} label="Saldo Dana" value={formatRp(data.totalFundBalanceEffective)} />
            <KpiCard
              icon={data.ytdNetSurplus >= 0 ? TrendingUp : TrendingDown}
              label="Surplus/(Defisit) YTD"
              value={formatRp(data.ytdNetSurplus)}
              tone={data.ytdNetSurplus >= 0 ? 'positive' : 'negative'}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={TrendingUp} label="Pendapatan YTD" value={formatRp(data.ytdRevenue)} tone="positive" />
            <KpiCard icon={TrendingDown} label="Beban YTD" value={formatRp(data.ytdExpense)} tone="negative" />
            <KpiCard icon={Inbox} label="Menunggu Diproses" value={`${data.pendingApproval} transaksi`} />
            <KpiCard icon={Scale3D} label="Periode Ditutup" value={`${data.periodStatusCounts.CLOSED || 0} / 12`} />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">Tren Pendapatan vs Beban per Bulan</p>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={data.monthlyTrend.map((m: any) => ({ name: m.periodName.split(' ')[0], Pendapatan: m.revenue, Beban: m.expense }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={formatRpShort} tick={{ fontSize: 11 }} width={50} />
                    <Tooltip formatter={(v: any) => formatRp(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Pendapatan" fill="#1A77A3" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Beban" fill="#ef4444" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">Top 5 Akun Beban (YTD)</p>
              {data.topExpenseAccounts.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">Belum ada data Beban.</p>
              ) : (
                <>
                  <div style={{ width: '100%', height: 160 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={data.topExpenseAccounts} dataKey="amount" nameKey="name" innerRadius={35} outerRadius={60}>
                          {data.topExpenseAccounts.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => formatRp(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {data.topExpenseAccounts.map((a: any, i: number) => (
                      <li key={a.code} className="flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-slate-600 truncate flex-1">{a.name}</span>
                        <span className="font-medium text-slate-700 whitespace-nowrap">{formatRp(a.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
