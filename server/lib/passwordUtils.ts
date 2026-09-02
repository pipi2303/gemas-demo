import bcrypt from 'bcryptjs';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(plain: string, hashed: string): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (typeof hashed === 'string' && hashed.startsWith('$2')) {
    return { valid: await bcrypt.compare(plain, hashed), needsUpgrade: false };
  }
  return { valid: plain === hashed, needsUpgrade: true };
}

export function isHashed(password: string): boolean {
  return typeof password === 'string' && password.startsWith('$2');
}
