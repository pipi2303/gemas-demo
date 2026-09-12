import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { User, UserRole, CustomRole } from '../types';
import { PermissionKey, getPageGroups, getPagePermission } from '../../lib/permissions';
import { useDraggable } from '../../lib/useDraggable';
import {
  ShieldCheck, Check, X, Crown, Church, MapPin, Briefcase,
  Pencil, Plus, Trash2, UserCheck, KeyRound,
  AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown, Tag, Lock,
} from 'lucide-react';
import { useSortable } from '../../hooks/useSortable';
import { Card } from './ui/card';
import { toast } from 'sonner';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { ColResizeHandle } from './ui/resizable-th';

const ROLES_TABLE_DEFAULT_WIDTHS: Record<string, number> = {
  name: 220, username: 160, role: 160, isActive: 120, aksi: 130,
};

// ─── Types ────────────────────────────────────────────────────────────────────
type TabKey = 'kelola' | 'deskripsi';

type ModulePreset = 'none' | 'lihat' | 'kelola' | 'semua';

const PRESET_PERMS: Record<ModulePreset, PermissionKey[]> = {
  none:   [],
  lihat:  ['view'],
  kelola: ['view', 'create', 'edit', 'delete'],
  semua:  ['view', 'create', 'edit', 'delete', 'approve', 'export'],
};

function detectPreset(perms: PermissionKey[]): ModulePreset {
  if (perms.length === 0) return 'none';
  if (perms.length === 1 && perms[0] === 'view') return 'lihat';
  if (perms.length === 4 && ['view','create','edit','delete'].every(p => perms.includes(p as PermissionKey))) return 'kelola';
  if (perms.length === 6) return 'semua';
  return 'none';
}

// ─── Role Config ──────────────────────────────────────────────────────────────
const ROLE_CONFIG: Record<UserRole, {
  label: string; desc: string; tanggung: string;
  warna: string; bg: string; icon: React.ElementType;
}> = {
  Admin: {
    label: 'Admin',
    desc: 'Akses penuh ke seluruh sistem. Bertanggung jawab atas konfigurasi sistem, manajemen pengguna, integritas data, dan pengaturan hak akses seluruh gereja. Memiliki kontrol penuh terhadap semua modul termasuk Admin Sistem.',
    tanggung: 'Pendeta / Staff IT / Majelis Penuh',
    warna: '#dc2626', bg: 'rgba(220,38,38,0.08)', icon: Crown,
  },
  Majelis: {
    label: 'Majelis',
    desc: 'Akses ke hampir semua modul kecuali Admin Sistem. Dapat mengelola data jemaat, pelayanan, keuangan gereja, dan menyetujui proses administrasi penting seperti perpindahan jemaat dan sakramen.',
    tanggung: 'Anggota Majelis Jemaat',
    warna: '#144f6b', bg: 'rgba(20,79,107,0.08)', icon: Church,
  },
  'Ketua Sektor': {
    label: 'Ketua Sektor',
    desc: 'Akses terbatas ke data jemaat dan kegiatan sektor. Dapat mengelola aktivitas di sektornya, melihat laporan, serta melaporkan kebutuhan jemaat kepada Majelis.',
    tanggung: 'Ketua Sektor / Presbiter Wilayah',
    warna: '#7c3aed', bg: 'rgba(124,58,237,0.08)', icon: MapPin,
  },
  Operator: {
    label: 'Operator',
    desc: 'Akses operasional harian yang terbatas. Dapat melihat data jemaat dan jadwal ibadah untuk mendukung kegiatan administrasi rutin. Tidak memiliki akses ke keuangan atau administrasi sensitif.',
    tanggung: 'Staff Tata Usaha / Operator Gereja',
    warna: '#64748b', bg: 'rgba(100,116,139,0.08)', icon: Briefcase,
  },
};

const ROLES: UserRole[] = ['Admin', 'Majelis', 'Ketua Sektor', 'Operator'];

const ROLE_COLORS = [
  { value: '#144f6b', label: 'Biru'    },
  { value: '#7c3aed', label: 'Ungu'    },
  { value: '#16a34a', label: 'Hijau'   },
  { value: '#ea580c', label: 'Oranye'  },
  { value: '#e11d48', label: 'Merah'   },
  { value: '#0d9488', label: 'Teal'    },
];

const EMPTY_ROLE_FORM = { name: '', description: '', tanggung: '', warna: '#144f6b' };
const EMPTY_USER_FORM = { name: '', username: '', password: '', email: '', role: 'Operator' as UserRole };

