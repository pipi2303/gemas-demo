import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Users, Home, MapPin, Cake, TrendingUp,
  DollarSign, Activity, FileText,
  ArrowUpRight, ArrowDownRight, ChevronRight, Zap, X,
  MapPinned, Clock, AlertCircle, Circle,
  ArrowLeft, Package, Shield, Baby, Heart,
  Church, BarChart3, Bell, BookOpen, Calendar,
  Megaphone, CheckCircle2, UserPlus, Pencil, Trash2,
  HandHeart, Stethoscope, Printer, Layers,
} from 'lucide-react';
import { AgeGroup } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatRp(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}Jt`;
  return `Rp ${n.toLocaleString('id-ID')}`;
}

const SECTOR_COLORS = ['#3b82f6', '#0891b2', '#1A77A3', '#7c3aed', '#e11d48', '#16a34a', '#f59e0b'];
const AGE_COLORS    = ['#3b82f6', '#0891b2', '#1A77A3', '#7c3aed'];
const DIAKONIA_COLORS = ['#1A77A3','#16a34a','#f59e0b','#e11d48','#7c3aed'];

// ── Mini SVG charts ────────────────────────────────────────────────────────────
function MiniSparkline({ data, color = '#1A77A3', color2 }: { data: { name: string; persembahan: number }[]; color?: string; color2?: string }) {
  if (!data.length) return null;
  const W = 500, H = 130;
  const pad = { t: 18, r: 36, b: 28, l: 50 };
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
  const vals = data.map(d => d.persembahan);
  const minV = Math.min(...vals), maxV = Math.max(...vals) || 1;
  const range = maxV - minV || 1;
  const xOf = (i: number) => pad.l + (i / Math.max(data.length - 1, 1)) * iW;
  const yOf = (v: number) => pad.t + (1 - (v - minV) / range) * iH;
  const pts = data.map((d, i) => ({ x: xOf(i), y: yOf(d.persembahan), v: d.persembahan, name: d.name }));
  const f = (n: number) => n.toFixed(1);
  const line = pts.map(({ x, y }, i) => `${i === 0 ? 'M' : 'L'}${f(x)},${f(y)}`).join(' ');
  const area = `${line} L${f(pts[pts.length - 1].x)},${H - pad.b} L${f(pts[0].x)},${H - pad.b} Z`;
  const gid = `sg-${color.replace('#', '')}`;
  const last = pts[pts.length - 1];
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="80%" stopColor={color} stopOpacity="0.04" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((t, gi) => (
        <line key={gi} x1={pad.l} y1={pad.t + t * iH} x2={W - pad.r} y2={pad.t + t * iH}
          stroke={t === 0 || t === 1 ? '#e2e8f0' : '#f1f5f9'} strokeWidth={1} strokeDasharray={t > 0 && t < 1 ? '4,4' : undefined} />
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(({ x, y, v, name }, xi) => {
        const isMax = v === maxV, isMin = v === minV;
        return (
          <g key={xi}>
            <circle cx={x} cy={y} r={isMax || isMin ? 4.5 : 2.5} fill={isMax ? color : isMin ? '#94a3b8' : color} stroke="white" strokeWidth={1.5} />
            {(isMax || isMin) && (
              <text x={x} y={y - 8} textAnchor="middle" fontSize={8.5} fontWeight="700" fill={isMax ? color : '#64748b'}>
                {v >= 1_000_000 ? `${(v/1_000_000).toFixed(0)}Jt` : v.toFixed(0)}
              </text>
            )}
            <text x={x} y={H - 6} textAnchor="middle" fontSize={9} fill="#94a3b8">{name}</text>
          </g>
        );
      })}
      {last && (
        <g>
          <rect x={last.x + 6} y={last.y - 9} width={46} height={14} rx={4} fill={color} />
          <text x={last.x + 29} y={last.y + 1} textAnchor="middle" fontSize={8.5} fontWeight="700" fill="white">
            {last.v >= 1_000_000 ? `${(last.v/1_000_000).toFixed(1)}Jt` : last.v.toFixed(0)}
          </text>
        </g>
      )}
      {[minV, maxV].map((v, yi) => (
        <text key={yi} x={pad.l - 5} y={yOf(v) + 4} textAnchor="end" fontSize={8} fill="#b0bec5">
          {v >= 1_000_000 ? `${(v/1_000_000).toFixed(0)}Jt` : v.toFixed(0)}
        </text>
      ))}
    </svg>
  );
}

function MiniDonut({ data, colors, size = 140, centerLabel }: { data: { name: string; value: number }[]; colors: string[]; size?: number; centerLabel?: string }) {
  const cx = size / 2, cy = size / 2, OR = size * 0.44, IR = size * 0.29;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const gap = 0.035;
  let angle = -Math.PI / 2;
  const arcs = data.map((d, i) => {
    const span = (d.value / total) * (Math.PI * 2 - gap * data.length);
    const sa = angle + gap / 2, ea = sa + span;
    angle += span + gap;
    const f = (n: number) => n.toFixed(2), lg = span > Math.PI ? 1 : 0;
    const ox1 = cx + OR * Math.cos(sa), oy1 = cy + OR * Math.sin(sa);
    const ox2 = cx + OR * Math.cos(ea), oy2 = cy + OR * Math.sin(ea);
    const ix1 = cx + IR * Math.cos(ea), iy1 = cy + IR * Math.sin(ea);
    const ix2 = cx + IR * Math.cos(sa), iy2 = cy + IR * Math.sin(sa);
    const pct = Math.round((d.value / total) * 100);
    const mid = sa + span / 2;
    const lx = cx + (OR + 10) * Math.cos(mid), ly = cy + (OR + 10) * Math.sin(mid);
    return (
      <g key={i}>
        <path d={`M${f(ox1)},${f(oy1)} A${OR},${OR} 0 ${lg},1 ${f(ox2)},${f(oy2)} L${f(ix1)},${f(iy1)} A${IR},${IR} 0 ${lg},0 ${f(ix2)},${f(iy2)} Z`}
          fill={colors[i % colors.length]} />
        {pct >= 12 && <text x={lx} y={ly + 3} textAnchor="middle" fontSize={8} fontWeight="700" fill={colors[i % colors.length]}>{pct}%</text>}
      </g>
    );
  });
  return (
    <svg width="100%" height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs}
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize={size * 0.16} fontWeight="800" fill="#0f172a">{total}</text>
      {centerLabel && <text x={cx} y={cy + 10} textAnchor="middle" fontSize={size * 0.085} fill="#94a3b8">{centerLabel}</text>}
    </svg>
  );
}

function MiniBar({ data, colors }: { data: { name: string; value: number }[]; colors: string[] }) {
  const W = 380, H = 150;
  const pad = { t: 22, r: 8, b: 28, l: 8 };
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
  const maxV = Math.max(...data.map(d => d.value)) || 1;
  const slotW = iW / data.length, barW = slotW * 0.55, barGap = (slotW - barW) / 2;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        {data.map((_, i) => (
          <linearGradient key={i} id={`bg${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors[i % colors.length]} stopOpacity="1" />
            <stop offset="100%" stopColor={colors[i % colors.length]} stopOpacity="0.6" />
          </linearGradient>
        ))}
      </defs>
      {[0, 0.5, 1].map((t, gi) => <line key={gi} x1={pad.l} y1={pad.t + t * iH} x2={W - pad.r} y2={pad.t + t * iH} stroke="#f1f5f9" strokeWidth={1} />)}
      {data.map((d, i) => {
        const bH = Math.max((d.value / maxV) * iH, 2);
        const x = pad.l + i * slotW + barGap, y = pad.t + iH - bH, r = Math.min(5, barW / 2);
        return (
          <g key={i}>
            <path d={bH > r ? `M${x},${y + bH} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${y + bH} Z` : `M${x},${y + bH} L${x},${y} L${x + barW},${y} L${x + barW},${y + bH} Z`}
              fill={`url(#bg${i})`} />
            <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize={9} fontWeight="700" fill={colors[i % colors.length]}>{d.value}</text>
            <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={9} fill="#94a3b8">{d.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

function MiniHorizontalBar({ data, color = '#1A77A3' }: { data: { name: string; value: number; total: number }[]; color?: string }) {
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => {
        const pct = d.total > 0 ? (d.value / d.total) * 100 : 0;
        const barColors = [color, '#0891b2', '#7c3aed', '#e11d48', '#16a34a', '#f59e0b', '#64748b'];
        const bc = barColors[i % barColors.length];
        return (
          <div key={d.name}>
            <div className="flex justify-between mb-1">
              <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: 500 }} className="truncate pr-2">{d.name}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>{d.value}</span>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>({pct.toFixed(0)}%)</span>
              </div>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: bc }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniStackedBar({ data, color1 = '#1A77A3', color2 = '#ef4444', label1 = 'Pemasukan', label2 = 'Pengeluaran' }: {
  data: { name: string; v1: number; v2: number }[]; color1?: string; color2?: string; label1?: string; label2?: string;
}) {
  if (!data.length) return null;
  const W = 480, H = 130;
  const pad = { t: 10, r: 8, b: 26, l: 8 };
  const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
  const maxV = Math.max(...data.map(d => d.v1 + d.v2)) || 1;
  const slotW = iW / data.length, barW = slotW * 0.6, barGap = (slotW - barW) / 2;
  const f = (n: number) => n.toFixed(1);
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {[0, 0.5, 1].map((t, gi) => <line key={gi} x1={pad.l} y1={pad.t + t * iH} x2={W - pad.r} y2={pad.t + t * iH} stroke="#f1f5f9" strokeWidth={1} />)}
      {data.map((d, i) => {
        const x = pad.l + i * slotW + barGap;
        const h1 = (d.v1 / maxV) * iH, h2 = (d.v2 / maxV) * iH;
        const y1 = pad.t + iH - h1 - h2, y2 = pad.t + iH - h2;
        const r = Math.min(4, barW / 2);
        return (
          <g key={i}>
            {h1 > 0 && <path d={`M${f(x)},${f(y1 + h1)} L${f(x)},${f(y1 + r)} Q${f(x)},${f(y1)} ${f(x + r)},${f(y1)} L${f(x + barW - r)},${f(y1)} Q${f(x + barW)},${f(y1)} ${f(x + barW)},${f(y1 + r)} L${f(x + barW)},${f(y1 + h1)} Z`} fill={color1} opacity="0.85" />}
            {h2 > 0 && <path d={`M${f(x)},${f(y2 + h2)} L${f(x)},${f(y2)} L${f(x + barW)},${f(y2)} L${f(x + barW)},${f(y2 + h2)} Z`} fill={color2} opacity="0.7" />}
            <text x={f(x + barW / 2)} y={H - 6} textAnchor="middle" fontSize={9} fill="#94a3b8">{d.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Reusable UI primitives ─────────────────────────────────────────────────────
function ModuleHeader({ icon: Icon, title, subtitle, gradient, action, onAction }: {
  icon: any; title: string; subtitle?: string; gradient: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4 pb-4" style={{ borderBottom: '1.5px solid #f1f5f9' }}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: gradient }}>
          <Icon className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
        </div>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.2 }}>{title}</h2>
          {subtitle && <p style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '1px' }}>{subtitle}</p>}
        </div>
      </div>
      {action && onAction && (
        <button onClick={onAction}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors hover:opacity-80"
          style={{ background: gradient + '18', fontSize: '12px', fontWeight: 600, color: '#374151' }}>
          {action} <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function StatChip({ label, value, color, bg, icon: Icon, trend }: {
  label: string; value: string | number; color: string; bg: string; icon?: any; trend?: string;
}) {
  return (
    <div className="flex-1 min-w-0 rounded-xl px-3 py-2" style={{ background: bg, border: `1px solid ${color}25` }}>
      <div className="flex items-center gap-1 mb-1">
        {Icon && <Icon style={{ width: 10, height: 10, color: color }} />}
        <p style={{ fontSize: '9px', color: color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      </div>
      <p style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1 }}>{value}</p>
      {trend && <p style={{ fontSize: '8.5px', color: '#94a3b8', marginTop: '2px' }}>{trend}</p>}
    </div>
  );
}

function KPICard({ label, value, sub, icon: Icon, gradient, trend, onClick }: {
  label: string; value: string | number; sub?: string; icon: any; gradient: string;
  trend?: { value: string; up: boolean }; onClick?: () => void;
}) {
  return (
    <div onClick={onClick}
      className={`rounded-2xl p-3.5 relative overflow-hidden transition-all duration-200 ${onClick ? 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]' : ''}`}
      style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
      <div className="flex items-start justify-between mb-2.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: gradient }}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex items-center gap-1.5">
          {trend && (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${trend.up ? 'bg-[#f0f7fb] text-[#1A77A3]' : 'bg-red-50 text-red-600'}`}>
              {trend.up ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}{trend.value}
            </div>
          )}
          {onClick && <div className="w-5 h-5 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center"><ChevronRight className="w-3 text-gray-400" /></div>}
        </div>
      </div>
      <p style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', fontWeight: 500 }}>{label}</p>
      {sub && <p style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>{sub}</p>}
    </div>
  );
}

// ── Detail Drawer Helpers ──────────────────────────────────────────────────────
function DSection({ title, icon: SIcon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-3">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-50" style={{ background: '#fafafa' }}>
        <SIcon className="w-3.5 h-3.5 text-gray-400" />
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
      </div>
      <div className="px-3 py-0.5">{children}</div>
    </div>
  );
}
function DRow({ label, value, accent }: { label: string; value?: string | number | null; accent?: boolean }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-50 last:border-0 gap-4">
      <span style={{ fontSize: '12px', color: '#94a3b8', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '12.5px', fontWeight: 600, color: accent ? '#1A77A3' : '#0f172a', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-10">
      <Circle className="w-8 h-8 mx-auto mb-3 text-gray-200" />
      <p style={{ fontSize: '13px', color: '#94a3b8' }}>{message}</p>
    </div>
  );
}

// ── KPI Detail Drawer ──────────────────────────────────────────────────────────
type KPIType = 'birthdays' | 'attestations';

function KPIDetailDrawer({ activeKPI, onClose, members, attestations, sectors }: {
  activeKPI: KPIType | null; onClose: () => void;
  members: any[]; attestations: any[]; sectors: any[];
}) {
  const [selectedItem, setSelectedItem] = useState<any>(null);
  useEffect(() => { setSelectedItem(null); }, [activeKPI]);
  if (!activeKPI) return null;

  const curM = new Date().getMonth();
  const birthdayMembers = members.filter(m => new Date(m.birthDate).getMonth() === curM)
    .sort((a, b) => new Date(a.birthDate).getDate() - new Date(b.birthDate).getDate());
  const pendingAtts = attestations.filter(a => a.status === 'Diajukan');
  const getSN = (id: string) => sectors.find(s => s.id === id)?.name || '–';

  const cfgMap: Record<KPIType, { title: string; subtitle: string; gradient: string; count: number; icon: any }> = {
    birthdays:    { title: 'Ulang Tahun Bulan Ini', subtitle: 'Jemaat yang berulang tahun bulan ini', gradient: '#9c9486', count: birthdayMembers.length, icon: Cake },
    attestations: { title: 'Atestasi Pending', subtitle: 'Atestasi yang menunggu proses', gradient: '#1A77A3', count: pendingAtts.length, icon: FileText },
  };

  const cfg = cfgMap[activeKPI];
  const IconComp = cfg.icon;
  const isDetail = !!selectedItem;

  const renderHeader = () => {
    if (!selectedItem) return null;
    const isAtt = activeKPI === 'attestations';
    const headerGrad = isAtt ? '#1A77A3' : '#9c9486';
    const title = isAtt ? selectedItem.memberName : (selectedItem.fullName || `${selectedItem.firstName} ${selectedItem.lastName}`);
    return (
      <div className="flex-shrink-0 px-6 pt-5 pb-4" style={{ background: headerGrad }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setSelectedItem(null)} className="w-8 h-8 bg-white/20 hover:bg-white/30 transition-colors rounded-xl flex items-center justify-center flex-shrink-0">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>Kembali</p>
          <button onClick={onClose} className="ml-auto w-8 h-8 bg-white/20 hover:bg-white/30 transition-colors rounded-xl flex items-center justify-center">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
        <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '17px', fontWeight: 800, color: 'white' }}>{title}</h2>
      </div>
    );
  };

  const renderBody = () => {
    if (activeKPI === 'birthdays') {
      const m = selectedItem;
      const bd = new Date(m.birthDate);
      return (
        <div className="p-4" style={{ background: '#f8fafc' }}>
          <DSection title="Informasi Pribadi" icon={Users}>
            <DRow label="Nama Lengkap" value={m.fullName || `${m.firstName} ${m.lastName}`} accent />
            <DRow label="Tanggal Lahir" value={bd.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} />
            <DRow label="Usia" value={`${m.age} tahun`} />
            <DRow label="Jenis Kelamin" value={m.gender} />
            <DRow label="Sektor" value={getSN(m.sectorId)} />
          </DSection>
        </div>
      );
    }
    if (activeKPI === 'attestations') {
      const att = selectedItem;
      const isIn = att.type === 'Pindah Masuk';
      const stCfg: Record<string, any> = {
        'Diajukan': { bg: '#fef3c7', text: '#9c9486', label: 'Menunggu Proses', icon: '⏳' },
        'Diproses': { bg: '#eff6ff', text: '#3b82f6', label: 'Sedang Diproses', icon: '🔄' },
        'Selesai':  { bg: '#f0f7fb', text: '#1A77A3', label: 'Selesai',         icon: '✅' },
        'Ditolak':  { bg: '#fef2f2', text: '#dc2626', label: 'Ditolak',         icon: '❌' },
      };
      const sc = stCfg[att.status] || stCfg['Diajukan'];
      return (
        <div className="p-4" style={{ background: '#f8fafc' }}>
          <div className="rounded-2xl p-3 mb-3 flex items-center gap-2.5" style={{ background: sc.bg, border: `1px solid ${sc.text}30` }}>
            <div className="w-9 h-9 rounded-2xl flex-shrink-0 flex items-center justify-center text-lg" style={{ background: `${sc.text}20` }}>{sc.icon}</div>
            <div>
              <p style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: sc.text }}>Status Atestasi</p>
              <p style={{ fontSize: '13px', fontWeight: 800, color: sc.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{sc.label}</p>
              <p style={{ fontSize: '10px', color: sc.text, opacity: 0.8 }}>{att.type}</p>
            </div>
          </div>
          <DSection title="Informasi Atestasi" icon={FileText}>
            <DRow label="Nama Jemaat" value={att.memberName} accent />
            <DRow label="Jenis" value={att.type} />
            <DRow label="Status" value={att.status} />
            {att.letterNumber && <DRow label="No. Surat" value={att.letterNumber} />}
          </DSection>
          <DSection title="Perpindahan Gereja" icon={MapPinned}>
            <div className="py-3 space-y-2">
              <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: isIn ? '#f0f7fb' : '#f0f9ff', border: `1px solid ${isIn ? '#a7f3d0' : '#bae6fd'}` }}>
                <span className="text-base flex-shrink-0">{isIn ? '📥' : '📤'}</span>
                <div>
                  <p style={{ fontSize: '10.5px', fontWeight: 700, color: isIn ? '#144f6b' : '#0369a1', textTransform: 'uppercase' }}>{isIn ? 'Gereja Asal' : 'Gereja Tujuan'}</p>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: isIn ? '#1A77A3' : '#0284c7' }}>{isIn ? att.fromChurch : att.toChurch}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-2 py-1"><div className="flex-1 h-px bg-gray-200" /><span style={{ fontSize: '11px', color: '#94a3b8' }}>→</span><div className="flex-1 h-px bg-gray-200" /></div>
              <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <span className="text-base flex-shrink-0">{isIn ? '🏠' : '📥'}</span>
                <div>
                  <p style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>{isIn ? 'Gereja Tujuan' : 'Gereja Asal'}</p>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: '#374151' }}>{isIn ? att.toChurch : att.fromChurch}</p>
                </div>
              </div>
            </div>
          </DSection>
          <DSection title="Riwayat Proses" icon={Activity}>
            <DRow label="Tanggal Pengajuan" value={new Date(att.requestDate || att.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} />
            {att.processedBy && <DRow label="Diproses Oleh" value={att.processedBy} />}
            {att.completedDate && <DRow label="Tanggal Selesai" value={new Date(att.completedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} accent />}
          </DSection>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0" style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="relative flex flex-col bg-white shadow-2xl overflow-hidden" style={{ width: '420px', height: '100vh' }}>
        {isDetail ? renderHeader() : (
          <div className="flex-shrink-0 px-6 pt-6 pb-5" style={{ background: cfg.gradient }}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><IconComp className="w-5 h-5 text-white" /></div>
              <button onClick={onClose} className="w-8 h-8 bg-white/20 hover:bg-white/30 transition-colors rounded-xl flex items-center justify-center"><X className="w-4 h-4 text-white" /></button>
            </div>
            <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '18px', fontWeight: 800, color: 'white', marginBottom: '2px' }}>{cfg.title}</h2>
            <p style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.75)' }}>{cfg.subtitle}</p>
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'white' }}>{cfg.count}</span>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)' }}>data ditemukan</span>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto" style={{ background: '#f8fafc' }}>
          {isDetail ? renderBody() : (
            <>
              {activeKPI === 'birthdays' && (
                <div className="p-4 space-y-2.5">
                  {birthdayMembers.length === 0 ? <EmptyState message="Tidak ada jemaat berulang tahun bulan ini" /> :
                    birthdayMembers.map((m, i) => {
                      const bd = new Date(m.birthDate), today = new Date();
                      const isT = bd.getDate() === today.getDate(), isP = bd.getDate() < today.getDate();
                      return (
                        <div key={m.id || i} onClick={() => setSelectedItem(m)} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-[#b8d5e8] active:scale-[0.99] transition-all duration-150">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: '#9c9486' }}>{m.fullName?.charAt(0) || '?'}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }} className="truncate">{m.fullName || `${m.firstName} ${m.lastName}`}</p>
                                {isT && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0" style={{ background: '#fef3c7', color: '#9c9486' }}>🎂 Hari Ini</span>}
                              </div>
                              <div className="flex items-center gap-2" style={{ fontSize: '11.5px', color: '#64748b' }}>
                                <span className="flex items-center gap-1"><Cake className="w-3 h-3" />{bd.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}</span>
                                <span>·</span><span>{m.age} tahun</span><span>·</span><span>{m.gender === 'Laki-laki' ? '♂' : '♀'}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="text-right">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: isT ? '#fef3c7' : isP ? '#f0fdf4' : '#f8fafc', border: `1px solid ${isT ? '#e8e4d8' : isP ? '#f0ede5' : '#e2e8f0'}` }}>
                                  <span style={{ fontSize: '13px', fontWeight: 800, color: isT ? '#9c9486' : isP ? '#1A77A3' : '#94a3b8' }}>{bd.getDate()}</span>
                                </div>
                                <p style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>{getSN(m.sectorId).replace('Sektor ', 'Sek.')}</p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-300" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
              {activeKPI === 'attestations' && (
                <div className="p-4 space-y-2.5">
                  {pendingAtts.length === 0 ? <EmptyState message="Tidak ada atestasi pending" /> :
                    pendingAtts.map((att, i) => {
                      const isIn = att.type === 'Pindah Masuk';
                      return (
                        <div key={att.id || i} onClick={() => setSelectedItem(att)} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-sky-200 active:scale-[0.99] transition-all duration-150">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-xs" style={{ background: '#1A77A3' }}>{att.memberName?.charAt(0) || '?'}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }} className="truncate">{att.memberName}</p>
                                <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: isIn ? '#f0f7fb' : '#eff6ff', color: isIn ? '#1A77A3' : '#3b82f6' }}>{att.type}</span>
                              </div>
                              <p style={{ fontSize: '11.5px', color: '#64748b' }}>{isIn ? `📥 Dari: ${att.fromChurch}` : `📤 Ke: ${att.toChurch}`}</p>
                              <div className="flex items-center gap-1.5 mt-1.5"><AlertCircle className="w-3 h-3 text-[#1A77A3] flex-shrink-0" /><span style={{ fontSize: '11px', fontWeight: 600, color: '#9c9486' }}>Menunggu · {new Date(att.requestDate || att.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span></div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex-shrink-0 p-4 border-t border-gray-100" style={{ background: 'white' }}>
          {isDetail ? (
            <button onClick={() => setSelectedItem(null)} className="w-full py-2.5 rounded-xl font-semibold text-sm" style={{ background: '#f1f5f9', color: '#475569' }}>← Kembali ke Daftar</button>
          ) : (
            <button onClick={onClose} className="w-full py-2.5 rounded-xl font-semibold text-sm" style={{ background: '#f1f5f9', color: '#475569' }}>Tutup</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Quick Nav config ──────────────────────────────────────────────────────────
const QUICK_NAV = [
  { label: 'Database & Anggota',      icon: Users,     page: 'members',          color: '#3b82f6', bg: '#eff6ff',                    emoji: '👥' },
  { label: 'Jadwal & Peribadahan',    icon: Church,    page: 'worship-schedules', color: '#7c3aed', bg: 'rgba(124,58,237,0.08)',       emoji: '⛪' },
  { label: 'Keuangan & Kas',          icon: DollarSign,page: 'church-finance',    color: '#1A77A3', bg: '#f0f7fb',                    emoji: '💰' },
  { label: 'Laporan Jemaat',          icon: BarChart3,  page: 'sensus-report',    color: '#1A77A3', bg: 'rgba(26,119,163,0.08)',        emoji: '📋' },
  { label: 'Pusat Laporan PDF',       icon: Printer,    page: 'report-center',    color: '#b45309', bg: 'rgba(180,83,9,0.08)',          emoji: '📄' },
  { label: 'Layanan & Bantuan',       icon: Heart,      page: 'service-requests', color: '#e11d48', bg: 'rgba(225,29,72,0.08)',        emoji: '❤️' },
  { label: 'Aset & Inventaris',       icon: Package,    page: 'assets',           color: '#0891b2', bg: 'rgba(8,145,178,0.08)',        emoji: '📦' },
  { label: 'Pengaturan Sistem',       icon: Shield,     page: 'users',            color: '#dc2626', bg: 'rgba(220,38,38,0.06)',        emoji: '🔐' },
];

const PRAYER_CATEGORY_EMOJI: Record<string, string> = {
  'Kesehatan': '🏥', 'Keuangan': '💼', 'Keluarga': '🏠',
  'Pekerjaan': '💼', 'Rohani': '🙏', 'Lainnya': '📝',
};

const ANNOUNCEMENT_PRIORITY: Record<string, { bg: string; color: string; label: string }> = {
  urgent:    { bg: 'rgba(239,68,68,0.1)',   color: '#dc2626', label: 'Mendesak' },
  important: { bg: 'rgba(245,158,11,0.1)',  color: '#1A77A3', label: 'Penting'  },
  normal:    { bg: 'rgba(100,116,139,0.1)', color: '#64748b', label: 'Normal'   },
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function Dashboard({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const {
    members, families, sectors, offerings,
    activityLogs, attestations,
    financialRecords,
    baptisms, sidis, marriages,
    currentUser,
    worshipSchedules, events, prayerRequests, announcements, attendance,
    serviceRequests, aidDistributions,
  } = useApp();

  const [activeKPI, setActiveKPI] = useState<KPIType | null>(null);

  const s = useMemo(() => {
    const getAgeGroup = (age: number): AgeGroup => {
      if (age < 13) return 'Anak';
      if (age < 25) return 'Pemuda';
      if (age < 60) return 'Dewasa';
      return 'Lansia';
    };
    const now = new Date(), curM = now.getMonth(), curY = now.getFullYear();
    const todayMidnight = new Date(now); todayMidnight.setHours(0,0,0,0);
    const nextWeek = new Date(todayMidnight); nextWeek.setDate(todayMidnight.getDate() + 7);

    // ── M1: Keanggotaan ──
    const aktif      = members.filter(m => (m.membershipStatus || 'Aktif') === 'Aktif');
    const pindah     = members.filter(m => m.membershipStatus === 'Pindah');
    const meninggal  = members.filter(m => m.membershipStatus === 'Meninggal');
    const tidakAktif = members.filter(m => m.membershipStatus === 'Tidak Aktif');
    const ageGroups  = members.reduce((acc, m) => { const g = getAgeGroup(m.age); acc[g] = (acc[g] || 0) + 1; return acc; }, {} as Record<AgeGroup, number>);
    const genderL    = members.filter(m => m.gender === 'Laki-laki').length;
    const genderP    = members.filter(m => m.gender === 'Perempuan').length;
    const membersBySector = sectors.map((sec, i) => ({
      id: sec.id, name: sec.name, short: sec.name.replace('Sektor ', 'Sek. '),
      count: members.filter(m => m.sectorId === sec.id).length || sec.memberCount,
      color: SECTOR_COLORS[i % SECTOR_COLORS.length],
    }));
    const byMemberType = {
      'Warga Jemaat': members.filter(m => (m.membershipType || 'Warga Jemaat') === 'Warga Jemaat').length,
      'Warga Tamu':   members.filter(m => m.membershipType === 'Warga Tamu').length,
      'Simpatisan':   members.filter(m => m.membershipType === 'Simpatisan').length,
    };
    const birthdaysThisMonth  = members.filter(m => new Date(m.birthDate).getMonth() === curM).length;
    const birthdayToday       = members.filter(m => { const bd = new Date(m.birthDate); return bd.getDate() === now.getDate() && bd.getMonth() === curM; }).length;
    const baptismsThisYear    = (baptisms  || []).filter(b => new Date(b.baptismDate).getFullYear() === curY);
    const sidisThisYear       = (sidis     || []).filter(s => new Date(s.sidiDate).getFullYear() === curY);
    const marriagesThisYear   = (marriages || []).filter(m => new Date(m.marriageDate).getFullYear() === curY);
    const baptismPending      = (baptisms  || []).filter(b => b.status === 'Terjadwal').length;
    const sidiPending         = (sidis     || []).filter(s => s.status === 'Terjadwal').length;

    // ── M2: Peribadahan ──
    const upcomingWorship = (worshipSchedules || [])
      .filter(w => new Date(w.date) >= todayMidnight && w.status !== 'Dibatalkan' && w.status !== 'Selesai')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 4);
    const worshipThisWeek = (worshipSchedules || []).filter(w => {
      const d = new Date(w.date);
      return d >= todayMidnight && d <= nextWeek;
    }).length;
    const upcomingEvents = (events || [])
      .filter(e => new Date(e.date) >= todayMidnight && e.status === 'Akan Datang')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);
    const eventsThisWeek = (events || []).filter(e => {
      const d = new Date(e.date);
      return d >= todayMidnight && d <= nextWeek && e.status === 'Akan Datang';
    }).length;
    const attendanceThisMonth = (attendance || []).filter(a => {
      const d = new Date(a.date);
      return d.getMonth() === curM && d.getFullYear() === curY && a.present;
    }).length;
    const attendanceDates = new Set((attendance || []).map(a => a.date)).size;

    // ── M3: Keuangan ──
    const offeringsTotal     = offerings.reduce((s, o) => s + o.amount, 0);
    const offeringsThisMonth = offerings.filter(o => {
      const d = new Date(o.date);
      return d.getMonth() === curM && d.getFullYear() === curY;
    }).reduce((s, o) => s + o.amount, 0);
    const offeringsByType  = offerings.reduce((acc, o) => { acc[o.type] = (acc[o.type] || 0) + o.amount; return acc; }, {} as Record<string, number>);
    const finIncome  = financialRecords.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const finExpense = financialRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
    const monthlyOfferings = MONTH_NAMES.map((name, i) => ({
      name,
      persembahan: offerings.filter(o => { const d = new Date(o.date); return d.getMonth() === i && d.getFullYear() === curY; }).reduce((s, o) => s + o.amount, 0),
    }));
    const last6Months = Array.from({ length: 6 }, (_, k) => {
      const d = new Date(curY, curM - 5 + k, 1);
      const m = d.getMonth(), y = d.getFullYear();
      return {
        name: MONTH_NAMES[m],
        v1: financialRecords.filter(r => r.type === 'income'  && new Date(r.date).getMonth() === m && new Date(r.date).getFullYear() === y).reduce((s, r) => s + r.amount, 0),
        v2: financialRecords.filter(r => r.type === 'expense' && new Date(r.date).getMonth() === m && new Date(r.date).getFullYear() === y).reduce((s, r) => s + r.amount, 0),
      };
    });

    // ── M4: Diakonia & Layanan ──
    const srList = serviceRequests || [];
    const aidList = aidDistributions || [];
    const srPending   = srList.filter(r => r.status === 'Pending').length;
    const srScheduled = srList.filter(r => r.status === 'Scheduled').length;
    const srDone      = srList.filter(r => r.status === 'Completed').length;
    const aidPending  = aidList.filter(a => a.status === 'Pengajuan' || a.status === 'Verifikasi').length;
    const aidDone     = aidList.filter(a => a.status === 'Disalurkan').length;
    const srByType    = srList.reduce((acc, r) => { acc[r.type] = (acc[r.type] || 0) + 1; return acc; }, {} as Record<string, number>);
    const recentSR    = [...srList].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 4);

    // ── M2 extra: ibadah by kategori ──
    const worshipByType = (worshipSchedules || []).reduce((acc, w) => {
      const key = w.category || w.type;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // ── M5: Komunikasi ──
    const activePrayers = (prayerRequests || []).filter(p => p.status === 'Aktif');
    const activeAnnouncements = (announcements || [])
      .filter(a => a.isActive)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);

    // ── Admin ──
    const pendingAttestations = attestations.filter(a => a.status === 'Diajukan').length;
    const recentActivities    = [...activityLogs]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 6);

    return {
      totalMembers: members.length, totalFamilies: families.length, totalSectors: sectors.length,
      aktif: aktif.length, pindah: pindah.length, meninggal: meninggal.length, tidakAktif: tidakAktif.length,
      ageGroups, genderL, genderP, membersBySector, byMemberType,
      birthdaysThisMonth, birthdayToday,
      baptismsThisYear: baptismsThisYear.length, sidisThisYear: sidisThisYear.length, marriagesThisYear: marriagesThisYear.length,
      baptismPending, sidiPending,
      upcomingWorship, worshipThisWeek,
      upcomingEvents, eventsThisWeek,
      attendanceThisMonth, attendanceDates,
      offeringsTotal, offeringsThisMonth, offeringsByType, finIncome, finExpense, monthlyOfferings, last6Months,
      activePrayers: activePrayers.length, activePrayersList: activePrayers.slice(0, 3),
      activeAnnouncements,
      pendingAttestations, recentActivities,
      totalAttestations: attestations.length,
      srTotal: srList.length, srPending, srScheduled, srDone, aidTotal: aidList.length, aidPending, aidDone,
      srByType, recentSR,
      worshipByType,
    };
  }, [members, families, sectors, offerings, financialRecords, activityLogs, attestations,
      baptisms, sidis, marriages, worshipSchedules, events, prayerRequests, announcements, attendance,
      serviceRequests, aidDistributions]);

  const ageChartData = [
    { name: 'Anak',   value: s.ageGroups['Anak']   || 0 },
    { name: 'Pemuda', value: s.ageGroups['Pemuda'] || 0 },
    { name: 'Dewasa', value: s.ageGroups['Dewasa'] || 0 },
    { name: 'Lansia', value: s.ageGroups['Lansia'] || 0 },
  ];

  const nav = (page: string) => onNavigate && onNavigate(page);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Selamat Pagi' : hour < 15 ? 'Selamat Siang' : hour < 18 ? 'Selamat Sore' : 'Selamat Malam';

  const actIcon = (action: string) => {
    if (action.includes('Menambahkan') || action.includes('tambah')) return { bg: 'rgba(22,163,74,0.1)', color: '#16a34a', Icon: UserPlus };
    if (action.includes('Mengubah')    || action.includes('ubah'))   return { bg: 'rgba(26,119,163,0.1)', color: '#1A77A3',  Icon: Pencil };
    if (action.includes('Menghapus')   || action.includes('hapus'))  return { bg: 'rgba(239,68,68,0.1)',  color: '#ef4444',  Icon: Trash2 };
    return { bg: '#f8fafc', color: '#94a3b8', Icon: Activity };
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts), now = new Date();
    const diffM = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffM < 1)  return 'Baru saja';
    if (diffM < 60) return `${diffM} menit lalu`;
    const diffH = Math.floor(diffM / 60);
    if (diffH < 24) return `${diffH} jam lalu`;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };

  const worshipTypeColor: Record<string, { bg: string; color: string }> = {
    'Minggu':     { bg: '#f0f7fb',               color: '#1A77A3' },
    'Keluarga':   { bg: 'rgba(124,58,237,0.08)', color: '#7c3aed' },
    'PJJ':        { bg: 'rgba(26,119,163,0.08)',  color: '#1A77A3' },
    'Kategorial': { bg: 'rgba(22,163,74,0.08)',  color: '#16a34a' },
    'Khusus':     { bg: 'rgba(225,29,72,0.08)',  color: '#e11d48' },
  };

  const eventTypeEmoji: Record<string, string> = {
    'Ibadah': '⛪', 'Persekutuan': '🤝', 'Retreat': '🏕️',
    'Seminar': '📖', 'Pelayanan': '❤️', 'Lainnya': '📅',
  };

  return (
    <div className="space-y-6 max-w-full">

      {/* ══ HERO BANNER ══════════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-2xl p-6"
        style={{ background: '#0f2d41', boxShadow: '0 8px 32px rgba(6,95,70,0.25)' }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle,#f0ede5,transparent)' }} />
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle,rgba(255,255,255,0.8) 1px,transparent 1px)', backgroundSize: '22px 22px' }} />
        </div>
        <div className="relative">
          <div className="flex items-start justify-between flex-wrap gap-5 mb-5">
            <div>
              <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '22px', fontWeight: 800, color: 'white', lineHeight: 1.2, marginBottom: '4px' }}>
                {greeting}, {currentUser?.name?.split(' ')[0] || 'Admin'} 👋
              </h1>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)' }}>
                {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              {s.birthdayToday > 0 && (
                <div onClick={() => setActiveKPI('birthdays')}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full cursor-pointer transition-all hover:scale-105"
                  style={{ background: 'rgba(255,239,178,0.2)', border: '1px solid rgba(255,239,178,0.3)' }}>
                  <span>🎂</span>
                  <span style={{ fontSize: '11.5px', color: '#f0ede5', fontWeight: 600 }}>{s.birthdayToday} jemaat berulang tahun hari ini!</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {[
                { label: 'Total Jemaat',   value: s.totalMembers,    icon: Users,  page: 'members' },
                { label: 'Total Keluarga', value: s.totalFamilies,   icon: Home,   page: 'families' },
                { label: 'Sektor Aktif',   value: s.totalSectors,    icon: MapPin, page: 'sectors' },
                { label: 'Ibadah Minggu Ini', value: s.worshipThisWeek, icon: Church, page: 'worship-schedules' },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} onClick={() => nav(item.page)}
                    className="text-center px-4 py-3 rounded-2xl cursor-pointer transition-all hover:scale-105"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', minWidth: '88px' }}>
                    <Icon className="w-4 h-4 mx-auto mb-1" style={{ color: '#f0ede5' }} />
                    <p style={{ fontSize: '22px', fontWeight: 800, color: 'white', lineHeight: 1, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{item.value}</p>
                    <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginTop: '3px' }}>{item.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Quick Actions */}
          <div className="flex gap-2 flex-wrap">
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', alignSelf: 'center', marginRight: '4px' }}>Aksi cepat:</p>
            {[
              { label: '+ Tambah Jemaat',     page: 'members' },
              { label: '💰 Catat Persembahan', page: 'offerings' },
              { label: '📢 Buat Pengumuman',   page: 'announcements' },
              { label: '📅 Jadwal Ibadah',     page: 'worship-schedules' },
            ].map(item => (
              <button key={item.page} onClick={() => nav(item.page)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:scale-105 active:scale-95"
                style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.18)' }}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══ KPI ROW 1 ════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Tidak Aktif" value={s.tidakAktif} sub="jemaat tidak aktif"
          icon={AlertCircle} gradient="#f59e0b" trend={{ value: `${s.totalMembers > 0 ? ((s.tidakAktif/s.totalMembers)*100).toFixed(0) : 0}% dari total`, up: false }}
          onClick={() => nav('members')} />
        <KPICard label="Atestasi Pending" value={s.pendingAttestations} sub="menunggu proses"
          icon={FileText} gradient="#1A77A3" trend={{ value: `${s.totalAttestations} total`, up: false }}
          onClick={() => setActiveKPI('attestations')} />
        <KPICard label="Persembahan Bulan Ini" value={formatRp(s.offeringsThisMonth)} sub={`${offerings.length} transaksi`}
          icon={DollarSign} gradient="linear-gradient(135deg,#1A77A3,#2d9cdb)"
          trend={{ value: 'Bulan ini', up: true }} onClick={() => nav('church-finance')} />
        <KPICard label="Saldo Kas Gereja" value={formatRp(s.finIncome - s.finExpense)} sub="pemasukan – pengeluaran"
          icon={TrendingUp} gradient="#3a7fa0" trend={{ value: 'Total bersih', up: s.finIncome >= s.finExpense }}
          onClick={() => nav('church-finance')} />
      </div>

      {/* ══ KPI ROW 2 ════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Jadwal Ibadah Mendatang" value={s.worshipThisWeek} sub="dalam 7 hari ke depan"
          icon={Church} gradient="#7c3aed" trend={{ value: 'Minggu ini', up: true }}
          onClick={() => nav('worship-schedules')} />
        <KPICard label="Acara Mendatang" value={s.eventsThisWeek} sub="dalam 7 hari ke depan"
          icon={Calendar} gradient="#0891b2" trend={{ value: '7 hari', up: true }}
          onClick={() => nav('events')} />
        <KPICard label="Layanan Kasih Pending" value={s.srPending} sub={`${s.srTotal} total pengajuan`}
          icon={HandHeart} gradient="#e11d48" trend={{ value: s.srDone > 0 ? `${s.srDone} selesai` : 'Perlu tindak lanjut', up: s.srDone > s.srPending }}
          onClick={() => nav('service-requests')} />
        <KPICard label="Pengumuman Aktif" value={(announcements || []).filter(a => a.isActive).length} sub="sedang berjalan"
          icon={Megaphone} gradient="#1A77A3" trend={{ value: 'Aktif', up: true }}
          onClick={() => nav('announcements')} />
      </div>

      {/* ══ MODUL 1: ADMINISTRASI & KEANGGOTAAN ════════════════════════════════ */}
      <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <ModuleHeader icon={Users} title="Administrasi & Keanggotaan" subtitle="Modul 1 · Data lengkap jemaat & keluarga"
          gradient="#1A77A3" action="Database Warga" onAction={() => nav('members')} />
        <div className="flex gap-3 flex-wrap mb-5">
          <StatChip label="Jemaat Aktif"   value={s.aktif}      color="#1A77A3" bg="#f0f7fb" icon={Users}         trend={`${s.totalMembers > 0 ? ((s.aktif / s.totalMembers) * 100).toFixed(0) : 0}% dari total`} />
          <StatChip label="Pindah"         value={s.pindah}     color="#3b82f6" bg="#eff6ff" icon={ArrowUpRight} />
          <StatChip label="Meninggal"      value={s.meninggal}  color="#64748b" bg="#f8fafc" icon={Circle} />
          <StatChip label="Tidak Aktif"    value={s.tidakAktif} color="#c2baaa" bg="#fef3c7" icon={AlertCircle} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div>
            <p style={{ fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>Anggota per Sektor</p>
            <MiniHorizontalBar
              data={s.membersBySector.map(sec => ({ name: sec.short, value: sec.count, total: s.totalMembers || 1 }))}
              color="#1A77A3"
            />
          </div>
          <div>
            <p style={{ fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>Distribusi Usia</p>
            <MiniBar data={ageChartData} colors={AGE_COLORS} />
            <div className="space-y-1.5 mt-1">
              {[
                { label: 'Anak (0–12)',    color: '#3b82f6', val: s.ageGroups['Anak']   || 0 },
                { label: 'Pemuda (13–24)', color: '#3a7fa0', val: s.ageGroups['Pemuda'] || 0 },
                { label: 'Dewasa (25–59)', color: '#1A77A3', val: s.ageGroups['Dewasa'] || 0 },
                { label: 'Lansia (60+)',   color: '#c2baaa', val: s.ageGroups['Lansia'] || 0 },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                    <span style={{ fontSize: '11px', color: '#64748b' }}>{item.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#0f172a' }}>{item.val}</span>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>({s.totalMembers > 0 ? ((item.val / s.totalMembers) * 100).toFixed(0) : 0}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>Status & Sakramen</p>
            <div className="space-y-2.5">
              <div className="rounded-xl p-3" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                <p style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 600, marginBottom: '8px' }}>JENIS KELAMIN</p>
                <div className="flex gap-3">
                  <div className="flex-1 text-center"><p style={{ fontSize: '20px', fontWeight: 800, color: '#3b82f6', fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1 }}>{s.genderL}</p><p style={{ fontSize: '10px', color: '#64748b' }}>♂ Laki-laki</p></div>
                  <div className="w-px bg-gray-200" />
                  <div className="flex-1 text-center"><p style={{ fontSize: '20px', fontWeight: 800, color: '#ec4899', fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1 }}>{s.genderP}</p><p style={{ fontSize: '10px', color: '#64748b' }}>♀ Perempuan</p></div>
                </div>
              </div>
              <div className="rounded-xl p-3" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                <p style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 600, marginBottom: '8px' }}>STATUS KEANGGOTAAN</p>
                {Object.entries(s.byMemberType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between mb-1.5 last:mb-0">
                    <span style={{ fontSize: '11.5px', color: '#475569' }}>{type}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{count}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl p-3" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                <p style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 600, marginBottom: '8px' }}>SAKRAMEN {new Date().getFullYear()}</p>
                {[
                  { icon: Baby,   label: 'Baptisan',   val: s.baptismsThisYear,  pending: s.baptismPending, color: '#3b82f6' },
                  { icon: Shield, label: 'Sidi',        val: s.sidisThisYear,     pending: s.sidiPending,    color: '#3a7fa0' },
                  { icon: Heart,  label: 'Pernikahan',  val: s.marriagesThisYear, pending: 0,                color: '#ec4899' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between mb-1.5 last:mb-0">
                    <div className="flex items-center gap-1.5">
                      <item.icon style={{ width: 12, height: 12, color: item.color }} />
                      <span style={{ fontSize: '11.5px', color: '#475569' }}>{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{item.val}</span>
                      {item.pending > 0 && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: '#fef3c7', color: '#9c9486' }}>{item.pending} terjadwal</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Pelkat breakdown */}
        {(() => {
          const PELKAT_KEYS = ['PA','PT','GP','PKP','PKB','PKLU'];
          const PELKAT_LABELS: Record<string,string> = { PA:'Pelayanan Anak', PT:'Persekutuan Teruna', GP:'Gerakan Pemuda', PKP:'Kaum Perempuan', PKB:'Kaum Bapak', PKLU:'Lanjut Usia' };
          const PELKAT_COLORS = ['#16a34a','#f59e0b','#3b82f6','#a855f7','#0891b2','#f97316'];
          const pelkatData = PELKAT_KEYS.map(k => ({
            key: k, label: PELKAT_LABELS[k],
            value: members.filter(m => m.pelkatStatus && m.pelkatStatus.toUpperCase().includes(k)).length,
          })).filter(d => d.value > 0);
          if (pelkatData.length === 0) return null;
          return (
            <div className="mt-5 pt-4 border-t border-gray-50">
              <p style={{ fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>Distribusi Unit Kategorial (Pelkat)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {pelkatData.map((p, i) => (
                  <div key={p.key} className="text-center p-3 rounded-xl" style={{ background: `${PELKAT_COLORS[i % PELKAT_COLORS.length]}10`, border: `1px solid ${PELKAT_COLORS[i % PELKAT_COLORS.length]}25` }}>
                    <p style={{ fontSize: '22px', fontWeight: 800, color: PELKAT_COLORS[i % PELKAT_COLORS.length], lineHeight: 1 }}>{p.value}</p>
                    <p style={{ fontSize: '10px', fontWeight: 700, color: PELKAT_COLORS[i % PELKAT_COLORS.length], marginTop: '4px' }}>{p.key}</p>
                    <p style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>{p.label}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-50 flex-wrap">
          {[
            { label: 'Data Warga', page: 'members' }, { label: 'Data Keluarga', page: 'families' },
            { label: 'Sektor Pelayanan', page: 'sectors' }, { label: 'Atestasi', page: 'attestations' },
            { label: 'Sakramen', page: 'sacraments' },
          ].map(item => (
            <button key={item.page} onClick={() => nav(item.page)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors hover:bg-blue-50" style={{ fontSize: '12px', fontWeight: 500, color: '#3b82f6', background: '#eff6ff' }}>
              {item.label} <ChevronRight className="w-3 h-3" />
            </button>
          ))}
        </div>
      </div>

      {/* ══ MODUL 2: PERIBADAHAN & KEGIATAN ════════════════════════════════════ */}
      <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <ModuleHeader icon={Church} title="Peribadahan & Kegiatan" subtitle="Modul 2 · Jadwal ibadah, acara, dan kehadiran"
          gradient="#7c3aed" action="Jadwal Ibadah" onAction={() => nav('worship-schedules')} />

        <div className="flex gap-3 flex-wrap mb-5">
          <StatChip label="Total Jadwal Ibadah" value={worshipSchedules?.length || 0}  color="#7c3aed" bg="rgba(124,58,237,0.08)" icon={Church}   trend="Semua waktu" />
          <StatChip label="Ibadah Mendatang"    value={s.worshipThisWeek}              color="#0891b2" bg="rgba(8,145,178,0.08)"  icon={Calendar} trend="7 hari ke depan" />
          <StatChip label="Kehadiran Bulan Ini" value={s.attendanceThisMonth}          color="#16a34a" bg="rgba(22,163,74,0.08)"  icon={CheckCircle2} trend="Record hadir" />
          <StatChip label="Total Acara"         value={events?.length || 0}            color="#1A77A3" bg="rgba(26,119,163,0.08)"  icon={Calendar} trend="Semua waktu" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Jadwal Ibadah Mendatang */}
          <div>
            <p style={{ fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>Jadwal Ibadah Mendatang</p>
            {s.upcomingWorship.length === 0 ? (
              <div className="rounded-xl p-6 text-center" style={{ background: '#f8fafc', border: '1px dashed #e2e8f0' }}>
                <Church className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p style={{ fontSize: '13px', color: '#94a3b8' }}>Belum ada jadwal ibadah mendatang</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {s.upcomingWorship.map((w, i) => {
                  const wColor = worshipTypeColor[w.type] || worshipTypeColor['Minggu'];
                  const date   = new Date(w.date);
                  const isToday = date.toDateString() === new Date().toDateString();
                  return (
                    <div key={w.id || i} onClick={() => nav('worship-schedules')}
                      className="flex items-start gap-3 p-3.5 rounded-xl cursor-pointer hover:shadow-sm transition-all"
                      style={{ background: isToday ? 'rgba(124,58,237,0.06)' : '#f8fafc', border: `1px solid ${isToday ? 'rgba(124,58,237,0.2)' : '#f1f5f9'}` }}>
                      <div className="flex-shrink-0 text-center w-12">
                        <p style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{date.getDate()}</p>
                        <p style={{ fontSize: '10px', color: '#94a3b8' }}>{date.toLocaleDateString('id-ID', { month: 'short' })}</p>
                      </div>
                      <div className="w-px self-stretch bg-gray-200 mx-1" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                            style={{ background: wColor.bg, color: wColor.color }}>{w.type}</span>
                          {isToday && <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(124,58,237,0.15)', color: '#7c3aed' }}>Hari Ini</span>}
                        </div>
                        <p style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }} className="truncate">
                          {w.sermon_theme || w.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap" style={{ fontSize: '11px', color: '#64748b' }}>
                          {w.time && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{w.time}</span>}
                          {w.preacher && <><span>·</span><span>Pk. {w.preacher}</span></>}
                          {w.location && <><span>·</span><span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{w.location}</span></>}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Acara Mendatang */}
          <div>
            <p style={{ fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>Acara & Kalender (7 Hari)</p>
            {s.upcomingEvents.length === 0 ? (
              <div className="rounded-xl p-6 text-center" style={{ background: '#f8fafc', border: '1px dashed #e2e8f0' }}>
                <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p style={{ fontSize: '13px', color: '#94a3b8' }}>Tidak ada acara dalam 7 hari ke depan</p>
              </div>
            ) : (
              <div className="space-y-2">
                {s.upcomingEvents.map((e, i) => {
                  const date = new Date(e.date);
                  const isToday = date.toDateString() === new Date().toDateString();
                  return (
                    <div key={e.id || i} onClick={() => nav('events')}
                      className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:shadow-sm transition-all"
                      style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-lg"
                        style={{ background: 'rgba(8,145,178,0.08)' }}>
                        {eventTypeEmoji[e.type] || '📅'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }} className="truncate">{e.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5" style={{ fontSize: '11px', color: '#64748b' }}>
                          <span>{isToday ? 'Hari Ini' : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                          {e.time && <><span>·</span><span>{e.time}</span></>}
                          {e.location && <><span>·</span><span className="truncate">{e.location}</span></>}
                        </div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                        style={{ background: 'rgba(8,145,178,0.1)', color: '#0891b2' }}>{e.type}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Kehadiran ringkas */}
            <div className="mt-4 p-3 rounded-xl" style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.15)' }}>
              <p style={{ fontSize: '10.5px', color: '#16a34a', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Statistik Kehadiran</p>
              <div className="flex gap-4">
                <div><p style={{ fontSize: '20px', fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>{s.attendanceThisMonth}</p><p style={{ fontSize: '10px', color: '#64748b' }}>Hadir bulan ini</p></div>
                <div className="w-px bg-green-200" />
                <div><p style={{ fontSize: '20px', fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>{s.attendanceDates}</p><p style={{ fontSize: '10px', color: '#64748b' }}>Total sesi tercatat</p></div>
                <div className="w-px bg-green-200" />
                <div><p style={{ fontSize: '20px', fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>{attendance?.length || 0}</p><p style={{ fontSize: '10px', color: '#64748b' }}>Total record</p></div>
              </div>
            </div>
          </div>
        </div>

        {/* Ibadah by kategori */}
        {Object.keys(s.worshipByType).length > 0 && (
          <div className="mt-5 pt-4 border-t border-gray-50">
            <p style={{ fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>Jadwal Ibadah per Kategori</p>
            <MiniBar
              data={Object.entries(s.worshipByType).map(([name, value]) => ({ name, value: value as number }))}
              colors={['#7c3aed','#1A77A3','#16a34a','#e11d48','#f59e0b','#0891b2']}
            />
          </div>
        )}
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-50 flex-wrap">
          {[
            { label: 'Jadwal Ibadah', page: 'worship-schedules' }, { label: 'E-Warta', page: 'e-warta' },
            { label: 'Liturgi Digital', page: 'liturgy' }, { label: 'Kalender Gerejawi', page: 'events' },
            { label: 'Absensi', page: 'attendance' },
            ].map((item, i) => (
            <button key={item.page} onClick={() => nav(item.page)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors" style={{ fontSize: '12px', fontWeight: 500, color: '#7c3aed', background: 'rgba(124,58,237,0.08)' }}>
              {item.label} <ChevronRight className="w-3 h-3" />
            </button>
          ))}
        </div>
      </div>

      {/* ══ MODUL 3: KEUANGAN & PERSEMBAHAN ════════════════════════════════════ */}
      <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <ModuleHeader icon={DollarSign} title="Keuangan & Persembahan" subtitle="Modul 3 · Persembahan & laporan keuangan gereja"
          gradient="linear-gradient(135deg,#1A77A3,#2d9cdb)" action="Keuangan Gereja" onAction={() => nav('church-finance')} />
        <div className="flex gap-3 flex-wrap mb-5">
          <StatChip label="Total Persembahan" value={formatRp(s.offeringsTotal)}     color="#1A77A3" bg="#f0f7fb" icon={DollarSign}    trend={`${offerings.length} transaksi`} />
          <StatChip label="Bulan Ini"          value={formatRp(s.offeringsThisMonth)} color="#1A77A3" bg="#f0f9ff" icon={TrendingUp} />
          <StatChip label="Total Pemasukan"    value={formatRp(s.finIncome)}          color="#3a7fa0" bg="#f5f3ff" icon={ArrowUpRight} />
          <StatChip label="Total Pengeluaran"  value={formatRp(s.finExpense)}         color="#c2baaa" bg="#fef3c7" icon={ArrowDownRight} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div>
              <p style={{ fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>Tren Persembahan {new Date().getFullYear()}</p>
              <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>Data real per bulan</p>
              <MiniSparkline data={s.monthlyOfferings} color="#1A77A3" />
            </div>
            <div>
              <p style={{ fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>Kas Masuk vs Keluar (6 Bulan)</p>
              <div className="flex items-center gap-4 mb-2">
                <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-3 h-2 rounded-sm inline-block" style={{ background: '#1A77A3' }} />Pemasukan</span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-3 h-2 rounded-sm inline-block" style={{ background: '#ef4444' }} />Pengeluaran</span>
              </div>
              <MiniStackedBar data={s.last6Months} color1="#1A77A3" color2="#ef4444" />
            </div>
          </div>
          <div>
            <p style={{ fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>Ringkasan Keuangan</p>
            <div className="space-y-3">
              <div className="rounded-xl p-3" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                <p style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 600, marginBottom: '8px' }}>NERACA KAS</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5" style={{ fontSize: '11.5px', color: '#475569' }}><ArrowUpRight className="w-3 h-3 text-[#3a7fa0]" />Pemasukan</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#1A77A3' }}>{formatRp(s.finIncome)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5" style={{ fontSize: '11.5px', color: '#475569' }}><ArrowDownRight className="w-3 h-3 text-red-400" />Pengeluaran</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444' }}>{formatRp(s.finExpense)}</span>
                  </div>
                  <div className="h-px bg-gray-200 my-1" />
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#374151' }}>Saldo Bersih</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: s.finIncome >= s.finExpense ? '#1A77A3' : '#ef4444', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{formatRp(s.finIncome - s.finExpense)}</span>
                  </div>
                </div>
              </div>
              {Object.keys(s.offeringsByType).length > 0 && (
                <div className="rounded-xl p-3" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <p style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 600, marginBottom: '8px' }}>JENIS PERSEMBAHAN</p>
                  {Object.entries(s.offeringsByType).slice(0, 4).map(([type, amount]) => (
                    <div key={type} className="flex items-center justify-between mb-1.5 last:mb-0">
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{type}</span>
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#1A77A3' }}>{formatRp(amount as number)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-50 flex-wrap">
          {[
            { label: 'Keuangan Gereja', page: 'church-finance' }, { label: 'Pencatatan Persembahan', page: 'offerings' },
            { label: 'Proyek Pembangunan', page: 'building-projects' },
          ].map(item => (
            <button key={item.page} onClick={() => nav(item.page)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-[#f0f7fb] transition-colors" style={{ fontSize: '12px', fontWeight: 500, color: '#1A77A3', background: '#f0f7fb' }}>
              {item.label} <ChevronRight className="w-3 h-3" />
            </button>
          ))}
        </div>
      </div>

      {/* ══ MODUL 4: DIAKONIA & LAYANAN KASIH ══════════════════════════════════ */}
      <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <ModuleHeader icon={HandHeart} title="Diakonia & Layanan Kasih" subtitle="Modul 4 · Pelayanan kasih & bantuan sosial jemaat"
          gradient="#e11d48" action="Layanan Kasih" onAction={() => nav('service-requests')} />
        <div className="flex gap-3 flex-wrap mb-5">
          <StatChip label="Total Pengajuan" value={s.srTotal}    color="#e11d48" bg="rgba(225,29,72,0.07)"  icon={HandHeart}     trend="Semua waktu" />
          <StatChip label="Menunggu Tindak" value={s.srPending}  color="#f59e0b" bg="rgba(245,158,11,0.07)" icon={AlertCircle}   trend="Perlu perhatian" />
          <StatChip label="Terjadwal"       value={s.srScheduled}color="#0891b2" bg="rgba(8,145,178,0.07)"  icon={Calendar} />
          <StatChip label="Selesai"         value={s.srDone}     color="#16a34a" bg="rgba(22,163,74,0.07)"  icon={CheckCircle2}  trend="Sudah ditangani" />
          <StatChip label="Bantuan Sosial"  value={s.aidTotal}   color="#7c3aed" bg="rgba(124,58,237,0.07)" icon={Package}       trend={`${s.aidPending} pending`} />
          <StatChip label="Bantuan Disalurkan" value={s.aidDone} color="#16a34a" bg="rgba(22,163,74,0.07)"  icon={CheckCircle2} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Donut by jenis layanan */}
          <div>
            <p style={{ fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>Distribusi Jenis Layanan Kasih</p>
            {Object.keys(s.srByType).length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ background: '#f8fafc', border: '1px dashed #e2e8f0' }}>
                <HandHeart className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p style={{ fontSize: '13px', color: '#94a3b8' }}>Belum ada data pengajuan</p>
              </div>
            ) : (
              <div className="flex gap-4 items-center">
                <div style={{ width: 120, flexShrink: 0 }}>
                  <MiniDonut
                    data={Object.entries(s.srByType).map(([name, value]) => ({ name, value: value as number }))}
                    colors={DIAKONIA_COLORS} size={120} centerLabel="Layanan"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  {Object.entries(s.srByType).map(([type, count], i) => (
                    <div key={type} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: DIAKONIA_COLORS[i % DIAKONIA_COLORS.length] }} />
                        <span style={{ fontSize: '11.5px', color: '#475569' }}>{type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{count as number}</span>
                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>({s.srTotal > 0 ? Math.round(((count as number) / s.srTotal) * 100) : 0}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Permintaan terbaru */}
          <div>
            <p style={{ fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>Permintaan Layanan Terbaru</p>
            {s.recentSR.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ background: '#f8fafc', border: '1px dashed #e2e8f0' }}>
                <Stethoscope className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p style={{ fontSize: '13px', color: '#94a3b8' }}>Belum ada permintaan layanan</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {s.recentSR.map((sr: any, i: number) => {
                  const stCfg: Record<string,{bg:string;color:string;label:string}> = {
                    Pending:   { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b', label: 'Pending' },
                    Scheduled: { bg: 'rgba(8,145,178,0.1)',   color: '#0891b2', label: 'Terjadwal' },
                    Completed: { bg: 'rgba(22,163,74,0.1)',   color: '#16a34a', label: 'Selesai' },
                    Cancelled: { bg: 'rgba(100,116,139,0.1)', color: '#64748b', label: 'Dibatalkan' },
                  };
                  const sc = stCfg[sr.status] || stCfg.Pending;
                  return (
                    <div key={sr.id || i} onClick={() => nav('service-requests')}
                      className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:shadow-sm transition-all"
                      style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: sc.bg }}>
                        <HandHeart className="w-4 h-4" style={{ color: sc.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }} className="truncate">{sr.requestedBy || sr.type}</p>
                        <p style={{ fontSize: '11px', color: '#94a3b8' }}>{sr.type} · {new Date(sr.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-50 flex-wrap">
          {[
            { label: 'Layanan Kasih', page: 'service-requests' },
            { label: 'Bantuan Sosial', page: 'aid-distribution' },
            { label: 'Pokok Doa', page: 'prayers' },
          ].map(item => (
            <button key={item.page} onClick={() => nav(item.page)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors" style={{ fontSize: '12px', fontWeight: 500, color: '#e11d48', background: 'rgba(225,29,72,0.07)' }}>
              {item.label} <ChevronRight className="w-3 h-3" />
            </button>
          ))}
        </div>
      </div>

      {/* ══ AKTIVITAS TERBARU + PENGUMUMAN & DOA ════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Aktivitas Terbaru */}
        <div className="lg:col-span-3 rounded-2xl p-6" style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div className="flex items-center justify-between mb-4 pb-4" style={{ borderBottom: '1.5px solid #f1f5f9' }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#1A77A3' }}>
                <Activity className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Aktivitas Terbaru</h2>
                <p style={{ fontSize: '11.5px', color: '#94a3b8' }}>6 aktivitas terakhir sistem</p>
              </div>
            </div>
            <button onClick={() => nav('activity')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
              style={{ background: '#f0f7fb', color: '#1A77A3' }}>
              Lihat Semua <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {s.recentActivities.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="w-8 h-8 mx-auto mb-2 text-gray-200" />
              <p style={{ fontSize: '13px', color: '#94a3b8' }}>Belum ada aktivitas tercatat</p>
            </div>
          ) : (
            <div className="space-y-1">
              {s.recentActivities.map((log, i) => {
                const cfg = actIcon(log.action);
                const Icon = cfg.Icon;
                return (
                  <div key={log.id || i} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                    <div className="relative flex-shrink-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: cfg.bg }}>
                        <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                      </div>
                      {i < s.recentActivities.length - 1 && (
                        <div className="absolute left-1/2 top-8 w-px h-3 -translate-x-1/2 bg-gray-100" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <p style={{ fontSize: '12.5px', color: '#374151', lineHeight: 1.4 }}>
                          <span className="font-semibold text-gray-900">{log.userName}</span>
                          {' '}<span style={{ color: cfg.color, fontWeight: 600 }}>{log.action}</span>
                          {' '}<span className="font-medium">{log.entityName}</span>
                        </p>
                        <span style={{ fontSize: '10.5px', color: '#94a3b8', flexShrink: 0 }}>{formatTimestamp(log.timestamp)}</span>
                      </div>
                      {log.details && <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{log.details}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pengumuman & Doa */}
        <div className="lg:col-span-2 space-y-4">
          {/* Pengumuman Aktif */}
          <div className="rounded-2xl p-5" style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(217,119,6,0.1)' }}>
                  <Bell className="w-3.5 h-3.5 text-[#1A77A3]" />
                </div>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>Pengumuman Aktif</span>
              </div>
              <button onClick={() => nav('announcements')} className="text-xs font-medium" style={{ color: '#1A77A3' }}>Semua →</button>
            </div>
            {s.activeAnnouncements.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>Tidak ada pengumuman aktif</p>
            ) : (
              <div className="space-y-2">
                {s.activeAnnouncements.map((ann, i) => {
                  const pc = ANNOUNCEMENT_PRIORITY[ann.priority] || ANNOUNCEMENT_PRIORITY.normal;
                  return (
                    <div key={ann.id || i} onClick={() => nav('announcements')}
                      className="p-3 rounded-xl cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ background: pc.bg, border: `1px solid ${pc.color}20` }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }} className="line-clamp-1">{ann.title}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0"
                          style={{ background: `${pc.color}15`, color: pc.color }}>{pc.label}</span>
                      </div>
                      <p style={{ fontSize: '11px', color: '#64748b' }}>
                        {ann.authorName} · {new Date(ann.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Permintaan Doa */}
          <div className="rounded-2xl p-5" style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(225,29,72,0.1)' }}>
                  <BookOpen className="w-3.5 h-3.5 text-rose-600" />
                </div>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>Permintaan Doa</span>
              </div>
              <button onClick={() => nav('prayers')} className="text-xs font-medium" style={{ color: '#e11d48' }}>Semua →</button>
            </div>
            {s.activePrayersList.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>Tidak ada permintaan doa aktif</p>
            ) : (
              <div className="space-y-2">
                {s.activePrayersList.map((prayer, i) => {
                  const member = members.find(m => m.id === prayer.memberId);
                  const name = member ? (member.fullName || `${member.firstName} ${member.lastName}`) : 'Jemaat';
                  return (
                    <div key={prayer.id || i} onClick={() => nav('prayers')}
                      className="flex items-start gap-2.5 p-3 rounded-xl cursor-pointer hover:bg-rose-50 transition-colors"
                      style={{ background: '#fdf2f4', border: '1px solid rgba(225,29,72,0.1)' }}>
                      <span className="text-base flex-shrink-0">{PRAYER_CATEGORY_EMOJI[prayer.category] || '🙏'}</span>
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{name}</p>
                        <p style={{ fontSize: '11px', color: '#64748b' }} className="line-clamp-1">{prayer.request}</p>
                        <span className="text-[10px] font-medium" style={{ color: '#e11d48' }}>{prayer.category}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {s.activePrayers > 3 && (
              <p style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', marginTop: '8px' }}>
                +{s.activePrayers - 3} permintaan doa lainnya
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ══ QUICK NAVIGATION PANEL ══════════════════════════════════════════════ */}
      <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div className="flex items-center gap-3 mb-4 pb-4" style={{ borderBottom: '1.5px solid #f1f5f9' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#0f2d41' }}>
            <Zap className="w-4 h-4 text-[#f0ede5]" />
          </div>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Navigasi Cepat</h2>
            <p style={{ fontSize: '11.5px', color: '#94a3b8' }}>Akses langsung ke semua modul</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {QUICK_NAV.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.page} onClick={() => nav(item.page)}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97]"
                style={{ background: item.bg, border: `1px solid ${item.color}20` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${item.color}18` }}>
                  <span className="text-xl">{item.emoji}</span>
                </div>
                <p style={{ fontSize: '10.5px', fontWeight: 700, color: item.color, textAlign: 'center', lineHeight: 1.3 }}>
                  {item.label}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Detail Drawer */}
      <KPIDetailDrawer
        activeKPI={activeKPI} onClose={() => setActiveKPI(null)}
        members={members} attestations={attestations} sectors={sectors}
      />
    </div>
  );
}
