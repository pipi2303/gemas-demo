// ============================================================
// FINANCE ADD-ON MODULE — Fase 7: Penutupan Periode
// ============================================================
// Checklist penutupan periode dihitung ulang di server setiap saat (lihat
// financePeriodClosing.ts) — halaman ini murni menampilkannya dan memicu
// aksi tutup/buka kembali. Begitu periode berstatus CLOSED, seluruh mesin
// transaksi (create/post/reverse) otomatis menolak periode itu karena semua
// menolak periode yang status-nya bukan OPEN — tidak ada logika tambahan
// yang perlu diduplikasi di sini.
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../../lib/apiClient';
import { toast } from 'sonner';
import { CalendarCheck, Loader2, CheckCircle2, XCircle, Lock, LockOpen, X } from 'lucide-react';

const FINANCE_MODULE = 'Keuangan (Finance Add-on)';

function formatRp(n: unknown) {
  const v = Number(n ?? 0);
  return `Rp ${v.toLocaleString('id-ID')}`;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function callApi<T = any>(method: 'get' | 'post' | 'put' | 'delete', url: string, body?: any): Promise<T> {
  const res = method === 'get' || method === 'delete'
    ? await (api as any)[method]<ApiResponse<T>>(url)
    : await (api as any)[method]<ApiResponse<T>>(url, body ?? {});
  if (!res.success) throw new Error(res.error?.message || 'Terjadi kesalahan');
  return res.data as T;
}

const btnPrimary = 'flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-lg disabled:opacity-50';
const btnSecondary = 'flex items-center gap-1.5 text-sm font-medium text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50';
const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]';
const labelCls = 'block text-xs font-medium text-slate-600 mb-1';

function PeriodStatusBadge({ status }: { status: string }) {
  const meta: Record<string, { label: string; color: string; bg: string; border: string }> = {
    OPEN:        { label: 'Terbuka',  color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
    SOFT_CLOSED: { label: 'Soft Closed', color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
    CLOSED:      { label: 'Ditutup',  color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
    LOCKED:      { label: 'Terkunci', color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
  };
  const m = meta[status] || meta.OPEN;
  return <span className="inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5" style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}` }}>{m.label}</span>;
}

function ChecklistRow({ pass, title, children }: { pass: boolean; title: string; children?: React.ReactNode }) {
  return (
    <div className="p-3 flex items-start gap-2.5">
      {pass ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${pass ? 'text-slate-700' : 'text-amber-700'}`}>{title}</p>
        {children}
      </div>
    </div>
  );
}

function ReopenModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!reason.trim()) { toast.error('Alasan wajib diisi'); return; }
    setSaving(true);
    try { await onConfirm(reason.trim()); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Buka Kembali Periode</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div>
          <label className={labelCls}>Alasan <span className="text-red-500">*</span></label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className={inputCls} placeholder="Mis. ada transaksi susulan yang perlu dikoreksi" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={saving} className={btnSecondary}>Batal</button>
          <button onClick={submit} disabled={saving} className={btnPrimary} style={{ background: '#b45309' }}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Buka Kembali
          </button>
        </div>
      </div>
    </div>
  );
}

function PeriodDetail({ periodId, canApprove, canEdit, onBack, onChanged }: {
  periodId: string; canApprove: boolean; canEdit: boolean; onBack: () => void; onChanged: () => void;
}) {
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showReopen, setShowReopen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callApi<any>('get', `/api/v1/finance/period-closing/${periodId}`);
      setDetail(data);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat checklist penutupan periode');
    } finally { setLoading(false); }
  }, [periodId]);

  useEffect(() => { load(); }, [load]);

  const toggleBudgetReview = async (checked: boolean) => {
    setBusy('checklist');
    try {
      await callApi('put', `/api/v1/finance/period-closing/${periodId}/checklist`, { key: 'budget_reviewed', checked });
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan checklist');
    } finally { setBusy(null); }
  };

  const closePeriod = async () => {
    setBusy('close');
    try {
      await callApi('put', `/api/v1/finance/period-closing/${periodId}/close`, {});
      toast.success('Periode berhasil ditutup');
      await load(); onChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menutup periode');
    } finally { setBusy(null); }
  };

  const reopenPeriod = async (reason: string) => {
    try {
      await callApi('put', `/api/v1/finance/period-closing/${periodId}/reopen`, { reason });
      toast.success('Periode berhasil dibuka kembali');
      setShowReopen(false);
      await load(); onChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal membuka kembali periode');
    }
  };

  if (loading || !detail) {
    return <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat…</div>;
  }

  const { period, items, canClose } = detail;
  const isOpen = period.status === 'OPEN';
  const isClosed = period.status === 'CLOSED';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs text-slate-400 hover:text-[#1A77A3]">&larr; Kembali ke daftar periode</button>
        <PeriodStatusBadge status={period.status} />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-800">{period.name}</h2>
        <p className="text-sm text-slate-500">{period.start_date} s/d {period.end_date}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-50">
        <ChecklistRow pass={items.transactionsFinalized.pass} title="Semua transaksi sudah final (Posted/Reversed/Cancelled)">
          {!items.transactionsFinalized.pass && (
            <ul className="mt-1.5 space-y-0.5">
              {items.transactionsFinalized.openTransactions.map((t: any) => (
                <li key={t.id} className="text-xs text-slate-500">{t.voucher_number} — {t.description} <span className="text-amber-600">({t.status})</span></li>
              ))}
            </ul>
          )}
        </ChecklistRow>
        <ChecklistRow pass={items.bankReconciliationApproved.pass} title="Semua Rekening Bank sudah direkonsiliasi & disetujui">
          {!items.bankReconciliationApproved.pass && (
            <ul className="mt-1.5 space-y-0.5">
              {items.bankReconciliationApproved.unreconciledBanks.map((b: any) => (
                <li key={b.bank_account_id} className="text-xs text-slate-500">{b.bank_name} — {b.account_number} <span className="text-amber-600">({b.reconciliation_status || 'belum ada sesi'})</span></li>
              ))}
            </ul>
          )}
        </ChecklistRow>
        <ChecklistRow pass={items.trialBalanceOk.pass} title="Neraca saldo jurnal periode ini balance">
          <p className="text-xs text-slate-500 mt-0.5">Debit {formatRp(items.trialBalanceOk.totalDebit)} — Kredit {formatRp(items.trialBalanceOk.totalCredit)}</p>
        </ChecklistRow>
        <div className="p-3 flex items-start gap-2.5">
          <input
            type="checkbox" className="mt-1" checked={items.budgetReviewed.pass} disabled={!isOpen || !canEdit || busy !== null}
            onChange={e => toggleBudgetReview(e.target.checked)}
          />
          <div>
            <p className="text-sm font-medium text-slate-700">Review Anggaran (RKA) untuk periode ini sudah dilakukan</p>
            <p className="text-xs text-slate-400 mt-0.5">Dicentang manual — sinkronisasi otomatis anggaran-vs-realisasi belum tersedia di modul ini.</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        {isOpen && canApprove && (
          <button
            onClick={closePeriod} disabled={busy !== null || !canClose}
            title={!canClose ? 'Semua item checklist harus terpenuhi dulu' : ''}
            className={btnPrimary} style={{ background: '#1A77A3' }}
          >
            {busy === 'close' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} Tutup Periode
          </button>
        )}
        {isClosed && canApprove && (
          <button onClick={() => setShowReopen(true)} disabled={busy !== null} className={btnSecondary}>
            <LockOpen className="w-3.5 h-3.5" /> Buka Kembali
          </button>
        )}
      </div>

      {showReopen && <ReopenModal onClose={() => setShowReopen(false)} onConfirm={reopenPeriod} />}
    </div>
  );
}

