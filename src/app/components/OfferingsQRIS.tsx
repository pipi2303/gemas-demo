import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { toast } from 'sonner';
import { useDraggable } from '../../lib/useDraggable';
import { Offering, OfferingType, PaymentMethod } from '../types';
import { SearchDropdown } from './ui/SearchDropdown';
import {
  DollarSign, Plus, X, Calendar, CreditCard, User, FileText,
  Pencil, Trash2, Filter, Download, TrendingUp, Search,
  ChevronLeft, ChevronRight, Printer, ArrowUpRight, QrCode, Wallet,
  ArrowUp, ArrowDown, ArrowUpDown, Landmark, Loader2, CheckCircle2, BadgeCheck, Maximize2
} from 'lucide-react';
import { useSortable } from '../../hooks/useSortable';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColResizeHandle } from './ui/resizable-th';
import { api } from '../../lib/apiClient';
import { ModuleSeparationNote } from './ModuleSeparationNote';

// -- Setor ke Buku Besar (jembatan ke Finance Add-on) -------------------------
// Bukan bagian dari alur CRUD offerings biasa (yang lewat AppContext/collection
// generik /api/data) -- endpoint di bawah ini ada di modul Finance Add-on
// (server/routes/financeTransaction.ts) yang punya namespace REST sendiri
// (/api/v1/finance/**), jadi dipanggil langsung lewat `api` client, sama
// seperti pola di src/app/components/finance/*.tsx.
interface DepositPreview {
  offeringCount: number;
  totalAmount: number;
  cash: { total: number; count: number; byCategory: Record<string, { amount: number; count: number }> };
  bank: { total: number; count: number; byCategory: Record<string, { amount: number; count: number }> };
  // Rincian Transfer/QRIS per rekening bank tujuan -- muncul kalau ada offering yang
  // memakai Kode QRIS beratribut rekening spesifik (Master Data Finance > Data QRIS).
  // "Rekening default" = offering Transfer/QRIS tanpa Kode QRIS spesifik, tetap masuk
  // satu voucher BBM seperti perilaku lama.
  bankByAccount?: { label: string; bankAccountId: string | null; total: number; count: number }[];
}
interface DepositResult {
  transactions: { bucket: 'CASH' | 'BANK'; groupKey: string; transactionId: string; voucherNumber: string; amount: number; offeringIds: string[] }[];
  offeringCount: number;
}
async function financeApiCall<T = any>(method: 'get' | 'post', url: string, body?: any): Promise<T> {
  const res = method === 'get' ? await (api as any).get(url) : await (api as any).post(url, body ?? {});
  if (!res.success) throw new Error(res.error?.message || 'Terjadi kesalahan');
  return res.data as T;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatRp = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
const compactRp = (n: number) => { if (n >= 1e9) return `Rp ${(n/1e9).toFixed(1)}M`; if (n >= 1e6) return `Rp ${(n/1e6).toFixed(1)}Jt`; return `Rp ${n.toLocaleString('id-ID')}`; };

const TYPE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Mingguan':     { bg: '#eff6ff', text: '#2563eb', dot: '#3b82f6' },
  'Syukur':       { bg: '#f0f7fb', text: '#144f6b', dot: '#144f6b' },
  'Persepuluhan': { bg: '#f5f3ff', text: '#5b21b6', dot: '#3a7fa0' },
  'Pembangunan':  { bg: '#fff7ed', text: '#9a3412', dot: '#9c9486' },
  'Diakonia':     { bg: '#fdf2f8', text: '#86198f', dot: '#ec4899' },
  'Lainnya':      { bg: '#f8fafc', text: '#475569', dot: '#64748b' },
};
const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
  'Tunai':    { bg: '#f0fdf4', text: '#15803d' },
  'Transfer': { bg: '#eff6ff', text: '#1d4ed8' },
  'QRIS':     { bg: '#f5f3ff', text: '#6d28d9' },
};

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
const MONTH_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

const OFFERINGS_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  date: 120, type: 130, paymentMethod: 130, donorName: 180, amount: 150, aksi: 90,
};

// ── SVG Charts ────────────────────────────────────────────────────────────────
function DonutChart({ data, colors, size = 160 }: { data: { name: string; value: number }[]; colors: string[]; size?: number }) {
  const cx = size/2, cy = size/2, OR = size*0.42, IR = size*0.25;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let angle = -Math.PI/2;
  const arcs = data.map((d, i) => {
    const span = (d.value/total) * Math.PI * 2 * 0.98;
    const sa = angle + 0.01, ea = sa + span;
    angle += span + 0.02;
    const f = (n: number) => n.toFixed(2), lg = span > Math.PI ? 1 : 0;
    const ox1 = cx+OR*Math.cos(sa), oy1 = cy+OR*Math.sin(sa);
    const ox2 = cx+OR*Math.cos(ea), oy2 = cy+OR*Math.sin(ea);
    const ix1 = cx+IR*Math.cos(ea), iy1 = cy+IR*Math.sin(ea);
    const ix2 = cx+IR*Math.cos(sa), iy2 = cy+IR*Math.sin(sa);
    return <path key={i} d={`M${f(ox1)},${f(oy1)} A${OR},${OR} 0 ${lg},1 ${f(ox2)},${f(oy2)} L${f(ix1)},${f(iy1)} A${IR},${IR} 0 ${lg},0 ${f(ix2)},${f(iy2)} Z`} fill={colors[i%colors.length]} />;
  });
  return <svg width="100%" height={size} viewBox={`0 0 ${size} ${size}`}>{arcs}</svg>;
}

function SparkBar({ data, colors }: { data: { name: string; value: number }[]; colors: string[] }) {
  const W = 420, H = 160;
  const pad = { t: 8, r: 6, b: 28, l: 48 };
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
  const maxV = Math.max(...data.map(d => d.value), 1);
  const slotW = iW / data.length, barW = slotW * 0.55, barOff = (slotW - barW) / 2;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {[0, 0.5, 1].map((t, i) => <line key={i} x1={pad.l} y1={pad.t + t*iH} x2={W-pad.r} y2={pad.t + t*iH} stroke="#f1f5f9" strokeWidth={1} />)}
      {data.map((d, i) => {
        const bH = (d.value/maxV)*iH, x = pad.l + i*slotW + barOff, y = pad.t + iH - bH, r = Math.min(4, barW/2);
        return (
          <g key={i}>
            <path d={bH > r ? `M${x},${y+bH} L${x},${y+r} Q${x},${y} ${x+r},${y} L${x+barW-r},${y} Q${x+barW},${y} ${x+barW},${y+r} L${x+barW},${y+bH} Z` : `M${x},${y+bH} L${x},${y} L${x+barW},${y} L${x+barW},${y+bH} Z`} fill={colors[i%colors.length]} />
            <text x={x+barW/2} y={H-8} textAnchor="middle" fontSize={9} fill="#94a3b8">{d.name}</text>
          </g>
        );
      })}
      {[0, maxV/2, maxV].map((v, i) => <text key={i} x={pad.l-4} y={pad.t + iH*(1-i*0.5) + 4} textAnchor="end" fontSize={8} fill="#94a3b8">{v >= 1e6 ? `${(v/1e6).toFixed(0)}Jt` : v.toFixed(0)}</text>)}
    </svg>
  );
}

