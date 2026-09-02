// In-memory blacklist with automatic expiry (cleans up expired tokens)
const blacklist = new Map<string, number>(); // jti -> expiry timestamp

export function blacklistToken(jti: string, expiresIn = 8 * 60 * 60 * 1000) {
  blacklist.set(jti, Date.now() + expiresIn);
}

export function isBlacklisted(jti: string): boolean {
  const exp = blacklist.get(jti);
  if (!exp) return false;
  if (Date.now() > exp) { blacklist.delete(jti); return false; }
  return true;
}

// Cleanup expired entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [jti, exp] of blacklist) {
    if (now > exp) blacklist.delete(jti);
  }
}, 60 * 60 * 1000);
