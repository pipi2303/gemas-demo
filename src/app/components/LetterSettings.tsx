import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../../lib/apiClient';
import { toast } from 'sonner';
import { Card } from './ui/card';
import {
  Mail, Building2, Hash, PenTool, Upload, Save, Loader2,
  ImageIcon, Stamp, Trash2, Eye,
} from 'lucide-react';
import type { OrgLetterhead, LetterNumberFormat, SignatureAsset } from '../types';

// ============================================================
// Pengaturan Surat Menyurat — Fase 1 (Fondasi)
// ============================================================
// Tiga halaman pengaturan (Kop Surat / Format Nomor / TTD & Cap) yang dijanjikan
// di plan Fase 1. Semuanya SENGAJA dibangun kosong — tidak ada data contoh yang
// saya isi — karena gereja belum punya logo/format nomor/cap yang bisa dijadikan
// acuan saat ini. Admin mengisi sendiri lewat form di bawah, kapan pun siap.
//
// Manajemen isi template surat (LetterTemplate.bodyTemplate) SENGAJA belum ada
// UI-nya di sini — itu dibangun di Fase 2 bersamaan alur pembuatan Surat Keluar,
// supaya desain body-editor-nya langsung selaras dengan halaman itu.

const MAX_IMAGE_BYTES = 1 * 1024 * 1024; // 1MB — cukup untuk logo/TTD/cap (PNG/JPG)

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

function validateImage(file: File): string | null {
  const isImage = file.type === 'image/png' || file.type === 'image/jpeg';
  if (!isImage) return 'Hanya file PNG atau JPG yang diperbolehkan';
  if (file.size > MAX_IMAGE_BYTES) return `Ukuran file melebihi batas 1MB (file ini ${formatBytes(file.size)})`;
  return null;
}

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

type TabKey = 'kop-surat' | 'format-nomor' | 'ttd-cap';

export function LetterSettings() {
  const { currentUser, can, users = [], masterDataItems = [] } = useApp();
  const canEdit = can('letter-settings', 'edit');

  const [activeTab, setActiveTab] = useState<TabKey>('kop-surat');

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: '#e0f2fe' }}>
          <Mail className="w-5.5 h-5.5" style={{ color: '#0369a1' }} />
        </div>
        <div>
          <h1 className="text-lg font-bold" style={{ color: '#1e293b' }}>Pengaturan Surat Menyurat</h1>
          <p className="text-sm" style={{ color: '#64748b' }}>
            Kop surat, format nomor otomatis, serta TTD & cap — diisi sekali di sini, dipakai di semua surat keluar.
          </p>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: '#f1f5f9' }}>
        {([
          ['kop-surat', 'Kop Surat', Building2],
          ['format-nomor', 'Format Nomor', Hash],
          ['ttd-cap', 'TTD & Cap', PenTool],
        ] as [TabKey, string, any][]).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className="px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-1.5"
            style={activeTab === key
              ? { background: '#ffffff', color: '#0369a1', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
              : { background: 'transparent', color: '#64748b' }}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {!canEdit && (
        <div className="text-xs px-3 py-2 rounded-lg" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
          Anda hanya bisa melihat pengaturan ini (mode baca) — hubungi Admin untuk mengubahnya.
        </div>
      )}

      {activeTab === 'kop-surat' && <KopSuratTab canEdit={canEdit} currentUser={currentUser} />}
      {activeTab === 'format-nomor' && <FormatNomorTab canEdit={canEdit} currentUser={currentUser} masterDataItems={masterDataItems} />}
      {activeTab === 'ttd-cap' && <TtdCapTab canEdit={canEdit} currentUser={currentUser} users={users} />}
    </div>
  );
}

