'use client';

import { useState, useEffect } from 'react';
import {
  MusicalNoteIcon,
  SparklesIcon,
  HeartIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import {
  AudioFeaturesRadar,
  SimpleBarChart,
  DonutChart,
  ScatterChart,
  CHART_COLORS,
  getSeriesColor,
  KEY_COLORS,
  MOOD_COLORS,
} from '@/components/charts';
import type { ScatterDataPoint } from '@/components/charts';

// Types for API responses
interface FeatureStats {
  min: number | null;
  max: number | null;
  avg: number | null;
  median: number | null;
  distribution: { range: string; count: number }[];
}

interface AudioFeatureData {
  total_analyzed: number;
  bpm: FeatureStats;
  energy: FeatureStats;
  danceability: FeatureStats;
  acousticness: FeatureStats;
  instrumentalness: FeatureStats;
  speechiness: FeatureStats;
}

interface CorrelationData {
  features: string[];
  correlations: Record<string, number | null>;
  scatter_sample: {
    sha_id: string;
    bpm: number | null;
    energy: number | null;
    danceability: number | null;
    acousticness: number | null;
  }[];
}

interface KeyData {
  key: string;
  mode: string | null;
  camelot: string | null;
  count: number;
  percentage: number;
}

interface KeyDistributionData {
  total_with_key: number;
  keys: KeyData[];
  mode_breakdown: { major: number; minor: number };
}

interface MoodData {
  mood: string;
  count: number;
  percentage: number;
  avg_energy: number | null;
  avg_danceability: number | null;
  avg_bpm: number | null;
}

interface MoodDistributionData {
  total_with_mood: number;
  primary_moods: MoodData[];
  secondary_moods: { mood: string; count: number; percentage: number }[];
}

interface AudioTabProps {
  period?: string;
}

export default function AudioTab({ period = 'all' }: AudioTabProps) {
  const [audioFeatures, setAudioFeatures] = useState<AudioFeatureData | null>(null);
  const [correlations, setCorrelations] = useState<CorrelationData | null>(null);
  const [keyDistribution, setKeyDistribution] = useState<KeyDistributionData | null>(null);
  const [moodDistribution, setMoodDistribution] = useState<MoodDistributionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [featuresRes, correlationsRes, keysRes, moodsRes] = await Promise.all([
          fetch('/api/stats/audio-features'),
          fetch('/api/stats/audio-features/correlation'),
          fetch('/api/stats/keys'),
          fetch('/api/stats/moods'),
        ]);

        const [featuresData, correlationsData, keysData, moodsData] = await Promise.all([
          featuresRes.ok ? featuresRes.json() : null,
          correlationsRes.ok ? correlationsRes.json() : null,
          keysRes.ok ? keysRes.json() : null,
          moodsRes.ok ? moodsRes.json() : null,
        ]);

        setAudioFeatures(featuresData);
        setCorrelations(correlationsData);
        setKeyDistribution(keysData);
        setMoodDistribution(moodsData);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load audio feature data');
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
      {/* Row 1: Feature Radar and BPM Distribution */}
      <div className="grid md:grid-cols-2 gap-6">
        <FeatureRadarPanel data={audioFeatures} loading={loading} />
        <BpmDistributionPanel data={audioFeatures} loading={loading} />
      </div>

      {/* Row 2: Energy vs Danceability Scatter and Key Distribution */}
      <div className="grid md:grid-cols-2 gap-6">
        <EnergyDanceabilityScatter data={correlations} loading={loading} />
        <KeyDistributionPanel data={keyDistribution} loading={loading} />
      </div>

      {/* Row 3: Mood Breakdown and Feature Distributions */}
      <div className="grid md:grid-cols-2 gap-6">
        <MoodBreakdownPanel data={moodDistribution} loading={loading} />
        <FeatureDistributionsPanel data={audioFeatures} loading={loading} />
      </div>
    </div>
  );
}

// Sub-components

function FeatureRadarPanel({
  data,
  loading,
}: {
  data: AudioFeatureData | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
        <div className="h-5 w-40 bg-gray-700 rounded mb-4" />
        <div className="h-64 bg-gray-800 rounded" />
      </div>
    );
  }

  if (!data || data.total_analyzed === 0) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <SparklesIcon className="w-5 h-5 text-pink-500" />
          Audio Feature Profile
        </h3>
        <p className="text-gray-500 text-sm">No audio features analyzed yet</p>
      </div>
    );
  }

  // Normalize features to 0-1 scale (they're already 0-100 for most)
  const features = {
    energy: (data.energy.avg ?? 0) / 100,
    danceability: (data.danceability.avg ?? 0) / 100,
    acousticness: (data.acousticness.avg ?? 0) / 100,
    instrumentalness: (data.instrumentalness.avg ?? 0) / 100,
    speechiness: (data.speechiness.avg ?? 0) / 100,
    valence: 0.5, // Placeholder since we don't have valence
  };

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <SparklesIcon className="w-5 h-5 text-pink-500" />
          Audio Feature Profile
        </h3>
        <span className="text-xs text-gray-500">{data.total_analyzed} songs analyzed</span>
      </div>
      <AudioFeaturesRadar
        features={features}
        height={280}
        mainLabel="Library Average"
      />
    </div>
  );
}

