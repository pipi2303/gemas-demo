import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import { getModalRootEl } from '../../lib/modalRoot';
import {
  Bell, Check, CheckCheck, X, Calendar, Gift,
  MessageSquare, AlertCircle, Info, AlertTriangle, Trash2, Heart,
} from 'lucide-react';
import { format, isToday, isTomorrow, differenceInDays } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { liveAge } from '../../lib/age';

// ── Helpers ────────────────────────────────────────────────────────────────────
function relativeTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isToday(d))    return `Hari ini, ${format(d, 'HH:mm')}`;
    if (isTomorrow(d)) return `Besok, ${format(d, 'HH:mm')}`;
    const diff = differenceInDays(new Date(), d);
    if (diff < 7)      return `${diff} hari lalu`;
    return format(d, 'dd MMM yyyy', { locale: idLocale });
  } catch { return ''; }
}

const TYPE_CFG: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string; label: string }> = {
  birthday:     { icon: <Gift          style={{ width: 16, height: 16 }} />, color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', label: 'Ulang Tahun' },
  event:        { icon: <Calendar      style={{ width: 16, height: 16 }} />, color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', label: 'Acara' },
  announcement: { icon: <MessageSquare style={{ width: 16, height: 16 }} />, color: '#1A77A3', bg: '#f0f7fb', border: '#b8d5e8', label: 'Pengumuman' },
  prayer:       { icon: <Heart         style={{ width: 16, height: 16 }} />, color: '#be185d', bg: '#fdf2f8', border: '#f9a8d4', label: 'Doa' },
  attendance:   { icon: <AlertTriangle  style={{ width: 16, height: 16 }} />, color: '#9c9486', bg: '#f6f4f0', border: '#e8e4d8', label: 'Kehadiran' },
  system:       { icon: <Info           style={{ width: 16, height: 16 }} />, color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', label: 'Sistem' },
  alert:        { icon: <AlertCircle    style={{ width: 16, height: 16 }} />, color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Penting' },
};
const DEFAULT_CFG = TYPE_CFG.system;

type FilterType = 'all' | 'unread' | 'birthday' | 'event' | 'announcement' | 'prayer' | 'alert';

// ── Main Panel ─────────────────────────────────────────────────────────────────
export function NotificationCenter({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const {
    notifications, markNotificationRead, markAllNotificationsRead,
    deleteNotification, members, events, announcements, prayerRequests, addNotification,
  } = useApp();

  const [filter, setFilter] = useState<FilterType>('all');

  // ── Auto-generate: birthday & event reminders ─────────────────────────────
  useEffect(() => {
    const today = format(new Date(), 'MM-dd');
    members.forEach(member => {
      if (!member.birthDate) return;
      if (format(new Date(member.birthDate), 'MM-dd') !== today) return;
      const exists = notifications.find(
        n => (n.link === `bday-${member.id}-${today}`) || (n.type === 'birthday' && n.message.includes(member.fullName) && isToday(new Date(n.createdAt)))
      );
      if (!exists) {
        addNotification({
          type: 'birthday', title: 'Ulang Tahun Hari Ini',
          message: `${member.fullName} berulang tahun hari ini (${liveAge(member)} tahun)`,
          read: false, priority: 'medium',
          link: `bday-${member.id}-${today}`,
        });
      }
    });
    events.forEach(event => {
      const daysUntil = differenceInDays(new Date(event.date), new Date());
      if (daysUntil === 1 && event.status === 'Akan Datang') {
        const exists = notifications.find(n => n.type === 'event' && n.link === `ev-auto-${event.id}`);
        if (!exists) {
          addNotification({
            type: 'event', title: 'Acara Besok',
            message: `${event.title} akan berlangsung besok pukul ${event.time}`,
            read: false, priority: 'high', link: `ev-auto-${event.id}`,
          });
        }
      }
    });
  }, [members.length, events.length]);

  // ── Auto-generate: pengumuman aktif baru ─────────────────────────────────
  useEffect(() => {
    announcements.filter(a => a.isActive).forEach(ann => {
      const exists = notifications.find(n => n.link === `ann-${ann.id}`);
      if (!exists) {
        addNotification({
          type: 'announcement', title: 'Pengumuman Baru',
          message: ann.title,
          read: false, priority: 'low', link: `ann-${ann.id}`,
        });
      }
    });
  }, [announcements.length]);

  // ── Auto-generate: permintaan doa baru ───────────────────────────────────
  useEffect(() => {
    prayerRequests.filter(pr => pr.status === 'Aktif').slice(-3).forEach(pr => {
      const exists = notifications.find(n => n.link === `prayer-${pr.id}`);
      if (!exists) {
        const member = members.find(m => m.id === pr.memberId);
        const name   = member ? member.fullName : 'Jemaat';
        const msg    = pr.request.length > 70 ? pr.request.substring(0, 70) + '…' : pr.request;
        addNotification({
          type: 'prayer', title: `Doa: ${name}`,
          message: msg,
          read: false, priority: 'medium', link: `prayer-${pr.id}`,
        });
      }
    });
  }, [prayerRequests.length]);

  // Sanitasi notifikasi untuk memastikan setiap item memiliki ID unik (mencegah duplicate key React)
  const seenIds = new Set<string>();
  const sanitizedNotifications = notifications.map((n, i) => {
    let id = n.id;
    if (!id || seenIds.has(id)) {
      id = `${id || 'not'}_${i}_${Math.random().toString(36).slice(2, 6)}`;
    }
    seenIds.add(id);
    return id === n.id ? n : { ...n, id };
  });

  const unreadCnt  = sanitizedNotifications.filter(n => !n.read).length;
  const readCnt    = sanitizedNotifications.filter(n => n.read).length;

  const filtered = sanitizedNotifications.filter(n => {
    if (filter === 'unread') return !n.read;
    if (filter === 'all')    return true;
    return n.type === filter;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleDeleteRead = () => {
    sanitizedNotifications.filter(n => n.read).forEach(n => deleteNotification(n.id));
  };

  if (!isOpen) return null;

  const FILTER_TABS: { key: FilterType; label: string }[] = [
    { key: 'all',          label: `Semua (${notifications.length})` },
    { key: 'unread',       label: `Belum Dibaca (${unreadCnt})` },
    { key: 'event',        label: 'Acara' },
    { key: 'birthday',     label: 'Ulang Tahun' },
    { key: 'announcement', label: 'Pengumuman' },
    { key: 'prayer',       label: 'Doa' },
    { key: 'alert',        label: 'Penting' },
  ];

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'absolute', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 400, height: '100%',
          display: 'flex', flexDirection: 'column',
          background: '#fff', boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
      >
        {/* ── Header */}
        <div style={{
          padding: '18px 20px 14px', background: '#0f2d41', flexShrink: 0,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell style={{ width: 18, height: 18, color: '#b8d5e8' }} />
              <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                Notifikasi
              </span>
            </div>
            <span style={{ fontSize: 12, color: '#a7c8d9', marginTop: 2, display: 'block' }}>
              {unreadCnt > 0 ? `${unreadCnt} belum dibaca` : 'Semua sudah dibaca'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: '50%', border: 'none',
              background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* ── Filter tabs */}
        <div style={{
          padding: '10px 14px 8px', background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {FILTER_TABS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                  border: 'none', cursor: 'pointer', transition: 'all .15s',
                  background: filter === f.key ? '#1A77A3' : '#fff',
                  color: filter === f.key ? '#fff' : '#374151',
                  boxShadow: filter === f.key ? '0 2px 8px rgba(26,119,163,0.3)' : '0 1px 3px rgba(0,0,0,0.08)',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {unreadCnt > 0 && (
              <button
                onClick={markAllNotificationsRead}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 11, color: '#1A77A3', fontWeight: 600,
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                <CheckCheck style={{ width: 13, height: 13 }} />
                Tandai Semua Dibaca
              </button>
            )}
            {readCnt > 0 && (
              <button
                onClick={handleDeleteRead}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 11, color: '#94a3b8', fontWeight: 600,
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                <Trash2 style={{ width: 13, height: 13 }} />
                Hapus yang Sudah Dibaca
              </button>
            )}
          </div>
        </div>

        {/* ── List */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {filtered.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', minHeight: 200,
              color: '#94a3b8', padding: 32,
            }}>
              <Bell style={{ width: 40, height: 40, marginBottom: 10, opacity: 0.4 }} />
              <p style={{ fontSize: 13, fontWeight: 500 }}>Tidak ada notifikasi</p>
              <p style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
                {filter === 'unread' ? 'Semua sudah dibaca' : 'Belum ada notifikasi'}
              </p>
            </div>
          ) : (
            <div>
              {filtered.map((notif, idx) => {
                const cfg = TYPE_CFG[notif.type] ?? DEFAULT_CFG;
                return (
                  <div
                    key={`${notif.id}-${idx}`}
                    style={{
                      padding: '13px 16px',
                      borderBottom: '1px solid #f1f5f9',
                      background: notif.read ? '#fff' : '#f0f7fb',
                      display: 'flex', gap: 11, alignItems: 'flex-start',
                      borderLeft: `3px solid ${notif.read ? '#e2e8f0' : cfg.border}`,
                      transition: 'background .12s',
                      position: 'relative',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = notif.read ? '#f8fafc' : '#e8f3f9')}
                    onMouseLeave={e => (e.currentTarget.style.background = notif.read ? '#fff' : '#f0f7fb')}
                  >
                    {/* Icon */}
                    <div
                      onClick={() => markNotificationRead(notif.id)}
                      style={{
                        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                        background: cfg.bg, border: `1px solid ${cfg.border}`,
                        color: cfg.color, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {cfg.icon}
                    </div>

                    {/* Content */}
                    <div
                      onClick={() => markNotificationRead(notif.id)}
                      style={{ flex: 1, minWidth: 0, cursor: 'pointer', paddingRight: 28 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <p style={{
                          fontSize: 13, fontWeight: notif.read ? 500 : 700,
                          color: '#0f172a', lineHeight: 1.35,
                          fontFamily: 'Plus Jakarta Sans, sans-serif',
                          flex: 1,
                        }}>
                          {notif.title}
                        </p>
                        {!notif.read && (
                          <span style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: '#1A77A3', flexShrink: 0, marginTop: 5,
                          }} />
                        )}
                      </div>
                      <p style={{ fontSize: 12, color: '#475569', marginTop: 3, lineHeight: 1.5 }}>
                        {notif.message}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>
                          {relativeTime(notif.createdAt)}
                        </span>
                        <span style={{
                          fontSize: 10, color: cfg.color, fontWeight: 600,
                          background: cfg.bg, padding: '1px 5px', borderRadius: 4,
                          border: `1px solid ${cfg.border}`,
                        }}>
                          {cfg.label}
                        </span>
                        {notif.priority === 'high' && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: '#dc2626',
                            background: '#fef2f2', padding: '1px 6px', borderRadius: 4,
                            border: '1px solid #fecaca',
                          }}>
                            PENTING
                          </span>
                        )}
                        {notif.read && (
                          <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Check style={{ width: 10, height: 10 }} /> Dibaca
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={e => { e.stopPropagation(); deleteNotification(notif.id); }}
                      title="Hapus notifikasi"
                      style={{
                        position: 'absolute', top: 10, right: 10,
                        width: 22, height: 22, borderRadius: '50%',
                        border: 'none', background: 'transparent',
                        color: '#cbd5e1', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all .12s',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = '#fee2e2';
                        (e.currentTarget as HTMLButtonElement).style.color = '#dc2626';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                        (e.currentTarget as HTMLButtonElement).style.color = '#cbd5e1';
                      }}
                    >
                      <X style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                );
              })}

              <div style={{ padding: '12px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: '#cbd5e1' }}>
                  {filtered.length} notifikasi ditampilkan
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    getModalRootEl()
  );
}

// ── Bell Button ────────────────────────────────────────────────────────────────
export function NotificationBell({ dark = false }: { dark?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const { notifications } = useApp();
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
      <button
        onClick={() => setIsOpen(v => !v)}
        style={{
          position: 'relative',
          padding: '7px',
          borderRadius: 9999,
          border: dark ? '1px solid rgba(255,255,255,0.15)' : 'none',
          background: dark
            ? isOpen ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'
            : isOpen ? '#e8f3f9' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background .15s, border-color .15s',
        }}
        data-tooltip={`Notifikasi${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
      >
        <Bell style={{ width: 18, height: 18, color: dark ? '#ffffff' : (isOpen ? '#1A77A3' : '#374151') }} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            background: '#dc2626', color: '#fff',
            fontSize: 9, fontWeight: 800, lineHeight: 1,
            borderRadius: 99, minWidth: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', border: dark ? '1.5px solid #0d1a2d' : '2px solid #fff',
            fontFamily: 'Inter, sans-serif',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationCenter isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
