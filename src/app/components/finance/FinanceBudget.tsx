import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../../lib/apiClient';
import { toast } from 'sonner';
import {
  Plus, X, Loader2, ArrowLeft, ClipboardList, Send, CheckCircle2, XCircle,
  Trash2, Copy,
} from 'lucide-react';
import { FinancePageHeader } from './FinancePageHeader';

const FINANCE_MODULE = 'Finance Add-on (Standar Akuntansi)';

function formatRp(n: unknown) {
  const v = Number(n ?? 0);
  return `Rp ${v.toLocaleString('id-ID')}`;
}

interface PageMeta { total: number; page: number; pageSize: number; totalPages: number }

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  meta?: PageMeta;
  error?: { code: string; message: string };
}

async function callApi<T = any>(method: 'get' | 'post' | 'put' | 'delete', url: string, body?: any): Promise<T> {
  const res = method === 'get' || method === 'delete'
    ? await (api as any)[method]<ApiResponse<T>>(url)
    : await (api as any)[method]<ApiResponse<T>>(url, body ?? {});
  if (!res.success) throw new Error(res.error?.message || 'Terjadi kesalahan');
  return res.data as T;
}

async function callApiPaged<T = any>(url: string): Promise<{ data: T; meta?: PageMeta }> {
  const res = await (api as any).get<ApiResponse<T>>(url);
  if (!res.success) throw new Error(res.error?.message || 'Terjadi kesalahan');
  return { data: res.data as T, meta: res.meta };
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  DRAFT:     { label: 'Draft',            color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' },
  SUBMITTED: { label: 'Diajukan',         color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  REVIEWED:  { label: 'Direview',         color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
  APPROVED:  { label: 'Disetujui',        color: '#3730a3', bg: '#eef2ff', border: '#c7d2fe' },
  ACTIVE:    { label: 'Aktif',            color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  REVISED:   { label: 'Direvisi (lama)',  color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  CANCELLED: { label: 'Dibatalkan',       color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.DRAFT;
  return (
    <span
      className="inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5"
      style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}
    >
      {meta.label}
    </span>
  );
}

interface Lookups {
  fiscalYears: any[];
  accounts: any[];
  fields: any[];
  programs: any[];
  activities: any[];
  funds: any[];
}

// ── Detail RKA: baris anggaran + alur kerja ────────────────────────────────────
function BudgetDetail({
  budget, canEdit, canApprove, canCreate, lookups, onBack, onChanged,
}: {
  budget: any; canEdit: boolean; canApprove: boolean; canCreate: boolean; lookups: Lookups;
  onBack: () => void; onChanged: (updated?: any) => void;
}) {
  const [current, setCurrent] = useState(budget);
  const [lines, setLines] = useState<any[]>([]);
  const [loadingLines, setLoadingLines] = useState(true);
  const [periods, setPeriods] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [applyAllPeriods, setApplyAllPeriods] = useState(false);

  const postableAccounts = lookups.accounts.filter(a => a.is_postable);

  const loadLines = useCallback(async () => {
    setLoadingLines(true);
    try {
      const data = await callApi<any[]>('get', `/api/v1/finance/budgets/${current.id}/lines`);
      setLines(data);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat baris RKA');
    } finally {
      setLoadingLines(false);
    }
  }, [current.id]);

  useEffect(() => { loadLines(); }, [loadLines]);

  useEffect(() => {
    (async () => {
      try {
        const data = await callApi<any[]>('get', `/api/v1/finance/fiscal-years/${current.fiscal_year_id}/periods`);
        setPeriods(data);
      } catch {
        setPeriods([]);
      }
    })();
  }, [current.fiscal_year_id]);

  const totalBudget = useMemo(() => lines.reduce((sum, l) => sum + Number(l.budget_amount ?? 0), 0), [lines]);
  const isDraft = current.status === 'DRAFT';

  const resetForm = () => {
    setForm({ account_id: '', field_id: '', program_id: '', activity_id: '', fund_id: '', period_id: '', description: '', budget_amount: '' });
    setApplyAllPeriods(false);
  };

  const openAddLine = () => { resetForm(); setModalOpen(true); };

  const handleAddLine = async () => {
    if (!form.account_id || (!applyAllPeriods && !form.period_id)) {
      toast.error('Akun dan Periode wajib diisi (atau centang "Terapkan ke semua periode")');
      return;
    }
    if (form.budget_amount === '' || Number(form.budget_amount) < 0) {
      toast.error('Jumlah anggaran tidak valid');
      return;
    }
    setSaving(true);
    try {
      const base = {
        account_id: form.account_id,
        field_id: form.field_id || undefined,
        program_id: form.program_id || undefined,
        activity_id: form.activity_id || undefined,
        fund_id: form.fund_id || undefined,
        description: form.description || undefined,
        budget_amount: Number(form.budget_amount),
      };
      if (applyAllPeriods) {
        for (const p of periods) {
          await callApi('post', `/api/v1/finance/budgets/${current.id}/lines`, { ...base, period_id: p.id });
        }
        toast.success(`Baris ditambahkan ke ${periods.length} periode`);
      } else {
        await callApi('post', `/api/v1/finance/budgets/${current.id}/lines`, { ...base, period_id: form.period_id });
        toast.success('Baris RKA ditambahkan');
      }
      setModalOpen(false);
      await loadLines();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menambah baris');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLine = async (lineId: string) => {
    try {
      await callApi('delete', `/api/v1/finance/budgets/${current.id}/lines/${lineId}`);
      toast.success('Baris dihapus');
      await loadLines();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus baris');
    }
  };

  const runAction = async (action: 'submit' | 'approve' | 'activate' | 'reject', body?: any) => {
    setBusyAction(action);
    try {
      const updated = await callApi('put', `/api/v1/finance/budgets/${current.id}/${action}`, body);
      setCurrent(updated);
      onChanged(updated);
      const doneMsg: Record<string, string> = {
        submit: 'RKA diajukan untuk persetujuan',
        approve: 'RKA disetujui',
        activate: 'RKA diaktifkan sebagai anggaran berjalan',
        reject: 'RKA dikembalikan ke Draft',
      };
      toast.success(doneMsg[action]);
      if (action === 'reject') { setRejectOpen(false); setRejectReason(''); }
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memproses aksi');
    } finally {
      setBusyAction(null);
    }
  };

  const accountName = (id: string) => lookups.accounts.find(a => a.id === id)?.name ?? '—';
  const fieldName = (id: string) => lookups.fields.find(f => f.id === id)?.name ?? '—';
  const programName = (id: string) => lookups.programs.find(p => p.id === id)?.name ?? '—';
  const activityName = (id: string) => lookups.activities.find(a => a.id === id)?.name ?? '—';
  const fundName = (id: string) => lookups.funds.find(f => f.id === id)?.name ?? '—';
  const periodName = (id: string) => periods.find(p => p.id === id)?.name ?? '—';

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#144f6b]">
        <ArrowLeft className="w-3 h-3" /> Kembali ke daftar RKA
      </button>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-semibold text-slate-800">{current.name}</h2>
              <StatusBadge status={current.status} />
            </div>
            <p className="text-xs text-slate-500">{current.code} · Versi {current.version}</p>
            {current.revision_reason && current.status === 'DRAFT' && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2 max-w-md">
                Dikembalikan: {current.revision_reason}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {isDraft && canEdit && (
              <button
                onClick={() => runAction('submit')}
                disabled={busyAction !== null}
                className="flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-lg disabled:opacity-60"
                style={{ background: '#144f6b' }}
              >
                {busyAction === 'submit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Ajukan
              </button>
            )}
            {current.status === 'SUBMITTED' && canApprove && (
              <>
                <button
                  onClick={() => runAction('approve')}
                  disabled={busyAction !== null}
                  className="flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-lg disabled:opacity-60 bg-emerald-600 hover:bg-emerald-700"
                >
                  {busyAction === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Setujui
                </button>
                <button
                  onClick={() => setRejectOpen(true)}
                  disabled={busyAction !== null}
                  className="flex items-center gap-1.5 text-sm font-medium text-red-600 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 disabled:opacity-60"
                >
                  <XCircle className="w-3.5 h-3.5" /> Kembalikan
                </button>
              </>
            )}
            {current.status === 'APPROVED' && canApprove && (
              <button
                onClick={() => runAction('activate')}
                disabled={busyAction !== null}
                className="flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-lg disabled:opacity-60 bg-emerald-600 hover:bg-emerald-700"
              >
                {busyAction === 'activate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Aktifkan
              </button>
            )}
          </div>
        </div>
      </div>

      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => setRejectOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-800">Kembalikan RKA ke Draft</h3>
            <textarea
              value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
              placeholder="Alasan pengembalian…"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejectOpen(false)} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200">Batal</button>
              <button
                onClick={() => runAction('reject', { reason: rejectReason })}
                disabled={!rejectReason.trim() || busyAction !== null}
                className="px-3 py-1.5 rounded-lg text-sm text-white bg-red-500 hover:bg-red-600 disabled:opacity-60"
              >
                Kembalikan
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Baris Anggaran</h3>
          {isDraft && canEdit && (
            <button
              onClick={openAddLine}
              className="flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-lg hover:opacity-90"
              style={{ background: '#144f6b' }}
            >
              <Plus className="w-3.5 h-3.5" /> Tambah Baris
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-3 py-2 font-medium">Akun</th>
                <th className="px-3 py-2 font-medium">Bidang/Program/Kegiatan</th>
                <th className="px-3 py-2 font-medium">Dana</th>
                <th className="px-3 py-2 font-medium">Periode</th>
                <th className="px-3 py-2 font-medium text-right">Jumlah</th>
                {isDraft && canEdit && <th className="px-3 py-2 font-medium text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loadingLines && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Memuat…</td></tr>
              )}
              {!loadingLines && lines.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Belum ada baris anggaran.</td></tr>
              )}
              {!loadingLines && lines.map(line => (
                <tr key={line.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{accountName(line.account_id)}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                    {[line.field_id && fieldName(line.field_id), line.program_id && programName(line.program_id), line.activity_id && activityName(line.activity_id)]
                      .filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{line.fund_id ? fundName(line.fund_id) : '—'}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{periodName(line.period_id)}</td>
                  <td className="px-3 py-2 text-slate-700 text-right whitespace-nowrap">{formatRp(line.budget_amount)}</td>
                  {isDraft && canEdit && (
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => handleDeleteLine(line.id)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {!loadingLines && lines.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 font-medium text-slate-800">
                  <td className="px-3 py-2" colSpan={4}>Total</td>
                  <td className="px-3 py-2 text-right">{formatRp(totalBudget)}</td>
                  {isDraft && canEdit && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => !saving && setModalOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Tambah Baris Anggaran</h3>
              <button onClick={() => setModalOpen(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Akun <span className="text-red-500">*</span></label>
              <select value={form.account_id ?? ''} onChange={e => setForm(prev => ({ ...prev, account_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]">
                <option value="">— pilih akun —</option>
                {postableAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Bidang</label>
                <select value={form.field_id ?? ''} onChange={e => setForm(prev => ({ ...prev, field_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]">
                  <option value="">—</option>
                  {lookups.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Program</label>
                <select value={form.program_id ?? ''} onChange={e => setForm(prev => ({ ...prev, program_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]">
                  <option value="">—</option>
                  {lookups.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Kegiatan</label>
                <select value={form.activity_id ?? ''} onChange={e => setForm(prev => ({ ...prev, activity_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]">
                  <option value="">—</option>
                  {lookups.activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Dana</label>
                <select value={form.fund_id ?? ''} onChange={e => setForm(prev => ({ ...prev, fund_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]">
                  <option value="">—</option>
                  {lookups.funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Jumlah Anggaran <span className="text-red-500">*</span></label>
              <input
                type="number" value={form.budget_amount ?? ''}
                onChange={e => setForm(prev => ({ ...prev, budget_amount: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Deskripsi</label>
              <input
                type="text" value={form.description ?? ''}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={applyAllPeriods} onChange={e => setApplyAllPeriods(e.target.checked)} />
              <Copy className="w-3.5 h-3.5" /> Terapkan jumlah yang sama ke semua {periods.length} periode
            </label>

            {!applyAllPeriods && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Periode <span className="text-red-500">*</span></label>
                <select value={form.period_id ?? ''} onChange={e => setForm(prev => ({ ...prev, period_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]">
                  <option value="">— pilih periode —</option>
                  {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalOpen(false)} disabled={saving} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200">Batal</button>
              <button
                onClick={handleAddLine} disabled={saving}
                className="px-3 py-1.5 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60"
                style={{ background: '#144f6b' }}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Halaman utama Budget / RKA ──────────────────────────────────────────────────
export function FinanceBudget({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { can: canFn } = useApp();
  const canEdit = canFn(FINANCE_MODULE, 'edit');
  const canApprove = canFn(FINANCE_MODULE, 'approve');
  const canCreate = canFn(FINANCE_MODULE, 'create');

  const [lookups, setLookups] = useState<Lookups>({ fiscalYears: [], accounts: [], fields: [], programs: [], activities: [], funds: [] });
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [lookupsError, setLookupsError] = useState<string | null>(null);
  const [selectedFiscalYearId, setSelectedFiscalYearId] = useState<string>('');
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loadingBudgets, setLoadingBudgets] = useState(true);
  const [loadingMoreBudgets, setLoadingMoreBudgets] = useState(false);
  const [budgetsMeta, setBudgetsMeta] = useState<PageMeta | null>(null);
  const [selectedBudget, setSelectedBudget] = useState<any | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ code: '', name: '' });
  const [creating, setCreating] = useState(false);

  const loadLookups = useCallback(async () => {
    setLookupsLoading(true);
    setLookupsError(null);
    try {
      const [fiscalYears, accounts, fields, programs, activities, funds] = await Promise.all([
        callApi<any[]>('get', '/api/v1/finance/fiscal-years'),
        callApi<any[]>('get', '/api/v1/finance/accounts'),
        callApi<any[]>('get', '/api/v1/finance/fields'),
        callApi<any[]>('get', '/api/v1/finance/programs'),
        callApi<any[]>('get', '/api/v1/finance/activities'),
        callApi<any[]>('get', '/api/v1/finance/funds'),
      ]);
      setLookups({ fiscalYears, accounts, fields, programs, activities, funds });
      setSelectedFiscalYearId(prev => prev || fiscalYears.find(fy => fy.is_current)?.id || fiscalYears[0]?.id || '');
    } catch (err: any) {
      setLookupsError(err?.message || 'Gagal memuat data rujukan. Pastikan Master Data & Tahun Fiskal (Fase 1) sudah diisi.');
    } finally {
      setLookupsLoading(false);
    }
  }, []);

  useEffect(() => { loadLookups(); }, [loadLookups]);

  const loadBudgets = useCallback(async () => {
    if (!selectedFiscalYearId) { setBudgets([]); setBudgetsMeta(null); setLoadingBudgets(false); return; }
    setLoadingBudgets(true);
    try {
      const { data, meta } = await callApiPaged<any[]>(`/api/v1/finance/budgets?fiscalYearId=${selectedFiscalYearId}&page=1`);
      setBudgets(data);
      setBudgetsMeta(meta ?? null);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat daftar RKA');
    } finally {
      setLoadingBudgets(false);
    }
  }, [selectedFiscalYearId]);

  useEffect(() => { loadBudgets(); }, [loadBudgets]);

  const loadMoreBudgets = async () => {
    if (!budgetsMeta || budgetsMeta.page >= budgetsMeta.totalPages) return;
    setLoadingMoreBudgets(true);
    try {
      const nextPage = budgetsMeta.page + 1;
      const { data, meta } = await callApiPaged<any[]>(`/api/v1/finance/budgets?fiscalYearId=${selectedFiscalYearId}&page=${nextPage}`);
      setBudgets(prev => [...prev, ...data]);
      setBudgetsMeta(meta ?? null);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat RKA selanjutnya');
    } finally {
      setLoadingMoreBudgets(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.code.trim() || !createForm.name.trim()) {
      toast.error('Kode dan nama RKA wajib diisi');
      return;
    }
    setCreating(true);
    try {
      const created = await callApi<any>('post', '/api/v1/finance/budgets', { ...createForm, fiscal_year_id: selectedFiscalYearId });
      toast.success('RKA baru dibuat sebagai Draft');
      setCreateOpen(false);
      setCreateForm({ code: '', name: '' });
      await loadBudgets();
      setSelectedBudget(created);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal membuat RKA');
    } finally {
      setCreating(false);
    }
  };

  const handleCancelBudget = async (b: any) => {
    try {
      await callApi('delete', `/api/v1/finance/budgets/${b.id}`);
      toast.success('RKA dibatalkan');
      await loadBudgets();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal membatalkan RKA');
    }
  };

  if (selectedBudget) {
    return (
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <BudgetDetail
          budget={selectedBudget}
          canEdit={canEdit}
          canApprove={canApprove}
          canCreate={canCreate}
          lookups={lookups}
          onBack={() => { setSelectedBudget(null); loadBudgets(); }}
          onChanged={updated => setSelectedBudget(updated)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <FinancePageHeader
        title="Rencana Kerja & Anggaran (RKA)"
        currentSection="Budget & RKA"
        onNavigate={onNavigate}
        fiscalYears={lookups.fiscalYears}
        fiscalYearId={selectedFiscalYearId}
        onFiscalYearChange={setSelectedFiscalYearId}
        onRefresh={loadBudgets}
        isRefreshing={loadingBudgets}
        systemBadge="Standar RKA Sinodal"
        metaBadge="Kontrol Plafon Anggaran"
        primaryAction={
          canCreate
            ? {
                label: '+ Buat RKA Baru',
                icon: Plus,
                onClick: () => setCreateOpen(true),
              }
            : undefined
        }
        infoStrip={[
          {
            label: 'Total Dokumen RKA',
            value: budgetsMeta ? `${budgetsMeta.total} Dokumen` : `${budgets.length} Dokumen`,
            color: 'emerald',
          },
          {
            label: 'Cakupan Pelayanan',
            value: `${lookups.fields.length} Bidang Sinodal`,
            color: 'sky',
          },
          {
            label: 'Alur Penetapan',
            value: 'Draft → Ajukan → Sidang PHMJ',
            color: 'indigo',
          },
          {
            label: 'Plafon Realisasi',
            value: 'Monitoring Real-time',
            color: 'teal',
          },
        ]}
      />

      {lookupsError && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{lookupsError}</div>
      )}

      {!lookupsError && !lookupsLoading && lookups.fiscalYears.length === 0 && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Belum ada Tahun Fiskal. Buat Tahun Fiskal dulu di Master Data &amp; Periode Fiskal sebelum menyusun RKA.
        </div>
      )}

      {!lookupsError && lookups.fiscalYears.length > 0 && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5 font-medium">Kode</th>
                  <th className="px-4 py-2.5 font-medium">Nama</th>
                  <th className="px-4 py-2.5 font-medium">Versi</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loadingBudgets && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Memuat…</td></tr>
                )}
                {!loadingBudgets && budgets.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Belum ada RKA untuk Tahun Fiskal ini.</td></tr>
                )}
                {!loadingBudgets && budgets.map(b => (
                  <tr key={b.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer" onClick={() => setSelectedBudget(b)}>
                    <td className="px-4 py-2.5 text-slate-700">{b.code}</td>
                    <td className="px-4 py-2.5 text-slate-700">{b.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">v{b.version}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                      {['DRAFT', 'SUBMITTED', 'REVIEWED'].includes(b.status) && (canEdit || canApprove) && (
                        <button onClick={() => handleCancelBudget(b)} className="text-slate-400 hover:text-red-500 p-1" title="Batalkan">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {budgetsMeta && budgetsMeta.page < budgetsMeta.totalPages && (
              <div className="flex items-center justify-center py-3 border-t border-slate-100">
                <button onClick={loadMoreBudgets} disabled={loadingMoreBudgets}
                  className="text-xs font-medium text-[#144f6b] hover:underline disabled:opacity-50 flex items-center gap-1.5">
                  {loadingMoreBudgets && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Muat Lebih Banyak ({budgets.length} dari {budgetsMeta.total})
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => !creating && setCreateOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Buat RKA Baru</h3>
              <button onClick={() => setCreateOpen(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Kode <span className="text-red-500">*</span></label>
              <input
                type="text" value={createForm.code} placeholder="RKA-2026-01"
                onChange={e => setCreateForm(prev => ({ ...prev, code: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nama <span className="text-red-500">*</span></label>
              <input
                type="text" value={createForm.name} placeholder="RKA Tahun Fiskal 2026/2027"
                onChange={e => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCreateOpen(false)} disabled={creating} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200">Batal</button>
              <button
                onClick={handleCreate} disabled={creating}
                className="px-3 py-1.5 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60"
                style={{ background: '#144f6b' }}
              >
                {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
