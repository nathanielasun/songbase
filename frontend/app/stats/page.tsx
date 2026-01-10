'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ChartBarIcon,
  MusicalNoteIcon,
  UserGroupIcon,
  ClockIcon,
  FireIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';
import { PlayIcon } from '@heroicons/react/24/solid';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { formatDuration } from '@/lib/mockData';

interface StatsOverview {
  period: string;
  total_plays: number;
  completed_plays: number;
  total_duration_ms: number;
  total_duration_formatted: string;
  unique_songs: number;
  unique_artists: number;
  avg_plays_per_day: number;
  avg_completion_percent: number;
  most_active_day: string | null;
  current_streak_days: number;
  longest_streak_days: number;
}

interface TopSong {
  sha_id: string;
  title: string;
  artist: string;
  artist_id: number | null;
  album: string | null;
  duration_sec: number;
  play_count: number;
  total_duration_ms: number;
  avg_completion: number;
}

interface TopArtist {
  artist_id: number;
  name: string;
  play_count: number;
  unique_songs: number;
  total_duration_ms: number;
}

interface HistoryItem {
  session_id: string;
  sha_id: string;
  title: string;
  artist: string;
  artist_id: number | null;
  album: string | null;
  started_at: string;
  duration_played_ms: number;
  completed: boolean;
  skipped: boolean;
  context_type: string | null;
}

interface HeatmapData {
  year: number;
  data: { day: number; hour: number; plays: number }[];
  peak_day: string | null;
  peak_hour: number | null;
}

type Period = 'week' | 'month' | 'year' | 'all';

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
}) {
  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center gap-3 mb-3">
        <Icon className="w-5 h-5 text-pink-500" />
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {subValue && <div className="text-xs text-gray-500 mt-1">{subValue}</div>}
    </div>
  );
}

