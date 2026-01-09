'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon, HeartIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';
import { Song } from '@/lib/types';
import SongList from '@/components/SongList';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { usePlaylist } from '@/contexts/PlaylistContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { downloadSong } from '@/lib/downloadUtils';

type PreferenceSong = {
  sha_id: string;
  title: string;
  album?: string | null;
  album_id?: string | null;
  duration_sec?: number | null;
  artists: string[];
  artist_ids: number[];
  score: number;
  like_similarity: number;
  dislike_similarity: number;
};

type PreferencePlaylistResponse = {
  playlist_type: string;
  config: {
    liked_count: number;
    disliked_count: number;
    limit: number;
    metric: string;
    diversity: boolean;
    dislike_weight: number;
  };
  result: {
    liked_count: number;
    disliked_count: number;
    liked_embeddings_found: number;
    dislike_weight: number;
    songs: PreferenceSong[];
  };
  songs: PreferenceSong[];
  total: number;
};

const fetchJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

export default function ForYouRadioPage() {
  const router = useRouter();
  const { currentSong, isPlaying, playSong, addToQueue } = useMusicPlayer();
  const { playlists, addSongToPlaylist, createPlaylist } = usePlaylist();
  const { likedSongIds, dislikedSongIds, likedCount, dislikedCount } = useUserPreferences();

  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlistConfig, setPlaylistConfig] = useState<PreferencePlaylistResponse['config'] | null>(null);
  const [isAddToPlaylistModalOpen, setIsAddToPlaylistModalOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);

  const generatePlaylist = useCallback(async () => {
    if (likedSongIds.length === 0) {
      setError('Like some songs first to generate your personalized radio!');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetchJson<PreferencePlaylistResponse>('/api/library/playlist/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          liked_song_ids: likedSongIds,
          disliked_song_ids: dislikedSongIds,
          limit: 50,
          metric: 'cosine',
          diversity: true,
          dislike_weight: 0.5,
        }),
      });

      setPlaylistConfig(response.config);

      const mappedSongs = response.songs.map((song) => ({
        id: song.sha_id,
        hashId: song.sha_id,
        title: song.title || 'Unknown Title',
        artist: song.artists.length > 0 ? song.artists.join(', ') : 'Unknown Artist',
        artistId: song.artist_ids.length > 0 ? String(song.artist_ids[0]) : undefined,
        artists: song.artists && song.artist_ids
          ? song.artists.map((name, idx) => ({
              id: song.artist_ids[idx] ? String(song.artist_ids[idx]) : '',
              name,
            })).filter(a => a.id)
          : undefined,
        album: song.album || 'Unknown Album',
        albumId: song.album_id || undefined,
        duration: song.duration_sec || 0,
        albumArt: song.album_id
          ? `/api/library/images/album/${song.album_id}`
          : `/api/library/images/song/${song.sha_id}`,
      }));
      setSongs(mappedSongs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [likedSongIds, dislikedSongIds]);

  // Generate playlist when preferences change (with debounce)
  useEffect(() => {
    if (likedSongIds.length > 0) {
      generatePlaylist();
    }
  }, [likedSongIds.length, dislikedSongIds.length]); // Only regenerate when count changes

  const handleSongClick = (song: Song) => {
    playSong(song, songs);
  };

  const handleAddToPlaylist = (song: Song) => {
    setSelectedSong(song);
    setIsAddToPlaylistModalOpen(true);
  };

  const handleDownloadSong = downloadSong;

  const handlePlayAll = () => {
    if (songs.length > 0) {
      playSong(songs[0], songs);
    }
  };

  // Empty state - no liked songs
  if (likedCount === 0 && !loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white pb-32">
        <div className="bg-gradient-to-b from-pink-900/40 to-transparent">
          <div className="p-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5" />
              Back
            </Link>

            <div className="flex items-center gap-6 mb-6">
              <div className="w-48 h-48 rounded-lg bg-gradient-to-br from-pink-600 to-purple-600 flex items-center justify-center shadow-2xl">
                <SparklesIcon className="w-24 h-24 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <HeartSolidIcon className="w-5 h-5 text-pink-500" />
                  <p className="text-sm font-semibold">FOR YOU</p>
                </div>
                <h1 className="text-5xl font-bold mb-4">Your Personal Radio</h1>
                <p className="text-gray-300 mb-6">
                  Start liking songs to generate your personalized radio station
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8">
          <div className="text-center py-16 bg-gray-800/30 rounded-xl">
            <HeartIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">No Liked Songs Yet</h2>
            <p className="text-gray-400 mb-6 max-w-md mx-auto">
              Like some songs by clicking the heart icon next to any song.
              We'll use your preferences to find songs you'll love!
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-pink-600 hover:bg-pink-500 rounded-full font-semibold transition-colors"
            >
              Browse Library
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-gray-600 border-t-pink-500 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-400">Generating your personalized radio...</p>
          <p className="text-gray-500 text-sm mt-2">
            Analyzing {likedCount} liked {likedCount === 1 ? 'song' : 'songs'}
            {dislikedCount > 0 && ` and avoiding ${dislikedCount} disliked ${dislikedCount === 1 ? 'song' : 'songs'}`}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Error</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={generatePlaylist}
            className="px-6 py-3 bg-pink-600 hover:bg-pink-500 rounded-full font-semibold transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white pb-32">
      {/* Header */}
      <div className="bg-gradient-to-b from-pink-900/40 to-transparent">
        <div className="p-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Back
          </Link>

          <div className="flex items-center gap-6 mb-6">
            <div className="w-48 h-48 rounded-lg bg-gradient-to-br from-pink-600 to-purple-600 flex items-center justify-center shadow-2xl">
              <SparklesIcon className="w-24 h-24 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <HeartSolidIcon className="w-5 h-5 text-pink-500" />
                <p className="text-sm font-semibold">FOR YOU</p>
              </div>
              <h1 className="text-5xl font-bold mb-4">Your Personal Radio</h1>
              <p className="text-gray-300 mb-2">
                {songs.length} songs curated based on your taste
              </p>
              <p className="text-gray-400 text-sm mb-6">
                Based on {likedCount} liked {likedCount === 1 ? 'song' : 'songs'}
                {dislikedCount > 0 && ` • Avoiding ${dislikedCount} disliked ${dislikedCount === 1 ? 'song' : 'songs'}`}
              </p>
              <div className="flex gap-4">
                <button
                  onClick={handlePlayAll}
                  className="px-8 py-3 bg-pink-600 hover:bg-pink-500 rounded-full font-semibold transition-colors flex items-center gap-2"
                >
                  <SparklesIcon className="w-5 h-5" />
                  Play Radio
                </button>
                <button
                  onClick={generatePlaylist}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-full font-semibold transition-colors"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Song List */}
      <div className="p-8">
        {songs.length > 0 ? (
          <SongList
            songs={songs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onSongClick={handleSongClick}
            onAddToPlaylist={handleAddToPlaylist}
            onDownload={handleDownloadSong}
            onAddToQueue={addToQueue}
          />
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-400">
              No songs found. Try liking more songs or check that your liked songs have embeddings.
            </p>
          </div>
        )}
      </div>

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
          createPlaylist(`My Playlist #${playlists.length + 1}`);
        }}
      />
    </div>
  );
}
