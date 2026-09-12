import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../../lib/apiClient';
import { toast } from 'sonner';
import { Card } from './ui/card';
import {
  Send, Plus, ArrowLeft, Loader2, Paperclip, Trash2, X, Save,
  CheckCircle2, RotateCcw, PenTool, Package, Archive, Download, Eye, FileText, Upload,
} from 'lucide-react';
import type {
  OutgoingLetter, OutgoingLetterAttachment, OutgoingLetterStatus,
  LetterTemplate, OrgLetterhead, SignatureAsset,
} from '../types';

// ============================================================
// Surat Keluar — Fase 2 (alur inti)
// ============================================================
// Halaman ini murni lapisan UX di atas endpoint yang sudah dibangun:
// - CRUD Draft: lewat /api/data/outgoingLetters generik (PUT/POST/DELETE
//   ditolak server begitu status sudah lewat Draft — lihat data.ts).
// - Transisi status (Ajukan/Kembalikan/Periksa/Tandatangani/Kirim/Arsipkan):
//   lewat /api/outgoing-letters/:id/... (server/routes/outgoingLetters.ts),
//   yang memvalidasi urutan status & mencatat Log Aktivitas otomatis.
// - PDF final dirender DI BROWSER (jsPDF, sudah dependency proyek — bukan
//   library baru) memakai kop surat (orgLetterhead) + isi surat + gambar TTD
//   & cap (signatureAssets) — hasilnya (base64) baru dikirim ke server saat
//   pejabat mengklik "Tandatangani", dikunci sebagai finalPdfData yang
//   immutable setelahnya (Bagian 4 rencana Fase 2).

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024; // 2MB — pola sama attestationDocuments

