'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Types for WebSocket messages
export interface StatsOverview {
  total_plays: number;
  total_duration_formatted: string;
  total_duration_ms: number;
  unique_songs: number;
  unique_artists: number;
  current_streak_days: number;
  longest_streak_days: number;
  avg_plays_per_day: number;
  avg_completion_percent: number;
}

export interface PlayUpdateEvent {
  type: 'play_update';
  event_type: 'started' | 'completed' | 'skipped' | 'paused' | 'resumed';
  sha_id: string;
  session_id: string | null;
  timestamp: string;
  today_plays: number;
  today_duration_formatted: string;
  current_streak: number;
  song?: {
    title: string;
    artist: string;
    album?: string;
  };
}

export interface StatsMessage {
  type: 'initial' | 'periodic' | 'refresh' | 'play_update' | 'pong';
  timestamp: string;
  stats?: Partial<StatsOverview>;
  event_type?: string;
  sha_id?: string;
  session_id?: string;
  today_plays?: number;
  today_duration_formatted?: string;
  current_streak?: number;
}

export interface ActivityItem {
  id: string;
  sha_id: string;
  event_type: 'started' | 'completed' | 'skipped';
  timestamp: string;
  song?: {
    title: string;
    artist: string;
    album?: string;
  };
}

interface UseStatsStreamOptions {
  enabled?: boolean;
  onPlayUpdate?: (event: PlayUpdateEvent) => void;
  maxActivityItems?: number;
}

interface UseStatsStreamReturn {
  connected: boolean;
  stats: Partial<StatsOverview>;
  lastUpdate: Date | null;
  activity: ActivityItem[];
  refresh: () => void;
  error: string | null;
}

export function useStatsStream(options: UseStatsStreamOptions = {}): UseStatsStreamReturn {
  const { enabled = true, onPlayUpdate, maxActivityItems = 20 } = options;

  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<Partial<StatsOverview>>({});
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled) return;

    cleanup();

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/stats/stream/live`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Set up ping interval to keep connection alive
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const message: StatsMessage = JSON.parse(event.data);
          setLastUpdate(new Date());

          switch (message.type) {
            case 'initial':
            case 'refresh':
              if (message.stats) {
                setStats(message.stats);
              }
              break;

            case 'periodic':
              if (message.stats) {
                setStats((prev) => ({ ...prev, ...message.stats }));
              }
              break;

            case 'play_update':
              // Update quick stats
              if (message.today_plays !== undefined) {
                setStats((prev) => ({
                  ...prev,
                  total_plays: message.today_plays,
                  total_duration_formatted: message.today_duration_formatted,
                  current_streak_days: message.current_streak,
                }));
              }

              // Add to activity feed
              if (message.sha_id && message.event_type) {
                const activityItem: ActivityItem = {
                  id: `${message.sha_id}-${message.timestamp}`,
                  sha_id: message.sha_id,
                  event_type: message.event_type as ActivityItem['event_type'],
                  timestamp: message.timestamp,
                };

                setActivity((prev) => {
                  const newActivity = [activityItem, ...prev].slice(0, maxActivityItems);
                  return newActivity;
                });

                // Call callback if provided
                if (onPlayUpdate) {
                  onPlayUpdate(message as unknown as PlayUpdateEvent);
                }
              }
              break;

            case 'pong':
              // Connection is alive
              break;
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('Connection error');
      };

      ws.onclose = () => {
        setConnected(false);

        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Attempt to reconnect with exponential backoff
        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current += 1;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setError('Connection lost. Please refresh the page.');
        }
      };
    } catch (e) {
      setError('Failed to connect');
      console.error('WebSocket connection error:', e);
    }
  }, [enabled, cleanup, maxActivityItems, onPlayUpdate]);

  const refresh = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'refresh' }));
    }
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      cleanup();
    };
  }, [enabled, connect, cleanup]);

  return {
    connected,
    stats,
    lastUpdate,
    activity,
    refresh,
    error,
  };
}

export default useStatsStream;
