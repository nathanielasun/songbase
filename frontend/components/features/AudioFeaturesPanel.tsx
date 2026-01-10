'use client';

import { useCallback, useEffect, useState } from 'react';
import { MusicalNoteIcon } from '@heroicons/react/24/outline';

// Direct backend URL for SSE connections
const SSE_BACKEND_URL = process.env.NEXT_PUBLIC_SSE_BACKEND_URL || 'http://localhost:8000';

interface FeatureStats {
  total_songs: number;
  analyzed: number;
  pending: number;
  failed: number;
  avg_analysis_time_ms: number | null;
  last_analysis: string | null;
}

interface AnalysisProgress {
  current: number;
  total: number;
  sha_id: string;
  title: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  duration_ms?: number;
}

interface AudioFeaturesPanelProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
}

export function AudioFeaturesPanel({ isCollapsed = false, onToggle }: AudioFeaturesPanelProps) {
  const [stats, setStats] = useState<FeatureStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [analysisResults, setAnalysisResults] = useState<{
    processed: number;
    failed: number;
    skipped: number;
  } | null>(null);

  // Analysis settings
  const [limit, setLimit] = useState(100);
  const [force, setForce] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/features/stats/summary');
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      setStats(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const startAnalysis = useCallback(async () => {
    setAnalyzing(true);
    setProgress(null);
    setAnalysisResults(null);
    setError(null);

    try {
      const url = new URL(`${SSE_BACKEND_URL}/api/features/analyze/stream`);
      url.searchParams.set('limit', limit.toString());
      if (force) url.searchParams.set('force', 'true');

      const eventSource = new EventSource(url.toString());

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'progress') {
            setProgress({
              current: data.current,
              total: data.total,
              sha_id: data.sha_id,
              title: data.title,
              status: data.status,
              message: data.message,
              duration_ms: data.duration_ms,
            });
          } else if (data.type === 'complete') {
            setAnalysisResults({
              processed: data.processed,
              failed: data.failed,
              skipped: data.skipped,
            });
            setAnalyzing(false);
            eventSource.close();
            fetchStats(); // Refresh stats
          } else if (data.type === 'error') {
            setError(data.message);
            setAnalyzing(false);
            eventSource.close();
          }
        } catch (e) {
          console.error('Failed to parse SSE data:', e);
        }
      };

      eventSource.onerror = () => {
        setError('Connection lost');
        setAnalyzing(false);
        eventSource.close();
      };

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start analysis');
      setAnalyzing(false);
    }
  }, [limit, force, fetchStats]);

  const stopAnalysis = useCallback(async () => {
    try {
      await fetch('/api/features/analyze/stop', { method: 'POST' });
    } catch (e) {
      console.error('Failed to stop analysis:', e);
    }
  }, []);

  const progressPercent = stats
    ? Math.round((stats.analyzed / stats.total_songs) * 100) || 0
    : 0;

  const currentProgressPercent = progress
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  if (loading) {
    return (
      <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
        <div className="flex items-center gap-3">
          <MusicalNoteIcon className="h-5 w-5 text-gray-300" />
          <h2 className="text-xl font-semibold">Audio Features</h2>
        </div>
        <div className="mt-4 text-gray-500">Loading...</div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MusicalNoteIcon className="h-5 w-5 text-gray-300" />
          <h2 className="text-xl font-semibold">Audio Features</h2>
        </div>
        {onToggle && (
          <button
            onClick={onToggle}
            className="rounded-full p-1 text-gray-400 hover:text-white"
          >
            {isCollapsed ? '▼' : '▲'}
          </button>
        )}
      </div>

      {!isCollapsed && (
        <>
          <p className="text-sm text-gray-400 mt-2">
            Extract BPM, key, energy, mood, danceability, and acoustic features from audio files.
          </p>

          {error && (
            <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {stats && (
            <div className="mt-5">
              {/* Progress bar */}
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-400">
                  Analyzed: {stats.analyzed.toLocaleString()} / {stats.total_songs.toLocaleString()} songs
                </span>
                <span className="text-gray-300 font-medium">{progressPercent}%</span>
              </div>
              <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="rounded-lg bg-gray-800/50 p-3">
                  <p className="text-xs text-gray-500 uppercase">Pending</p>
                  <p className="text-lg font-semibold text-yellow-400">{stats.pending.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-gray-800/50 p-3">
                  <p className="text-xs text-gray-500 uppercase">Failed</p>
                  <p className="text-lg font-semibold text-red-400">{stats.failed.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-gray-800/50 p-3">
                  <p className="text-xs text-gray-500 uppercase">Avg Time</p>
                  <p className="text-lg font-semibold">
                    {stats.avg_analysis_time_ms
                      ? `${(stats.avg_analysis_time_ms / 1000).toFixed(1)}s`
                      : '--'}
                  </p>
                </div>
              </div>

              {/* Last analysis time */}
              <p className="text-xs text-gray-500 mt-3">
                Last analysis:{' '}
                {stats.last_analysis
                  ? new Date(stats.last_analysis).toLocaleString()
                  : 'Never'}
              </p>
            </div>
          )}

          {/* Analysis controls */}
          <div className="mt-6 pt-4 border-t border-gray-800">
            {!analyzing ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Limit</label>
                    <input
                      type="number"
                      value={limit}
                      onChange={(e) => setLimit(Math.max(1, Math.min(1000, parseInt(e.target.value) || 100)))}
                      className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
                      min={1}
                      max={1000}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <input
                      type="checkbox"
                      id="force-reanalyze"
                      checked={force}
                      onChange={(e) => setForce(e.target.checked)}
                      className="rounded border-gray-600"
                    />
                    <label htmlFor="force-reanalyze" className="text-sm text-gray-400">
                      Re-analyze existing
                    </label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={startAnalysis}
                    disabled={stats?.pending === 0 && !force}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors"
                  >
                    {force ? 'Re-analyze' : 'Analyze Remaining'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Current progress */}
                {progress && (
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-400">
                        Progress: {progress.current} / {progress.total}
                      </span>
                      <span className="text-gray-300">{currentProgressPercent}%</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-blue-500 transition-all duration-200"
                        style={{ width: `${currentProgressPercent}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className={
                        progress.status === 'success' ? 'text-green-400' :
                        progress.status === 'error' ? 'text-red-400' :
                        'text-yellow-400'
                      }>
                        {progress.status === 'success' ? '✓' : progress.status === 'error' ? '✗' : '⏭'}
                      </span>
                      <span className="text-gray-300 truncate" title={progress.title}>
                        {progress.title}
                      </span>
                      {progress.duration_ms && (
                        <span className="text-gray-500 text-xs ml-auto">
                          {(progress.duration_ms / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <button
                  onClick={stopAnalysis}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors"
                >
                  Stop Analysis
                </button>
              </div>
            )}

            {/* Results summary */}
            {analysisResults && (
              <div className="mt-4 p-3 bg-gray-800/50 rounded-lg">
                <p className="text-sm font-medium mb-2">Analysis Complete</p>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-400">{analysisResults.processed} processed</span>
                  <span className="text-red-400">{analysisResults.failed} failed</span>
                  <span className="text-yellow-400">{analysisResults.skipped} skipped</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default AudioFeaturesPanel;
