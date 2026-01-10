'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArchiveBoxIcon,
  CalendarDaysIcon,
  ClockIcon,
  MusicalNoteIcon,
  UserGroupIcon,
  ChartBarIcon,
  RectangleStackIcon,
} from '@heroicons/react/24/outline';
import {
  AreaChart,
  HorizontalBarChart,
  SimpleBarChart,
  DonutChart,
  CHART_COLORS,
  getSeriesColor,
} from '@/components/charts';

// Types
interface LibraryStats {
  total_songs: number;
  total_albums: number;
  total_artists: number;
  total_duration_sec: number;
  total_duration_formatted: string;
  avg_song_length_sec: number;
  avg_song_length_formatted: string;
  storage_bytes: number;
  storage_formatted: string;
  songs_by_decade: { decade: number; count: number }[];
  songs_by_year: { year: number; count: number }[];
  earliest_year: number | null;
  latest_year: number | null;
  decades_spanned: number;
  longest_song: { sha_id: string; title: string; artist: string; duration_sec: number } | null;
  shortest_song: { sha_id: string; title: string; artist: string; duration_sec: number } | null;
  most_prolific_artist: { name: string; song_count: number } | null;
}

interface LibraryGrowth {
  period: string;
  data: { date: string; songs_added: number; cumulative_total: number }[];
  total_periods: number;
}

interface LibraryComposition {
  total_songs: number;
  by_source: { source: string; count: number; percentage: number }[];
  by_verification: {
    verified: { count: number; percentage: number };
    unverified: { count: number; percentage: number };
  };
  by_audio_features: {
    with_features: { count: number; percentage: number };
    without_features: { count: number; percentage: number };
  };
  by_release_year: {
    with_year: { count: number; percentage: number };
    without_year: { count: number; percentage: number };
  };
  by_album: {
    with_album: { count: number; percentage: number };
    without_album: { count: number; percentage: number };
  };
}

interface TopArtistBySongs {
  artist_id: number;
  name: string;
  unique_songs: number;
  play_count: number;
  total_duration_ms: number;
}

interface LibraryTabProps {
  loading?: boolean;
}

// Format duration nicely
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatLongDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

// Duration bucket categories
const DURATION_BUCKETS = [
  { key: '<2min', min: 0, max: 120, label: '<2 min' },
  { key: '2-3min', min: 120, max: 180, label: '2-3 min' },
  { key: '3-4min', min: 180, max: 240, label: '3-4 min' },
  { key: '4-5min', min: 240, max: 300, label: '4-5 min' },
  { key: '5-7min', min: 300, max: 420, label: '5-7 min' },
  { key: '7-10min', min: 420, max: 600, label: '7-10 min' },
  { key: '>10min', min: 600, max: Infinity, label: '>10 min' },
];

