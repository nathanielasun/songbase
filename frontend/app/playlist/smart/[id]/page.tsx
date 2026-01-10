'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowPathIcon,
  BoltIcon,
  PencilIcon,
  TrashIcon,
  PlayIcon,
  ClockIcon,
  MusicalNoteIcon,
  EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline';
import { PlayIcon as PlayIconSolid } from '@heroicons/react/24/solid';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { SmartPlaylist, SmartPlaylistSong } from '@/components/smart-playlists';
import ArtistLinks from '@/components/ArtistLinks';
import { ArtistRef } from '@/lib/types';

export default function SmartPlaylistViewPage() {
  const router = useRouter();
  const params = useParams();
  const playlistId = params.id as string;

  const { playSong, currentSong, isPlaying } = useMusicPlayer();

  const [playlist, setPlaylist] = useState<SmartPlaylist | null>(null);
  const [songs, setSongs] = useState<SmartPlaylistSong[]>([]);
  const [explanation, setExplanation] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // Convert SmartPlaylistSong to the Song format expected by the music player
  const convertToPlayerSong = (s: SmartPlaylistSong) => ({
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
    albumArt: s.album_id ? `/api/library/albums/${s.album_id}/cover` : undefined,
  });

  const handlePlayAll = () => {
    if (songs.length === 0) return;

    const queueSongs = songs.map(convertToPlayerSong);

    playSong(queueSongs[0], queueSongs, {
      type: 'playlist',
      id: playlistId,
      name: playlist?.name,
    });
  };

  const handlePlaySong = (song: SmartPlaylistSong, index: number) => {
    const queueSongs = songs.map(convertToPlayerSong);

    playSong(queueSongs[index], queueSongs.slice(index), {
      type: 'playlist',
      id: playlistId,
      name: playlist?.name,
    });
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <ArrowPathIcon className="w-8 h-8 text-neutral-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => router.push('/library')}
            className="text-blue-400 hover:text-blue-300"
          >
            Go to library
          </button>
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-neutral-400 mb-4">Playlist not found</p>
          <button
            onClick={() => router.push('/library')}
            className="text-blue-400 hover:text-blue-300"
          >
            Go to library
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900">
      {/* Header */}
      <div className="bg-gradient-to-b from-purple-900/30 to-neutral-900 px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start gap-6">
            {/* Playlist icon */}
            <div className="w-48 h-48 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <BoltIcon className="w-24 h-24 text-purple-400" />
            </div>

            {/* Playlist info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-purple-400 uppercase tracking-wider">
                  Smart Playlist
                </span>
                {playlist.auto_refresh && (
                  <span className="text-xs text-neutral-500">Auto-refresh</span>
                )}
              </div>
              <h1 className="text-4xl font-bold text-white mb-2 truncate">
                {playlist.name}
              </h1>
              {playlist.description && (
                <p className="text-neutral-400 mb-4 line-clamp-2">
                  {playlist.description}
                </p>
              )}

              {/* Stats */}
              <div className="flex items-center gap-4 text-sm text-neutral-400 mb-4">
                <div className="flex items-center gap-1">
                  <MusicalNoteIcon className="w-4 h-4" />
                  <span>
                    {playlist.song_count} song{playlist.song_count !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <ClockIcon className="w-4 h-4" />
                  <span>{formatTotalDuration(playlist.total_duration_sec)}</span>
                </div>
                <span className="text-neutral-600">|</span>
                <span>Last refreshed: {formatDate(playlist.last_refreshed_at)}</span>
              </div>

              {/* Rule explanation */}
              {explanation && (
                <div className="bg-neutral-800/50 rounded-lg p-3 mb-4 max-w-2xl">
                  <pre className="text-xs text-neutral-400 whitespace-pre-wrap font-mono">
                    {explanation}
                  </pre>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePlayAll}
                  disabled={songs.length === 0}
                  className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PlayIconSolid className="w-5 h-5" />
                  Play
                </button>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="p-3 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-full transition-colors"
                  title="Refresh playlist"
                >
                  <ArrowPathIcon
                    className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`}
                  />
                </button>
                <button
                  onClick={() => router.push(`/playlist/smart/${playlistId}/edit`)}
                  className="p-3 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-full transition-colors"
                  title="Edit rules"
                >
                  <PencilIcon className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-3 text-neutral-400 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-colors"
                  title="Delete playlist"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Song list */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {songs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-400 mb-4">
              No songs match the current rules
            </p>
            <button
              onClick={() => router.push(`/playlist/smart/${playlistId}/edit`)}
              className="text-blue-400 hover:text-blue-300"
            >
              Edit rules
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Header row */}
            <div className="grid grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 px-4 py-2 text-xs font-medium text-neutral-500 uppercase tracking-wider border-b border-neutral-800">
              <span className="w-10">#</span>
              <span>Title</span>
              <span>Album</span>
              <span>Artist</span>
              <span className="w-16 text-right">Duration</span>
            </div>

            {/* Songs */}
            {songs.map((song, index) => {
              const isCurrentSong = currentSong?.hashId === song.sha_id;

              // Build artist refs for ArtistLinks component
              const artistRefs: ArtistRef[] = song.artists && song.artist_ids
                ? song.artists.map((name, i) => ({
                    id: song.artist_ids[i] || '',
                    name,
                  }))
                : [];

              return (
                <div
                  key={song.sha_id}
                  onClick={() => handlePlaySong(song, index)}
                  className={`grid grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 px-4 py-3 rounded-lg transition-colors group cursor-pointer ${
                    isCurrentSong
                      ? 'bg-purple-500/10 text-purple-400'
                      : 'hover:bg-neutral-800/50 text-neutral-300'
                  }`}
                >
                  {/* Track number / play indicator */}
                  <span className="w-10 flex items-center justify-center">
                    {isCurrentSong && isPlaying ? (
                      <span className="flex items-center gap-0.5">
                        <span className="w-1 h-3 bg-purple-400 rounded-full animate-pulse" />
                        <span className="w-1 h-4 bg-purple-400 rounded-full animate-pulse delay-75" />
                        <span className="w-1 h-2 bg-purple-400 rounded-full animate-pulse delay-150" />
                      </span>
                    ) : (
                      <span className="group-hover:hidden">{index + 1}</span>
                    )}
                    <PlayIcon className="w-4 h-4 hidden group-hover:block" />
                  </span>

                  {/* Title with album art */}
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={song.album_id ? `/api/library/albums/${song.album_id}/cover` : '/default-album.svg'}
                      alt=""
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded object-cover bg-neutral-800 flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/default-album.svg';
                      }}
                    />
                    <span className="truncate font-medium">{song.title}</span>
                  </div>

                  {/* Album with link */}
                  <div className="flex items-center min-w-0">
                    {song.album_id ? (
                      <Link
                        href={`/album/${song.album_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="truncate text-neutral-400 hover:text-white hover:underline"
                      >
                        {song.album || 'Unknown Album'}
                      </Link>
                    ) : (
                      <span className="truncate text-neutral-400">
                        {song.album || 'Unknown Album'}
                      </span>
                    )}
                  </div>

                  {/* Artist with links */}
                  <div className="flex items-center min-w-0">
                    <ArtistLinks
                      artists={artistRefs.length > 0 ? artistRefs : undefined}
                      fallbackArtist={song.artist}
                      fallbackArtistId={song.primary_artist_id || undefined}
                      className="truncate text-neutral-400"
                      linkClassName="hover:text-white hover:underline"
                    />
                  </div>

                  {/* Duration */}
                  <span className="w-16 text-right text-neutral-500 text-sm flex items-center justify-end">
                    {formatDuration(song.duration_sec)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-neutral-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-white mb-2">
              Delete Smart Playlist?
            </h3>
            <p className="text-neutral-400 mb-6">
              Are you sure you want to delete &ldquo;{playlist.name}&rdquo;? This
              action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-700 rounded-lg transition-colors disabled:opacity-50"
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
