'use client';

import Image from 'next/image';
import Link from 'next/link';
import { PlayIcon, PlusIcon, PauseIcon, ArrowDownTrayIcon, QueueListIcon } from '@heroicons/react/24/solid';
import { Song } from '@/lib/types';
import { formatDuration } from '@/lib/mockData';

interface SongListProps {
  songs: Song[];
  currentSong: Song | null;
  isPlaying: boolean;
  onSongClick: (song: Song) => void;
  onAddToPlaylist?: (song: Song) => void;
  onDownload?: (song: Song) => void;
  onAddToQueue?: (song: Song) => void;
}

export default function SongList({
  songs,
  currentSong,
  isPlaying,
  onSongClick,
  onAddToPlaylist,
  onDownload,
  onAddToQueue,
}: SongListProps) {
  return (
    <div className="w-full">
      {/* Table Header */}
      <div className="grid grid-cols-[auto_3fr_2fr_2fr_1fr_auto_auto_auto] gap-4 px-4 py-2 text-sm text-gray-400 border-b border-gray-800">
        <div className="w-10">#</div>
        <div>Title</div>
        <div>Album</div>
        <div>Artist</div>
        <div>Duration</div>
        <div className="w-10"></div>
        <div className="w-10"></div>
        <div className="w-10"></div>
      </div>

      {/* Song Rows */}
      <div className="divide-y divide-gray-800">
        {songs.map((song, index) => {
          const isCurrentSong = currentSong?.id === song.id;
          return (
            <div
              key={song.id}
              className={`grid grid-cols-[auto_3fr_2fr_2fr_1fr_auto_auto_auto] gap-4 px-4 py-3 group hover:bg-gray-800 transition-colors cursor-pointer ${
                isCurrentSong ? 'bg-gray-800' : ''
              }`}
              onClick={() => onSongClick(song)}
            >
              {/* Index / Play/Pause Button */}
              <div className="w-10 flex items-center justify-center">
                {isCurrentSong && isPlaying ? (
                  <PauseIcon className="w-4 h-4 text-pink-500" />
                ) : (
                  <>
                    <span className={`group-hover:hidden ${isCurrentSong ? 'text-pink-500' : ''}`}>
                      {index + 1}
                    </span>
                    <PlayIcon className={`w-4 h-4 hidden group-hover:block ${isCurrentSong ? 'text-pink-500' : 'text-white'}`} />
                  </>
                )}
              </div>

              {/* Title with Album Art */}
              <div className="flex items-center gap-3 min-w-0">
                {song.albumArt && (
                  <Image
                    src={song.albumArt}
                    alt={song.title}
                    width={40}
                    height={40}
                    className="rounded"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className={`truncate ${
                      isCurrentSong ? 'text-pink-500' : 'text-white'
                    }`}
                  >
                    {song.title}
                  </p>
                </div>
              </div>

              {/* Album */}
              <div className="flex items-center text-gray-400 truncate">
                {song.albumId ? (
                  <Link
                    href={`/album/${song.albumId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-white hover:underline truncate"
                  >
                    {song.album || 'Unknown Album'}
                  </Link>
                ) : (
                  <span className="truncate">{song.album || 'Unknown Album'}</span>
                )}
              </div>

              {/* Artist */}
              <div className="flex items-center text-gray-400 truncate">
                {song.artistId ? (
                  <Link
                    href={`/artist/${song.artistId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-white hover:underline truncate"
                  >
                    {song.artist}
                  </Link>
                ) : (
                  <span className="truncate">{song.artist}</span>
                )}
              </div>

              {/* Duration */}
              <div className="flex items-center text-gray-400">
                {formatDuration(song.duration)}
              </div>

              {/* Download */}
              <div className="w-10 flex items-center justify-center">
                {onDownload && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload(song);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Download song"
                  >
                    <ArrowDownTrayIcon className="w-5 h-5 text-gray-400 hover:text-pink-500" />
                  </button>
                )}
              </div>

              {/* Add to Queue */}
              <div className="w-10 flex items-center justify-center">
                {onAddToQueue && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddToQueue(song);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Add to queue"
                  >
                    <QueueListIcon className="w-5 h-5 text-gray-400 hover:text-pink-500" />
                  </button>
                )}
              </div>

              {/* Add to Playlist */}
              <div className="w-10 flex items-center justify-center">
                {onAddToPlaylist && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddToPlaylist(song);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Add to playlist"
                  >
                    <PlusIcon className="w-5 h-5 text-gray-400 hover:text-white" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