const STATUS_META: Record<OutgoingLetterStatus, { label: string; color: string; bg: string; border: string }> = {
  Draft:          { label: 'Draft',           color: '#475569', bg: '#f1f5f9', border: '#e2e8f0' },
  Diajukan:       { label: 'Diajukan',        color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  Diperiksa:      { label: 'Diperiksa',       color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
  Ditandatangani: { label: 'Ditandatangani',  color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  Terkirim:       { label: 'Terkirim',        color: '#5b21b6', bg: '#f5f3ff', border: '#ddd6fe' },
  Diarsipkan:     { label: 'Diarsipkan',      color: '#334155', bg: '#f8fafc', border: '#e2e8f0' },
};

function StatusBadge({ status }: { status: OutgoingLetterStatus }) {
  const m = STATUS_META[status] || STATUS_META.Draft;
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

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(createdBy: string): Partial<OutgoingLetter> {
  return {
    status: 'Draft',
    letterDate: todayISODate(),
    jenisSuratId: '',
    replacesLetterId: undefined,
    templateId: undefined,
    subject: '',
    recipientName: '',
    recipientInstitution: '',
    body: '',
    memberId: undefined,
    sectorId: undefined,
    createdBy,
  };
}

/** Render PDF final (kop surat + isi + TTD + cap) di browser dengan jsPDF, kembalikan
 *  base64 (tanpa prefix data URL) — dipakai baik untuk pratinjau maupun payload yang
 *  dikirim ke endpoint /tandatangani. jsPDF dimuat dinamis (import()) supaya bundle
 *  awal halaman ini tidak membengkak untuk pengguna yang cuma melihat daftar surat. */
async function buildLetterPdfBase64(params: {
  letter: Partial<OutgoingLetter>;
  letterhead: OrgLetterhead | null;
  signature?: SignatureAsset;
  stamp?: SignatureAsset;
  signerName: string;
}): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const { letter, letterhead, signature, stamp, signerName } = params;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const marginX = 20;
  let y = 15;

  if (letterhead?.logoData) {
    try {
      const fmt = (letterhead.logoMimeType || '').includes('png') ? 'PNG' : 'JPEG';
      doc.addImage(`data:${letterhead.logoMimeType};base64,${letterhead.logoData}`, fmt as any, marginX, y, 18, 18);
    } catch { /* logo gagal dirender — surat tetap dilanjutkan tanpa logo */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(letterhead?.churchName || '(Nama Gereja belum diatur)', marginX + 22, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const contactLine = [letterhead?.address, letterhead?.phone, letterhead?.email].filter(Boolean).join(' • ');
  if (contactLine) doc.text(contactLine, marginX + 22, y + 12, { maxWidth: pageWidth - marginX * 2 - 22 });

  y += 22;
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.6);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 8;

  doc.setFontSize(10);
  doc.text(`Nomor: ${letter.letterNumber || '(belum diterbitkan)'}`, marginX, y); y += 6;
  doc.text(`Perihal: ${letter.subject || '-'}`, marginX, y); y += 10;

  doc.text('Kepada Yth.', marginX, y); y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(letter.recipientName || '-', marginX, y);
  doc.setFont('helvetica', 'normal');
  if (letter.recipientInstitution) { y += 5; doc.text(letter.recipientInstitution, marginX, y); }
  y += 10;

  const bodyLines = doc.splitTextToSize(letter.body || '', pageWidth - marginX * 2);
  doc.text(bodyLines, marginX, y);
  y += bodyLines.length * 5 + 20;

  const signX = pageWidth - marginX - 50;
  doc.text('Hormat kami,', signX, y);
  const imgY = y + 4;
  if (stamp?.imageData) {
    try {
      const fmt = (stamp.mimeType || '').includes('png') ? 'PNG' : 'JPEG';
      doc.addImage(`data:${stamp.mimeType};base64,${stamp.imageData}`, fmt as any, signX + 20, imgY, 22, 22);
    } catch { /* cap gagal dirender — TTD tetap dilanjutkan */ }
  }
  if (signature?.imageData) {
    try {
      const fmt = (signature.mimeType || '').includes('png') ? 'PNG' : 'JPEG';
      doc.addImage(`data:${signature.mimeType};base64,${signature.imageData}`, fmt as any, signX, imgY + 2, 30, 15);
    } catch { /* TTD gagal dirender — nama penandatangan tetap tercetak */ }
  }
  doc.text(signerName || '-', signX, imgY + 26);

  const dataUri = doc.output('datauristring') as string;
  return dataUri.split(',')[1] || '';
}

function openBase64PdfInNewTab(base64: string) {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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

export function OutgoingLetters() {
  const { currentUser, can, masterDataItems = [], members = [], sectors = [], pendingLetterDraft, setPendingLetterDraft } = useApp();
  const canCreate = can('letters-outgoing', 'create');
  const canEditPerm = can('letters-outgoing', 'edit');
  const canApprove = can('letters-outgoing', 'approve');

  const jenisOptions = useMemo(
    () => masterDataItems.filter(m => m.category === 'jenis_surat_keluar' && m.isActive).sort((a, b) => a.order - b.order),
    [masterDataItems]
  );
  const jenisLabel = useCallback((id?: string) => jenisOptions.find(j => j.id === id)?.label || id || '-', [jenisOptions]);

  const [view, setView] = useState<'list' | 'edit'>('list');
  const [letters, setLetters] = useState<OutgoingLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OutgoingLetterStatus | 'all'>('all');

  const [templates, setTemplates] = useState<LetterTemplate[]>([]);
  const [letterhead, setLetterhead] = useState<OrgLetterhead | null>(null);
  const [signatureAssets, setSignatureAssets] = useState<SignatureAsset[]>([]);

  const [current, setCurrent] = useState<Partial<OutgoingLetter> | null>(null);
  const [attachments, setAttachments] = useState<OutgoingLetterAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const [reasonModal, setReasonModal] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [signModal, setSignModal] = useState(false);
  const [signPreview, setSignPreview] = useState<string | null>(null);
  const [signaturePick, setSignaturePick] = useState<string>('');
  const [stampPick, setStampPick] = useState<string>('');

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<OutgoingLetter[]>('/api/data/outgoingLetters');
      setLetters(rows.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')));
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat daftar surat keluar');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSupportingData = useCallback(async () => {
    try {
      const [tpl, lh, sig] = await Promise.all([
        api.get<LetterTemplate[]>('/api/data/letterTemplates'),
        api.get<OrgLetterhead[]>('/api/data/orgLetterhead'),
        api.get<SignatureAsset[]>('/api/data/signatureAssets'),
      ]);
      setTemplates(tpl.filter(t => t.isActive));
      setLetterhead(lh.find(r => r.id === 'default') || null);
      setSignatureAssets(sig.filter(s => s.isActive));
    } catch {
      // data pendukung opsional untuk daftar — kalau gagal dimuat, halaman tetap
      // bisa dipakai (cuma pratinjau PDF/template yang akan terbatas)
    }
  }, []);

  useEffect(() => { loadList(); loadSupportingData(); }, [loadList, loadSupportingData]);

  // Konsumsi prefill dari Sakramen/Atestasi (gap-fix Sept 2026, lihat
  // AppContext.pendingLetterDraft) — begitu halaman ini mount dengan prefill
  // menunggu, langsung buka editor Surat Baru terisi, lalu kosongkan lagi
  // supaya tidak "nyangkut" untuk kunjungan berikutnya ke halaman ini.
  useEffect(() => {
    if (!pendingLetterDraft) return;
    setCurrent({
      ...emptyDraft(currentUser?.id || ''),
      memberId: pendingLetterDraft.memberId,
      recipientName: pendingLetterDraft.recipientName || '',
      recipientInstitution: pendingLetterDraft.recipientInstitution || '',
      subject: pendingLetterDraft.subject || '',
      body: pendingLetterDraft.body || '',
      relatedModule: pendingLetterDraft.relatedModule,
      relatedId: pendingLetterDraft.relatedId,
    });
    setAttachments([]);
    setView('edit');
    setPendingLetterDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLetterDraft]);

  const loadAttachments = useCallback(async (letterId: string) => {
    try {
      const rows = await api.get<OutgoingLetterAttachment[]>('/api/data/outgoingLetterAttachments');
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

  const openExisting = (letter: OutgoingLetter) => {
    setCurrent(letter);
    loadAttachments(letter.id);
    setView('edit');
  };

  const backToList = () => {
    setCurrent(null);
    setView('list');
    loadList();
  };

  const applyTemplate = (templateId: string) => {
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;
    setCurrent(prev => prev && ({
      ...prev,
      templateId,
      jenisSuratId: prev.jenisSuratId || tpl.jenisSuratId,
      body: prev.body ? prev.body : (tpl.bodyTemplate || ''),
    }));
    toast.success(`Template "${tpl.name}" disisipkan — placeholder bisa diedit manual`);
  };

  const handleSaveDraft = async () => {
    if (!current) return;
    if (!current.jenisSuratId) { toast.error('Jenis surat wajib dipilih'); return; }
    if (!current.subject?.trim()) { toast.error('Perihal wajib diisi'); return; }
    if (!current.recipientName?.trim()) { toast.error('Nama penerima wajib diisi'); return; }
    setSaving(true);
    try {
      const isNew = !current.id;
      const id = current.id || `outl_${Date.now()}`;
      const payload: OutgoingLetter = {
        id,
        status: 'Draft',
        letterDate: current.letterDate || todayISODate(),
        templateId: current.templateId,
        jenisSuratId: current.jenisSuratId!,
        subject: current.subject!.trim(),
        recipientName: current.recipientName!.trim(),
        recipientInstitution: current.recipientInstitution?.trim() || undefined,
        body: current.body || '',
        sectorId: current.sectorId,
        memberId: current.memberId,
        relatedModule: current.relatedModule,
        relatedId: current.relatedId,
        replacesLetterId: current.replacesLetterId || undefined,
        createdBy: current.createdBy || currentUser?.id || '',
        createdAt: current.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rejectReason: current.rejectReason,
      };
      if (isNew) {
        await api.post('/api/data/outgoingLetters', payload);
      } else {
        await api.put(`/api/data/outgoingLetters/${id}`, payload);
      }
      toast.success('Draft surat disimpan');
      setCurrent(payload);
      if (isNew) loadAttachments(id);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan draft');
    } finally {
      setSaving(false);
    }
  };

  const runTransition = async (action: string, body?: any) => {
    if (!current?.id) return;
    setBusyAction(action);
    try {
      const res = await api.put<{ success: boolean; letterNumber?: string; error?: string }>(
        `/api/outgoing-letters/${current.id}/${action}`, body || {}
      );
      const fresh = await api.get<OutgoingLetter[]>('/api/data/outgoingLetters');
      const updated = fresh.find(l => l.id === current.id);
      if (updated) setCurrent(updated);
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
    if (!window.confirm('Hapus draft surat ini?')) return;
    try {
      await api.delete(`/api/data/outgoingLetters/${current.id}`);
      // Audit gap fix: hapus juga semua lampiran (outgoingLetterAttachments)
      // milik draft ini -- sebelumnya tidak ada cascade delete sama sekali,
      // jadi file PDF (base64, s.d. 2MB per lampiran) numpuk permanen di
      // gemas_store menunjuk ke letterId yang sudah tidak ada. Pola bug yang
      // sama seperti yang sudah diperbaiki di AssetManagement/ResourceLibrary/
      // AidDistribution. Non-blocking: draft tetap terhapus walau salah satu
      // cleanup lampiran gagal.
      await Promise.all(attachments.map(att =>
        api.delete(`/api/data/outgoingLetterAttachments/${att.id}`).catch(() => {})
      ));
      toast.success('Draft dihapus');
      backToList();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus draft');
    }
  };

  const handleUploadAttachment = async (file: File) => {
    if (!current?.id) { toast.error('Simpan draft terlebih dahulu sebelum menambah lampiran'); return; }
    if (file.type !== 'application/pdf') { toast.error('Hanya file PDF yang diperbolehkan'); return; }
    if (file.size > MAX_ATTACHMENT_BYTES) { toast.error('Ukuran file melebihi batas 2MB'); return; }
    setUploadingAttachment(true);
    try {
      const base64 = await fileToBase64(file);
      const id = `outatt_${Date.now()}`;
      const data: OutgoingLetterAttachment = {
        id, letterId: current.id, fileName: file.name, fileSize: file.size,
        mimeType: file.type, fileData: base64, uploadedAt: new Date().toISOString(), uploadedBy: currentUser?.id,
      };
      await api.post('/api/data/outgoingLetterAttachments', data);
      setAttachments(prev => [...prev, data]);
      toast.success('Lampiran ditambahkan');
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengunggah lampiran');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDeleteAttachment = async (att: OutgoingLetterAttachment) => {
    if (!window.confirm(`Hapus lampiran "${att.fileName}"?`)) return;
    try {
      await api.delete(`/api/data/outgoingLetterAttachments/${att.id}`);
      setAttachments(prev => prev.filter(a => a.id !== att.id));
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus lampiran');
    }
  };

  const openSignModal = () => {
    const ownSig = signatureAssets.find(a => a.type === 'signature' && a.ownerId === currentUser?.id);
    const orgStamp = signatureAssets.find(a => a.type === 'stamp' && a.ownerId === 'org');
    setSignaturePick(ownSig?.id || '');
    setStampPick(orgStamp?.id || '');
    setSignPreview(null);
    setSignModal(true);
  };

  const handlePreviewSign = async () => {
    if (!current) return;
    try {
      const signature = signatureAssets.find(a => a.id === signaturePick);
      const stamp = signatureAssets.find(a => a.id === stampPick);
      const base64 = await buildLetterPdfBase64({
        letter: current, letterhead, signature, stamp, signerName: currentUser?.name || '',
      });
      setSignPreview(base64);
      openBase64PdfInNewTab(base64);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal membuat pratinjau PDF');
    }
  };

  const handleConfirmSign = async () => {
    if (!current?.id) return;
    let base64 = signPreview;
    if (!base64) {
      const signature = signatureAssets.find(a => a.id === signaturePick);
      const stamp = signatureAssets.find(a => a.id === stampPick);
      base64 = await buildLetterPdfBase64({ letter: current, letterhead, signature, stamp, signerName: currentUser?.name || '' });
    }
    const ok = await runTransition('tandatangani', {
      finalPdfData: base64,
      signatureAssetId: signaturePick || undefined,
      stampAssetId: stampPick || undefined,
    });
    if (ok) setSignModal(false);
  };

  const status = current?.status || 'Draft';
  const isDraft = status === 'Draft';

  const filteredLetters = statusFilter === 'all' ? letters : letters.filter(l => l.status === statusFilter);

  if (view === 'list') {
    return (
      <div className="space-y-5 pb-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: '#e0f2fe' }}>
              <Send className="w-5.5 h-5.5" style={{ color: '#0369a1' }} />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ color: '#1e293b' }}>Surat Keluar</h1>
              <p className="text-sm" style={{ color: '#64748b' }}>Draft → Diajukan → Diperiksa → Ditandatangani → Terkirim → Diarsipkan.</p>
            </div>
          </div>
          {canCreate && (
            <button onClick={openNew} className="px-3.5 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-1.5" style={{ background: '#0369a1' }}>
              <Plus className="w-4 h-4" /> Buat Surat Baru
            </button>
          )}
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'Draft', 'Diajukan', 'Diperiksa', 'Ditandatangani', 'Terkirim', 'Diarsipkan'] as const).map(s => (
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
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">No. Surat</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Perihal</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Penerima</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Jenis</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLetters.map(l => (
                  <tr key={l.id} className="border-t cursor-pointer hover:bg-slate-50" style={{ borderColor: '#e2e8f0' }} onClick={() => openExisting(l)}>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{l.letterNumber || '—'}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{l.subject}</td>
                    <td className="px-4 py-2.5 text-slate-600">{l.recipientName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{jenisLabel(l.jenisSuratId)}</td>
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
            {current?.id ? (current.subject || '(Tanpa perihal)') : 'Surat Baru'}
            <StatusBadge status={status} />
          </h1>
          {current?.letterNumber && <p className="text-xs font-mono text-slate-500">{current.letterNumber}</p>}
        </div>
      </div>

      {current?.rejectReason && status === 'Draft' && (
        <div className="text-xs px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
          Surat ini pernah dikembalikan. Alasan: {current.rejectReason}
        </div>
      )}

      <Card className="p-5 space-y-4 max-w-3xl">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Jenis Surat</label>
            <select disabled={!isDraft} value={current?.jenisSuratId || ''}
              onChange={e => setCurrent(prev => prev && ({ ...prev, jenisSuratId: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm bg-white disabled:bg-slate-50" style={{ borderColor: '#e2e8f0' }}>
              <option value="">— Pilih jenis surat —</option>
              {jenisOptions.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Tanggal Surat</label>
            <input type="date" disabled={!isDraft} value={current?.letterDate || ''}
              onChange={e => setCurrent(prev => prev && ({ ...prev, letterDate: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm disabled:bg-slate-50" style={{ borderColor: '#e2e8f0' }} />
          </div>
        </div>

        {isDraft && templates.filter(t => !current?.jenisSuratId || t.jenisSuratId === current.jenisSuratId).length > 0 && (
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Pakai Template</label>
            <select value="" onChange={e => e.target.value && applyTemplate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm bg-white" style={{ borderColor: '#e2e8f0' }}>
              <option value="">— Sisipkan dari template (opsional) —</option>
              {templates.filter(t => !current?.jenisSuratId || t.jenisSuratId === current.jenisSuratId).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Perihal</label>
          <input disabled={!isDraft} value={current?.subject || ''} onChange={e => setCurrent(prev => prev && ({ ...prev, subject: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border text-sm disabled:bg-slate-50" style={{ borderColor: '#e2e8f0' }} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Nama Penerima</label>
            <input disabled={!isDraft} value={current?.recipientName || ''} onChange={e => setCurrent(prev => prev && ({ ...prev, recipientName: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm disabled:bg-slate-50" style={{ borderColor: '#e2e8f0' }} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Institusi Penerima (opsional)</label>
            <input disabled={!isDraft} value={current?.recipientInstitution || ''} onChange={e => setCurrent(prev => prev && ({ ...prev, recipientInstitution: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm disabled:bg-slate-50" style={{ borderColor: '#e2e8f0' }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Jemaat Terkait (opsional)</label>
            <select disabled={!isDraft} value={current?.memberId || ''}
              onChange={e => {
                const memberId = e.target.value || undefined;
                const member = members.find(m => m.id === memberId);
                setCurrent(prev => prev && ({
                  ...prev,
                  memberId,
                  recipientName: (!prev.recipientName && member) ? member.fullName : prev.recipientName,
                }));
              }}
              className="w-full px-3 py-2 rounded-lg border text-sm bg-white disabled:bg-slate-50" style={{ borderColor: '#e2e8f0' }}>
              <option value="">— Tidak terhubung ke jemaat tertentu —</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Kalau dipilih, surat ini otomatis muncul di Dokumen Jemaat begitu diarsipkan.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Sektor (opsional)</label>
            <select disabled={!isDraft} value={current?.sectorId || ''}
              onChange={e => setCurrent(prev => prev && ({ ...prev, sectorId: e.target.value || undefined }))}
              className="w-full px-3 py-2 rounded-lg border text-sm bg-white disabled:bg-slate-50" style={{ borderColor: '#e2e8f0' }}>
              <option value="">— Tidak per sektor —</option>
              {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        {/* Audit gap fix: field replacesLetterId sudah lama ada di tipe
            OutgoingLetter (untuk menandai surat ini revisi/pengganti surat
            yang sudah ditandatangani) tapi belum pernah punya UI sama sekali.
            Hanya bisa dipilih saat masih Draft, sama seperti field lain di
            atas. Daftar pilihan dibatasi ke surat yang statusnya sudah lewat
            tahap tandatangan (sudah punya letterNumber resmi) dan bukan
            dirinya sendiri. */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Surat yang Digantikan/Direvisi (opsional)</label>
          <select disabled={!isDraft} value={current?.replacesLetterId || ''}
            onChange={e => setCurrent(prev => prev && ({ ...prev, replacesLetterId: e.target.value || undefined }))}
            className="w-full px-3 py-2 rounded-lg border text-sm bg-white disabled:bg-slate-50" style={{ borderColor: '#e2e8f0' }}>
            <option value="">— Bukan revisi/pengganti surat lain —</option>
            {letters
              .filter(l => l.id !== current?.id && !!l.letterNumber)
              .map(l => (
                <option key={l.id} value={l.id}>{l.letterNumber} — {l.subject}</option>
              ))}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">Pilih kalau surat ini menggantikan/merevisi surat resmi yang sudah pernah ditandatangani sebelumnya.</p>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Isi Surat</label>
          <textarea disabled={!isDraft} rows={10} value={current?.body || ''} onChange={e => setCurrent(prev => prev && ({ ...prev, body: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border text-sm disabled:bg-slate-50" style={{ borderColor: '#e2e8f0' }} />
        </div>

        {isDraft && (
          <div className="flex items-center gap-2 pt-2">
            <button onClick={handleSaveDraft} disabled={saving} className="px-3.5 py-2 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#0369a1' }}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} <Save className="w-3.5 h-3.5" /> Simpan Draft
            </button>
            {current?.id && (
              <button onClick={handleDeleteDraft} className="px-3.5 py-2 rounded-lg text-sm text-red-600 border border-red-200 flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Hapus Draft
              </button>
            )}
          </div>
        )}
      </Card>

      {current?.id && (
        <Card className="p-5 space-y-3 max-w-3xl">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4" style={{ color: '#0369a1' }} />
            <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>Lampiran Pendukung</h3>
          </div>
          {attachments.length === 0 && <p className="text-sm text-slate-400">Belum ada lampiran.</p>}
          {attachments.map(att => (
            <div key={att.id} className="flex items-center justify-between p-2 rounded-lg border" style={{ borderColor: '#f1f5f9' }}>
              <span className="text-sm text-slate-700 truncate flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-slate-400" /> {att.fileName}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => downloadBase64Pdf(att.fileData, att.fileName)} className="p-1.5 rounded hover:bg-slate-100"><Download className="w-3.5 h-3.5 text-slate-500" /></button>
                {isDraft && <button onClick={() => handleDeleteAttachment(att)} className="p-1.5 rounded hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
              </div>
            </div>
          ))}
          {isDraft && (
            <label className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer px-2.5 py-1.5 rounded-lg" style={{ background: '#e0f2fe', color: '#0369a1' }}>
              {uploadingAttachment ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Tambah Lampiran (PDF, maks 2MB)
              <input type="file" accept="application/pdf" className="hidden" disabled={uploadingAttachment}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleUploadAttachment(f); }} />
            </label>
          )}
        </Card>
      )}

      {current?.id && status !== 'Draft' && (
        <Card className="p-5 space-y-2 max-w-3xl text-sm">
          {current.submittedAt && <p className="text-slate-500">Diajukan: {new Date(current.submittedAt).toLocaleString('id-ID')}</p>}
          {current.checkedAt && <p className="text-slate-500">Diperiksa: {new Date(current.checkedAt).toLocaleString('id-ID')}</p>}
          {current.signedAt && <p className="text-slate-500">Ditandatangani: {new Date(current.signedAt).toLocaleString('id-ID')}</p>}
          {current.sentAt && <p className="text-slate-500">Terkirim: {new Date(current.sentAt).toLocaleString('id-ID')}{current.sentVia ? ` via ${current.sentVia}` : ''}</p>}
          {current.archivedAt && <p className="text-slate-500">Diarsipkan: {new Date(current.archivedAt).toLocaleString('id-ID')}</p>}
          {current.finalPdfData && (
            <div className="flex items-center gap-2 pt-1">
              <button onClick={() => openBase64PdfInNewTab(current.finalPdfData!)} className="px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5" style={{ borderColor: '#e2e8f0' }}>
                <Eye className="w-3.5 h-3.5" /> Lihat PDF Final
              </button>
              <button onClick={() => downloadBase64Pdf(current.finalPdfData!, `${current.letterNumber || current.id}.pdf`)} className="px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5" style={{ borderColor: '#e2e8f0' }}>
                <Download className="w-3.5 h-3.5" /> Unduh PDF
              </button>
            </div>
          )}
        </Card>
      )}

      {current?.id && (
        <div className="flex items-center gap-2 flex-wrap max-w-3xl">
          {status === 'Draft' && canEditPerm && (
            <button onClick={() => runTransition('submit')} disabled={busyAction !== null}
              className="px-3.5 py-2 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#0369a1' }}>
              {busyAction === 'submit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Ajukan
            </button>
          )}
          {status === 'Diajukan' && canEditPerm && (
            <>
              <button onClick={() => runTransition('periksa')} disabled={busyAction !== null}
                className="px-3.5 py-2 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#166534' }}>
                {busyAction === 'periksa' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Periksa & Setujui
              </button>
              <button onClick={() => { setReasonText(''); setReasonModal(true); }} disabled={busyAction !== null}
                className="px-3.5 py-2 rounded-lg text-sm text-slate-600 border flex items-center gap-1.5" style={{ borderColor: '#e2e8f0' }}>
                <RotateCcw className="w-3.5 h-3.5" /> Kembalikan
              </button>
            </>
          )}
          {status === 'Diperiksa' && canApprove && (
            <>
              <button onClick={openSignModal} disabled={busyAction !== null}
                className="px-3.5 py-2 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#166534' }}>
                <PenTool className="w-3.5 h-3.5" /> Pratinjau & Tandatangani
              </button>
              <button onClick={() => { setReasonText(''); setReasonModal(true); }} disabled={busyAction !== null}
                className="px-3.5 py-2 rounded-lg text-sm text-slate-600 border flex items-center gap-1.5" style={{ borderColor: '#e2e8f0' }}>
                <RotateCcw className="w-3.5 h-3.5" /> Kembalikan
              </button>
            </>
          )}
          {status === 'Ditandatangani' && canEditPerm && (
            <button onClick={() => runTransition('kirim')} disabled={busyAction !== null}
              className="px-3.5 py-2 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#5b21b6' }}>
              {busyAction === 'kirim' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Tandai Terkirim
            </button>
          )}
          {status === 'Terkirim' && canEditPerm && (
            <button onClick={() => runTransition('arsipkan')} disabled={busyAction !== null}
              className="px-3.5 py-2 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#334155' }}>
              {busyAction === 'arsipkan' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />} Arsipkan
            </button>
          )}
        </div>
      )}

      {reasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => busyAction === null && setReasonModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#e2e8f0' }}>
              <h3 className="text-sm font-semibold text-slate-800">Kembalikan Surat ke Draft</h3>
              <button onClick={() => setReasonModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-5">
              <label className="text-xs font-medium text-slate-600 block mb-1">Alasan Pengembalian <span className="text-red-500">*</span></label>
              <textarea value={reasonText} onChange={e => setReasonText(e.target.value)} rows={4}
                className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: '#e2e8f0' }} />
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: '#e2e8f0' }}>
              <button onClick={() => setReasonModal(false)} disabled={busyAction !== null} className="px-3.5 py-2 rounded-lg text-sm text-slate-600 border" style={{ borderColor: '#e2e8f0' }}>Batal</button>
              <button
                onClick={async () => {
                  if (!reasonText.trim()) { toast.error('Alasan wajib diisi'); return; }
                  const ok = await runTransition('kembalikan', { reason: reasonText.trim() });
                  if (ok) setReasonModal(false);
                }}
                disabled={busyAction !== null}
                className="px-3.5 py-2 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#b91c1c' }}>
                {busyAction === 'kembalikan' && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Kembalikan
              </button>
            </div>
          </div>
        </div>
      )}

      {signModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => busyAction === null && setSignModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#e2e8f0' }}>
              <h3 className="text-sm font-semibold text-slate-800">Pratinjau & Tandatangani</h3>
              <button onClick={() => setSignModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Tanda Tangan</label>
                <select value={signaturePick} onChange={e => { setSignaturePick(e.target.value); setSignPreview(null); }}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-white" style={{ borderColor: '#e2e8f0' }}>
                  <option value="">— Tanpa gambar TTD —</option>
                  {signatureAssets.filter(a => a.type === 'signature' && a.ownerId === currentUser?.id).map(a => (
                    <option key={a.id} value={a.id}>TTD saya</option>
                  ))}
                </select>
                {!signatureAssets.some(a => a.type === 'signature' && a.ownerId === currentUser?.id) && (
                  <p className="text-[11px] text-amber-600 mt-1">Anda belum mengunggah gambar TTD — atur di Pengaturan Surat Menyurat.</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Cap Organisasi</label>
                <select value={stampPick} onChange={e => { setStampPick(e.target.value); setSignPreview(null); }}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-white" style={{ borderColor: '#e2e8f0' }}>
                  <option value="">— Tanpa cap —</option>
                  {signatureAssets.filter(a => a.type === 'stamp' && a.ownerId === 'org').map(a => (
                    <option key={a.id} value={a.id}>Cap organisasi</option>
                  ))}
                </select>
              </div>
              <button onClick={handlePreviewSign} className="w-full px-3 py-2 rounded-lg text-sm border flex items-center justify-center gap-1.5" style={{ borderColor: '#e2e8f0' }}>
                <Eye className="w-3.5 h-3.5" /> Lihat Pratinjau PDF (buka tab baru)
              </button>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: '#e2e8f0' }}>
              <button onClick={() => setSignModal(false)} disabled={busyAction !== null} className="px-3.5 py-2 rounded-lg text-sm text-slate-600 border" style={{ borderColor: '#e2e8f0' }}>Batal</button>
              <button onClick={handleConfirmSign} disabled={busyAction !== null}
                className="px-3.5 py-2 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#166534' }}>
                {busyAction === 'tandatangani' && <Loader2 className="w-3.5 h-3.5 animate-spin" />} <PenTool className="w-3.5 h-3.5" /> Konfirmasi Tandatangani
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
