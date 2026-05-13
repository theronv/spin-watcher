export interface AlbumRecord {
  id: string;
  title: string;
  artist: string;
  year: number | null;
  label: string | null;
  genres: string[];
  playCount: number;
  coverImage: string;
  tracklist?: { position: string; title: string; duration: string }[];
}

export interface SessionUser {
  id: string;
  username: string;
  avatar?: string;
}

interface RawRecord {
  discogs_id: string;
  title: string;
  artist: string;
  cover_url: string;
  added_at: string;
  genres: string;
  styles: string;
  year: number | null;
  label: string | null;
  format: string | null;
}

export interface RawPlay {
  discogs_id: string;
  play_count: number;
  last_played: string | null;
}

// Module-level cache avoids re-fetching the full collection on every detail navigation.
let _cachedRecords: RawRecord[] | null = null;
let _cachedPlays: RawPlay[] | null = null;

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (res.status === 401) throw new Error('API_401');
  if (!res.ok) throw new Error(`API_${res.status}`);
  return res.json() as Promise<T>;
}

function safeParseGenres(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function proxyImage(url: string, size: number): string {
  if (!url) return '';
  return `/api/image?url=${encodeURIComponent(url)}&size=${size}`;
}

function sortRecords(records: AlbumRecord[], sort: string): AlbumRecord[] {
  const sorted = [...records];
  switch (sort) {
    case 'artist_asc':  sorted.sort((a, b) => a.artist.localeCompare(b.artist)); break;
    case 'year_desc':   sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));    break;
    case 'year_asc':    sorted.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));    break;
    case 'plays_desc':  sorted.sort((a, b) => b.playCount - a.playCount);         break;
  }
  return sorted;
}

export const api = {
  clearCache() {
    _cachedRecords = null;
    _cachedPlays   = null;
  },

  async getSession(): Promise<{ user: SessionUser | null }> {
    const data = await apiFetch<{ is_logged_in: boolean; user: SessionUser | null }>('/api/auth/session');
    return { user: data.user ?? null };
  },

  async init(): Promise<void> {
    await apiFetch<void>('/api/init');
  },

  async sync(): Promise<void> {
    await apiFetch<void>('/api/sync');
    this.clearCache();
  },

  async getPlays(): Promise<RawPlay[]> {
    return apiFetch<RawPlay[]>('/api/plays');
  },

  async getRecords(params: { genre?: string; sort?: string; search?: string } = {}): Promise<{ records: AlbumRecord[]; genres: string[] }> {
    const [rawRecords, rawPlays] = await Promise.all([
      _cachedRecords
        ? Promise.resolve(_cachedRecords)
        : apiFetch<RawRecord[]>('/api/records'),
      _cachedPlays
        ? Promise.resolve(_cachedPlays)
        : apiFetch<RawPlay[]>('/api/plays').catch(() => [] as RawPlay[]),
    ]);
    _cachedRecords = rawRecords;
    _cachedPlays   = rawPlays;

    const playCountMap: Record<string, number> = {};
    for (const p of rawPlays) playCountMap[p.discogs_id] = p.play_count;

    let records: AlbumRecord[] = rawRecords.map(r => ({
      id:         r.discogs_id,
      title:      r.title,
      artist:     r.artist,
      year:       r.year,
      label:      r.label,
      genres:     safeParseGenres(r.genres),
      playCount:  playCountMap[r.discogs_id] ?? 0,
      coverImage: proxyImage(r.cover_url, 500),
    }));

    const genreSet = new Set<string>();
    for (const rec of records) for (const g of rec.genres) genreSet.add(g);
    const genres = [...genreSet].sort();

    if (params.genre) {
      records = records.filter(r => r.genres.includes(params.genre!));
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      records = records.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.artist.toLowerCase().includes(q) ||
        (r.label?.toLowerCase().includes(q) ?? false)
      );
    }
    if (params.sort) records = sortRecords(records, params.sort);

    return { records, genres };
  },

  async getRecord(id: string): Promise<AlbumRecord> {
    const [rawRecords, rawPlays, albumData] = await Promise.all([
      _cachedRecords
        ? Promise.resolve(_cachedRecords)
        : apiFetch<RawRecord[]>('/api/records'),
      _cachedPlays
        ? Promise.resolve(_cachedPlays)
        : apiFetch<RawPlay[]>('/api/plays').catch(() => [] as RawPlay[]),
      apiFetch<{
        year: number | null;
        label: string | null;
        genres: string[];
        styles: string[];
        tracklist: { position: string; title: string; duration: string }[];
        runtime: string;
      }>(`/api/album/${id}`).catch(() => null),
    ]);
    if (!_cachedRecords) _cachedRecords = rawRecords;
    if (!_cachedPlays)   _cachedPlays   = rawPlays;

    const playCountMap: Record<string, number> = {};
    for (const p of rawPlays) playCountMap[p.discogs_id] = p.play_count;

    const raw = rawRecords.find(r => r.discogs_id === id);
    if (!raw) throw new Error(`Record ${id} not found`);

    return {
      id:         raw.discogs_id,
      title:      raw.title,
      artist:     raw.artist,
      year:       albumData?.year ?? raw.year,
      label:      albumData?.label ?? raw.label,
      genres:     albumData?.genres?.length ? albumData.genres : safeParseGenres(raw.genres),
      playCount:  playCountMap[id] ?? 0,
      coverImage: proxyImage(raw.cover_url, 600),
      tracklist:  albumData?.tracklist,
    };
  },

  async logPlay(discogsId: string): Promise<{ discogs_id: string; play_count: number; last_played: string }> {
    return apiFetch('/api/plays', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ discogs_id: discogsId }),
    });
  },

  async updatePlayCount(discogsId: string, count: number): Promise<{ discogs_id: string; play_count: number; last_played: string }> {
    return apiFetch('/api/plays', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ discogs_id: discogsId, count }),
    });
  },
};
