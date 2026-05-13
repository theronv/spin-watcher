'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api, AlbumRecord, SessionUser } from '@/lib/api';
import { useNowPlaying } from '@/context/NowPlayingContext';

const SORT_OPTIONS = [
  { value: 'added_desc', label: 'Recently Added' },
  { value: 'artist_asc', label: 'Artist A–Z' },
  { value: 'year_desc',  label: 'Year ↓' },
  { value: 'year_asc',   label: 'Year ↑' },
  { value: 'plays_desc', label: 'Most Played' },
];

// ── Vinyl placeholder ────────────────────────────────────────────────────────

function VinylPlaceholder() {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--surface-high)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="40%" height="40%" viewBox="0 0 60 60" fill="none">
        <circle cx="30" cy="30" r="29" stroke="var(--border-light)" strokeWidth="1.5" />
        <circle cx="30" cy="30" r="18" stroke="var(--border-light)" strokeWidth="1" />
        <circle cx="30" cy="30" r="8"  stroke="var(--border-light)" strokeWidth="1" />
        <circle cx="30" cy="30" r="3"  fill="var(--gold-dim)" />
      </svg>
    </div>
  );
}

// ── Album card ───────────────────────────────────────────────────────────────

function AlbumCard({ record, index, playCount }: {
  record: AlbumRecord;
  index:  number;
  playCount: number;
}) {
  const router   = useRouter();
  const [imgErr, setImgErr] = useState(false);
  const [hover,  setHover]  = useState(false);

  const delay = Math.min(index * 0.015, 0.25);

  return (
    <div
      className="card-enter"
      style={{
        animationDelay:    `${delay}s`,
        background:        'var(--surface)',
        borderRadius:      10,
        overflow:          'hidden',
        border:            `1px solid ${hover ? 'rgba(201,168,76,0.25)' : 'var(--border)'}`,
        cursor:            'pointer',
        transition:        'border-color 0.15s, box-shadow 0.15s',
        boxShadow:         hover ? '0 0 0 1px var(--gold-glow)' : 'none',
      }}
      onClick={() => router.push(`/record/${record.id}`)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Square art */}
      <div style={{ position: 'relative', aspectRatio: '1', background: 'var(--surface-high)' }}>
        {imgErr || !record.coverImage
          ? <VinylPlaceholder />
          : <img
              src={record.coverImage}
              alt={record.title}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                       transform: hover ? 'scale(1.04)' : 'scale(1)', transition: 'transform 0.2s' }}
              onError={() => setImgErr(true)}
            />
        }

        {/* Play count badge */}
        {playCount > 0 && (
          <div style={{
            position:   'absolute', bottom: 6, right: 6,
            background: 'rgba(12,10,7,0.85)',
            border:     '1px solid var(--gold-dim)',
            borderRadius: 6, padding: '2px 6px',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 10, color: 'var(--gold)',
            letterSpacing: '0.5px',
          }}>
            {playCount}
          </div>
        )}

        {/* Hover play icon */}
        {hover && (
          <div style={{
            position: 'absolute', bottom: 6, left: 6,
            width: 28, height: 28, borderRadius: 14,
            background: 'rgba(201,168,76,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, color: 'var(--bg)',
          }}>
            ▶
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '8px 10px 10px' }}>
        <div style={{
          fontFamily: 'var(--font-playfair, serif)',
          fontSize: 13, fontWeight: 700, color: 'var(--fg)',
          lineHeight: 1.3, marginBottom: 2,
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {record.title}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 11, color: 'var(--text-muted)',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          letterSpacing: '0.3px',
        }}>
          {record.artist}
        </div>
        {record.year ? (
          <div style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 10, color: 'var(--text-dim)',
            marginTop: 2,
          }}>
            {record.year}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Skeleton grid ────────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 10,
      padding: '0 14px',
    }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} style={{ borderRadius: 10, overflow: 'hidden' }}>
          <div className="skeleton" style={{ aspectRatio: '1' }} />
          <div style={{ padding: '8px 10px 10px', background: 'var(--surface)' }}>
            <div className="skeleton" style={{ height: 14, width: '70%', marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 11, width: '50%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      // Fetch first so the server sets the discogs_request_secret cookie on a
      // 200 response (Chrome drops Set-Cookie from cross-origin redirects).
      const res  = await fetch('/api/auth/discogs');
      const data = await res.json() as { authUrl?: string; error?: string };
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      {/* Vinyl graphic */}
      <svg width={80} height={80} viewBox="0 0 60 60" fill="none" style={{ marginBottom: 28 }}>
        <circle cx="30" cy="30" r="29" stroke="var(--gold-dim)" strokeWidth="1.5" />
        <circle cx="30" cy="30" r="18" stroke="var(--gold-dim)" strokeWidth="1" />
        <circle cx="30" cy="30" r="8"  stroke="var(--gold-dim)" strokeWidth="1" />
        <circle cx="30" cy="30" r="3"  fill="var(--gold)" />
      </svg>

      <h1 style={{
        fontFamily: 'var(--font-playfair, serif)',
        fontSize: 36, fontWeight: 900,
        letterSpacing: '0.5px', marginBottom: 8,
      }}>
        <span style={{ color: 'var(--fg)' }}>Needle</span>
        <span style={{ color: 'var(--gold)' }}>Drop</span>
      </h1>

      <p style={{
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 11, color: 'var(--text-muted)',
        letterSpacing: '1px', textTransform: 'uppercase',
        marginBottom: 40,
      }}>
        Your vinyl collection, tracked.
      </p>

      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          fontFamily:  'var(--font-playfair, serif)',
          fontSize:    16, fontWeight: 700,
          background:  'var(--gold)',
          color:       'var(--bg)',
          border:      'none',
          borderRadius: 8,
          padding:     '14px 36px',
          cursor:      loading ? 'default' : 'pointer',
          opacity:     loading ? 0.7 : 1,
          transition:  'opacity 0.15s',
          letterSpacing: '0.3px',
        }}
      >
        {loading ? 'Redirecting…' : 'Login with Discogs'}
      </button>
    </div>
  );
}

