"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { FixedSizeList } from "react-window";
import { RefreshCw, Search, X, Disc3, ArrowLeft, Play, Square } from "lucide-react";
import { GridErrorBoundary } from "@/components/GridErrorBoundary";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecordData {
  discogs_id: string;
  title:      string;
  artist:     string;
  cover_url:  string;
  added_at:   string;
  genres:     string[];
  styles:     string[];
  year:       number | null;
  label:      string | null;
  format:     string | null;
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

type SortKey =
  | "date_added" | "artist" | "title" | "most_played" | "recently_played"
  | "year_asc"   | "year_desc" | "genre_az" | "format_az";
type AppMode = "browse" | "now-playing";

interface Session {
  username:   string;
  avatar_url: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "date_added",      label: "Date Added"  },
  { key: "artist",          label: "A–Z Artist"  },
  { key: "title",           label: "A–Z Title"   },
  { key: "most_played",     label: "Most Played" },
  { key: "recently_played", label: "Last Played" },
  { key: "year_desc",       label: "Year ↓"      },
  { key: "year_asc",        label: "Year ↑"      },
  { key: "genre_az",        label: "Genre A–Z"   },
  { key: "format_az",       label: "Format"      },
];

const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const GOLD = "#C9A84C";

const WAVE_DURATIONS = [0.7, 0.5, 0.9, 0.6, 0.8, 0.55, 0.75, 0.95, 0.6, 0.85, 0.7, 0.5, 0.9, 0.65, 0.8, 0.55];

// Grid layout constants
const HGAP          = 10;
const PAD           = 14;
const TEXT_HEIGHT   = 64;  // title + artist + genre tag + padding
const NP_BAR_HEIGHT = 100;  // height to subtract for persistent NP bar

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Fetch wrapper that adds Bearer auth for the iOS WebView flow. */
function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nd_bearer_token') : null;
  if (token) {
    init = { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } };
  }
  return fetch(input, init);
}

function parseRecords(raw: unknown[]): RecordData[] {
  return (raw as Array<Record<string, unknown>>).map(r => ({
    discogs_id: String(r.discogs_id ?? ""),
    title:      String(r.title ?? ""),
    artist:     String(r.artist ?? ""),
    cover_url:  String(r.cover_url ?? ""),
    added_at:   String(r.added_at ?? ""),
    genres:     JSON.parse(typeof r.genres === "string" ? r.genres : "[]"),
    styles:     JSON.parse(typeof r.styles === "string" ? r.styles : "[]"),
    year:       (r.year as number | null) ?? null,
    label:      (r.label as string | null) ?? null,
    format:     (r.format as string | null) ?? null,
  }));
}

// ─── VinylPlaceholder ─────────────────────────────────────────────────────────

function VinylPlaceholder() {
  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(255,255,255,0.02)",
    }}>
      <Disc3 size={36} strokeWidth={1} style={{ color: "#2a1f10" }} />
    </div>
  );
}

// ─── AlbumCard (memoized) ─────────────────────────────────────────────────────

interface AlbumCardProps {
  record:      RecordData;
  width:       number;
  artHeight:   number;
  globalIndex: number;
  isNowPlay:   boolean;
  playData:    PlayData | undefined;
  isEditing:   boolean;
  imgError:    boolean;
  editValue:   string;
  onOpen:            (r: RecordData) => void;
  onOpenEditor:      (id: string, count: number) => void;
  onSaveEdit:        () => void;
  onCancelEdit:      () => void;
  onEditValueChange: (val: string) => void;
  onImgError:        (id: string) => void;
}

