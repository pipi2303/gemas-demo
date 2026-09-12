import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Resource } from '../types';
import { BookOpen, Search, Play, Pause, Download, User, Volume2, Sparkles, StopCircle, RefreshCw, Calendar, MapPin, AlertTriangle, FileDown } from 'lucide-react';
import { jsPDF } from 'jspdf';

export function SermonArchive() {
  const { resources, updateResource, worshipSchedules, can } = useApp();
  const canExport = can('sermon-archive', 'export');
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState('Semua');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const sermons = useMemo(
    () => resources
      .filter(r => r.type === 'Khotbah')
      .sort((a, b) => (b.publishedDate || '').localeCompare(a.publishedDate || '')),
    [resources]
  );

  const tags = useMemo(() => {
    const set = new Set<string>();
    sermons.forEach(s => (s.tags || []).forEach(t => set.add(t)));
    return ['Semua', ...Array.from(set)];
  }, [sermons]);

  const filtered = useMemo(() => {
    return sermons.filter(s => {
      const matchesTag = activeTag === 'Semua' || (s.tags || []).includes(activeTag);
      const q = search.trim().toLowerCase();
      const matchesSearch = !q ||
        s.title.toLowerCase().includes(q) ||
        (s.author || '').toLowerCase().includes(q) ||
        (s.bibleVerse || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        (s.fullTranscript || '').toLowerCase().includes(q);
      return matchesTag && matchesSearch;
    });
  }, [sermons, activeTag, search]);

  const selected: Resource | undefined = useMemo(
    () => filtered.find(s => s.id === selectedId) || filtered[0],
    [filtered, selectedId]
  );

  const formatDate = (d?: string) => {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch { return d; }
  };

  const handleSelect = (r: Resource) => {
    setSelectedId(r.id);
    stopAudioAndSpeech();
  };

  const stopAudioAndSpeech = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setIsSpeaking(false);
  };

  useEffect(() => {
    return () => {
      stopAudioAndSpeech();
    };
  }, []);

  const togglePlay = () => {
    if (!selected) return;

    if (selected.fileUrl) {
      if (!audioRef.current) return;
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    } else {
      // Fallback to Web Speech API TTS for elderly / listening support
      if (!('speechSynthesis' in window)) {
        alert('Browser tidak mendukung pembacaan suara audio otomatis.');
        return;
      }

      if (isSpeaking) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      } else {
        window.speechSynthesis.cancel();
        const textToRead = `${selected.title}. Pelayan Firman, ${selected.author || 'Hamba Tuhan'}. Nats Alkitab, ${selected.bibleVerse || ''}. ${selected.description || ''}. ${selected.fullTranscript || ''}`;
        const utterance = new SpeechSynthesisUtterance(textToRead);
        utterance.lang = 'id-ID';
        const rate = parseFloat(localStorage.getItem('gemas_tts_speed') || '1.0');
        utterance.rate = rate;

        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

        window.speechSynthesis.speak(utterance);
        setIsSpeaking(true);
      }
    }
  };

  const handleDownloadTranscript = () => {
    if (!selected) return;
    const text = selected.fullTranscript || selected.description || 'Naskah belum tersedia.';
    const blob = new Blob([`${selected.title}\nPelayan: ${selected.author || '-'}\nNats: ${selected.bibleVerse || '-'}\n\n${text}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selected.title.replace(/[^a-z0-9]+/gi, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    updateResource(selected.id, { downloads: (selected.downloads || 0) + 1 });
  };

  const linkedSchedule = selected?.worshipScheduleId
    ? worshipSchedules.find(ws => ws.id === selected.worshipScheduleId)
    : undefined;
  const hasOrphanLink = !!selected?.worshipScheduleId && !linkedSchedule;

  const handleDownloadPDF = () => {
    if (!selected) return;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const NAVY: [number, number, number] = [20, 79, 107];
    const GOLD: [number, number, number] = [202, 160, 74];
    let y = 34;

    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageWidth, 26, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, 26, pageWidth, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('ARSIP KHOTBAH & RENUNGAN', pageWidth / 2, 11, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('GPIB Trinitas', pageWidth / 2, 17, { align: 'center' });
    doc.setFontSize(8);
    doc.text(formatDate(selected.publishedDate), pageWidth / 2, 22.5, { align: 'center' });

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    const titleLines = doc.splitTextToSize(selected.title, pageWidth - 28);
    doc.text(titleLines, 14, y);
    y += titleLines.length * 5.5 + 3;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    if (selected.author) { doc.text(`Pelayan Firman: ${selected.author}`, 14, y); y += 5; }
    if (selected.bibleVerse) { doc.text(`Nats Alkitab: ${selected.bibleVerse}`, 14, y); y += 5; }
    if (linkedSchedule) { doc.text(`Ibadah: ${linkedSchedule.title} – ${formatDate(linkedSchedule.date)}`, 14, y); y += 5; }
    y += 4;

    const body = selected.fullTranscript || selected.description || 'Naskah belum tersedia.';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    const bodyLines = doc.splitTextToSize(body, pageWidth - 28);
    bodyLines.forEach((line: string) => {
      if (y > pageHeight - 20) { doc.addPage(); y = 16; }
      doc.text(line, 14, y);
      y += 5;
    });

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.4);
      doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text('Dokumen Internal GPIB Trinitas', 14, pageHeight - 7.5);
      doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - 14, pageHeight - 7.5, { align: 'right' });
    }

    doc.save(`Khotbah-${selected.title.replace(/[^a-z0-9]+/gi, '-')}.pdf`);
    updateResource(selected.id, { downloads: (selected.downloads || 0) + 1 });
  };

  return (
    <div className="space-y-6">
      {/* Header -- disamakan dengan template menu sejenis lain (Tata Ibadah,
          Jadwal Ibadah, E-Warta, Unit Pelayanan): kartu putih polos + ikon
          kotak berwarna, bukan banner gradasi gelap yang sebelumnya beda
          sendiri di modul ini. */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#144f6b] to-[#1A77A3] rounded-xl flex items-center justify-center shadow">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Arsip Khotbah &amp; Renungan Firman</h1>
            <p className="text-sm text-gray-500">
              Dengarkan rekaman suara khotbah, pelajari nats Alkitab, dan unduh naskah renungan mingguan.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#f0f7fb] text-[#144f6b] border border-[#b8d5e8]">
            {sermons.length} Khotbah Tersedia
          </span>
        </div>
      </div>

      {sermons.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border p-12 text-center" style={{ borderColor: '#e8e0cc' }}>
          <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-600 font-medium">Belum ada khotbah yang diarsipkan.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left Column: Search & Filter List */}
          <div className="lg:col-span-1 space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari tema, ayat, pengkhotbah..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs lg:text-sm bg-white shadow-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600 transition-all"
                style={{ borderColor: '#e2d8c4' }}
              />
            </div>

            {/* Tags Pills */}
            <div className="flex flex-wrap gap-1.5">
              {tags.map(tag => {
                const count = tag === 'Semua' ? sermons.length : sermons.filter(s => (s.tags || []).includes(tag)).length;
                const active = tag === activeTag;
                return (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(tag)}
                    className="px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5"
                    style={active
                      ? { background: '#0d1a2d', color: '#fef08a', border: '1px solid #caa049' }
                      : { background: '#ffffff', color: '#475569', border: '1px solid #e2d8c4' }}
                  >
                    {tag}
                    <span
                      className="px-1.5 py-0.2 rounded-full text-[10px]"
                      style={active ? { background: 'rgba(255,255,255,0.2)' } : { background: '#f1f5f9' }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* List of Sermon Cards */}
            <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
              {filtered.length === 0 && (
                <p className="text-xs text-gray-500 p-3 text-center">Tidak ada materi yang sesuai filter.</p>
              )}
              {filtered.map(s => {
                const active = selected?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => handleSelect(s)}
                    className="w-full text-left rounded-2xl p-4 transition-all duration-200"
                    style={{
                      background: active ? '#0d1a2d' : '#ffffff',
                      color: active ? '#ffffff' : '#0f172a',
                      border: active ? '1.5px solid #caa049' : '1px solid #e2d8c4',
                      boxShadow: active ? '0 4px 14px rgba(13,26,45,0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span
                        className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase"
                        style={{
                          background: active ? 'rgba(212,175,55,0.25)' : '#fef3c7',
                          color: active ? '#fde047' : '#92400e',
                          border: active ? '1px solid rgba(212,175,55,0.4)' : '1px solid #fde68a',
                        }}
                      >
                        {(s.tags && s.tags[0]) || 'Materi'}
                      </span>
                      <span className={`text-[11px] ${active ? 'text-gray-300' : 'text-gray-400'}`}>
                        {formatDate(s.publishedDate)}
                      </span>
                    </div>
                    <p className={`font-bold text-sm leading-snug font-serif-heading ${active ? 'text-white' : 'text-gray-900'}`}>
                      {s.title}
                    </p>
                    {s.author && (
                      <p className={`text-xs mt-2 flex items-center gap-1.5 ${active ? 'text-amber-200/80' : 'text-gray-600'}`}>
                        <User className="w-3.5 h-3.5" />
                        <span className="truncate">{s.author}</span>
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Detailed Viewer & Media Narration */}
          <div className="lg:col-span-2">
            {!selected ? (
              <div className="bg-white rounded-2xl shadow-sm border p-12 text-center" style={{ borderColor: '#e8e0cc' }}>
                <p className="text-gray-500">Pilih khotbah di sebelah kiri untuk melihat detail.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-6" style={{ borderColor: '#e2d8c4' }}>
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200"
                    >
                      {(selected.tags && selected.tags[0]) || 'Materi'} • {formatDate(selected.publishedDate)}
                    </span>
                  </div>
                  <h2 className="text-2xl lg:text-3xl font-bold font-serif-heading text-gray-900 leading-tight">
                    {selected.title}
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-y-1 gap-x-4 text-xs lg:text-sm text-gray-600">
                    {selected.author && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400">Pelayan Firman:</span>
                        <span className="font-semibold text-gray-900">{selected.author}</span>
                      </div>
                    )}
                    {selected.bibleVerse && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400">Nats Alkitab:</span>
                        <span className="font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          {selected.bibleVerse}
                        </span>
                      </div>
                    )}
                  </div>
                  {linkedSchedule && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-600 bg-[#f0f7fb] border border-[#b8d5e8] rounded-lg px-3 py-2">
                      <span className="flex items-center gap-1 font-medium text-[#144f6b]"><BookOpen className="w-3.5 h-3.5" />Ibadah Terkait:</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(linkedSchedule.date)}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{linkedSchedule.location}</span>
                      <span className="truncate">{linkedSchedule.title}</span>
                    </div>
                  )}
                  {hasOrphanLink && (
                    <div className="mt-3 flex items-start gap-2 text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(209,85,63,0.08)', color: '#b8442f' }}>
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>Jadwal ibadah yang tertaut ke khotbah ini sudah dihapus dari Jadwal Ibadah.</span>
                    </div>
                  )}
                </div>

                <div className="h-px bg-gray-100" />

                {/* Audio Player Card (Dark Navy with Gold Accents) */}
                <div
                  className="rounded-2xl p-5 text-white shadow-md border"
                  style={{
                    background: '#0d1a2d',
                    borderColor: 'rgba(212,175,55,0.3)',
                  }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 border border-emerald-500/30">
                        <Volume2 className="w-4 h-4" />
                      </div>
                      <span>Pemutar Audio Suara Khotbah / Pembaca Teks</span>
                    </div>
                    <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/10 text-amber-300 border border-white/15">
                      Audio Ramah Lansia
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={togglePlay}
                      className="px-5 py-2.5 rounded-xl text-xs lg:text-sm font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95"
                      style={{
                        background: '#caa049',
                        color: '#0d1a2d',
                      }}
                    >
                      {isPlaying || isSpeaking ? (
                        <>
                          <StopCircle className="w-4 h-4" />
                          <span>Jeda / Hentikan Suara Khotbah</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current" />
                          <span>Putar Suara Khotbah</span>
                        </>
                      )}
                    </button>

                    {canExport && (
                      <button
                        onClick={handleDownloadTranscript}
                        className="px-4 py-2.5 rounded-xl text-xs lg:text-sm font-semibold flex items-center gap-2 transition-all bg-white/10 hover:bg-white/20 text-white border border-white/20"
                      >
                        <Download className="w-4 h-4" />
                        Unduh Naskah (.txt)
                      </button>
                    )}
                    {canExport && (
                      <button
                        onClick={handleDownloadPDF}
                        className="px-4 py-2.5 rounded-xl text-xs lg:text-sm font-semibold flex items-center gap-2 transition-all"
                        style={{ background: '#caa049', color: '#0d1a2d' }}
                      >
                        <FileDown className="w-4 h-4" />
                        Unduh PDF
                      </button>
                    )}
                  </div>

                  {selected.fileUrl && (
                    <audio
                      ref={audioRef}
                      src={selected.fileUrl}
                      onEnded={() => setIsPlaying(false)}
                      className="hidden"
                    />
                  )}

                  <p className="text-[11.5px] mt-3 text-gray-300/80">
                    {isSpeaking
                      ? '🔊 Sedang membacakan naskah khotbah secara otomatis...'
                      : isPlaying
                      ? '▶️ Sedang memutar rekaman suara...'
                      : selected.fileUrl
                      ? 'Klik "Putar Suara Khotbah" untuk mendengarkan rekaman suara audio.'
                      : 'Audio siap dibacakan langsung melalui fitur narasi suara otomatis (TTS).'}
                  </p>
                </div>

                {/* Ringkasan Intisari */}
                <div
                  className="rounded-2xl p-5 border"
                  style={{ background: '#faf7f0', borderColor: '#e2d8c4' }}
                >
                  <p className="text-sm font-bold font-serif-heading text-gray-900 mb-2">
                    Ringkasan / Intisari Khotbah
                  </p>
                  <p className="text-xs lg:text-sm text-gray-700 leading-relaxed">
                    {selected.description || 'Ringkasan belum tersedia untuk materi ini.'}
                  </p>
                </div>

                {/* Naskah Khotbah Lengkap */}
                <div>
                  <p className="text-sm font-bold font-serif-heading text-gray-900 mb-2">
                    Naskah Khotbah Lengkap
                  </p>
                  <div
                    className="rounded-2xl border p-5 max-h-80 overflow-y-auto text-xs lg:text-sm text-gray-800 whitespace-pre-wrap leading-relaxed bg-white"
                    style={{ borderColor: '#e2d8c4' }}
                  >
                    {selected.fullTranscript || selected.description || 'Naskah lengkap belum tersedia untuk materi ini.'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