// ── Tab: Kop Surat ────────────────────────────────────────────────────────────
function KopSuratTab({ canEdit, currentUser }: { canEdit: boolean; currentUser: any }) {
  const [form, setForm] = useState<Partial<OrgLetterhead>>({ id: 'default' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<OrgLetterhead[]>('/api/data/orgLetterhead');
      const existing = rows.find(r => r.id === 'default');
      if (existing) setForm(existing);
    } catch {
      // belum ada data — form tetap kosong, itu wajar untuk pengaturan yang belum pernah diisi
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleLogoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = validateImage(file);
    if (err) { toast.error(err); return; }
    try {
      const base64 = await fileToBase64(file);
      setForm(prev => ({ ...prev, logoData: base64, logoMimeType: file.type }));
    } catch {
      toast.error('Gagal membaca file logo');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data: OrgLetterhead = {
        id: 'default',
        churchName: form.churchName || '',
        churchCode: form.churchCode || '',
        address: form.address || '',
        phone: form.phone || '',
        email: form.email || '',
        logoData: form.logoData,
        logoMimeType: form.logoMimeType,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Administrator',
      };
      await api.put('/api/data/orgLetterhead/default', data);
      setForm(data);
      toast.success('Kop surat tersimpan');
    } catch {
      toast.error('Gagal menyimpan kop surat');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Memuat…</div>;

  return (
    <Card className="p-5 space-y-4 max-w-2xl">
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center gap-2">
          <div className="w-24 h-24 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden" style={{ borderColor: '#cbd5e1', background: '#f8fafc' }}>
            {form.logoData
              ? <img src={`data:${form.logoMimeType};base64,${form.logoData}`} alt="Logo Gereja" className="w-full h-full object-contain" />
              : <ImageIcon className="w-7 h-7 text-gray-300" />}
          </div>
          {canEdit && (
            <label className="text-xs font-medium cursor-pointer flex items-center gap-1 px-2.5 py-1.5 rounded-lg" style={{ background: '#e0f2fe', color: '#0369a1' }}>
              <Upload className="w-3 h-3" /> Unggah Logo
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleLogoSelected} />
            </label>
          )}
        </div>
        <div className="flex-1 grid grid-cols-2 gap-3">
          <Field label="Nama Gereja" value={form.churchName} onChange={v => setForm(p => ({ ...p, churchName: v }))} disabled={!canEdit} placeholder="mis. GPIB Bahtera Kasih" span2 />
          <Field label="Kode Gereja" value={form.churchCode} onChange={v => setForm(p => ({ ...p, churchCode: v }))} disabled={!canEdit} placeholder="mis. GPIB-BK" hint="Dipakai sebagai token {kodeGereja} di format nomor surat" />
          <Field label="Telepon" value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} disabled={!canEdit} placeholder="mis. (021) 123-4567" />
          <Field label="Alamat" value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} disabled={!canEdit} placeholder="Alamat lengkap gereja" span2 textarea />
          <Field label="Email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} disabled={!canEdit} placeholder="mis. sekretariat@gerejaanda.org" span2 />
        </div>
      </div>
      {canEdit && (
        <div className="flex justify-end pt-2 border-t" style={{ borderColor: '#f1f5f9' }}>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: '#0369a1' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan Kop Surat
          </button>
        </div>
      )}
    </Card>
  );
}

function Field({ label, value, onChange, disabled, placeholder, hint, span2, textarea }: {
  label: string; value?: string; onChange: (v: string) => void; disabled?: boolean;
  placeholder?: string; hint?: string; span2?: boolean; textarea?: boolean;
}) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="block mb-1 text-xs font-semibold" style={{ color: '#64748b' }}>{label}</label>
      {textarea ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} rows={2}
          className="w-full px-3 py-2 rounded-lg border text-sm disabled:bg-gray-50 disabled:text-gray-400" style={{ borderColor: '#e2e8f0' }} />
      ) : (
        <input value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg border text-sm disabled:bg-gray-50 disabled:text-gray-400" style={{ borderColor: '#e2e8f0' }} />
      )}
      {hint && <p className="mt-1 text-[11px]" style={{ color: '#94a3b8' }}>{hint}</p>}
    </div>
  );
}

