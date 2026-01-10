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
  SparklesIcon,
  PlusIcon,
  CheckCircleIcon,
  ForwardIcon,
  PlayIcon as PlayOutlineIcon,
} from '@heroicons/react/24/outline';
import { PlayIcon } from '@heroicons/react/24/solid';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { HeroStatCard, MiniStatCard, InsightItem } from './StatCard';
import { Sparkline, CHART_COLORS } from '@/components/charts';

// Types
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

interface LibraryStats {
  total_songs: number;
  total_artists: number;
  total_albums: number;
  total_duration_sec: number;
  avg_song_length_sec: number;
  earliest_year: number | null;
  latest_year: number | null;
  most_prolific_artist: { name: string; song_count: number } | null;
  longest_song: { title: string; artist: string; duration_sec: number } | null;
  shortest_song: { title: string; artist: string; duration_sec: number } | null;
}

interface DailyActivity {
  date: string;
  plays: number;
  songs_added: number;
}

interface OverviewTabProps {
  period: string;
  overview: StatsOverview | null;
  topSongs: TopSong[];
  topArtists: TopArtist[];
  heatmap: HeatmapData | null;
  history: HistoryItem[];
  loading?: boolean;
}

// Format duration as "X days, Y hours" or similar
function formatLongDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

function formatDurationShort(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function OverviewTab({
  period,
  overview,
  topSongs,
  topArtists,
  heatmap,
  history,
  loading = false,
}: OverviewTabProps) {
  const [libraryStats, setLibraryStats] = useState<LibraryStats | null>(null);
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);

  // Fetch library stats and daily activity
  useEffect(() => {
    const fetchAdditionalStats = async () => {
      setLoadingLibrary(true);
      try {
        const [libraryRes, activityRes] = await Promise.all([
          fetch('/api/stats/library'),
          fetch(`/api/stats/daily-activity?days=7`),
        ]);

        if (libraryRes.ok) {
          setLibraryStats(await libraryRes.json());
        }
        if (activityRes.ok) {
          const data = await activityRes.json();
          setDailyActivity(data.activity || []);
        }
      } catch (e) {
        console.error('Failed to fetch additional stats:', e);
      } finally {
        setLoadingLibrary(false);
      }
    };

    fetchAdditionalStats();
  }, []);

  // Calculate this period stats
  const skippedCount = history.filter((h) => h.skipped).length;
  const completedCount = history.filter((h) => h.completed).length;
  const skipRate = history.length > 0 ? Math.round((skippedCount / history.length) * 100) : 0;

  // Calculate decade span
  const decadeSpan = libraryStats?.earliest_year && libraryStats?.latest_year
    ? Math.floor(libraryStats.latest_year / 10) - Math.floor(libraryStats.earliest_year / 10) + 1
    : 0;

  // Sparkline data from daily activity
  const listeningSparkline = dailyActivity.map((d) => d.plays);
  const addedSparkline = dailyActivity.map((d) => d.songs_added);

  if (loading) {
    return <OverviewSkeleton />;
  }

  if (!overview) {
    return (
      <div className="text-center py-12">
        <ChartBarIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">No listening data yet</h2>
        <p className="text-gray-400">Start playing songs to see your stats here</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <HeroStatCard
          icon={ClockIcon}
          label="Total Library Duration"
          value={libraryStats ? formatLongDuration(libraryStats.total_duration_sec * 1000) : '—'}
          subValue={libraryStats ? `${libraryStats.total_songs.toLocaleString()} songs` : undefined}
          accentColor="pink"
        />
        <HeroStatCard
          icon={MusicalNoteIcon}
          label="Songs in Library"
          value={libraryStats?.total_songs.toLocaleString() || '—'}
          subValue={libraryStats ? `${libraryStats.total_albums.toLocaleString()} albums` : undefined}
          accentColor="purple"
        />
        <HeroStatCard
          icon={UserGroupIcon}
          label="Artists Discovered"
          value={libraryStats?.total_artists.toLocaleString() || '—'}
          subValue="unique artists"
          accentColor="cyan"
        />
        <HeroStatCard
          icon={FireIcon}
          label="Listening Streak"
          value={`${overview.current_streak_days} days`}
          subValue={`Best: ${overview.longest_streak_days} days`}
          accentColor="amber"
        />
      </div>

      {/* Quick Insights + This Period Summary Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Quick Insights Panel */}
        <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-pink-500" />
            Quick Insights
          </h3>
          <div className="space-y-1 divide-y divide-gray-800">
            {decadeSpan > 0 && (
              <InsightItem
                text="Your library spans"
                highlight={`${decadeSpan} decade${decadeSpan > 1 ? 's' : ''}`}
              />
            )}
            {libraryStats?.avg_song_length_sec && (
              <InsightItem
                text="Average song length:"
                highlight={formatDurationShort(Math.round(libraryStats.avg_song_length_sec))}
              />
            )}
            {libraryStats?.most_prolific_artist && (
              <InsightItem
                text="Most prolific artist:"
                highlight={`${libraryStats.most_prolific_artist.name} (${libraryStats.most_prolific_artist.song_count} songs)`}
              />
            )}
            {libraryStats?.longest_song && (
              <InsightItem
                text="Longest song:"
                highlight={`${libraryStats.longest_song.title} (${formatDurationShort(libraryStats.longest_song.duration_sec)})`}
              />
            )}
            {libraryStats?.shortest_song && (
              <InsightItem
                text="Shortest song:"
                highlight={`${libraryStats.shortest_song.title} (${formatDurationShort(libraryStats.shortest_song.duration_sec)})`}
              />
            )}
            {!libraryStats && !loadingLibrary && (
              <p className="text-gray-500 text-sm py-2">No library data available</p>
            )}
            {loadingLibrary && (
              <div className="py-2 space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-4 bg-gray-800 rounded animate-pulse w-3/4" />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* This Period Summary */}
        <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ChartBarIcon className="w-5 h-5 text-pink-500" />
            This {period === 'all' ? 'Time' : period.charAt(0).toUpperCase() + period.slice(1)}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <MiniStatCard
              label="Songs Played"
              value={overview.total_plays.toLocaleString()}
              icon={PlayOutlineIcon}
            />
            <MiniStatCard
              label="Hours Listened"
              value={formatLongDuration(overview.total_duration_ms)}
              icon={ClockIcon}
            />
            <MiniStatCard
              label="Songs Completed"
              value={overview.completed_plays.toLocaleString()}
              icon={CheckCircleIcon}
            />
            <MiniStatCard
              label="Skip Rate"
              value={`${skipRate}%`}
              icon={ForwardIcon}
            />
          </div>
        </div>
      </div>

      {/* Activity Sparklines */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-medium text-gray-300">7-Day Listening Trend</h4>
              <p className="text-2xl font-bold text-white mt-1">
                {listeningSparkline.reduce((a, b) => a + b, 0)} plays
              </p>
            </div>
            {listeningSparkline.length > 1 && (
              <Sparkline
                data={listeningSparkline}
                color={CHART_COLORS.primary}
                width={120}
                height={50}
              />
            )}
          </div>
          <p className="text-xs text-gray-500">
            {dailyActivity.length > 0 ? `${dailyActivity[dailyActivity.length - 1]?.date || 'Today'}` : 'Last 7 days'}
          </p>
        </div>

        <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-medium text-gray-300">7-Day Songs Added</h4>
              <p className="text-2xl font-bold text-white mt-1">
                {addedSparkline.reduce((a, b) => a + b, 0)} songs
              </p>
            </div>
            {addedSparkline.length > 1 && (
              <Sparkline
                data={addedSparkline}
                color={CHART_COLORS.secondary}
                width={120}
                height={50}
              />
            )}
          </div>
          <p className="text-xs text-gray-500">New additions to your library</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        <TopSongsChart songs={topSongs} />
        <TopArtistsChart artists={topArtists} />
      </div>

      {/* Bottom Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        <ListeningHeatmap data={heatmap} />
        <RecentHistory items={history} />
      </div>
    </div>
  );
}

// Skeleton loader
function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-gray-900/70 rounded-2xl p-6 border border-gray-800 animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-24 mb-3" />
            <div className="h-8 bg-gray-700 rounded w-20 mb-2" />
            <div className="h-3 bg-gray-700 rounded w-16" />
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse h-48" />
        ))}
      </div>
    </div>
  );
}

// Top Songs Chart (moved from page.tsx)
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
          songs.slice(0, 5).map((song, i) => (
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

// Top Artists Chart (moved from page.tsx)
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
          artists.slice(0, 5).map((artist, i) => (
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

// Listening Heatmap (moved from page.tsx)
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

// Recent History (moved from page.tsx)
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
