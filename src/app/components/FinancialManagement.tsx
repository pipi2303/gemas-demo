import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { toast } from 'sonner';
import { useDraggable } from '../../lib/useDraggable';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColResizeHandle } from './ui/resizable-th';
import { FinancialRecord } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DollarSign, TrendingUp, TrendingDown, Plus, X, Search,
  Printer, ChevronLeft, ChevronRight, Pencil, Trash2,
  ArrowUpRight, ArrowDownRight, BarChart3, List, FileText,
  Wallet, AlertCircle, CheckCircle, Filter, Download, Loader2
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatRp  = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
const compactRp = (n: number) => { if (n >= 1e9) return `Rp ${(n/1e9).toFixed(1)}M`; if (n >= 1e6) return `Rp ${(n/1e6).toFixed(1)}Jt`; return `Rp ${n.toLocaleString('id-ID')}`; };
const MONTHS    = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
const MONTH_FULL= ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const PAGE_SIZE = 15;

// ── Resizable table column defaults ─────────────────────────────────────────
const TX_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  date: 110, type: 130, category: 130, description: 220, reference: 100, amount: 130, recordedBy: 130, aksi: 90,
};
const REPORT_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  month: 130, income: 150, expense: 150, balance: 150, cumBalance: 150, count: 130,
};
const CAT_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  category: 200, amount: 150, percent: 100,
};

// ── SVG Charts ────────────────────────────────────────────────────────────────
function GroupedMonthlyBar({ data }: { data: { name: string; income: number; expense: number }[] }) {
  const W = 600, H = 190;
  const pad = { t: 10, r: 12, b: 30, l: 52 };
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
  const maxV = Math.max(...data.flatMap(d => [d.income, d.expense]), 1);
  const slotW = iW / data.length, groupW = slotW * 0.62, barW = groupW / 2, groupOff = (slotW - groupW) / 2;
  const f = (n: number) => n.toFixed(1);
  const yOf = (v: number) => pad.t + (1 - v / maxV) * iH;
  const inc = '#1A77A3', exp = '#ef4444';
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const y = pad.t + t * iH, v = maxV * (1 - t);
        return <g key={i}><line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="#f1f5f9" strokeWidth={1} /><text x={pad.l - 5} y={y + 4} textAnchor="end" fontSize={8} fill="#94a3b8">{v >= 1e6 ? `${(v/1e6).toFixed(0)}jt` : v >= 1e3 ? `${(v/1e3).toFixed(0)}rb` : v.toFixed(0)}</text></g>;
      })}
      {data.map((d, i) => {
        const x = pad.l + i * slotW + groupOff;
        const iH2 = d.income > 0 ? (d.income / maxV) * iH : 0;
        const eH2 = d.expense > 0 ? (d.expense / maxV) * iH : 0;
        const r = Math.min(3, barW / 2);
        return (
          <g key={i}>
            {iH2 > 0 && <path d={iH2 > r ? `M${f(x)},${f(yOf(d.income)+iH2)} L${f(x)},${f(yOf(d.income)+r)} Q${f(x)},${f(yOf(d.income))} ${f(x+r)},${f(yOf(d.income))} L${f(x+barW-r)},${f(yOf(d.income))} Q${f(x+barW)},${f(yOf(d.income))} ${f(x+barW)},${f(yOf(d.income)+r)} L${f(x+barW)},${f(yOf(d.income)+iH2)} Z` : `M${f(x)},${f(yOf(d.income)+iH2)} L${f(x)},${f(yOf(d.income))} L${f(x+barW)},${f(yOf(d.income))} L${f(x+barW)},${f(yOf(d.income)+iH2)} Z`} fill={inc} />}
            {eH2 > 0 && <path d={eH2 > r ? `M${f(x+barW+2)},${f(yOf(d.expense)+eH2)} L${f(x+barW+2)},${f(yOf(d.expense)+r)} Q${f(x+barW+2)},${f(yOf(d.expense))} ${f(x+barW+2+r)},${f(yOf(d.expense))} L${f(x+2*barW+2-r)},${f(yOf(d.expense))} Q${f(x+2*barW+2)},${f(yOf(d.expense))} ${f(x+2*barW+2)},${f(yOf(d.expense)+r)} L${f(x+2*barW+2)},${f(yOf(d.expense)+eH2)} Z` : `M${f(x+barW+2)},${f(yOf(d.expense)+eH2)} L${f(x+barW+2)},${f(yOf(d.expense))} L${f(x+2*barW+2)},${f(yOf(d.expense))} L${f(x+2*barW+2)},${f(yOf(d.expense)+eH2)} Z`} fill={exp} />}
            <text x={pad.l + i * slotW + slotW / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="#94a3b8">{d.name}</text>
          </g>
        );
      })}
      <g transform={`translate(${pad.l}, ${H - 12})`}>
        <rect x={0} y={-7} width={9} height={9} fill={inc} rx={2} /><text x={13} y={2} fontSize={9} fill="#64748b">Pemasukan</text>
        <rect x={75} y={-7} width={9} height={9} fill={exp} rx={2} /><text x={88} y={2} fontSize={9} fill="#64748b">Pengeluaran</text>
      </g>
    </svg>
  );
}

function CategoryDonut({ data, colors, size = 140 }: { data: { name: string; value: number }[]; colors: string[]; size?: number }) {
  const cx = size / 2, cy = size / 2, OR = size * 0.43, IR = size * 0.27;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const gap = 0.05;
  let angle = -Math.PI / 2;
  const arcs = data.map((d, i) => {
    const span = (d.value / total) * (Math.PI * 2 - gap * data.length);
    const sa = angle + gap / 2, ea = sa + span;
    angle += span + gap;
    const f = (n: number) => n.toFixed(2), lg = span > Math.PI ? 1 : 0;
    const [ox1, oy1] = [cx + OR * Math.cos(sa), cy + OR * Math.sin(sa)];
    const [ox2, oy2] = [cx + OR * Math.cos(ea), cy + OR * Math.sin(ea)];
    const [ix1, iy1] = [cx + IR * Math.cos(ea), cy + IR * Math.sin(ea)];
    const [ix2, iy2] = [cx + IR * Math.cos(sa), cy + IR * Math.sin(sa)];
    return <path key={i} d={`M${f(ox1)},${f(oy1)} A${OR},${OR} 0 ${lg},1 ${f(ox2)},${f(oy2)} L${f(ix1)},${f(iy1)} A${IR},${IR} 0 ${lg},0 ${f(ix2)},${f(iy2)} Z`} fill={colors[i % colors.length]} />;
  });
  return <svg width="100%" height={size} viewBox={`0 0 ${size} ${size}`}>{arcs}</svg>;
}

