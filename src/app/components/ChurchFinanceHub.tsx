import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useApp } from '../context/AppContext';
import { useDraggable } from '../../lib/useDraggable';
import {
  Landmark, TrendingUp, TrendingDown, Wallet, Plus, X, Search,
  FileText, Printer, ChevronLeft, ChevronRight,
  Pencil, Trash2, AlertCircle, ArrowUpRight, ArrowDownRight,
  BarChart3, Calendar, DollarSign, CreditCard,
  Download, Building2, Receipt, BookOpen, Coins,
  FileSpreadsheet, CheckCircle2, Clock, ShoppingCart,
  PlusCircle, History, ChevronDown, BadgeCheck, Scale,
  ArrowUp, ArrowDown, ArrowUpDown
} from 'lucide-react';
import { useSortable } from '../../hooks/useSortable';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColResizeHandle } from './ui/resizable-th';
import { LaporanKeuanganTab } from './LaporanKeuanganTab';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { PettyCash, PcTopUp, BankAccount, BankAccountType, Budget } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────
const formatRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
const compactRp = (n: number) => {
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(2)}M`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toFixed(1)}Jt`;
  return `Rp ${n.toLocaleString('id-ID')}`;
};
const MONTHS     = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
const MONTH_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const PAGE_SIZE  = 12;
const PC_PAGE_SIZE = 15;

// ── Types ────────────────────────────────────────────────────────────────────
interface TxFormData {
  date: string; type: 'income'|'expense'; category: string;
  amount: string; description: string; reference: string; account: string;
}

const PC_SOURCES_STATIC = ['Kas Majelis', 'Donasi Khusus', 'Lainnya'];

const TX_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  date: 110, type: 100, category: 130, description: 220, reference: 120, recordedBy: 130, amount: 130, aksi: 90,
};
const PC_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  date: 110, category: 130, description: 220, payTo: 140, receiptNo: 120, status: 100, amount: 130, aksi: 90,
};


// ── SVG Charts ────────────────────────────────────────────────────────────────
function MonthlyBarChart({ data }: { data: { name: string; income: number; expense: number }[] }) {
  const W = 580, H = 180;
  const pad = { t:10, r:10, b:30, l:54 };
  const iW = W-pad.l-pad.r, iH = H-pad.t-pad.b;
  const maxV = Math.max(...data.flatMap(d=>[d.income,d.expense]),1);
  const slotW = iW/data.length, groupW=slotW*0.6, barW=groupW/2-1, groupOff=(slotW-groupW)/2;
  const f=(n:number)=>n.toFixed(1), yOf=(v:number)=>pad.t+(1-v/maxV)*iH;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {[0,.25,.5,.75,1].map((t,i)=>{const y=pad.t+t*iH,v=maxV*(1-t);return(
        <g key={i}><line x1={pad.l} y1={y} x2={W-pad.r} y2={y} stroke="#f1f5f9" strokeWidth={1}/>
        <text x={pad.l-4} y={y+4} textAnchor="end" fontSize={8} fill="#94a3b8">{v>=1e6?`${(v/1e6).toFixed(0)}jt`:v>=1e3?`${(v/1e3).toFixed(0)}rb`:v.toFixed(0)}</text></g>);
      })}
      {data.map((d,i)=>{
        const x=pad.l+i*slotW+groupOff, iH2=d.income>0?(d.income/maxV)*iH:0, eH2=d.expense>0?(d.expense/maxV)*iH:0, r=3;
        return(<g key={i}>
          {iH2>0&&<path d={`M${f(x)},${f(yOf(d.income)+iH2)} L${f(x)},${f(yOf(d.income)+r)} Q${f(x)},${f(yOf(d.income))} ${f(x+r)},${f(yOf(d.income))} L${f(x+barW-r)},${f(yOf(d.income))} Q${f(x+barW)},${f(yOf(d.income))} ${f(x+barW)},${f(yOf(d.income)+r)} L${f(x+barW)},${f(yOf(d.income)+iH2)} Z`} fill="#1A77A3"/>}
          {eH2>0&&<path d={`M${f(x+barW+2)},${f(yOf(d.expense)+eH2)} L${f(x+barW+2)},${f(yOf(d.expense)+r)} Q${f(x+barW+2)},${f(yOf(d.expense))} ${f(x+barW+r+2)},${f(yOf(d.expense))} L${f(x+2*barW+1)},${f(yOf(d.expense))} Q${f(x+2*barW+3)},${f(yOf(d.expense))} ${f(x+2*barW+3)},${f(yOf(d.expense)+r)} L${f(x+2*barW+3)},${f(yOf(d.expense)+eH2)} Z`} fill="#ef4444"/>}
          <text x={pad.l+i*slotW+slotW/2} y={H-7} textAnchor="middle" fontSize={9} fill="#94a3b8">{d.name}</text>
        </g>);
      })}
      <g transform={`translate(${pad.l+4},${H-10})`}>
        <rect x={0} y={-7} width={8} height={8} fill="#1A77A3" rx={2}/><text x={12} y={1} fontSize={9} fill="#64748b">Pemasukan</text>
        <rect x={78} y={-7} width={8} height={8} fill="#ef4444" rx={2}/><text x={90} y={1} fontSize={9} fill="#64748b">Pengeluaran</text>
      </g>
    </svg>
  );
}

function BalanceLine({ data }: { data: { name: string; balance: number }[] }) {
  if(data.length<2) return null;
  const W=520,H=110,pad={t:10,r:10,b:26,l:54};
  const iW=W-pad.l-pad.r,iH=H-pad.t-pad.b;
  const vals=data.map(d=>d.balance),minV=Math.min(...vals),maxV=Math.max(...vals)||1;
  const range=Math.max(maxV-minV,1);
  const xOf=(i:number)=>pad.l+(i/(data.length-1))*iW;
  const yOf=(v:number)=>pad.t+(1-(v-minV)/range)*iH;
  const f=(n:number)=>n.toFixed(1);
  const pts=data.map((d,i)=>({x:xOf(i),y:yOf(d.balance)}));
  const line=pts.map(({x,y},i)=>`${i===0?'M':'L'}${f(x)},${f(y)}`).join(' ');
  return(
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id="blg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1A77A3" stopOpacity="0.18"/><stop offset="100%" stopColor="#1A77A3" stopOpacity="0.01"/></linearGradient></defs>
      {[0,.5,1].map((t,i)=>{const y=pad.t+t*iH,v=minV+(1-t)*range;return(
        <g key={i}><line x1={pad.l} y1={y} x2={W-pad.r} y2={y} stroke="#f1f5f9" strokeWidth={1}/>
        <text x={pad.l-4} y={y+4} textAnchor="end" fontSize={8} fill="#94a3b8">{v>=1e6?`${(v/1e6).toFixed(0)}jt`:v.toFixed(0)}</text></g>);
      })}
      <path d={`${line} L${f(pts[pts.length-1].x)},${H-pad.b} L${f(pts[0].x)},${H-pad.b} Z`} fill="url(#blg2)"/>
      <path d={line} fill="none" stroke="#1A77A3" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>
      {pts.map(({x,y},i)=><circle key={i} cx={x} cy={y} r={3} fill="#1A77A3" stroke="white" strokeWidth={1.5}/>)}
      {data.map((d,i)=><text key={i} x={xOf(i)} y={H-6} textAnchor="middle" fontSize={9} fill="#94a3b8">{d.name}</text>)}
    </svg>
  );
}

