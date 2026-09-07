import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../../lib/apiClient';
import { roleStyle } from '../../lib/familyRole';
import { Member, Attestation } from '../types';
import { ChurchAsset } from './AssetManagement';
import { AttestationForm } from './AttestationDatabase';
import { FamilyCardModal } from './FamilyDatabase';
import { SearchDropdown } from './ui/SearchDropdown';
import { useDraggable } from '../../lib/useDraggable';
import { useUnsavedChanges } from '../../lib/useUnsavedChanges';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColResizeHandle } from './ui/resizable-th';
import { normPelkat } from '../utils/pelkatUtils';
import { calcAge, liveAge } from '../../lib/age';
import { toast } from 'sonner';
import {
  Search, Plus, Eye, Pencil, Trash2, ChevronLeft, ChevronRight, IdCard,
  Users, MapPin, Filter, Download, X, AlertCircle, CheckCircle2,
  User, Calendar, Phone, Mail, Home, Droplets, Briefcase, Church,
  Heart, Baby, GraduationCap, LayoutGrid, List, ArrowUpDown,
  ArrowUp, ArrowDown, Gift, UserCheck, UserX, FileText,
  ArrowRight, ArrowLeft, Clock, RefreshCw, Ban,
  Building2, Truck, Package, Monitor, Layers, Tag, Shield,
  Upload, FolderOpen, Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' }) : '—';
const initials = (name: string) => name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
const formatBytes = (bytes: number) => {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb/1024).toFixed(2)} MB`;
};
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024; // 2MB

interface MemberDocument {
  id: string;
  memberId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileData: string; // base64
  uploadedAt: string;
  uploadedBy: string;
}

// ── Status Badge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status?: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    'Aktif':      { bg:'#f0fdf4', color:'#1A77A3' },
    'Pindah':     { bg:'#eff6ff', color:'#2563eb' },
    'Meninggal':  { bg:'#f8fafc', color:'#64748b' },
    'Tidak Aktif':{ bg:'#fef2f2', color:'#dc2626' },
  };
  const c = cfg[status||''] || { bg:'#f1f5f9', color:'#64748b' };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: c.bg, color: c.color }}>
      {status||'—'}
    </span>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────
export function AvatarMember({ name, role, size = 32 }: { name: string; role?: string; size?: number }) {
  const rs = roleStyle(role);
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, background: rs.avatarBg, color: rs.avatarText, fontSize: size * 0.35, fontWeight: 700 }}>
      {initials(name)}
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────
export function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-2 border-b" style={{ borderColor: '#f1f5f9' }}>
      <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: '#f0fdf4' }}>{icon}</div>
      <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#374151' }}>{title}</h4>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value?: string | null | React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1.5 border-b last:border-0" style={{ borderColor: '#f8fafc' }}>
      <span className="flex-shrink-0 w-36" style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 500 }}>{label}</span>
      <span className="flex-1 text-right" style={{ fontSize: '12px', color: '#1e293b', fontWeight: 500 }}>
        {value == null || value === '' ? '—' : value}
      </span>
    </div>
  );
}

// ── Asset category icon helper ────────────────────────────────────────────────
export function AssetCatIcon({ cat }: { cat: string }) {
  const cls = 'w-3.5 h-3.5';
  switch (cat) {
    case 'Tanah':            return <MapPin className={cls}/>;
    case 'Bangunan':         return <Building2 className={cls}/>;
    case 'Kendaraan':        return <Truck className={cls}/>;
    case 'Inventaris':       return <Package className={cls}/>;
    case 'Elektronik':       return <Monitor className={cls}/>;
    case 'Peralatan Ibadah': return <Church className={cls}/>;
    default:                 return <Layers className={cls}/>;
  }
}

// ── Attestation status badge ──────────────────────────────────────────────────
export function AttBadge({ status }: { status: string }) {
  const cfg: Record<string,{bg:string;color:string;icon:React.ReactNode}> = {
    'Diajukan': { bg:'#f6f4f0', color:'#9c9486', icon:<Clock className="w-2.5 h-2.5"/> },
    'Diproses': { bg:'#eff6ff', color:'#2563eb', icon:<RefreshCw className="w-2.5 h-2.5"/> },
    'Selesai':  { bg:'#f0fdf4', color:'#1A77A3', icon:<CheckCircle2 className="w-2.5 h-2.5"/> },
    'Ditolak':  { bg:'#fef2f2', color:'#dc2626', icon:<Ban className="w-2.5 h-2.5"/> },
  };
  const c = cfg[status] || { bg:'#f1f5f9', color:'#64748b', icon:null };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{background:c.bg,color:c.color}}>
      {c.icon}{status}
    </span>
  );
}

// ── DETAIL MODAL ──────────────────────────────────────────────────────────────
export function MemberDetail({ member, sectors, attestations, members, onClose, onEdit, onDelete, onViewFamily }: {
  member: Member; sectors: any[]; attestations: Attestation[];
  members: any[];
  onClose: ()=>void; onEdit: ()=>void; onDelete: ()=>void; onViewFamily?: ()=>void;
}) {
  const { can: canFn, families, currentUser } = useApp();
  const detailCanEdit   = canFn('Database Warga', 'edit');
  const detailCanDelete = canFn('Database Warga', 'delete');
  const [tab, setTab] = useState<'personal'|'gereja'|'kontak'|'kerja'|'atestasi'|'aset'|'dokumen'>('personal');
  // Drawer slide-in animation: mount closed (off-screen right), then flip open next frame.
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDrawerOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  // Lock page scroll behind the drawer while it's open, restore on close/unmount.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);
  const sector = sectors.find(s=>s.id===member.sectorId);
  const family = families.find(f=>f.id===member.familyId);
  const familyHead = family ? members.find((m:any)=>m.id===family.headMemberId) : undefined;
  const today = new Date();
  const bday = member.birthDate ? new Date(member.birthDate) : null;
  const isBdayThisMonth = bday && bday.getMonth() === today.getMonth();

  // Use attestations from context (kept in sync via API)
  const memberAttestations = useMemo(() =>
    (attestations || []).filter(a =>
      (a.memberId && a.memberId === member.id) ||
      (!a.memberId && a.memberName === member.fullName)
    ),
  [attestations, member.id, member.fullName]);

  // State for attestation shortcut form
  const [showAttForm, setShowAttForm] = useState(false);

  const handleSaveAttestation = (data: any) => {
    const newAtt: Attestation = {
      ...data,
      id: 'at' + Date.now(),
      memberId: member.id,
      memberName: member.fullName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // Save to API and notify AttestationDatabase to refresh
    api.put(`/api/data/attestations/${newAtt.id}`, newAtt)
      .catch(err => console.error('[MemberDetail] attestation save:', err));
    window.dispatchEvent(new CustomEvent('gpib:attestations:updated'));
    toast.success(`Atestasi "${data.type}" untuk ${member.fullName} berhasil diajukan`, {
      description: `Gereja Tujuan: ${data.toChurch || '—'} · Status: ${data.status}`,
      duration: 4000,
    });
    setShowAttForm(false);
  };

  // Load assets from API – match by memberId/name (managed) OR borrowedById/name (borrowed)
  const [memberAssets, setMemberAssets] = useState<ChurchAsset[]>([]);
  const [borrowedAssets, setBorrowedAssets] = useState<ChurchAsset[]>([]);
  useMemo(() => {
    api.get<ChurchAsset[]>('/api/data/churchAssets').then(all => {
      if (!all) return;
      const managed: ChurchAsset[] = [];
      const borrowed: ChurchAsset[] = [];
      all.forEach(a => {
        const isManaged = a.memberId
          ? a.memberId === member.id
          : (() => { const rp = (a.responsiblePerson||'').toLowerCase(); const nm = member.fullName.toLowerCase(); return rp && (rp.includes(nm)||nm.includes(rp)); })();
        const isBorrowed = (a.loanStatus||'Tersedia') === 'Dipinjam' && (
          (a.borrowedById && a.borrowedById === member.id) ||
          (!a.borrowedById && a.borrowedByName && a.borrowedByName.toLowerCase().includes(member.fullName.toLowerCase()))
        );
        if (isBorrowed) borrowed.push(a);
        else if (isManaged) managed.push(a);
      });
      setMemberAssets(managed);
      setBorrowedAssets(borrowed);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.id, member.fullName]);

  // Dokumentasi: PDF documents attached to this member (max 2MB each)
  const [memberDocuments, setMemberDocuments] = useState<MemberDocument[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const docFileInputRef = React.useRef<HTMLInputElement>(null);

  const loadMemberDocuments = () => {
    api.get<MemberDocument[]>('/api/data/memberDocuments').then(all => {
      setMemberDocuments((all || []).filter(d => d.memberId === member.id));
    }).catch(() => {});
  };
  useEffect(() => {
    loadMemberDocuments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.id]);

  const handleUploadDocClick = () => docFileInputRef.current?.click();

  const handleDocFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      toast.error('Hanya file PDF yang diperbolehkan');
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      toast.error(`Ukuran file melebihi batas 2MB (file ini ${formatBytes(file.size)})`);
      return;
    }
    setUploadingDoc(true);
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('Gagal membaca file'));
        reader.readAsDataURL(file);
      });
      const id = 'doc' + Date.now();
      const doc: MemberDocument = {
        id, memberId: member.id, fileName: file.name, fileSize: file.size,
        mimeType: 'application/pdf', fileData: base64,
        uploadedAt: new Date().toISOString(), uploadedBy: currentUser?.name || 'Administrator',
      };
      await api.put(`/api/data/memberDocuments/${id}`, doc);
      setMemberDocuments(prev => [doc, ...prev]);
      toast.success(`Dokumen "${file.name}" berhasil diunggah`);
    } catch (err) {
      toast.error('Gagal mengunggah dokumen. Silakan coba lagi');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleViewDocument = (doc: MemberDocument) => {
    try {
      const byteChars = atob(doc.fileData);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error('Gagal membuka dokumen');
    }
  };

  const handleDeleteDocument = async (doc: MemberDocument) => {
    if (!window.confirm(`Hapus dokumen "${doc.fileName}"?`)) return;
    try {
      await api.delete(`/api/data/memberDocuments/${doc.id}`);
      setMemberDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast.success(`Dokumen "${doc.fileName}" dihapus`);
    } catch {
      toast.error('Gagal menghapus dokumen');
    }
  };

  const TABS = [
    { id:'personal', label:'Data Pribadi',           count: null },
    { id:'gereja',   label:'Gereja & Sakramen',       count: null },
    { id:'kontak',   label:'Kontak & Alamat',         count: null },
    { id:'kerja',    label:'Pekerjaan & Kompetensi',  count: null },
    { id:'atestasi', label:'Atestasi',                count: memberAttestations.length },
    { id:'aset',     label:'Aset',                    count: memberAssets.length + borrowedAssets.length },
    { id:'dokumen',  label:'Dokumentasi',              count: memberDocuments.length },
  ] as const;

  return (
    <>
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      <div className="absolute inset-0" style={{background:'rgba(15,23,42,0.45)',backdropFilter:'blur(4px)'}} onClick={onClose} />
      <div className="relative w-full shadow-2xl overflow-hidden bg-white flex flex-col" style={{maxWidth:'520px', height:'100vh', maxHeight:'100dvh', transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)', transition:'transform 240ms ease-out'}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 flex-shrink-0" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)'}}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <AvatarMember name={member.fullName} role={member.familyRole} size={56}/>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-white font-bold" style={{fontSize:'17px'}}>{member.fullName}</h3>
                  {isBdayThisMonth && <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{background:'#f0ede5',color:'#78350f'}}>🎂 Ulang Tahun Bulan Ini</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <span style={{fontSize:'12px',color:'rgba(255,255,255,0.55)'}}>
                    No. Induk: {member.memberNumber||'—'} · {sector?.name||'—'}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {member.familyRole && (() => { const rs=roleStyle(member.familyRole); return (
                    <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{background:rs.bg,color:rs.text,border:`1px solid ${rs.border}`}}>{member.familyRole}</span>
                  );})()}
                  <StatusBadge status={member.membershipStatus}/>
                  <span className="px-2 py-0.5 rounded-full text-xs" style={{background:'rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.7)'}}>
                    {member.gender}
                  </span>
                  {member.pelkatStatus && (
                    <span className="px-2 py-0.5 rounded-full text-xs" style={{background:'rgba(255,239,178,0.2)',color:'#b8d5e8'}}>
                      {member.pelkatStatus}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {onViewFamily && <button data-tooltip="Lihat Data Keluarga" onClick={onViewFamily} className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors"><IdCard className="w-4 h-4"/></button>}
              {detailCanEdit && <button data-tooltip="Edit" onClick={onEdit} className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors"><Pencil className="w-4 h-4"/></button>}
              {detailCanDelete && <button data-tooltip="Hapus" onClick={onDelete} className="p-2 rounded-xl hover:bg-red-500/20 text-white/60 hover:text-red-300 transition-colors"><Trash2 className="w-4 h-4"/></button>}
              <button data-tooltip="Tutup" onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors"><X className="w-4 h-4"/></button>
            </div>
          </div>
          {/* Tab nav */}
          <div className="flex gap-1 mt-4 overflow-x-auto pb-0.5" style={{scrollbarWidth:'none'}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id as any)}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{background:tab===t.id?'#FFEFB2':'transparent',color:tab===t.id?'#384959':'rgba(255,255,255,0.5)'}}>
                {t.label}
                {t.count !== null && (
                  <span className="px-1.5 py-0.5 rounded-full text-xs font-bold leading-none"
                    style={{background:tab===t.id?'rgba(56,73,89,0.15)':'rgba(255,255,255,0.1)',color:tab===t.id?'#384959':'rgba(255,255,255,0.4)',fontSize:'10px'}}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab==='personal' && (
            <div className="space-y-5">
              <div>
                <SectionHeader icon={<User className="w-3.5 h-3.5 text-[#1A77A3]"/>} title="Identitas"/>
                <InfoRow label="Nama Lengkap" value={member.fullName}/>
                <InfoRow label="Nama Keluarga" value={member.familyName}/>
                <InfoRow label="Jenis Kelamin" value={member.gender}/>
                <InfoRow label="Hubungan Keluarga" value={
                  member.familyRole
                    ? (() => { const rs=roleStyle(member.familyRole); return (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{background:rs.bg,color:rs.text,border:`1px solid ${rs.border}`}}>{member.familyRole}</span>
                      );})()
                    : '—'
                }/>
                {member.familyRole==='Lainnya' && member.familyRoleOther &&
                  <InfoRow label="Status Hubungan Keluarga" value={member.familyRoleOther}/>
                }
                <InfoRow label="Nama Kepala Keluarga" value={familyHead?.fullName}/>
                <InfoRow label="Kode Keluarga" value={member.familyCode}/>
              </div>
              <div>
                <SectionHeader icon={<Calendar className="w-3.5 h-3.5 text-[#1A77A3]"/>} title="Kelahiran"/>
                <InfoRow label="Tempat Lahir" value={member.birthPlace}/>
                <InfoRow label="Tanggal Lahir" value={fmtDate(member.birthDate)}/>
                <InfoRow label="Usia" value={member.birthDate ? `${liveAge(member)} tahun` : undefined}/>
              </div>
              <div>
                <SectionHeader icon={<Heart className="w-3.5 h-3.5 text-[#1A77A3]"/>} title="Status Pernikahan"/>
                <InfoRow label="Status" value={member.maritalStatus}/>
                <InfoRow label="Tgl Nikah Gereja" value={fmtDate(member.marriageDateChurch)}/>
                <InfoRow label="Tgl Nikah Sipil" value={fmtDate(member.marriageDateCivil)}/>
              </div>
              <div>
                <SectionHeader icon={<Droplets className="w-3.5 h-3.5 text-[#1A77A3]"/>} title="Kesehatan"/>
                <InfoRow label="Golongan Darah" value={member.bloodType}/>
              </div>
            </div>
          )}
          {tab==='gereja' && (
            <div className="space-y-5">
              <div>
                <SectionHeader icon={<Church className="w-3.5 h-3.5 text-[#1A77A3]"/>} title="Keanggotaan Gereja"/>
                <InfoRow label="Status Keanggotaan" value={member.membershipStatus}/>
                <InfoRow label="Tipe Keanggotaan" value={member.membershipType}/>
                <InfoRow label="No. Induk" value={member.memberNumber}/>
                <InfoRow label="Sektor" value={sector?.name}/>
                <InfoRow label="Jabatan Pelayanan" value={member.position}/>
                <InfoRow label="Status Pelkat" value={member.pelkatStatus}/>
                <InfoRow label="Tgl Bergabung" value={fmtDate(member.joinDate)}/>
              </div>
              <div>
                <SectionHeader icon={<Baby className="w-3.5 h-3.5 text-[#1A77A3]"/>} title="Baptisan"/>
                <InfoRow label="Status Baptis" value={member.baptismStatus}/>
                <InfoRow label="Tempat Baptis" value={member.baptismPlace}/>
                <InfoRow label="Tgl Baptis" value={fmtDate(member.baptismDate)}/>
              </div>
              <div>
                <SectionHeader icon={<CheckCircle2 className="w-3.5 h-3.5 text-[#1A77A3]"/>} title="Sidi"/>
                <InfoRow label="Status Sidi" value={member.sidiStatus}/>
                <InfoRow label="Tempat Sidi" value={member.sidiPlace}/>
                <InfoRow label="Tgl Sidi" value={fmtDate(member.sidiDate)}/>
              </div>
              {member.otherHistory && (
                <div>
                  <SectionHeader icon={<FileText className="w-3.5 h-3.5 text-[#1A77A3]"/>} title="Riwayat Gerejawi"/>
                  <p style={{fontSize:'12.5px',color:'#4b5563',lineHeight:1.7}}>{member.churchExperience||'—'}</p>
                </div>
              )}
            </div>
          )}
          {tab==='kontak' && (
            <div className="space-y-5">
              <div>
                <SectionHeader icon={<Phone className="w-3.5 h-3.5 text-[#1A77A3]"/>} title="Kontak"/>
                <InfoRow label="No. Handphone" value={member.phone}/>
                <InfoRow label="No. Telp Rumah" value={member.homePhone}/>
                <InfoRow label="Email" value={member.email}/>
              </div>
              <div>
                <SectionHeader icon={<Home className="w-3.5 h-3.5 text-[#1A77A3]"/>} title="Alamat"/>
                <p style={{fontSize:'12.5px',color:'#4b5563',lineHeight:1.8}}>{member.address||'—'}</p>
              </div>
            </div>
          )}
          {tab==='kerja' && (
            <div className="space-y-5">
              <div>
                <SectionHeader icon={<GraduationCap className="w-3.5 h-3.5 text-[#1A77A3]"/>} title="Pendidikan"/>
                <InfoRow label="Pendidikan Terakhir" value={member.education}/>
                <InfoRow label="Gelar" value={member.degree}/>
                <InfoRow label="Jurusan" value={member.major}/>
              </div>
              <div>
                <SectionHeader icon={<Briefcase className="w-3.5 h-3.5 text-[#1A77A3]"/>} title="Pekerjaan"/>
                <InfoRow label="Pekerjaan" value={member.occupation}/>
                <InfoRow label="Profesi" value={member.profession}/>
                <InfoRow label="Tempat Kerja" value={member.workplace}/>
              </div>
              <div>
                <SectionHeader icon={<Users className="w-3.5 h-3.5 text-[#1A77A3]"/>} title="Kompetensi"/>
                <InfoRow label="Penguasaan Bahasa" value={member.languageSkills}/>
                <InfoRow label="Skill / Kompetensi" value={member.skills}/>
                <InfoRow label="Pengalaman Organisasi" value={member.organizationExperience}/>
                <InfoRow label="Pengalaman Gerejawi" value={member.churchExperience}/>
              </div>
            </div>
          )}

          {/* ── TAB ATESTASI ───────────────────────────────────────────── */}
          {tab==='atestasi' && <AttestationsTabContent member={member} memberAttestations={memberAttestations} onShowAttForm={()=>setShowAttForm(true)}/>}

          {/* ── TAB ASET ──────────────────────────────────────────────── */}
          {tab==='aset' && <AssetsTabContent memberAssets={memberAssets} borrowedAssets={borrowedAssets}/>}

          {/* ── TAB DOKUMENTASI ──────────────────────────────────────── */}
          {tab==='dokumen' && (
            <DocumentsTabContent
              memberDocuments={memberDocuments} canEdit={detailCanEdit} canDelete={detailCanDelete}
              uploadingDoc={uploadingDoc} docFileInputRef={docFileInputRef}
              onUploadClick={handleUploadDocClick} onFileSelected={handleDocFileSelected}
              onViewDocument={handleViewDocument} onDeleteDocument={handleDeleteDocument}
            />
          )}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-3 flex-shrink-0" style={{borderColor:'#f1f5f9'}}>
          {detailCanEdit && (
            <button onClick={onEdit} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90" style={{background:'#1A77A3'}}>
              <Pencil className="w-3.5 h-3.5"/> Edit Data
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}>Tutup</button>
        </div>
      </div>
    </div>
    {showAttForm && (
      <AttestationForm
        initial={{ memberId: member.id, memberName: member.fullName }}
        members={members}
        onSave={handleSaveAttestation}
        onClose={() => setShowAttForm(false)}
      />
    )}
    </>
  );
}
// ── Shared tab panels (dipakai di MemberDetail & MemberForm agar tampilan konsisten) ──
function AttestationsTabContent({ member, memberAttestations, onShowAttForm }: {
  member: Member; memberAttestations: Attestation[]; onShowAttForm: () => void;
}) {
  return (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{background:'#f0fdf4'}}>
                    <FileText className="w-3.5 h-3.5 text-[#1A77A3]"/>
                  </div>
                  <h4 style={{fontSize:'13px',fontWeight:700,color:'#4b5563'}}>Riwayat Atestasi</h4>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{background:'#f0fdf4',color:'#1A77A3'}}>
                    {memberAttestations.length} catatan
                  </span>
                  <button
                    onClick={() => onShowAttForm()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
                    style={{background:'#9c9486',color:'#fff',boxShadow:'0 1px 4px rgba(217,119,6,0.3)'}}>
                    <Plus className="w-3 h-3"/> Ajukan Atestasi
                  </button>
                </div>
              </div>

              {memberAttestations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 rounded-2xl" style={{background:'#f8fafc',border:'1.5px dashed #e2e8f0'}}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{background:'#f1f5f9'}}>
                    <FileText className="w-6 h-6" style={{color:'#cbd5e1'}}/>
                  </div>
                  <p style={{fontSize:'13px',fontWeight:600,color:'#94a3b8'}}>Belum ada data atestasi</p>
                  <p style={{fontSize:'12px',color:'#cbd5e1',marginTop:4,marginBottom:12}}>Riwayat atestasi anggota ini akan muncul di sini</p>
                  <button
                    onClick={() => onShowAttForm()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
                    style={{background:'#9c9486',color:'#fff'}}>
                    <Plus className="w-3.5 h-3.5"/> Ajukan Atestasi Baru
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {memberAttestations.map(att => {
                    const isIn = att.type === 'Pindah Masuk';
                    return (
                      <div key={att.id} className="rounded-xl border overflow-hidden" style={{borderColor:'#e2e8f0'}}>
                        {/* Card header */}
                        <div className="px-4 py-3 flex items-center justify-between" style={{background: isIn ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : 'linear-gradient(135deg,#f6f4f0,#fef3c7)'}}>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{background: isIn ? '#1A77A3' : '#9c9486'}}>
                              {isIn ? <ArrowRight className="w-3.5 h-3.5 text-white"/> : <ArrowLeft className="w-3.5 h-3.5 text-white"/>}
                            </div>
                            <div>
                              <p style={{fontSize:'12.5px',fontWeight:700,color: isIn ? '#1A77A3' : '#9c9486'}}>{att.type}</p>
                              {att.letterNumber && <p style={{fontSize:'10.5px',color:'#94a3b8'}}>Surat: {att.letterNumber}</p>}
                            </div>
                          </div>
                          <AttBadge status={att.status}/>
                        </div>
                        {/* Card body */}
                        <div className="px-4 py-3 space-y-2" style={{background:'#fff'}}>
                          <div className="flex gap-2">
                            <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,width:80,flexShrink:0}}>Dari Gereja</span>
                            <span style={{fontSize:'11.5px',color:'#334155',fontWeight:500,flex:1}}>{att.fromChurch || '—'}</span>
                          </div>
                          <div className="flex gap-2">
                            <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,width:80,flexShrink:0}}>Ke Gereja</span>
                            <span style={{fontSize:'11.5px',color:'#334155',fontWeight:500,flex:1}}>{att.toChurch || '—'}</span>
                          </div>
                          <div className="flex gap-2">
                            <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,width:80,flexShrink:0}}>Alasan</span>
                            <span style={{fontSize:'11.5px',color:'#4b5563',flex:1,lineHeight:1.5}}>{att.reason || '—'}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-6 gap-y-1 pt-1 border-t" style={{borderColor:'#f1f5f9'}}>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3 h-3 text-gray-400"/>
                              <span style={{fontSize:'10.5px',color:'#64748b'}}>Diajukan: {fmtDate(att.requestDate)}</span>
                            </div>
                            {att.completedDate && (
                              <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3 h-3 text-[#3a7fa0]"/>
                                <span style={{fontSize:'10.5px',color:'#64748b'}}>Selesai: {fmtDate(att.completedDate)}</span>
                              </div>
                            )}
                          </div>
                          {att.notes && (
                            <div className="px-3 py-2 rounded-lg mt-1" style={{background:'#f8fafc',border:'1px solid #f1f5f9'}}>
                              <p style={{fontSize:'11px',color:'#64748b',lineHeight:1.6}}>📝 {att.notes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
  );
}

function AssetsTabContent({ memberAssets, borrowedAssets }: {
  memberAssets: ChurchAsset[]; borrowedAssets: ChurchAsset[];
}) {
            const condCfg: Record<string,{text:string;bg:string;border:string}> = {
              'Baik':         {text:'#1A77A3',bg:'#f0fdf4',border:'#b8d5e8'},
              'Cukup Baik':   {text:'#2563eb',bg:'#eff6ff',border:'#bfdbfe'},
              'Rusak Ringan': {text:'#9c9486',bg:'#f6f4f0',border:'#e8e4d8'},
              'Rusak Berat':  {text:'#dc2626',bg:'#fef2f2',border:'#fecaca'},
              'Tidak Layak':  {text:'#7f1d1d',bg:'#fff1f2',border:'#fca5a5'},
            };
            const catColorMap: Record<string,string> = {
              'Tanah':'#3a7fa0','Bangunan':'#3b82f6','Kendaraan':'#c2baaa',
              'Inventaris':'#64748b','Elektronik':'#06b6d4','Peralatan Ibadah':'#1A77A3','Lainnya':'#ec4899'
            };
            const fmtShort = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : '—';
            const isOD = (a: any) => (a.loanStatus||'Tersedia')==='Dipinjam' && a.expectedReturnDate && new Date(a.expectedReturnDate).getTime() < Date.now();

            const AssetCard = ({ asset, mode }: { asset: any; mode: 'managed'|'borrowed' }) => {
              const cond = condCfg[asset.condition] || {text:'#64748b',bg:'#f8fafc',border:'#e2e8f0'};
              const catColor = catColorMap[asset.category] || '#64748b';
              const od = mode === 'borrowed' && isOD(asset);
              return (
                <div className="rounded-xl border overflow-hidden relative" style={{borderColor: od ? '#fca5a5' : '#e2e8f0'}}>
                  {od && <div className="absolute left-0 top-0 bottom-0 w-1" style={{background:'#dc2626'}}/>}
                  <div className="px-4 py-3 flex items-center gap-3"
                    style={{background: od ? '#fff5f5' : mode==='borrowed' ? '#f6f4f0' : undefined}}>
                    {asset.photo ? (
                      <img src={asset.photo} alt={asset.name}
                        className="w-9 h-9 rounded-xl object-cover flex-shrink-0 border"
                        style={{borderColor:'#e2e8f0'}}
                        onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
                    ) : (
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{background:`${catColor}15`,color:catColor}}>
                        <AssetCatIcon cat={asset.category}/>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p data-tooltip={asset.name} data-tooltip-truncate style={{fontSize:'12.5px',fontWeight:700,color:'#334155'}} className="truncate">{asset.name}</p>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0"
                          style={{color:cond.text,background:cond.bg,borderColor:cond.border}}>
                          {asset.condition}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{background:`${catColor}10`,color:catColor}}>
                          {asset.category}
                        </span>
                        <span style={{fontSize:'11px',color:'#94a3b8'}}>#{asset.assetCode}</span>
                        {mode==='borrowed' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{background: od ? '#fef2f2' : '#f6f4f0',color: od ? '#dc2626' : '#9c9486',border:`1px solid ${od ? '#fca5a5' : '#e8e4d8'}`}}>
                            {od ? '⚠ Jatuh Tempo' : '↗ Dipinjam'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="px-4 py-3 border-t space-y-1.5" style={{background:'#fafbfc',borderColor:'#f1f5f9'}}>
                    <div className="flex gap-2">
                      <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,width:80,flexShrink:0}}>Lokasi</span>
                      <span style={{fontSize:'11.5px',color:'#4b5563',flex:1}}>{asset.location || '—'}</span>
                    </div>
                    {mode==='borrowed' && (
                      <>
                        {asset.loanDate && (
                          <div className="flex gap-2">
                            <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,width:80,flexShrink:0}}>Tgl Pinjam</span>
                            <span style={{fontSize:'11.5px',color:'#4b5563',flex:1}}>{fmtShort(asset.loanDate)}</span>
                          </div>
                        )}
                        {asset.expectedReturnDate && (
                          <div className="flex gap-2">
                            <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,width:80,flexShrink:0}}>Est. Kembali</span>
                            <span style={{fontSize:'11.5px',flex:1,fontWeight: od ? 700 : 400, color: od ? '#dc2626' : '#374151'}}>
                              {fmtShort(asset.expectedReturnDate)}{od ? ' ⚠' : ''}
                            </span>
                          </div>
                        )}
                        {asset.loanNotes && (
                          <div className="flex gap-2">
                            <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,width:80,flexShrink:0}}>Catatan</span>
                            <span style={{fontSize:'11px',color:'#64748b',flex:1,fontStyle:'italic'}}>{asset.loanNotes}</span>
                          </div>
                        )}
                      </>
                    )}
                    {mode==='managed' && (
                      <>
                        {asset.ministryUnit && (
                          <div className="flex gap-2">
                            <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,width:80,flexShrink:0}}>Unit</span>
                            <span style={{fontSize:'11.5px',color:'#4b5563',flex:1}}>{asset.ministryUnit}</span>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,width:80,flexShrink:0}}>Diperoleh</span>
                          <span style={{fontSize:'11.5px',color:'#4b5563',flex:1}}>{fmtDate(asset.acquisitionDate)}</span>
                        </div>
                        {asset.serialNumber && asset.serialNumber !== '-' && (
                          <div className="flex gap-2">
                            <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,width:80,flexShrink:0}}>Serial</span>
                            <span style={{fontSize:'11.5px',color:'#4b5563',flex:1,fontFamily:'monospace'}}>{asset.serialNumber}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            };

            const totalCount = memberAssets.length + borrowedAssets.length;
            const overdueCount = borrowedAssets.filter(a => isOD(a)).length;

            return (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{background:'#f0fdf4'}}>
                      <Shield className="w-3.5 h-3.5 text-[#1A77A3]"/>
                    </div>
                    <h4 style={{fontSize:'13px',fontWeight:700,color:'#4b5563'}}>Aset Terkait</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    {overdueCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5'}}>
                        ⚠ {overdueCount} jatuh tempo
                      </span>
                    )}
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{background:'#f0fdf4',color:'#1A77A3'}}>
                      {totalCount} aset
                    </span>
                  </div>
                </div>

                {/* Overdue alert */}
                {overdueCount > 0 && (
                  <div className="rounded-xl p-3 flex items-center gap-3" style={{background:'#fef2f2',border:'1px solid #fca5a5'}}>
                    <AlertCircle className="w-4 h-4 flex-shrink-0" style={{color:'#dc2626'}}/>
                    <p style={{fontSize:'12px',color:'#dc2626',fontWeight:600}}>
                      Jemaat ini memiliki {overdueCount} aset pinjaman yang melewati batas tanggal pengembalian. Segera tindak lanjuti.
                    </p>
                  </div>
                )}

                {totalCount === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 rounded-2xl" style={{background:'#f8fafc',border:'1.5px dashed #e2e8f0'}}>
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{background:'#f1f5f9'}}>
                      <Package className="w-6 h-6" style={{color:'#cbd5e1'}}/>
                    </div>
                    <p style={{fontSize:'13px',fontWeight:600,color:'#94a3b8'}}>Tidak ada aset terkait</p>
                    <p style={{fontSize:'12px',color:'#cbd5e1',marginTop:4}}>Aset yang dikelola atau dipinjam anggota ini akan muncul di sini</p>
                  </div>
                )}

                {/* Borrowed assets section */}
                {borrowedAssets.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2 pb-1 border-b" style={{borderColor:'#f1f5f9'}}>
                      <div className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0" style={{background:'#f6f4f0'}}>
                        <Tag className="w-3 h-3" style={{color:'#9c9486'}}/>
                      </div>
                      <span style={{fontSize:'12px',fontWeight:700,color:'#9c9486'}}>Sedang Dipinjam ({borrowedAssets.length})</span>
                    </div>
                    <div className="space-y-2">
                      {borrowedAssets.map(a => <AssetCard key={a.id} asset={a} mode="borrowed"/>)}
                    </div>
                  </div>
                )}

                {/* Managed assets section */}
                {memberAssets.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2 pb-1 border-b" style={{borderColor:'#f1f5f9'}}>
                      <div className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0" style={{background:'#f0fdf4'}}>
                        <Shield className="w-3 h-3 text-[#1A77A3]"/>
                      </div>
                      <span style={{fontSize:'12px',fontWeight:700,color:'#1A77A3'}}>Dikelola / Penanggung Jawab ({memberAssets.length})</span>
                    </div>
                    <div className="space-y-2">
                      {memberAssets.map(a => <AssetCard key={a.id} asset={a} mode="managed"/>)}
                    </div>
                  </div>
                )}
              </div>
            );
}

function DocumentsTabContent({ memberDocuments, canEdit, canDelete, uploadingDoc, docFileInputRef, onUploadClick, onFileSelected, onViewDocument, onDeleteDocument }: {
  memberDocuments: MemberDocument[]; canEdit: boolean; canDelete: boolean; uploadingDoc: boolean;
  docFileInputRef: React.RefObject<HTMLInputElement>; onUploadClick: () => void;
  onFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onViewDocument: (doc: MemberDocument) => void; onDeleteDocument: (doc: MemberDocument) => void;
}) {
  return (
            <div className="space-y-4">
              <input ref={docFileInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFileSelected}/>
              {canEdit && (
                <button onClick={onUploadClick} disabled={uploadingDoc}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-semibold transition-colors disabled:opacity-60"
                  style={{borderColor:'#b8d5e8',color:'#1A77A3',background:'#f0fdf4'}}>
                  {uploadingDoc ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
                  {uploadingDoc ? 'Mengunggah...' : 'Unggah Dokumen PDF'}
                </button>
              )}
              <p style={{fontSize:'11px',color:'#94a3b8'}}>Format PDF, maksimal 2MB per file.</p>

              {memberDocuments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 rounded-2xl" style={{background:'#f8fafc',border:'1.5px dashed #e2e8f0'}}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{background:'#f1f5f9'}}>
                    <FolderOpen className="w-6 h-6" style={{color:'#cbd5e1'}}/>
                  </div>
                  <p style={{fontSize:'13px',fontWeight:600,color:'#94a3b8'}}>Belum ada dokumen</p>
                  <p style={{fontSize:'12px',color:'#cbd5e1',marginTop:4}}>Dokumen PDF jemaat ini akan muncul di sini</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {memberDocuments.map(doc => (
                    <div key={doc.id} className="rounded-xl border px-4 py-3 flex items-center gap-3" style={{borderColor:'#e2e8f0'}}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:'#fef2f2',color:'#dc2626'}}>
                        <FileText className="w-4 h-4"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p data-tooltip={doc.fileName} data-tooltip-truncate style={{fontSize:'12.5px',fontWeight:700,color:'#334155'}} className="truncate">{doc.fileName}</p>
                        <p style={{fontSize:'11px',color:'#94a3b8'}}>{formatBytes(doc.fileSize)} · {fmtDate(doc.uploadedAt)} · {doc.uploadedBy}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button data-tooltip="Lihat" onClick={()=>onViewDocument(doc)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-[#1A77A3] transition-colors"><Eye className="w-4 h-4"/></button>
                        {canDelete && (
                          <button data-tooltip="Hapus" onClick={()=>onDeleteDocument(doc)} className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4"/></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
  );
}


// ── MEMBER FORM ───────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  familyCode:'', memberNumber:'', firstName:'', lastName:'', familyName:'',
  gender:'Laki-laki' as 'Laki-laki'|'Perempuan', familyRole:'', familyRoleOther:'',
  birthPlace:'', birthDate:'',
  baptismStatus:'Belum' as 'Sudah'|'Belum', baptismPlace:'', baptismDate:'',
  sidiStatus:'Belum' as 'Sudah'|'Belum', sidiPlace:'', sidiDate:'',
  maritalStatus:'Belum Menikah' as any, marriageDateChurch:'', marriageDateCivil:'',
  bloodType:'' as any, education:'', degree:'', major:'',
  occupation:'', profession:'', workplace:'',
  organizationExperience:'', churchExperience:'', languageSkills:'', skills:'',
  homePhone:'', phone:'', email:'',
  position:'', pelkatStatus:'', familyId:'', sectorId:'', address:'',
  membershipStatus:'Aktif' as any, membershipType:'Warga Jemaat' as any,
  joinDate:'', notes:'', otherHistory:''
};

// ── MemberField — module level agar tidak re-mount tiap render ──────────────
function MemberField({ label, value, onChange, type='text', opts, required, autoFocus }: {
  label:string; value:string; onChange:(v:string)=>void;
  type?:string; opts?:string[]; required?:boolean; autoFocus?:boolean;
}) {
  return (
    <div>
      <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {opts ? (
        <select autoFocus={autoFocus} value={value} onChange={e=>onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}>
          <option value="">— Pilih —</option>
          {opts.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input autoFocus={autoFocus} type={type} value={value} onChange={e=>onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/>
      )}
    </div>
  );
}

function MemberForm({ mode, initial, sectors, families, attestations, members, onSave, onClose }: {
  mode:'add'|'edit'; initial?: Partial<typeof EMPTY_FORM>;
  sectors:any[]; families:any[]; attestations:Attestation[]; members:any[];
  onSave:(data:typeof EMPTY_FORM)=>void; onClose:()=>void;
}) {
  const { offset, onMouseDown } = useDraggable();
  const { getMasterDataByCategory, can: canFn, currentUser } = useApp();
  const editCanEdit   = canFn('Database Warga', 'edit');
  const editCanDelete = canFn('Database Warga', 'delete');
  const editMember = mode === 'edit' ? (initial as any as Member) : undefined;
  const jabatanOpts    = getMasterDataByCategory('jabatan_pelayanan').map(m => m.value);
  const pelkatOpts     = getMasterDataByCategory('pelkat').map(m => m.value);
  const pendidikanOpts = getMasterDataByCategory('pendidikan').map(m => m.value);
  const statusPernikahanOpts = getMasterDataByCategory('status_pernikahan').map(m => m.value);
  const tipeKeanggotaanOpts  = getMasterDataByCategory('tipe_keanggotaan').map(m => m.value);
  const golonganDarahOpts    = getMasterDataByCategory('golongan_darah').map(m => m.value);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM, ...initial });
  const [tab, setTab] = useState<'identitas'|'gereja'|'kontak'|'kerja'|'atestasi'|'aset'|'dokumen'>('identitas');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const h = (k:string,v:any)=>{ setForm(p=>({...p,[k]:v})); setIsDirty(true); };
  useUnsavedChanges(isDirty);

  // ── Atestasi / Aset / Dokumentasi (mode edit) — sama seperti MemberDetail agar tampilan konsisten ──
  const memberAttestations = useMemo(() =>
    editMember ? (attestations || []).filter(a =>
      (a.memberId && a.memberId === editMember.id) ||
      (!a.memberId && a.memberName === editMember.fullName)
    ) : [],
  [attestations, editMember]);

  const [showAttForm, setShowAttForm] = useState(false);

  const handleSaveAttestation = (data: any) => {
    if (!editMember) return;
    const newAtt: Attestation = {
      ...data,
      id: 'at' + Date.now(),
      memberId: editMember.id,
      memberName: editMember.fullName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    api.put(`/api/data/attestations/${newAtt.id}`, newAtt)
      .catch(err => console.error('[MemberForm] attestation save:', err));
    window.dispatchEvent(new CustomEvent('gpib:attestations:updated'));
    toast.success(`Atestasi "${data.type}" untuk ${editMember.fullName} berhasil diajukan`, {
      description: `Gereja Tujuan: ${data.toChurch || '—'} · Status: ${data.status}`,
      duration: 4000,
    });
    setShowAttForm(false);
  };

  const [memberAssets, setMemberAssets] = useState<ChurchAsset[]>([]);
  const [borrowedAssets, setBorrowedAssets] = useState<ChurchAsset[]>([]);
  useMemo(() => {
    if (!editMember) return;
    api.get<ChurchAsset[]>('/api/data/churchAssets').then(all => {
      if (!all) return;
      const managed: ChurchAsset[] = [];
      const borrowed: ChurchAsset[] = [];
      all.forEach(a => {
        const isManaged = a.memberId
          ? a.memberId === editMember.id
          : (() => { const rp = (a.responsiblePerson||'').toLowerCase(); const nm = editMember.fullName.toLowerCase(); return rp && (rp.includes(nm)||nm.includes(rp)); })();
        const isBorrowed = (a.loanStatus||'Tersedia') === 'Dipinjam' && (
          (a.borrowedById && a.borrowedById === editMember.id) ||
          (!a.borrowedById && a.borrowedByName && a.borrowedByName.toLowerCase().includes(editMember.fullName.toLowerCase()))
        );
        if (isBorrowed) borrowed.push(a);
        else if (isManaged) managed.push(a);
      });
      setMemberAssets(managed);
      setBorrowedAssets(borrowed);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMember?.id, editMember?.fullName]);

  const [memberDocuments, setMemberDocuments] = useState<MemberDocument[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const docFileInputRef = React.useRef<HTMLInputElement>(null);

  const loadMemberDocuments = () => {
    if (!editMember) return;
    api.get<MemberDocument[]>('/api/data/memberDocuments').then(all => {
      setMemberDocuments((all || []).filter(d => d.memberId === editMember.id));
    }).catch(() => {});
  };
  useEffect(() => {
    loadMemberDocuments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMember?.id]);

  const handleUploadDocClick = () => docFileInputRef.current?.click();

  const handleDocFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editMember) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      toast.error('Hanya file PDF yang diperbolehkan');
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      toast.error(`Ukuran file melebihi batas 2MB (file ini ${formatBytes(file.size)})`);
      return;
    }
    setUploadingDoc(true);
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('Gagal membaca file'));
        reader.readAsDataURL(file);
      });
      const id = 'doc' + Date.now();
      const doc: MemberDocument = {
        id, memberId: editMember.id, fileName: file.name, fileSize: file.size,
        mimeType: 'application/pdf', fileData: base64,
        uploadedAt: new Date().toISOString(), uploadedBy: currentUser?.name || 'Administrator',
      };
      await api.put(`/api/data/memberDocuments/${id}`, doc);
      setMemberDocuments(prev => [doc, ...prev]);
      toast.success(`Dokumen "${file.name}" berhasil diunggah`);
    } catch (err) {
      toast.error('Gagal mengunggah dokumen. Silakan coba lagi');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleViewDocument = (doc: MemberDocument) => {
    try {
      const byteChars = atob(doc.fileData);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error('Gagal membuka dokumen');
    }
  };

  const handleDeleteDocument = async (doc: MemberDocument) => {
    if (!window.confirm(`Hapus dokumen "${doc.fileName}"?`)) return;
    try {
      await api.delete(`/api/data/memberDocuments/${doc.id}`);
      setMemberDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast.success(`Dokumen "${doc.fileName}" dihapus`);
    } catch {
      toast.error('Gagal menghapus dokumen');
    }
  };

  const validate = () => {
    if(!form.firstName) return 'Nama depan wajib diisi';
    if(!form.gender) return 'Jenis kelamin wajib dipilih';
    if(!form.birthDate) return 'Tanggal lahir wajib diisi';
    if(!form.sectorId) return 'Sektor wajib dipilih';
    if(form.baptismDate && form.birthDate && new Date(form.baptismDate) < new Date(form.birthDate))
      return 'Tanggal baptis tidak boleh sebelum tanggal lahir';
    if(form.sidiDate && form.baptismDate && new Date(form.sidiDate) < new Date(form.baptismDate))
      return 'Tanggal sidi tidak boleh sebelum tanggal baptis';
    if(form.marriageDateChurch && form.birthDate && new Date(form.marriageDateChurch) < new Date(form.birthDate))
      return 'Tanggal nikah tidak boleh sebelum tanggal lahir';
    if(form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      return 'Format email tidak valid';
    if(form.phone && !/^[0-9+\-()./ ]{7,25}$/.test(form.phone))
      return 'Format nomor HP tidak valid (contoh: 08123456789)';
    if(form.homePhone && !/^[0-9+\-()./ ]{7,25}$/.test(form.homePhone))
      return 'Format nomor telepon rumah tidak valid';
    return '';
  };
  const submit = () => {
    const e = validate(); if(e){setErr(e);return;}
    setIsDirty(false);
    setSubmitting(true);
    onSave(form);
  };



  const TABS: {id: typeof tab; label: string}[] = editMember
    ? [{id:'identitas',label:'Identitas'},{id:'gereja',label:'Gereja'},{id:'kontak',label:'Kontak'},{id:'kerja',label:'Kerja'},{id:'atestasi',label:'Atestasi'},{id:'aset',label:'Aset'},{id:'dokumen',label:'Dokumentasi'}]
    : [{id:'identitas',label:'Identitas'},{id:'gereja',label:'Gereja'},{id:'kontak',label:'Kontak'},{id:'kerja',label:'Kerja'}];

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" style={{maxHeight:'92vh', transform:`translate(${offset.x}px,${offset.y}px)`}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-4 flex-shrink-0 border-b" style={{background:'linear-gradient(135deg,#0a1e2c,#0f2d41)',borderColor:'#1e3a2a',cursor:'move'}} onMouseDown={onMouseDown}>
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold" style={{fontSize:'15px'}}>{mode==='add'?'Tambah Anggota Baru':'Edit Data Anggota'}</h3>
            <button data-tooltip="Tutup" onClick={onClose} className="text-white/50 hover:text-white transition-colors"><X className="w-4 h-4"/></button>
          </div>
          <div className="flex gap-1 mt-3">
            {TABS.map(t=>(
              <button key={t.id} onMouseDown={e=>e.preventDefault()} onClick={()=>setTab(t.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{background:tab===t.id?'#FFEFB2':'transparent',color:tab===t.id?'#384959':'rgba(255,255,255,0.5)'}}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab==='identitas' && (
            <div className="grid grid-cols-2 gap-4">
              <MemberField label="Nama Depan" value={form.firstName} onChange={v=>h('firstName',v)} required autoFocus/>
              <MemberField label="Nama Belakang" value={form.lastName} onChange={v=>h('lastName',v)}/>
              <MemberField label="Nama Keluarga (Marga)" value={form.familyName} onChange={v=>h('familyName',v)}/>
              <MemberField label="Jenis Kelamin" value={form.gender} onChange={v=>h('gender',v)} opts={['Laki-laki','Perempuan']} required/>
              <MemberField label="Hubungan Keluarga" value={form.familyRole} onChange={v=>h('familyRole',v)} opts={['KK','Istri','Anak','Orang Tua','Lainnya']}/>
              <MemberField label="Tempat Lahir" value={form.birthPlace} onChange={v=>h('birthPlace',v)}/>
              {form.familyRole==='Lainnya' && (
                <div className="col-span-2">
                  <MemberField label="Status Hubungan Keluarga" value={form.familyRoleOther||''} onChange={v=>h('familyRoleOther',v)}/>
                </div>
              )}
              <MemberField label="Tanggal Lahir" value={form.birthDate} onChange={v=>h('birthDate',v)} type="date" required/>
              <MemberField label="Gol. Darah" value={form.bloodType} onChange={v=>h('bloodType',v)} opts={golonganDarahOpts.length ? golonganDarahOpts : ['A','B','AB','O','A+','A-','B+','B-','AB+','AB-','O+','O-']}/>
              <MemberField label="Status Pernikahan" value={form.maritalStatus} onChange={v=>h('maritalStatus',v)} opts={statusPernikahanOpts.length ? statusPernikahanOpts : ['Belum Menikah','Menikah','Duda','Janda']}/>
              <MemberField label="Tgl Nikah Gereja" value={form.marriageDateChurch} onChange={v=>h('marriageDateChurch',v)} type="date"/>
              <MemberField label="Tgl Nikah Sipil" value={form.marriageDateCivil} onChange={v=>h('marriageDateCivil',v)} type="date"/>
            </div>
          )}
          {tab==='gereja' && (
            <div className="grid grid-cols-2 gap-4">
              <MemberField label="No. Induk" value={form.memberNumber} onChange={v=>h('memberNumber',v)} autoFocus/>
              <MemberField label="Kode Keluarga" value={form.familyCode} onChange={v=>h('familyCode',v)}/>
              <div>
                <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Sektor<span className="text-red-400 ml-0.5">*</span></label>
                <select value={form.sectorId} onChange={e=>h('sectorId',e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}>
                  <option value="">— Pilih Sektor —</option>
                  {[...sectors].sort((a,b)=>a.name.localeCompare(b.name,'id',{numeric:true})).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <MemberField label="Tipe Keanggotaan" value={form.membershipType} onChange={v=>h('membershipType',v)} opts={tipeKeanggotaanOpts.length ? tipeKeanggotaanOpts : ['Warga Jemaat','Warga Tamu','Simpatisan']}/>
              <MemberField label="Status Keanggotaan" value={form.membershipStatus} onChange={v=>h('membershipStatus',v)} opts={['Aktif','Pindah','Meninggal','Tidak Aktif']}/>
              <MemberField label="Status Pelkat" value={form.pelkatStatus} onChange={v=>h('pelkatStatus',v)} opts={pelkatOpts.length ? pelkatOpts : ['PELKAT-PA','PELKAT-PT','PELKAT-GP','PELKAT-PKB','PELKAT-PKP','PELKAT-PKLU']}/>
              <MemberField label="Jabatan Pelayanan" value={form.position} onChange={v=>h('position',v)} opts={jabatanOpts.length ? jabatanOpts : undefined}/>
              <MemberField label="Tgl Bergabung" value={form.joinDate} onChange={v=>h('joinDate',v)} type="date"/>
              <MemberField label="Status Baptis" value={form.baptismStatus} onChange={v=>h('baptismStatus',v)} opts={['Sudah','Belum']}/>
              <MemberField label="Tgl Baptis" value={form.baptismDate} onChange={v=>h('baptismDate',v)} type="date"/>
              <MemberField label="Tempat Baptis" value={form.baptismPlace} onChange={v=>h('baptismPlace',v)}/>
              <MemberField label="Status Sidi" value={form.sidiStatus} onChange={v=>h('sidiStatus',v)} opts={['Sudah','Belum']}/>
              <MemberField label="Tgl Sidi" value={form.sidiDate} onChange={v=>h('sidiDate',v)} type="date"/>
              <MemberField label="Tempat Sidi" value={form.sidiPlace} onChange={v=>h('sidiPlace',v)}/>
            </div>
          )}
          {tab==='kontak' && (
            <div className="grid grid-cols-2 gap-4">
              <MemberField label="No. Handphone" value={form.phone} onChange={v=>h('phone',v)} autoFocus/>
              <MemberField label="No. Telp Rumah" value={form.homePhone} onChange={v=>h('homePhone',v)}/>
              <MemberField label="Email" value={form.email} onChange={v=>h('email',v)} type="email"/>
              <div className="col-span-2">
                <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Alamat</label>
                <textarea value={form.address} onChange={e=>h('address',e.target.value)} rows={3}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3] resize-none" style={{borderColor:'#e2e8f0'}}/>
              </div>
            </div>
          )}
          {tab==='kerja' && (
            <div className="grid grid-cols-2 gap-4">
              <MemberField label="Pendidikan Terakhir" value={form.education} onChange={v=>h('education',v)} opts={pendidikanOpts}/>
              <MemberField label="Gelar" value={form.degree} onChange={v=>h('degree',v)} autoFocus/>
              <MemberField label="Jurusan" value={form.major} onChange={v=>h('major',v)}/>
              <MemberField label="Pekerjaan" value={form.occupation} onChange={v=>h('occupation',v)}/>
              <MemberField label="Profesi" value={form.profession} onChange={v=>h('profession',v)}/>
              <MemberField label="Tempat Kerja" value={form.workplace} onChange={v=>h('workplace',v)}/>
              <div className="col-span-2">
                <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Penguasaan Bahasa</label>
                <input type="text" value={form.languageSkills} onChange={e=>h('languageSkills',e.target.value)} placeholder="Indonesia, Inggris, dll" className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]" style={{borderColor:'#e2e8f0'}}/>
              </div>
              <div className="col-span-2">
                <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Skill / Kompetensi</label>
                <textarea value={form.skills} onChange={e=>h('skills',e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3] resize-none" style={{borderColor:'#e2e8f0'}}/>
              </div>
              <div className="col-span-2">
                <label className="block mb-1" style={{fontSize:'11.5px',color:'#64748b',fontWeight:600}}>Pengalaman Gerejawi</label>
                <textarea value={form.churchExperience} onChange={e=>h('churchExperience',e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3] resize-none" style={{borderColor:'#e2e8f0'}}/>
              </div>
            </div>
          )}
          {editMember && tab==='atestasi' && <AttestationsTabContent member={editMember} memberAttestations={memberAttestations} onShowAttForm={()=>setShowAttForm(true)}/>}
          {editMember && tab==='aset' && <AssetsTabContent memberAssets={memberAssets} borrowedAssets={borrowedAssets}/>}
          {editMember && tab==='dokumen' && (
            <DocumentsTabContent
              memberDocuments={memberDocuments} canEdit={editCanEdit} canDelete={editCanDelete}
              uploadingDoc={uploadingDoc} docFileInputRef={docFileInputRef}
              onUploadClick={handleUploadDocClick} onFileSelected={handleDocFileSelected}
              onViewDocument={handleViewDocument} onDeleteDocument={handleDeleteDocument}
            />
          )}
          {err && <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{background:'#fef2f2',color:'#dc2626'}}><AlertCircle className="w-4 h-4"/>{err}</div>}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3 flex-shrink-0" style={{borderColor:'#f1f5f9'}}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}>Batal</button>
          <button onClick={submit} disabled={submitting} className="px-5 py-2 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed" style={{background:'#1A77A3'}}>
            {submitting ? 'Menyimpan...' : (mode==='add'?'Simpan Anggota':'Perbarui Data')}
          </button>
        </div>
      </div>
    </div>
    {showAttForm && editMember && (
      <AttestationForm
        initial={{ memberId: editMember.id, memberName: editMember.fullName }}
        members={members}
        onSave={handleSaveAttestation}
        onClose={() => setShowAttForm(false)}
      />
    )}
    </>
  );
}

// ── IMPORT MODAL ──────────────────────────────────────────────────────────────
type ImportStep = 'upload' | 'preview' | 'done';

interface ParsedRow {
  raw: Record<string, any>;
  mapped: Omit<Member, 'id' | 'createdAt' | 'updatedAt'> | null;
  error?: string;
  isDuplicate?: boolean;
  duplicateId?: string;
}

function parseDate(val: any): string {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().split('T')[0];
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
  }
  // Excel serial date
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  return '';
}

function normalizePhone(val: any): string {
  if (!val) return '';
  let s = String(val).replace(/\D/g, '');
  if (s.startsWith('62')) s = '0' + s.slice(2);
  else if (!s.startsWith('0') && s.length >= 9) s = '0' + s;
  return s;
}

function mapGemasFmt(row: Record<string, any>, sectors: any[]): Omit<Member, 'id' | 'createdAt' | 'updatedAt'> | null {
  // GEMAS export format: "No.Induk", "Nama Lengkap", "Gender", "Usia", "Tgl Lahir", "Sektor", "Status", "Pelkat", "HP", "Email", "Alamat"
  const fullName = String(row['Nama Lengkap'] || '').trim();
  if (!fullName) return null;
  const parts = fullName.split(' ');
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ');
  const gender = (row['Gender'] || '').includes('aki') ? 'Laki-laki' : 'Perempuan';
  const birthDate = parseDate(row['Tgl Lahir']);
  const sectorName = String(row['Sektor'] || '').trim();
  const sec = sectors.find(s => s.name === sectorName || s.name?.includes(sectorName));
  return {
    memberNumber: String(row['No.Induk'] || '').trim() || undefined,
    familyCode: undefined,
    firstName, lastName, fullName, familyName: undefined,
    gender: gender as any,
    familyRole: '',
    birthPlace: undefined, birthDate, age: calcAge(birthDate),
    baptismStatus: undefined, baptismPlace: undefined, baptismDate: undefined,
    sidiStatus: undefined, sidiPlace: undefined, sidiDate: undefined,
    maritalStatus: undefined,
    marriageDateChurch: undefined, marriageDateCivil: undefined,
    bloodType: undefined, education: undefined, degree: undefined, major: undefined,
    occupation: undefined, profession: undefined, workplace: undefined,
    organizationExperience: undefined, churchExperience: undefined,
    languageSkills: undefined, skills: undefined,
    homePhone: undefined,
    phone: normalizePhone(row['HP']),
    email: String(row['Email'] || '').trim() || undefined,
    position: undefined,
    pelkatStatus: String(row['Pelkat'] || '').trim() || undefined,
    familyId: `fam_import_${Date.now()}_${Math.random()}`,
    sectorId: sec?.id || '',
    address: String(row['Alamat'] || '').trim(),
    membershipStatus: (row['Status'] === 'Aktif' ? 'Aktif' : 'Tidak Aktif') as any,
    membershipType: 'Warga Jemaat' as any,
    joinDate: undefined, notes: undefined, otherHistory: undefined, ministries: [],
  };
}

function mapJemaatFmt(row: Record<string, any>, sectors: any[]): Omit<Member, 'id' | 'createdAt' | 'updatedAt'> | null {
  // "jemaat 3.xlsx" format
  const firstName = String(row['Nama Pertama'] || '').trim();
  if (!firstName) return null;
  const lastName = String(row['Nama Belakang'] || '').trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ');

  const gRaw = String(row['Jenis Kelamin'] || '').toLowerCase().trim();
  const gender: 'Laki-laki' | 'Perempuan' = gRaw === 'l' ? 'Laki-laki' : 'Perempuan';

  const birthDate = parseDate(row['Tanggal Lahir']);
  const baptismDate = parseDate(row['Tanggal Baptis']);
  const sidiDate = parseDate(row['Tanggal Sidi']);
  const marriageDateChurch = parseDate(row['Tgl Nikah Gereja']);
  const marriageDateCivil = parseDate(row['Tgl Nikah Sipil']);
  const joinDate = parseDate(row['Tanggal Terdaftar']);

  const bStatus = String(row['Status Baptis'] || '').toUpperCase();
  const sStatus = String(row['Status Sidi'] || '').toUpperCase();
  const nikahCode = String(row['Status Nikah'] || '');
  const maritalMap: Record<string, Member['maritalStatus']> = {
    '01': 'Menikah', '00': 'Belum Menikah', '02': 'Duda', '03': 'Janda',
  };
  const hubMap: Record<string, string> = {
    KK: 'Kepala Keluarga', IS: 'Istri/Suami', AN: 'Anak', An: 'Anak',
    OT: 'Orang Tua', KA: 'Keponakan', FA: 'Famili', CU: 'Cucu',
  };

  // Sector: numeric (1,2,3,4) or string
  const sektorRaw = row['Sektor'];
  let sec = null;
  if (sektorRaw !== null && sektorRaw !== undefined) {
    const sNum = String(sektorRaw).trim();
    sec = sectors.find(s =>
      s.name === `Sektor ${sNum}` ||
      s.name === sNum ||
      s.name?.toLowerCase().includes(`sektor ${sNum}`) ||
      String(s.number) === sNum
    );
    if (!sec && sectors.length > 0) {
      const idx = parseInt(sNum, 10) - 1;
      if (idx >= 0 && idx < sectors.length) sec = sectors[idx];
    }
  }

  const statusPindah = String(row['Status Pindah/Meninggal'] || '').toUpperCase();
  const statusAktif  = String(row['Status Aktif'] || '');
  let membershipStatus: Member['membershipStatus'] = 'Aktif';
  if (statusPindah === 'MENINGGAL') membershipStatus = 'Meninggal';
  else if (statusPindah === 'PINDAH') membershipStatus = 'Pindah';
  else if (statusPindah === 'NONAKTIF' || statusAktif === 'Tidak Aktif') membershipStatus = 'Tidak Aktif';
  else if (statusAktif === 'Aktif') membershipStatus = 'Aktif';

  const familyCode = String(row['Kode Keluarga'] || '').trim();

  return {
    memberNumber: String(row['No Induk'] || '').trim() || undefined,
    familyCode: familyCode || undefined,
    firstName, lastName, fullName,
    familyName: String(row['Nama Keluarga'] || '').trim() || undefined,
    gender,
    familyRole: hubMap[String(row['Hubungan Keluarga'] || '').trim()] || String(row['Hubungan Keluarga'] || '').trim(),
    birthPlace: String(row['Tempat Lahir'] || '').trim() || undefined,
    birthDate, age: calcAge(birthDate),
    baptismStatus: bStatus === 'S' ? 'Sudah' : bStatus === 'B' ? 'Belum' : undefined,
    baptismPlace: String(row['Tempat Baptis'] || '').trim() || undefined,
    baptismDate: baptismDate || undefined,
    sidiStatus: sStatus === 'S' ? 'Sudah' : sStatus === 'B' ? 'Belum' : undefined,
    sidiPlace: String(row['Tempat Sidi'] || '').trim() || undefined,
    sidiDate: sidiDate || undefined,
    maritalStatus: maritalMap[nikahCode] || undefined,
    marriageDateChurch: marriageDateChurch || undefined,
    marriageDateCivil: marriageDateCivil || undefined,
    bloodType: (String(row['Golongan Darah'] || '').trim() || undefined) as any,
    education: String(row['Pendidikan Terakhir'] || '').trim() || undefined,
    degree: String(row['Gelar'] || '').trim() || undefined,
    major: String(row['Jurusan'] || '').trim() || undefined,
    occupation: String(row['Pekerjaan'] || '').trim() || undefined,
    profession: String(row['Profesi'] || '').trim() || undefined,
    workplace: String(row['Tempat Kerja'] || '').trim() || undefined,
    organizationExperience: String(row['Pengalaman Organisasi'] || '').trim() || undefined,
    churchExperience: String(row['Pengalaman Gerejawi'] || '').trim() || undefined,
    languageSkills: [row['Penguasaan Bahasa Daerah'], row['Penguasaan Bahasa Asing']].filter(Boolean).join(', ') || undefined,
    skills: String(row['Kompetensi/Skill'] || '').trim() || undefined,
    homePhone: normalizePhone(row['Telp.']),
    phone: normalizePhone(row['HP']),
    email: String(row['Email'] || '').trim() || undefined,
    position: String(row['Posisi Jabatan'] || '').trim() || undefined,
    pelkatStatus: String(row['Pelkat'] || '').trim() || undefined,
    familyId: familyCode ? `fam_${familyCode.replace(/\./g, '_')}` : `fam_import_${Math.random().toString(36).slice(2)}`,
    sectorId: sec?.id || '',
    address: '',
    membershipStatus,
    membershipType: 'Warga Jemaat' as any,
    joinDate: joinDate || undefined,
    notes: String(row['Riwayat Lain'] || '').trim() || undefined,
    otherHistory: undefined, ministries: [],
  };
}

function detectFormat(headers: string[]): 'jemaat' | 'gemas' | null {
  if (headers.includes('No Induk') && headers.includes('Nama Pertama')) return 'jemaat';
  if (headers.includes('Nama Lengkap') && headers.includes('No.Induk')) return 'gemas';
  return null;
}

function ImportMembersModal({ sectors, existingMembers, onImport, onClose }: {
  sectors: any[];
  existingMembers: Member[];
  onImport: (rows: Omit<Member, 'id' | 'createdAt' | 'updatedAt'>[]) => Promise<void>;
  onClose: () => void;
}) {
  const { offset, onMouseDown } = useDraggable();
  const [step, setStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [format, setFormat] = useState<'jemaat' | 'gemas' | null>(null);
  const [importing, setImporting] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [previewTab, setPreviewTab] = useState<'new' | 'dupe' | 'error'>('new');
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const processFile = (file: File) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rows.length === 0) { toast.error('File kosong'); return; }

        const headers = Object.keys(rows[0]);
        const fmt = detectFormat(headers);
        setFormat(fmt);

        // Build existing lookup for duplicate detection
        const existingByNum = new Map(existingMembers.filter(m => m.memberNumber).map(m => [m.memberNumber!.toLowerCase(), m]));
        const existingByName = new Map(existingMembers.map(m => [m.fullName.toLowerCase().trim(), m]));

        const parsedRows: ParsedRow[] = rows.map(raw => {
          let mapped: Omit<Member, 'id' | 'createdAt' | 'updatedAt'> | null = null;
          let error: string | undefined;

          try {
            if (fmt === 'jemaat') mapped = mapJemaatFmt(raw, sectors);
            else if (fmt === 'gemas') mapped = mapGemasFmt(raw, sectors);
            else error = 'Format kolom tidak dikenali';
          } catch (err: any) {
            error = err?.message || 'Gagal memproses baris';
          }

          if (!mapped && !error) error = 'Nama kosong, baris dilewati';

          let isDuplicate = false;
          let duplicateId: string | undefined;
          if (mapped) {
            const numMatch = mapped.memberNumber && existingByNum.get(mapped.memberNumber.toLowerCase());
            const nameMatch = existingByName.get(mapped.fullName.toLowerCase().trim());
            if (numMatch) { isDuplicate = true; duplicateId = (numMatch as Member).id; }
            else if (nameMatch) { isDuplicate = true; duplicateId = (nameMatch as Member).id; }
          }

          return { raw, mapped, error, isDuplicate, duplicateId };
        });

        setParsed(parsedRows);
        setStep('preview');
      } catch (err: any) {
        toast.error('Gagal membaca file: ' + (err?.message || 'Format tidak valid'));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const newRows   = parsed.filter(r => r.mapped && !r.isDuplicate && !r.error);
  const dupeRows  = parsed.filter(r => r.isDuplicate);
  const errorRows = parsed.filter(r => r.error);
  const noSector  = newRows.filter(r => !r.mapped?.sectorId);

  const handleImport = async () => {
    setImporting(true);
    const toImport = newRows.map(r => r.mapped!);
    await onImport(toImport);
    setDoneCount(toImport.length);
    setStep('done');
    setImporting(false);
  };

  const tabCounts = { new: newRows.length, dupe: dupeRows.length, error: errorRows.length };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" style={{ maxHeight: '90vh', transform:`translate(${offset.x}px,${offset.y}px)` }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b" style={{ background: '#384959', cursor:'move' }} onMouseDown={onMouseDown}>
          <div>
            <h3 className="text-white font-bold" style={{ fontSize: '15px' }}>Import Data Jemaat</h3>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
              {step === 'upload' ? 'Upload file Excel atau CSV' : step === 'preview' ? `${parsed.length} baris terbaca dari "${fileName}"` : `Import selesai`}
            </p>
          </div>
          <button data-tooltip="Tutup" onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex border-b" style={{ borderColor: '#f1f5f9' }}>
          {(['upload', 'preview', 'done'] as ImportStep[]).map((s, i) => (
            <div key={s} className="flex-1 flex items-center gap-2 px-4 py-2.5">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: step === s ? '#384959' : ((['upload','preview','done'].indexOf(step) > i) ? '#1A77A3' : '#e2e8f0'), color: step === s || ['upload','preview','done'].indexOf(step) > i ? '#fff' : '#94a3b8' }}>
                {['upload','preview','done'].indexOf(step) > i ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: step === s ? '#384959' : '#94a3b8' }}>
                {s === 'upload' ? 'Upload' : s === 'preview' ? 'Preview' : 'Selesai'}
              </span>
              {i < 2 && <div className="flex-1 h-px ml-2" style={{ background: ['upload','preview','done'].indexOf(step) > i ? '#1A77A3' : '#e2e8f0' }} />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <div className="p-6">
              <div
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all"
                style={{ borderColor: dragOver ? '#1A77A3' : '#e2e8f0', background: dragOver ? '#f0f7fb' : '#fafbfc' }}
              >
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#f0f7fb' }}>
                  <Download className="w-7 h-7" style={{ color: '#1A77A3', transform: 'rotate(180deg)' }} />
                </div>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#384959' }}>Drag & drop file di sini</p>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: 4 }}>atau klik untuk pilih file</p>
                <div className="flex justify-center gap-2 mt-4">
                  {['.xlsx', '.xls', '.csv'].map(ext => (
                    <span key={ext} className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: '#f0f7fb', color: '#1A77A3', border: '1px solid #b8d5e8' }}>{ext}</span>
                  ))}
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />

              <div className="mt-5 p-4 rounded-xl border" style={{ borderColor: '#e8e4d8', background: '#fefcf8' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: '#384959', marginBottom: 8 }}>Format yang didukung:</p>
                <div className="space-y-1.5">
                  {[
                    ['Format SIJEMAAT / SIG', 'Kolom: Kode Keluarga, No Induk, Nama Pertama, Nama Belakang, Sektor, ...'],
                    ['Format Export GEMAS', 'Kolom: No.Induk, Nama Lengkap, Gender, Tgl Lahir, Sektor, ...'],
                  ].map(([fmt, desc]) => (
                    <div key={fmt} className="flex gap-2">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#1A77A3' }} />
                      <div>
                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{fmt}</p>
                        <p style={{ fontSize: '11px', color: '#94a3b8' }}>{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW */}
          {step === 'preview' && (
            <div className="p-5 space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: 'new' as const,   label: 'Akan Diimpor', count: newRows.length,   bg: '#f0fdf4', border: '#b8d5e8', color: '#1A77A3' },
                  { key: 'dupe' as const,  label: 'Sudah Ada',    count: dupeRows.length,  bg: '#fffbeb', border: '#fcd34d', color: '#b45309' },
                  { key: 'error' as const, label: 'Dilewati',     count: errorRows.length, bg: '#fef2f2', border: '#fca5a5', color: '#dc2626' },
                ] as const).map(c => (
                  <button key={c.key} onClick={() => setPreviewTab(c.key)}
                    className="rounded-xl border p-3 text-center transition-all"
                    style={{ background: previewTab === c.key ? c.bg : '#fafbfc', borderColor: previewTab === c.key ? c.border : '#e2e8f0', boxShadow: previewTab === c.key ? '0 0 0 2px ' + c.border : 'none' }}>
                    <p style={{ fontSize: '24px', fontWeight: 700, color: c.color }}>{c.count}</p>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: c.color }}>{c.label}</p>
                  </button>
                ))}
              </div>

              {/* Format badge */}
              {format && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: '#f0f7fb', border: '1px solid #b8d5e8' }}>
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#1A77A3' }} />
                  <span style={{ fontSize: '12px', color: '#334155', fontWeight: 500 }}>
                    Format terdeteksi: <strong>{format === 'jemaat' ? 'SIJEMAAT / SIG' : 'Export GEMAS'}</strong> · {parsed.length} baris
                  </span>
                </div>
              )}

              {/* Sector warning */}
              {noSector.length > 0 && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl" style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#b45309' }} />
                  <p style={{ fontSize: '12px', color: '#92400e' }}>
                    <strong>{noSector.length} anggota</strong> tidak dapat dicocokkan ke sektor yang ada — sektor akan dikosongkan, bisa diisi manual setelah import.
                  </p>
                </div>
              )}

              {/* Tab content */}
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
                <div className="flex border-b" style={{ borderColor: '#f1f5f9', background: '#f8fafc' }}>
                  {([
                    { key: 'new' as const,   label: `Baru (${newRows.length})` },
                    { key: 'dupe' as const,  label: `Duplikat (${dupeRows.length})` },
                    { key: 'error' as const, label: `Error (${errorRows.length})` },
                  ] as const).map(t => (
                    <button key={t.key} onClick={() => setPreviewTab(t.key)}
                      className="px-4 py-2.5 text-xs font-semibold transition-all"
                      style={{ color: previewTab === t.key ? '#384959' : '#94a3b8', borderBottom: previewTab === t.key ? '2px solid #384959' : '2px solid transparent', background: 'transparent' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {previewTab === 'new' && (
                    newRows.length === 0
                      ? <p className="text-center py-8 text-sm" style={{ color: '#94a3b8' }}>Tidak ada data baru</p>
                      : <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              {['Nama', 'No. Induk', 'Gender', 'Tgl Lahir', 'Sektor', 'Status'].map(h => (
                                <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: '#64748b' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {newRows.slice(0, 50).map((r, i) => (
                              <tr key={i} className="border-b hover:bg-gray-50" style={{ borderColor: '#f1f5f9' }}>
                                <td className="px-3 py-2 font-medium" style={{ color: '#334155', maxWidth: 140 }}>{r.mapped?.fullName}</td>
                                <td className="px-3 py-2 font-mono" style={{ color: '#94a3b8' }}>{r.mapped?.memberNumber || '—'}</td>
                                <td className="px-3 py-2" style={{ color: '#64748b' }}>{r.mapped?.gender === 'Laki-laki' ? 'L' : 'P'}</td>
                                <td className="px-3 py-2" style={{ color: '#64748b' }}>{r.mapped?.birthDate || '—'}</td>
                                <td className="px-3 py-2" style={{ color: r.mapped?.sectorId ? '#1A77A3' : '#f59e0b' }}>
                                  {r.mapped?.sectorId ? (sectors.find(s => s.id === r.mapped?.sectorId)?.name || '?') : '⚠ kosong'}
                                </td>
                                <td className="px-3 py-2">
                                  <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#f0fdf4', color: '#1A77A3' }}>{r.mapped?.membershipStatus}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                  )}
                  {previewTab === 'dupe' && (
                    dupeRows.length === 0
                      ? <p className="text-center py-8 text-sm" style={{ color: '#94a3b8' }}>Tidak ada duplikat</p>
                      : <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              {['Nama', 'No. Induk', 'Keterangan'].map(h => (
                                <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: '#64748b' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {dupeRows.slice(0, 50).map((r, i) => (
                              <tr key={i} className="border-b" style={{ borderColor: '#f1f5f9' }}>
                                <td className="px-3 py-2 font-medium" style={{ color: '#334155' }}>{r.mapped?.fullName}</td>
                                <td className="px-3 py-2 font-mono" style={{ color: '#94a3b8' }}>{r.mapped?.memberNumber || '—'}</td>
                                <td className="px-3 py-2" style={{ color: '#b45309' }}>Sudah ada, dilewati</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                  )}
                  {previewTab === 'error' && (
                    errorRows.length === 0
                      ? <p className="text-center py-8 text-sm" style={{ color: '#94a3b8' }}>Tidak ada error</p>
                      : <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              {['Baris', 'Keterangan'].map(h => (
                                <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: '#64748b' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {errorRows.slice(0, 20).map((r, i) => (
                              <tr key={i} className="border-b" style={{ borderColor: '#f1f5f9' }}>
                                <td className="px-3 py-2 font-mono" style={{ color: '#94a3b8' }}>{String(r.raw['Nama Pertama'] || r.raw['Nama Lengkap'] || `Baris ${i + 1}`).slice(0, 30)}</td>
                                <td className="px-3 py-2" style={{ color: '#dc2626' }}>{r.error}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: DONE */}
          {step === 'done' && (
            <div className="p-10 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: '#f0fdf4' }}>
                <CheckCircle2 className="w-9 h-9" style={{ color: '#1A77A3' }} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Import Berhasil!</h3>
              <p style={{ fontSize: '13px', color: '#64748b' }}>
                <strong style={{ color: '#1A77A3' }}>{doneCount} anggota</strong> berhasil ditambahkan ke database.
              </p>
              {dupeRows.length > 0 && (
                <p style={{ fontSize: '12px', color: '#b45309', marginTop: 6 }}>{dupeRows.length} data duplikat dilewati.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-between items-center gap-3 flex-shrink-0" style={{ borderColor: '#f1f5f9' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all" style={{ borderColor: '#e2e8f0' }}>
            {step === 'done' ? 'Tutup' : 'Batal'}
          </button>
          {step === 'preview' && (
            <div className="flex items-center gap-3">
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                {newRows.length} anggota baru akan ditambahkan
              </span>
              <button
                onClick={handleImport}
                disabled={importing || newRows.length === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: '#384959' }}
              >
                {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 rotate-180" />}
                Import {newRows.length} Anggota
              </button>
            </div>
          )}
          {step === 'upload' && (
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Pilih file untuk melanjutkan</span>
          )}
          {step === 'done' && (
            <button onClick={() => { setStep('upload'); setFileName(''); setParsed([]); }} className="px-4 py-2 rounded-xl text-sm font-medium border hover:bg-gray-50 transition-all" style={{ borderColor: '#e2e8f0', color: '#384959' }}>
              Import File Lain
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const MEMBER_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  no: 48, memberNumber: 110, fullName: 220, gender: 60, age: 64,
  sectorId: 150, position: 160, pelkatStatus: 120, membershipStatus: 120, aksi: 110,
};

// ── MAIN ──────────────────────────────────────────────────────────────────────
export function MemberDatabase() {
  const { offset: offset1, onMouseDown: onMouseDown1 } = useDraggable();
  const { offset: offset2, onMouseDown: onMouseDown2 } = useDraggable();
  const { members, sectors, families, addMember, updateMember, deleteMember, currentUser, attestations, can, reloadData, getMasterDataByCategory } = useApp();

  const canCreate = can('Database Warga', 'create');
  const canEdit   = can('Database Warga', 'edit');
  const canDelete = can('Database Warga', 'delete');
  const canExport = can('Database Warga', 'export');

  const [searchQ, setSearchQ] = useState('');
  const [sectorF, setSectorF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [genderF, setGenderF] = useState('all');
  const [pelkatF, setPelkatF] = useState('all');
  const [ageF, setAgeF] = useState('all');
  const [periodeField, setPeriodeField] = useState<'joinDate'|'baptismDate'|'sidiDate'|'birthDate'>('joinDate');
  const [periodeFrom, setPeriodeFrom] = useState('');
  const [periodeTo, setPeriodeTo] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'table'|'card'>('table');
  const [sort, setSort] = useState<{col:string;dir:'asc'|'desc'}>({col:'fullName',dir:'asc'});
  const [selected, setSelected] = useState<Member|null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'add'|'edit'>('add');
  const [deleteTarget, setDeleteTarget] = useState<Member|null>(null);
  const [cardFamily, setCardFamily] = useState<any>(null);
  const [showImport, setShowImport] = useState(false);
  const [pageSize, setPageSize] = useState<number|'all'>(25);
  const { widths: colW, startResize } = useResizableColumns('member-database-main', MEMBER_TABLE_DEFAULT_WIDTHS);

  const handleViewFamilyCard = (member: Member) => {
    const family = families.find(f => f.id === member.familyId);
    if (!family) {
      toast.warning('Kartu keluarga untuk jemaat ini belum tersedia.');
      return;
    }
    setCardFamily(family);
  };

  // ── KPI Detail Modal ───────────────────────────────────────────────────────
  const [kpiDetail, setKpiDetail] = useState<{label:string;list:Member[]}|null>(null);
  const [kpiSearch, setKpiSearch] = useState('');

  const today = new Date();
  const curMonth = today.getMonth();

  // ── Derived Stats ──────────────────────────────────────────────────────────
  const stats = useMemo(()=>{
    const aktif      = members.filter(m=>m.membershipStatus==='Aktif');
    const pindah     = members.filter(m=>m.membershipStatus==='Pindah');
    const meninggal  = members.filter(m=>m.membershipStatus==='Meninggal');
    const tidakAktif = members.filter(m=>m.membershipStatus==='Tidak Aktif');
    const lakiLaki   = members.filter(m=>m.gender==='Laki-laki');
    const perempuan  = members.filter(m=>m.gender==='Perempuan');
    const sudahSidi  = members.filter(m=>m.sidiStatus==='Sudah');
    return { total:members.length, aktif, pindah, meninggal, tidakAktif, lakiLaki, perempuan, sudahSidi };
  },[members]);

  // ── Filtered + Sorted ─────────────────────────────────────────────────────
  const filtered = useMemo(()=>{
    let r = members;
    if(searchQ) { const q=searchQ.toLowerCase(); r=r.filter(m=>m.fullName.toLowerCase().includes(q)||m.memberNumber?.toLowerCase().includes(q)||m.familyCode?.toLowerCase().includes(q)||m.phone?.includes(q)); }
    if(sectorF!=='all') r=r.filter(m=>m.sectorId===sectorF);
    if(statusF!=='all') r=r.filter(m=>m.membershipStatus===statusF);
    if(genderF!=='all') r=r.filter(m=>m.gender===genderF);
    if(pelkatF!=='all') r=r.filter(m=>normPelkat(m.pelkatStatus)===normPelkat(pelkatF));
    if(ageF!=='all') {
      r=r.filter(m=>{
        const a=liveAge(m);
        if(ageF==='anak') return a<13;
        if(ageF==='pemuda') return a>=13&&a<25;
        if(ageF==='dewasa') return a>=25&&a<60;
        if(ageF==='lansia') return a>=60;
        return true;
      });
    }
    if(periodeFrom||periodeTo) {
      r=r.filter(m=>{
        const val=(m as any)[periodeField];
        if(!val) return false;
        const d=new Date(val);
        if(periodeFrom && d<new Date(periodeFrom)) return false;
        if(periodeTo && d>new Date(periodeTo)) return false;
        return true;
      });
    }
    return [...r].sort((a,b)=>{
      const av=(a as any)[sort.col]??'', bv=(b as any)[sort.col]??'';
      const cmp=String(av).localeCompare(String(bv));
      return sort.dir==='asc'?cmp:-cmp;
    });
  },[members,searchQ,sectorF,statusF,genderF,pelkatF,ageF,periodeField,periodeFrom,periodeTo,sort]);

  const ITEMS = pageSize==='all' ? Math.max(filtered.length,1) : (view==='card' ? 12 : pageSize);
  const totalPages = Math.max(1,Math.ceil(filtered.length/ITEMS));
  const startIdx = (page-1)*ITEMS;
  const pageItems = filtered.slice(startIdx, startIdx+ITEMS);

  const sortToggle = (col:string)=>setSort(s=>({col,dir:s.col===col&&s.dir==='asc'?'desc':'asc'}));
  const SortIcon = ({col}:{col:string})=>{
    if(sort.col!==col) return <ArrowUpDown className="w-3 h-3 opacity-40"/>;
    return sort.dir==='asc' ? <ArrowUp className="w-3 h-3 text-[#3a7fa0]"/> : <ArrowDown className="w-3 h-3 text-[#3a7fa0]"/>;
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSave = async (data: typeof EMPTY_FORM) => {
    const age = data.birthDate ? Math.floor((Date.now()-new Date(data.birthDate).getTime())/(1000*60*60*24*365.25)) : 0;
    const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ');
    if(formMode==='add') {
      if(data.memberNumber && members.some(m => m.memberNumber && m.memberNumber === data.memberNumber)) {
        toast.error('No. Induk sudah digunakan oleh anggota lain'); return;
      }
      addMember({ ...data, fullName, age, ministries:[] } as any);
      try { await api.post('/api/admin/sync', {}); await reloadData(); } catch { toast.error('Sinkronisasi gagal. Coba reload halaman.'); }
    } else if(selected) {
      if(data.memberNumber && members.some(m => m.id !== selected.id && m.memberNumber && m.memberNumber === data.memberNumber)) {
        toast.error('No. Induk sudah digunakan oleh anggota lain'); return;
      }
      updateMember(selected.id, { ...data, fullName, age } as any);
    }
    setShowForm(false); setSelected(null);
  };
  const handleDelete = () => {
    if(deleteTarget) { deleteMember(deleteTarget.id); setDeleteTarget(null); setShowDetail(false); }
  };

  const handleImportMembers = async (rows: Omit<Member, 'id' | 'createdAt' | 'updatedAt'>[]) => {
    try {
      const res = await api.post<{ ok: boolean; imported: number; duplicates: number; familiesCreated: number; familiesUpdated: number; sectorsUpdated: number }>(
        '/api/admin/members/import',
        { members: rows },
      );
      await reloadData();
      const extra = [];
      if (res.familiesCreated > 0) extra.push(`${res.familiesCreated} keluarga dibuat`);
      if (res.familiesUpdated > 0) extra.push(`${res.familiesUpdated} keluarga diperbarui`);
      if (res.sectorsUpdated > 0)  extra.push(`${res.sectorsUpdated} sektor diperbarui`);
      const suffix = extra.length > 0 ? ` · ${extra.join(', ')}` : '';
      toast.success(`${res.imported} anggota berhasil diimpor${suffix}`);
    } catch {
      // fallback: import individual via addMember
      rows.forEach(r => addMember(r));
      toast.success(`${rows.length} anggota berhasil diimpor`);
    }
  };

  // ── Export ─────────────────────────────────────────────────────────────────
  const exportExcel = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2,'0');
    const tgl = `${pad(now.getDate())}${pad(now.getMonth()+1)}${now.getFullYear()}`;
    const jam = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `database_jemaat_${tgl}_${jam}.xlsx`;

    const headers = [
      'No','No. Induk','Nama Lengkap','Nama Pertama','Nama Belakang','Nama Keluarga','Gelar',
      'Gender','Peran Keluarga','Status Hubungan Lainnya',
      'Tempat Lahir','Tgl Lahir','Usia','Gol. Darah',
      'Status Nikah','Tgl Nikah Gereja','Tgl Nikah Sipil',
      'Status Baptis','Tempat Baptis','Tgl Baptis',
      'Status Sidi','Tempat Sidi','Tgl Sidi',
      'Pendidikan','Jurusan','Pekerjaan','Profesi','Tempat Kerja',
      'Penguasaan Bahasa','Kompetensi/Skill','Pengalaman Organisasi','Pengalaman Gerejawi',
      'Telp Rumah','HP','Email','Alamat',
      'Kode Keluarga','Sektor','Status Keanggotaan','Jabatan','Status Pelkat','Status Aktif',
      'Catatan','Riwayat Lain','Tgl Bergabung','Dibuat','Diperbarui',
    ];

    const rows = filtered.map((m, i) => [
      i + 1,
      m.memberNumber || '',
      m.fullName,
      m.firstName,
      m.lastName,
      m.familyName || '',
      m.degree || '',
      m.gender,
      m.familyRole || '',
      m.familyRoleOther || '',
      m.birthPlace || '',
      m.birthDate || '',
      m.birthDate ? `${liveAge(m)} tahun` : '',
      m.bloodType || '',
      m.maritalStatus || '',
      m.marriageDateChurch || '',
      m.marriageDateCivil || '',
      m.baptismStatus || '',
      m.baptismPlace || '',
      m.baptismDate || '',
      m.sidiStatus || '',
      m.sidiPlace || '',
      m.sidiDate || '',
      m.education || '',
      m.major || '',
      m.occupation || '',
      m.profession || '',
      m.workplace || '',
      m.languageSkills || '',
      m.skills || '',
      m.organizationExperience || '',
      m.churchExperience || '',
      m.homePhone || '',
      m.phone || '',
      m.email || '',
      m.address || '',
      m.familyCode || '',
      sectors.find(s => s.id === m.sectorId)?.name || '',
      m.membershipType || '',
      m.position || '',
      m.pelkatStatus || '',
      m.membershipStatus || '',
      m.notes || '',
      m.otherHistory || '',
      m.joinDate || '',
      m.createdAt || '',
      m.updatedAt || '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [
      {wch:4},{wch:12},{wch:28},{wch:18},{wch:18},{wch:18},{wch:10},
      {wch:10},{wch:14},
      {wch:16},{wch:12},{wch:6},{wch:10},
      {wch:14},{wch:16},{wch:16},
      {wch:14},{wch:18},{wch:14},
      {wch:12},{wch:16},{wch:12},
      {wch:14},{wch:16},{wch:18},{wch:18},{wch:20},
      {wch:18},{wch:18},{wch:22},{wch:22},
      {wch:14},{wch:16},{wch:26},{wch:36},
      {wch:18},{wch:20},{wch:18},{wch:20},{wch:16},{wch:14},
      {wch:28},{wch:28},{wch:14},{wch:20},{wch:20},
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Database Jemaat');
    XLSX.writeFile(wb, filename);
  };

  const pelkatOptsFromMaster = getMasterDataByCategory('pelkat').map(m => m.value);
  const PELKAT_LIST = pelkatOptsFromMaster.length ? pelkatOptsFromMaster : ['PELKAT-PA','PELKAT-PT','PELKAT-GP','PELKAT-PKB','PELKAT-PKP','PELKAT-PKLU'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5" style={{fontSize:'22px',fontWeight:700,color:'#0f172a',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:'#1A77A3'}}>
              <Users className="w-5 h-5 text-white"/>
            </div>
            Database Warga Jemaat
          </h1>
          <p style={{fontSize:'13px',color:'#64748b',marginTop:'2px'}}>GPIB Trinitas · {stats.total} total anggota terdaftar</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <button onMouseDown={e=>e.preventDefault()} onClick={()=>{setFormMode('add');setSelected(null);setShowForm(true);}} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow transition-all hover:opacity-90" style={{background:'#1A77A3'}}>
              <Plus className="w-4 h-4"/> Tambah Anggota
            </button>
          )}
          {canCreate && (
            <button onClick={()=>setShowImport(true)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border hover:bg-gray-50 transition-all" style={{borderColor:'#e2e8f0',color:'#384959'}}>
              <ArrowRight className="w-4 h-4 rotate-90"/> Import Excel
            </button>
          )}
          {canExport && (
            <button onClick={exportExcel} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border hover:bg-gray-50 transition-all" style={{borderColor:'#e2e8f0',color:'#4b5563'}}>
              <Download className="w-4 h-4"/> Excel
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          {label:'Total Anggota',value:stats.total,           color:'#0f172a',bg:'#f8fafc',border:'#e2e8f0',list:members},
          {label:'Aktif',        value:stats.aktif.length,     color:'#1A77A3',bg:'#f0fdf4',border:'#b8d5e8',list:stats.aktif},
          {label:'Pindah',       value:stats.pindah.length,    color:'#2563eb',bg:'#eff6ff',border:'#bfdbfe',list:stats.pindah},
          {label:'Meninggal',    value:stats.meninggal.length, color:'#64748b',bg:'#f8fafc',border:'#e2e8f0',list:stats.meninggal},
          {label:'Tidak Aktif',  value:stats.tidakAktif.length,color:'#b45309',bg:'#fffbeb',border:'#fde68a',list:stats.tidakAktif},
          {label:'Laki-Laki',    value:stats.lakiLaki.length,  color:'#2563eb',bg:'#eff6ff',border:'#bfdbfe',list:stats.lakiLaki},
          {label:'Perempuan',    value:stats.perempuan.length, color:'#3a7fa0',bg:'#fdf2f8',border:'#fbcfe8',list:stats.perempuan},
          {label:'Sudah Sidi',   value:stats.sudahSidi.length, color:'#1A77A3',bg:'#f0fdf4',border:'#b8d5e8',list:stats.sudahSidi},
        ].map((s,i)=>(
          <div key={i}
            onClick={()=>{setKpiDetail({label:s.label,list:s.list});setKpiSearch('');}}
            className="rounded-xl p-3 border text-center cursor-pointer transition-all hover:scale-105 hover:shadow-md active:scale-95 select-none"
            style={{background:s.bg,borderColor:s.border}}>
            <p style={{fontSize:'18px',fontWeight:700,color:s.color,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{s.value}</p>
            <p style={{fontSize:'10px',color:s.color,fontWeight:600,marginTop:1}}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border bg-white overflow-hidden" style={{borderColor:'#e2e8f0',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>

        {/* Row 1: Search + View Toggle */}
        <div className="flex items-center gap-3 p-3 border-b" style={{borderColor:'#f1f5f9'}}>
          <div className="flex-1">
            <SearchDropdown<Member>
              value={searchQ}
              onChange={v => { setSearchQ(v); setPage(1); }}
              placeholder="Cari nama, no. induk, kode KK, nomor HP..."
              items={members}
              filterFn={(m, q) => {
                const lq = q.toLowerCase();
                return m.fullName.toLowerCase().includes(lq)
                  || (m.memberNumber?.toLowerCase() || '').includes(lq)
                  || (m.familyCode?.toLowerCase() || '').includes(lq)
                  || (m.phone?.includes(lq) ?? false);
              }}
              renderResult={m => (
                <div>
                  <p style={{fontSize:'13px',fontWeight:600,color:'#0f172a',margin:0}}>{m.fullName}</p>
                  <p style={{fontSize:'11px',color:'#64748b',margin:0}}>{m.memberNumber||'-'}</p>
                </div>
              )}
              onSelect={m => { setSearchQ(m.fullName); setPage(1); }}
              onClear={() => setPage(1)}
            />
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl border" style={{borderColor:'#e2e8f0',background:'#f8fafc'}}>
            <button data-tooltip="Tampilan Tabel" onClick={()=>setView('table')} className="p-2 rounded-lg transition-all" style={{background:view==='table'?'#1A77A3':'transparent',color:view==='table'?'#fff':'#94a3b8',padding:'6px'}}>
              <List className="w-4 h-4"/>
            </button>
            <button data-tooltip="Tampilan Kartu" onClick={()=>setView('card')} className="p-2 rounded-lg transition-all" style={{background:view==='card'?'#1A77A3':'transparent',color:view==='card'?'#fff':'#94a3b8',padding:'6px'}}>
              <LayoutGrid className="w-4 h-4"/>
            </button>
          </div>
        </div>

        {/* Row 2: Filter Groups */}
        <div className="p-3 space-y-2">
          {/* Demografis */}
          <div className="flex flex-wrap items-center gap-2">
            <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'0.08em',color:'#b0bec5',textTransform:'uppercase',minWidth:'68px'}}>Demografis</span>
            {([
              {val:sectorF, set:(v:string)=>{setSectorF(v);setPage(1);}, opts:[{v:'all',l:'Semua Sektor'},...sectors.map(s=>({v:s.id,l:s.name}))]},
              {val:statusF, set:(v:string)=>{setStatusF(v);setPage(1);}, opts:[{v:'all',l:'Semua Status'},{v:'Aktif',l:'Aktif'},{v:'Pindah',l:'Pindah'},{v:'Meninggal',l:'Meninggal'},{v:'Tidak Aktif',l:'Tidak Aktif'}]},
              {val:genderF, set:(v:string)=>{setGenderF(v);setPage(1);}, opts:[{v:'all',l:'Semua Gender'},{v:'Laki-laki',l:'Laki-laki'},{v:'Perempuan',l:'Perempuan'}]},
              {val:pelkatF, set:(v:string)=>{setPelkatF(v);setPage(1);}, opts:[{v:'all',l:'Semua Pelkat'},...PELKAT_LIST.map(p=>({v:p,l:p}))]},
              {val:ageF,    set:(v:string)=>{setAgeF(v);setPage(1);},    opts:[{v:'all',l:'Semua Usia'},{v:'anak',l:'Anak (<13)'},{v:'pemuda',l:'Pemuda (13–24)'},{v:'dewasa',l:'Dewasa (25–59)'},{v:'lansia',l:'Lansia (60+)'}]},
            ] as {val:string;set:(v:string)=>void;opts:{v:string;l:string}[]}[]).map((f,i)=>{
              const active = f.val !== 'all';
              return (
                <select key={i} value={f.val} onChange={e=>f.set(e.target.value)}
                  className="px-2.5 py-1 text-sm rounded-full border focus:outline-none transition-all cursor-pointer"
                  style={{borderColor:active?'#1A77A3':'#e2e8f0',background:active?'#f0f7fb':'#fafafa',color:active?'#1A77A3':'#64748b',fontWeight:active?600:400}}>
                  {f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              );
            })}
          </div>

          {/* Divider */}
          <div style={{height:'1px',background:'#f1f5f9'}}/>

          {/* Periode */}
          <div className="flex flex-wrap items-center gap-2">
            <span style={{fontSize:'9px',fontWeight:700,letterSpacing:'0.08em',color:'#b0bec5',textTransform:'uppercase',minWidth:'68px'}}>Periode</span>
            {(() => {
              const periodeActive = !!(periodeFrom||periodeTo);
              return (
                <>
                  <select value={periodeField} onChange={e=>{setPeriodeField(e.target.value as any);setPage(1);}}
                    className="px-2.5 py-1 text-sm rounded-full border focus:outline-none transition-all cursor-pointer"
                    style={{borderColor:periodeActive?'#1A77A3':'#e2e8f0',background:periodeActive?'#f0f7fb':'#fafafa',color:periodeActive?'#1A77A3':'#64748b',fontWeight:periodeActive?600:400}}>
                    <option value="joinDate">Tgl Bergabung</option>
                    <option value="baptismDate">Tgl Baptis</option>
                    <option value="sidiDate">Tgl Sidi</option>
                    <option value="birthDate">Tgl Lahir</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <input type="date" value={periodeFrom} onChange={e=>{setPeriodeFrom(e.target.value);setPage(1);}}
                      className="px-2.5 py-1 text-sm rounded-full border focus:outline-none transition-all"
                      style={{borderColor:periodeFrom?'#1A77A3':'#e2e8f0',background:periodeFrom?'#f0f7fb':'#fafafa',color:'#4b5563'}}/>
                    <span style={{color:'#b0bec5',fontSize:'13px',fontWeight:500}}>—</span>
                    <input type="date" value={periodeTo} onChange={e=>{setPeriodeTo(e.target.value);setPage(1);}}
                      className="px-2.5 py-1 text-sm rounded-full border focus:outline-none transition-all"
                      style={{borderColor:periodeTo?'#1A77A3':'#e2e8f0',background:periodeTo?'#f0f7fb':'#fafafa',color:'#4b5563'}}/>
                  </div>
                  {periodeActive && (
                    <button onClick={()=>{setPeriodeFrom('');setPeriodeTo('');setPage(1);}}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded-full border transition-all hover:bg-red-50"
                      style={{borderColor:'#fca5a5',color:'#ef4444'}}>
                      <X className="w-3 h-3"/>Reset
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Row 3: Active filter chips — only when any filter is active */}
        {(searchQ||sectorF!=='all'||statusF!=='all'||genderF!=='all'||pelkatF!=='all'||ageF!=='all'||periodeFrom||periodeTo) ? (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
            <span style={{fontSize:'11px',color:'#94a3b8',fontWeight:500,whiteSpace:'nowrap'}}>Filter aktif:</span>
            {searchQ && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>
                <Search className="w-3 h-3"/>"{searchQ.length>18?searchQ.slice(0,18)+'…':searchQ}"
                <button data-tooltip="Hapus filter" onClick={()=>{setSearchQ('');setPage(1);}} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button>
              </span>
            )}
            {sectorF!=='all' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>
                <MapPin className="w-3 h-3"/>{sectors.find(s=>s.id===sectorF)?.name||sectorF}
                <button data-tooltip="Hapus filter" onClick={()=>{setSectorF('all');setPage(1);}} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button>
              </span>
            )}
            {statusF!=='all' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>
                <UserCheck className="w-3 h-3"/>{statusF}
                <button data-tooltip="Hapus filter" onClick={()=>{setStatusF('all');setPage(1);}} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button>
              </span>
            )}
            {genderF!=='all' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>
                <User className="w-3 h-3"/>{genderF}
                <button data-tooltip="Hapus filter" onClick={()=>{setGenderF('all');setPage(1);}} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button>
              </span>
            )}
            {pelkatF!=='all' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>
                <Shield className="w-3 h-3"/>{pelkatF}
                <button data-tooltip="Hapus filter" onClick={()=>{setPelkatF('all');setPage(1);}} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button>
              </span>
            )}
            {ageF!=='all' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>
                <Users className="w-3 h-3"/>{{anak:'Anak',pemuda:'Pemuda',dewasa:'Dewasa',lansia:'Lansia'}[ageF]||ageF}
                <button data-tooltip="Hapus filter" onClick={()=>{setAgeF('all');setPage(1);}} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button>
              </span>
            )}
            {(periodeFrom||periodeTo) && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0f7fb',color:'#1A77A3',border:'1px solid #b8d5e8'}}>
                <Calendar className="w-3 h-3"/>{{joinDate:'Bergabung',baptismDate:'Baptis',sidiDate:'Sidi',birthDate:'Lahir'}[periodeField]}: {periodeFrom||'*'} — {periodeTo||'*'}
                <button data-tooltip="Hapus filter" onClick={()=>{setPeriodeFrom('');setPeriodeTo('');setPage(1);}} className="ml-0.5 hover:opacity-60"><X className="w-3 h-3"/></button>
              </span>
            )}
            <button
              onClick={()=>{setSearchQ('');setSectorF('all');setStatusF('all');setGenderF('all');setPelkatF('all');setAgeF('all');setPeriodeFrom('');setPeriodeTo('');setPage(1);}}
              className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-all hover:bg-red-50"
              style={{borderColor:'#fca5a5',color:'#ef4444'}}>
              <X className="w-3 h-3"/>Reset Semua
            </button>
            <span className="ml-auto text-xs font-semibold" style={{color:'#1A77A3'}}>{filtered.length} anggota ditemukan</span>
          </div>
        ) : (
          <div className="px-3 pb-2 flex justify-end">
            <span style={{fontSize:'12px',color:'#94a3b8',fontWeight:500}}>{filtered.length} anggota total</span>
          </div>
        )}
      </div>

      {/* Table View */}
      {view==='table' && (
        <div className="rounded-2xl border bg-white overflow-hidden" style={{borderColor:'#e2e8f0'}}>
          <div className="overflow-x-auto">
            <table className="w-full" style={{tableLayout:'fixed'}}>
              <thead>
                <tr style={{background:'#f6f4f0',borderBottom:'1px solid #e8e4d8'}}>
                  <th className="px-3 py-3 text-left sticky left-0 z-10" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',background:'#f6f4f0',width:colW.no,position:'relative'}}>
                    No
                    <ColResizeHandle onMouseDown={startResize('no')} />
                  </th>
                  {[
                    {label:'No. Induk',col:'memberNumber'},
                    {label:'Nama Lengkap',col:'fullName'},
                    {label:'L/P',col:'gender'},
                    {label:'Usia',col:'age'},
                    {label:'Sektor',col:'sectorId'},
                    {label:'Jabatan Pelayanan',col:'position'},
                    {label:'Pelkat',col:'pelkatStatus'},
                    {label:'Status',col:'membershipStatus'},
                  ].map(h=>(
                    <th key={h.col} className="px-4 py-3 text-left cursor-pointer select-none" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',whiteSpace:'nowrap',width:colW[h.col],position:'relative',overflow:'hidden',textOverflow:'ellipsis'}} onClick={()=>sortToggle(h.col)}>
                      <span className="flex items-center gap-1">{h.label}<SortIcon col={h.col}/></span>
                      <ColResizeHandle onMouseDown={startResize(h.col)} />
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left" style={{fontSize:'11.5px',fontWeight:600,color:'#144f6b',width:colW.aksi,position:'relative'}}>
                    Aksi
                    <ColResizeHandle onMouseDown={startResize('aksi')} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageItems.length===0 ? (
                  <tr><td colSpan={10} className="py-16 text-center" style={{color:'#94a3b8',fontSize:'13px'}}>Tidak ada anggota ditemukan</td></tr>
                ) : pageItems.map((m,i)=>{
                  const sec = sectors.find(s=>s.id===m.sectorId);
                  const bday = m.birthDate ? new Date(m.birthDate) : null;
                  const isBday = bday && bday.getMonth()===curMonth;
                  return (
                    <tr key={`${page}-${m.id}`} className="border-b hover:bg-[#f6f4f0]/20 transition-colors cursor-pointer" style={{borderColor:'#f2f0ea'}} onClick={()=>{setSelected(m);setShowDetail(true);}}>
                      <td className="px-3 py-3 text-xs sticky left-0 z-10" style={{color:'#94a3b8',fontWeight:600,background:'#fff',borderRight:'1px solid #f1f5f9'}}>{startIdx+i+1}</td>
                      <td className="px-4 py-3 text-xs font-mono" style={{color:'#64748b'}}>{m.memberNumber||'—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <AvatarMember name={m.fullName} role={m.familyRole} size={30}/>
                          <div>
                            <p style={{fontSize:'13px',fontWeight:600,color:'#334155'}}>{m.fullName}</p>
                            {isBday && <span style={{fontSize:'10px',color:'#9c9486'}}>🎂 Ulang tahun bulan ini</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{color:'#4b5563'}}>{m.gender==='Laki-laki'?'L':'P'}</td>
                      <td className="px-4 py-3 text-sm" style={{color:'#4b5563'}}>{liveAge(m)} th</td>
                      <td className="px-4 py-3 text-sm" style={{color:'#4b5563'}}>{sec?.name?.replace(/Sektor \d+ - /,'')??'—'}</td>
                      <td className="px-4 py-3 text-sm" style={{color:'#4b5563'}}>{m.position||'—'}</td>
                      <td className="px-4 py-3">
                        {m.pelkatStatus ? <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{background:'#f0fdf4',color:'#1A77A3',border:'1px solid #b8d5e8'}}>{m.pelkatStatus}</span> : <span style={{color:'#d1d5db'}}>—</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={m.membershipStatus}/></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1" onClick={e=>e.stopPropagation()}>
                          <button data-tooltip="Lihat Detail" onClick={()=>{setSelected(m);setShowDetail(true);}} className="p-1.5 rounded-lg hover:bg-[#f0ede5] transition-colors"><Eye className="w-3.5 h-3.5 text-[#1A77A3]"/></button>
                          <button data-tooltip="Lihat Kartu Keluarga" onClick={()=>handleViewFamilyCard(m)} className="p-1.5 rounded-lg hover:bg-[#f0f7fb] transition-colors"><IdCard className="w-3.5 h-3.5 text-[#1A77A3]"/></button>
                          {canEdit && <button data-tooltip="Edit" onClick={()=>{setSelected(m);setFormMode('edit');setShowForm(true);}} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><Pencil className="w-3.5 h-3.5 text-gray-400"/></button>}
                          {canDelete && <button data-tooltip="Hapus" onClick={()=>setDeleteTarget(m)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-400"/></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{borderColor:'#f1f5f9'}}>
            <div className="flex items-center gap-3">
              <span style={{fontSize:'12px',color:'#64748b'}}>Menampilkan {Math.min(filtered.length,startIdx+1)}–{Math.min(filtered.length,startIdx+ITEMS)} dari {filtered.length}</span>
              <select value={pageSize} onChange={e=>{const v=e.target.value; setPageSize(v==='all'?'all':Number(v)); setPage(1);}}
                className="px-2 py-1 rounded-lg border text-xs focus:outline-none" style={{borderColor:'#e2e8f0',color:'#64748b'}}>
                {[25,50,100].map(n=><option key={n} value={n}>{n}</option>)}
                <option value="all">Semua</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button data-tooltip="Halaman Sebelumnya" disabled={page===1} onClick={()=>setPage(p=>p-1)} className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}><ChevronLeft className="w-4 h-4 text-gray-500"/></button>
              {Array.from({length:Math.min(totalPages,7)},(_,i)=>{
                const p=i+1;
                return <button key={p} onClick={()=>setPage(p)} className="w-7 h-7 rounded-lg text-xs font-medium transition-all" style={{background:page===p?'#1A77A3':'transparent',color:page===p?'#fff':'#64748b',border:page===p?'none':'1px solid #e2e8f0'}}>{p}</button>;
              })}
              {totalPages>7 && <span style={{color:'#94a3b8',fontSize:'12px'}}>...{totalPages}</span>}
              <button data-tooltip="Halaman Berikutnya" disabled={page===totalPages} onClick={()=>setPage(p=>p+1)} className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}><ChevronRight className="w-4 h-4 text-gray-500"/></button>
            </div>
          </div>
        </div>
      )}

      {/* Card View */}
      {view==='card' && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {pageItems.map(m=>{
              const sec = sectors.find(s=>s.id===m.sectorId);
              const bday = m.birthDate ? new Date(m.birthDate) : null;
              const isBday = bday && bday.getMonth()===curMonth;
              return (
                <div key={m.id} className="rounded-2xl border bg-white p-4 hover:shadow-md transition-shadow" style={{borderColor:'#e2e8f0'}}>
                  <div className="flex items-start gap-3 mb-3">
                    <AvatarMember name={m.fullName} role={m.familyRole} size={42}/>
                    <div className="flex-1 min-w-0">
                      <p data-tooltip={m.fullName} data-tooltip-truncate className="truncate" style={{fontSize:'13.5px',fontWeight:700,color:'#334155'}}>{m.fullName}</p>
                      <p style={{fontSize:'11px',color:'#94a3b8'}}>{m.memberNumber||'—'}</p>
                      {isBday && <span style={{fontSize:'10px',color:'#9c9486'}}>🎂 Ulang tahun bulan ini</span>}
                    </div>
                  </div>
                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center gap-1.5" style={{fontSize:'11.5px',color:'#64748b'}}>
                      <MapPin className="w-3 h-3 flex-shrink-0"/><span data-tooltip={sec?.name||'—'} data-tooltip-truncate className="truncate">{sec?.name||'—'}</span>
                    </div>
                    <div className="flex items-center gap-1.5" style={{fontSize:'11.5px',color:'#64748b'}}>
                      <Calendar className="w-3 h-3 flex-shrink-0"/><span>{liveAge(m)} tahun · {m.gender}</span>
                    </div>
                    {m.phone && <div className="flex items-center gap-1.5" style={{fontSize:'11.5px',color:'#64748b'}}><Phone className="w-3 h-3"/><span>{m.phone}</span></div>}
                  </div>
                  <div className="flex items-center justify-between">
                    <StatusBadge status={m.membershipStatus}/>
                    <div className="flex gap-1">
                      <button data-tooltip="Lihat Detail" onClick={()=>{setSelected(m);setShowDetail(true);}} className="p-1.5 rounded-lg hover:bg-[#f0f7fb] transition-colors"><Eye className="w-3.5 h-3.5 text-[#1A77A3]"/></button>
                      <button data-tooltip="Lihat Kartu Keluarga" onClick={()=>handleViewFamilyCard(m)} className="p-1.5 rounded-lg hover:bg-[#f0f7fb] transition-colors"><IdCard className="w-3.5 h-3.5 text-[#1A77A3]"/></button>
                      {canEdit && <button data-tooltip="Edit" onClick={()=>{setSelected(m);setFormMode('edit');setShowForm(true);}} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><Pencil className="w-3.5 h-3.5 text-gray-400"/></button>}
                      {canDelete && <button data-tooltip="Hapus" onClick={()=>setDeleteTarget(m)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-400"/></button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-2 mt-5">
            <button data-tooltip="Halaman Sebelumnya" disabled={page===1} onClick={()=>setPage(p=>p-1)} className="p-2 rounded-lg border disabled:opacity-40 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}><ChevronLeft className="w-4 h-4 text-gray-500"/></button>
            <span style={{fontSize:'13px',color:'#64748b'}}>Halaman {page} dari {totalPages}</span>
            <button data-tooltip="Halaman Berikutnya" disabled={page===totalPages} onClick={()=>setPage(p=>p+1)} className="p-2 rounded-lg border disabled:opacity-40 hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0'}}><ChevronRight className="w-4 h-4 text-gray-500"/></button>
          </div>
        </div>
      )}

      {/* KPI Detail Modal */}
      {kpiDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.55)'}} onClick={()=>setKpiDetail(null)}>
          <div className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden bg-white flex flex-col" style={{maxHeight:'85vh', transform:`translate(${offset1.x}px,${offset1.y}px)`}} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 flex-shrink-0 flex items-center justify-between" style={{background:'#1A77A3',cursor:'move'}} onMouseDown={onMouseDown1}>
              <div>
                <p style={{fontSize:'11px',color:'rgba(255,255,255,0.65)',fontWeight:500,letterSpacing:'0.05em',textTransform:'uppercase'}}>Detail Kategori KPI</p>
                <h3 className="text-white font-bold flex items-center gap-3 mt-0.5" style={{fontSize:'17px',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                  <span className="px-3 py-0.5 rounded-full font-black" style={{background:'rgba(255,255,255,0.2)',fontSize:'20px',color:'#fff'}}>{kpiDetail.list.length}</span>
                  Anggota · {kpiDetail.label}
                </h3>
              </div>
              <button data-tooltip="Tutup" onClick={()=>setKpiDetail(null)} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/20 transition-colors">
                <X className="w-5 h-5 text-white"/>
              </button>
            </div>
            {/* Search */}
            <div className="px-5 py-3 border-b flex-shrink-0" style={{borderColor:'#f1f5f9',background:'#fafbfc'}}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"/>
                <input value={kpiSearch} onChange={e=>setKpiSearch(e.target.value)}
                  placeholder="Cari nama anggota..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#7290a0]"
                  style={{borderColor:'#e2e8f0'}}/>
              </div>
            </div>
            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              {kpiDetail.list.length === 0 ? (
                <div className="py-20 text-center" style={{color:'#94a3b8',fontSize:'13px'}}>Tidak ada data dalam kategori ini</div>
              ) : (() => {
                const rows = kpiDetail.list.filter(m=>!kpiSearch||m.fullName.toLowerCase().includes(kpiSearch.toLowerCase()));
                return rows.length === 0 ? (
                  <div className="py-20 text-center" style={{color:'#94a3b8',fontSize:'13px'}}>Anggota tidak ditemukan</div>
                ) : (
                  <table className="w-full">
                    <thead className="sticky top-0" style={{background:'#f6f4f0',borderBottom:'1px solid #e8e4d8'}}>
                      <tr>
                        {['#','Nama Lengkap','Gender','Sektor','Status','Pelkat'].map(h=>(
                          <th key={h} className="px-4 py-2.5 text-left" style={{fontSize:'11px',fontWeight:600,color:'#144f6b'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((m,i)=>{
                        const sec = sectors.find(s=>s.id===m.sectorId);
                        return (
                          <tr key={m.id}
                            className="border-b hover:bg-[#f0f7fb]/40 transition-colors cursor-pointer"
                            style={{borderColor:'#f8fafc'}}
                            onClick={()=>{setKpiDetail(null);setSelected(m);setShowDetail(true);}}>
                            <td className="px-4 py-2.5 text-xs font-mono" style={{color:'#cbd5e1'}}>{i+1}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <AvatarMember name={m.fullName} role={m.familyRole} size={28}/>
                                <div>
                                  <p style={{fontSize:'12.5px',fontWeight:600,color:'#334155'}}>{m.fullName}</p>
                                  {m.memberNumber && <p style={{fontSize:'10px',color:'#94a3b8'}}>{m.memberNumber}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-xs" style={{color:'#4b5563'}}>{m.gender==='Laki-laki'?'L':'P'}</td>
                            <td className="px-4 py-2.5 text-xs" style={{color:'#4b5563'}}>{sec?.name?.replace(/Sektor \d+ - /,'')||'—'}</td>
                            <td className="px-4 py-2.5">
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{
                                  background:m.membershipStatus==='Aktif'?'#f0fdf4':m.membershipStatus==='Pindah'?'#eff6ff':'#f8fafc',
                                  color:m.membershipStatus==='Aktif'?'#1A77A3':m.membershipStatus==='Pindah'?'#2563eb':'#64748b'
                                }}>
                                {m.membershipStatus||'—'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs" style={{color:'#64748b'}}>{m.pelkatStatus||'—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
            {/* Footer */}
            <div className="px-6 py-4 border-t flex-shrink-0 flex items-center justify-between" style={{borderColor:'#f1f5f9'}}>
              <span style={{fontSize:'12px',color:'#64748b'}}>
                {kpiSearch
                  ? `${kpiDetail.list.filter(m=>m.fullName.toLowerCase().includes(kpiSearch.toLowerCase())).length} dari ${kpiDetail.list.length} anggota`
                  : `Total ${kpiDetail.list.length} anggota · Klik nama untuk lihat profil`}
              </span>
              <button onClick={()=>setKpiDetail(null)} className="px-4 py-2 rounded-xl border text-sm font-medium hover:bg-gray-50 transition-colors" style={{borderColor:'#e2e8f0',color:'#4b5563'}}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showDetail && selected && (
        <MemberDetail member={selected} sectors={sectors} attestations={attestations} members={members} onClose={()=>setShowDetail(false)}
          onEdit={()=>{setFormMode('edit');setShowDetail(false);setShowForm(true);}}
          onDelete={()=>{setDeleteTarget(selected);setShowDetail(false);}}
          onViewFamily={()=>{setShowDetail(false);handleViewFamilyCard(selected);}}/>
      )}
      {showForm && (
        <MemberForm mode={formMode}
          initial={formMode==='edit'&&selected ? { ...selected } as any : undefined}
          sectors={sectors} families={families} attestations={attestations} members={members}
          onSave={handleSave} onClose={()=>{setShowForm(false);setSelected(null);}}/>
      )}
      {cardFamily && (
        <FamilyCardModal family={cardFamily} members={members} sectors={sectors} onClose={()=>setCardFamily(null)} />
      )}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.5)'}} onClick={()=>setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center" style={{transform:`translate(${offset2.x}px,${offset2.y}px)`}} onClick={e=>e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{background:'#fef2f2',cursor:'move'}} onMouseDown={onMouseDown2}><Trash2 className="w-6 h-6 text-red-500"/></div>
            <h3 style={{fontSize:'16px',fontWeight:700,color:'#0f172a',marginBottom:8}}>Hapus Anggota?</h3>
            <p style={{fontSize:'13px',color:'#64748b',marginBottom:8}}>Data <strong>{deleteTarget.fullName}</strong> akan dihapus secara permanen.</p>
            <p style={{fontSize:'12px',color:'#94a3b8',marginBottom:24}}>Tindakan ini tidak dapat dibatalkan.</p>
            <div className="flex gap-3">
              <button onClick={()=>setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl border font-medium text-gray-600 hover:bg-gray-50 transition-colors text-sm" style={{borderColor:'#e2e8f0'}}>Batal</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90" style={{background:'#ef4444'}}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportMembersModal
          sectors={sectors}
          existingMembers={members}
          onImport={handleImportMembers}
          onClose={()=>setShowImport(false)}
        />
      )}
    </div>
  );
}