function BalanceLine({ data }: { data: { name: string; balance: number }[] }) {
  if (data.length < 2) return null;
  const W = 520, H = 120;
  const pad = { t: 10, r: 10, b: 28, l: 52 };
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
  const vals = data.map(d => d.balance);
  const minV = Math.min(...vals), maxV = Math.max(...vals) || 1;
  const range = Math.max(maxV - minV, 1);
  const xOf = (i: number) => pad.l + (i / (data.length - 1)) * iW;
  const yOf = (v: number) => pad.t + (1 - (v - minV) / range) * iH;
  const f = (n: number) => n.toFixed(1);
  const pts = data.map((d, i) => ({ x: xOf(i), y: yOf(d.balance) }));
  const line = pts.map(({ x, y }, i) => `${i === 0 ? 'M' : 'L'}${f(x)},${f(y)}`).join(' ');
  const gid = 'blg';
  const isPos = (v: number) => v >= 0;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" /><stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" /></linearGradient></defs>
      {[0, 0.5, 1].map((t, i) => { const y = pad.t + t * iH, v = maxV - t * range; return <g key={i}><line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="#f1f5f9" strokeWidth={1} /><text x={pad.l - 5} y={y + 4} textAnchor="end" fontSize={8} fill="#94a3b8">{v >= 1e6 ? `${(v/1e6).toFixed(0)}jt` : v.toFixed(0)}</text></g>; })}
      <path d={`${line} L${f(pts[pts.length-1].x)},${H-pad.b} L${f(pts[0].x)},${H-pad.b} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke="#3b82f6" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(({ x, y }, i) => <circle key={i} cx={x} cy={y} r={3} fill={isPos(data[i].balance) ? '#3b82f6' : '#ef4444'} stroke="white" strokeWidth={1.5} />)}
      {data.map((d, i) => <text key={i} x={xOf(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="#94a3b8">{d.name}</text>)}
    </svg>
  );
}

// ── Form Modal ────────────────────────────────────────────────────────────────
function FinancialForm({ rec, categories, currentUser, onSave, onClose }: {
  rec: Partial<FinancialRecord> | null; categories: any[];
  currentUser: any; onSave: (data: any) => void; onClose: () => void;
}) {
  const { offset, onMouseDown } = useDraggable();
  const now = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    date: rec?.date || now,
    type: (rec?.type || 'income') as 'income' | 'expense',
    category: rec?.category || '',
    amount: rec?.amount?.toString() || '',
    description: rec?.description || '',
    reference: rec?.reference || '',
  });
  const avCats = categories.filter(c => c.type === form.type);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.category || !form.amount || !form.description) { toast.error('Lengkapi semua field wajib'); return; }
    if (isNaN(parseFloat(form.amount)) || parseFloat(form.amount) <= 0) { toast.error('Jumlah tidak valid'); return; }
    onSave({ ...form, amount: parseFloat(form.amount), recordedBy: currentUser?.name || '', recordedById: currentUser?.id || '' });
  };
  const inpCls = "w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:border-[#7290a0] transition-colors";
  const styl = { borderColor: '#e2e8f0' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
        <div className="px-6 py-4" style={{ background: '#f0ede5', cursor: 'move' }} onMouseDown={onMouseDown}>
          <div className="flex items-center justify-between">
            <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '16px', fontWeight: 700, color: 'white' }}>{rec?.id ? 'Edit Transaksi' : 'Tambah Transaksi'}</h2>
            <button onClick={onClose} data-tooltip="Tutup" className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition-colors"><X className="w-4 h-4 text-white" /></button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Tipe */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Jenis Transaksi *</label>
            <div className="grid grid-cols-2 gap-2">
              {(['income', 'expense'] as const).map(t => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t, category: '' }))}
                  className="py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: form.type === t ? (t === 'income' ? '#1A77A3' : '#dc2626') : '#f8fafc', color: form.type === t ? 'white' : '#64748b', border: `1px solid ${form.type === t ? 'transparent' : '#e2e8f0'}` }}>
                  {t === 'income' ? '↑ Pemasukan' : '↓ Pengeluaran'}
                </button>
              ))}
            </div>
          </div>
          {/* Kategori */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Kategori *</label>
            <select autoFocus value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inpCls} style={styl} required>
              <option value="">Pilih Kategori</option>
              {[...avCats].sort((a,b)=>a.name.localeCompare(b.name,'id')).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          {/* Jumlah & Tanggal */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Jumlah (Rp) *</label>
              <input type="number" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className={inpCls} style={styl} placeholder="0" required />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Tanggal *</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inpCls} style={styl} required />
            </div>
          </div>
          {/* Deskripsi */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Deskripsi *</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={inpCls} style={styl} placeholder="Keterangan transaksi..." required />
          </div>
          {/* Referensi */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>No. Referensi</label>
            <input type="text" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} className={inpCls} style={styl} placeholder="Opsional" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#f1f5f9', color: '#475569' }}>Batal</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#f0ede5' }}>Simpan</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function FinancialManagement() {
  const { financialRecords, financialCategories, currentUser, addFinancialRecord, updateFinancialRecord, deleteFinancialRecord, can } = useApp();

  const canCreate = can('financial', 'create');
  const canEdit   = can('financial', 'edit');
  const canDelete = can('financial', 'delete');

  const now = new Date();
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'report'>('overview');
  const [filterYear,   setFilterYear]   = useState(now.getFullYear());
  const [filterMonth,  setFilterMonth]  = useState(-1);
  const [filterType,   setFilterType]   = useState<'all' | 'income' | 'expense'>('all');
  const [filterCat,    setFilterCat]    = useState('all');
  const [search,       setSearch]       = useState('');
  const [page,         setPage]         = useState(1);
  const [showForm,     setShowForm]     = useState(false);
  const [editRec,      setEditRec]      = useState<FinancialRecord | null>(null);

  const { widths: txColW, startResize: startResizeTx } = useResizableColumns('financial-management-transactions', TX_TABLE_DEFAULT_WIDTHS);
  const { widths: reportColW, startResize: startResizeReport } = useResizableColumns('financial-management-report', REPORT_TABLE_DEFAULT_WIDTHS);
  const { widths: incCatColW, startResize: startResizeIncCat } = useResizableColumns('financial-management-income-cat', CAT_TABLE_DEFAULT_WIDTHS);
  const { widths: expCatColW, startResize: startResizeExpCat } = useResizableColumns('financial-management-expense-cat', CAT_TABLE_DEFAULT_WIDTHS);

  const years = [...new Set(financialRecords.map(r => new Date(r.date).getFullYear()))].sort((a, b) => b - a);
  if (!years.includes(now.getFullYear())) years.unshift(now.getFullYear());

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const curM = now.getMonth(), curY = now.getFullYear();
    const yearRecs = financialRecords.filter(r => new Date(r.date).getFullYear() === filterYear);
    const totalIncome  = yearRecs.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const totalExpense = yearRecs.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const balance      = totalIncome - totalExpense;
    const monthIncome  = financialRecords.filter(r => r.type === 'income'  && new Date(r.date).getMonth() === curM && new Date(r.date).getFullYear() === curY).reduce((s, r) => s + r.amount, 0);
    const monthExpense = financialRecords.filter(r => r.type === 'expense' && new Date(r.date).getMonth() === curM && new Date(r.date).getFullYear() === curY).reduce((s, r) => s + r.amount, 0);

    const monthly = MONTHS.map((name, mi) => ({
      name, income: yearRecs.filter(r => r.type === 'income'  && new Date(r.date).getMonth() === mi).reduce((s, r) => s + r.amount, 0),
      expense:      yearRecs.filter(r => r.type === 'expense' && new Date(r.date).getMonth() === mi).reduce((s, r) => s + r.amount, 0),
    }));

    const balanceTrend = monthly.map((m, i) => ({ name: m.name, balance: monthly.slice(0, i + 1).reduce((s, x) => s + x.income - x.expense, 0) }));

    const incomeByCategory  = financialCategories.filter(c => c.type === 'income').map(c => ({ name: c.name, value: yearRecs.filter(r => r.type === 'income' && r.category === c.name).reduce((s, r) => s + r.amount, 0) })).filter(d => d.value > 0);
    const expenseByCategory = financialCategories.filter(c => c.type === 'expense').map(c => ({ name: c.name, value: yearRecs.filter(r => r.type === 'expense' && r.category === c.name).reduce((s, r) => s + r.amount, 0) })).filter(d => d.value > 0);

    const recentTx = [...financialRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

    const monthlyReport = MONTHS.map((name, mi) => {
      const mo = yearRecs.filter(r => new Date(r.date).getMonth() === mi);
      const inc = mo.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
      const exp = mo.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
      return { name, income: inc, expense: exp, balance: inc - exp, count: mo.length };
    });

    return { totalIncome, totalExpense, balance, monthIncome, monthExpense, monthly, balanceTrend, incomeByCategory, expenseByCategory, recentTx, monthlyReport };
  }, [financialRecords, financialCategories, filterYear]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return financialRecords.filter(r => {
      const d = new Date(r.date);
      if (d.getFullYear() !== filterYear) return false;
      if (filterMonth >= 0 && d.getMonth() !== filterMonth) return false;
      if (filterType !== 'all' && r.type !== filterType) return false;
      if (filterCat !== 'all' && r.category !== filterCat) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.description.toLowerCase().includes(q) && !r.category.toLowerCase().includes(q) && !r.recordedBy.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [financialRecords, filterYear, filterMonth, filterType, filterCat, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filteredIncome  = filtered.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const filteredExpense = filtered.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const handleSave = (data: any) => {
    if (editRec) { updateFinancialRecord(editRec.id, data); }
    else { addFinancialRecord(data); }
    setShowForm(false); setEditRec(null);
  };
  const handleDelete = (r: FinancialRecord) => {
    if (!window.confirm(`Hapus transaksi "${r.description}"?`)) return;
    deleteFinancialRecord(r.id);
  };
  const openEdit = (r: FinancialRecord) => { setEditRec(r); setShowForm(true); };
  const openCreate = () => { setEditRec(null); setShowForm(true); };

  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportFinancialPdf = () => {
    setIsExportingPdf(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 14;

      // ── Header Banner ──
      doc.setFillColor(13, 26, 45); // #0d1a2d GPIB Navy
      doc.rect(0, 0, pageWidth, 26, 'F');

      doc.setFillColor(212, 175, 55); // #d4af37 GPIB Gold stripe
      doc.rect(0, 26, pageWidth, 1.5, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('GEREJA PROTESTAN DI INDONESIA BAGIAN BARAT (GPIB)', pageWidth / 2, 9, { align: 'center' });

      doc.setFontSize(15);
      doc.setTextColor(223, 183, 116); // Gold text
      doc.text('JEMAAT "BAHTERA KASIH"', pageWidth / 2, 16, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(203, 213, 225);
      doc.text('Gereja Manajemen Sistem (GEMAS) · Laporan Keuangan & Perbendaharaan Jemaat', pageWidth / 2, 22, { align: 'center' });

      y = 34;

      // ── Title & Meta ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(`LAPORAN KEUANGAN KAS GEREJA TAHUN ${filterYear}`, 14, y);

      const yearRecords = financialRecords.filter(r => new Date(r.date).getFullYear() === filterYear);
      const totalInc = stats.monthlyReport.reduce((s, m) => s + m.income, 0);
      const totalExp = stats.monthlyReport.reduce((s, m) => s + m.expense, 0);
      const totalNet = totalInc - totalExp;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      const printDateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      doc.text(`Dicetak pada: ${printDateStr} · Total Transaksi Tercatat: ${yearRecords.length}`, 14, y + 5);
      y += 11;

      // ── Section I: RINGKASAN KEUANGAN TAHUNAN ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(13, 26, 45);
      doc.text('I. RINGKASAN REALISASI ARUS KAS TAHUN ' + filterYear, 14, y);
      y += 4;

      autoTable(doc, {
        startY: y,
        head: [['Posisi Kas / Indikator', 'Nilai Realisasi (Rp)', 'Status / Keterangan']],
        body: [
          ['Total Pemasukan Kas', formatRp(totalInc), 'Penerimaan persembahan, perpuluhan, dll.'],
          ['Total Pengeluaran Kas', formatRp(totalExp), 'Beban operasional, pelayanan & pemeliharaan'],
          ['Saldo Bersih Kas (Surplus / Defisit)', formatRp(totalNet), totalNet >= 0 ? 'Surplus Operasional (+)' : 'Defisit Operasional (-)'],
          ['Total Transaksi Tercatat', `${yearRecords.length} Transaksi`, 'Terverifikasi dalam buku kas'],
        ],
        theme: 'grid',
        headStyles: { fillColor: [13, 26, 45], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 70, fontStyle: 'bold' },
          1: { cellWidth: 50, halign: 'right', fontStyle: 'bold' },
          2: { cellWidth: 62 },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index === 2) {
            data.cell.styles.fillColor = totalNet >= 0 ? [240, 253, 244] : [254, 242, 242];
            data.cell.styles.textColor = totalNet >= 0 ? [22, 101, 52] : [153, 27, 27];
          }
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 8;

      // ── Section II: REKAPITULASI KAS PER BULAN ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(13, 26, 45);
      doc.text('II. REKAPITULASI KAS PER BULAN (JANUARI – DESEMBER)', 14, y);
      y += 4;

      let runningBalance = 0;
      const monthlyRows = stats.monthlyReport.map((m, idx) => {
        runningBalance += m.balance;
        return [
          String(idx + 1),
          m.name,
          formatRp(m.income),
          formatRp(m.expense),
          formatRp(m.balance),
          formatRp(runningBalance),
          String(m.count),
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [['No', 'Bulan', 'Pemasukan (Rp)', 'Pengeluaran (Rp)', 'Saldo Bersih (Rp)', 'Kumulatif (Rp)', 'Trx']],
        body: [
          ...monthlyRows,
          [
            '—',
            'TOTAL ' + filterYear,
            formatRp(totalInc),
            formatRp(totalExp),
            formatRp(totalNet),
            formatRp(runningBalance),
            String(yearRecords.length),
          ],
        ],
        theme: 'striped',
        headStyles: { fillColor: [20, 79, 107], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 32, fontStyle: 'bold' },
          2: { cellWidth: 30, halign: 'right' },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
          5: { cellWidth: 35, halign: 'right' },
          6: { cellWidth: 15, halign: 'center' },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index === stats.monthlyReport.length) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 247, 251];
            data.cell.styles.textColor = [20, 79, 107];
          }
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 8;

      // Page check before category breakdown
      if (y > 180) {
        doc.addPage();
        y = 20;
      }

      // ── Section III: DISTRIBUSI KATEGORI (PEMASUKAN & PENGELUARAN) ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(13, 26, 45);
      doc.text('III. DISTRIBUSI KATEGORI PEMASUKAN & PENGELUARAN', 14, y);
      y += 4;

      const incBreakdown = stats.incomeCats.map((c, i) => [
        String(i + 1),
        c.name,
        formatRp(c.amount),
        `${c.percent.toFixed(1)}%`
      ]);

      const expBreakdown = stats.expenseCats.map((c, i) => [
        String(i + 1),
        c.name,
        formatRp(c.amount),
        `${c.percent.toFixed(1)}%`
      ]);

      autoTable(doc, {
        startY: y,
        head: [['No', 'Kategori Pemasukan', 'Jumlah (Rp)', '% Kontribusi']],
        body: incBreakdown.length > 0 ? incBreakdown : [['—', 'Tidak ada data pemasukan', 'Rp 0', '0%']],
        theme: 'grid',
        headStyles: { fillColor: [13, 26, 45], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 85, fontStyle: 'bold' },
          2: { cellWidth: 55, halign: 'right' },
          3: { cellWidth: 34, halign: 'center' },
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 6;

      if (y > 210) {
        doc.addPage();
        y = 20;
      }

      autoTable(doc, {
        startY: y,
        head: [['No', 'Kategori Pengeluaran', 'Jumlah (Rp)', '% Kontribusi']],
        body: expBreakdown.length > 0 ? expBreakdown : [['—', 'Tidak ada data pengeluaran', 'Rp 0', '0%']],
        theme: 'grid',
        headStyles: { fillColor: [185, 28, 28], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 85, fontStyle: 'bold' },
          2: { cellWidth: 55, halign: 'right' },
          3: { cellWidth: 34, halign: 'center' },
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 8;

      // ── Section IV: DAFTAR TRANSAKSI KEUANGAN TAHUN BERJALAN ──
      if (y > 190) {
        doc.addPage();
        y = 20;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(13, 26, 45);
      doc.text(`IV. DAFTAR TRANSAKSI KEUANGAN TAHUN ${filterYear} (Terverifikasi)`, 14, y);
      y += 4;

      const txRows = yearRecords
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((r, i) => [
          String(i + 1),
          new Date(r.date).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          r.type === 'income' ? 'Masuk' : 'Keluar',
          r.category,
          r.description,
          r.reference || '—',
          formatRp(r.amount),
          r.recordedBy || 'Admin',
        ]);

      autoTable(doc, {
        startY: y,
        head: [['No', 'Tanggal', 'Tipe', 'Kategori', 'Keterangan', 'Ref', 'Jumlah (Rp)', 'Petugas']],
        body: txRows.length > 0 ? txRows : [['—', '—', '—', '—', 'Belum ada transaksi tercatat', '—', '—', '—']],
        theme: 'striped',
        headStyles: { fillColor: [13, 26, 45], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fontSize: 7, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 7, halign: 'center' },
          1: { cellWidth: 18, halign: 'center' },
          2: { cellWidth: 14, halign: 'center' },
          3: { cellWidth: 28 },
          4: { cellWidth: 50 },
          5: { cellWidth: 16, halign: 'center' },
          6: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
          7: { cellWidth: 23 },
        },
        margin: { left: 14, right: 14 },
      });

      y = (doc as any).lastAutoTable.finalY + 12;

      // Check space for signature
      if (y > 235) {
        doc.addPage();
        y = 25;
      }

      // ── Signature Blocks ──
      const signY = y + 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);

      doc.text('Mengetahui / Menyetujui,', 20, signY);
      doc.text('Pengelola Kas / Perbendaharaan,', pageWidth - 75, signY);

      doc.setFont('helvetica', 'bold');
      doc.text('Majelis Jemaat GPIB Bahtera Kasih', 20, signY + 5);
      doc.text('Bendahara Jemaat', pageWidth - 75, signY + 5);

      doc.text('( .................................................... )', 20, signY + 28);
      doc.text('( .................................................... )', pageWidth - 75, signY + 28);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text('Ketua Majelis Jemaat / PHMJ', 20, signY + 33);
      doc.text('Bendahara I / II', pageWidth - 75, signY + 33);

      // ── Page numbering on all pages ──
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `GPIB Bahtera Kasih · Laporan Keuangan Tahun ${filterYear} · Halaman ${p} dari ${totalPages}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 7,
          { align: 'center' }
        );
      }

      doc.save(`Laporan-Keuangan-GPIB-Bahtera-Kasih-${filterYear}.pdf`);
      toast.success(`Laporan Keuangan Tahun ${filterYear} berhasil diekspor ke PDF!`);
    } catch (err) {
      console.error('Error generating Finance PDF:', err);
      toast.error('Gagal mengekspor laporan keuangan ke PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // ── Print ──────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=1000,height=700');
    if (!w) return;
    const totalInc = stats.monthlyReport.reduce((s, m) => s + m.income, 0);
    const totalExp = stats.monthlyReport.reduce((s, m) => s + m.expense, 0);
    w.document.write(`<html><head><title>Laporan Keuangan ${filterYear}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;font-size:12px;color:#222}h2{color:#144f6b;margin:0 0 4px}p.sub{color:#64748b;margin:0 0 20px}
    table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #e2e8f0;padding:7px 12px;text-align:left}
    th{background:#144f6b;color:white;font-size:11px;text-transform:uppercase;letter-spacing:.04em}tr:nth-child(even){background:#f8fafc}
    .inc{color:#1A77A3;font-weight:600}.exp{color:#ef4444;font-weight:600}.bal{font-weight:700}
    .footer{margin-top:20px;border-top:1px solid #e2e8f0;padding-top:10px;color:#64748b;font-size:11px}</style></head><body>
    <h2>GPIB BAHTERA KASIH – Laporan Keuangan ${filterYear}</h2>
    <p class="sub">Dicetak: ${now.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})} · Total Transaksi: ${financialRecords.filter(r=>new Date(r.date).getFullYear()===filterYear).length}</p>
    <table><tr><th>Bulan</th><th>Pemasukan</th><th>Pengeluaran</th><th>Saldo</th><th>Jml Transaksi</th></tr>
    ${stats.monthlyReport.map(m=>`<tr><td>${m.name}</td><td class="inc">${formatRp(m.income)}</td><td class="exp">${formatRp(m.expense)}</td><td class="bal ${m.balance>=0?'inc':'exp'}">${formatRp(m.balance)}</td><td>${m.count}</td></tr>`).join('')}
    <tr style="background:#f0f7fb"><td><strong>TOTAL</strong></td><td class="inc">${formatRp(totalInc)}</td><td class="exp">${formatRp(totalExp)}</td><td class="bal">${formatRp(totalInc-totalExp)}</td><td>${financialRecords.filter(r=>new Date(r.date).getFullYear()===filterYear).length}</td></tr></table>
    <p class="footer">GEMAS GPIB Bahtera Kasih · Laporan ini dicetak secara otomatis</p></body></html>`);
    w.document.close(); w.print();
  };

  const INC_COLORS  = ['#1A77A3','#f0ede5','#b8d5e8','#a7f3d0','#0d9488','#1A77A3'];
  const EXP_COLORS  = ['#ef4444','#9c9486','#c2baaa','#ec4899','#3a7fa0','#64748b'];
  const tabCls      = (t: string) => `px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${activeTab === t ? 'text-[#384959] shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`;

  return (
    <div className="space-y-6">

      {/* ── HERO ── */}
      <div className="relative overflow-hidden rounded-2xl p-6" style={{ background: '#144f6b', boxShadow: '0 8px 32px rgba(6,95,70,0.22)' }}>
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle,rgba(255,255,255,0.9) 1px,transparent 1px)', backgroundSize: '20px 20px' }} />
        <div className="relative flex items-center justify-between flex-wrap gap-5">
          <div>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>Modul 3 · Keuangan & Persembahan</p>
            <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '24px', fontWeight: 800, color: 'white', lineHeight: 1.2 }}>Laporan Keuangan</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', marginTop: '4px' }}>Pemasukan · Pengeluaran · Saldo Kas Gereja</p>
          </div>
          <div className="flex gap-4 flex-wrap">
            {[
              { label: 'Total Pemasukan',   value: compactRp(stats.totalIncome),  color: '#f0ede5' },
              { label: 'Total Pengeluaran', value: compactRp(stats.totalExpense), color: '#fca5a5' },
              { label: 'Saldo Bersih',      value: compactRp(stats.balance),      color: stats.balance >= 0 ? '#93c5fd' : '#fca5a5' },
            ].map((item, i) => (
              <div key={i} className="text-right">
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>{item.label}</p>
                <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '20px', fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp,    label: 'Total Pemasukan',   value: compactRp(stats.totalIncome),  sub: `Tahun ${filterYear}`,           grad: '#1A77A3', arrow: true },
          { icon: TrendingDown,  label: 'Total Pengeluaran', value: compactRp(stats.totalExpense), sub: `Tahun ${filterYear}`,           grad: '#dc2626', arrow: false },
          { icon: Wallet,        label: 'Saldo Bersih',      value: compactRp(stats.balance),      sub: stats.balance >= 0 ? 'Surplus' : 'Defisit', grad: stats.balance >= 0 ? '#1A77A3' : 'linear-gradient(135deg,#f59e0b,#fbbf24)', arrow: stats.balance >= 0 },
          { icon: DollarSign,    label: 'Bulan Ini',         value: compactRp(stats.monthIncome),  sub: `Keluar: ${compactRp(stats.monthExpense)}`,  grad: '#3a7fa0', arrow: true },
        ].map((c, i) => (
          <div key={i} className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: c.grad }}><c.icon className="w-5 h-5 text-white" /></div>
              {c.arrow ? <ArrowUpRight className="w-4 h-4 text-[#3a7fa0]" /> : <ArrowDownRight className="w-4 h-4 text-red-500" />}
            </div>
            <p style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1 }}>{c.value}</p>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '5px', fontWeight: 500 }}>{c.label}</p>
            <p style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px' }}>{c.sub}</p>
          </div>
        ))}
      </div>

      {/* ── TOOLBAR ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 p-1 rounded-xl" style={{ background: '#f1f5f9' }}>
          {(['overview', 'transactions', 'report'] as const).map((t, i) => (
            <button key={t} onClick={() => setActiveTab(t)} className={tabCls(t)}
              style={activeTab === t ? { background: '#FFEFB2' } : {}}>
              {[<BarChart3 className="w-3.5 h-3.5 inline mr-1.5" />, <List className="w-3.5 h-3.5 inline mr-1.5" />, <FileText className="w-3.5 h-3.5 inline mr-1.5" />][i]}
              {['Ringkasan', 'Transaksi', 'Laporan'][i]}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: '#e2e8f0' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <button
            onClick={handleExportFinancialPdf}
            disabled={isExportingPdf}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-white text-sm font-semibold transition-all shadow-sm"
            style={{ background: '#0d1a2d', border: '1px solid #caa049' }}
          >
            {isExportingPdf ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                <span>Mengekspor...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-amber-300" />
                <span>Ekspor PDF</span>
              </>
            )}
          </button>

          <button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 rounded-xl border hover:bg-gray-50 transition-colors text-sm" style={{ borderColor: '#e2e8f0' }}>
            <Printer className="w-4 h-4 text-gray-500" />
            <span>Cetak</span>
          </button>

          {activeTab === 'transactions' && canCreate && (
            <button onMouseDown={e=>e.preventDefault()} onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold" style={{ background: '#1A77A3', boxShadow: '0 2px 8px rgba(26,119,163,0.3)' }}>
              <Plus className="w-4 h-4" />
              <span>Tambah</span>
            </button>
          )}
        </div>
      </div>

      {/* ══ TAB: RINGKASAN ══════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Monthly bar chart */}
          <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Pemasukan vs Pengeluaran {filterYear}</p>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded bg-[#1A77A3] inline-block" />Pemasukan</span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded bg-red-500 inline-block" />Pengeluaran</span>
              </div>
            </div>
            <GroupedMonthlyBar data={stats.monthly} />
          </div>

          {/* Saldo trend + categories */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white rounded-2xl p-5" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>Tren Saldo Kumulatif {filterYear}</p>
              <BalanceLine data={stats.balanceTrend} />
            </div>
            <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>Saldo vs Target</p>
              <div className="space-y-3">
                {[
                  { label: 'Saldo Bersih',    val: stats.balance,       col: stats.balance >= 0 ? '#1A77A3' : '#ef4444', bg: stats.balance >= 0 ? '#f0f7fb' : '#fef2f2' },
                  { label: 'Total Pemasukan', val: stats.totalIncome,   col: '#1A77A3', bg: '#f0f7fb' },
                  { label: 'Total Pengeluaran',val: stats.totalExpense, col: '#ef4444', bg: '#fef2f2' },
                  { label: 'Bulan Ini Masuk', val: stats.monthIncome,   col: '#3b82f6', bg: '#eff6ff' },
                  { label: 'Bulan Ini Keluar',val: stats.monthExpense,  col: '#9c9486', bg: '#fff7ed' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between p-2.5 rounded-xl" style={{ background: item.bg }}>
                    <span style={{ fontSize: '11.5px', color: item.col, fontWeight: 500 }}>{item.label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: item.col, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{compactRp(item.val)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Category breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {[
              { title: 'Pemasukan per Kategori', data: stats.incomeByCategory, colors: INC_COLORS, type: 'income' as const },
              { title: 'Pengeluaran per Kategori', data: stats.expenseByCategory, colors: EXP_COLORS, type: 'expense' as const },
            ].map(({ title, data, colors, type }) => (
              <div key={type} className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>{title}</p>
                {data.length === 0 ? <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>Tidak ada data</p> : (
                  <div className="grid grid-cols-5 gap-3 items-center">
                    <div className="col-span-2"><CategoryDonut data={data} colors={colors} /></div>
                    <div className="col-span-3 space-y-2">
                      {data.map((item, i) => {
                        const total = data.reduce((s, d) => s + d.value, 0) || 1;
                        return (
                          <div key={item.name}>
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colors[i % colors.length] }} /><span style={{ fontSize: '11px', color: '#475569' }} className="truncate">{item.name}</span></div>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>{compactRp(item.value)}</span>
                            </div>
                            <div className="h-1 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(item.value / total) * 100}%`, background: colors[i % colors.length] }} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Recent transactions */}
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Transaksi Terbaru</p>
              <button onClick={() => setActiveTab('transactions')} className="text-sm text-[#1A77A3] font-medium hover:underline">Lihat Semua →</button>
            </div>
            <table className="w-full">
              <tbody>
                {stats.recentTx.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f2f0ea' }} className="hover:bg-[#f6f4f0]/20 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: r.type === 'income' ? '#f0f7fb' : '#fef2f2' }}>
                          {r.type === 'income' ? <TrendingUp className="w-4 h-4 text-[#1A77A3]" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
                        </div>
                        <div>
                          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{r.description}</p>
                          <p style={{ fontSize: '11.5px', color: '#94a3b8' }}>{r.category} · {r.recordedBy}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3" style={{ fontSize: '12px', color: '#94a3b8' }}>{new Date(r.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-5 py-3 text-right" style={{ fontSize: '14px', fontWeight: 700, color: r.type === 'income' ? '#1A77A3' : '#ef4444', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      {r.type === 'income' ? '+' : '-'}{formatRp(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ TAB: TRANSAKSI ══════════════════════════════════════════════════════ */}
      {activeTab === 'transactions' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="rounded-2xl border bg-white overflow-hidden" style={{borderColor:'#e2e8f0',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
            <div className="flex items-center gap-3 p-3 border-b" style={{borderColor:'#f1f5f9'}}>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
                <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Cari deskripsi, kategori, referensi..."
                  className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border focus:outline-none transition-all"
                  style={{borderColor:search?'#1A77A3':'#e2e8f0',background:'#fafafa'}}/>
                {search && <button onClick={()=>{setSearch('');setPage(1);}} data-tooltip="Hapus pencarian" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-gray-200 transition-all" style={{color:'#94a3b8'}}><X className="w-3.5 h-3.5"/></button>}
              </div>
            </div>
            <div className="p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'0.08em',color:'#b0bec5',textTransform:'uppercase',minWidth:'68px'}}>Periode</span>
                {(()=>{const active=filterMonth>=0;return <select value={filterMonth} onChange={e=>{setFilterMonth(Number(e.target.value));setPage(1);}} className="px-2.5 py-1 text-sm rounded-full border focus:outline-none transition-all cursor-pointer" style={{borderColor:active?'#1A77A3':'#e2e8f0',background:active?'#f0f7fb':'#fafafa',color:active?'#1A77A3':'#64748b',fontWeight:active?600:400}}><option value={-1}>Semua Bulan</option>{MONTH_FULL.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>;})()}
              </div>
              <div style={{height:'1px',background:'#f1f5f9'}}/>
              <div className="flex flex-wrap items-center gap-2">
                <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'0.08em',color:'#b0bec5',textTransform:'uppercase',minWidth:'68px'}}>Transaksi</span>
                {([
                  {val:filterType,set:(v:string)=>{setFilterType(v as any);setPage(1);},opts:[{v:'all',l:'Semua Jenis'},{v:'income',l:'Pemasukan'},{v:'expense',l:'Pengeluaran'}]},
                  {val:filterCat,set:(v:string)=>{setFilterCat(v);setPage(1);},opts:[{v:'all',l:'Semua Kategori'},...financialCategories.map(c=>({v:c.name,l:c.name}))]},
                ] as {val:string;set:(v:string)=>void;opts:{v:string;l:string}[]}[]).map((f,i)=>{
                  const active=f.val!=='all';
                  return <select key={i} value={f.val} onChange={e=>f.set(e.target.value)} className="px-2.5 py-1 text-sm rounded-full border focus:outline-none transition-all cursor-pointer" style={{borderColor:active?'#1A77A3':'#e2e8f0',background:active?'#f0f7fb':'#fafafa',color:active?'#1A77A3':'#64748b',fontWeight:active?600:400}}>{f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>;
                })}
              </div>
            </div>
            {(filterMonth>=0||filterType!=='all'||filterCat!=='all'||search) ? (
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
                <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,whiteSpace:'nowrap'}}>Filter aktif:</span>
                {search && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}><Search className="w-3 h-3"/>"{search.length>15?search.slice(0,15)+'…':search}"<button onClick={()=>{setSearch('');setPage(1);}} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
                {filterMonth>=0 && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>{MONTH_FULL[filterMonth]}<button onClick={()=>{setFilterMonth(-1);setPage(1);}} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
                {filterType!=='all' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>{filterType==='income'?'Pemasukan':'Pengeluaran'}<button onClick={()=>{setFilterType('all');setPage(1);}} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
                {filterCat!=='all' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>{filterCat}<button onClick={()=>{setFilterCat('all');setPage(1);}} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
                <button onClick={()=>{setFilterMonth(-1);setFilterType('all');setFilterCat('all');setSearch('');setPage(1);}} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all hover:bg-red-50" style={{borderColor:'#fca5a5',color:'#ef4444'}}><X className="w-3 h-3"/>Reset Semua</button>
                <span className="ml-auto text-xs font-semibold" style={{color:'#1A77A3'}}>{filtered.length} transaksi ditemukan</span>
              </div>
            ) : (
              <div className="px-3 pb-2 flex justify-end"><span style={{fontSize:'12px',color:'#94a3b8',fontWeight:500}}>{filtered.length} transaksi total</span></div>
            )}
          </div>

          {/* Summary strip */}
          <div className="flex items-center justify-between px-1 flex-wrap gap-2">
            <div className="flex items-center gap-4">
              <p style={{ fontSize: '12.5px', color: '#64748b' }}>{filtered.length} transaksi</p>
              <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: '#f0f7fb', color: '#1A77A3' }}>Masuk: {formatRp(filteredIncome)}</span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: '#fef2f2', color: '#ef4444' }}>Keluar: {formatRp(filteredExpense)}</span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: '#eff6ff', color: '#3b82f6' }}>Saldo: {formatRp(filteredIncome - filteredExpense)}</span>
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8' }}>Hal {page} / {totalPages}</p>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <table className="w-full" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#f6f4f0', borderBottom: '1px solid #e8e4d8' }}>
                  {[
                    { l: 'Tanggal', k: 'date' }, { l: 'Jenis', k: 'type' }, { l: 'Kategori', k: 'category' }, { l: 'Deskripsi', k: 'description' },
                    { l: 'Ref', k: 'reference' }, { l: 'Jumlah', k: 'amount' }, { l: 'Dicatat', k: 'recordedBy' }, { l: 'Aksi', k: 'aksi' },
                  ].map((h, i) => (
                    <th key={h.l} className="px-4 py-3" style={{ fontSize: '11px', fontWeight: 700, color: '#144f6b', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: i >= 5 ? 'right' : 'left', width: txColW[h.k], position: 'relative', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {h.l}
                      <ColResizeHandle onMouseDown={startResizeTx(h.k)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center" style={{ fontSize: '13px', color: '#94a3b8' }}>Tidak ada data sesuai filter</td></tr>
                ) : paged.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f2f0ea' }} className="hover:bg-[#f6f4f0]/20 transition-colors">
                    <td className="px-4 py-3" style={{ fontSize: '12.5px', color: '#374151' }}>{new Date(r.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: r.type === 'income' ? '#f0f7fb' : '#fef2f2', color: r.type === 'income' ? '#1A77A3' : '#ef4444' }}>
                        {r.type === 'income' ? '↑ Pemasukan' : '↓ Pengeluaran'}
                      </span>
                    </td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs" style={{ background: '#f1f5f9', color: '#475569' }}>{r.category}</span></td>
                    <td className="px-4 py-3" style={{ fontSize: '12.5px', color: '#374151', maxWidth: '220px' }}><p className="truncate">{r.description}</p></td>
                    <td className="px-4 py-3" style={{ fontSize: '11.5px', color: '#94a3b8' }}>{r.reference || '–'}</td>
                    <td className="px-4 py-3 text-right" style={{ fontSize: '13.5px', fontWeight: 700, color: r.type === 'income' ? '#1A77A3' : '#ef4444', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      {r.type === 'income' ? '+' : '-'}{formatRp(r.amount)}
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: '11.5px', color: '#94a3b8' }}>{r.recordedBy}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {canEdit && <button onMouseDown={e=>e.preventDefault()} onClick={() => openEdit(r)} data-tooltip="Edit" className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#f0f7fb] transition-colors"><Pencil className="w-3.5 h-3.5 text-blue-500" /></button>}
                        {canDelete && <button onClick={() => handleDelete(r)} data-tooltip="Hapus" className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} data-tooltip="Halaman Sebelumnya" className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40 hover:bg-gray-100 transition-colors" style={{ border: '1px solid #e2e8f0' }}><ChevronLeft className="w-4 h-4" /></button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const p = page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                if (p < 1 || p > totalPages) return null;
                return <button key={p} onClick={() => setPage(p)} className="w-8 h-8 rounded-lg text-sm font-semibold" style={{ background: page === p ? '#1A77A3' : 'white', color: page === p ? 'white' : '#374151', border: '1px solid #e2e8f0' }}>{p}</button>;
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} data-tooltip="Halaman Berikutnya" className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40 hover:bg-gray-100 transition-colors" style={{ border: '1px solid #e2e8f0' }}><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: LAPORAN ════════════════════════════════════════════════════════ */}
      {activeTab === 'report' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50" style={{ background: '#f8fafc' }}>
              <div>
                <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Rekap Bulanan Tahun {filterYear}</p>
                <p style={{ fontSize: '12px', color: '#94a3b8' }}>GPIB Bahtera Kasih · Laporan Keuangan Resmi</p>
              </div>
              <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold" style={{ background: '#f0ede5' }}>
                <Printer className="w-4 h-4" />Cetak Laporan
              </button>
            </div>
            <table className="w-full" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#f6f4f0', borderBottom: '1px solid #e8e4d8' }}>
                  {[
                    { l: 'Bulan', k: 'month' }, { l: 'Pemasukan', k: 'income' }, { l: 'Pengeluaran', k: 'expense' },
                    { l: 'Saldo Bulan', k: 'balance' }, { l: 'Saldo Kumulatif', k: 'cumBalance' }, { l: 'Jml Transaksi', k: 'count' },
                  ].map((h, i) => (
                    <th key={h.l} className="px-5 py-3" style={{ fontSize: '11px', fontWeight: 700, color: '#144f6b', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: i >= 1 ? 'right' : 'left', width: reportColW[h.k], position: 'relative', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {h.l}
                      <ColResizeHandle onMouseDown={startResizeReport(h.k)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.monthlyReport.map((m, i) => {
                  const cum = stats.monthlyReport.slice(0, i + 1).reduce((s, x) => s + x.income - x.expense, 0);
                  return (
                    <tr key={m.name} style={{ borderBottom: '1px solid #f8fafc' }} className={`hover:bg-gray-50 transition-colors ${m.income === 0 && m.expense === 0 ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-3.5" style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{MONTH_FULL[i]}</td>
                      <td className="px-5 py-3.5 text-right" style={{ fontSize: '13px', fontWeight: m.income > 0 ? 700 : 400, color: m.income > 0 ? '#1A77A3' : '#94a3b8', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{m.income > 0 ? formatRp(m.income) : '–'}</td>
                      <td className="px-5 py-3.5 text-right" style={{ fontSize: '13px', fontWeight: m.expense > 0 ? 700 : 400, color: m.expense > 0 ? '#ef4444' : '#94a3b8', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{m.expense > 0 ? formatRp(m.expense) : '–'}</td>
                      <td className="px-5 py-3.5 text-right" style={{ fontSize: '13px', fontWeight: 700, color: m.balance >= 0 ? '#1A77A3' : '#ef4444', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{m.income > 0 || m.expense > 0 ? formatRp(m.balance) : '–'}</td>
                      <td className="px-5 py-3.5 text-right" style={{ fontSize: '13px', fontWeight: 700, color: cum >= 0 ? '#3b82f6' : '#9c9486', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{formatRp(cum)}</td>
                      <td className="px-5 py-3.5 text-right" style={{ fontSize: '13px', color: '#64748b' }}>{m.count > 0 ? `${m.count} transaksi` : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f0f7fb', borderTop: '2px solid #a7f3d0' }}>
                  <td className="px-5 py-4" style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>TOTAL {filterYear}</td>
                  <td className="px-5 py-4 text-right" style={{ fontSize: '14px', fontWeight: 800, color: '#1A77A3', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{formatRp(stats.totalIncome)}</td>
                  <td className="px-5 py-4 text-right" style={{ fontSize: '14px', fontWeight: 800, color: '#ef4444', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{formatRp(stats.totalExpense)}</td>
                  <td className="px-5 py-4 text-right" style={{ fontSize: '14px', fontWeight: 800, color: stats.balance >= 0 ? '#1A77A3' : '#ef4444', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{formatRp(stats.balance)}</td>
                  <td className="px-5 py-4 text-right" style={{ fontSize: '14px', fontWeight: 800, color: stats.balance >= 0 ? '#3b82f6' : '#9c9486', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{formatRp(stats.balance)}</td>
                  <td className="px-5 py-4 text-right" style={{ fontSize: '13px', color: '#64748b', fontWeight: 700 }}>{financialRecords.filter(r => new Date(r.date).getFullYear() === filterYear).length} transaksi</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Per kategori summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {[
              { title: '📈 Detail per Kategori Pemasukan', cats: stats.incomeByCategory, type: 'income' as const, totalKey: stats.totalIncome, colors: INC_COLORS },
              { title: '📉 Detail per Kategori Pengeluaran', cats: stats.expenseByCategory, type: 'expense' as const, totalKey: stats.totalExpense, colors: EXP_COLORS },
            ].map(({ title, cats, totalKey, colors, type }) => {
              const catColW = type === 'income' ? incCatColW : expCatColW;
              const startResizeCat = type === 'income' ? startResizeIncCat : startResizeExpCat;
              return (
              <div key={title} className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div className="px-5 py-3.5 border-b border-gray-50" style={{ background: '#f8fafc' }}>
                  <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>{title}</p>
                </div>
                <table className="w-full" style={{ tableLayout: 'fixed' }}>
                  <thead><tr style={{ background: '#f8fafc' }}>
                    <th className="px-5 py-2 text-left" style={{ fontSize: '10.5px', color: '#94a3b8', textTransform: 'uppercase', width: catColW.category, position: 'relative', overflow: 'hidden', textOverflow: 'ellipsis' }}>Kategori<ColResizeHandle onMouseDown={startResizeCat('category')} /></th>
                    <th className="px-5 py-2 text-right" style={{ fontSize: '10.5px', color: '#94a3b8', textTransform: 'uppercase', width: catColW.amount, position: 'relative' }}>Jumlah<ColResizeHandle onMouseDown={startResizeCat('amount')} /></th>
                    <th className="px-5 py-2 text-right" style={{ fontSize: '10.5px', color: '#94a3b8', textTransform: 'uppercase', width: catColW.percent, position: 'relative' }}>%<ColResizeHandle onMouseDown={startResizeCat('percent')} /></th>
                  </tr></thead>
                  <tbody>
                    {cats.length === 0 ? <tr><td colSpan={3} className="px-5 py-6 text-center" style={{ fontSize: '12px', color: '#94a3b8' }}>Tidak ada data</td></tr> :
                      cats.map((item, i) => (
                        <tr key={item.name} style={{ borderBottom: '1px solid #f8fafc' }}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colors[i % colors.length] }} /><span style={{ fontSize: '12.5px', color: '#374151' }}>{item.name}</span></div>
                          </td>
                          <td className="px-5 py-3 text-right" style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{formatRp(item.value)}</td>
                          <td className="px-5 py-3 text-right" style={{ fontSize: '12px', color: '#94a3b8' }}>{totalKey > 0 ? ((item.value / totalKey) * 100).toFixed(1) : 0}%</td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                      <td className="px-5 py-3" style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>TOTAL</td>
                      <td className="px-5 py-3 text-right" style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{formatRp(totalKey)}</td>
                      <td className="px-5 py-3 text-right" style={{ fontSize: '12px', color: '#94a3b8' }}>100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── FORM MODAL ── */}
      {showForm && (
        <FinancialForm rec={editRec} categories={financialCategories} currentUser={currentUser} onSave={handleSave} onClose={() => { setShowForm(false); setEditRec(null); }} />
      )}
    </div>
  );
}
