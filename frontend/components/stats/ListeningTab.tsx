'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CalendarIcon,
  ClockIcon,
  ForwardIcon,
  ChartBarIcon,
  PlayCircleIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import {
  LineChart,
  ComparisonLineChart,
  DonutChart,
  SimpleBarChart,
  CHART_COLORS,
  getSeriesColor,
} from '@/components/charts';

// Types for API responses
interface TimelineData {
  date: string;
  plays: number;
  duration_ms: number;
  completed: number;
  avg_completion: number;
  previous_plays: number;
  previous_duration_ms: number;
}

interface CompletionTrendData {
  date: string;
  total_plays: number;
  completed: number;
  skipped: number;
  avg_completion: number;
  completion_rate: number;
  skip_rate: number;
}

interface SkippedSong {
  sha_id: string;
  title: string;
  artist: string;
  total_plays: number;
  skip_count: number;
  skip_rate: number;
}

interface ContextData {
  context: string;
  plays: number;
  percentage: number;
  duration_ms: number;
  completed: number;
  avg_completion: number;
}

interface SessionDistribution {
  range: string;
  count: number;
  percentage: number;
}

interface LongestSession {
  start: string;
  end: string;
  songs_played: number;
  duration_ms: number;
  session_length_formatted: string;
}

interface HeatmapSlot {
  day: number;
  hour: number;
  plays: number;
  top_song: {
    sha_id: string;
    title: string;
    artist: string;
    plays: number;
  } | null;
}

interface EnhancedHeatmapData {
  year: number;
  data: HeatmapSlot[];
  peak_day: string;
  peak_hour: number;
  day_totals: { day: string; plays: number }[];
  hour_totals: { hour: number; plays: number }[];
}

interface ListeningTabProps {
  period: string;
}

export default function ListeningTab({ period }: ListeningTabProps) {
  const [timeline, setTimeline] = useState<TimelineData[]>([]);
  const [completionTrend, setCompletionTrend] = useState<{
    data: CompletionTrendData[];
    summary: { avg_completion_rate: number; avg_skip_rate: number };
  } | null>(null);
  const [skipAnalysis, setSkipAnalysis] = useState<{
    most_skipped_songs: SkippedSong[];
    skip_rate_by_genre: { genre: string; skip_rate: number }[];
    skip_rate_by_hour: { hour: number; skip_rate: number }[];
  } | null>(null);
  const [contextDist, setContextDist] = useState<ContextData[]>([]);
  const [sessions, setSessions] = useState<{
    total_sessions: number;
    avg_songs_per_session: number;
    avg_session_length_formatted: string;
    length_distribution: SessionDistribution[];
    longest_sessions: LongestSession[];
  } | null>(null);
  const [heatmap, setHeatmap] = useState<EnhancedHeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [
          timelineRes,
          completionRes,
          skipRes,
          contextRes,
          sessionsRes,
          heatmapRes,
        ] = await Promise.all([
          fetch(`/api/stats/listening/timeline?period=${period}`),
          fetch(`/api/stats/listening/completion-trend?period=${period}`),
          fetch(`/api/stats/listening/skip-analysis?period=${period}&limit=10`),
          fetch(`/api/stats/listening/context?period=${period}`),
          fetch(`/api/stats/listening/sessions?period=${period}`),
          fetch(`/api/stats/heatmap/enhanced`),
        ]);

        const [
          timelineData,
          completionData,
          skipData,
          contextData,
          sessionsData,
          heatmapData,
        ] = await Promise.all([
          timelineRes.ok ? timelineRes.json() : { timeline: [] },
          completionRes.ok ? completionRes.json() : null,
          skipRes.ok ? skipRes.json() : null,
          contextRes.ok ? contextRes.json() : { distribution: [] },
          sessionsRes.ok ? sessionsRes.json() : null,
          heatmapRes.ok ? heatmapRes.json() : null,
        ]);

        setTimeline(timelineData.timeline || []);
        setCompletionTrend(completionData);
        setSkipAnalysis(skipData);
        setContextDist(contextData.distribution || []);
        setSessions(sessionsData);
        setHeatmap(heatmapData);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [period]);

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-700 rounded-xl p-4">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Row 1: Timeline and Heatmap */}
      <div className="grid md:grid-cols-2 gap-6">
        <ListeningTimeline data={timeline} loading={loading} />
        <EnhancedHeatmap data={heatmap} loading={loading} />
      </div>

      {/* Row 2: Completion Trend and Context Distribution */}
      <div className="grid md:grid-cols-2 gap-6">
        <CompletionRateTrend data={completionTrend} loading={loading} />
        <ContextDistributionChart data={contextDist} loading={loading} />
      </div>

      {/* Row 3: Skip Analysis and Sessions */}
      <div className="grid md:grid-cols-2 gap-6">
        <SkipAnalysisPanel data={skipAnalysis} loading={loading} />
        <SessionsPanel data={sessions} loading={loading} />
      </div>
    </div>
  );
}

