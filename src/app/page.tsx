"use client";

import React, {
  useState,
  useEffect,
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

const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const GOLD = "#C9A84C";

// Durations for waveform bars — varied so they feel organic
const WAVE_DURATIONS = [0.7, 0.5, 0.9, 0.6, 0.8, 0.55, 0.75, 0.95, 0.6, 0.85, 0.7, 0.5, 0.9, 0.65, 0.8, 0.55];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

/** Every 9th card (0, 9, 18 …) gets the wide/hero treatment */
function isWideCard(i: number): boolean {
  return i % 9 === 0;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {

  // ── App state ──────────────────────────────────────────────────────────────
  const [mode,          setMode]         = useState<AppMode>("browse");
  const [records,       setRecords]      = useState<RecordData[]>([]);
  const [plays,         setPlays]        = useState<Record<string, PlayData>>({});
  const [loading,       setLoading]      = useState(true);
  const [syncing,       setSyncing]      = useState(false);
  const [nowPlayingId,  setNowPlayingId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord]= useState<RecordData | null>(null);
  const [sort,          setSort]         = useState<SortKey>("date_added");
  const [filter,        setFilter]       = useState("");

  // ── Inline play-count editor ───────────────────────────────────────────────
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editValue,  setEditValue]  = useState("");

  // ── Album details + playing state ─────────────────────────────────────────
  const [albumDetails, setAlbumDetails] = useState<AlbumDetails | null>(null);
  const [albumLoading, setAlbumLoading] = useState(false);
  const [isPlaying,    setIsPlaying]    = useState(false);

  // ── Hover (for frosted-glass card overlay) ────────────────────────────────
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
      if (Array.isArray(data)) setRecords(data as RecordData[]);
    } finally {
      setSyncing(false);
    }
  }, []);

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

  // ── Album details fetch ────────────────────────────────────────────────────

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

  // ── Navigation ────────────────────────────────────────────────────────────

  const openNowPlaying = useCallback((record: RecordData) => {
    setEditingId(null);
    setViewingRecord(record);
    setIsPlaying(false);
    setAlbumDetails(null);
    setMode("now-playing");
  }, []);

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

  // ── Derived ────────────────────────────────────────────────────────────────

  const nowPlayingRec = nowPlayingId ? records.find(r => r.discogs_id === nowPlayingId) : null;
  const nowPlayData   = nowPlayingId ? plays[nowPlayingId] : null;
  const npPlayData    = viewingRecord ? plays[viewingRecord.discogs_id] : null;
  const npIsEditing   = editingId === viewingRecord?.discogs_id;

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100dvh", background: "#0c0a07",
      }}>
        <Disc3 className="vinyl-spin" size={40} strokeWidth={1}
          style={{ color: "#3a2c14", marginBottom: 20 }} />
        <p style={{
          fontFamily: "var(--font-mono)", fontSize: "0.6rem",
          letterSpacing: "0.3em", color: "#3a2c14", textTransform: "uppercase",
        }}>
          Syncing Collection
        </p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main
      className="select-none"
      style={{ position: "relative", height: "100dvh", background: "#0c0a07", overflow: "hidden" }}
    >

      {/* ════════════════════════════════════════════════════════════════════
          BROWSE MODE
      ════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          opacity:       mode === "browse" ? 1 : 0,
          transform:     mode === "browse" ? "translateY(0)" : "translateY(-10px)",
          pointerEvents: mode === "browse" ? "auto" : "none",
          transition:    `opacity 0.32s ${EASE}, transform 0.32s ${EASE}`,
        }}
      >

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, padding: "max(env(safe-area-inset-top), 14px) 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 12 }}>

            {/* Logotype */}
            <h1 style={{
              fontFamily: "var(--font-playfair)",
              fontWeight: 900,
              fontSize: "0.9rem",
              letterSpacing: "0.28em",
              color: "#f5f0e8",
              textTransform: "uppercase",
              lineHeight: 1,
            }}>
              SpinWatcher
            </h1>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Count badge */}
              {displayed.length > 0 && (
                <div style={{
                  background: "rgba(201,168,76,0.08)",
                  border: "1px solid rgba(201,168,76,0.22)",
                  borderRadius: 999,
                  padding: "3px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: "0.58rem",
                    color: GOLD, letterSpacing: "0.05em", fontWeight: 700,
                  }}>
                    {displayed.length}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", color: "#3a2c14" }}>
                    / {records.length}
                  </span>
                </div>
              )}

              {/* Sync */}
              <button
                onClick={async () => { await syncFromDiscogs(); await fetchPlays(); }}
                disabled={syncing}
                aria-label="Sync with Discogs"
                style={{
                  padding: "6px", color: "#3a2c14", background: "transparent",
                  border: "none", cursor: "pointer", transition: "color 0.2s",
                  opacity: syncing ? 0.4 : 1,
                }}
              >
                <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* ── Search ─────────────────────────────────────────────────── */}
          <div style={{ paddingBottom: 10 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12, padding: "8px 12px",
            }}>
              <Search size={13} style={{ color: "#3a2c14", flexShrink: 0 }} />
              <input
                type="text"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Search artists or records…"
                style={{
                  flex: 1, background: "transparent",
                  fontSize: "0.8rem", color: "#f5f0e8",
                  border: "none", outline: "none",
                  fontFamily: "var(--font-mono)",
                }}
              />
              {filter && (
                <button onClick={() => setFilter("")} style={{ color: "#3a2c14", background: "transparent", border: "none", cursor: "pointer" }}>
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* ── Sort pills ─────────────────────────────────────────────── */}
          <div className="scrollbar-hide" style={{
            display: "flex", gap: 6, paddingBottom: 12,
            overflowX: "auto",
          }}>
            {SORT_OPTIONS.map(opt => {
              const active = sort === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setSort(opt.key)}
                  style={{
                    flexShrink: 0,
                    padding: "4px 13px",
                    borderRadius: 999,
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.6rem",
                    letterSpacing: "0.08em",
                    fontWeight: active ? 700 : 400,
                    background: active ? GOLD : "transparent",
                    color: active ? "#0c0a07" : "#4a3820",
                    border: active ? `1px solid ${GOLD}` : "1px solid rgba(255,255,255,0.07)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    whiteSpace: "nowrap",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Album grid ──────────────────────────────────────────────────── */}
        <div
          className="scrollbar-hide"
          style={{ flex: 1, overflowY: "auto", overscrollBehaviorY: "contain" }}
        >
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 8,
            padding: "4px 12px 24px",
          }}>
            {displayed.length === 0 ? (
              <div style={{
                gridColumn: "span 2", padding: "80px 20px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
              }}>
                <Disc3 size={40} strokeWidth={1} style={{ color: "#2a1f10" }} />
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "#2a1f10", letterSpacing: "0.15em" }}>
                  NO RECORDS FOUND
                </p>
              </div>
            ) : (
              displayed.map((record, i) => {
                const wide      = isWideCard(i);
                const isHero    = i === 0;
                const isHovered = hoveredId === record.discogs_id;
                const isNowPlay = record.discogs_id === nowPlayingId;
                const playData  = plays[record.discogs_id];
                const count     = playData?.play_count ?? 0;
                const isEditing = editingId === record.discogs_id;
                const imgUrl    = `/api/image?url=${encodeURIComponent(record.cover_url)}`;

                return (
                  <div
                    key={record.discogs_id}
                    style={{
                      gridColumn:   wide ? "span 2" : "span 1",
                      aspectRatio:  isHero ? "4/3" : wide ? "5/2" : "1/1",
                      borderRadius: isHero ? 18 : 14,
                      position:     "relative",
                      overflow:     "hidden",
                      cursor:       "pointer",
                      border:       isNowPlay
                        ? `1.5px solid rgba(201,168,76,0.45)`
                        : "1px solid rgba(255,255,255,0.05)",
                      animation:    `card-enter 0.55s ${EASE} both`,
                      animationDelay: `${Math.min(i * 0.048, 0.65)}s`,
                    }}
                    onMouseEnter={() => setHoveredId(record.discogs_id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => {
                      if (isEditing) return;
                      openNowPlaying(record);
                    }}
                  >
                    {/* ── Background album art ── */}
                    <img
                      src={imgUrl}
                      alt={record.title}
                      draggable={false}
                      style={{
                        position:   "absolute",
                        inset:      0,
                        width:      "100%",
                        height:     "100%",
                        objectFit:  "cover",
                        transition: "transform 0.5s ease, filter 0.5s ease",
                        transform:  isHovered ? "scale(1.07)" : "scale(1)",
                        filter:     isHovered ? "brightness(0.2) saturate(0.4)" : "brightness(1)",
                      }}
                    />

                    {/* ── Frosted-glass hover overlay (slides up) ── */}
                    <div
                      style={{
                        position:       "absolute",
                        inset:          0,
                        background:     "rgba(10,8,5,0.78)",
                        backdropFilter: isHovered ? "blur(18px)" : "none",
                        WebkitBackdropFilter: isHovered ? "blur(18px)" : "none",
                        display:        "flex",
                        flexDirection:  "column",
                        alignItems:     "center",
                        justifyContent: "center",
                        gap:            10,
                        padding:        14,
                        opacity:        isHovered ? 1 : 0,
                        transform:      isHovered ? "translateY(0)" : "translateY(100%)",
                        transition:     `opacity 0.35s ease, transform 0.38s ${EASE}`,
                      }}
                    >
                      {/* Spinning vinyl disc */}
                      <div
                        style={{
                          width:        wide ? "28%" : "52%",
                          aspectRatio:  "1/1",
                          borderRadius: "50%",
                          overflow:     "hidden",
                          border:       `2px solid rgba(201,168,76,0.3)`,
                          boxShadow:    `0 0 0 5px rgba(201,168,76,0.07), 0 14px 40px rgba(0,0,0,0.65)`,
                          animation:    isHovered ? "vinyl-spin 5s linear infinite" : "none",
                          flexShrink:   0,
                        }}
                      >
                        <img
                          src={imgUrl}
                          alt={record.title}
                          draggable={false}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>

                      {/* Overlay info */}
                      <div style={{ textAlign: "center", width: "100%" }}>
                        <p
                          className="line-clamp-2"
                          style={{
                            fontFamily:  "var(--font-playfair)",
                            fontSize:    isHero ? "1.05rem" : wide ? "0.9rem" : "0.82rem",
                            fontWeight:  700,
                            color:       "#f5f0e8",
                            lineHeight:  1.25,
                          }}
                        >
                          {record.title}
                        </p>
                        <p
                          className="line-clamp-1"
                          style={{
                            fontFamily:    "var(--font-mono)",
                            fontSize:      "0.58rem",
                            color:         GOLD,
                            marginTop:     4,
                            letterSpacing: "0.1em",
                          }}
                        >
                          {record.artist.toUpperCase()}
                        </p>
                        <p style={{
                          fontFamily:    "var(--font-mono)",
                          fontSize:      "0.52rem",
                          color:         "#5a4828",
                          marginTop:     5,
                          letterSpacing: "0.06em",
                        }}>
                          {count > 0 ? `${count}× plays` : "— plays"}
                          {playData?.last_played ? ` · ${formatDate(playData.last_played)}` : ""}
                        </p>
                      </div>
                    </div>

                    {/* ── Default bottom info (hidden on hover) ── */}
                    <div
                      style={{
                        position:   "absolute",
                        bottom:     0, left: 0, right: 0,
                        background: "linear-gradient(to top, rgba(10,8,5,0.96) 0%, rgba(10,8,5,0.5) 55%, transparent 100%)",
                        padding:    isHero ? "28px 14px 14px" : "20px 10px 10px",
                        transition: "opacity 0.3s ease",
                        opacity:    isHovered ? 0 : 1,
                        pointerEvents: "none",
                      }}
                    >
                      <p
                        className="line-clamp-2"
                        style={{
                          fontFamily:  isHero ? "var(--font-playfair)" : "inherit",
                          fontSize:    isHero ? "1rem" : wide ? "0.8rem" : "0.72rem",
                          fontWeight:  isHero ? 700 : 600,
                          color:       "#f5f0e8",
                          lineHeight:  1.25,
                        }}
                      >
                        {record.title}
                      </p>
                      <p
                        className="line-clamp-1"
                        style={{
                          fontFamily:    "var(--font-mono)",
                          fontSize:      "0.56rem",
                          color:         "rgba(245,240,232,0.38)",
                          marginTop:     3,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {record.artist}
                      </p>
                      {(isHero || wide) && count > 0 && (
                        <p style={{
                          fontFamily:    "var(--font-mono)",
                          fontSize:      "0.52rem",
                          color:         GOLD,
                          marginTop:     4,
                          letterSpacing: "0.1em",
                          opacity:       0.8,
                        }}>
                          {count}× plays
                        </p>
                      )}
                    </div>

                    {/* ── Play count badge — top right ── */}
                    {isEditing ? (
                      <div
                        style={{
                          position: "absolute", top: 8, right: 8,
                          display: "flex", alignItems: "center", gap: 4,
                          background: "rgba(12,10,7,0.96)",
                          backdropFilter: "blur(10px)",
                          border: `1px solid rgba(201,168,76,0.28)`,
                          borderRadius: 10,
                          padding: "6px 8px",
                          zIndex: 10,
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        <input
                          type="number" inputMode="numeric" min="0" max="9999"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter")  saveEdit();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          style={{
                            width: 40, background: "transparent", color: "#f5f0e8",
                            fontSize: "0.72rem", textAlign: "center",
                            border: "none", outline: "none",
                            fontFamily: "var(--font-mono)",
                          }}
                          autoFocus
                        />
                        <button onClick={saveEdit} style={{ color: GOLD, fontSize: "0.75rem", fontWeight: 700, background: "transparent", border: "none", cursor: "pointer" }}>✓</button>
                        <button onClick={() => setEditingId(null)} style={{ color: "#4a3a1a", fontSize: "0.75rem", background: "transparent", border: "none", cursor: "pointer" }}>✕</button>
                      </div>
                    ) : count > 0 && (
                      <div
                        style={{
                          position: "absolute", top: 8, right: 8,
                          background: "rgba(12,10,7,0.72)",
                          backdropFilter: "blur(8px)",
                          borderRadius: 999,
                          padding: "3px 8px",
                          cursor: "pointer",
                          zIndex: 10,
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          openEditor(record.discogs_id, count);
                        }}
                      >
                        <span style={{
                          fontFamily:    "var(--font-mono)",
                          fontSize:      "0.52rem",
                          color:         "rgba(201,168,76,0.75)",
                          letterSpacing: "0.05em",
                        }}>
                          {count}×
                        </span>
                      </div>
                    )}

                    {/* ── Now Playing badge — top left ── */}
                    {isNowPlay && (
                      <div
                        style={{
                          position:    "absolute", top: 8, left: 8,
                          display:     "flex", alignItems: "center", gap: 5,
                          background:  GOLD,
                          borderRadius: 999,
                          padding:     "4px 10px",
                          pointerEvents: "none",
                          zIndex: 10,
                        }}
                      >
                        <span
                          className="now-playing-dot"
                          style={{ width: 5, height: 5, borderRadius: "50%", background: "#0c0a07", flexShrink: 0, display: "block" }}
                        />
                        <span style={{
                          fontFamily:    "var(--font-mono)",
                          fontSize:      "0.48rem",
                          fontWeight:    700,
                          color:         "#0c0a07",
                          letterSpacing: "0.15em",
                        }}>
                          NOW PLAYING
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Premium Now Playing bar ─────────────────────────────────────── */}
        <div
          style={{
            flexShrink:          0,
            background:          "rgba(10,8,5,0.95)",
            backdropFilter:      "blur(24px)",
            WebkitBackdropFilter:"blur(24px)",
            borderTop:           "1px solid rgba(201,168,76,0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px" }}>

            {/* Thumbnail */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{
                width: 46, height: 46, borderRadius: 10,
                overflow: "hidden",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {nowPlayingRec ? (
                  <img
                    src={`/api/image?url=${encodeURIComponent(nowPlayingRec.cover_url)}`}
                    alt={nowPlayingRec.title}
                    draggable={false}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <Disc3 size={18} strokeWidth={1} style={{ color: "#2a1f10" }} />
                )}
              </div>
              {nowPlayingRec && (
                <span
                  className="now-playing-dot"
                  style={{
                    position: "absolute", top: -3, right: -3,
                    width: 8, height: 8, borderRadius: "50%",
                    background: GOLD,
                    border: "1.5px solid #0c0a07",
                    display: "block",
                  }}
                />
              )}
            </div>

            {/* Track info + waveform */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {nowPlayingRec ? (
                <>
                  <p
                    className="line-clamp-1"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize:   "0.875rem",
                      fontWeight: 700,
                      color:      "#f5f0e8",
                      lineHeight: 1.2,
                    }}
                  >
                    {nowPlayingRec.title}
                  </p>
                  <p
                    className="line-clamp-1"
                    style={{
                      fontFamily:    "var(--font-mono)",
                      fontSize:      "0.58rem",
                      color:         "#5a4828",
                      marginTop:     2,
                      letterSpacing: "0.07em",
                    }}
                  >
                    {nowPlayingRec.artist.toUpperCase()}
                  </p>
                  {/* Waveform bars */}
                  <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 18, marginTop: 5 }}>
                    {WAVE_DURATIONS.map((dur, i) => (
                      <div
                        key={i}
                        className="wave-bar"
                        style={{ animationDuration: `${dur}s`, animationDelay: `${i * 0.048}s` }}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      "0.6rem",
                  color:         "#2a1f10",
                  letterSpacing: "0.12em",
                }}>
                  TAP A RECORD TO BEGIN
                </p>
              )}
            </div>

            {/* Play count */}
            {nowPlayData && (
              <div style={{ flexShrink: 0, textAlign: "right" }}>
                <p style={{
                  fontFamily: "var(--font-mono)",
                  fontSize:   "1.3rem",
                  fontWeight: 700,
                  color:      GOLD,
                  lineHeight: 1,
                }}>
                  {nowPlayData.play_count}×
                </p>
                <p style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      "0.48rem",
                  color:         "#3a2c14",
                  marginTop:     2,
                  letterSpacing: "0.12em",
                }}>
                  PLAYS
                </p>
              </div>
            )}
          </div>
          <div className="pb-safe" style={{ paddingTop: 0 }} />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          NOW PLAYING MODE
      ════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          opacity:       mode === "now-playing" ? 1 : 0,
          transform:     mode === "now-playing" ? "translateY(0)" : "translateY(24px)",
          pointerEvents: mode === "now-playing" ? "auto" : "none",
          transition:    `opacity 0.32s ${EASE}, transform 0.32s ${EASE}`,
        }}
      >
        {/* ── Main content: detail + playing sub-panels ── */}
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>

          {/* ── Detail sub-panel (shown when !isPlaying) ── */}
          <div
            className="scrollbar-hide"
            style={{
              position: "absolute", inset: 0, overflowY: "auto",
              opacity:       isPlaying ? 0 : 1,
              pointerEvents: (mode !== "now-playing" || isPlaying) ? "none" : "auto",
              transition:    `opacity 0.32s ${EASE}`,
            }}
          >
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 20, padding: "max(env(safe-area-inset-top), 12px) 28px 28px",
            }}>

              {/* Album art */}
              <div
                style={{
                  width:     "min(80vw, 360px)",
                  height:    "min(80vw, 360px)",
                  borderRadius: 20,
                  overflow:  "hidden",
                  background: "rgba(255,255,255,0.03)",
                  boxShadow: "0 28px 80px -8px rgba(0,0,0,0.92), 0 0 0 1px rgba(255,255,255,0.05)",
                  flexShrink: 0,
                }}
              >
                {viewingRecord && (
                  <img
                    src={`/api/image?url=${encodeURIComponent(viewingRecord.cover_url)}&size=600`}
                    alt={viewingRecord.title}
                    draggable={false}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )}
              </div>

              {/* Title + artist */}
              <div style={{ textAlign: "center", width: "100%", maxWidth: 340 }}>
                <p
                  className="line-clamp-2"
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize:   "1.6rem",
                    fontWeight: 900,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.15,
                    color: "#f5f0e8",
                  }}
                >
                  {viewingRecord?.title ?? ""}
                </p>
                <p style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      "0.7rem",
                  color:         "#5a4828",
                  marginTop:     8,
                  letterSpacing: "0.1em",
                }}>
                  {viewingRecord?.artist?.toUpperCase() ?? ""}
                </p>
              </div>

              {/* Metadata section */}
              {albumLoading ? (
                <div style={{ width: "100%", maxWidth: 340 }}>
                  <div style={{ height: 12, background: "rgba(255,255,255,0.04)", borderRadius: 999, width: "60%", margin: "0 auto 10px" }} />
                  <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
                    {[56, 72, 60].map((w, i) => (
                      <div key={i} style={{ height: 22, background: "rgba(255,255,255,0.04)", borderRadius: 999, width: w }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[90, 80, 85, 75, 88, 70].map((w, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, padding: "0 12px" }}>
                        <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 999, width: 20, flexShrink: 0 }} />
                        <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 999, flex: 1, maxWidth: `${w}%` }} />
                        <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 999, width: 28, flexShrink: 0 }} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : albumDetails ? (
                <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 16 }}>

                  {/* Year · Label */}
                  {(albumDetails.year || albumDetails.label) && (
                    <p style={{
                      textAlign:     "center",
                      fontFamily:    "var(--font-mono)",
                      fontSize:      "0.6rem",
                      color:         "#5a4828",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                    }}>
                      {[albumDetails.year, albumDetails.label].filter(Boolean).join("  ·  ")}
                    </p>
                  )}

                  {/* Genre + style pills */}
                  {(albumDetails.genres.length > 0 || albumDetails.styles.length > 0) && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                      {albumDetails.genres.map(g => (
                        <span key={g} style={{
                          padding:       "4px 10px",
                          background:    "rgba(201,168,76,0.07)",
                          border:        "1px solid rgba(201,168,76,0.2)",
                          borderRadius:  999,
                          fontFamily:    "var(--font-mono)",
                          fontSize:      "0.56rem",
                          color:         GOLD,
                          letterSpacing: "0.06em",
                        }}>
                          {g}
                        </span>
                      ))}
                      {albumDetails.styles.map(s => (
                        <span key={s} style={{
                          padding:       "4px 10px",
                          background:    "rgba(255,255,255,0.03)",
                          border:        "1px solid rgba(255,255,255,0.07)",
                          borderRadius:  999,
                          fontFamily:    "var(--font-mono)",
                          fontSize:      "0.56rem",
                          color:         "#4a3820",
                          letterSpacing: "0.06em",
                        }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Tracklist */}
                  {albumDetails.tracklist.length > 0 && (
                    <div style={{
                      borderRadius: 14,
                      overflow: "hidden",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}>
                      {albumDetails.tracklist.map((track, i) => (
                        <div
                          key={i}
                          style={{
                            display:     "flex",
                            alignItems:  "baseline",
                            gap:         10,
                            padding:     "9px 14px",
                            borderBottom: i < albumDetails.tracklist.length - 1
                              ? "1px solid rgba(255,255,255,0.04)"
                              : "none",
                          }}
                        >
                          <span style={{
                            fontFamily: "var(--font-mono)",
                            fontSize:   "0.55rem",
                            color:      "#3a2c14",
                            width:      18,
                            flexShrink: 0,
                            textAlign:  "right",
                          }}>
                            {track.position}
                          </span>
                          <span style={{ flex: 1, fontSize: "0.75rem", color: "#c8bfa8", lineHeight: 1.3 }}>
                            {track.title}
                          </span>
                          {track.duration && (
                            <span style={{
                              fontFamily: "var(--font-mono)",
                              fontSize:   "0.55rem",
                              color:      "#3a2c14",
                              flexShrink: 0,
                            }}>
                              {track.duration}
                            </span>
                          )}
                        </div>
                      ))}
                      {albumDetails.runtime && (
                        <div style={{
                          display:     "flex",
                          justifyContent: "flex-end",
                          padding:     "8px 14px",
                          borderTop:   "1px solid rgba(255,255,255,0.04)",
                        }}>
                          <span style={{
                            fontFamily:    "var(--font-mono)",
                            fontSize:      "0.55rem",
                            color:         "#3a2c14",
                            letterSpacing: "0.08em",
                          }}>
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
                  <div style={{
                    display:      "flex",
                    alignItems:   "center",
                    gap:          10,
                    background:   "rgba(255,255,255,0.04)",
                    border:       `1px solid rgba(201,168,76,0.25)`,
                    borderRadius: 20,
                    padding:      "10px 16px",
                  }}>
                    <input
                      type="number" inputMode="numeric" min="0" max="9999"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter")  saveEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      style={{
                        width: 60, background: "transparent",
                        color: "#f5f0e8", fontSize: "1.1rem",
                        textAlign: "center", border: "none", outline: "none",
                        fontFamily: "var(--font-mono)", fontWeight: 700,
                      }}
                      autoFocus
                    />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "#3a2c14" }}>plays</span>
                    <button onClick={saveEdit} style={{ color: GOLD, fontWeight: 700, fontSize: "1.1rem", background: "transparent", border: "none", cursor: "pointer" }}>✓</button>
                    <button onClick={() => setEditingId(null)} style={{ color: "#3a2c14", fontSize: "1.1rem", background: "transparent", border: "none", cursor: "pointer" }}>✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => viewingRecord && openEditor(viewingRecord.discogs_id, npPlayData?.play_count ?? 0)}
                    style={{
                      display:      "flex",
                      alignItems:   "center",
                      gap:          8,
                      background:   "rgba(255,255,255,0.04)",
                      border:       "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 999,
                      padding:      "8px 20px",
                      cursor:       "pointer",
                      transition:   "border-color 0.2s, transform 0.15s",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "1.2rem", fontWeight: 700, color: "#f5f0e8" }}>
                      {npPlayData?.play_count ?? 0}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "#4a3820", letterSpacing: "0.08em" }}>
                      {(npPlayData?.play_count ?? 0) === 1 ? "PLAY" : "PLAYS"}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5rem", color: "#3a2c14", letterSpacing: "0.1em", marginLeft: 2 }}>
                      EDIT
                    </span>
                  </button>
                )}
              </div>

              {/* Mark as Playing */}
              <button
                onClick={() => viewingRecord && markPlaying(viewingRecord.discogs_id)}
                style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          10,
                  borderRadius: 999,
                  padding:      "14px 36px",
                  fontFamily:   "var(--font-mono)",
                  fontSize:     "0.7rem",
                  fontWeight:   700,
                  letterSpacing:"0.12em",
                  textTransform:"uppercase",
                  background:   GOLD,
                  color:        "#0c0a07",
                  border:       "none",
                  cursor:       "pointer",
                  boxShadow:    `0 8px 32px -4px rgba(201,168,76,0.45)`,
                  transition:   "transform 0.15s, box-shadow 0.2s",
                }}
              >
                <Play size={14} fill="#0c0a07" strokeWidth={0} />
                Mark as Playing
              </button>

              <div style={{ height: 16 }} />
            </div>
          </div>

          {/* ── Playing sub-panel (shown when isPlaying) ── */}
          <div
            style={{
              position:       "absolute",
              inset:          0,
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
              justifyContent: "center",
              gap:            20,
              padding:        "max(env(safe-area-inset-top), 12px) 28px 28px",
              opacity:        isPlaying ? 1 : 0,
              pointerEvents:  (mode === "now-playing" && isPlaying) ? "auto" : "none",
              transition:     `opacity 0.4s ${EASE}`,
            }}
          >
            {/* Large album art */}
            <div
              style={{
                width:        "min(88vw, 480px)",
                height:       "min(88vw, 480px)",
                borderRadius: 22,
                overflow:     "hidden",
                background:   "rgba(255,255,255,0.03)",
                boxShadow:    "0 36px 96px -8px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.05)",
                flexShrink:   0,
              }}
            >
              {viewingRecord && (
                <img
                  src={`/api/image?url=${encodeURIComponent(viewingRecord.cover_url)}&size=600`}
                  alt={viewingRecord.title}
                  draggable={false}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              )}
            </div>

            {/* Now Playing indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                className="now-playing-dot"
                style={{ width: 8, height: 8, borderRadius: "50%", background: GOLD, flexShrink: 0, display: "block" }}
              />
              <span style={{
                fontFamily:    "var(--font-mono)",
                fontSize:      "0.62rem",
                fontWeight:    700,
                letterSpacing: "0.25em",
                color:         GOLD,
              }}>
                NOW PLAYING
              </span>
            </div>

            {/* Title + artist */}
            <div style={{ textAlign: "center" }}>
              <p
                className="line-clamp-2"
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize:   "1.4rem",
                  fontWeight: 900,
                  letterSpacing: "-0.01em",
                  lineHeight: 1.2,
                  color: "#f5f0e8",
                }}
              >
                {viewingRecord?.title ?? ""}
              </p>
              <p style={{
                fontFamily:    "var(--font-mono)",
                fontSize:      "0.65rem",
                color:         "#5a4828",
                marginTop:     8,
                letterSpacing: "0.1em",
              }}>
                {viewingRecord?.artist?.toUpperCase() ?? ""}
              </p>
            </div>

            {/* Play count badge */}
            <div style={{
              display:      "flex",
              alignItems:   "center",
              gap:          8,
              background:   "rgba(255,255,255,0.04)",
              border:       "1px solid rgba(255,255,255,0.08)",
              borderRadius: 999,
              padding:      "8px 20px",
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "1.2rem", fontWeight: 700, color: "#f5f0e8" }}>
                {npPlayData?.play_count ?? 0}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "#4a3820", letterSpacing: "0.08em" }}>
                {(npPlayData?.play_count ?? 0) === 1 ? "PLAY" : "PLAYS"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Bottom nav bar (frosted) ── */}
        <div
          style={{
            flexShrink:          0,
            display:             "flex",
            alignItems:          "center",
            justifyContent:      "space-between",
            padding:             "10px 18px",
            background:          "rgba(10,8,5,0.9)",
            backdropFilter:      "blur(20px)",
            WebkitBackdropFilter:"blur(20px)",
            borderTop:           "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <button
            onClick={exitNowPlaying}
            style={{
              display:     "flex",
              alignItems:  "center",
              gap:         8,
              color:       "#4a3820",
              background:  "transparent",
              border:      "none",
              cursor:      "pointer",
              padding:     "6px 12px 6px 0",
              transition:  "color 0.2s",
            }}
          >
            <ArrowLeft size={16} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", letterSpacing: "0.08em" }}>
              BROWSE
            </span>
          </button>

          <button
            onClick={async () => { await syncFromDiscogs(); await fetchPlays(); }}
            disabled={syncing}
            aria-label="Sync with Discogs"
            style={{
              padding:    "6px",
              color:      "#3a2c14",
              background: "transparent",
              border:     "none",
              cursor:     "pointer",
              opacity:    syncing ? 0.4 : 1,
              transition: "color 0.2s",
            }}
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="pb-safe" style={{ background: "rgba(10,8,5,0.9)", paddingTop: 0 }} />
      </div>

    </main>
  );
}
