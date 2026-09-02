export interface RoleStyle {
  /** Badge background — seragam putih untuk semua role */
  bg: string;
  /** Badge text color — unik per role */
  text: string;
  /** Badge border — hitam seragam */
  border: string;
  /** Avatar circle background — unik per role */
  avatarBg: string;
  /** Avatar text color — putih agar kontras */
  avatarText: string;
}

const BADGE_BG     = '#FFFFFF';
const BADGE_BORDER = '#1e293b';
const AVATAR_TEXT  = '#FFFFFF';

const ROLE_STYLES: Record<string, RoleStyle> = {
  KK:               { bg: BADGE_BG, text: '#B8860B', border: BADGE_BORDER, avatarBg: '#D4A017', avatarText: AVATAR_TEXT },
  'Kepala Keluarga':{ bg: BADGE_BG, text: '#B8860B', border: BADGE_BORDER, avatarBg: '#D4A017', avatarText: AVATAR_TEXT },
  IS:               { bg: BADGE_BG, text: '#059669', border: BADGE_BORDER, avatarBg: '#059669', avatarText: AVATAR_TEXT },
  'Istri':          { bg: BADGE_BG, text: '#059669', border: BADGE_BORDER, avatarBg: '#059669', avatarText: AVATAR_TEXT },
  'Istri/Suami':    { bg: BADGE_BG, text: '#059669', border: BADGE_BORDER, avatarBg: '#059669', avatarText: AVATAR_TEXT },
  AN:               { bg: BADGE_BG, text: '#2563EB', border: BADGE_BORDER, avatarBg: '#2563EB', avatarText: AVATAR_TEXT },
  'Anak':           { bg: BADGE_BG, text: '#2563EB', border: BADGE_BORDER, avatarBg: '#2563EB', avatarText: AVATAR_TEXT },
};

const DEFAULT_STYLE: RoleStyle = { bg: BADGE_BG, text: '#64748B', border: BADGE_BORDER, avatarBg: '#64748B', avatarText: AVATAR_TEXT };

export function roleStyle(role?: string): RoleStyle {
  if (!role) return DEFAULT_STYLE;
  return ROLE_STYLES[role] ?? DEFAULT_STYLE;
}

/** Urutan tampil: KK/Kepala Keluarga selalu paling depan */
const ROLE_ORDER = [
  'KK', 'Kepala Keluarga',
  'IS', 'Istri', 'Istri/Suami',
  'AN', 'Anak',
  'CU', 'Cucu',
  'OT', 'Orang Tua',
  'FA', 'Famili',
  'KA', 'Keponakan',
];

function roleRank(role?: string): number {
  const i = ROLE_ORDER.indexOf(role ?? '');
  return i === -1 ? 99 : i;
}

export function sortByRole<T extends { familyRole?: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => roleRank(a.familyRole) - roleRank(b.familyRole));
}

export function isKK(role?: string) {
  return role === 'KK' || role === 'Kepala Keluarga';
}
