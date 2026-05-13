'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNowPlaying } from '@/context/NowPlayingContext';

const WAVE_DURATIONS = [0.7, 0.5, 0.9, 0.6, 0.8, 0.55, 0.75, 0.95, 0.6, 0.85, 0.7, 0.5, 0.9, 0.65, 0.8, 0.55];

export default function NowPlayingPage() {
  const router = useRouter();
  const {
    nowPlaying, isPlaying,
    playRecord, stopPlaying, playNext,
    getPlayCount, updatePlayCount,
    queue,
  } = useNowPlaying();

  const [imgErr,         setImgErr]         = useState(false);
  const [isEditingCount, setIsEditingCount] = useState(false);
  const [editCount,      setEditCount]      = useState('');

  const vinylRef    = useRef<HTMLDivElement>(null);
  const rotRef      = useRef(0);
  const rafRef      = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  // Redirect if nothing is playing
  useEffect(() => {
    if (!nowPlaying) {
      router.replace('/');
    }
  }, [nowPlaying, router]);

  // RAF-driven vinyl spin (matches original web app pattern)
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = null;
      return;
    }

    const tick = (ts: number) => {
      if (lastTimeRef.current !== null) {
        const delta = ts - lastTimeRef.current;
        rotRef.current = (rotRef.current + (delta / 6000) * 360) % 360;
        if (vinylRef.current) {
          vinylRef.current.style.transform = `rotate(${rotRef.current}deg)`;
        }
      }
      lastTimeRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  if (!nowPlaying) return null;

  const playCount = getPlayCount(nowPlaying.id);

  const handleStop = () => {
    stopPlaying();
    router.back();
  };

  const handleStartEdit = () => {
    setEditCount(String(playCount));
    setIsEditingCount(true);
  };

  const handleSaveEdit = () => {
    const n = parseInt(editCount, 10);
    if (!isNaN(n) && n >= 0) updatePlayCount(nowPlaying.id, n);
    setIsEditingCount(false);
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
      paddingBottom: 80,
    }}>
      {/* Close button */}
      <button
        onClick={() => router.back()}
        style={{
          position: 'absolute', top: 16, right: 16, zIndex: 10,
          width: 40, height: 40, borderRadius: 20,
          background: 'rgba(12,10,7,0.7)', backdropFilter: 'blur(8px)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono, monospace)', fontSize: 16, color: 'var(--fg)',
        }}
        aria-label="Close"
      >
        ✕
      </button>

      {/* Crossfade detail / playing panels */}
      <style>{`
        .np-detail  { opacity: ${isPlaying ? 0 : 1}; pointer-events: ${isPlaying ? 'none' : 'auto'}; transition: opacity 0.3s; }
        .np-playing { opacity: ${isPlaying ? 1 : 0}; pointer-events: ${isPlaying ? 'auto' : 'none'}; transition: opacity 0.3s; }
      `}</style>

      {/* ── Detail view ── */}
      <div
        className="np-detail"
        style={{
          position: 'absolute', inset: 0,
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '72px 24px 100px',
        }}
      >
        <div style={{ maxWidth: 480, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Art */}
          <div style={{
            width: 'clamp(160px, 52vw, 320px)', height: 'clamp(160px, 52vw, 320px)',
            borderRadius: 10, overflow: 'hidden', marginBottom: 24,
          }}>
            {imgErr || !nowPlaying.coverImage
              ? <VinylPlaceholderSq />
              : <img
                  src={nowPlaying.coverImage}
                  alt={nowPlaying.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  onError={() => setImgErr(true)}
                />
            }
          </div>

          <h1 style={{ fontFamily: 'var(--font-playfair, serif)', fontSize: 24, fontWeight: 700, textAlign: 'center', lineHeight: 1.3, marginBottom: 4 }}>
            {nowPlaying.title}
          </h1>
          <p style={{ fontFamily: 'var(--font-playfair, serif)', fontSize: 16, fontStyle: 'italic', color: 'var(--gold)', textAlign: 'center', marginBottom: 20 }}>
            {nowPlaying.artist}
          </p>

          {/* Metadata */}
          {(nowPlaying.year || nowPlaying.label) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 }}>
              {nowPlaying.year && <Chip>{nowPlaying.year}</Chip>}
              {nowPlaying.label && <Chip>{nowPlaying.label}</Chip>}
            </div>
          )}

          {/* Play count (editable) */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '2px', marginBottom: 8 }}>
              PLAY COUNT
            </div>
            {isEditingCount ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <input
                  type="number"
                  value={editCount}
                  onChange={e => setEditCount(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setIsEditingCount(false); }}
                  autoFocus
                  style={{
                    fontFamily: 'var(--font-mono, monospace)', fontSize: 28,
                    color: 'var(--gold)', background: 'var(--surface)',
                    border: '1px solid var(--gold-dim)', borderRadius: 6,
                    padding: '4px 12px', width: 100, textAlign: 'center',
                  }}
                />
                <button onClick={handleSaveEdit} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--bg)', background: 'var(--gold)', borderRadius: 6, padding: '6px 14px', fontWeight: 700 }}>
                  Save
                </button>
                <button onClick={() => setIsEditingCount(false)} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--text-dim)' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={handleStartEdit} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 32, color: 'var(--gold)', letterSpacing: '1px' }}>
                {playCount}<span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6 }}>tap to edit</span>
              </button>
            )}
          </div>

          {/* Mark as playing */}
          <button
            onClick={() => playRecord(nowPlaying)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', maxWidth: 360, padding: '14px',
              fontFamily: 'var(--font-playfair, serif)', fontSize: 16, fontWeight: 700,
              background: 'var(--gold)', color: 'var(--bg)',
              borderRadius: 8, marginBottom: 24,
            }}
          >
            ▶ Mark as Playing
          </button>
        </div>
      </div>

      {/* ── Playing view ── */}
      <div
        className="np-playing"
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '24px 24px 100px',
          gap: 0,
        }}
      >
        {/* Spinning vinyl */}
        <div
          ref={vinylRef}
          style={{
            width: 'clamp(200px, min(46vh, 58vw), 340px)',
            height: 'clamp(200px, min(46vh, 58vw), 340px)',
            borderRadius: '50%',
            overflow: 'hidden',
            border: '3px solid rgba(201,168,76,0.22)',
            marginBottom: 32,
            flexShrink: 0,
          }}
        >
          {imgErr || !nowPlaying.coverImage
            ? <VinylPlaceholderSq />
            : <img
                src={nowPlaying.coverImage}
                alt={nowPlaying.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={() => setImgErr(true)}
              />
          }
        </div>

        {/* NOW PLAYING label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{
            width: 8, height: 8, borderRadius: 4,
            background: 'var(--gold)',
            animation: 'pulse-dot 1.4s ease-in-out infinite',
          }} />
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--gold-dim)', letterSpacing: '3px' }}>
            NOW PLAYING
          </span>
        </div>

        {/* Waveform */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 24, marginBottom: 20 }}>
          {WAVE_DURATIONS.map((dur, i) => (
            <div
              key={i}
              className="wave-bar"
              style={{ height: '100%', animationDuration: `${dur}s`, animationDelay: `${i * 0.04}s` }}
            />
          ))}
        </div>

        {/* Title & artist */}
        <h2 style={{
          fontFamily: 'var(--font-playfair, serif)', fontSize: 22, fontWeight: 700,
          textAlign: 'center', lineHeight: 1.3, marginBottom: 4,
          maxWidth: 340,
        }}>
          {nowPlaying.title}
        </h2>
        <p style={{
          fontFamily: 'var(--font-playfair, serif)', fontSize: 15, fontStyle: 'italic',
          color: 'var(--gold)', textAlign: 'center', marginBottom: 16,
        }}>
          {nowPlaying.artist}
        </p>

        {/* Play count pill */}
        <div style={{
          fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
          color: 'var(--gold)', letterSpacing: '0.5px',
          border: '1px solid var(--gold-dim)',
          background: 'rgba(201,168,76,0.08)',
          borderRadius: 999, padding: '4px 14px',
          marginBottom: 32,
        }}>
          ▶ {playCount}×
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleStop}
            style={{
              fontFamily: 'var(--font-playfair, serif)', fontSize: 15, fontWeight: 700,
              color: 'var(--fg)',
              border: '1px solid var(--border)', borderRadius: 8,
              background: 'var(--surface)',
              padding: '12px 28px',
            }}
          >
            Stop
          </button>
          {queue.length > 0 && (
            <button
              onClick={playNext}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: 'var(--font-playfair, serif)', fontSize: 15, fontWeight: 700,
                color: 'var(--bg)',
                background: 'var(--gold)',
                borderRadius: 8, padding: '12px 28px',
              }}
            >
              ▶ Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function VinylPlaceholderSq() {
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

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
      color: 'var(--text-muted)',
      border: '1px solid var(--border)', background: 'var(--surface)',
      borderRadius: 6, padding: '3px 8px', letterSpacing: '0.5px',
    }}>
      {children}
    </span>
  );
}
