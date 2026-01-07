'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { Playlist, Song } from '@/lib/types';

interface PlaylistContextType {
  playlists: Playlist[];
  createPlaylist: (name: string, description?: string) => Playlist;
  updatePlaylist: (id: string, updates: Partial<Omit<Playlist, 'id' | 'songs' | 'createdAt' | 'updatedAt'>>) => void;
  deletePlaylist: (id: string) => void;
  addSongToPlaylist: (playlistId: string, song: Song) => void;
  removeSongFromPlaylist: (playlistId: string, songId: string) => void;
  reorderSongs: (playlistId: string, startIndex: number, endIndex: number) => void;
  getPlaylistById: (id: string) => Playlist | undefined;
}

const PlaylistContext = createContext<PlaylistContextType | undefined>(undefined);

const STORAGE_KEY = 'songbase_playlists';

// Load playlists from localStorage
function loadPlaylists(): Playlist[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert date strings back to Date objects
      return parsed.map((p: any) => ({
        ...p,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt),
      }));
    }
  } catch (error) {
    console.error('Failed to load playlists from localStorage:', error);
  }

  return [];
}

// Save playlists to localStorage
function savePlaylists(playlists: Playlist[]) {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
  } catch (error) {
    console.error('Failed to save playlists to localStorage:', error);
  }
}

export function PlaylistProvider({ children }: { children: ReactNode }) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load playlists on mount
  useEffect(() => {
    const loaded = loadPlaylists();
    setPlaylists(loaded);
    setIsInitialized(true);
  }, []);

  // Save playlists whenever they change (after initial load)
  useEffect(() => {
    if (isInitialized) {
      savePlaylists(playlists);
    }
  }, [playlists, isInitialized]);

  const createPlaylist = useCallback((name: string, description?: string): Playlist => {
    const newPlaylist: Playlist = {
      id: `playlist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      songs: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setPlaylists((prev) => [...prev, newPlaylist]);
    return newPlaylist;
  }, []);

  const updatePlaylist = useCallback((id: string, updates: Partial<Omit<Playlist, 'id' | 'songs' | 'createdAt' | 'updatedAt'>>) => {
    setPlaylists((prev) =>
      prev.map((playlist) =>
        playlist.id === id
          ? { ...playlist, ...updates, updatedAt: new Date() }
          : playlist
      )
    );
  }, []);

  const deletePlaylist = useCallback((id: string) => {
    setPlaylists((prev) => prev.filter((playlist) => playlist.id !== id));
  }, []);

  const addSongToPlaylist = useCallback((playlistId: string, song: Song) => {
    setPlaylists((prev) =>
      prev.map((playlist) => {
        if (playlist.id === playlistId) {
          // Check if song already exists in playlist
          const songExists = playlist.songs.some((s) => s.id === song.id);
          if (songExists) {
            return playlist;
          }
          return {
            ...playlist,
            songs: [...playlist.songs, song],
            updatedAt: new Date(),
          };
        }
        return playlist;
      })
    );
  }, []);

  const removeSongFromPlaylist = useCallback((playlistId: string, songId: string) => {
    setPlaylists((prev) =>
      prev.map((playlist) =>
        playlist.id === playlistId
          ? {
              ...playlist,
              songs: playlist.songs.filter((song) => song.id !== songId),
              updatedAt: new Date(),
            }
          : playlist
      )
    );
  }, []);

  const reorderSongs = useCallback((playlistId: string, startIndex: number, endIndex: number) => {
    setPlaylists((prev) =>
      prev.map((playlist) => {
        if (playlist.id === playlistId) {
          const newSongs = [...playlist.songs];
          const [removed] = newSongs.splice(startIndex, 1);
          newSongs.splice(endIndex, 0, removed);
          return {
            ...playlist,
            songs: newSongs,
            updatedAt: new Date(),
          };
        }
        return playlist;
      })
    );
  }, []);

  const getPlaylistById = useCallback((id: string): Playlist | undefined => {
    return playlists.find((playlist) => playlist.id === id);
  }, [playlists]);

  return (
    <PlaylistContext.Provider
      value={{
        playlists,
        createPlaylist,
        updatePlaylist,
        deletePlaylist,
        addSongToPlaylist,
        removeSongFromPlaylist,
        reorderSongs,
        getPlaylistById,
      }}
    >
      {children}
    </PlaylistContext.Provider>
  );
}

export function usePlaylist() {
  const context = useContext(PlaylistContext);
  if (context === undefined) {
    throw new Error('usePlaylist must be used within a PlaylistProvider');
  }
  return context;
}
