import { NextRequest, NextResponse } from 'next/server';

function parseDuration(duration: string): number {
  if (!duration) return 0;
  const parts = duration.split(':').map(Number);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return 0;
}

function formatRuntime(totalSeconds: number): string {
  if (totalSeconds <= 0) return '';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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

  const totalSeconds = tracklist.reduce((sum, t) => sum + parseDuration(t.duration), 0);

  const labels = (data.labels as Array<{ name: string }>) ?? [];
  const label  = labels[0]?.name ?? null;

  return NextResponse.json(
    {
      year:      (data.year as number) || null,
      label,
      genres:    (data.genres  as string[]) ?? [],
      styles:    (data.styles  as string[]) ?? [],
      tracklist,
      runtime:   formatRuntime(totalSeconds),
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=604800',
      },
    }
  );
}
