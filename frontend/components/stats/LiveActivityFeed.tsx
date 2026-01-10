'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  PlayIcon,
  CheckCircleIcon,
  ForwardIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { PlayIcon as PlayIconSolid } from '@heroicons/react/24/solid';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { useStatsStream, ActivityItem } from '@/hooks/useStatsStream';
import { LiveIndicator } from './AnimatedCounter';

interface SongDetails {
  sha_id: string;
  title: string;
  artist: string;
  artist_id?: number | null;
  album?: string | null;
  duration_sec?: number;
}

interface LiveActivityFeedProps {
  maxItems?: number;
  showHeader?: boolean;
  className?: string;
}

/**
 * LiveActivityFeed - Real-time feed of listening activity
 *
 * Connects to WebSocket and displays:
 * - Song plays as they happen
 * - Completed plays
 * - Skipped songs
 * - Animated entry of new items
 */
export default function LiveActivityFeed({
  maxItems = 10,
  showHeader = true,
  className = '',
}: LiveActivityFeedProps) {
  const { connected, activity } = useStatsStream({ maxActivityItems: maxItems });
  const [enrichedActivity, setEnrichedActivity] = useState<
    (ActivityItem & { song?: SongDetails })[]
  >([]);
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());
  const prevActivityRef = useRef<string[]>([]);

  // Enrich activity items with song details
  useEffect(() => {
    const enrichItems = async () => {
      const enriched = await Promise.all(
        activity.map(async (item) => {
          // Check if we already have this item enriched
          const existing = enrichedActivity.find((e) => e.id === item.id);
          if (existing?.song) {
            return existing;
          }

          // Fetch song details
          try {
            const res = await fetch(`/api/library/songs/${item.sha_id}`);
            if (res.ok) {
              const song = await res.json();
              return {
                ...item,
                song: {
                  sha_id: item.sha_id,
                  title: song.title,
                  artist: song.artist,
                  artist_id: song.artist_id,
                  album: song.album,
                  duration_sec: song.duration_sec,
                },
              };
            }
          } catch (e) {
            console.error('Failed to fetch song details:', e);
          }

          // Return with type assertion since we're handling the type mismatch
          return item as ActivityItem & { song?: SongDetails };
        })
      );

      setEnrichedActivity(enriched);
    };

    if (activity.length > 0) {
      enrichItems();
    }
  }, [activity]);

  // Track new items for animation
  useEffect(() => {
    const currentIds = activity.map((a) => a.id);
    const prevIds = prevActivityRef.current;

    const newIds = currentIds.filter((id) => !prevIds.includes(id));
    if (newIds.length > 0) {
      setNewItemIds(new Set(newIds));

      // Clear "new" status after animation
      setTimeout(() => {
        setNewItemIds(new Set());
      }, 1000);
    }

    prevActivityRef.current = currentIds;
  }, [activity]);

  const formatTimeAgo = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffSecs < 10) return 'just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'started':
        return <PlayIcon className="w-4 h-4 text-pink-500" />;
      case 'completed':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'skipped':
        return <ForwardIcon className="w-4 h-4 text-yellow-500" />;
      default:
        return <ClockIcon className="w-4 h-4 text-gray-500" />;
    }
  };

  const getEventText = (eventType: string): string => {
    switch (eventType) {
      case 'started':
        return 'Playing';
      case 'completed':
        return 'Completed';
      case 'skipped':
        return 'Skipped';
      default:
        return eventType;
    }
  };

  return (
    <div className={`bg-gray-900/70 rounded-2xl p-5 border border-gray-800 ${className}`}>
      {showHeader && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-pink-500" />
            Live Activity
          </h3>
          <LiveIndicator connected={connected} />
        </div>
      )}

      {!connected && enrichedActivity.length === 0 ? (
        <div className="text-center py-8">
          <ClockIcon className="w-10 h-10 text-gray-600 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">Connecting to live feed...</p>
        </div>
      ) : enrichedActivity.length === 0 ? (
        <div className="text-center py-8">
          <PlayIcon className="w-10 h-10 text-gray-600 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No recent activity</p>
          <p className="text-gray-600 text-xs mt-1">Play a song to see it here</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {enrichedActivity.map((item) => (
            <ActivityItemRow
              key={item.id}
              item={item}
              isNew={newItemIds.has(item.id)}
              formatTimeAgo={formatTimeAgo}
              getEventIcon={getEventIcon}
              getEventText={getEventText}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ActivityItemRowProps {
  item: ActivityItem & { song?: SongDetails };
  isNew: boolean;
  formatTimeAgo: (timestamp: string) => string;
  getEventIcon: (eventType: string) => React.ReactNode;
  getEventText: (eventType: string) => string;
}

function ActivityItemRow({
  item,
  isNew,
  formatTimeAgo,
  getEventIcon,
  getEventText,
}: ActivityItemRowProps) {
  const { playSong } = useMusicPlayer();

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.song) {
      playSong({
        id: item.song.sha_id,
        hashId: item.song.sha_id,
        title: item.song.title,
        artist: item.song.artist,
        album: item.song.album || '',
        duration: item.song.duration_sec || 0,
        albumArt: `/api/library/images/song/${item.song.sha_id}`,
      });
    }
  };

  return (
    <div
      className={`
        flex items-center gap-3 p-2 rounded-lg transition-all duration-300
        ${isNew ? 'bg-pink-900/30 scale-[1.02]' : 'hover:bg-gray-800/50'}
        ${isNew ? 'animate-slideIn' : ''}
      `}
    >
      {/* Event indicator */}
      <div className="flex-shrink-0 w-6 flex justify-center">
        {getEventIcon(item.event_type)}
      </div>

      {/* Song image */}
      <div className="relative flex-shrink-0 group">
        <img
          src={`/api/library/images/song/${item.sha_id}`}
          alt=""
          className="w-10 h-10 rounded bg-gray-800 object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/default-album.svg';
          }}
        />
        {item.song && (
          <button
            onClick={handlePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/60 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <PlayIconSolid className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {/* Song info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {item.song?.title || 'Unknown Song'}
        </p>
        <p className="text-xs text-gray-400 truncate">
          {item.song?.artist_id ? (
            <Link
              href={`/artist/${item.song.artist_id}`}
              className="hover:text-white hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {item.song.artist}
            </Link>
          ) : (
            item.song?.artist || 'Unknown Artist'
          )}
        </p>
      </div>

      {/* Event type and time */}
      <div className="text-right flex-shrink-0">
        <p
          className={`text-xs ${
            item.event_type === 'completed'
              ? 'text-green-400'
              : item.event_type === 'skipped'
              ? 'text-yellow-400'
              : 'text-pink-400'
          }`}
        >
          {getEventText(item.event_type)}
        </p>
        <p className="text-xs text-gray-500">{formatTimeAgo(item.timestamp)}</p>
      </div>
    </div>
  );
}

// Add CSS animation to global styles or include inline
const styles = `
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.animate-slideIn {
  animation: slideIn 0.3s ease-out;
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
