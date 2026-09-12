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
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Bell, Clock, Calendar, ExternalLink,
  Plus, Edit3, Trash2, Save, Play, Settings, CheckCircle,
  Link2, Smartphone, Send, Download,
} from 'lucide-react';

const PLATFORM_COLORS: Record<string, string> = {
  'YouTube':      'bg-[#fdf1ef] text-[#d1553f]',
  'Zoom':         'bg-[#f0f7fb] text-[#144f6b]',
  'Google Meet':  'bg-[#f0f9f4] text-[#2f8f5b]',
  'Facebook Live':'bg-[#f5f2fa] text-[#8b6bb1]',
  'Lainnya':      'bg-[#f6f4f0] text-[#9c9486]',
};

const PLATFORM_ICONS: Record<string, string> = {
  'YouTube': '▶', 'Zoom': 'Z', 'Google Meet': 'G', 'Facebook Live': 'f', 'Lainnya': '⚡',
};

const PLATFORMS: LivestreamPlatform[] = ['YouTube', 'Zoom', 'Google Meet', 'Facebook Live', 'Lainnya'];
const CHANNELS = ['Notifikasi App', 'WhatsApp', 'Email'];

// Opsi lead-time pengingat: dipakai form (leadValue x leadUnit) untuk menghasilkan
// leadMinutes terstruktur, supaya efek auto-fire di AppContext bisa menghitung kapan
// notifikasi harus terpicu (bukan sekadar teks bebas seperti sebelumnya).
const LEAD_UNITS: { value: 'menit' | 'jam' | 'hari'; label: string; minutes: number }[] = [
  { value: 'menit', label: 'Menit', minutes: 1 },
  { value: 'jam',   label: 'Jam',   minutes: 60 },
  { value: 'hari',  label: 'Hari',  minutes: 1440 },
];
const leadUnitMinutes = (unit: string) => LEAD_UNITS.find(u => u.value === unit)?.minutes ?? 1;
const formatTiming = (value: number, unit: string) => {
  const label = LEAD_UNITS.find(u => u.value === unit)?.label.toLowerCase() ?? unit;
  return `${value} ${label} sebelum ibadah dimulai`;
};
const SERVICE_TYPE_FALLBACK = ['Minggu Pagi', 'Minggu Sore', 'Rabu', 'Pemuda', 'Khusus'];

