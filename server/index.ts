import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import { hashPassword, isHashed } from './lib/passwordUtils.js';
import cron from 'node-cron';
import { initSchema, getPool, getAll, upsert } from './lib/db.js';
import { logger } from './lib/logger.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import backupRoutes from './routes/backup.js';
import permissionsRoutes from './routes/permissions.js';
import adminRoutes from './routes/admin.js';
import { createServer as createViteServer } from 'vite';

// ── Validate environment variables ───────────────────────────────────────────
function validateEnv() {
  const { JWT_SECRET, DATABASE_URL } = process.env;
  if (!DATABASE_URL) {
    logger.warn('DATABASE_URL is not set — running with in-memory storage fallback');
  }
  if (!JWT_SECRET) {
    logger.warn('JWT_SECRET is not set — running with default fallback key');
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

    const filename = `gemas-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const filePath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify({ exportedAt: new Date().toISOString(), data: grouped }));

    // Hapus backup lebih dari 7 hari
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  validateEnv();

  const app = express();
  const PORT = 3000;

  // ── Trust reverse proxy (Cloud Run, ingress, load balancers) ──────────────────
  app.set('trust proxy', true);

  // ── Security headers ──────────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));

  const allowedOrigins = (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      cb(null, true);
    },
    credentials: true,
  }));

  // ── General API rate limit: 1000 req/min per IP ──────────────────────────────
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    message: { error: 'Terlalu banyak request. Coba lagi sebentar.' },
    skip: (req) => req.path === '/auth/me' || req.path === '/health',
  });
  app.use('/api/', apiLimiter);

  // ── Request logging ───────────────────────────────────────────────────────────
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      logger.info('request', { method: req.method, path: req.path, ip: req.ip });
    }
    next();
  });

  // ── Health check ──────────────────────────────────────────────────────────────
  app.get('/api/health', async (_req, res) => {
    try {
      await getPool().query('SELECT 1');
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.json({ status: 'ok', database: 'in-memory-fallback' });
    }
  });

  // ── API routes ────────────────────────────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/data', dataRoutes);
  app.use('/api/backup', backupRoutes);
  app.use('/api/permissions', permissionsRoutes);
  app.use('/api/admin', adminRoutes);

  // ── Vite middleware (dev) / Static asset serving (prod) ───────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
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

  // ── Global Express error handler ──────────────────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', { message: err.message });
    res.status(500).json({ error: 'Internal server error' });
  });

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