// Sub-components

function ListeningTimeline({
  data,
  loading,
}: {
  data: TimelineData[];
  loading: boolean;
}) {
  const chartData = data.map((d) => ({
    name: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    current: d.plays,
    previous: d.previous_plays,
  }));

  return (
    <ComparisonLineChart
      data={chartData}
      title="Listening Timeline"
      subtitle="Plays compared to previous period"
      height={280}
      currentLabel="This Period"
      previousLabel="Previous Period"
      loading={loading}
      valueFormatter={(value) => `${value} plays`}
    />
  );
}

function EnhancedHeatmap({
  data,
  loading,
}: {
  data: EnhancedHeatmapData | null;
  loading: boolean;
}) {
  const [selectedSlot, setSelectedSlot] = useState<HeatmapSlot | null>(null);

  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-pink-500" />
          When You Listen
        </h3>
        <div className="animate-pulse space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-1">
              {[...Array(7)].map((_, j) => (
                <div key={j} className="w-8 h-8 bg-gray-700 rounded" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

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
  const playMap = new Map<string, HeatmapSlot>();
  let maxPlays = 0;
  data.data.forEach((d) => {
    playMap.set(`${d.day}-${d.hour}`, d);
    if (d.plays > maxPlays) maxPlays = d.plays;
  });

  const getIntensity = (plays: number) => {
    if (plays === 0 || !maxPlays) return 'bg-gray-800 hover:bg-gray-700';
    const ratio = plays / maxPlays;
    if (ratio < 0.25) return 'bg-pink-900/50 hover:bg-pink-900/70';
    if (ratio < 0.5) return 'bg-pink-700/60 hover:bg-pink-700/80';
    if (ratio < 0.75) return 'bg-pink-600/70 hover:bg-pink-600/90';
    return 'bg-pink-500 hover:bg-pink-400';
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
            <span key={h}>
              {h === 0 ? '12am' : h === 12 ? '12pm' : `${h % 12}${h < 12 ? 'am' : 'pm'}`}
            </span>
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
                const slot = playMap.get(`${dayIndex}-${hour}`);
                const plays = slot?.plays || 0;
                return (
                  <button
                    key={`${dayIndex}-${hour}`}
                    className={`aspect-square rounded cursor-pointer transition-colors ${getIntensity(plays)}`}
                    title={`${days[dayIndex]} ${hour}:00 - ${plays} plays`}
                    onClick={() => slot && setSelectedSlot(slot)}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Peak info */}
      <p className="text-xs text-gray-400 mt-4">
        Most active: {data.peak_day}s at {data.peak_hour}:00
      </p>

      {/* Selected slot tooltip */}
      {selectedSlot && selectedSlot.top_song && (
        <div className="mt-4 p-3 bg-gray-800/50 rounded-lg">
          <p className="text-xs text-gray-400">Top song at this time:</p>
          <p className="text-sm font-medium truncate">{selectedSlot.top_song.title}</p>
          <p className="text-xs text-gray-400">
            {selectedSlot.top_song.artist} - {selectedSlot.top_song.plays} plays
          </p>
        </div>
      )}
    </div>
  );
}

function CompletionRateTrend({
  data,
  loading,
}: {
  data: {
    data: CompletionTrendData[];
    summary: { avg_completion_rate: number; avg_skip_rate: number };
  } | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
        <div className="h-5 w-32 bg-gray-700 rounded mb-4" />
        <div className="h-64 bg-gray-800 rounded" />
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <ChartBarIcon className="w-5 h-5 text-pink-500" />
          Completion Rate Trend
        </h3>
        <p className="text-gray-500 text-sm">Not enough data yet</p>
      </div>
    );
  }

  const chartData = data.data.map((d) => ({
    name: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    completion_rate: d.completion_rate,
    skip_rate: d.skip_rate,
  }));

  return (
    <LineChart
      data={chartData}
      lines={[
        { dataKey: 'completion_rate', name: 'Completion %', color: CHART_COLORS.success },
        { dataKey: 'skip_rate', name: 'Skip %', color: CHART_COLORS.danger, dashed: true },
      ]}
      title="Completion Rate Trend"
      subtitle={`Avg: ${data.summary.avg_completion_rate}% completed, ${data.summary.avg_skip_rate}% skipped`}
      height={280}
      showLegend
      yAxisDomain={[0, 100]}
      valueFormatter={(value) => `${value}%`}
    />
  );
}

function ContextDistributionChart({
  data,
  loading,
}: {
  data: ContextData[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
        <div className="h-5 w-32 bg-gray-700 rounded mb-4" />
        <div className="h-64 bg-gray-800 rounded" />
      </div>
    );
  }

  const contextLabels: Record<string, string> = {
    radio: 'Radio',
    playlist: 'Playlist',
    album: 'Album',
    artist: 'Artist',
    search: 'Search',
    queue: 'Queue',
    'for-you': 'For You',
    unknown: 'Direct Play',
  };

  const chartData = data.map((d, i) => ({
    name: contextLabels[d.context] || d.context,
    value: d.plays,
    color: getSeriesColor(i),
  }));

  return (
    <DonutChart
      data={chartData}
      title="Play Context"
      subtitle="Where your plays originated"
      height={280}
      showPercentage
      thickness={40}
    />
  );
}

function SkipAnalysisPanel({
  data,
  loading,
}: {
  data: {
    most_skipped_songs: SkippedSong[];
    skip_rate_by_genre: { genre: string; skip_rate: number }[];
    skip_rate_by_hour: { hour: number; skip_rate: number }[];
  } | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
        <div className="h-5 w-32 bg-gray-700 rounded mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.most_skipped_songs.length === 0) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <ForwardIcon className="w-5 h-5 text-pink-500" />
          Skip Analysis
        </h3>
        <p className="text-gray-500 text-sm">Not enough data yet</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <ForwardIcon className="w-5 h-5 text-pink-500" />
        Skip Analysis
      </h3>

      <div className="space-y-4">
        {/* Most Skipped Songs */}
        <div>
          <h4 className="text-sm text-gray-400 mb-2">Most Skipped Songs</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {data.most_skipped_songs.slice(0, 5).map((song) => (
              <div
                key={song.sha_id}
                className="flex items-center justify-between p-2 bg-gray-800/50 rounded"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{song.title}</p>
                  <p className="text-xs text-gray-400 truncate">{song.artist}</p>
                </div>
                <div className="text-right ml-2">
                  <p className="text-sm text-red-400">{song.skip_rate}%</p>
                  <p className="text-xs text-gray-500">
                    {song.skip_count}/{song.total_plays}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Skip by Genre */}
        {data.skip_rate_by_genre.length > 0 && (
          <div>
            <h4 className="text-sm text-gray-400 mb-2">Skip Rate by Genre</h4>
            <div className="flex flex-wrap gap-2">
              {data.skip_rate_by_genre.slice(0, 5).map((g) => (
                <span
                  key={g.genre}
                  className="px-2 py-1 bg-gray-800 rounded text-xs"
                >
                  {g.genre}: <span className="text-red-400">{g.skip_rate}%</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionsPanel({
  data,
  loading,
}: {
  data: {
    total_sessions: number;
    avg_songs_per_session: number;
    avg_session_length_formatted: string;
    length_distribution: SessionDistribution[];
    longest_sessions: LongestSession[];
  } | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
        <div className="h-5 w-32 bg-gray-700 rounded mb-4" />
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-800 rounded" />
          ))}
        </div>
        <div className="h-32 bg-gray-800 rounded" />
      </div>
    );
  }

  if (!data || data.total_sessions === 0) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <PlayCircleIcon className="w-5 h-5 text-pink-500" />
          Listening Sessions
        </h3>
        <p className="text-gray-500 text-sm">Not enough data yet</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <PlayCircleIcon className="w-5 h-5 text-pink-500" />
        Listening Sessions
      </h3>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-gray-800/50 rounded-lg">
          <p className="text-2xl font-bold text-white">{data.total_sessions}</p>
          <p className="text-xs text-gray-400">Sessions</p>
        </div>
        <div className="text-center p-3 bg-gray-800/50 rounded-lg">
          <p className="text-2xl font-bold text-white">{data.avg_songs_per_session}</p>
          <p className="text-xs text-gray-400">Avg Songs</p>
        </div>
        <div className="text-center p-3 bg-gray-800/50 rounded-lg">
          <p className="text-2xl font-bold text-white">{data.avg_session_length_formatted}</p>
          <p className="text-xs text-gray-400">Avg Length</p>
        </div>
      </div>

      {/* Length Distribution */}
      <div className="space-y-2">
        <h4 className="text-sm text-gray-400">Session Length Distribution</h4>
        {data.length_distribution.map((bucket) => (
          <div key={bucket.range} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-16">{bucket.range}</span>
            <div className="flex-1 h-4 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-pink-600 rounded-full transition-all"
                style={{ width: `${bucket.percentage}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 w-12 text-right">
              {bucket.count} ({bucket.percentage}%)
            </span>
          </div>
        ))}
      </div>

      {/* Longest Session */}
      {data.longest_sessions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <h4 className="text-sm text-gray-400 mb-2">Longest Session</h4>
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <p className="text-lg font-semibold">
              {data.longest_sessions[0].session_length_formatted}
            </p>
            <p className="text-sm text-gray-400">
              {data.longest_sessions[0].songs_played} songs played
            </p>
            <p className="text-xs text-gray-500">
              {new Date(data.longest_sessions[0].start).toLocaleDateString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