export default function LibraryTab({ loading = false }: LibraryTabProps) {
  const [libraryStats, setLibraryStats] = useState<LibraryStats | null>(null);
  const [libraryGrowth, setLibraryGrowth] = useState<LibraryGrowth | null>(null);
  const [composition, setComposition] = useState<LibraryComposition | null>(null);
  const [topArtists, setTopArtists] = useState<TopArtistBySongs[]>([]);
  const [growthPeriod, setGrowthPeriod] = useState<'day' | 'week' | 'month'>('month');
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all library data
  useEffect(() => {
    const fetchLibraryData = async () => {
      setLoadingData(true);
      setError(null);

      try {
        const [statsRes, growthRes, compositionRes, artistsRes] = await Promise.all([
          fetch('/api/stats/library'),
          fetch(`/api/stats/library/growth?period=${growthPeriod}`),
          fetch('/api/stats/library/composition'),
          fetch('/api/stats/top-artists?period=all&limit=20'),
        ]);

        if (statsRes.ok) {
          setLibraryStats(await statsRes.json());
        }
        if (growthRes.ok) {
          setLibraryGrowth(await growthRes.json());
        }
        if (compositionRes.ok) {
          setComposition(await compositionRes.json());
        }
        if (artistsRes.ok) {
          const data = await artistsRes.json();
          setTopArtists(data.artists || []);
        }
      } catch (e) {
        console.error('Failed to fetch library data:', e);
        setError('Failed to load library statistics');
      } finally {
        setLoadingData(false);
      }
    };

    fetchLibraryData();
  }, [growthPeriod]);

  if (loading || loadingData) {
    return <LibrarySkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <ArchiveBoxIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Error loading library stats</h2>
        <p className="text-gray-400">{error}</p>
      </div>
    );
  }

  if (!libraryStats) {
    return (
      <div className="text-center py-12">
        <ArchiveBoxIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">No library data</h2>
        <p className="text-gray-400">Add some songs to your library to see analytics</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={MusicalNoteIcon}
          label="Total Songs"
          value={libraryStats.total_songs.toLocaleString()}
          subValue={libraryStats.storage_formatted}
          accentColor="pink"
        />
        <StatCard
          icon={RectangleStackIcon}
          label="Albums"
          value={libraryStats.total_albums.toLocaleString()}
          accentColor="purple"
        />
        <StatCard
          icon={UserGroupIcon}
          label="Artists"
          value={libraryStats.total_artists.toLocaleString()}
          accentColor="cyan"
        />
        <StatCard
          icon={ClockIcon}
          label="Total Duration"
          value={libraryStats.total_duration_formatted}
          subValue={`Avg: ${libraryStats.avg_song_length_formatted}`}
          accentColor="amber"
        />
      </div>

      {/* Library Growth Chart */}
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ChartBarIcon className="w-5 h-5 text-pink-500" />
            Library Growth
          </h3>
          <div className="flex gap-1">
            {(['day', 'week', 'month'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setGrowthPeriod(p)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  growthPeriod === p
                    ? 'bg-pink-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <LibraryGrowthChart data={libraryGrowth} />
      </div>

      {/* Songs by Decade + Release Year Distribution */}
      <div className="grid lg:grid-cols-2 gap-6">
        <SongsByDecadeChart decades={libraryStats.songs_by_decade} />
        <ReleaseYearDistribution years={libraryStats.songs_by_year} />
      </div>

      {/* Artists by Song Count + Library Composition */}
      <div className="grid lg:grid-cols-2 gap-6">
        <ArtistsBySongCount artists={topArtists} />
        <LibraryCompositionChart composition={composition} />
      </div>

      {/* Duration Distribution + Album Stats */}
      <div className="grid lg:grid-cols-2 gap-6">
        <DurationDistribution stats={libraryStats} />
        <SongMetadataStats stats={libraryStats} />
      </div>
    </div>
  );
}

// Simple Stat Card component
interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  accentColor?: 'pink' | 'purple' | 'cyan' | 'amber';
}

function StatCard({ icon: Icon, label, value, subValue, accentColor = 'pink' }: StatCardProps) {
  const accentColors = {
    pink: 'text-pink-500 bg-pink-500/10',
    purple: 'text-purple-500 bg-purple-500/10',
    cyan: 'text-cyan-500 bg-cyan-500/10',
    amber: 'text-amber-500 bg-amber-500/10',
  };

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <div className={`w-10 h-10 rounded-xl ${accentColors[accentColor]} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {subValue && <p className="text-xs text-gray-500 mt-1">{subValue}</p>}
    </div>
  );
}

// Library Growth Area Chart
function LibraryGrowthChart({ data }: { data: LibraryGrowth | null }) {
  if (!data || data.data.length === 0) {
    return <p className="text-gray-500 text-sm py-8 text-center">No growth data available</p>;
  }

  // Format dates for display
  const chartData = data.data.map((d) => {
    const date = new Date(d.date);
    return {
      name: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      'Songs Added': d.songs_added,
      'Total Songs': d.cumulative_total,
    };
  });

  // Show last 30 entries max for readability
  const displayData = chartData.slice(-30);

  return (
    <AreaChart
      data={displayData}
      areas={[
        { dataKey: 'Total Songs', name: 'Total Songs', color: CHART_COLORS.primary },
      ]}
      height={280}
      showLegend={false}
      valueFormatter={(value) => value.toLocaleString()}
    />
  );
}

// Songs by Decade Horizontal Bar Chart
function SongsByDecadeChart({ decades }: { decades: { decade: number; count: number }[] }) {
  if (!decades || decades.length === 0) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <CalendarDaysIcon className="w-5 h-5 text-pink-500" />
          Songs by Decade
        </h3>
        <p className="text-gray-500 text-sm">No release year data available</p>
      </div>
    );
  }

  const chartData = decades.map((d) => ({
    name: `${d.decade}s`,
    value: d.count,
  }));

  // Assign colors based on era
  const colors = decades.map((_, i) => getSeriesColor(i));

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <CalendarDaysIcon className="w-5 h-5 text-pink-500" />
        Songs by Decade
      </h3>
      <SimpleBarChart
        data={chartData}
        height={280}
        horizontal
        color={CHART_COLORS.primary}
        valueFormatter={(value) => `${value.toLocaleString()} songs`}
      />
    </div>
  );
}

// Release Year Distribution (Histogram-style bar chart)
function ReleaseYearDistribution({ years }: { years: { year: number; count: number }[] }) {
  if (!years || years.length === 0) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <ChartBarIcon className="w-5 h-5 text-pink-500" />
          Release Year Distribution
        </h3>
        <p className="text-gray-500 text-sm">No release year data available</p>
      </div>
    );
  }

  // Group into 5-year buckets for better visualization
  const grouped: { [key: string]: number } = {};
  years.forEach((y) => {
    const bucket = Math.floor(y.year / 5) * 5;
    const key = `${bucket}-${bucket + 4}`;
    grouped[key] = (grouped[key] || 0) + y.count;
  });

  const chartData = Object.entries(grouped)
    .map(([key, count]) => ({
      name: key,
      value: count,
    }))
    .sort((a, b) => parseInt(a.name) - parseInt(b.name))
    .slice(-15); // Last 15 buckets (75 years)

  const maxCount = Math.max(...chartData.map((d) => d.value));

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <ChartBarIcon className="w-5 h-5 text-pink-500" />
        Release Year Distribution
      </h3>
      <SimpleBarChart
        data={chartData}
        height={280}
        color={CHART_COLORS.secondary}
        valueFormatter={(value) => `${value.toLocaleString()} songs`}
      />
    </div>
  );
}

// Artists by Song Count visualization
function ArtistsBySongCount({ artists }: { artists: TopArtistBySongs[] }) {
  if (!artists || artists.length === 0) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <UserGroupIcon className="w-5 h-5 text-pink-500" />
          Top Artists by Songs
        </h3>
        <p className="text-gray-500 text-sm">No artist data available</p>
      </div>
    );
  }

  const maxSongs = artists[0]?.unique_songs || 1;

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <UserGroupIcon className="w-5 h-5 text-pink-500" />
        Top Artists by Songs
      </h3>
      <div className="space-y-3 max-h-[320px] overflow-y-auto">
        {artists.slice(0, 10).map((artist, i) => (
          <Link
            key={artist.artist_id}
            href={`/artist/${artist.artist_id}`}
            className="flex items-center gap-3 hover:bg-gray-800/50 rounded-lg p-2 -m-2 transition-colors"
          >
            <span className="text-gray-500 w-5 text-sm text-right">{i + 1}</span>
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
              <div className="w-24 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-600 to-pink-500 rounded-full"
                  style={{ width: `${(artist.unique_songs / maxSongs) * 100}%` }}
                />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Library Composition Donut Chart
function LibraryCompositionChart({ composition }: { composition: LibraryComposition | null }) {
  if (!composition) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <RectangleStackIcon className="w-5 h-5 text-pink-500" />
          Library Composition
        </h3>
        <p className="text-gray-500 text-sm">No composition data available</p>
      </div>
    );
  }

  // Create composition summary data
  const compositionData = [
    {
      name: 'With Audio Features',
      value: composition.by_audio_features.with_features.count,
      color: CHART_COLORS.success,
    },
    {
      name: 'Without Audio Features',
      value: composition.by_audio_features.without_features.count,
      color: CHART_COLORS.warning,
    },
  ];

  const metadataStats = [
    {
      label: 'Has Release Year',
      count: composition.by_release_year.with_year.count,
      percentage: composition.by_release_year.with_year.percentage,
    },
    {
      label: 'Has Album Info',
      count: composition.by_album.with_album.count,
      percentage: composition.by_album.with_album.percentage,
    },
    {
      label: 'Verified',
      count: composition.by_verification.verified.count,
      percentage: composition.by_verification.verified.percentage,
    },
    {
      label: 'Audio Analyzed',
      count: composition.by_audio_features.with_features.count,
      percentage: composition.by_audio_features.with_features.percentage,
    },
  ];

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <RectangleStackIcon className="w-5 h-5 text-pink-500" />
        Library Composition
      </h3>
      <div className="space-y-4">
        {/* Metadata completeness bars */}
        {metadataStats.map((stat) => (
          <div key={stat.label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-400">{stat.label}</span>
              <span className="text-gray-300">{stat.percentage}%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-pink-600 to-purple-500 rounded-full transition-all duration-500"
                style={{ width: `${stat.percentage}%` }}
              />
            </div>
          </div>
        ))}

        {/* Source breakdown */}
        {composition.by_source.length > 0 && (
          <div className="pt-4 border-t border-gray-800">
            <p className="text-sm text-gray-400 mb-3">By Source</p>
            <div className="flex flex-wrap gap-2">
              {composition.by_source.map((source, i) => (
                <span
                  key={source.source}
                  className="px-3 py-1 rounded-full text-xs font-medium bg-gray-800 text-gray-300"
                >
                  {source.source}: {source.count.toLocaleString()} ({source.percentage}%)
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Duration Distribution Chart
function DurationDistribution({ stats }: { stats: LibraryStats }) {
  // We need to fetch duration distribution from API
  // For now, show longest and shortest songs as a fallback
  const { longest_song, shortest_song, avg_song_length_sec } = stats;

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <ClockIcon className="w-5 h-5 text-pink-500" />
        Song Duration Stats
      </h3>
      <div className="space-y-4">
        {/* Average duration highlight */}
        <div className="bg-gray-800/50 rounded-xl p-4 text-center">
          <p className="text-sm text-gray-400">Average Song Length</p>
          <p className="text-3xl font-bold text-white mt-1">
            {formatDuration(avg_song_length_sec)}
          </p>
        </div>

        {/* Extremes */}
        <div className="grid grid-cols-2 gap-4">
          {longest_song && (
            <div className="bg-gray-800/30 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-2">Longest Song</p>
              <p className="text-sm font-medium truncate">{longest_song.title}</p>
              <p className="text-xs text-gray-400 truncate">{longest_song.artist}</p>
              <p className="text-lg font-bold text-pink-400 mt-1">
                {formatDuration(longest_song.duration_sec)}
              </p>
            </div>
          )}
          {shortest_song && (
            <div className="bg-gray-800/30 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-2">Shortest Song</p>
              <p className="text-sm font-medium truncate">{shortest_song.title}</p>
              <p className="text-xs text-gray-400 truncate">{shortest_song.artist}</p>
              <p className="text-lg font-bold text-cyan-400 mt-1">
                {formatDuration(shortest_song.duration_sec)}
              </p>
            </div>
          )}
        </div>

        {/* Duration range indicator */}
        {longest_song && shortest_song && (
          <div className="pt-2">
            <p className="text-xs text-gray-500 mb-2">Duration Range</p>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden relative">
              <div
                className="absolute h-full bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-full"
                style={{ left: '0%', width: '100%' }}
              />
              {/* Average marker */}
              <div
                className="absolute w-0.5 h-4 bg-white -top-1 rounded"
                style={{
                  left: `${((avg_song_length_sec - shortest_song.duration_sec) / (longest_song.duration_sec - shortest_song.duration_sec)) * 100}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>{formatDuration(shortest_song.duration_sec)}</span>
              <span className="text-gray-400">avg</span>
              <span>{formatDuration(longest_song.duration_sec)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Song Metadata Stats
function SongMetadataStats({ stats }: { stats: LibraryStats }) {
  const { earliest_year, latest_year, decades_spanned, most_prolific_artist } = stats;

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <ArchiveBoxIcon className="w-5 h-5 text-pink-500" />
        Library Insights
      </h3>
      <div className="space-y-4">
        {/* Year span */}
        {earliest_year && latest_year && (
          <div className="bg-gray-800/30 rounded-xl p-4">
            <p className="text-sm text-gray-400 mb-2">Music Timeline</p>
            <div className="flex items-center justify-between">
              <div className="text-center">
                <p className="text-2xl font-bold text-cyan-400">{earliest_year}</p>
                <p className="text-xs text-gray-500">Earliest</p>
              </div>
              <div className="flex-1 mx-4 h-0.5 bg-gradient-to-r from-cyan-500 to-pink-500 rounded" />
              <div className="text-center">
                <p className="text-2xl font-bold text-pink-400">{latest_year}</p>
                <p className="text-xs text-gray-500">Latest</p>
              </div>
            </div>
            {decades_spanned > 0 && (
              <p className="text-sm text-gray-400 text-center mt-3">
                Spanning <span className="text-white font-semibold">{decades_spanned} decades</span>
              </p>
            )}
          </div>
        )}

        {/* Most prolific artist */}
        {most_prolific_artist && (
          <div className="bg-gray-800/30 rounded-xl p-4">
            <p className="text-sm text-gray-400 mb-2">Most Prolific Artist</p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-lg font-semibold">{most_prolific_artist.name}</p>
                <p className="text-sm text-gray-400">
                  {most_prolific_artist.song_count} songs in your library
                </p>
              </div>
              <div className="text-3xl font-bold text-purple-400">
                #{1}
              </div>
            </div>
          </div>
        )}

        {/* Storage info */}
        <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-xl">
          <span className="text-sm text-gray-400">Total Storage</span>
          <span className="text-lg font-semibold">{stats.storage_formatted}</span>
        </div>
      </div>
    </div>
  );
}

// Skeleton loader
function LibrarySkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-gray-800 mb-3" />
            <div className="h-4 bg-gray-800 rounded w-20 mb-2" />
            <div className="h-6 bg-gray-800 rounded w-16" />
          </div>
        ))}
      </div>
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse h-80" />
      <div className="grid lg:grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse h-80" />
        ))}
      </div>
    </div>
  );
}
