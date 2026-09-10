import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useDraggable } from '../../lib/useDraggable';
import { MasterDataCategory, MasterDataItem } from '../types';
import {
  Layers, Plus, Pencil, Trash2, Check, X, ToggleLeft, ToggleRight,
  Users, Church, DollarSign, Package, Calendar, BookOpen, Search, Mail,
} from 'lucide-react';

// ── Grup kategori per modul ───────────────────────────────────────────────────
const GROUPS = [
  {
    id: 'jemaat', label: 'Data Jemaat', icon: Users, color: '#1A77A3',
    categories: ['jabatan_pelayanan','pelkat','pendidikan','golongan_darah','status_pernikahan','tipe_keanggotaan'],
  },
  {
    id: 'ibadah', label: 'Ibadah & Liturgi', icon: Church, color: '#7c3aed',
    categories: ['jenis_ibadah','kategori_ibadah','jenis_jadwal_ibadah','daftar_pelayan','kategori_petugas_ibadah','buku_nyanyian','tipe_nyanyian_ibadah'],
  },
  {
    id: 'sakramen', label: 'Sakramen & Mutasi', icon: BookOpen, color: '#0f766e',
    categories: ['status_sakramen','tempat_sakramen','tipe_atestasi','status_permohonan_surat'],
  },
  {
    id: 'keuangan', label: 'Keuangan', icon: DollarSign, color: '#16a34a',
    categories: ['jenis_persembahan','tipe_rekening','metode_pembayaran','kategori_keuangan_masuk','kategori_keuangan_keluar','kategori_kas_kecil','sumber_kas_kecil','status_kas_kecil'],
  },
  {
    id: 'fasilitas', label: 'Fasilitas & Layanan', icon: Package, color: '#b45309',
    categories: ['status_peminjaman_ruangan','kategori_aset','jenis_pelayanan','kategori_bantuan','status_distribusi_bantuan'],
  },
  {
    id: 'kegiatan', label: 'Kegiatan & Komunikasi', icon: Calendar, color: '#d97706',
    categories: ['jenis_kegiatan','status_event','prioritas_pengumuman'],
  },
  {
    id: 'persuratan', label: 'Surat Menyurat', icon: Mail, color: '#0369a1',
    categories: ['jenis_surat_keluar','jenis_surat_masuk'],
  },
];

