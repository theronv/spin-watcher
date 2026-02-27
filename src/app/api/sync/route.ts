import { NextResponse } from 'next/server';
import { db, toRows } from '@/lib/db';

export async function GET() {
  const token = process.env.DISCOGS_TOKEN;
  const username = (process.env.DISCOGS_USER || '').replace(/[\u201C\u201D"]/g, '').trim();

  if (!token) {
    return NextResponse.json({ error: 'DISCOGS_TOKEN not set' }, { status: 400 });
  }

  const url = `https://api.discogs.com/users/${username}/collection/folders/0/releases?per_page=100&sort=added&sort_order=desc`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'SpinWatcher/2.0',
      Authorization: `Discogs token=${token}`,
    },
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Discogs API error' }, { status: response.status });
  }

  const data = await response.json();
  const releases: Array<{ discogs_id: string; title: string; artist: string; cover_url: string }> =
    data.releases.map((item: Record<string, unknown>) => {
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
