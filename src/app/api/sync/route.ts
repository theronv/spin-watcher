import { NextResponse } from 'next/server';
import { db, toRows } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = process.env.DISCOGS_TOKEN;
  const username = (process.env.DISCOGS_USER || '').replace(/[\u201C\u201D"]/g, '').trim();

  if (!token) {
    return NextResponse.json({ error: 'DISCOGS_TOKEN not set' }, { status: 400 });
  }

  const headers = {
    'User-Agent': 'SpinWatcher/2.0',
    Authorization: `Discogs token=${token}`,
  };

  // Fetch all pages (Discogs max per_page=100)
  const allItems: Record<string, unknown>[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = `https://api.discogs.com/users/${username}/collection/folders/0/releases?per_page=100&page=${page}&sort=added&sort_order=desc`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      return NextResponse.json({ error: 'Discogs API error' }, { status: response.status });
    }
    const data = await response.json();
    allItems.push(...(data.releases as Record<string, unknown>[]));
    totalPages = (data.pagination as { pages: number }).pages;
    page++;
  } while (page <= totalPages);

  const releases: Array<{ discogs_id: string; title: string; artist: string; cover_url: string }> =
    allItems.map((item) => {
      const info = item.basic_information as Record<string, unknown>;
      const artists = info.artists as Array<{ name: string }>;
      return {
        discogs_id: String(item.id),
        title: String(info.title),
        artist: artists[0]?.name ?? 'Unknown',
        cover_url: String(info.cover_image),
      };
    });

  // Upsert all records
  for (const r of releases) {
    await db.execute({
      sql: `INSERT INTO records (discogs_id, title, artist, cover_url)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(discogs_id) DO UPDATE SET
              title     = excluded.title,
              artist    = excluded.artist,
              cover_url = excluded.cover_url`,
      args: [r.discogs_id, r.title, r.artist, r.cover_url],
    });
  }

  // Return from DB so response matches the /api/records shape
  const result = await db.execute(
    'SELECT discogs_id, title, artist, cover_url, added_at FROM records ORDER BY added_at DESC'
  );
  return NextResponse.json(toRows(result));
}
