'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  BoltIcon,
  PencilIcon,
  TrashIcon,
  PlayIcon,
  ArrowDownTrayIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { SmartPlaylist, SmartPlaylistSong } from '@/components/smart-playlists';
import SongList from '@/components/SongList';
import { Song } from '@/lib/types';
import { downloadPlaylist } from '@/lib/downloadUtils';

export default function SmartPlaylistViewPage() {
  const router = useRouter();
  const params = useParams();
  const playlistId = params.id as string;

  const { currentSong, isPlaying, playSong, addToQueue } = useMusicPlayer();

  const [playlist, setPlaylist] = useState<SmartPlaylist | null>(null);
  const [songs, setSongs] = useState<SmartPlaylistSong[]>([]);
  const [explanation, setExplanation] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  const fetchPlaylist = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [playlistRes, explainRes] = await Promise.all([
        fetch(`/api/playlists/smart/${playlistId}`),
        fetch(`/api/playlists/smart/${playlistId}/explain`),
      ]);

      if (!playlistRes.ok) {
        if (playlistRes.status === 404) {
          throw new Error('Playlist not found');
        }
        throw new Error('Failed to load playlist');
      }

      const playlistData = await playlistRes.json();
      setPlaylist(playlistData);
      setSongs(playlistData.songs || []);

      if (explainRes.ok) {
        const explainData = await explainRes.json();
        setExplanation(explainData.explanation || '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load playlist');
    } finally {
      setIsLoading(false);
    }
  }, [playlistId]);

  useEffect(() => {
    if (playlistId) {
      fetchPlaylist();
    }
  }, [playlistId, fetchPlaylist]);

  // Convert SmartPlaylistSong to Song format for SongList component
  const convertToSong = (s: SmartPlaylistSong): Song => ({
    id: s.sha_id,
    hashId: s.sha_id,
    title: s.title,
    artist: s.artist,
    artistId: s.primary_artist_id || undefined,
    artists: s.artists && s.artist_ids
      ? s.artists.map((name, i) => ({ id: s.artist_ids[i] || '', name }))
      : undefined,
    album: s.album || '',
    albumId: s.album_id || undefined,
    duration: s.duration_sec,
    albumArt: s.album_id ? `/api/library/images/album/${s.album_id}` : '/default-album.svg',
  });

  const convertedSongs = songs.map(convertToSong);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/playlists/smart/${playlistId}/refresh`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to refresh playlist');
      }

      await fetchPlaylist();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/playlists/smart/${playlistId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete playlist');
      }

      router.push('/library');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setIsDeleting(false);
    }
  };

  const handleSongClick = (song: Song) => {
    playSong(song, convertedSongs, {
      type: 'playlist',
      id: playlistId,
      name: playlist?.name,
    });
  };

  const handleDownloadPlaylist = () => {
    if (convertedSongs.length > 0 && playlist) {
      downloadPlaylist(convertedSongs, playlist.name);
    }
  };

  const formatTotalDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} hr ${mins} min`;
    }
    return `${mins} min`;
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
        <ArrowPathIcon className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Link href="/library" className="text-pink-500 hover:underline">
            Go to library
          </Link>
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">Playlist Not Found</h1>
          <Link href="/library" className="text-pink-500 hover:underline">
            Go to library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white pb-32">
      {/* Header */}
      <div className="bg-gradient-to-b from-purple-900/40 to-transparent">
        <div className="p-8">
          <Link
            href="/library"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Back
          </Link>

          <div className="flex items-end gap-6">
            {/* Smart playlist icon */}
            <div className="w-[232px] h-[232px] bg-gradient-to-br from-purple-600 to-purple-900 rounded-lg shadow-2xl flex items-center justify-center flex-shrink-0">
              <BoltIcon className="w-24 h-24 text-purple-200" />
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-semibold text-purple-400">SMART PLAYLIST</p>
                {playlist.auto_refresh && (
                  <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">
                    Auto-refresh
                  </span>
                )}
              </div>
              <h1 className="text-6xl font-bold mb-4">{playlist.name}</h1>
              {playlist.description && (
                <p className="text-gray-300 mb-4">{playlist.description}</p>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <span>{playlist.song_count} songs</span>
                <span>•</span>
                <span>{formatTotalDuration(playlist.total_duration_sec)}</span>
                <span>•</span>
                <span>Updated {formatDate(playlist.last_refreshed_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-8 py-6 flex items-center gap-4">
        <button
          onClick={() => convertedSongs.length > 0 && handleSongClick(convertedSongs[0])}
          disabled={convertedSongs.length === 0}
          className="bg-purple-500 hover:bg-purple-600 text-white rounded-full p-4 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PlayIcon className="w-6 h-6" />
        </button>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          title="Refresh playlist"
        >
          <ArrowPathIcon className={`w-8 h-8 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={handleDownloadPlaylist}
          disabled={convertedSongs.length === 0}
          className="text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Download playlist"
        >
          <ArrowDownTrayIcon className="w-8 h-8" />
        </button>
        <button
          onClick={() => router.push(`/playlist/smart/${playlistId}/edit`)}
          className="text-gray-400 hover:text-white transition-colors"
          title="Edit rules"
        >
          <PencilIcon className="w-8 h-8" />
        </button>
        <button
          onClick={() => setShowExplanation(!showExplanation)}
          className={`transition-colors ${showExplanation ? 'text-purple-400' : 'text-gray-400 hover:text-white'}`}
          title="View rules"
        >
          <InformationCircleIcon className="w-8 h-8" />
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="text-gray-400 hover:text-red-500 transition-colors"
          title="Delete playlist"
        >
          <TrashIcon className="w-8 h-8" />
        </button>
      </div>

      {/* Rule explanation (collapsible) */}
      {showExplanation && explanation && (
        <div className="px-8 pb-4">
          <div className="bg-gray-800/50 rounded-lg p-4 max-w-2xl">
            <h3 className="text-sm font-medium text-purple-400 mb-2">Rules</h3>
            <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
              {explanation}
            </pre>
          </div>
        </div>
      )}

      {/* Song List */}
      <div className="px-8">
        {convertedSongs.length > 0 ? (
          <SongList
            songs={convertedSongs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onSongClick={handleSongClick}
            onAddToQueue={addToQueue}
            onDownload={(song) => {
              // Download single song
              const a = document.createElement('a');
              a.href = `/api/play/${song.hashId}`;
              a.download = `${song.title}.mp3`;
              a.click();
            }}
          />
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg">No songs match the current rules</p>
            <button
              onClick={() => router.push(`/playlist/smart/${playlistId}/edit`)}
              className="text-purple-400 hover:text-purple-300 mt-2"
            >
              Edit rules
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-white mb-2">
              Delete Smart Playlist?
            </h3>
            <p className="text-gray-400 mb-6">
              Are you sure you want to delete &ldquo;{playlist.name}&rdquo;? This
              action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
