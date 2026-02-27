"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { RefreshCw, Search, X, Disc3 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecordData {
  discogs_id: string;
  title: string;
  artist: string;
  cover_url: string;
  added_at: string;
}

interface PlayData {
  discogs_id: string;
  play_count: number;
  last_played: string | null;
}

type SortKey = 'date_added' | 'artist' | 'title' | 'most_played' | 'recently_played';

// ─── Constants ────────────────────────────────────────────────────────────────

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date_added',      label: 'Date Added'  },
  { key: 'artist',          label: 'A–Z Artist'  },
  { key: 'title',           label: 'A–Z Title'   },
  { key: 'most_played',     label: 'Most Played' },
  { key: 'recently_played', label: 'Last Played' },
];

const CARD_GAP        = 14;
const SWIPE_THRESHOLD = 55;

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [records,      setRecords]      = useState<RecordData[]>([]);
  const [plays,        setPlays]        = useState<Record<string, PlayData>>({});
  const [loading,      setLoading]      = useState(true);
  const [syncing,      setSyncing]      = useState(false);
  const [activeIndex,  setActiveIndex]  = useState(0);
  const [nowPlayingId, setNowPlayingId] = useState<string | null>(null);
  const [sort,         setSort]         = useState<SortKey>('date_added');
  const [filter,       setFilter]       = useState('');
  const [dragOffset,   setDragOffset]   = useState(0);
  const [isDragging,   setIsDragging]   = useState(false);
  const [cardWidth,    setCardWidth]    = useState(290);
  const [containerW,   setContainerW]   = useState(390);

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef     = useRef<HTMLDivElement>(null);
  const clickWasDrag = useRef(false);
  const drag = useRef({ active: false, startX: 0, startY: 0, totalX: 0, moving: false });

  // ── Measure container ──────────────────────────────────────────────────────

  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      setContainerW(w);
      setCardWidth(Math.min(Math.floor(w * 0.78), 320));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Prevent passive touchmove from cancelling horizontal drag
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => { if (drag.current.moving) e.preventDefault(); };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  // ── Data ───────────────────────────────────────────────────────────────────

  const fetchPlays = useCallback(async () => {
    const res = await fetch('/api/plays');
    if (!res.ok) return;
    const data: PlayData[] = await res.json();
    const map: Record<string, PlayData> = {};
    data.forEach(p => { map[p.discogs_id] = p; });
    setPlays(map);
  }, []);

  const syncFromDiscogs = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/sync');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) { setRecords(data as RecordData[]); setActiveIndex(0); }
    } finally {
      setSyncing(false);
    }
  }, []);

  // Bootstrap: init tables → load from DB → fallback sync
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await fetch('/api/init');
        const res  = await fetch('/api/records');
        const data = res.ok ? await res.json() : [];
        if (Array.isArray(data) && data.length > 0) {
          setRecords(data as RecordData[]);
        } else {
          await syncFromDiscogs();
        }
        await fetchPlays();
      } catch (err) {
        console.error('Boot failed', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [syncFromDiscogs, fetchPlays]);

  // ── Sort + filter ──────────────────────────────────────────────────────────

  const displayed = useMemo<RecordData[]>(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? records.filter(r =>
          r.artist.toLowerCase().includes(q) || r.title.toLowerCase().includes(q)
        )
      : records;

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'artist':          return a.artist.localeCompare(b.artist);
        case 'title':           return a.title.localeCompare(b.title);
        case 'most_played':     return (plays[b.discogs_id]?.play_count ?? 0) - (plays[a.discogs_id]?.play_count ?? 0);
        case 'recently_played': {
          const at = plays[a.discogs_id]?.last_played ?? '';
          const bt = plays[b.discogs_id]?.last_played ?? '';
          return bt.localeCompare(at);
        }
        default: return new Date(b.added_at).getTime() - new Date(a.added_at).getTime();
      }
    });
  }, [records, plays, sort, filter]);

  useEffect(() => {
    setActiveIndex(prev => Math.max(0, Math.min(prev, displayed.length - 1)));
  }, [displayed.length]);

  useEffect(() => { setActiveIndex(0); }, [filter, sort]);

  // ── Play logging ───────────────────────────────────────────────────────────

  const markPlaying = async (discogs_id: string) => {
    setNowPlayingId(discogs_id);
    const res = await fetch('/api/plays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discogs_id }),
    });
    if (!res.ok) return;
    const { play_count, last_played } = await res.json();
    setPlays(prev => ({ ...prev, [discogs_id]: { discogs_id, play_count, last_played } }));
  };

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, totalX: 0, moving: false };
    clickWasDrag.current = false;
    (e.target as Element).setPointerCapture(e.pointerId);
    setIsDragging(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    drag.current.totalX = dx;
    if (!drag.current.moving && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
      drag.current.moving = true;
      clickWasDrag.current = true;
      setIsDragging(true);
    }
    if (drag.current.moving) setDragOffset(dx);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    setIsDragging(false);
    setDragOffset(0);
    const total = drag.current.totalX;
    if (drag.current.moving) {
      if (total < -SWIPE_THRESHOLD && activeIndex < displayed.length - 1) setActiveIndex(i => i + 1);
      else if (total > SWIPE_THRESHOLD && activeIndex > 0) setActiveIndex(i => i - 1);
    }
  };

  const onCardClick = (record: RecordData, index: number) => {
    if (clickWasDrag.current) return;
    if (index !== activeIndex) setActiveIndex(index);
    else markPlaying(record.discogs_id);
  };

  // ── Carousel geometry ──────────────────────────────────────────────────────

  const trackX = (containerW - cardWidth) / 2 - activeIndex * (cardWidth + CARD_GAP) + dragOffset;

  // ── Derived ────────────────────────────────────────────────────────────────

  const activeRecord  = displayed[activeIndex] ?? null;
  const nowPlayingRec = nowPlayingId ? records.find(r => r.discogs_id === nowPlayingId) : null;
  const nowPlayData   = nowPlayingId ? plays[nowPlayingId] : null;

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-black text-zinc-600">
        <Disc3 className="vinyl-spin mb-5" size={44} strokeWidth={1} />
        <p className="text-[11px] tracking-[0.3em] uppercase">Syncing Collection</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="flex flex-col h-dvh bg-black text-white overflow-hidden select-none">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-safe pb-1 shrink-0">
        <h1 className="text-[10px] font-semibold tracking-[0.35em] text-zinc-600 uppercase">
          SpinWatcher
        </h1>
        <button
          onClick={async () => { await syncFromDiscogs(); await fetchPlays(); }}
          disabled={syncing}
          aria-label="Sync with Discogs"
          className="p-1.5 text-zinc-700 hover:text-zinc-400 active:text-zinc-300 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-2 shrink-0">
        <div className="flex items-center gap-2 bg-zinc-950 rounded-xl px-3 py-2.5 border border-zinc-800/60">
          <Search size={13} className="text-zinc-600 shrink-0" />
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search artists or records…"
            className="flex-1 bg-transparent text-sm text-zinc-300 placeholder-zinc-700 outline-none"
          />
          {filter && (
            <button onClick={() => setFilter('')} className="text-zinc-600 hover:text-zinc-400">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Sort pills */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide shrink-0">
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setSort(opt.key)}
            className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide transition-all ${
              sort === opt.key
                ? 'bg-amber-500 text-black'
                : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Carousel */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden flex items-center"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {displayed.length === 0 ? (
          <div className="w-full flex flex-col items-center text-zinc-800">
            <Disc3 size={48} strokeWidth={1} className="mb-3" />
            <p className="text-sm">No records found</p>
          </div>
        ) : (
          <div
            ref={trackRef}
            className="flex items-center absolute top-0 left-0 h-full"
            style={{
              gap:        `${CARD_GAP}px`,
              transform:  `translateX(${trackX}px)`,
              transition: isDragging ? 'none' : 'transform 0.38s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              willChange: 'transform',
            }}
          >
            {displayed.map((record, i) => {
              const offset    = i - activeIndex;
              const absOffset = Math.abs(offset);
              const isActive  = offset === 0;
              const isNowPlay = record.discogs_id === nowPlayingId;
              const playData  = plays[record.discogs_id];

              // Placeholder for far-off cards (avoids rendering 50+ images)
              if (absOffset > 5) {
                return (
                  <div
                    key={record.discogs_id}
                    style={{ width: cardWidth, height: cardWidth, flexShrink: 0 }}
                  />
                );
              }

              const scale   = isActive ? 1 : 0.86;
              const opacity = absOffset === 0 ? 1 : absOffset === 1 ? 0.72 : absOffset === 2 ? 0.38 : 0.12;

              return (
                <div
                  key={record.discogs_id}
                  onClick={() => onCardClick(record, i)}
                  style={{
                    width:      cardWidth,
                    height:     cardWidth,
                    flexShrink: 0,
                    transform:  `scale(${scale})`,
                    opacity,
                    transition: isDragging
                      ? 'none'
                      : 'transform 0.38s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.38s ease',
                  }}
                  className="relative rounded-2xl overflow-hidden cursor-pointer"
                >
                  {/* Album art */}
                  <img
                    src={`/api/image?url=${encodeURIComponent(record.cover_url)}`}
                    alt={record.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                  />

                  {/* Bottom gradient */}
                  <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/95 via-black/50 to-transparent pointer-events-none" />

                  {/* Play count — top right */}
                  {playData && playData.play_count > 0 && (
                    <div className="absolute top-3 right-3 bg-black/65 backdrop-blur-md rounded-full px-2.5 py-0.5 pointer-events-none">
                      <span className="text-[10px] text-zinc-400 font-medium tabular-nums">
                        {playData.play_count}×
                      </span>
                    </div>
                  )}

                  {/* NOW PLAYING badge — top left */}
                  {isNowPlay && (
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-amber-500 rounded-full px-2.5 py-1 pointer-events-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-black now-playing-dot" />
                      <span className="text-[9px] font-black text-black tracking-[0.15em] uppercase">
                        Now Playing
                      </span>
                    </div>
                  )}

                  {/* Title + artist — bottom overlay */}
                  <div className="absolute inset-x-0 bottom-0 p-4 pointer-events-none">
                    <p className="text-white font-bold text-sm leading-snug line-clamp-2 drop-shadow">
                      {record.title}
                    </p>
                    <p className="text-zinc-400 text-xs mt-0.5 line-clamp-1 drop-shadow">
                      {record.artist}
                    </p>
                  </div>

                  {/* Border ring */}
                  <div
                    className={`absolute inset-0 rounded-2xl border-2 pointer-events-none transition-colors duration-300 ${
                      isNowPlay && isActive
                        ? 'border-amber-500/70'
                        : isActive
                          ? 'border-zinc-600/40'
                          : 'border-transparent'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Active record info strip */}
      <div className="shrink-0 px-5 pt-2 pb-1 min-h-[52px] flex flex-col items-center justify-center text-center">
        {activeRecord ? (
          <>
            <p className="text-sm font-semibold tracking-tight text-zinc-300 line-clamp-1 w-full">
              {activeRecord.title}
            </p>
            <p className="text-xs text-zinc-600 mt-0.5 line-clamp-1 w-full">
              {activeRecord.artist}
            </p>
            <p className="text-[10px] text-zinc-800 mt-0.5 tabular-nums">
              {activeIndex + 1} / {displayed.length}
            </p>
          </>
        ) : (
          <p className="text-xs text-zinc-800">No records</p>
        )}
      </div>

      {/* Now Playing bar */}
      <div className="shrink-0 px-4 pb-safe">
        {nowPlayingRec ? (
          <div className="flex items-center gap-3 bg-zinc-950 border border-amber-500/20 rounded-2xl px-4 py-3">
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-900">
                <img
                  src={`/api/image?url=${encodeURIComponent(nowPlayingRec.cover_url)}`}
                  alt={nowPlayingRec.title}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 now-playing-dot" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black tracking-[0.2em] text-amber-500 uppercase mb-0.5">
                Now Playing
              </p>
              <p className="text-sm font-semibold text-white line-clamp-1 leading-tight">
                {nowPlayingRec.title}
              </p>
              <p className="text-xs text-zinc-600 line-clamp-1">{nowPlayingRec.artist}</p>
            </div>
            {nowPlayData && (
              <div className="shrink-0 text-right">
                <p className="text-xl font-black text-amber-500 leading-none tabular-nums">
                  {nowPlayData.play_count}
                </p>
                <p className="text-[10px] text-zinc-700 mt-0.5">
                  {nowPlayData.play_count === 1 ? 'play' : 'plays'}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Placeholder keeps layout height stable */
          <div className="flex items-center gap-3 bg-zinc-950/50 border border-zinc-900 rounded-2xl px-4 py-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-900/60 flex items-center justify-center shrink-0">
              <Disc3 size={18} strokeWidth={1} className="text-zinc-800" />
            </div>
            <p className="text-xs text-zinc-800">Tap a card to mark it as playing</p>
          </div>
        )}
      </div>

    </main>
  );
}
