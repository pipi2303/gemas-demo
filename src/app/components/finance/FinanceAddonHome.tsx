import React, { useEffect, useState } from 'react';
import { Landmark, CheckCircle2, AlertTriangle, Loader2, Database, Layers, ArrowRight, ShieldCheck } from 'lucide-react';
import { api } from '../../../lib/apiClient';

interface FinanceStatus {
  schemaReady: boolean;
  mode: 'postgresql' | 'in-memory';
  accountGroups: number;
  voucherTypes: number;
}

interface StatusResponse {
  success: boolean;
  data?: FinanceStatus;
  error?: { code: string; message: string };
}

const UPCOMING_PHASES = [
  { title: 'Fase 1 — Master Data & Periode Fiskal', desc: 'Chart of Accounts, Bidang, Program/Kegiatan, Dana, Kas, Bank, Tahun Fiskal (12 periode otomatis)' },
  { title: 'Fase 2 — Budget / RKA', desc: 'Penyusunan anggaran per Bidang/Program/Kegiatan, alur pengajuan & persetujuan RKA' },
  { title: 'Fase 3 — Transaksi & Voucher', desc: 'Input transaksi kas/bank dengan penomoran voucher otomatis (BKM/BKK/BBM/BBK/BM/BT)' },
  { title: 'Fase 4 — Accounting Engine & Posting', desc: 'Jurnal berimbang otomatis (double-entry), posting ke General Ledger' },
  { title: 'Fase 5 — Verifikasi & Approval', desc: 'Alur kerja Submit → Verifikasi → Approve → Post dengan pemisahan tugas' },
  { title: 'Fase 6 — Rekonsiliasi Bank', desc: 'Impor mutasi rekening, pencocokan otomatis/manual' },
  { title: 'Fase 7 — Penutupan Periode', desc: 'Soft close, close, lock periode berjalan' },
  { title: 'Fase 8 — Laporan Keuangan', desc: 'Neraca, Laba Rugi, Arus Kas, Budget vs Actual' },
  { title: 'Fase 9 — Dashboard & Analitik', desc: 'Ringkasan eksekutif dan analitik keuangan' },
];

export function FinanceAddonHome() {
  const [status, setStatus] = useState<FinanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await api.get<StatusResponse>('/api/v1/finance/status');
        if (cancelled) return;
        if (res.success && res.data) {
          setStatus(res.data);
        } else {
          setErrorMsg(res.error?.message || 'Gagal memuat status modul Finance Add-on');
        }
      } catch (err: any) {
        if (!cancelled) setErrorMsg(err?.message || 'Gagal memuat status modul Finance Add-on');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#1A77A3' }}>
          <Landmark className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Finance Add-on</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Modul akuntansi double-entry untuk GEMAS — Fase 0: Fondasi Database &amp; Registrasi Modul
          </p>
        </div>
      </div>

      {/* Status card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Status Skema Database</h2>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Memeriksa status skema…
          </div>
        )}

        {!loading && errorMsg && (
          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {!loading && !errorMsg && status && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 text-sm rounded-lg p-3" style={
              status.schemaReady
                ? { color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0' }
                : { color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a' }
            }>
              {status.schemaReady ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>
                {status.schemaReady
                  ? 'Skema finance sudah aktif di PostgreSQL dan siap dipakai.'
                  : 'Server berjalan dengan penyimpanan in-memory (tanpa DATABASE_URL) — skema finance memerlukan koneksi PostgreSQL asli untuk aktif.'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Mode Penyimpanan</p>
                <p className="text-sm font-semibold text-slate-800 mt-1">
                  {status.mode === 'postgresql' ? 'PostgreSQL' : 'In-Memory (fallback)'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Kelompok Akun (seed)</p>
                <p className="text-sm font-semibold text-slate-800 mt-1">{status.accountGroups} baris</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Tipe Voucher (seed)</p>
                <p className="text-sm font-semibold text-slate-800 mt-1">{status.voucherTypes} baris</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* What's registered */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Yang Sudah Terpasang di Fase 0</h2>
        </div>
        <ul className="text-sm text-slate-600 space-y-1.5">
          <li>• Skema <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">finance</code> terpisah dari data GEMAS yang ada (23 tabel, 10 enum, fungsi &amp; view validasi)</li>
          <li>• Modul permission baru <strong>"Keuangan (Finance Add-on)"</strong> — akses diatur lewat menu Peran &amp; Hak Akses seperti modul lain</li>
          <li>• Endpoint <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">/api/v1/finance/*</code> terdaftar terpisah dari <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">/api/data</code> generic</li>
          <li>• Modul Keuangan &amp; Persembahan yang lama tetap berjalan seperti biasa selama masa transisi</li>
        </ul>
      </div>

      {/* Roadmap */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Roadmap Selanjutnya</h2>
        </div>
        <div className="space-y-2">
          {UPCOMING_PHASES.map((phase, i) => (
            <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
              <ArrowRight className="w-3.5 h-3.5 text-slate-300 mt-1 shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-700">{phase.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{phase.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
