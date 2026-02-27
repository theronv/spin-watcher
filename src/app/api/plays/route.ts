import { NextRequest, NextResponse } from 'next/server';
import { db, toRows } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await db.execute(`
    SELECT
      discogs_id,
      COUNT(*)       AS play_count,
      MAX(played_at) AS last_played
    FROM plays
    GROUP BY discogs_id
  `);
  return NextResponse.json(toRows(result));
}

export async function POST(req: NextRequest) {
  const { discogs_id } = await req.json();

  if (!discogs_id) {
    return NextResponse.json({ error: 'Missing discogs_id' }, { status: 400 });
  }

  await db.execute({
    sql: 'INSERT INTO plays (discogs_id) VALUES (?)',
    args: [String(discogs_id)],
  });

  const result = await db.execute({
    sql: `SELECT COUNT(*) AS play_count, MAX(played_at) AS last_played
          FROM plays WHERE discogs_id = ?`,
    args: [String(discogs_id)],
  });

  const row = toRows(result)[0];
  return NextResponse.json({
    discogs_id,
    play_count: Number(row.play_count),
    last_played: row.last_played,
  });
}

/**
 * PATCH /api/plays
 * Body: { discogs_id: string, count: number }
 * Overwrites the play count for a record by deleting all existing plays
 * and inserting `count` new ones via a recursive CTE (2 queries total).
 */
export async function PATCH(req: NextRequest) {
  const { discogs_id, count } = await req.json();

  if (!discogs_id) {
    return NextResponse.json({ error: 'Missing discogs_id' }, { status: 400 });
  }

  const n = Math.max(0, Math.min(9999, Math.floor(Number(count) || 0)));

  await db.execute({
    sql: 'DELETE FROM plays WHERE discogs_id = ?',
    args: [String(discogs_id)],
  });

  if (n > 0) {
    // Recursive CTE generates n rows — no loop needed
    await db.execute({
      sql: `WITH RECURSIVE counter(i) AS (
              SELECT 1 UNION ALL SELECT i + 1 FROM counter WHERE i < ?
            )
            INSERT INTO plays (discogs_id) SELECT ? FROM counter`,
      args: [n, String(discogs_id)],
    });
  }

  return NextResponse.json({
    discogs_id,
    play_count: n,
    last_played: n > 0 ? new Date().toISOString() : null,
  });
}
