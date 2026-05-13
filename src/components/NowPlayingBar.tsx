'use client';

import { useRouter } from 'next/navigation';
import { useNowPlaying } from '@/context/NowPlayingContext';
import { useRef, useEffect, useState } from 'react';
import { AlbumRecord } from '@/lib/api';

const WAVE_DURATIONS = [0.7, 0.5, 0.9, 0.6, 0.8, 0.55, 0.75, 0.95, 0.6, 0.85];

export default function NowPlayingBar() {
  const router = useRouter();
  const { nowPlaying, queue, playNext } = useNowPlaying();
  const [visible, setVisible] = useState(false);
  const lastRecord = useRef<AlbumRecord | null>(null);
  if (nowPlaying) lastRecord.current = nowPlaying;

  useEffect(() => {
    if (nowPlaying) setVisible(true);
  }, [nowPlaying]);

  if (!visible || !lastRecord.current) return null;

  const display    = lastRecord.current;
  const hasQueue   = queue.length > 0;
  const disappears = !nowPlaying;

  return (
    <div
      style={{
        position:     'fixed',
        bottom:       0,
        left:         0,
        right:        0,
        height:       60,
        zIndex:       100,
        transform:    disappears ? 'translateY(100%)' : 'translateY(0)',
        transition:   'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        borderTop:    '1px solid var(--gold-dim)',
        background:   'rgba(18,14,9,0.96)',
        backdropFilter: 'blur(16px)',
        display:      'flex',
        alignItems:   'center',
        gap:          10,
        paddingInline: 12,
        cursor:       'pointer',
      }}
      onClick={() => router.push('/now-playing')}
    >
      {/* Thumbnail */}
      {display.coverImage && (
        <img
          src={display.coverImage}
          alt=""
          style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-playfair, serif)',
          fontSize: 13, fontWeight: 700,
          color: 'var(--fg)',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {display.title}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 11, color: 'var(--text-muted)',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          letterSpacing: '0.3px',
        }}>
          {display.artist}
        </div>
      </div>

      {/* Waveform */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 24, flexShrink: 0 }}>
        {WAVE_DURATIONS.map((dur, i) => (
          <div
            key={i}
            className="wave-bar"
            style={{
              height: '100%',
              animationDuration: `${dur}s`,
              animationDelay: `${i * 0.05}s`,
            }}
          />
        ))}
      </div>

      {/* Label + Next */}
      <div
        style={{
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 8, letterSpacing: 2,
          color: 'var(--gold-dim)',
          flexShrink: 0,
        }}
      >
        {hasQueue ? `${queue.length} UP NEXT` : 'NOW PLAYING'}
      </div>

      {hasQueue && (
        <button
          onClick={e => { e.stopPropagation(); playNext(); }}
          style={{
            width: 28, height: 28, borderRadius: 14,
            background: 'rgba(201,168,76,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, flexShrink: 0,
          }}
          aria-label="Play next"
        >
          ▶▶
        </button>
      )}
    </div>
  );
}
