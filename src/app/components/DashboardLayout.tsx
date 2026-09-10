import React, { ReactNode, useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { NotificationBell } from './NotificationCenter';
import { ThemeSwitcher } from './ThemeSwitcher';
import { GlobalSearch } from './GlobalSearch';
import {
  LayoutDashboard, Users, UserCog, User,
  LogOut, Church, Calendar, Activity, DollarSign,
  ChevronDown, ChevronRight, ChevronLeft,
  Shield, Database, ShieldCheck, HardDrive,
  Menu, X, Package, Clock, Layers,
  PanelLeftClose, PanelLeftOpen,
  BookOpen, FileText, HeartHandshake, Heart,
  Send,
  MessageSquareHeart, BarChart3,
  QrCode, Book, Home, MapPin, Cross, Library, DoorOpen, Gift,
  Bell, ChevronRight as BreadcrumbArrow, Printer, FileSpreadsheet, Landmark, ClipboardList, Receipt, Inbox, ArrowLeftRight, CalendarCheck, FileBarChart, Mail
} from 'lucide-react';

interface DashboardLayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

interface MenuItem {
  id: string;
  label: string;
  page: string;
  icon: any;
  badge?: string | number;
  badgeColor?: string;
}

interface MenuSection {
  id: string;
  label: string;
  icon: any;
  items: MenuItem[];
}

export const PAGE_LABELS: Record<string, { title: string; category: string }> = {
  dashboard:             { title: 'Dashboard Utama', category: 'Utama' },
  members:               { title: 'Database Warga Jemaat', category: 'Database Jemaat' },
  families:              { title: 'Data Keluarga Jemaat', category: 'Database Jemaat' },
  sectors:               { title: 'Sektor Pelayanan', category: 'Database Jemaat' },
  sacraments:            { title: 'Sakramen (Baptis/Sidi/Nikah)', category: 'Database Jemaat' },
  attestations:          { title: 'Surat Atestasi & Mutasi', category: 'Database Jemaat' },
  'sensus-report':       { title: 'Laporan Sensus & Demografi', category: 'Database Jemaat' },
  'report-center':       { title: 'Pusat Laporan Konsolidasi', category: 'Database Jemaat' },
  'worship-schedules':   { title: 'Jadwal & Petugas Ibadah', category: 'Peribadahan & Kegiatan' },
  'e-warta':             { title: 'E-Warta Jemaat', category: 'Peribadahan & Kegiatan' },
  'sermon-archive':      { title: 'Arsip Khotbah & Renungan', category: 'Peribadahan & Kegiatan' },
  liturgy:               { title: 'Tata Ibadah', category: 'Peribadahan & Kegiatan' },
  events:                { title: 'Kalender Kegiatan', category: 'Peribadahan & Kegiatan' },
  ministries:            { title: 'Pelkat & Komisi Pelayanan', category: 'Peribadahan & Kegiatan' },
  livestream:            { title: 'Livestream & Pengingat', category: 'Peribadahan & Kegiatan' },
  attendance:            { title: 'Presensi Ibadah & QR', category: 'Peribadahan & Kegiatan' },
  announcements:         { title: 'Warta & Pengumuman', category: 'Peribadahan & Kegiatan' },
  'church-finance':      { title: 'Kas & Rekening Gereja', category: 'Keuangan & Persembahan (Modul Klasik)' },
  offerings:             { title: 'Persembahan & QRIS', category: 'Keuangan & Persembahan (Modul Klasik)' },
  financial:             { title: 'Jurnal Transaksi & Laporan Keuangan', category: 'Keuangan & Persembahan (Modul Klasik)' },
  assets:                { title: 'Manajemen Aset & Inventaris', category: 'Fasilitas & Inventaris' },
  'room-booking':        { title: 'Peminjaman Ruangan & Fasilitas', category: 'Fasilitas & Inventaris' },
  'resource-library':    { title: 'Perpustakaan Digital', category: 'Fasilitas & Inventaris' },
  'service-requests':    { title: 'Layanan Diakonia & Bantuan', category: 'Pelayanan Kasih & Doa' },
  'aid-distribution':    { title: 'Distribusi Bantuan Sosial', category: 'Pelayanan Kasih & Doa' },
  prayers:               { title: 'Pokok & Pergumulan Doa', category: 'Pelayanan Kasih & Doa' },
  users:                 { title: 'List User', category: 'Admin Sistem' },
  roles:                 { title: 'Manajemen Hak Akses', category: 'Admin Sistem' },
  backup:                { title: 'Backup & Restore Database', category: 'Admin Sistem' },
  data:                  { title: 'Pusat Manajemen Data', category: 'Admin Sistem' },
  'master-data':         { title: 'Pengaturan Master Data', category: 'Admin Sistem' },
  activity:              { title: 'Log Aktivitas Sistem', category: 'Admin Sistem' },
  'letter-settings':     { title: 'Pengaturan Surat Menyurat', category: 'Surat Menyurat' },
  'letters-outgoing':    { title: 'Surat Keluar', category: 'Surat Menyurat' },
  'letters-incoming':    { title: 'Surat Masuk', category: 'Surat Menyurat' },
  'letter-templates':    { title: 'Template Surat', category: 'Surat Menyurat' },
  'finance-addon':         { title: 'Ringkasan Finance', category: 'Finance' },
  'finance-master-data':   { title: 'Master Data Finance', category: 'Finance' },
  'finance-budget':        { title: 'Budget / RKA', category: 'Finance' },
  'finance-transaction':   { title: 'Transaksi & Voucher', category: 'Finance' },
  'finance-approval':      { title: 'Verifikasi & Persetujuan', category: 'Finance' },
  'finance-ledger':        { title: 'Buku Besar (GL)', category: 'Finance' },
  'finance-reconciliation':{ title: 'Rekonsiliasi Bank', category: 'Finance' },
  'finance-period-closing':{ title: 'Penutupan Periode', category: 'Finance' },
  'finance-reports':       { title: 'Laporan Keuangan', category: 'Finance' },
  'finance-dashboard':     { title: 'Dashboard Finance', category: 'Finance' },
};

function ProfileDropdown({ user, onLogout, onClose }: { user: any; onLogout: () => void; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl shadow-xl bg-white border z-50 overflow-hidden" style={{ borderColor: '#e2d8c4' }}>
        <div className="px-4 py-4 flex items-center gap-3" style={{ background: '#0d1a2d' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-base flex-shrink-0 bg-amber-500/20 text-amber-300 border border-amber-400/30">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold truncate text-xs">{user?.name}</p>
            <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {user?.role}
            </span>
          </div>
        </div>
        <div className="px-4 py-2 text-xs">
          {[
            { label: 'Username', value: user?.username },
            { label: 'Email',    value: user?.email || '—' },
          ].map(r => (
            <div key={r.label} className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-500">{r.label}</span>
              <span className="truncate ml-2 font-medium text-gray-900 max-w-[60%] text-right">{r.value}</span>
            </div>
          ))}
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-500">Status</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {user?.isActive ? 'Aktif' : 'Nonaktif'}
            </span>
          </div>
        </div>
        <div className="px-4 pb-3">
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl transition-all bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar dari Sistem
          </button>
        </div>
      </div>
    </>
  );
}

export function DashboardLayout({ children, currentPage, onNavigate }: DashboardLayoutProps) {
  const {
    currentUser,
    logout,
    can,
    prayerRequests = [],
    serviceRequests = [],
    members = [],
    families = []
  } = useApp();

  const pendingPrayers = prayerRequests.filter((p: any) => p.status === 'Pending').length;
  const pendingServices = serviceRequests.filter((s: any) => s.status === 'Diajukan' || s.status === 'Diproses').length;

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    jemaat: true,
    peribadahan: false,
    keuangan: false,
    'finance-addon': false,
    fasilitas: false,
    diakonia: false,
    admin: false,
    persuratan: false,
  });

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [tooltip, setTooltip] = useState<{ label: string; x?: number; y: number } | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeString = useMemo(() => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const h = pad(now.getHours());
    const m = pad(now.getMinutes());
    const s = pad(now.getSeconds());
    return `${h}.${m}.${s} WIB`;
  }, [now]);

  // Complete, original menu sections with all features & permissions
  const menuSections: MenuSection[] = useMemo(() => [
    {
      id: 'jemaat',
      label: 'Database Jemaat',
      icon: Users,
      items: [
        { id: 'members',       label: 'Database Warga',          page: 'members',       icon: Users,        badge: members.length > 0 ? members.length : undefined },
        { id: 'families',      label: 'Data Keluarga Jemaat',    page: 'families',      icon: Home,         badge: families.length > 0 ? families.length : undefined },
        { id: 'sectors',       label: 'Sektor Pelayanan',        page: 'sectors',       icon: MapPin },
        { id: 'attestations',  label: 'Atestasi & Mutasi',       page: 'attestations',  icon: FileText },
        { id: 'sacraments',    label: 'Sakramen (Baptis/Sidi/Nikah)', page: 'sacraments',    icon: Cross },
        { id: 'sensus-report', label: 'Laporan Sensus Jemaat',   page: 'sensus-report', icon: BarChart3 },
        { id: 'report-center', label: 'Pusat Laporan Konsolidasi', page: 'report-center', icon: Printer },
      ],
    },
    {
      id: 'peribadahan',
      label: 'Peribadahan & Kegiatan',
      icon: Church,
      items: [
        { id: 'worship-schedules', label: 'Jadwal & Petugas Ibadah', page: 'worship-schedules', icon: Calendar },
        { id: 'e-warta',           label: 'E-Warta Jemaat',          page: 'e-warta',           icon: FileText },
        { id: 'sermon-archive',    label: 'Arsip Khotbah & Renungan',page: 'sermon-archive',    icon: BookOpen },
        { id: 'liturgy',           label: 'Tata Ibadah',             page: 'liturgy',           icon: Book },
        { id: 'events',            label: 'Kalender Kegiatan',       page: 'events',            icon: Calendar },
        { id: 'ministries',        label: 'Pelkat & Komisi',         page: 'ministries',        icon: HeartHandshake },
        { id: 'livestream',        label: 'Livestream & Reminder',   page: 'livestream',        icon: Clock },
        { id: 'attendance',        label: 'Presensi Ibadah (QR)',    page: 'attendance',        icon: QrCode },
        { id: 'announcements',     label: 'Warta & Pengumuman',      page: 'announcements',     icon: Bell },
      ],
    },
    {
      id: 'keuangan',
      label: 'Keuangan & Persembahan (Modul Klasik)',
      icon: DollarSign,
      items: [
        { id: 'church-finance', label: 'Kas & Rekening Gereja', page: 'church-finance', icon: DollarSign },
        { id: 'offerings',      label: 'Persembahan Digital',   page: 'offerings',      icon: Heart },
        { id: 'financial',      label: 'Jurnal & Neraca Kas',   page: 'financial',      icon: BarChart3 },
      ],
    },
    {
      id: 'finance-addon',
      label: 'Finance',
      icon: Landmark,
      items: [
        { id: 'finance-addon',       label: 'Ringkasan Finance',     page: 'finance-addon',       icon: Landmark },
        { id: 'finance-dashboard',   label: 'Dashboard Finance',     page: 'finance-dashboard',   icon: LayoutDashboard },
        { id: 'finance-master-data', label: 'Master Data Finance',   page: 'finance-master-data', icon: Layers },
        { id: 'finance-budget',      label: 'Budget / RKA',          page: 'finance-budget',      icon: ClipboardList },
        { id: 'finance-transaction', label: 'Transaksi & Voucher',   page: 'finance-transaction', icon: Receipt },
        { id: 'finance-approval',    label: 'Verifikasi & Persetujuan', page: 'finance-approval', icon: Inbox },
        { id: 'finance-ledger',      label: 'Buku Besar (GL)',       page: 'finance-ledger',      icon: BookOpen },
        { id: 'finance-reconciliation', label: 'Rekonsiliasi Bank',  page: 'finance-reconciliation', icon: ArrowLeftRight },
        { id: 'finance-period-closing', label: 'Penutupan Periode',  page: 'finance-period-closing', icon: CalendarCheck },
        { id: 'finance-reports',     label: 'Laporan Keuangan',      page: 'finance-reports',     icon: FileBarChart },
      ],
    },
    {
      id: 'fasilitas',
      label: 'Fasilitas & Inventaris',
      icon: Package,
      items: [
        { id: 'assets',           label: 'Manajemen Aset',         page: 'assets',           icon: Package },
        { id: 'room-booking',     label: 'Peminjaman Ruangan',     page: 'room-booking',     icon: DoorOpen },
        { id: 'resource-library', label: 'Perpustakaan Digital',   page: 'resource-library', icon: Library },
      ],
    },
    {
      id: 'diakonia',
      label: 'Pelayanan Kasih & Doa',
      icon: HeartHandshake,
      items: [
        { id: 'service-requests', label: 'Permohonan Diakonia',   page: 'service-requests', icon: Heart,               badge: pendingServices > 0 ? pendingServices : undefined, badgeColor: '#ef4444' },
        { id: 'aid-distribution', label: 'Distribusi Bantuan',    page: 'aid-distribution', icon: Gift },
        { id: 'prayers',          label: 'Pokok & Pergumulan Doa',page: 'prayers',          icon: MessageSquareHeart,  badge: pendingPrayers > 0 ? pendingPrayers : undefined,   badgeColor: '#f59e0b' },
      ],
    },
    {
      id: 'persuratan',
      label: 'Surat Menyurat',
      icon: Mail,
      items: [
        { id: 'letters-outgoing', label: 'Surat Keluar', page: 'letters-outgoing', icon: Send },
        { id: 'letters-incoming', label: 'Surat Masuk', page: 'letters-incoming', icon: Inbox },
        { id: 'letter-templates', label: 'Template Surat', page: 'letter-templates', icon: FileText },
        { id: 'letter-settings', label: 'Pengaturan Surat Menyurat', page: 'letter-settings', icon: Mail },
      ],
    },
    {
      id: 'admin',
      label: 'Admin Sistem',
      icon: Shield,
      items: [
        { id: 'users',       label: 'List User',              page: 'users',       icon: UserCog },
        { id: 'roles',       label: 'Manajemen Hak Akses',    page: 'roles',       icon: ShieldCheck },
        { id: 'backup',      label: 'Backup & Restore',       page: 'backup',      icon: HardDrive },
        { id: 'data',        label: 'Pusat Manajemen Data',  page: 'data',        icon: Database },
        { id: 'master-data', label: 'Master Data',            page: 'master-data', icon: Layers },
        { id: 'activity',    label: 'Log Aktivitas',          page: 'activity',    icon: Activity },
      ],
    },
  ], [members.length, families.length, pendingPrayers, pendingServices]);

  // Auto-expand the active section if user navigated
  useEffect(() => {
    menuSections.forEach(section => {
      if (section.items.some(i => i.page === currentPage)) {
        setExpandedSections(prev => ({ ...prev, [section.id]: true }));
      }
    });
  }, [currentPage, menuSections]);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const sidebarWidth = !sidebarOpen ? '0px' : sidebarCollapsed ? '72px' : '260px';
  const mainMargin   = !sidebarOpen ? '0px' : sidebarCollapsed ? '72px' : '260px';

  const currentMeta = PAGE_LABELS[currentPage] || { title: 'Dashboard Utama', category: 'Utama' };

  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ background: '#f6f2ea' }}>

      {/* ══════════════════════ TOP NAVBAR (DARK NAVY WITH GOLD ACCENTS) ══════════════════════ */}
      <header
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 lg:px-6 h-16 shadow-md transition-all"
        style={{
          background: '#0d1a2d',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Left: Brand Identity with GPIB Emblem */}
        <div className="flex items-center gap-3">
          <div
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center p-0.5 shadow-sm border border-white/20 flex-shrink-0 group-hover:scale-105 transition-transform">
              <img
                src="/logo-gpib.jpg"
                alt="GPIB Emblem"
                className="w-full h-full object-contain rounded-full"
              />
            </div>

            <div className="flex flex-col">
              <span className="font-serif-church text-white font-bold tracking-wider text-sm lg:text-[15px] leading-tight group-hover:text-amber-200 transition-colors">
                G E M A S
              </span>
              <span className="text-[10.5px] font-medium tracking-wide" style={{ color: '#dfb774' }}>
                Gereja Manajemen Sistem
              </span>
            </div>
          </div>
        </div>

        {/* Right: Search, Role Pill, Notifications, Clock, Profile */}
        <div className="flex items-center gap-2.5">
          {/* Search Input */}
          <div className="hidden sm:block">
            <GlobalSearch
              variant="dark"
              placeholder="Cari data, ibadah, warga, kas..."
              onNavigate={onNavigate}
            />
          </div>

          {/* Notification Bell */}
          <NotificationBell dark />

          {/* Theme Switcher (Mode Terang/Gelap) */}
          <ThemeSwitcher dark />

          {/* User Role Pill Button */}
          <div className="relative">
            <button
              onClick={() => setShowProfile(p => !p)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white/90 transition-all hover:bg-white/10"
              style={{
                background: '#182842',
                border: '1px solid rgba(255,255,255,0.14)',
              }}
            >
              <User className="w-3.5 h-3.5 text-amber-300" />
              <span>{currentUser?.role || 'Jemaat'}</span>
            </button>

            {showProfile && (
              <ProfileDropdown
                user={currentUser}
                onLogout={() => { setShowProfile(false); logout(); }}
                onClose={() => setShowProfile(false)}
              />
            )}
          </div>

          {/* Live Clock Pill */}
          <div
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white/90"
            style={{
              background: '#182842',
              border: '1px solid rgba(255,255,255,0.14)',
            }}
          >
            <Clock className="w-3.5 h-3.5 text-amber-300" />
            <span className="font-mono tracking-wide">{timeString}</span>
          </div>
        </div>
      </header>

      {/* ══════════════════════ BODY WRAPPER ══════════════════════ */}
      <div className="flex-1 flex pt-16">

        {/* ══════════════════════ SIDEBAR (DARK NAVY WITH CATEGORIES) ══════════════════════ */}
        <aside
          className="fixed left-0 top-16 bottom-0 flex flex-col transition-all duration-300 z-40 shadow-xl"
          style={{
            width: sidebarWidth,
            background: '#0d1a2d',
            borderRight: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {/* Header section inside sidebar */}
          <div className="relative px-3.5 pt-3.5 pb-2.5 flex items-center justify-between min-h-[46px]">
            {!sidebarCollapsed ? (
              <>
                <span
                  className="text-[10.5px] font-bold tracking-widest uppercase font-serif-church truncate pr-6"
                  style={{ color: '#dfb774' }}
                >
                  MENU NAVIGASI SISTEM
                </span>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  title="Ciutkan Sidebar (Hide)"
                  className="absolute -right-3 top-1/2 -translate-y-1/2 z-50 w-6 h-6 rounded-full flex items-center justify-center text-amber-300 hover:text-slate-950 bg-[#0d1a2d] hover:bg-amber-400 border border-amber-400/50 shadow-md transition-all duration-150"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <div className="w-full flex justify-center">
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  title="Perluas Sidebar (Unhide)"
                  className="absolute -right-3 top-1/2 -translate-y-1/2 z-50 w-6 h-6 rounded-full flex items-center justify-center text-amber-300 hover:text-slate-950 bg-[#0d1a2d] hover:bg-amber-400 border border-amber-400/50 shadow-md transition-all duration-150"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Navigation Menu List */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 space-y-1.5 pb-6">
            {/* Dashboard Single Item */}
            <button
              onClick={() => onNavigate('dashboard')}
              onMouseEnter={e => {
                if (sidebarCollapsed) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({ label: 'Dashboard Utama', y: rect.top + rect.height / 2 });
                }
              }}
              onMouseLeave={() => sidebarCollapsed && setTooltip(null)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-left ${
                currentPage === 'dashboard'
                  ? 'text-white font-bold shadow-sm'
                  : 'text-white/70 hover:text-white hover:bg-white/5 font-medium'
              }`}
              style={{
                background: currentPage === 'dashboard' ? 'rgba(212, 175, 55, 0.14)' : 'transparent',
                border: currentPage === 'dashboard' ? '1px solid #caa049' : '1px solid transparent',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              }}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  currentPage === 'dashboard' ? 'bg-amber-400/20 text-amber-300' : 'text-white/60'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
              </div>
              {!sidebarCollapsed && (
                <span className="truncate text-xs leading-tight font-semibold">
                  Dashboard Utama
                </span>
              )}
            </button>

            {/* Menu Sections with Filtered Items & Categories */}
            {menuSections.map(section => {
              // Filter items by permission
              const visibleItems = section.items.filter(item => can(item.page, 'view'));

              if (visibleItems.length === 0) return null;

              const isExpanded = expandedSections[section.id] ?? false;
              const hasActiveChild = visibleItems.some(i => i.page === currentPage);
              const SectionIcon = section.icon;

              return (
                <div key={section.id} className="pt-1">
                  {/* Category Header */}
                  {!sidebarCollapsed ? (
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <SectionIcon className="w-3.5 h-3.5 text-amber-300/70 flex-shrink-0" />
                        <span className="text-[10.5px] font-bold uppercase tracking-wider truncate" style={{ color: '#d8c29d' }} title={section.label}>
                          {section.label}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3 text-white/40 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-white/30 flex-shrink-0" />
                      )}
                    </button>
                  ) : (
                    <div className="w-full my-1.5 h-px bg-white/10" />
                  )}

                  {/* Category Items */}
                  {(sidebarCollapsed || isExpanded) && (
                    <div className={sidebarCollapsed ? 'space-y-1' : 'space-y-0.5 mt-0.5'}>
                      {visibleItems.map(item => {
                        const active = currentPage === item.page;
                        const ItemIcon = item.icon;

                        return (
                          <button
                            key={item.id}
                            onClick={() => onNavigate(item.page)}
                            onMouseEnter={e => {
                              if (sidebarCollapsed) {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setTooltip({ label: item.label, y: rect.top + rect.height / 2 });
                              } else {
                                const span = e.currentTarget.querySelector('.nav-item-label') as HTMLElement | null;
                                if (span && span.scrollWidth > span.clientWidth) {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setTooltip({ label: item.label, x: rect.right + 10, y: rect.top + rect.height / 2 });
                                }
                              }
                            }}
                            onMouseLeave={() => setTooltip(null)}
                            title={item.label}
                            aria-label={item.label}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                              active
                                ? 'text-white font-bold shadow-xs'
                                : 'text-white/70 hover:text-white hover:bg-white/5'
                            }`}
                            style={{
                              background: active ? 'rgba(212, 175, 55, 0.15)' : 'transparent',
                              border: active ? '1px solid #caa049' : '1px solid transparent',
                              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                            }}
                          >
                            <div
                              className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                                active ? 'text-amber-300' : 'text-white/50'
                              }`}
                            >
                              <ItemIcon className="w-3.5 h-3.5" />
                            </div>

                            {!sidebarCollapsed && (
                              <div className="flex-1 flex items-center justify-between min-w-0">
                                <span className="nav-item-label truncate text-xs leading-tight" title={item.label}>
                                  {item.label}
                                </span>
                                {item.badge !== undefined && (
                                  <span
                                    className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold flex-shrink-0"
                                    style={{
                                      background: item.badgeColor || 'rgba(255,255,255,0.15)',
                                      color: '#ffffff',
                                    }}
                                  >
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Persistent account and sidebar controls */}
          <div
            className={`mx-2.5 mb-3 mt-2 flex items-center gap-2 border-t border-white/10 pt-3 ${
              sidebarCollapsed ? 'justify-center' : ''
            }`}
          >
            <button
              onClick={() => { setTooltip(null); logout(); }}
              title="Keluar dari Sistem"
              aria-label="Keluar dari Sistem"
              className={`flex items-center rounded-xl border border-red-300/20 bg-red-500/10 py-2 text-red-200 transition-all duration-150 hover:border-red-300/40 hover:bg-red-500/20 hover:text-white ${
                sidebarCollapsed ? 'h-10 w-10 justify-center' : 'min-w-0 flex-1 justify-center gap-2 px-3'
              }`}
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              {!sidebarCollapsed && <span className="truncate text-xs font-semibold">Keluar</span>}
            </button>
          </div>
        </aside>

        {/* Floating Tooltip in Collapsed Mode or for Truncated Text */}
        {tooltip && (
          <div
            className="fixed z-50 pointer-events-none transition-opacity duration-150"
            style={{
              left: tooltip.x !== undefined ? `${tooltip.x}px` : (sidebarCollapsed ? '80px' : '256px'),
              top: tooltip.y,
              transform: 'translateY(-50%)',
            }}
          >
            <div
              className="px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap text-xs font-semibold text-white border animate-in fade-in zoom-in-95 duration-150"
              style={{
                background: '#0d1a2d',
                borderColor: 'rgba(212,175,55,0.4)',
                boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
              }}
            >
              {tooltip.label}
            </div>
          </div>
        )}

        {/* ══════════════════════ MAIN CONTENT (AREA CONTENT UTAMA / .content-area) ══════════════════════ */}
        <main
          className="content-area flex-1 flex flex-col h-[calc(100vh-4rem)] overflow-y-auto overflow-x-hidden transition-all duration-300 relative"
          style={{ marginLeft: mainMargin }}
        >
          {/* Portal target untuk modal/dialog yang perlu dirender di luar alur DOM normal
              (Radix Dialog/AlertDialog, NotificationCenter) — tetap
              terkurung di dalam .content-area, tidak pernah menutupi sidebar/header. */}
          <div id="content-area-modal-root" />

          {/* Breadcrumb Header */}
          <div className="px-4 md:px-6 lg:px-8 pt-4 pb-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <button
                onClick={() => onNavigate('dashboard')}
                className="hover:text-amber-800 transition-colors font-medium"
              >
                GEMAS
              </button>
              <BreadcrumbArrow className="w-3 h-3 text-gray-400" />
              <span className="text-gray-600 font-medium">{currentMeta.category}</span>
              <BreadcrumbArrow className="w-3 h-3 text-gray-400" />
              <span className="text-gray-900 font-semibold">{currentMeta.title}</span>
            </div>
          </div>

          <div className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {children}
          </div>

          {/* Footer */}
          <footer
            className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 border-t mt-auto"
            style={{ borderColor: '#e2d8c4', background: '#faf7f0' }}
          >
            <p>© {new Date().getFullYear()} GPIB Trinitas — Gereja Manajemen Sistem (GEMAS)</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
