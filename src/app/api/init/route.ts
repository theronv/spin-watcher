import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS records (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      discogs_id TEXT UNIQUE NOT NULL,
      title      TEXT NOT NULL,
      artist     TEXT NOT NULL,
      cover_url  TEXT,
      added_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      genres     TEXT NOT NULL DEFAULT '[]',
      styles     TEXT NOT NULL DEFAULT '[]',
      year       INTEGER,
      label      TEXT,
      format     TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS plays (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      discogs_id TEXT NOT NULL,
      played_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Idempotent migrations for existing DBs (silently ignored if column already exists)
  const migrations = [
    `ALTER TABLE records ADD COLUMN genres  TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE records ADD COLUMN styles  TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE records ADD COLUMN year    INTEGER`,
    `ALTER TABLE records ADD COLUMN label   TEXT`,
    `ALTER TABLE records ADD COLUMN format  TEXT`,
  ];
  for (const sql of migrations) {
    try { await db.execute(sql); } catch { /* column already exists */ }
  }

  return NextResponse.json({ ok: true });
}
