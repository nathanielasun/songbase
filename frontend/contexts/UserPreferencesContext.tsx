'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from 'react';

/**
 * User preferences for songs - stored locally, independent of song metadata.
 * This allows personal preferences without affecting the shared library data.
 */
export interface SongPreference {
  songId: string;      // SHA ID of the song
  liked: boolean;
  disliked: boolean;
  likedAt?: string;    // ISO date string when liked
  dislikedAt?: string; // ISO date string when disliked
}

interface UserPreferencesContextType {
  // Preference lookup
  preferences: Map<string, SongPreference>;
  isLiked: (songId: string) => boolean;
  isDisliked: (songId: string) => boolean;
  getPreference: (songId: string) => SongPreference | undefined;

  // Preference modification
  likeSong: (songId: string) => void;
  dislikeSong: (songId: string) => void;
  clearPreference: (songId: string) => void;

  // Bulk access for playlist generation
  likedSongIds: string[];
  dislikedSongIds: string[];

  // Stats
  likedCount: number;
  dislikedCount: number;
}

const UserPreferencesContext = createContext<UserPreferencesContextType | undefined>(undefined);

const STORAGE_KEY = 'songbase_user_preferences';

interface StoredPreferences {
  version: number;
  preferences: SongPreference[];
}

// Load preferences from localStorage
function loadPreferences(): Map<string, SongPreference> {
  if (typeof window === 'undefined') return new Map();

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: StoredPreferences = JSON.parse(stored);
      // Handle version migrations if needed in the future
      if (parsed.version === 1 && Array.isArray(parsed.preferences)) {
        const map = new Map<string, SongPreference>();
        for (const pref of parsed.preferences) {
          map.set(pref.songId, pref);
        }
        return map;
      }
    }
  } catch (error) {
    console.error('Failed to load user preferences from localStorage:', error);
  }

  return new Map();
}

// Save preferences to localStorage
function savePreferences(preferences: Map<string, SongPreference>) {
  if (typeof window === 'undefined') return;

  try {
    const stored: StoredPreferences = {
      version: 1,
      preferences: Array.from(preferences.values()),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch (error) {
    console.error('Failed to save user preferences to localStorage:', error);
  }
}

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Map<string, SongPreference>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    const loaded = loadPreferences();
    setPreferences(loaded);
    setIsInitialized(true);
  }, []);

  // Save preferences whenever they change (after initial load)
  useEffect(() => {
    if (isInitialized) {
      savePreferences(preferences);
    }
  }, [preferences, isInitialized]);

  const isLiked = useCallback((songId: string): boolean => {
    return preferences.get(songId)?.liked ?? false;
  }, [preferences]);

  const isDisliked = useCallback((songId: string): boolean => {
    return preferences.get(songId)?.disliked ?? false;
  }, [preferences]);

  const getPreference = useCallback((songId: string): SongPreference | undefined => {
    return preferences.get(songId);
  }, [preferences]);

  const likeSong = useCallback((songId: string) => {
    setPreferences((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(songId);

      if (existing?.liked) {
        // Already liked - toggle off (remove like)
        newMap.set(songId, {
          ...existing,
          liked: false,
          likedAt: undefined,
        });
      } else {
        // Not liked - add like (and remove any dislike)
        newMap.set(songId, {
          songId,
          liked: true,
          disliked: false,
          likedAt: new Date().toISOString(),
          dislikedAt: undefined,
        });
      }

      return newMap;
    });
  }, []);

  const dislikeSong = useCallback((songId: string) => {
    setPreferences((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(songId);

      if (existing?.disliked) {
        // Already disliked - toggle off (remove dislike)
        newMap.set(songId, {
          ...existing,
          disliked: false,
          dislikedAt: undefined,
        });
      } else {
        // Not disliked - add dislike (and remove any like)
        newMap.set(songId, {
          songId,
          liked: false,
          disliked: true,
          likedAt: undefined,
          dislikedAt: new Date().toISOString(),
        });
      }

      return newMap;
    });
  }, []);

  const clearPreference = useCallback((songId: string) => {
    setPreferences((prev) => {
      const newMap = new Map(prev);
      newMap.delete(songId);
      return newMap;
    });
  }, []);

  // Memoized arrays for playlist generation
  const likedSongIds = useMemo(() => {
    return Array.from(preferences.values())
      .filter((p) => p.liked)
      .map((p) => p.songId);
  }, [preferences]);

  const dislikedSongIds = useMemo(() => {
    return Array.from(preferences.values())
      .filter((p) => p.disliked)
      .map((p) => p.songId);
  }, [preferences]);

  const likedCount = likedSongIds.length;
  const dislikedCount = dislikedSongIds.length;

  useEffect(() => {
    if (!isInitialized) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch('/api/playlists/smart/preferences/changed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          liked_song_ids: likedSongIds,
          disliked_song_ids: dislikedSongIds,
        }),
        signal: controller.signal,
      }).catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('Failed to sync preferences:', error);
        }
      });
    }, 500);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [likedSongIds, dislikedSongIds, isInitialized]);

  return (
    <UserPreferencesContext.Provider
      value={{
        preferences,
        isLiked,
        isDisliked,
        getPreference,
        likeSong,
        dislikeSong,
        clearPreference,
        likedSongIds,
        dislikedSongIds,
        likedCount,
        dislikedCount,
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext);
  if (context === undefined) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider');
  }
  return context;
}
