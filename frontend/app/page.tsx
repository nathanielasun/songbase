'use client';

import { useEffect, useMemo, useState } from 'react';
import SongList from '@/components/SongList';
import PlaylistView from '@/components/PlaylistView';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import { Song } from '@/lib/types';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { usePlaylist } from '@/contexts/PlaylistContext';

type ViewMode = 'library' | 'playlists';

type CatalogEntry = {
  sha_id: string;
  title?: string | null;
  album?: string | null;
  duration_sec?: number | null;
  release_year?: number | null;
  track_number?: number | null;
  verified?: boolean | null;
  verification_source?: string | null;
  artists: string[];
  artist_ids: number[];
  primary_artist_id?: number | null;
  album_id?: string | null;
};

type CatalogResponse = {
  items: CatalogEntry[];
  total: number;
  limit: number;
  offset: number;
  query: string | null;
};

type LibraryStats = {
  songs: number;
  verified_songs: number;
  embeddings: number;
};

const fetchJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

export default function Home() {
  const { currentSong, isPlaying, playSong, addToQueue } = useMusicPlayer();
  const {
    playlists,
    createPlaylist,
    deletePlaylist,
    updatePlaylist,
    addSongToPlaylist,
  } = usePlaylist();

  const [viewMode, setViewMode] = useState<ViewMode>('library');
  const [isAddToPlaylistModalOpen, setIsAddToPlaylistModalOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogPage, setCatalogPage] = useState(0);
  const [catalogPageSize, setCatalogPageSize] = useState(25);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [stats, setStats] = useState<LibraryStats | null>(null);

  const catalogOffset = catalogPage * catalogPageSize;
  const catalogPageCount = useMemo(() => {
    if (catalogTotal <= 0) {
      return 1;
    }
    return Math.ceil(catalogTotal / catalogPageSize);
  }, [catalogPageSize, catalogTotal]);

  useEffect(() => {
    if (viewMode !== 'library') {
      return;
    }
    let active = true;
    fetchJson<LibraryStats>('/api/library/stats')
      .then((data) => {
        if (!active) {
          return;
        }
        setStats({
          songs: data.songs ?? 0,
          verified_songs: data.verified_songs ?? 0,
          embeddings: data.embeddings ?? 0,
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setStats(null);
      });
    return () => {
      active = false;
    };
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== 'library') {
      return;
    }
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setCatalogLoading(true);
      setCatalogError(null);
      const params = new URLSearchParams({
        limit: String(catalogPageSize),
        offset: String(catalogOffset),
      });
      const query = catalogQuery.trim();
      if (query) {
        params.set('q', query);
      }
      fetchJson<CatalogResponse>(`/api/library/catalog?${params.toString()}`, {
        signal: controller.signal,
      })
        .then((data) => {
          if (!active) {
            return;
          }
          setCatalogTotal(data.total ?? 0);
          const mapped = data.items.map((entry) => ({
            id: entry.sha_id,
            hashId: entry.sha_id,
            title: entry.title || 'Unknown Title',
            artist: entry.artists.length ? entry.artists.join(', ') : 'Unknown Artist',
            artistId: entry.primary_artist_id ? String(entry.primary_artist_id) : undefined,
            artists: entry.artists && entry.artist_ids
              ? entry.artists.map((name, idx) => ({
                  id: entry.artist_ids[idx] ? String(entry.artist_ids[idx]) : '',
                  name,
                })).filter(a => a.id)
              : undefined,
            album: entry.album || 'Unknown Album',
            albumId: entry.album_id || undefined,
            duration: entry.duration_sec ?? 0,
            albumArt: entry.album_id
              ? `/api/library/images/album/${entry.album_id}`
              : `/api/library/images/song/${entry.sha_id}`,
          }));
          setSongs(mapped);
        })
        .catch((error) => {
          if (!active || controller.signal.aborted) {
            return;
          }
          setCatalogError(error instanceof Error ? error.message : String(error));
          setCatalogTotal(0);
          setSongs([]);
        })
        .finally(() => {
          if (!active) {
            return;
          }
          setCatalogLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [catalogOffset, catalogPageSize, catalogQuery, viewMode]);

  useEffect(() => {
    if (catalogPage >= catalogPageCount) {
      setCatalogPage(Math.max(0, catalogPageCount - 1));
    }
  }, [catalogPage, catalogPageCount]);

  const handleSongClick = (song: Song) => {
    playSong(song, songs);
  };

  const handleCreatePlaylist = (name?: string) => {
    const playlistName = name || `My Playlist #${playlists.length + 1}`;
    createPlaylist(playlistName);
  };

  const handleDeletePlaylist = (id: string) => {
    deletePlaylist(id);
  };

  const handleRenamePlaylist = (id: string, newName: string) => {
    updatePlaylist(id, { name: newName });
  };

  const handleAddToPlaylist = (song: Song) => {
    setSelectedSong(song);
    setIsAddToPlaylistModalOpen(true);
  };

  const handleDownloadSong = (song: Song) => {
    console.log('Download song:', song.title, '(stub - will interface with backend)');
  };

  return (
    <div className="bg-gradient-to-b from-gray-900 to-black min-h-full pb-32">
      {/* Header */}
      <div className="p-8 pb-0">
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setViewMode('library')}
            className={`px-6 py-2 rounded-full font-semibold transition-colors ${
              viewMode === 'library'
                ? 'bg-white text-black'
                : 'bg-gray-800 text-white hover:bg-gray-700'
            }`}
          >
            Library
          </button>
          <button
            onClick={() => setViewMode('playlists')}
            className={`px-6 py-2 rounded-full font-semibold transition-colors ${
              viewMode === 'playlists'
                ? 'bg-white text-black'
                : 'bg-gray-800 text-white hover:bg-gray-700'
            }`}
          >
            Playlists
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'library' ? (
        <div className="p-8 pt-4">
          <div className="flex flex-col gap-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold">Your Library</h1>
                <p className="text-gray-400 mt-2">
                  Search and browse your stored catalog without loading everything at once.
                </p>
              </div>
              <div className="text-sm text-gray-400">
                {stats ? (
                  <>
                    <span className="text-white font-semibold">{stats.songs}</span> songs ·{' '}
                    <span className="text-white font-semibold">{stats.verified_songs}</span>{' '}
                    verified ·{' '}
                    <span className="text-white font-semibold">{stats.embeddings}</span>{' '}
                    embeddings
                  </>
                ) : (
                  'Library stats unavailable'
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_auto] items-end">
              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-400">Search</span>
                <input
                  value={catalogQuery}
                  onChange={(event) => {
                    setCatalogQuery(event.target.value);
                    setCatalogPage(0);
                  }}
                  placeholder="Title, album, or artist"
                  className="bg-gray-900/70 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-pink-500"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm text-gray-400">Results per page</span>
                <select
                  value={catalogPageSize}
                  onChange={(event) => {
                    setCatalogPageSize(Number(event.target.value));
                    setCatalogPage(0);
                  }}
                  className="bg-gray-900/70 border border-gray-800 rounded-lg px-3 py-2 text-white"
                >
                  {[10, 25, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-2 text-sm text-gray-400">
                <span>Results</span>
                <span className="text-white">
                  {catalogTotal === 0
                    ? '0'
                    : `${catalogOffset + 1}-${Math.min(
                        catalogOffset + catalogPageSize,
                        catalogTotal
                      )}`}{' '}
                  of {catalogTotal}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCatalogPage((page) => Math.max(0, page - 1))}
                  disabled={catalogPage === 0}
                  className="px-3 py-2 rounded-lg border border-gray-800 text-sm text-white disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  onClick={() =>
                    setCatalogPage((page) => Math.min(catalogPageCount - 1, page + 1))
                  }
                  disabled={catalogPage >= catalogPageCount - 1}
                  className="px-3 py-2 rounded-lg border border-gray-800 text-sm text-white disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>

            {catalogError ? (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                {catalogError}
              </div>
            ) : catalogLoading ? (
              <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 text-sm text-gray-300">
                Loading your library...
              </div>
            ) : songs.length === 0 ? (
              <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-6 text-sm text-gray-300">
                No songs found. Try a different search or run the pipeline to add music.
              </div>
            ) : (
              <SongList
                songs={songs}
                currentSong={currentSong}
                isPlaying={isPlaying}
                onSongClick={handleSongClick}
                onAddToPlaylist={handleAddToPlaylist}
                onDownload={handleDownloadSong}
                onAddToQueue={addToQueue}
              />
            )}
          </div>
        </div>
      ) : (
        <PlaylistView
          playlists={playlists}
          onCreatePlaylist={handleCreatePlaylist}
          onDeletePlaylist={handleDeletePlaylist}
          onRenamePlaylist={handleRenamePlaylist}
        />
      )}

      {/* Modals */}
      <AddToPlaylistModal
        isOpen={isAddToPlaylistModalOpen}
        song={selectedSong}
        playlists={playlists}
        onClose={() => {
          setIsAddToPlaylistModalOpen(false);
          setSelectedSong(null);
        }}
        onAddToPlaylist={addSongToPlaylist}
        onCreateNew={() => {
          setIsAddToPlaylistModalOpen(false);
          setSelectedSong(null);
          handleCreatePlaylist();
        }}
      />
    </div>
  );
}