function TopSongsChart({ songs }: { songs: TopSong[] }) {
  const { playSong } = useMusicPlayer();
  const maxPlays = songs.length > 0 ? songs[0].play_count : 1;

  const handlePlay = (song: TopSong, e: React.MouseEvent) => {
    e.stopPropagation();
    playSong({
      id: song.sha_id,
      hashId: song.sha_id,
      title: song.title,
      artist: song.artist,
      album: song.album || '',
      duration: song.duration_sec || Math.floor(song.total_duration_ms / song.play_count / 1000),
      albumArt: `/api/library/images/song/${song.sha_id}`,
    });
  };

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <MusicalNoteIcon className="w-5 h-5 text-pink-500" />
        Top Songs
      </h3>
      <div className="space-y-3">
        {songs.length === 0 ? (
          <p className="text-gray-500 text-sm">No play history yet</p>
        ) : (
          songs.map((song, i) => (
            <div key={`${song.sha_id}-${i}`} className="flex items-center gap-3 group">
              <span className="text-gray-500 w-5 text-sm">{i + 1}</span>
              <div className="relative flex-shrink-0">
                <img
                  src={`/api/library/images/song/${song.sha_id}`}
                  alt=""
                  className="w-10 h-10 rounded bg-gray-800 object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/default-album.svg';
                  }}
                />
                <button
                  onClick={(e) => handlePlay(song, e)}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <PlayIcon className="w-5 h-5 text-white" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{song.title}</div>
                <div className="text-xs text-gray-400 truncate">
                  {song.artist_id ? (
                    <Link
                      href={`/artist/${song.artist_id}`}
                      className="hover:text-white hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {song.artist}
                    </Link>
                  ) : (
                    song.artist
                  )}
                  {song.album && (
                    <>
                      <span className="mx-1">·</span>
                      <span className="text-gray-500">{song.album}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="h-2 bg-pink-600 rounded-full"
                  style={{ width: `${(song.play_count / maxPlays) * 60}px` }}
                />
                <span className="text-xs text-gray-400 w-8">{song.play_count}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TopArtistsChart({ artists }: { artists: TopArtist[] }) {
  const maxPlays = artists.length > 0 ? artists[0].play_count : 1;

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <UserGroupIcon className="w-5 h-5 text-pink-500" />
        Top Artists
      </h3>
      <div className="space-y-3">
        {artists.length === 0 ? (
          <p className="text-gray-500 text-sm">No play history yet</p>
        ) : (
          artists.map((artist, i) => (
            <Link
              key={artist.artist_id}
              href={`/artist/${artist.artist_id}`}
              className="flex items-center gap-3 hover:bg-gray-800/50 rounded-lg p-1 -m-1 transition-colors"
            >
              <span className="text-gray-500 w-5 text-sm">{i + 1}</span>
              <img
                src={`/api/library/images/artist/${artist.artist_id}`}
                alt=""
                className="w-10 h-10 rounded-full bg-gray-800 object-cover flex-shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/default-album.svg';
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{artist.name}</div>
                <div className="text-xs text-gray-400">{artist.unique_songs} songs</div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="h-2 bg-purple-600 rounded-full"
                  style={{ width: `${(artist.play_count / maxPlays) * 60}px` }}
                />
                <span className="text-xs text-gray-400 w-8">{artist.play_count}</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function ListeningHeatmap({ data }: { data: HeatmapData | null }) {
  if (!data || data.data.length === 0) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-pink-500" />
          When You Listen
        </h3>
        <p className="text-gray-500 text-sm">Not enough data yet</p>
      </div>
    );
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = [0, 6, 12, 18];

  // Create a map for quick lookup
  const playMap = new Map<string, number>();
  let maxPlays = 0;
  data.data.forEach((d) => {
    playMap.set(`${d.day}-${d.hour}`, d.plays);
    if (d.plays > maxPlays) maxPlays = d.plays;
  });

  const getIntensity = (plays: number) => {
    if (plays === 0) return 'bg-gray-800';
    const ratio = plays / maxPlays;
    if (ratio < 0.25) return 'bg-pink-900/50';
    if (ratio < 0.5) return 'bg-pink-700/60';
    if (ratio < 0.75) return 'bg-pink-600/70';
    return 'bg-pink-500';
  };

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <CalendarIcon className="w-5 h-5 text-pink-500" />
        When You Listen
      </h3>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-xs text-gray-500 pr-2">
          {hours.map((h) => (
            <span key={h}>{h === 0 ? '12am' : h === 12 ? '12pm' : `${h % 12}${h < 12 ? 'am' : 'pm'}`}</span>
          ))}
        </div>
        <div className="flex-1">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            {days.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {hours.map((hour) =>
              days.map((_, dayIndex) => {
                const plays = playMap.get(`${dayIndex}-${hour}`) || 0;
                return (
                  <div
                    key={`${dayIndex}-${hour}`}
                    className={`aspect-square rounded ${getIntensity(plays)}`}
                    title={`${days[dayIndex]} ${hour}:00 - ${plays} plays`}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
      {data.peak_day && (
        <p className="text-xs text-gray-400 mt-4">
          Most active: {data.peak_day}s at {data.peak_hour}:00
        </p>
      )}
    </div>
  );
}

function RecentHistory({ items }: { items: HistoryItem[] }) {
  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <ClockIcon className="w-5 h-5 text-pink-500" />
        Recent Activity
      </h3>
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-gray-500 text-sm">No recent plays</p>
        ) : (
          items.slice(0, 10).map((item) => (
            <div key={item.session_id} className="flex items-center gap-3">
              <img
                src={`/api/library/images/song/${item.sha_id}`}
                alt=""
                className="w-10 h-10 rounded bg-gray-800 object-cover flex-shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/default-album.svg';
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.title}</div>
                <div className="text-xs text-gray-400 truncate">
                  {item.artist_id ? (
                    <Link
                      href={`/artist/${item.artist_id}`}
                      className="hover:text-white hover:underline"
                    >
                      {item.artist}
                    </Link>
                  ) : (
                    item.artist
                  )}
                  {item.album && (
                    <>
                      <span className="mx-1">·</span>
                      <span className="text-gray-500">{item.album}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xs text-gray-500">{formatTimeAgo(item.started_at)}</div>
                {item.skipped && <div className="text-xs text-red-400">skipped</div>}
                {item.completed && <div className="text-xs text-green-400">completed</div>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function StatsPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [topSongs, setTopSongs] = useState<TopSong[]>([]);
  const [topArtists, setTopArtists] = useState<TopArtist[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError(null);

      try {
        const [overviewRes, songsRes, artistsRes, heatmapRes, historyRes] = await Promise.all([
          fetch(`/api/stats/overview?period=${period}`),
          fetch(`/api/stats/top-songs?period=${period}&limit=10`),
          fetch(`/api/stats/top-artists?period=${period}&limit=10`),
          fetch(`/api/stats/heatmap`),
          fetch(`/api/stats/history?limit=20`),
        ]);

        if (!overviewRes.ok) throw new Error('Failed to fetch overview');

        const [overviewData, songsData, artistsData, heatmapData, historyData] = await Promise.all([
          overviewRes.json(),
          songsRes.ok ? songsRes.json() : { songs: [] },
          artistsRes.ok ? artistsRes.json() : { artists: [] },
          heatmapRes.ok ? heatmapRes.json() : null,
          historyRes.ok ? historyRes.json() : { items: [] },
        ]);

        setOverview(overviewData);
        setTopSongs(songsData.songs || []);
        setTopArtists(artistsData.artists || []);
        setHeatmap(heatmapData);
        setHistory(historyData.items || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [period]);

  const periods: { key: Period; label: string }[] = [
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
    { key: 'all', label: 'All Time' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <ChartBarIcon className="w-8 h-8 text-pink-500" />
              Your Listening Stats
            </h1>
            <p className="text-gray-400 mt-1">Track your music listening habits</p>
          </div>

          {/* Period Selector */}
          <div className="flex gap-2">
            {periods.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  period === p.key
                    ? 'bg-pink-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
                <div className="h-4 bg-gray-700 rounded w-20 mb-3" />
                <div className="h-8 bg-gray-700 rounded w-16" />
              </div>
            ))}
          </div>
        ) : overview ? (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                icon={ChartBarIcon}
                label="Total Plays"
                value={overview.total_plays.toLocaleString()}
                subValue={`${overview.completed_plays} completed`}
              />
              <StatCard
                icon={ClockIcon}
                label="Time Listened"
                value={overview.total_duration_formatted}
                subValue={`${overview.avg_plays_per_day}/day avg`}
              />
              <StatCard
                icon={MusicalNoteIcon}
                label="Unique Songs"
                value={overview.unique_songs.toLocaleString()}
              />
              <StatCard
                icon={FireIcon}
                label="Streak"
                value={`${overview.current_streak_days} days`}
                subValue={`Best: ${overview.longest_streak_days} days`}
              />
            </div>

            {/* Charts Grid */}
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <TopSongsChart songs={topSongs} />
              <TopArtistsChart artists={topArtists} />
            </div>

            {/* Bottom Grid */}
            <div className="grid md:grid-cols-2 gap-6">
              <ListeningHeatmap data={heatmap} />
              <RecentHistory items={history} />
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <ChartBarIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No listening data yet</h2>
            <p className="text-gray-400">Start playing songs to see your stats here</p>
          </div>
        )}
      </div>
    </div>
  );
}