function BpmDistributionPanel({
  data,
  loading,
}: {
  data: AudioFeatureData | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
        <div className="h-5 w-40 bg-gray-700 rounded mb-4" />
        <div className="h-64 bg-gray-800 rounded" />
      </div>
    );
  }

  if (!data || !data.bpm.distribution || data.bpm.distribution.length === 0) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BoltIcon className="w-5 h-5 text-pink-500" />
          BPM Distribution
        </h3>
        <p className="text-gray-500 text-sm">No tempo data available</p>
      </div>
    );
  }

  const chartData = data.bpm.distribution.map((d) => ({
    name: d.range,
    value: d.count,
  }));

  // Color gradient based on tempo
  const tempoColors = CHART_COLORS.tempo;

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <BoltIcon className="w-5 h-5 text-pink-500" />
          BPM Distribution
        </h3>
        {data.bpm.avg && (
          <span className="text-sm text-gray-400">
            Avg: <span className="text-white font-medium">{Math.round(data.bpm.avg)} BPM</span>
          </span>
        )}
      </div>
      <SimpleBarChart
        data={chartData}
        height={250}
        color={CHART_COLORS.secondary}
        valueFormatter={(value) => `${value} songs`}
      />
      {/* BPM Range Summary */}
      <div className="flex justify-between text-xs text-gray-400 mt-2">
        <span>Min: {data.bpm.min ? Math.round(data.bpm.min) : '-'} BPM</span>
        <span>Median: {data.bpm.median ? Math.round(data.bpm.median) : '-'} BPM</span>
        <span>Max: {data.bpm.max ? Math.round(data.bpm.max) : '-'} BPM</span>
      </div>
    </div>
  );
}

function EnergyDanceabilityScatter({
  data,
  loading,
}: {
  data: CorrelationData | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
        <div className="h-5 w-48 bg-gray-700 rounded mb-4" />
        <div className="h-64 bg-gray-800 rounded" />
      </div>
    );
  }

  if (!data || !data.scatter_sample || data.scatter_sample.length === 0) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <HeartIcon className="w-5 h-5 text-pink-500" />
          Energy vs Danceability
        </h3>
        <p className="text-gray-500 text-sm">Not enough data for scatter plot</p>
      </div>
    );
  }

  const scatterData: ScatterDataPoint[] = data.scatter_sample
    .filter((s) => s.energy !== null && s.danceability !== null)
    .map((s) => ({
      x: s.danceability ?? 0,
      y: s.energy ?? 0,
      name: s.sha_id.substring(0, 8),
    }));

  const correlation = data.correlations?.energy_danceability;

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <HeartIcon className="w-5 h-5 text-pink-500" />
          Energy vs Danceability
        </h3>
        {correlation !== null && correlation !== undefined && (
          <span className="text-xs text-gray-400">
            Correlation: <span className={correlation > 0 ? 'text-green-400' : 'text-red-400'}>
              {correlation.toFixed(2)}
            </span>
          </span>
        )}
      </div>
      <ScatterChart
        series={[{
          name: 'Songs',
          data: scatterData,
          color: CHART_COLORS.primary,
        }]}
        height={260}
        xAxisLabel="Danceability"
        yAxisLabel="Energy"
        xDomain={[0, 100]}
        yDomain={[0, 100]}
        referenceLines={[
          { x: 50, color: CHART_COLORS.text.muted },
          { y: 50, color: CHART_COLORS.text.muted },
        ]}
      />
    </div>
  );
}

function KeyDistributionPanel({
  data,
  loading,
}: {
  data: KeyDistributionData | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
        <div className="h-5 w-40 bg-gray-700 rounded mb-4" />
        <div className="h-64 bg-gray-800 rounded" />
      </div>
    );
  }

  if (!data || data.keys.length === 0) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <MusicalNoteIcon className="w-5 h-5 text-pink-500" />
          Key Distribution
        </h3>
        <p className="text-gray-500 text-sm">No key data available</p>
      </div>
    );
  }

  // Prepare data for donut chart - top 8 keys
  const topKeys = data.keys.slice(0, 8);
  const otherCount = data.keys.slice(8).reduce((sum, k) => sum + k.count, 0);

  const chartData = topKeys.map((k) => {
    const keyLabel = k.mode ? `${k.key} ${k.mode}` : k.key;
    const colorKey = k.mode === 'minor' ? `${k.key}m` : k.key;
    return {
      name: keyLabel,
      value: k.count,
      color: KEY_COLORS[colorKey] || KEY_COLORS[k.key] || getSeriesColor(0),
    };
  });

  if (otherCount > 0) {
    chartData.push({
      name: 'Other',
      value: otherCount,
      color: CHART_COLORS.text.muted,
    });
  }

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <MusicalNoteIcon className="w-5 h-5 text-pink-500" />
          Key Distribution
        </h3>
        <span className="text-xs text-gray-500">{data.total_with_key} songs</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <DonutChart
            data={chartData}
            height={220}
            showPercentage
            thickness={35}
            showLegend={false}
          />
        </div>
        <div className="w-32">
          {/* Mode breakdown */}
          <div className="space-y-2">
            <div className="p-2 bg-gray-800/50 rounded">
              <p className="text-xs text-gray-400">Major Keys</p>
              <p className="text-lg font-bold text-white">{data.mode_breakdown.major}</p>
            </div>
            <div className="p-2 bg-gray-800/50 rounded">
              <p className="text-xs text-gray-400">Minor Keys</p>
              <p className="text-lg font-bold text-white">{data.mode_breakdown.minor}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Top key */}
      {data.keys.length > 0 && (
        <p className="text-xs text-gray-400 mt-3 text-center">
          Most common: <span className="text-white font-medium">
            {data.keys[0].key} {data.keys[0].mode || ''}
          </span> ({data.keys[0].percentage}%)
        </p>
      )}
    </div>
  );
}

