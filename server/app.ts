import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { getPool } from './lib/db.js';
import { logger } from './lib/logger.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import backupRoutes from './routes/backup.js';
import permissionsRoutes from './routes/permissions.js';
import adminRoutes from './routes/admin.js';
import financeMasterDataRoutes from './routes/financeMasterData.js';
import financeBudgetRoutes from './routes/financeBudget.js';
import financeTransactionRoutes from './routes/financeTransaction.js';
import financeLedgerRoutes from './routes/financeLedger.js';
import financeReconciliationRoutes from './routes/financeReconciliation.js';
import financePeriodClosingRoutes from './routes/financePeriodClosing.js';
import financeReportsRoutes from './routes/financeReports.js';
import financeDashboardRoutes from './routes/financeDashboard.js';
import letterNumbersRoutes from './routes/letterNumbers.js';
import outgoingLettersRoutes from './routes/outgoingLetters.js';
import incomingLettersRoutes from './routes/incomingLetters.js';

/** Express app tanpa app.listen()/cron — dipakai baik oleh server lokal/VPS (server/index.ts) maupun serverless function Vercel (api/server.ts). */
export function createApp() {
  const app = express();

  app.set('trust proxy', true);

  // CSP FIX -- sebelumnya contentSecurityPolicy: false (dimatikan total, browser
  // tidak dapat perlindungan XSS/injection sama sekali dari header ini). Diaktifkan
  // dengan policy yang disesuaikan kebutuhan nyata aplikasi ini (bukan default
  // helmet yang terlalu ketat untuk SPA React+Tailwind ini):
  // - style-src perlu 'unsafe-inline' karena banyak komponen pakai inline
  //   style={{...}} React (bukan <style> tag/CSS-in-JS terpisah) -- tanpa ini UI
  //   akan rusak luas. script-src TETAP ketat ('self' saja, tanpa unsafe-inline/eval)
  //   karena itu vektor XSS yang paling berbahaya.
  // - fonts.googleapis.com/fonts.gstatic.com diizinkan karena src/styles/fonts.css
  //   memang memuat Google Fonts (Cinzel/Inter/Playfair/Plus Jakarta Sans).
  // - img-src izinkan data:/blob: karena banyak fitur generate QR/preview PDF/upload
  //   gambar memakai data URI & blob URL di client.
  // - connect-src 'self' saja -- semua panggilan API app ini memang same-origin.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
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
      cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));

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

  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      logger.info('request', { method: req.method, path: req.path, ip: req.ip });
    }
    next();
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await getPool().query('SELECT 1');
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.json({ status: 'ok', database: 'in-memory-fallback' });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/data', dataRoutes);
  app.use('/api/backup', backupRoutes);
  app.use('/api/permissions', permissionsRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/v1/finance', financeMasterDataRoutes);
  app.use('/api/v1/finance/budgets', financeBudgetRoutes);
  app.use('/api/v1/finance/transactions', financeTransactionRoutes);
  app.use('/api/v1/finance/gl', financeLedgerRoutes);
  app.use('/api/v1/finance/reconciliation', financeReconciliationRoutes);
  app.use('/api/v1/finance/period-closing', financePeriodClosingRoutes);
  app.use('/api/v1/finance/reports', financeReportsRoutes);
  app.use('/api/v1/finance/dashboard', financeDashboardRoutes);
  app.use('/api/letters', letterNumbersRoutes);
  app.use('/api/outgoing-letters', outgoingLettersRoutes);
  app.use('/api/incoming-letters', incomingLettersRoutes);

  // Tangani seluruh request /api yang belum ter-handle agar tidak pernah jatuh ke Vite SPA index.html (<!doctype html>)
  app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint API tidak ditemukan: ${req.method} ${req.originalUrl}`,
      },
    });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', { message: err.message });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
