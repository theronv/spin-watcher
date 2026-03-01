import { NextRequest, NextResponse } from 'next/server';
import { db, toRows } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await db.execute({
    sql: `SELECT
            discogs_id,
            COUNT(*)       AS play_count,
            MAX(played_at) AS last_played
          FROM plays
          WHERE username = ?
          GROUP BY discogs_id`,
    args: [session.username],
  });
  return NextResponse.json(toRows(result));
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { discogs_id } = await req.json();
  if (!discogs_id) return NextResponse.json({ error: 'Missing discogs_id' }, { status: 400 });

  await db.execute({
    sql:  'INSERT INTO plays (username, discogs_id) VALUES (?, ?)',
    args: [session.username, String(discogs_id)],
  });

  const result = await db.execute({
    sql:  `SELECT COUNT(*) AS play_count, MAX(played_at) AS last_played
           FROM plays WHERE username = ? AND discogs_id = ?`,
    args: [session.username, String(discogs_id)],
  });

  const row = toRows(result)[0];
  return NextResponse.json({
    discogs_id,
    play_count:  Number(row.play_count),
    last_played: row.last_played,
  });
}

/**
 * PATCH /api/plays
 * Body: { discogs_id: string, count: number }
 * Overwrites the play count for the authenticated user's record.
 */
export async function PATCH(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { discogs_id, count } = await req.json();
  if (!discogs_id) return NextResponse.json({ error: 'Missing discogs_id' }, { status: 400 });

  const n = Math.max(0, Math.min(9999, Math.floor(Number(count) || 0)));

  await db.execute({
    sql:  'DELETE FROM plays WHERE username = ? AND discogs_id = ?',
    args: [session.username, String(discogs_id)],
  });

  if (n > 0) {
    await db.execute({
      sql: `WITH RECURSIVE counter(i) AS (
              SELECT 1 UNION ALL SELECT i + 1 FROM counter WHERE i < ?
            )
            INSERT INTO plays (username, discogs_id) SELECT ?, ? FROM counter`,
      args: [n, session.username, String(discogs_id)],
    });
  }

  return NextResponse.json({
    discogs_id,
    play_count:  n,
    last_played: n > 0 ? new Date().toISOString() : null,
  });
}
