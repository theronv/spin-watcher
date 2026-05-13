import { NextResponse } from 'next/server';
import { db, toRows } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

async function resolveSession(request: Request) {
  let session = await getSession(request);
  if (!session) {
    const envToken = process.env.DISCOGS_TOKEN;
    const envUser  = (process.env.DISCOGS_USER ?? '').replace(/[“”"]/g, '').trim();
    if (envToken && envUser) {
      session = { username: envUser, avatar_url: '', access_token: '', access_token_secret: '' };
    }
  }
  return session;
}

export async function GET(request: Request) {
  const session = await resolveSession(request);
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
