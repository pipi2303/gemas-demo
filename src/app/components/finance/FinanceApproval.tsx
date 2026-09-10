// ============================================================
// FINANCE ADD-ON MODULE — Fase 5: Verifikasi & Approval
// ============================================================
// Halaman antrian lintas-transaksi: menampilkan semua transaksi yang PERLU
// diproses oleh pengguna yang sedang login (Verifikasi/Setujui/Posting),
// sehingga verifikator/penyetuju tidak perlu menyisir daftar Transaksi &
// Voucher satu per satu untuk mencari mana yang jadi tanggung jawabnya.
// Mesin status (verify/approve/reject/post/reverse) dan aturan segregation
// of duties sepenuhnya dibangun di Fase 4 (financeTransaction.ts) — halaman
// ini murni lapisan UX yang memanggil ulang endpoint yang sama, dan memakai
// ulang komponen TransactionDetail dari FinanceTransaction.tsx supaya alur
// aksinya identik (termasuk modal alasan Tolak/Balik Jurnal).
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../../lib/apiClient';
import { toast } from 'sonner';
import { ArrowLeft, Inbox, Loader2, ShieldCheck, CheckCircle2, Landmark } from 'lucide-react';
import { TransactionDetail, Lookups } from './FinanceTransaction';
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

const NEEDED_ACTION: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  SUBMITTED: { label: 'Perlu Verifikasi', icon: ShieldCheck,  color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  VERIFIED:  { label: 'Perlu Persetujuan', icon: CheckCircle2, color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
  APPROVED:  { label: 'Perlu Posting',     icon: Landmark,     color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
};

function NeededActionBadge({ status }: { status: string }) {
  const meta = NEEDED_ACTION[status];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5" style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}>
      <Icon className="w-3 h-3" /> {meta.label}
    </span>
  );
}

export function FinanceApproval({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { can: canFn, currentUser } = useApp();
  const canEdit = canFn(FINANCE_MODULE, 'edit');
  const canApprove = canFn(FINANCE_MODULE, 'approve');

  const [lookups, setLookups] = useState<Lookups>({
    fiscalYears: [], voucherTypes: [], accounts: [], fields: [], programs: [], activities: [], funds: [], cashAccounts: [], bankAccounts: [],
  });
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [queue, setQueue] = useState<any[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingMoreQueue, setLoadingMoreQueue] = useState(false);
  const [queueMeta, setQueueMeta] = useState<PageMeta | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    setQueueError(null);
    try {
      const { data, meta } = await callApiPaged<any[]>('/api/v1/finance/transactions/queue?page=1');
      setQueue(data);
      setQueueMeta(meta ?? null);
    } catch (err: any) {
      setQueueError(err?.message || 'Gagal memuat antrian verifikasi/persetujuan');
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  const loadMoreQueue = async () => {
    if (!queueMeta || queueMeta.page >= queueMeta.totalPages) return;
    setLoadingMoreQueue(true);
    try {
      const nextPage = queueMeta.page + 1;
      const { data, meta } = await callApiPaged<any[]>(`/api/v1/finance/transactions/queue?page=${nextPage}`);
      setQueue(prev => [...prev, ...data]);
      setQueueMeta(meta ?? null);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat antrian selanjutnya');
    } finally {
      setLoadingMoreQueue(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLookupsLoading(true);
      try {
        const [fiscalYears, voucherTypes, accounts, fields, programs, activities, funds, cashAccounts, bankAccounts] = await Promise.all([
          callApi<any[]>('/api/v1/finance/fiscal-years'),
          callApi<any[]>('/api/v1/finance/voucher-types'),
          callApi<any[]>('/api/v1/finance/accounts'),
          callApi<any[]>('/api/v1/finance/fields'),
          callApi<any[]>('/api/v1/finance/programs'),
          callApi<any[]>('/api/v1/finance/activities'),
          callApi<any[]>('/api/v1/finance/funds'),
          callApi<any[]>('/api/v1/finance/cash-accounts'),
          callApi<any[]>('/api/v1/finance/bank-accounts'),
        ]);
        setLookups({ fiscalYears, voucherTypes, accounts, fields, programs, activities, funds, cashAccounts, bankAccounts });
      } catch {
        // Lookup gagal dimuat cukup diam di sini — TransactionDetail akan tetap
        // tampil, hanya nama akun/bidang/dsb yang tidak terlihat lengkap.
      } finally {
        setLookupsLoading(false);
      }
    })();
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  if (selectedTx) {
    return (
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <TransactionDetail
          tx={selectedTx} canEdit={canEdit} canApprove={canApprove} currentUserId={currentUser?.id} lookups={lookups}
          onBack={() => { setSelectedTx(null); loadQueue(); }}
          onChanged={updated => updated && setSelectedTx(updated)}
        />
      </div>
    );
  }

  const submittedCount = queue.filter(q => q.status === 'SUBMITTED').length;
  const verifiedCount = queue.filter(q => q.status === 'VERIFIED').length;
  const approvedCount = queue.filter(q => q.status === 'APPROVED').length;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <FinancePageHeader
        title="Verifikasi & Persetujuan Transaksi"
        currentSection="Verifikasi & Persetujuan"
        onNavigate={onNavigate}
        statusBadge={{
          label: queue.length > 0 ? `${queue.length} Menunggu Tindakan` : 'Antrian Bersih',
          variant: queue.length > 0 ? 'amber' : 'emerald',
        }}
        systemBadge="Prinsip 4-Mata (SoD)"
        metaBadge="Approval Workflow"
        onRefresh={loadQueue}
        isRefreshing={loadingQueue}
        infoStrip={[
          {
            label: 'Perlu Verifikasi',
            value: `${submittedCount} Transaksi`,
            color: 'amber',
          },
          {
            label: 'Perlu Persetujuan',
            value: `${verifiedCount} Transaksi`,
            color: 'sky',
          },
          {
            label: 'Siap Posting',
            value: `${approvedCount} Transaksi`,
            color: 'emerald',
          },
          {
            label: 'Integritas SoD',
            value: 'Pembuat ≠ Verifikator ≠ KMJ',
            color: 'indigo',
          },
        ]}
      />

      {queueError && <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{queueError}</div>}

      {!queueError && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">No. Voucher</th>
                <th className="px-4 py-2.5 font-medium">Tanggal</th>
                <th className="px-4 py-2.5 font-medium">Jenis</th>
                <th className="px-4 py-2.5 font-medium">Keterangan</th>
                <th className="px-4 py-2.5 font-medium text-right">Jumlah</th>
                <th className="px-4 py-2.5 font-medium">Perlu Aksi</th>
              </tr>
            </thead>
            <tbody>
              {(loadingQueue || lookupsLoading) && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Memuat…</td></tr>
              )}
              {!loadingQueue && !lookupsLoading && queue.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Tidak ada transaksi yang menunggu Anda proses saat ini.</td></tr>
              )}
              {!loadingQueue && !lookupsLoading && queue.map(t => (
                <tr key={t.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer" onClick={() => setSelectedTx(t)}>
                  <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{t.voucher_number}</td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{t.transaction_date}</td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{t.voucher_type_code}</td>
                  <td className="px-4 py-2.5 text-slate-700">{t.description}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatRp(t.total_debit)}</td>
                  <td className="px-4 py-2.5"><NeededActionBadge status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {queueMeta && queueMeta.page < queueMeta.totalPages && (
            <div className="flex items-center justify-center py-3 border-t border-slate-100">
              <button onClick={loadMoreQueue} disabled={loadingMoreQueue}
                className="text-xs font-medium text-[#144f6b] hover:underline disabled:opacity-50 flex items-center gap-1.5">
                {loadingMoreQueue && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Muat Lebih Banyak ({queue.length} dari {queueMeta.total})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
