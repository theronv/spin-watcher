"use client";
import React, { useState, useEffect } from 'react';
import { Disc, RefreshCw, Shuffle } from 'lucide-react';

export default function Home() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(null);

  const fetchCollection = () => {
    setLoading(true);
    fetch('http://192.168.68.87:3000/api/sync')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        setRecords(data);
        if (data.length > 0) setCurrent(data[0]);
        setLoading(false);
      })
      .catch(function(e) {
        console.error("Sync failed", e);
        setLoading(false);
      });
  };

  const pickRandom = () => {
    const random = records[Math.floor(Math.random() * records.length)];
    setCurrent(random);
  };

  useEffect(function() { fetchCollection(); }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
      <RefreshCw className="animate-spin mb-4" size={48} />
      <p>Syncing with Discogs...</p>
    </div>
  );

  return (
    <main className="flex flex-col items-center justify-between min-h-screen bg-black text-white p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tighter text-zinc-500 uppercase">SpinWatcher</h1>
      </div>

      <div className="relative group">
        {current && (
          <div className="flex flex-col items-center">
            <div className="w-72 h-72 bg-zinc-900 rounded-lg overflow-hidden shadow-2xl border border-zinc-800">
              <img
                src={'http://192.168.68.87:3000/api/image?url=' + encodeURIComponent(current.cover)}
                width="288"
                height="288"
                className="w-full h-full object-cover"
                alt="Cover"
              />
            </div>
            <div className="mt-6 text-center">
              <h2 className="text-2xl font-bold line-clamp-1 px-4">{current.title}</h2>
              <p className="text-xl text-zinc-400 mt-1">{current.artist}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex space-x-4 mb-8">
        <button
          onClick={pickRandom}
          className="flex items-center space-x-2 px-8 py-4 bg-white text-black font-black rounded-full active:scale-95 transition-transform"
        >
          <Shuffle size={20} />
          <span>PICK A RECORD</span>
        </button>

        <button
          onClick={fetchCollection}
          className="p-4 bg-zinc-800 rounded-full active:bg-zinc-700"
        >
          <RefreshCw size={24} />
        </button>
      </div>
    </main>
  );
}

