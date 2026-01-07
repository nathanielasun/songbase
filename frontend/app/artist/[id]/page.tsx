'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon, PlayIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { Song } from '@/lib/types';
import SongList from '@/components/SongList';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { usePlaylist } from '@/contexts/PlaylistContext';

type ArtistSong = {
  sha_id: string;
  title: string;
  album?: string | null;
  duration_sec?: number | null;
  track_number?: number | null;
  album_id?: string | null;
};

type ArtistAlbum = {
  album_id: string;
  title: string;
  song_count: number;
  release_year?: number | null;
  duration_sec_total?: number | null;
};

type ArtistResponse = {
  artist_id: number;
  name: string;
  song_count: number;
  songs: ArtistSong[];
  songs_limit: number;
  songs_offset: number;
  albums: ArtistAlbum[];
};

const fetchJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

const formatYear = (value?: number | null) => {
  if (!value) {
    return '—';
  }
  return String(value);
};

export default function ArtistPage() {
  const params = useParams();
  const artistId = params.id as string;
  const { currentSong, isPlaying, playSong, addToQueue } = useMusicPlayer();
  const { playlists, addSongToPlaylist, createPlaylist } = usePlaylist();

  const [activeTab, setActiveTab] = useState<'all' | 'albums' | 'eps'>('all');
  const [isAddToPlaylistModalOpen, setIsAddToPlaylistModalOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [artistData, setArtistData] = useState<ArtistResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showArtistImage, setShowArtistImage] = useState(true);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    fetchJson<ArtistResponse>(`/api/library/artists/${artistId}`)
      .then((data) => {
        if (!active) {
          return;
        }
        setArtistData(data);
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
  }, [artistId]);

  const artistSongs = useMemo(() => {
    if (!artistData) {
      return [];
    }
    return artistData.songs.map((song) => ({
      id: song.sha_id,
      hashId: song.sha_id,
      title: song.title,
      artist: artistData.name,
      artistId: String(artistData.artist_id),
      album: song.album || undefined,
      albumId: song.album_id || undefined,
      duration: song.duration_sec ?? 0,
    }));
  }, [artistData]);

  const artistAlbums = artistData?.albums ?? [];
  const albums: ArtistAlbum[] = [];
  const eps: ArtistAlbum[] = [];

  if (loadError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Artist Unavailable</h1>
          <p className="text-gray-400 mb-6">{loadError}</p>
          <Link href="/" className="text-pink-500 hover:underline">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!artistData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-center text-gray-400">Loading artist...</div>
      </div>
    );
  }

  const artistImageUrl = `/api/library/images/artist/${artistId}`;

  const handleSongClick = (song: Song) => {
    playSong(song, artistSongs);
  };

  const handleAddToPlaylist = (song: Song) => {
    setSelectedSong(song);
    setIsAddToPlaylistModalOpen(true);
  };

  const handleDownloadAlbum = (albumId: string, albumTitle: string) => {
    console.log('Download album:', albumTitle, albumId, '(stub - will interface with backend)');
  };

  const handleDownloadSong = (song: Song) => {
    console.log('Download song:', song.title, '(stub - will interface with backend)');
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
            {showArtistImage ? (
              <img
                src={artistImageUrl}
                alt={artistData.name}
                className="h-48 w-48 rounded-full object-cover bg-gray-800 shadow-2xl"
                onError={() => setShowArtistImage(false)}
              />
            ) : (
              <div className="h-48 w-48 rounded-full bg-gray-800 shadow-2xl" />
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold mb-2">ARTIST</p>
              <h1 className="text-7xl font-bold mb-4">{artistData.name}</h1>
              <p className="text-gray-400 text-sm">
                {artistData.song_count} song{artistData.song_count === 1 ? '' : 's'} in
                your library.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 py-4 flex items-center gap-4">
        <button className="bg-white hover:bg-gray-200 text-black rounded-full p-4 transition-colors shadow-lg">
          <PlayIcon className="w-6 h-6" />
        </button>
      </div>

      {artistAlbums.length > 0 && (
        <div className="px-8 py-8">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-full font-semibold transition-colors ${
                activeTab === 'all'
                  ? 'bg-white text-black'
                  : 'bg-gray-800 text-white hover:bg-gray-700'
              }`}
            >
              All Releases
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {(activeTab === 'all' ? artistAlbums : activeTab === 'albums' ? albums : eps).map(
              (album) => (
                <Link
                  key={album.album_id}
                  href={`/album/${album.album_id}`}
                  className="group cursor-pointer"
                >
                  <div className="bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition-all relative">
                    <div className="relative">
                      <div className="aspect-square rounded mb-4 bg-gray-700/60 overflow-hidden">
                        <img
                          src={`/api/library/images/album/${album.album_id}`}
                          alt={album.title}
                          className="h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDownloadAlbum(album.album_id, album.title);
                        }}
                        className="absolute top-2 right-2 p-2 bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black"
                        title="Download album"
                      >
                        <ArrowDownTrayIcon className="w-5 h-5 text-gray-400 hover:text-pink-500" />
                      </button>
                    </div>
                    <h3 className="font-semibold text-white truncate mb-1">{album.title}</h3>
                    <p className="text-sm text-gray-400">
                      {formatYear(album.release_year)} • {album.song_count} song
                      {album.song_count === 1 ? '' : 's'}
                    </p>
                  </div>
                </Link>
              )
            )}
          </div>
        </div>
      )}

      <div className="px-8 py-8">
        <h2 className="text-2xl font-bold mb-6">Popular Tracks</h2>
        {artistSongs.length > 0 ? (
          <SongList
            songs={artistSongs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onSongClick={handleSongClick}
            onAddToPlaylist={handleAddToPlaylist}
            onDownload={handleDownloadSong}
            onAddToQueue={addToQueue}
          />
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg">No songs available</p>
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
