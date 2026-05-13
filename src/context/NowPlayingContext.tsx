'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { api, AlbumRecord } from '@/lib/api';

const QUEUE_KEY = 'needledrop_queue';

interface NowPlayingContextValue {
  nowPlaying:      AlbumRecord | null;
  isPlaying:       boolean;
  playCounts:      Record<string, number>;
  isLoggingPlay:   boolean;
  queue:           AlbumRecord[];
  playRecord:      (record: AlbumRecord) => void;
  stopPlaying:     () => void;
  updatePlayCount: (id: string, count: number) => void;
  getPlayCount:    (id: string) => number;
  fetchPlayCounts: () => Promise<void>;
  addToQueue:      (record: AlbumRecord) => void;
  removeFromQueue: (id: string) => void;
  reorderQueue:    (q: AlbumRecord[]) => void;
  playNext:        () => void;
  clearQueue:      () => void;
}

const NowPlayingContext = createContext<NowPlayingContextValue | null>(null);

function persistQueue(q: AlbumRecord[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.map(r => ({
      id: r.id, title: r.title, artist: r.artist,
      coverImage: r.coverImage, year: r.year, label: r.label, genres: r.genres,
    }))));
  } catch {}
}

function loadQueue(): AlbumRecord[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Omit<AlbumRecord, 'playCount'>>;
    return parsed.map(r => ({ ...r, playCount: 0 }));
  } catch {
    return [];
  }
}

export function NowPlayingProvider({ children }: { children: React.ReactNode }) {
  const [nowPlaying,    setNowPlaying]    = useState<AlbumRecord | null>(null);
  const [isPlaying,     setIsPlaying]     = useState(false);
  const [playCounts,    setPlayCounts]    = useState<Record<string, number>>({});
  const [isLoggingPlay, setIsLoggingPlay] = useState(false);
  const [queue,         setQueue]         = useState<AlbumRecord[]>([]);
  const queueRef = useRef<AlbumRecord[]>([]);

  useEffect(() => { queueRef.current = queue; }, [queue]);

  const fetchPlayCounts = useCallback(async () => {
    try {
      const plays = await api.getPlays();
      const map: Record<string, number> = {};
      for (const p of plays) map[p.discogs_id] = p.play_count;
      setPlayCounts(map);
    } catch {}
  }, []);

  // Load queue from localStorage on mount
  useEffect(() => {
    setQueue(loadQueue());
  }, []);

  const getPlayCount = useCallback((id: string) => playCounts[id] ?? 0, [playCounts]);

  const playRecord = useCallback((record: AlbumRecord) => {
    setNowPlaying(record);
    setIsPlaying(true);

    // Optimistic increment
    setPlayCounts(prev => ({ ...prev, [record.id]: (prev[record.id] ?? 0) + 1 }));

    setIsLoggingPlay(true);
    api.logPlay(record.id)
      .then(res => {
        setPlayCounts(prev => ({ ...prev, [res.discogs_id]: res.play_count }));
      })
      .catch(() => {
        // Rollback
        setPlayCounts(prev => ({ ...prev, [record.id]: Math.max((prev[record.id] ?? 1) - 1, 0) }));
      })
      .finally(() => setIsLoggingPlay(false));
  }, []);

  const stopPlaying = useCallback(() => {
    setNowPlaying(null);
    setIsPlaying(false);
  }, []);

  const updatePlayCount = useCallback((id: string, count: number) => {
    setPlayCounts(prev => ({ ...prev, [id]: count }));
    api.updatePlayCount(id, count)
      .then(res => setPlayCounts(prev => ({ ...prev, [res.discogs_id]: res.play_count })))
      .catch(() => fetchPlayCounts());
  }, [fetchPlayCounts]);

  const addToQueue = useCallback((record: AlbumRecord) => {
    setQueue(prev => {
      if (prev.some(r => r.id === record.id)) return prev;
      const next = [...prev, record];
      persistQueue(next);
      return next;
    });
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => {
      const next = prev.filter(r => r.id !== id);
      persistQueue(next);
      return next;
    });
  }, []);

  const reorderQueue = useCallback((newQueue: AlbumRecord[]) => {
    setQueue(newQueue);
    persistQueue(newQueue);
  }, []);

  const playNext = useCallback(() => {
    const current = queueRef.current;
    if (current.length === 0) {
      setNowPlaying(null);
      setIsPlaying(false);
      return;
    }
    const [next, ...rest] = current;
    setQueue(rest);
    persistQueue(rest);
    // playRecord re-enters with the next item
    setNowPlaying(next);
    setIsPlaying(true);
    setPlayCounts(prev => ({ ...prev, [next.id]: (prev[next.id] ?? 0) + 1 }));
    api.logPlay(next.id)
      .then(res => setPlayCounts(prev => ({ ...prev, [res.discogs_id]: res.play_count })))
      .catch(() => setPlayCounts(prev => ({ ...prev, [next.id]: Math.max((prev[next.id] ?? 1) - 1, 0) })));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    persistQueue([]);
  }, []);

  return (
    <NowPlayingContext.Provider value={{
      nowPlaying, isPlaying, playCounts, isLoggingPlay, queue,
      playRecord, stopPlaying, updatePlayCount, getPlayCount, fetchPlayCounts,
      addToQueue, removeFromQueue, reorderQueue, playNext, clearQueue,
    }}>
      {children}
    </NowPlayingContext.Provider>
  );
}

export function useNowPlaying() {
  const ctx = useContext(NowPlayingContext);
  if (!ctx) throw new Error('useNowPlaying must be used within NowPlayingProvider');
  return ctx;
}
