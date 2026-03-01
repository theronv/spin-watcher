import { NextResponse } from 'next/server';
import { db, toRows } from '@/lib/db';

export async function GET() {

  // ── Create tables (current multi-tenant schema for new installations) ────────

  await db.execute(`
    CREATE TABLE IF NOT EXISTS records (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT NOT NULL DEFAULT '',
      discogs_id TEXT NOT NULL,
      title      TEXT NOT NULL,
      artist     TEXT NOT NULL,
      cover_url  TEXT,
      added_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      genres     TEXT NOT NULL DEFAULT '[]',
      styles     TEXT NOT NULL DEFAULT '[]',
      year       INTEGER,
      label      TEXT,
      format     TEXT,
      UNIQUE(username, discogs_id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS plays (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT NOT NULL DEFAULT '',
      discogs_id TEXT NOT NULL,
      played_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Migration: records — add username + change unique constraint ─────────────
  //
  // SQLite cannot ALTER a UNIQUE constraint in-place. The old schema had
  // UNIQUE(discogs_id); the new schema needs UNIQUE(username, discogs_id).
  // We detect the old schema via PRAGMA table_info and rebuild the table.
  //
  // Existing rows get username='' which is harmless — the next sync will
  // upsert them with the real username, associating them with the user.

  const recordsInfo = await db.execute('PRAGMA table_info(records)');
  const recordsCols = toRows(recordsInfo).map(r => String(r.name));

  if (!recordsCols.includes('username')) {
    await db.execute(`
      CREATE TABLE records_v2 (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        username   TEXT NOT NULL DEFAULT '',
        discogs_id TEXT NOT NULL,
        title      TEXT NOT NULL,
        artist     TEXT NOT NULL,
        cover_url  TEXT,
        added_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        genres     TEXT NOT NULL DEFAULT '[]',
        styles     TEXT NOT NULL DEFAULT '[]',
        year       INTEGER,
        label      TEXT,
        format     TEXT,
        UNIQUE(username, discogs_id)
      )
    `);
    await db.execute(`
      INSERT INTO records_v2
        (username, discogs_id, title, artist, cover_url, added_at, genres, styles, year, label, format)
      SELECT
        '', discogs_id, title, artist, cover_url, added_at, genres, styles, year, label, format
      FROM records
    `);
    await db.execute('DROP TABLE records');
    await db.execute('ALTER TABLE records_v2 RENAME TO records');
  }

  // ── Migration: plays — add username column ───────────────────────────────────

  const playsInfo = await db.execute('PRAGMA table_info(plays)');
  const playsCols = toRows(playsInfo).map(r => String(r.name));

  if (!playsCols.includes('username')) {
    await db.execute(`ALTER TABLE plays ADD COLUMN username TEXT NOT NULL DEFAULT ''`);
  }

  // ── Previous column migrations (idempotent, no-op if already applied) ────────

  const columnMigrations = [
    `ALTER TABLE records ADD COLUMN genres  TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE records ADD COLUMN styles  TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE records ADD COLUMN year    INTEGER`,
    `ALTER TABLE records ADD COLUMN label   TEXT`,
    `ALTER TABLE records ADD COLUMN format  TEXT`,
  ];
  for (const sql of columnMigrations) {
    try { await db.execute(sql); } catch { /* column already exists */ }
  }

  return NextResponse.json({ ok: true });
}
