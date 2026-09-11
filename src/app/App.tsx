import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { LoginPage } from './components/LoginPage';
import { DashboardLayout } from './components/DashboardLayout';
import { Dashboard } from './components/Dashboard';
import { MinistryManagement } from './components/MinistryManagement';
import { EventCalendar } from './components/EventCalendar';
import { PrayerRequests } from './components/PrayerRequests';
import { UserManagement } from './components/UserManagement';
import { ActivityLog } from './components/ActivityLog';
import { AttendanceStatsQR } from './components/AttendanceStatsQR';
import { AnnouncementManagement } from './components/AnnouncementManagement';
import { DataManager } from './components/DataManager';
import { RolesManagement } from './components/RolesManagement';
import { BackupRestore } from './components/BackupRestore';
// NEW IMPORTS: Modul Baru
import { WorshipSchedules } from './components/WorshipSchedules';
import { EWarta } from './components/EWarta';
import { LiturgyDigital } from './components/LiturgyDigital';
import { OfferingsQRIS } from './components/OfferingsQRIS';
import { ServiceRequestsComponent } from './components/ServiceRequests';
// NEW IMPORTS: Fitur Pengembangan
import { LivestreamReminder } from './components/LivestreamReminder';
// NEW: Enhanced database components
import { MemberDatabase } from './components/MemberDatabase';
import { FamilyDatabase } from './components/FamilyDatabase';
import { SectorDatabase } from './components/SectorDatabase';
import { SacramentDatabase } from './components/SacramentDatabase';
import { AttestationDatabase } from './components/AttestationDatabase';
import { AssetManagement } from './components/AssetManagement';
// Modul database, laporan, aset & fasilitas (dulu sempat ditandai draft/orphaned —
// sudah terhubung penuh ke AppContext, catatan lama dihapus supaya tidak menyesatkan)
import { LaporanSensus } from './components/LaporanSensus';
import { ReportCenter } from './components/ReportCenter';
import { AidDistributionComponent } from './components/AidDistribution';
import { RoomBookingComponent } from './components/RoomBooking';
import { ResourceLibrary } from './components/ResourceLibrary';
import { SermonArchive } from './components/SermonArchive';
import { MasterData } from './components/MasterData';
import { LetterSettings } from './components/LetterSettings';
import { OutgoingLetters } from './components/OutgoingLetters';
import { LetterTemplates } from './components/LetterTemplates';
import { IncomingLetters } from './components/IncomingLetters';
import { FinanceMasterData } from './components/finance/FinanceMasterData';
import { FinanceBudget } from './components/finance/FinanceBudget';
import { FinanceTransaction } from './components/finance/FinanceTransaction';
import { FinanceLedger } from './components/finance/FinanceLedger';
import { FinanceApproval } from './components/finance/FinanceApproval';
import { FinanceReconciliation } from './components/finance/FinanceReconciliation';
import { FinancePeriodClosing } from './components/finance/FinancePeriodClosing';
import { FinanceReports } from './components/finance/FinanceReports';
import { FinanceDashboard } from './components/finance/FinanceDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TooltipRoot } from './components/ui/tooltip';
import { PAGE_MODULE } from '../lib/permissions';
// PWA IMPORTS
import { PWAInstallPrompt, PWAStatusIndicator } from './components/PWAInstallPrompt';
import { Toaster } from 'sonner';

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
        {renderPage()}
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