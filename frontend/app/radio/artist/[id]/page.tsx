'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon, RadioIcon } from '@heroicons/react/24/outline';
import { Song } from '@/lib/types';
import SongList from '@/components/SongList';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { usePlaylist } from '@/contexts/PlaylistContext';

type RadioSong = {
  sha_id: string;
  title: string;
  album?: string | null;
  album_id?: string | null;
  duration_sec?: number | null;
  artists: string[];
  artist_ids: number[];
  similarity: number;
};

type RadioData = {
  seed_artist: {
    artist_id: number;
    name: string;
  };
  songs: RadioSong[];
  total: number;
  metric: string;
  diversity: boolean;
};

const fetchJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

export default function ArtistRadioPage() {
  const params = useParams();
  const router = useRouter();
  const artistId = params.id as string;
  const { currentSong, isPlaying, playSong, addToQueue } = useMusicPlayer();
  const { playlists, addSongToPlaylist, createPlaylist } = usePlaylist();

  const [radioData, setRadioData] = useState<RadioData | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [artistImage, setArtistImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddToPlaylistModalOpen, setIsAddToPlaylistModalOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);

  useEffect(() => {
    if (!artistId) return;

    setLoading(true);
    setError(null);

    fetchJson<RadioData>(`/api/library/radio/artist/${artistId}?limit=50&metric=cosine&diversity=true`)
      .then((data) => {
        setRadioData(data);
        setArtistImage(`/api/library/images/artist/${data.seed_artist.artist_id}`);

        const mappedSongs = data.songs.map((song) => ({
          id: song.sha_id,
          hashId: song.sha_id,
          title: song.title || 'Unknown Title',
          artist: song.artists.length > 0 ? song.artists.join(', ') : 'Unknown Artist',
          artistId: song.artist_ids.length > 0 ? String(song.artist_ids[0]) : undefined,
          album: song.album || 'Unknown Album',
          albumId: song.album_id || undefined,
          duration: song.duration_sec || 0,
          albumArt: song.album_id
            ? `/api/library/images/album/${song.album_id}`
            : `/api/library/images/song/${song.sha_id}`,
        }));
        setSongs(mappedSongs);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [artistId]);

  const handleSongClick = (song: Song) => {
    playSong(song, songs);
  };

  const handleAddToPlaylist = (song: Song) => {
    setSelectedSong(song);
    setIsAddToPlaylistModalOpen(true);
  };

  const handleDownloadSong = (song: Song) => {
    console.log('Download song:', song.title, '(stub - will interface with backend)');
  };

  const handlePlayAll = () => {
    if (songs.length > 0) {
      playSong(songs[0], songs);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-gray-600 border-t-pink-500 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-400">Generating artist radio...</p>
        </div>
      </div>
    );
  }

  if (error || !radioData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Error</h1>
          <p className="text-gray-400 mb-6">{error || 'Failed to load radio'}</p>
          <Link href="/" className="text-pink-500 hover:underline">
            Return to Home
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
            href={`/artist/${artistId}`}
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Back to Artist
          </Link>

          <div className="flex items-center gap-6 mb-6">
            {artistImage ? (
              <img
                src={artistImage}
                alt={radioData.seed_artist.name}
                className="w-48 h-48 rounded-full shadow-2xl object-cover bg-gray-800"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-48 h-48 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-2xl">
                <RadioIcon className="w-24 h-24 text-white" />
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <RadioIcon className="w-5 h-5 text-purple-500" />
                <p className="text-sm font-semibold">ARTIST RADIO</p>
              </div>
              <h1 className="text-5xl font-bold mb-4">{radioData.seed_artist.name}</h1>
              <p className="text-gray-300 mb-6">
                {radioData.total} songs similar to this artist's style • Based on {radioData.metric} similarity
              </p>
              <button
                onClick={handlePlayAll}
                className="px-8 py-3 bg-purple-600 hover:bg-purple-500 rounded-full font-semibold transition-colors flex items-center gap-2"
              >
                <RadioIcon className="w-5 h-5" />
                Play Radio
              </button>
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
              No similar songs found. The artist's songs may not have embeddings yet.
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
