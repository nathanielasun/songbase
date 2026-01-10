'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import {
  MusicalNoteIcon,
  ChartBarIcon,
  ClockIcon,
  SparklesIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  ArrowPathIcon,
  PlusIcon,
  HeartIcon,
  ListBulletIcon,
} from '@heroicons/react/24/outline';

type EmptyStateType =
  | 'no-data'
  | 'no-plays'
  | 'no-songs'
  | 'no-results'
  | 'loading-failed'
  | 'coming-soon'
  | 'no-activity'
  | 'no-favorites'
  | 'no-playlists'
  | 'custom';

interface Suggestion {
  icon?: ReactNode;
  text: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

interface EmptyStateProps {
  type?: EmptyStateType;
  title?: string;
  description?: string;
  icon?: ReactNode;
  suggestions?: Suggestion[];
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
    variant?: 'primary' | 'secondary';
  };
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

// Preset configurations for common empty states
const PRESETS: Record<
  Exclude<EmptyStateType, 'custom'>,
  {
    icon: ReactNode;
    title: string;
    description: string;
    suggestions: Suggestion[];
  }
> = {
  'no-data': {
    icon: <ChartBarIcon className="w-full h-full" />,
    title: 'No Data Available',
    description: 'There\'s no data to display for the selected time period.',
    suggestions: [
      { text: 'Try selecting a different time range' },
      { text: 'Check if you have listening history for this period' },
    ],
  },
  'no-plays': {
    icon: <PlayIcon className="w-full h-full" />,
    title: 'No Listening Activity',
    description: 'Start playing some music to see your stats come to life!',
    suggestions: [
      {
        icon: <MusicalNoteIcon className="w-4 h-4" />,
        text: 'Browse your library',
        action: { label: 'Go to Library', href: '/library' },
      },
      {
        icon: <SparklesIcon className="w-4 h-4" />,
        text: 'Discover new music',
        action: { label: 'Explore', href: '/discover' },
      },
      {
        icon: <ListBulletIcon className="w-4 h-4" />,
        text: 'Check out your playlists',
        action: { label: 'Playlists', href: '/playlists' },
      },
    ],
  },
  'no-songs': {
    icon: <MusicalNoteIcon className="w-full h-full" />,
    title: 'No Songs Yet',
    description: 'Your library is empty. Add some music to get started!',
    suggestions: [
      {
        icon: <PlusIcon className="w-4 h-4" />,
        text: 'Import music from your computer',
        action: { label: 'Import', href: '/library/import' },
      },
      {
        icon: <MagnifyingGlassIcon className="w-4 h-4" />,
        text: 'Search for songs to add',
        action: { label: 'Search', href: '/search' },
      },
    ],
  },
  'no-results': {
    icon: <MagnifyingGlassIcon className="w-full h-full" />,
    title: 'No Results Found',
    description: 'We couldn\'t find anything matching your search.',
    suggestions: [
      { text: 'Try different keywords' },
      { text: 'Check for typos in your search' },
      { text: 'Use fewer or more general terms' },
    ],
  },
  'loading-failed': {
    icon: <ArrowPathIcon className="w-full h-full" />,
    title: 'Failed to Load',
    description: 'Something went wrong while loading this data.',
    suggestions: [
      { text: 'Check your internet connection' },
      { text: 'Try refreshing the page' },
    ],
  },
  'coming-soon': {
    icon: <SparklesIcon className="w-full h-full" />,
    title: 'Coming Soon',
    description: 'This feature is still under development.',
    suggestions: [
      { text: 'Stay tuned for updates!' },
      { text: 'In the meantime, explore other features' },
    ],
  },
  'no-activity': {
    icon: <ClockIcon className="w-full h-full" />,
    title: 'No Recent Activity',
    description: 'There\'s no recent listening activity to show.',
    suggestions: [
      {
        icon: <PlayIcon className="w-4 h-4" />,
        text: 'Play a song to see it here',
        action: { label: 'Browse Library', href: '/library' },
      },
    ],
  },
  'no-favorites': {
    icon: <HeartIcon className="w-full h-full" />,
    title: 'No Favorites Yet',
    description: 'Songs you like will appear here.',
    suggestions: [
      {
        icon: <HeartIcon className="w-4 h-4" />,
        text: 'Click the heart icon on songs you love',
      },
      {
        icon: <MusicalNoteIcon className="w-4 h-4" />,
        text: 'Browse your library to find favorites',
        action: { label: 'Go to Library', href: '/library' },
      },
    ],
  },
  'no-playlists': {
    icon: <ListBulletIcon className="w-full h-full" />,
    title: 'No Playlists',
    description: 'Create a playlist to organize your music.',
    suggestions: [
      {
        icon: <PlusIcon className="w-4 h-4" />,
        text: 'Create your first playlist',
        action: { label: 'Create Playlist', href: '/playlists/new' },
      },
      {
        icon: <SparklesIcon className="w-4 h-4" />,
        text: 'Try our smart playlist feature',
        action: { label: 'Smart Playlists', href: '/playlists/smart' },
      },
    ],
  },
};

/**
 * EmptyState - Accessible empty state component with helpful suggestions
 *
 * Features:
 * - Preset configurations for common scenarios
 * - Actionable suggestions to guide users
 * - Accessible with proper ARIA attributes
 * - Responsive sizing options
 */
export default function EmptyState({
  type = 'no-data',
  title,
  description,
  icon,
  suggestions,
  action,
  className = '',
  size = 'md',
}: EmptyStateProps) {
  const preset = type !== 'custom' ? PRESETS[type] : null;

  const displayTitle = title || preset?.title || 'Nothing Here';
  const displayDescription = description || preset?.description || '';
  const displayIcon = icon || preset?.icon || <ChartBarIcon className="w-full h-full" />;
  const displaySuggestions = suggestions || preset?.suggestions || [];

  const sizeClasses = {
    sm: {
      container: 'py-6',
      icon: 'w-10 h-10',
      title: 'text-base',
      description: 'text-xs',
      suggestion: 'text-xs',
    },
    md: {
      container: 'py-10',
      icon: 'w-14 h-14',
      title: 'text-lg',
      description: 'text-sm',
      suggestion: 'text-sm',
    },
    lg: {
      container: 'py-16',
      icon: 'w-20 h-20',
      title: 'text-xl',
      description: 'text-base',
      suggestion: 'text-base',
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${sizes.container} ${className}`}
      role="status"
      aria-label={displayTitle}
    >
      {/* Icon */}
      <div className={`${sizes.icon} text-gray-600 mb-4`} aria-hidden="true">
        {displayIcon}
      </div>

      {/* Title */}
      <h3 className={`font-semibold text-white mb-2 ${sizes.title}`}>{displayTitle}</h3>

      {/* Description */}
      {displayDescription && (
        <p className={`text-gray-400 max-w-md mb-6 ${sizes.description}`}>
          {displayDescription}
        </p>
      )}

      {/* Suggestions */}
      {displaySuggestions.length > 0 && (
        <div className="space-y-3 mb-6" role="list" aria-label="Suggestions">
          {displaySuggestions.map((suggestion, index) => (
            <div
              key={index}
              className="flex items-center gap-2 text-gray-500"
              role="listitem"
            >
              {suggestion.icon && (
                <span className="text-gray-600" aria-hidden="true">
                  {suggestion.icon}
                </span>
              )}
              <span className={sizes.suggestion}>{suggestion.text}</span>
              {suggestion.action && (
                <>
                  <span className="text-gray-700">•</span>
                  {suggestion.action.href ? (
                    <Link
                      href={suggestion.action.href}
                      className="text-pink-400 hover:text-pink-300 hover:underline transition-colors"
                    >
                      {suggestion.action.label}
                    </Link>
                  ) : (
                    <button
                      onClick={suggestion.action.onClick}
                      className="text-pink-400 hover:text-pink-300 hover:underline transition-colors"
                    >
                      {suggestion.action.label}
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Primary Action */}
      {action && (
        <div className="mt-2">
          {action.href ? (
            <Link
              href={action.href}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-colors ${
                action.variant === 'secondary'
                  ? 'bg-gray-800 hover:bg-gray-700 text-white'
                  : 'bg-pink-600 hover:bg-pink-700 text-white'
              }`}
            >
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-colors ${
                action.variant === 'secondary'
                  ? 'bg-gray-800 hover:bg-gray-700 text-white'
                  : 'bg-pink-600 hover:bg-pink-700 text-white'
              }`}
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Inline empty state for smaller areas (like lists)
 */
interface InlineEmptyStateProps {
  message: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
}

export function InlineEmptyState({ message, action, className = '' }: InlineEmptyStateProps) {
  return (
    <div
      className={`flex items-center justify-center gap-2 py-4 text-gray-500 text-sm ${className}`}
      role="status"
    >
      <span>{message}</span>
      {action && (
        <>
          <span className="text-gray-700">•</span>
          {action.href ? (
            <Link
              href={action.href}
              className="text-pink-400 hover:text-pink-300 hover:underline"
            >
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className="text-pink-400 hover:text-pink-300 hover:underline"
            >
              {action.label}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Skeleton placeholder for loading states
 */
interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular' | 'chart';
  width?: string | number;
  height?: string | number;
  className?: string;
  lines?: number;
}

export function Skeleton({
  variant = 'rectangular',
  width,
  height,
  className = '',
  lines = 1,
}: SkeletonProps) {
  const getVariantClasses = () => {
    switch (variant) {
      case 'text':
        return 'h-4 rounded';
      case 'circular':
        return 'rounded-full';
      case 'chart':
        return 'rounded-lg';
      default:
        return 'rounded-lg';
    }
  };

  const style = {
    width: width ? (typeof width === 'number' ? `${width}px` : width) : undefined,
    height: height ? (typeof height === 'number' ? `${height}px` : height) : undefined,
  };

  if (variant === 'text' && lines > 1) {
    return (
      <div className={`space-y-2 ${className}`} role="status" aria-label="Loading">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`bg-gray-700 animate-pulse ${getVariantClasses()}`}
            style={{
              ...style,
              width: i === lines - 1 ? '60%' : style.width,
            }}
          />
        ))}
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  if (variant === 'chart') {
    return (
      <div
        className={`bg-gray-800/50 animate-pulse rounded-lg p-4 ${className}`}
        style={style}
        role="status"
        aria-label="Loading chart"
      >
        <div className="flex items-end gap-2 h-full">
          {[40, 65, 45, 80, 55, 70, 50, 60, 75, 45].map((percent, i) => (
            <div
              key={i}
              className="flex-1 bg-gray-700 rounded-t"
              style={{ height: `${percent}%` }}
            />
          ))}
        </div>
        <span className="sr-only">Loading chart...</span>
      </div>
    );
  }

  return (
    <div
      className={`bg-gray-700 animate-pulse ${getVariantClasses()} ${className}`}
      style={style}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

/**
 * Card skeleton for stat cards
 */
export function StatCardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-gray-900/70 rounded-2xl p-5 border border-gray-800 ${className}`}
      role="status"
      aria-label="Loading stat card"
    >
      <div className="flex items-start justify-between mb-4">
        <Skeleton variant="circular" width={40} height={40} />
        <Skeleton variant="text" width={60} height={16} />
      </div>
      <Skeleton variant="text" width="40%" height={32} className="mb-2" />
      <Skeleton variant="text" width="60%" height={16} />
      <span className="sr-only">Loading stat card...</span>
    </div>
  );
}

/**
 * List skeleton for lists of items
 */
export function ListSkeleton({
  items = 5,
  showImage = true,
  className = '',
}: {
  items?: number;
  showImage?: boolean;
  className?: string;
}) {
  return (
    <div className={`space-y-3 ${className}`} role="status" aria-label="Loading list">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          {showImage && <Skeleton variant="rectangular" width={48} height={48} />}
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="70%" />
            <Skeleton variant="text" width="40%" />
          </div>
          <Skeleton variant="text" width={40} />
        </div>
      ))}
      <span className="sr-only">Loading list...</span>
    </div>
  );
}