// Flat map category id → group color
const CAT_META: Record<string, { label: string; description: string; color: string }> = {
  jabatan_pelayanan:         { label: 'Jabatan Pelayanan',          description: 'Posisi pelayanan jemaat (Penatua, Diaken, dst)',             color: '#1A77A3' },
  pelkat:                    { label: 'Unit Kategorial (Pelkat)',   description: 'PA, PT, GP, PKB, dll',                                       color: '#7c3aed' },
  pendidikan:                { label: 'Pendidikan Terakhir',        description: 'Jenjang pendidikan anggota',                                 color: '#0f766e' },
  golongan_darah:            { label: 'Golongan Darah',             description: 'A, B, AB, O, dll',                                           color: '#dc2626' },
  status_pernikahan:         { label: 'Status Pernikahan',          description: 'Belum menikah, menikah, dll',                                color: '#be185d' },
  tipe_keanggotaan:          { label: 'Tipe Keanggotaan',           description: 'Warga Jemaat, Tamu, Simpatisan',                             color: '#6366f1' },
  jenis_ibadah:              { label: 'Jenis Ibadah',               description: 'Tipe jadwal ibadah yang diselenggarakan',                    color: '#7c3aed' },
  kategori_ibadah:           { label: 'Kategori Ibadah',            description: 'GP, PA, PKB, dll',                                           color: '#7c3aed' },
  jenis_jadwal_ibadah:       { label: 'Jenis Jadwal Pelayanan',     description: 'Tipe kegiatan jadwal unit kategorial',                       color: '#dc2626' },
  daftar_pelayan:            { label: 'Daftar Pelayan Ibadah',      description: 'Nama pastor, pendeta, liturgis, dll',                        color: '#0f766e' },
  kategori_petugas_ibadah:   { label: 'Kategori Petugas Ibadah',     description: 'Peran petugas di jadwal ibadah: Pengkhotbah, Liturgis, Multimedia, dll',   color: '#0f766e' },
  buku_nyanyian:             { label: 'Buku Nyanyian',              description: 'Kidung Jemaat, Gita Bakti, dll',                             color: '#7c3aed' },
  tipe_nyanyian_ibadah:      { label: 'Tipe Nyanyian Ibadah',       description: 'Pembukaan, persembahan, komuni, penutup',                    color: '#0891b2' },
  status_sakramen:           { label: 'Status Sakramen',            description: 'Terjadwal, selesai, ditunda, dll',                           color: '#7c3aed' },
  tempat_sakramen:           { label: 'Tempat Sakramen',            description: 'Lokasi baptis, sidi, pemberkatan',                           color: '#059669' },
  tipe_atestasi:             { label: 'Tipe Atestasi',              description: 'Pindah masuk / pindah keluar',                               color: '#0f766e' },
  status_permohonan_surat:   { label: 'Status Permohonan Surat',    description: 'Diajukan, diproses, selesai, ditolak',                       color: '#64748b' },
  jenis_persembahan:         { label: 'Jenis Persembahan',          description: 'Mingguan, syukur, persepuluhan, dll',                        color: '#d97706' },
  tipe_rekening:             { label: 'Tipe Rekening Bank',         description: 'Operasional, tabungan, pembangunan, dll',                    color: '#0f766e' },
  metode_pembayaran:         { label: 'Metode Pembayaran',          description: 'Tunai, transfer, QRIS',                                      color: '#0891b2' },
  kategori_keuangan_masuk:   { label: 'Kategori Pemasukan',         description: 'Kategori penerimaan keuangan',                               color: '#16a34a' },
  kategori_keuangan_keluar:  { label: 'Kategori Pengeluaran',       description: 'Kategori pengeluaran keuangan',                              color: '#dc2626' },
  kategori_kas_kecil:        { label: 'Kategori Kas Kecil',         description: 'Kategori pengeluaran petty cash',                            color: '#78350f' },
  sumber_kas_kecil:          { label: 'Sumber Kas Kecil',           description: 'Kas majelis, donasi, dll',                                   color: '#b45309' },
  status_kas_kecil:          { label: 'Status Kas Kecil',           description: 'Lunas, pending',                                             color: '#b45309' },
  status_peminjaman_ruangan: { label: 'Status Peminjaman Ruangan',  description: 'Pending, disetujui, ditolak, dll',                           color: '#6366f1' },
  kategori_aset:             { label: 'Kategori Aset',              description: 'Tanah, bangunan, kendaraan, dll',                            color: '#059669' },
  jenis_pelayanan:           { label: 'Jenis Permohonan Layanan',   description: 'Kunjungan, doa, konseling, dll',                             color: '#be185d' },
  kategori_bantuan:          { label: 'Kategori Bantuan Sosial',    description: 'Tipe bantuan diakonia',                                      color: '#b45309' },
  status_distribusi_bantuan: { label: 'Status Distribusi Bantuan',  description: 'Pengajuan, verifikasi, disalurkan, dll',                     color: '#be185d' },
  jenis_kegiatan:            { label: 'Jenis Kegiatan',             description: 'Ibadah, retreat, seminar, dll',                              color: '#0891b2' },
  status_event:              { label: 'Status Kegiatan',            description: 'Akan datang, berlangsung, selesai, dll',                     color: '#d97706' },
  prioritas_pengumuman:      { label: 'Prioritas Pengumuman',       description: 'Normal, penting, mendesak',                                  color: '#d97706' },
  jenis_surat_keluar:        { label: 'Jenis Surat Keluar',        description: 'Surat Keterangan, Pengantar, Undangan, SK, dll — admin isi sendiri', color: '#0369a1' },
  jenis_surat_masuk:         { label: 'Jenis Surat Masuk',         description: 'Kategori surat masuk (opsional, untuk pengelompokan)',      color: '#0369a1' },
};