// ─── SortTh ──────────────────────────────────────────────────────────────────
function SortTh({ label, sortK, active, dir, onSort, className = '', style, resizeHandle }: {
  label: string; sortK: string; active: boolean; dir: 'asc' | 'desc';
  onSort: (k: string) => void; className?: string; style?: React.CSSProperties; resizeHandle?: React.ReactNode;
}) {
  return (
    <th
      onClick={() => onSort(sortK)}
      style={style}
      className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:bg-gray-100 ${className}`}>
      <div className="flex items-center gap-1">
        {label}
        {active
          ? (dir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#144f6b]" /> : <ArrowDown className="w-3 h-3 text-[#144f6b]" />)
          : <ArrowUpDown className="w-3 h-3 text-[#c2baaa]" />}
      </div>
      {resizeHandle}
    </th>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function RolesManagement() {
  const { users, currentUser, addUser, updateUser, deleteUser,
    customRoles, addCustomRole, updateCustomRole, deleteCustomRole,
    builtinRoleOverrides, upsertBuiltinRoleOverride,
  } = useApp();
  const [activeTab, setActiveTab] = useState<TabKey>('kelola');

  // Derive builtInOverrides map dari context array
  const builtInOverrides = useMemo(() => {
    const map: Partial<Record<UserRole, { desc: string; tanggung: string; warna: string }>> = {};
    (builtinRoleOverrides || []).forEach(o => {
      map[o.role as UserRole] = { desc: o.desc, tanggung: o.tanggung, warna: o.warna };
    });
    return map;
  }, [builtinRoleOverrides]);
  const { offset: offsetRole, onMouseDown: onMouseDownRole } = useDraggable();
  const { offset: offsetAddUser, onMouseDown: onMouseDownAddUser } = useDraggable();
  const { offset: offsetEditUser, onMouseDown: onMouseDownEditUser } = useDraggable();
  const { offset: offsetResetPw, onMouseDown: onMouseDownResetPw } = useDraggable();
  const { offset: offsetDeleteConfirmUser, onMouseDown: onMouseDownDeleteConfirmUser } = useDraggable();

  const [showRoleModal, setShowRoleModal]       = useState(false);
  const [roleModalMode, setRoleModalMode]       = useState<'add' | 'edit'>('add');
  const [editRoleId, setEditRoleId]             = useState('');
  const [editingBuiltIn, setEditingBuiltIn]     = useState(false);
  const [roleForm, setRoleForm]                 = useState(EMPTY_ROLE_FORM);
  const [roleFormError, setRoleFormError]       = useState('');
  const [roleModulePerms, setRoleModulePerms]   = useState<Record<string, PermissionKey[]>>({});

  const allRoleNames: string[] = [...ROLES, ...customRoles.map(r => r.name)];
  // Daftar submenu dikelompokkan per modul — dipakai tabel "Hak Akses per Modul".
  const pageGroups = useMemo(() => getPageGroups(), []);

  // ── User CRUD ──
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [addUserForm, setAddUserForm]           = useState(EMPTY_USER_FORM);

  const [addUserError, setAddUserError]         = useState('');
  const [editUserTarget, setEditUserTarget]     = useState<User | null>(null);
  const [editUserForm, setEditUserForm]         = useState({ name: '', username: '', email: '', role: 'Operator' as UserRole });
  const [editUserError, setEditUserError]       = useState('');
  const [deleteConfirm, setDeleteConfirm]       = useState<string | null>(null);
  const [resetPwConfirm, setResetPwConfirm]     = useState<string | null>(null);
  const [newPassword, setNewPassword]           = useState('');
  const [filterRole, setFilterRole]             = useState<UserRole | 'all'>('all');

  const countByRole = (role: UserRole) => users.filter(u => u.role === role).length;
  const filteredUsers = filterRole === 'all' ? users : users.filter(u => u.role === filterRole);
  const { sorted: sortedUsers, sortKey: uSortKey, sortDir: uSortDir, requestSort: uReqSort } = useSortable(filteredUsers);
  const { widths: colW, startResize } = useResizableColumns('roles-management-main', ROLES_TABLE_DEFAULT_WIDTHS);
  // ── Role handlers ──
  const openAddRole = () => {
    setRoleModalMode('add');
    setEditingBuiltIn(false);
    setRoleForm(EMPTY_ROLE_FORM);
    setRoleModulePerms({});
    setRoleFormError('');
    setShowRoleModal(true);
  };
  const openEditBuiltIn = (role: UserRole) => {
    const cfg = ROLE_CONFIG[role];
    const ov = builtInOverrides[role];
    setRoleModalMode('edit');
    setEditingBuiltIn(true);
    setEditRoleId(role);
    setRoleForm({ name: cfg.label, description: ov?.desc ?? cfg.desc, tanggung: ov?.tanggung ?? cfg.tanggung, warna: ov?.warna ?? cfg.warna });
    setRoleModulePerms({});
    setRoleFormError('');
    setShowRoleModal(true);
  };
  const openEditRole = (role: CustomRole) => {
    setRoleModalMode('edit');
    setEditingBuiltIn(false);
    setEditRoleId(role.id);
    setRoleForm({ name: role.name, description: role.description, tanggung: role.tanggung, warna: role.warna });
    // Expand ke page-keyed penuh — kalau role ini masih format lama (kunci nama
    // modul), getPagePermission jatuh-balik ke izin modul induknya per submenu,
    // supaya editor menampilkan hak akses yang benar & role lama tidak terlihat
    // seperti kehilangan akses begitu dibuka.
    const expanded: Record<string, PermissionKey[]> = {};
    for (const group of pageGroups) {
      for (const p of group.pages) {
        expanded[p.key] = getPagePermission(role.modulePermissions, p.key);
      }
    }
    setRoleModulePerms(expanded);
    setRoleFormError('');
    setShowRoleModal(true);
  };
  const handleSaveRole = () => {
    setRoleFormError('');
    const name = roleForm.name.trim();
    if (!name) { setRoleFormError('Nama role wajib diisi.'); return; }

    if (editingBuiltIn) {
      upsertBuiltinRoleOverride({
        id: editRoleId, role: editRoleId,
        desc: roleForm.description.trim(), tanggung: roleForm.tanggung.trim(), warna: roleForm.warna,
      });
      setShowRoleModal(false);
      toast.success(`Role "${name}" diperbarui`);
      return;
    }

    if (roleModalMode === 'edit') {
      const currentName = customRoles.find(r => r.id === editRoleId)?.name ?? '';
      const others = allRoleNames.filter(n => n !== currentName).map(n => n.toLowerCase());
      if (others.includes(name.toLowerCase())) { setRoleFormError('Nama role sudah ada.'); return; }
      updateCustomRole(editRoleId, {
        name, description: roleForm.description.trim(), tanggung: roleForm.tanggung.trim(),
        warna: roleForm.warna, modulePermissions: roleModulePerms as Record<string, string[]>,
      });
    } else {
      if (allRoleNames.map(n => n.toLowerCase()).includes(name.toLowerCase())) {
        setRoleFormError('Nama role sudah ada.'); return;
      }
      addCustomRole({
        name, description: roleForm.description.trim(), tanggung: roleForm.tanggung.trim(),
        warna: roleForm.warna, modulePermissions: roleModulePerms as Record<string, string[]>,
      });
    }
    setShowRoleModal(false);
    toast.success(roleModalMode === 'edit' ? `Role "${name}" diperbarui` : `Role "${name}" ditambahkan`);
  };
  const handleDeleteCustomRole = (id: string) => {
    deleteCustomRole(id);
    toast.success('Role dihapus');
  };

  // ── User handlers ──
  const handleAddUser = () => {
    setAddUserError('');
    if (!addUserForm.name.trim() || !addUserForm.username.trim() || !addUserForm.password.trim()) {
      setAddUserError('Nama, username, dan password wajib diisi.'); return;
    }
    if (users.find(u => u.username === addUserForm.username.trim())) {
      setAddUserError('Username sudah digunakan.'); return;
    }
    if (addUserForm.password.length < 6) {
      setAddUserError('Password minimal 6 karakter.'); return;
    }
    if (addUserForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addUserForm.email.trim())) {
      setAddUserError('Format email tidak valid.'); return;
    }
    addUser({ name: addUserForm.name.trim(), username: addUserForm.username.trim(), password: addUserForm.password, role: addUserForm.role, email: addUserForm.email.trim(), isActive: true });
    setAddUserForm(EMPTY_USER_FORM);
    setShowAddUserModal(false);
    toast.success(`Pengguna ${addUserForm.name} berhasil ditambahkan`);
  };
  const openEditUser = (u: User) => {
    setEditUserTarget(u);
    setEditUserForm({ name: u.name, username: u.username, email: u.email ?? '', role: u.role });
    setEditUserError('');
  };
  const handleSaveEditUser = () => {
    if (!editUserTarget) return;
    setEditUserError('');
    if (!editUserForm.name.trim() || !editUserForm.username.trim()) {
      setEditUserError('Nama dan username wajib diisi.'); return;
    }
    if (users.find(u => u.username === editUserForm.username.trim() && u.id !== editUserTarget.id)) {
      setEditUserError('Username sudah digunakan.'); return;
    }
    updateUser(editUserTarget.id, {
      name: editUserForm.name.trim(),
      username: editUserForm.username.trim(),
      email: editUserForm.email.trim(),
      role: editUserForm.role,
    });
    setEditUserTarget(null);
    toast.success('Data pengguna diperbarui');
  };
  const handleRoleChange = (userId: string, role: UserRole) => {
    updateUser(userId, { role });
    toast.success('Role pengguna diperbarui');
  };
  const handleToggleActive = (userId: string, isActive: boolean) => {
    updateUser(userId, { isActive: !isActive });
    toast.success(isActive ? 'Pengguna dinonaktifkan' : 'Pengguna diaktifkan');
  };
  const handleDelete = (userId: string) => {
    deleteUser(userId);
    setDeleteConfirm(null);
    toast.success('Pengguna dihapus');
  };
  const handleResetPassword = (userId: string) => {
    if (!newPassword || newPassword.length < 6) { toast.error('Password minimal 6 karakter'); return; }
    updateUser(userId, { password: newPassword });
    setResetPwConfirm(null);
    setNewPassword('');
    toast.success('Password berhasil diubah');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Manajemen Roles</h2>
          <p className="text-sm text-gray-500 mt-1">Hak akses, pengguna, dan tanggung jawab setiap role</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ background: '#f0f7fb', border: '1px solid #b8d5e8' }}>
            <ShieldCheck className="w-4 h-4 text-[#144f6b]" />
            <span className="text-sm font-medium text-[#144f6b]">{allRoleNames.length} Roles · {users.length} Pengguna</span>
          </div>
          {activeTab === 'kelola' && (
            <button onMouseDown={e=>e.preventDefault()} onClick={() => { setAddUserForm(EMPTY_USER_FORM); setAddUserError(''); setShowAddUserModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: '#144f6b', color: '#fff' }}>
              <Plus className="w-4 h-4" /> Tambah Pengguna
            </button>
          )}
          {activeTab === 'deskripsi' && (
            <button onClick={openAddRole}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: '#144f6b', color: '#fff' }}>
              <Plus className="w-4 h-4" /> Tambah Role
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: '#f1f5f9' }}>
        {([['kelola', 'Kelola Pengguna'], ['deskripsi', 'Deskripsi Role']] as [TabKey, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className="px-4 py-2 rounded-md text-sm font-medium transition-all"
            style={activeTab === key
              ? { background: '#FFEFB2', color: '#384959', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
              : { background: 'transparent', color: '#64748b' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ══ TAB: Kelola Pengguna ══════════════════════════════════════════════ */}
      {activeTab === 'kelola' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500">Filter:</span>
            {(['all', ...ROLES] as (UserRole | 'all')[]).map(r => (
              <button key={r} onClick={() => setFilterRole(r)}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                style={filterRole === r
                  ? { background: '#144f6b', color: '#fff' }
                  : { background: '#f1f5f9', color: '#64748b' }}>
                {r === 'all' ? `Semua (${users.length})` : `${r} (${countByRole(r as UserRole)})`}
              </button>
            ))}
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" style={{tableLayout:'fixed'}}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <SortTh label="Nama"     sortK="name"     active={uSortKey==='name'}     dir={uSortDir} onSort={uReqSort} className="px-5" style={{width:colW.name,position:'relative'}} resizeHandle={<ColResizeHandle onMouseDown={startResize('name')} />} />
                    <SortTh label="Username" sortK="username" active={uSortKey==='username'} dir={uSortDir} onSort={uReqSort} style={{width:colW.username,position:'relative'}} resizeHandle={<ColResizeHandle onMouseDown={startResize('username')} />} />
                    <SortTh label="Role"     sortK="role"     active={uSortKey==='role'}     dir={uSortDir} onSort={uReqSort} style={{width:colW.role,position:'relative'}} resizeHandle={<ColResizeHandle onMouseDown={startResize('role')} />} />
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:bg-gray-100"
                      style={{width:colW.isActive,position:'relative'}}
                      onClick={() => uReqSort('isActive')}>
                      <div className="flex items-center justify-center gap-1">
                        Status
                        {uSortKey === 'isActive' ? (uSortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#144f6b]" /> : <ArrowDown className="w-3 h-3 text-[#144f6b]" />) : <ArrowUpDown className="w-3 h-3 text-[#c2baaa]" />}
                      </div>
                      <ColResizeHandle onMouseDown={startResize('isActive')} />
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{width:colW.aksi,position:'relative'}}>
                      Aksi
                      <ColResizeHandle onMouseDown={startResize('aksi')} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400 text-sm">Tidak ada pengguna</td></tr>
                  ) : sortedUsers.map((u, i) => {
                    const cfg = ROLE_CONFIG[u.role as UserRole] ?? { warna: '#64748b', bg: 'rgba(100,116,139,0.08)' };
                    const isSelf = currentUser?.id === u.id;
                    return (
                      <tr key={u.id}
                        style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc', borderBottom: '1px solid #f1f5f9' }}
                        className="hover:bg-[#f0f7fb] transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                              style={{ background: cfg.bg, color: cfg.warna }}>
                              {u.name?.charAt(0) ?? '?'}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{u.name}</p>
                              {isSelf && <span className="text-[10px] text-[#144f6b] font-medium">(Anda)</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono">{u.username}</td>
                        <td className="px-4 py-3">
                          {isSelf ? (
                            <span className="text-xs px-2 py-1 rounded-full font-semibold"
                              style={{ background: cfg.bg, color: cfg.warna }}>{u.role}</span>
                          ) : (
                            <select value={u.role}
                              onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                              className="text-xs px-2 py-1 rounded-md border font-medium focus:outline-none focus:ring-2"
                              style={{ borderColor: cfg.warna + '44', color: cfg.warna, background: cfg.bg }}>
                              {allRoleNames.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => !isSelf && handleToggleActive(u.id, u.isActive)}
                            disabled={isSelf}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all"
                            style={{
                              background: u.isActive ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.1)',
                              color: u.isActive ? '#16a34a' : '#ef4444',
                              cursor: isSelf ? 'not-allowed' : 'pointer',
                              opacity: isSelf ? 0.5 : 1,
                            }}>
                            {u.isActive ? <><Check className="w-3 h-3" />Aktif</> : <><X className="w-3 h-3" />Nonaktif</>}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEditUser(u as User)} data-tooltip="Edit Pengguna"
                              className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-blue-50"
                              style={{ color: '#144f6b' }}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => { setResetPwConfirm(u.id); setNewPassword(''); }} data-tooltip="Ubah Password"
                              className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-blue-50"
                              style={{ color: '#64748b' }}>
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                            {!isSelf && (
                              <button onClick={() => setDeleteConfirm(u.id)} data-tooltip="Hapus Pengguna"
                                className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-red-50"
                                style={{ color: '#ef4444' }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ══ TAB: Deskripsi Role ════════════════════════════════════════════════ */}
      {activeTab === 'deskripsi' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Built-in roles */}
          {ROLES.map(role => {
            const cfg = ROLE_CONFIG[role];
            const ov = builtInOverrides[role];
            const Icon = cfg.icon;
            const warna = ov?.warna ?? cfg.warna;
            const bg = warna + '14';
            const desc = ov?.desc ?? cfg.desc;
            const tanggung = ov?.tanggung ?? cfg.tanggung;
            const roleUsers = users.filter(u => u.role === role);
            return (
              <Card key={role} className="p-6" style={{ border: `1px solid ${warna}30` }}>
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: bg }}>
                    <Icon className="w-5 h-5" style={{ color: warna }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="font-semibold text-gray-900">{cfg.label}</h3>
                        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                          style={{ background: '#f1f5f9', color: '#64748b' }}>
                          <Lock className="w-2.5 h-2.5" /> Bawaan
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openEditBuiltIn(role)} data-tooltip="Edit Role"
                          className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-blue-50"
                          style={{ color: '#144f6b' }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => toast.error('Role bawaan sistem tidak dapat dihapus')} data-tooltip="Hapus Role"
                          className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-red-50"
                          style={{ color: '#ef4444' }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{tanggung}</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">{desc}</p>
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">Pengguna ({roleUsers.length})</p>
                  {roleUsers.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Belum ada pengguna</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {roleUsers.map(u => (
                        <div key={u.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                          style={{ background: bg }}>
                          <div className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                            style={{ background: warna, color: '#fff' }}>
                            {u.name?.charAt(0) ?? '?'}
                          </div>
                          <span className="text-xs font-medium" style={{ color: warna }}>{u.name}</span>
                          <span className="text-[10px]" style={{ color: u.isActive ? '#16a34a' : '#ef4444' }}>
                            {u.isActive ? '●' : '○'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}

          {/* Custom roles */}
          {customRoles.map(role => {
            const roleUsers = users.filter(u => u.role === role.name);
            const bg = role.warna + '14';
            return (
              <Card key={role.id} className="p-6" style={{ border: `1px solid ${role.warna}30` }}>
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: bg }}>
                    <Tag className="w-5 h-5" style={{ color: role.warna }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-gray-900">{role.name}</h3>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openEditRole(role)} data-tooltip="Edit Role"
                          className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-blue-50"
                          style={{ color: '#144f6b' }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteCustomRole(role.id)} data-tooltip="Hapus Role"
                          className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-red-50"
                          style={{ color: '#ef4444' }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {role.tanggung && <p className="text-xs text-gray-500 mt-0.5">{role.tanggung}</p>}
                  </div>
                </div>
                {role.description && (
                  <p className="text-sm text-gray-600 leading-relaxed mb-4">{role.description}</p>
                )}
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">Pengguna ({roleUsers.length})</p>
                  {roleUsers.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Belum ada pengguna</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {roleUsers.map(u => (
                        <div key={u.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                          style={{ background: bg }}>
                          <div className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                            style={{ background: role.warna, color: '#fff' }}>
                            {u.name?.charAt(0) ?? '?'}
                          </div>
                          <span className="text-xs font-medium" style={{ color: role.warna }}>{u.name}</span>
                          <span className="text-[10px]" style={{ color: u.isActive ? '#16a34a' : '#ef4444' }}>
                            {u.isActive ? '●' : '○'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODALS
      ════════════════════════════════════════════════════════════════════ */}

      {/* ── Modal: Tambah / Edit Role ── */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={e => e.target === e.currentTarget && setShowRoleModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" style={{ transform: `translate(${offsetRole.x}px, ${offsetRole.y}px)` }}>
            <div className="flex items-center justify-between mb-5" onMouseDown={onMouseDownRole} style={{ cursor: 'move' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#f0f7fb' }}>
                  {roleModalMode === 'edit' ? <Pencil className="w-5 h-5 text-[#144f6b]" /> : <Tag className="w-5 h-5 text-[#144f6b]" />}
                </div>
                <h3 className="font-semibold text-gray-900">
                  {roleModalMode === 'edit' ? 'Edit Role' : 'Tambah Role Baru'}
                </h3>
              </div>
              <button onClick={() => setShowRoleModal(false)} data-tooltip="Tutup" className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Role {!editingBuiltIn && <span className="text-red-500">*</span>}
                </label>
                <div className="relative">
                  <input type="text" value={roleForm.name}
                    autoFocus={!editingBuiltIn}
                    readOnly={editingBuiltIn}
                    onChange={e => !editingBuiltIn && setRoleForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Contoh: Diaken, Pemuda, Bendahara"
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                    style={{ borderColor: '#e2e8f0', background: editingBuiltIn ? '#f8fafc' : undefined, color: editingBuiltIn ? '#64748b' : undefined }} />
                  {editingBuiltIn && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-gray-400">
                      <Lock className="w-3 h-3" /> Terkunci
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                <textarea value={roleForm.description} rows={2}
                  onChange={e => setRoleForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Hak akses dan tanggung jawab role ini..."
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b] resize-none"
                  style={{ borderColor: '#e2e8f0' }} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Penanggungjawab</label>
                <input type="text" value={roleForm.tanggung}
                  onChange={e => setRoleForm(prev => ({ ...prev, tanggung: e.target.value }))}
                  placeholder="Contoh: Komisi Diakonia / Tim Pelayanan"
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                  style={{ borderColor: '#e2e8f0' }} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Warna Role</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {ROLE_COLORS.map(c => (
                    <button key={c.value} type="button" onClick={() => setRoleForm(prev => ({ ...prev, warna: c.value }))} title={c.label}
                      className="w-8 h-8 rounded-lg transition-all"
                      style={{
                        background: c.value,
                        outline: roleForm.warna === c.value ? `3px solid ${c.value}` : 'none',
                        outlineOffset: '2px',
                        transform: roleForm.warna === c.value ? 'scale(1.15)' : 'scale(1)',
                      }} />
                  ))}
                </div>
              </div>

              {/* Hak Akses per Modul — hanya untuk custom role, granular sampai level submenu */}
              {!editingBuiltIn && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hak Akses per Modul</label>
                <p className="text-xs text-gray-400 mb-2">Pilih level akses untuk setiap submenu. Default: tidak ada akses.</p>
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
                  {/* Header */}
                  <div className="flex items-center px-3 py-1.5 sticky top-0 z-10" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <span className="flex-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">Modul / Submenu</span>
                    {(['none','lihat','kelola','semua'] as ModulePreset[]).map(p => (
                      <span key={p} className="w-16 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                        {p === 'none' ? '—' : p.charAt(0).toUpperCase() + p.slice(1)}
                      </span>
                    ))}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {pageGroups.map(group => (
                      <div key={group.module}>
                        <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                          <span className="text-sm">{group.emoji}</span>
                          <span className="text-[11px] font-semibold text-gray-500 truncate uppercase tracking-wide">{group.module}</span>
                        </div>
                        {group.pages.map((page, idx) => {
                          const perms = roleModulePerms[page.key] ?? [];
                          const active = detectPreset(perms);
                          const PRESET_STYLES: Record<ModulePreset, { sel: string; unsel: string }> = {
                            none:   { sel: '#94a3b8', unsel: '#cbd5e1' },
                            lihat:  { sel: '#144f6b', unsel: '#cbd5e1' },
                            kelola: { sel: '#16a34a', unsel: '#cbd5e1' },
                            semua:  { sel: '#7c3aed', unsel: '#cbd5e1' },
                          };
                          return (
                            <div key={page.key}
                              className="flex items-center px-3 py-2 pl-7"
                              style={{ borderBottom: idx < group.pages.length - 1 ? '1px solid #f1f5f9' : 'none', background: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                              <div className="flex-1 flex items-center gap-2 min-w-0">
                                <span className="text-sm text-gray-700 truncate">{page.label}</span>
                              </div>
                              {(['none','lihat','kelola','semua'] as ModulePreset[]).map(preset => {
                                const isActive = active === preset;
                                const color = PRESET_STYLES[preset];
                                return (
                                  <button key={preset} type="button"
                                    onClick={() => setRoleModulePerms(prev => ({ ...prev, [page.key]: PRESET_PERMS[preset] }))}
                                    className="w-16 flex items-center justify-center py-1 transition-all"
                                    title={preset === 'none' ? 'Tidak ada akses' : preset === 'lihat' ? 'Lihat saja' : preset === 'kelola' ? 'Lihat + Tambah + Edit + Hapus' : 'Semua hak akses'}>
                                    <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all"
                                      style={{ borderColor: isActive ? color.sel : color.unsel, background: isActive ? color.sel : 'transparent' }}>
                                      {isActive && <Check className="w-2.5 h-2.5 text-white" />}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              )}

              {roleFormError && (
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)' }}>
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-600">{roleFormError}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowRoleModal(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium border"
                style={{ border: '1px solid #e2e8f0', color: '#64748b' }}>
                Batal
              </button>
              <button onClick={handleSaveRole}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#144f6b', color: '#fff' }}>
                {roleModalMode === 'edit' ? 'Simpan Perubahan' : 'Tambah Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Tambah Pengguna ── */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={e => e.target === e.currentTarget && setShowAddUserModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ transform: `translate(${offsetAddUser.x}px, ${offsetAddUser.y}px)` }}>
            <div className="flex items-center justify-between mb-5" onMouseDown={onMouseDownAddUser} style={{ cursor: 'move' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#f0f7fb' }}>
                  <UserCheck className="w-5 h-5 text-[#144f6b]" />
                </div>
                <h3 className="font-semibold text-gray-900">Tambah Pengguna Baru</h3>
              </div>
              <button onClick={() => setShowAddUserModal(false)} data-tooltip="Tutup" className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {[
                { label: 'Nama Lengkap', key: 'name',     type: 'text',     placeholder: 'Contoh: Budi Santoso'    },
                { label: 'Username',     key: 'username', type: 'text',     placeholder: 'Contoh: budi.santoso'   },
                { label: 'Email',        key: 'email',    type: 'email',    placeholder: 'email@contoh.com'       },
                { label: 'Password',     key: 'password', type: 'password', placeholder: 'Min. 6 karakter'        },
              ].map((f, fi) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <input type={f.type} value={(addUserForm as any)[f.key]}
                    onChange={e => setAddUserForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    autoFocus={fi === 0}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                    style={{ borderColor: '#e2e8f0' }} />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select value={addUserForm.role}
                  onChange={e => setAddUserForm(prev => ({ ...prev, role: e.target.value as UserRole }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                  style={{ borderColor: '#e2e8f0' }}>
                  {allRoleNames.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {addUserError && (
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)' }}>
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-600">{addUserError}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowAddUserModal(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium border"
                style={{ border: '1px solid #e2e8f0', color: '#64748b' }}>
                Batal
              </button>
              <button onClick={handleAddUser}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#144f6b', color: '#fff' }}>
                Tambah Pengguna
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Edit Pengguna ── */}
      {editUserTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={e => e.target === e.currentTarget && setEditUserTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ transform: `translate(${offsetEditUser.x}px, ${offsetEditUser.y}px)` }}>
            <div className="flex items-center justify-between mb-5" onMouseDown={onMouseDownEditUser} style={{ cursor: 'move' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#f0f7fb' }}>
                  <Pencil className="w-5 h-5 text-[#144f6b]" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Edit Pengguna</h3>
                  <p className="text-xs text-gray-500">@{editUserTarget.username}</p>
                </div>
              </div>
              <button onClick={() => setEditUserTarget(null)} data-tooltip="Tutup" className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {[
                { label: 'Nama Lengkap', key: 'name',     type: 'text',  placeholder: 'Nama lengkap'      },
                { label: 'Username',     key: 'username', type: 'text',  placeholder: 'Username login'    },
                { label: 'Email',        key: 'email',    type: 'email', placeholder: 'email@contoh.com' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <input type={f.type} value={(editUserForm as any)[f.key]}
                    onChange={e => setEditUserForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                    style={{ borderColor: '#e2e8f0' }} />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select value={editUserForm.role}
                  onChange={e => setEditUserForm(prev => ({ ...prev, role: e.target.value as UserRole }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b]"
                  style={{ borderColor: '#e2e8f0' }}>
                  {allRoleNames.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg text-xs text-gray-500"
                style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                <KeyRound className="w-3.5 h-3.5 flex-shrink-0" />
                Untuk mengubah password, gunakan tombol kunci di tabel pengguna.
              </div>
              {editUserError && (
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)' }}>
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-600">{editUserError}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditUserTarget(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium border"
                style={{ border: '1px solid #e2e8f0', color: '#64748b' }}>
                Batal
              </button>
              <button onClick={handleSaveEditUser}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#144f6b', color: '#fff' }}>
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Reset Password ── */}
      {resetPwConfirm && (() => {
        const u = users.find(x => x.id === resetPwConfirm);
        return u ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={e => e.target === e.currentTarget && setResetPwConfirm(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ transform: `translate(${offsetResetPw.x}px, ${offsetResetPw.y}px)` }}>
              <div className="flex items-center gap-3 mb-4" onMouseDown={onMouseDownResetPw} style={{ cursor: 'move' }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#f0f7fb' }}>
                  <KeyRound className="w-5 h-5 text-[#144f6b]" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Ubah Password</h3>
                  <p className="text-xs text-gray-500">{u.name} (@{u.username})</p>
                </div>
              </div>
              <input type="password" value={newPassword} autoFocus
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Password baru (min. 6 karakter)"
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#144f6b] mb-4"
                style={{ borderColor: '#e2e8f0' }} />
              <div className="flex gap-3">
                <button onClick={() => setResetPwConfirm(null)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium border"
                  style={{ border: '1px solid #e2e8f0', color: '#64748b' }}>
                  Batal
                </button>
                <button onClick={() => handleResetPassword(resetPwConfirm)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium"
                  style={{ background: '#144f6b', color: '#fff' }}>
                  Simpan
                </button>
              </div>
            </div>
          </div>
        ) : null;
      })()}

      {/* ── Modal: Konfirmasi Hapus Pengguna ── */}
      {deleteConfirm && (() => {
        const u = users.find(x => x.id === deleteConfirm);
        return u ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ transform: `translate(${offsetDeleteConfirmUser.x}px, ${offsetDeleteConfirmUser.y}px)` }}>
              <div className="flex items-center gap-3 mb-4" onMouseDown={onMouseDownDeleteConfirmUser} style={{ cursor: 'move' }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.08)' }}>
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Hapus Pengguna?</h3>
                  <p className="text-xs text-gray-500">{u.name} (@{u.username})</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-5">Tindakan ini tidak dapat dibatalkan. Pengguna akan dihapus dari sistem.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium border"
                  style={{ border: '1px solid #e2e8f0', color: '#64748b' }}>
                  Batal
                </button>
                <button onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium"
                  style={{ background: '#ef4444', color: '#fff' }}>
                  Ya, Hapus
                </button>
              </div>
            </div>
          </div>
        ) : null;
      })()}

    </div>
  );
}
