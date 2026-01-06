'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeftIcon, PlayIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { mockArtists, mockAlbums, mockSongs, formatDate } from '@/lib/mockData';
import { Song } from '@/lib/types';
import SongList from '@/components/SongList';

export default function ArtistPage() {
  const params = useParams();
  const artistId = params.id as string;

  const artist = mockArtists.find((a) => a.id === artistId);
  const artistAlbums = mockAlbums.filter((album) => album.artistId === artistId);
  const artistSongs = mockSongs.filter((song) => song.artistId === artistId);

  const albums = artistAlbums.filter((album) => album.type === 'album');
  const eps = artistAlbums.filter((album) => album.type === 'ep');
  const singles = artistAlbums.filter((album) => album.type === 'single');

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'albums' | 'eps'>('all');

  if (!artist) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Artist Not Found</h1>
          <Link href="/" className="text-pink-500 hover:underline">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  const handleSongClick = (song: Song) => {
    if (currentSong?.id === song.id) {
      setIsPlaying(!isPlaying);
    } else {
      setCurrentSong(song);
      setIsPlaying(true);
    }
  };

  const handleDownloadAlbum = (albumId: string, albumTitle: string) => {
    console.log('Download album:', albumTitle, '(stub - will interface with backend)');
  };

  const handleDownloadSong = (song: Song) => {
    console.log('Download song:', song.title, '(stub - will interface with backend)');
  };

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

          <div className="flex items-end gap-6">
            {artist.imageUrl && (
              <Image
                src={artist.imageUrl}
                alt={artist.name}
                width={232}
                height={232}
                className="rounded-full shadow-2xl"
              />
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold mb-2">ARTIST</p>
              <h1 className="text-7xl font-bold mb-4">{artist.name}</h1>
              {artist.genres && artist.genres.length > 0 && (
                <div className="flex gap-2 mb-4">
                  {artist.genres.map((genre) => (
                    <span
                      key={genre}
                      className="px-3 py-1 bg-gray-800 rounded-full text-sm"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bio */}
      {artist.bio && (
        <div className="px-8 py-6">
          <p className="text-gray-300 text-lg max-w-3xl">{artist.bio}</p>
        </div>
      )}

      {/* Actions */}
      <div className="px-8 py-4 flex items-center gap-4">
        <button className="bg-white hover:bg-gray-200 text-black rounded-full p-4 transition-colors shadow-lg">
          <PlayIcon className="w-6 h-6" />
        </button>
      </div>

      {/* Albums Section */}
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
            {albums.length > 0 && (
              <button
                onClick={() => setActiveTab('albums')}
                className={`px-4 py-2 rounded-full font-semibold transition-colors ${
                  activeTab === 'albums'
                    ? 'bg-white text-black'
                    : 'bg-gray-800 text-white hover:bg-gray-700'
                }`}
              >
                Albums
              </button>
            )}
            {eps.length > 0 && (
              <button
                onClick={() => setActiveTab('eps')}
                className={`px-4 py-2 rounded-full font-semibold transition-colors ${
                  activeTab === 'eps'
                    ? 'bg-white text-black'
                    : 'bg-gray-800 text-white hover:bg-gray-700'
                }`}
              >
                EPs
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {(activeTab === 'all' ? artistAlbums :
              activeTab === 'albums' ? albums :
              eps
            ).map((album) => (
              <Link
                key={album.id}
                href={`/album/${album.id}`}
                className="group cursor-pointer"
              >
                <div className="bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition-all relative">
                  <div className="relative">
                    {album.coverArt && (
                      <Image
                        src={album.coverArt}
                        alt={album.title}
                        width={200}
                        height={200}
                        className="rounded mb-4 w-full"
                      />
                    )}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDownloadAlbum(album.id, album.title);
                      }}
                      className="absolute top-2 right-2 p-2 bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black"
                      title="Download album"
                    >
                      <ArrowDownTrayIcon className="w-5 h-5 text-gray-400 hover:text-pink-500" />
                    </button>
                  </div>
                  <h3 className="font-semibold text-white truncate mb-1">
                    {album.title}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {album.releaseDate && formatDate(album.releaseDate)} • {album.type.toUpperCase()}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Songs Section */}
      <div className="px-8 py-8">
        <h2 className="text-2xl font-bold mb-6">Popular Tracks</h2>
        {artistSongs.length > 0 ? (
          <SongList
            songs={artistSongs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onSongClick={handleSongClick}
            onDownload={handleDownloadSong}
          />
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg">No songs available</p>
          </div>
        )}
      </div>
    </div>
  );
}
