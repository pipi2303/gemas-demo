import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../../lib/apiClient';
import { toast } from 'sonner';
import {
  Plus, X, Loader2, ArrowLeft, Receipt, Send, Trash2, CheckCircle2, AlertTriangle,
  ShieldCheck, XCircle, RotateCcw, Landmark, Undo2,
} from 'lucide-react';

const FINANCE_MODULE = 'Keuangan (Finance Add-on)';

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

// Sama seperti callApi('get', ...) tapi juga mengembalikan meta pagination (total/page/totalPages)
async function callApiPaged<T = any>(url: string): Promise<{ data: T; meta?: PageMeta }> {
  const res = await (api as any).get<ApiResponse<T>>(url);
  if (!res.success) throw new Error(res.error?.message || 'Terjadi kesalahan');
  return { data: res.data as T, meta: res.meta };
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  DRAFT:              { label: 'Draft',            color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' },
  SUBMITTED:          { label: 'Diajukan',         color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  VERIFIED:           { label: 'Diverifikasi',     color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
  REJECTED:           { label: 'Ditolak',          color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
  REVISION_REQUIRED:  { label: 'Perlu Revisi',     color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  APPROVED:           { label: 'Disetujui',        color: '#3730a3', bg: '#eef2ff', border: '#c7d2fe' },
  POSTED:             { label: 'Terposting',       color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  REVERSED:           { label: 'Dibalik',          color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  CANCELLED:          { label: 'Dibatalkan',       color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.DRAFT;
  return (
    <span className="inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5" style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}>
      {meta.label}
    </span>
  );
}

export interface Lookups {
  fiscalYears: any[];
  voucherTypes: any[];
  accounts: any[];
  fields: any[];
  programs: any[];
  activities: any[];
  funds: any[];
  cashAccounts: any[];
  bankAccounts: any[];
  vendors: any[];
  donors: any[];
  costCenters: any[];
}

type WorkflowAction = 'submit' | 'cancel' | 'verify' | 'approve' | 'reject' | 'revise' | 'post' | 'reverse';

// ── Detail transaksi: baris jurnal + aksi ─────────────────────────────────────
export function TransactionDetail({ tx, canEdit, canApprove, currentUserId, lookups, onBack, onChanged }: {
  tx: any; canEdit: boolean; canApprove: boolean; currentUserId: string | undefined; lookups: Lookups; onBack: () => void; onChanged: (updated?: any) => void;
}) {
  const [current, setCurrent] = useState(tx);
  const [lines, setLines] = useState<any[]>([]);
  const [loadingLines, setLoadingLines] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [reasonModal, setReasonModal] = useState<{ action: 'reject' | 'reverse'; reason: string } | null>(null);

  const postableAccounts = lookups.accounts.filter(a => a.is_postable);
  const cashBankOptions = useMemo(() => [
    { value: '', label: '— tanpa Kas/Bank (akun murni) —' },
    ...lookups.cashAccounts.map(c => ({ value: `cash:${c.id}`, label: `Kas — ${c.name}` })),
    ...lookups.bankAccounts.map(b => ({ value: `bank:${b.id}`, label: `Bank — ${b.bank_name} (${b.account_number})` })),
  ], [lookups.cashAccounts, lookups.bankAccounts]);

  const loadLines = useCallback(async () => {
    setLoadingLines(true);
    try {
      const data = await callApi<any[]>('get', `/api/v1/finance/transactions/${current.id}/lines`);
      setLines(data);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat baris transaksi');
    } finally {
      setLoadingLines(false);
    }
  }, [current.id]);

  useEffect(() => { loadLines(); }, [loadLines]);

  const isDraft = current.status === 'DRAFT';
  const balanced = Number(current.total_debit) === Number(current.total_credit) && Number(current.total_debit) > 0;
  // Segregation of duties: pembuat tidak bisa memverifikasi/menyetujui/memposting transaksinya
  // sendiri, dan verifikator tidak bisa merangkap sebagai penyetuju — dicek juga di backend,
  // ini hanya supaya tombolnya sudah nonaktif duluan dengan alasan yang jelas.
  const isOwnTransaction = !!currentUserId && current.created_by === currentUserId;
  const isOwnVerification = !!currentUserId && current.verified_by === currentUserId;

  const resetForm = () => setForm({ account_id: '', field_id: '', program_id: '', activity_id: '', fund_id: '', cost_center_id: '', cashBank: '', side: 'debit', amount: '', description: '' });
  const openAddLine = () => { resetForm(); setModalOpen(true); };

  const handleAddLine = async () => {
    if (!form.account_id || !form.amount || Number(form.amount) <= 0) {
      toast.error('Akun dan jumlah wajib diisi');
      return;
    }
    setSaving(true);
    try {
      const [cbType, cbId] = (form.cashBank || '').split(':');
      const body: Record<string, any> = {
        account_id: form.account_id,
        field_id: form.field_id || undefined,
        program_id: form.program_id || undefined,
        activity_id: form.activity_id || undefined,
        fund_id: form.fund_id || undefined,
        cost_center_id: form.cost_center_id || undefined,
        description: form.description || undefined,
        side: form.side,
        amount: Number(form.amount),
      };
      if (cbType === 'cash') body.cash_account_id = cbId;
      if (cbType === 'bank') body.bank_account_id = cbId;
      const result = await callApi<any>('post', `/api/v1/finance/transactions/${current.id}/lines`, body);
      if (result?._totals) setCurrent((prev: any) => ({ ...prev, total_debit: result._totals.total_debit, total_credit: result._totals.total_credit }));
      toast.success('Baris ditambahkan');
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
      const result = await callApi<any>('delete', `/api/v1/finance/transactions/${current.id}/lines/${lineId}`);
      if (result?._totals) setCurrent((prev: any) => ({ ...prev, total_debit: result._totals.total_debit, total_credit: result._totals.total_credit }));
      toast.success('Baris dihapus');
      await loadLines();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus baris');
    }
  };

  const ACTION_ENDPOINT: Record<Exclude<WorkflowAction, 'cancel'>, string> = {
    submit: 'submit', verify: 'verify', approve: 'approve', reject: 'reject', revise: 'revise', post: 'post', reverse: 'reverse',
  };
  const ACTION_SUCCESS_MESSAGE: Record<WorkflowAction, string> = {
    submit: 'Transaksi diajukan untuk verifikasi',
    cancel: 'Transaksi dibatalkan',
    verify: 'Transaksi diverifikasi',
    approve: 'Transaksi disetujui',
    reject: 'Transaksi ditolak',
    revise: 'Transaksi dikembalikan ke Draft untuk direvisi',
    post: 'Transaksi berhasil diposting ke General Ledger',
    reverse: 'Jurnal berhasil dibalik',
  };

  const runAction = async (action: WorkflowAction, body?: any) => {
    setBusy(action);
    try {
      if (action === 'cancel') {
        await callApi('delete', `/api/v1/finance/transactions/${current.id}`);
        toast.success(ACTION_SUCCESS_MESSAGE.cancel);
        onChanged();
        onBack();
        return;
      }
      const updated = await callApi<any>('put', `/api/v1/finance/transactions/${current.id}/${ACTION_ENDPOINT[action]}`, body ?? {});
      setCurrent((prev: any) => ({ ...prev, ...updated }));
      onChanged(updated);
      toast.success(ACTION_SUCCESS_MESSAGE[action]);
      setReasonModal(null);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memproses aksi');
    } finally {
      setBusy(null);
    }
  };

  const submitReasonModal = () => {
    const reason = reasonModal?.reason.trim();
    if (!reason) { toast.error('Alasan wajib diisi'); return; }
    if (reasonModal?.action === 'reject') runAction('reject', { reason });
    if (reasonModal?.action === 'reverse') runAction('reverse', { reason });
  };

  const nameOf = (list: any[], id: string) => list.find(x => x.id === id)?.name ?? '—';
  const cashBankLabel = (line: any) => {
    if (line.cash_account_id) return `Kas — ${nameOf(lookups.cashAccounts, line.cash_account_id)}`;
    if (line.bank_account_id) {
      const b = lookups.bankAccounts.find(x => x.id === line.bank_account_id);
      return b ? `Bank — ${b.bank_name}` : '—';
    }
    return '—';
  };

  const btnPrimary = 'flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-lg disabled:opacity-50';
  const btnDanger = 'flex items-center gap-1.5 text-sm font-medium text-red-600 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 disabled:opacity-50';
  const btnNeutral = 'flex items-center gap-1.5 text-sm font-medium text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50';

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#1A77A3]">
        <ArrowLeft className="w-3 h-3" /> Kembali ke daftar Transaksi
      </button>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-semibold text-slate-800">{current.voucher_number}</h2>
              <StatusBadge status={current.status} />
            </div>
            <p className="text-xs text-slate-500">{current.voucher_type_name} · {current.voucher_date} · {current.description}</p>
            {(current.payer_name || current.payee_name) && (
              <p className="text-xs text-slate-500 mt-0.5">
                {current.payer_name && <>Dari: {current.payer_name} </>}
                {current.payee_name && <>Kepada: {current.payee_name}</>}
              </p>
            )}
            {current.status === 'REJECTED' && current.rejection_reason && (
              <p className="text-xs text-red-600 mt-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">Alasan ditolak: {current.rejection_reason}</p>
            )}
            {current.journal_number && (
              <p className="text-xs text-emerald-700 mt-1.5">No. Jurnal: <span className="font-medium">{current.journal_number}</span></p>
            )}
            {isOwnTransaction && ['SUBMITTED', 'VERIFIED', 'APPROVED'].includes(current.status) && (
              <p className="text-xs text-slate-400 mt-1.5">Menunggu diproses orang lain — transaksi milik sendiri tidak bisa diverifikasi/disetujui/diposting sendiri.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {isDraft && canEdit && (
              <>
                <button
                  onClick={() => runAction('submit')} disabled={busy !== null || !balanced}
                  title={!balanced ? 'Debit dan kredit harus seimbang dulu' : ''}
                  className={btnPrimary} style={{ background: '#1A77A3' }}
                >
                  {busy === 'submit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Ajukan
                </button>
                <button onClick={() => runAction('cancel')} disabled={busy !== null} className={btnDanger}>
                  <Trash2 className="w-3.5 h-3.5" /> Batalkan
                </button>
              </>
            )}

            {current.status === 'SUBMITTED' && canApprove && (
              <>
                <button
                  onClick={() => runAction('verify')} disabled={busy !== null || isOwnTransaction}
                  title={isOwnTransaction ? 'Pembuat transaksi tidak bisa memverifikasi transaksinya sendiri' : ''}
                  className={btnPrimary} style={{ background: '#1A77A3' }}
                >
                  {busy === 'verify' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} Verifikasi
                </button>
                <button onClick={() => setReasonModal({ action: 'reject', reason: '' })} disabled={busy !== null} className={btnDanger}>
                  <XCircle className="w-3.5 h-3.5" /> Tolak
                </button>
              </>
            )}

            {current.status === 'VERIFIED' && canApprove && (
              <>
                <button
                  onClick={() => runAction('approve')} disabled={busy !== null || isOwnTransaction || isOwnVerification}
                  title={isOwnTransaction ? 'Pembuat transaksi tidak bisa menyetujui transaksinya sendiri' : isOwnVerification ? 'Verifikator tidak bisa merangkap sebagai penyetuju' : ''}
                  className={btnPrimary} style={{ background: '#1A77A3' }}
                >
                  {busy === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Setujui
                </button>
                <button onClick={() => setReasonModal({ action: 'reject', reason: '' })} disabled={busy !== null} className={btnDanger}>
                  <XCircle className="w-3.5 h-3.5" /> Tolak
                </button>
              </>
            )}

            {current.status === 'REJECTED' && canEdit && (
              <button onClick={() => runAction('revise')} disabled={busy !== null} className={btnNeutral}>
                {busy === 'revise' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Revisi (kembali ke Draft)
              </button>
            )}

            {current.status === 'APPROVED' && canApprove && (
              <button
                onClick={() => runAction('post')} disabled={busy !== null || isOwnTransaction}
                title={isOwnTransaction ? 'Pembuat transaksi tidak bisa memposting transaksinya sendiri' : ''}
                className={btnPrimary} style={{ background: '#166534' }}
              >
                {busy === 'post' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Landmark className="w-3.5 h-3.5" />} Posting ke GL
              </button>
            )}

            {current.status === 'POSTED' && canApprove && (
              <button onClick={() => setReasonModal({ action: 'reverse', reason: '' })} disabled={busy !== null} className={btnNeutral}>
                {busy === 'reverse' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} Balik Jurnal
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Baris Jurnal</h3>
          {isDraft && canEdit && (
            <button onClick={openAddLine} className="flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-lg hover:opacity-90" style={{ background: '#1A77A3' }}>
              <Plus className="w-3.5 h-3.5" /> Tambah Baris
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-3 py-2 font-medium">Akun</th>
                <th className="px-3 py-2 font-medium">Kas/Bank</th>
                <th className="px-3 py-2 font-medium">Deskripsi</th>
                <th className="px-3 py-2 font-medium text-right">Debit</th>
                <th className="px-3 py-2 font-medium text-right">Kredit</th>
                {isDraft && canEdit && <th className="px-3 py-2 font-medium text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loadingLines && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Memuat…</td></tr>
              )}
              {!loadingLines && lines.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Belum ada baris jurnal.</td></tr>
              )}
              {!loadingLines && lines.map(line => (
                <tr key={line.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{nameOf(lookups.accounts, line.account_id)}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{cashBankLabel(line)}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{line.description || '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{Number(line.debit) > 0 ? formatRp(line.debit) : ''}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{Number(line.credit) > 0 ? formatRp(line.credit) : ''}</td>
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
                  <td className="px-3 py-2" colSpan={3}>Total</td>
                  <td className="px-3 py-2 text-right">{formatRp(current.total_debit)}</td>
                  <td className="px-3 py-2 text-right">{formatRp(current.total_credit)}</td>
                  {isDraft && canEdit && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {!loadingLines && lines.length > 0 && isDraft && (
          <div className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 ${balanced ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' : 'text-amber-700 bg-amber-50 border border-amber-200'}`}>
            {balanced ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {balanced ? 'Debit dan kredit sudah seimbang.' : 'Debit dan kredit belum seimbang — transaksi belum bisa diajukan.'}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => !saving && setModalOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Tambah Baris Jurnal</h3>
              <button onClick={() => setModalOpen(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Akun <span className="text-red-500">*</span></label>
              <select value={form.account_id ?? ''} onChange={e => setForm(prev => ({ ...prev, account_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]">
                <option value="">— pilih akun —</option>
                {postableAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Kas / Bank (opsional)</label>
              <select value={form.cashBank ?? ''} onChange={e => setForm(prev => ({ ...prev, cashBank: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]">
                {cashBankOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Bidang</label>
                <select value={form.field_id ?? ''} onChange={e => setForm(prev => ({ ...prev, field_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]">
                  <option value="">—</option>
                  {lookups.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Program</label>
                <select value={form.program_id ?? ''} onChange={e => setForm(prev => ({ ...prev, program_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]">
                  <option value="">—</option>
                  {lookups.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Kegiatan</label>
                <select value={form.activity_id ?? ''} onChange={e => setForm(prev => ({ ...prev, activity_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]">
                  <option value="">—</option>
                  {lookups.activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Dana</label>
                <select value={form.fund_id ?? ''} onChange={e => setForm(prev => ({ ...prev, fund_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]">
                  <option value="">—</option>
                  {lookups.funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Pusat Biaya</label>
                <select value={form.cost_center_id ?? ''} onChange={e => setForm(prev => ({ ...prev, cost_center_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]">
                  <option value="">—</option>
                  {lookups.costCenters.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Sisi <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  {(['debit', 'credit'] as const).map(s => (
                    <button
                      key={s} type="button"
                      onClick={() => setForm(prev => ({ ...prev, side: s }))}
                      className="flex-1 px-3 py-2 rounded-lg text-sm border"
                      style={form.side === s ? { background: '#1A77A3', color: '#fff', borderColor: '#1A77A3' } : { color: '#475569', borderColor: '#e2e8f0' }}
                    >
                      {s === 'debit' ? 'Debit' : 'Kredit'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Jumlah <span className="text-red-500">*</span></label>
                <input type="number" value={form.amount ?? ''} onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Deskripsi</label>
              <input type="text" value={form.description ?? ''} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalOpen(false)} disabled={saving} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200">Batal</button>
              <button onClick={handleAddLine} disabled={saving} className="px-3 py-1.5 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#1A77A3' }}>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {reasonModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => busy === null && setReasonModal(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">{reasonModal.action === 'reject' ? 'Tolak Transaksi' : 'Balik Jurnal'}</h3>
              <button onClick={() => setReasonModal(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Alasan {reasonModal.action === 'reject' ? 'Penolakan' : 'Pembalikan'} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reasonModal.reason} onChange={e => setReasonModal(prev => prev && ({ ...prev, reason: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setReasonModal(null)} disabled={busy !== null} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200">Batal</button>
              <button onClick={submitReasonModal} disabled={busy !== null} className="px-3 py-1.5 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60 bg-red-600">
                {busy !== null && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {reasonModal.action === 'reject' ? 'Tolak' : 'Balik Jurnal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Halaman utama Transaksi & Voucher ───────────────────────────────────────────
export function FinanceTransaction({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { can: canFn, currentUser } = useApp();
  const canEdit = canFn(FINANCE_MODULE, 'edit');
  const canApprove = canFn(FINANCE_MODULE, 'approve');
  const canCreate = canFn(FINANCE_MODULE, 'create');

  const [lookups, setLookups] = useState<Lookups>({
    fiscalYears: [], voucherTypes: [], accounts: [], fields: [], programs: [], activities: [], funds: [], cashAccounts: [], bankAccounts: [],
    vendors: [], donors: [], costCenters: [],
  });
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [lookupsError, setLookupsError] = useState<string | null>(null);
  const [selectedFiscalYearId, setSelectedFiscalYearId] = useState('');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [loadingMoreTx, setLoadingMoreTx] = useState(false);
  const [txMeta, setTxMeta] = useState<PageMeta | null>(null);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ voucher_type_id: '', transaction_date: '', payer_name: '', payee_name: '', vendor_id: '', donor_id: '', description: '', reference_number: '' });

  const loadLookups = useCallback(async () => {
    setLookupsLoading(true);
    setLookupsError(null);
    try {
      const [fiscalYears, voucherTypes, accounts, fields, programs, activities, funds, cashAccounts, bankAccounts, vendors, donors, costCenters] = await Promise.all([
        callApi<any[]>('get', '/api/v1/finance/fiscal-years'),
        callApi<any[]>('get', '/api/v1/finance/voucher-types'),
        callApi<any[]>('get', '/api/v1/finance/accounts'),
        callApi<any[]>('get', '/api/v1/finance/fields'),
        callApi<any[]>('get', '/api/v1/finance/programs'),
        callApi<any[]>('get', '/api/v1/finance/activities'),
        callApi<any[]>('get', '/api/v1/finance/funds'),
        callApi<any[]>('get', '/api/v1/finance/cash-accounts'),
        callApi<any[]>('get', '/api/v1/finance/bank-accounts'),
        callApi<any[]>('get', '/api/v1/finance/vendors'),
        callApi<any[]>('get', '/api/v1/finance/donors'),
        callApi<any[]>('get', '/api/v1/finance/cost-centers'),
      ]);
      setLookups({ fiscalYears, voucherTypes, accounts, fields, programs, activities, funds, cashAccounts, bankAccounts, vendors, donors, costCenters });
      setSelectedFiscalYearId(prev => prev || fiscalYears.find((fy: any) => fy.is_current)?.id || fiscalYears[0]?.id || '');
    } catch (err: any) {
      setLookupsError(err?.message || 'Gagal memuat data rujukan. Pastikan Master Data & Tahun Fiskal (Fase 1) sudah diisi.');
    } finally {
      setLookupsLoading(false);
    }
  }, []);

  useEffect(() => { loadLookups(); }, [loadLookups]);

  const loadTransactions = useCallback(async () => {
    if (!selectedFiscalYearId) { setTransactions([]); setTxMeta(null); setLoadingTx(false); return; }
    setLoadingTx(true);
    try {
      const { data, meta } = await callApiPaged<any[]>(`/api/v1/finance/transactions?fiscalYearId=${selectedFiscalYearId}&page=1`);
      setTransactions(data);
      setTxMeta(meta ?? null);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat daftar transaksi');
    } finally {
      setLoadingTx(false);
    }
  }, [selectedFiscalYearId]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const loadMoreTransactions = async () => {
    if (!txMeta || txMeta.page >= txMeta.totalPages) return;
    setLoadingMoreTx(true);
    try {
      const nextPage = txMeta.page + 1;
      const { data, meta } = await callApiPaged<any[]>(`/api/v1/finance/transactions?fiscalYearId=${selectedFiscalYearId}&page=${nextPage}`);
      setTransactions(prev => [...prev, ...data]);
      setTxMeta(meta ?? null);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat transaksi selanjutnya');
    } finally {
      setLoadingMoreTx(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.voucher_type_id || !createForm.transaction_date || !createForm.description.trim()) {
      toast.error('Jenis Voucher, tanggal, dan keterangan wajib diisi');
      return;
    }
    setCreating(true);
    try {
      const created = await callApi<any>('post', '/api/v1/finance/transactions', { ...createForm, fiscal_year_id: selectedFiscalYearId });
      toast.success(`Transaksi dibuat: ${created.voucher_number}`);
      setCreateOpen(false);
      setCreateForm({ voucher_type_id: '', transaction_date: '', payer_name: '', payee_name: '', vendor_id: '', donor_id: '', description: '', reference_number: '' });
      await loadTransactions();
      setSelectedTx(created);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal membuat transaksi');
    } finally {
      setCreating(false);
    }
  };

  if (selectedTx) {
    return (
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <TransactionDetail
          tx={selectedTx} canEdit={canEdit} canApprove={canApprove} currentUserId={currentUser?.id} lookups={lookups}
          onBack={() => { setSelectedTx(null); loadTransactions(); }}
          onChanged={updated => updated && setSelectedTx(updated)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        {onNavigate && (
          <button onClick={() => onNavigate('finance-addon')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#1A77A3] mb-1.5">
            <ArrowLeft className="w-3 h-3" /> Kembali ke Ringkasan Finance Add-on
          </button>
        )}
        <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
          <Receipt className="w-5 h-5" style={{ color: '#1A77A3' }} /> Transaksi &amp; Voucher
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Pencatatan transaksi kas/bank dengan nomor voucher otomatis — Draft → Ajukan → Verifikasi → Setujui → Posting ke General Ledger</p>
      </div>

      {lookupsError && <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{lookupsError}</div>}

      {!lookupsError && !lookupsLoading && lookups.fiscalYears.length === 0 && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Belum ada Tahun Fiskal. Buat Tahun Fiskal dulu di Master Data &amp; Periode Fiskal.
        </div>
      )}

      {!lookupsError && lookups.fiscalYears.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Tahun Fiskal:</label>
              <select value={selectedFiscalYearId} onChange={e => setSelectedFiscalYearId(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]">
                {lookups.fiscalYears.map(fy => <option key={fy.id} value={fy.id}>{fy.name}{fy.is_current ? ' (Aktif)' : ''}</option>)}
              </select>
            </div>
            {canCreate && (
              <button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-lg hover:opacity-90" style={{ background: '#1A77A3' }}>
                <Plus className="w-3.5 h-3.5" /> Buat Transaksi
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5 font-medium">No. Voucher</th>
                  <th className="px-4 py-2.5 font-medium">Tanggal</th>
                  <th className="px-4 py-2.5 font-medium">Jenis</th>
                  <th className="px-4 py-2.5 font-medium">Keterangan</th>
                  <th className="px-4 py-2.5 font-medium text-right">Jumlah</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {loadingTx && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Memuat…</td></tr>
                )}
                {!loadingTx && transactions.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Belum ada transaksi untuk Tahun Fiskal ini.</td></tr>
                )}
                {!loadingTx && transactions.map(t => (
                  <tr key={t.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer" onClick={() => setSelectedTx(t)}>
                    <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{t.voucher_number}</td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{t.transaction_date}</td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{t.voucher_type_code}</td>
                    <td className="px-4 py-2.5 text-slate-700">{t.description}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatRp(t.total_debit)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {txMeta && txMeta.page < txMeta.totalPages && (
              <div className="flex items-center justify-center py-3 border-t border-slate-100">
                <button onClick={loadMoreTransactions} disabled={loadingMoreTx}
                  className="text-xs font-medium text-[#1A77A3] hover:underline disabled:opacity-50 flex items-center gap-1.5">
                  {loadingMoreTx && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Muat Lebih Banyak ({transactions.length} dari {txMeta.total})
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {createOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => !creating && setCreateOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Buat Transaksi Baru</h3>
              <button onClick={() => setCreateOpen(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Jenis Voucher <span className="text-red-500">*</span></label>
              <select value={createForm.voucher_type_id} onChange={e => setCreateForm(prev => ({ ...prev, voucher_type_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]">
                <option value="">— pilih —</option>
                {lookups.voucherTypes.filter(vt => vt.is_active).map(vt => <option key={vt.id} value={vt.id}>{vt.code} — {vt.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tanggal <span className="text-red-500">*</span></label>
              <input type="date" value={createForm.transaction_date} onChange={e => setCreateForm(prev => ({ ...prev, transaction_date: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Donatur (opsional)</label>
                <select
                  value={createForm.donor_id}
                  onChange={e => {
                    const id = e.target.value;
                    const donor = lookups.donors.find(d => d.id === id);
                    setCreateForm(prev => ({ ...prev, donor_id: id, payer_name: donor ? donor.name : prev.payer_name }));
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]"
                >
                  <option value="">— tanpa donatur —</option>
                  {lookups.donors.filter(d => d.is_active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Pemasok (opsional)</label>
                <select
                  value={createForm.vendor_id}
                  onChange={e => {
                    const id = e.target.value;
                    const vendor = lookups.vendors.find(v => v.id === id);
                    setCreateForm(prev => ({ ...prev, vendor_id: id, payee_name: vendor ? vendor.name : prev.payee_name }));
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]"
                >
                  <option value="">— tanpa pemasok —</option>
                  {lookups.vendors.filter(v => v.is_active).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Dari (Pembayar)</label>
                <input type="text" value={createForm.payer_name} onChange={e => setCreateForm(prev => ({ ...prev, payer_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Kepada (Penerima)</label>
                <input type="text" value={createForm.payee_name} onChange={e => setCreateForm(prev => ({ ...prev, payee_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Keterangan <span className="text-red-500">*</span></label>
              <input type="text" value={createForm.description} onChange={e => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">No. Referensi (opsional)</label>
              <input type="text" value={createForm.reference_number} onChange={e => setCreateForm(prev => ({ ...prev, reference_number: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCreateOpen(false)} disabled={creating} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200">Batal</button>
              <button onClick={handleCreate} disabled={creating} className="px-3 py-1.5 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#1A77A3' }}>
                {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