export function FinancePeriodClosing({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { can: canFn } = useApp();
  const canEdit = canFn(FINANCE_MODULE, 'edit');
  const canApprove = canFn(FINANCE_MODULE, 'approve');

  const [fiscalYears, setFiscalYears] = useState<any[]>([]);
  const [fiscalYearId, setFiscalYearId] = useState('');
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const years = await callApi<any[]>('get', '/api/v1/finance/fiscal-years');
        setFiscalYears(years);
        setFiscalYearId(prev => prev || years.find((y: any) => y.is_current)?.id || years[0]?.id || '');
      } catch (err: any) {
        toast.error(err?.message || 'Gagal memuat Tahun Fiskal');
      } finally { setLoading(false); }
    })();
  }, []);

  const loadPeriods = useCallback(async () => {
    if (!fiscalYearId) return;
    setLoadingPeriods(true);
    try {
      const data = await callApi<any[]>('get', `/api/v1/finance/period-closing?fiscalYearId=${fiscalYearId}`);
      setPeriods(data);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat daftar periode');
    } finally { setLoadingPeriods(false); }
  }, [fiscalYearId]);

  useEffect(() => { loadPeriods(); }, [loadPeriods]);

  if (loading) {
    return <div className="max-w-5xl mx-auto p-6 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat…</div>;
  }

  if (fiscalYears.length === 0) {
    return <div className="max-w-5xl mx-auto p-4 md:p-6"><p className="text-sm text-slate-500">Belum ada Tahun Fiskal — buat dulu lewat menu Master Data & Fiskal.</p></div>;
  }

  if (selectedPeriodId) {
    return (
      <div className="max-w-5xl mx-auto p-4 md:p-6">
        <PeriodDetail periodId={selectedPeriodId} canApprove={canApprove} canEdit={canEdit} onBack={() => setSelectedPeriodId(null)} onChanged={loadPeriods} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        {onNavigate && (
          <button onClick={() => onNavigate('finance-addon')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#1A77A3] mb-1.5">
            &larr; Kembali ke Ringkasan Finance Add-on
          </button>
        )}
        <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
          <CalendarCheck className="w-5 h-5" style={{ color: '#1A77A3' }} /> Penutupan Periode
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Tutup buku setiap periode setelah semua transaksi final, rekening bank direkonsiliasi, dan anggaran direview</p>
      </div>

      <div>
        <label className={labelCls}>Tahun Fiskal</label>
        <select value={fiscalYearId} onChange={e => setFiscalYearId(e.target.value)} className={inputCls + ' max-w-xs'}>
          {fiscalYears.map(fy => <option key={fy.id} value={fy.id}>{fy.name}{fy.is_current ? ' (Aktif)' : ''}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 font-medium">Periode</th>
              <th className="px-4 py-2.5 font-medium">Rentang Tanggal</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Ditutup Oleh</th>
            </tr>
          </thead>
          <tbody>
            {loadingPeriods && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Memuat…</td></tr>
            )}
            {!loadingPeriods && periods.map(p => (
              <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer" onClick={() => setSelectedPeriodId(p.id)}>
                <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{p.name}</td>
                <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{p.start_date} s/d {p.end_date}</td>
                <td className="px-4 py-2.5"><PeriodStatusBadge status={p.status} /></td>
                <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{p.closed_by || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