// ── Main collection page ─────────────────────────────────────────────────────

export default function CollectionPage() {
  const router                                 = useRouter();
  const { playCounts, fetchPlayCounts, queue } = useNowPlaying();

  const [authChecked,   setAuthChecked]   = useState(false);
  const [user,          setUser]          = useState<SessionUser | null>(null);
  const [allRecords,    setAllRecords]    = useState<AlbumRecord[]>([]);
  const [genres,        setGenres]        = useState<string[]>([]);
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedSort,  setSelectedSort]  = useState('added_desc');
  const [search,        setSearch]        = useState('');
  const [isLoading,     setIsLoading]     = useState(true);
  const [isSyncing,     setIsSyncing]     = useState(false);
  const [menuOpen,      setMenuOpen]      = useState(false);
  const [showSort,      setShowSort]      = useState(false);
  const [error,         setError]         = useState('');

  // ── Auth check ──────────────────────────────────────────────────────────────
  useEffect(() => {
    api.getSession().then(({ user: u }) => {
      setUser(u);
      setAuthChecked(true);
    }).catch(() => setAuthChecked(true));
  }, []);

  // ── Load collection ─────────────────────────────────────────────────────────
  const loadRecords = useCallback(async (sync = false) => {
    if (!user) return;
    try {
      let data = await api.getRecords({ sort: selectedSort });

      if (data.records.length === 0 || sync) {
        setIsSyncing(true);
        try {
          await api.sync();
          data = await api.getRecords({ sort: selectedSort });
        } catch {}
        finally { setIsSyncing(false); }
      }

      setAllRecords(data.records);
      if (data.genres.length) setGenres(data.genres);
      setError('');
    } catch {
      setError('Failed to load collection.');
    } finally {
      setIsLoading(false);
    }
  }, [user, selectedSort]);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    api.init().catch(() => {});
    loadRecords();
    fetchPlayCounts();
  }, [user, loadRecords, fetchPlayCounts]);

  // ── Filtered display records ────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let rs = allRecords;
    if (selectedGenre) rs = rs.filter(r => r.genres.includes(selectedGenre));
    if (search) {
      const q = search.toLowerCase();
      rs = rs.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.artist.toLowerCase().includes(q) ||
        (r.label?.toLowerCase().includes(q) ?? false)
      );
    }
    return rs;
  }, [allRecords, selectedGenre, search]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!authChecked) return null;
  if (!user) return <LoginScreen />;

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        padding: '16px 14px 12px',
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(12,10,7,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 10, color: 'var(--text-dim)',
            letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 2,
          }}>
            @{user.username}
          </div>
          <h1 style={{
            fontFamily: 'var(--font-playfair, serif)',
            fontSize: 28, fontWeight: 700,
            letterSpacing: '0.3px',
          }}>
            Collection
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {/* Queue icon */}
          <button
            onClick={() => router.push('/queue')}
            style={{
              position: 'relative', width: 36, height: 36, borderRadius: 18,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, color: 'var(--text-muted)',
            }}
            title="Queue"
          >
            ≡
            {queue.length > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                background: 'var(--gold)', color: 'var(--bg)',
                borderRadius: 10, minWidth: 16, height: 16,
                fontSize: 9, fontFamily: 'var(--font-mono, monospace)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px',
              }}>
                {queue.length}
              </span>
            )}
          </button>

          {/* Avatar / menu */}
          <button
            onClick={() => setMenuOpen(true)}
            style={{
              width: 36, height: 36, borderRadius: 18,
              background: 'var(--gold-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-playfair, serif)',
              fontSize: 15, fontWeight: 700, color: 'var(--bg)',
            }}
          >
            {user.username?.[0]?.toUpperCase() ?? '?'}
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 14px 0' }}>
        <input
          type="search"
          placeholder="Search records…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12, color: 'var(--fg)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 12px',
            outline: 'none',
            letterSpacing: '0.3px',
          }}
        />
      </div>

      {/* Genre filter pills */}
      {genres.length > 0 && (
        <div
          className="scrollbar-hide"
          style={{
            display: 'flex', gap: 6, overflowX: 'auto',
            padding: '10px 14px',
          }}
        >
          <GenrePill label="All" selected={!selectedGenre} onPress={() => setSelectedGenre('')} />
          {genres.map(g => (
            <GenrePill
              key={g} label={g}
              selected={selectedGenre === g}
              onPress={() => setSelectedGenre(prev => prev === g ? '' : g)}
            />
          ))}
        </div>
      )}

      {/* Sort bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 14px 8px',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.5px',
        }}>
          {displayed.length > 0 ? `${displayed.length} records` : ''}
        </span>

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowSort(v => !v)}
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10, color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              borderRadius: 6, padding: '5px 10px',
              background: 'var(--surface)',
              letterSpacing: '0.3px',
            }}
          >
            ↕ {SORT_OPTIONS.find(o => o.value === selectedSort)?.label}
          </button>

          {showSort && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 4,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8, overflow: 'hidden',
              zIndex: 20, minWidth: 160,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setSelectedSort(opt.value); setShowSort(false); }}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    width: '100%', padding: '10px 14px',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 12, textAlign: 'left',
                    color: selectedSort === opt.value ? 'var(--gold)' : 'var(--text-muted)',
                    background: selectedSort === opt.value ? 'var(--surface-high)' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                    letterSpacing: '0.3px',
                  }}
                >
                  {opt.label}
                  {selectedSort === opt.value && <span>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div>
          {isSyncing && (
            <p style={{
              textAlign: 'center', padding: '0 14px 12px',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.5px',
            }}>
              Syncing from Discogs…
            </p>
          )}
          <SkeletonGrid />
        </div>
      ) : error ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: 40, gap: 16,
        }}>
          <p style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            {error}
          </p>
          <button
            onClick={() => loadRecords()}
            style={{
              fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
              color: 'var(--gold)', border: '1px solid var(--gold)',
              borderRadius: 6, padding: '8px 20px', letterSpacing: '1px',
              background: 'transparent',
            }}
          >
            RETRY
          </button>
        </div>
      ) : (
        <div className="collection-grid" style={{ padding: '0 14px' }}>
            {displayed.map((record, i) => (
            <AlbumCard
              key={record.id}
              record={record}
              index={i}
              playCount={playCounts[record.id] ?? record.playCount}
            />
          ))}
          {displayed.length === 0 && (
            <div style={{
              gridColumn: '1 / -1', padding: '60px 0', textAlign: 'center',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 12, color: 'var(--text-dim)', letterSpacing: '1px',
            }}>
              NO RECORDS FOUND
            </div>
          )}
        </div>
      )}

      {/* Profile / menu sheet */}
      {menuOpen && (
        <MenuSheet
          user={user}
          onClose={() => setMenuOpen(false)}
          onSync={() => { setMenuOpen(false); setIsLoading(true); loadRecords(true); }}
          onLogout={() => { window.location.href = '/api/auth/logout'; }}
        />
      )}
    </div>
  );
}