function MoodBreakdownPanel({
  data,
  loading,
}: {
  data: MoodDistributionData | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
        <div className="h-5 w-40 bg-gray-700 rounded mb-4" />
        <div className="h-64 bg-gray-800 rounded" />
      </div>
    );
  }

  if (!data || data.primary_moods.length === 0) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <HeartIcon className="w-5 h-5 text-pink-500" />
          Mood Breakdown
        </h3>
        <p className="text-gray-500 text-sm">No mood data available</p>
      </div>
    );
  }

  const chartData = data.primary_moods.map((m, i) => ({
    name: m.mood.charAt(0).toUpperCase() + m.mood.slice(1),
    value: m.count,
    color: MOOD_COLORS[m.mood.toLowerCase()] || getSeriesColor(i),
  }));

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <HeartIcon className="w-5 h-5 text-pink-500" />
          Mood Breakdown
        </h3>
        <span className="text-xs text-gray-500">{data.total_with_mood} songs</span>
      </div>

      <DonutChart
        data={chartData}
        height={220}
        showPercentage
        thickness={35}
      />

      {/* Mood details */}
      {data.primary_moods.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {data.primary_moods.slice(0, 4).map((m) => (
            <div key={m.mood} className="flex items-center justify-between p-2 bg-gray-800/50 rounded text-xs">
              <span className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: MOOD_COLORS[m.mood.toLowerCase()] || CHART_COLORS.primary }}
                />
                <span className="capitalize">{m.mood}</span>
              </span>
              <span className="text-gray-400">{m.percentage}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FeatureDistributionsPanel({
  data,
  loading,
}: {
  data: AudioFeatureData | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
        <div className="h-5 w-48 bg-gray-700 rounded mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4">Feature Distributions</h3>
        <p className="text-gray-500 text-sm">No feature data available</p>
      </div>
    );
  }

  const features = [
    { key: 'energy', label: 'Energy', data: data.energy, color: CHART_COLORS.energy[3] },
    { key: 'danceability', label: 'Danceability', data: data.danceability, color: CHART_COLORS.secondary },
    { key: 'acousticness', label: 'Acousticness', data: data.acousticness, color: CHART_COLORS.tertiary },
    { key: 'instrumentalness', label: 'Instrumental', data: data.instrumentalness, color: CHART_COLORS.success },
  ];

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4">Feature Distributions</h3>

      <div className="grid grid-cols-2 gap-4">
        {features.map((feature) => (
          <MiniDistribution
            key={feature.key}
            label={feature.label}
            distribution={feature.data.distribution}
            avg={feature.data.avg}
            color={feature.color}
          />
        ))}
      </div>
    </div>
  );
}

function MiniDistribution({
  label,
  distribution,
  avg,
  color,
}: {
  label: string;
  distribution: { range: string; count: number }[];
  avg: number | null;
  color: string;
}) {
  if (!distribution || distribution.length === 0) {
    return (
      <div className="p-3 bg-gray-800/50 rounded-lg">
        <p className="text-xs text-gray-400 mb-1">{label}</p>
        <p className="text-gray-500 text-xs">No data</p>
      </div>
    );
  }

  const maxCount = Math.max(...distribution.map((d) => d.count));

  return (
    <div className="p-3 bg-gray-800/50 rounded-lg">
      <div className="flex justify-between items-center mb-2">
        <p className="text-xs text-gray-400">{label}</p>
        {avg !== null && (
          <p className="text-xs text-white font-medium">{Math.round(avg)}</p>
        )}
      </div>
      <div className="flex items-end gap-0.5 h-12">
        {distribution.map((d, i) => {
          const height = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
          return (
            <div
              key={i}
              className="flex-1 rounded-t transition-all hover:opacity-80"
              style={{
                height: `${Math.max(height, 4)}%`,
                backgroundColor: color,
                opacity: 0.4 + (height / 100) * 0.6,
              }}
              title={`${d.range}: ${d.count} songs`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 mt-1">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}