// ── Tab: Format Nomor ─────────────────────────────────────────────────────────
function FormatNomorTab({ canEdit, currentUser, masterDataItems }: { canEdit: boolean; currentUser: any; masterDataItems: any[] }) {
  const jenisSuratList = useMemo(
    () => masterDataItems.filter(m => m.category === 'jenis_surat_keluar' && m.isActive),
    [masterDataItems]
  );

  const [selectedJenisId, setSelectedJenisId] = useState<string>('');
  const [formats, setFormats] = useState<LetterNumberFormat[]>([]);
  const [pattern, setPattern] = useState('{urut:3}/{jenis}/{kodeGereja}/{bulanRomawi}/{tahun}');
  const [resetPeriod, setResetPeriod] = useState<LetterNumberFormat['resetPeriod']>('tahunan');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [churchCode, setChurchCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, letterheadRows] = await Promise.all([
        api.get<LetterNumberFormat[]>('/api/data/letterNumberFormats'),
        api.get<OrgLetterhead[]>('/api/data/orgLetterhead'),
      ]);
      setFormats(rows);
      setChurchCode(letterheadRows.find(r => r.id === 'default')?.churchCode || '');
    } catch {
      // belum ada data tersimpan — wajar untuk pengaturan yang baru dibangun
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedJenisId) return;
    const existing = formats.find(f => f.jenisSuratId === selectedJenisId);
    if (existing) {
      setPattern(existing.pattern);
      setResetPeriod(existing.resetPeriod);
    } else {
      setPattern('{urut:3}/{jenis}/{kodeGereja}/{bulanRomawi}/{tahun}');
      setResetPeriod('tahunan');
    }
  }, [selectedJenisId, formats]);

  const selectedJenis = jenisSuratList.find(j => j.id === selectedJenisId);

  const preview = useMemo(() => {
    if (!selectedJenis) return '';
    const now = new Date();
    return pattern
      .replace(/\{urut(?::(\d+))?\}/g, (_m, pad) => pad ? '1'.padStart(Number(pad), '0') : '1')
      .replace(/\{jenis\}/g, selectedJenis.value || selectedJenis.label)
      .replace(/\{kodeGereja\}/g, churchCode || '(kode belum diisi)')
      .replace(/\{bulanRomawi\}/g, ROMAN_MONTHS[now.getMonth()])
      .replace(/\{tahun\}/g, String(now.getFullYear()))
      .replace(/\{sektor\}/g, '(sektor)');
  }, [pattern, selectedJenis, churchCode]);

  const handleSave = async () => {
    if (!selectedJenisId) { toast.error('Pilih jenis surat terlebih dahulu'); return; }
    if (!pattern.trim()) { toast.error('Pola nomor tidak boleh kosong'); return; }
    setSaving(true);
    try {
      const data: LetterNumberFormat = {
        id: selectedJenisId, // satu format per jenis surat — id format = id jenis surat
        jenisSuratId: selectedJenisId,
        pattern: pattern.trim(),
        resetPeriod,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || 'Administrator',
      };
      await api.put(`/api/data/letterNumberFormats/${selectedJenisId}`, data);
      setFormats(prev => [...prev.filter(f => f.id !== selectedJenisId), data]);
      toast.success('Format nomor tersimpan');
    } catch {
      toast.error('Gagal menyimpan format nomor');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Memuat…</div>;

  if (jenisSuratList.length === 0) {
    return (
      <Card className="p-6 max-w-2xl text-sm" style={{ color: '#64748b' }}>
        Belum ada <strong>Jenis Surat Keluar</strong> yang terdaftar. Tambahkan dulu lewat halaman{' '}
        <strong>Master Data → Surat Menyurat → Jenis Surat Keluar</strong> (mis. "Surat Keterangan Baptis",
        "Surat Undangan", dst), baru format nomornya bisa diatur di sini.
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-4 max-w-2xl">
      <div>
        <label className="block mb-1 text-xs font-semibold" style={{ color: '#64748b' }}>Jenis Surat</label>
        <select value={selectedJenisId} onChange={e => setSelectedJenisId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: '#e2e8f0' }}>
          <option value="">— Pilih jenis surat —</option>
          {jenisSuratList.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}
        </select>
      </div>

      {selectedJenisId && (
        <>
          <div>
            <label className="block mb-1 text-xs font-semibold" style={{ color: '#64748b' }}>Pola Nomor Surat</label>
            <input value={pattern} onChange={e => setPattern(e.target.value)} disabled={!canEdit}
              className="w-full px-3 py-2 rounded-lg border text-sm font-mono disabled:bg-gray-50" style={{ borderColor: '#e2e8f0' }} />
            <p className="mt-1 text-[11px]" style={{ color: '#94a3b8' }}>
              Token tersedia: <code>{'{urut}'}</code> atau <code>{'{urut:3}'}</code> (nomor urut, diberi angka nol di depan),{' '}
              <code>{'{jenis}'}</code> (kode jenis surat), <code>{'{kodeGereja}'}</code>, <code>{'{bulanRomawi}'}</code>,{' '}
              <code>{'{tahun}'}</code>, <code>{'{sektor}'}</code>.
            </p>
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold" style={{ color: '#64748b' }}>Reset Nomor Urut</label>
            <select value={resetPeriod} onChange={e => setResetPeriod(e.target.value as LetterNumberFormat['resetPeriod'])} disabled={!canEdit}
              className="w-full px-3 py-2 rounded-lg border text-sm disabled:bg-gray-50" style={{ borderColor: '#e2e8f0' }}>
              <option value="tahunan">Tahunan (mulai dari 1 lagi tiap tahun)</option>
              <option value="bulanan">Bulanan (mulai dari 1 lagi tiap bulan)</option>
              <option value="tidak_pernah">Tidak pernah reset (terus bertambah)</option>
            </select>
          </div>
          <div className="p-3 rounded-lg text-sm" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
            <span className="text-xs font-semibold" style={{ color: '#0369a1' }}>Contoh hasil: </span>
            <span className="font-mono font-semibold" style={{ color: '#0c4a6e' }}>{preview || '—'}</span>
          </div>
          {canEdit && (
            <div className="flex justify-end pt-2 border-t" style={{ borderColor: '#f1f5f9' }}>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: '#0369a1' }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan Format Nomor
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── Tab: TTD & Cap ────────────────────────────────────────────────────────────
function TtdCapTab({ canEdit, currentUser, users }: { canEdit: boolean; currentUser: any; users: any[] }) {
  const [assets, setAssets] = useState<SignatureAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<SignatureAsset[]>('/api/data/signatureAssets');
      setAssets(rows);
    } catch {
      // belum ada TTD/cap tersimpan — wajar
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stamp = assets.find(a => a.type === 'stamp' && a.ownerId === 'org');

  const handleUpload = async (id: string, ownerType: SignatureAsset['ownerType'], ownerId: string, type: SignatureAsset['type'], file: File) => {
    const err = validateImage(file);
    if (err) { toast.error(err); return; }
    setUploadingId(id);
    try {
      const base64 = await fileToBase64(file);
      const data: SignatureAsset = {
        id, ownerType, ownerId, type,
        imageData: base64, mimeType: file.type,
        isActive: true, uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser?.name || 'Administrator',
      };
      await api.put(`/api/data/signatureAssets/${id}`, data);
      setAssets(prev => [...prev.filter(a => a.id !== id), data]);
      toast.success(type === 'stamp' ? 'Cap organisasi tersimpan' : 'Tanda tangan tersimpan');
    } catch {
      toast.error('Gagal mengunggah gambar');
    } finally {
      setUploadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Hapus gambar ini?')) return;
    try {
      await api.delete(`/api/data/signatureAssets/${id}`);
      setAssets(prev => prev.filter(a => a.id !== id));
      toast.success('Berhasil dihapus');
    } catch {
      toast.error('Gagal menghapus');
    }
  };

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Memuat…</div>;

  return (
    <div className="space-y-5 max-w-2xl">
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Stamp className="w-4 h-4" style={{ color: '#0369a1' }} />
          <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>Cap Organisasi</h3>
        </div>
        <p className="text-xs" style={{ color: '#94a3b8' }}>
          Satu cap untuk semua surat keluar. Gunakan gambar PNG dengan latar transparan agar hasilnya rapi saat ditempel ke PDF.
        </p>
        <ImageSlot
          image={stamp}
          canEdit={canEdit}
          uploading={uploadingId === 'stamp-org'}
          onUpload={file => handleUpload('stamp-org', 'organization', 'org', 'stamp', file)}
          onDelete={stamp ? () => handleDelete('stamp-org') : undefined}
          emptyLabel="Belum ada cap organisasi"
        />
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <PenTool className="w-4 h-4" style={{ color: '#0369a1' }} />
          <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>Tanda Tangan Pejabat</h3>
        </div>
        <p className="text-xs" style={{ color: '#94a3b8' }}>
          Tiap pejabat yang berwenang menandatangani surat perlu gambar tanda tangannya diunggah di sini.
        </p>
        <div className="space-y-2">
          {users.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">Belum ada user terdaftar.</p>}
          {users.map(u => {
            const sig = assets.find(a => a.type === 'signature' && a.ownerId === u.id);
            return (
              <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-lg border" style={{ borderColor: '#f1f5f9' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: '#334155' }}>{u.name}</p>
                  <p className="text-[11px]" style={{ color: '#94a3b8' }}>{u.role}</p>
                </div>
                <ImageSlot
                  compact
                  image={sig}
                  canEdit={canEdit}
                  uploading={uploadingId === `sig-${u.id}`}
                  onUpload={file => handleUpload(`sig-${u.id}`, 'user', u.id, 'signature', file)}
                  onDelete={sig ? () => handleDelete(`sig-${u.id}`) : undefined}
                  emptyLabel="Belum ada TTD"
                />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function ImageSlot({ image, canEdit, uploading, onUpload, onDelete, emptyLabel, compact }: {
  image?: SignatureAsset; canEdit: boolean; uploading: boolean;
  onUpload: (file: File) => void; onDelete?: () => void; emptyLabel: string; compact?: boolean;
}) {
  const size = compact ? 'w-14 h-10' : 'w-40 h-24';
  return (
    <div className="flex items-center gap-3">
      <div className={`${size} rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden flex-shrink-0`} style={{ borderColor: '#cbd5e1', background: '#f8fafc' }}>
        {image
          ? <img src={`data:${image.mimeType};base64,${image.imageData}`} alt="" className="w-full h-full object-contain" />
          : <Eye className="w-4 h-4 text-gray-300" />}
      </div>
      {!compact && !image && <span className="text-xs text-gray-400">{emptyLabel}</span>}
      {canEdit && (
        <div className="flex items-center gap-1">
          <label className="text-xs font-medium cursor-pointer flex items-center gap-1 px-2.5 py-1.5 rounded-lg" style={{ background: '#e0f2fe', color: '#0369a1' }}>
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            {image ? 'Ganti' : 'Unggah'}
            <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f); }} />
          </label>
          {onDelete && (
            <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50" title="Hapus">
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