// ── Genre pill ───────────────────────────────────────────────────────────────

function GenrePill({ label, selected, onPress }: {
  label:    string;
  selected: boolean;
  onPress:  () => void;
}) {
  return (
    <button
      onClick={onPress}
      style={{
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 10, letterSpacing: '0.5px',
        whiteSpace: 'nowrap', flexShrink: 0,
        padding: '5px 12px', borderRadius: 999,
        border: `1px solid ${selected ? 'var(--gold)' : 'var(--border-light, var(--border))'}`,
        background: selected ? 'rgba(201,168,76,0.12)' : 'var(--surface)',
        color: selected ? 'var(--gold)' : 'var(--text-muted)',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

// ── Menu / profile sheet ─────────────────────────────────────────────────────

function MenuSheet({ user, onClose, onSync, onLogout }: {
  user:     SessionUser;
  onClose:  () => void;
  onSync:   () => void;
  onLogout: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        }}
      />
      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51,
        background: 'var(--surface)',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        borderTop: '1px solid var(--border-light, var(--border))',
        padding: '20px 20px 40px',
        animation: 'slide-up 0.3s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'var(--border-light, var(--border))',
          margin: '0 auto 20px',
        }} />

        {/* User info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 24,
            background: 'var(--gold-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-playfair, serif)', fontSize: 20, fontWeight: 700,
            color: 'var(--bg)',
          }}>
            {user.username?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 2 }}>
              Signed in as
            </div>
            <div style={{ fontFamily: 'var(--font-playfair, serif)', fontSize: 16, fontWeight: 700 }}>
              @{user.username}
            </div>
          </div>
        </div>

        {/* Actions */}
        <button
          onClick={onSync}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', padding: '14px',
            fontFamily: 'var(--font-playfair, serif)', fontSize: 15, fontWeight: 700,
            background: 'var(--gold)', color: 'var(--bg)',
            borderRadius: 8, marginBottom: 10,
          }}
        >
          Sync Collection
        </button>

        <button
          onClick={onLogout}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', padding: '12px',
            fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
            color: 'var(--text-dim)',
            border: '1px solid var(--border)', borderRadius: 8,
            background: 'transparent', letterSpacing: '0.5px',
          }}
        >
          Sign Out
        </button>
      </div>
    </>
  );
}
