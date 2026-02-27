import { NextRequest, NextResponse } from 'next/server';
import { db, toRows } from '@/lib/db';

export async function GET() {
  const result = await db.execute(`
    SELECT
      discogs_id,
      COUNT(*)     AS play_count,
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
