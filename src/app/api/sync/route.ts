import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import OAuth from 'oauth-1.0a';
import { createHmac } from 'crypto';
import { db, toRows } from '@/lib/db';

export const dynamic = 'force-dynamic';

function makeOAuth() {
  return new OAuth({
    consumer: {
      key:    process.env.DISCOGS_CONSUMER_KEY!,
      secret: process.env.DISCOGS_CONSUMER_SECRET!,
    },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string, key) {
      return createHmac('sha1', key).update(base_string).digest('base64');
    },
  });
}

/** Build fetch headers — OAuth session token takes priority over personal access token */
async function buildHeaders(url: string): Promise<Record<string, string>> {
  const cookieStore = await cookies();
  const raw = cookieStore.get('discogs_session')?.value;

  if (raw) {
    try {
      const session = JSON.parse(raw) as { access_token: string; access_token_secret: string };
      if (session.access_token && session.access_token_secret) {
        const oauth      = makeOAuth();
        const token      = { key: session.access_token, secret: session.access_token_secret };
        const authHeader = oauth.toHeader(oauth.authorize({ url, method: 'GET' }, token));
        return { ...authHeader, 'User-Agent': 'NeedleDrop/2.0' };
      }
    } catch { /* fall through */ }
  }

  // Fall back to personal access token (demo / env-var mode)
  const token = process.env.DISCOGS_TOKEN;
  if (token) {
    return {
      'User-Agent':    'NeedleDrop/2.0',
      Authorization:   `Discogs token=${token}`,
    };
  }

  return { 'User-Agent': 'NeedleDrop/2.0' };
}

/** Resolve username — prefer session, fall back to DISCOGS_USER env var */
async function resolveUsername(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get('discogs_session')?.value;

  if (raw) {
    try {
      const session = JSON.parse(raw) as { username: string };
      if (session.username) return session.username;
    } catch { /* fall through */ }
  }

  const envUser = (process.env.DISCOGS_USER ?? '').replace(/[\u201C\u201D"]/g, '').trim();
  return envUser || null;
}

export async function GET() {
  const username = await resolveUsername();
  if (!username) {
    return NextResponse.json({ error: 'Not authenticated and DISCOGS_USER not set' }, { status: 401 });
  }

  const allItems: Record<string, unknown>[] = [];
  let page       = 1;
  let totalPages = 1;

  do {
    const url = `https://api.discogs.com/users/${username}/collection/folders/0/releases?per_page=100&page=${page}&sort=added&sort_order=desc`;
    const headers = await buildHeaders(url);

    const response = await fetch(url, { headers });
    if (!response.ok) {
      return NextResponse.json({ error: 'Discogs API error' }, { status: response.status });
    }

    const data = await response.json();
    allItems.push(...(data.releases as Record<string, unknown>[]));
    totalPages = (data.pagination as { pages: number }).pages;
    page++;
  } while (page <= totalPages);

  const releases = allItems.map((item) => {
    const info    = item.basic_information as Record<string, unknown>;
    const artists = info.artists as Array<{ name: string }>;
    const labels  = (info.labels  as Array<{ name: string }>) ?? [];
    const formats = (info.formats as Array<{ name: string }>) ?? [];

    return {
      discogs_id: String(item.id),
      title:      String(info.title),
      artist:     artists[0]?.name ?? 'Unknown',
      cover_url:  String(info.cover_image ?? ''),
      genres:     JSON.stringify((info.genres  as string[]) ?? []),
      styles:     JSON.stringify((info.styles  as string[]) ?? []),
      year:       (info.year as number) || null,
      label:      labels[0]?.name  ?? null,
      format:     formats[0]?.name ?? null,
    };
  });

  await db.batch(
    releases.map(r => ({
      sql: `INSERT INTO records (discogs_id, title, artist, cover_url, genres, styles, year, label, format)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(discogs_id) DO UPDATE SET
              title     = excluded.title,
              artist    = excluded.artist,
              cover_url = excluded.cover_url,
              genres    = excluded.genres,
              styles    = excluded.styles,
              year      = excluded.year,
              label     = excluded.label,
              format    = excluded.format`,
      args: [r.discogs_id, r.title, r.artist, r.cover_url, r.genres, r.styles, r.year, r.label, r.format],
    })),
    'write',
  );

  const result = await db.execute(
    'SELECT discogs_id, title, artist, cover_url, added_at, genres, styles, year, label, format FROM records ORDER BY added_at DESC'
  );
  return NextResponse.json(toRows(result));
}
