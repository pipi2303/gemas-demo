/**
 * seed-users-pg.mjs — Seed user ke PostgreSQL
 * Jalankan di dalam container gemas:
 *   node scripts/seed-users-pg.mjs
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const USERS = [
  { name: 'Polii',  username: 'polii',  password: 'Poli123'   },
  { name: 'Hendri', username: 'hendri', password: 'Hendri123' },
  { name: 'Edo',    username: 'edo',    password: 'Edo123'     },
  { name: 'Julian', username: 'julian', password: 'Julian123'  },
  { name: 'Krisni', username: 'krisni', password: 'Krisni123'  },
  { name: 'Djimy',  username: 'djimy',  password: 'Djimy123'   },
  { name: 'Meyke',  username: 'meyke',  password: 'Meyke123'   },
  { name: 'Otrie',  username: 'otrie',  password: 'Otrie123'   },
  { name: 'Gita',   username: 'gita',   password: 'Gita123'    },
  { name: 'Emmy',   username: 'emmy',   password: 'Emmy123'    },
  { name: 'Sine',   username: 'sine',   password: 'Sine123'    },
  { name: 'Todo',   username: 'todo',   password: 'Todo123'    },
  { name: 'Nikky',  username: 'nikky',  password: 'Nikky123'   },
];

await pool.query(`
  CREATE TABLE IF NOT EXISTS gemas_store (
    collection TEXT NOT NULL,
    id         TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (collection, id)
  )
`);

const existing = await pool.query(
  "SELECT data FROM gemas_store WHERE collection = 'users'"
);
const existingUsernames = new Set(
  existing.rows.map(r => JSON.parse(r.data).username)
);

let added = 0, skipped = 0;
const now = new Date().toISOString();

for (const u of USERS) {
  if (existingUsernames.has(u.username)) {
    console.log(`⏭  Skip (sudah ada): ${u.username}`);
    skipped++;
    continue;
  }

  const hashed = await bcrypt.hash(u.password, 10);
  const id = `u${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const data = {
    id, name: u.name, username: u.username,
    password: hashed, role: 'Admin',
    email: '', isActive: true,
    createdAt: now, updatedAt: now,
  };

  await pool.query(
    `INSERT INTO gemas_store (collection, id, data)
     VALUES ('users', $1, $2)
     ON CONFLICT (collection, id) DO NOTHING`,
    [id, JSON.stringify(data)]
  );

  console.log(`✅ Ditambahkan: ${u.name} (@${u.username})`);
  added++;
}

console.log(`\nSelesai: ${added} ditambahkan, ${skipped} dilewati.`);
await pool.end();
