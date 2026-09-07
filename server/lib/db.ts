import pg from 'pg';
import bcrypt from 'bcryptjs';
import { initFinanceSchema } from './financeSchema.js';

const { Pool } = pg;

interface StoreRow {
  collection: string;
  id: string;
  data: string;
  updated_at: Date;
}

// In-memory fallback store
const inMemoryStore = new Map<string, Map<string, StoreRow>>();
let isUsingInMemory = false;
let pool: pg.Pool | null = null;

function getStoreCollection(collection: string) {
  if (!inMemoryStore.has(collection)) {
    inMemoryStore.set(collection, new Map());
  }
  return inMemoryStore.get(collection)!;
}

function seedDefaultUsersInMemory() {
  const usersCol = getStoreCollection('users');
  const initialUsers = [
    { name: 'Pipi Administrator', username: 'pipi', password: 'pipi123' },
    { name: 'Administrator', username: 'admin', password: 'admin123' },
    { name: 'Admin', username: 'admin_caps', password: 'Admin123' },
    { name: 'Polii', username: 'polii', password: 'Poli123' },
    { name: 'Hendri', username: 'hendri', password: 'Hendri123' },
    { name: 'Edo', username: 'edo', password: 'Edo123' },
    { name: 'Julian', username: 'julian', password: 'Julian123' },
    { name: 'Krisni', username: 'krisni', password: 'Krisni123' },
    { name: 'Djimy', username: 'djimy', password: 'Djimy123' },
    { name: 'Meyke', username: 'meyke', password: 'Meyke123' },
    { name: 'Otrie', username: 'otrie', password: 'Otrie123' },
    { name: 'Gita', username: 'gita', password: 'Gita123' },
    { name: 'Emmy', username: 'emmy', password: 'Emmy123' },
    { name: 'Sine', username: 'sine', password: 'Sine123' },
    { name: 'Todo', username: 'todo', password: 'Todo123' },
    { name: 'Nikky', username: 'nikky', password: 'Nikky123' },
  ];

  const now = new Date().toISOString();
  for (const u of initialUsers) {
    const existing = Array.from(usersCol.values()).find(
      row => JSON.parse(row.data).username === u.username
    );
    if (!existing) {
      const id = `u_${u.username}`;
      const hashed = bcrypt.hashSync(u.password, 10);
      const dataObj = {
        id,
        name: u.name,
        username: u.username,
        password: hashed,
        role: 'Admin',
        email: '',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      usersCol.set(id, {
        collection: 'users',
        id,
        data: JSON.stringify(dataObj),
        updated_at: new Date(),
      });
    }
  }
}

// Mock query runner for in-memory operations
async function mockQuery<T = any>(sql: string, params: any[] = []): Promise<{ rows: T[] }> {
  const trimmed = sql.trim();

  // BEGIN / COMMIT / ROLLBACK
  if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(trimmed)) {
    return { rows: [] };
  }

  // SELECT 1 (health check)
  if (/^SELECT\s+1/i.test(trimmed)) {
    return { rows: [{ '?column?': 1 } as any] };
  }

  // CREATE TABLE IF NOT EXISTS
  if (/^CREATE\s+TABLE/i.test(trimmed)) {
    return { rows: [] };
  }

  // SELECT data FROM gemas_store WHERE collection = $1 AND id = $2
  if (/SELECT\s+data\s+FROM\s+gemas_store\s+WHERE\s+collection\s*=\s*\$1\s+AND\s+id\s*=\s*\$2/i.test(trimmed)) {
    const [col, id] = params;
    const map = inMemoryStore.get(col);
    if (!map) return { rows: [] };
    const row = map.get(id);
    if (!row) return { rows: [] };
    return { rows: [{ data: row.data } as any] };
  }

  // SELECT data FROM gemas_store WHERE collection = $1 ORDER BY updated_at ASC
  if (/SELECT\s+data\s+FROM\s+gemas_store\s+WHERE\s+collection\s*=\s*\$1/i.test(trimmed)) {
    const col = params[0];
    const map = inMemoryStore.get(col);
    if (!map) return { rows: [] };
    const sorted = Array.from(map.values()).sort(
      (a, b) => a.updated_at.getTime() - b.updated_at.getTime()
    );
    return { rows: sorted.map(r => ({ data: r.data }) as any) };
  }

  // SELECT collection, id, data FROM gemas_store ORDER BY collection, updated_at ASC
  if (/SELECT\s+collection,\s*id,\s*data\s+FROM\s+gemas_store/i.test(trimmed)) {
    const allRows: StoreRow[] = [];
    for (const [, map] of inMemoryStore) {
      for (const [, row] of map) {
        allRows.push(row);
      }
    }
    allRows.sort((a, b) => {
      if (a.collection !== b.collection) return a.collection.localeCompare(b.collection);
      return a.updated_at.getTime() - b.updated_at.getTime();
    });
    return {
      rows: allRows.map(r => ({ collection: r.collection, id: r.id, data: r.data }) as any),
    };
  }

  // SELECT collection, COUNT(*) as cnt FROM gemas_store GROUP BY collection
  if (/SELECT\s+collection,\s*COUNT\(\*\)\s+as\s+cnt/i.test(trimmed)) {
    const rows: { collection: string; cnt: string }[] = [];
    for (const [col, map] of inMemoryStore) {
      rows.push({ collection: col, cnt: String(map.size) });
    }
    return { rows: rows as any };
  }

  // INSERT INTO gemas_store (collection, id, data, updated_at) VALUES ($1, $2, $3, NOW()) ...
  if (/INSERT\s+INTO\s+gemas_store/i.test(trimmed)) {
    const [col, id, data] = params;
    const map = getStoreCollection(col);
    map.set(id, {
      collection: col,
      id,
      data: typeof data === 'string' ? data : JSON.stringify(data),
      updated_at: new Date(),
    });
    return { rows: [] };
  }

  // DELETE FROM gemas_store WHERE collection = $1 AND id = $2
  if (/DELETE\s+FROM\s+gemas_store\s+WHERE\s+collection\s*=\s*\$1\s+AND\s+id\s*=\s*\$2/i.test(trimmed)) {
    const [col, id] = params;
    const map = inMemoryStore.get(col);
    if (map) map.delete(id);
    return { rows: [] };
  }

  // DELETE FROM gemas_store WHERE collection = $1
  if (/DELETE\s+FROM\s+gemas_store\s+WHERE\s+collection\s*=\s*\$1/i.test(trimmed)) {
    const col = params[0];
    inMemoryStore.delete(col);
    return { rows: [] };
  }

  // DELETE FROM gemas_store (truncate all)
  if (/DELETE\s+FROM\s+gemas_store$/i.test(trimmed)) {
    inMemoryStore.clear();
    seedDefaultUsersInMemory();
    return { rows: [] };
  }

  // DELETE FROM gemas_store WHERE collection = $1 AND data::jsonb->>'memberId' = $2
  if (/data::jsonb->>'memberId'/i.test(trimmed)) {
    const [col, memberId] = params;
    const map = inMemoryStore.get(col);
    if (map) {
      for (const [id, row] of map.entries()) {
        try {
          const parsed = JSON.parse(row.data);
          if (parsed.memberId === memberId) {
            map.delete(id);
          }
        } catch {
          // ignore
        }
      }
    }
    return { rows: [] };
  }

  return { rows: [] };
}

