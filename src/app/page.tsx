"use client";

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { RefreshCw, Search, X, Disc3, ArrowLeft, Play } from "lucide-react";

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

interface AlbumDetails {
  year:      number | null;
  label:     string | null;
  genres:    string[];
  styles:    string[];
  tracklist: Array<{ position: string; title: string; duration: string }>;
  runtime:   string;
}

type SortKey = "date_added" | "artist" | "title" | "most_played" | "recently_played";
type AppMode = "browse" | "now-playing";

// ─── Constants ────────────────────────────────────────────────────────────────

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "date_added",      label: "Date Added"  },
  { key: "artist",          label: "A–Z Artist"  },
  { key: "title",           label: "A–Z Title"   },
  { key: "most_played",     label: "Most Played" },
  { key: "recently_played", label: "Last Played" },
];

const CARD_GAP        = 14;
const SWIPE_THRESHOLD = 55;
const EASE            = "cubic-bezier(0.4, 0, 0.2, 1)";

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {

  // ── App state
  const [mode,           setMode]          = useState<AppMode>("browse");
  const [records,        setRecords]        = useState<RecordData[]>([]);
  const [plays,          setPlays]          = useState<Record<string, PlayData>>({});
  const [loading,        setLoading]        = useState(true);
  const [syncing,        setSyncing]        = useState(false);
  const [activeIndex,    setActiveIndex]    = useState(0);
  const [nowPlayingId,   setNowPlayingId]   = useState<string | null>(null);
  const [viewingRecord,  setViewingRecord]  = useState<RecordData | null>(null);
  const [sort,           setSort]           = useState<SortKey>("date_added");
  const [filter,         setFilter]         = useState("");

  // ── Inline play-count editor
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editValue,  setEditValue]  = useState("");

  // ── Album details + playing state
  const [albumDetails, setAlbumDetails] = useState<AlbumDetails | null>(null);
  const [albumLoading, setAlbumLoading] = useState(false);
  const [isPlaying,    setIsPlaying]    = useState(false);

  // ── Carousel drag
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // ── Layout
  const [cardWidth,     setCardWidth]     = useState(290);
  const [containerW,    setContainerW]    = useState(390);
  const [centerOffset,  setCenterOffset]  = useState(0); // px to shift carousel toward screen center

  // ── Refs
  const containerRef = useRef<HTMLDivElement>(null); // carousel zone (width measurement + pointer events)
  const trackRef     = useRef<HTMLDivElement>(null);
  const topRef       = useRef<HTMLDivElement>(null); // browse top chrome (header+search+sort)
  const botRef       = useRef<HTMLDivElement>(null); // browse compact NP bar
  const clickWasDrag = useRef(false);
  const drag = useRef({ active: false, startX: 0, startY: 0, totalX: 0, moving: false });

  // ── Measure carousel width ─────────────────────────────────────────────────

  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      setContainerW(w);
      setCardWidth(Math.min(Math.floor(w * 0.78), 360));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Vertical centering: shift carousel up to compensate for top > bottom ──
  // centerOffset = (topChrome - bottomChrome) / 2
  // Applied as marginTop: -centerOffset on the carousel inner div.

  useLayoutEffect(() => {
    const measure = () => {
      const th = topRef.current?.offsetHeight ?? 0;
      const bh = botRef.current?.offsetHeight ?? 0;
      setCenterOffset((th - bh) / 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (topRef.current)  ro.observe(topRef.current);
    if (botRef.current)  ro.observe(botRef.current);
    return () => ro.disconnect();
  }, [loading]); // re-run after loading completes (refs are mounted then)

  // Prevent passive touchmove from hijacking our horizontal drag
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => { if (drag.current.moving) e.preventDefault(); };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  // ── Data loading ───────────────────────────────────────────────────────────

  const fetchPlays = useCallback(async () => {
    const res = await fetch("/api/plays");
    if (!res.ok) return;
    const data: PlayData[] = await res.json();
    const map: Record<string, PlayData> = {};
    data.forEach(p => { map[p.discogs_id] = p; });
    setPlays(map);
  }, []);

  const syncFromDiscogs = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) { setRecords(data as RecordData[]); setActiveIndex(0); }
    } finally {
      setSyncing(false);
    }
  }, []);

  // Bootstrap: init → read Turso → only hit Discogs on first run (empty DB)
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await fetch("/api/init");
        const res  = await fetch("/api/records");
        const data = res.ok ? await res.json() : [];
        if (Array.isArray(data) && data.length > 0) {
          setRecords(data as RecordData[]);
        } else {
          await syncFromDiscogs();
        }
        await fetchPlays();
      } catch (err) {
        console.error("Boot failed", err);
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
          r.artist.toLowerCase().includes(q) || r.title.toLowerCase().includes(q))
      : records;

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "artist":          return a.artist.localeCompare(b.artist);
        case "title":           return a.title.localeCompare(b.title);
        case "most_played":     return (plays[b.discogs_id]?.play_count ?? 0) - (plays[a.discogs_id]?.play_count ?? 0);
        case "recently_played": {
          const at = plays[a.discogs_id]?.last_played ?? "";
          const bt = plays[b.discogs_id]?.last_played ?? "";
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

  // ── Fetch album details when entering Now Playing ──────────────────────────

  useEffect(() => {
    if (mode !== "now-playing" || !viewingRecord) return;
    let cancelled = false;
    setAlbumLoading(true);
    setAlbumDetails(null);
    fetch(`/api/album/${viewingRecord.discogs_id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data) setAlbumDetails(data as AlbumDetails); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAlbumLoading(false); });
    return () => { cancelled = true; };
  }, [mode, viewingRecord]);

  // ── Play logging ───────────────────────────────────────────────────────────

  const markPlaying = useCallback(async (discogs_id: string) => {
    setNowPlayingId(discogs_id);
    const res = await fetch("/api/plays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discogs_id }),
    });
    if (!res.ok) return;
    const { play_count, last_played } = await res.json();
    setPlays(prev => ({ ...prev, [discogs_id]: { discogs_id, play_count, last_played } }));
    setIsPlaying(true);
  }, []);

  // ── Mode navigation ────────────────────────────────────────────────────────

  const enterNowPlaying = useCallback(() => {
    const record = displayed[activeIndex];
    if (!record) return;
    setEditingId(null);
    setViewingRecord(record);
    setIsPlaying(false);
    setAlbumDetails(null);
    setMode("now-playing");
  }, [displayed, activeIndex]);

  const exitNowPlaying = useCallback(() => {
    setEditingId(null);
    setIsPlaying(false);
    setMode("browse");
  }, []);

  // ── Inline play-count editor ───────────────────────────────────────────────

  const openEditor = useCallback((id: string, currentCount: number) => {
    setEditingId(id);
    setEditValue(String(currentCount));
  }, []);

  const saveEdit = useCallback(async () => {
    if (editingId === null) return;
    const id = editingId;
    const n  = Math.max(0, Math.min(9999, parseInt(editValue, 10) || 0));

    setEditingId(null);
    setPlays(prev => ({
      ...prev,
      [id]: { discogs_id: id, play_count: n, last_played: prev[id]?.last_played ?? null },
    }));

    const res = await fetch("/api/plays", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
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

  // ── Carousel drag ──────────────────────────────────────────────────────────

  const onPointerDown = (e: React.PointerEvent) => {
    if (editingId) return;
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

  // Tap center card → enter Now Playing; tap non-center → navigate to it
  const onCardClick = (record: RecordData, index: number) => {
    if (clickWasDrag.current) return;
    if (index !== activeIndex) setActiveIndex(index);
    else enterNowPlaying();
  };

  // ── Carousel geometry ──────────────────────────────────────────────────────

  const trackX = (containerW - cardWidth) / 2
    - activeIndex * (cardWidth + CARD_GAP)
    + dragOffset;

  const carouselH = cardWidth + 40;

  // ── Derived ────────────────────────────────────────────────────────────────

  const nowPlayingRec = nowPlayingId ? records.find(r => r.discogs_id === nowPlayingId) : null;
  const nowPlayData   = nowPlayingId ? plays[nowPlayingId] : null;
  const npPlayData    = viewingRecord ? plays[viewingRecord.discogs_id] : null;
  const npIsEditing   = editingId === viewingRecord?.discogs_id;

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
    <main className="relative bg-black text-white overflow-hidden select-none" style={{ height: "100dvh" }}>

      {/* ══════════════════════════════════════════════════════════════════════
          BROWSE MODE
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        className="absolute inset-0 flex flex-col"
        style={{
          opacity:       mode === "browse" ? 1 : 0,
          transform:     mode === "browse" ? "translateY(0)" : "translateY(-12px)",
          pointerEvents: mode === "browse" ? "auto" : "none",
          transition:    `opacity 0.32s ${EASE}, transform 0.32s ${EASE}`,
        }}
      >
        {/* ── Top chrome (measured for centering) ── */}
        <div ref={topRef} className="shrink-0">

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-safe pb-1">
            <h1 className="text-[10px] font-semibold tracking-[0.35em] text-zinc-600 uppercase">
              SpinWatcher
            </h1>
            {displayed.length > 0 && (
              <p className="text-[10px] text-zinc-800 tabular-nums">
                {activeIndex + 1} / {displayed.length}
              </p>
            )}
            <button
              onClick={async () => { await syncFromDiscogs(); await fetchPlays(); }}
              disabled={syncing}
              aria-label="Sync with Discogs"
              className="p-1.5 text-zinc-700 hover:text-zinc-400 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            </button>
          </div>

          {/* Search */}
          <div className="px-4 pb-2">
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
                <button onClick={() => setFilter("")} className="text-zinc-600">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Sort pills */}
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setSort(opt.key)}
                className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide transition-all ${
                  sort === opt.key
                    ? "bg-amber-500 text-black"
                    : "bg-zinc-900 text-zinc-500 border border-zinc-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Carousel zone: flex-1, inner div centered on screen via marginTop ── */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 relative overflow-hidden flex items-center"
          style={{ touchAction: "none" }}
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
              style={{
                position:   "relative",
                width:      "100%",
                height:     carouselH,
                flexShrink: 0,
                marginTop:  -centerOffset,
              }}
            >
              <div
                ref={trackRef}
                style={{
                  position:   "absolute",
                  top:        0,
                  bottom:     0,
                  left:       0,
                  display:    "flex",
                  alignItems: "center",
                  gap:        `${CARD_GAP}px`,
                  transform:  `translateX(${trackX}px)`,
                  transition: isDragging ? "none" : `transform 0.38s ${EASE}`,
                  willChange: "transform",
                }}
              >
                {displayed.map((record, i) => {
                  const offset    = i - activeIndex;
                  const absOffset = Math.abs(offset);
                  const isActive  = offset === 0;
                  const isNowPlay = record.discogs_id === nowPlayingId;
                  const playData  = plays[record.discogs_id];
                  const count     = playData?.play_count ?? 0;

                  if (absOffset > 5) {
                    return (
                      <div
                        key={record.discogs_id}
                        style={{ width: cardWidth, height: cardWidth, flexShrink: 0 }}
                      />
                    );
                  }

                  const scale   = isActive ? 1 : absOffset === 1 ? 0.88 : 0.80;
                  const opacity = absOffset === 0 ? 1 : absOffset === 1 ? 0.70 : absOffset === 2 ? 0.35 : 0.10;
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
                          ? "none"
                          : `transform 0.38s ${EASE}, opacity 0.38s ease`,
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

                      {/* Bottom gradient scrim */}
                      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none" />

                      {/* Play count badge / inline editor — top right */}
                      {isEditing ? (
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
                              if (e.key === "Enter")  saveEdit();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="w-12 bg-transparent text-white text-sm text-center outline-none tabular-nums"
                            autoFocus
                          />
                          <button onClick={saveEdit}              className="text-amber-500 text-sm font-bold px-0.5">✓</button>
                          <button onClick={() => setEditingId(null)} className="text-zinc-500 text-sm px-0.5">✕</button>
                        </div>
                      ) : (
                        (isActive || count > 0) && (
                          <div
                            className={`absolute top-3 right-3 bg-black/65 backdrop-blur-md rounded-full px-2.5 py-0.5 ${
                              isActive ? "cursor-pointer" : "pointer-events-none"
                            }`}
                            onClick={isActive ? e => {
                              e.stopPropagation();
                              openEditor(record.discogs_id, count);
                            } : undefined}
                          >
                            <span className="text-[10px] text-zinc-400 font-medium tabular-nums">
                              {count > 0 ? `${count}×` : "·"}
                            </span>
                          </div>
                        )
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

                      {/* Title + artist overlay — bottom */}
                      <div className="absolute inset-x-0 bottom-0 p-4 pointer-events-none">
                        <p className="text-white font-bold text-sm leading-snug line-clamp-2 drop-shadow">
                          {record.title}
                        </p>
                        <p className="text-zinc-400 text-xs mt-0.5 line-clamp-1 drop-shadow">
                          {record.artist}
                        </p>
                      </div>

                      {/* Active/now-playing border ring */}
                      <div
                        className="absolute inset-0 rounded-2xl border-2 pointer-events-none transition-colors duration-300"
                        style={{
                          borderColor: isNowPlay && isActive
                            ? "rgba(245,158,11,0.7)"
                            : isActive
                              ? "rgba(113,113,122,0.3)"
                              : "transparent",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Compact Now Playing bar (measured for centering) ── */}
        <div ref={botRef} className="shrink-0 px-4 pt-2 pb-safe">
          {nowPlayingRec ? (
            <div className="flex items-center gap-3 bg-zinc-950 border border-amber-500/15 rounded-2xl px-3 py-2.5">
              {/* Mini thumbnail */}
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-zinc-900">
                  <img
                    src={`/api/image?url=${encodeURIComponent(nowPlayingRec.cover_url)}`}
                    alt={nowPlayingRec.title}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </div>
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 now-playing-dot" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black tracking-[0.18em] text-amber-500 uppercase leading-none mb-0.5">
                  Now Playing
                </p>
                <p className="text-xs font-semibold text-white line-clamp-1 leading-tight">
                  {nowPlayingRec.title}
                </p>
                <p className="text-[10px] text-zinc-600 line-clamp-1">{nowPlayingRec.artist}</p>
              </div>

              {/* Play count */}
              {nowPlayData && (
                <div className="shrink-0 text-right">
                  <p className="text-base font-black text-amber-500 tabular-nums leading-none">
                    {nowPlayData.play_count}
                  </p>
                  <p className="text-[9px] text-zinc-700 mt-0.5">
                    {nowPlayData.play_count === 1 ? "play" : "plays"}
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Placeholder — same height as live state so layout never shifts */
            <div className="flex items-center gap-3 bg-zinc-950/50 border border-zinc-900 rounded-2xl px-3 py-2.5">
              <div className="w-9 h-9 rounded-lg bg-zinc-900/60 flex items-center justify-center shrink-0">
                <Disc3 size={15} strokeWidth={1} className="text-zinc-800" />
              </div>
              <p className="text-xs text-zinc-800">Tap a record to start playing</p>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          NOW PLAYING MODE
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        className="absolute inset-0 flex flex-col"
        style={{
          opacity:       mode === "now-playing" ? 1 : 0,
          transform:     mode === "now-playing" ? "translateY(0)" : "translateY(24px)",
          pointerEvents: mode === "now-playing" ? "auto" : "none",
          transition:    `opacity 0.32s ${EASE}, transform 0.32s ${EASE}`,
        }}
      >
        {/* ── Main content: two sub-panels with CSS opacity transitions ── */}
        <div className="flex-1 min-h-0 relative">

          {/* ── Detail sub-panel (shown when !isPlaying) ── */}
          <div
            className="absolute inset-0 overflow-y-auto scrollbar-hide"
            style={{
              opacity:       isPlaying ? 0 : 1,
              pointerEvents: (mode !== "now-playing" || isPlaying) ? "none" : "auto",
              transition:    `opacity 0.32s ${EASE}`,
            }}
          >
            <div className="flex flex-col items-center gap-5 px-8 pt-safe py-6">

              {/* Album art */}
              <div
                className="rounded-2xl overflow-hidden bg-zinc-900 shrink-0"
                style={{
                  width:     "min(80vw, 380px)",
                  height:    "min(80vw, 380px)",
                  boxShadow: "0 32px 80px -8px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.04)",
                }}
              >
                {viewingRecord && (
                  <img
                    src={`/api/image?url=${encodeURIComponent(viewingRecord.cover_url)}&size=600`}
                    alt={viewingRecord.title}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                )}
              </div>

              {/* Title + artist */}
              <div className="text-center w-full max-w-sm">
                <p className="text-2xl font-black tracking-tight leading-tight line-clamp-2">
                  {viewingRecord?.title ?? ""}
                </p>
                <p className="text-zinc-500 text-lg mt-1.5 line-clamp-1">
                  {viewingRecord?.artist ?? ""}
                </p>
              </div>

              {/* Metadata section */}
              {albumLoading ? (
                <div className="w-full max-w-sm space-y-2.5">
                  <div className="h-3.5 bg-zinc-900 rounded-full w-2/3 mx-auto animate-pulse" />
                  <div className="flex gap-2 justify-center">
                    <div className="h-6 bg-zinc-900 rounded-full w-14 animate-pulse" />
                    <div className="h-6 bg-zinc-900 rounded-full w-20 animate-pulse" />
                    <div className="h-6 bg-zinc-900 rounded-full w-16 animate-pulse" />
                  </div>
                  <div className="space-y-1.5 pt-1">
                    {[90, 80, 85, 75, 88, 70].map((w, i) => (
                      <div key={i} className="flex items-center gap-3 px-4">
                        <div className="h-2.5 bg-zinc-900 rounded-full w-6 animate-pulse shrink-0" />
                        <div className="h-2.5 bg-zinc-900 rounded-full animate-pulse flex-1" style={{ maxWidth: `${w}%` }} />
                        <div className="h-2.5 bg-zinc-900 rounded-full w-8 animate-pulse shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : albumDetails ? (
                <div className="w-full max-w-sm space-y-4">

                  {/* Year · Label */}
                  {(albumDetails.year || albumDetails.label) && (
                    <p className="text-center text-[11px] text-zinc-500 tracking-wide uppercase">
                      {[albumDetails.year, albumDetails.label].filter(Boolean).join("  ·  ")}
                    </p>
                  )}

                  {/* Genre + style pills */}
                  {(albumDetails.genres.length > 0 || albumDetails.styles.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {albumDetails.genres.map(g => (
                        <span key={g} className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-[10px] text-zinc-400 tracking-wide">
                          {g}
                        </span>
                      ))}
                      {albumDetails.styles.map(s => (
                        <span key={s} className="px-2.5 py-1 bg-zinc-950 border border-zinc-800/50 rounded-full text-[10px] text-zinc-600 tracking-wide">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Tracklist */}
                  {albumDetails.tracklist.length > 0 && (
                    <div className="rounded-xl overflow-hidden border border-zinc-900">
                      {albumDetails.tracklist.map((track, i) => (
                        <div
                          key={i}
                          className={`flex items-baseline gap-3 px-4 py-2.5 ${
                            i < albumDetails.tracklist.length - 1 ? "border-b border-zinc-900/80" : ""
                          }`}
                        >
                          <span className="text-[10px] text-zinc-700 w-5 shrink-0 tabular-nums text-right">
                            {track.position}
                          </span>
                          <span className="flex-1 text-xs text-zinc-300 leading-snug">
                            {track.title}
                          </span>
                          {track.duration && (
                            <span className="text-[10px] text-zinc-700 tabular-nums shrink-0">
                              {track.duration}
                            </span>
                          )}
                        </div>
                      ))}
                      {albumDetails.runtime && (
                        <div className="flex justify-end px-4 py-2.5 border-t border-zinc-900">
                          <span className="text-[10px] text-zinc-600 tracking-wide">
                            {albumDetails.runtime} total
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              ) : null}

              {/* Play count with inline editor */}
              <div>
                {npIsEditing ? (
                  <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-2.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="9999"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter")  saveEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-16 bg-transparent text-white text-lg text-center outline-none tabular-nums font-bold"
                      autoFocus
                    />
                    <span className="text-zinc-600 text-sm">plays</span>
                    <button onClick={saveEdit}              className="text-amber-500 font-bold text-lg ml-1">✓</button>
                    <button onClick={() => setEditingId(null)} className="text-zinc-600 text-lg">✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => viewingRecord && openEditor(viewingRecord.discogs_id, npPlayData?.play_count ?? 0)}
                    className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 rounded-full px-5 py-2 transition-colors hover:border-zinc-700 active:scale-95 transition-transform"
                  >
                    <span className="text-white font-black text-lg tabular-nums">
                      {npPlayData?.play_count ?? 0}
                    </span>
                    <span className="text-zinc-500 text-sm">
                      {(npPlayData?.play_count ?? 0) === 1 ? "play" : "plays"}
                    </span>
                    <span className="text-zinc-700 text-xs ml-0.5">edit</span>
                  </button>
                )}
              </div>

              {/* Mark as Playing button */}
              <button
                onClick={() => viewingRecord && markPlaying(viewingRecord.discogs_id)}
                className="flex items-center gap-2.5 rounded-full px-9 py-4 text-sm font-black tracking-[0.08em] uppercase active:scale-95 transition-transform"
                style={{
                  background:  "#f59e0b",
                  color:       "#000",
                  boxShadow:   "0 8px 32px -4px rgba(245,158,11,0.5)",
                }}
              >
                <Play size={15} fill="#000" strokeWidth={0} />
                <span>Mark as Playing</span>
              </button>

              {/* Bottom spacer */}
              <div className="h-4" />
            </div>
          </div>

          {/* ── Playing sub-panel (shown when isPlaying) ── */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8"
            style={{
              opacity:       isPlaying ? 1 : 0,
              pointerEvents: (mode === "now-playing" && isPlaying) ? "auto" : "none",
              transition:    `opacity 0.4s ${EASE}`,
              paddingTop:    "max(env(safe-area-inset-top), 12px)",
            }}
          >
            {/* Large album art */}
            <div
              className="rounded-2xl overflow-hidden bg-zinc-900 shrink-0"
              style={{
                width:     "min(90vw, 500px)",
                height:    "min(90vw, 500px)",
                boxShadow: "0 40px 96px -8px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.05)",
              }}
            >
              {viewingRecord && (
                <img
                  src={`/api/image?url=${encodeURIComponent(viewingRecord.cover_url)}&size=600`}
                  alt={viewingRecord.title}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              )}
            </div>

            {/* NOW PLAYING indicator */}
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 now-playing-dot shrink-0" />
              <span className="text-[11px] font-black tracking-[0.25em] text-amber-500 uppercase">
                Now Playing
              </span>
            </div>

            {/* Title + artist */}
            <div className="text-center">
              <p className="text-xl font-black tracking-tight leading-tight line-clamp-2">
                {viewingRecord?.title ?? ""}
              </p>
              <p className="text-zinc-500 text-base mt-1 line-clamp-1">
                {viewingRecord?.artist ?? ""}
              </p>
            </div>

            {/* Play count badge */}
            <div className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 rounded-full px-5 py-2">
              <span className="text-white font-black text-lg tabular-nums">
                {npPlayData?.play_count ?? 0}
              </span>
              <span className="text-zinc-500 text-sm">
                {(npPlayData?.play_count ?? 0) === 1 ? "play" : "plays"}
              </span>
            </div>
          </div>

        </div>

        {/* ── Bottom navigation bar ── */}
        <div className="shrink-0 flex items-center justify-between px-5 pt-3 pb-safe">
          <button
            onClick={exitNowPlaying}
            className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors active:scale-95 transition-transform py-2 pr-4"
          >
            <ArrowLeft size={18} />
            <span className="text-sm font-medium">Browse</span>
          </button>

          <button
            onClick={async () => { await syncFromDiscogs(); await fetchPlays(); }}
            disabled={syncing}
            aria-label="Sync with Discogs"
            className="p-2 text-zinc-700 hover:text-zinc-400 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

    </main>
  );
}
