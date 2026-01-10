'use client';

import { useState, useRef } from 'react';

interface ShareCardData {
  card_type:
    | 'overview'
    | 'top-song'
    | 'top-artist'
    | 'wrapped'
    | 'monthly-summary'
    | 'top-5-songs'
    | 'listening-personality';
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
  // New fields for enhanced cards
  overview?: {
    total_plays: number;
    total_duration_formatted: string;
    unique_songs: number;
    unique_artists: number;
    completion_rate?: number;
  };
  top_songs?: Array<{ title: string; artist: string; play_count: number }>;
  top_artists?: Array<{ name: string; play_count: number }>;
  top_genres?: Array<{ genre: string; play_count: number; percentage: number }>;
  streaks?: { current: number; longest: number };
  songs?: Array<{
    rank: number;
    title: string;
    artist: string;
    play_count: number;
    sha_id?: string;
  }>;
  personality?: string;
  description?: string;
  traits?: string[];
  audio_profile?: {
    avg_energy: number;
    avg_danceability: number;
    avg_tempo: number;
  };
}

interface ShareCardProps {
  data: ShareCardData;
  onClose?: () => void;
}

export default function ShareCard({ data, onClose }: ShareCardProps) {
  const [copying, setCopying] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const saveAsImage = async () => {
    if (!cardRef.current) return;

    setSaving(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#1f2937', // gray-800
        scale: 2,
        logging: false,
        useCORS: true,
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      link.download = `songbase_${data.card_type}_${date}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to save image:', err);
    } finally {
      setSaving(false);
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
      case 'monthly-summary':
        const summaryLines = [
          `${data.title}`,
          ``,
          `${data.overview?.total_plays.toLocaleString()} plays | ${data.overview?.total_duration_formatted}`,
          `${data.overview?.unique_songs} songs | ${data.overview?.unique_artists} artists`,
          ``,
          `Top Songs:`,
          ...(data.top_songs?.map((s, i) => `${i + 1}. "${s.title}" - ${s.artist}`) || []),
          ``,
          `Top Artists:`,
          ...(data.top_artists?.map((a, i) => `${i + 1}. ${a.name}`) || []),
        ];
        return `${summaryLines.join('\n')}\n\nPowered by Songbase`;
      case 'top-5-songs':
        const songLines = data.songs?.map(
          (s) => `${s.rank}. "${s.title}" by ${s.artist} (${s.play_count} plays)`
        ) || [];
        return `My Top 5 Songs (${data.period}):\n\n${songLines.join('\n')}\n\nPowered by Songbase`;
      case 'listening-personality':
        return `My Listening Personality: ${data.personality}\n\n${data.description}\n\nTraits: ${data.traits?.join(', ')}\n\nAudio Profile:\n- Energy: ${data.audio_profile?.avg_energy}%\n- Danceability: ${data.audio_profile?.avg_danceability}%\n- Avg Tempo: ${data.audio_profile?.avg_tempo} BPM\n\nPowered by Songbase`;
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

      case 'monthly-summary':
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-center bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
              {data.title}
            </h2>

            {/* Overview Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-pink-400">
                  {data.overview?.total_plays.toLocaleString()}
                </p>
                <p className="text-xs text-gray-400">plays</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-purple-400">
                  {data.overview?.total_duration_formatted}
                </p>
                <p className="text-xs text-gray-400">listened</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-cyan-400">
                  {data.overview?.unique_songs}
                </p>
                <p className="text-xs text-gray-400">songs</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-400">
                  {data.overview?.unique_artists}
                </p>
                <p className="text-xs text-gray-400">artists</p>
              </div>
            </div>

            {/* Top Songs */}
            {data.top_songs && data.top_songs.length > 0 && (
              <div className="bg-gray-700/30 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-2">Top Songs</p>
                {data.top_songs.map((song, i) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <span className="text-sm font-bold text-pink-400">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{song.title}</p>
                      <p className="text-xs text-gray-500 truncate">{song.artist}</p>
                    </div>
                    <span className="text-xs text-gray-400">{song.play_count}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Streaks */}
            {data.streaks && (data.streaks.current > 0 || data.streaks.longest > 0) && (
              <div className="flex justify-center gap-4 text-center">
                <div>
                  <p className="text-lg font-bold text-green-400">{data.streaks.current}</p>
                  <p className="text-xs text-gray-500">Current Streak</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-400">{data.streaks.longest}</p>
                  <p className="text-xs text-gray-500">Best Streak</p>
                </div>
              </div>
            )}
          </div>
        );

      case 'top-5-songs':
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-center">{data.title}</h2>
            <p className="text-sm text-gray-400 text-center">{data.period}</p>

            <div className="space-y-2 mt-4">
              {data.songs?.map((song) => (
                <div
                  key={song.rank}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    song.rank === 1
                      ? 'bg-gradient-to-r from-amber-900/30 to-amber-800/20 border border-amber-600/30'
                      : song.rank === 2
                      ? 'bg-gradient-to-r from-gray-600/30 to-gray-500/20 border border-gray-400/30'
                      : song.rank === 3
                      ? 'bg-gradient-to-r from-amber-800/20 to-amber-700/10 border border-amber-700/30'
                      : 'bg-gray-700/30'
                  }`}
                >
                  <span
                    className={`text-2xl font-bold ${
                      song.rank === 1
                        ? 'text-amber-400'
                        : song.rank === 2
                        ? 'text-gray-300'
                        : song.rank === 3
                        ? 'text-amber-600'
                        : 'text-gray-500'
                    }`}
                  >
                    {song.rank}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{song.title}</p>
                    <p className="text-sm text-gray-400 truncate">{song.artist}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-purple-400">{song.play_count}</p>
                    <p className="text-xs text-gray-500">plays</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'listening-personality':
        return (
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold text-gray-400">{data.title}</h2>

            <div className="py-4">
              <p className="text-3xl font-bold bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                {data.personality}
              </p>
            </div>

            <p className="text-sm text-gray-300 leading-relaxed">{data.description}</p>

            {/* Traits */}
            {data.traits && (
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {data.traits.map((trait, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-purple-900/40 rounded-full text-sm text-purple-300 border border-purple-700/30"
                  >
                    {trait}
                  </span>
                ))}
              </div>
            )}

            {/* Audio Profile */}
            {data.audio_profile && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Audio Profile</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-gray-700/50 rounded-lg p-2">
                    <p className="text-lg font-bold text-pink-400">
                      {data.audio_profile.avg_energy}%
                    </p>
                    <p className="text-xs text-gray-500">Energy</p>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-2">
                    <p className="text-lg font-bold text-purple-400">
                      {data.audio_profile.avg_danceability}%
                    </p>
                    <p className="text-xs text-gray-500">Dance</p>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-2">
                    <p className="text-lg font-bold text-cyan-400">
                      {data.audio_profile.avg_tempo}
                    </p>
                    <p className="text-xs text-gray-500">BPM</p>
                  </div>
                </div>
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
          <button
            onClick={saveAsImage}
            disabled={saving}
            className="flex-1 bg-pink-600 hover:bg-pink-700 text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save as Image'}
          </button>
        </div>
      </div>
    </div>
  );
}

export type ShareCardType =
  | 'overview'
  | 'top-song'
  | 'top-artist'
  | 'wrapped'
  | 'monthly-summary'
  | 'top-5-songs'
  | 'listening-personality';

export async function fetchShareCardData(
  type: ShareCardType,
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

/**
 * ShareCardButton - A button that opens a share card modal
 */
interface ShareCardButtonProps {
  type: ShareCardType;
  period?: string;
  year?: number;
  className?: string;
  children?: React.ReactNode;
}

export function ShareCardButton({
  type,
  period = 'month',
  year,
  className = '',
  children,
}: ShareCardButtonProps) {
  const [loading, setLoading] = useState(false);
  const [cardData, setCardData] = useState<ShareCardData | null>(null);

  const handleClick = async () => {
    setLoading(true);
    try {
      const data = await fetchShareCardData(type, period, year);
      setCardData(data);
    } catch (error) {
      console.error('Failed to fetch share card:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLabel = () => {
    const labels: Record<ShareCardType, string> = {
      overview: 'Share Overview',
      'top-song': 'Share Top Song',
      'top-artist': 'Share Top Artist',
      wrapped: 'Share Wrapped',
      'monthly-summary': 'Share Summary',
      'top-5-songs': 'Share Top 5',
      'listening-personality': 'Share Personality',
    };
    return children || labels[type];
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium transition-all disabled:opacity-50 ${className}`}
      >
        {loading ? (
          <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
        )}
        <span>{getLabel()}</span>
      </button>

      {cardData && <ShareCard data={cardData} onClose={() => setCardData(null)} />}
    </>
  );
}
