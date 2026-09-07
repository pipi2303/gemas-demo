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
import { FinancialManagement } from './components/FinancialManagement';
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
import { ChurchFinanceHub } from './components/ChurchFinanceHub';
// NEW: Enhanced database components
import { MemberDatabase } from './components/MemberDatabase';
import { FamilyDatabase } from './components/FamilyDatabase';
import { SectorDatabase } from './components/SectorDatabase';
import { SacramentDatabase } from './components/SacramentDatabase';
import { AttestationDatabase } from './components/AttestationDatabase';
import { AssetManagement } from './components/AssetManagement';
// NEW ORPHANED FEATURES
import { LaporanSensus } from './components/LaporanSensus';
import { ReportCenter } from './components/ReportCenter';
import { AidDistributionComponent } from './components/AidDistribution';
import { RoomBookingComponent } from './components/RoomBooking';
import { ResourceLibrary } from './components/ResourceLibrary';
import { SermonArchive } from './components/SermonArchive';
import { MasterData } from './components/MasterData';
import { FinanceAddonHome } from './components/finance/FinanceAddonHome';
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
            <img src="/logo-gpib.jpg" alt="GPIB" className="w-full h-full object-contain" />
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
        return <SacramentDatabase />;
      case 'attestations':
        return <AttestationDatabase />;
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
        
      // Modul 3: Keuangan & Persembahan
      case 'church-finance':
        return <ChurchFinanceHub />;
      case 'offerings':
        return <OfferingsQRIS />;
      case 'financial':
        return <FinancialManagement />;
      case 'finance-addon':
        return <FinanceAddonHome />;
        
      // Modul 4: Fasilitas & Inventaris
      case 'assets':
        return <AssetManagement />;
      case 'room-booking':
        return <RoomBookingComponent />;
      case 'resource-library':
        return <ResourceLibrary />;
      // Modul 5: Pelayanan & Komunikasi
      case 'service-requests':
        return <ServiceRequestsComponent />;
      case 'aid-distribution':
        return <AidDistributionComponent />;
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