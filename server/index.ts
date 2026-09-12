import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { hashPassword, isHashed } from './lib/passwordUtils.js';
import { getJwtSecret } from './lib/jwt.js';
import cron from 'node-cron';
import { initSchema, getPool, getAll, upsert } from './lib/db.js';
import { logger } from './lib/logger.js';
import { createServer as createViteServer } from 'vite';
import { createApp } from './app.js';
import { encryptData } from './routes/backup.js';

// ── Validate environment variables ───────────────────────────────────────────
function validateEnv() {
  const { DATABASE_URL } = process.env;
  if (!DATABASE_URL) {
    logger.warn('DATABASE_URL is not set — running with in-memory storage fallback');
  }
  // Security fix: sebelumnya cuma warning lalu tetap jalan pakai kunci fallback
  // hardcoded, termasuk di production -- lihat catatan lengkap di
  // server/lib/jwt.ts getJwtSecret(). Di production, ini sekarang benar-benar
  // menghentikan startup server (fail-fast) alih-alih diam-diam berjalan
  // dengan kunci yang sudah publik.
  try {
    getJwtSecret();
  } catch (err) {
    logger.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  }
}

// ── Migrate plaintext passwords to bcrypt on startup ─────────────────────────
async function migratePlaintextPasswords() {
  try {
    const users = await getAll<any>('users');
    const plain = users.filter((u: any) => u.password && !isHashed(String(u.password)));
    if (plain.length === 0) return;
    for (const user of plain) {
      await upsert('users', user.id, { ...user, password: await hashPassword(String(user.password)) });
    }
    logger.info(`Migrated ${plain.length} plaintext password(s) to bcrypt`);
  } catch (err) {
    logger.warn('Password migration notice', { message: String(err) });
  }
}

// ── Automated backup (JSON export ke disk) ────────────────────────────────────
const BACKUP_DIR = path.resolve(process.cwd(), 'backups');

async function runBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const result = await getPool().query<{ collection: string; id: string; data: string }>(
      'SELECT collection, id, data FROM gemas_store ORDER BY collection, updated_at ASC'
    );

    const grouped: Record<string, unknown[]> = {};
    for (const row of result.rows) {
      if (!grouped[row.collection]) grouped[row.collection] = [];
      grouped[row.collection].push(JSON.parse(row.data));
    }
    if (grouped.users) {
      grouped.users = (grouped.users as any[]).map(({ password: _pw, ...u }) => u);
    }

    // Audit gap fix: backup manual (POST /api/backup/export, lihat backup.ts)
    // sudah dienkripsi AES-256-GCM lewat encryptData(), tapi backup harian
    // otomatis ini sebelumnya ditulis sebagai JSON POLOS ke disk -- berisi
    // seluruh data gereja (minus password user) tanpa proteksi apa pun kalau
    // disk/volume backup itu sendiri bocor atau diakses pihak tak berwenang.
    // Disamakan sekarang: pakai encryptData() yang sama (kunci diturunkan dari
    // JWT_SECRET yang sama), format & marker identik jadi tetap bisa direstore
    // lewat alur restore yang sudah ada (field `encrypted` di POST /api/backup/restore).
    const filename = `gemas-backup-${new Date().toISOString().slice(0, 10)}.enc.json`;
    const filePath = path.join(BACKUP_DIR, filename);
    const plaintext = JSON.stringify({ exportedAt: new Date().toISOString(), data: grouped });
    fs.writeFileSync(filePath, encryptData(plaintext));

    // Hapus backup lebih dari 7 hari (termasuk file lama format .json polos
    // dari sebelum fix ini, supaya tidak menumpuk selamanya di disk)
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('gemas-backup-'))
      .sort();
    if (files.length > 7) {
      files.slice(0, files.length - 7).forEach(f => {
        try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {}
      });
    }

    logger.info('Automated backup completed', { file: filename });
  } catch (err) {
    logger.warn('Automated backup skipped', { message: String(err) });
  }
}

async function startServer() {
  validateEnv();

  const app = createApp();
  const PORT = 3000;

  // ── Vite middleware (dev) / Static asset serving (prod) ───────────────────────
  const cspHeader = "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https:; style-src 'self' 'unsafe-inline' https:; worker-src 'self' blob: data:; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https: wss: ws: data: blob:;";

  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', cspHeader);
    next();
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
        headers: {
          'Content-Security-Policy': cspHeader,
        },
        hmr: {
          clientPort: 443,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // ── Initialize database schema and background jobs ───────────────────────────
  await initSchema();
  await migratePlaintextPasswords();

  // Backup otomatis setiap hari jam 02:00 WIB
  cron.schedule('0 2 * * *', runBackup, {
    timezone: 'Asia/Jakarta',
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`GEMAS server running on http://0.0.0.0:${PORT}`, { port: PORT, env: process.env.NODE_ENV });
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────────
  function shutdown() {
    logger.info('Shutting down gracefully...');
    server.close(() => {
      getPool().end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// ── Process-level error guards ────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { message: err.message });
});

startServer().catch(err => {
  logger.error('Failed to start server', { message: err.message });
  process.exit(1);
});
