'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, AlbumRecord } from '@/lib/api';
import { useNowPlaying } from '@/context/NowPlayingContext';

function VinylPlaceholder() {
  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="40%" height="40%" viewBox="0 0 60 60" fill="none">
        <circle cx="30" cy="30" r="29" stroke="var(--border-light)" strokeWidth="1.5" />
        <circle cx="30" cy="30" r="18" stroke="var(--border-light)" strokeWidth="1" />
        <circle cx="30" cy="30" r="3"  fill="var(--gold-dim)" />
      </svg>
    </div>
  );
}

export default function RecordDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const router    = useRouter();
  const { playRecord, addToQueue, getPlayCount } = useNowPlaying();

  const [record,    setRecord]    = useState<AlbumRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState('');
  const [imgErr,    setImgErr]    = useState(false);
  const [addedToQueue, setAddedToQueue] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getRecord(id)
      .then(setRecord)
      .catch(() => setError('Failed to load record.'))
      .finally(() => setIsLoading(false));
  }, [id]);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--gold)', borderTopColor: 'transparent', borderRadius: 16, animation: 'vinyl-spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (error || !record) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <p style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
          {error || 'Record not found.'}
        </p>
        <button onClick={() => router.back()} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--gold)', letterSpacing: '0.5px' }}>
          ← Go back
        </button>
      </div>
    );
  }

  const playCount = getPlayCount(record.id);

  const handlePlay = () => {
    playRecord(record);
    router.push('/now-playing');
  };

  const handleAddToQueue = () => {
    addToQueue(record);
    setAddedToQueue(true);
    setTimeout(() => setAddedToQueue(false), 1500);
  };

  const contentPanel = (
    <div style={{ padding: '20px 20px 60px' }}>
      <h1 style={{
        fontFamily: 'var(--font-playfair, serif)',
        fontSize: 26, fontWeight: 700, lineHeight: 1.3,
        letterSpacing: '0.3px', marginBottom: 4,
      }}>
        {record.title}
      </h1>
      <p style={{
        fontFamily: 'var(--font-playfair, serif)',
        fontSize: 18, fontStyle: 'italic',
        color: 'var(--gold)', marginBottom: 20,
      }}>
        {record.artist}
      </p>

      {/* Play button */}
      <button
        onClick={handlePlay}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '14px',
          fontFamily: 'var(--font-playfair, serif)', fontSize: 16, fontWeight: 700,
          background: 'var(--gold)', color: 'var(--bg)',
          borderRadius: 8, marginBottom: 10,
          letterSpacing: '0.3px',
        }}
      >
        ▶ Play
      </button>

      {/* Add to queue */}
      <button
        onClick={handleAddToQueue}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', padding: '12px',
          fontFamily: 'var(--font-mono, monospace)', fontSize: 13,
          color: addedToQueue ? 'var(--fg)' : 'var(--gold)',
          border: `1px solid ${addedToQueue ? 'var(--border)' : 'var(--gold-dim)'}`,
          borderRadius: 8, marginBottom: 20,
          background: 'transparent', letterSpacing: '0.5px',
          transition: 'color 0.2s, border-color 0.2s',
        }}
      >
        {addedToQueue ? 'Added to queue!' : '+ Add to Queue'}
      </button>

      {/* Metadata chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        {record.year && <MetaChip>{record.year}</MetaChip>}
        {record.label && <MetaChip>{record.label}</MetaChip>}
        {playCount > 0 && <MetaChip gold>▶ {playCount}×</MetaChip>}
      </div>

      {/* Genres */}
      {record.genres.length > 0 && (
        <Section label="Genres">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {record.genres.map(g => (
              <span
                key={g}
                style={{
                  fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
                  color: 'var(--gold)', letterSpacing: '0.5px',
                  border: '1px solid var(--gold-dim)',
                  borderRadius: 999, padding: '4px 12px',
                  background: 'rgba(201,168,76,0.06)',
                }}
              >
                {g}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Tracklist */}
      {record.tracklist && record.tracklist.length > 0 && (
        <Section label="Tracklist">
          {record.tracklist.map((track, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--text-dim)', width: 28, flexShrink: 0, letterSpacing: '0.5px' }}>
                {track.position}
              </span>
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--text-muted)', flex: 1, letterSpacing: '0.2px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {track.title}
              </span>
              {track.duration && (
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, letterSpacing: '0.5px' }}>
                  {track.duration}
                </span>
              )}
            </div>
          ))}
        </Section>
      )}
    </div>
  );

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 80 }}>
      {/* Back button */}
      <button
        onClick={() => router.back()}
        style={{
          position: 'fixed', top: 16, left: 16, zIndex: 20,
          width: 40, height: 40, borderRadius: 20,
          background: 'rgba(12,10,7,0.7)', backdropFilter: 'blur(8px)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-playfair, serif)', fontSize: 26,
          color: 'var(--fg)', lineHeight: 1,
        }}
        aria-label="Back"
      >
        ‹
      </button>

      <div className="record-layout" style={{ display: 'block' }}>
        {/* Art panel */}
        <div
          className="record-art-panel"
          style={{ background: 'var(--surface)', overflow: 'hidden' }}
        >
          <div style={{ aspectRatio: '1', width: '100%', position: 'relative' }}>
            {imgErr || !record.coverImage
              ? <VinylPlaceholder />
              : <img
                  src={record.coverImage}
                  alt={record.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  onError={() => setImgErr(true)}
                />
            }
          </div>
        </div>

        {/* Content panel */}
        <div className="record-content-panel" style={{ paddingTop: 64 }}>
          {contentPanel}
        </div>
      </div>
    </div>
  );
}

function MetaChip({ children, gold }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
      color: gold ? 'var(--gold)' : 'var(--text-muted)',
      border: `1px solid ${gold ? 'var(--gold-dim)' : 'var(--border)'}`,
      background: gold ? 'rgba(201,168,76,0.08)' : 'var(--surface)',
      borderRadius: 6, padding: '3px 8px',
      letterSpacing: '0.5px', maxWidth: 160,
      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
    }}>
      {children}
    </span>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 10, color: 'var(--text-dim)',
        letterSpacing: '2px', textTransform: 'uppercase',
        marginBottom: 10,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}
