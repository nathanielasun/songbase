'use client';

import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeftIcon, PlayIcon, ClockIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { mockPlaylists, mockSongs, formatDuration, formatDate, getTotalDuration } from '@/lib/mockData';
import { Song } from '@/lib/types';
import SongList from '@/components/SongList';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';

export default function PlaylistPage() {
  const params = useParams();
  const playlistId = params.id as string;
  const { currentSong, isPlaying, playSong } = useMusicPlayer();

  const playlist = mockPlaylists.find((p) => p.id === playlistId);

  if (!playlist) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Playlist Not Found</h1>
          <Link href="/" className="text-pink-500 hover:underline">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  const coverArt = playlist.coverArt || playlist.songs[0]?.albumArt || 'https://picsum.photos/seed/playlist/300/300';
  const totalDuration = getTotalDuration(playlist.songs);
  const totalMinutes = Math.floor(totalDuration / 60);

  const handleSongClick = (song: Song) => {
    playSong(song, playlist.songs);
  };

  const handleDownloadPlaylist = () => {
    console.log('Download playlist:', playlist.name, '(stub - will interface with backend)');
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
            <Image
              src={coverArt}
              alt={playlist.name}
              width={232}
              height={232}
              className="rounded-lg shadow-2xl"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold mb-2">PLAYLIST</p>
              <h1 className="text-6xl font-bold mb-4">{playlist.name}</h1>
              {playlist.description && (
                <p className="text-gray-300 mb-4">{playlist.description}</p>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <span>{playlist.songs.length} songs</span>
                <span>•</span>
                <span>{totalMinutes} min</span>
                {playlist.createdAt && (
                  <>
                    <span>•</span>
                    <span>{formatDate(playlist.createdAt)}</span>
                  </>
                )}
              </div>
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
          onClick={handleDownloadPlaylist}
          className="text-gray-400 hover:text-pink-500 transition-colors"
          title="Download playlist"
        >
          <ArrowDownTrayIcon className="w-8 h-8" />
        </button>
      </div>

      {/* Song List */}
      <div className="px-8">
        {playlist.songs.length > 0 ? (
          <SongList
            songs={playlist.songs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onSongClick={handleSongClick}
            onDownload={handleDownloadSong}
          />
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg">This playlist is empty</p>
          </div>
        )}
      </div>
    </div>
  );
}
