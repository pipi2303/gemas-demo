// ============================================================
// FINANCE ADD-ON MODULE — Fase 6: Rekonsiliasi Bank
// ============================================================
// Alur: pilih Rekening Bank → input/pilih Rekening Koran (mutasi bank,
// entry manual) → buka Sesi Rekonsiliasi untuk satu Periode → cocokkan
// baris rekening koran dengan transaksi sistem (otomatis atau manual) →
// selesaikan sesi setelah selisih penyesuaian = 0 → disetujui orang lain
// (segregation of duties, sama seperti alur Transaksi & Voucher).
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../../lib/apiClient';
import { toast } from 'sonner';
import {
  ArrowLeftRight, Loader2, Plus, X, Trash2, CheckCircle2, ShieldCheck,
  Link2, Unlink, RefreshCw, Ban, FileText,
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

const btnPrimary = 'flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-lg disabled:opacity-50';
const btnSecondary = 'flex items-center gap-1.5 text-sm font-medium text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50';
const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]';
const labelCls = 'block text-xs font-medium text-slate-600 mb-1';

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  DRAFT:       { label: 'Draft',    color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  IN_PROGRESS: { label: 'Berjalan', color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  COMPLETED:   { label: 'Selesai',  color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
  APPROVED:    { label: 'Disetujui', color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  CANCELLED:   { label: 'Dibatalkan', color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
};
function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] || STATUS_META.DRAFT;
  return <span className="inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5" style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}` }}>{m.label}</span>;
}

type LineDraft = { transaction_date: string; reference_number: string; description: string; debit: string; credit: string };
function emptyLine(): LineDraft { return { transaction_date: '', reference_number: '', description: '', debit: '', credit: '' }; }

// ── Modal: Input Rekening Koran baru ─────────────────────────────────────────────
function NewStatementModal({ bankAccountId, onClose, onCreated }: { bankAccountId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [statementNumber, setStatementNumber] = useState('');
  const [statementDate, setStatementDate] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  const updateLine = (i: number, patch: Partial<LineDraft>) =>
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);

  const handleSave = async () => {
    if (!statementDate || openingBalance === '' || closingBalance === '') {
      toast.error('Tanggal, saldo awal, dan saldo akhir wajib diisi'); return;
    }
    const cleanLines = lines.filter(l => l.transaction_date && (Number(l.debit || 0) > 0 || Number(l.credit || 0) > 0));
    if (cleanLines.length === 0) { toast.error('Minimal satu baris mutasi wajib diisi'); return; }
    for (const l of cleanLines) {
      if (Number(l.debit || 0) > 0 && Number(l.credit || 0) > 0) { toast.error('Satu baris tidak boleh diisi Debit dan Kredit sekaligus'); return; }
    }
    setSaving(true);
    try {
      const created = await callApi<any>('post', '/api/v1/finance/reconciliation/bank-statements', {
        bank_account_id: bankAccountId,
        statement_number: statementNumber || undefined,
        statement_date: statementDate,
        opening_balance: Number(openingBalance),
        closing_balance: Number(closingBalance),
        lines: cleanLines.map(l => ({ ...l, debit: Number(l.debit || 0), credit: Number(l.credit || 0) })),
      });
      toast.success('Rekening koran berhasil disimpan');
      onCreated(created.id);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan rekening koran');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-3xl p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Input Rekening Koran Baru</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelCls}>No. Rekening Koran (opsional)</label>
            <input type="text" value={statementNumber} onChange={e => setStatementNumber(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Tanggal Rekening Koran <span className="text-red-500">*</span></label>
            <input type="date" value={statementDate} onChange={e => setStatementDate(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Saldo Awal <span className="text-red-500">*</span></label>
            <input type="number" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Saldo Akhir <span className="text-red-500">*</span></label>
            <input type="number" value={closingBalance} onChange={e => setClosingBalance(e.target.value)} className={inputCls} /></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-600">Baris Mutasi</label>
            <button onClick={() => setLines(prev => [...prev, emptyLine()])} className="flex items-center gap-1 text-xs text-[#1A77A3] font-medium">
              <Plus className="w-3.5 h-3.5" /> Tambah Baris
            </button>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-500">
                  <th className="px-2 py-1.5 font-medium">Tanggal</th>
                  <th className="px-2 py-1.5 font-medium">No. Referensi</th>
                  <th className="px-2 py-1.5 font-medium">Keterangan</th>
                  <th className="px-2 py-1.5 font-medium text-right">Debit</th>
                  <th className="px-2 py-1.5 font-medium text-right">Kredit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-1 py-1"><input type="date" value={l.transaction_date} onChange={e => updateLine(i, { transaction_date: e.target.value })} className="w-full px-1.5 py-1 rounded border border-slate-200 text-xs" /></td>
                    <td className="px-1 py-1"><input type="text" value={l.reference_number} onChange={e => updateLine(i, { reference_number: e.target.value })} className="w-full px-1.5 py-1 rounded border border-slate-200 text-xs" /></td>
                    <td className="px-1 py-1"><input type="text" value={l.description} onChange={e => updateLine(i, { description: e.target.value })} className="w-full px-1.5 py-1 rounded border border-slate-200 text-xs" /></td>
                    <td className="px-1 py-1"><input type="number" value={l.debit} onChange={e => updateLine(i, { debit: e.target.value, credit: '' })} className="w-24 px-1.5 py-1 rounded border border-slate-200 text-xs text-right" /></td>
                    <td className="px-1 py-1"><input type="number" value={l.credit} onChange={e => updateLine(i, { credit: e.target.value, debit: '' })} className="w-24 px-1.5 py-1 rounded border border-slate-200 text-xs text-right" /></td>
                    <td className="px-1 py-1">
                      {lines.length > 1 && (
                        <button onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))}><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                  <td colSpan={3} className="px-2 py-1.5 text-right text-slate-500">Total</td>
                  <td className="px-2 py-1.5 text-right">{formatRp(totalDebit)}</td>
                  <td className="px-2 py-1.5 text-right">{formatRp(totalCredit)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={saving} className={btnSecondary}>Batal</button>
          <button onClick={handleSave} disabled={saving} className={btnPrimary} style={{ background: '#1A77A3' }}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Simpan Rekening Koran
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Buat Sesi Rekonsiliasi baru ───────────────────────────────────────────
function NewSessionModal({ bankAccountId, statements, periods, onClose, onCreated }: {
  bankAccountId: string; statements: any[]; periods: any[]; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [periodId, setPeriodId] = useState('');
  const [statementId, setStatementId] = useState('');
  const [saving, setSaving] = useState(false);
  const availableStatements = statements.filter(s => !s.reconciliation_id);

  const handleSave = async () => {
    if (!periodId || !statementId) { toast.error('Periode dan Rekening Koran wajib dipilih'); return; }
    setSaving(true);
    try {
      const created = await callApi<any>('post', '/api/v1/finance/reconciliation', {
        bank_account_id: bankAccountId, period_id: periodId, statement_id: statementId,
      });
      toast.success('Sesi rekonsiliasi dibuat');
      onCreated(created.id);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal membuat sesi rekonsiliasi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Buat Sesi Rekonsiliasi</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div>
          <label className={labelCls}>Periode <span className="text-red-500">*</span></label>
          <select value={periodId} onChange={e => setPeriodId(e.target.value)} className={inputCls}>
            <option value="">— pilih —</option>
            {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Rekening Koran <span className="text-red-500">*</span></label>
          <select value={statementId} onChange={e => setStatementId(e.target.value)} className={inputCls}>
            <option value="">— pilih —</option>
            {availableStatements.map(s => (
              <option key={s.id} value={s.id}>{s.statement_number ? `${s.statement_number} — ` : ''}{s.statement_date} (Saldo Akhir {formatRp(s.closing_balance)})</option>
            ))}
          </select>
          {availableStatements.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">Belum ada rekening koran yang tersedia (yang belum dipakai sesi lain) — input dulu lewat tombol "Input Rekening Koran".</p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={saving} className={btnSecondary}>Batal</button>
          <button onClick={handleSave} disabled={saving} className={btnPrimary} style={{ background: '#1A77A3' }}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Buat Sesi
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Cocokkan manual satu baris rekening koran ke transaksi sistem ────────
function ManualMatchModal({ line, candidates, onClose, onMatched }: {
  line: any; candidates: any[]; onClose: () => void; onMatched: (transactionId: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState('');
  const lineAmount = Number(line.credit) > 0 ? Number(line.credit) : Number(line.debit);

  const handleConfirm = async () => {
    if (!selected) { toast.error('Pilih transaksi yang akan dicocokkan'); return; }
    setSaving(true);
    try { await onMatched(selected); } finally { setSaving(false); }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-lg p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Cocokkan Baris Rekening Koran</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5">
          <p className="text-slate-500">{line.transaction_date} — {line.description || '—'}</p>
          <p className="font-medium text-slate-800 mt-0.5">{Number(line.credit) > 0 ? 'Kredit (Setoran)' : 'Debit (Penarikan)'}: {formatRp(lineAmount)}</p>
        </div>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {candidates.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">Tidak ada transaksi sistem yang belum cocok untuk rekening ini.</p>}
          {candidates.map(c => {
            const amount = Number(c.debit) > 0 ? Number(c.debit) : Number(c.credit);
            const isSelected = selected === c.transaction_id;
            return (
              <label key={c.transaction_id} className={`flex items-center justify-between gap-2 p-2 rounded-lg border cursor-pointer text-xs ${isSelected ? 'border-[#1A77A3] bg-blue-50/40' : 'border-slate-200 hover:bg-slate-50'}`}>
                <div className="flex items-center gap-2">
                  <input type="radio" name="match-candidate" checked={isSelected} onChange={() => setSelected(c.transaction_id)} />
                  <div>
                    <p className="font-medium text-slate-700">{c.voucher_number}</p>
                    <p className="text-slate-500">{c.transaction_date} — {c.description}</p>
                  </div>
                </div>
                <span className="font-medium text-slate-700 whitespace-nowrap">{formatRp(amount)}</span>
              </label>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={saving} className={btnSecondary}>Batal</button>
          <button onClick={handleConfirm} disabled={saving || !selected} className={btnPrimary} style={{ background: '#1A77A3' }}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Cocokkan
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail Sesi Rekonsiliasi ──────────────────────────────────────────────────────
function SessionDetail({ sessionId, canApprove, currentUserId, onBack, onChanged }: {
  sessionId: string; canApprove: boolean; currentUserId: string | undefined; onBack: () => void; onChanged: () => void;
}) {
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [matchLine, setMatchLine] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callApi<any>('get', `/api/v1/finance/reconciliation/${sessionId}`);
      setDetail(data);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat detail sesi rekonsiliasi');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const runAutoMatch = async () => {
    setBusy('auto-match');
    try {
      const r = await callApi<any>('post', `/api/v1/finance/reconciliation/${sessionId}/auto-match`, {});
      toast.success(r.matchedCount > 0 ? `${r.matchedCount} baris berhasil dicocokkan otomatis` : 'Tidak ada baris baru yang bisa dicocokkan otomatis (perlu dicocokkan manual)');
      await load(); onChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menjalankan pencocokan otomatis');
    } finally { setBusy(null); }
  };

  const unmatch = async (matchId: string) => {
    setBusy(`unmatch-${matchId}`);
    try {
      await callApi('delete', `/api/v1/finance/reconciliation/${sessionId}/matches/${matchId}`);
      toast.success('Pencocokan dilepas');
      await load(); onChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal melepas pencocokan');
    } finally { setBusy(null); }
  };

  const confirmManualMatch = async (transactionId: string) => {
    try {
      await callApi('post', `/api/v1/finance/reconciliation/${sessionId}/matches`, {
        statement_line_id: matchLine.id, transaction_id: transactionId,
      });
      toast.success('Baris berhasil dicocokkan');
      setMatchLine(null);
      await load(); onChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mencocokkan baris');
    }
  };

  const runStatusAction = async (action: 'complete' | 'approve' | 'cancel') => {
    setBusy(action);
    try {
      await callApi('put', `/api/v1/finance/reconciliation/${sessionId}/${action}`, {});
      toast.success(action === 'complete' ? 'Sesi rekonsiliasi diselesaikan' : action === 'approve' ? 'Sesi rekonsiliasi disetujui' : 'Sesi rekonsiliasi dibatalkan');
      await load(); onChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memproses sesi');
    } finally { setBusy(null); }
  };

  if (loading || !detail) {
    return <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat…</div>;
  }

  const { session, statementLines, unmatchedBookTransactions, adjustedDifference, balanced } = detail;
  const isDraftOrProgress = session.status === 'DRAFT' || session.status === 'IN_PROGRESS';
  const isOwnCompletion = !!currentUserId && session.completed_by === currentUserId;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs text-slate-400 hover:text-[#1A77A3]">&larr; Kembali ke daftar sesi</button>
        <StatusBadge status={session.status} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-400">Saldo Buku (GL)</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatRp(session.system_balance)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-400">Saldo Rekening Koran</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatRp(session.bank_balance)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-400">Selisih Awal</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatRp(session.difference)}</p>
        </div>
        <div className="rounded-xl border p-3" style={{ background: balanced ? '#f0fdf4' : '#fffbeb', borderColor: balanced ? '#bbf7d0' : '#fde68a' }}>
          <p className="text-xs" style={{ color: balanced ? '#166534' : '#92400e' }}>Selisih Setelah Penyesuaian</p>
          <p className="text-sm font-semibold mt-0.5" style={{ color: balanced ? '#166534' : '#92400e' }}>{formatRp(adjustedDifference)} {balanced && '✓ Balance'}</p>
        </div>
      </div>

      {isDraftOrProgress && (
        <div className="flex items-center gap-2">
          <button onClick={runAutoMatch} disabled={busy !== null} className={btnSecondary}>
            {busy === 'auto-match' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Cocokkan Otomatis
          </button>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 text-xs font-medium text-slate-500">Baris Rekening Koran ({statementLines.length})</div>
          <div className="divide-y divide-slate-50 max-h-[420px] overflow-y-auto">
            {statementLines.map((l: any) => {
              const amount = Number(l.credit) > 0 ? Number(l.credit) : Number(l.debit);
              const isCredit = Number(l.credit) > 0;
              return (
                <div key={l.id} className="p-2.5 text-xs flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-slate-700 truncate">{l.transaction_date} — {l.description || '—'}</p>
                    <p className={isCredit ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>{isCredit ? '+ ' : '– '}{formatRp(amount)}</p>
                    {l.voucher_number && <p className="text-slate-400">↔ {l.voucher_number}</p>}
                  </div>
                  {isDraftOrProgress && (
                    l.match_id ? (
                      <button onClick={() => unmatch(l.match_id)} disabled={busy !== null} className="flex items-center gap-1 text-red-500 whitespace-nowrap" title="Lepas pencocokan">
                        <Unlink className="w-3.5 h-3.5" /> Lepas
                      </button>
                    ) : (
                      <button onClick={() => setMatchLine(l)} disabled={busy !== null} className="flex items-center gap-1 text-[#1A77A3] whitespace-nowrap" title="Cocokkan manual">
                        <Link2 className="w-3.5 h-3.5" /> Cocokkan
                      </button>
                    )
                  )}
                  {!isDraftOrProgress && l.match_id && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 text-xs font-medium text-slate-500">Transaksi Sistem Belum Cocok ({unmatchedBookTransactions.length})</div>
          <div className="divide-y divide-slate-50 max-h-[420px] overflow-y-auto">
            {unmatchedBookTransactions.length === 0 && <p className="text-xs text-slate-400 p-4 text-center">Semua transaksi sistem sudah cocok dengan rekening koran.</p>}
            {unmatchedBookTransactions.map((t: any) => {
              const amount = Number(t.debit) > 0 ? Number(t.debit) : Number(t.credit);
              const isBookDebit = Number(t.debit) > 0;
              return (
                <div key={t.transaction_id} className="p-2.5 text-xs">
                  <p className="text-slate-700">{t.transaction_date} — {t.voucher_number}</p>
                  <p className="text-slate-500 truncate">{t.description}</p>
                  <p className={isBookDebit ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>{isBookDebit ? 'Setoran dalam perjalanan: +' : 'Belum cair di bank: –'}{formatRp(amount)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {isDraftOrProgress && (
          <button onClick={() => runStatusAction('cancel')} disabled={busy !== null} className={btnSecondary}>
            <Ban className="w-3.5 h-3.5" /> Batalkan Sesi
          </button>
        )}
        {isDraftOrProgress && canApprove && (
          <button
            onClick={() => runStatusAction('complete')} disabled={busy !== null || !balanced}
            title={!balanced ? 'Selisih setelah penyesuaian harus nol dulu' : ''}
            className={btnPrimary} style={{ background: '#1A77A3' }}
          >
            {busy === 'complete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Selesaikan Sesi
          </button>
        )}
        {session.status === 'COMPLETED' && canApprove && (
          <button
            onClick={() => runStatusAction('approve')} disabled={busy !== null || isOwnCompletion}
            title={isOwnCompletion ? 'Orang yang menyelesaikan sesi tidak bisa menyetujui sesinya sendiri' : ''}
            className={btnPrimary} style={{ background: '#166534' }}
          >
            {busy === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} Setujui
          </button>
        )}
        {session.status === 'COMPLETED' && isOwnCompletion && (
          <p className="text-xs text-slate-400">Menunggu disetujui orang lain — Anda yang menyelesaikan sesi ini.</p>
        )}
      </div>

      {matchLine && (
        <ManualMatchModal line={matchLine} candidates={unmatchedBookTransactions} onClose={() => setMatchLine(null)} onMatched={confirmManualMatch} />
      )}
    </div>
  );
}

// ── Halaman Utama ─────────────────────────────────────────────────────────────────
export function FinanceReconciliation({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { can: canFn, currentUser } = useApp();
  const canEdit = canFn(FINANCE_MODULE, 'edit');
  const canApprove = canFn(FINANCE_MODULE, 'approve');

  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [fiscalYears, setFiscalYears] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [bankAccountId, setBankAccountId] = useState('');
  const [fiscalYearId, setFiscalYearId] = useState('');
  const [statements, setStatements] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [statementsMeta, setStatementsMeta] = useState<PageMeta | null>(null);
  const [sessionsMeta, setSessionsMeta] = useState<PageMeta | null>(null);
  const [loadingMoreStatements, setLoadingMoreStatements] = useState(false);
  const [loadingMoreSessions, setLoadingMoreSessions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [showNewStatement, setShowNewStatement] = useState(false);
  const [showNewSession, setShowNewSession] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [accounts, years] = await Promise.all([
          callApi<any[]>('get', '/api/v1/finance/bank-accounts'),
          callApi<any[]>('get', '/api/v1/finance/fiscal-years'),
        ]);
        setBankAccounts(accounts);
        setFiscalYears(years);
        setBankAccountId(prev => prev || accounts[0]?.id || '');
        setFiscalYearId(prev => prev || years.find((y: any) => y.is_current)?.id || years[0]?.id || '');
      } catch (err: any) {
        toast.error(err?.message || 'Gagal memuat data rekening bank / tahun fiskal');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!fiscalYearId) { setPeriods([]); return; }
    (async () => {
      try {
        const data = await callApi<any[]>('get', `/api/v1/finance/fiscal-years/${fiscalYearId}/periods`);
        setPeriods(data);
      } catch { setPeriods([]); }
    })();
  }, [fiscalYearId]);

  const loadLists = useCallback(async () => {
    if (!bankAccountId) return;
    setLoadingList(true);
    try {
      const [stmts, sess] = await Promise.all([
        callApiPaged<any[]>(`/api/v1/finance/reconciliation/bank-statements?bankAccountId=${bankAccountId}&page=1`),
        callApiPaged<any[]>(`/api/v1/finance/reconciliation?bankAccountId=${bankAccountId}&page=1`),
      ]);
      setStatements(stmts.data);
      setStatementsMeta(stmts.meta ?? null);
      setSessions(sess.data);
      setSessionsMeta(sess.meta ?? null);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat rekening koran / sesi rekonsiliasi');
    } finally {
      setLoadingList(false);
    }
  }, [bankAccountId]);

  useEffect(() => { loadLists(); }, [loadLists]);

  const loadMoreSessions = async () => {
    if (!sessionsMeta || sessionsMeta.page >= sessionsMeta.totalPages) return;
    setLoadingMoreSessions(true);
    try {
      const nextPage = sessionsMeta.page + 1;
      const { data, meta } = await callApiPaged<any[]>(`/api/v1/finance/reconciliation?bankAccountId=${bankAccountId}&page=${nextPage}`);
      setSessions(prev => [...prev, ...data]);
      setSessionsMeta(meta ?? null);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat sesi selanjutnya');
    } finally {
      setLoadingMoreSessions(false);
    }
  };

  const loadMoreStatements = async () => {
    if (!statementsMeta || statementsMeta.page >= statementsMeta.totalPages) return;
    setLoadingMoreStatements(true);
    try {
      const nextPage = statementsMeta.page + 1;
      const { data, meta } = await callApiPaged<any[]>(`/api/v1/finance/reconciliation/bank-statements?bankAccountId=${bankAccountId}&page=${nextPage}`);
      setStatements(prev => [...prev, ...data]);
      setStatementsMeta(meta ?? null);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat rekening koran selanjutnya');
    } finally {
      setLoadingMoreStatements(false);
    }
  };

  const refreshData = useCallback(async () => {
    try {
      const [accounts, years] = await Promise.all([
        callApi<any[]>('get', '/api/v1/finance/bank-accounts'),
        callApi<any[]>('get', '/api/v1/finance/fiscal-years'),
      ]);
      setBankAccounts(accounts);
      setFiscalYears(years);
    } catch {
      // ignore
    }
    await loadLists();
  }, [loadLists]);

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat…</div>;
  }

  if (bankAccounts.length === 0) {
    return (
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <p className="text-sm text-slate-500">Belum ada Rekening Bank — tambahkan dulu lewat menu Master Data Finance.</p>
      </div>
    );
  }

  if (selectedSessionId) {
    return (
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <SessionDetail
          sessionId={selectedSessionId} canApprove={canApprove} currentUserId={currentUser?.id}
          onBack={() => setSelectedSessionId(null)}
          onChanged={loadLists}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <FinancePageHeader
        title="Rekonsiliasi Kas & Rekening Bank"
        currentSection="Rekonsiliasi Bank"
        onNavigate={onNavigate}
        fiscalYears={fiscalYears}
        fiscalYearId={fiscalYearId}
        onFiscalYearChange={setFiscalYearId}
        onRefresh={refreshData}
        isRefreshing={loading || loadingList}
        systemBadge="Prinsip Audit Saldo Kas"
        metaBadge="Bank Clearing Trail"
        primaryAction={
          canEdit
            ? {
                label: '+ Sesi Rekonsiliasi Baru',
                icon: Plus,
                onClick: () => setShowNewSession(true),
              }
            : undefined
        }
        secondaryActions={
          canEdit ? (
            <button
              onClick={() => setShowNewStatement(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 bg-white transition-all shadow-xs"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" /> Input Rekening Koran
            </button>
          ) : undefined
        }
        infoStrip={[
          {
            label: 'Rekening Bank Terdaftar',
            value: `${bankAccounts.length} Rekening Aktif`,
            color: 'emerald',
          },
          {
            label: 'Sesi Rekonsiliasi',
            value: `${sessions.length} Sesi Periode`,
            color: 'sky',
          },
          {
            label: 'Toleransi Selisih',
            value: 'Rp 0 (Wajib Seimbang)',
            color: 'teal',
          },
          {
            label: 'Persetujuan Sesi',
            value: 'Verifikasi Independen (SoD)',
            color: 'indigo',
          },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pilih Rekening Bank:</label>
          <select
            value={bankAccountId}
            onChange={e => setBankAccountId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3] min-w-[240px] bg-white font-medium text-slate-700"
          >
            {bankAccounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.bank_name} — {a.account_number}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 font-medium">Periode</th>
              <th className="px-4 py-2.5 font-medium">Rekening Koran</th>
              <th className="px-4 py-2.5 font-medium text-right">Saldo Buku</th>
              <th className="px-4 py-2.5 font-medium text-right">Saldo Bank</th>
              <th className="px-4 py-2.5 font-medium text-right">Selisih Awal</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loadingList && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Memuat…</td></tr>
            )}
            {!loadingList && sessions.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Belum ada sesi rekonsiliasi untuk rekening ini.</td></tr>
            )}
            {!loadingList && sessions.map(s => (
              <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer" onClick={() => setSelectedSessionId(s.id)}>
                <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{s.period_name}</td>
                <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{s.statement_number || '—'} ({s.statement_date})</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatRp(s.system_balance)}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatRp(s.bank_balance)}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatRp(s.difference)}</td>
                <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {sessionsMeta && sessionsMeta.page < sessionsMeta.totalPages && (
          <div className="flex items-center justify-center py-3 border-t border-slate-100">
            <button onClick={loadMoreSessions} disabled={loadingMoreSessions}
              className="text-xs font-medium text-[#1A77A3] hover:underline disabled:opacity-50 flex items-center gap-1.5">
              {loadingMoreSessions && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Muat Lebih Banyak ({sessions.length} dari {sessionsMeta.total})
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <div className="px-4 py-2.5 border-b border-slate-100 text-xs font-medium text-slate-500">Rekening Koran Tersimpan ({statementsMeta?.total ?? statements.length})</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-2 font-medium">No.</th>
              <th className="px-4 py-2 font-medium">Tanggal</th>
              <th className="px-4 py-2 font-medium text-right">Saldo Akhir</th>
              <th className="px-4 py-2 font-medium">Baris Cocok</th>
              <th className="px-4 py-2 font-medium">Dipakai di Sesi</th>
            </tr>
          </thead>
          <tbody>
            {!loadingList && statements.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Belum ada rekening koran untuk rekening ini.</td></tr>
            )}
            {statements.map(s => (
              <tr key={s.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{s.statement_number || '—'}</td>
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{s.statement_date}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">{formatRp(s.closing_balance)}</td>
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{s.matched_count} / {s.line_count}</td>
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{s.reconciliation_id ? <StatusBadge status={s.reconciliation_status} /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {statementsMeta && statementsMeta.page < statementsMeta.totalPages && (
          <div className="flex items-center justify-center py-3 border-t border-slate-100">
            <button onClick={loadMoreStatements} disabled={loadingMoreStatements}
              className="text-xs font-medium text-[#1A77A3] hover:underline disabled:opacity-50 flex items-center gap-1.5">
              {loadingMoreStatements && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Muat Lebih Banyak ({statements.length} dari {statementsMeta.total})
            </button>
          </div>
        )}
      </div>

      {showNewStatement && (
        <NewStatementModal
          bankAccountId={bankAccountId}
          onClose={() => setShowNewStatement(false)}
          onCreated={() => { setShowNewStatement(false); loadLists(); }}
        />
      )}
      {showNewSession && (
        <NewSessionModal
          bankAccountId={bankAccountId} statements={statements} periods={periods}
          onClose={() => setShowNewSession(false)}
          onCreated={(id) => { setShowNewSession(false); loadLists(); setSelectedSessionId(id); }}
        />
      )}
    </div>
  );
}
