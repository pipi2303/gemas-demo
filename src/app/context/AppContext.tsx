import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { toast } from 'sonner';
import { api, apiSave, apiRemove, setToken, clearToken, getToken } from '../../lib/apiClient';
import { ModulePermission, DEFAULT_PERMISSIONS, buildCan } from '../../lib/permissions';
import type { PermissionKey } from '../../lib/permissions';
import {
  User, Member, Family, Sector, Ministry, Event, PrayerRequest,
  Attendance, ActivityLog, Notification, Announcement, FinancialRecord,
  FinancialCategory, MinistrySchedule, ThemePreference,
  WorshipSchedule, Warta, Liturgy, Offering, BuildingProject,
  ServiceRequest, AidDistribution, Resource, RoomBooking, Attestation,
  Baptism, Sidi, Marriage, MasterDataItem, MasterDataCategory, UserRole,
  PettyCash, PcTopUp,
  ChurchAsset, MaintenanceRecord, LoanHistoryRecord,
  BankAccount, Budget,
  LivestreamLink, ReminderSetting, Liability,
  FiscalYearSetting, Room, CustomRole, BuiltinRoleOverride, SectorTransfer
} from '../types';
import { getDomainForEntityType, getAuditSeverity } from '../lib/auditUtils';

interface AppContextType {
  // DB
  dbReady: boolean;
  // Auth
  currentUser: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  
  // Existing Data
  members: Member[];
  families: Family[];
  sectors: Sector[];
  users: User[];
  ministries: Ministry[];
  events: Event[];
  prayerRequests: PrayerRequest[];
  attendance: Attendance[];
  activityLogs: ActivityLog[];
  notifications: Notification[];
  announcements: Announcement[];
  financialRecords: FinancialRecord[];
  financialCategories: FinancialCategory[];
  ministrySchedules: MinistrySchedule[];
  theme: ThemePreference;
  
