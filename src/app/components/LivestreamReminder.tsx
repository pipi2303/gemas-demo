import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useDraggable } from '../../lib/useDraggable';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { LivestreamLink, LivestreamPlatform, ReminderSetting } from '../types';
import {
  Bell, Clock, Calendar, ExternalLink,
  Plus, Edit3, Trash2, Save, Play, Settings, CheckCircle,
  Link2, Smartphone, Send,
} from 'lucide-react';

const PLATFORM_COLORS: Record<string, string> = {
  'YouTube':      'bg-red-100 text-red-700',
  'Zoom':         'bg-[#f0ede5] text-[#144f6b]',
  'Google Meet':  'bg-green-100 text-green-700',
  'Facebook Live':'bg-[#f0ede5] text-[#144f6b]',
  'Lainnya':      'bg-gray-100 text-gray-700',
};

const PLATFORM_ICONS: Record<string, string> = {
  'YouTube': '▶', 'Zoom': 'Z', 'Google Meet': 'G', 'Facebook Live': 'f', 'Lainnya': '⚡',
};

const PLATFORMS: LivestreamPlatform[] = ['YouTube', 'Zoom', 'Google Meet', 'Facebook Live', 'Lainnya'];
const CHANNELS = ['Notifikasi App', 'WhatsApp', 'Email'];

