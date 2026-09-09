import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../../lib/apiClient';
import { toast } from 'sonner';
import { Card } from './ui/card';
import {
  Inbox, Plus, ArrowLeft, Loader2, Paperclip, Trash2, X, Save,
  CheckCircle2, UserCheck, Archive, Download, FileText, Upload, ClipboardCheck,
} from 'lucide-react';
import type { IncomingLetter, IncomingLetterAttachment, IncomingLetterStatus } from '../types';

// ============================================================
// Surat Masuk & Disposisi — Fase 3
// ============================================================
// Halaman ini lapisan UX di atas endpoint yang sudah dibangun:
// - CRUD Diterima: lewat /api/data/incomingLetters generik (PUT/POST/DELETE
//   ditolak server begitu status sudah lewat Diterima — lihat data.ts).
// - Transisi status (Disposisikan/Tindak Lanjut/Selesai/Arsipkan): lewat
//   /api/incoming-letters/:id/... (server/routes/incomingLetters.ts), yang
//   memvalidasi urutan status, izin (termasuk "assignee override" — staf yang
//   ditugaskan selalu boleh tindak-lanjut/selesai walau tidak punya izin modul),
//   & mencatat Log Aktivitas otomatis.
// - Lampiran scan surat memakai pola MULTI-LAMPIRAN yang sama dengan Surat
//   Keluar Fase 2 (collection terpisah incomingLetterAttachments).
// - Begitu didisposisikan, staf yang ditugaskan menerima notifikasi lewat
//   NotificationBell (dibuat otomatis oleh server, targetUserId-scoped).

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024; // 2MB — pola sama attestationDocuments/outgoingLetterAttachments

