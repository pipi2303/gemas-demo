import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../../lib/apiClient';
import { toast } from 'sonner';
import { ArrowLeft, BookOpen, Loader2, ScrollText, Scale } from 'lucide-react';

function formatRp(n: unknown) {
  const v = Number(n ?? 0);
  return `Rp ${v.toLocaleString('id-ID')}`;
}

interface PageMeta { total: number; page: number; pageSize: number; totalPages: number; totalDebit?: number; totalCredit?: number }

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  meta?: PageMeta;
  error?: { code: string; message: string };
}

async function callApi<T = any>(url: string): Promise<T> {
  const res = await (api as any).get<ApiResponse<T>>(url);
  if (!res.success) throw new Error(res.error?.message || 'Terjadi kesalahan');
  return res.data as T;
}

async function callApiPaged<T = any>(url: string): Promise<{ data: T; meta?: PageMeta }> {
  const res = await (api as any).get<ApiResponse<T>>(url);
  if (!res.success) throw new Error(res.error?.message || 'Terjadi kesalahan');
  return { data: res.data as T, meta: res.meta };
}

type Tab = 'entries' | 'trial-balance';

// ── Kartu Buku Besar per akun (mutasi + saldo berjalan) ─────────────────────────
function LedgerEntriesTab({ fiscalYearId, accounts }: { fiscalYearId: string; accounts: any[] }) {
  const postableAccounts = useMemo(() => accounts.filter(a => a.is_postable), [accounts]);
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [entriesMeta, setEntriesMeta] = useState<PageMeta | null>(null);

  const buildParams = useCallback((page: number) => {
    const params = new URLSearchParams({ fiscalYearId, page: String(page) });
    if (accountId) params.set('accountId', accountId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params;
  }, [fiscalYearId, accountId, from, to]);

  const load = useCallback(async () => {
    if (!fiscalYearId) return;
    setLoading(true);
    try {
      const { data, meta } = await callApiPaged<any[]>(`/api/v1/finance/gl/entries?${buildParams(1).toString()}`);
      setEntries(data);
      setEntriesMeta(meta ?? null);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat mutasi buku besar');
    } finally {
      setLoading(false);
    }
  }, [fiscalYearId, buildParams]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!entriesMeta || entriesMeta.page >= entriesMeta.totalPages) return;
    setLoadingMore(true);
    try {
      const nextPage = entriesMeta.page + 1;
      const { data, meta } = await callApiPaged<any[]>(`/api/v1/finance/gl/entries?${buildParams(nextPage).toString()}`);
      // Entries diurutkan tanggal ASC oleh backend dan halaman berikutnya di-append berurutan,
      // jadi perhitungan saldo berjalan (_running, di bawah) tetap benar walau dimuat bertahap.
      setEntries(prev => [...prev, ...data]);
      setEntriesMeta(meta ?? null);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat mutasi selanjutnya');
    } finally {
      setLoadingMore(false);
    }
  };

  const account = accounts.find(a => a.id === accountId);
  const rows = useMemo(() => {
    let running = 0;
    return entries.map(e => {
      const debit = Number(e.debit);
      const credit = Number(e.credit);
      // Saldo berjalan hanya bermakna saat difilter ke satu akun (normal_balance akun itu yang menentukan arah).
      if (accountId) {
        const delta = e.normal_balance === 'CREDIT' ? (credit - debit) : (debit - credit);
        running += delta;
      }
      return { ...e, _running: running };
    });
  }, [entries, accountId]);

  // Total diambil dari meta (dihitung backend atas SELURUH data yang lolos filter),
  // bukan dijumlah dari `entries` yang bisa jadi baru sebagian termuat (pagination).
  const totalDebit = entriesMeta?.totalDebit ?? entries.reduce((s, e) => s + Number(e.debit), 0);
  const totalCredit = entriesMeta?.totalCredit ?? entries.reduce((s, e) => s + Number(e.credit), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={accountId} onChange={e => setAccountId(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]">
          <option value="">— semua akun —</option>
          {postableAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" />
        <span className="text-xs text-slate-400">s/d</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 font-medium">Tanggal</th>
              <th className="px-4 py-2.5 font-medium">No. Jurnal</th>
              <th className="px-4 py-2.5 font-medium">No. Voucher</th>
              {!accountId && <th className="px-4 py-2.5 font-medium">Akun</th>}
              <th className="px-4 py-2.5 font-medium">Keterangan</th>
              <th className="px-4 py-2.5 font-medium text-right">Debit</th>
              <th className="px-4 py-2.5 font-medium text-right">Kredit</th>
              {accountId && <th className="px-4 py-2.5 font-medium text-right">Saldo Berjalan</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Memuat…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Belum ada jurnal terposting untuk filter ini.</td></tr>
            )}
            {!loading && rows.map(e => (
              <tr key={e.journal_line_id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{e.journal_date}</td>
                <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{e.journal_number}</td>
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{e.voucher_number}</td>
                {!accountId && <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{e.account_code} — {e.account_name}</td>}
                <td className="px-4 py-2 text-slate-500">{e.line_description || e.journal_description || '—'}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">{Number(e.debit) > 0 ? formatRp(e.debit) : ''}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">{Number(e.credit) > 0 ? formatRp(e.credit) : ''}</td>
                {accountId && <td className="px-4 py-2 text-right whitespace-nowrap font-medium">{formatRp(e._running)}</td>}
              </tr>
            ))}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 font-medium text-slate-800">
                <td className="px-4 py-2" colSpan={accountId ? (accountId ? 4 : 5) : 5}>Total</td>
                <td className="px-4 py-2 text-right">{formatRp(totalDebit)}</td>
                <td className="px-4 py-2 text-right">{formatRp(totalCredit)}</td>
                {accountId && <td />}
              </tr>
            </tfoot>
          )}
        </table>
        {entriesMeta && entriesMeta.page < entriesMeta.totalPages && (
          <div className="flex items-center justify-center py-3 border-t border-slate-100">
            <button onClick={loadMore} disabled={loadingMore}
              className="text-xs font-medium text-[#1A77A3] hover:underline disabled:opacity-50 flex items-center gap-1.5">
              {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Muat Lebih Banyak ({entries.length} dari {entriesMeta.total})
            </button>
          </div>
        )}
      </div>
      {account && (
        <p className="text-xs text-slate-400">Saldo normal akun {account.code} — {account.name}: {account.normal_balance === 'DEBIT' ? 'Debit' : 'Kredit'}</p>
      )}
    </div>
  );
}

// ── Neraca Saldo (Trial Balance) ─────────────────────────────────────────────────
function TrialBalanceTab({ fiscalYearId, periods }: { fiscalYearId: string; periods: any[] }) {
  const [periodId, setPeriodId] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!fiscalYearId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ fiscalYearId });
      if (periodId) params.set('periodId', periodId);
      const data = await callApi<any[]>(`/api/v1/finance/gl/trial-balance?${params.toString()}`);
      setRows(data);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghitung neraca saldo');
    } finally {
      setLoading(false);
    }
  }, [fiscalYearId, periodId]);

  useEffect(() => { load(); }, [load]);

  const totalDebit = rows.reduce((s, r) => s + Number(r.total_debit), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.total_credit), 0);
  const balanced = rows.length > 0 && totalDebit === totalCredit;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={periodId} onChange={e => setPeriodId(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]">
          <option value="">— seluruh Tahun Fiskal —</option>
          {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 font-medium">Kode</th>
              <th className="px-4 py-2.5 font-medium">Nama Akun</th>
              <th className="px-4 py-2.5 font-medium text-right">Total Debit</th>
              <th className="px-4 py-2.5 font-medium text-right">Total Kredit</th>
              <th className="px-4 py-2.5 font-medium text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Memuat…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Belum ada jurnal terposting untuk Tahun Fiskal ini.</td></tr>
            )}
            {!loading && rows.map(r => {
              const balance = r.normal_balance === 'DEBIT' ? Number(r.total_debit) - Number(r.total_credit) : Number(r.total_credit) - Number(r.total_debit);
              return (
                <tr key={r.account_id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{r.account_code}</td>
                  <td className="px-4 py-2 text-slate-700">{r.account_name}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{formatRp(r.total_debit)}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{formatRp(r.total_credit)}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap font-medium">{formatRp(balance)}</td>
                </tr>
              );
            })}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 font-medium text-slate-800">
                <td className="px-4 py-2" colSpan={2}>Total</td>
                <td className="px-4 py-2 text-right">{formatRp(totalDebit)}</td>
                <td className="px-4 py-2 text-right">{formatRp(totalCredit)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {rows.length > 0 && (
        <div className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 ${balanced ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' : 'text-red-700 bg-red-50 border border-red-200'}`}>
          <Scale className="w-3.5 h-3.5" />
          {balanced ? 'Neraca saldo seimbang — total debit = total kredit.' : 'Neraca saldo TIDAK seimbang — periksa jurnal terposting.'}
        </div>
      )}
    </div>
  );
}

// ── Halaman utama General Ledger ─────────────────────────────────────────────────
export function FinanceLedger({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [fiscalYears, setFiscalYears] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [lookupsError, setLookupsError] = useState<string | null>(null);
  const [fiscalYearId, setFiscalYearId] = useState('');
  const [tab, setTab] = useState<Tab>('entries');

  useEffect(() => {
    (async () => {
      setLoadingLookups(true);
      setLookupsError(null);
      try {
        const [fy, acc] = await Promise.all([
          callApi<any[]>('/api/v1/finance/fiscal-years'),
          callApi<any[]>('/api/v1/finance/accounts'),
        ]);
        setFiscalYears(fy);
        setAccounts(acc);
        setFiscalYearId(fy.find((f: any) => f.is_current)?.id || fy[0]?.id || '');
      } catch (err: any) {
        setLookupsError(err?.message || 'Gagal memuat data rujukan');
      } finally {
        setLoadingLookups(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!fiscalYearId) { setPeriods([]); return; }
    callApi<any[]>(`/api/v1/finance/fiscal-years/${fiscalYearId}/periods`).then(setPeriods).catch(() => setPeriods([]));
  }, [fiscalYearId]);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        {onNavigate && (
          <button onClick={() => onNavigate('finance-addon')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#1A77A3] mb-1.5">
            <ArrowLeft className="w-3 h-3" /> Kembali ke Ringkasan Finance
          </button>
        )}
        <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
          <BookOpen className="w-5 h-5" style={{ color: '#1A77A3' }} /> Buku Besar (General Ledger)
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Mutasi dan saldo dari jurnal yang sudah diposting — hasil mesin akuntansi Fase 4</p>
      </div>

      {lookupsError && <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{lookupsError}</div>}

      {!lookupsError && !loadingLookups && fiscalYears.length === 0 && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Belum ada Tahun Fiskal. Buat Tahun Fiskal dulu di Master Data &amp; Periode Fiskal.
        </div>
      )}

      {!lookupsError && fiscalYears.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Tahun Fiskal:</label>
              <select value={fiscalYearId} onChange={e => setFiscalYearId(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]">
                {fiscalYears.map(fy => <option key={fy.id} value={fy.id}>{fy.name}{fy.is_current ? ' (Aktif)' : ''}</option>)}
              </select>
            </div>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              <button onClick={() => setTab('entries')}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md"
                style={tab === 'entries' ? { background: '#fff', color: '#1A77A3' } : { color: '#64748b' }}>
                <ScrollText className="w-3.5 h-3.5" /> Mutasi
              </button>
              <button onClick={() => setTab('trial-balance')}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md"
                style={tab === 'trial-balance' ? { background: '#fff', color: '#1A77A3' } : { color: '#64748b' }}>
                <Scale className="w-3.5 h-3.5" /> Neraca Saldo
              </button>
            </div>
          </div>

          {tab === 'entries'
            ? <LedgerEntriesTab fiscalYearId={fiscalYearId} accounts={accounts} />
            : <TrialBalanceTab fiscalYearId={fiscalYearId} periods={periods} />}
        </>
      )}
    </div>
  );
}