function Sparkline({ data, color = '#144f6b' }: { data: { name: string; v: number }[]; color?: string }) {
  const W = 420, H = 130;
  const pad = { t: 8, r: 8, b: 26, l: 46 };
  const iW = W-pad.l-pad.r, iH = H-pad.t-pad.b;
  const vals = data.map(d => d.v);
  const minV = Math.min(...vals), maxV = Math.max(...vals) || 1;
  const xOf = (i: number) => pad.l + (i/(data.length-1))*iW;
  const yOf = (v: number) => pad.t + (1-(v-minV)/(maxV-minV||1))*iH;
  const pts = data.map((d, i) => [xOf(i), yOf(d.v)] as [number,number]);
  const f = (n: number) => n.toFixed(1);
  const line = pts.map(([x,y],i) => `${i===0?'M':'L'}${f(x)},${f(y)}`).join(' ');
  const area = `${line} L${f(pts[pts.length-1][0])},${H-pad.b} L${f(pts[0][0])},${H-pad.b} Z`;
  const gid = `sp${color.replace('#','')}`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.15"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      {[0,0.5,1].map((t,i) => <line key={i} x1={pad.l} y1={pad.t+t*iH} x2={W-pad.r} y2={pad.t+t*iH} stroke="#f1f5f9" strokeWidth={1}/>)}
      <path d={area} fill={`url(#${gid})`}/>
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>
      {data.map((d,i) => <text key={i} x={xOf(i)} y={H-7} textAnchor="middle" fontSize={9} fill="#94a3b8">{d.name}</text>)}
      {[minV,maxV].map((v,i) => <text key={i} x={pad.l-4} y={yOf(v)+4} textAnchor="end" fontSize={8} fill="#94a3b8">{v>=1e6?`${(v/1e6).toFixed(0)}Jt`:v.toFixed(0)}</text>)}
    </svg>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function OfferingsQRIS() {
  const { offerings, members, sectors, addOffering, updateOffering, deleteOffering, currentUser, getMasterDataByCategory, markOfferingsDeposited } = useApp();
  const { offset, onMouseDown } = useDraggable();
  const offeringTypes = getMasterDataByCategory('jenis_persembahan').map(m => m.value) as OfferingType[];
  const OFFERING_TYPE_LIST = offeringTypes.length ? offeringTypes : ['Mingguan','Syukur','Persepuluhan','Pembangunan','Diakonia','Lainnya'] as OfferingType[];
  const metodePembayaranItems = getMasterDataByCategory('metode_pembayaran');
  const metodePembayaranList = metodePembayaranItems.map(m => m.value);
  const METODE_PEMBAYARAN = metodePembayaranList.length ? metodePembayaranList : ['Tunai','Transfer','QRIS'];
  // Menentukan apakah metode pembayaran terpilih perlu menampilkan panel Kode QRIS.
  // TIDAK dicek lewat literal string ('QRIS'/'Transfer') karena label metode pembayaran
  // sekarang bisa di-rename admin lewat Master Data Finance > Metode Pembayaran -- kalau
  // dicek pakai literal, panel ini akan diam-diam hilang setelah rename (bug lama).
  // Sumber kebenaran: flag `isQrisEligible` pada item master data (data-driven, tahan rename).
  // Fallback keyword dipakai HANYA untuk data lama yang belum punya flag ini sama sekali
  // (mis. environment yang belum sempat set toggle-nya di UI) -- lihat FinanceMasterData.tsx.
  const isQrisCapablePaymentMethod = (methodLabel: string): boolean => {
    const item = metodePembayaranItems.find(m => m.value === methodLabel);
    if (item && typeof item.isQrisEligible === 'boolean') return item.isQrisEligible;
    return /qris|transfer/i.test(methodLabel);
  };

  const { widths: colW, startResize } = useResizableColumns('offerings-qris-main', OFFERINGS_TABLE_DEFAULT_WIDTHS);
  const monthlyRecapDefaultWidths: Record<string, number> = { bulan: 100 };
  OFFERING_TYPE_LIST.forEach(t => { monthlyRecapDefaultWidths[t] = 110; });
  monthlyRecapDefaultWidths.transaksi = 100;
  monthlyRecapDefaultWidths.total = 130;
  const { widths: monthlyColW, startResize: monthlyStartResize } = useResizableColumns('offerings-qris-monthly-recap', monthlyRecapDefaultWidths);

  const now = new Date();
  const [activeTab, setActiveTab] = useState<'list' | 'stats' | 'monthly'>('list');
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState<number>(-1); // -1 = all
  const [filterType, setFilterType] = useState('all');
  const [filterMethod, setFilterMethod] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  // Setor ke Buku Besar
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositRange, setDepositRange] = useState({ startDate: '', endDate: '' });
  const [depositPreview, setDepositPreview] = useState<DepositPreview | null>(null);
  const [depositPreviewLoading, setDepositPreviewLoading] = useState(false);
  const [depositPreviewError, setDepositPreviewError] = useState<string | null>(null);
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [depositResult, setDepositResult] = useState<DepositResult | null>(null);
  const PAGE_SIZE = 15;

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [form, setForm] = useState({
    date: now.toISOString().split('T')[0],
    type: 'Mingguan' as OfferingType,
    amount: '',
    paymentMethod: 'Tunai' as PaymentMethod,
    memberId: '',
    donorName: '',
    donorPhone: '',
    donorEmail: '',
    description: '',
    qrisReference: '',
    qrisCodeId: '',
    qrisCodeLabel: '',
  });
  const resetForm = () => { setForm({ date: now.toISOString().split('T')[0], type: 'Mingguan', amount: '', paymentMethod: 'Tunai', memberId: '', donorName: '', donorPhone: '', donorEmail: '', description: '', qrisReference: '', qrisCodeId: '', qrisCodeLabel: '' }); setMemberSearch(''); };

  // ── Data QRIS (Master Data Finance) -- kode QR statis untuk ditunjukkan ke
  // jemaat/donatur saat mencatat persembahan Transfer/QRIS. Diambil dari daftar
  // yang masih aktif (is_active); tidak disaring is_displayed karena
  // is_displayed cuma soal tampil-tidaknya di kanal publik (E-Warta), bukan
  // soal boleh-tidaknya dipakai untuk pencatatan internal di sini.
  interface QrisCodeOption { id: string; label: string; image_data: string; mime_type: string; categories: string[]; }
  const [qrisCodes, setQrisCodes] = useState<QrisCodeOption[]>([]);
  useEffect(() => {
    financeApiCall<QrisCodeOption[]>('get', '/api/v1/finance/qris-codes/active').then(setQrisCodes).catch(() => setQrisCodes([]));
  }, []);
  // Kios/tampilan layar penuh untuk ditunjukkan selama ibadah -- dipakai
  // operator, bukan endpoint publik tanpa login (perubahan RBAC/route publik
  // sengaja tidak dibuat di sini, itu keputusan keamanan terpisah). Sumber
  // data sama seperti E-Warta: hanya kode dengan is_displayed=true.
  interface KioskQrisCode { id: string; label: string; image_data: string; mime_type: string; is_displayed: boolean; }
  const [showKiosk, setShowKiosk] = useState(false);
  const [kioskCodes, setKioskCodes] = useState<KioskQrisCode[]>([]);
  const [kioskLoading, setKioskLoading] = useState(false);
  const openKiosk = () => {
    setShowKiosk(true);
    setKioskLoading(true);
    financeApiCall<KioskQrisCode[]>('get', '/api/v1/finance/qris-codes/displayed')
      .then(setKioskCodes)
      .catch(() => { setKioskCodes([]); toast.error('Gagal memuat Kode QRIS untuk tampilan kios'); })
      .finally(() => setKioskLoading(false));
  };
  useEffect(() => {
    if (!showKiosk) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowKiosk(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showKiosk]);

  const relevantQrisCodes = qrisCodes.filter(q => q.categories.length === 0 || q.categories.includes(form.type));


  // ── Computed stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const yearOff = offerings.filter(o => new Date(o.date).getFullYear() === filterYear);
    const curM = now.getMonth(), curY = now.getFullYear();
    const monthOff = offerings.filter(o => { const d = new Date(o.date); return d.getMonth() === curM && d.getFullYear() === curY; });
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const weekOff = offerings.filter(o => new Date(o.date) >= weekAgo);

    const total = offerings.reduce((s, o) => s + o.amount, 0);
    const totalYear = yearOff.reduce((s, o) => s + o.amount, 0);
    const totalMonth = monthOff.reduce((s, o) => s + o.amount, 0);
    const totalWeek = weekOff.reduce((s, o) => s + o.amount, 0);

    const byType = (OFFERING_TYPE_LIST).map(type => ({
      name: type, value: yearOff.filter(o => o.type === type).reduce((s, o) => s + o.amount, 0)
    })).filter(d => d.value > 0);

    const byMethod = (['Tunai','Transfer','QRIS'] as PaymentMethod[]).map(m => ({
      name: m, value: yearOff.filter(o => o.paymentMethod === m).reduce((s, o) => s + o.amount, 0),
      count: yearOff.filter(o => o.paymentMethod === m).length,
    }));

    const monthly = MONTHS.map((name, i) => ({
      name, v: yearOff.filter(o => new Date(o.date).getMonth() === i).reduce((s, o) => s + o.amount, 0)
    }));

    const monthlyTable = MONTHS.map((name, i) => {
      const mo = yearOff.filter(o => new Date(o.date).getMonth() === i);
      const row: any = { name, total: mo.reduce((s, o) => s + o.amount, 0), count: mo.length };
      OFFERING_TYPE_LIST.forEach(t => {
        row[t] = mo.filter(o => o.type === t).reduce((s, o) => s + o.amount, 0);
      });
      return row;
    });

    // Per-sektor stats
    const SECTOR_COLORS_S = ['#3b82f6','#3a7fa0','#144f6b','#c2baaa','#144f6b'];
    const bySector = sectors.map((sec, i) => {
      const secMemIds = members.filter(m => m.sectorId === sec.id).map(m => m.id);
      const secOff = yearOff.filter(o => o.memberId && secMemIds.includes(o.memberId));
      return {
        id: sec.id, name: sec.name, short: sec.name.replace('Sektor ','Sek.'),
        value: secOff.reduce((s, o) => s + o.amount, 0),
        count: secOff.length, color: SECTOR_COLORS_S[i % SECTOR_COLORS_S.length],
      };
    }).filter(s => s.value > 0);

    // Target tahunan: rata-rata 3 tahun terakhir dari data historis
    const currentYear = new Date().getFullYear();
    const prevYears = [currentYear - 1, currentYear - 2, currentYear - 3];
    const TARGET_BY_TYPE: Record<string, number> = {};
    const allTypes = [...new Set(offerings.map(o => o.type).filter(Boolean))];
    allTypes.forEach(type => {
      const prevTotals = prevYears.map(yr =>
        offerings.filter(o => o.type === type && new Date(o.date).getFullYear() === yr)
          .reduce((s, o) => s + (o.amount || 0), 0)
      ).filter(t => t > 0);
      TARGET_BY_TYPE[type] = prevTotals.length > 0
        ? Math.round(prevTotals.reduce((a, b) => a + b, 0) / prevTotals.length)
        : 0;
    });

    return { total, totalYear, totalMonth, totalWeek, byType, byMethod, monthly, monthlyTable, bySector, TARGET_BY_TYPE };
  }, [offerings, filterYear, sectors, members]);

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return offerings.filter(o => {
      const d = new Date(o.date);
      if (d.getFullYear() !== filterYear) return false;
      if (filterMonth >= 0 && d.getMonth() !== filterMonth) return false;
      if (filterType !== 'all' && o.type !== filterType) return false;
      if (filterMethod !== 'all' && o.paymentMethod !== filterMethod) return false;
      if (search) {
        const q = search.toLowerCase();
        const donor = (o.donorName || '').toLowerCase();
        const mem = members.find(m => m.id === o.memberId)?.fullName?.toLowerCase() || '';
        if (!donor.includes(q) && !mem.includes(q) && !o.type.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [offerings, filterYear, filterMonth, filterType, filterMethod, search, members]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filteredTotal = filtered.reduce((s, o) => s + o.amount, 0);

  const { sorted: sortedOfferings, sortKey, sortDir, requestSort } = useSortable(filtered);
  const pagedSorted = sortedOfferings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const SortIcon = ({col}:{col:string}) => {
    if(sortKey!==col) return <ArrowUpDown className="w-3 h-3 opacity-40"/>;
    return sortDir==='asc'?<ArrowUp className="w-3 h-3 text-[#144f6b]"/>:<ArrowDown className="w-3 h-3 text-[#144f6b]"/>;
  };

  // ── CRUD handlers ────────────────────────────────────────────────────────────
  const openCreate = () => { resetForm(); setEditId(null); setShowForm(true); };
  const openEdit = (o: Offering) => {
    setEditId(o.id);
    setForm({ date: o.date, type: o.type, amount: o.amount.toString(), paymentMethod: o.paymentMethod, memberId: o.memberId||'', donorName: o.donorName||'', donorPhone: o.donorPhone||'', donorEmail: o.donorEmail||'', description: o.description||'', qrisReference: o.qrisReference||'', qrisCodeId: o.qrisCodeId||'', qrisCodeLabel: o.qrisCodeLabel||'' });
    setMemberSearch(o.memberId ? members.find(m => m.id === o.memberId)?.fullName || '' : '');
    setShowForm(true);
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Masukkan jumlah yang valid'); return; }
    const payload = { ...form, amount: parseFloat(form.amount) };
    if (editId) { updateOffering(editId, payload); }
    else { addOffering(payload); }
    setShowForm(false); resetForm(); setEditId(null);
  };
  const handleDelete = (o: Offering) => {
    if (!window.confirm(`Hapus persembahan ${o.type} – ${formatRp(o.amount)}?`)) return;
    deleteOffering(o.id);
  };

  // ── Setor ke Buku Besar (agregasi -> transaksi Finance Add-on) ──────────────
  const openDepositModal = () => {
    const toISO = (d: Date) => d.toISOString().split('T')[0];
    const today = new Date();
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 6);
    setDepositRange({ startDate: toISO(weekAgo), endDate: toISO(today) });
    setDepositPreview(null);
    setDepositPreviewError(null);
    setDepositResult(null);
    setDepositOpen(true);
  };
  const loadDepositPreview = async (range: { startDate: string; endDate: string }) => {
    if (!range.startDate || !range.endDate) return;
    if (range.startDate > range.endDate) { setDepositPreviewError('Tanggal awal tidak boleh setelah tanggal akhir'); setDepositPreview(null); return; }
    setDepositPreviewLoading(true);
    setDepositPreviewError(null);
    try {
      const data = await financeApiCall<DepositPreview>('get', `/api/v1/finance/transactions/deposit-preview?startDate=${range.startDate}&endDate=${range.endDate}`);
      setDepositPreview(data);
    } catch (err: any) {
      setDepositPreviewError(err?.message || 'Gagal memuat pratinjau');
      setDepositPreview(null);
    } finally {
      setDepositPreviewLoading(false);
    }
  };
  const handleConfirmDeposit = async () => {
    if (!depositPreview || depositPreview.offeringCount === 0) return;
    setDepositSubmitting(true);
    try {
      const result = await financeApiCall<DepositResult>('post', '/api/v1/finance/transactions/deposit-offerings', {
        startDate: depositRange.startDate, endDate: depositRange.endDate,
      });
      // Sinkronkan status "sudah disetor" ke state lokal supaya badge di tabel
      // langsung tampil tanpa perlu reload halaman -- backend sudah menulis tanda
      // ini secara atomik bersama transaksinya (dan sekarang bisa jadi beberapa
      // voucher BBM sekaligus kalau Transfer/QRIS dipecah per rekening Kode QRIS
      // -- lihat groupBankOfferingsByAccount di server), jadi dipetakan lewat
      // offeringIds per transaksi dari respons, BUKAN ditebak dari paymentMethod.
      // markOfferingsDeposited HANYA mengubah state lokal (tidak PUT ke server)
      // karena server sudah menulis field ini duluan dalam transaksi yang sama
      // dengan pembuatan voucher, dan PUT susulan akan ditolak 403 oleh kunci
      // offering-sudah-disetor (lihat blockNonEditableOfferingWrite).
      const nowIso = new Date().toISOString();
      const updates = result.transactions.flatMap(t => t.offeringIds.map(id => ({ id, transactionId: t.transactionId, depositedAt: nowIso })));
      markOfferingsDeposited(updates);
      setDepositResult(result);
      toast.success(`Berhasil membuat ${result.transactions.length} voucher setoran (${result.offeringCount} persembahan)`);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal membuat setoran');
    } finally {
      setDepositSubmitting(false);
    }
  };
  useEffect(() => {
    if (!depositOpen || depositResult) return;
    loadDepositPreview(depositRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositOpen, depositRange.startDate, depositRange.endDate, depositResult]);

  // ── Print ────────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(`<html><head><title>Laporan Persembahan ${filterYear}</title>
    <style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px}h2{color:#144f6b}
    table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}
    th{background:#144f6b;color:#FFEFB2}tr:nth-child(even){background:#f8fafc}
    .total{font-weight:bold;background:#f0f7fb}.right{text-align:right}</style></head><body>
    <h2>GPIB BAHTERA KASIH – Laporan Persembahan ${filterYear}</h2>
    <p>Total: <strong>${formatRp(stats.totalYear)}</strong> (${offerings.filter(o=>new Date(o.date).getFullYear()===filterYear).length} transaksi) · Dicetak: ${now.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</p>
    <table><tr><th>Tanggal</th><th>Jenis</th><th>Metode</th><th>Donatur</th><th class="right">Jumlah</th></tr>
    ${filtered.map(o=>`<tr><td>${new Date(o.date).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</td><td>${o.type}</td><td>${o.paymentMethod}</td><td>${o.donorName||members.find(m=>m.id===o.memberId)?.fullName||'–'}</td><td class="right">${formatRp(o.amount)}</td></tr>`).join('')}
    <tr class="total"><td colspan="4">TOTAL</td><td class="right">${formatRp(filteredTotal)}</td></tr></table></body></html>`);
    w.document.close(); w.print();
  };

  const years = [...new Set(offerings.map(o => new Date(o.date).getFullYear()))].sort((a,b)=>b-a);
  if (!years.includes(now.getFullYear())) years.unshift(now.getFullYear());

  // ── UI ────────────────────────────────────────────────────────────────────────
  const tabCls = (t: string) => `px-4 py-2 rounded-xl font-semibold transition-all duration-150 ${activeTab === t ? 'text-[#384959] shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`;

  return (
    <div className="space-y-6">
      {/* ── HERO HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl p-6" style={{ background: 'linear-gradient(135deg,#144f6b 0%,#144f6b 60%,#f0ede5 100%)', boxShadow: '0 8px 32px rgba(6,95,70,0.22)' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle,rgba(255,255,255,0.8) 1px,transparent 1px)', backgroundSize: '20px 20px' }} />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px' }}>Modul 3 · Finance</p>
            <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '24px', fontWeight: 800, color: 'white', lineHeight: 1.2 }}>Pencatatan Persembahan</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', marginTop: '4px' }}>Tunai · Transfer · QRIS</p>
          </div>
          <div className="flex items-end gap-6">
            {[
              { label: 'Total Keseluruhan', value: compactRp(stats.total), sub: `${offerings.length} transaksi` },
              { label: `Tahun ${filterYear}`, value: compactRp(stats.totalYear), sub: `${offerings.filter(o=>new Date(o.date).getFullYear()===filterYear).length} transaksi` },
              { label: 'Bulan Ini', value: compactRp(stats.totalMonth), sub: '' },
            ].map((item, i) => (
              <div key={i} className="text-right">
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{item.label}</p>
                <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '22px', fontWeight: 800, color: 'white', lineHeight: 1 }}>{item.value}</p>
                {item.sub && <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)' }}>{item.sub}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ModuleSeparationNote variant="legacy-offerings" />

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp,  label: 'Total Persembahan',   value: compactRp(stats.totalYear),  sub: `Tahun ${filterYear}`,      color: '#144f6b', bg: '#144f6b' },
          { icon: Calendar,    label: 'Bulan Ini',            value: compactRp(stats.totalMonth), sub: 'Bulan berjalan',           color: '#3b82f6', bg: '#144f6b' },
          { icon: QrCode,      label: 'Via QRIS/Transfer',    value: compactRp((stats.byMethod.find(m=>m.name==='QRIS')?.value||0)+(stats.byMethod.find(m=>m.name==='Transfer')?.value||0)), sub: 'Non-tunai', color: '#3a7fa0', bg: '#3a7fa0' },
          { icon: Wallet,      label: 'Minggu Ini',           value: compactRp(stats.totalWeek),  sub: '7 hari terakhir',         color: '#c2baaa', bg: 'linear-gradient(135deg,#f59e0b,#fbbf24)' },
        ].map((c, i) => (
          <div key={i} className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: c.bg }}>
                <c.icon className="w-5 h-5 text-white" />
              </div>
              <ArrowUpRight className="w-4 h-4" style={{ color: c.color }} />
            </div>
            <p style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1 }}>{c.value}</p>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '5px', fontWeight: 500 }}>{c.label}</p>
            {c.sub && <p style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px' }}>{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── TOOLBAR ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 p-1 rounded-xl" style={{ background: '#f1f5f9' }}>
          {(['list','stats','monthly'] as const).map((t, i) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={tabCls(t)}
              style={activeTab === t ? { background: '#FFEFB2' } : {}}>
              {['Daftar Transaksi','Statistik','Rekap Bulanan'][i]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors hover:bg-gray-50" style={{ fontSize: '13px', borderColor: '#e2e8f0' }}>
            <Printer className="w-4 h-4 text-gray-500" />Cetak
          </button>
          <button onClick={openKiosk} data-tooltip="Tampilkan Kode QRIS layar penuh untuk ditunjukkan ke jemaat saat ibadah" className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors hover:bg-gray-50" style={{ fontSize: '13px', borderColor: '#e2e8f0' }}>
            <Maximize2 className="w-4 h-4 text-gray-500" />Tampilan Kios
          </button>
          <button onMouseDown={e=>e.preventDefault()} onClick={openDepositModal} data-tooltip="Agregasi persembahan yang belum disetor menjadi transaksi Finance Add-on" className="flex items-center gap-2 px-3 py-2 rounded-xl border font-semibold transition-colors hover:bg-[#f0f7fb]" style={{ fontSize: '13px', borderColor: '#144f6b', color: '#144f6b' }}>
            <Landmark className="w-4 h-4" />Setor ke Buku Besar
          </button>
          <button onMouseDown={e=>e.preventDefault()} onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-semibold transition-colors" style={{ background: '#144f6b', fontSize: '13px', boxShadow: '0 2px 8px rgba(20,79,107,0.3)' }}>
            <Plus className="w-4 h-4" />Catat Persembahan
          </button>
        </div>
      </div>

      {/* ── TAB: DAFTAR TRANSAKSI ── */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="rounded-2xl border bg-white overflow-hidden" style={{borderColor:'#e2e8f0',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
            <div className="flex items-center gap-3 p-3 border-b" style={{borderColor:'#f1f5f9'}}>
              <div className="flex-1">
                <SearchDropdown<any>
                  value={search}
                  onChange={v => { setSearch(v); setPage(1); }}
                  placeholder="Cari donatur, jenis persembahan..."
                  items={offerings}
                  filterFn={(o, q) => {
                    const lq = q.toLowerCase();
                    return o.donorName?.toLowerCase().includes(lq)
                      || o.type?.toLowerCase().includes(lq)
                      || o.notes?.toLowerCase().includes(lq);
                  }}
                  renderResult={o => (
                    <div>
                      <p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{o.donorName||o.type||'-'}</p>
                      <p style={{fontSize:'11px',color:'#64748b',margin:0}}>{o.type} · Rp{(o.amount||0).toLocaleString('id-ID')}</p>
                    </div>
                  )}
                  onSelect={o => { setSearch(o.donorName || o.type || ''); setPage(1); }}
                  onClear={() => setPage(1)}
                />
              </div>
            </div>
            <div className="p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'0.08em',color:'#b0bec5',textTransform:'uppercase',minWidth:'68px'}}>Periode</span>
                {(()=>{const ay=true;return <select value={filterYear} onChange={e=>{setFilterYear(Number(e.target.value));setPage(1);}} className="px-2.5 py-1 text-sm rounded-full border focus:outline-none transition-all cursor-pointer" style={{borderColor:'#144f6b',background:'#f0f7fb',color:'#144f6b',fontWeight:600}}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select>;})()}
                {(()=>{const active=filterMonth>=0;return <select value={filterMonth} onChange={e=>{setFilterMonth(Number(e.target.value));setPage(1);}} className="px-2.5 py-1 text-sm rounded-full border focus:outline-none transition-all cursor-pointer" style={{borderColor:active?'#144f6b':'#e2e8f0',background:active?'#f0f7fb':'#fafafa',color:active?'#144f6b':'#64748b',fontWeight:active?600:400}}><option value={-1}>Semua Bulan</option>{MONTH_FULL.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>;})()}
              </div>
              <div style={{height:'1px',background:'#f1f5f9'}}/>
              <div className="flex flex-wrap items-center gap-2">
                <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'0.08em',color:'#b0bec5',textTransform:'uppercase',minWidth:'68px'}}>Persembahan</span>
                {([
                  {val:filterType,set:(v:string)=>{setFilterType(v);setPage(1);},opts:[{v:'all',l:'Semua Jenis'},...OFFERING_TYPE_LIST.map(t=>({v:t,l:t}))]},
                  {val:filterMethod,set:(v:string)=>{setFilterMethod(v);setPage(1);},opts:[{v:'all',l:'Semua Metode'},...METODE_PEMBAYARAN.map(m=>({v:m,l:m}))]},
                ] as {val:string;set:(v:string)=>void;opts:{v:string;l:string}[]}[]).map((f,i)=>{
                  const active=f.val!=='all';
                  return <select key={i} value={f.val} onChange={e=>f.set(e.target.value)} className="px-2.5 py-1 text-sm rounded-full border focus:outline-none transition-all cursor-pointer" style={{borderColor:active?'#144f6b':'#e2e8f0',background:active?'#f0f7fb':'#fafafa',color:active?'#144f6b':'#64748b',fontWeight:active?600:400}}>{f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>;
                })}
              </div>
            </div>
            {(filterMonth>=0||filterType!=='all'||filterMethod!=='all'||search) ? (
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
                <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,whiteSpace:'nowrap'}}>Filter aktif:</span>
                {search && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#144f6b',border:'1px solid #b8d5e8'}}><Search className="w-3 h-3"/>"{search.length>15?search.slice(0,15)+'…':search}"<button onClick={()=>{setSearch('');setPage(1);}} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
                {filterMonth>=0 && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#144f6b',border:'1px solid #b8d5e8'}}>{MONTH_FULL[filterMonth]}<button onClick={()=>{setFilterMonth(-1);setPage(1);}} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
                {filterType!=='all' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#144f6b',border:'1px solid #b8d5e8'}}>{filterType}<button onClick={()=>{setFilterType('all');setPage(1);}} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
                {filterMethod!=='all' && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#144f6b',border:'1px solid #b8d5e8'}}>{filterMethod}<button onClick={()=>{setFilterMethod('all');setPage(1);}} data-tooltip="Hapus filter" className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button></span>}
                <button onClick={()=>{setFilterMonth(-1);setFilterType('all');setFilterMethod('all');setSearch('');setPage(1);}} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all hover:bg-red-50" style={{borderColor:'#fca5a5',color:'#ef4444'}}><X className="w-3 h-3"/>Reset Semua</button>
                <span className="ml-auto text-xs font-semibold" style={{color:'#144f6b'}}>{filtered.length} transaksi ditemukan</span>
              </div>
            ) : (
              <div className="px-3 pb-2 flex justify-end"><span style={{fontSize:'12px',color:'#94a3b8',fontWeight:500}}>{filtered.length} transaksi total</span></div>
            )}
          </div>

          {/* Summary strip */}
          <div className="flex items-center justify-between px-1">
            <p style={{ fontSize: '12.5px', color: '#64748b' }}>{filtered.length} transaksi · Total: <strong style={{ color: '#144f6b' }}>{formatRp(filteredTotal)}</strong></p>
            <p style={{ fontSize: '12.5px', color: '#94a3b8' }}>Halaman {page} / {totalPages}</p>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <table className="w-full" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#f6f4f0', borderBottom: '1px solid #e8e4d8' }}>
                  {[
                    {l:'Tanggal',k:'date'},
                    {l:'Jenis',k:'type'},
                    {l:'Metode',k:'paymentMethod'},
                    {l:'Donatur',k:'donorName'},
                    {l:'Jumlah',k:'amount'},
                  ].map((h,i) => (
                    <th key={h.k} onClick={()=>requestSort(h.k as any)} className="px-4 py-3 cursor-pointer select-none" style={{ fontSize: '11px', fontWeight: 700, color: '#144f6b', textTransform: 'uppercase', textAlign: i >= 3 ? 'right' : 'left', letterSpacing: '0.06em', whiteSpace:'nowrap', width: colW[h.k], position: 'relative' }}>
                      <span className={`flex items-center gap-1 ${i >= 3 ? 'justify-end' : ''}`}>{h.l}<SortIcon col={h.k}/></span>
                      <ColResizeHandle onMouseDown={startResize(h.k)} />
                    </th>
                  ))}
                  <th className="px-4 py-3" style={{ fontSize: '11px', fontWeight: 700, color: '#144f6b', textTransform: 'uppercase', letterSpacing: '0.06em', width: colW.aksi, position: 'relative' }}>
                    Aksi
                    <ColResizeHandle onMouseDown={startResize('aksi')} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedSorted.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center" style={{ fontSize: '13px', color: '#94a3b8' }}>Tidak ada data</td></tr>
                ) : pagedSorted.map((o) => {
                  const tc = TYPE_COLORS[o.type] || TYPE_COLORS['Lainnya'];
                  const mc = METHOD_COLORS[o.paymentMethod] || METHOD_COLORS['Tunai'];
                  const donor = o.donorName || members.find(m => m.id === o.memberId)?.fullName || '–';
                  return (
                    <tr key={o.id} style={{ borderBottom: '1px solid #f8fafc' }} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3" style={{ fontSize: '13px', color: '#374151' }}>
                        {new Date(o.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: tc.bg, color: tc.text }}>{o.type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: mc.bg, color: mc.text }}>{o.paymentMethod}</span>
                      </td>
                      <td className="px-4 py-3" style={{ fontSize: '13px', color: '#374151' }}>{donor}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#144f6b', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{formatRp(o.amount)}</span>
                          {o.depositedTransactionId && (
                            <span data-tooltip="Sudah disetor ke Finance Add-on" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#f0fdf4', color: '#15803d' }}>
                              <BadgeCheck className="w-2.5 h-2.5" />Disetor
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onMouseDown={e=>e.preventDefault()} onClick={() => openEdit(o)} data-tooltip="Edit" className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#f0f7fb] transition-colors">
                            <Pencil className="w-3.5 h-3.5 text-blue-500" />
                          </button>
                          <button onClick={() => handleDelete(o)} data-tooltip="Hapus" className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} data-tooltip="Halaman Sebelumnya"
                className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40 hover:bg-gray-100 transition-colors" style={{ border: '1px solid #e2e8f0' }}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const p = page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                if (p < 1 || p > totalPages) return null;
                return <button key={p} onClick={() => setPage(p)} className="w-8 h-8 rounded-lg text-sm font-semibold transition-colors" style={{ background: page === p ? '#144f6b' : 'white', color: page === p ? 'white' : '#374151', border: '1px solid #e2e8f0' }}>{p}</button>;
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} data-tooltip="Halaman Berikutnya"
                className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40 hover:bg-gray-100 transition-colors" style={{ border: '1px solid #e2e8f0' }}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: STATISTIK ── */}
      {activeTab === 'stats' && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: '#e2e8f0' }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Per jenis */}
            <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <p style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: '12px' }}>Persembahan per Jenis</p>
              <div className="grid grid-cols-2 gap-4 items-center">
                <DonutChart data={stats.byType} colors={Object.values(TYPE_COLORS).map(c => c.dot)} />
                <div className="space-y-2.5">
                  {stats.byType.map((item, i) => {
                    const tc = TYPE_COLORS[item.name] || TYPE_COLORS['Lainnya'];
                    const total = stats.byType.reduce((s, d) => s + d.value, 0) || 1;
                    return (
                      <div key={item.name}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: tc.dot }} />
                            <span style={{ fontSize: '11.5px', color: '#475569' }}>{item.name}</span>
                          </div>
                          <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#0f172a' }}>{compactRp(item.value)}</span>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(item.value/total)*100}%`, background: tc.dot }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Per metode */}
            <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <p style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: '12px' }}>Persembahan per Metode Pembayaran</p>
              <SparkBar data={stats.byMethod.map(m => ({ name: m.name, value: m.value }))} colors={['#144f6b', '#3b82f6', '#3a7fa0']} />
              <div className="grid grid-cols-3 gap-3 mt-3">
                {stats.byMethod.map((m, i) => {
                  const mc = METHOD_COLORS[m.name] || { bg: '#f8fafc', text: '#64748b' };
                  return (
                    <div key={m.name} className="rounded-xl p-3 text-center" style={{ background: mc.bg }}>
                      <p style={{ fontSize: '14px', fontWeight: 800, color: mc.text, fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1 }}>{compactRp(m.value)}</p>
                      <p style={{ fontSize: '10.5px', color: mc.text, marginTop: '3px' }}>{m.name}</p>
                      <p style={{ fontSize: '10px', color: mc.text, opacity: 0.6 }}>{m.count}x</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tren bulanan */}
          <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: '12px' }}>Tren Persembahan Bulanan {filterYear}</p>
            <Sparkline data={stats.monthly} color="#144f6b" />
          </div>

          {/* Per Sektor */}
          <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: '12px' }}>Persembahan per Sektor (dari data anggota)</p>
            {stats.bySector.length === 0 ? (
              <p style={{ fontSize: '12.5px', color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>Tidak ada data persembahan yang terasosiasi anggota</p>
            ) : (
              <div className="space-y-3">
                {stats.bySector.map(sec => {
                  const total = stats.bySector.reduce((s, d) => s + d.value, 0) || 1;
                  const pct = (sec.value / total) * 100;
                  return (
                    <div key={sec.id} className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: sec.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p style={{ fontSize: '12.5px', color: '#374151', fontWeight: 500 }}>{sec.name}</p>
                          <div className="flex items-center gap-2">
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{sec.count}x</span>
                            <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>{compactRp(sec.value)}</span>
                          </div>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: sec.color }} />
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0, minWidth: '32px', textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Target vs Realisasi per Jenis */}
          <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: '4px' }}>Target vs Realisasi per Jenis – {filterYear}</p>
            <p style={{ fontSize: '11.5px', color: '#94a3b8', marginBottom: '14px' }}>Estimasi target tahunan berdasarkan rata-rata historis</p>
            <div className="space-y-3.5">
              {(OFFERING_TYPE_LIST).map(type => {
                const tc = TYPE_COLORS[type] || TYPE_COLORS['Lainnya'];
                const actual = stats.byType.find(t => t.name === type)?.value || 0;
                const target = stats.TARGET_BY_TYPE[type] || 0;
                const pct = target > 0 ? Math.min(150, (actual / target) * 100) : 0;
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: tc.dot }} />
                        <span style={{ fontSize: '12.5px', color: '#374151', fontWeight: 500 }}>{type}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>Target: {compactRp(target)}</span>
                        <span style={{ fontSize: '12.5px', fontWeight: 700, color: tc.text }}>{compactRp(actual)}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold" style={{ background: pct >= 100 ? '#f0f7fb' : pct >= 75 ? '#fef3c7' : '#fef2f2', color: pct >= 100 ? '#144f6b' : pct >= 75 ? '#9c9486' : '#dc2626' }}>{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: pct >= 100 ? '#144f6b' : pct >= 75 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : tc.dot }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: REKAP BULANAN ── */}
      {activeTab === 'monthly' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: '#e2e8f0' }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ background: '#f6f4f0', borderBottom: '1px solid #e8e4d8' }}>
                    {[
                      {l:'Bulan',k:'bulan'},
                      ...OFFERING_TYPE_LIST.map(t => ({l:t,k:t})),
                      {l:'Transaksi',k:'transaksi'},
                      {l:'Total',k:'total'},
                    ].map(h => (
                      <th key={h.k} className="px-4 py-3 text-right first:text-left" style={{ fontSize: '10.5px', fontWeight: 700, color: '#144f6b', textTransform: 'uppercase', letterSpacing: '0.06em', width: monthlyColW[h.k], position: 'relative' }}>
                        {h.l}
                        <ColResizeHandle onMouseDown={monthlyStartResize(h.k)} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.monthlyTable.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3" style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{row.name}</td>
                      {OFFERING_TYPE_LIST.map(t => (
                        <td key={t} className="px-4 py-3 text-right" style={{ fontSize: '12.5px', color: row[t] > 0 ? '#374151' : '#cbd5e1' }}>
                          {row[t] > 0 ? compactRp(row[t]) : '–'}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right" style={{ fontSize: '12.5px', color: '#64748b' }}>{row.count}x</td>
                      <td className="px-4 py-3 text-right" style={{ fontSize: '13px', fontWeight: 700, color: row.total > 0 ? '#144f6b' : '#94a3b8', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                        {row.total > 0 ? compactRp(row.total) : '–'}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: 'linear-gradient(135deg,#f0f7fb,#f0fdf4)', borderTop: '2px solid #a7f3d0' }}>
                    <td className="px-4 py-3" style={{ fontSize: '13px', fontWeight: 700, color: '#144f6b' }}>TOTAL</td>
                    {OFFERING_TYPE_LIST.map(t => (
                      <td key={t} className="px-4 py-3 text-right" style={{ fontSize: '12.5px', fontWeight: 700, color: '#144f6b' }}>
                        {compactRp(stats.monthlyTable.reduce((s, r) => s + r[t], 0))}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right" style={{ fontSize: '12.5px', fontWeight: 700, color: '#144f6b' }}>
                      {stats.monthlyTable.reduce((s, r) => s + r.count, 0)}x
                    </td>
                    <td className="px-4 py-3 text-right" style={{ fontSize: '14px', fontWeight: 800, color: '#144f6b', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      {compactRp(stats.totalYear)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── FORM DIALOG ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setShowForm(false); resetForm(); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between" style={{ background: '#144f6b', borderBottom: '1px solid rgba(255,255,255,0.1)', cursor: 'move' }} onMouseDown={onMouseDown}>
              <div>
                <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '17px', fontWeight: 800, color: 'white' }}>{editId ? 'Edit Catatan Persembahan' : 'Catat Persembahan Baru'}</h2>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>{editId ? 'Ubah informasi persembahan' : 'Catat persembahan tunai, transfer, atau QRIS'}</p>
              </div>
              <button onClick={() => { setShowForm(false); resetForm(); }} data-tooltip="Tutup" className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
            {/* Body */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 p-6 space-y-5">
                {/* Info persembahan */}
                <div className="rounded-xl p-4 space-y-4" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Informasi Persembahan</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Tanggal *</label>
                      <input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} required className="w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: '#e2e8f0' }} /></div>
                    <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Jenis Persembahan *</label>
                      <select autoFocus value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value as OfferingType}))} required className="w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: '#e2e8f0' }}>
                        {OFFERING_TYPE_LIST.map(t => <option key={t} value={t}>{t}</option>)}
                      </select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Jumlah (Rp) *</label>
                      <input type="number" min="0" step="1000" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))} required placeholder="0" className="w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: '#e2e8f0' }} /></div>
                    <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Metode Pembayaran *</label>
                      <select value={form.paymentMethod} onChange={e => setForm(f => ({...f, paymentMethod: e.target.value as PaymentMethod}))} required className="w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: '#e2e8f0' }}>
                        {METODE_PEMBAYARAN.map(m => <option key={m} value={m}>{m}</option>)}
                      </select></div>
                  </div>
                  {isQrisCapablePaymentMethod(form.paymentMethod) && (
                    <div className="space-y-3">
                      <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Kode QRIS yang dipakai (opsional)</label>
                        <select
                          value={form.qrisCodeId}
                          onChange={e => {
                            const picked = qrisCodes.find(q => q.id === e.target.value);
                            setForm(f => ({ ...f, qrisCodeId: picked?.id || '', qrisCodeLabel: picked?.label || '' }));
                          }}
                          className="w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: '#e2e8f0' }}
                        >
                          <option value="">— tidak dipilih —</option>
                          {relevantQrisCodes.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}
                        </select>
                        {relevantQrisCodes.length === 0 && (
                          <p className="mt-1 text-xs" style={{ color: '#94a3b8' }}>Belum ada Kode QRIS untuk kategori "{form.type}" — kelola di Master Data Finance &gt; Data QRIS.</p>
                        )}
                        {form.qrisCodeId && (() => {
                          const picked = qrisCodes.find(q => q.id === form.qrisCodeId);
                          return picked ? (
                            <img src={`data:${picked.mime_type};base64,${picked.image_data}`} alt={picked.label} className="mt-2 w-24 h-24 object-contain rounded-lg border" style={{ borderColor: '#e2e8f0' }} />
                          ) : null;
                        })()}
                      </div>
                      <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Referensi QRIS/Transfer (opsional)</label>
                        <input value={form.qrisReference} onChange={e => setForm(f => ({...f, qrisReference: e.target.value}))} placeholder="Nomor referensi transaksi" className="w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: '#e2e8f0' }} /></div>
                    </div>
                  )}
                </div>
                {/* Donatur */}
                <div className="rounded-xl p-4 space-y-4" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Informasi Donatur (Opsional)</p>
                  <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Pilih Jemaat Terdaftar</label>
                    <SearchDropdown<any>
                      value={memberSearch}
                      onChange={v => {
                        setMemberSearch(v);
                        if (!v) { setForm(f => ({...f, memberId: '', donorName: ''})); }
                      }}
                      placeholder="Cari nama jemaat..."
                      items={members}
                      filterFn={(m, q) => {
                        const lq = q.toLowerCase();
                        return m.fullName.toLowerCase().includes(lq) || m.memberNumber?.toLowerCase().includes(lq);
                      }}
                      renderResult={m => (
                        <div>
                          <p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{m.fullName}</p>
                          <p style={{fontSize:'11px',color:'#64748b',margin:0}}>{m.memberNumber||'-'}</p>
                        </div>
                      )}
                      onSelect={m => { setForm(f => ({...f, memberId: m.id, donorName: m.fullName})); setMemberSearch(m.fullName); }}
                      onClear={() => { setForm(f => ({...f, memberId: '', donorName: ''})); setMemberSearch(''); }}
                    /></div>
                  <p className="text-xs text-gray-400 -mt-2">Atau isi manual:</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Nama Donatur</label>
                      <input value={form.donorName} onChange={e => setForm(f => ({...f, donorName: e.target.value}))} placeholder="Nama lengkap" className="w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: '#e2e8f0' }} /></div>
                    <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Telepon</label>
                      <input value={form.donorPhone} onChange={e => setForm(f => ({...f, donorPhone: e.target.value}))} placeholder="08xx" className="w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: '#e2e8f0' }} /></div>
                    <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
                      <input type="email" value={form.donorEmail} onChange={e => setForm(f => ({...f, donorEmail: e.target.value}))} placeholder="email@..." className="w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: '#e2e8f0' }} /></div>
                  </div>
                </div>
                {/* Catatan */}
                <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Keterangan Tambahan</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Catatan atau keterangan..." rows={3} className="w-full px-3 py-2.5 rounded-xl border text-sm resize-none" style={{ borderColor: '#e2e8f0' }} /></div>
              </div>
              {/* Footer */}
              <div className="flex-shrink-0 px-6 py-4 flex justify-end gap-2" style={{ borderTop: '1px solid #f1f5f9' }}>
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 rounded-xl border font-semibold text-sm transition-colors hover:bg-gray-50" style={{ borderColor: '#e2e8f0', color: '#475569' }}>Batal</button>
                <button type="submit" className="px-5 py-2 rounded-xl text-white font-semibold text-sm transition-colors" style={{ background: '#144f6b', boxShadow: '0 2px 8px rgba(20,79,107,0.3)' }}>
                  {editId ? 'Simpan Perubahan' : 'Simpan Persembahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── SETOR KE BUKU BESAR ── */}
      {depositOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { if (!depositSubmitting) setDepositOpen(false); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between" style={{ background: '#144f6b', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="flex items-center gap-2.5">
                <Landmark className="w-5 h-5 text-white" />
                <div>
                  <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '17px', fontWeight: 800, color: 'white' }}>Setor ke Buku Besar</h2>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>Agregasi persembahan yang belum disetor menjadi transaksi Finance Add-on</p>
                </div>
              </div>
              <button onClick={() => { if (!depositSubmitting) setDepositOpen(false); }} data-tooltip="Tutup" className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-colors flex-shrink-0">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {depositResult ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center text-center gap-2 py-2">
                    <CheckCircle2 className="w-10 h-10" style={{ color: '#15803d' }} />
                    <p style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Setoran berhasil dibuat</p>
                    <p style={{ fontSize: '12.5px', color: '#64748b' }}>{depositResult.offeringCount} catatan persembahan sudah ditandai "Disetor" dan siap diverifikasi di modul Finance Add-on (masih berstatus Draft).</p>
                  </div>
                  <div className="space-y-2">
                    {depositResult.transactions.map(t => {
                      const bankLabel = depositPreview?.bankByAccount?.find(b => t.groupKey === (b.bankAccountId ? `BANK:${b.bankAccountId}` : 'DEFAULT'))?.label;
                      const title = t.bucket === 'CASH' ? 'Tunai (BKM)' : `Transfer/QRIS (BBM)${bankLabel ? ` · ${bankLabel}` : ''}`;
                      return (
                        <div key={t.transactionId} className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                          <div>
                            <p style={{ fontSize: '12px', fontWeight: 700, color: '#144f6b' }}>{title}</p>
                            <p style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>{t.voucherNumber}</p>
                          </div>
                          <p style={{ fontSize: '13.5px', fontWeight: 800, color: '#144f6b' }}>{formatRp(t.amount)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Dari Tanggal</label>
                      <input type="date" value={depositRange.startDate} onChange={e => setDepositRange(r => ({ ...r, startDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: '#e2e8f0' }} /></div>
                    <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Sampai Tanggal</label>
                      <input type="date" value={depositRange.endDate} onChange={e => setDepositRange(r => ({ ...r, endDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: '#e2e8f0' }} /></div>
                  </div>

                  {depositPreviewLoading && (
                    <div className="flex items-center justify-center gap-2 py-6" style={{ color: '#94a3b8', fontSize: '13px' }}>
                      <Loader2 className="w-4 h-4 animate-spin" />Memuat pratinjau…
                    </div>
                  )}
                  {depositPreviewError && !depositPreviewLoading && (
                    <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>{depositPreviewError}</div>
                  )}
                  {!depositPreviewLoading && !depositPreviewError && depositPreview && (
                    depositPreview.offeringCount === 0 ? (
                      <div className="px-4 py-6 rounded-xl text-center" style={{ background: '#f8fafc', color: '#94a3b8', fontSize: '13px' }}>
                        Tidak ada persembahan yang belum disetor pada rentang tanggal ini.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl p-3.5" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                            <p style={{ fontSize: '11px', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tunai · {depositPreview.cash.count} catatan</p>
                            <p style={{ fontSize: '17px', fontWeight: 800, color: '#15803d', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{formatRp(depositPreview.cash.total)}</p>
                            <p style={{ fontSize: '10.5px', color: '#166534' }}>{depositPreview.cash.count > 0 ? 'Voucher BKM · debit Kas Tunai Jemaat' : 'Tidak ada'}</p>
                          </div>
                          <div className="rounded-xl p-3.5" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                            <p style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Transfer/QRIS · {depositPreview.bank.count} catatan</p>
                            <p style={{ fontSize: '17px', fontWeight: 800, color: '#1d4ed8', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{formatRp(depositPreview.bank.total)}</p>
                            <p style={{ fontSize: '10.5px', color: '#1e40af' }}>{depositPreview.bank.count > 0 ? 'Voucher BBM · debit Bank Jemaat' : 'Tidak ada'}</p>
                          </div>
                        </div>
                        <div className="rounded-xl p-3.5" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                          <p style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Rincian per Kategori</p>
                          {Object.entries({ ...depositPreview.cash.byCategory, ...depositPreview.bank.byCategory }).length === 0 ? null : (
                            <div className="space-y-1">
                              {[...new Set([...Object.keys(depositPreview.cash.byCategory), ...Object.keys(depositPreview.bank.byCategory)])].map(cat => {
                                const amt = (depositPreview.cash.byCategory[cat]?.amount || 0) + (depositPreview.bank.byCategory[cat]?.amount || 0);
                                return (
                                  <div key={cat} className="flex items-center justify-between" style={{ fontSize: '12.5px' }}>
                                    <span style={{ color: '#475569' }}>{cat}</span>
                                    <span style={{ color: '#0f172a', fontWeight: 600 }}>{formatRp(amt)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        {depositPreview.bankByAccount && depositPreview.bankByAccount.length > 1 && (
                          <div className="rounded-xl p-3.5" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                            <p style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Transfer/QRIS akan dipecah per rekening ({depositPreview.bankByAccount.length} voucher BBM)</p>
                            <div className="space-y-1">
                              {depositPreview.bankByAccount.map((b, i) => (
                                <div key={i} className="flex items-center justify-between" style={{ fontSize: '12.5px' }}>
                                  <span style={{ color: '#475569' }}>{b.label} · {b.count} catatan</span>
                                  <span style={{ color: '#0f172a', fontWeight: 600 }}>{formatRp(b.total)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <p style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                          Transaksi akan dibuat berstatus <strong>Draft</strong> — tetap perlu diajukan, diverifikasi, dan disetujui seperti transaksi manual lainnya di modul Finance Add-on.
                        </p>
                      </div>
                    )
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-6 py-4 flex justify-end gap-2" style={{ borderTop: '1px solid #f1f5f9' }}>
              {depositResult ? (
                <button onClick={() => setDepositOpen(false)} className="px-5 py-2 rounded-xl text-white font-semibold text-sm transition-colors" style={{ background: '#144f6b', boxShadow: '0 2px 8px rgba(20,79,107,0.3)' }}>Selesai</button>
              ) : (
                <>
                  <button type="button" disabled={depositSubmitting} onClick={() => setDepositOpen(false)} className="px-4 py-2 rounded-xl border font-semibold text-sm transition-colors hover:bg-gray-50 disabled:opacity-50" style={{ borderColor: '#e2e8f0', color: '#475569' }}>Batal</button>
                  <button
                    type="button"
                    disabled={!depositPreview || depositPreview.offeringCount === 0 || depositSubmitting || depositPreviewLoading}
                    onClick={handleConfirmDeposit}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-white font-semibold text-sm transition-colors disabled:opacity-50"
                    style={{ background: '#144f6b', boxShadow: '0 2px 8px rgba(20,79,107,0.3)' }}
                  >
                    {depositSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Proses Setoran
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── KIOS QRIS: layar penuh untuk ditunjukkan ke jemaat saat ibadah ── */}
      {showKiosk && (
        <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: '#0b2531' }}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
            <div>
              <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: '18px', color: 'white' }}>Kode QRIS Persembahan</p>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Pindai untuk memberi persembahan · GPIB Trinitas</p>
            </div>
            <button onClick={() => setShowKiosk(false)} className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors" data-tooltip="Tutup (Esc)">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-8">
            {kioskLoading ? (
              <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 text-white/60 animate-spin" /></div>
            ) : kioskCodes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-white/60">
                <QrCode className="w-10 h-10" />
                <p className="text-sm">Belum ada Kode QRIS yang ditandai tampil.</p>
                <p className="text-xs">Atur di Master Data Finance &gt; Data QRIS (toggle "Tampilkan").</p>
              </div>
            ) : (
              <div className="grid gap-8 mx-auto" style={{ maxWidth: '1100px', gridTemplateColumns: `repeat(${Math.min(kioskCodes.length, 3)}, minmax(0, 1fr))` }}>
                {kioskCodes.map(q => (
                  <div key={q.id} className="bg-white rounded-2xl p-6 flex flex-col items-center gap-4 shadow-2xl">
                    <img src={`data:${q.mime_type};base64,${q.image_data}`} alt={q.label} className="w-full max-w-[320px] aspect-square object-contain" />
                    <p className="text-center font-bold" style={{ fontSize: '16px', color: '#0f172a' }}>{q.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}