// ── Transaction Form ──────────────────────────────────────────────────────────
function TransactionForm({ initial, onSave, onClose, bankAccounts }: { initial?: Partial<TxFormData>; onSave:(d:TxFormData)=>void; onClose:()=>void; bankAccounts: BankAccount[] }) {
  const { getMasterDataByCategory } = useApp();
  const { offset, onMouseDown } = useDraggable();
  const now=new Date().toISOString().split('T')[0];
  const defaultAccount = bankAccounts[0]?.type || 'Operasional';
  const [form,setForm]=useState<TxFormData>({ date:initial?.date||now, type:initial?.type||'income', category:initial?.category||'', amount:initial?.amount||'', description:initial?.description||'', reference:initial?.reference||'', account:initial?.account||defaultAccount });
  const [err,setErr]=useState('');
  const INCOME_CATS=getMasterDataByCategory('kategori_keuangan_masuk').map(m=>m.value);
  const EXPENSE_CATS=getMasterDataByCategory('kategori_keuangan_keluar').map(m=>m.value);
  const cats=form.type==='income'?INCOME_CATS:EXPENSE_CATS;
  const handle=(field:keyof TxFormData,val:string)=>{setForm(p=>({...p,[field]:val}));setErr('');};
  const submit=()=>{
    if(!form.date||!form.category||!form.amount||!form.description){setErr('Semua field wajib diisi.');return;}
    const amt=parseFloat(form.amount.replace(/\D/g,''));
    if(isNaN(amt)||amt<=0){setErr('Jumlah tidak valid.');return;}
    onSave({...form,amount:String(amt)});
  };
  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.45)'}} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden bg-white" onClick={e=>e.stopPropagation()} style={{transform:`translate(${offset.x}px,${offset.y}px)`}}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDown}>
          <h3 className="font-semibold text-white" style={{fontSize:'15px'}}>{initial?.date?'Edit Transaksi':'Tambah Transaksi Baru'}</h3>
          <button onClick={onClose} data-tooltip="Tutup" className="text-white/60 hover:text-white transition-colors"><X className="w-4 h-4"/></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(['income','expense'] as const).map(t=>(
              <button key={t} onClick={()=>handle('type',t)} className="py-2.5 rounded-xl border-2 transition-all"
                style={{borderColor:form.type===t?(t==='income'?'#1A77A3':'#ef4444'):'#e2e8f0',background:form.type===t?(t==='income'?'#f0fdf4':'#fef2f2'):'#fff',color:form.type===t?(t==='income'?'#1A77A3':'#ef4444'):'#64748b',fontSize:'13px',fontWeight:600}}>
                {t==='income'?'↑ Kas Masuk':'↓ Kas Keluar'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Tanggal</label>
              <input type="date" value={form.date} onChange={e=>handle('date',e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/>
            </div>
            <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Rekening</label>
              <select autoFocus value={form.account} onChange={e=>handle('account',e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}>
                {bankAccounts.map(a=><option key={a.id} value={a.type}>{a.type} – {a.bankName}</option>)}
              </select>
            </div>
          </div>
          <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Kategori</label>
            <select value={form.category} onChange={e=>handle('category',e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}>
              <option value="">-- Pilih Kategori --</option>{cats.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Jumlah (Rp)</label>
            <input type="number" value={form.amount} onChange={e=>handle('amount',e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/>
          </div>
          <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Keterangan</label>
            <textarea value={form.description} onChange={e=>handle('description',e.target.value)} rows={2} placeholder="Keterangan transaksi..." className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3] resize-none" style={{borderColor:'#e2e8f0'}}/>
          </div>
          <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>No. Referensi <span style={{fontWeight:400,color:'#94a3b8'}}>(opsional)</span></label>
            <input type="text" value={form.reference} onChange={e=>handle('reference',e.target.value)} placeholder="No. bukti / referensi" className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/>
          </div>
          {err&&<div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{background:'#fef2f2',color:'#dc2626'}}><AlertCircle className="w-4 h-4 flex-shrink-0"/>{err}</div>}
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}>Batal</button>
          <button onClick={submit} className="px-5 py-2 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90" style={{background:'#1A77A3'}}>Simpan</button>
        </div>
      </div>
    </div>
  );
}

// ── Petty Cash Form ──────────────────────────────────────────────────────────
interface PCFormData { date:string; category:string; description:string; amount:string; payTo:string; receiptNo:string; status:string; }
function PettyCashForm({ initial, onSave, onClose }: { initial?: Partial<PCFormData>; onSave:(d:PCFormData)=>void; onClose:()=>void }) {
  const { getMasterDataByCategory } = useApp();
  const { offset, onMouseDown } = useDraggable();
  const PC_CATEGORIES = getMasterDataByCategory('kategori_kas_kecil').map(m=>m.value);
  const _pcStatus = getMasterDataByCategory('status_kas_kecil').map(m=>m.value);
  const PC_STATUS = _pcStatus.length ? _pcStatus : ['Lunas','Pending'];
  const now=new Date().toISOString().split('T')[0];
  const [form,setForm]=useState<PCFormData>({ date:initial?.date||now, category:initial?.category||'', description:initial?.description||'', amount:initial?.amount||'', payTo:initial?.payTo||'', receiptNo:initial?.receiptNo||'', status:initial?.status||'Lunas' });
  const [err,setErr]=useState('');
  const h=(k:keyof PCFormData,v:string)=>{setForm(p=>({...p,[k]:v}));setErr('');};
  const submit=()=>{
    if(!form.date||!form.category||!form.amount||!form.description){setErr('Tanggal, kategori, keterangan, dan jumlah wajib diisi.');return;}
    const amt=parseFloat(form.amount);
    if(isNaN(amt)||amt<=0){setErr('Jumlah tidak valid.');return;}
    onSave({...form,amount:String(amt)});
  };
  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.45)'}} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden bg-white" onClick={e=>e.stopPropagation()} style={{transform:`translate(${offset.x}px,${offset.y}px)`}}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDown}>
          <h3 className="font-semibold text-white" style={{fontSize:'15px'}}>{initial?.date?'Edit Kas Kecil':'Tambah Pengeluaran Kas Kecil'}</h3>
          <button onClick={onClose} data-tooltip="Tutup" className="text-white/60 hover:text-white transition-colors"><X className="w-4 h-4"/></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Tanggal</label>
              <input type="date" value={form.date} onChange={e=>h('date',e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/>
            </div>
            <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Status</label>
              <select value={form.status} onChange={e=>h('status',e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}>
                {PC_STATUS.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Kategori</label>
            <select value={form.category} onChange={e=>h('category',e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}>
              <option value="">-- Pilih Kategori --</option>{PC_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Keterangan</label>
            <textarea value={form.description} onChange={e=>h('description',e.target.value)} rows={2} placeholder="Detail pengeluaran..." className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3] resize-none" style={{borderColor:'#e2e8f0'}}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Jumlah (Rp)</label>
              <input type="number" value={form.amount} onChange={e=>h('amount',e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/>
            </div>
            <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Dibayar Ke</label>
              <input type="text" value={form.payTo} onChange={e=>h('payTo',e.target.value)} placeholder="Nama penerima" className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/>
            </div>
          </div>
          <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>No. Bukti / Kwitansi <span style={{fontWeight:400,color:'#94a3b8'}}>(opsional)</span></label>
            <input type="text" value={form.receiptNo} onChange={e=>h('receiptNo',e.target.value)} placeholder="KK/001/III/26" className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/>
          </div>
          {err&&<div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{background:'#fef2f2',color:'#dc2626'}}><AlertCircle className="w-4 h-4 flex-shrink-0"/>{err}</div>}
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}>Batal</button>
          <button onClick={submit} className="px-5 py-2 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90" style={{background:'#9c9486'}}>Simpan</button>
        </div>
      </div>
    </div>
  );
}

// ── Top Up Modal ──────────────────────────────────────────────────────────────
interface TopUpFormData { date: string; amount: string; source: string; description: string; approvedBy: string; }
function TopUpModal({ onSave, onClose, bankAccounts: ba }: { onSave:(d:TopUpFormData)=>void; onClose:()=>void; bankAccounts?: any[] }) {
  const { offset, onMouseDown } = useDraggable();
  const { getMasterDataByCategory } = useApp();
  const sumberKasKecilList = getMasterDataByCategory('sumber_kas_kecil').map((m: any) => m.value);
  const PC_SOURCES_STATIC_MD = sumberKasKecilList.length ? sumberKasKecilList : PC_SOURCES_STATIC;
  const now = new Date().toISOString().split('T')[0];
  const pcSources = [...(ba || []).map((a: any) => `${a.bankName} (${a.type})`), ...PC_SOURCES_STATIC_MD];
  const [form, setForm] = useState<TopUpFormData>({ date:now, amount:'', source: pcSources[0] || '', description:'', approvedBy:'' });
  const [err, setErr] = useState('');
  const h = (k: keyof TopUpFormData, v: string) => { setForm(p=>({...p,[k]:v})); setErr(''); };

  const QUICK_AMOUNTS = [500_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000];

  const submit = () => {
    if (!form.date || !form.amount || !form.description) { setErr('Tanggal, jumlah, dan keterangan wajib diisi.'); return; }
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) { setErr('Jumlah tidak valid.'); return; }
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden bg-white" onClick={e=>e.stopPropagation()} style={{transform:`translate(${offset.x}px,${offset.y}px)`}}>
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDown}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{background:'rgba(255,239,178,0.2)'}}>
              <PlusCircle className="w-4 h-4 text-[#7290a0]"/>
            </div>
            <div>
              <h3 className="font-semibold text-white" style={{fontSize:'14px'}}>Top Up Saldo Kas Kecil</h3>
              <p style={{fontSize:'11px',color:'rgba(255,255,255,0.45)'}}>Tambah dana ke kas kecil operasional</p>
            </div>
          </div>
          <button onClick={onClose} data-tooltip="Tutup" className="text-white/50 hover:text-white transition-colors"><X className="w-4 h-4"/></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Quick amount buttons */}
          <div>
            <label className="block mb-2" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Pilih Nominal Cepat</label>
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map(a=>(
                <button key={a} onClick={()=>h('amount', String(a))}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
                  style={{
                    background: form.amount===String(a) ? '#f0fdf4' : '#f8fafc',
                    color: form.amount===String(a) ? '#1A77A3' : '#64748b',
                    borderColor: form.amount===String(a) ? '#b8d5e8' : '#e2e8f0',
                    fontWeight: form.amount===String(a) ? 700 : 500,
                  }}>
                  {compactRp(a)}
                </button>
              ))}
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Atau Masukkan Nominal (Rp)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium" style={{color:'#64748b'}}>Rp</span>
              <input type="number" value={form.amount} onChange={e=>h('amount',e.target.value)} placeholder="0" min="0"
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]"
                style={{borderColor:'#e2e8f0',fontWeight:600,fontSize:'15px'}}/>
            </div>
            {form.amount && !isNaN(parseFloat(form.amount)) && (
              <p className="mt-1" style={{fontSize:'11px',color:'#1A77A3',fontWeight:500}}>
                {formatRp(parseFloat(form.amount))}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Date */}
            <div>
              <label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Tanggal Top Up</label>
              <input type="date" value={form.date} onChange={e=>h('date',e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/>
            </div>
            {/* Approved by */}
            <div>
              <label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Disetujui Oleh</label>
              <input type="text" value={form.approvedBy} onChange={e=>h('approvedBy',e.target.value)} placeholder="Nama majelis/bendahara"
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/>
            </div>
          </div>

          {/* Source */}
          <div>
            <label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Sumber Dana</label>
            <select value={form.source} onChange={e=>h('source',e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}>
              {pcSources.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Keterangan</label>
            <textarea value={form.description} onChange={e=>h('description',e.target.value)} rows={2}
              placeholder="Contoh: Pengisian ulang kas kecil April 2026..."
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3] resize-none" style={{borderColor:'#e2e8f0'}}/>
          </div>

          {err && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{background:'#fef2f2',color:'#dc2626'}}>
              <AlertCircle className="w-4 h-4 flex-shrink-0"/>{err}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}>Batal</button>
          <button onClick={submit} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 flex items-center justify-center gap-2"
            style={{background:'#1A77A3'}}>
            <PlusCircle className="w-4 h-4"/> Konfirmasi Top Up
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Export Modal ─────────────────────────────────────────────────────────────
function ExportModal({ curMonth, curYear, onExportPDF, onExportExcel, onClose, loading }: {
  curMonth:number; curYear:number;
  onExportPDF:(m:number,y:number)=>void;
  onExportExcel:(m:number,y:number)=>void;
  onClose:()=>void; loading:boolean;
}) {
  const { offset, onMouseDown } = useDraggable();
  const [selMonth,setSelMonth]=useState(curMonth);
  const [selYear,setSelYear]=useState(curYear);
  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.45)'}} onClick={onClose}>
      <div className="w-full max-sm rounded-2xl shadow-2xl overflow-hidden bg-white" onClick={e=>e.stopPropagation()} style={{transform:`translate(${offset.x}px,${offset.y}px)`}}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDown}>
          <h3 className="font-semibold text-white flex items-center gap-2" style={{fontSize:'15px'}}>
            <Download className="w-4 h-4"/> Export Laporan Keuangan
          </h3>
          <button onClick={onClose} data-tooltip="Tutup" className="text-white/60 hover:text-white transition-colors"><X className="w-4 h-4"/></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <p className="mb-3" style={{fontSize:'12.5px',color:'#64748b'}}>Pilih periode laporan yang akan diekspor:</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Bulan</label>
                <select value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}>
                  {MONTH_FULL.map((m,i)=><option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Tahun</label>
                <select value={selYear} onChange={e=>setSelYear(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}>
                  {[2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="p-3 rounded-xl" style={{background:'#f0fdf4',border:'1px solid #b8d5e8'}}>
            <p style={{fontSize:'12px',color:'#144f6b'}}>
              Laporan akan mencakup: <strong>ringkasan KPI</strong>, <strong>pemasukan & pengeluaran per kategori</strong>, dan <strong>daftar transaksi lengkap</strong> untuk {MONTH_FULL[selMonth]} {selYear}.
            </p>
          </div>
        </div>
        <div className="px-6 pb-6 space-y-2">
          <button onClick={()=>onExportPDF(selMonth,selYear)} disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
            style={{background:'linear-gradient(135deg,#dc2626,#ef4444)'}}>
            <FileText className="w-4 h-4"/> {loading?'Memproses...':'Export PDF (.pdf)'}
          </button>
          <button onClick={()=>onExportExcel(selMonth,selYear)} disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
            style={{background:'#1A77A3'}}>
            <FileSpreadsheet className="w-4 h-4"/> {loading?'Memproses...':'Export Excel (.xlsx)'}
          </button>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}>Batal</button>
        </div>
      </div>
    </div>
  );
}

// ── Budget Bar ─────────────────────────────────────────────────────────────────
type BudgetWithActual = Budget & { actual: number };
function BudgetBar({ item, onEdit, onDelete, canEdit, canDelete }: { item: BudgetWithActual; onEdit?:()=>void; onDelete?:()=>void; canEdit?:boolean; canDelete?:boolean }) {
  const pct=Math.min(100,item.budgeted>0?(item.actual/item.budgeted)*100:0);
  const over=item.actual>item.budgeted;
  const color=item.type==='income'?(pct>=80?'#1A77A3':pct>=50?'#c2baaa':'#ef4444'):(over?'#ef4444':pct>=80?'#c2baaa':'#1A77A3');
  return(
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0" style={{borderColor:'#f1f5f9'}}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:item.type==='income'?'#1A77A3':'#ef4444'}}/>
            <span className="truncate" style={{fontSize:'12.5px',fontWeight:500,color:'#4b5563'}}>{item.category}</span>
          </div>
          <span style={{fontSize:'11px',color:'#64748b',flexShrink:0,marginLeft:8}}>{compactRp(item.actual)} / {compactRp(item.budgeted)}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{background:'#f1f5f9'}}>
          <div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:color}}/>
        </div>
      </div>
      <span className="flex-shrink-0 px-2 py-0.5 rounded-full" style={{fontSize:'10.5px',fontWeight:600,background:over&&item.type==='expense'?'#fef2f2':pct>=90?'#f0fdf4':'#f6f4f0',color:over&&item.type==='expense'?'#dc2626':pct>=90?'#1A77A3':'#9c9486'}}>{pct.toFixed(0)}%</span>
      {canEdit&&<button onClick={onEdit} className="p-1 rounded hover:bg-gray-100 transition-colors flex-shrink-0"><Pencil className="w-3 h-3 text-gray-400"/></button>}
      {canDelete&&<button onClick={onDelete} className="p-1 rounded hover:bg-red-50 transition-colors flex-shrink-0"><Trash2 className="w-3 h-3 text-red-400"/></button>}
    </div>
  );
}

// ── Donut Pie Chart ───────────────────────────────────────────────────────────
interface DonutEntry { name: string; value: number; }
function DonutPieChart({ data, total, colors, emptyMsg }: {
  data: [string,number][]; total: number; colors: string[]; emptyMsg?: string;
}) {
  const [activeIdx, setActiveIdx] = useState<number|null>(null);
  const pieData: DonutEntry[] = data.map(([name,value]) => ({ name, value }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0];
    const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0';
    return (
      <div className="rounded-xl shadow-xl px-3 py-2.5 border" style={{ background:'white', borderColor:'#e2e8f0', minWidth:160 }}>
        <p style={{ fontSize:'12px', fontWeight:700, color:'#0f172a', marginBottom:3 }}>{item.name}</p>
        <p style={{ fontSize:'13px', fontWeight:800, color: item.payload.fill }}>{compactRp(item.value)}</p>
        <p style={{ fontSize:'11px', color:'#64748b', marginTop:1 }}>{pct}% dari total</p>
      </div>
    );
  };



  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-14 h-14 rounded-full mb-3 flex items-center justify-center" style={{ background:'#f1f5f9' }}>
          <BarChart3 className="w-6 h-6" style={{ color:'#cbd5e1' }} />
        </div>
        <p style={{ fontSize:'12.5px', color:'#94a3b8' }}>{emptyMsg || 'Belum ada data'}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Donut Chart with CSS overlay center label */}
      <div style={{ height: 175, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={76}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
              onMouseEnter={(_,i) => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
            >
              {pieData.map((_,i) => (
                <Cell
                  key={i}
                  fill={colors[i % colors.length]}
                  opacity={activeIdx === null || activeIdx === i ? 1 : 0.45}
                  style={{ cursor:'pointer', transition:'opacity 0.15s' }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label overlay */}
        <div style={{ position:'absolute', top:0, left:0, right:0, bottom:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          <div style={{ textAlign:'center' }}>
            <p style={{ fontSize:'10px', color:'#94a3b8', fontWeight:500, marginBottom:1 }}>Total</p>
            <p style={{ fontSize:'12px', fontWeight:800, color:'#0f172a', fontFamily:"'Plus Jakarta Sans',sans-serif", lineHeight:1 }}>{compactRp(total)}</p>
          </div>
        </div>
      </div>

      {/* Legend list */}
      <div className="space-y-2 mt-1">
        {data.map(([cat, amt], i) => {
          const pct = total > 0 ? (amt / total * 100) : 0;
          const isActive = activeIdx === i;
          return (
            <div
              key={i}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all cursor-default"
              style={{ background: isActive ? colors[i % colors.length] + '14' : 'transparent' }}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
            >
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform"
                style={{ background: colors[i % colors.length], transform: isActive ? 'scale(1.35)' : 'scale(1)' }} />
              <span className="flex-1 truncate" style={{ fontSize:'11.5px', color:'#4b5563', fontWeight: isActive ? 600 : 400 }}>{cat}</span>
              <span style={{ fontSize:'11px', color:'#94a3b8', flexShrink:0, marginRight:4 }}>{pct.toFixed(0)}%</span>
              <span style={{ fontSize:'11.5px', fontWeight:700, color: colors[i % colors.length], flexShrink:0 }}>{compactRp(amt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function ChurchFinanceHub() {
  const { financialRecords, currentUser, addFinancialRecord, updateFinancialRecord, deleteFinancialRecord, can, getMasterDataByCategory, pettyCash, pcTopUps, addPettyCash, updatePettyCash, deletePettyCash, addPcTopUp, deletePcTopUp, bankAccounts, addBankAccount, updateBankAccount, deleteBankAccount, budgets, addBudget, updateBudget, deleteBudget } = useApp();
  const PC_CATEGORIES = getMasterDataByCategory('kategori_kas_kecil').map(m=>m.value);
  const { offset: offsetDelTopUp, onMouseDown: onMouseDownDelTopUp } = useDraggable();
  const { offset: offsetDelConfirm, onMouseDown: onMouseDownDelConfirm } = useDraggable();
  const { offset: offsetDelPC, onMouseDown: onMouseDownDelPC } = useDraggable();
  const { offset: offsetDelBa, onMouseDown: onMouseDownDelBa } = useDraggable();
  const { offset: offsetDelBudget, onMouseDown: onMouseDownDelBudget } = useDraggable();

  const canCreate = can('Keuangan & Persembahan', 'create');
  const canEdit   = can('Keuangan & Persembahan', 'edit');
  const canDelete = can('Keuangan & Persembahan', 'delete');
  const canExport = can('Keuangan & Persembahan', 'export');

  const [tab, setTab] = useState<'ringkasan'|'transaksi'|'kas-kecil'|'rekening'|'laporan'>('ringkasan');
  // Transaction state
  const [txFilter,setTxFilter]=useState<'semua'|'income'|'expense'>('semua');
  const [searchQ,setSearchQ]=useState('');
  const [monthFilter,setMonthFilter]=useState<number>(-1);
  const [yearFilter,setYearFilter]=useState<number>(2026);
  const [page,setPage]=useState(1);
  const [showForm,setShowForm]=useState(false);
  const [editRec,setEditRec]=useState<any>(null);
  const [deleteConfirm,setDeleteConfirm]=useState<string|null>(null);
  // Petty cash UI state
  const [pcSearch,setPcSearch]=useState('');
  const [pcCatFilter,setPcCatFilter]=useState('');
  const [pcStatusFilter,setPcStatusFilter]=useState<''|'Lunas'|'Pending'>('');
  const [pcMonthFilter,setPcMonthFilter]=useState<number>(new Date().getMonth());
  const [pcPage,setPcPage]=useState(1);
  const [showPCForm,setShowPCForm]=useState(false);
  const [editPC,setEditPC]=useState<PettyCash|null>(null);
  const [deletePCConfirm,setDeletePCConfirm]=useState<string|null>(null);
  const [showTopUp,setShowTopUp]=useState(false);
  const [deleteTopUpConfirm,setDeleteTopUpConfirm]=useState<string|null>(null);
  const [showTopUpHistory,setShowTopUpHistory]=useState(false);
  // Export state
  const [showExport,setShowExport]=useState(false);
  const [exportLoading,setExportLoading]=useState(false);
  // Bank account modal state
  const [showBaForm,setShowBaForm]=useState(false);
  const [editBa,setEditBa]=useState<BankAccount|null>(null);
  const [deleteBaConfirm,setDeleteBaConfirm]=useState<string|null>(null);
  // Budget modal state
  const [showBudgetForm,setShowBudgetForm]=useState(false);
  const [editBudget,setEditBudget]=useState<Budget|null>(null);
  const [deleteBudgetConfirm,setDeleteBudgetConfirm]=useState<string|null>(null);

  const { widths: txColW, startResize: startResizeTx } = useResizableColumns('church-finance-transactions', TX_TABLE_DEFAULT_WIDTHS);
  const { widths: pcColW, startResize: startResizePC } = useResizableColumns('church-finance-petty-cash', PC_TABLE_DEFAULT_WIDTHS);

  const now=new Date(), curMonth=now.getMonth(), curYear=now.getFullYear();

  // ── Derived financial data ─────────────────────────────────────────────────
  const allRecords=useMemo(()=>{
    const base:any[]=financialRecords||[];
    return [...base].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime());
  },[financialRecords]);

  const thisMonthRecords=useMemo(()=>allRecords.filter((r:any)=>{const d=new Date(r.date);return d.getMonth()===curMonth&&d.getFullYear()===curYear;}),[allRecords,curMonth,curYear]);
  const totalIncome=thisMonthRecords.filter((r:any)=>r.type==='income').reduce((s:number,r:any)=>s+r.amount,0);
  const totalExpense=thisMonthRecords.filter((r:any)=>r.type==='expense').reduce((s:number,r:any)=>s+r.amount,0);
  const netBalance=totalIncome-totalExpense;
  const totalBankBalance=useMemo(()=>(bankAccounts||[]).reduce((s:number,a:BankAccount)=>s+a.balance,0),[bankAccounts]);

  // Budget dengan actual dihitung dari financialRecords tahun berjalan
  const budgetsWithActual=useMemo(():BudgetWithActual[]=>{
    const recs=financialRecords||[];
    return (budgets||[]).filter((b:Budget)=>b.year===curYear).map((b:Budget)=>{
      const actual=recs.filter((r:any)=>r.type===b.type&&r.category===b.category&&new Date(r.date).getFullYear()===curYear).reduce((s:number,r:any)=>s+r.amount,0);
      return {...b,actual};
    });
  },[budgets,financialRecords,curYear]);

  const monthlyData=useMemo(()=>{
    const result=[];
    for(let i=5;i>=0;i--){
      const d=new Date(curYear,curMonth-i,1),m=d.getMonth(),y=d.getFullYear();
      const recs=allRecords.filter((r:any)=>{const rd=new Date(r.date);return rd.getMonth()===m&&rd.getFullYear()===y;});
      result.push({name:MONTHS[m],income:recs.filter((r:any)=>r.type==='income').reduce((s:number,r:any)=>s+r.amount,0),expense:recs.filter((r:any)=>r.type==='expense').reduce((s:number,r:any)=>s+r.amount,0)});
    }
    return result;
  },[allRecords,curMonth,curYear]);

  const balanceData=monthlyData.map(d=>({name:d.name,balance:d.income-d.expense}));

  // Category chart data with fallback to most recent available month
  const categoryChartData=useMemo(()=>{
    const build=(recs:any[],label:string)=>{
      const incMap:Record<string,number>={},expMap:Record<string,number>={};
      recs.filter((r:any)=>r.type==='income').forEach((r:any)=>{incMap[r.category]=(incMap[r.category]||0)+r.amount;});
      recs.filter((r:any)=>r.type==='expense').forEach((r:any)=>{expMap[r.category]=(expMap[r.category]||0)+r.amount;});
      return {
        incomeByCategory:Object.entries(incMap).sort((a,b)=>b[1]-a[1]).slice(0,6) as [string,number][],
        expenseByCategory:Object.entries(expMap).sort((a,b)=>b[1]-a[1]).slice(0,6) as [string,number][],
        totalIncome:recs.filter((r:any)=>r.type==='income').reduce((s:number,r:any)=>s+r.amount,0),
        totalExpense:recs.filter((r:any)=>r.type==='expense').reduce((s:number,r:any)=>s+r.amount,0),
        period:label,
      };
    };
    if(thisMonthRecords.length>0) return build(thisMonthRecords,MONTH_FULL[curMonth]);
    for(let i=1;i<=12;i++){
      const d=new Date(curYear,curMonth-i,1);
      const m=d.getMonth(),y=d.getFullYear();
      const recs=allRecords.filter((r:any)=>{const rd=new Date(r.date);return rd.getMonth()===m&&rd.getFullYear()===y;});
      if(recs.length>0) return build(recs,`${MONTH_FULL[m]} ${y}`);
    }
    return build(allRecords,'Semua Periode');
  },[allRecords,thisMonthRecords,curMonth,curYear]);
  const incomeByCategory=categoryChartData.incomeByCategory;
  const expenseByCategory=categoryChartData.expenseByCategory;

  const filteredTx=useMemo(()=>{
    let recs=allRecords;
    if(txFilter!=='semua') recs=recs.filter((r:any)=>r.type===txFilter);
    if(monthFilter>=0) recs=recs.filter((r:any)=>new Date(r.date).getMonth()===monthFilter);
    recs=recs.filter((r:any)=>new Date(r.date).getFullYear()===yearFilter);
    if(searchQ){const q=searchQ.toLowerCase();recs=recs.filter((r:any)=>r.description?.toLowerCase().includes(q)||r.category?.toLowerCase().includes(q)||r.reference?.toLowerCase().includes(q));}
    return recs;
  },[allRecords,txFilter,monthFilter,yearFilter,searchQ]);
  const totalPages=Math.max(1,Math.ceil(filteredTx.length/PAGE_SIZE));
  const pageTx=filteredTx.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);

  // ── Derived petty cash data ────────────────────────────────────────────────
  const filteredPC=useMemo(()=>{
    let recs=pettyCash;
    if(pcMonthFilter>=0) recs=recs.filter(r=>new Date(r.date).getMonth()===pcMonthFilter);
    if(pcCatFilter) recs=recs.filter(r=>r.category===pcCatFilter);
    if(pcStatusFilter) recs=recs.filter(r=>r.status===pcStatusFilter);
    if(pcSearch){const q=pcSearch.toLowerCase();recs=recs.filter(r=>r.description.toLowerCase().includes(q)||r.payTo.toLowerCase().includes(q)||r.receiptNo.toLowerCase().includes(q));}
    return recs.sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime());
  },[pettyCash,pcMonthFilter,pcCatFilter,pcStatusFilter,pcSearch]);

  const pcTotalPages=Math.max(1,Math.ceil(filteredPC.length/PC_PAGE_SIZE));
  const pagePC=filteredPC.slice((pcPage-1)*PC_PAGE_SIZE,pcPage*PC_PAGE_SIZE);

  // ── Sortable hooks ─────────────────────────────────────────────────────────
  const { sorted: sortedTx, sortKey: skTx, sortDir: sdTx, requestSort: rsTx } = useSortable(filteredTx);
  const pagedTxSorted = sortedTx.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const { sorted: sortedPC, sortKey: skPC, sortDir: sdPC, requestSort: rsPC } = useSortable(filteredPC);
  const pagedPCSorted = sortedPC.slice((pcPage-1)*PC_PAGE_SIZE, pcPage*PC_PAGE_SIZE);
  const SortIconTx = ({col}:{col:string}) => {
    if(skTx!==col) return <ArrowUpDown className="w-3 h-3 opacity-40"/>;
    return sdTx==='asc'?<ArrowUp className="w-3 h-3 text-[#1A77A3]"/>:<ArrowDown className="w-3 h-3 text-[#1A77A3]"/>;
  };
  const SortIconPC = ({col}:{col:string}) => {
    if(skPC!==col) return <ArrowUpDown className="w-3 h-3 opacity-40"/>;
    return sdPC==='asc'?<ArrowUp className="w-3 h-3 text-[#1A77A3]"/>:<ArrowDown className="w-3 h-3 text-[#1A77A3]"/>;
  };

  const pcThisMonth=pettyCash.filter(r=>new Date(r.date).getMonth()===curMonth&&new Date(r.date).getFullYear()===curYear);
  const pcTotalSpent=pcThisMonth.reduce((s,r)=>s+(r.status==='Lunas'?r.amount:0),0);
  const pcTotalPending=pcThisMonth.filter(r=>r.status==='Pending').reduce((s,r)=>s+r.amount,0);
  // Dynamic top-up balance (sum of all top-ups for current month)
  const pcTopUpsThisMonth=pcTopUps.filter(t=>new Date(t.date).getMonth()===curMonth&&new Date(t.date).getFullYear()===curYear);
  const pcTotalTopUp=pcTopUpsThisMonth.reduce((s,t)=>s+t.amount,0);
  // "Sisa Saldo" adalah uang tunai kas kecil yang benar-benar tersisa SEKARANG, jadi
  // harus akumulasi semua top up dikurangi semua pengeluaran Lunas SEPANJANG WAKTU —
  // bukan cuma bulan berjalan. Kalau dihitung per-bulan saja, saldo akan "reset" ke 0
  // tiap awal bulan dan bisa salah tampil "Overbudget!" padahal kas fisiknya masih ada
  // sisa dari top up bulan-bulan sebelumnya.
  const pcTotalSpentAllTime=pettyCash.reduce((s,r)=>s+(r.status==='Lunas'?r.amount:0),0);
  const pcTotalTopUpAllTime=pcTopUps.reduce((s,t)=>s+t.amount,0);
  const pcBalance=pcTotalTopUpAllTime-pcTotalSpentAllTime;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSave=(d:TxFormData)=>{
    const rec={date:d.date,type:d.type,category:d.category,amount:parseFloat(d.amount),description:d.description,reference:d.reference||'',recordedBy:currentUser?.name||'Admin',recordedById:currentUser?.id||'u1'};
    if(editRec){if(typeof updateFinancialRecord==='function')updateFinancialRecord(editRec.id,rec);}
    else{if(typeof addFinancialRecord==='function')addFinancialRecord(rec);}
    setShowForm(false);setEditRec(null);
  };
  const handleDelete=(id:string)=>{if(typeof deleteFinancialRecord==='function')deleteFinancialRecord(id);setDeleteConfirm(null);};

  const handlePCSave=(d:PCFormData)=>{
    if(editPC){
      updatePettyCash(editPC.id, { ...d, amount: parseFloat(d.amount) });
    } else {
      addPettyCash({ date:d.date, category:d.category, description:d.description, amount:parseFloat(d.amount), payTo:d.payTo, receiptNo:d.receiptNo, status:d.status, createdBy:currentUser?.name||'Admin' });
    }
    setShowPCForm(false);setEditPC(null);
  };
  const handlePCDelete=(id:string)=>{
    deletePettyCash(id);
    setDeletePCConfirm(null);
  };

  const handleTopUpSave=(d:TopUpFormData)=>{
    addPcTopUp({ date:d.date, amount:parseFloat(d.amount), source:d.source, description:d.description, approvedBy:d.approvedBy, createdBy:currentUser?.name||'Admin' });
    setShowTopUp(false);
  };
  const handleTopUpDelete=(id:string)=>{
    deletePcTopUp(id);
    setDeleteTopUpConfirm(null);
  };

  // ── Bank Account handlers ──────────────────────────────────────────────────
  const handleBaSave=(d:{bankName:string;accountName:string;accountNumber:string;balance:string;type:BankAccountType;color:string})=>{
    const data={bankName:d.bankName,accountName:d.accountName,accountNumber:d.accountNumber,balance:parseFloat(d.balance.replace(/\D/g,'')||'0'),type:d.type,color:d.color,lastUpdated:new Date().toISOString().split('T')[0]};
    if(editBa){updateBankAccount(editBa.id,data);}else{addBankAccount(data);}
    setShowBaForm(false);setEditBa(null);
  };
  const handleBaDelete=(id:string)=>{deleteBankAccount(id);setDeleteBaConfirm(null);};

  // ── Budget handlers ────────────────────────────────────────────────────────
  const handleBudgetSave=(d:{category:string;type:'income'|'expense';budgeted:string;year:number})=>{
    const data={category:d.category,type:d.type,budgeted:parseFloat(d.budgeted.replace(/\D/g,'')||'0'),year:d.year};
    if(editBudget){updateBudget(editBudget.id,data);}else{addBudget(data);}
    setShowBudgetForm(false);setEditBudget(null);
  };
  const handleBudgetDelete=(id:string)=>{deleteBudget(id);setDeleteBudgetConfirm(null);};

  // ── Export PDF ─────────────────────────────────────────────────────────────
  const exportToPDF=(month:number,year:number)=>{
    setExportLoading(true);
    try{
      const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
      const W=doc.internal.pageSize.getWidth();
      const monthRecs=allRecords.filter((r:any)=>{const d=new Date(r.date);return d.getMonth()===month&&d.getFullYear()===year;});
      const mIncome=monthRecs.filter((r:any)=>r.type==='income').reduce((s:number,r:any)=>s+r.amount,0);
      const mExpense=monthRecs.filter((r:any)=>r.type==='expense').reduce((s:number,r:any)=>s+r.amount,0);
      const mNet=mIncome-mExpense;

      // ── Header block ──
      doc.setFillColor(13,40,24);
      doc.rect(0,0,W,38,'F');
      doc.setTextColor(255,255,255);
      doc.setFontSize(16);
      doc.setFont('helvetica','bold');
      doc.text('GPIB TRINITAS',W/2,14,{align:'center'});
      doc.setFontSize(11);
      doc.setFont('helvetica','normal');
      doc.text('LAPORAN KEUANGAN BULANAN',W/2,21,{align:'center'});
      doc.setFontSize(9);
      doc.setTextColor(180,230,200);
      doc.text(`Periode: ${MONTH_FULL[month]} ${year}`,W/2,28,{align:'center'});
      doc.text(`Dicetak: ${new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} · Oleh: ${currentUser?.name||'Admin'}`,W/2,34,{align:'center'});

      let y=46;

      // ── KPI Summary ──
      doc.setTextColor(15,23,42);
      doc.setFontSize(11);
      doc.setFont('helvetica','bold');
      doc.text('I. RINGKASAN KEUANGAN',14,y);
      y+=6;
      autoTable(doc,{
        startY:y,
        head:[['Keterangan','Jumlah']],
        body:[
          ['Total Kas Masuk',formatRp(mIncome)],
          ['Total Kas Keluar',formatRp(mExpense)],
          ['Saldo Bersih (Surplus / Defisit)',formatRp(mNet)],
          ['Total Saldo Bank (Seluruh Rekening)',formatRp(totalBankBalance)],
        ],
        theme:'grid',
        headStyles:{fillColor:[13,40,24],textColor:255,fontStyle:'bold',fontSize:9},
        bodyStyles:{fontSize:9,textColor:[15,23,42]},
        columnStyles:{0:{cellWidth:120},1:{cellWidth:60,halign:'right'}},
        didParseCell:(data)=>{
          if(data.section==='body'&&data.row.index===2){
            data.cell.styles.textColor=mNet>=0?[5,150,105]:[220,38,38];
            data.cell.styles.fontStyle='bold';
          }
        },
        margin:{left:14,right:14},
      });
      y=(doc as any).lastAutoTable.finalY+10;

      // ── Income by category ──
      const incMap:Record<string,number>={};
      monthRecs.filter((r:any)=>r.type==='income').forEach((r:any)=>{incMap[r.category]=(incMap[r.category]||0)+r.amount;});
      const incEntries=Object.entries(incMap).sort((a,b)=>b[1]-a[1]);
      if(incEntries.length>0){
        doc.setFontSize(11);doc.setFont('helvetica','bold');doc.setTextColor(15,23,42);
        doc.text('II. PEMASUKAN PER KATEGORI',14,y);y+=6;
        autoTable(doc,{
          startY:y,
          head:[['No','Kategori','Jumlah','%']],
          body:incEntries.map(([cat,amt],i)=>[String(i+1),cat,formatRp(amt),mIncome>0?`${((amt/mIncome)*100).toFixed(1)}%`:'0%']),
          theme:'striped',
          headStyles:{fillColor:[5,150,105],textColor:255,fontSize:9},
          bodyStyles:{fontSize:9},
          columnStyles:{0:{cellWidth:10},2:{halign:'right'},3:{halign:'right',cellWidth:18}},
          margin:{left:14,right:14},
        });
        y=(doc as any).lastAutoTable.finalY+10;
      }

      // ── Expense by category ──
      const expMap:Record<string,number>={};
      monthRecs.filter((r:any)=>r.type==='expense').forEach((r:any)=>{expMap[r.category]=(expMap[r.category]||0)+r.amount;});
      const expEntries=Object.entries(expMap).sort((a,b)=>b[1]-a[1]);
      if(expEntries.length>0){
        if(y>240){doc.addPage();y=20;}
        doc.setFontSize(11);doc.setFont('helvetica','bold');doc.setTextColor(15,23,42);
        doc.text('III. PENGELUARAN PER KATEGORI',14,y);y+=6;
        autoTable(doc,{
          startY:y,
          head:[['No','Kategori','Jumlah','%']],
          body:expEntries.map(([cat,amt],i)=>[String(i+1),cat,formatRp(amt),mExpense>0?`${((amt/mExpense)*100).toFixed(1)}%`:'0%']),
          theme:'striped',
          headStyles:{fillColor:[220,38,38],textColor:255,fontSize:9},
          bodyStyles:{fontSize:9},
          columnStyles:{0:{cellWidth:10},2:{halign:'right'},3:{halign:'right',cellWidth:18}},
          margin:{left:14,right:14},
        });
        y=(doc as any).lastAutoTable.finalY+10;
      }

      // ── Transaction list ──
      if(monthRecs.length>0){
        if(y>220){doc.addPage();y=20;}
        doc.setFontSize(11);doc.setFont('helvetica','bold');doc.setTextColor(15,23,42);
        doc.text('IV. DAFTAR TRANSAKSI',14,y);y+=6;
        autoTable(doc,{
          startY:y,
          head:[['No','Tanggal','Jenis','Kategori','Keterangan','Jumlah']],
          body:monthRecs.map((r:any,i:number)=>[
            String(i+1),
            new Date(r.date).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}),
            r.type==='income'?'Masuk':'Keluar',
            r.category,
            r.description,
            (r.type==='income'?'+':'-')+formatRp(r.amount),
          ]),
          theme:'striped',
          headStyles:{fillColor:[13,40,24],textColor:255,fontSize:8,fontStyle:'bold'},
          bodyStyles:{fontSize:7.5},
          columnStyles:{0:{cellWidth:8},1:{cellWidth:22},2:{cellWidth:15},5:{halign:'right',cellWidth:28}},
          didParseCell:(data)=>{
            if(data.section==='body'&&data.column.index===5){
              const row=monthRecs[data.row.index] as any;
              if(row) data.cell.styles.textColor=row.type==='income'?[5,150,105]:[220,38,38];
            }
          },
          margin:{left:14,right:14},
        });
      }

      // ── Petty cash section ──
      const pcMonth=pettyCash.filter(r=>new Date(r.date).getMonth()===month&&new Date(r.date).getFullYear()===year);
      const tuMonth=pcTopUps.filter(t=>new Date(t.date).getMonth()===month&&new Date(t.date).getFullYear()===year);
      const tuTotal=tuMonth.reduce((s,t)=>s+t.amount,0);
      if(pcMonth.length>0||tuMonth.length>0){
        doc.addPage(); let pcY=20;
        doc.setFontSize(11);doc.setFont('helvetica','bold');doc.setTextColor(15,23,42);
        doc.text('V. KAS KECIL (PETTY CASH)',14,pcY);pcY+=8;
        const pcSpent=pcMonth.filter(r=>r.status==='Lunas').reduce((s,r)=>s+r.amount,0);
        autoTable(doc,{
          startY:pcY,
          head:[['Total Dana Masuk (Top Up)','Total Dipakai','Sisa Saldo']],
          body:[[formatRp(tuTotal),formatRp(pcSpent),formatRp(tuTotal-pcSpent)]],
          theme:'grid',
          headStyles:{fillColor:[120,53,15],textColor:255,fontSize:9},
          bodyStyles:{fontSize:9,halign:'center'},
          margin:{left:14,right:14},
        });
        pcY=(doc as any).lastAutoTable.finalY+6;
        autoTable(doc,{
          startY:pcY,
          head:[['No','Tanggal','Kategori','Keterangan','Dibayar Ke','No. Bukti','Status','Jumlah']],
          body:pcMonth.map((r,i)=>[String(i+1),new Date(r.date).toLocaleDateString('id-ID',{day:'2-digit',month:'short'}),r.category,r.description,r.payTo||'-',r.receiptNo||'-',r.status,formatRp(r.amount)]),
          theme:'striped',
          headStyles:{fillColor:[146,64,14],textColor:255,fontSize:8},
          bodyStyles:{fontSize:7.5},
          columnStyles:{7:{halign:'right',cellWidth:25}},
          margin:{left:14,right:14},
        });
      }

      // Footer on all pages
      const totalPgs=(doc as any).internal.getNumberOfPages();
      for(let p=1;p<=totalPgs;p++){
        doc.setPage(p);
        doc.setFontSize(7.5);doc.setTextColor(148,163,184);
        doc.text(`GPIB Trinitas · Laporan Keuangan ${MONTH_FULL[month]} ${year} · Halaman ${p} dari ${totalPgs}`,W/2,doc.internal.pageSize.getHeight()-8,{align:'center'});
      }

      doc.save(`Laporan-Keuangan-${MONTH_FULL[month]}-${year}.pdf`);
    } catch(e){console.error('Export PDF error:',e);}
    finally{setExportLoading(false);setShowExport(false);}
  };

  // ── Export Excel ───────────────────────────────────────────────────────────
  const exportToExcel=(month:number,year:number)=>{
    setExportLoading(true);
    try{
      const wb=XLSX.utils.book_new();
      const monthRecs=allRecords.filter((r:any)=>{const d=new Date(r.date);return d.getMonth()===month&&d.getFullYear()===year;});
      const mIncome=monthRecs.filter((r:any)=>r.type==='income').reduce((s:number,r:any)=>s+r.amount,0);
      const mExpense=monthRecs.filter((r:any)=>r.type==='expense').reduce((s:number,r:any)=>s+r.amount,0);
      const mNet=mIncome-mExpense;

      // Sheet 1: Ringkasan
      const summaryData=[
        ['GPIB TRINITAS'],
        [`LAPORAN KEUANGAN BULANAN - ${MONTH_FULL[month].toUpperCase()} ${year}`],
        [''],
        ['RINGKASAN KEUANGAN',''],
        ['Total Kas Masuk',mIncome],
        ['Total Kas Keluar',mExpense],
        ['Saldo Bersih',mNet],
        ['Total Saldo Bank',totalBankBalance],
        [''],
        ['PEMASUKAN PER KATEGORI',''],
      ];
      const incMap:Record<string,number>={};
      monthRecs.filter((r:any)=>r.type==='income').forEach((r:any)=>{incMap[r.category]=(incMap[r.category]||0)+r.amount;});
      Object.entries(incMap).sort((a,b)=>b[1]-a[1]).forEach(([cat,amt])=>summaryData.push([cat,amt as any]));
      summaryData.push([''],['PENGELUARAN PER KATEGORI','']);
      const expMap:Record<string,number>={};
      monthRecs.filter((r:any)=>r.type==='expense').forEach((r:any)=>{expMap[r.category]=(expMap[r.category]||0)+r.amount;});
      Object.entries(expMap).sort((a,b)=>b[1]-a[1]).forEach(([cat,amt])=>summaryData.push([cat,amt as any]));
      const ws1=XLSX.utils.aoa_to_sheet(summaryData);
      ws1['!cols']=[{wch:35},{wch:20}];
      XLSX.utils.book_append_sheet(wb,ws1,'Ringkasan');

      // Sheet 2: Transaksi
      const txHeader=['No','Tanggal','Jenis','Kategori','Keterangan','Referensi','Dicatat Oleh','Jumlah'];
      const txRows=monthRecs.map((r:any,i:number)=>[i+1,r.date,r.type==='income'?'Kas Masuk':'Kas Keluar',r.category,r.description,r.reference||'',r.recordedBy,r.amount]);
      const ws2=XLSX.utils.aoa_to_sheet([txHeader,...txRows]);
      ws2['!cols']=[{wch:5},{wch:14},{wch:12},{wch:22},{wch:40},{wch:16},{wch:18},{wch:16}];
      XLSX.utils.book_append_sheet(wb,ws2,'Transaksi');

      // Sheet 3: Kas Kecil
      const pcMonth=pettyCash.filter(r=>new Date(r.date).getMonth()===month&&new Date(r.date).getFullYear()===year);
      const tuMonth=pcTopUps.filter(t=>new Date(t.date).getMonth()===month&&new Date(t.date).getFullYear()===year);
      const tuTotal=tuMonth.reduce((s,t)=>s+t.amount,0);
      const pcHeader=['No','Tanggal','Kategori','Keterangan','Dibayar Ke','No. Bukti','Status','Jumlah'];
      const pcRows=pcMonth.map((r,i)=>[i+1,r.date,r.category,r.description,r.payTo,r.receiptNo,r.status,r.amount]);
      const pcSpent=pcMonth.filter(r=>r.status==='Lunas').reduce((s,r)=>s+r.amount,0);
      const tuHeader=['No','Tanggal','Jumlah','Sumber Dana','Keterangan','Disetujui Oleh'];
      const tuRows=tuMonth.map((t,i)=>[i+1,t.date,t.amount,t.source,t.description,t.approvedBy]);
      const ws3=XLSX.utils.aoa_to_sheet([
        [`KAS KECIL - ${MONTH_FULL[month]} ${year}`],
        ['Total Dana Masuk (Top Up)',tuTotal],
        ['Total Dipakai',pcSpent],
        ['Sisa Saldo',tuTotal-pcSpent],
        [''],
        ['--- RIWAYAT TOP UP ---'],
        tuHeader,
        ...tuRows,
        [''],
        ['--- PENGELUARAN ---'],
        pcHeader,
        ...pcRows,
      ]);
      ws3['!cols']=[{wch:5},{wch:14},{wch:22},{wch:38},{wch:18},{wch:16},{wch:10},{wch:14}];
      XLSX.utils.book_append_sheet(wb,ws3,'Kas Kecil');

      // Sheet 4: Rekening Bank
      const rkHeader=['Bank','Nama Rekening','No. Rekening','Jenis','Saldo','Terakhir Update'];
      const rkRows=(bankAccounts||[]).map((a:BankAccount)=>[a.bankName,a.accountName,a.accountNumber,a.type,a.balance,a.lastUpdated]);
      const ws4=XLSX.utils.aoa_to_sheet([rkHeader,...rkRows]);
      ws4['!cols']=[{wch:10},{wch:36},{wch:16},{wch:14},{wch:16},{wch:14}];
      XLSX.utils.book_append_sheet(wb,ws4,'Rekening Bank');

      XLSX.writeFile(wb,`Laporan-Keuangan-${MONTH_FULL[month]}-${year}.xlsx`);
    } catch(e){console.error('Export Excel error:',e);}
    finally{setExportLoading(false);setShowExport(false);}
  };

  const COLORS_INC=['#1A77A3','#3a7fa0','#f0ede5','#b8d5e8','#0d9488'];
  const COLORS_EXP=['#ef4444','#9c9486','#c2baaa','#ec4899','#3a7fa0'];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5" style={{fontSize:'22px',fontWeight:700,color:'#0f172a',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:'#1A77A3'}}>
              <Landmark className="w-5 h-5 text-white"/>
            </div>
            Keuangan Gereja
          </h1>
          <p style={{fontSize:'13px',color:'#64748b',marginTop:'2px'}}>GPIB Trinitas · Pengelolaan Kas & Keuangan</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <button onMouseDown={e=>e.preventDefault()} onClick={()=>{setEditRec(null);setShowForm(true);}} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow transition-all hover:opacity-90" style={{background:'#1A77A3'}}>
              <Plus className="w-4 h-4"/> Tambah Transaksi
            </button>
          )}
          {canExport && (
            <button onClick={()=>setShowExport(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all hover:bg-gray-50" style={{borderColor:'#e2e8f0',color:'#4b5563'}}>
              <Download className="w-4 h-4"/> Export Laporan
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {label:'Total Saldo Bank',value:compactRp(totalBankBalance),sub:`${(bankAccounts||[]).length} rekening aktif`,icon:Building2,color:'#2563eb',bg:'#eff6ff',border:'#bfdbfe'},
          {label:'Kas Masuk Bulan Ini',value:compactRp(totalIncome),sub:MONTH_FULL[curMonth],icon:TrendingUp,color:'#1A77A3',bg:'#f0fdf4',border:'#b8d5e8'},
          {label:'Kas Keluar Bulan Ini',value:compactRp(totalExpense),sub:MONTH_FULL[curMonth],icon:TrendingDown,color:'#dc2626',bg:'#fef2f2',border:'#fecaca'},
          {label:'Saldo Bersih Bulan Ini',value:compactRp(Math.abs(netBalance)),sub:netBalance>=0?'Surplus':'Defisit',icon:netBalance>=0?ArrowUpRight:ArrowDownRight,color:netBalance>=0?'#1A77A3':'#dc2626',bg:netBalance>=0?'#f0fdf4':'#fef2f2',border:netBalance>=0?'#b8d5e8':'#fecaca'},
        ].map((card,i)=>(
          <div key={i} className="rounded-2xl p-3 border" style={{background:card.bg,borderColor:card.border}}>
            <div className="flex items-start justify-between mb-2">
              <p style={{fontSize:'10px',color:card.color,fontWeight:600,opacity:0.8}}>{card.label}</p>
              <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{background:card.color+'20'}}>
                <card.icon className="w-3.5 h-3.5" style={{color:card.color}}/>
              </div>
            </div>
            <p style={{fontSize:'16px',fontWeight:700,color:'#0f172a',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{card.value}</p>
            <p style={{fontSize:'9.5px',color:'#64748b',marginTop:'2px'}}>{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 p-1 rounded-xl" style={{background:'#f1f5f9',width:'fit-content'}}>
        {([
          {id:'ringkasan',  label:'Ringkasan',         icon:BarChart3},
          {id:'transaksi',  label:'Transaksi',         icon:Receipt},
          {id:'kas-kecil',  label:'Kas Kecil',         icon:Coins},
          {id:'rekening',   label:'Rekening',          icon:CreditCard},
          {id:'laporan',    label:'Laporan Keuangan',  icon:Scale},
        ] as const).map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all"
            style={{fontSize:'12.5px',background:tab===t.id?'#FFEFB2':'transparent',color:tab===t.id?'#384959':'#64748b',fontWeight:tab===t.id?700:500,boxShadow:tab===t.id?'0 1px 4px rgba(0,0,0,0.08)':'none'}}>            <t.icon className="w-3.5 h-3.5"/>{t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: RINGKASAN ── */}
      {tab==='ringkasan'&&(
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Monthly bar + export shortcut */}
          <div className="xl:col-span-2 rounded-2xl border bg-white p-5" style={{borderColor:'#e2e8f0'}}>
            <div className="flex items-center justify-between mb-4">
              <h3 style={{fontSize:'14px',fontWeight:600,color:'#0f172a'}}>Arus Kas 6 Bulan Terakhir</h3>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg text-xs" style={{background:'#f0fdf4',color:'#1A77A3',fontWeight:500}}>{MONTH_FULL[curMonth]} {curYear}</span>
                <button onClick={()=>setShowExport(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all hover:bg-gray-50" style={{borderColor:'#e2e8f0',color:'#64748b'}}>
                  <Download className="w-3 h-3"/> Export
                </button>
              </div>
            </div>
            <MonthlyBarChart data={monthlyData}/>
            {/* Quick export buttons inside card */}
            <div className="flex gap-2 mt-4 pt-4 border-t" style={{borderColor:'#f1f5f9'}}>
              <button onClick={()=>exportToPDF(curMonth,curYear)} disabled={exportLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 disabled:opacity-60"
                style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fecaca'}}>
                <FileText className="w-3.5 h-3.5"/> PDF Bulan Ini
              </button>
              <button onClick={()=>exportToExcel(curMonth,curYear)} disabled={exportLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 disabled:opacity-60"
                style={{background:'#f0fdf4',color:'#1A77A3',border:'1px solid #b8d5e8'}}>
                <FileSpreadsheet className="w-3.5 h-3.5"/> Excel Bulan Ini
              </button>
              <button onClick={()=>setShowExport(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-gray-100"
                style={{background:'#f8fafc',color:'#64748b',border:'1px solid #e2e8f0'}}>
                Pilih Periode Lain
              </button>
            </div>
          </div>
          {/* Balance trend */}
          <div className="rounded-2xl border bg-white p-5" style={{borderColor:'#e2e8f0'}}>
            <h3 style={{fontSize:'14px',fontWeight:600,color:'#0f172a',marginBottom:16}}>Tren Saldo Bersih</h3>
            <BalanceLine data={balanceData}/>
            <div className="mt-3 space-y-2">
              {balanceData.map((d,i)=>(
                <div key={i} className="flex items-center justify-between">
                  <span style={{fontSize:'11.5px',color:'#64748b'}}>{d.name}</span>
                  <span style={{fontSize:'12px',fontWeight:600,color:d.balance>=0?'#1A77A3':'#ef4444'}}>{d.balance>=0?'+':''}{compactRp(d.balance)}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Income by category — Donut Chart */}
          <div className="rounded-2xl border bg-white p-5" style={{borderColor:'#e2e8f0'}}>
            <div className="flex items-center justify-between mb-4">
              <h3 style={{fontSize:'14px',fontWeight:600,color:'#0f172a'}}>Pemasukan per Kategori</h3>
              <span className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{background:'#f0fdf4',color:'#1A77A3'}}>{categoryChartData.period}</span>
            </div>
            <DonutPieChart data={incomeByCategory} total={categoryChartData.totalIncome} colors={COLORS_INC} emptyMsg="Belum ada data pemasukan"/>
          </div>
          {/* Expense by category — Donut Chart */}
          <div className="rounded-2xl border bg-white p-5" style={{borderColor:'#e2e8f0'}}>
            <div className="flex items-center justify-between mb-4">
              <h3 style={{fontSize:'14px',fontWeight:600,color:'#0f172a'}}>Pengeluaran per Kategori</h3>
              <span className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{background:'#fef2f2',color:'#dc2626'}}>{categoryChartData.period}</span>
            </div>
            <DonutPieChart data={expenseByCategory} total={categoryChartData.totalExpense} colors={COLORS_EXP} emptyMsg="Belum ada data pengeluaran"/>
          </div>
          {/* Recent transactions */}
          <div className="rounded-2xl border bg-white p-5" style={{borderColor:'#e2e8f0'}}>
            <div className="flex items-center justify-between mb-4">
              <h3 style={{fontSize:'14px',fontWeight:600,color:'#0f172a'}}>Transaksi Terbaru</h3>
              <button onClick={()=>setTab('transaksi')} style={{fontSize:'12px',color:'#1A77A3',fontWeight:500}}>Lihat Semua</button>
            </div>
            <div className="space-y-2.5">
              {allRecords.slice(0,6).map((r:any,i:number)=>(
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:r.type==='income'?'#f0fdf4':'#fef2f2'}}>
                    {r.type==='income'?<ArrowUpRight className="w-4 h-4" style={{color:'#1A77A3'}}/>:<ArrowDownRight className="w-4 h-4" style={{color:'#ef4444'}}/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate" style={{fontSize:'12px',fontWeight:500,color:'#4b5563'}}>{r.description}</p>
                    <p style={{fontSize:'10.5px',color:'#94a3b8'}}>{r.category} · {new Date(r.date).toLocaleDateString('id-ID',{day:'numeric',month:'short'})}</p>
                  </div>
                  <span style={{fontSize:'12.5px',fontWeight:600,color:r.type==='income'?'#1A77A3':'#ef4444',flexShrink:0}}>
                    {r.type==='income'?'+':'-'}{compactRp(r.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Anggaran Tahunan */}
          <div className="xl:col-span-3 rounded-2xl border bg-white p-5" style={{borderColor:'#e2e8f0'}}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 style={{fontSize:'14px',fontWeight:600,color:'#0f172a'}}>Anggaran Tahunan {curYear}</h3>
                <p style={{fontSize:'11px',color:'#94a3b8',marginTop:2}}>Realisasi dihitung otomatis dari transaksi</p>
              </div>
              {canCreate&&(
                <button onClick={()=>{setEditBudget(null);setShowBudgetForm(true);}} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-semibold" style={{background:'#1A77A3'}}>
                  <Plus className="w-3.5 h-3.5"/>Tambah Anggaran
                </button>
              )}
            </div>
            {budgetsWithActual.length===0?(
              <div className="text-center py-8" style={{color:'#94a3b8',fontSize:'13px'}}>Belum ada anggaran — klik Tambah Anggaran</div>
            ):(
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                <div>
                  <p className="mb-2" style={{fontSize:'11.5px',fontWeight:600,color:'#1A77A3'}}>Pemasukan</p>
                  {budgetsWithActual.filter((b:BudgetWithActual)=>b.type==='income').map((b:BudgetWithActual)=>(
                    <BudgetBar key={b.id} item={b} canEdit={canEdit} canDelete={canDelete} onEdit={()=>{setEditBudget(b);setShowBudgetForm(true);}} onDelete={()=>setDeleteBudgetConfirm(b.id)}/>
                  ))}
                </div>
                <div>
                  <p className="mb-2" style={{fontSize:'11.5px',fontWeight:600,color:'#ef4444'}}>Pengeluaran</p>
                  {budgetsWithActual.filter((b:BudgetWithActual)=>b.type==='expense').map((b:BudgetWithActual)=>(
                    <BudgetBar key={b.id} item={b} canEdit={canEdit} canDelete={canDelete} onEdit={()=>{setEditBudget(b);setShowBudgetForm(true);}} onDelete={()=>setDeleteBudgetConfirm(b.id)}/>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: TRANSAKSI ── */}
      {tab==='transaksi'&&(
        <div className="rounded-2xl border bg-white overflow-hidden" style={{borderColor:'#e2e8f0'}}>
          <div className="flex flex-wrap items-center gap-3 p-4 border-b" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/>
              <input value={searchQ} onChange={e=>{setSearchQ(e.target.value);setPage(1);}} placeholder="Cari keterangan / kategori..."
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#7290a0]" style={{borderColor:'#e2e8f0'}}/>
            </div>
            <div className="flex gap-1">
              {([['semua','Semua'],['income','Masuk'],['expense','Keluar']] as const).map(([v,l])=>(
                <button key={v} onClick={()=>{setTxFilter(v);setPage(1);}} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{background:txFilter===v?(v==='income'?'#f0fdf4':v==='expense'?'#fef2f2':'#0a1e2c'):'#f1f5f9',color:txFilter===v?(v==='income'?'#1A77A3':v==='expense'?'#dc2626':'#fff'):'#64748b',border:txFilter===v?`1px solid ${v==='income'?'#b8d5e8':v==='expense'?'#fecaca':'transparent'}`:'1px solid transparent'}}>
                  {l}
                </button>
              ))}
            </div>
            <select value={monthFilter} onChange={e=>{setMonthFilter(Number(e.target.value));setPage(1);}} className="px-3 py-1.5 text-xs rounded-lg border focus:outline-none" style={{borderColor:'#e2e8f0',color:'#4b5563'}}>
              <option value={-1}>Semua Bulan</option>{MONTH_FULL.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
            <select value={yearFilter} onChange={e=>{setYearFilter(Number(e.target.value));setPage(1);}} className="px-3 py-1.5 text-xs rounded-lg border focus:outline-none" style={{borderColor:'#e2e8f0',color:'#4b5563'}}>
              {[2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
            <span style={{fontSize:'11.5px',color:'#94a3b8',marginLeft:'auto'}}>{filteredTx.length} transaksi</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{tableLayout:'fixed'}}>
              <thead>
                <tr style={{background:'#f6f4f0',borderBottom:'1px solid #e8e4d8'}}>
                  {[
                    {l:'Tanggal',k:'date',w:'date'},{l:'Jenis',k:'type',w:'type'},{l:'Kategori',k:'category',w:'category'},
                    {l:'Keterangan',k:'',w:'description'},{l:'Referensi',k:'',w:'reference'},{l:'Dicatat Oleh',k:'',w:'recordedBy'},{l:'Jumlah',k:'amount',w:'amount'},
                  ].map(h=>(
                    <th key={h.l} className={`px-4 py-3 text-left${h.k?' cursor-pointer select-none':''}`} style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',whiteSpace:'nowrap',width:txColW[h.w],position:'relative',overflow:'hidden',textOverflow:'ellipsis'}}
                      onClick={h.k?()=>rsTx(h.k as any):undefined}>
                      <span className="flex items-center gap-1">{h.l}{h.k&&<SortIconTx col={h.k}/>}</span>
                      <ColResizeHandle onMouseDown={startResizeTx(h.w)} />
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',width:txColW.aksi,position:'relative'}}>
                    Aksi
                    <ColResizeHandle onMouseDown={startResizeTx('aksi')} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedTxSorted.length===0?(
                  <tr><td colSpan={8} className="py-12 text-center" style={{color:'#94a3b8',fontSize:'13px'}}>Tidak ada transaksi ditemukan</td></tr>
                ):pagedTxSorted.map((r:any)=>(
                  <tr key={r.id} className="border-b hover:bg-gray-50 transition-colors" style={{borderColor:'#f8fafc'}}>
                    <td className="px-4 py-3 text-sm" style={{color:'#4b5563',whiteSpace:'nowrap'}}>{new Date(r.date).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:r.type==='income'?'#f0fdf4':'#fef2f2',color:r.type==='income'?'#1A77A3':'#dc2626'}}>
                        {r.type==='income'?<ArrowUpRight className="w-3 h-3"/>:<ArrowDownRight className="w-3 h-3"/>}
                        {r.type==='income'?'Masuk':'Keluar'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{color:'#4b5563'}}>{r.category}</td>
                    <td className="px-4 py-3 text-sm max-w-xs truncate" style={{color:'#4b5563'}}>{r.description}</td>
                    <td className="px-4 py-3 text-xs" style={{color:'#94a3b8'}}>{r.reference||'—'}</td>
                    <td className="px-4 py-3 text-xs" style={{color:'#64748b'}}>{r.recordedBy}</td>
                    <td className="px-4 py-3 text-sm font-semibold whitespace-nowrap" style={{color:r.type==='income'?'#1A77A3':'#ef4444'}}>{r.type==='income'?'+':'-'}{formatRp(r.amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {canEdit && <button onMouseDown={e=>e.preventDefault()} onClick={()=>{setEditRec(r);setShowForm(true);}} data-tooltip="Edit" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><Pencil className="w-3.5 h-3.5 text-gray-400"/></button>}
                        {canDelete && <button onClick={()=>setDeleteConfirm(r.id)} data-tooltip="Hapus" className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-400"/></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages>1&&(
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{borderColor:'#f1f5f9'}}>
              <span style={{fontSize:'12px',color:'#64748b'}}>Halaman {page} dari {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={page===1} onClick={()=>setPage(p=>p-1)} data-tooltip="Halaman Sebelumnya" className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}><ChevronLeft className="w-4 h-4 text-gray-500"/></button>
                <button disabled={page===totalPages} onClick={()=>setPage(p=>p+1)} data-tooltip="Halaman Berikutnya" className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}><ChevronRight className="w-4 h-4 text-gray-500"/></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: KAS KECIL ── */}
      {tab==='kas-kecil'&&(
        <div className="space-y-5">
          {/* Header + actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2" style={{fontSize:'16px',fontWeight:700,color:'#0f172a',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{background:'#9c9486'}}>
                  <Coins className="w-4 h-4 text-white"/>
                </div>
                Kas Kecil (Petty Cash)
              </h3>
              <p style={{fontSize:'12.5px',color:'#64748b',marginTop:2}}>Pencatatan pengeluaran operasional harian gereja</p>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setShowTopUp(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow transition-all hover:opacity-90"
                style={{background:'linear-gradient(135deg,#2563eb,#3b82f6)'}}>
                <PlusCircle className="w-4 h-4"/> Top Up Saldo
              </button>
              <button onClick={()=>{setEditPC(null);setShowPCForm(true);}}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow transition-all hover:opacity-90"
                style={{background:'#9c9486'}}>
                <Plus className="w-4 h-4"/> Catat Pengeluaran
              </button>
              <button onClick={()=>setShowTopUpHistory(p=>!p)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-all hover:bg-gray-50"
                style={{borderColor: showTopUpHistory ? '#bfdbfe' : '#e2e8f0', background: showTopUpHistory ? '#eff6ff' : 'transparent', color: showTopUpHistory ? '#2563eb' : '#374151'}}>
                <History className="w-4 h-4"/> Riwayat Top Up {pcTopUpsThisMonth.length > 0 && <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold" style={{background:'#2563eb',color:'#fff'}}>{pcTopUpsThisMonth.length}</span>}
              </button>
            </div>
          </div>

          {/* ── Top Up History Panel ── */}
          {showTopUpHistory && (
            <div className="rounded-2xl border overflow-hidden" style={{borderColor:'#bfdbfe',background:'#eff6ff'}}>
              <div className="flex items-center justify-between px-5 py-3 border-b" style={{borderColor:'#bfdbfe',background:'#dbeafe'}}>
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-blue-600"/>
                  <h4 style={{fontSize:'13px',fontWeight:600,color:'#1e40af'}}>Riwayat Top Up — {MONTH_FULL[curMonth]} {curYear}</h4>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{background:'#2563eb',color:'#fff'}}>{pcTopUpsThisMonth.length}</span>
                </div>
                <span style={{fontSize:'12px',fontWeight:700,color:'#1d4ed8'}}>Total: {formatRp(pcTotalTopUp)}</span>
              </div>
              {pcTopUpsThisMonth.length === 0 ? (
                <div className="py-8 text-center" style={{color:'#64748b',fontSize:'13px'}}>Belum ada top up bulan ini</div>
              ) : (
                <div className="divide-y" style={{borderColor:'#bfdbfe'}}>
                  {pcTopUpsThisMonth.sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).map(t=>(
                    <div key={t.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:'#2563eb'}}>
                        <PlusCircle className="w-4 h-4 text-white"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p style={{fontSize:'12.5px',fontWeight:600,color:'#1e3a8a'}}>{t.description}</p>
                          {t.approvedBy && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs" style={{background:'#dbeafe',color:'#1d4ed8'}}>
                              <BadgeCheck className="w-3 h-3"/> {t.approvedBy}
                            </span>
                          )}
                        </div>
                        <p style={{fontSize:'11px',color:'#64748b',marginTop:1}}>
                          {new Date(t.date).toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'long',year:'numeric'})}
                          {' · '}{t.source}
                          {' · '}Dicatat oleh {t.createdBy}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span style={{fontSize:'15px',fontWeight:700,color:'#1d4ed8'}}>+{formatRp(t.amount)}</span>
                        <button onClick={()=>setDeleteTopUpConfirm(t.id)}
                          data-tooltip="Hapus"
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5 text-red-400"/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* KPI cards kas kecil */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {label:'Total Dana Masuk',value:formatRp(pcTotalTopUp),sub:`${pcTopUpsThisMonth.length}x top up`,color:'#2563eb',bg:'#eff6ff',border:'#bfdbfe',icon:PlusCircle},
              {label:'Total Dipakai',value:formatRp(pcTotalSpent),sub:`${pcThisMonth.filter(r=>r.status==='Lunas').length} transaksi lunas`,color:'#dc2626',bg:'#fef2f2',border:'#fecaca',icon:ShoppingCart},
              {label:'Pending Pembayaran',value:formatRp(pcTotalPending),sub:`${pcThisMonth.filter(r=>r.status==='Pending').length} transaksi`,color:'#9c9486',bg:'#f6f4f0',border:'#e8e4d8',icon:Clock},
              {label:'Sisa Saldo',value:formatRp(Math.abs(pcBalance)),sub:pcBalance>=0?'Tersedia':'Overbudget!',color:pcBalance>=0?'#1A77A3':'#dc2626',bg:pcBalance>=0?'#f0fdf4':'#fef2f2',border:pcBalance>=0?'#b8d5e8':'#fecaca',icon:Coins},
            ].map((c,i)=>(
              <div key={i} className="rounded-2xl p-4 border" style={{background:c.bg,borderColor:c.border}}>
                <div className="flex items-start justify-between mb-2">
                  <p style={{fontSize:'11px',color:c.color,fontWeight:600}}>{c.label}</p>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{background:c.color+'20'}}>
                    <c.icon className="w-3.5 h-3.5" style={{color:c.color}}/>
                  </div>
                </div>
                <p style={{fontSize:'17px',fontWeight:700,color:'#0f172a',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{c.value}</p>
                <p style={{fontSize:'10.5px',color:'#64748b',marginTop:2}}>{(c as any).sub || `${MONTH_FULL[curMonth]} ${curYear}`}</p>
              </div>
            ))}
          </div>

          {/* Category spend breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 rounded-2xl border bg-white p-5" style={{borderColor:'#e2e8f0'}}>
              <h4 style={{fontSize:'13.5px',fontWeight:600,color:'#0f172a',marginBottom:16}}>Pengeluaran per Kategori — {MONTH_FULL[pcMonthFilter>=0?pcMonthFilter:curMonth]}</h4>
              {(() => {
                const m=pcMonthFilter>=0?pcMonthFilter:curMonth;
                const recs=pettyCash.filter(r=>new Date(r.date).getMonth()===m&&r.status==='Lunas');
                const map:Record<string,number>={};recs.forEach(r=>{map[r.category]=(map[r.category]||0)+r.amount;});
                const entries=Object.entries(map).sort((a,b)=>b[1]-a[1]);
                const total=entries.reduce((s,[,v])=>s+v,0)||1;
                const catColors=['#c2baaa','#ef4444','#3b82f6','#3a7fa0','#ec4899','#14b8a6','#9c9486','#64748b'];
                if(entries.length===0) return <p style={{fontSize:'12.5px',color:'#94a3b8',textAlign:'center',padding:'24px 0'}}>Belum ada pengeluaran kas kecil bulan ini</p>;
                return entries.map(([cat,amt],i)=>{
                  const pct=(amt/total)*100;
                  return(
                    <div key={i} className="mb-3.5">
                      <div className="flex items-center gap-2 justify-between mb-1">
                        <span className="flex items-center gap-2" style={{fontSize:'12.5px',color:'#4b5563'}}>
                          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{background:catColors[i%catColors.length],display:'inline-block'}}/>
                          {cat}
                        </span>
                        <span style={{fontSize:'12px',fontWeight:600,color:'#4b5563'}}>{compactRp(amt)}</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{background:'#f1f5f9'}}>
                        <div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:catColors[i%catColors.length]}}/>
                      </div>
                      <p style={{fontSize:'10.5px',color:'#94a3b8',marginTop:1}}>{pct.toFixed(1)}% dari total</p>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Summary card */}
            <div className="rounded-2xl border bg-white p-5" style={{borderColor:'#e2e8f0'}}>
              <h4 style={{fontSize:'13.5px',fontWeight:600,color:'#0f172a',marginBottom:16}}>Ringkasan Kas Kecil</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b" style={{borderColor:'#f1f5f9'}}>
                  <span style={{fontSize:'12px',color:'#64748b'}}>Total Entri</span>
                  <span style={{fontSize:'13px',fontWeight:600,color:'#4b5563'}}>{pcThisMonth.length} transaksi</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b" style={{borderColor:'#f1f5f9'}}>
                  <span style={{fontSize:'12px',color:'#64748b'}}>Sudah Lunas</span>
                  <span style={{fontSize:'13px',fontWeight:600,color:'#1A77A3'}}>{pcThisMonth.filter(r=>r.status==='Lunas').length} transaksi</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b" style={{borderColor:'#f1f5f9'}}>
                  <span style={{fontSize:'12px',color:'#64748b'}}>Masih Pending</span>
                  <span style={{fontSize:'13px',fontWeight:600,color:'#9c9486'}}>{pcThisMonth.filter(r=>r.status==='Pending').length} transaksi</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b" style={{borderColor:'#f1f5f9'}}>
                  <span style={{fontSize:'12px',color:'#64748b'}}>Rata-rata/Transaksi</span>
                  <span style={{fontSize:'13px',fontWeight:600,color:'#4b5563'}}>{pcThisMonth.length>0?compactRp(pcTotalSpent/pcThisMonth.length):'—'}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span style={{fontSize:'12px',color:'#64748b'}}>Pengeluaran Terbesar</span>
                  <span style={{fontSize:'13px',fontWeight:600,color:'#ef4444'}}>{pcThisMonth.length>0?compactRp(Math.max(...pcThisMonth.map(r=>r.amount))):'—'}</span>
                </div>
              </div>
              {/* Balance meter */}
              <div className="mt-4 pt-4 border-t" style={{borderColor:'#f1f5f9'}}>
                <div className="flex justify-between mb-1.5">
                  <span style={{fontSize:'11.5px',color:'#64748b'}}>Penggunaan Kas Kecil</span>
                  <span style={{fontSize:'11.5px',fontWeight:600,color:pcTotalTopUp>0&&pcTotalSpent/pcTotalTopUp>0.8?'#ef4444':'#1A77A3'}}>{pcTotalTopUp>0?((pcTotalSpent/pcTotalTopUp)*100).toFixed(0):0}%</span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{background:'#f1f5f9'}}>
                  <div className="h-full rounded-full transition-all" style={{width:`${pcTotalTopUp>0?Math.min(100,(pcTotalSpent/pcTotalTopUp)*100):0}%`,background:pcTotalTopUp>0&&pcTotalSpent/pcTotalTopUp>0.8?'#ef4444':'#c2baaa'}}/>
                </div>
                <p style={{fontSize:'10.5px',color:'#94a3b8',marginTop:4}}>
                  {compactRp(pcTotalSpent)} dipakai dari {compactRp(pcTotalTopUp||0)}
                  {pcTotalTopUp===0 && <span style={{color:'#c2baaa'}}> · Belum ada top up</span>}
                </p>
              </div>
            </div>
          </div>

          {/* PC Table */}
          <div className="rounded-2xl border bg-white overflow-hidden" style={{borderColor:'#e2e8f0'}}>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 p-4 border-b" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
              <div className="relative flex-1 min-w-40">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/>
                <input value={pcSearch} onChange={e=>{setPcSearch(e.target.value);setPcPage(1);}} placeholder="Cari keterangan / penerima..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/>
              </div>
              <select value={pcMonthFilter} onChange={e=>{setPcMonthFilter(Number(e.target.value));setPcPage(1);}} className="px-3 py-1.5 text-xs rounded-lg border focus:outline-none" style={{borderColor:'#e2e8f0',color:'#4b5563'}}>
                {MONTH_FULL.map((m,i)=><option key={i} value={i}>{m}</option>)}
              </select>
              <select value={pcCatFilter} onChange={e=>{setPcCatFilter(e.target.value);setPcPage(1);}} className="px-3 py-1.5 text-xs rounded-lg border focus:outline-none" style={{borderColor:'#e2e8f0',color:'#4b5563'}}>
                <option value="">Semua Kategori</option>{PC_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <select value={pcStatusFilter} onChange={e=>{setPcStatusFilter(e.target.value as ''|'Lunas'|'Pending');setPcPage(1);}} className="px-3 py-1.5 text-xs rounded-lg border focus:outline-none" style={{borderColor:'#e2e8f0',color:'#4b5563'}}>
                <option value="">Semua Status</option><option value="Lunas">Lunas</option><option value="Pending">Pending</option>
              </select>
              <span style={{fontSize:'11.5px',color:'#94a3b8',marginLeft:'auto'}}>{filteredPC.length} entri</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full" style={{tableLayout:'fixed'}}>
                <thead>
                  <tr style={{background:'#f6f4f0',borderBottom:'1px solid #e8e4d8'}}>
                    {[
                      {l:'Tanggal',k:'date',w:'date'},{l:'Kategori',k:'category',w:'category'},{l:'Keterangan',k:'',w:'description'},
                      {l:'Dibayar Ke',k:'payTo',w:'payTo'},{l:'No. Bukti',k:'',w:'receiptNo'},{l:'Status',k:'status',w:'status'},{l:'Jumlah',k:'amount',w:'amount'},
                    ].map(h=>(
                      <th key={h.l} className={`px-4 py-3 text-left${h.k?' cursor-pointer select-none':''}`} style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',whiteSpace:'nowrap',width:pcColW[h.w],position:'relative',overflow:'hidden',textOverflow:'ellipsis'}}
                        onClick={h.k?()=>rsPC(h.k as any):undefined}>
                        <span className="flex items-center gap-1">{h.l}{h.k&&<SortIconPC col={h.k}/>}</span>
                        <ColResizeHandle onMouseDown={startResizePC(h.w)} />
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',width:pcColW.aksi,position:'relative'}}>
                      Aksi
                      <ColResizeHandle onMouseDown={startResizePC('aksi')} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPCSorted.length===0?(
                    <tr><td colSpan={8} className="py-12 text-center" style={{color:'#94a3b8',fontSize:'13px'}}>Belum ada entri kas kecil</td></tr>
                  ):pagedPCSorted.map((r)=>(
                    <tr key={r.id} className="border-b hover:bg-[#f6f4f0]/30 transition-colors" style={{borderColor:'#f2f0ea'}}>
                      <td className="px-4 py-3 text-sm" style={{color:'#4b5563',whiteSpace:'nowrap'}}>{new Date(r.date).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f6f4f0',color:'#144f6b',border:'1px solid #e8e4d8'}}>{r.category}</span>
                      </td>
                      <td className="px-4 py-3 text-sm max-w-xs" style={{color:'#4b5563'}}>{r.description}</td>
                      <td className="px-4 py-3 text-sm" style={{color:'#4b5563'}}>{r.payTo||'—'}</td>
                      <td className="px-4 py-3 text-xs font-mono" style={{color:'#64748b'}}>{r.receiptNo||'—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{background:r.status==='Lunas'?'#f0fdf4':'#f6f4f0',color:r.status==='Lunas'?'#1A77A3':'#9c9486',border:`1px solid ${r.status==='Lunas'?'#b8d5e8':'#e8e4d8'}`}}>
                          {r.status==='Lunas'?<CheckCircle2 className="w-3 h-3"/>:<Clock className="w-3 h-3"/>}{r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold whitespace-nowrap" style={{color:'#ef4444'}}>-{formatRp(r.amount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={()=>{setEditPC(r);setShowPCForm(true);}} data-tooltip="Edit" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><Pencil className="w-3.5 h-3.5 text-gray-400"/></button>
                          <button onClick={()=>setDeletePCConfirm(r.id)} data-tooltip="Hapus" className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-400"/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {pagePC.length>0&&(
                  <tfoot>
                    <tr style={{background:'#f6f4f0',borderTop:'2px solid #e8e4d8'}}>
                      <td colSpan={6} className="px-4 py-3 text-sm font-semibold" style={{color:'#144f6b'}}>Total Halaman Ini</td>
                      <td className="px-4 py-3 text-sm font-semibold" style={{color:'#ef4444'}}>-{formatRp(pagePC.reduce((s,r)=>s+r.amount,0))}</td>
                      <td/>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {pcTotalPages>1&&(
              <div className="flex items-center justify-between px-4 py-3 border-t" style={{borderColor:'#f1f5f9'}}>
                <span style={{fontSize:'12px',color:'#64748b'}}>Halaman {pcPage} dari {pcTotalPages}</span>
                <div className="flex gap-2">
                  <button disabled={pcPage===1} onClick={()=>setPcPage(p=>p-1)} data-tooltip="Halaman Sebelumnya" className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}><ChevronLeft className="w-4 h-4 text-gray-500"/></button>
                  <button disabled={pcPage===pcTotalPages} onClick={()=>setPcPage(p=>p+1)} data-tooltip="Halaman Berikutnya" className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}><ChevronRight className="w-4 h-4 text-gray-500"/></button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: REKENING BANK ── */}
      {tab==='rekening'&&(
        <div className="space-y-5">
          <div className="rounded-2xl p-5 border text-white" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',borderColor:'#1e3a2a'}}>
            <div className="flex items-start justify-between">
              <div>
                <p style={{fontSize:'12px',color:'rgba(255,255,255,0.55)',marginBottom:4}}>Total Saldo Seluruh Rekening</p>
                <p style={{fontSize:'32px',fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{formatRp(totalBankBalance)}</p>
                <p style={{fontSize:'12px',color:'rgba(255,255,255,0.45)',marginTop:4}}>{(bankAccounts||[]).length} rekening aktif · Diperbarui {new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</p>
              </div>
              {canCreate&&(
                <button onClick={()=>{setEditBa(null);setShowBaForm(true);}} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold" style={{background:'rgba(255,255,255,0.15)',color:'#fff',border:'1px solid rgba(255,255,255,0.25)'}}>
                  <Plus className="w-3.5 h-3.5"/>Tambah Rekening
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(bankAccounts||[]).map((acc:BankAccount)=>(
              <div key={acc.id} className="rounded-2xl border bg-white p-5 flex flex-col gap-3 hover:shadow-md transition-shadow" style={{borderColor:'#e2e8f0'}}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{background:acc.color}}>{(acc.bankName||'???').slice(0,3).toUpperCase()}</div>
                    <div><p style={{fontSize:'13.5px',fontWeight:600,color:'#0f172a'}}>{acc.bankName}</p><p style={{fontSize:'11px',color:'#94a3b8'}}>{acc.accountNumber}</p></div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{background:'#f0fdf4',color:'#1A77A3',border:'1px solid #b8d5e8'}}>{acc.type}</span>
                    {canEdit&&<button onClick={()=>{setEditBa(acc);setShowBaForm(true);}} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors ml-1"><Pencil className="w-3.5 h-3.5 text-gray-400"/></button>}
                    {canDelete&&<button onClick={()=>setDeleteBaConfirm(acc.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-400"/></button>}
                  </div>
                </div>
                <p style={{fontSize:'11.5px',color:'#64748b'}}>{acc.accountName}</p>
                <div className="pt-2 border-t" style={{borderColor:'#f1f5f9'}}>
                  <p style={{fontSize:'11px',color:'#94a3b8',marginBottom:2}}>Saldo</p>
                  <p style={{fontSize:'22px',fontWeight:700,color:'#0f172a',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{formatRp(acc.balance)}</p>
                  <p style={{fontSize:'10.5px',color:'#94a3b8',marginTop:4}}>Diperbarui: {new Date(acc.lastUpdated).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</p>
                </div>
              </div>
            ))}
            {(bankAccounts||[]).length===0&&(
              <div className="md:col-span-2 rounded-2xl border bg-white p-8 text-center" style={{borderColor:'#e2e8f0',color:'#94a3b8'}}>
                Belum ada rekening bank. Klik "Tambah Rekening" untuk menambahkan.
              </div>
            )}
          </div>
          {(bankAccounts||[]).length>0&&(
            <div className="rounded-2xl border bg-white p-5" style={{borderColor:'#e2e8f0'}}>
              <h3 style={{fontSize:'14px',fontWeight:600,color:'#0f172a',marginBottom:16}}>Distribusi Saldo per Rekening</h3>
              <div className="flex rounded-xl overflow-hidden h-5 mb-4">
                {(bankAccounts||[]).map((acc:BankAccount,i:number)=>{const pct=totalBankBalance>0?(acc.balance/totalBankBalance)*100:(100/(bankAccounts.length||1));return<div key={i} style={{width:`${pct}%`,background:acc.color}} title={`${acc.bankName}: ${pct.toFixed(1)}%`}/>;})}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(bankAccounts||[]).map((acc:BankAccount)=>{const pct=totalBankBalance>0?(acc.balance/totalBankBalance)*100:0;return(
                  <div key={acc.id} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{background:acc.color}}/>
                    <div><p style={{fontSize:'12px',fontWeight:500,color:'#4b5563'}}>{acc.bankName}</p><p style={{fontSize:'11px',color:'#94a3b8'}}>{pct.toFixed(1)}% · {compactRp(acc.balance)}</p></div>
                  </div>
                );})}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: LAPORAN KEUANGAN ── */}
      {tab==='laporan'&&(
        <LaporanKeuanganTab allRecords={allRecords} pettyCashBalance={pcBalance} />
      )}

      {/* ── Modals ── */}
      {showForm&&<TransactionForm initial={editRec?{date:editRec.date,type:editRec.type,category:editRec.category,amount:String(editRec.amount),description:editRec.description,reference:editRec.reference||''}:undefined} onSave={handleSave} onClose={()=>{setShowForm(false);setEditRec(null);}} bankAccounts={bankAccounts||[]}/>}

      {showPCForm&&<PettyCashForm initial={editPC?{date:editPC.date,category:editPC.category,description:editPC.description,amount:String(editPC.amount),payTo:editPC.payTo,receiptNo:editPC.receiptNo,status:editPC.status}:undefined} onSave={handlePCSave} onClose={()=>{setShowPCForm(false);setEditPC(null);}}/>}

      {showTopUp&&<TopUpModal onSave={handleTopUpSave} onClose={()=>setShowTopUp(false)} bankAccounts={bankAccounts}/>}

      {showExport&&<ExportModal curMonth={curMonth} curYear={curYear} onExportPDF={exportToPDF} onExportExcel={exportToExcel} onClose={()=>setShowExport(false)} loading={exportLoading}/>}

      {deleteTopUpConfirm&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.45)'}} onClick={()=>setDeleteTopUpConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center" onClick={e=>e.stopPropagation()} style={{transform:`translate(${offsetDelTopUp.x}px,${offsetDelTopUp.y}px)`}}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{background:'#eff6ff',cursor:'move'}} onMouseDown={onMouseDownDelTopUp}>
              <Trash2 className="w-6 h-6 text-blue-500"/>
            </div>
            <h3 style={{fontSize:'16px',fontWeight:700,color:'#0f172a',marginBottom:8}}>Hapus Riwayat Top Up?</h3>
            <p style={{fontSize:'13px',color:'#64748b',marginBottom:24}}>Data top up ini akan dihapus dan saldo kas kecil akan disesuaikan.</p>
            <div className="flex gap-3">
              <button onClick={()=>setDeleteTopUpConfirm(null)} className="flex-1 py-2.5 rounded-xl border font-medium text-gray-600 hover:bg-gray-50 transition-colors text-sm" style={{borderColor:'#e2e8f0'}}>Batal</button>
              <button onClick={()=>handleTopUpDelete(deleteTopUpConfirm)} className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90" style={{background:'#2563eb'}}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.45)'}} onClick={()=>setDeleteConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center" onClick={e=>e.stopPropagation()} style={{transform:`translate(${offsetDelConfirm.x}px,${offsetDelConfirm.y}px)`}}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{background:'#fef2f2',cursor:'move'}} onMouseDown={onMouseDownDelConfirm}><Trash2 className="w-6 h-6 text-red-500"/></div>
            <h3 style={{fontSize:'16px',fontWeight:700,color:'#0f172a',marginBottom:8}}>Hapus Transaksi?</h3>
            <p style={{fontSize:'13px',color:'#64748b',marginBottom:24}}>Data transaksi ini akan dihapus secara permanen dan tidak dapat dikembalikan.</p>
            <div className="flex gap-3">
              <button onClick={()=>setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl border font-medium text-gray-600 hover:bg-gray-50 transition-colors text-sm" style={{borderColor:'#e2e8f0'}}>Batal</button>
              <button onClick={()=>handleDelete(deleteConfirm)} className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90" style={{background:'#ef4444'}}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {deletePCConfirm&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.45)'}} onClick={()=>setDeletePCConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center" onClick={e=>e.stopPropagation()} style={{transform:`translate(${offsetDelPC.x}px,${offsetDelPC.y}px)`}}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{background:'#f6f4f0',cursor:'move'}} onMouseDown={onMouseDownDelPC}><Trash2 className="w-6 h-6 text-[#1A77A3]"/></div>
            <h3 style={{fontSize:'16px',fontWeight:700,color:'#0f172a',marginBottom:8}}>Hapus Entri Kas Kecil?</h3>
            <p style={{fontSize:'13px',color:'#64748b',marginBottom:24}}>Entri kas kecil ini akan dihapus dan tidak dapat dikembalikan.</p>
            <div className="flex gap-3">
              <button onClick={()=>setDeletePCConfirm(null)} className="flex-1 py-2.5 rounded-xl border font-medium text-gray-600 hover:bg-gray-50 transition-colors text-sm" style={{borderColor:'#e2e8f0'}}>Batal</button>
              <button onClick={()=>handlePCDelete(deletePCConfirm)} className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90" style={{background:'#c2baaa'}}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bank Account Form Modal ── */}
      {showBaForm&&<BankAccountForm initial={editBa} onSave={handleBaSave} onClose={()=>{setShowBaForm(false);setEditBa(null);}}/>}

      {deleteBaConfirm&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.45)'}} onClick={()=>setDeleteBaConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center" onClick={e=>e.stopPropagation()} style={{transform:`translate(${offsetDelBa.x}px,${offsetDelBa.y}px)`}}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{background:'#fef2f2',cursor:'move'}} onMouseDown={onMouseDownDelBa}><Trash2 className="w-6 h-6 text-red-500"/></div>
            <h3 style={{fontSize:'16px',fontWeight:700,color:'#0f172a',marginBottom:8}}>Hapus Rekening?</h3>
            <p style={{fontSize:'13px',color:'#64748b',marginBottom:24}}>Data rekening ini akan dihapus secara permanen.</p>
            <div className="flex gap-3">
              <button onClick={()=>setDeleteBaConfirm(null)} className="flex-1 py-2.5 rounded-xl border font-medium text-gray-600 hover:bg-gray-50 transition-colors text-sm" style={{borderColor:'#e2e8f0'}}>Batal</button>
              <button onClick={()=>handleBaDelete(deleteBaConfirm)} className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90" style={{background:'#ef4444'}}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Budget Form Modal ── */}
      {showBudgetForm&&<BudgetFormModal initial={editBudget} curYear={curYear} onSave={handleBudgetSave} onClose={()=>{setShowBudgetForm(false);setEditBudget(null);}}/>}

      {deleteBudgetConfirm&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.45)'}} onClick={()=>setDeleteBudgetConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center" onClick={e=>e.stopPropagation()} style={{transform:`translate(${offsetDelBudget.x}px,${offsetDelBudget.y}px)`}}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{background:'#fef2f2',cursor:'move'}} onMouseDown={onMouseDownDelBudget}><Trash2 className="w-6 h-6 text-red-500"/></div>
            <h3 style={{fontSize:'16px',fontWeight:700,color:'#0f172a',marginBottom:8}}>Hapus Anggaran?</h3>
            <p style={{fontSize:'13px',color:'#64748b',marginBottom:24}}>Item anggaran ini akan dihapus secara permanen.</p>
            <div className="flex gap-3">
              <button onClick={()=>setDeleteBudgetConfirm(null)} className="flex-1 py-2.5 rounded-xl border font-medium text-gray-600 hover:bg-gray-50 transition-colors text-sm" style={{borderColor:'#e2e8f0'}}>Batal</button>
              <button onClick={()=>handleBudgetDelete(deleteBudgetConfirm)} className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90" style={{background:'#ef4444'}}>Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── BankAccount Form ──────────────────────────────────────────────────────────
const BANK_COLORS=['#0050a0','#ff6600','#003f7c','#12a0e1','#1a9e56','#7c3aed','#db2777','#0891b2'];
function BankAccountForm({ initial, onSave, onClose }: { initial: BankAccount|null; onSave:(d:any)=>void; onClose:()=>void }) {
  const { getMasterDataByCategory } = useApp();
  const tipeRekeningList = getMasterDataByCategory('tipe_rekening').map(m => m.value);
  const TIPE_REKENING = tipeRekeningList.length ? tipeRekeningList : ['Operasional','Tabungan','Pembangunan','Diakonia'];
  const { offset, onMouseDown } = useDraggable();
  const [form,setForm]=useState({
    bankName:initial?.bankName||'',
    accountName:initial?.accountName||'',
    accountNumber:initial?.accountNumber||'',
    balance:initial?String(initial.balance):'',
    type:(initial?.type||'Operasional') as BankAccountType,
    color:initial?.color||BANK_COLORS[0],
  });
  const [err,setErr]=useState('');
  const h=(k:string,v:string)=>{setForm(p=>({...p,[k]:v}));setErr('');};
  const submit=()=>{
    if(!form.bankName||!form.accountName||!form.accountNumber){setErr('Nama bank, nama rekening, dan nomor rekening wajib diisi.');return;}
    onSave(form);
  };
  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.45)'}} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden bg-white" onClick={e=>e.stopPropagation()} style={{transform:`translate(${offset.x}px,${offset.y}px)`}}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDown}>
          <h3 className="font-semibold text-white" style={{fontSize:'15px'}}>{initial?'Edit Rekening Bank':'Tambah Rekening Bank'}</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X className="w-4 h-4"/></button>
        </div>
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Nama Bank</label>
              <input value={form.bankName} onChange={e=>h('bankName',e.target.value)} placeholder="BCA, BNI, Mandiri..." className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/></div>
            <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Jenis Rekening</label>
              <select value={form.type} onChange={e=>h('type',e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}>
                {TIPE_REKENING.map((t: string)=><option key={t} value={t}>{t}</option>)}
              </select></div>
          </div>
          <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Nama Pemilik Rekening</label>
            <input value={form.accountName} onChange={e=>h('accountName',e.target.value)} placeholder="GPIB Trinitas - Operasional" className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/></div>
          <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Nomor Rekening</label>
            <input value={form.accountNumber} onChange={e=>h('accountNumber',e.target.value)} placeholder="1234-5678-90" className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/></div>
          <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Saldo Saat Ini (Rp)</label>
            <input type="number" value={form.balance} onChange={e=>h('balance',e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/></div>
          <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Warna Identitas</label>
            <div className="flex gap-2 flex-wrap mt-1">
              {BANK_COLORS.map(c=><button key={c} onClick={()=>h('color',c)} className="w-7 h-7 rounded-full border-2 transition-all" style={{background:c,borderColor:form.color===c?'#0f172a':'transparent',transform:form.color===c?'scale(1.2)':'scale(1)'}}/>)}
            </div>
          </div>
          {err&&<div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{background:'#fef2f2',color:'#dc2626'}}><AlertCircle className="w-4 h-4 flex-shrink-0"/>{err}</div>}
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50" style={{borderColor:'#e2e8f0'}}>Batal</button>
          <button onClick={submit} className="px-5 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90" style={{background:'#1A77A3'}}>Simpan</button>
        </div>
      </div>
    </div>
  );
}

// ── Budget Form Modal ─────────────────────────────────────────────────────────
function BudgetFormModal({ initial, curYear, onSave, onClose }: { initial: Budget|null; curYear: number; onSave:(d:any)=>void; onClose:()=>void }) {
  const { offset, onMouseDown } = useDraggable();
  const [form,setForm]=useState({
    category:initial?.category||'',
    type:(initial?.type||'income') as 'income'|'expense',
    budgeted:initial?String(initial.budgeted):'',
    year:initial?.year||curYear,
  });
  const [err,setErr]=useState('');
  const h=(k:string,v:any)=>{setForm(p=>({...p,[k]:v}));setErr('');};
  const submit=()=>{
    if(!form.category||!form.budgeted){setErr('Kategori dan jumlah anggaran wajib diisi.');return;}
    onSave(form);
  };
  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.45)'}} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden bg-white" onClick={e=>e.stopPropagation()} style={{transform:`translate(${offset.x}px,${offset.y}px)`}}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',cursor:'move'}} onMouseDown={onMouseDown}>
          <h3 className="font-semibold text-white" style={{fontSize:'15px'}}>{initial?'Edit Anggaran':'Tambah Item Anggaran'}</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X className="w-4 h-4"/></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(['income','expense'] as const).map(t=>(
              <button key={t} onClick={()=>h('type',t)} className="py-2.5 rounded-xl border-2 transition-all"
                style={{borderColor:form.type===t?(t==='income'?'#1A77A3':'#ef4444'):'#e2e8f0',background:form.type===t?(t==='income'?'#f0fdf4':'#fef2f2'):'#fff',color:form.type===t?(t==='income'?'#1A77A3':'#ef4444'):'#64748b',fontSize:'13px',fontWeight:600}}>
                {t==='income'?'↑ Pemasukan':'↓ Pengeluaran'}
              </button>
            ))}
          </div>
          <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Kategori</label>
            <input value={form.category} onChange={e=>h('category',e.target.value)} placeholder="Persembahan Minggu, Gaji & Tunjangan..." className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/></div>
          <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Jumlah Anggaran (Rp)</label>
            <input type="number" value={form.budgeted} onChange={e=>h('budgeted',e.target.value)} placeholder="0" min="0" className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/></div>
          <div><label className="block mb-1" style={{fontSize:'12px',color:'#64748b',fontWeight:600}}>Tahun</label>
            <select value={form.year} onChange={e=>h('year',Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}>
              {[curYear-1,curYear,curYear+1].map(y=><option key={y} value={y}>{y}</option>)}
            </select></div>
          {err&&<div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{background:'#fef2f2',color:'#dc2626'}}><AlertCircle className="w-4 h-4 flex-shrink-0"/>{err}</div>}
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50" style={{borderColor:'#e2e8f0'}}>Batal</button>
          <button onClick={submit} className="px-5 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90" style={{background:'#1A77A3'}}>Simpan</button>
        </div>
      </div>
    </div>
  );
}
