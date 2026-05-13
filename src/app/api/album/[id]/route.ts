import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = process.env.DISCOGS_TOKEN;

  if (!token) {
    return NextResponse.json({ error: 'DISCOGS_TOKEN not set' }, { status: 400 });
  }

  const response = await fetch(`https://api.discogs.com/releases/${id}`, {
    headers: {
      'User-Agent': 'NeedleDrop/2.0',
      Authorization: `Discogs token=${token}`,
    },
    next: { revalidate: 604800 }, // 7 days
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Discogs API error' }, { status: response.status });
  }

  const data = await response.json();

  const tracklist = ((data.tracklist as Array<Record<string, unknown>>) ?? [])
    .filter((t) => t.type_ === 'track')
    .map((t) => ({
      position: String(t.position ?? ''),
      title:    String(t.title ?? ''),
      duration: String(t.duration ?? ''),
    }));

  const labels = (data.labels as Array<{ name: string }>) ?? [];
  const label  = labels[0]?.name ?? null;

  return NextResponse.json(
    {
      year:      (data.year as number) || null,
      label,
      genres:    (data.genres  as string[]) ?? [],
      styles:    (data.styles  as string[]) ?? [],
      tracklist,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=604800',
      },
    }
  );
}