const AlbumCard = React.memo(function AlbumCard({
  record, width, artHeight, globalIndex,
  isNowPlay, playData, isEditing, imgError, editValue,
  onOpen, onOpenEditor, onSaveEdit, onCancelEdit, onEditValueChange, onImgError,
}: AlbumCardProps) {
  const count  = playData?.play_count ?? 0;
  const imgUrl = record.cover_url
    ? `/api/image?url=${encodeURIComponent(record.cover_url)}&size=500`
    : "";

  return (
    <div
      className="album-card"
      style={{
        width, flexShrink: 0, cursor: "pointer",
        animation: `card-enter 0.2s ${EASE} both`,
        animationDelay: `${Math.min(globalIndex * 0.015, 0.25)}s`,
      }}
      onClick={() => { if (!isEditing) onOpen(record); }}
    >
      {/* Art wrapper — full column width, height capped by artHeight */}
      <div
        className="album-art-wrap"
        style={{
          position: "relative", width, height: artHeight,
          borderRadius: 10, overflow: "hidden",
          border: isNowPlay
            ? "1.5px solid rgba(201,168,76,0.6)"
            : "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {imgError || !record.cover_url ? (
          <VinylPlaceholder />
        ) : (
          <img
            src={imgUrl}
            alt={record.title}
            loading="lazy"
            draggable={false}
            className="album-art-img"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={() => onImgError(record.discogs_id)}
          />
        )}

        {/* Hover play icon (CSS-only via globals.css) */}
        {!isEditing && (
          <div className="album-hover-play">
            <Play size={18} fill={GOLD} color={GOLD} />
          </div>
        )}

        {/* Inline play-count editor */}
        {isEditing && (
          <div
            style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 8,
              background: "rgba(10,8,5,0.9)", backdropFilter: "blur(12px)", zIndex: 10,
            }}
            onClick={e => e.stopPropagation()}
          >
            <input
              type="number" inputMode="numeric" min="0" max="9999"
              value={editValue}
              onChange={e => onEditValueChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter")  onSaveEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
              style={{
                width: 64, background: "rgba(255,255,255,0.06)",
                color: "#f5f0e8", fontSize: "1.1rem",
                textAlign: "center", border: "1px solid rgba(201,168,76,0.3)",
                borderRadius: 8, padding: "6px 4px",
                outline: "none", fontFamily: "var(--font-mono)", fontWeight: 700,
              }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={onSaveEdit} style={{ color: GOLD, fontWeight: 700, fontSize: "0.9rem", background: "transparent", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)" }}>SAVE</button>
              <button onClick={onCancelEdit} style={{ color: "#4a3a1a", fontSize: "0.9rem", background: "transparent", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)" }}>CANCEL</button>
            </div>
          </div>
        )}

        {/* Play count badge */}
        {!isEditing && count > 0 && (
          <div
            style={{
              position: "absolute", top: 6, right: 6,
              background: "rgba(10,8,5,0.75)", backdropFilter: "blur(6px)",
              borderRadius: 999, padding: "2px 7px", cursor: "pointer", zIndex: 5,
            }}
            onClick={e => { e.stopPropagation(); onOpenEditor(record.discogs_id, count); }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5rem", color: "rgba(201,168,76,0.8)", letterSpacing: "0.05em" }}>
              {count}×
            </span>
          </div>
        )}

        {/* Now Playing pulse dot */}
        {isNowPlay && (
          <span
            className="now-playing-dot"
            style={{
              position: "absolute", top: 7, left: 7,
              width: 9, height: 9, borderRadius: "50%",
              background: GOLD, border: "1.5px solid rgba(10,8,5,0.75)",
              display: "block", pointerEvents: "none", zIndex: 5,
            }}
          />
        )}
      </div>

      {/* Title + artist + genre tags below image */}
      <div style={{ padding: "6px 2px 2px" }}>
        <p className="line-clamp-1" style={{
          fontFamily: "var(--font-playfair)", fontSize: "0.8rem",
          fontWeight: 700, color: "#f5f0e8", lineHeight: 1.25,
        }}>
          {record.title}
        </p>
        <p className="line-clamp-1" style={{
          fontFamily: "var(--font-mono)", fontSize: "0.55rem",
          color: "#5a4828", marginTop: 2, letterSpacing: "0.04em",
        }}>
          {record.artist}
        </p>
        {record.genres.length > 0 && (
          <p className="line-clamp-1" style={{
            fontFamily: "var(--font-mono)", fontSize: "0.5rem",
            color: "#3a2c14", marginTop: 3, letterSpacing: "0.04em",
          }}>
            {record.genres.slice(0, 2).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {

  // ── Auth state ─────────────────────────────────────────────────────────────
  const [session,       setSession]      = useState<Session | null>(null);
  const [authChecked,   setAuthChecked]  = useState(false);

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
  const [selectedGenres,setSelectedGenres]=useState<Set<string>>(new Set());
  const [imgErrors,     setImgErrors]    = useState<Set<string>>(new Set());

  // ── Inline play-count editor ───────────────────────────────────────────────
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editValue,  setEditValue]  = useState("");

  // ── Album details + playing state ─────────────────────────────────────────
  const [albumDetails, setAlbumDetails] = useState<AlbumDetails | null>(null);
  const [albumLoading, setAlbumLoading] = useState(false);
  const [isPlaying,    setIsPlaying]    = useState(false);

  // ── Grid container measurement (for react-window) ─────────────────────────
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [containerDims, setContainerDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]); // re-run when loading→false so the grid div is in the DOM

  // ── Data loading ───────────────────────────────────────────────────────────

  const fetchPlays = useCallback(async () => {
    const res = await apiFetch("/api/plays");
    if (!res.ok) return;
    const data: PlayData[] = await res.json();
    const map: Record<string, PlayData> = {};
    data.forEach(p => { map[p.discogs_id] = p; });
    setPlays(map);
  }, []);

  const syncFromDiscogs = useCallback(async (username?: string) => {
    setSyncing(true);
    try {
      const res = await apiFetch("/api/sync");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setRecords(parseRecords(data));
        if (username) localStorage.setItem(`last_sync_at_${username}`, String(Date.now()));
      }
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      // 0. Mobile OAuth: extract Bearer token from ?nd_token= URL param (set by iOS app after OAuth)
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('nd_token');
      if (urlToken) {
        localStorage.setItem('nd_bearer_token', urlToken);
        const clean = new URL(window.location.href);
        clean.searchParams.delete('nd_token');
        window.history.replaceState({}, '', clean.toString());
      }

      // 1. Check auth session
      const sessionRes = await apiFetch("/api/auth/session").catch(() => null);
      let sess: Session | null = null;
      if (sessionRes?.ok) {
        const data = await sessionRes.json() as { is_logged_in: boolean; username?: string; avatar_url?: string };
        if (data.is_logged_in && data.username) {
          sess = { username: data.username, avatar_url: data.avatar_url ?? "" };
          setSession(sess);
        }
      }
      setAuthChecked(true);

      // 2. If not logged in, stop here — show login screen
      if (!sess) {
        setLoading(false);
        return;
      }

      // 3. Boot collection
      setLoading(true);
      try {
        await apiFetch("/api/init");
        const res  = await apiFetch("/api/records");
        const data = res.ok ? await res.json() : [];
        if (Array.isArray(data) && data.length > 0) {
          setRecords(parseRecords(data));
          // Auto-sync if last sync was more than 24 h ago
          const lastSyncKey = `last_sync_at_${sess.username}`;
          const lastSync    = localStorage.getItem(lastSyncKey);
          const stale       = !lastSync || Date.now() - Number(lastSync) > 24 * 60 * 60 * 1000;
          if (stale) {
            await syncFromDiscogs();
            localStorage.setItem(lastSyncKey, String(Date.now()));
          }
        } else {
          await syncFromDiscogs();
          localStorage.setItem(`last_sync_at_${sess.username}`, String(Date.now()));
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
    let filtered = records;

    if (q) {
      filtered = filtered.filter(r =>
        r.artist.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        (r.year !== null && String(r.year).includes(q)) ||
        (r.label?.toLowerCase().includes(q) ?? false) ||
        r.genres.some(g => g.toLowerCase().includes(q))
      );
    }

    if (selectedGenres.size > 0) {
      filtered = filtered.filter(r => r.genres.some(g => selectedGenres.has(g)));
    }

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
        case "year_asc":        return (a.year ?? 0) - (b.year ?? 0);
        case "year_desc":       return (b.year ?? 0) - (a.year ?? 0);
        case "genre_az":        return (a.genres[0] ?? "").localeCompare(b.genres[0] ?? "");
        case "format_az":       return (a.format ?? "").localeCompare(b.format ?? "");
        default:                return new Date(b.added_at).getTime() - new Date(a.added_at).getTime();
      }
    });
  }, [records, plays, sort, filter, selectedGenres]);

  // ── Derived: unique genres across collection ───────────────────────────────

  const allGenres = useMemo(
    () => [...new Set(records.flatMap(r => r.genres))].sort(),
    [records]
  );

  // ── Grid layout ───────────────────────────────────────────────────────────
  //
  // Two distinct strategies based on orientation:
  //
  // PORTRAIT  — columns are width-driven; art is always square at cardWidth.
  //             Standard masonry-style multi-row grid.
  //
  // LANDSCAPE — art size is height-driven so covers are never cropped.
  //             targetRows sets how many full rows should be visible:
  //               iPhone landscape (grid h < 320px) → 1 row
  //               iPad landscape   (grid h ≥ 320px) → 2 rows
  //             artHeight fills that fraction of list height.
  //             colCount derives from how many square cards fit across.
  //             Row div is centred since cards won't span the full width.
  //
  const listHeight  = containerDims.h > 0 ? containerDims.h - NP_BAR_HEIGHT : 0;
  const isLandscape = containerDims.w > 0 && containerDims.h > 0
    && containerDims.w > containerDims.h * 1.1;

  let artHeight: number;
  let colCount:  number;
  let cardWidth: number;

  if (isLandscape && listHeight > 0) {
    const targetRows = containerDims.h < 320 ? 1 : 2;
    // Square art sized to show exactly targetRows (with a small gap so the next
    // row is barely visible as a scroll hint).
    artHeight = Math.max(60, Math.floor((listHeight - HGAP * (targetRows - 1)) / targetRows) - TEXT_HEIGHT);
    cardWidth = artHeight;                                                        // square cards
    colCount  = Math.max(2, Math.floor((containerDims.w - PAD * 2 + HGAP) / (artHeight + HGAP)));
  } else {
    // Portrait: fill full width with fixed column count.
    colCount  = containerDims.w < 600 ? 2 : containerDims.w < 1200 ? 3 : 4;
    cardWidth = containerDims.w > 0
      ? Math.floor((containerDims.w - PAD * 2 - HGAP * (colCount - 1)) / colCount)
      : 150;
    artHeight = cardWidth;                                                        // square art
  }

  const rowHeight = artHeight + TEXT_HEIGHT;

  const rows = useMemo(() => {
    const result: RecordData[][] = [];
    for (let i = 0; i < displayed.length; i += colCount) {
      result.push(displayed.slice(i, i + colCount));
    }
    return result;
  }, [displayed, colCount]);

  // ── Album details fetch ────────────────────────────────────────────────────

  useEffect(() => {
    if (mode !== "now-playing" || !viewingRecord) return;
    let cancelled = false;
    setAlbumLoading(true);
    setAlbumDetails(null);
    apiFetch(`/api/album/${viewingRecord.discogs_id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data) setAlbumDetails(data as AlbumDetails); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAlbumLoading(false); });
    return () => { cancelled = true; };
  }, [mode, viewingRecord]);

  // ── Play logging ───────────────────────────────────────────────────────────

  const markPlaying = useCallback(async (discogs_id: string) => {
    setNowPlayingId(discogs_id);
    setMode("now-playing");
    setIsPlaying(true);
    // Optimistically increment so NOW PLAYING shows the correct count immediately.
    setPlays(prev => ({
      ...prev,
      [discogs_id]: {
        discogs_id,
        play_count:  (prev[discogs_id]?.play_count ?? 0) + 1,
        last_played: new Date().toISOString(),
      },
    }));
    const res = await apiFetch("/api/plays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discogs_id }),
    });
    if (!res.ok) return;
    // Confirm with actual DB value (handles concurrent plays from other sessions).
    const { play_count, last_played } = await res.json();
    setPlays(prev => ({ ...prev, [discogs_id]: { discogs_id, play_count, last_played } }));
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

  const stopPlaying = useCallback(() => {
    setNowPlayingId(null);
    setIsPlaying(false);
    setEditingId(null);
    setMode("browse");
  }, []);

  const openPlayingView = useCallback((record: RecordData) => {
    setEditingId(null);
    setViewingRecord(record);
    setIsPlaying(true);
    setAlbumDetails(null);
    setMode("now-playing");
  }, []);

  // ── Inline play-count editor ───────────────────────────────────────────────

  const openEditor = useCallback((id: string, currentCount: number) => {
    setEditingId(id);
    setEditValue(String(currentCount));
  }, []);

  const cancelEdit = useCallback(() => setEditingId(null), []);

  const saveEdit = useCallback(async () => {
    if (editingId === null) return;
    const id = editingId;
    const n  = Math.max(0, Math.min(9999, parseInt(editValue, 10) || 0));
    setEditingId(null);
    setPlays(prev => ({
      ...prev,
      [id]: { discogs_id: id, play_count: n, last_played: prev[id]?.last_played ?? null },
    }));
    const res = await apiFetch("/api/plays", {
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

  // ── Genre filter ──────────────────────────────────────────────────────────

  const toggleGenre = useCallback((g: string) => {
    setSelectedGenres(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilter("");
    setSelectedGenres(new Set());
  }, []);

  // ── Image error tracking ──────────────────────────────────────────────────

  const addImgError = useCallback((id: string) => {
    setImgErrors(prev => { const s = new Set(prev); s.add(id); return s; });
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────

  const nowPlayingRec  = nowPlayingId ? records.find(r => r.discogs_id === nowPlayingId) : null;
  const nowPlayData    = nowPlayingId ? plays[nowPlayingId] : null;
  const npPlayData     = viewingRecord ? plays[viewingRecord.discogs_id] : null;
  const npIsEditing    = editingId === viewingRecord?.discogs_id;
  const isFiltering    = filter.length > 0 || selectedGenres.size > 0;

  // ── Pre-auth blank (avoid flash before session check completes) ────────────

  if (!authChecked) {
    return <div style={{ background: "#0c0a07", minHeight: "100dvh" }} />;
  }

  // ── Login screen ───────────────────────────────────────────────────────────

  if (!session) {
    return (
      <div style={{
        background: "#0c0a07", minHeight: "100dvh",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "0 24px",
        fontFamily: "var(--font-mono)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <Disc3 size={28} strokeWidth={1.2} style={{ color: GOLD }} />
          <h1 style={{
            fontFamily: "var(--font-playfair)", fontWeight: 900,
            fontSize: "1.3rem", letterSpacing: "0.28em",
            color: "#f5f0e8", textTransform: "uppercase",
          }}>
            NeedleDrop
          </h1>
        </div>

        {/* Tagline */}
        <p style={{
          fontSize: "0.65rem", color: "#3a2c14",
          letterSpacing: "0.12em", marginBottom: 40,
          textAlign: "center",
        }}>
          YOUR VINYL COLLECTION, BEAUTIFULLY TRACKED
        </p>

        {/* Connect button */}
        <a
          href={typeof window !== 'undefined' && !!(window as { webkit?: unknown }).webkit
            ? '/api/auth/discogs?redirect_uri=needledrop%3A%2F%2F'
            : '/api/auth/discogs'}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            background: GOLD, color: "#0c0a07",
            borderRadius: 999, padding: "14px 32px",
            fontFamily: "var(--font-mono)", fontSize: "0.72rem",
            fontWeight: 700, letterSpacing: "0.12em",
            textDecoration: "none", textTransform: "uppercase",
            boxShadow: "0 8px 32px -4px rgba(201,168,76,0.45)",
            transition: "opacity 0.2s",
          }}
        >
          <Disc3 size={14} strokeWidth={2} />
          Connect with Discogs
        </a>
      </div>
    );
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ background: "#0c0a07", minHeight: "100dvh" }}>
        {/* Header shell */}
        <div style={{ padding: "max(env(safe-area-inset-top), 14px) 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 12 }}>
            <h1 style={{
              fontFamily: "var(--font-playfair)", fontWeight: 900, fontSize: "0.9rem",
              letterSpacing: "0.28em", color: "#f5f0e8", textTransform: "uppercase",
            }}>
              NeedleDrop
            </h1>
            <div style={{ width: 42, height: 22, background: "rgba(255,255,255,0.04)", borderRadius: 999 }} />
          </div>
          {/* Search skeleton */}
          <div style={{ height: 38, background: "rgba(255,255,255,0.04)", borderRadius: 12, marginBottom: 10 }} />
          {/* Sort pills skeleton */}
          <div style={{ display: "flex", gap: 6, paddingBottom: 12 }}>
            {[80, 72, 68, 80, 72].map((w, i) => (
              <div key={i} className="skeleton-card" style={{ height: 26, width: w, borderRadius: 999 }}>
                <div style={{ height: "100%", borderRadius: 999 }} />
              </div>
            ))}
          </div>
        </div>
        {/* Grid skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4" style={{ gap: 10, padding: "4px 14px" }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton-card" style={{ animationDelay: `${i * 0.06}s` }}>
              <div style={{ aspectRatio: "1/1", borderRadius: 10 }} />
              <div style={{ height: 13, width: "80%", borderRadius: 6, marginTop: 8 }} />
              <div style={{ height: 10, width: "55%", borderRadius: 6, marginTop: 5 }} />
            </div>
          ))}
        </div>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 8 }}>

            {/* Logotype */}
            <h1 style={{
              fontFamily: "var(--font-playfair)", fontWeight: 900, fontSize: "0.9rem",
              letterSpacing: "0.28em", color: "#f5f0e8",
              textTransform: "uppercase", lineHeight: 1,
            }}>
              NeedleDrop
            </h1>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Count badge */}
              <div style={{
                background: "rgba(201,168,76,0.08)",
                border: "1px solid rgba(201,168,76,0.22)",
                borderRadius: 999, padding: "3px 10px",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", color: GOLD, letterSpacing: "0.05em", fontWeight: 700 }}>
                  {isFiltering ? displayed.length : records.length}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", color: "#7a6240" }}>
                  {isFiltering ? `/ ${records.length}` : "records"}
                </span>
              </div>

              {/* Sync */}
              <button
                onClick={async () => { await syncFromDiscogs(session?.username); await fetchPlays(); }}
                disabled={syncing}
                aria-label="Sync collection"
                style={{
                  padding: "6px", color: "#7a6240", background: "transparent",
                  border: "none", cursor: "pointer", transition: "color 0.2s",
                  opacity: syncing ? 0.4 : 1,
                }}
              >
                <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
              </button>

              {/* User avatar + disconnect */}
              {session && (
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  {session.avatar_url ? (
                    <img
                      src={session.avatar_url}
                      alt={session.username}
                      width={22} height={22}
                      style={{ borderRadius: "50%", border: "1px solid rgba(201,168,76,0.3)", flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: "rgba(201,168,76,0.12)",
                      border: "1px solid rgba(201,168,76,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: GOLD }}>
                        {session.username[0]?.toUpperCase()}
                      </span>
                    </div>
                  )}
                  <a
                    href="/api/auth/logout"
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: "0.52rem",
                      color: "#8a7050", letterSpacing: "0.08em",
                      textDecoration: "none", lineHeight: 1,
                    }}
                  >
                    OUT
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* ── Search ─────────────────────────────────────────────────── */}
          <div style={{ paddingBottom: 6 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12, padding: "8px 12px",
            }}>
              <Search size={13} style={{ color: "#7a6240", flexShrink: 0 }} />
              <input
                type="text"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Search artist, title, genre, year…"
                style={{
                  flex: 1, background: "transparent",
                  fontSize: "0.8rem", color: "#f5f0e8",
                  border: "none", outline: "none",
                  fontFamily: "var(--font-mono)",
                }}
              />
              {filter && (
                <button onClick={() => setFilter("")} style={{ color: "#7a6240", background: "transparent", border: "none", cursor: "pointer" }}>
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* ── Sort pills ─────────────────────────────────────────────── */}
          <div className="scrollbar-hide" style={{ display: "flex", gap: 6, paddingBottom: 6, overflowX: "auto" }}>
            {SORT_OPTIONS.map(opt => {
              const active = sort === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setSort(opt.key)}
                  style={{
                    flexShrink: 0, padding: "4px 13px", borderRadius: 999,
                    fontFamily: "var(--font-mono)", fontSize: "0.6rem",
                    letterSpacing: "0.08em", fontWeight: active ? 700 : 400,
                    background: active ? GOLD : "transparent",
                    color: active ? "#0c0a07" : "#9a8055",
                    border: active ? `1px solid ${GOLD}` : "1px solid rgba(255,255,255,0.12)",
                    cursor: "pointer", transition: "all 0.2s ease", whiteSpace: "nowrap",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* ── Genre filter pills ─────────────────────────────────────── */}
          {allGenres.length > 0 && (
            <div className="scrollbar-hide" style={{ display: "flex", gap: 6, paddingBottom: 8, overflowX: "auto" }}>
              {allGenres.map(genre => {
                const active = selectedGenres.has(genre);
                return (
                  <button
                    key={genre}
                    onClick={() => toggleGenre(genre)}
                    style={{
                      flexShrink: 0, padding: "3px 11px", borderRadius: 999,
                      fontFamily: "var(--font-mono)", fontSize: "0.56rem",
                      letterSpacing: "0.06em", fontWeight: active ? 700 : 400,
                      background: active ? "rgba(201,168,76,0.18)" : "transparent",
                      color: active ? GOLD : "#8a7050",
                      border: active ? `1px solid rgba(201,168,76,0.5)` : "1px solid rgba(255,255,255,0.1)",
                      cursor: "pointer", transition: "all 0.18s ease", whiteSpace: "nowrap",
                    }}
                  >
                    {genre}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Virtualized album grid ─────────────────────────────────────── */}
        <div
          ref={gridContainerRef}
          className="scrollbar-hide"
          style={{ flex: 1, overflow: "hidden" }}
        >
          <GridErrorBoundary>
          {displayed.length === 0 ? (
            /* Empty state */
            <div style={{
              padding: "80px 20px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
            }}>
              <Disc3 size={40} strokeWidth={1} style={{ color: "#2a1f10" }} />
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "#2a1f10", letterSpacing: "0.15em" }}>
                NO RECORDS FOUND
              </p>
              {isFiltering && (
                <button
                  onClick={clearFilters}
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: "0.6rem",
                    color: GOLD, background: "transparent",
                    border: "1px solid rgba(201,168,76,0.3)",
                    borderRadius: 999, padding: "5px 16px",
                    cursor: "pointer", letterSpacing: "0.1em",
                    marginTop: 4,
                  }}
                >
                  CLEAR FILTERS
                </button>
              )}
            </div>
          ) : containerDims.w > 0 && containerDims.h > 0 ? (
            <FixedSizeList
              height={containerDims.h - NP_BAR_HEIGHT}
              width={containerDims.w}
              itemCount={rows.length}
              itemSize={rowHeight}
              overscanCount={3}
              className="scrollbar-hide"
            >
              {({ index, style }: { index: number; style: React.CSSProperties }) => (
                <div style={{ ...style, display: "flex", gap: HGAP, padding: `4px ${PAD}px 0`, alignItems: "flex-start", justifyContent: isLandscape ? "center" : "flex-start" }}>
                  {rows[index].map((record, j) => {
                    const globalIndex = index * colCount + j;
                    return (
                      <AlbumCard
                        key={record.discogs_id}
                        record={record}
                        width={cardWidth}
                        artHeight={artHeight}
                        globalIndex={globalIndex}
                        isNowPlay={record.discogs_id === nowPlayingId}
                        playData={plays[record.discogs_id]}
                        isEditing={editingId === record.discogs_id}
                        imgError={imgErrors.has(record.discogs_id)}
                        editValue={editValue}
                        onOpen={openNowPlaying}
                        onOpenEditor={openEditor}
                        onSaveEdit={saveEdit}
                        onCancelEdit={cancelEdit}
                        onEditValueChange={setEditValue}
                        onImgError={addImgError}
                      />
                    );
                  })}
                  {/* Fill empty slots in last row */}
                  {Array.from({ length: colCount - rows[index].length }).map((_, k) => (
                    <div key={k} style={{ width: cardWidth, flexShrink: 0 }} />
                  ))}
                </div>
              )}
            </FixedSizeList>
          ) : null}
          </GridErrorBoundary>
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
        {/* ── Main content area ── */}
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>

          {/* ════════════ DETAIL SUB-PANEL (!isPlaying) ════════════ */}
          {/*
            Layout switches at 768px (md:):
              <768px  → flex-col: left stacks above right (portrait / iPhone)
              ≥768px  → flex-row: left | right side-by-side (landscape / iPad)
          */}
          <div
            className="flex flex-col md:flex-row"
            style={{
              position: "absolute", inset: 0,
              opacity:       isPlaying ? 0 : 1,
              pointerEvents: (mode !== "now-playing" || isPlaying) ? "none" : "auto",
              transition:    `opacity 0.32s ${EASE}`,
            }}
          >

            {/* ── LEFT COLUMN: art + metadata + CTA ── */}
            <div
              className="scrollbar-hide md:w-[44%] md:overflow-y-auto border-b border-white/5 md:border-b-0 md:border-r justify-center"
              style={{
                flexShrink: 0,
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: 14,
                padding: "max(env(safe-area-inset-top), 16px) 22px 22px",
              }}
            >
              {/* Album art */}
              <div
                style={{
                  width:  "clamp(140px, 38vw, 210px)",
                  height: "clamp(140px, 38vw, 210px)",
                  flexShrink: 0, borderRadius: 16, overflow: "hidden",
                  background: "rgba(255,255,255,0.03)",
                  boxShadow: "0 20px 60px -8px rgba(0,0,0,0.92), 0 0 0 1px rgba(255,255,255,0.05)",
                }}
              >
                {viewingRecord && viewingRecord.cover_url ? (
                  <img
                    src={`/api/image?url=${encodeURIComponent(viewingRecord.cover_url)}&size=600`}
                    alt={viewingRecord.title}
                    draggable={false}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Disc3 size={48} strokeWidth={1} style={{ color: "#2a1f10" }} />
                  </div>
                )}
              </div>

              {/* Title + artist */}
              <div style={{ textAlign: "center" }}>
                <p
                  className="line-clamp-2"
                  style={{
                    fontFamily: "var(--font-playfair)", fontWeight: 900,
                    fontSize:   "clamp(1.05rem, 3.5vw, 1.45rem)",
                    lineHeight: 1.2, color: "#f5f0e8",
                  }}
                >
                  {viewingRecord?.title ?? ""}
                </p>
                <p style={{
                  fontFamily: "var(--font-mono)", fontSize: "0.63rem",
                  color: "#9a8055", marginTop: 6, letterSpacing: "0.1em",
                }}>
                  {viewingRecord?.artist?.toUpperCase() ?? ""}
                </p>
              </div>

              {/* Play count + inline editor */}
              <div className="flex justify-center">
                {npIsEditing ? (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(201,168,76,0.25)",
                    borderRadius: 20, padding: "10px 16px",
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
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "#8a7050" }}>plays</span>
                    <button onClick={saveEdit} style={{ color: GOLD, fontWeight: 700, fontSize: "1.1rem", background: "transparent", border: "none", cursor: "pointer" }}>✓</button>
                    <button onClick={() => setEditingId(null)} style={{ color: "#8a7050", fontSize: "1.1rem", background: "transparent", border: "none", cursor: "pointer" }}>✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => viewingRecord && openEditor(viewingRecord.discogs_id, npPlayData?.play_count ?? 0)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 999, padding: "7px 18px",
                      cursor: "pointer", transition: "border-color 0.2s",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "1.1rem", fontWeight: 700, color: "#f5f0e8" }}>
                      {npPlayData?.play_count ?? 0}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.58rem", color: "#8a7050", letterSpacing: "0.08em" }}>
                      {(npPlayData?.play_count ?? 0) === 1 ? "PLAY" : "PLAYS"}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.48rem", color: "#7a6240", letterSpacing: "0.1em", marginLeft: 2 }}>
                      EDIT
                    </span>
                  </button>
                )}
              </div>

              {/* Year · Label + Genre pills (populated after albumDetails loads) */}
              {albumDetails && (
                <>
                  {(albumDetails.year || albumDetails.label) && (
                    <p style={{
                      fontFamily: "var(--font-mono)", fontSize: "0.58rem",
                      color: "#9a8055", letterSpacing: "0.12em", textTransform: "uppercase",
                      textAlign: "center",
                    }}>
                      {[albumDetails.year, albumDetails.label].filter(Boolean).join("  ·  ")}
                    </p>
                  )}
                  {(albumDetails.genres.length > 0 || albumDetails.styles.length > 0) && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                      {albumDetails.genres.map(g => (
                        <span key={g} style={{
                          padding: "4px 10px",
                          background: "rgba(201,168,76,0.07)",
                          border: "1px solid rgba(201,168,76,0.2)",
                          borderRadius: 999, fontFamily: "var(--font-mono)",
                          fontSize: "0.54rem", color: GOLD, letterSpacing: "0.06em",
                        }}>{g}</span>
                      ))}
                      {albumDetails.styles.map(s => (
                        <span key={s} style={{
                          padding: "4px 10px",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.07)",
                          borderRadius: 999, fontFamily: "var(--font-mono)",
                          fontSize: "0.54rem", color: "#8a7050", letterSpacing: "0.06em",
                        }}>{s}</span>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Mark as Playing — portrait only; hidden in landscape (button moves to right column) */}
              <button
                className="flex md:hidden items-center justify-center"
                onClick={() => viewingRecord && markPlaying(viewingRecord.discogs_id)}
                style={{
                  gap: 10, width: "100%",
                  borderRadius: 999, padding: "14px 24px",
                  fontFamily: "var(--font-mono)", fontSize: "0.68rem",
                  fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                  background: GOLD, color: "#0c0a07", border: "none", cursor: "pointer",
                  boxShadow: "0 8px 28px -4px rgba(201,168,76,0.45)",
                  transition: "transform 0.15s, box-shadow 0.2s",
                }}
              >
                <Play size={13} fill="#0c0a07" strokeWidth={0} />
                Mark as Playing
              </button>
            </div>

            {/* ── RIGHT COLUMN: Mark as Playing (landscape) + scrollable tracklist ── */}
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>

              {/* Mark as Playing — landscape only, pinned above tracklist */}
              <button
                className="hidden md:flex items-center justify-center"
                onClick={() => viewingRecord && markPlaying(viewingRecord.discogs_id)}
                style={{
                  flexShrink: 0,
                  gap: 10, margin: "18px 22px 0",
                  borderRadius: 999, padding: "14px 24px",
                  fontFamily: "var(--font-mono)", fontSize: "0.68rem",
                  fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                  background: GOLD, color: "#0c0a07", border: "none", cursor: "pointer",
                  boxShadow: "0 8px 28px -4px rgba(201,168,76,0.45)",
                  transition: "transform 0.15s, box-shadow 0.2s",
                }}
              >
                <Play size={13} fill="#0c0a07" strokeWidth={0} />
                Mark as Playing
              </button>

              {/* Scrollable tracklist */}
              <div
                className="scrollbar-hide"
                style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 22px 28px" }}
              >
              {albumLoading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[90, 80, 85, 75, 88, 70, 82, 78].map((w, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "0 4px" }}>
                      <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 999, width: 20, flexShrink: 0 }} />
                      <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 999, flex: 1, maxWidth: `${w}%` }} />
                      <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 999, width: 28, flexShrink: 0 }} />
                    </div>
                  ))}
                </div>
              ) : albumDetails && albumDetails.tracklist.length > 0 ? (
                <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
                  {albumDetails.tracklist.map((track, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex", alignItems: "baseline", gap: 10, padding: "9px 14px",
                        borderBottom: i < albumDetails.tracklist.length - 1
                          ? "1px solid rgba(255,255,255,0.04)" : "none",
                      }}
                    >
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: "#7a6240", width: 18, flexShrink: 0, textAlign: "right" }}>
                        {track.position}
                      </span>
                      <span style={{ flex: 1, fontSize: "0.75rem", color: "#c8bfa8", lineHeight: 1.3 }}>
                        {track.title}
                      </span>
                      {track.duration && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: "#7a6240", flexShrink: 0 }}>
                          {track.duration}
                        </span>
                      )}
                    </div>
                  ))}
                  {albumDetails.runtime && (
                    <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: "#7a6240", letterSpacing: "0.08em" }}>
                        {albumDetails.runtime} total
                      </span>
                    </div>
                  )}
                </div>
              ) : null}
              </div>{/* end scrollable tracklist */}
            </div>{/* end right column */}

          </div>

          {/* ════════════ PLAYING SUB-PANEL (isPlaying) ════════════ */}
          {/*
            Portrait (<768px):  flex-col — vinyl on top, info below, both centered
            Landscape (≥768px): flex-row — vinyl fills left half, info fills right half
          */}
          <div
            className="flex flex-col md:flex-row"
            style={{
              position: "absolute", inset: 0,
              opacity:       isPlaying ? 1 : 0,
              pointerEvents: (mode === "now-playing" && isPlaying) ? "auto" : "none",
              transition:    `opacity 0.4s ${EASE}`,
            }}
          >

            {/* ── Vinyl column (left in landscape, top in portrait) ── */}
            <div
              className="flex items-center justify-center md:w-1/2 md:h-full"
              style={{ flexShrink: 0, padding: "max(env(safe-area-inset-top), 20px) 20px 12px" }}
            >
              <div
                className="vinyl-disc"
                style={{
                  flexShrink: 0, borderRadius: "50%", overflow: "hidden",
                  border: "3px solid rgba(201,168,76,0.22)",
                  boxShadow: "0 0 0 12px rgba(201,168,76,0.05), 0 32px 80px -8px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.04)",
                  animation: "vinyl-spin 4s linear infinite",
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
            </div>

            {/* ── Info column (right in landscape, bottom in portrait) ── */}
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: "clamp(10px, 2vh, 20px)",
              padding: "12px clamp(20px, 4vw, 48px) 20px",
              minWidth: 0,
            }}>
              {/* NOW PLAYING label + waveform */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "nowrap" }}>
                <span
                  className="now-playing-dot"
                  style={{ width: 8, height: 8, borderRadius: "50%", background: GOLD, flexShrink: 0, display: "block" }}
                />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.25em", color: GOLD, whiteSpace: "nowrap" }}>
                  NOW PLAYING
                </span>
                <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 20, flexShrink: 0 }}>
                  {WAVE_DURATIONS.map((dur, i) => (
                    <div
                      key={i}
                      className="wave-bar"
                      style={{ animationDuration: `${dur}s`, animationDelay: `${i * 0.048}s` }}
                    />
                  ))}
                </div>
              </div>

              {/* Title */}
              <p
                className="line-clamp-2"
                style={{
                  fontFamily: "var(--font-playfair)", fontWeight: 900,
                  fontSize:   "clamp(1rem, 3.5vw, 1.6rem)",
                  lineHeight: 1.2, color: "#f5f0e8",
                  textAlign:  "center",
                }}
              >
                {viewingRecord?.title ?? ""}
              </p>

              {/* Artist */}
              <p style={{
                fontFamily: "var(--font-mono)", fontSize: "clamp(0.58rem, 1.5vw, 0.72rem)",
                color: "#9a8055", letterSpacing: "0.1em", textAlign: "center",
              }}>
                {viewingRecord?.artist?.toUpperCase() ?? ""}
              </p>

              {/* Play count pill */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 999, padding: "8px 20px",
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "1.2rem", fontWeight: 700, color: "#f5f0e8" }}>
                  {npPlayData?.play_count ?? 0}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "#8a7050", letterSpacing: "0.08em" }}>
                  {(npPlayData?.play_count ?? 0) === 1 ? "PLAY" : "PLAYS"}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* ── Bottom nav bar (frosted) ── */}
        <div
          style={{
            flexShrink: 0, display: "flex", alignItems: "center",
            justifyContent: "space-between", padding: "10px 18px",
            background: "rgba(10,8,5,0.9)", backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <button
            onClick={exitNowPlaying}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              color: "#a09070", background: "transparent",
              border: "none", cursor: "pointer",
              padding: "6px 12px 6px 0", transition: "color 0.2s",
            }}
          >
            <ArrowLeft size={16} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", letterSpacing: "0.08em" }}>
              BROWSE
            </span>
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {nowPlayingId && (
              <button
                onClick={stopPlaying}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  color: "#b08030", background: "transparent",
                  border: "1px solid rgba(201,168,76,0.3)",
                  borderRadius: 8, cursor: "pointer", padding: "5px 10px",
                  transition: "color 0.2s, border-color 0.2s",
                  fontFamily: "var(--font-mono)", fontSize: "0.6rem", letterSpacing: "0.08em",
                }}
              >
                <Square size={11} fill="currentColor" strokeWidth={0} />
                STOP
              </button>
            )}
            <button
              onClick={async () => { await syncFromDiscogs(session?.username); await fetchPlays(); }}
              disabled={syncing}
              aria-label="Sync collection"
              style={{
                padding: "6px", color: "#7a6240", background: "transparent",
                border: "none", cursor: "pointer", opacity: syncing ? 0.4 : 1,
                transition: "color 0.2s",
              }}
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        <div className="pb-safe" style={{ background: "rgba(10,8,5,0.9)", paddingTop: 0 }} />
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          PERSISTENT NOW PLAYING BAR
      ════════════════════════════════════════════════════════════════════ */}
      <div
        onClick={() => nowPlayingRec && openPlayingView(nowPlayingRec)}
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10,
          background: "rgba(10,8,5,0.95)",
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(201,168,76,0.1)",
          cursor: nowPlayingRec ? "pointer" : "default",
          opacity: mode === "browse" ? 1 : 0,
          pointerEvents: mode === "browse" ? "auto" : "none",
          transition: `opacity 0.32s ${EASE}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px" }}>

          {/* Thumbnail with pulse dot */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 10,
              overflow: "hidden", background: "rgba(255,255,255,0.03)",
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
                  background: GOLD, border: "1.5px solid #0c0a07", display: "block",
                }}
              />
            )}
          </div>

          {/* Title + artist */}
          <div
            style={{ flex: 1, minWidth: 0, cursor: nowPlayingRec ? "pointer" : "default" }}
            onClick={e => { e.stopPropagation(); if (nowPlayingRec) openNowPlaying(nowPlayingRec); }}
          >
            {nowPlayingRec ? (
              <>
                <p className="line-clamp-1" style={{
                  fontFamily: "var(--font-playfair)", fontSize: "0.875rem",
                  fontWeight: 700, color: "#f5f0e8", lineHeight: 1.2,
                }}>
                  {nowPlayingRec.title}
                </p>
                <p className="line-clamp-1" style={{
                  fontFamily: "var(--font-mono)", fontSize: "0.58rem",
                  color: "#9a8055", marginTop: 3, letterSpacing: "0.07em",
                }}>
                  {nowPlayingRec.artist.toUpperCase()}
                </p>
              </>
            ) : (
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "#6a5530", letterSpacing: "0.12em" }}>
                TAP A RECORD TO BEGIN
              </p>
            )}
          </div>

          {/* Play count */}
          {nowPlayData && (
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "1.3rem", fontWeight: 700, color: GOLD, lineHeight: 1 }}>
                {nowPlayData.play_count}×
              </p>
            </div>
          )}

          {/* Stop button */}
          {nowPlayingId && (
            <button
              onClick={e => { e.stopPropagation(); stopPlaying(); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                color: "#7a5a2a", background: "transparent",
                border: "1px solid rgba(201,168,76,0.18)",
                borderRadius: 8, cursor: "pointer", padding: "5px 10px",
                fontFamily: "var(--font-mono)", fontSize: "0.6rem",
                letterSpacing: "0.08em", flexShrink: 0,
              }}
            >
              <Square size={11} fill="currentColor" strokeWidth={0} />
              STOP
            </button>
          )}
        </div>
        <div className="pb-safe" style={{ paddingTop: 0 }} />
      </div>

    </main>
  );
}
