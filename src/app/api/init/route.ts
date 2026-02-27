import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS records (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      discogs_id TEXT UNIQUE NOT NULL,
      title      TEXT NOT NULL,
      artist     TEXT NOT NULL,
      cover_url  TEXT,
      added_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS plays (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      discogs_id TEXT NOT NULL,
      played_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return NextResponse.json({ ok: true });
}
