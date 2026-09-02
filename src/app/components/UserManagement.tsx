import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from './ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { UserCog, Plus, Pencil, Shield, Key, ArrowUp, ArrowDown, ArrowUpDown, Copy, Check as CheckIcon } from 'lucide-react';
import { User, UserRole } from '../types';
import { useSortable } from '../../hooks/useSortable';
import { toast } from 'sonner';

export function UserManagement() {
  const { users, addUser, updateUser, currentUser, customRoles } = useApp();
  const { sorted: sortedUsers, sortKey, sortDir, requestSort } = useSortable(users);
  const allRoleNames: string[] = ['Admin', 'Majelis', 'Ketua Sektor', 'Operator', ...customRoles.map(r => r.name)];
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    username: '',
    password: '',
    role: 'Operator' as UserRole,
    isActive: true
  });

  const openAddForm = () => {
    setFormMode('add');
    setFormData({
      name: '',
      email: '',
      username: '',
      password: '',
      role: 'Operator',
      isActive: true
    });
    setIsFormOpen(true);
  };

  const openEditForm = (user: User) => {
    setFormMode('edit');
    setFormData({
      name: user.name,
      email: user.email,
      username: user.username,
      password: '',
      role: user.role,
      isActive: user.isActive
    });
    setSelectedUser(user);
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formMode === 'add') {
      addUser(formData);
      toast.success(`Pengguna ${formData.name} berhasil ditambahkan`);
    } else if (selectedUser) {
      const updateData: Partial<User> = {
        name: formData.name,
        email: formData.email,
        username: formData.username,
        role: formData.role,
        isActive: formData.isActive
      };
      
      if (formData.password) {
        updateData.password = formData.password;
      }

        updateUser(selectedUser.id, updateData);
      toast.success('Data pengguna berhasil diperbarui');
    }

    setIsFormOpen(false);
  };

  const handleResetPassword = () => {
    if (resetPasswordUser) {
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      const tempPassword = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      updateUser(resetPasswordUser.id, { password: tempPassword });
      setResetPasswordUser(null);
      setGeneratedPassword(tempPassword);
      setCopied(false);
    }
  };

  const handleCopyPassword = () => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getRoleBadgeProps = (role: UserRole): { className: string; style?: React.CSSProperties } => {
    const builtInColors: Record<string, string> = {
      Admin: 'bg-red-100 text-red-700',
      Majelis: 'bg-[#f0ede5] text-[#3a7fa0]',
      'Ketua Sektor': 'bg-[#f0ede5] text-[#144f6b]',
      Operator: 'bg-gray-100 text-gray-700'
    };
    if (builtInColors[role]) return { className: builtInColors[role] };
    const custom = customRoles.find(r => r.name === role);
    if (custom) return { className: '', style: { backgroundColor: `${custom.warna}1a`, color: custom.warna } };
    return { className: 'bg-gray-100 text-gray-700' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Manajemen Pengguna</h2>
          <p className="text-sm text-gray-600 mt-1">
            Total {users.length} pengguna terdaftar
          </p>
        </div>
        {currentUser?.role === 'Admin' && (
          <Button onClick={openAddForm} className="gap-2 bg-[#144f6b] hover:bg-[#0f2d41]">
            <Plus className="w-4 h-4" />
            Tambah Pengguna
          </Button>
        )}
      </div>

      {/* Users Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none hover:bg-gray-50" onClick={() => requestSort('name')}>
                <div className="flex items-center gap-1">
                  Nama
                  {sortKey === 'name'
                    ? (sortDir === 'asc' ? <ArrowUp className="h-4 w-4 text-[#1A77A3]" /> : <ArrowDown className="h-4 w-4 text-[#1A77A3]" />)
                    : <ArrowUpDown className="h-4 w-4 text-gray-400" />}
                </div>
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-gray-50" onClick={() => requestSort('username')}>
                <div className="flex items-center gap-1">
                  Username
                  {sortKey === 'username'
                    ? (sortDir === 'asc' ? <ArrowUp className="h-4 w-4 text-[#1A77A3]" /> : <ArrowDown className="h-4 w-4 text-[#1A77A3]" />)
                    : <ArrowUpDown className="h-4 w-4 text-gray-400" />}
                </div>
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-gray-50" onClick={() => requestSort('email')}>
                <div className="flex items-center gap-1">
                  Email
                  {sortKey === 'email'
                    ? (sortDir === 'asc' ? <ArrowUp className="h-4 w-4 text-[#1A77A3]" /> : <ArrowDown className="h-4 w-4 text-[#1A77A3]" />)
                    : <ArrowUpDown className="h-4 w-4 text-gray-400" />}
                </div>
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-gray-50" onClick={() => requestSort('role')}>
                <div className="flex items-center gap-1">
                  Role
                  {sortKey === 'role'
                    ? (sortDir === 'asc' ? <ArrowUp className="h-4 w-4 text-[#1A77A3]" /> : <ArrowDown className="h-4 w-4 text-[#1A77A3]" />)
                    : <ArrowUpDown className="h-4 w-4 text-gray-400" />}
                </div>
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-gray-50" onClick={() => requestSort('isActive')}>
                <div className="flex items-center gap-1">
                  Status
                  {sortKey === 'isActive'
                    ? (sortDir === 'asc' ? <ArrowUp className="h-4 w-4 text-[#1A77A3]" /> : <ArrowDown className="h-4 w-4 text-[#1A77A3]" />)
                    : <ArrowUpDown className="h-4 w-4 text-gray-400" />}
                </div>
              </TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[#f0ede5] rounded-full flex items-center justify-center">
                      <span className="text-[#144f6b] text-xs font-semibold">
                        {user.name.charAt(0)}
                      </span>
                    </div>
                    <span className="font-medium">{user.name}</span>
                  </div>
                </TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Badge {...getRoleBadgeProps(user.role)}>
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={user.isActive ? 'default' : 'secondary'}>
                    {user.isActive ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {currentUser?.role === 'Admin' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditForm(user)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setResetPasswordUser(user)}
                        >
                          <Key className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-[90vw] w-[900px] max-h-[90vh] overflow-y-auto bg-gray-50">
          <DialogHeader className="pb-2 border-b border-gray-200">
            <DialogTitle className="text-xl text-gray-800">
              {formMode === 'add' ? 'Tambah Pengguna Baru' : 'Edit Pengguna'}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              {formMode === 'add' 
                ? 'Isi formulir di bawah untuk menambahkan pengguna baru ke sistem' 
                : 'Ubah informasi pengguna sesuai kebutuhan'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="bg-white rounded-lg p-6 mt-4 shadow-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Nama Lengkap *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="username">Username *</Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="password">
                    Password {formMode === 'edit' ? '(kosongkan jika tidak diubah)' : '*'}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={formMode === 'add'}
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label>Role *</Label>
                  <Select 
                    value={formData.role} 
                    onValueChange={(value: UserRole) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allRoleNames.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <Label htmlFor="isActive">Status Akun</Label>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {formData.isActive ? 'Akun aktif' : 'Akun nonaktif'}
                    </p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons - Sticky */}
            <div className="sticky bottom-0 flex justify-end gap-3 pt-6 border-t mt-6 bg-white -mx-6 -mb-6 px-6 py-4 rounded-b-lg shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-10">
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Batal
              </Button>
              <Button type="submit" className="bg-[#144f6b] hover:bg-[#0f2d41]">
                {formMode === 'add' ? 'Tambah' : 'Simpan Perubahan'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <AlertDialog open={!!resetPasswordUser} onOpenChange={() => setResetPasswordUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin mereset password untuk <strong>{resetPasswordUser?.name}</strong>?
              Password sementara akan digenerate secara acak dan ditampilkan setelah reset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetPassword} className="bg-[#144f6b] hover:bg-[#0f2d41]">
              Reset Password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog password sementara hasil reset */}
      <AlertDialog open={!!generatedPassword} onOpenChange={() => setGeneratedPassword(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Password Berhasil Direset</AlertDialogTitle>
            <AlertDialogDescription>
              Password sementara telah dibuat. Catat dan berikan ke pengguna, lalu minta segera diganti.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
              <code className="flex-1 text-lg font-mono font-bold text-[#144f6b] tracking-widest">
                {generatedPassword}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyPassword}
                className="shrink-0"
              >
                {copied
                  ? <CheckIcon className="w-4 h-4 text-green-600" />
                  : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            {copied && <p className="text-xs text-green-600 mt-1">Disalin ke clipboard!</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setGeneratedPassword(null)}
              className="bg-[#144f6b] hover:bg-[#0f2d41]"
            >
              Selesai
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}