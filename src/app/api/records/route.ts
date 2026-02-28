import { NextResponse } from 'next/server';
import { db, toRows } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await db.execute(
    'SELECT discogs_id, title, artist, cover_url, added_at, genres, styles, year, label, format FROM records ORDER BY added_at DESC'
  );
  return NextResponse.json(toRows(result));
}
