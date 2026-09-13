import React, { Suspense, useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { LoginPage } from './components/LoginPage';
import { DashboardLayout } from './components/DashboardLayout';
import { Dashboard } from './components/Dashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TooltipRoot } from './components/ui/tooltip';
import { PAGE_MODULE } from '../lib/permissions';
// PWA IMPORTS
import { PWAInstallPrompt, PWAStatusIndicator } from './components/PWAInstallPrompt';
import { Toaster } from 'sonner';

// Halaman-halaman selain Dashboard/Login di-lazy-load per rute (React.lazy + Suspense).
// Ini AMAN karena: (1) navigasi di app ini murni switch(currentPage) di bawah, bukan
// react-router, jadi cuma satu komponen halaman yang pernah dirender di satu waktu;
// (2) tidak ada satupun komponen halaman ini yang diimpor file lain selain file ini
// (diverifikasi lewat grep sebelum perubahan ini); (3) tidak ada side-effect di level
// modul (window./setInterval/dll di luar fungsi komponen) di semua file ini.
// Efeknya: initial bundle tidak lagi menyeret kode SEMUA modul (Finance, Aset, dll)
// sekaligus — staf yang cuma buka satu-dua modul per sesi hanya men-download chunk
// modul itu saja.
const MinistryManagement = React.lazy(() => import('./components/MinistryManagement').then(m => ({ default: m.MinistryManagement })));
const EventCalendar = React.lazy(() => import('./components/EventCalendar').then(m => ({ default: m.EventCalendar })));
const PrayerRequests = React.lazy(() => import('./components/PrayerRequests').then(m => ({ default: m.PrayerRequests })));
const UserManagement = React.lazy(() => import('./components/UserManagement').then(m => ({ default: m.UserManagement })));
const ActivityLog = React.lazy(() => import('./components/ActivityLog').then(m => ({ default: m.ActivityLog })));
const AttendanceStatsQR = React.lazy(() => import('./components/AttendanceStatsQR').then(m => ({ default: m.AttendanceStatsQR })));
const AnnouncementManagement = React.lazy(() => import('./components/AnnouncementManagement').then(m => ({ default: m.AnnouncementManagement })));
const DataManager = React.lazy(() => import('./components/DataManager').then(m => ({ default: m.DataManager })));
const RolesManagement = React.lazy(() => import('./components/RolesManagement').then(m => ({ default: m.RolesManagement })));
const BackupRestore = React.lazy(() => import('./components/BackupRestore').then(m => ({ default: m.BackupRestore })));
// NEW IMPORTS: Modul Baru
const WorshipSchedules = React.lazy(() => import('./components/WorshipSchedules').then(m => ({ default: m.WorshipSchedules })));
const EWarta = React.lazy(() => import('./components/EWarta').then(m => ({ default: m.EWarta })));
const LiturgyDigital = React.lazy(() => import('./components/LiturgyDigital').then(m => ({ default: m.LiturgyDigital })));
const OfferingsQRIS = React.lazy(() => import('./components/OfferingsQRIS').then(m => ({ default: m.OfferingsQRIS })));
const ServiceRequestsComponent = React.lazy(() => import('./components/ServiceRequests').then(m => ({ default: m.ServiceRequestsComponent })));
// NEW IMPORTS: Fitur Pengembangan
const LivestreamReminder = React.lazy(() => import('./components/LivestreamReminder').then(m => ({ default: m.LivestreamReminder })));
// NEW: Enhanced database components
const MemberDatabase = React.lazy(() => import('./components/MemberDatabase').then(m => ({ default: m.MemberDatabase })));
const FamilyDatabase = React.lazy(() => import('./components/FamilyDatabase').then(m => ({ default: m.FamilyDatabase })));
const SectorDatabase = React.lazy(() => import('./components/SectorDatabase').then(m => ({ default: m.SectorDatabase })));
const SacramentDatabase = React.lazy(() => import('./components/SacramentDatabase').then(m => ({ default: m.SacramentDatabase })));
const AttestationDatabase = React.lazy(() => import('./components/AttestationDatabase').then(m => ({ default: m.AttestationDatabase })));
const AssetManagement = React.lazy(() => import('./components/AssetManagement').then(m => ({ default: m.AssetManagement })));
// Modul database, laporan, aset & fasilitas (dulu sempat ditandai draft/orphaned —
// sudah terhubung penuh ke AppContext, catatan lama dihapus supaya tidak menyesatkan)
const LaporanSensus = React.lazy(() => import('./components/LaporanSensus').then(m => ({ default: m.LaporanSensus })));
const ReportCenter = React.lazy(() => import('./components/ReportCenter').then(m => ({ default: m.ReportCenter })));
const AidDistributionComponent = React.lazy(() => import('./components/AidDistribution').then(m => ({ default: m.AidDistributionComponent })));
const RoomBookingComponent = React.lazy(() => import('./components/RoomBooking').then(m => ({ default: m.RoomBookingComponent })));
const ResourceLibrary = React.lazy(() => import('./components/ResourceLibrary').then(m => ({ default: m.ResourceLibrary })));
const SermonArchive = React.lazy(() => import('./components/SermonArchive').then(m => ({ default: m.SermonArchive })));
const MasterData = React.lazy(() => import('./components/MasterData').then(m => ({ default: m.MasterData })));
const LetterSettings = React.lazy(() => import('./components/LetterSettings').then(m => ({ default: m.LetterSettings })));
const OutgoingLetters = React.lazy(() => import('./components/OutgoingLetters').then(m => ({ default: m.OutgoingLetters })));
const LetterTemplates = React.lazy(() => import('./components/LetterTemplates').then(m => ({ default: m.LetterTemplates })));
const IncomingLetters = React.lazy(() => import('./components/IncomingLetters').then(m => ({ default: m.IncomingLetters })));
const FinanceMasterData = React.lazy(() => import('./components/finance/FinanceMasterData').then(m => ({ default: m.FinanceMasterData })));
const FinanceBudget = React.lazy(() => import('./components/finance/FinanceBudget').then(m => ({ default: m.FinanceBudget })));
const FinanceTransaction = React.lazy(() => import('./components/finance/FinanceTransaction').then(m => ({ default: m.FinanceTransaction })));
const FinanceLedger = React.lazy(() => import('./components/finance/FinanceLedger').then(m => ({ default: m.FinanceLedger })));
const FinanceApproval = React.lazy(() => import('./components/finance/FinanceApproval').then(m => ({ default: m.FinanceApproval })));
const FinanceReconciliation = React.lazy(() => import('./components/finance/FinanceReconciliation').then(m => ({ default: m.FinanceReconciliation })));
const FinancePeriodClosing = React.lazy(() => import('./components/finance/FinancePeriodClosing').then(m => ({ default: m.FinancePeriodClosing })));
const FinanceReports = React.lazy(() => import('./components/finance/FinanceReports').then(m => ({ default: m.FinanceReports })));
const FinanceDashboard = React.lazy(() => import('./components/finance/FinanceDashboard').then(m => ({ default: m.FinanceDashboard })));

// Fallback ringan saat chunk halaman sedang di-download — konsisten dengan gaya
// spinner yang sudah dipakai di layar "Menghubungkan ke server" (App ini).
function PageLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Global dirty flag — set by forms to warn before navigation
let _globalDirty = false;
export const setGlobalDirty = (dirty: boolean) => { _globalDirty = dirty; };
export const getGlobalDirty = () => _globalDirty;

function AppContent() {
  const { currentUser, dbReady, can } = useApp();
  const [currentPage, setCurrentPage] = useState('dashboard');

  // Reset to dashboard setiap kali user login
  useEffect(() => {
    if (currentUser) {
      setCurrentPage('dashboard');
    }
  }, [currentUser]);

  // Reset dirty flag setiap kali halaman berubah
  useEffect(() => { _globalDirty = false; }, [currentPage]);

  const navigate = (page: string) => {
    if (!currentUser) return;
    if (_globalDirty && page !== currentPage) {
      if (!window.confirm('Anda memiliki perubahan yang belum disimpan. Yakin ingin meninggalkan halaman ini?')) return;
      _globalDirty = false;
    }
    const mod = PAGE_MODULE[page];
    if (mod && !can(mod, 'view')) {
      setCurrentPage('dashboard');
      return;
    }
    setCurrentPage(page);
  };

  if (!dbReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'linear-gradient(145deg, #0a1e2c 0%, #0f2d41 100%)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white p-2 shadow-2xl">
            <img src="/logo-gemas.png" alt="Logo GEMAS" className="w-full h-full object-contain" />
          </div>
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>Menghubungkan ke server…</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={navigate} />;

      // Modul 1: Administrasi & Keanggotaan
      case 'members':
        return <MemberDatabase />;
      case 'families':
        return <FamilyDatabase />;
      case 'sectors':
        return <SectorDatabase />;
      case 'sacraments':
        return <SacramentDatabase onNavigate={navigate} />;
      case 'attestations':
        return <AttestationDatabase onNavigate={navigate} />;
      case 'sensus-report':
        return <LaporanSensus />;
      case 'report-center':
        return <ReportCenter />;

      // Modul 2: Peribadahan & Kegiatan
      case 'worship-schedules':
        return <WorshipSchedules />;
      case 'e-warta':
        return <EWarta />;
      case 'sermon-archive':
        return <SermonArchive />;
      case 'liturgy':
        return <LiturgyDigital />;
      case 'events':
        return <EventCalendar />;
      case 'ministries':
        return <MinistryManagement />;
      case 'livestream':
        return <LivestreamReminder />;
      case 'attendance':
        return <AttendanceStatsQR />;

      // Modul 3: Finance
      case 'offerings':
        return <OfferingsQRIS />;
      case 'finance-master-data':
        return <FinanceMasterData onNavigate={navigate} />;
      case 'finance-budget':
        return <FinanceBudget onNavigate={navigate} />;
      case 'finance-transaction':
        return <FinanceTransaction onNavigate={navigate} />;
      case 'finance-ledger':
        return <FinanceLedger onNavigate={navigate} />;
      case 'finance-approval':
        return <FinanceApproval onNavigate={navigate} />;
      case 'finance-reconciliation':
        return <FinanceReconciliation onNavigate={navigate} />;
      case 'finance-period-closing':
        return <FinancePeriodClosing onNavigate={navigate} />;
      case 'finance-reports':
        return <FinanceReports onNavigate={navigate} />;
      case 'finance-dashboard':
        return <FinanceDashboard onNavigate={navigate} />;

      // Modul 4: Fasilitas & Inventaris
      case 'assets':
        return <AssetManagement />;
      case 'room-booking':
        return <RoomBookingComponent onNavigate={navigate} />;
      case 'resource-library':
        return <ResourceLibrary />;
      // Modul 5: Pelayanan & Komunikasi
      case 'service-requests':
        return <ServiceRequestsComponent onNavigate={navigate} />;
      case 'aid-distribution':
        return <AidDistributionComponent onNavigate={navigate} />;
      case 'prayers':
        return <PrayerRequests />;
      case 'announcements':
        return <AnnouncementManagement />;

      // Admin Sistem
      case 'users':
        return <UserManagement />;
      case 'roles':
        return <RolesManagement />;
      case 'backup':
        return <BackupRestore />;
      case 'data':
        return <DataManager />;
      case 'master-data':
        return <MasterData />;
      case 'activity':
        return <ActivityLog />;
      case 'letters-outgoing':
        return <OutgoingLetters />;
      case 'letter-templates':
        return <LetterTemplates />;
      case 'letters-incoming':
        return <IncomingLetters />;
      case 'letter-settings':
        return <LetterSettings />;

      default:
        return <Dashboard />;
    }
  };

  return (
    <DashboardLayout currentPage={currentPage} onNavigate={navigate}>
      <PWAStatusIndicator />
      <ErrorBoundary key={currentPage}>
        <Suspense fallback={<PageLoadingFallback />}>
          {renderPage()}
        </Suspense>
      </ErrorBoundary>
      <PWAInstallPrompt />
      <Toaster position="top-right" richColors closeButton />
    </DashboardLayout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppContent />
        <TooltipRoot />
      </AppProvider>
    </ErrorBoundary>
  );
}
