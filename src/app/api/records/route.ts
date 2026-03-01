import { NextResponse } from 'next/server';
import { db, toRows } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await db.execute({
    sql: `SELECT discogs_id, title, artist, cover_url, added_at, genres, styles, year, label, format
          FROM records
          WHERE username = ?
          ORDER BY added_at DESC`,
    args: [session.username],
  });
  return NextResponse.json(toRows(result));
}
