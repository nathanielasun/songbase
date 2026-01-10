'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronRightIcon,
  HomeIcon,
  XMarkIcon,
  MusicalNoteIcon,
  UserGroupIcon,
  RectangleStackIcon,
  TagIcon,
} from '@heroicons/react/24/outline';

// Types for drill-down navigation
export interface DrillDownItem {
  id: string;
  type: 'genre' | 'artist' | 'album' | 'playlist' | 'year' | 'mood';
  label: string;
  value: string | number;
}

interface DrillDownContextValue {
  breadcrumbs: DrillDownItem[];
  addDrillDown: (item: DrillDownItem) => void;
  removeDrillDown: (id: string) => void;
  clearDrillDowns: () => void;
  goToBreadcrumb: (index: number) => void;
  hasDrillDowns: boolean;
  // Navigation helpers
  drillToGenre: (genre: string) => void;
  drillToArtist: (artistId: number, artistName: string) => void;
  drillToAlbum: (albumId: string, albumName: string) => void;
  drillToYear: (year: number) => void;
  drillToMood: (mood: string) => void;
  // Navigate to pages
  navigateToArtist: (artistId: number) => void;
  navigateToAlbum: (albumId: string) => void;
}

const DrillDownContext = createContext<DrillDownContextValue | null>(null);

interface DrillDownProviderProps {
  children: ReactNode;
  onDrillDownChange?: (breadcrumbs: DrillDownItem[]) => void;
}

export function DrillDownProvider({ children, onDrillDownChange }: DrillDownProviderProps) {
  const router = useRouter();
  const [breadcrumbs, setBreadcrumbs] = useState<DrillDownItem[]>([]);

  const addDrillDown = useCallback((item: DrillDownItem) => {
    setBreadcrumbs((prev) => {
      // Don't add duplicate
      if (prev.some((b) => b.id === item.id)) {
        return prev;
      }
      const newBreadcrumbs = [...prev, item];
      onDrillDownChange?.(newBreadcrumbs);
      return newBreadcrumbs;
    });
  }, [onDrillDownChange]);

  const removeDrillDown = useCallback((id: string) => {
    setBreadcrumbs((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      if (index === -1) return prev;
      const newBreadcrumbs = prev.slice(0, index);
      onDrillDownChange?.(newBreadcrumbs);
      return newBreadcrumbs;
    });
  }, [onDrillDownChange]);

  const clearDrillDowns = useCallback(() => {
    setBreadcrumbs([]);
    onDrillDownChange?.([]);
  }, [onDrillDownChange]);

  const goToBreadcrumb = useCallback((index: number) => {
    setBreadcrumbs((prev) => {
      const newBreadcrumbs = prev.slice(0, index + 1);
      onDrillDownChange?.(newBreadcrumbs);
      return newBreadcrumbs;
    });
  }, [onDrillDownChange]);

  // Convenience methods for common drill-downs
  const drillToGenre = useCallback((genre: string) => {
    addDrillDown({
      id: `genre-${genre}`,
      type: 'genre',
      label: genre,
      value: genre,
    });
  }, [addDrillDown]);

  const drillToArtist = useCallback((artistId: number, artistName: string) => {
    addDrillDown({
      id: `artist-${artistId}`,
      type: 'artist',
      label: artistName,
      value: artistId,
    });
  }, [addDrillDown]);

  const drillToAlbum = useCallback((albumId: string, albumName: string) => {
    addDrillDown({
      id: `album-${albumId}`,
      type: 'album',
      label: albumName,
      value: albumId,
    });
  }, [addDrillDown]);

  const drillToYear = useCallback((year: number) => {
    addDrillDown({
      id: `year-${year}`,
      type: 'year',
      label: year.toString(),
      value: year,
    });
  }, [addDrillDown]);

  const drillToMood = useCallback((mood: string) => {
    addDrillDown({
      id: `mood-${mood}`,
      type: 'mood',
      label: mood,
      value: mood,
    });
  }, [addDrillDown]);

  // Navigation methods (navigate to detail pages)
  const navigateToArtist = useCallback((artistId: number) => {
    router.push(`/artist/${artistId}`);
  }, [router]);

  const navigateToAlbum = useCallback((albumId: string) => {
    router.push(`/album/${albumId}`);
  }, [router]);

  const value: DrillDownContextValue = {
    breadcrumbs,
    addDrillDown,
    removeDrillDown,
    clearDrillDowns,
    goToBreadcrumb,
    hasDrillDowns: breadcrumbs.length > 0,
    drillToGenre,
    drillToArtist,
    drillToAlbum,
    drillToYear,
    drillToMood,
    navigateToArtist,
    navigateToAlbum,
  };

  return (
    <DrillDownContext.Provider value={value}>
      {children}
    </DrillDownContext.Provider>
  );
}

