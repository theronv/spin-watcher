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
  // ── Core state
  const [records,      setRecords]      = useState<RecordData[]>([]);
  const [plays,        setPlays]        = useState<Record<string, PlayData>>({});
  const [loading,      setLoading]      = useState(true);
  const [syncing,      setSyncing]      = useState(false);
  const [activeIndex,  setActiveIndex]  = useState(0);
  const [nowPlayingId, setNowPlayingId] = useState<string | null>(null);
  const [sort,         setSort]         = useState<SortKey>('date_added');
  const [filter,       setFilter]       = useState('');

  // ── Drag state
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // ── Inline play-count editor state
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editValue,  setEditValue]  = useState('');

  // ── Layout measurement
  const [cardWidth,  setCardWidth]  = useState(290);
  const [containerW, setContainerW] = useState(390);

  // ── Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef     = useRef<HTMLDivElement>(null);
  const clickWasDrag = useRef(false);
  const drag = useRef({ active: false, startX: 0, startY: 0, totalX: 0, moving: false });

  // ── Measure carousel container ─────────────────────────────────────────────

  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      setContainerW(w);
      // 78% width, capped at 360px — large enough for tablets, tight enough for peek
      setCardWidth(Math.min(Math.floor(w * 0.78), 360));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Prevent passive touchmove from cancelling our horizontal drag
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => { if (drag.current.moving) e.preventDefault(); };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  // ── Data loading ───────────────────────────────────────────────────────────

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

  // Bootstrap: init tables → read from Turso → only hit Discogs if DB is empty
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
          await syncFromDiscogs(); // first-run only
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

  // Clamp index when the list shrinks (e.g. after filtering)
  useEffect(() => {
    setActiveIndex(prev => Math.max(0, Math.min(prev, displayed.length - 1)));
  }, [displayed.length]);

  // Reset to first card when sort or filter changes
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
    // Real-time badge update — no page reload needed
    setPlays(prev => ({ ...prev, [discogs_id]: { discogs_id, play_count, last_played } }));
  };

  // ── Inline play-count editor ───────────────────────────────────────────────

  const openEditor = useCallback((id: string, currentCount: number) => {
    setEditingId(id);
    setEditValue(String(currentCount));
  }, []);

  const saveEdit = useCallback(async () => {
    if (editingId === null) return;
    const id = editingId;
    const n  = Math.max(0, Math.min(9999, parseInt(editValue, 10) || 0));

    // Close immediately and optimistically update the badge
    setEditingId(null);
    setPlays(prev => ({
      ...prev,
      [id]: { discogs_id: id, play_count: n, last_played: prev[id]?.last_played ?? null },
    }));

    // Sync to Turso in the background
    const res = await fetch('/api/plays', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discogs_id: id, count: n }),
    });
    if (res.ok) {
      const data = await res.json();
      setPlays(prev => ({
        ...prev,
        [id]: { discogs_id: id, play_count: data.play_count, last_played: data.last_played },
      }));
    }
  }, [editingId, editValue]);

  // ── Drag / swipe handlers ──────────────────────────────────────────────────

  const onPointerDown = (e: React.PointerEvent) => {
    if (editingId) return; // don't steal drag from open editor
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

  const onPointerUp = () => {
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

  // Per-card click: tap non-center → navigate; tap center → mark as playing
  const onCardClick = (record: RecordData, index: number) => {
    if (clickWasDrag.current) return;
    if (index !== activeIndex) setActiveIndex(index);
    else markPlaying(record.discogs_id);
  };

  // ── Carousel geometry ──────────────────────────────────────────────────────

  const trackX = (containerW - cardWidth) / 2
    - activeIndex * (cardWidth + CARD_GAP)
    + dragOffset;

  // ── Derived ────────────────────────────────────────────────────────────────

  const activeRecord  = displayed[activeIndex] ?? null;
  const nowPlayingRec = nowPlayingId ? records.find(r => r.discogs_id === nowPlayingId) : null;
  const nowPlayData   = nowPlayingId ? plays[nowPlayingId] : null;

  // ── Loading screen ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-black text-zinc-600">
        <Disc3 className="vinyl-spin mb-5" size={44} strokeWidth={1} />
        <p className="text-[11px] tracking-[0.3em] uppercase">Syncing Collection</p>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <main className="flex flex-col h-dvh bg-black text-white overflow-hidden select-none">

      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-5 pt-safe pb-1">
        <h1 className="text-[10px] font-semibold tracking-[0.35em] text-zinc-600 uppercase">
          SpinWatcher
        </h1>
        {/* Record position counter */}
        {displayed.length > 0 && (
          <p className="text-[10px] text-zinc-800 tabular-nums">
            {activeIndex + 1} / {displayed.length}
          </p>
        )}
        <button
          onClick={async () => { await syncFromDiscogs(); await fetchPlays(); }}
          disabled={syncing}
          aria-label="Sync with Discogs"
          className="p-1.5 text-zinc-700 hover:text-zinc-400 active:text-zinc-300 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Search ── */}
      <div className="shrink-0 px-4 pb-2">
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

      {/* ── Sort pills ── */}
      <div className="shrink-0 flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
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

      {/* ── Carousel ──────────────────────────────────────────────────────────
           flex-1 + min-h-0 lets this fill exactly the remaining space.
           The track is absolute so it doesn't affect flow; cards are
           centered vertically inside it via flex items-center.
      ── */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative overflow-hidden"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {displayed.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-800">
            <Disc3 size={48} strokeWidth={1} className="mb-3" />
            <p className="text-sm">No records found</p>
          </div>
        ) : (
          <div
            ref={trackRef}
            className="absolute inset-y-0 left-0 flex items-center"
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
              const count     = playData?.play_count ?? 0;

              // Render lightweight placeholders for cards far out of view
              if (absOffset > 5) {
                return (
                  <div
                    key={record.discogs_id}
                    style={{ width: cardWidth, height: cardWidth, flexShrink: 0 }}
                  />
                );
              }

              // Adjacent cards scale down slightly; further cards fade out
              const scale   = isActive ? 1 : absOffset === 1 ? 0.88 : 0.80;
              const opacity = absOffset === 0 ? 1 : absOffset === 1 ? 0.70 : absOffset === 2 ? 0.35 : 0.1;

              const isEditing = editingId === record.discogs_id && isActive;

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

                  {/* Scrim: bottom two-thirds gradient for text legibility */}
                  <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none" />

                  {/* ── Play count badge / inline editor (top-right) ── */}
                  {isEditing ? (
                    /* Inline editor — stopPropagation so card click doesn't fire */
                    <div
                      className="absolute top-3 right-3 flex items-center gap-1 bg-zinc-900/95 backdrop-blur-md border border-zinc-700 rounded-xl px-2 py-1.5"
                      onClick={e => e.stopPropagation()}
                    >
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="9999"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter')  saveEdit();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="w-12 bg-transparent text-white text-sm text-center outline-none tabular-nums"
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                      />
                      <button
                        onClick={saveEdit}
                        className="text-amber-500 text-sm font-bold leading-none px-0.5"
                        aria-label="Save"
                      >✓</button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-zinc-500 text-sm leading-none px-0.5"
                        aria-label="Cancel"
                      >✕</button>
                    </div>
                  ) : (
                    /* Badge — always shown on active card, only when played on others */
                    (isActive || count > 0) && (
                      <div
                        className={`absolute top-3 right-3 bg-black/65 backdrop-blur-md rounded-full px-2.5 py-0.5 ${
                          isActive ? 'cursor-pointer' : 'pointer-events-none'
                        }`}
                        onClick={isActive ? e => {
                          e.stopPropagation();
                          openEditor(record.discogs_id, count);
                        } : undefined}
                      >
                        <span className="text-[10px] text-zinc-400 font-medium tabular-nums">
                          {count > 0 ? `${count}×` : '·'}
                        </span>
                      </div>
                    )
                  )}

                  {/* NOW PLAYING badge (top-left) */}
                  {isNowPlay && (
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-amber-500 rounded-full px-2.5 py-1 pointer-events-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-black now-playing-dot" />
                      <span className="text-[9px] font-black text-black tracking-[0.15em] uppercase">
                        Now Playing
                      </span>
                    </div>
                  )}

                  {/* Title + artist overlay (bottom of card) */}
                  <div className="absolute inset-x-0 bottom-0 p-4 pointer-events-none">
                    <p className="text-white font-bold text-sm leading-snug line-clamp-2 drop-shadow">
                      {record.title}
                    </p>
                    <p className="text-zinc-400 text-xs mt-0.5 line-clamp-1 drop-shadow">
                      {record.artist}
                    </p>
                  </div>

                  {/* Amber border ring when now-playing + active; subtle zinc otherwise */}
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

      {/* ── Now Playing bar ───────────────────────────────────────────────────
           Fixed height at all times (placeholder vs live state) so the
           carousel never jumps when playback starts.
      ── */}
      <div className="shrink-0 px-4 pt-2 pb-safe">
        {nowPlayingRec ? (
          <div className="flex items-center gap-3 bg-zinc-950 border border-amber-500/20 rounded-2xl px-4 py-3">
            {/* Thumbnail with pulse dot */}
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

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black tracking-[0.2em] text-amber-500 uppercase mb-0.5">
                Now Playing
              </p>
              <p className="text-sm font-semibold text-white line-clamp-1 leading-tight">
                {nowPlayingRec.title}
              </p>
              <p className="text-xs text-zinc-600 line-clamp-1">{nowPlayingRec.artist}</p>
            </div>

            {/* Play count */}
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
          /* Placeholder: same height as the live state */
          <div className="flex items-center gap-3 bg-zinc-950/50 border border-zinc-900 rounded-2xl px-4 py-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-900/60 flex items-center justify-center shrink-0">
              <Disc3 size={18} strokeWidth={1} className="text-zinc-800" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-zinc-800 line-clamp-1">Tap a record to start playing</p>
              {activeRecord && (
                <p className="text-[10px] text-zinc-900 mt-0.5 line-clamp-1">
                  {activeRecord.artist} — {activeRecord.title}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

    </main>
  );
}
