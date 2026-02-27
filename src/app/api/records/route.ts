import { NextResponse } from 'next/server';
import { db, toRows } from '@/lib/db';

export async function GET() {
  const result = await db.execute(
    'SELECT discogs_id, title, artist, cover_url, added_at FROM records ORDER BY added_at DESC'
  );
  return NextResponse.json(toRows(result));
}