const STATUS_META: Record<IncomingLetterStatus, { label: string; color: string; bg: string; border: string }> = {
  Diterima:        { label: 'Diterima',         color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' },
  Didisposisikan:  { label: 'Didisposisikan',   color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  DitindakLanjuti: { label: 'Ditindaklanjuti',  color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
  Selesai:         { label: 'Selesai',          color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  Diarsipkan:      { label: 'Diarsipkan',       color: '#334155', bg: '#f8fafc', border: '#e2e8f0' },
};

function StatusBadge({ status }: { status: IncomingLetterStatus }) {
  const m = STATUS_META[status] || STATUS_META.Diterima;
  return (
    <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold border" style={{ color: m.color, background: m.bg, borderColor: m.border }}>
      {m.label}
    </span>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

function downloadBase64Pdf(base64: string, fileName: string) {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(createdBy: string): Partial<IncomingLetter> {
  return {
    status: 'Diterima',
    receivedDate: todayISODate(),
    senderName: '',
    senderInstitution: '',
    subject: '',
    category: '',
    notes: '',
    createdBy,
  };
}

export function IncomingLetters() {
  const { currentUser, can, masterDataItems = [], users = [] } = useApp();
  const canCreate = can('letters-incoming', 'create');
  const canEditPerm = can('letters-incoming', 'edit');

  const categoryOptions = useMemo(
    () => masterDataItems.filter(m => m.category === 'jenis_surat_masuk' && m.isActive).sort((a, b) => a.order - b.order),
    [masterDataItems]
  );
  const categoryLabel = useCallback((id?: string) => categoryOptions.find(c => c.id === id)?.label || id || '-', [categoryOptions]);

  const activeUsers = useMemo(() => users.filter(u => u.isActive), [users]);
  const userLabel = useCallback((id?: string) => {
    const u = users.find(x => x.id === id);
    return u ? (u.name || u.username) : (id || '-');
  }, [users]);

  const [view, setView] = useState<'list' | 'edit'>('list');
  const [letters, setLetters] = useState<IncomingLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<IncomingLetterStatus | 'all'>('all');

  const [current, setCurrent] = useState<Partial<IncomingLetter> | null>(null);
  const [attachments, setAttachments] = useState<IncomingLetterAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const [dispositionModal, setDispositionModal] = useState(false);
  const [assigneePick, setAssigneePick] = useState('');
  const [instructionText, setInstructionText] = useState('');
  const [dueDatePick, setDueDatePick] = useState('');
  const [followUpModal, setFollowUpModal] = useState(false);
  const [followUpText, setFollowUpText] = useState('');

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<IncomingLetter[]>('/api/data/incomingLetters');
      setLetters(rows.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')));
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat daftar surat masuk');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const loadAttachments = useCallback(async (letterId: string) => {
    try {
      const rows = await api.get<IncomingLetterAttachment[]>('/api/data/incomingLetterAttachments');
      setAttachments(rows.filter(a => a.letterId === letterId));
    } catch {
      setAttachments([]);
    }
  }, []);

  const openNew = () => {
    setCurrent(emptyDraft(currentUser?.id || ''));
    setAttachments([]);
    setView('edit');
  };

  const openExisting = (letter: IncomingLetter) => {
    setCurrent(letter);
    loadAttachments(letter.id);
    setView('edit');
  };

  const backToList = () => {
    setCurrent(null);
    setView('list');
    loadList();
  };

  const handleSaveDraft = async () => {
    if (!current) return;
    if (!current.senderName?.trim()) { toast.error('Nama pengirim wajib diisi'); return; }
    if (!current.subject?.trim()) { toast.error('Perihal wajib diisi'); return; }
    setSaving(true);
    try {
      const isNew = !current.id;
      const id = current.id || `inl_${Date.now()}`;
      const payload: IncomingLetter = {
        id,
        status: 'Diterima',
        receivedDate: current.receivedDate || todayISODate(),
        senderName: current.senderName!.trim(),
        senderInstitution: current.senderInstitution?.trim() || undefined,
        subject: current.subject!.trim(),
        category: current.category || undefined,
        notes: current.notes || undefined,
        createdBy: current.createdBy || currentUser?.id || '',
        createdAt: current.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (isNew) {
        await api.post('/api/data/incomingLetters', payload);
      } else {
        await api.put(`/api/data/incomingLetters/${id}`, payload);
      }
      toast.success('Surat masuk disimpan');
      setCurrent(payload);
      if (isNew) loadAttachments(id);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan surat masuk');
    } finally {
      setSaving(false);
    }
  };

  const refreshCurrent = async (id: string) => {
    const fresh = await api.get<IncomingLetter[]>('/api/data/incomingLetters');
    const updated = fresh.find(l => l.id === id);
    if (updated) setCurrent(updated);
  };

  const runTransition = async (action: string, body?: any) => {
    if (!current?.id) return false;
    setBusyAction(action);
    try {
      await api.put<{ success: boolean; error?: string }>(`/api/incoming-letters/${current.id}/${action}`, body || {});
      await refreshCurrent(current.id);
      toast.success('Berhasil diperbarui');
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Aksi gagal dijalankan');
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteDraft = async () => {
    if (!current?.id) return;
    if (!window.confirm('Hapus surat masuk ini?')) return;
    try {
      await api.delete(`/api/data/incomingLetters/${current.id}`);
      toast.success('Surat dihapus');
      backToList();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus surat');
    }
  };

  const handleUploadAttachment = async (file: File) => {
    if (!current?.id) { toast.error('Simpan surat terlebih dahulu sebelum menambah lampiran'); return; }
    if (file.type !== 'application/pdf') { toast.error('Hanya file PDF yang diperbolehkan'); return; }
    if (file.size > MAX_ATTACHMENT_BYTES) { toast.error('Ukuran file melebihi batas 2MB'); return; }
    setUploadingAttachment(true);
    try {
      const base64 = await fileToBase64(file);
      const id = `inlatt_${Date.now()}`;
      const data: IncomingLetterAttachment = {
        id, letterId: current.id, fileName: file.name, fileSize: file.size,
        mimeType: file.type, fileData: base64, uploadedAt: new Date().toISOString(), uploadedBy: currentUser?.id,
      };
      await api.post('/api/data/incomingLetterAttachments', data);
      setAttachments(prev => [...prev, data]);
      toast.success('Lampiran ditambahkan');
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengunggah lampiran');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDeleteAttachment = async (att: IncomingLetterAttachment) => {
    if (!window.confirm(`Hapus lampiran "${att.fileName}"?`)) return;
    try {
      await api.delete(`/api/data/incomingLetterAttachments/${att.id}`);
      setAttachments(prev => prev.filter(a => a.id !== att.id));
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus lampiran');
    }
  };

  const openDispositionModal = () => {
    setAssigneePick(current?.disposisi?.assignedToUserId || '');
    setInstructionText(current?.disposisi?.instruction || '');
    setDueDatePick(current?.disposisi?.dueDate || '');
    setDispositionModal(true);
  };

  const handleConfirmDisposition = async () => {
    if (!assigneePick) { toast.error('Staf yang didisposisikan wajib dipilih'); return; }
    if (!instructionText.trim()) { toast.error('Instruksi disposisi wajib diisi'); return; }
    const ok = await runTransition('disposisikan', {
      assignedToUserId: assigneePick,
      instruction: instructionText.trim(),
      dueDate: dueDatePick || undefined,
    });
    if (ok) setDispositionModal(false);
  };

  const status = current?.status || 'Diterima';
  const isEditable = status === 'Diterima';
  const isAssignee = !!current?.disposisi?.assignedToUserId && current.disposisi.assignedToUserId === currentUser?.id;
  const canActOnDisposition = isAssignee || canEditPerm;

  const filteredLetters = statusFilter === 'all' ? letters : letters.filter(l => l.status === statusFilter);

  if (view === 'list') {
    return (
      <div className="space-y-5 pb-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: '#e0f2fe' }}>
              <Inbox className="w-5.5 h-5.5" style={{ color: '#0369a1' }} />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ color: '#1e293b' }}>Surat Masuk</h1>
              <p className="text-sm" style={{ color: '#64748b' }}>Diterima → Didisposisikan → Ditindaklanjuti → Selesai → Diarsipkan.</p>
            </div>
          </div>
          {canCreate && (
            <button onClick={openNew} className="px-3.5 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-1.5" style={{ background: '#0369a1' }}>
              <Plus className="w-4 h-4" /> Catat Surat Masuk
            </button>
          )}
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'Diterima', 'Didisposisikan', 'DitindakLanjuti', 'Selesai', 'Diarsipkan'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={statusFilter === s ? { background: '#0369a1', color: '#fff' } : { background: '#f1f5f9', color: '#64748b' }}>
              {s === 'all' ? `Semua (${letters.length})` : `${STATUS_META[s].label} (${letters.filter(l => l.status === s).length})`}
            </button>
          ))}
        </div>

        <Card className="p-0 overflow-hidden">
          {loading ? (
            <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : filteredLetters.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Belum ada surat pada kategori ini.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Tanggal Diterima</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Perihal</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Pengirim</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Kategori</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Didisposisikan Ke</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLetters.map(l => (
                  <tr key={l.id} className="border-t cursor-pointer hover:bg-slate-50" style={{ borderColor: '#e2e8f0' }} onClick={() => openExisting(l)}>
                    <td className="px-4 py-2.5 text-slate-600">{l.receivedDate}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{l.subject}</td>
                    <td className="px-4 py-2.5 text-slate-600">{l.senderName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{categoryLabel(l.category)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{l.disposisi ? userLabel(l.disposisi.assignedToUserId) : '—'}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    );
  }

  // ── View: editor / detail ──────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3">
        <button onClick={backToList} className="p-2 rounded-lg hover:bg-slate-100"><ArrowLeft className="w-4 h-4 text-slate-500" /></button>
        <div className="flex-1">
          <h1 className="text-lg font-bold flex items-center gap-2" style={{ color: '#1e293b' }}>
            {current?.id ? (current.subject || '(Tanpa perihal)') : 'Surat Masuk Baru'}
            <StatusBadge status={status} />
          </h1>
        </div>
      </div>

      <Card className="p-5 space-y-4 max-w-3xl">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Tanggal Diterima</label>
            <input type="date" disabled={!isEditable} value={current?.receivedDate || ''}
              onChange={e => setCurrent(prev => prev && ({ ...prev, receivedDate: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm disabled:bg-slate-50" style={{ borderColor: '#e2e8f0' }} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Kategori Surat</label>
            <select disabled={!isEditable} value={current?.category || ''}
              onChange={e => setCurrent(prev => prev && ({ ...prev, category: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm bg-white disabled:bg-slate-50" style={{ borderColor: '#e2e8f0' }}>
              <option value="">— Pilih kategori —</option>
              {categoryOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Nama Pengirim</label>
            <input disabled={!isEditable} value={current?.senderName || ''} onChange={e => setCurrent(prev => prev && ({ ...prev, senderName: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm disabled:bg-slate-50" style={{ borderColor: '#e2e8f0' }} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Institusi Pengirim (opsional)</label>
            <input disabled={!isEditable} value={current?.senderInstitution || ''} onChange={e => setCurrent(prev => prev && ({ ...prev, senderInstitution: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm disabled:bg-slate-50" style={{ borderColor: '#e2e8f0' }} />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Perihal</label>
          <input disabled={!isEditable} value={current?.subject || ''} onChange={e => setCurrent(prev => prev && ({ ...prev, subject: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border text-sm disabled:bg-slate-50" style={{ borderColor: '#e2e8f0' }} />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Catatan (opsional)</label>
          <textarea disabled={!isEditable} rows={4} value={current?.notes || ''} onChange={e => setCurrent(prev => prev && ({ ...prev, notes: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border text-sm disabled:bg-slate-50" style={{ borderColor: '#e2e8f0' }} />
        </div>

        {isEditable && (
          <div className="flex items-center gap-2 pt-2">
            <button onClick={handleSaveDraft} disabled={saving} className="px-3.5 py-2 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#0369a1' }}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} <Save className="w-3.5 h-3.5" /> Simpan
            </button>
            {current?.id && (
              <button onClick={handleDeleteDraft} className="px-3.5 py-2 rounded-lg text-sm text-red-600 border border-red-200 flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Hapus
              </button>
            )}
          </div>
        )}
      </Card>

      {current?.id && (
        <Card className="p-5 space-y-3 max-w-3xl">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4" style={{ color: '#0369a1' }} />
            <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>Lampiran Scan Surat</h3>
          </div>
          {attachments.length === 0 && <p className="text-sm text-slate-400">Belum ada lampiran.</p>}
          {attachments.map(att => (
            <div key={att.id} className="flex items-center justify-between p-2 rounded-lg border" style={{ borderColor: '#f1f5f9' }}>
              <span className="text-sm text-slate-700 truncate flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-slate-400" /> {att.fileName}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => downloadBase64Pdf(att.fileData, att.fileName)} className="p-1.5 rounded hover:bg-slate-100"><Download className="w-3.5 h-3.5 text-slate-500" /></button>
                {isEditable && <button onClick={() => handleDeleteAttachment(att)} className="p-1.5 rounded hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
              </div>
            </div>
          ))}
          <label className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer px-2.5 py-1.5 rounded-lg" style={{ background: '#e0f2fe', color: '#0369a1' }}>
            {uploadingAttachment ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Tambah Lampiran (PDF, maks 2MB)
            <input type="file" accept="application/pdf" className="hidden" disabled={uploadingAttachment}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleUploadAttachment(f); }} />
          </label>
        </Card>
      )}

      {current?.id && current.disposisi && (
        <Card className="p-5 space-y-2 max-w-3xl text-sm">
          <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: '#1e293b' }}><UserCheck className="w-4 h-4" style={{ color: '#0369a1' }} /> Disposisi</h3>
          <p className="text-slate-600">Ditugaskan ke: <span className="font-medium text-slate-800">{userLabel(current.disposisi.assignedToUserId)}</span></p>
          <p className="text-slate-600">Instruksi: {current.disposisi.instruction}</p>
          {current.disposisi.dueDate && <p className="text-slate-600">Batas waktu: {current.disposisi.dueDate}</p>}
          {current.followUpNotes && <p className="text-slate-500 pt-1 border-t" style={{ borderColor: '#f1f5f9' }}>Catatan tindak lanjut: {current.followUpNotes}</p>}
        </Card>
      )}

      {current?.id && (
        <div className="flex items-center gap-2 flex-wrap max-w-3xl">
          {(status === 'Diterima' || status === 'Didisposisikan') && canEditPerm && (
            <button onClick={openDispositionModal} disabled={busyAction !== null}
              className="px-3.5 py-2 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#0369a1' }}>
              <UserCheck className="w-3.5 h-3.5" /> {status === 'Didisposisikan' ? 'Ubah Disposisi' : 'Disposisikan'}
            </button>
          )}
          {status === 'Didisposisikan' && canActOnDisposition && (
            <button onClick={() => { setFollowUpText(''); setFollowUpModal(true); }} disabled={busyAction !== null}
              className="px-3.5 py-2 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#1e40af' }}>
              {busyAction === 'tindak-lanjut' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCheck className="w-3.5 h-3.5" />} Tindak Lanjuti
            </button>
          )}
          {status === 'DitindakLanjuti' && canActOnDisposition && (
            <button onClick={() => runTransition('selesai')} disabled={busyAction !== null}
              className="px-3.5 py-2 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#166534' }}>
              {busyAction === 'selesai' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Tandai Selesai
            </button>
          )}
          {status === 'Selesai' && canEditPerm && (
            <button onClick={() => runTransition('arsipkan')} disabled={busyAction !== null}
              className="px-3.5 py-2 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#334155' }}>
              {busyAction === 'arsipkan' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />} Arsipkan
            </button>
          )}
        </div>
      )}

      {dispositionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => busyAction === null && setDispositionModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#e2e8f0' }}>
              <h3 className="text-sm font-semibold text-slate-800">Disposisikan Surat</h3>
              <button onClick={() => setDispositionModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Ditugaskan Ke <span className="text-red-500">*</span></label>
                <select value={assigneePick} onChange={e => setAssigneePick(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-white" style={{ borderColor: '#e2e8f0' }}>
                  <option value="">— Pilih staf —</option>
                  {activeUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.username} ({u.role})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Instruksi <span className="text-red-500">*</span></label>
                <textarea value={instructionText} onChange={e => setInstructionText(e.target.value)} rows={3}
                  className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: '#e2e8f0' }} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Batas Waktu (opsional)</label>
                <input type="date" value={dueDatePick} onChange={e => setDueDatePick(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: '#e2e8f0' }} />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: '#e2e8f0' }}>
              <button onClick={() => setDispositionModal(false)} disabled={busyAction !== null} className="px-3.5 py-2 rounded-lg text-sm text-slate-600 border" style={{ borderColor: '#e2e8f0' }}>Batal</button>
              <button onClick={handleConfirmDisposition} disabled={busyAction !== null}
                className="px-3.5 py-2 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#0369a1' }}>
                {busyAction === 'disposisikan' && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Simpan Disposisi
              </button>
            </div>
          </div>
        </div>
      )}

      {followUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => busyAction === null && setFollowUpModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#e2e8f0' }}>
              <h3 className="text-sm font-semibold text-slate-800">Tindak Lanjuti Surat</h3>
              <button onClick={() => setFollowUpModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-5">
              <label className="text-xs font-medium text-slate-600 block mb-1">Catatan Tindak Lanjut (opsional)</label>
              <textarea value={followUpText} onChange={e => setFollowUpText(e.target.value)} rows={4}
                className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: '#e2e8f0' }} />
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: '#e2e8f0' }}>
              <button onClick={() => setFollowUpModal(false)} disabled={busyAction !== null} className="px-3.5 py-2 rounded-lg text-sm text-slate-600 border" style={{ borderColor: '#e2e8f0' }}>Batal</button>
              <button
                onClick={async () => {
                  const ok = await runTransition('tindak-lanjut', { followUpNotes: followUpText.trim() || undefined });
                  if (ok) setFollowUpModal(false);
                }}
                disabled={busyAction !== null}
                className="px-3.5 py-2 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#1e40af' }}>
                {busyAction === 'tindak-lanjut' && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