  // NEW: Modul 2 - Peribadahan & Kegiatan
  worshipSchedules: WorshipSchedule[];
  wartas: Warta[];
  liturgies: Liturgy[];
  addWorshipSchedule: (schedule: Omit<WorshipSchedule, 'id' | 'createdAt'>) => void;
  updateWorshipSchedule: (id: string, schedule: Partial<WorshipSchedule>) => void;
  deleteWorshipSchedule: (id: string) => void;
  addWarta: (warta: Omit<Warta, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateWarta: (id: string, warta: Partial<Warta>) => void;
  deleteWarta: (id: string) => void;
  addLiturgy: (liturgy: Omit<Liturgy, 'id' | 'createdAt'>) => void;
  updateLiturgy: (id: string, liturgy: Partial<Liturgy>) => void;
  deleteLiturgy: (id: string) => void;
  
  // NEW: Modul 3 - Keuangan & Persembahan
  offerings: Offering[];
  buildingProjects: BuildingProject[];
  addOffering: (offering: Omit<Offering, 'id' | 'createdAt'>) => void;
  updateOffering: (id: string, offering: Partial<Offering>) => void;
  deleteOffering: (id: string) => void;
  
  // NEW: Modul 4 - Pelayanan Kasih & Diakonia
  serviceRequests: ServiceRequest[];
  aidDistributions: AidDistribution[];
  
  // NEW: Modul 5 - Komunikasi & Pembinaan
  resources: Resource[];
  roomBookings: RoomBooking[];
  
  // NEW: Atestasi
  attestations: Attestation[];
  
  // NEW: Baptisan, Sidi, Perkawinan
  baptisms: Baptism[];
  sidis: Sidi[];
  marriages: Marriage[];

  // Master Data
  masterDataItems: MasterDataItem[];
  addMasterDataItem: (item: Omit<MasterDataItem, 'id' | 'createdAt'>) => void;
  updateMasterDataItem: (id: string, item: Partial<MasterDataItem>) => void;
  deleteMasterDataItem: (id: string) => void;
  getMasterDataByCategory: (category: MasterDataCategory) => MasterDataItem[];
  
  // Existing Actions
  addMember: (member: Omit<Member, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateMember: (id: string, member: Partial<Member>) => void;
  deleteMember: (id: string) => void;
  
  addFamily: (family: Omit<Family, 'id'> & { id?: string }) => void;
  updateFamily: (id: string, family: Partial<Family>) => void;
  deleteFamily: (id: string) => void;

  addSector: (sector: Omit<Sector, 'id' | 'memberCount'>) => void;
  updateSector: (id: string, sector: Partial<Sector>) => void;
  deleteSector: (id: string) => void;
  
  addUser: (user: Omit<User, 'id'>) => void;
  updateUser: (id: string, user: Partial<User>) => void;
  deleteUser: (id: string) => void;
  
  addMinistry: (ministry: Omit<Ministry, 'id'>) => void;
  updateMinistry: (id: string, ministry: Partial<Ministry>) => void;
  deleteMinistry: (id: string) => void;
  
  addEvent: (event: Omit<Event, 'id'>) => void;
  updateEvent: (id: string, event: Partial<Event>) => void;
  deleteEvent: (id: string) => void;
  
  addPrayerRequest: (request: Omit<PrayerRequest, 'id' | 'createdAt'>) => void;
  updatePrayerRequest: (id: string, request: Partial<PrayerRequest>) => void;
  
  addAttendance: (attendance: Omit<Attendance, 'id'>) => void;
  
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  deleteNotification: (id: string) => void;
  
  addAnnouncement: (announcement: Omit<Announcement, 'id' | 'createdAt'>) => void;
  updateAnnouncement: (id: string, announcement: Partial<Announcement>) => void;
  deleteAnnouncement: (id: string) => void;
  
  addFinancialRecord: (record: Omit<FinancialRecord, 'id' | 'createdAt'>) => void;
  updateFinancialRecord: (id: string, record: Partial<FinancialRecord>) => void;
  deleteFinancialRecord: (id: string) => void;
  
  addMinistrySchedule: (schedule: Omit<MinistrySchedule, 'id'>) => void;
  updateMinistrySchedule: (id: string, schedule: Partial<MinistrySchedule>) => void;
  deleteMinistrySchedule: (id: string) => void;
  
  // NEW: Baptism, Sidi, Marriage CRUD
  addBaptism: (baptism: Omit<Baptism, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateBaptism: (id: string, baptism: Partial<Baptism>) => void;
  deleteBaptism: (id: string) => void;

  addSidi: (sidi: Omit<Sidi, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateSidi: (id: string, sidi: Partial<Sidi>) => void;
  deleteSidi: (id: string) => void;

  addMarriage: (marriage: Omit<Marriage, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateMarriage: (id: string, marriage: Partial<Marriage>) => void;
  deleteMarriage: (id: string) => void;

  // ServiceRequest CRUD
  addServiceRequest: (req: Omit<ServiceRequest, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateServiceRequest: (id: string, req: Partial<ServiceRequest>) => void;
  deleteServiceRequest: (id: string) => void;

  // AidDistribution CRUD
  addAidDistribution: (aid: Omit<AidDistribution, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateAidDistribution: (id: string, aid: Partial<AidDistribution>) => void;
  deleteAidDistribution: (id: string) => void;

  // Resource CRUD
  addResource: (resource: Omit<Resource, 'id' | 'createdAt'>) => void;
  updateResource: (id: string, resource: Partial<Resource>) => void;
  deleteResource: (id: string) => void;

  // RoomBooking CRUD
  addRoomBooking: (booking: Omit<RoomBooking, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateRoomBooking: (id: string, booking: Partial<RoomBooking>) => void;
  deleteRoomBooking: (id: string) => void;

  // BuildingProject CRUD
  addBuildingProject: (project: Omit<BuildingProject, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateBuildingProject: (id: string, project: Partial<BuildingProject>) => void;
  deleteBuildingProject: (id: string) => void;

  // FinancialCategory CRUD
  addFinancialCategory: (cat: Omit<FinancialCategory, 'id'>) => void;
  updateFinancialCategory: (id: string, cat: Partial<FinancialCategory>) => void;
  deleteFinancialCategory: (id: string) => void;

  // Attestation CRUD
  addAttestation: (att: Omit<Attestation, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateAttestation: (id: string, att: Partial<Attestation>) => void;
  deleteAttestation: (id: string) => void;

  // PettyCash CRUD
  pettyCash: PettyCash[];
  pcTopUps: PcTopUp[];
  addPettyCash: (data: Omit<PettyCash, 'id' | 'createdAt'>) => void;
  updatePettyCash: (id: string, data: Partial<PettyCash>) => void;
  deletePettyCash: (id: string) => void;
  addPcTopUp: (data: Omit<PcTopUp, 'id' | 'createdAt'>) => void;
  deletePcTopUp: (id: string) => void;

  // ChurchAsset CRUD
  churchAssets: ChurchAsset[];
  assetMaintenances: MaintenanceRecord[];
  assetLoanHistories: LoanHistoryRecord[];
  addChurchAsset: (asset: Omit<ChurchAsset, 'id' | 'createdAt' | 'updatedAt'>) => ChurchAsset;
  updateChurchAsset: (id: string, data: Partial<ChurchAsset>) => void;
  deleteChurchAsset: (id: string) => void;
  addAssetMaintenance: (rec: Omit<MaintenanceRecord, 'id'>) => void;
  addAssetLoanHistory: (rec: Omit<LoanHistoryRecord, 'id'>) => void;
  updateAssetLoanHistory: (id: string, data: Partial<LoanHistoryRecord>) => void;

  // BankAccount CRUD
  bankAccounts: BankAccount[];
  addBankAccount: (acc: Omit<BankAccount, 'id'>) => void;
  updateBankAccount: (id: string, acc: Partial<BankAccount>) => void;
  deleteBankAccount: (id: string) => void;

  // Budget CRUD
  budgets: Budget[];
  addBudget: (b: Omit<Budget, 'id'>) => void;
  updateBudget: (id: string, b: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;

  // LivestreamLink CRUD
  livestreamLinks: LivestreamLink[];
  addLivestreamLink: (link: Omit<LivestreamLink, 'id'>) => void;
  updateLivestreamLink: (id: string, link: Partial<LivestreamLink>) => void;
  deleteLivestreamLink: (id: string) => void;

  // ReminderSetting CRUD
  reminderSettings: ReminderSetting[];
  addReminderSetting: (r: Omit<ReminderSetting, 'id'>) => void;
  updateReminderSetting: (id: string, r: Partial<ReminderSetting>) => void;
  deleteReminderSetting: (id: string) => void;

  liabilities: Liability[];
  addLiability: (l: Omit<Liability, 'id'>) => void;
  updateLiability: (id: string, l: Partial<Liability>) => void;
  deleteLiability: (id: string) => void;

  fiscalYearSettings: FiscalYearSetting[];
  addFiscalYearSetting: (s: Omit<FiscalYearSetting, 'id'>) => void;
  updateFiscalYearSetting: (id: string, s: Partial<FiscalYearSetting>) => void;
  deleteFiscalYearSetting: (id: string) => void;

  rooms: Room[];
  addRoom: (r: Omit<Room, 'id'>) => void;
  updateRoom: (id: string, r: Partial<Room>) => void;
  deleteRoom: (id: string) => void;

  customRoles: CustomRole[];
  addCustomRole: (r: Omit<CustomRole, 'id'>) => void;
  updateCustomRole: (id: string, r: Partial<CustomRole>) => void;
  deleteCustomRole: (id: string) => void;

  builtinRoleOverrides: BuiltinRoleOverride[];
  upsertBuiltinRoleOverride: (override: BuiltinRoleOverride) => void;

  setTheme: (theme: ThemePreference) => void;

  sectorTransfers: SectorTransfer[];
  addSectorTransfer: (transfer: Omit<SectorTransfer, 'id'>) => void;
  updateSectorTransfer: (id: string, transfer: Partial<SectorTransfer>) => void;
  deleteSectorTransfer: (id: string) => void;

  logActivity: (log: Omit<ActivityLog, 'id' | 'timestamp'>) => void;

  reloadData: () => Promise<unknown>;

  // Search & Filter
  globalSearch: (query: string) => any[];
  can: (module: string, permission: PermissionKey) => boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [dbReady, setDbReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [financialRecords, setFinancialRecords] = useState<FinancialRecord[]>([]);
  const [financialCategories, setFinancialCategories] = useState<FinancialCategory[]>([]);
  const [ministrySchedules, setMinistrySchedules] = useState<MinistrySchedule[]>([]);
  const [theme, setTheme] = useState<ThemePreference>({ mode: 'light' });

  // NEW: Modul 2 - Peribadahan & Kegiatan
  const [worshipSchedules, setWorshipSchedules] = useState<WorshipSchedule[]>([]);
  const [wartas, setWartas] = useState<Warta[]>([]);
  const [liturgies, setLiturgies] = useState<Liturgy[]>([]);

  // NEW: Modul 3 - Keuangan & Persembahan
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [buildingProjects, setBuildingProjects] = useState<BuildingProject[]>([]);

  // NEW: Modul 4 - Pelayanan Kasih & Diakonia
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [aidDistributions, setAidDistributions] = useState<AidDistribution[]>([]);

  // NEW: Modul 5 - Komunikasi & Pembinaan
  const [resources, setResources] = useState<Resource[]>([]);
  const [roomBookings, setRoomBookings] = useState<RoomBooking[]>([]);

  // NEW: Atestasi
  const [attestations, setAttestations] = useState<Attestation[]>([]);

  // NEW: Baptisan, Sidi, Perkawinan
  const [baptisms, setBaptisms] = useState<Baptism[]>([]);
  const [sidis, setSidis] = useState<Sidi[]>([]);
  const [marriages, setMarriages] = useState<Marriage[]>([]);
  const [masterDataItems, setMasterDataItems] = useState<MasterDataItem[]>([]);
  const [permMatrix, setPermMatrix] = useState<ModulePermission[]>(DEFAULT_PERMISSIONS);
  const [pettyCash, setPettyCash] = useState<PettyCash[]>([]);
  const [pcTopUps, setPcTopUps] = useState<PcTopUp[]>([]);
  const [churchAssets, setChurchAssets] = useState<ChurchAsset[]>([]);
  const [assetMaintenances, setAssetMaintenances] = useState<MaintenanceRecord[]>([]);
  const [assetLoanHistories, setAssetLoanHistories] = useState<LoanHistoryRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [livestreamLinks, setLivestreamLinks] = useState<LivestreamLink[]>([]);
  const [reminderSettings, setReminderSettings] = useState<ReminderSetting[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [fiscalYearSettings, setFiscalYearSettings] = useState<FiscalYearSetting[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [builtinRoleOverrides, setBuiltinRoleOverrides] = useState<BuiltinRoleOverride[]>([]);
  const [sectorTransfers, setSectorTransfers] = useState<SectorTransfer[]>([]);

  // Load semua koleksi dari API setelah login berhasil
  async function loadAllData() {
    if (!getToken() && !localStorage.getItem('currentUser')) return;

    const load = async <T,>(col: string, setter: React.Dispatch<React.SetStateAction<T[]>>): Promise<T[]> => {
      try {
        const items = await api.get<T[]>(`/api/data/${col}`);
        setter(items);
        return items;
      } catch {
        setter([]);
        return [];
      }
    };

    const [
      loadedMembers, , , , ,
      loadedEvents, , , , , , , ,
      loadedWorshipSchedules, , , , , , , , , ,
      loadedMarriages, , ,
    ] = await Promise.all([
      api.get<Member[]>('/api/data/members').then(items => { setMembers(items); return items; }).catch(err => {
        console.warn('Failed to load members:', err?.message || err);
        setMembers([]);
        return [] as Member[];
      }),
      api.get<Family[]>('/api/data/families').then(items => { setFamilies(items); return items; }).catch(err => {
        console.warn('Failed to load families:', err?.message || err);
        setFamilies([]);
        return [] as Family[];
      }),
      api.get<Sector[]>('/api/data/sectors').then(items => { setSectors(items); return items; }).catch(err => {
        console.warn('Failed to load sectors:', err?.message || err);
        setSectors([]);
        return [] as Sector[];
      }),
      load<User>('users', setUsers),
      load<Ministry>('ministries', setMinistries),
      load<Event>('events', setEvents),
      load<PrayerRequest>('prayerRequests', setPrayerRequests),
      load<Attendance>('attendance', setAttendance),
      load<ActivityLog>('activityLogs', setActivityLogs),
      load<Announcement>('announcements', setAnnouncements),
      load<FinancialRecord>('financialRecords', setFinancialRecords),
      load<FinancialCategory>('financialCategories', setFinancialCategories),
      load<MinistrySchedule>('ministrySchedules', setMinistrySchedules),
      load<WorshipSchedule>('worshipSchedules', setWorshipSchedules),
      load<Warta>('wartas', setWartas),
      load<Liturgy>('liturgies', setLiturgies),
      load<Offering>('offerings', setOfferings),
      load<BuildingProject>('buildingProjects', setBuildingProjects),
      load<ServiceRequest>('serviceRequests', setServiceRequests),
      load<AidDistribution>('aidDistributions', setAidDistributions),
      load<Resource>('resources', setResources),
      load<RoomBooking>('roomBookings', setRoomBookings),
      load<Attestation>('attestations', setAttestations),
      load<Baptism>('baptisms', setBaptisms),
      load<Sidi>('sidis', setSidis),
      load<Marriage>('marriages', setMarriages),
      load<Notification>('notifications', setNotifications),
    ]);

    // Fetch sisa koleksi secara paralel (bukan berurutan) supaya setState-nya bisa
    // di-batch React jadi satu kali render, bukan satu render terpisah per request.
    const [
      financialCategoriesLoaded,
      masterDataItemsLoaded,
      pettyCashLoaded,
      pcTopUpsLoaded,
      churchAssetsLoaded,
      assetMaintenancesLoaded,
      assetLoanHistoriesLoaded,
      bankAccountsLoaded,
      budgetsLoaded,
      livestreamLinksLoaded,
      reminderSettingsLoaded,
      liabilitiesLoaded,
      fiscalYearSettingsLoaded,
      roomsLoaded,
      customRolesLoaded,
      builtinRoleOverridesLoaded,
      sectorTransfersLoaded,
    ] = await Promise.all([
      api.get<FinancialCategory[]>('/api/data/financialCategories').catch(() => [] as FinancialCategory[]),
      api.get<MasterDataItem[]>('/api/data/masterData').catch(() => [] as MasterDataItem[]),
      api.get<PettyCash[]>('/api/data/pettyCash').catch(() => [] as PettyCash[]),
      api.get<PcTopUp[]>('/api/data/pettyCashTopUps').catch(() => [] as PcTopUp[]),
      api.get<ChurchAsset[]>('/api/data/churchAssets').catch(() => [] as ChurchAsset[]),
      api.get<MaintenanceRecord[]>('/api/data/assetMaintenances').catch(() => [] as MaintenanceRecord[]),
      api.get<LoanHistoryRecord[]>('/api/data/assetLoanHistories').catch(() => [] as LoanHistoryRecord[]),
      api.get<BankAccount[]>('/api/data/bankAccounts').catch(() => [] as BankAccount[]),
      api.get<Budget[]>('/api/data/budgets').catch(() => [] as Budget[]),
      api.get<LivestreamLink[]>('/api/data/livestreamLinks').catch(() => [] as LivestreamLink[]),
      api.get<ReminderSetting[]>('/api/data/reminderSettings').catch(() => [] as ReminderSetting[]),
      api.get<Liability[]>('/api/data/liabilities').catch(() => [] as Liability[]),
      api.get<FiscalYearSetting[]>('/api/data/fiscalYearSettings').catch(() => [] as FiscalYearSetting[]),
      api.get<Room[]>('/api/data/rooms').catch(() => [] as Room[]),
      api.get<CustomRole[]>('/api/data/customRoles').catch(() => [] as CustomRole[]),
      api.get<BuiltinRoleOverride[]>('/api/data/builtinRoleOverrides').catch(() => [] as BuiltinRoleOverride[]),
      api.get<SectorTransfer[]>('/api/data/sectorTransfers').catch(() => [] as SectorTransfer[]),
    ]);

    // FinancialCategories: seed jika kosong
    {
      const loaded = financialCategoriesLoaded;
      const FC_REPORT_GROUP: Record<string, FinancialCategory['reportGroup']> = {
        'Dana Pembangunan': 'terikat',
        'Gaji & Tunjangan': 'admin', 'Gaji Pelayan': 'admin', 'Operasional Gedung': 'admin',
        'Listrik & Air': 'admin', 'Komunikasi': 'admin', 'ATK & Perlengkapan': 'admin', 'Biaya Administrasi': 'admin',
        'Pelayanan & Diakonia': 'program', 'Kegiatan Kategorial': 'program', 'Perlengkapan Ibadah': 'program',
        'Pelayanan Sosial': 'program', 'Konsumsi & Acara': 'program',
        'Pemeliharaan Aset': 'pemeliharaan', 'Pemeliharaan Gedung': 'pemeliharaan',
      };
      if (loaded.length === 0) {
        const DEFAULT_FINANCIAL_CATEGORIES: FinancialCategory[] = [
          { id: 'fc_inc1', name: 'Persembahan Minggu',   type: 'income',  description: 'Kolekte ibadah minggu',                              reportGroup: null },
          { id: 'fc_inc2', name: 'Persepuluhan',          type: 'income',  description: 'Persembahan persepuluhan jemaat',                     reportGroup: null },
          { id: 'fc_inc3', name: 'Dana Pembangunan',      type: 'income',  description: 'Kolekte dana pembangunan gedung',                     reportGroup: 'terikat' },
          { id: 'fc_inc4', name: 'Hibah & Donasi',        type: 'income',  description: 'Donasi & sumbangan dari jemaat atau pihak luar',      reportGroup: null },
          { id: 'fc_inc5', name: 'Kolekte Khusus',        type: 'income',  description: 'Kolekte untuk acara atau tujuan khusus',              reportGroup: null },
          { id: 'fc_inc6', name: 'Persembahan Paskah',    type: 'income',  description: 'Kolekte khusus perayaan Paskah',                      reportGroup: null },
          { id: 'fc_inc7', name: 'Persembahan Natal',     type: 'income',  description: 'Kolekte khusus perayaan Natal',                       reportGroup: null },
          { id: 'fc_exp1', name: 'Gaji & Tunjangan',      type: 'expense', description: 'Gaji pendeta, pegawai, dan tunjangan',                reportGroup: 'admin' },
          { id: 'fc_exp2', name: 'Operasional Gedung',    type: 'expense', description: 'Listrik, air, kebersihan gedung',                     reportGroup: 'admin' },
          { id: 'fc_exp3', name: 'Pelayanan & Diakonia',  type: 'expense', description: 'Biaya pelayanan kasih dan diakonia sosial',           reportGroup: 'program' },
          { id: 'fc_exp4', name: 'Kegiatan Kategorial',   type: 'expense', description: 'Biaya kegiatan komisi dan unit kategorial',           reportGroup: 'program' },
          { id: 'fc_exp5', name: 'ATK & Perlengkapan',    type: 'expense', description: 'Alat tulis kantor dan perlengkapan administrasi',     reportGroup: 'admin' },
          { id: 'fc_exp6', name: 'Pemeliharaan Aset',     type: 'expense', description: 'Perbaikan dan pemeliharaan aset gereja',              reportGroup: 'pemeliharaan' },
          { id: 'fc_exp7', name: 'Konsumsi & Acara',      type: 'expense', description: 'Biaya konsumsi kegiatan dan acara gereja',            reportGroup: 'program' },
          { id: 'fc_exp8', name: 'Biaya Administrasi',    type: 'expense', description: 'Biaya administrasi, notaris, dan legalitas',          reportGroup: 'admin' },
        ];
        setFinancialCategories(DEFAULT_FINANCIAL_CATEGORIES);
        DEFAULT_FINANCIAL_CATEGORIES.forEach(cat => apiSave('financialCategories', cat.id, cat));
      } else {
        // Migration: tambah reportGroup jika record lama belum punya
        const migrated = loaded.map((cat: FinancialCategory) => {
          if ('reportGroup' in cat) return cat;
          const rg = FC_REPORT_GROUP[cat.name] ?? null;
          const updated = { ...cat, reportGroup: rg };
          apiSave('financialCategories', cat.id, updated);
          return updated;
        });
        setFinancialCategories(migrated);
      }
    }

    // Master data: load dari DB, seed jika kosong atau kurang dari 12 kategori
    try {
      const mdItems = masterDataItemsLoaded;
      const mdCats = new Set(mdItems.map((m: MasterDataItem) => m.category));
      if (mdItems.length === 0 || mdCats.size < 32) {
        throw new Error('needs_seed');
      }
      // Migrasi: ganti jenis_ibadah lama jika belum pakai list baru
      const NEW_JENIS = ['Doa Pagi','Ibadah GP','Ibadah Keluarga Sektor 1','Ibadah Keluarga Sektor 2','Ibadah Keluarga Sektor 3','Ibadah Keluarga Sektor 4','Ibadah Minggu Pagi','Ibadah Minggu Sore','Ibadah PKB','Ibadah PKLU','Ibadah PKP','IHMPA','IHMPT'];
      const existingJenis = mdItems.filter((m: MasterDataItem) => m.category === 'jenis_ibadah');
      const hasNewList = existingJenis.some((m: MasterDataItem) => NEW_JENIS.includes(m.value));
      if (!hasNewList) {
        existingJenis.forEach((m: MasterDataItem) => apiRemove('masterData', m.id));
        const newItems: MasterDataItem[] = NEW_JENIS.map((v, i) => ({ id: `md_ji_${i}`, category: 'jenis_ibadah' as MasterDataCategory, value: v, label: v, isActive: true, order: i + 1, createdAt: new Date().toISOString() }));
        newItems.forEach(item => apiSave('masterData', item.id, item));
        setMasterDataItems([...mdItems.filter((m: MasterDataItem) => m.category !== 'jenis_ibadah'), ...newItems]);
      } else {
        setMasterDataItems(mdItems);
      }
    } catch {
      const seeded = DEFAULT_MASTER_DATA.map((item: Omit<MasterDataItem,'id'|'createdAt'>, i: number) => ({
        ...item,
        id: `md${Date.now()}${i}`,
        createdAt: new Date().toISOString(),
      }));
      setMasterDataItems(seeded);
      seeded.forEach((item: MasterDataItem) => apiSave('masterData', item.id, item));
    }

    // PettyCash: load dari DB, seed jika kosong
    {
      const INIT_PC_TOPUPS: PcTopUp[] = [
        { id: 'tu1', date: '2026-03-01', amount: 3_000_000, source: 'Rekening Operasional (BCA)', description: 'Dana awal kas kecil bulan Maret 2026', approvedBy: 'Majelis Keuangan', createdBy: 'Admin', createdAt: '2026-03-01T08:00:00Z' },
      ];
      const INIT_PETTY_CASH: PettyCash[] = [
        { id: 'pc1',  date: '2026-03-01', category: 'Konsumsi & Snack',    description: 'Snack rapat majelis bulanan',          amount: 185_000, payTo: 'Ibu Sari',       receiptNo: 'KK/001/III/26', status: 'Lunas',   createdBy: 'Admin',    createdAt: '2026-03-01T09:00:00Z' },
        { id: 'pc2',  date: '2026-03-02', category: 'ATK & Alat Tulis',    description: 'Pembelian kertas A4 2 rim + tinta',    amount: 245_000, payTo: 'Toko Sinar',     receiptNo: 'KK/002/III/26', status: 'Lunas',   createdBy: 'Admin',    createdAt: '2026-03-02T10:00:00Z' },
        { id: 'pc3',  date: '2026-03-03', category: 'Transportasi',        description: 'Ongkos kunjungan diakonia Sektor 1',   amount: 120_000, payTo: 'Pak Hendra',     receiptNo: 'KK/003/III/26', status: 'Lunas',   createdBy: 'Operator', createdAt: '2026-03-03T08:30:00Z' },
        { id: 'pc4',  date: '2026-03-05', category: 'Kebersihan',          description: 'Sabun, pembersih lantai ruang ibadah', amount: 95_000,  payTo: 'Minimarket',     receiptNo: 'KK/004/III/26', status: 'Lunas',   createdBy: 'Admin',    createdAt: '2026-03-05T14:00:00Z' },
        { id: 'pc5',  date: '2026-03-06', category: 'Percetakan',          description: 'Cetak buletin jemaat 200 lembar',      amount: 160_000, payTo: 'Fotokopi Cepat', receiptNo: 'KK/005/III/26', status: 'Lunas',   createdBy: 'Operator', createdAt: '2026-03-06T11:00:00Z' },
        { id: 'pc6',  date: '2026-03-07', category: 'Perlengkapan Ibadah', description: 'Lilin altar 2 pak + bunga',            amount: 210_000, payTo: 'Toko Bunga',     receiptNo: 'KK/006/III/26', status: 'Lunas',   createdBy: 'Admin',    createdAt: '2026-03-07T09:30:00Z' },
        { id: 'pc7',  date: '2026-03-09', category: 'Komunikasi',          description: 'Pulsa internet kantor gereja',         amount: 150_000, payTo: 'Provider XYZ',   receiptNo: 'KK/007/III/26', status: 'Lunas',   createdBy: 'Admin',    createdAt: '2026-03-09T10:00:00Z' },
        { id: 'pc8',  date: '2026-03-10', category: 'Konsumsi & Snack',    description: 'Makan siang tim dekorasi kebaktian',   amount: 320_000, payTo: 'Warung Makan',   receiptNo: 'KK/008/III/26', status: 'Lunas',   createdBy: 'Operator', createdAt: '2026-03-10T12:00:00Z' },
        { id: 'pc9',  date: '2026-03-12', category: 'Transportasi',        description: 'Ongkos kirim undangan ke sektor 2&3',  amount: 80_000,  payTo: 'Pak Budi',       receiptNo: 'KK/009/III/26', status: 'Lunas',   createdBy: 'Admin',    createdAt: '2026-03-12T08:00:00Z' },
        { id: 'pc10', date: '2026-03-13', category: 'ATK & Alat Tulis',    description: 'Spidol whiteboard & penghapus',        amount: 75_000,  payTo: 'Toko ATK',       receiptNo: 'KK/010/III/26', status: 'Lunas',   createdBy: 'Admin',    createdAt: '2026-03-13T09:00:00Z' },
        { id: 'pc11', date: '2026-03-15', category: 'Perlengkapan Ibadah', description: 'Anggur perjamuan & roti',              amount: 180_000, payTo: 'Supermarket',    receiptNo: 'KK/011/III/26', status: 'Lunas',   createdBy: 'Operator', createdAt: '2026-03-15T10:00:00Z' },
        { id: 'pc12', date: '2026-03-17', category: 'Kebersihan',          description: 'Cairan pengharum ruangan',             amount: 55_000,  payTo: 'Minimarket',     receiptNo: 'KK/012/III/26', status: 'Lunas',   createdBy: 'Admin',    createdAt: '2026-03-17T14:00:00Z' },
        { id: 'pc13', date: '2026-03-18', category: 'Percetakan',          description: 'Cetak banner kegiatan paskah',         amount: 280_000, payTo: 'Percetakan Jaya',receiptNo: 'KK/013/III/26', status: 'Pending', createdBy: 'Admin',    createdAt: '2026-03-18T09:00:00Z' },
        { id: 'pc14', date: '2026-03-20', category: 'Konsumsi & Snack',    description: 'Kopi & teh rapat PA mingguan',         amount: 95_000,  payTo: 'Ibu Tini',       receiptNo: 'KK/014/III/26', status: 'Lunas',   createdBy: 'Operator', createdAt: '2026-03-20T16:00:00Z' },
        { id: 'pc15', date: '2026-03-22', category: 'Lainnya',             description: 'Biaya parkir & tol kunjungan sosial',  amount: 65_000,  payTo: 'Kas Jalan',      receiptNo: 'KK/015/III/26', status: 'Pending', createdBy: 'Admin',    createdAt: '2026-03-22T10:00:00Z' },
      ];
      const pcLoaded = pettyCashLoaded;
      if (pcLoaded.length > 0) {
        setPettyCash(pcLoaded);
      } else {
        setPettyCash(INIT_PETTY_CASH);
        INIT_PETTY_CASH.forEach(item => apiSave('pettyCash', item.id, item));
      }
      const tuLoaded = pcTopUpsLoaded;
      if (tuLoaded.length > 0) {
        setPcTopUps(tuLoaded);
      } else {
        setPcTopUps(INIT_PC_TOPUPS);
        INIT_PC_TOPUPS.forEach(item => apiSave('pettyCashTopUps', item.id, item));
      }
    }

    // ChurchAssets: load dari DB, seed jika kosong
    {
      const INITIAL_ASSETS: ChurchAsset[] = [
        { id:'a01',assetCode:'AST-001',name:'Tanah Gereja (1.500 m²)',category:'Tanah',description:'Tanah milik gereja seluas 1.500 m²',location:'Jl. Anggrek No. 12, Jakarta Selatan',condition:'Baik',acquisitionDate:'2000-01-15',acquisitionValue:3_500_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:0,responsiblePerson:'Pdt. Budi Santoso',serialNumber:'SHM-00142',vendor:'-',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a02',assetCode:'AST-002',name:'Gedung Gereja Utama',category:'Bangunan',description:'Gedung gereja 2 lantai kapasitas 500 jemaat',location:'Gedung Utama – Lantai 1 & 2',condition:'Baik',acquisitionDate:'2005-06-01',acquisitionValue:2_500_000_000,acquisitionMethod:'Pembangunan',usefulLifeYears:50,responsiblePerson:'Pdt. Budi Santoso',serialNumber:'IMB-20050601',vendor:'CV Bangun Jaya',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a03',assetCode:'AST-003',name:'Gedung Serbaguna & Kelas Sekolah Minggu',category:'Bangunan',description:'Gedung serbaguna dan ruang kelas sekolah minggu',location:'Gedung Samping – Lantai 1',condition:'Cukup Baik',acquisitionDate:'2012-03-15',acquisitionValue:800_000_000,acquisitionMethod:'Pembangunan',usefulLifeYears:30,responsiblePerson:'Maria Wijaya',serialNumber:'IMB-20120315',vendor:'CV Bangun Jaya',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a04',assetCode:'AST-004',name:'Rumah Dinas Pendeta',category:'Bangunan',description:'Rumah dinas untuk pendeta jemaat, luas 150 m²',location:'Kompleks Gereja – Blok B',condition:'Baik',acquisitionDate:'2010-08-01',acquisitionValue:650_000_000,acquisitionMethod:'Pembangunan',usefulLifeYears:30,responsiblePerson:'Pdt. Budi Santoso',serialNumber:'IMB-20100801',vendor:'PT Griya Indah',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a05',assetCode:'AST-005',name:'Minibus Toyota Hiace',category:'Kendaraan',description:'Kendaraan operasional pelayanan, kapasitas 15 orang',location:'Garasi Gereja',condition:'Cukup Baik',acquisitionDate:'2019-05-20',acquisitionValue:450_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:8,responsiblePerson:'Maria Wijaya',serialNumber:'B 1234 ABC',vendor:'Auto 2000 Jakarta',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a06',assetCode:'AST-006',name:'Mobil Operasional Avanza',category:'Kendaraan',description:'Kendaraan operasional administrasi dan pelayanan pastoral',location:'Garasi Gereja',condition:'Cukup Baik',acquisitionDate:'2020-11-10',acquisitionValue:250_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:8,responsiblePerson:'Maria Wijaya',serialNumber:'B 5678 DEF',vendor:'Auto 2000 Jakarta',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a07',assetCode:'AST-007',name:'Piano Grand Yamaha CFX',category:'Peralatan Ibadah',description:'Piano grand untuk ibadah dan acara musik gereja',location:'Panggung Gereja Utama',condition:'Baik',acquisitionDate:'2015-02-14',acquisitionValue:85_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:20,responsiblePerson:'Pdt. Budi Santoso',ministryUnit:'Musik & Pujian',serialNumber:'YM-CFX-2015-0214',vendor:'Yamaha Music Center',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a08',assetCode:'AST-008',name:'Organ Gereja Roland Atelier',category:'Peralatan Ibadah',description:'Organ digital Roland Atelier untuk iringan ibadah',location:'Panggung Gereja Utama',condition:'Baik',acquisitionDate:'2018-09-01',acquisitionValue:125_000_000,acquisitionMethod:'Donasi',usefulLifeYears:20,responsiblePerson:'Pdt. Budi Santoso',ministryUnit:'Musik & Pujian',serialNumber:'RL-AT-2018-0901',vendor:'Roland Music Indonesia',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a09',assetCode:'AST-009',name:'Sound System JBL Professional',category:'Elektronik',description:'Sistem audio lengkap: speaker, amplifier, mixer',location:'Gedung Gereja Utama',condition:'Baik',acquisitionDate:'2021-01-15',acquisitionValue:65_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:8,responsiblePerson:'Maria Wijaya',ministryUnit:'Multimedia & IT',serialNumber:'JBL-SYS-2021-001',vendor:'PT Audio Visual Nusantara',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a10',assetCode:'AST-010',name:'Proyektor Epson EB-L500W (2 unit)',category:'Elektronik',description:'Proyektor laser untuk presentasi dan lirik ibadah',location:'Gedung Gereja Utama',condition:'Cukup Baik',acquisitionDate:'2022-03-10',acquisitionValue:28_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:5,responsiblePerson:'Maria Wijaya',ministryUnit:'Multimedia & IT',serialNumber:'EPS-EB-2022-001/002',vendor:'Epson Indonesia',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a11',assetCode:'AST-011',name:'LED Display Screen 5×3 m',category:'Elektronik',description:'Layar LED untuk backdrop panggung ibadah',location:'Panggung Gereja Utama',condition:'Baik',acquisitionDate:'2023-07-05',acquisitionValue:45_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:8,responsiblePerson:'Maria Wijaya',ministryUnit:'Multimedia & IT',serialNumber:'LED-SCR-2023-001',vendor:'PT Layar Terang Indonesia',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a12',assetCode:'AST-012',name:'AC Split Daikin (8 unit)',category:'Elektronik',description:'Unit pendingin ruangan tersebar di gedung utama',location:'Gedung Gereja Utama',condition:'Cukup Baik',acquisitionDate:'2020-12-01',acquisitionValue:48_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:8,responsiblePerson:'Maria Wijaya',serialNumber:'DAI-AC-2020-001-008',vendor:'Daikin Authorized Dealer',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a13',assetCode:'AST-013',name:'Generator Diesel 50 KVA',category:'Elektronik',description:'Generator cadangan listrik untuk keperluan darurat',location:'Ruang Genset – Basement',condition:'Rusak Ringan',acquisitionDate:'2019-08-15',acquisitionValue:85_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:10,responsiblePerson:'Maria Wijaya',serialNumber:'GEN-50KVA-2019-001',vendor:'PT Genset Indonesia',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a14',assetCode:'AST-014',name:'CCTV System (12 kamera)',category:'Elektronik',description:'Sistem CCTV pengamanan dengan DVR dan monitor',location:'Seluruh Area Gereja',condition:'Baik',acquisitionDate:'2022-11-20',acquisitionValue:25_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:5,responsiblePerson:'Maria Wijaya',serialNumber:'CCTV-SYS-2022-001',vendor:'PT Securindo Nusantara',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a15',assetCode:'AST-015',name:'Laptop & Komputer (5 unit)',category:'Elektronik',description:'Perangkat komputer untuk administrasi dan multimedia',location:'Kantor Gereja & Ruang Multimedia',condition:'Baik',acquisitionDate:'2023-01-10',acquisitionValue:35_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:4,responsiblePerson:'Maria Wijaya',ministryUnit:'Multimedia & IT',serialNumber:'COMP-2023-001-005',vendor:'iBox Indonesia',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a16',assetCode:'AST-016',name:'Kursi Jemaat (300 unit)',category:'Inventaris',description:'Kursi lipat besi berlapis busa untuk jemaat',location:'Gedung Gereja Utama',condition:'Cukup Baik',acquisitionDate:'2015-06-01',acquisitionValue:75_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:10,responsiblePerson:'Maria Wijaya',vendor:'CV Mebel Sejahtera',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a17',assetCode:'AST-017',name:'Meja Altar & Mimbar Gereja',category:'Peralatan Ibadah',description:'Meja altar kayu jati, mimbar, dan perlengkapan ibadah permanen',location:'Panggung Gereja Utama',condition:'Baik',acquisitionDate:'2015-06-01',acquisitionValue:18_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:20,responsiblePerson:'Pdt. Budi Santoso',vendor:'CV Mebel Sejahtera',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a18',assetCode:'AST-018',name:'Alkitab & Buku Nyanyian (250 set)',category:'Peralatan Ibadah',description:'Alkitab TB dan Buku Ende untuk jemaat saat ibadah',location:'Rak Gereja Utama & Serbaguna',condition:'Cukup Baik',acquisitionDate:'2020-03-01',acquisitionValue:15_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:10,responsiblePerson:'Pdt. Budi Santoso',vendor:'BPK Gunung Mulia',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a19',assetCode:'AST-019',name:'Perlengkapan Dapur Gereja',category:'Inventaris',description:'Kompor gas, peralatan masak, meja makan',location:'Dapur Gedung Serbaguna',condition:'Baik',acquisitionDate:'2021-05-15',acquisitionValue:12_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:10,responsiblePerson:'Maria Wijaya',vendor:'Hypermart Jakarta',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a20',assetCode:'AST-020',name:'Sistem WiFi & Jaringan LAN',category:'Elektronik',description:'Router, access point, switch, dan kabel jaringan gereja',location:'Seluruh Gedung',condition:'Baik',acquisitionDate:'2022-06-01',acquisitionValue:18_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:5,responsiblePerson:'Maria Wijaya',ministryUnit:'Multimedia & IT',serialNumber:'NET-SYS-2022-001',vendor:'PT Jaringan Solusi IT',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z' },
        { id:'a21',assetCode:'AST-021',name:'Kamera DSLR Canon EOS 90D',category:'Elektronik',description:'Kamera DSLR untuk dokumentasi kegiatan ibadah',location:'–',condition:'Baik',acquisitionDate:'2021-08-10',acquisitionValue:15_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:6,responsiblePerson:'Maria Wijaya',ministryUnit:'Multimedia & IT',serialNumber:'CAN-90D-2021-001',vendor:'iBox Indonesia',loanStatus:'Dipinjam',borrowedByName:'Stefanus Halim',loanDate:'2026-02-15',expectedReturnDate:'2026-03-20',loanNotes:'Peminjaman untuk peliputan kegiatan Paskah Sektor II',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2026-02-15T00:00:00Z' },
        { id:'a22',assetCode:'AST-022',name:'Tenda & Perlengkapan Acara',category:'Inventaris',description:'Tenda 6×9 m, meja dan kursi lipat',location:'–',condition:'Cukup Baik',acquisitionDate:'2019-04-01',acquisitionValue:22_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:8,responsiblePerson:'Maria Wijaya',serialNumber:'-',vendor:'CV Peralatan Nusantara',loanStatus:'Dipinjam',borrowedByName:'Pnt. Yohanes Lumban Tobing',loanDate:'2026-01-20',expectedReturnDate:'2026-02-05',loanNotes:'Digunakan untuk kegiatan retreat sektor IV',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2026-01-20T00:00:00Z' },
        { id:'a23',assetCode:'AST-023',name:'Mikrofon Shure SM58 (4 unit)',category:'Peralatan Ibadah',description:'Mikrofon vokal genggam untuk paduan suara',location:'–',condition:'Baik',acquisitionDate:'2022-09-01',acquisitionValue:8_000_000,acquisitionMethod:'Pembelian',usefulLifeYears:8,responsiblePerson:'Maria Wijaya',ministryUnit:'Musik & Pujian',serialNumber:'SHR-SM58-2022-001-004',vendor:'PT Audio Visual Nusantara',loanStatus:'Dipinjam',borrowedByName:'Diaken Maria Magdalena Sirait',loanDate:'2026-03-01',expectedReturnDate:'2026-03-15',loanNotes:'Peminjaman untuk latihan paduan suara Paskah',createdAt:'2024-01-01T00:00:00Z',updatedAt:'2026-03-01T00:00:00Z' },
      ];
      const INITIAL_MAINTENANCES: MaintenanceRecord[] = [
        { id:'m01',assetId:'a02',date:'2025-01-15',type:'Perawatan Rutin',description:'Pengecatan eksterior gedung utama, perbaikan plafon',cost:45_000_000,technician:'CV Bangun Sejahtera',result:'Selesai',notes:'Pengecatan 100% selesai' },
        { id:'m02',assetId:'a05',date:'2026-02-10',type:'Perawatan Rutin',description:'Servis besar 100.000 km: ganti oli, filter, kampas rem',cost:3_500_000,technician:'Auto 2000 Ciputat',result:'Selesai',notes:'Kendaraan dalam kondisi baik pasca servis' },
        { id:'m03',assetId:'a13',date:'2026-01-20',type:'Perbaikan',description:'Overhaul generator: perbaikan sistem bahan bakar',cost:12_000_000,technician:'PT Genset Indonesia',result:'Dalam Proses',notes:'Menunggu suku cadang alternator' },
        { id:'m04',assetId:'a12',date:'2026-02-25',type:'Perawatan Rutin',description:'Cuci AC, isi freon, dan bersihkan filter seluruh unit',cost:2_400_000,technician:'AC Sentosa Service',result:'Selesai',notes:'8 unit selesai dicuci dan diisi freon' },
        { id:'m05',assetId:'a09',date:'2025-12-10',type:'Inspeksi',description:'Pengecekan dan kalibrasi sistem audio',cost:1_500_000,technician:'PT Audio Visual Nusantara',result:'Selesai',notes:'Sistem audio dalam kondisi prima' },
        { id:'m06',assetId:'a07',date:'2025-03-14',type:'Perawatan Rutin',description:'Tuning piano, pembersihan dawai, dan pelumasan mekanik',cost:800_000,technician:'Yamaha Music Service Center',result:'Selesai',notes:'Piano dalam kondisi sangat baik' },
        { id:'m07',assetId:'a03',date:'2024-06-20',type:'Perbaikan',description:'Perbaikan atap bocor, ganti genteng rusak 50 buah',cost:25_000_000,technician:'CV Atap Nusantara',result:'Selesai',notes:'Atap tidak bocor lagi' },
        { id:'m08',assetId:'a10',date:'2025-08-05',type:'Penggantian Komponen',description:'Ganti lampu proyektor unit 1 yang habis masa pakai',cost:3_200_000,technician:'Epson Indonesia Service',result:'Selesai',notes:'Lampu baru terpasang, proyektor kembali normal' },
        { id:'m09',assetId:'a15',date:'2025-09-15',type:'Perawatan Rutin',description:'Instalasi ulang OS, update software pada 5 unit',cost:750_000,technician:'IT Helpdesk Internal',result:'Selesai',notes:'Semua perangkat diperbarui ke Windows 11' },
        { id:'m10',assetId:'a13',date:'2025-11-10',type:'Perawatan Rutin',description:'Servis rutin generator: ganti oli mesin, filter solar',cost:2_500_000,technician:'PT Genset Indonesia',result:'Perlu Tindak Lanjut',notes:'Ditemukan kebocoran kecil sistem bahan bakar' },
        { id:'m11',assetId:'a06',date:'2025-11-20',type:'Perawatan Rutin',description:'Servis rutin Avanza: ganti oli, filter, cek rem',cost:1_800_000,technician:'Auto 2000 Ciputat',result:'Selesai',notes:'Kondisi kendaraan baik' },
        { id:'m12',assetId:'a08',date:'2025-06-01',type:'Inspeksi',description:'Pemeriksaan tahunan organ Roland: kalibrasi suara',cost:1_200_000,technician:'Roland Music Service',result:'Selesai',notes:'Organ dalam kondisi sempurna' },
      ];
      const INITIAL_LOAN_HISTORIES: LoanHistoryRecord[] = [
        { id:'lh01',assetId:'a21',assetName:'Kamera DSLR Canon EOS 90D',assetCode:'AST-021',borrowedByName:'Pdt. Budi Santoso',loanDate:'2025-08-01',expectedReturnDate:'2025-08-20',actualReturnDate:'2025-08-18',loanNotes:'Dokumentasi retreat jemaat tahunan',status:'Dikembalikan' },
        { id:'lh02',assetId:'a21',assetName:'Kamera DSLR Canon EOS 90D',assetCode:'AST-021',borrowedByName:'Maria Wijaya',loanDate:'2025-11-10',expectedReturnDate:'2025-11-25',actualReturnDate:'2025-11-28',loanNotes:'Liputan HUT Gereja ke-35',status:'Terlambat' },
        { id:'lh03',assetId:'a21',assetName:'Kamera DSLR Canon EOS 90D',assetCode:'AST-021',borrowedByName:'Stefanus Halim',loanDate:'2026-02-15',expectedReturnDate:'2026-03-20',loanNotes:'Peliputan kegiatan Paskah Sektor II',status:'Aktif' },
        { id:'lh04',assetId:'a22',assetName:'Tenda & Perlengkapan Acara',assetCode:'AST-022',borrowedByName:'Ketua Sektor I',loanDate:'2025-06-05',expectedReturnDate:'2025-06-08',actualReturnDate:'2025-06-08',loanNotes:'Bazar jemaat tahunan',status:'Dikembalikan' },
        { id:'lh05',assetId:'a22',assetName:'Tenda & Perlengkapan Acara',assetCode:'AST-022',borrowedByName:'Pnt. Yohanes Lumban Tobing',loanDate:'2026-01-20',expectedReturnDate:'2026-02-05',loanNotes:'Retreat sektor IV – belum dikembalikan',status:'Aktif' },
        { id:'lh06',assetId:'a23',assetName:'Mikrofon Shure SM58 (4 unit)',assetCode:'AST-023',borrowedByName:'Tim Paduan Suara',loanDate:'2025-12-01',expectedReturnDate:'2025-12-25',actualReturnDate:'2025-12-26',loanNotes:'Persiapan Natal',status:'Terlambat' },
        { id:'lh07',assetId:'a23',assetName:'Mikrofon Shure SM58 (4 unit)',assetCode:'AST-023',borrowedByName:'Diaken Maria Magdalena Sirait',loanDate:'2026-03-01',expectedReturnDate:'2026-03-15',loanNotes:'Latihan paduan suara Paskah',status:'Aktif' },
      ];

      const assetsLoaded = churchAssetsLoaded;
      if (assetsLoaded.length > 0) {
        const ids = new Set(assetsLoaded.map(a => a.id));
        const missing = INITIAL_ASSETS.filter(a => !ids.has(a.id));
        const merged = missing.length > 0 ? [...assetsLoaded, ...missing] : assetsLoaded;
        setChurchAssets(merged);
        if (missing.length > 0) missing.forEach(a => apiSave('churchAssets', a.id, a));
      } else {
        setChurchAssets(INITIAL_ASSETS);
        INITIAL_ASSETS.forEach(a => apiSave('churchAssets', a.id, a));
      }

      const maintsLoaded = assetMaintenancesLoaded;
      if (maintsLoaded.length > 0) {
        setAssetMaintenances(maintsLoaded);
      } else {
        setAssetMaintenances(INITIAL_MAINTENANCES);
        INITIAL_MAINTENANCES.forEach(m => apiSave('assetMaintenances', m.id, m));
      }

      const loansLoaded = assetLoanHistoriesLoaded;
      if (loansLoaded.length > 0) {
        const ids = new Set(loansLoaded.map(h => h.id));
        const missing = INITIAL_LOAN_HISTORIES.filter(h => !ids.has(h.id));
        const merged = missing.length > 0 ? [...loansLoaded, ...missing] : loansLoaded;
        setAssetLoanHistories(merged);
        if (missing.length > 0) missing.forEach(h => apiSave('assetLoanHistories', h.id, h));
      } else {
        setAssetLoanHistories(INITIAL_LOAN_HISTORIES);
        INITIAL_LOAN_HISTORIES.forEach(h => apiSave('assetLoanHistories', h.id, h));
      }
    }

    // BankAccounts: load dari DB, seed jika kosong
    {
      const loaded = bankAccountsLoaded;
      if (loaded.length === 0) {
        const DEFAULTS: BankAccount[] = [
          { id:'ba1', bankName:'BCA',     accountName:'GPIB Bahtera Kasih - Operasional', accountNumber:'1234-5678-90', balance:87_500_000,  type:'Operasional',  color:'#0050a0', lastUpdated:'2026-03-01' },
          { id:'ba2', bankName:'BNI',     accountName:'GPIB Bahtera Kasih - Tabungan',    accountNumber:'0987-6543-21', balance:215_000_000, type:'Tabungan',     color:'#ff6600', lastUpdated:'2026-03-01' },
          { id:'ba3', bankName:'Mandiri', accountName:'GPIB Bahtera Kasih - Pembangunan', accountNumber:'5566-7788-99', balance:143_750_000, type:'Pembangunan',  color:'#003f7c', lastUpdated:'2026-03-01' },
          { id:'ba4', bankName:'BRI',     accountName:'GPIB Bahtera Kasih - Diakonia',    accountNumber:'1122-3344-55', balance:32_400_000,  type:'Diakonia',     color:'#12a0e1', lastUpdated:'2026-03-01' },
        ];
        setBankAccounts(DEFAULTS);
        DEFAULTS.forEach(a => apiSave('bankAccounts', a.id, a));
      } else {
        setBankAccounts(loaded);
      }
    }

    // Budgets: load dari DB, seed jika kosong
    {
      const loaded = budgetsLoaded;
      if (loaded.length === 0) {
        const DEFAULTS: Budget[] = [
          { id:'b1',  category:'Persembahan Minggu',  type:'income',  budgeted:180_000_000, year:2026 },
          { id:'b2',  category:'Persepuluhan',         type:'income',  budgeted:60_000_000,  year:2026 },
          { id:'b3',  category:'Dana Pembangunan',     type:'income',  budgeted:120_000_000, year:2026 },
          { id:'b4',  category:'Hibah & Donasi',       type:'income',  budgeted:50_000_000,  year:2026 },
          { id:'b5',  category:'Gaji & Tunjangan',     type:'expense', budgeted:96_000_000,  year:2026 },
          { id:'b6',  category:'Operasional Gedung',   type:'expense', budgeted:48_000_000,  year:2026 },
          { id:'b7',  category:'Pelayanan & Diakonia', type:'expense', budgeted:36_000_000,  year:2026 },
          { id:'b8',  category:'Kegiatan Kategorial',  type:'expense', budgeted:30_000_000,  year:2026 },
          { id:'b9',  category:'ATK & Perlengkapan',   type:'expense', budgeted:12_000_000,  year:2026 },
          { id:'b10', category:'Pemeliharaan Aset',    type:'expense', budgeted:24_000_000,  year:2026 },
        ];
        setBudgets(DEFAULTS);
        DEFAULTS.forEach(b => apiSave('budgets', b.id, b));
      } else {
        setBudgets(loaded);
      }
    }

    // LivestreamLinks: load dari DB, mulai kosong jika belum ada
    {
      const loaded = livestreamLinksLoaded;
      setLivestreamLinks(loaded);
    }

    // ReminderSettings: load dari DB, seed 5 default jika kosong
    {
      const loaded = reminderSettingsLoaded;
      if (loaded.length === 0) {
        const DEFAULTS: ReminderSetting[] = [
          { id: 'rs1', name: 'Reminder Ibadah Minggu',  enabled: true,  timing: 'H-1 pukul 18:00',      channel: 'Notifikasi App', serviceType: 'Minggu Pagi'   },
          { id: 'rs2', name: 'Reminder 1 Jam Sebelum',  enabled: true,  timing: '1 jam sebelum ibadah',  channel: 'Notifikasi App', serviceType: 'Semua Ibadah'  },
          { id: 'rs3', name: 'Reminder Ibadah Rabu',    enabled: false, timing: 'H-0 pukul 17:00',       channel: 'WhatsApp',       serviceType: 'Rabu'          },
          { id: 'rs4', name: 'Reminder PA Pemuda',      enabled: true,  timing: 'H-1 pukul 15:00',       channel: 'Notifikasi App', serviceType: 'Pemuda'        },
          { id: 'rs5', name: 'Reminder Doa Pagi',       enabled: false, timing: 'H-0 pukul 05:30',       channel: 'Notifikasi App', serviceType: 'Doa Pagi'      },
        ];
        setReminderSettings(DEFAULTS);
        DEFAULTS.forEach(r => apiSave('reminderSettings', r.id, r));
      } else {
        setReminderSettings(loaded);
      }
    }

    // Liabilities: load dari DB, seed 3 default jika kosong
    {
      const loaded = liabilitiesLoaded;
      if (loaded.length === 0) {
        const DEFAULTS: Liability[] = [
          { id: 'lib1', nama: 'Hutang Usaha & Operasional',       nilai: 14_500_000, kategori: 'Jangka Pendek' },
          { id: 'lib2', nama: 'Dana Titipan Jemaat',              nilai: 28_750_000, kategori: 'Jangka Pendek' },
          { id: 'lib3', nama: 'Biaya Yang Masih Harus Dibayar',   nilai:  9_600_000, kategori: 'Jangka Pendek' },
        ];
        setLiabilities(DEFAULTS);
        DEFAULTS.forEach(l => apiSave('liabilities', l.id, l));
      } else {
        setLiabilities(loaded);
      }
    }

    // FiscalYearSettings: load dari DB, seed 2 tahun default jika kosong
    {
      const loaded = fiscalYearSettingsLoaded;
      if (loaded.length === 0) {
        const DEFAULTS: FiscalYearSetting[] = [
          { id: 'fy2025', year: 2025, asetNetoAwal: 6_310_540_000, notes: 'Saldo awal neraca pembukaan tahun 2025' },
          { id: 'fy2026', year: 2026, asetNetoAwal: 6_310_540_000, notes: 'Perlu diperbarui oleh Bendahara sesuai neraca penutup 2025' },
        ];
        setFiscalYearSettings(DEFAULTS);
        DEFAULTS.forEach(s => apiSave('fiscalYearSettings', s.id, s));
      } else {
        setFiscalYearSettings(loaded);
      }
    }

    // Rooms: load dari DB, seed 3 ruangan default jika kosong
    {
      const loaded = roomsLoaded;
      if (loaded.length === 0) {
        const DEFAULTS: Room[] = [
          { id: 'rm1', name: 'Aula Utama',            capacity: 500, facilities: ['Sound System','Proyektor','AC','Kursi','Meja','Mic Wireless','Layar Proyektor','Podium'], location: 'Lantai 1 Gedung Utama',   isActive: true },
          { id: 'rm2', name: 'Ruang Pertemuan',        capacity: 50,  facilities: ['AC','Kursi','Meja','Proyektor','Mic Kabel'],                                               location: 'Lantai 2 Gedung Samping', isActive: true },
          { id: 'rm3', name: 'Ruang Rapat Majelis',    capacity: 20,  facilities: ['AC','Kursi','Meja'],                                                                       location: 'Lantai 1 Gedung Samping', isActive: true },
        ];
        setRooms(DEFAULTS);
        DEFAULTS.forEach(r => apiSave('rooms', r.id, r));
      } else {
        setRooms(loaded);
      }
    }

    // CustomRoles & BuiltinRoleOverrides: load dari DB (tidak perlu seed)
    {
      const loaded = customRolesLoaded;
      setCustomRoles(loaded);
    }
    {
      const loaded = builtinRoleOverridesLoaded;
      setBuiltinRoleOverrides(loaded);
    }
    {
      const loaded = sectorTransfersLoaded;
      setSectorTransfers(loaded);
    }

    return { loadedMembers, loadedEvents, loadedWorshipSchedules, loadedMarriages };
  }

  // Initialize — validasi token lalu load data
  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme) setTheme(JSON.parse(storedTheme));

    const checkAuth = async () => {
      const token = localStorage.getItem('token') || localStorage.getItem('gemas_token');
      const storedUser = localStorage.getItem('currentUser');
      
      // Hanya panggil /api/auth/me jika ada indikasi sesi / token tersimpan
      if (!token && !storedUser) {
        setDbReady(true);
        return;
      }

      try {
        const { user } = await api.get<{ user: User }>('/api/auth/me');
        if (user) {
          setCurrentUser(user);
          localStorage.setItem('currentUser', JSON.stringify(user));
          try {
            const matrix = await api.get<ModulePermission[] | null>('/api/permissions');
            if (Array.isArray(matrix) && matrix.length > 0) setPermMatrix(matrix);
          } catch { /* use defaults */ }
          await loadAllData();
        } else {
          setCurrentUser(null);
          localStorage.removeItem('currentUser');
        }
      } catch (err) {
        // Hentikan jika gagal, jangan panggil login otomatis
        console.warn('Session expired or unauthorized');
        setCurrentUser(null);
        localStorage.removeItem('currentUser');
      } finally {
        setDbReady(true);
      }
    };

    checkAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Pastikan dependency array kosong agar tidak looping

  // Persist theme preference to localStorage
  useEffect(() => {
    localStorage.setItem('theme', JSON.stringify(theme));
  }, [theme]);

  // ── Poll /api/auth/me setiap 30 detik untuk deteksi perubahan role/status ──
  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(async () => {
      try {
        const { user } = await api.get<{ user: User }>('/api/auth/me');
        if (user.role !== currentUser.role || user.isActive !== currentUser.isActive || user.name !== currentUser.name) {
          setCurrentUser(user);
          localStorage.setItem('currentUser', JSON.stringify(user));
          if (!user.isActive) {
            await logout();
          }
        }
      } catch { /* ignore network error */ }
    }, 30_000);
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  // ── Event Calendar Reminder Notifications ──────────────────────────────────
  // Auto-generates notifications for upcoming events within 14 days
  useEffect(() => {
    if (!currentUser) return;
    if (!['Admin', 'Majelis', 'Ketua Sektor'].includes(currentUser.role)) return;
    if (events.length === 0) return;

    const now = new Date();
    const fourteenDaysLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const upcomingEvents = events.filter(ev => {
      const evDate = new Date(ev.date);
      return evDate >= now && evDate <= fourteenDaysLater && ev.status === 'Akan Datang';
    });

    const existingLinks = new Set(notifications.map(n => n.link).filter(Boolean));

    upcomingEvents.forEach(ev => {
      const link = `ev-reminder-${ev.id}`;
      if (!existingLinks.has(link)) {
        const daysUntil = Math.ceil((new Date(ev.date).getTime() - now.getTime()) / 86400000);
        const timeLabel = daysUntil === 0 ? 'Hari ini' : daysUntil === 1 ? 'Besok' : `${daysUntil} hari lagi`;
        addNotification({
          type: 'event',
          title: `Acara: ${ev.title}`,
          message: `${timeLabel} · ${ev.time} WIB · ${ev.location}${ev.organizer ? ` · ${ev.organizer}` : ''}`,
          read: false,
          link,
          priority: daysUntil <= 1 ? 'high' : daysUntil <= 3 ? 'medium' : 'low',
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, events.length]);

  // ── Local demo user (hanya untuk preview lokal tanpa server) ────────────────
  const LOCAL_USERS: Record<string, User> = JSON.parse(
    localStorage.getItem('gemas_local_users') || '{}'
  );
  if (!LOCAL_USERS['pipi']) {
    LOCAL_USERS['pipi'] = { id:'local-pipi', name:'Pipi Administrator', email:'pipi@local', username:'pipi', password:'pipi123', role:'Admin', isActive:true };
    localStorage.setItem('gemas_local_users', JSON.stringify(LOCAL_USERS));
  }
  if (!LOCAL_USERS['admin']) {
    LOCAL_USERS['admin'] = { id:'local-admin', name:'Admin Lokal', email:'admin@local', username:'admin', password:'admin123', role:'Admin', isActive:true };
    localStorage.setItem('gemas_local_users', JSON.stringify(LOCAL_USERS));
  }

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const { token, user } = await api.post<{ token: string; user: User }>(
        '/api/auth/login',
        { username, password }
      );
      if (token) {
        setToken(token);
      }
      setCurrentUser(user);
      localStorage.setItem('currentUser', JSON.stringify(user));
      try {
        const matrix = await api.get<ModulePermission[] | null>('/api/permissions');
        if (Array.isArray(matrix) && matrix.length > 0) setPermMatrix(matrix);
      } catch { /* use defaults */ }
      await loadAllData();
      return true;
    } catch {
      // Fallback: cek local user jika server tidak tersedia
      const localUser = Object.values(LOCAL_USERS).find(
        u => u.username === username && u.password === password
      );
      if (localUser) {
        setCurrentUser(localUser);
        localStorage.setItem('currentUser', JSON.stringify(localUser));
        return true;
      }
      return false;
    }
  };

  const logout = async () => {
    try { await api.post('/api/auth/logout', {}); } catch { /* ignore */ }
    clearToken();
    setCurrentUser(null);
  };

  const logActivity = (log: Omit<ActivityLog, 'id' | 'timestamp'>) => {
    const domain = log.domain || getDomainForEntityType(log.entityType);
    const severity = log.severity || getAuditSeverity(log.action, log.entityType);
    const userRole = log.userRole || currentUser?.role;

    const newLog: ActivityLog = {
      ...log,
      domain,
      severity,
      userRole,
      id: `log${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString()
    };
    setActivityLogs(prev => [newLog, ...prev]);
    apiSave('activityLogs', newLog.id, newLog);
  };

  const BUILT_IN_ROLES = ['Admin', 'Majelis', 'Ketua Sektor', 'Operator'];

  const can = useCallback((module: string, permission: PermissionKey): boolean => {
    if (!currentUser) return false;
    if (BUILT_IN_ROLES.includes(currentUser.role)) {
      return buildCan(permMatrix, currentUser.role as UserRole)(module, permission);
    }
    try {
      const found = customRoles.find(r => r.name === currentUser.role);
      const perms = (found?.modulePermissions?.[module] ?? []) as string[];
      return perms.includes(permission);
    } catch {
      return false;
    }
  }, [currentUser, permMatrix, customRoles]);

  // ── Master Data ──────────────────────────────────────────────────────────────
  const DEFAULT_MASTER_DATA: Omit<MasterDataItem, 'id' | 'createdAt'>[] = [
    // Jabatan Pelayanan (UPPERCASE sesuai data jemaat)
    ...['PENATUA','DIAKEN','KETUA SEKTOR','WAKIL KETUA SEKTOR','SEKRETARIS','BENDAHARA','ANGGOTA MAJELIS'].map((v,i)=>({ category:'jabatan_pelayanan' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Unit Kategorial (Pelkat)
    ...['PELKAT-PA','PELKAT-PT','PELKAT-GP','PELKAT-PKB','PELKAT-PKP','PELKAT-PKLU'].map((v,i)=>({ category:'pelkat' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Jenis Persembahan
    ...['Mingguan','Syukur','Persepuluhan','Pembangunan','Diakonia','Lainnya'].map((v,i)=>({ category:'jenis_persembahan' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Kategori Aset
    ...['Tanah','Bangunan','Kendaraan','Inventaris','Elektronik','Peralatan Ibadah','Lainnya'].map((v,i)=>({ category:'kategori_aset' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Jenis Ibadah
    ...['Doa Pagi','Ibadah GP','Ibadah Keluarga Sektor 1','Ibadah Keluarga Sektor 2','Ibadah Keluarga Sektor 3','Ibadah Keluarga Sektor 4','Ibadah Minggu Pagi','Ibadah Minggu Sore','Ibadah PKB','Ibadah PKLU','Ibadah PKP','IHMPA','IHMPT'].map((v,i)=>({ category:'jenis_ibadah' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Kategori Ibadah
    ...['GP','PA','PKB','PKLU','PKP','PT'].map((v,i)=>({ category:'kategori_ibadah' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Tipe Rekening
    ...['Operasional','Tabungan','Pembangunan','Diakonia'].map((v,i)=>({ category:'tipe_rekening' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Metode Pembayaran
    ...['Tunai','Transfer','QRIS'].map((v,i)=>({ category:'metode_pembayaran' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Status Sakramen
    ...['Terjadwal','Selesai','Ditunda','Dibatalkan'].map((v,i)=>({ category:'status_sakramen' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Daftar Pelayan
    ...['Pdt. (isi nama)'].map((v,i)=>({ category:'daftar_pelayan' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Jenis Jadwal Pelayanan
    ...['Ibadah Minggu Pagi','Ibadah Minggu Sore','Ibadah Hari Rabu','Ibadah PKP','Ibadah PKB','Ibadah PKLU','Ibadah GP','Ibadah PA','Ibadah PT','Persekutuan Doa','Pelatihan/Pembinaan','Rapat Komisi','Kegiatan Khusus','Lainnya'].map((v,i)=>({ category:'jenis_jadwal_ibadah' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Buku Nyanyian
    ...['Kidung Jemaat','Gita Bakti','Lainnya'].map((v,i)=>({ category:'buku_nyanyian' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Tipe Nyanyian Ibadah
    ...['opening','offering','communion','closing'].map((v,i)=>{ const labels:Record<string,string>={opening:'Pembukaan',offering:'Persembahan',communion:'Komuni',closing:'Penutup'}; return { category:'tipe_nyanyian_ibadah' as MasterDataCategory, value:v, label:labels[v], isActive:true, order:i+1 }; }),
    // Tempat Sakramen
    ...['GPIB Bahtera Kasih','Aula Utama','Ruang Ibadah','Lainnya'].map((v,i)=>({ category:'tempat_sakramen' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Sumber Kas Kecil
    ...['Kas Majelis','Donasi Khusus','Lainnya'].map((v,i)=>({ category:'sumber_kas_kecil' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Prioritas Pengumuman
    ...['normal','important','urgent'].map((v,i)=>{ const labels:Record<string,string>={normal:'Normal',important:'Penting',urgent:'Mendesak'}; return { category:'prioritas_pengumuman' as MasterDataCategory, value:v, label:labels[v], isActive:true, order:i+1 }; }),
    // Status Peminjaman Ruangan
    ...['Pending','Approved','Rejected','Completed','Cancelled'].map((v,i)=>({ category:'status_peminjaman_ruangan' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Status Distribusi Bantuan
    ...['Pengajuan','Verifikasi','Disetujui','Ditolak','Disalurkan'].map((v,i)=>({ category:'status_distribusi_bantuan' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Status Permohonan Surat
    ...['Diajukan','Diproses','Selesai','Ditolak'].map((v,i)=>({ category:'status_permohonan_surat' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Tipe Atestasi
    ...['Pindah Masuk','Pindah Keluar'].map((v,i)=>({ category:'tipe_atestasi' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Status Event/Kegiatan
    ...['Akan Datang','Berlangsung','Selesai','Dibatalkan'].map((v,i)=>({ category:'status_event' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Status Pernikahan
    ...['Belum Menikah','Menikah','Duda','Janda'].map((v,i)=>({ category:'status_pernikahan' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Tipe Keanggotaan
    ...['Warga Jemaat','Warga Tamu','Simpatisan'].map((v,i)=>({ category:'tipe_keanggotaan' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Golongan Darah
    ...['A','B','AB','O','A+','A-','B+','B-','AB+','AB-','O+','O-'].map((v,i)=>({ category:'golongan_darah' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Status Kas Kecil
    ...['Lunas','Pending'].map((v,i)=>({ category:'status_kas_kecil' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Jenis Kegiatan
    ...['Ibadah','Persekutuan','Retreat','Seminar','Pelayanan','Lainnya'].map((v,i)=>({ category:'jenis_kegiatan' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Jenis Permohonan Pelayanan
    ...['Kunjungan','Doa Khusus','Pelayanan Duka','Konseling','Lainnya'].map((v,i)=>({ category:'jenis_pelayanan' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Kategori Bantuan Sosial
    ...['Ekonomi','Beasiswa','Kesehatan','Bencana','Lainnya'].map((v,i)=>({ category:'kategori_bantuan' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Pendidikan Terakhir
    ...['SD','SMP','SMA/SMK','D3','S1','S2','S3','Lainnya'].map((v,i)=>({ category:'pendidikan' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Kategori Keuangan — Pemasukan
    ...['Persembahan Minggu','Persepuluhan','Dana Pembangunan','Hibah & Donasi','Persembahan Khusus','Sewa Fasilitas','Lainnya'].map((v,i)=>({ category:'kategori_keuangan_masuk' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Kategori Keuangan — Pengeluaran
    ...['Gaji & Tunjangan','Operasional Gedung','Pelayanan & Diakonia','Kegiatan Kategorial','ATK & Perlengkapan','Pemeliharaan Aset','Lainnya'].map((v,i)=>({ category:'kategori_keuangan_keluar' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
    // Kategori Kas Kecil
    ...['ATK & Alat Tulis','Konsumsi & Snack','Transportasi','Kebersihan','Perlengkapan Ibadah','Komunikasi','Percetakan','Lainnya'].map((v,i)=>({ category:'kategori_kas_kecil' as MasterDataCategory, value:v, label:v, isActive:true, order:i+1 })),
  ];


  const addMasterDataItem = (item: Omit<MasterDataItem, 'id' | 'createdAt'>) => {
    const newItem: MasterDataItem = { ...item, id: `md${Date.now()}`, createdAt: new Date().toISOString() };
    setMasterDataItems(prev => [...prev, newItem]);
    apiSave('masterData', newItem.id, newItem);
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'MasterData', entityId: newItem.id, entityName: newItem.label, details: `Master data baru — kategori: ${newItem.category}` });
    }
  };

  const updateMasterDataItem = (id: string, item: Partial<MasterDataItem>) => {
    const existing = masterDataItems.find(m => m.id === id);
    setMasterDataItems(prev => prev.map(m => m.id === id ? { ...m, ...item } : m));
    if (existing) apiSave('masterData', id, { ...existing, ...item });
    if (currentUser && existing) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'MasterData', entityId: id, entityName: existing.label, details: `Master data diperbarui — kategori: ${existing.category}` });
    }
  };

  const deleteMasterDataItem = (id: string) => {
    const existing = masterDataItems.find(m => m.id === id);
    setMasterDataItems(prev => prev.filter(m => m.id !== id));
    apiRemove('masterData', id);
    if (currentUser && existing) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'MasterData', entityId: id, entityName: existing.label, details: `Master data dihapus — kategori: ${existing.category}` });
    }
  };

  const getMasterDataByCategory = (category: MasterDataCategory) =>
    masterDataItems.filter(m => m.category === category && m.isActive).sort((a, b) => a.order - b.order);

  const addMember = (memberData: Omit<Member, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newMember: Member = {
      ...memberData,
      id: `m${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setMembers(prev => [...prev, newMember]);
    apiSave('members', newMember.id, newMember);

    // Sync sector.memberCount
    if (newMember.sectorId) {
      setSectors(prev => prev.map(s => {
        if (s.id !== newMember.sectorId) return s;
        const updated = { ...s, memberCount: (s.memberCount ?? 0) + 1 };
        apiSave('sectors', s.id, updated);
        return updated;
      }));
    }

    // Sync family.members[] and memberCount
    if (newMember.familyId) {
      setFamilies(prev => prev.map(f => {
        if (f.id !== newMember.familyId) return f;
        const members = [...(f.members ?? []), newMember.id];
        const updated = { ...f, members, memberCount: members.length };
        apiSave('families', f.id, updated);
        return updated;
      }));
    }

    if (currentUser) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Menambahkan',
        entityType: 'Member',
        entityId: newMember.id,
        entityName: newMember.fullName,
        details: 'Jemaat baru ditambahkan'
      });
    }
  };

  const updateMember = (id: string, memberData: Partial<Member>) => {
    const member = members.find(m => m.id === id);
    if (!member) return;
    const updated = { ...member, ...memberData, updatedAt: new Date().toISOString() };
    setMembers(prev => prev.map(m => m.id === id ? updated : m));
    apiSave('members', id, updated);

    // Sync sector.memberCount when sectorId changes
    const oldSectorId = member.sectorId;
    const newSectorId = memberData.sectorId;
    if (newSectorId !== undefined && newSectorId !== oldSectorId) {
      setSectors(prev => prev.map(s => {
        if (s.id === oldSectorId) {
          const u = { ...s, memberCount: Math.max(0, (s.memberCount ?? 1) - 1) };
          apiSave('sectors', s.id, u);
          return u;
        }
        if (s.id === newSectorId) {
          const u = { ...s, memberCount: (s.memberCount ?? 0) + 1 };
          apiSave('sectors', s.id, u);
          return u;
        }
        return s;
      }));
    }

    // Sync family.members[] and memberCount when familyId changes
    const oldFamilyId = member.familyId;
    const newFamilyId = memberData.familyId;
    if (newFamilyId !== undefined && newFamilyId !== oldFamilyId) {
      setFamilies(prev => prev.map(f => {
        if (f.id === oldFamilyId) {
          const members = (f.members ?? []).filter(mid => mid !== id);
          const u = { ...f, members, memberCount: members.length };
          apiSave('families', f.id, u);
          return u;
        }
        if (f.id === newFamilyId) {
          const members = [...(f.members ?? []), id];
          const u = { ...f, members, memberCount: members.length };
          apiSave('families', f.id, u);
          return u;
        }
        return f;
      }));
    }

    if (currentUser) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Mengubah',
        entityType: 'Member',
        entityId: id,
        entityName: member.fullName,
        details: 'Data jemaat diperbarui'
      });
    }
  };

  const deleteMember = (id: string) => {
    const member = members.find(m => m.id === id);
    if (!member) return;
    setMembers(prev => prev.filter(m => m.id !== id));
    apiRemove('members', id);

    // Sync sector.memberCount
    if (member.sectorId) {
      setSectors(prev => prev.map(s => {
        if (s.id !== member.sectorId) return s;
        const updated = { ...s, memberCount: Math.max(0, (s.memberCount ?? 1) - 1) };
        apiSave('sectors', s.id, updated);
        return updated;
      }));
    }

    // Sync family.members[] and memberCount
    if (member.familyId) {
      setFamilies(prev => prev.map(f => {
        if (f.id !== member.familyId) return f;
        const members = (f.members ?? []).filter(mid => mid !== id);
        const updated = { ...f, members, memberCount: members.length };
        apiSave('families', f.id, updated);
        return updated;
      }));
    }

    // Cascade delete: hapus data sakramen terkait
    baptisms.filter(b => b.memberId === id).forEach(b => {
      setBaptisms(prev => prev.filter(x => x.id !== b.id));
      apiRemove('baptisms', b.id);
    });
    sidis.filter(s => s.memberId === id).forEach(s => {
      setSidis(prev => prev.filter(x => x.id !== s.id));
      apiRemove('sidis', s.id);
    });

    if (currentUser) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Menghapus',
        entityType: 'Member',
        entityId: id,
        entityName: member.fullName,
        details: 'Jemaat dihapus dari sistem'
      });
    }
  };

  const addFamily = (familyData: Omit<Family, 'id'> & { id?: string }) => {
    const newFamily: Family = { ...familyData, id: familyData.id || `f${Date.now()}` };
    setFamilies([...families, newFamily]);
    apiSave('families', newFamily.id, newFamily);
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'Family', entityId: newFamily.id, entityName: newFamily.headOfFamily, details: 'Data keluarga baru ditambahkan' });
    }
  };

  const updateFamily = (id: string, familyData: Partial<Family>) => {
    const fam = families.find(f => f.id === id);
    setFamilies(families.map(f => f.id === id ? { ...f, ...familyData } : f));
    if (fam) apiSave('families', id, { ...fam, ...familyData });
    if (currentUser && fam) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'Family', entityId: id, entityName: fam.headOfFamily, details: 'Data keluarga diperbarui' });
    }
  };

  const deleteFamily = (id: string) => {
    const fam = families.find(f => f.id === id);
    setFamilies(families.filter(f => f.id !== id));
    apiRemove('families', id);
    if (currentUser && fam) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'Family', entityId: id, entityName: fam.headOfFamily, details: 'Data keluarga dihapus' });
    }
  };

  const addSector = (sectorData: Omit<Sector, 'id' | 'memberCount'>) => {
    const newSector: Sector = { ...sectorData, id: `sec${Date.now()}`, memberCount: 0 };
    setSectors([...sectors, newSector]);
    apiSave('sectors', newSector.id, newSector);
  };

  const updateSector = (id: string, sectorData: Partial<Sector>) => {
    const sec = sectors.find(s => s.id === id);
    setSectors(sectors.map(s => s.id === id ? { ...s, ...sectorData } : s));
    if (sec) apiSave('sectors', id, { ...sec, ...sectorData });
  };

  const deleteSector = (id: string) => {
    setSectors(sectors.filter(s => s.id !== id));
    apiRemove('sectors', id);
    // Clear sectorId pada member dan keluarga yang terkait
    const now = new Date().toISOString();
    setMembers(prev => prev.map(m => {
      if (m.sectorId !== id) return m;
      const updated = { ...m, sectorId: '', updatedAt: now };
      apiSave('members', m.id, updated);
      return updated;
    }));
    setFamilies(prev => prev.map(f => {
      if (f.sectorId !== id) return f;
      const updated = { ...f, sectorId: '', updatedAt: now };
      apiSave('families', f.id, updated);
      return updated;
    }));
  };

  const addUser = (userData: Omit<User, 'id'>) => {
    const newUser: User = { ...userData, id: `u${Date.now()}` };
    setUsers([...users, newUser]);
    apiSave('users', newUser.id, newUser);
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'User', entityId: newUser.id, entityName: newUser.name, details: `Pengguna baru ditambahkan (role: ${newUser.role})` });
    }
  };

  const updateUser = (id: string, userData: Partial<User>) => {
    const usr = users.find(u => u.id === id);
    setUsers(users.map(u => u.id === id ? { ...u, ...userData } : u));
    if (usr) apiSave('users', id, { ...usr, ...userData });
    if (currentUser && usr) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'User', entityId: id, entityName: usr.name, details: 'Data pengguna diperbarui' });
    }
  };

  const deleteUser = (id: string) => {
    const usr = users.find(u => u.id === id);
    setUsers(users.filter(u => u.id !== id));
    apiRemove('users', id);
    if (currentUser && usr) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'User', entityId: id, entityName: usr.name, details: 'Pengguna dihapus dari sistem' });
    }
  };

  const addMinistry = (ministryData: Omit<Ministry, 'id'>) => {
    const newMinistry: Ministry = { ...ministryData, id: `min${Date.now()}` };
    setMinistries([...ministries, newMinistry]);
    apiSave('ministries', newMinistry.id, newMinistry);
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'Ministry', entityId: newMinistry.id, entityName: newMinistry.name, details: `Pelayanan baru ditambahkan — ketua: ${newMinistry.leader}` });
    }
  };

  const updateMinistry = (id: string, ministryData: Partial<Ministry>) => {
    const min = ministries.find(m => m.id === id);
    setMinistries(ministries.map(m => m.id === id ? { ...m, ...ministryData } : m));
    if (min) apiSave('ministries', id, { ...min, ...ministryData });
    if (currentUser && min) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'Ministry', entityId: id, entityName: min.name, details: 'Data pelayanan diperbarui' });
    }
  };

  const deleteMinistry = (id: string) => {
    const min = ministries.find(m => m.id === id);
    setMinistries(ministries.filter(m => m.id !== id));
    apiRemove('ministries', id);
    if (currentUser && min) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'Ministry', entityId: id, entityName: min.name, details: 'Pelayanan dihapus' });
    }
  };

  const addSectorTransfer = (data: Omit<SectorTransfer, 'id'>) => {
    const newT: SectorTransfer = { ...data, id: `st${Date.now()}` };
    setSectorTransfers(prev => [...prev, newT]);
    apiSave('sectorTransfers', newT.id, newT);
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'SectorTransfer', entityId: newT.id, entityName: data.memberName, details: `Permohonan pindah sektor: ${data.fromSectorName} → ${data.toSectorName}` });
    }
  };

  const updateSectorTransfer = (id: string, data: Partial<SectorTransfer>) => {
    const tr = sectorTransfers.find(t => t.id === id);
    setSectorTransfers(sectorTransfers.map(t => t.id === id ? { ...t, ...data } : t));
    if (tr) apiSave('sectorTransfers', id, { ...tr, ...data });
    if (currentUser && tr) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'SectorTransfer', entityId: id, entityName: tr.memberName, details: `Status transfer diperbarui: ${data.status ?? tr.status}` });
    }
  };

  const deleteSectorTransfer = (id: string) => {
    setSectorTransfers(sectorTransfers.filter(t => t.id !== id));
    apiRemove('sectorTransfers', id);
  };

  const addEvent = (eventData: Omit<Event, 'id'>) => {
    const newEvent: Event = { ...eventData, id: `evt${Date.now()}` };
    setEvents([...events, newEvent]);
    apiSave('events', newEvent.id, newEvent);
    
    if (currentUser) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Menambahkan',
        entityType: 'Event',
        entityId: newEvent.id,
        entityName: newEvent.title,
        details: 'Event baru dibuat'
      });
    }
  };

  const updateEvent = (id: string, eventData: Partial<Event>) => {
    const ev = events.find(e => e.id === id);
    setEvents(events.map(e => e.id === id ? { ...e, ...eventData } : e));
    if (ev) apiSave('events', id, { ...ev, ...eventData });
    if (currentUser && ev) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'Event', entityId: id, entityName: ev.title, details: 'Data event diperbarui' });
    }
  };

  const deleteEvent = (id: string) => {
    const ev = events.find(e => e.id === id);
    setEvents(events.filter(e => e.id !== id));
    apiRemove('events', id);
    if (currentUser && ev) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'Event', entityId: id, entityName: ev.title, details: 'Event dihapus' });
    }
  };

  const addPrayerRequest = (requestData: Omit<PrayerRequest, 'id' | 'createdAt'>) => {
    const newRequest: PrayerRequest = { ...requestData, id: `pr${Date.now()}`, createdAt: new Date().toISOString() };
    setPrayerRequests([...prayerRequests, newRequest]);
    apiSave('prayerRequests', newRequest.id, newRequest);
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'PrayerRequest', entityId: newRequest.id, entityName: newRequest.category, details: `Permohonan doa baru — kategori: ${newRequest.category}` });
    }
  };

  const updatePrayerRequest = (id: string, requestData: Partial<PrayerRequest>) => {
    const pr = prayerRequests.find(r => r.id === id);
    setPrayerRequests(prayerRequests.map(r => r.id === id ? { ...r, ...requestData } : r));
    if (pr) apiSave('prayerRequests', id, { ...pr, ...requestData });
    if (currentUser && pr) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'PrayerRequest', entityId: id, entityName: pr.category, details: `Status permohonan doa diperbarui — ${requestData.status || pr.status}` });
    }
  };

  const addAttendance = (attendanceData: Omit<Attendance, 'id'>) => {
    const newAttendance: Attendance = { ...attendanceData, id: `att${Date.now()}` };
    setAttendance([...attendance, newAttendance]);
    apiSave('attendance', newAttendance.id, newAttendance);
  };

  const addNotification = (notificationData: Omit<Notification, 'id' | 'createdAt'>) => {
    const newNotification: Notification = { ...notificationData, id: `not${Date.now()}`, createdAt: new Date().toISOString() };
    setNotifications(prev => [...prev, newNotification]);
    apiSave('notifications', newNotification.id, newNotification);
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => {
      if (n.id !== id) return n;
      const updated = { ...n, read: true };
      apiSave('notifications', id, updated);
      return updated;
    }));
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => {
      if (n.read) return n;
      const updated = { ...n, read: true };
      apiSave('notifications', n.id, updated);
      return updated;
    }));
  };

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    apiRemove('notifications', id);
  };

  const addAnnouncement = (announcementData: Omit<Announcement, 'id' | 'createdAt'>) => {
    const newAnnouncement: Announcement = { ...announcementData, id: `ann${Date.now()}`, createdAt: new Date().toISOString() };
    setAnnouncements([...announcements, newAnnouncement]);
    apiSave('announcements', newAnnouncement.id, newAnnouncement);
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'Announcement', entityId: newAnnouncement.id, entityName: newAnnouncement.title, details: `Pengumuman baru — prioritas: ${newAnnouncement.priority}` });
    }
  };

  const updateAnnouncement = (id: string, announcementData: Partial<Announcement>) => {
    const ann = announcements.find(a => a.id === id);
    setAnnouncements(announcements.map(a => a.id === id ? { ...a, ...announcementData } : a));
    if (ann) apiSave('announcements', id, { ...ann, ...announcementData });
    if (currentUser && ann) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'Announcement', entityId: id, entityName: ann.title, details: 'Pengumuman diperbarui' });
    }
  };

  const deleteAnnouncement = (id: string) => {
    const ann = announcements.find(a => a.id === id);
    setAnnouncements(announcements.filter(a => a.id !== id));
    apiRemove('announcements', id);
    if (currentUser && ann) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'Announcement', entityId: id, entityName: ann.title, details: 'Pengumuman dihapus' });
    }
  };

  const addFinancialRecord = (recordData: Omit<FinancialRecord, 'id' | 'createdAt'>) => {
    const newRecord: FinancialRecord = { ...recordData, id: `fin${Date.now()}`, createdAt: new Date().toISOString() };
    setFinancialRecords([...financialRecords, newRecord]);
    apiSave('financialRecords', newRecord.id, newRecord);
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'FinancialRecord', entityId: newRecord.id, entityName: newRecord.description || newRecord.category, details: `${newRecord.type === 'income' ? 'Pemasukan' : 'Pengeluaran'} — ${newRecord.category} Rp${newRecord.amount.toLocaleString('id-ID')}` });
    }
  };

  const updateFinancialRecord = (id: string, recordData: Partial<FinancialRecord>) => {
    const rec = financialRecords.find(r => r.id === id);
    setFinancialRecords(financialRecords.map(r => r.id === id ? { ...r, ...recordData } : r));
    if (rec) apiSave('financialRecords', id, { ...rec, ...recordData });
    if (currentUser && rec) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'FinancialRecord', entityId: id, entityName: rec.description || rec.category, details: `Data keuangan diperbarui — ${rec.category}` });
    }
  };

  const deleteFinancialRecord = (id: string) => {
    const rec = financialRecords.find(r => r.id === id);
    setFinancialRecords(financialRecords.filter(r => r.id !== id));
    apiRemove('financialRecords', id);
    if (currentUser && rec) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'FinancialRecord', entityId: id, entityName: rec.description || rec.category, details: `${rec.type === 'income' ? 'Pemasukan' : 'Pengeluaran'} dihapus — Rp${rec.amount.toLocaleString('id-ID')}` });
    }
  };

  const addMinistrySchedule = (scheduleData: Omit<MinistrySchedule, 'id'>) => {
    const newSchedule: MinistrySchedule = { ...scheduleData, id: `sch${Date.now()}` };
    setMinistrySchedules([...ministrySchedules, newSchedule]);
    apiSave('ministrySchedules', newSchedule.id, newSchedule);
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'MinistrySchedule', entityId: newSchedule.id, entityName: newSchedule.serviceType, details: `Jadwal pelayanan baru — ${newSchedule.date}` });
    }
  };

  const updateMinistrySchedule = (id: string, scheduleData: Partial<MinistrySchedule>) => {
    const sch = ministrySchedules.find(s => s.id === id);
    setMinistrySchedules(ministrySchedules.map(s => s.id === id ? { ...s, ...scheduleData } : s));
    if (sch) apiSave('ministrySchedules', id, { ...sch, ...scheduleData });
    if (currentUser && sch) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'MinistrySchedule', entityId: id, entityName: sch.serviceType, details: `Jadwal pelayanan diperbarui — ${sch.date}` });
    }
  };

  const deleteMinistrySchedule = (id: string) => {
    const sch = ministrySchedules.find(s => s.id === id);
    setMinistrySchedules(ministrySchedules.filter(s => s.id !== id));
    apiRemove('ministrySchedules', id);
    if (currentUser && sch) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'MinistrySchedule', entityId: id, entityName: sch.serviceType, details: `Jadwal pelayanan dihapus — ${sch.date}` });
    }
  };

  // NEW: Baptism, Sidi, Marriage CRUD
  const addBaptism = (baptismData: Omit<Baptism, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newBaptism: Baptism = {
      ...baptismData,
      id: `bap${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setBaptisms([...baptisms, newBaptism]);
    apiSave('baptisms', newBaptism.id, newBaptism);
    if (currentUser) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Menambahkan',
        entityType: 'Baptism',
        entityId: newBaptism.id,
        entityName: newBaptism.memberName,
        details: 'Baptisan baru ditambahkan'
      });
    }
  };

  const updateBaptism = (id: string, baptismData: Partial<Baptism>) => {
    const baptism = baptisms.find(b => b.id === id);
    setBaptisms(baptisms.map(b => b.id === id ? { ...b, ...baptismData, updatedAt: new Date().toISOString() } : b));
    if (baptism) apiSave('baptisms', id, { ...baptism, ...baptismData, updatedAt: new Date().toISOString() });
    if (currentUser && baptism) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Mengubah',
        entityType: 'Baptism',
        entityId: id,
        entityName: baptism.memberName,
        details: 'Data baptisan diperbarui'
      });
    }
  };

  const deleteBaptism = (id: string) => {
    const baptism = baptisms.find(b => b.id === id);
    setBaptisms(baptisms.filter(b => b.id !== id));
    apiRemove('baptisms', id);
    if (currentUser && baptism) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Menghapus',
        entityType: 'Baptism',
        entityId: id,
        entityName: baptism.memberName,
        details: 'Baptisan dihapus dari sistem'
      });
    }
  };

  const addSidi = (sidiData: Omit<Sidi, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newSidi: Sidi = {
      ...sidiData,
      id: `sid${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setSidis([...sidis, newSidi]);
    apiSave('sidis', newSidi.id, newSidi);
    if (currentUser) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Menambahkan',
        entityType: 'Sidi',
        entityId: newSidi.id,
        entityName: newSidi.memberName,
        details: 'Sidi baru ditambahkan'
      });
    }
  };

  const updateSidi = (id: string, sidiData: Partial<Sidi>) => {
    const sidiItem = sidis.find(s => s.id === id);
    setSidis(sidis.map(s => s.id === id ? { ...s, ...sidiData, updatedAt: new Date().toISOString() } : s));
    if (sidiItem) apiSave('sidis', id, { ...sidiItem, ...sidiData, updatedAt: new Date().toISOString() });
    if (currentUser && sidiItem) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Mengubah',
        entityType: 'Sidi',
        entityId: id,
        entityName: sidiItem.memberName,
        details: 'Data sidi diperbarui'
      });
    }
  };

  const deleteSidi = (id: string) => {
    const sidiItem = sidis.find(s => s.id === id);
    setSidis(sidis.filter(s => s.id !== id));
    apiRemove('sidis', id);
    if (currentUser && sidiItem) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Menghapus',
        entityType: 'Sidi',
        entityId: id,
        entityName: sidiItem.memberName,
        details: 'Sidi dihapus dari sistem'
      });
    }
  };

  const addMarriage = (marriageData: Omit<Marriage, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newMarriage: Marriage = {
      ...marriageData,
      id: `mar${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setMarriages([...marriages, newMarriage]);
    apiSave('marriages', newMarriage.id, newMarriage);
    if (currentUser) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Menambahkan',
        entityType: 'Marriage',
        entityId: newMarriage.id,
        entityName: `${newMarriage.groomName} & ${newMarriage.brideName}`,
        details: 'Perkawinan baru ditambahkan'
      });
    }
  };

  const updateMarriage = (id: string, marriageData: Partial<Marriage>) => {
    const marriage = marriages.find(m => m.id === id);
    setMarriages(marriages.map(m => m.id === id ? { ...m, ...marriageData, updatedAt: new Date().toISOString() } : m));
    if (marriage) apiSave('marriages', id, { ...marriage, ...marriageData, updatedAt: new Date().toISOString() });
    if (currentUser && marriage) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Mengubah',
        entityType: 'Marriage',
        entityId: id,
        entityName: `${marriage.groomName} & ${marriage.brideName}`,
        details: 'Data perkawinan diperbarui'
      });
    }
  };

  const deleteMarriage = (id: string) => {
    const marriage = marriages.find(m => m.id === id);
    setMarriages(marriages.filter(m => m.id !== id));
    apiRemove('marriages', id);
    if (currentUser && marriage) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Menghapus',
        entityType: 'Marriage',
        entityId: id,
        entityName: `${marriage.groomName} & ${marriage.brideName}`,
        details: 'Perkawinan dihapus dari sistem'
      });
    }
  };

  // ── ServiceRequest CRUD ──────────────────────────────────────────────────────
  const addServiceRequest = (data: Omit<ServiceRequest, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newReq: ServiceRequest = { ...data, id: `sr${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setServiceRequests(prev => [...prev, newReq]);
    apiSave('serviceRequests', newReq.id, newReq);
    if (currentUser) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'ServiceRequest', entityId: newReq.id, entityName: newReq.requestedBy, details: `Permohonan layanan baru — ${newReq.type}` });
    addNotification({
      type: 'alert',
      title: 'Permohonan Pelayanan Baru',
      message: `${newReq.requestedBy} mengajukan ${newReq.type} — menunggu tindak lanjut`,
      read: false,
      priority: 'high',
    });
  };

  const updateServiceRequest = (id: string, data: Partial<ServiceRequest>) => {
    const existing = serviceRequests.find(r => r.id === id);
    const updated = existing ? { ...existing, ...data, updatedAt: new Date().toISOString() } : null;
    setServiceRequests(prev => prev.map(r => r.id === id ? { ...r, ...data, updatedAt: new Date().toISOString() } : r));
    if (updated) apiSave('serviceRequests', id, updated);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'ServiceRequest', entityId: id, entityName: existing.requestedBy, details: `Permohonan layanan diperbarui — ${data.status ?? existing.status}` });
  };

  const deleteServiceRequest = (id: string) => {
    const existing = serviceRequests.find(r => r.id === id);
    setServiceRequests(prev => prev.filter(r => r.id !== id));
    apiRemove('serviceRequests', id);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'ServiceRequest', entityId: id, entityName: existing.requestedBy, details: `Permohonan layanan dihapus — ${existing.type}` });
  };

  // ── AidDistribution CRUD ─────────────────────────────────────────────────────
  const addAidDistribution = (data: Omit<AidDistribution, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newAid: AidDistribution = { ...data, id: `aid${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setAidDistributions(prev => [...prev, newAid]);
    apiSave('aidDistributions', newAid.id, newAid);
    if (currentUser) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'AidDistribution', entityId: newAid.id, entityName: newAid.recipientName, details: `Pengajuan bantuan baru — ${newAid.type}` });
  };

  const updateAidDistribution = (id: string, data: Partial<AidDistribution>) => {
    const existing = aidDistributions.find(a => a.id === id);
    const updated = existing ? { ...existing, ...data, updatedAt: new Date().toISOString() } : null;
    setAidDistributions(prev => prev.map(a => a.id === id ? { ...a, ...data, updatedAt: new Date().toISOString() } : a));
    if (updated) apiSave('aidDistributions', id, updated);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'AidDistribution', entityId: id, entityName: existing.recipientName, details: `Bantuan diperbarui — status: ${data.status ?? existing.status}` });
  };

  const deleteAidDistribution = (id: string) => {
    const existing = aidDistributions.find(a => a.id === id);
    setAidDistributions(prev => prev.filter(a => a.id !== id));
    apiRemove('aidDistributions', id);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'AidDistribution', entityId: id, entityName: existing.recipientName, details: `Bantuan ${existing.type} dihapus` });
  };

  // ── Resource CRUD ────────────────────────────────────────────────────────────
  const addResource = (data: Omit<Resource, 'id' | 'createdAt'>) => {
    const newRes: Resource = { ...data, id: `res${Date.now()}`, createdAt: new Date().toISOString() };
    setResources(prev => [...prev, newRes]);
    apiSave('resources', newRes.id, newRes);
    if (currentUser) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'Resource', entityId: newRes.id, entityName: newRes.title, details: `Materi baru diupload — ${newRes.type}` });
  };

  const updateResource = (id: string, data: Partial<Resource>) => {
    const existing = resources.find(r => r.id === id);
    const updated = existing ? { ...existing, ...data } : null;
    setResources(prev => prev.map(r => r.id === id ? { ...r, ...data } : r));
    if (updated) apiSave('resources', id, updated);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'Resource', entityId: id, entityName: existing.title, details: `Materi diperbarui — ${existing.type}` });
  };

  const deleteResource = (id: string) => {
    const existing = resources.find(r => r.id === id);
    setResources(prev => prev.filter(r => r.id !== id));
    apiRemove('resources', id);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'Resource', entityId: id, entityName: existing.title, details: `Materi ${existing.type} dihapus` });
  };

  // ── RoomBooking CRUD ─────────────────────────────────────────────────────────
  const addRoomBooking = (data: Omit<RoomBooking, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newBooking: RoomBooking = { ...data, id: `rb${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setRoomBookings(prev => [...prev, newBooking]);
    apiSave('roomBookings', newBooking.id, newBooking);
    if (currentUser) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'RoomBooking', entityId: newBooking.id, entityName: `${newBooking.roomName} — ${newBooking.bookedBy}`, details: `Peminjaman ruangan baru — ${newBooking.date}` });
  };

  const updateRoomBooking = (id: string, data: Partial<RoomBooking>) => {
    const existing = roomBookings.find(b => b.id === id);
    const updated = existing ? { ...existing, ...data, updatedAt: new Date().toISOString() } : null;
    setRoomBookings(prev => prev.map(b => b.id === id ? { ...b, ...data, updatedAt: new Date().toISOString() } : b));
    if (updated) apiSave('roomBookings', id, updated);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'RoomBooking', entityId: id, entityName: `${existing.roomName} — ${existing.bookedBy}`, details: `Booking diperbarui — status: ${data.status ?? existing.status}` });
  };

  const deleteRoomBooking = (id: string) => {
    const existing = roomBookings.find(b => b.id === id);
    setRoomBookings(prev => prev.filter(b => b.id !== id));
    apiRemove('roomBookings', id);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'RoomBooking', entityId: id, entityName: `${existing.roomName} — ${existing.bookedBy}`, details: `Booking ${existing.date} dihapus` });
  };

  // ── BuildingProject CRUD ──────────────────────────────────────────────────────
  const addBuildingProject = (data: Omit<BuildingProject, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newProj: BuildingProject = { ...data, id: `bp${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setBuildingProjects(prev => [...prev, newProj]);
    apiSave('buildingProjects', newProj.id, newProj);
    if (currentUser) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'BuildingProject', entityId: newProj.id, entityName: newProj.name, details: `Proyek pembangunan baru dibuat` });
  };

  const updateBuildingProject = (id: string, data: Partial<BuildingProject>) => {
    const existing = buildingProjects.find(p => p.id === id);
    const updated = existing ? { ...existing, ...data, updatedAt: new Date().toISOString() } : null;
    setBuildingProjects(prev => prev.map(p => p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p));
    if (updated) apiSave('buildingProjects', id, updated);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'BuildingProject', entityId: id, entityName: existing.name, details: `Proyek pembangunan diperbarui` });
  };

  const deleteBuildingProject = (id: string) => {
    const existing = buildingProjects.find(p => p.id === id);
    setBuildingProjects(prev => prev.filter(p => p.id !== id));
    apiRemove('buildingProjects', id);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'BuildingProject', entityId: id, entityName: existing.name, details: `Proyek pembangunan dihapus` });
  };

  // ── FinancialCategory CRUD ────────────────────────────────────────────────────
  const addFinancialCategory = (data: Omit<FinancialCategory, 'id'>) => {
    const newCat: FinancialCategory = { ...data, id: `fc${Date.now()}` };
    setFinancialCategories(prev => [...prev, newCat]);
    apiSave('financialCategories', newCat.id, newCat);
    if (currentUser) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'FinancialCategory', entityId: newCat.id, entityName: newCat.name, details: `Kategori keuangan baru — ${newCat.type}` });
  };

  const updateFinancialCategory = (id: string, data: Partial<FinancialCategory>) => {
    const existing = financialCategories.find(c => c.id === id);
    setFinancialCategories(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
    if (existing) apiSave('financialCategories', id, { ...existing, ...data });
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'FinancialCategory', entityId: id, entityName: existing.name, details: `Kategori keuangan diperbarui` });
  };

  const deleteFinancialCategory = (id: string) => {
    const existing = financialCategories.find(c => c.id === id);
    setFinancialCategories(prev => prev.filter(c => c.id !== id));
    apiRemove('financialCategories', id);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'FinancialCategory', entityId: id, entityName: existing.name, details: `Kategori keuangan dihapus` });
  };

  // ── Attestation CRUD ──────────────────────────────────────────────────────────
  const addAttestation = (data: Omit<Attestation, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newAtt: Attestation = { ...data, id: `att${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setAttestations(prev => [...prev, newAtt]);
    apiSave('attestations', newAtt.id, newAtt);
    if (currentUser) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'Attestation', entityId: newAtt.id, entityName: newAtt.memberName, details: `Atestasi baru — ${newAtt.type}` });
  };

  const updateAttestation = (id: string, data: Partial<Attestation>) => {
    const existing = attestations.find(a => a.id === id);
    const updated = existing ? { ...existing, ...data, updatedAt: new Date().toISOString() } : null;
    setAttestations(prev => prev.map(a => a.id === id ? { ...a, ...data, updatedAt: new Date().toISOString() } : a));
    if (updated) apiSave('attestations', id, updated);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'Attestation', entityId: id, entityName: existing.memberName, details: `Atestasi diperbarui — status: ${data.status ?? existing.status}` });
  };

  const deleteAttestation = (id: string) => {
    const existing = attestations.find(a => a.id === id);
    setAttestations(prev => prev.filter(a => a.id !== id));
    apiRemove('attestations', id);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'Attestation', entityId: id, entityName: existing.memberName, details: `Atestasi ${existing.type} dihapus` });
  };

  // ── PettyCash CRUD ────────────────────────────────────────────────────────────
  const addPettyCash = (data: Omit<PettyCash, 'id' | 'createdAt'>) => {
    const newPC: PettyCash = { ...data, id: `pc${Date.now()}`, createdAt: new Date().toISOString() };
    setPettyCash(prev => [newPC, ...prev]);
    apiSave('pettyCash', newPC.id, newPC);
    if (currentUser) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'PettyCash', entityId: newPC.id, entityName: newPC.description, details: `Kas kecil ${newPC.category} — Rp${newPC.amount.toLocaleString('id-ID')}` });
  };

  const updatePettyCash = (id: string, data: Partial<PettyCash>) => {
    const existing = pettyCash.find(r => r.id === id);
    const updated = existing ? { ...existing, ...data } : null;
    setPettyCash(prev => prev.map(r => r.id === id ? { ...r, ...data } : r));
    if (updated) apiSave('pettyCash', id, updated);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'PettyCash', entityId: id, entityName: existing.description, details: `Kas kecil diperbarui — status: ${data.status ?? existing.status}` });
  };

  const deletePettyCash = (id: string) => {
    const existing = pettyCash.find(r => r.id === id);
    setPettyCash(prev => prev.filter(r => r.id !== id));
    apiRemove('pettyCash', id);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'PettyCash', entityId: id, entityName: existing.description, details: `Kas kecil ${existing.category} dihapus` });
  };

  const addPcTopUp = (data: Omit<PcTopUp, 'id' | 'createdAt'>) => {
    const newTopUp: PcTopUp = { ...data, id: `tu${Date.now()}`, createdAt: new Date().toISOString() };
    setPcTopUps(prev => [newTopUp, ...prev]);
    apiSave('pettyCashTopUps', newTopUp.id, newTopUp);
    if (currentUser) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'PcTopUp', entityId: newTopUp.id, entityName: newTopUp.description, details: `Top up kas kecil Rp${newTopUp.amount.toLocaleString('id-ID')} dari ${newTopUp.source}` });
  };

  const deletePcTopUp = (id: string) => {
    const existing = pcTopUps.find(t => t.id === id);
    setPcTopUps(prev => prev.filter(t => t.id !== id));
    apiRemove('pettyCashTopUps', id);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'PcTopUp', entityId: id, entityName: existing.description, details: `Top up kas kecil ${existing.date} dihapus` });
  };

  // ── ChurchAsset CRUD ──────────────────────────────────────────────────────────
  const addChurchAsset = (data: Omit<ChurchAsset, 'id' | 'createdAt' | 'updatedAt'>): ChurchAsset => {
    const now = new Date().toISOString();
    const newAsset: ChurchAsset = { ...data, id: `a${Date.now()}`, createdAt: now, updatedAt: now };
    setChurchAssets(prev => [...prev, newAsset]);
    apiSave('churchAssets', newAsset.id, newAsset);
    if (currentUser) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'ChurchAsset', entityId: newAsset.id, entityName: newAsset.name, details: `Aset baru — ${newAsset.category} — ${newAsset.assetCode}` });
    return newAsset;
  };

  const updateChurchAsset = (id: string, data: Partial<ChurchAsset>) => {
    const existing = churchAssets.find(a => a.id === id);
    const updated = existing ? { ...existing, ...data, updatedAt: new Date().toISOString() } : null;
    setChurchAssets(prev => prev.map(a => a.id === id ? { ...a, ...data, updatedAt: new Date().toISOString() } : a));
    if (updated) apiSave('churchAssets', id, updated);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'ChurchAsset', entityId: id, entityName: existing.name, details: `Aset diperbarui — kondisi: ${data.condition ?? existing.condition}` });
  };

  const deleteChurchAsset = (id: string) => {
    const existing = churchAssets.find(a => a.id === id);
    setChurchAssets(prev => prev.filter(a => a.id !== id));
    apiRemove('churchAssets', id);
    const relatedMaints = assetMaintenances.filter(m => m.assetId === id);
    relatedMaints.forEach(m => apiRemove('assetMaintenances', m.id));
    setAssetMaintenances(prev => prev.filter(m => m.assetId !== id));
    const relatedLoans = assetLoanHistories.filter(h => h.assetId === id);
    relatedLoans.forEach(h => apiRemove('assetLoanHistories', h.id));
    setAssetLoanHistories(prev => prev.filter(h => h.assetId !== id));
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'ChurchAsset', entityId: id, entityName: existing.name, details: `Aset ${existing.category} dihapus beserta ${relatedMaints.length} catatan pemeliharaan` });
  };

  const addAssetMaintenance = (data: Omit<MaintenanceRecord, 'id'>) => {
    const rec: MaintenanceRecord = { ...data, id: `m${Date.now()}` };
    setAssetMaintenances(prev => [...prev, rec]);
    apiSave('assetMaintenances', rec.id, rec);
    const asset = churchAssets.find(a => a.id === rec.assetId);
    if (currentUser) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'AssetMaintenance', entityId: rec.id, entityName: asset?.name ?? rec.assetId, details: `Pemeliharaan ${rec.type} — ${rec.result}` });
  };

  const addAssetLoanHistory = (data: Omit<LoanHistoryRecord, 'id'>) => {
    const rec: LoanHistoryRecord = { ...data, id: `lh${Date.now()}` };
    setAssetLoanHistories(prev => [rec, ...prev]);
    apiSave('assetLoanHistories', rec.id, rec);
    if (currentUser) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'AssetLoan', entityId: rec.id, entityName: rec.assetName ?? rec.assetId, details: `Dipinjam oleh ${rec.borrowedByName}` });
  };

  const updateAssetLoanHistory = (id: string, data: Partial<LoanHistoryRecord>) => {
    const existing = assetLoanHistories.find(h => h.id === id);
    const updated = existing ? { ...existing, ...data } : null;
    setAssetLoanHistories(prev => prev.map(h => h.id === id ? { ...h, ...data } : h));
    if (updated) apiSave('assetLoanHistories', id, updated);
    if (currentUser && existing) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'AssetLoan', entityId: id, entityName: existing.assetName ?? existing.assetId, details: `Status pinjam diperbarui — ${data.status ?? existing.status}` });
  };

  // ── BankAccount CRUD ─────────────────────────────────────────────────────────
  const addBankAccount = (data: Omit<BankAccount, 'id'>) => {
    const newAcc: BankAccount = { ...data, id: `ba${Date.now()}` };
    setBankAccounts(prev => [...prev, newAcc]);
    apiSave('bankAccounts', newAcc.id, newAcc);
    if (currentUser) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'FinancialRecord', entityId: newAcc.id, entityName: `Rekening ${newAcc.bankName}` });
  };

  const updateBankAccount = (id: string, data: Partial<BankAccount>) => {
    const acc = bankAccounts.find(a => a.id === id);
    setBankAccounts(prev => prev.map(a => {
      if (a.id !== id) return a;
      const updated = { ...a, ...data };
      apiSave('bankAccounts', id, updated);
      return updated;
    }));
    if (currentUser && acc) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'BankAccount', entityId: id, entityName: `Rekening ${acc.bankName}`, details: `Data rekening bank diperbarui` });
  };

  const deleteBankAccount = (id: string) => {
    const acc = bankAccounts.find(a => a.id === id);
    setBankAccounts(prev => prev.filter(a => a.id !== id));
    apiRemove('bankAccounts', id);
    if (currentUser && acc) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'BankAccount', entityId: id, entityName: `Rekening ${acc.bankName}`, details: `Rekening bank dihapus` });
  };

  // ── Budget CRUD ──────────────────────────────────────────────────────────────
  const addBudget = (data: Omit<Budget, 'id'>) => {
    const newBudget: Budget = { ...data, id: `b${Date.now()}` };
    setBudgets(prev => [...prev, newBudget]);
    apiSave('budgets', newBudget.id, newBudget);
    if (currentUser) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'Budget', entityId: newBudget.id, entityName: newBudget.category, details: `Anggaran ${newBudget.category} Rp${newBudget.allocated.toLocaleString('id-ID')}` });
  };

  const updateBudget = (id: string, data: Partial<Budget>) => {
    const bgt = budgets.find(b => b.id === id);
    setBudgets(prev => prev.map(b => {
      if (b.id !== id) return b;
      const updated = { ...b, ...data };
      apiSave('budgets', id, updated);
      return updated;
    }));
    if (currentUser && bgt) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'Budget', entityId: id, entityName: bgt.category, details: `Anggaran diperbarui` });
  };

  const deleteBudget = (id: string) => {
    const bgt = budgets.find(b => b.id === id);
    setBudgets(prev => prev.filter(b => b.id !== id));
    apiRemove('budgets', id);
    if (currentUser && bgt) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'Budget', entityId: id, entityName: bgt.category, details: `Anggaran dihapus` });
  };

  // ── LivestreamLink CRUD ───────────────────────────────────────────────────────
  const addLivestreamLink = (data: Omit<LivestreamLink, 'id'>) => {
    const newLink: LivestreamLink = { ...data, id: `ls${Date.now()}` };
    setLivestreamLinks(prev => [...prev, newLink]);
    apiSave('livestreamLinks', newLink.id, newLink);
  };

  const updateLivestreamLink = (id: string, data: Partial<LivestreamLink>) => {
    setLivestreamLinks(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, ...data };
      apiSave('livestreamLinks', id, updated);
      return updated;
    }));
  };

  const deleteLivestreamLink = (id: string) => {
    setLivestreamLinks(prev => prev.filter(l => l.id !== id));
    apiRemove('livestreamLinks', id);
  };

  // ── ReminderSetting CRUD ──────────────────────────────────────────────────────
  const addReminderSetting = (data: Omit<ReminderSetting, 'id'>) => {
    const newR: ReminderSetting = { ...data, id: `rs${Date.now()}` };
    setReminderSettings(prev => [...prev, newR]);
    apiSave('reminderSettings', newR.id, newR);
  };

  const updateReminderSetting = (id: string, data: Partial<ReminderSetting>) => {
    setReminderSettings(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, ...data };
      apiSave('reminderSettings', id, updated);
      return updated;
    }));
  };

  const deleteReminderSetting = (id: string) => {
    setReminderSettings(prev => prev.filter(r => r.id !== id));
    apiRemove('reminderSettings', id);
  };

  // ── Liability CRUD ────────────────────────────────────────────────────────────
  const addLiability = (data: Omit<Liability, 'id'>) => {
    const newL: Liability = { ...data, id: `lib${Date.now()}` };
    setLiabilities(prev => [...prev, newL]);
    apiSave('liabilities', newL.id, newL);
    if (currentUser) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'Liability', entityId: newL.id, entityName: newL.description, details: `Kewajiban/Hutang ${newL.type} Rp${newL.amount.toLocaleString('id-ID')} kepada ${newL.creditor}` });
  };

  const updateLiability = (id: string, data: Partial<Liability>) => {
    const lib = liabilities.find(l => l.id === id);
    setLiabilities(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, ...data };
      apiSave('liabilities', id, updated);
      return updated;
    }));
    if (currentUser && lib) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'Liability', entityId: id, entityName: lib.description, details: `Data kewajiban diperbarui (Status: ${data.status ?? lib.status})` });
  };

  const deleteLiability = (id: string) => {
    const lib = liabilities.find(l => l.id === id);
    setLiabilities(prev => prev.filter(l => l.id !== id));
    apiRemove('liabilities', id);
    if (currentUser && lib) logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'Liability', entityId: id, entityName: lib.description, details: `Kewajiban/Hutang dihapus` });
  };

  // ── FiscalYearSetting CRUD ────────────────────────────────────────────────────
  const addFiscalYearSetting = (data: Omit<FiscalYearSetting, 'id'>) => {
    const newS: FiscalYearSetting = { ...data, id: `fy${data.year}` };
    setFiscalYearSettings(prev => [...prev.filter(s => s.year !== data.year), newS]);
    apiSave('fiscalYearSettings', newS.id, newS);
  };

  const updateFiscalYearSetting = (id: string, data: Partial<FiscalYearSetting>) => {
    setFiscalYearSettings(prev => prev.map(s => {
      if (s.id !== id) return s;
      const updated = { ...s, ...data };
      apiSave('fiscalYearSettings', id, updated);
      return updated;
    }));
  };

  const deleteFiscalYearSetting = (id: string) => {
    setFiscalYearSettings(prev => prev.filter(s => s.id !== id));
    apiRemove('fiscalYearSettings', id);
  };

  // ── Room CRUD ─────────────────────────────────────────────────────────────────
  const addRoom = (data: Omit<Room, 'id'>) => {
    const newR: Room = { ...data, id: `rm${Date.now()}` };
    setRooms(prev => [...prev, newR]);
    apiSave('rooms', newR.id, newR);
  };

  const updateRoom = (id: string, data: Partial<Room>) => {
    setRooms(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, ...data };
      apiSave('rooms', id, updated);
      return updated;
    }));
  };

  const deleteRoom = (id: string) => {
    setRooms(prev => prev.filter(r => r.id !== id));
    apiRemove('rooms', id);
  };

  // ── CustomRole CRUD ───────────────────────────────────────────────────────────
  const addCustomRole = (data: Omit<CustomRole, 'id'>) => {
    const newR: CustomRole = { ...data, id: `cr${Date.now()}` };
    setCustomRoles(prev => [...prev, newR]);
    apiSave('customRoles', newR.id, newR);
  };

  const updateCustomRole = (id: string, data: Partial<CustomRole>) => {
    setCustomRoles(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, ...data };
      apiSave('customRoles', id, updated);
      return updated;
    }));
  };

  const deleteCustomRole = (id: string) => {
    setCustomRoles(prev => prev.filter(r => r.id !== id));
    apiRemove('customRoles', id);
  };

  // ── BuiltinRoleOverride CRUD ──────────────────────────────────────────────────
  const upsertBuiltinRoleOverride = (override: BuiltinRoleOverride) => {
    setBuiltinRoleOverrides(prev => {
      const exists = prev.find(o => o.id === override.id);
      const next = exists ? prev.map(o => o.id === override.id ? override : o) : [...prev, override];
      apiSave('builtinRoleOverrides', override.id, override);
      return next;
    });
  };

  const addOffering = (offeringData: Omit<Offering, 'id' | 'createdAt'>) => {
    const newOffering: Offering = { ...offeringData, id: `off${Date.now()}`, createdAt: new Date().toISOString() };
    setOfferings([...offerings, newOffering]);
    apiSave('offerings', newOffering.id, newOffering);
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'Offering', entityId: newOffering.id, entityName: newOffering.donorName || 'Anonim', details: `Persembahan ${newOffering.type} Rp${newOffering.amount.toLocaleString('id-ID')} via ${newOffering.paymentMethod}` });
    }
  };

  const updateOffering = (id: string, offeringData: Partial<Offering>) => {
    const off = offerings.find(o => o.id === id);
    setOfferings(offerings.map(o => o.id === id ? { ...o, ...offeringData } : o));
    if (off) apiSave('offerings', id, { ...off, ...offeringData });
    if (currentUser && off) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'Offering', entityId: id, entityName: off.donorName || 'Anonim', details: `Data persembahan diperbarui — ${off.type}` });
    }
  };

  const deleteOffering = (id: string) => {
    const off = offerings.find(o => o.id === id);
    setOfferings(offerings.filter(o => o.id !== id));
    apiRemove('offerings', id);
    if (currentUser && off) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'Offering', entityId: id, entityName: off.donorName || 'Anonim', details: `Persembahan ${off.type} Rp${off.amount.toLocaleString('id-ID')} dihapus` });
    }
  };

  // ── Warta CRUD ─────────────────────────────────────────────────────────────
  const addWarta = (wartaData: Omit<Warta, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newWarta: Warta = {
      ...wartaData,
      id: `warta${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setWartas([...wartas, newWarta]);
    apiSave('wartas', newWarta.id, newWarta);
    if (currentUser) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Menambahkan',
        entityType: 'Warta',
        entityId: newWarta.id,
        entityName: newWarta.title,
        details: 'E-Warta baru dibuat'
      });
    }
  };

  const updateWarta = (id: string, wartaData: Partial<Warta>) => {
    const warta = wartas.find(w => w.id === id);
    setWartas(wartas.map(w => w.id === id ? { ...w, ...wartaData, updatedAt: new Date().toISOString() } : w));
    if (warta) apiSave('wartas', id, { ...warta, ...wartaData, updatedAt: new Date().toISOString() });
    if (currentUser && warta) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Mengubah',
        entityType: 'Warta',
        entityId: id,
        entityName: warta.title,
        details: 'E-Warta diperbarui'
      });
    }
  };

  const deleteWarta = (id: string) => {
    const warta = wartas.find(w => w.id === id);
    setWartas(wartas.filter(w => w.id !== id));
    apiRemove('wartas', id);
    if (currentUser && warta) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Menghapus',
        entityType: 'Warta',
        entityId: id,
        entityName: warta.title,
        details: 'E-Warta dihapus dari sistem'
      });
    }
  };

  const addLiturgy = (liturgyData: Omit<Liturgy, 'id' | 'createdAt'>) => {
    const newLiturgy: Liturgy = {
      ...liturgyData,
      id: `lit${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setLiturgies(prev => [newLiturgy, ...prev]);
    apiSave('liturgies', newLiturgy.id, newLiturgy);
    if (currentUser) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Menambahkan',
        entityType: 'Event',
        entityId: newLiturgy.id,
        entityName: newLiturgy.theme,
        details: 'Liturgi baru dibuat'
      });
    }
  };

  const updateLiturgy = (id: string, liturgyData: Partial<Liturgy>) => {
    const liturgy = liturgies.find(l => l.id === id);
    setLiturgies(prev => prev.map(l => l.id === id ? { ...l, ...liturgyData } : l));
    if (liturgy) apiSave('liturgies', id, { ...liturgy, ...liturgyData });
    if (currentUser && liturgy) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Mengubah',
        entityType: 'Event',
        entityId: id,
        entityName: liturgy.theme,
        details: 'Liturgi diperbarui'
      });
    }
  };

  const deleteLiturgy = (id: string) => {
    const liturgy = liturgies.find(l => l.id === id);
    setLiturgies(prev => prev.filter(l => l.id !== id));
    apiRemove('liturgies', id);
    if (currentUser && liturgy) {
      logActivity({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Menghapus',
        entityType: 'Event',
        entityId: id,
        entityName: liturgy.theme,
        details: 'Liturgi dihapus dari sistem'
      });
    }
  };

  const addWorshipSchedule = (scheduleData: Omit<WorshipSchedule, 'id' | 'createdAt'>) => {
    const newSchedule: WorshipSchedule = {
      ...scheduleData,
      id: `ws${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setWorshipSchedules([...worshipSchedules, newSchedule]);
    apiSave('worshipSchedules', newSchedule.id, newSchedule);
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menambahkan', entityType: 'WorshipSchedule', entityId: newSchedule.id, entityName: newSchedule.title, details: `Jadwal ibadah baru — ${newSchedule.date} ${newSchedule.time}` });
    }
  };

  const updateWorshipSchedule = (id: string, scheduleData: Partial<WorshipSchedule>) => {
    const ws = worshipSchedules.find(s => s.id === id);
    setWorshipSchedules(worshipSchedules.map(s => s.id === id ? { ...s, ...scheduleData } : s));
    if (ws) apiSave('worshipSchedules', id, { ...ws, ...scheduleData });
    if (currentUser && ws) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Mengubah', entityType: 'WorshipSchedule', entityId: id, entityName: ws.title, details: `Jadwal ibadah diperbarui — ${ws.date}` });
    }
  };

  const deleteWorshipSchedule = (id: string) => {
    const ws = worshipSchedules.find(s => s.id === id);
    setWorshipSchedules(worshipSchedules.filter(s => s.id !== id));
    apiRemove('worshipSchedules', id);
    if (currentUser && ws) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'Menghapus', entityType: 'WorshipSchedule', entityId: id, entityName: ws.title, details: `Jadwal ibadah dihapus — ${ws.date}` });
    }
  };

  const globalSearch = (query: string) => {
    const lowerQuery = query.toLowerCase();
    const results: any[] = [];

    const FEATURE_PAGES = [
      { id: 'dashboard', label: 'Dashboard', keywords: ['beranda', 'home', 'utama', 'dashboard'], icon: 'layout-dashboard', page: 'dashboard' },
      { id: 'members', label: 'Data Jemaat', keywords: ['jemaat', 'anggota', 'member', 'data jemaat'], icon: 'users', page: 'members' },
      { id: 'families', label: 'Data Keluarga', keywords: ['keluarga', 'kartu keluarga', 'kk', 'family'], icon: 'home', page: 'families' },
      { id: 'sectors', label: 'Data Sektor', keywords: ['sektor', 'wilayah', 'sector'], icon: 'map-pin', page: 'sectors' },
      { id: 'sacraments', label: 'Sakramen', keywords: ['sakramen', 'baptis', 'sidi', 'nikah', 'pernikahan'], icon: 'cross', page: 'sacraments' },
      { id: 'attestations', label: 'Surat Atestasi', keywords: ['atestasi', 'surat pindah', 'pindah gereja'], icon: 'file-text', page: 'attestations' },
      { id: 'member-card', label: 'Kartu Jemaat Digital', keywords: ['kartu jemaat', 'id card', 'kartu digital'], icon: 'credit-card', page: 'member-card' },
      { id: 'worship-schedules', label: 'Jadwal Ibadah', keywords: ['jadwal ibadah', 'kebaktian', 'ibadah minggu'], icon: 'calendar', page: 'worship-schedules' },
      { id: 'e-warta', label: 'E-Warta', keywords: ['warta', 'bulletin', 'berita gereja', 'ewarta'], icon: 'book-open', page: 'e-warta' },
      { id: 'liturgy', label: 'Liturgi Digital', keywords: ['liturgi', 'tata ibadah', 'liturgy'], icon: 'scroll', page: 'liturgy' },
      { id: 'events', label: 'Kalender Acara', keywords: ['acara', 'event', 'kalender', 'kegiatan'], icon: 'calendar-days', page: 'events' },
      { id: 'ministries', label: 'Komisi & Pelayanan', keywords: ['komisi', 'pelayanan', 'ministry', 'panitia'], icon: 'users-2', page: 'ministries' },
      { id: 'livestream', label: 'Livestream Reminder', keywords: ['livestream', 'siaran langsung', 'youtube', 'live'], icon: 'video', page: 'livestream' },
      { id: 'church-finance', label: 'Manajemen Keuangan', keywords: ['keuangan', 'finance', 'kas', 'pemasukan', 'pengeluaran'], icon: 'landmark', page: 'church-finance' },
      { id: 'offerings', label: 'Persembahan & QRIS', keywords: ['persembahan', 'qris', 'offering', 'donasi', 'kolekte'], icon: 'qr-code', page: 'offerings' },
      { id: 'building-projects', label: 'Proyek Pembangunan', keywords: ['proyek', 'pembangunan', 'gedung', 'renovasi'], icon: 'building', page: 'church-finance' },
      { id: 'budget-planning', label: 'Perencanaan Anggaran', keywords: ['anggaran', 'budget', 'rapb', 'rencana keuangan'], icon: 'calculator', page: 'financial' },
      { id: 'offering-per-member', label: 'Persembahan per Jemaat', keywords: ['persembahan jemaat', 'kontribusi jemaat'], icon: 'hand-heart', page: 'offerings' },
      { id: 'assets', label: 'Manajemen Aset', keywords: ['aset', 'inventaris', 'barang', 'harta'], icon: 'package', page: 'assets' },
      { id: 'sensus-report', label: 'Laporan Jemaat', keywords: ['sensus', 'laporan', 'statistik', 'report'], icon: 'bar-chart', page: 'sensus-report' },
      { id: 'service-requests', label: 'Permintaan Pelayanan', keywords: ['pelayanan kasih', 'kunjungan', 'pastoral', 'diakonia'], icon: 'heart-handshake', page: 'service-requests' },
      { id: 'prayers', label: 'Permintaan Doa', keywords: ['doa', 'prayer', 'permohonan doa'], icon: 'hands', page: 'prayers' },
      { id: 'announcements', label: 'Pengumuman', keywords: ['pengumuman', 'informasi', 'announcement'], icon: 'megaphone', page: 'announcements' },
      { id: 'attendance', label: 'Absensi & Kehadiran', keywords: ['absensi', 'kehadiran', 'hadir', 'attendance'], icon: 'check-square', page: 'attendance' },
      { id: 'schedule', label: 'Jadwal Pelayan', keywords: ['jadwal pelayan', 'petugas ibadah', 'piket'], icon: 'list-checks', page: 'worship-schedules' },
      { id: 'reports', label: 'Laporan', keywords: ['laporan umum', 'report'], icon: 'file-bar-chart', page: 'reports' },
      { id: 'users', label: 'List User', keywords: ['pengguna', 'user', 'akun sistem', 'admin'], icon: 'user-cog', page: 'users' },
      { id: 'roles', label: 'Manajemen Roles', keywords: ['roles', 'hak akses', 'permission', 'izin akses'], icon: 'shield-check', page: 'roles' },
      { id: 'backup', label: 'Backup Data & Aplikasi', keywords: ['backup', 'restore', 'pulihkan', 'sinkron', 'ekspor', 'integritas'], icon: 'hard-drive', page: 'backup' },
      { id: 'data', label: 'Manajemen Data', keywords: ['import data', 'export data', 'migrasi'], icon: 'database', page: 'data' },
      { id: 'activity', label: 'Log Aktivitas', keywords: ['log aktivitas', 'riwayat', 'history sistem'], icon: 'activity', page: 'activity' },
    ];

    // Feature / Halaman
    FEATURE_PAGES.forEach(fp => {
      const haystack = [fp.label, ...fp.keywords].join(' ').toLowerCase();
      if (haystack.includes(lowerQuery)) {
        results.push({ type: 'feature', group: 'Fitur / Halaman', page: fp.page, title: fp.label, subtitle: 'Buka halaman', icon: fp.icon, data: fp });
      }
    });

    // Data Jemaat — members
    members.forEach(m => {
      if (m.fullName.toLowerCase().includes(lowerQuery) ||
          m.email?.toLowerCase().includes(lowerQuery) ||
          m.phone?.toLowerCase().includes(lowerQuery) ||
          m.address?.toLowerCase().includes(lowerQuery)) {
        const sec = sectors.find(s => s.id === m.sectorId);
        results.push({ type: 'member', group: 'Data Jemaat', page: 'members', title: m.fullName, subtitle: `${m.gender ?? ''} · ${sec?.name ?? 'Tanpa Sektor'}`, data: m });
      }
    });

    // Data Jemaat — families
    families.forEach(f => {
      if (f.headOfFamily.toLowerCase().includes(lowerQuery) ||
          f.address?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'family', group: 'Data Jemaat', page: 'families', title: `Keluarga ${f.headOfFamily}`, subtitle: f.address ?? '', data: f });
      }
    });

    // Data Jemaat — sectors
    sectors.forEach(s => {
      if (s.name.toLowerCase().includes(lowerQuery) ||
          s.leader?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'sector', group: 'Data Jemaat', page: 'sectors', title: s.name, subtitle: `Ketua: ${s.leader ?? '-'} · ${s.memberCount ?? 0} jemaat`, data: s });
      }
    });

    // Peribadahan — worshipSchedules
    worshipSchedules.forEach(ws => {
      if (ws.title.toLowerCase().includes(lowerQuery) ||
          ws.preacher?.toLowerCase().includes(lowerQuery) ||
          ws.sermon_theme?.toLowerCase().includes(lowerQuery) ||
          ws.type?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'worship', group: 'Peribadahan', page: 'worship-schedules', title: ws.title, subtitle: `${ws.date} · ${ws.preacher ?? '-'}`, data: ws });
      }
    });

    // Peribadahan — wartas
    wartas.forEach(w => {
      if (w.title.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'warta', group: 'Peribadahan', page: 'e-warta', title: w.title, subtitle: `Edisi ${w.week}/${w.month}/${w.year}`, data: w });
      }
    });

    // Peribadahan — liturgies
    liturgies.forEach(l => {
      if (l.theme?.toLowerCase().includes(lowerQuery) ||
          l.sermon?.title?.toLowerCase().includes(lowerQuery) ||
          l.sermon?.preacher?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'liturgy', group: 'Peribadahan', page: 'liturgy', title: l.theme ?? l.sermon?.title ?? 'Liturgi', subtitle: l.date, data: l });
      }
    });

    // Kegiatan & Doa — events
    events.forEach(e => {
      if (e.title.toLowerCase().includes(lowerQuery) ||
          e.description?.toLowerCase().includes(lowerQuery) ||
          e.type?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'event', group: 'Kegiatan & Doa', page: 'events', title: e.title, subtitle: `${e.date} · ${e.type ?? ''}`, data: e });
      }
    });

    // Kegiatan & Doa — prayerRequests
    prayerRequests.forEach(pr => {
      if (pr.request.toLowerCase().includes(lowerQuery) ||
          pr.category.toLowerCase().includes(lowerQuery)) {
        const mem = members.find(m => m.id === pr.memberId);
        results.push({ type: 'prayer', group: 'Kegiatan & Doa', page: 'prayers', title: `Doa: ${pr.category}`, subtitle: mem ? mem.fullName : pr.request.substring(0, 50), data: pr });
      }
    });

    // Kegiatan & Doa — announcements
    announcements.forEach(a => {
      if (a.title.toLowerCase().includes(lowerQuery) ||
          a.content?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'announcement', group: 'Kegiatan & Doa', page: 'announcements', title: a.title, subtitle: a.content?.substring(0, 60) ?? '', data: a });
      }
    });

    // Keuangan — financialRecords
    financialRecords.forEach(fr => {
      if (fr.description.toLowerCase().includes(lowerQuery) ||
          fr.category.toLowerCase().includes(lowerQuery) ||
          fr.reference?.toLowerCase().includes(lowerQuery)) {
        const typeLabel = fr.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
        results.push({ type: 'financial', group: 'Keuangan', page: 'church-finance', title: fr.description, subtitle: `${typeLabel} · ${fr.date} · Rp${fr.amount.toLocaleString('id-ID')}`, data: fr });
      }
    });

    // Keuangan — offerings
    offerings.forEach(o => {
      if (o.donorName?.toLowerCase().includes(lowerQuery) ||
          o.type?.toLowerCase().includes(lowerQuery) ||
          o.description?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'offering', group: 'Keuangan', page: 'offerings', title: `Persembahan ${o.type}`, subtitle: `${o.donorName ?? 'Anonim'} · Rp${o.amount.toLocaleString('id-ID')} · ${o.date}`, data: o });
      }
    });

    // Keuangan — buildingProjects
    buildingProjects.forEach(bp => {
      if (bp.name.toLowerCase().includes(lowerQuery) ||
          bp.description?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'building', group: 'Keuangan', page: 'church-finance', title: bp.name, subtitle: `${bp.status} · ${bp.progress}% tercapai`, data: bp });
      }
    });

    // Pelayanan — serviceRequests
    serviceRequests.forEach(sr => {
      if (sr.requestedBy.toLowerCase().includes(lowerQuery) ||
          sr.description?.toLowerCase().includes(lowerQuery) ||
          sr.type?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'service', group: 'Pelayanan Kasih', page: 'service-requests', title: `${sr.type}: ${sr.requestedBy}`, subtitle: sr.description?.substring(0, 60) ?? '', data: sr });
      }
    });

    // Pelayanan — aidDistributions
    aidDistributions.forEach(aid => {
      if (aid.recipientName.toLowerCase().includes(lowerQuery) ||
          aid.type.toLowerCase().includes(lowerQuery) ||
          aid.description.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'aid', group: 'Pelayanan Kasih', page: 'aid-distribution', title: `Bantuan ${aid.type}: ${aid.recipientName}`, subtitle: `${aid.status} · ${aid.requestedDate ?? ''}`, data: aid });
      }
    });

    // Fasilitas — resources
    resources.forEach(res => {
      if (res.title.toLowerCase().includes(lowerQuery) ||
          res.category?.toLowerCase().includes(lowerQuery) ||
          res.description?.toLowerCase().includes(lowerQuery) ||
          res.author?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'resource', group: 'Fasilitas & Inventaris', page: 'resource-library', title: res.title, subtitle: `${res.category ?? ''} · ${res.type ?? ''}`, data: res });
      }
    });

    // Fasilitas — roomBookings
    roomBookings.forEach(rb => {
      if (rb.bookedBy.toLowerCase().includes(lowerQuery) ||
          rb.purpose?.toLowerCase().includes(lowerQuery) ||
          rb.roomName?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'roomBooking', group: 'Fasilitas & Inventaris', page: 'room-booking', title: `${rb.roomName ?? 'Ruangan'}: ${rb.bookedBy}`, subtitle: `${rb.date ?? ''} · ${rb.status}`, data: rb });
      }
    });

    // Sakramen — baptisms
    baptisms.forEach(b => {
      if (b.memberName.toLowerCase().includes(lowerQuery) ||
          b.minister?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'baptism', group: 'Sakramen & Surat', page: 'sacraments', title: `Baptis: ${b.memberName}`, subtitle: `${b.type} · ${b.baptismDate}`, data: b });
      }
    });

    // Sakramen — sidis
    sidis.forEach(s => {
      if (s.memberName.toLowerCase().includes(lowerQuery) ||
          s.minister?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'sidi', group: 'Sakramen & Surat', page: 'sacraments', title: `Sidi: ${s.memberName}`, subtitle: s.sidiDate, data: s });
      }
    });

    // Sakramen — marriages
    marriages.forEach(m => {
      if (m.groomName.toLowerCase().includes(lowerQuery) ||
          m.brideName.toLowerCase().includes(lowerQuery) ||
          m.minister?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'marriage', group: 'Sakramen & Surat', page: 'sacraments', title: `Pernikahan: ${m.groomName} & ${m.brideName}`, subtitle: m.marriageDate, data: m });
      }
    });

    // Sakramen — attestations
    attestations.forEach(a => {
      if (a.memberName.toLowerCase().includes(lowerQuery) ||
          a.fromChurch?.toLowerCase().includes(lowerQuery) ||
          a.toChurch?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'attestation', group: 'Sakramen & Surat', page: 'attestations', title: `Atestasi: ${a.memberName}`, subtitle: `${a.type} · ${a.status}`, data: a });
      }
    });

    // Komisi & Pelayanan — ministries
    ministries.forEach(min => {
      if (min.name.toLowerCase().includes(lowerQuery) ||
          min.description?.toLowerCase().includes(lowerQuery) ||
          min.leader?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'ministry', group: 'Komisi & Pelayanan', page: 'ministries', title: min.name, subtitle: `Ketua: ${min.leader ?? '-'} · ${min.memberIds?.length ?? 0} anggota`, data: min });
      }
    });

    // Admin — users
    users.forEach(u => {
      if (u.fullName?.toLowerCase().includes(lowerQuery) ||
          u.username?.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'user', group: 'Admin Sistem', page: 'users', title: u.fullName ?? u.username, subtitle: `${u.role} · ${u.isActive ? 'Aktif' : 'Nonaktif'}`, data: u });
      }
    });

    return results;
  };

  return (
    <AppContext.Provider value={{
      dbReady,
      currentUser,
      login,
      logout,
      members,
      families,
      sectors,
      users,
      ministries,
      events,
      prayerRequests,
      attendance,
      activityLogs,
      notifications,
      announcements,
      financialRecords,
      financialCategories,
      ministrySchedules,
      theme,
      addMember,
      updateMember,
      deleteMember,
      addFamily,
      updateFamily,
      deleteFamily,
      addSector,
      updateSector,
      deleteSector,
      addUser,
      updateUser,
      deleteUser,
      addMinistry,
      updateMinistry,
      deleteMinistry,
      sectorTransfers,
      addSectorTransfer,
      updateSectorTransfer,
      deleteSectorTransfer,
      addEvent,
      updateEvent,
      deleteEvent,
      addPrayerRequest,
      updatePrayerRequest,
      addAttendance,
      addNotification,
      markNotificationRead,
      markAllNotificationsRead,
      deleteNotification,
      addAnnouncement,
      updateAnnouncement,
      deleteAnnouncement,
      addFinancialRecord,
      updateFinancialRecord,
      deleteFinancialRecord,
      addMinistrySchedule,
      updateMinistrySchedule,
      deleteMinistrySchedule,
      setTheme,
      logActivity,
      reloadData: loadAllData,
      globalSearch,
      can,

      // NEW: Modul 2 - Peribadahan & Kegiatan
      worshipSchedules,
      wartas,
      liturgies,
      addWorshipSchedule,
      updateWorshipSchedule,
      deleteWorshipSchedule,
      addWarta,
      updateWarta,
      deleteWarta,
      addLiturgy,
      updateLiturgy,
      deleteLiturgy,

      // NEW: Modul 3 - Keuangan & Persembahan
      offerings,
      buildingProjects,
      addOffering,
      updateOffering,
      deleteOffering,

      // NEW: Modul 4 - Pelayanan Kasih & Diakonia
      serviceRequests,
      aidDistributions,

      // NEW: Modul 5 - Komunikasi & Pembinaan
      resources,
      roomBookings,

      // NEW: Atestasi
      attestations,

      // NEW: Baptisan, Sidi, Perkawinan
      baptisms,
      sidis,
      marriages,

      // NEW: Baptism, Sidi, Marriage CRUD
      addBaptism,
      updateBaptism,
      deleteBaptism,
      addSidi,
      updateSidi,
      deleteSidi,
      addMarriage,
      updateMarriage,
      deleteMarriage,

      // ServiceRequest CRUD
      addServiceRequest,
      updateServiceRequest,
      deleteServiceRequest,

      // AidDistribution CRUD
      addAidDistribution,
      updateAidDistribution,
      deleteAidDistribution,

      // Resource CRUD
      addResource,
      updateResource,
      deleteResource,

      // RoomBooking CRUD
      addRoomBooking,
      updateRoomBooking,
      deleteRoomBooking,

      // BuildingProject CRUD
      addBuildingProject,
      updateBuildingProject,
      deleteBuildingProject,

      // FinancialCategory CRUD
      addFinancialCategory,
      updateFinancialCategory,
      deleteFinancialCategory,

      // Attestation CRUD
      addAttestation,
      updateAttestation,
      deleteAttestation,

      // PettyCash CRUD
      pettyCash,
      pcTopUps,
      addPettyCash,
      updatePettyCash,
      deletePettyCash,
      addPcTopUp,
      deletePcTopUp,

      // ChurchAsset CRUD
      churchAssets,
      assetMaintenances,
      assetLoanHistories,
      addChurchAsset,
      updateChurchAsset,
      deleteChurchAsset,
      addAssetMaintenance,
      addAssetLoanHistory,
      updateAssetLoanHistory,

      // BankAccount CRUD
      bankAccounts,
      addBankAccount,
      updateBankAccount,
      deleteBankAccount,

      // Budget CRUD
      budgets,
      addBudget,
      updateBudget,
      deleteBudget,

      // LivestreamLink CRUD
      livestreamLinks,
      addLivestreamLink,
      updateLivestreamLink,
      deleteLivestreamLink,

      // ReminderSetting CRUD
      reminderSettings,
      addReminderSetting,
      updateReminderSetting,
      deleteReminderSetting,

      // Liability CRUD
      liabilities,
      addLiability,
      updateLiability,
      deleteLiability,

      // FiscalYearSetting CRUD
      fiscalYearSettings,
      addFiscalYearSetting,
      updateFiscalYearSetting,
      deleteFiscalYearSetting,

      // Room CRUD
      rooms,
      addRoom,
      updateRoom,
      deleteRoom,

      // CustomRole CRUD
      customRoles,
      addCustomRole,
      updateCustomRole,
      deleteCustomRole,

      // BuiltinRoleOverride
      builtinRoleOverrides,
      upsertBuiltinRoleOverride,

      // Master Data
      masterDataItems,
      addMasterDataItem,
      updateMasterDataItem,
      deleteMasterDataItem,
      getMasterDataByCategory,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}