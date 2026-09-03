import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Eye, EyeOff, Lock, User, ShieldCheck, Sparkles } from 'lucide-react';

const GOLD = '#dfb774';

export function LoginPage() {
  const { login } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Username dan password wajib diisi.');
      return;
    }
    setLoading(true);
    const success = await login(username.trim(), password);
    setLoading(false);
    if (!success) setError('Username atau password tidak valid.');
  };

  return (
    <>
      <style>{`
        @keyframes floatY {
          0%   { transform: translateY(0px); }
          50%  { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
        @keyframes pulseRing {
          0%   { transform: scale(1);   opacity: 0.6; }
          70%  { transform: scale(1.5); opacity: 0; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .feature-card { animation: floatY 4s ease-in-out infinite; }
        .pulse-ring {
          position: absolute; inset: -4px;
          border-radius: 9999px;
          border: 2px solid rgba(223,183,116,0.5);
          animation: pulseRing 2.5s cubic-bezier(0.215,0.61,0.355,1) infinite;
        }
        .pulse-ring-2 {
          position: absolute; inset: -4px;
          border-radius: 9999px;
          border: 2px solid rgba(223,183,116,0.3);
          animation: pulseRing 2.5s cubic-bezier(0.215,0.61,0.355,1) 1.2s infinite;
        }
        .fade-up { animation: fadeSlideUp 0.55s ease both; }
        .fade-up-1 { animation: fadeSlideUp 0.55s 0.07s ease both; }
        .fade-up-2 { animation: fadeSlideUp 0.55s 0.14s ease both; }
        .fade-up-3 { animation: fadeSlideUp 0.55s 0.21s ease both; }
        .fade-up-4 { animation: fadeSlideUp 0.55s 0.28s ease both; }
        .fade-up-5 { animation: fadeSlideUp 0.55s 0.35s ease both; }
        .dot-grid {
          background-image: radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px);
          background-size: 22px 22px;
        }
        .login-btn {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, #1A77A3 0%, #144f6b 100%);
          background-size: 200% auto;
          transition: box-shadow 0.2s, background-position 0.4s;
        }
        .login-btn:hover:not(:disabled) {
          background-position: right center;
          box-shadow: 0 10px 28px rgba(26,119,163,0.5) !important;
        }
        .login-btn::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(110deg, transparent 40%, rgba(255,255,255,0.28) 50%, transparent 60%);
          background-size: 200% 100%;
          animation: shimmer 3.2s ease-in-out infinite;
        }
        .gold-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(223,183,116,0.5), transparent);
        }
      `}</style>

      <div className="min-h-screen flex" style={{ background: '#0a1e2c' }}>

        {/* ===== LEFT PANEL ===== */}
        <div
          className="hidden lg:flex flex-col flex-1 relative overflow-hidden"
          style={{ background: 'linear-gradient(145deg, #0a1e2c 0%, #0f2d41 55%, #0a1e2c 100%)' }}
        >
          {/* Decorative radial glows + texture */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 dot-grid opacity-40" />
            <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full opacity-[0.12]"
              style={{ background: `radial-gradient(circle, ${GOLD}, transparent)` }} />
            <div className="absolute -bottom-32 -right-16 w-[480px] h-[480px] rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #1A77A3, transparent)' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[620px] h-[620px] rounded-full opacity-[0.05]"
              style={{ background: `radial-gradient(circle, ${GOLD}, transparent 70%)` }} />
          </div>

          <div className="relative flex flex-col justify-between h-full p-12">

            {/* Brand + pulse logo */}
            <div className="fade-up flex items-center gap-3.5">
              <div className="relative flex-shrink-0">
                <div className="pulse-ring" />
                <div className="pulse-ring-2" />
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white p-1.5 relative z-10 shadow-2xl">
                  <img
                    src="/logo-gpib.jpg"
                    alt="GPIB Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
              <div>
                <p className="font-serif-church text-white font-bold" style={{ fontSize: '15px', letterSpacing: '0.14em' }}>
                  G E M A S
                </p>
                <div className="mt-1 h-px w-8" style={{ background: GOLD, opacity: 0.6 }} />
                <p className="mt-1" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.02em' }}>
                  Gereja Management System
                </p>
              </div>
            </div>

            {/* Center: hero + feature list */}
            <div>
              {/* Badge */}
              <div className="fade-up-1 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-7"
                style={{ background: 'rgba(223,183,116,0.1)', border: '1px solid rgba(223,183,116,0.28)' }}>
                <Sparkles className="w-3 h-3" style={{ color: GOLD }} />
                <span style={{ fontSize: '11.5px', color: GOLD, fontWeight: 600, letterSpacing: '0.03em' }}>
                  PLATFORM MANAJEMEN GEREJA TERPADU
                </span>
              </div>

              {/* Hero text */}
              <h1 className="fade-up-2 mb-4 font-serif-church" style={{
                fontSize: '44px', fontWeight: 700, color: 'white', lineHeight: 1.18, letterSpacing: '-0.01em',
              }}>
                Kelola Jemaat<br />
                <span style={{ color: GOLD, fontStyle: 'italic' }}>Lebih Efisien</span>
              </h1>
              <p className="fade-up-3" style={{ fontSize: '14.5px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, maxWidth: '380px' }}>
                Sistem informasi lengkap untuk administrasi, peribadahan, dan keuangan jemaat secara terintegrasi, aman, dan profesional.
              </p>

              {/* Tagline */}
              <div className="fade-up mt-7 inline-flex items-center gap-3 py-1">
                <span className="flex-shrink-0" style={{ width: '22px', height: '1.5px', background: 'linear-gradient(90deg, #f0ede5, rgba(240,237,229,0))' }} />
                <p style={{
                  fontSize: '13.5px', fontStyle: 'italic', fontWeight: 600,
                  color: '#f0ede5', letterSpacing: '0.015em', lineHeight: 1.4,
                }}>
                  Melayani dengan Data Bertumbuh dengan Iman
                </p>
              </div>
            </div>

            {/* Bottom: trust row + copyright */}
            <div className="fade-up-5">
              <div className="gold-divider mb-5" />
              <p style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.2)' }}>
                © {new Date().getFullYear()} GEMAS — Gereja Management System. Hak cipta dilindungi undang-undang.
              </p>
            </div>
          </div>
        </div>

        {/* ===== RIGHT PANEL ===== */}
        <div className="flex-1 lg:max-w-[480px] flex flex-col justify-center relative dot-grid"
          style={{ background: '#fbfaf8', backgroundImage: 'radial-gradient(rgba(15,23,42,0.035) 1px, transparent 1px)', backgroundSize: '22px 22px' }}>

          {/* Top decorative bar */}
          <div className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ background: `linear-gradient(90deg, #1A77A3, ${GOLD}, #1A77A3)` }} />

          <div className="px-10 py-12 w-full max-w-md mx-auto">

            {/* Card wrapper */}
            <div className="rounded-3xl bg-white p-8" style={{ border: '1px solid #ececec', boxShadow: '0 20px 50px -12px rgba(15,23,42,0.12)' }}>

            {/* Mobile logo */}
            <div className="flex lg:hidden items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white p-1.5 shadow-sm" style={{ border: '1px solid #ececec' }}>
                <img
                  src="/logo-gpib.jpg"
                  alt="GPIB Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h2 className="text-gray-900 mb-0" style={{ fontSize: '18px', fontWeight: 800 }}>
                  Selamat Datang
                </h2>
                <p style={{ fontSize: '13px', color: '#64748b' }}>
                  Silakan Login ke Aplikasi <span style={{ color: '#1A77A3', fontWeight: 600 }}>GEMAS</span>
                </p>
              </div>
            </div>

            {/* Heading with church icon badge */}
            <div className="fade-up mb-8 hidden lg:block">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4 shadow-md"
                style={{ background: 'linear-gradient(135deg, #1A77A3, #144f6b)' }}>
                <Lock className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-gray-900 mb-1" style={{ fontSize: '26px', fontWeight: 800 }}>
                Selamat Datang
              </h2>
              <p style={{ fontSize: '14px', color: '#64748b' }}>
                Silakan Login ke Aplikasi <span style={{ color: '#1A77A3', fontWeight: 600 }}>GEMAS</span>
              </p>
              <p className="mt-2" style={{ fontSize: '12px', fontStyle: 'italic', fontWeight: 500, color: '#1A77A3', opacity: 0.75 }}>
                Melayani dengan Data Bertumbuh dengan Iman
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username */}
              <div className="fade-up-1">
                <label className="block mb-1.5" style={{ fontSize: '12.5px', fontWeight: 600, color: '#374151', letterSpacing: '0.02em' }}>
                  USERNAME
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center" style={{ color: '#94a3b8' }}>
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Masukkan username Anda"
                    className="w-full pl-10 pr-4 py-3 rounded-xl outline-none transition-all"
                    style={{ border: '1.5px solid #e2e8f0', fontSize: '14px', color: '#0f172a', background: '#f8fafc' }}
                    onFocus={e => { e.currentTarget.style.border = '1.5px solid #1A77A3'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,119,163,0.1)'; e.currentTarget.style.background = '#fff'; }}
                    onBlur={e => { e.currentTarget.style.border = '1.5px solid #e2e8f0'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = '#f8fafc'; }}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="fade-up-2">
                <label className="block mb-1.5" style={{ fontSize: '12.5px', fontWeight: 600, color: '#374151', letterSpacing: '0.02em' }}>
                  PASSWORD
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#94a3b8' }}>
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Masukkan password Anda"
                    className="w-full pl-10 pr-12 py-3 rounded-xl outline-none transition-all"
                    style={{ border: '1.5px solid #e2e8f0', fontSize: '14px', color: '#0f172a', background: '#f8fafc' }}
                    onFocus={e => { e.currentTarget.style.border = '1.5px solid #1A77A3'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(26,119,163,0.1)'; e.currentTarget.style.background = '#fff'; }}
                    onBlur={e => { e.currentTarget.style.border = '1.5px solid #e2e8f0'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = '#f8fafc'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: '#94a3b8' }}
                    onMouseOver={e => (e.currentTarget.style.color = '#1A77A3')}
                    onMouseOut={e => (e.currentTarget.style.color = '#94a3b8')}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
                  style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                  <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">!</span>
                  </div>
                  <p style={{ fontSize: '13px', color: '#dc2626' }}>{error}</p>
                </div>
              )}

              {/* Submit */}
              <div className="fade-up-3 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="login-btn w-full flex items-center justify-center gap-2.5 rounded-xl font-semibold"
                  style={{
                    height: '50px',
                    color: 'white',
                    fontSize: '14px',
                    boxShadow: loading ? 'none' : '0 4px 16px rgba(26,119,163,0.38)',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      Masuk ke GEMAS
                    </>
                  )}
                </button>
              </div>
            </form>
            </div>

            <div className="fade-up-5 flex items-center justify-center gap-2 mt-6">
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: '#94a3b8' }} />
              <p style={{ fontSize: '11px', color: '#94a3b8' }}>
                Sistem Internal · Hanya untuk Pengurus &amp; Majelis
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
