'use client';

import { useState, useEffect, Suspense, lazy, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  ChartBarIcon,
  ArchiveBoxIcon,
  SparklesIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline';
import {
  OverviewTab,
  FilterBar,
  defaultFilters,
} from '@/components/stats';
import { SwipeableTabs } from '@/components/stats/ResponsiveLayout';
import { StatCardSkeleton, Skeleton } from '@/components/stats/EmptyState';
import type { StatsFilters } from '@/components/stats';

// Lazy load heavy tab components for better initial page load
const LibraryTab = dynamic(() => import('@/components/stats/LibraryTab'), {
  loading: () => <TabLoadingSkeleton />,
  ssr: false,
});

const AudioTab = dynamic(() => import('@/components/stats/AudioTab'), {
  loading: () => <TabLoadingSkeleton />,
  ssr: false,
});

const InsightsTab = dynamic(() => import('@/components/stats/InsightsTab'), {
  loading: () => <TabLoadingSkeleton />,
  ssr: false,
});

// Loading skeleton for lazy-loaded tabs
function TabLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <Skeleton variant="text" width="30%" height={24} className="mb-4" />
        <Skeleton variant="chart" height={300} />
      </div>
    </div>
  );
}

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
type Tab = 'overview' | 'library' | 'audio' | 'insights';

const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'overview', label: 'Overview', icon: ChartBarIcon },
  { key: 'library', label: 'Library', icon: ArchiveBoxIcon },
  { key: 'audio', label: 'Audio', icon: SparklesIcon },
  { key: 'insights', label: 'Insights', icon: LightBulbIcon },
];

// Wrapper component to handle Suspense for useSearchParams
function StatsPageContent() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [filters, setFilters] = useState<StatsFilters>(defaultFilters);
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [topSongs, setTopSongs] = useState<TopSong[]>([]);
  const [topArtists, setTopArtists] = useState<TopArtist[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Build period string from filters
  const getPeriodParam = () => {
    if (filters.period === 'custom' && filters.startDate && filters.endDate) {
      return `${filters.startDate}:${filters.endDate}`;
    }
    return filters.period;
  };

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError(null);

      const periodParam = getPeriodParam();

      try {
        const [overviewRes, songsRes, artistsRes, heatmapRes, historyRes] = await Promise.all([
          fetch(`/api/stats/overview?period=${periodParam}`),
          fetch(`/api/stats/top-songs?period=${periodParam}&limit=10`),
          fetch(`/api/stats/top-artists?period=${periodParam}&limit=10`),
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
  }, [filters.period, filters.startDate, filters.endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <ChartBarIcon className="w-8 h-8 text-pink-500" />
              Your Stats
            </h1>
            <p className="text-gray-400 mt-1">Track your music listening habits</p>
          </div>
        </div>

        {/* Swipeable Tab Navigation */}
        <SwipeableTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab as Tab)}
        >
          {/* Filter Bar - show on tabs that support filtering */}
          {(activeTab === 'overview' || activeTab === 'audio') && (
            <FilterBar
              filters={filters}
              onFiltersChange={setFilters}
              showPeriodSelector={true}
              showAdvancedFilters={activeTab === 'overview'}
              className="mb-6"
            />
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-6">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <OverviewTab
              period={filters.period}
              overview={overview}
              topSongs={topSongs}
              topArtists={topArtists}
              heatmap={heatmap}
              history={history}
              loading={loading}
            />
          )}

          {activeTab === 'library' && (
            <LibraryTab loading={loading} />
          )}

          {activeTab === 'audio' && (
            <AudioTab period={filters.period} />
          )}

          {activeTab === 'insights' && (
            <InsightsTab loading={loading} />
          )}
        </SwipeableTabs>
      </div>
    </div>
  );
}

// Main export with Suspense wrapper for useSearchParams
export default function StatsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse">
            <div className="h-10 w-48 bg-gray-800 rounded mb-4" />
            <div className="h-8 w-64 bg-gray-800 rounded mb-6" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-800 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    }>
      <StatsPageContent />
    </Suspense>
  );
}