const mockPool = {
  query: mockQuery,
  connect: async () => ({
    query: mockQuery,
    release: () => {},
  }),
  on: () => {},
  end: async () => {},
} as unknown as pg.Pool;

export function isUsingInMemoryStore(): boolean {
  return isUsingInMemory;
}

export function getPool(): pg.Pool {
  if (isUsingInMemory) {
    return mockPool;
  }

  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.warn('[DB] DATABASE_URL not set — using in-memory store fallback');
      isUsingInMemory = true;
      seedDefaultUsersInMemory();
      return mockPool;
    }
    try {
      pool = new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
      pool.on('error', (err) => {
        console.error('[DB] Unexpected pool error:', err.message);
      });
    } catch {
      console.warn('[DB] Failed to initialize PostgreSQL pool — using in-memory store fallback');
      isUsingInMemory = true;
      seedDefaultUsersInMemory();
      return mockPool;
    }
  }
  return pool;
}

export async function initSchema() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('[DB] Running with in-memory database store (fallback)');
    isUsingInMemory = true;
    seedDefaultUsersInMemory();
    return;
  }

  try {
    const p = getPool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS gemas_store (
        collection TEXT NOT NULL,
        id         TEXT NOT NULL,
        data       TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (collection, id)
      )
    `);
    console.log('[DB] PostgreSQL schema initialized successfully');

    try {
      await initFinanceSchema(p);
      console.log('[DB] Finance Add-on schema initialized successfully');
    } catch (financeErr: any) {
      console.warn('[DB] Finance Add-on schema initialization failed: ' + financeErr.message);
    }
  } catch (err: any) {
    console.warn('[DB] Could not connect to PostgreSQL database (' + err.message + ') — falling back to in-memory store');
    isUsingInMemory = true;
    seedDefaultUsersInMemory();
  }
}

export async function getAll<T = unknown>(collection: string): Promise<T[]> {
  const result = await getPool().query<{ data: string }>(
    'SELECT data FROM gemas_store WHERE collection = $1 ORDER BY updated_at ASC',
    [collection]
  );
  return result.rows.map(r => JSON.parse(r.data) as T);
}

export async function getOne<T = unknown>(collection: string, id: string): Promise<T | null> {
  const result = await getPool().query<{ data: string }>(
    'SELECT data FROM gemas_store WHERE collection = $1 AND id = $2 LIMIT 1',
    [collection, id]
  );
  if (result.rows.length === 0) return null;
  return JSON.parse(result.rows[0].data) as T;
}

export async function upsert(collection: string, id: string, data: unknown) {
  await getPool().query(
    `INSERT INTO gemas_store (collection, id, data, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (collection, id)
     DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [collection, id, JSON.stringify(data)]
  );
}

export async function remove(collection: string, id: string) {
  await getPool().query(
    'DELETE FROM gemas_store WHERE collection = $1 AND id = $2',
    [collection, id]
  );
}

export async function getAllCollectionCounts(): Promise<Record<string, number>> {
  const result = await getPool().query<{ collection: string; cnt: string }>(
    'SELECT collection, COUNT(*) as cnt FROM gemas_store GROUP BY collection ORDER BY collection'
  );
  const counts: Record<string, number> = {};
  result.rows.forEach(r => { counts[r.collection] = Number(r.cnt); });
  return counts;
}

export async function truncateAll(): Promise<void> {
  await getPool().query('DELETE FROM gemas_store');
}

/** Batch upsert dalam satu transaksi */
export async function batchUpsert(
  items: { collection: string; id: string; data: unknown }[]
): Promise<void> {
  if (items.length === 0) return;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      await client.query(
        `INSERT INTO gemas_store (collection, id, data, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (collection, id)
         DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
        [item.collection, item.id, JSON.stringify(item.data)]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
