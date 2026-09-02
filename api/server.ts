import type { Request, Response } from 'express';
import { createApp } from '../server/app.js';
import { initSchema } from '../server/lib/db.js';

const app = createApp();

let schemaReady: Promise<void> | null = null;

export default async function handler(req: Request, res: Response) {
  if (!schemaReady) {
    schemaReady = initSchema();
  }
  await schemaReady;
  return app(req, res);
}