export function LivestreamReminder() {
  const {
    worshipSchedules,
    livestreamLinks, addLivestreamLink, updateLivestreamLink, deleteLivestreamLink,
    reminderSettings, addReminderSetting, updateReminderSetting, deleteReminderSetting,
  } = useApp();
  const { offset: offset1, onMouseDown: onMouseDown1 } = useDraggable();
  const { offset: offset2, onMouseDown: onMouseDown2 } = useDraggable();

  // ── Link state ──────────────────────────────────────────────────────────────
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [editLink, setEditLink] = useState<LivestreamLink | null>(null);
  const [deleteLinkId, setDeleteLinkId] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState({
    title: '', date: '', time: '',
    platform: 'YouTube' as LivestreamPlatform,
    url: '', isActive: true,
  });

  // ── Reminder state ──────────────────────────────────────────────────────────
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [editReminder, setEditReminder] = useState<ReminderSetting | null>(null);
  const [deleteReminderId, setDeleteReminderId] = useState<string | null>(null);
  const [reminderForm, setReminderForm] = useState({
    name: '', timing: '', channel: 'Notifikasi App', serviceType: '', enabled: true,
  });
  const [sentNotifications, setSentNotifications] = useState<string[]>([]);

  // ── Link handlers ───────────────────────────────────────────────────────────
  const openAddLink = () => {
    setEditLink(null);
    setLinkForm({ title: '', date: '', time: '', platform: 'YouTube', url: '', isActive: true });
    setShowLinkForm(true);
  };

  const openEditLink = (link: LivestreamLink) => {
    setEditLink(link);
    setLinkForm({ title: link.title, date: link.date, time: link.time, platform: link.platform, url: link.url, isActive: link.isActive });
    setShowLinkForm(true);
  };

  const saveLink = () => {
    if (!linkForm.title || !linkForm.url) return;
    if (editLink) {
      updateLivestreamLink(editLink.id, linkForm);
    } else {
      addLivestreamLink({ ...linkForm, scheduleId: '', views: 0 });
    }
    setShowLinkForm(false);
    setEditLink(null);
  };

  const confirmDeleteLink = (id: string) => setDeleteLinkId(id);
  const doDeleteLink = () => { if (deleteLinkId) { deleteLivestreamLink(deleteLinkId); setDeleteLinkId(null); } };

  // ── Reminder handlers ───────────────────────────────────────────────────────
  const openAddReminder = () => {
    setEditReminder(null);
    setReminderForm({ name: '', timing: '', channel: 'Notifikasi App', serviceType: '', enabled: true });
    setShowReminderForm(true);
  };

  const openEditReminder = (r: ReminderSetting) => {
    setEditReminder(r);
    setReminderForm({ name: r.name, timing: r.timing, channel: r.channel, serviceType: r.serviceType, enabled: r.enabled });
    setShowReminderForm(true);
  };

  const saveReminder = () => {
    if (!reminderForm.name || !reminderForm.timing) return;
    if (editReminder) {
      updateReminderSetting(editReminder.id, reminderForm);
    } else {
      addReminderSetting(reminderForm);
    }
    setShowReminderForm(false);
    setEditReminder(null);
  };

  const toggleEnabled = (r: ReminderSetting) => updateReminderSetting(r.id, { enabled: !r.enabled });

  const confirmDeleteReminder = (id: string) => setDeleteReminderId(id);
  const doDeleteReminder = () => { if (deleteReminderId) { deleteReminderSetting(deleteReminderId); setDeleteReminderId(null); } };

  const sendTestNotification = (id: string) => {
    setSentNotifications(prev => [...prev, id]);
    setTimeout(() => setSentNotifications(prev => prev.filter(x => x !== id)), 3000);
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const activeReminders = reminderSettings.filter(r => r.enabled);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Livestream & Reminder Ibadah</h1>
          <p className="text-gray-500 mt-1">Kelola link streaming ibadah (YouTube/Zoom) dan atur pengingat otomatis untuk jemaat</p>
        </div>
        <Button className="gap-2 bg-[#144f6b] hover:bg-[#0f2d41]" onClick={openAddLink}>
          <Plus className="w-4 h-4" />
          Tambah Link
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Link Aktif',      value: livestreamLinks.filter(l => l.isActive).length,        color: 'text-[#144f6b]',  bg: 'bg-[#f0f7fb]'  },
          { label: 'Total Penonton',  value: livestreamLinks.reduce((a, l) => a + l.views, 0),       color: 'text-[#144f6b]',  bg: 'bg-[#f0f7fb]'  },
          { label: 'Reminder Aktif',  value: activeReminders.length,                                  color: 'text-[#3a7fa0]',  bg: 'bg-[#f0f7fb]'  },
          { label: 'Jadwal Ibadah',   value: worshipSchedules.length,                                 color: 'text-orange-700', bg: 'bg-[#fffce8]'  },
        ].map((stat, i) => (
          <Card key={i} className={`p-4 ${stat.bg}`}>
            <p className="text-sm text-gray-600">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="livestream">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="livestream">Link Livestream</TabsTrigger>
          <TabsTrigger value="reminders">Reminder Ibadah</TabsTrigger>
        </TabsList>

        {/* ── Tab: Livestream Links ── */}
        <TabsContent value="livestream" className="space-y-4">
          {livestreamLinks.length === 0 ? (
            <Card className="p-10 text-center text-gray-400">
              <Play className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Belum ada link livestream</p>
              <p className="text-sm mt-1">Klik "Tambah Link" untuk menambahkan link streaming ibadah</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {livestreamLinks.map(link => (
                <Card key={link.id} className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold ${PLATFORM_COLORS[link.platform]}`}>
                      {PLATFORM_ICONS[link.platform]}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{link.title}</h3>
                        <Badge className={PLATFORM_COLORS[link.platform]}>{link.platform}</Badge>
                        <Badge className={link.isActive ? 'bg-[#f0ede5] text-[#144f6b]' : 'bg-gray-100 text-gray-500'}>
                          {link.isActive ? '● Aktif' : '○ Nonaktif'}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(link.date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {link.time} WIB
                        </span>
                        <span className="flex items-center gap-1">
                          <Play className="w-3.5 h-3.5" />
                          {link.views} penonton
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <a href={link.url} target="_blank" rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline truncate">{link.url}</a>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" className="gap-1 text-xs" asChild>
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3 h-3" />
                          Buka
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1 text-xs"
                        onClick={() => openEditLink(link)}>
                        <Edit3 className="w-3 h-3" />
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => confirmDeleteLink(link.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {link.platform === 'YouTube' && link.isActive && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="bg-gray-900 rounded-lg aspect-video max-h-48 flex items-center justify-center relative overflow-hidden">
                        <div className="text-center">
                          <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-2">
                            <Play className="w-8 h-8 text-white ml-1" />
                          </div>
                          <p className="text-white text-sm">{link.title}</p>
                          <p className="text-gray-400 text-xs mt-1">YouTube Livestream Preview</p>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Reminders ── */}
        <TabsContent value="reminders" className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-[#f0f7fb] rounded-lg border border-blue-200">
            <Bell className="w-4 h-4 text-blue-600 shrink-0" />
            <p className="text-sm text-blue-700">
              Reminder akan dikirim otomatis ke jemaat sesuai pengaturan. Pastikan notifikasi diizinkan di perangkat masing-masing.
            </p>
          </div>

          <div className="space-y-3">
            {reminderSettings.map(reminder => (
              <Card key={reminder.id} className="p-4">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${reminder.enabled ? 'bg-[#f0ede5]' : 'bg-gray-100'}`}>
                    <Bell className={`w-5 h-5 ${reminder.enabled ? 'text-[#1A77A3]' : 'text-gray-400'}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{reminder.name}</p>
                      {!reminder.enabled && <Badge className="bg-gray-100 text-gray-500 text-xs">Nonaktif</Badge>}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{reminder.timing}</span>
                      <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" />{reminder.channel}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{reminder.serviceType}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" className="gap-1 text-xs"
                      onClick={() => sendTestNotification(reminder.id)}>
                      {sentNotifications.includes(reminder.id)
                        ? <><CheckCircle className="w-3 h-3 text-[#1A77A3]" />Terkirim!</>
                        : <><Send className="w-3 h-3" />Test</>}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditReminder(reminder)}>
                      <Edit3 className="w-3.5 h-3.5 text-gray-400" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => confirmDeleteReminder(reminder.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <Switch checked={reminder.enabled} onCheckedChange={() => toggleEnabled(reminder)} />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Button variant="outline" className="w-full gap-2" onClick={openAddReminder}>
            <Plus className="w-4 h-4" />
            Tambah Pengingat Baru
          </Button>

          {/* Active reminder schedule preview */}
          {activeReminders.length > 0 && (
            <Card className="p-4 bg-gray-50">
              <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Settings className="w-4 h-4 text-gray-600" />
                Pengingat Aktif
              </h4>
              <div className="space-y-2">
                {activeReminders.map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-[#1A77A3]" />
                    <span className="text-gray-700">{r.timing} – {r.name}</span>
                    <Badge className="ml-auto bg-[#f0ede5] text-[#144f6b] text-xs">Aktif</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Add/Edit Link Dialog ── */}
      <Dialog open={showLinkForm} onOpenChange={v => { if (!v) { setShowLinkForm(false); setEditLink(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editLink ? 'Edit Link Livestream' : 'Tambah Link Livestream'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Judul Ibadah</Label>
              <Input placeholder="Contoh: Ibadah Minggu Pagi" value={linkForm.title}
                onChange={e => setLinkForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tanggal</Label>
                <Input type="date" value={linkForm.date} onChange={e => setLinkForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <Label>Waktu</Label>
                <Input type="time" value={linkForm.time} onChange={e => setLinkForm(f => ({ ...f, time: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Platform</Label>
              <Select value={linkForm.platform} onValueChange={v => setLinkForm(f => ({ ...f, platform: v as LivestreamPlatform }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>URL Livestream</Label>
              <Input placeholder="https://youtube.com/live/..." value={linkForm.url}
                onChange={e => setLinkForm(f => ({ ...f, url: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={linkForm.isActive} onCheckedChange={v => setLinkForm(f => ({ ...f, isActive: v }))} />
              <Label>Aktifkan link ini</Label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowLinkForm(false); setEditLink(null); }}>Batal</Button>
              <Button className="flex-1 bg-[#144f6b] hover:bg-[#0f2d41] gap-2" onClick={saveLink}
                disabled={!linkForm.title || !linkForm.url}>
                <Save className="w-4 h-4" />
                Simpan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit Reminder Dialog ── */}
      <Dialog open={showReminderForm} onOpenChange={v => { if (!v) { setShowReminderForm(false); setEditReminder(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editReminder ? 'Edit Pengingat' : 'Tambah Pengingat Baru'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nama Pengingat</Label>
              <Input placeholder="Contoh: Reminder Ibadah Minggu" value={reminderForm.name}
                onChange={e => setReminderForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Jenis Ibadah</Label>
              <Input placeholder="Minggu Pagi, Rabu, Pemuda..." value={reminderForm.serviceType}
                onChange={e => setReminderForm(f => ({ ...f, serviceType: e.target.value }))} />
            </div>
            <div>
              <Label>Waktu Pengiriman</Label>
              <Input placeholder="H-1 pukul 18:00, 1 jam sebelum..." value={reminderForm.timing}
                onChange={e => setReminderForm(f => ({ ...f, timing: e.target.value }))} />
            </div>
            <div>
              <Label>Channel</Label>
              <Select value={reminderForm.channel} onValueChange={v => setReminderForm(f => ({ ...f, channel: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={reminderForm.enabled} onCheckedChange={v => setReminderForm(f => ({ ...f, enabled: v }))} />
              <Label>Aktifkan pengingat ini</Label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowReminderForm(false); setEditReminder(null); }}>Batal</Button>
              <Button className="flex-1 bg-[#144f6b] hover:bg-[#0f2d41] gap-2" onClick={saveReminder}
                disabled={!reminderForm.name || !reminderForm.timing}>
                <Save className="w-4 h-4" />
                Simpan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Delete Link ── */}
      {deleteLinkId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setDeleteLinkId(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center" onClick={e => e.stopPropagation()} style={{ transform: `translate(${offset1.x}px, ${offset1.y}px)` }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-red-50" style={{ cursor: 'move' }} onMouseDown={onMouseDown1}>
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-2">Hapus Link Livestream?</h3>
            <p className="text-sm text-gray-500 mb-6">Link ini akan dihapus secara permanen.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteLinkId(null)}>Batal</Button>
              <Button className="flex-1 bg-red-500 hover:bg-red-600 text-white" onClick={doDeleteLink}>Hapus</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Reminder ── */}
      {deleteReminderId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setDeleteReminderId(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center" onClick={e => e.stopPropagation()} style={{ transform: `translate(${offset2.x}px, ${offset2.y}px)` }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-red-50" style={{ cursor: 'move' }} onMouseDown={onMouseDown2}>
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-2">Hapus Pengingat?</h3>
            <p className="text-sm text-gray-500 mb-6">Pengingat ini akan dihapus secara permanen.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteReminderId(null)}>Batal</Button>
              <Button className="flex-1 bg-red-500 hover:bg-red-600 text-white" onClick={doDeleteReminder}>Hapus</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
