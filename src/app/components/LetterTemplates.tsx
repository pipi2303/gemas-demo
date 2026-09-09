import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../../lib/apiClient';
import { toast } from 'sonner';
import { Card } from './ui/card';
import { FileText, Plus, Pencil, Trash2, Loader2, X, Save } from 'lucide-react';
import type { LetterTemplate } from '../types';

// ============================================================
// Template Surat — Fase 2
// ============================================================
// Halaman kecil untuk mengelola isi template surat (LetterTemplate.bodyTemplate)
// per jenis surat. Sengaja dipisah dari halaman Pengaturan Surat Menyurat (Fase 1)
// dan dari halaman Surat Keluar sendiri — supaya template bisa dikelola sekali,
// lalu dipakai berkali-kali saat staf membuat draft surat baru (lihat tombol
// "Pakai Template" di OutgoingLetters.tsx).
//
// Placeholder yang didukung di bodyTemplate (diganti manual oleh staf saat
// menulis draft — bukan mesin substitusi otomatis, supaya isi surat tetap bisa
// diedit bebas): {namaPenerima}, {tanggal}, {perihal}, {nomorSurat}.

function emptyForm(): Partial<LetterTemplate> {
  return { name: '', jenisSuratId: '', bodyTemplate: '', isActive: true };
}

export function LetterTemplates() {
  const { can, currentUser, masterDataItems = [] } = useApp();
  const canEdit = can('letter-templates', 'edit');
  const jenisOptions = useMemo(
    () => masterDataItems.filter(m => m.category === 'jenis_surat_keluar' && m.isActive).sort((a, b) => a.order - b.order),
    [masterDataItems]
  );

  const [templates, setTemplates] = useState<LetterTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<LetterTemplate> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<LetterTemplate[]>('/api/data/letterTemplates');
      setTemplates(rows);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat template surat');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const jenisLabel = (id?: string) => jenisOptions.find(j => j.id === id)?.label || id || '-';

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name?.trim()) { toast.error('Nama template wajib diisi'); return; }
    if (!editing.jenisSuratId) { toast.error('Jenis surat wajib dipilih'); return; }
    setSaving(true);
    try {
      const id = editing.id || `lettpl_${Date.now()}`;
      const data: LetterTemplate = {
        id,
        name: editing.name.trim(),
        jenisSuratId: editing.jenisSuratId,
        bodyTemplate: editing.bodyTemplate || '',
        isActive: editing.isActive ?? true,
        createdBy: editing.createdBy || currentUser?.id,
        createdAt: editing.createdAt || new Date().toISOString(),
      };
      if (editing.id) {
        await api.put(`/api/data/letterTemplates/${id}`, data);
      } else {
        await api.post('/api/data/letterTemplates', data);
      }
      toast.success('Template surat disimpan');
      setEditing(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tpl: LetterTemplate) => {
    if (!window.confirm(`Hapus template "${tpl.name}"?`)) return;
    try {
      await api.delete(`/api/data/letterTemplates/${tpl.id}`);
      toast.success('Template dihapus');
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus template');
    }
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: '#e0f2fe' }}>
            <FileText className="w-5.5 h-5.5" style={{ color: '#0369a1' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: '#1e293b' }}>Template Surat</h1>
            <p className="text-sm" style={{ color: '#64748b' }}>
              Isi baku per jenis surat, dipakai staf saat membuat draft Surat Keluar baru.
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => setEditing(emptyForm())}
            className="px-3.5 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-1.5"
            style={{ background: '#0369a1' }}
          >
            <Plus className="w-4 h-4" /> Template Baru
          </button>
        )}
      </div>

      {jenisOptions.length === 0 && (
        <div className="text-xs px-3 py-2 rounded-lg" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
          Belum ada Jenis Surat di Master Data — tambahkan dulu lewat halaman Master Data (kategori "Jenis Surat Keluar") sebelum membuat template.
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
        ) : templates.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Belum ada template surat.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Nama Template</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Jenis Surat</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Status</th>
                {canEdit && <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {templates.map(tpl => (
                <tr key={tpl.id} className="border-t" style={{ borderColor: '#e2e8f0' }}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{tpl.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{jenisLabel(tpl.jenisSuratId)}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold border"
                      style={tpl.isActive
                        ? { background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }
                        : { background: '#f1f5f9', color: '#64748b', borderColor: '#e2e8f0' }}>
                      {tpl.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => setEditing(tpl)} className="p-1.5 rounded hover:bg-slate-100 mr-1"><Pencil className="w-3.5 h-3.5 text-slate-500" /></button>
                      <button onClick={() => handleDelete(tpl)} className="p-1.5 rounded hover:bg-red-50"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }}
          onClick={() => !saving && setEditing(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#e2e8f0' }}>
              <h3 className="text-sm font-semibold text-slate-800">{editing.id ? 'Ubah Template' : 'Template Baru'}</h3>
              <button onClick={() => setEditing(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Nama Template</label>
                <input value={editing.name || ''} onChange={e => setEditing(prev => prev && ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: '#e2e8f0' }}
                  placeholder="mis. Surat Keterangan Baptis" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Jenis Surat</label>
                <select value={editing.jenisSuratId || ''} onChange={e => setEditing(prev => prev && ({ ...prev, jenisSuratId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-white" style={{ borderColor: '#e2e8f0' }}>
                  <option value="">— Pilih jenis surat —</option>
                  {jenisOptions.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Isi Template</label>
                <textarea value={editing.bodyTemplate || ''} onChange={e => setEditing(prev => prev && ({ ...prev, bodyTemplate: e.target.value }))}
                  rows={8} className="w-full px-3 py-2 rounded-lg border text-sm font-mono" style={{ borderColor: '#e2e8f0' }}
                  placeholder={'Contoh:\n\nYang bertanda tangan di bawah ini menerangkan bahwa {namaPenerima} adalah benar anggota jemaat...'} />
                <p className="text-[11px] text-slate-400 mt-1">
                  Placeholder yang bisa dipakai: {'{namaPenerima}'}, {'{tanggal}'}, {'{perihal}'}, {'{nomorSurat}'} — diganti manual saat menulis draft di halaman Surat Keluar.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={editing.isActive ?? true} onChange={e => setEditing(prev => prev && ({ ...prev, isActive: e.target.checked }))} />
                Aktif (tampil sebagai pilihan saat membuat draft)
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: '#e2e8f0' }}>
              <button onClick={() => setEditing(null)} disabled={saving} className="px-3.5 py-2 rounded-lg text-sm text-slate-600 border" style={{ borderColor: '#e2e8f0' }}>Batal</button>
              <button onClick={handleSave} disabled={saving} className="px-3.5 py-2 rounded-lg text-sm text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: '#0369a1' }}>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} <Save className="w-3.5 h-3.5" /> Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
