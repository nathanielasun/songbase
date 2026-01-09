'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon, PlayIcon, ArrowDownTrayIcon, RadioIcon } from '@heroicons/react/24/outline';
import { Song } from '@/lib/types';
import SongList from '@/components/SongList';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { usePlaylist } from '@/contexts/PlaylistContext';
import { downloadSong, downloadAlbum } from '@/lib/downloadUtils';

type AlbumSong = {
  sha_id: string;
  title: string;
  duration_sec?: number | null;
  track_number?: number | null;
};

type AlbumResponse = {
  album_id: string;
  title: string;
  artist_name?: string | null;
  artist_id?: number | null;
  release_year?: number | null;
  song_count: number;
  duration_sec_total?: number | null;
  songs: AlbumSong[];
};

const fetchJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

const formatDuration = (seconds?: number | null) => {
  if (!seconds || seconds < 0) {
    return '--';
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes} min ${remainder} sec`;
};

export default function AlbumPage() {
  const params = useParams();
  const router = useRouter();
  const albumId = params.id as string;
  const { currentSong, isPlaying, playSong, addToQueue } = useMusicPlayer();
  const { playlists, addSongToPlaylist, createPlaylist } = usePlaylist();

  const [isAddToPlaylistModalOpen, setIsAddToPlaylistModalOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [albumData, setAlbumData] = useState<AlbumResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAlbumImage, setShowAlbumImage] = useState(true);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    fetchJson<AlbumResponse>(`/api/library/albums/${albumId}`)
      .then((data) => {
        if (!active) {
          return;
        }
        setAlbumData(data);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, [albumId]);

  const albumSongs = useMemo(() => {
    if (!albumData) {
      return [];
    }
    return albumData.songs.map((song) => ({
      id: song.sha_id,
      hashId: song.sha_id,
      title: song.title,
      artist: albumData.artist_name || 'Unknown Artist',
      artistId: albumData.artist_id ? String(albumData.artist_id) : undefined,
      album: albumData.title,
      albumId: albumData.album_id,
      duration: song.duration_sec ?? 0,
      albumArt: albumData.album_id
        ? `/api/library/images/album/${albumData.album_id}`
        : `/api/library/images/song/${song.sha_id}`,
    }));
  }, [albumData]);

  const totalDuration = albumData?.duration_sec_total
    ? Math.max(0, albumData.duration_sec_total)
    : albumSongs.reduce((sum, song) => sum + (song.duration || 0), 0);

  if (loadError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Album Unavailable</h1>
          <p className="text-gray-400 mb-6">{loadError}</p>
          <Link href="/" className="text-pink-500 hover:underline">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!albumData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-center text-gray-400">Loading album...</div>
      </div>
    );
  }

  const albumImageUrl = `/api/library/images/album/${albumId}`;

  const handleSongClick = (song: Song) => {
    playSong(song, albumSongs);
  };

  const handleAddToPlaylist = (song: Song) => {
    setSelectedSong(song);
    setIsAddToPlaylistModalOpen(true);
  };

  const handleDownloadAlbum = () => {
    downloadAlbum(albumId, albumData.title, albumData.artist_name || undefined);
  };

  const handleDownloadSong = downloadSong;

  const handleArtistRadio = () => {
    if (albumData.artist_id) {
      router.push(`/radio/artist/${albumData.artist_id}`);
    }
  };

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

          <div className="flex items-end gap-6">
            {showAlbumImage ? (
              <img
                src={albumImageUrl}
                alt={albumData.title}
                className="h-56 w-56 rounded-lg object-cover bg-gray-800 shadow-2xl"
                onError={() => setShowAlbumImage(false)}
              />
            ) : (
              <div className="h-56 w-56 rounded-lg bg-gray-800 shadow-2xl" />
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold mb-2">ALBUM</p>
              <h1 className="text-6xl font-bold mb-4">{albumData.title}</h1>
              <div className="flex items-center gap-2">
                {albumData.artist_id ? (
                  <Link
                    href={`/artist/${albumData.artist_id}`}
                    className="text-2xl font-semibold hover:underline"
                  >
                    {albumData.artist_name || 'Unknown Artist'}
                  </Link>
                ) : (
                  <span className="text-2xl font-semibold">
                    {albumData.artist_name || 'Unknown Artist'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300 mt-4">
                {albumData.release_year && (
                  <>
                    <span>{albumData.release_year}</span>
                    <span>•</span>
                  </>
                )}
                <span>{albumData.song_count} songs</span>
                <span>•</span>
                <span>{formatDuration(totalDuration)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 flex items-center gap-4">
        <button
          onClick={() => albumSongs.length > 0 && handleSongClick(albumSongs[0])}
          disabled={albumSongs.length === 0}
          className="bg-white hover:bg-gray-200 text-black rounded-full p-4 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PlayIcon className="w-6 h-6" />
        </button>
        {albumData.artist_id && (
          <button
            onClick={handleArtistRadio}
            className="bg-purple-600 hover:bg-purple-500 text-white rounded-full px-6 py-3 transition-colors shadow-lg flex items-center gap-2 font-semibold"
          >
            <RadioIcon className="w-5 h-5" />
            Artist Radio
          </button>
        )}
        <button
          onClick={handleDownloadAlbum}
          className="text-gray-400 hover:text-pink-500 transition-colors"
          title="Download album"
        >
          <ArrowDownTrayIcon className="w-8 h-8" />
        </button>
      </div>

      <div className="px-8">
        {albumSongs.length > 0 ? (
          <SongList
            songs={albumSongs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onSongClick={handleSongClick}
            onAddToPlaylist={handleAddToPlaylist}
            onDownload={handleDownloadSong}
            onAddToQueue={addToQueue}
          />
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg">No songs in this album</p>
          </div>
        )}
      </div>

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
