import { NextResponse } from 'next/server';
import OAuth from 'oauth-1.0a';
import { createHmac } from 'crypto';
import { db, toRows } from '@/lib/db';
import { getSession } from '@/lib/session';

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

/** Build Discogs fetch headers from session OAuth tokens, falling back to personal token. */
function buildHeaders(
  url: string,
  session: { access_token: string; access_token_secret: string } | null,
): Record<string, string> {
  if (session?.access_token && session?.access_token_secret) {
    const oauth      = makeOAuth();
    const token      = { key: session.access_token, secret: session.access_token_secret };
    const authHeader = oauth.toHeader(oauth.authorize({ url, method: 'GET' }, token));
    return { ...authHeader, 'User-Agent': 'NeedleDrop/2.0' };
  }

  const envToken = process.env.DISCOGS_TOKEN;
  if (envToken) {
    return { 'User-Agent': 'NeedleDrop/2.0', Authorization: `Discogs token=${envToken}` };
  }

  return { 'User-Agent': 'NeedleDrop/2.0' };
}

export async function GET(request: Request) {
  const session = await getSession(request);

  // Resolve username: OAuth session first, env var fallback for demo/single-user mode
  const envUser  = (process.env.DISCOGS_USER ?? '').replace(/[\u201C\u201D"]/g, '').trim();
  const username = session?.username ?? (envUser || null);

  if (!username) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const allItems: Record<string, unknown>[] = [];
  let page       = 1;
  let totalPages = 1;

  do {
    const url = `https://api.discogs.com/users/${username}/collection/folders/0/releases?per_page=100&page=${page}&sort=added&sort_order=desc`;
    const response = await fetch(url, { headers: buildHeaders(url, session) });

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
      username,
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
      sql: `INSERT INTO records (username, discogs_id, title, artist, cover_url, genres, styles, year, label, format)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(username, discogs_id) DO UPDATE SET
              title     = excluded.title,
              artist    = excluded.artist,
              cover_url = excluded.cover_url,
              genres    = excluded.genres,
              styles    = excluded.styles,
              year      = excluded.year,
              label     = excluded.label,
              format    = excluded.format`,
      args: [r.username, r.discogs_id, r.title, r.artist, r.cover_url, r.genres, r.styles, r.year, r.label, r.format],
    })),
    'write',
  );

  const result = await db.execute({
    sql: `SELECT discogs_id, title, artist, cover_url, added_at, genres, styles, year, label, format
          FROM records
          WHERE username = ?
          ORDER BY added_at DESC`,
    args: [username],
  });
  return NextResponse.json(toRows(result));
}
