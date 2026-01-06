'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeftIcon, PlayIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { mockAlbums, mockSongs, formatDate, getTotalDuration, formatDuration } from '@/lib/mockData';
import { Song } from '@/lib/types';
import SongList from '@/components/SongList';

export default function AlbumPage() {
  const params = useParams();
  const albumId = params.id as string;

  const album = mockAlbums.find((a) => a.id === albumId);
  const albumSongs = mockSongs.filter((song) => song.albumId === albumId);

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  if (!album) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Album Not Found</h1>
          <Link href="/" className="text-pink-500 hover:underline">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  const totalDuration = getTotalDuration(albumSongs);
  const totalMinutes = Math.floor(totalDuration / 60);
  const totalSeconds = totalDuration % 60;

  const handleSongClick = (song: Song) => {
    if (currentSong?.id === song.id) {
      setIsPlaying(!isPlaying);
    } else {
      setCurrentSong(song);
      setIsPlaying(true);
    }
  };

  const handleDownloadAlbum = () => {
    console.log('Download album:', album.title, '(stub - will interface with backend)');
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
            {album.coverArt && (
              <Image
                src={album.coverArt}
                alt={album.title}
                width={232}
                height={232}
                className="rounded-lg shadow-2xl"
              />
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold mb-2">{album.type.toUpperCase()}</p>
              <h1 className="text-6xl font-bold mb-4">{album.title}</h1>
              <div className="flex items-center gap-2">
                <Link
                  href={`/artist/${album.artistId}`}
                  className="text-2xl font-semibold hover:underline"
                >
                  {album.artistName}
                </Link>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300 mt-4">
                {album.releaseDate && (
                  <>
                    <span>{formatDate(album.releaseDate)}</span>
                    <span>•</span>
                  </>
                )}
                <span>{albumSongs.length} songs</span>
                <span>•</span>
                <span>{totalMinutes} min {totalSeconds} sec</span>
              </div>
              {album.genres && album.genres.length > 0 && (
                <div className="flex gap-2 mt-4">
                  {album.genres.map((genre) => (
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

      {/* Actions */}
      <div className="px-8 py-6 flex items-center gap-4">
        <button className="bg-white hover:bg-gray-200 text-black rounded-full p-4 transition-colors shadow-lg">
          <PlayIcon className="w-6 h-6" />
        </button>
        <button
          onClick={handleDownloadAlbum}
          className="text-gray-400 hover:text-pink-500 transition-colors"
          title="Download album"
        >
          <ArrowDownTrayIcon className="w-8 h-8" />
        </button>
      </div>

      {/* Song List */}
      <div className="px-8">
        {albumSongs.length > 0 ? (
          <SongList
            songs={albumSongs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onSongClick={handleSongClick}
            onDownload={handleDownloadSong}
          />
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg">No songs in this album</p>
          </div>
        )}
      </div>
    </div>
  );
}