// ── Chip komponen (satu item) ─────────────────────────────────────────────────
function ItemChip({
  item, color, onSave, onDelete, onToggle,
}: {
  item: MasterDataItem; color: string;
  onSave: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label);

  const save = () => {
    if (!label.trim()) return;
    onSave(item.id, label.trim());
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 rounded-xl border-2" style={{ borderColor: color }}>
        <input
          value={label} onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setLabel(item.label); setEditing(false); } }}
          className="text-sm focus:outline-none bg-transparent w-32"
          autoFocus
        />
        <button onClick={save} className="p-0.5 rounded hover:opacity-70"><Check className="w-3.5 h-3.5" style={{ color }} /></button>
        <button onClick={() => { setLabel(item.label); setEditing(false); }} className="p-0.5 rounded hover:opacity-70"><X className="w-3.5 h-3.5 text-gray-400" /></button>
      </div>
    );
  }

  return (
    <div
      className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all"
      style={{
        background: item.isActive ? `${color}12` : '#f8fafc',
        borderColor: item.isActive ? `${color}40` : '#e2e8f0',
        opacity: item.isActive ? 1 : 0.5,
      }}
    >
      <span style={{ fontSize: '13px', fontWeight: 500, color: item.isActive ? '#1e293b' : '#94a3b8' }}>
        {item.label}
      </span>
      <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
        <button onClick={() => setEditing(true)} className="p-0.5 rounded hover:bg-white/80 transition-colors" title="Edit">
          <Pencil className="w-3 h-3" style={{ color }} />
        </button>
        <button onClick={() => onToggle(item.id)} className="p-0.5 rounded hover:bg-white/80 transition-colors" title={item.isActive ? 'Nonaktifkan' : 'Aktifkan'}>
          {item.isActive
            ? <ToggleRight className="w-3.5 h-3.5" style={{ color }} />
            : <ToggleLeft className="w-3.5 h-3.5 text-gray-400" />}
        </button>
        <button onClick={() => onDelete(item.id)} className="p-0.5 rounded hover:bg-red-50 transition-colors" title="Hapus">
          <Trash2 className="w-3 h-3 text-red-400" />
        </button>
      </div>
    </div>
  );
}

