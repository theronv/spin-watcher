'use client';

import { useRouter } from 'next/navigation';
import { useNowPlaying } from '@/context/NowPlayingContext';
import { AlbumRecord } from '@/lib/api';

export default function QueuePage() {
  const router = useRouter();
  const {
    nowPlaying,
    queue,
    removeFromQueue,
    reorderQueue,
    clearQueue,
  } = useNowPlaying();

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const next = [...queue];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    reorderQueue(next);
  };

  const handleMoveDown = (index: number) => {
    if (index >= queue.length - 1) return;
    const next = [...queue];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    reorderQueue(next);
  };

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 20px',
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(12,10,7,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
      }}>
        <h1 style={{ fontFamily: 'var(--font-playfair, serif)', fontSize: 28, fontWeight: 700, letterSpacing: '0.3px' }}>
          Queue
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {queue.length > 0 && (
            <button
              onClick={clearQueue}
              style={{
                fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
                color: 'var(--text-muted)',
                border: '1px solid var(--border)', borderRadius: 6,
                padding: '5px 10px', background: 'transparent',
                letterSpacing: '0.5px',
              }}
            >
              Clear
            </button>
          )}
          <button
            onClick={() => router.back()}
            style={{
              width: 36, height: 36, borderRadius: 18,
              background: 'var(--surface)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono, monospace)', fontSize: 16,
              color: 'var(--fg)',
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      <div style={{ padding: '0 20px' }}>
        {/* Now playing section */}
        {nowPlaying && (
          <div style={{ marginBottom: 24 }}>
            <SectionLabel>NOW PLAYING</SectionLabel>
            <div
              onClick={() => router.push('/now-playing')}
              style={{
                display: 'flex', alignItems: 'center',
                background: 'var(--surface)', borderRadius: 10,
                padding: 10, gap: 10,
                border: '1px solid var(--gold-dim)',
                cursor: 'pointer',
              }}
            >
              <QueueThumb record={nowPlaying} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-playfair, serif)', fontSize: 14, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {nowPlaying.title}
                </div>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--gold)', letterSpacing: '0.3px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {nowPlaying.artist}
                </div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, color: 'var(--gold-dim)', letterSpacing: '2px', flexShrink: 0 }}>
                ▶ PLAYING
              </span>
            </div>
          </div>
        )}

        {/* Queue list */}
        {queue.length > 0 ? (
          <div>
            <SectionLabel>
              UP NEXT · {queue.length} {queue.length === 1 ? 'RECORD' : 'RECORDS'}
            </SectionLabel>

            {queue.map((item, index) => (
              <div
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center',
                  background: 'var(--surface)', borderRadius: 10,
                  padding: 10, marginBottom: 6, gap: 10,
                  border: '1px solid var(--border)',
                }}
              >
                {/* Reorder */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    style={{
                      fontFamily: 'var(--font-mono, monospace)', fontSize: 9,
                      color: index === 0 ? 'var(--text-dim)' : 'var(--text-muted)',
                      padding: '2px 6px', opacity: index === 0 ? 0.3 : 1,
                    }}
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index >= queue.length - 1}
                    style={{
                      fontFamily: 'var(--font-mono, monospace)', fontSize: 9,
                      color: index >= queue.length - 1 ? 'var(--text-dim)' : 'var(--text-muted)',
                      padding: '2px 6px', opacity: index >= queue.length - 1 ? 0.3 : 1,
                    }}
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </div>

                <QueueThumb record={item} size={40} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-playfair, serif)', fontSize: 13, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {item.title}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.3px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {item.artist}
                  </div>
                </div>

                <button
                  onClick={() => removeFromQueue(item.id)}
                  style={{
                    width: 28, height: 28, borderRadius: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-mono, monospace)', fontSize: 14,
                    color: 'var(--text-dim)', flexShrink: 0,
                  }}
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          /* Empty state */
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            paddingTop: 80, gap: 16,
          }}>
            <svg width={80} height={80} viewBox="0 0 60 60" fill="none">
              <circle cx="30" cy="30" r="28" stroke="var(--gold-dim)" strokeWidth="1.5" />
              <circle cx="30" cy="30" r="10" fill="var(--gold-dim)" opacity="0.4" />
            </svg>
            <p style={{ fontFamily: 'var(--font-playfair, serif)', fontSize: 20, color: 'var(--text-muted)', fontWeight: 700 }}>
              Your queue is empty
            </p>
            <p style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.6, letterSpacing: '0.3px' }}>
              Open a record and tap "+ Add to Queue"<br />to build your listening queue.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: 10, color: 'var(--text-dim)',
      letterSpacing: '2px', textTransform: 'uppercase',
      marginBottom: 10, paddingTop: 16,
    }}>
      {children}
    </div>
  );
}

function QueueThumb({ record, size }: { record: AlbumRecord; size: number }) {
  return record.coverImage ? (
    <img
      src={record.coverImage}
      alt=""
      style={{ width: size, height: size, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  ) : (
    <div style={{
      width: size, height: size, borderRadius: 6,
      background: 'var(--surface-high)', flexShrink: 0,
    }} />
  );
}
