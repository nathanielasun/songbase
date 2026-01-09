'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon, PlayIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { HeartIcon } from '@heroicons/react/24/solid';
import { getTotalDuration } from '@/lib/mockData';
import { Song } from '@/lib/types';
import SongList from '@/components/SongList';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { usePlaylist } from '@/contexts/PlaylistContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { downloadSong, downloadPlaylist } from '@/lib/downloadUtils';

type CatalogSong = {
  sha_id: string;
  title: string;
  album?: string | null;
  album_id?: string | null;
  duration_sec?: number | null;
  artists: string[];
  primary_artist_id?: number | null;
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

export default function LikedSongsPage() {
  const router = useRouter();
  const { currentSong, isPlaying, playSong, addToQueue } = useMusicPlayer();
  const { playlists, addSongToPlaylist, createPlaylist } = usePlaylist();
  const { likedSongIds, likedCount, likeSong } = useUserPreferences();

  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddToPlaylistModalOpen, setIsAddToPlaylistModalOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);

  // Fetch song details for all liked songs
  const fetchLikedSongs = useCallback(async () => {
    if (likedSongIds.length === 0) {
      setSongs([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // Fetch songs in batches to avoid URL length limits
      const batchSize = 50;
      const allSongs: Song[] = [];

      for (let i = 0; i < likedSongIds.length; i += batchSize) {
        const batch = likedSongIds.slice(i, i + batchSize);

        // Fetch each song individually (backend doesn't have batch endpoint for specific IDs)
        const songPromises = batch.map(async (shaId) => {
          try {
            const data = await fetchJson<CatalogSong>(`/api/library/songs/${shaId}`);
            return {
              id: data.sha_id,
              hashId: data.sha_id,
              title: data.title || 'Unknown Title',
              artist: data.artists?.length > 0 ? data.artists.join(', ') : 'Unknown Artist',
              artistId: data.primary_artist_id ? String(data.primary_artist_id) : undefined,
              album: data.album || 'Unknown Album',
              albumId: data.album_id || undefined,
              duration: data.duration_sec || 0,
              albumArt: data.album_id
                ? `/api/library/images/album/${data.album_id}`
                : `/api/library/images/song/${data.sha_id}`,
            };
          } catch {
            // Song might have been deleted from library
            return null;
          }
        });

        const results = await Promise.all(songPromises);
        allSongs.push(...results.filter((s): s is Song => s !== null));
      }

      setSongs(allSongs);
    } catch (error) {
      console.error('Failed to fetch liked songs:', error);
      setSongs([]);
    } finally {
      setLoading(false);
    }
  }, [likedSongIds]);

  useEffect(() => {
    fetchLikedSongs();
  }, [fetchLikedSongs]);

  const totalDuration = getTotalDuration(songs);
  const totalMinutes = Math.floor(totalDuration / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  const handleSongClick = (song: Song) => {
    playSong(song, songs);
  };

  const handleUnlike = (song: Song) => {
    likeSong(song.id); // Toggle off = unlike
  };

  const handleAddToPlaylist = (song: Song) => {
    setSelectedSong(song);
    setIsAddToPlaylistModalOpen(true);
  };

  const handleDownload = downloadSong;

  const handleDownloadAll = () => {
    if (songs.length > 0) {
      downloadPlaylist(songs, 'Liked Songs');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-gray-600 border-t-pink-500 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-400">Loading your liked songs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white pb-32">
      {/* Header */}
      <div className="bg-gradient-to-b from-purple-900/60 to-transparent">
        <div className="p-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Back
          </Link>

          <div className="flex items-end gap-6">
            {/* Liked Songs Cover - Gradient with Heart */}
            <div className="w-56 h-56 rounded-lg shadow-2xl bg-gradient-to-br from-purple-700 via-pink-600 to-pink-500 flex items-center justify-center">
              <HeartIcon className="w-24 h-24 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold mb-2">PLAYLIST</p>
              <h1 className="text-6xl font-bold mb-4">Liked Songs</h1>
              <p className="text-gray-300 mb-4">
                Your personal collection of favorite tracks
              </p>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <span>{likedCount} {likedCount === 1 ? 'song' : 'songs'}</span>
                {songs.length > 0 && (
                  <>
                    <span>•</span>
                    <span>
                      {totalHours > 0
                        ? `${totalHours} hr ${remainingMinutes} min`
                        : `${totalMinutes} min`}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-8 py-6 flex items-center gap-4">
        <button
          onClick={() => songs.length > 0 && handleSongClick(songs[0])}
          disabled={songs.length === 0}
          className="bg-pink-500 hover:bg-pink-600 text-white rounded-full p-4 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PlayIcon className="w-6 h-6" />
        </button>
        <button
          onClick={handleDownloadAll}
          disabled={songs.length === 0}
          className="text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Download all liked songs"
        >
          <ArrowDownTrayIcon className="w-8 h-8" />
        </button>
      </div>

      {/* Song List */}
      <div className="px-8">
        {songs.length > 0 ? (
          <SongList
            songs={songs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onSongClick={handleSongClick}
            onAddToQueue={addToQueue}
            onAddToPlaylist={handleAddToPlaylist}
            onDownload={handleDownload}
            onRemove={handleUnlike}
            removeTitle="Remove from Liked Songs"
          />
        ) : (
          <div className="text-center py-16">
            <HeartIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">No liked songs yet</p>
            <p className="text-sm text-gray-500 mt-2">
              Like songs by clicking the heart icon to add them here
            </p>
            <Link
              href="/"
              className="inline-block mt-6 px-6 py-3 bg-pink-600 hover:bg-pink-500 rounded-full font-semibold transition-colors"
            >
              Browse Library
            </Link>
          </div>
        )}
      </div>

      {/* Add to Playlist Modal */}
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
          createPlaylist(`My Playlist #${playlists.length + 1}`);
        }}
      />
    </div>
  );
}