export function LivestreamReminder() {
  const {
    worshipSchedules,
    livestreamLinks, addLivestreamLink, updateLivestreamLink, deleteLivestreamLink,
    reminderSettings, addReminderSetting, updateReminderSetting, deleteReminderSetting,
    addNotification, can,
  } = useApp();
  const { offset: offset1, onMouseDown: onMouseDown1 } = useDraggable();
  const { offset: offset2, onMouseDown: onMouseDown2 } = useDraggable();

  const canCreate = can('livestream', 'create');
  const canEdit   = can('livestream', 'edit');
  const canDelete = can('livestream', 'delete');
  const canExport = can('livestream', 'export');

  // ── Link state ──────────────────────────────────────────────────────────────
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [editLink, setEditLink] = useState<LivestreamLink | null>(null);
  const [deleteLinkId, setDeleteLinkId] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState({
    title: '', date: '', time: '',
    platform: 'YouTube' as LivestreamPlatform,
    url: '', isActive: true, scheduleId: '',
  });

  // ── Reminder state ──────────────────────────────────────────────────────────
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [editReminder, setEditReminder] = useState<ReminderSetting | null>(null);
  const [deleteReminderId, setDeleteReminderId] = useState<string | null>(null);
  const [reminderForm, setReminderForm] = useState({
    name: '', leadValue: 60, leadUnit: 'menit' as 'menit' | 'jam' | 'hari',
    channel: 'Notifikasi App', serviceType: '', enabled: true,
  });
  const [sentNotifications, setSentNotifications] = useState<string[]>([]);

  const serviceTypeOptions = React.useMemo(() => {
    const fromSchedules = Array.from(new Set(worshipSchedules.map(w => w.type).filter(Boolean)));
    const base = fromSchedules.length > 0 ? fromSchedules : SERVICE_TYPE_FALLBACK;
    return ['Semua Ibadah', ...base];
  }, [worshipSchedules]);

  // ── Link handlers ───────────────────────────────────────────────────────────
  const openAddLink = () => {
    setEditLink(null);
    setLinkForm({ title: '', date: '', time: '', platform: 'YouTube', url: '', isActive: true, scheduleId: '' });
    setShowLinkForm(true);
  };

  const openEditLink = (link: LivestreamLink) => {
    setEditLink(link);
    setLinkForm({ title: link.title, date: link.date, time: link.time, platform: link.platform, url: link.url, isActive: link.isActive, scheduleId: link.scheduleId || '' });
    setShowLinkForm(true);
  };

  const saveLink = () => {
    if (!linkForm.title || !linkForm.url) return;
    if (editLink) {
      updateLivestreamLink(editLink.id, linkForm);
    } else {
      addLivestreamLink({ ...linkForm, views: 0 });
    }
    setShowLinkForm(false);
    setEditLink(null);
  };

  const confirmDeleteLink = (id: string) => setDeleteLinkId(id);
  const doDeleteLink = () => { if (deleteLinkId) { deleteLivestreamLink(deleteLinkId); setDeleteLinkId(null); } };

  // ── Reminder handlers ───────────────────────────────────────────────────────
  const openAddReminder = () => {
    setEditReminder(null);
    setReminderForm({ name: '', leadValue: 60, leadUnit: 'menit', channel: 'Notifikasi App', serviceType: '', enabled: true });
    setShowReminderForm(true);
  };

  const openEditReminder = (r: ReminderSetting) => {
    setEditReminder(r);
    // Reminder lama (sebelum fitur lead-time terstruktur) belum punya leadMinutes -- default ke 60 menit
    // supaya bisa langsung diaktifkan; simpan ulang akan menuliskan leadMinutes yang baru.
    const leadValue = r.leadMinutes && r.leadMinutes % 1440 === 0 ? r.leadMinutes / 1440
      : r.leadMinutes && r.leadMinutes % 60 === 0 ? r.leadMinutes / 60
      : r.leadMinutes || 60;
    const leadUnit: 'menit' | 'jam' | 'hari' = r.leadMinutes && r.leadMinutes % 1440 === 0 ? 'hari'
      : r.leadMinutes && r.leadMinutes % 60 === 0 ? 'jam' : 'menit';
    setReminderForm({ name: r.name, leadValue, leadUnit, channel: r.channel, serviceType: r.serviceType, enabled: r.enabled });
    setShowReminderForm(true);
  };

  const saveReminder = () => {
    if (!reminderForm.name || !reminderForm.serviceType) return;
    const leadMinutes = reminderForm.leadValue * leadUnitMinutes(reminderForm.leadUnit);
    const payload = {
      name: reminderForm.name,
      timing: formatTiming(reminderForm.leadValue, reminderForm.leadUnit),
      channel: reminderForm.channel,
      serviceType: reminderForm.serviceType,
      enabled: reminderForm.enabled,
      leadMinutes,
    };
    if (editReminder) {
      updateReminderSetting(editReminder.id, payload);
    } else {
      addReminderSetting(payload);
    }
    setShowReminderForm(false);
    setEditReminder(null);
  };

  const toggleEnabled = (r: ReminderSetting) => updateReminderSetting(r.id, { enabled: !r.enabled });

  const confirmDeleteReminder = (id: string) => setDeleteReminderId(id);
  const doDeleteReminder = () => { if (deleteReminderId) { deleteReminderSetting(deleteReminderId); setDeleteReminderId(null); } };

  // Kirim notifikasi in-app nyata (bukan cuma toggle UI) supaya tombol "Test" benar-benar
  // menunjukkan hasil notifikasi di NotificationCenter, dengan link unik per klik agar tidak
  // ke-dedup oleh addNotification (yang menolak link duplikat).
  const sendTestNotification = (r: ReminderSetting) => {
    setSentNotifications(prev => [...prev, r.id]);
    addNotification({
      type: 'event',
      title: `[Uji Coba] ${r.name}`,
      message: `${r.timing} · ${r.serviceType} · via ${r.channel}`,
      read: false,
      link: `livestream-reminder-test-${r.id}-${Date.now()}`,
      priority: 'low',
    });
    setTimeout(() => setSentNotifications(prev => prev.filter(x => x !== r.id)), 3000);
  };

  // Unduh daftar link livestream & pengaturan pengingat sebagai PDF (jsPDF + autoTable,
  // berkop surat navy/gold GPIB Trinitas -- konsisten dengan ekspor menu lain).
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const NAVY: [number, number, number] = [20, 79, 107];
    const GOLD: [number, number, number] = [202, 160, 74];
    const SLATE: [number, number, number] = [51, 65, 85];

    const drawHeader = (title: string) => {
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, pageWidth, 22, 'F');
      doc.setFillColor(...GOLD);
      doc.rect(0, 22, pageWidth, 1.4, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(title, pageWidth / 2, 9, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text('GPIB Trinitas', pageWidth / 2, 15, { align: 'center' });
      doc.setFontSize(7.5);
      doc.text(`Dicetak ${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}`, pageWidth / 2, 19.5, { align: 'center' });
    };
    drawHeader('LIVESTREAM & PENGINGAT IBADAH');

    const linkRows = livestreamLinks.map((l, i) => [
      String(i + 1), l.title,
      new Date(l.date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
      l.time, l.platform, l.url, l.isActive ? 'Aktif' : 'Nonaktif', String(l.views),
    ]);
    autoTable(doc, {
      startY: 28,
      head: [['No', 'Judul', 'Tanggal', 'Jam', 'Platform', 'URL', 'Status', 'Penonton']],
      body: linkRows,
      theme: 'striped',
      headStyles: { fillColor: SLATE, textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 50 }, 2: { cellWidth: 26 }, 3: { cellWidth: 14, halign: 'center' }, 4: { cellWidth: 24 }, 5: { cellWidth: 70 }, 6: { cellWidth: 18 }, 7: { cellWidth: 'auto', halign: 'center' } },
      margin: { left: 12, right: 12 },
      didDrawPage: () => { if (doc.internal.getNumberOfPages() > 1) drawHeader('LIVESTREAM & PENGINGAT IBADAH'); },
    });

    const reminderStartY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(20, 79, 107);
    doc.text('Pengaturan Pengingat Ibadah', 12, reminderStartY);
    const reminderRows = reminderSettings.map((r, i) => [
      String(i + 1), r.name, r.timing, r.channel, r.serviceType, r.enabled ? 'Aktif' : 'Nonaktif',
    ]);
    autoTable(doc, {
      startY: reminderStartY + 3,
      head: [['No', 'Nama Pengingat', 'Waktu Kirim', 'Channel', 'Jenis Ibadah', 'Status']],
      body: reminderRows,
      theme: 'striped',
      headStyles: { fillColor: SLATE, textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
      margin: { left: 12, right: 12 },
      didDrawPage: () => { if (doc.internal.getNumberOfPages() > 1) drawHeader('LIVESTREAM & PENGINGAT IBADAH'); },
    });

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.4);
      doc.line(12, pageHeight - 10, pageWidth - 12, pageHeight - 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text('Dokumen Internal GPIB Trinitas', 12, pageHeight - 6);
      doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - 12, pageHeight - 6, { align: 'right' });
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    doc.save(`Livestream-Reminder-GPIB-Trinitas-${pad(now.getDate())}${pad(now.getMonth()+1)}${now.getFullYear()}.pdf`);
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
        <div className="flex items-center gap-2">
          {canExport && (
            <button onClick={handleExportPDF}
              className="flex items-center gap-2 px-4 py-2 border border-[#b8d5e8] text-[#144f6b] bg-[#f0f7fb] rounded-lg hover:bg-[#e3eef6] transition-colors text-sm">
              <Download className="w-4 h-4" /> Unduh PDF
            </button>
          )}
          {canCreate && (
            <Button className="gap-2 bg-[#144f6b] hover:bg-[#0f2d41]" onClick={openAddLink}>
              <Plus className="w-4 h-4" />
              Tambah Link
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Link Aktif',      value: livestreamLinks.filter(l => l.isActive).length,        color: 'text-[#144f6b]',  bg: 'bg-[#f0f7fb]'  },
          { label: 'Total Penonton',  value: livestreamLinks.reduce((a, l) => a + l.views, 0),       color: 'text-[#144f6b]',  bg: 'bg-[#f0f7fb]'  },
          { label: 'Reminder Aktif',  value: activeReminders.length,                                  color: 'text-[#3a7fa0]',  bg: 'bg-[#f0f7fb]'  },
          { label: 'Jadwal Ibadah',   value: worshipSchedules.length,                                 color: 'text-[#8b6bb1]',  bg: 'bg-[#f5f2fa]'  },
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
                          className="text-sm text-[#144f6b] hover:underline truncate">{link.url}</a>
                      </div>
                      {(() => {
                        const linkedSchedule = link.scheduleId ? worshipSchedules.find(w => w.id === link.scheduleId) : undefined;
                        if (link.scheduleId && !linkedSchedule) {
                          return <p className="text-xs text-[#d1553f] mt-1">⚠ Jadwal ibadah tertaut sudah tidak ada</p>;
                        }
                        if (linkedSchedule) {
                          return <p className="text-xs text-[#8b6bb1] mt-1">Terkait Jadwal Ibadah: {linkedSchedule.title}</p>;
                        }
                        return <p className="text-xs text-gray-400 mt-1">Belum ditautkan ke Jadwal Ibadah</p>;
                      })()}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" className="gap-1 text-xs" asChild>
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3 h-3" />
                          Buka
                        </a>
                      </Button>
                      {canEdit && (
                        <Button variant="outline" size="sm" className="gap-1 text-xs"
                          onClick={() => openEditLink(link)}>
                          <Edit3 className="w-3 h-3" />
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => confirmDeleteLink(link.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {link.platform === 'YouTube' && link.isActive && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="bg-gray-900 rounded-lg aspect-video max-h-48 flex items-center justify-center relative overflow-hidden">
                        <div className="text-center">
                          <div className="w-16 h-16 bg-[#d1553f] rounded-full flex items-center justify-center mx-auto mb-2">
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
          <div className="flex items-center gap-2 p-3 bg-[#f0f7fb] rounded-lg border border-[#b8d5e8]">
            <Bell className="w-4 h-4 text-[#144f6b] shrink-0" />
            <p className="text-sm text-[#144f6b]">
              Pengingat dengan lead time terisi akan otomatis memunculkan notifikasi in-app (lonceng notifikasi)
              begitu waktunya tiba, selama aplikasi ini terbuka. Ini bukan notifikasi push ke perangkat di luar aplikasi.
            </p>
          </div>

          <div className="space-y-3">
            {reminderSettings.map(reminder => (
              <Card key={reminder.id} className="p-4">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${reminder.enabled ? 'bg-[#f0ede5]' : 'bg-gray-100'}`}>
                    <Bell className={`w-5 h-5 ${reminder.enabled ? 'text-[#144f6b]' : 'text-gray-400'}`} />
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
                      onClick={() => sendTestNotification(reminder)}>
                      {sentNotifications.includes(reminder.id)
                        ? <><CheckCircle className="w-3 h-3 text-[#144f6b]" />Terkirim!</>
                        : <><Send className="w-3 h-3" />Test</>}
                    </Button>
                    {canEdit && (
                      <Button variant="ghost" size="sm" onClick={() => openEditReminder(reminder)}>
                        <Edit3 className="w-3.5 h-3.5 text-gray-400" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => confirmDeleteReminder(reminder.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Switch checked={reminder.enabled} onCheckedChange={() => toggleEnabled(reminder)} disabled={!canEdit} />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {canCreate && (
            <Button variant="outline" className="w-full gap-2" onClick={openAddReminder}>
              <Plus className="w-4 h-4" />
              Tambah Pengingat Baru
            </Button>
          )}

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
                    <div className="w-2 h-2 rounded-full bg-[#144f6b]" />
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
              <Label>Jadwal Ibadah Terkait (opsional)</Label>
              <Select value={linkForm.scheduleId || '__none__'} onValueChange={v => setLinkForm(f => ({ ...f, scheduleId: v === '__none__' ? '' : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Tidak ditautkan</SelectItem>
                  {worshipSchedules.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.title} · {w.date}</SelectItem>
                  ))}
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
              <Select value={reminderForm.serviceType} onValueChange={v => setReminderForm(f => ({ ...f, serviceType: v }))}>
                <SelectTrigger><SelectValue placeholder="Pilih jenis ibadah" /></SelectTrigger>
                <SelectContent>
                  {serviceTypeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kirim Pengingat</Label>
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" min={1} value={reminderForm.leadValue}
                  onChange={e => setReminderForm(f => ({ ...f, leadValue: Math.max(1, Number(e.target.value) || 1) }))} />
                <Select value={reminderForm.leadUnit} onValueChange={v => setReminderForm(f => ({ ...f, leadUnit: v as 'menit' | 'jam' | 'hari' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_UNITS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-gray-400 mt-1">sebelum jadwal ibadah dimulai — {formatTiming(reminderForm.leadValue, reminderForm.leadUnit)}</p>
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
                disabled={!reminderForm.name || !reminderForm.serviceType}>
                <Save className="w-4 h-4" />
                Simpan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Delete Link ── */}
      {deleteLinkId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}
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