// ── Komponen Utama ────────────────────────────────────────────────────────────
export function MasterData() {
  const { masterDataItems, addMasterDataItem, updateMasterDataItem, deleteMasterDataItem } = useApp();
  const { offset, onMouseDown } = useDraggable();

  const [activeCategory, setActiveCategory] = useState<MasterDataCategory>('jabatan_pelayanan');
  const [globalSearch, setGlobalSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const activeMeta = CAT_META[activeCategory] ?? { label: activeCategory, description: '', color: '#1A77A3' };

  const items = useMemo(() => {
    if (globalSearch) {
      const q = globalSearch.toLowerCase();
      return masterDataItems.filter(m => m.label.toLowerCase().includes(q) || m.value.toLowerCase().includes(q));
    }
    return masterDataItems.filter(m => m.category === activeCategory);
  }, [masterDataItems, activeCategory, globalSearch]);

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    const maxOrder = masterDataItems.filter(m => m.category === activeCategory).reduce((max, m) => Math.max(max, m.order), 0);
    addMasterDataItem({ category: activeCategory, value: newLabel.trim(), label: newLabel.trim(), isActive: true, order: maxOrder + 1 });
    setNewLabel(''); setAdding(false);
  };

  const handleSave = (id: string, label: string) => {
    updateMasterDataItem(id, { label, value: label });
  };

  const handleToggle = (id: string) => {
    const item = masterDataItems.find(m => m.id === id);
    if (item) updateMasterDataItem(id, { isActive: !item.isActive });
  };

  const totalActive = masterDataItems.filter(m => m.isActive).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5" style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #384959, #1A77A3)' }}>
              <Layers className="w-5 h-5 text-white" />
            </div>
            Master Data
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: 4 }}>
            Data referensi yang dipakai di seluruh sistem — {totalActive} item aktif
          </p>
        </div>
        {/* Global search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={globalSearch} onChange={e => setGlobalSearch(e.target.value)}
            placeholder="Cari di semua kategori..."
            className="pl-9 pr-4 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#1A77A3]"
            style={{ borderColor: '#e2e8f0', width: 220 }}
          />
          {globalSearch && (
            <button onClick={() => setGlobalSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>
      </div>

      {globalSearch ? (
        /* ── Mode pencarian global ── */
        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: '#e2e8f0' }}>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: 12 }}>
            Hasil pencarian "<strong>{globalSearch}</strong>" — {items.length} item ditemukan
          </p>
          <div className="flex flex-wrap gap-2">
            {items.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '13px' }}>Tidak ada item yang cocok</p>
            ) : items.map(item => {
              const meta = CAT_META[item.category];
              return (
                <div key={item.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border"
                  style={{ background: `${meta?.color ?? '#1A77A3'}12`, borderColor: `${meta?.color ?? '#1A77A3'}40` }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{meta?.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#1e293b' }}>{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── Mode normal: dua panel ── */
        <div className="flex gap-4" style={{ minHeight: '540px' }}>

          {/* Kiri: daftar kategori per grup */}
          <div className="flex-shrink-0 w-60 space-y-3 overflow-y-auto" style={{ maxHeight: '80vh' }}>
            {GROUPS.map(group => {
              const Icon = group.icon;
              const groupTotal = group.categories.reduce((n, c) => n + masterDataItems.filter(m => m.category === c && m.isActive).length, 0);
              return (
                <div key={group.id}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-2 mb-1.5">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${group.color}18` }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: group.color }} />
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      {group.label}
                    </span>
                    <span style={{ fontSize: '10px', color: '#cbd5e1' }}>{groupTotal}</span>
                  </div>

                  {/* Kategori di dalam grup */}
                  <div className="space-y-0.5">
                    {group.categories.map(catId => {
                      const meta = CAT_META[catId];
                      if (!meta) return null;
                      const count = masterDataItems.filter(m => m.category === catId && m.isActive).length;
                      const active = catId === activeCategory;
                      return (
                        <button
                          key={catId}
                          onClick={() => { setActiveCategory(catId as MasterDataCategory); setAdding(false); setNewLabel(''); }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all"
                          style={{
                            background: active ? meta.color : 'transparent',
                            color: active ? '#fff' : '#475569',
                            fontSize: '12.5px',
                            fontWeight: active ? 600 : 400,
                          }}
                          onMouseOver={e => { if (!active) e.currentTarget.style.background = '#f1f5f9'; }}
                          onMouseOut={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span className="truncate">{meta.label}</span>
                          <span className="ml-2 flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: active ? 'rgba(255,255,255,0.25)' : '#f1f5f9', color: active ? '#fff' : '#64748b', minWidth: 20, textAlign: 'center' }}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Kanan: konten kategori aktif */}
          <div className="flex-1 rounded-2xl border bg-white flex flex-col overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
            {/* Header kategori */}
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: '#f1f5f9' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${activeMeta.color}15` }}>
                  <Layers className="w-4.5 h-4.5" style={{ color: activeMeta.color }} />
                </div>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{activeMeta.label}</p>
                  <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: 1 }}>{activeMeta.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  {masterDataItems.filter(m => m.category === activeCategory && m.isActive).length} aktif &nbsp;/&nbsp;
                  {masterDataItems.filter(m => m.category === activeCategory).length} total
                </span>
                <button
                  onClick={() => { setAdding(true); setNewLabel(''); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-all"
                  style={{ background: activeMeta.color }}
                >
                  <Plus className="w-4 h-4" /> Tambah
                </button>
              </div>
            </div>

            {/* Chips area */}
            <div className="flex-1 p-5 overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {items.map(item => (
                  <ItemChip
                    key={item.id}
                    item={item}
                    color={activeMeta.color}
                    onSave={handleSave}
                    onDelete={id => setDeleteTarget({ id, label: item.label })}
                    onToggle={handleToggle}
                  />
                ))}

                {/* Input tambah baru */}
                {adding && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-dashed" style={{ borderColor: activeMeta.color }}>
                    <input
                      value={newLabel} onChange={e => setNewLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
                      placeholder="Nama item baru..."
                      className="text-sm focus:outline-none bg-transparent w-36"
                      autoFocus
                      style={{ color: '#334155' }}
                    />
                    <button onClick={handleAdd} className="p-0.5 rounded hover:opacity-70">
                      <Check className="w-3.5 h-3.5" style={{ color: activeMeta.color }} />
                    </button>
                    <button onClick={() => setAdding(false)} className="p-0.5 rounded hover:opacity-70">
                      <X className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                )}

                {items.length === 0 && !adding && (
                  <div className="w-full py-12 text-center" style={{ color: '#94a3b8', fontSize: '13px' }}>
                    Belum ada data. Klik <strong>Tambah</strong> untuk memulai.
                  </div>
                )}
              </div>

              {/* Hint */}
              {items.length > 0 && (
                <p style={{ fontSize: '11px', color: '#cbd5e1', marginTop: 16 }}>
                  Arahkan kursor ke chip untuk edit, aktifkan/nonaktifkan, atau hapus item
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Konfirmasi hapus */}
      {deleteTarget && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center" onClick={e => e.stopPropagation()} style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#fef2f2', cursor: 'move' }} onMouseDown={onMouseDown}>
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Hapus Item?</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: 20 }}>
              "<strong>{deleteTarget.label}</strong>" akan dihapus permanen.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl border font-medium text-gray-600 hover:bg-gray-50 text-sm" style={{ borderColor: '#e2e8f0' }}>Batal</button>
              <button onClick={() => { deleteMasterDataItem(deleteTarget.id); setDeleteTarget(null); }} className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm hover:opacity-90" style={{ background: '#ef4444' }}>Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
