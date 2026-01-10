'use client';

import { useState, useRef } from 'react';

interface ShareCardData {
  card_type: 'overview' | 'top-song' | 'top-artist' | 'wrapped';
  period?: string;
  year?: number;
  title: string;
  stats?: Array<{ label: string; value: string | number }>;
  song?: { title: string; artist: string; play_count: number };
  artist?: { name: string; play_count: number; unique_songs: number };
  total_minutes?: number;
  unique_songs?: number;
  top_song?: { title: string; artist: string; play_count: number } | null;
  top_artist?: { name: string; play_count: number } | null;
  listening_personality?: string;
  generated_at: string;
}

interface ShareCardProps {
  data: ShareCardData;
  onClose?: () => void;
}

export default function ShareCard({ data, onClose }: ShareCardProps) {
  const [copying, setCopying] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const copyToClipboard = async () => {
    setCopying(true);
    try {
      const text = generateTextSummary(data);
      await navigator.clipboard.writeText(text);
      setTimeout(() => setCopying(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setCopying(false);
    }
  };

  const generateTextSummary = (data: ShareCardData): string => {
    switch (data.card_type) {
      case 'overview':
        return `My Listening Stats (${data.period}):\n${data.stats?.map(s => `${s.label}: ${s.value}`).join('\n')}\n\nPowered by Songbase`;
      case 'top-song':
        return `My Top Song (${data.period}): "${data.song?.title}" by ${data.song?.artist} - ${data.song?.play_count} plays\n\nPowered by Songbase`;
      case 'top-artist':
        return `My Top Artist (${data.period}): ${data.artist?.name} - ${data.artist?.play_count} plays across ${data.artist?.unique_songs} songs\n\nPowered by Songbase`;
      case 'wrapped':
        return `My ${data.year} Wrapped:\n- ${data.total_minutes?.toLocaleString()} minutes listened\n- ${data.unique_songs?.toLocaleString()} unique songs\n- Top Song: "${data.top_song?.title}" by ${data.top_song?.artist}\n- Top Artist: ${data.top_artist?.name}\n- Listening Personality: ${data.listening_personality}\n\nPowered by Songbase`;
      default:
        return 'My Listening Stats - Powered by Songbase';
    }
  };

  const renderCardContent = () => {
    switch (data.card_type) {
      case 'overview':
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-center">{data.title}</h2>
            <p className="text-sm text-gray-400 text-center">{data.period}</p>
            <div className="grid grid-cols-2 gap-4 mt-4">
              {data.stats?.map((stat, i) => (
                <div key={i} className="bg-gray-700/50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-purple-400">{stat.value}</p>
                  <p className="text-sm text-gray-400">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        );

      case 'top-song':
        return (
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-bold">{data.title}</h2>
            <p className="text-sm text-gray-400">{data.period}</p>
            <div className="mt-6">
              <p className="text-3xl font-bold text-purple-400">"{data.song?.title}"</p>
              <p className="text-xl text-gray-300 mt-2">{data.song?.artist}</p>
              <p className="text-lg text-gray-400 mt-4">
                <span className="text-2xl font-bold text-green-400">{data.song?.play_count}</span> plays
              </p>
            </div>
          </div>
        );

      case 'top-artist':
        return (
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-bold">{data.title}</h2>
            <p className="text-sm text-gray-400">{data.period}</p>
            <div className="mt-6">
              <p className="text-3xl font-bold text-purple-400">{data.artist?.name}</p>
              <div className="flex justify-center gap-6 mt-4">
                <div>
                  <p className="text-2xl font-bold text-green-400">{data.artist?.play_count}</p>
                  <p className="text-sm text-gray-400">plays</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-400">{data.artist?.unique_songs}</p>
                  <p className="text-sm text-gray-400">songs</p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'wrapped':
        return (
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              {data.year} Wrapped
            </h2>
            <div className="mt-4 space-y-3">
              <p className="text-4xl font-bold text-purple-400">
                {data.total_minutes?.toLocaleString()}
              </p>
              <p className="text-gray-400">minutes listened</p>
            </div>
            {data.top_song && (
              <div className="bg-gray-700/50 rounded-lg p-4 mt-4">
                <p className="text-sm text-gray-400">Top Song</p>
                <p className="text-lg font-semibold">"{data.top_song.title}"</p>
                <p className="text-gray-400">{data.top_song.artist}</p>
              </div>
            )}
            {data.top_artist && (
              <div className="bg-gray-700/50 rounded-lg p-4">
                <p className="text-sm text-gray-400">Top Artist</p>
                <p className="text-lg font-semibold">{data.top_artist.name}</p>
              </div>
            )}
            {data.listening_personality && (
              <div className="mt-4">
                <p className="text-sm text-gray-400">You're a</p>
                <p className="text-xl font-bold text-yellow-400">{data.listening_personality}</p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        <div ref={cardRef} className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
          {renderCardContent()}
          <div className="mt-6 pt-4 border-t border-gray-700 text-center">
            <p className="text-xs text-gray-500">Powered by Songbase</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={copyToClipboard}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 px-4 rounded-lg font-medium transition-colors"
          >
            {copying ? 'Copied!' : 'Copy as Text'}
          </button>
        </div>
      </div>
    </div>
  );
}

export async function fetchShareCardData(
  type: 'overview' | 'top-song' | 'top-artist' | 'wrapped',
  period: string = 'month',
  year?: number
): Promise<ShareCardData> {
  const params = new URLSearchParams({ type, period });
  if (year !== undefined) {
    params.append('year', year.toString());
  }

  const response = await fetch(`/api/export/share-card?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch share card data');
  }
  return response.json();
}