export function useDrillDown() {
  const context = useContext(DrillDownContext);
  if (!context) {
    throw new Error('useDrillDown must be used within a DrillDownProvider');
  }
  return context;
}

// Icon map for breadcrumb types
const typeIcons: Record<DrillDownItem['type'], React.ElementType> = {
  genre: TagIcon,
  artist: UserGroupIcon,
  album: RectangleStackIcon,
  playlist: MusicalNoteIcon,
  year: MusicalNoteIcon,
  mood: TagIcon,
};

// Breadcrumb Trail Component
interface BreadcrumbTrailProps {
  className?: string;
  showHome?: boolean;
  homeLabel?: string;
  onHomeClick?: () => void;
}

export function BreadcrumbTrail({
  className = '',
  showHome = true,
  homeLabel = 'All',
  onHomeClick,
}: BreadcrumbTrailProps) {
  const { breadcrumbs, goToBreadcrumb, clearDrillDowns } = useDrillDown();

  if (breadcrumbs.length === 0 && !showHome) {
    return null;
  }

  const handleHomeClick = () => {
    if (onHomeClick) {
      onHomeClick();
    }
    clearDrillDowns();
  };

  return (
    <nav className={`flex items-center gap-1 text-sm ${className}`}>
      {showHome && (
        <>
          <button
            onClick={handleHomeClick}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors ${
              breadcrumbs.length === 0
                ? 'text-white bg-gray-800'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            <HomeIcon className="w-4 h-4" />
            <span>{homeLabel}</span>
          </button>
          {breadcrumbs.length > 0 && (
            <ChevronRightIcon className="w-4 h-4 text-gray-600" />
          )}
        </>
      )}

      {breadcrumbs.map((crumb, index) => {
        const Icon = typeIcons[crumb.type];
        const isLast = index === breadcrumbs.length - 1;

        return (
          <React.Fragment key={crumb.id}>
            <button
              onClick={() => goToBreadcrumb(index)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors ${
                isLast
                  ? 'text-white bg-gray-800'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="max-w-[120px] truncate">{crumb.label}</span>
            </button>
            {!isLast && (
              <ChevronRightIcon className="w-4 h-4 text-gray-600" />
            )}
          </React.Fragment>
        );
      })}

      {breadcrumbs.length > 0 && (
        <button
          onClick={clearDrillDowns}
          className="ml-2 p-1 text-gray-500 hover:text-white transition-colors"
          title="Clear all filters"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      )}
    </nav>
  );
}

// Active Filter Pills (alternative display)
interface ActiveDrillDownsProps {
  className?: string;
}

export function ActiveDrillDowns({ className = '' }: ActiveDrillDownsProps) {
  const { breadcrumbs, removeDrillDown, clearDrillDowns } = useDrillDown();

  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-xs text-gray-500">Filtered by:</span>
      {breadcrumbs.map((crumb) => {
        const Icon = typeIcons[crumb.type];
        return (
          <span
            key={crumb.id}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-pink-600/20 text-pink-400 rounded-full text-xs"
          >
            <Icon className="w-3 h-3" />
            <span className="max-w-[100px] truncate">{crumb.label}</span>
            <button
              onClick={() => removeDrillDown(crumb.id)}
              className="hover:text-white transition-colors"
            >
              <XMarkIcon className="w-3 h-3" />
            </button>
          </span>
        );
      })}
      {breadcrumbs.length > 1 && (
        <button
          onClick={clearDrillDowns}
          className="text-xs text-gray-500 hover:text-white transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

// Clickable wrapper for chart elements
interface ClickableDrillDownProps {
  type: DrillDownItem['type'];
  value: string | number;
  label: string;
  children: ReactNode;
  className?: string;
  navigateOnClick?: boolean; // If true, navigate to page instead of drill-down
}

export function ClickableDrillDown({
  type,
  value,
  label,
  children,
  className = '',
  navigateOnClick = false,
}: ClickableDrillDownProps) {
  const {
    drillToGenre,
    drillToArtist,
    drillToYear,
    drillToMood,
    navigateToArtist,
    navigateToAlbum,
  } = useDrillDown();

  const handleClick = () => {
    if (navigateOnClick) {
      switch (type) {
        case 'artist':
          navigateToArtist(value as number);
          break;
        case 'album':
          navigateToAlbum(value as string);
          break;
      }
    } else {
      switch (type) {
        case 'genre':
          drillToGenre(value as string);
          break;
        case 'artist':
          drillToArtist(value as number, label);
          break;
        case 'year':
          drillToYear(value as number);
          break;
        case 'mood':
          drillToMood(value as string);
          break;
      }
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`cursor-pointer hover:opacity-80 transition-opacity ${className}`}
    >
      {children}
    </button>
  );
}
