import React, { useState, useEffect } from 'react';
import { Sliders, Check, Eye, Type, Volume2, Sparkles, X, Sun, Moon } from 'lucide-react';

interface AccessibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccessibilityModal({ isOpen, onClose }: AccessibilityModalProps) {
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'xlarge'>(() => {
    return (localStorage.getItem('gemas_font_scale') as any) || 'normal';
  });
  const [highContrast, setHighContrast] = useState(() => {
    return localStorage.getItem('gemas_high_contrast') === 'true';
  });
  const [elderlyMode, setElderlyMode] = useState(() => {
    return localStorage.getItem('gemas_elderly_mode') === 'true';
  });
  const [ttsSpeed, setTtsSpeed] = useState<number>(() => {
    return parseFloat(localStorage.getItem('gemas_tts_speed') || '1.0');
  });

  useEffect(() => {
    // Apply font size class to document root
    const root = document.documentElement;
    root.classList.remove('text-scale-normal', 'text-scale-large', 'text-scale-xlarge');
    root.classList.add(`text-scale-${fontSize}`);
    localStorage.setItem('gemas_font_scale', fontSize);

    if (fontSize === 'large') {
      root.style.fontSize = '17px';
    } else if (fontSize === 'xlarge') {
      root.style.fontSize = '18.5px';
    } else {
      root.style.fontSize = '16px';
    }
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('gemas_high_contrast', String(highContrast));
    if (highContrast) {
      document.documentElement.classList.add('high-contrast-mode');
    } else {
      document.documentElement.classList.remove('high-contrast-mode');
    }
  }, [highContrast]);

  useEffect(() => {
    localStorage.setItem('gemas_elderly_mode', String(elderlyMode));
  }, [elderlyMode]);

  useEffect(() => {
    localStorage.setItem('gemas_tts_speed', String(ttsSpeed));
  }, [ttsSpeed]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150"
        style={{ borderColor: '#e2d8c4' }}
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between" style={{ background: '#0d1a2d' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10 text-amber-300">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-white text-lg font-bold font-serif-church tracking-wide">
                Pengaturan Aksesibilitas
              </h2>
              <p className="text-xs text-amber-200/70">
                Sesuaikan kenyamanan tampilan, ukuran teks &amp; audio ramah jemaat
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Font Scaling */}
          <div>
            <label className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-2.5">
              <Type className="w-4 h-4 text-sky-700" />
              Ukuran Teks &amp; Skala Baca
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: 'normal', label: 'Standar (100%)', desc: 'Ukuran normal' },
                { id: 'large', label: 'Besar (115%)', desc: 'Lebih nyaman' },
                { id: 'xlarge', label: 'Ekstra (130%)', desc: 'Ramah Lansia' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setFontSize(opt.id as any)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    fontSize === opt.id
                      ? 'border-amber-600 bg-amber-50/70 shadow-xs'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <p className={`font-semibold text-xs ${fontSize === opt.id ? 'text-amber-900' : 'text-gray-700'}`}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Mode Ramah Lansia */}
          <div className="p-4 rounded-xl border flex items-start justify-between gap-4" style={{ background: '#fdfbf7', borderColor: '#e8dec8' }}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-100 text-amber-800 flex-shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Mode Ramah Lansia (Simpel &amp; Jelas)</p>
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                  Menyederhanakan tata letak, tombol aksi berukuran ekstra lebar, serta teks kontras tajam.
                </p>
              </div>
            </div>
            <button
              onClick={() => setElderlyMode(!elderlyMode)}
              className={`w-12 h-6.5 rounded-full transition-colors relative flex-shrink-0 p-0.5 ${
                elderlyMode ? 'bg-amber-600' : 'bg-gray-300'
              }`}
            >
              <div
                className={`w-5.5 h-5.5 rounded-full bg-white shadow-md transform transition-transform ${
                  elderlyMode ? 'translate-x-5.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Kontras Tinggi */}
          <div className="p-4 rounded-xl border flex items-start justify-between gap-4" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-100 text-slate-700 flex-shrink-0 mt-0.5">
                <Eye className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Tingkatkan Kontras Warna</p>
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                  Mempertajam batas kartu, font, dan elemen penting untuk visibilitas tinggi.
                </p>
              </div>
            </div>
            <button
              onClick={() => setHighContrast(!highContrast)}
              className={`w-12 h-6.5 rounded-full transition-colors relative flex-shrink-0 p-0.5 ${
                highContrast ? 'bg-slate-800' : 'bg-gray-300'
              }`}
            >
              <div
                className={`w-5.5 h-5.5 rounded-full bg-white shadow-md transform transition-transform ${
                  highContrast ? 'translate-x-5.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Kecepatan Narasi Suara (TTS) */}
          <div>
            <label className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-2.5">
              <Volume2 className="w-4 h-4 text-emerald-700" />
              Kecepatan Pembacaan Suara Khotbah / Narator
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { val: 0.85, label: 'Lambat (0.85x)', desc: 'Jelas & bertahap' },
                { val: 1.0, label: 'Normal (1.0x)', desc: 'Kecepatan standar' },
                { val: 1.2, label: 'Cepat (1.2x)', desc: 'Ringkas efisien' },
              ].map(speed => (
                <button
                  key={speed.val}
                  onClick={() => setTtsSpeed(speed.val)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    ttsSpeed === speed.val
                      ? 'border-emerald-600 bg-emerald-50/70 shadow-xs'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <p className={`font-semibold text-xs ${ttsSpeed === speed.val ? 'text-emerald-900' : 'text-gray-700'}`}>
                    {speed.label}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{speed.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-between" style={{ borderColor: '#e2d8c4' }}>
          <p className="text-xs text-gray-500">
            Pengaturan tersimpan otomatis di perangkat ini
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-sm"
            style={{ background: '#0d1a2d' }}
          >
            Terapkan &amp; Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
