'use client';

import Image from 'next/image';
import { PlayIcon, PlusIcon } from '@heroicons/react/24/solid';
import { Song } from '@/lib/types';
import { formatDuration } from '@/lib/mockData';

interface SongListProps {
  songs: Song[];
  currentSong: Song | null;
  isPlaying: boolean;
  onSongClick: (song: Song) => void;
  onAddToPlaylist?: (song: Song) => void;
}

export default function SongList({
  songs,
  currentSong,
  isPlaying,
  onSongClick,
  onAddToPlaylist,
}: SongListProps) {
  return (
    <div className="w-full">
      {/* Table Header */}
      <div className="grid grid-cols-[auto_3fr_2fr_2fr_1fr_auto] gap-4 px-4 py-2 text-sm text-gray-400 border-b border-gray-800">
        <div className="w-10">#</div>
        <div>Title</div>
        <div>Album</div>
        <div>Artist</div>
        <div>Duration</div>
        <div className="w-10"></div>
      </div>

      {/* Song Rows */}
      <div className="divide-y divide-gray-800">
        {songs.map((song, index) => {
          const isCurrentSong = currentSong?.id === song.id;
          return (
            <div
              key={song.id}
              className={`grid grid-cols-[auto_3fr_2fr_2fr_1fr_auto] gap-4 px-4 py-3 group hover:bg-gray-800 transition-colors cursor-pointer ${
                isCurrentSong ? 'bg-gray-800' : ''
              }`}
              onClick={() => onSongClick(song)}
            >
              {/* Index / Play Button */}
              <div className="w-10 flex items-center justify-center">
                <span className="group-hover:hidden">{index + 1}</span>
                <PlayIcon className="w-4 h-4 text-white hidden group-hover:block" />
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
                {song.album || 'Unknown Album'}
              </div>

              {/* Artist */}
              <div className="flex items-center text-gray-400 truncate">
                {song.artist}
              </div>

              {/* Duration */}
              <div className="flex items-center text-gray-400">
                {formatDuration(song.duration)}
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
