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
import { FileBarChart, Loader2, Scale, TrendingUp, PieChart } from 'lucide-react';

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

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]';
const labelCls = 'block text-xs font-medium text-slate-600 mb-1';

type Tab = 'balance-sheet' | 'activity-statement' | 'budget-realization';

function todayStr() { return new Date().toISOString().slice(0, 10); }

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

  return (
    <div className="space-y-4">
      <div><label className={labelCls}>Per Tanggal</label>
        <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className={inputCls + ' max-w-xs'} /></div>
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

  return (
    <div className="space-y-4">
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

  return (
    <div className="space-y-4">
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

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'balance-sheet', label: 'Neraca', icon: Scale },
    { key: 'activity-statement', label: 'Laporan Aktivitas', icon: TrendingUp },
    { key: 'budget-realization', label: 'Realisasi Anggaran', icon: PieChart },
  ];

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        {onNavigate && (
          <button onClick={() => onNavigate('finance-addon')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#1A77A3] mb-1.5">
            &larr; Kembali ke Ringkasan Finance
          </button>
        )}
        <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
          <FileBarChart className="w-5 h-5" style={{ color: '#1A77A3' }} /> Laporan Keuangan
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Neraca, Laporan Aktivitas, dan Realisasi Anggaran — dihitung langsung dari jurnal yang sudah diposting</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(t => (
          <button
            key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-[#1A77A3] text-[#1A77A3]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat…</div>}
      {!loading && fiscalYears.length === 0 && <p className="text-sm text-slate-500">Belum ada Tahun Fiskal — buat dulu lewat menu Master Data & Fiskal.</p>}
      {!loading && fiscalYears.length > 0 && (
        <>
          {tab === 'balance-sheet' && <BalanceSheetTab />}
          {tab === 'activity-statement' && <ActivityStatementTab funds={funds} />}
          {tab === 'budget-realization' && <BudgetRealizationTab fiscalYears={fiscalYears} periodsByFy={periodsByFy} />}
        </>
      )}
    </div>
  );
}
