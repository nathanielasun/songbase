'use client';

import { useState } from 'react';
import { XMarkIcon, ChevronRightIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { formatDuration } from '@/lib/mockData';

interface QueueProps {
  isOpen: boolean;
  onToggle: () => void;
}

export default function Queue({ isOpen, onToggle }: QueueProps) {
  const {
    currentSong,
    upNextQueue,
    queue,
    currentIndex,
    removeFromQueue,
    clearQueue,
    playFromQueue,
  } = useMusicPlayer();

  // Get remaining songs from the current playlist queue (after current song)
  const remainingPlaylistQueue = queue.slice(currentIndex + 1);

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Queue Panel */}
      <div
        className={`fixed top-0 right-0 h-full bg-gray-900 border-l border-gray-800 z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } w-full sm:w-96 flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-xl font-bold">Queue</h2>
          <button
            onClick={onToggle}
            className="p-2 hover:bg-gray-800 rounded-full transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Queue Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Now Playing */}
          {currentSong && (
            <div className="p-4 border-b border-gray-800">
              <p className="text-sm text-gray-400 mb-3">Now Playing</p>
              <div className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                {currentSong.albumArt ? (
                  <img
                    src={currentSong.albumArt}
                    alt=""
                    width={48}
                    height={48}
                    className="rounded object-cover bg-gray-700"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const placeholder = e.currentTarget.nextElementSibling;
                      if (placeholder) {
                        (placeholder as HTMLElement).style.display = 'block';
                      }
                    }}
                  />
                ) : null}
                <div
                  className="w-12 h-12 rounded bg-gray-700 flex-shrink-0"
                  style={{ display: currentSong.albumArt ? 'none' : 'block' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate text-sm">
                    {currentSong.title}
                  </p>
                  <p className="text-gray-400 text-xs truncate">
                    {currentSong.artist}
                  </p>
                </div>
                <span className="text-xs text-gray-400">
                  {formatDuration(currentSong.duration)}
                </span>
              </div>
            </div>
          )}

          {/* Up Next Queue */}
          {upNextQueue.length > 0 && (
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-400">Up Next</p>
                <button
                  onClick={clearQueue}
                  className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  <TrashIcon className="w-4 h-4" />
                  Clear
                </button>
              </div>
              <div className="space-y-2">
                {upNextQueue.map((song, index) => (
                  <div
                    key={`upnext-${song.id}-${index}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors group"
                  >
                    <button
                      onClick={() => playFromQueue(index)}
                      className="flex-1 flex items-center gap-3 min-w-0"
                    >
                      {song.albumArt ? (
                        <img
                          src={song.albumArt}
                          alt=""
                          width={40}
                          height={40}
                          className="rounded object-cover bg-gray-700"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const placeholder = e.currentTarget.nextElementSibling;
                            if (placeholder) {
                              (placeholder as HTMLElement).style.display = 'block';
                            }
                          }}
                        />
                      ) : null}
                      <div
                        className="w-10 h-10 rounded bg-gray-700 flex-shrink-0"
                        style={{ display: song.albumArt ? 'none' : 'block' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">
                          {song.title}
                        </p>
                        <p className="text-gray-400 text-xs truncate">
                          {song.artist}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400">
                        {formatDuration(song.duration)}
                      </span>
                    </button>
                    <button
                      onClick={() => removeFromQueue(index)}
                      className="p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500"
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Remaining from Current Playlist */}
          {remainingPlaylistQueue.length > 0 && (
            <div className="p-4">
              <p className="text-sm text-gray-400 mb-3">
                Next from: {currentSong?.album || 'Current Playlist'}
              </p>
              <div className="space-y-2">
                {remainingPlaylistQueue.slice(0, 10).map((song, index) => (
                  <div
                    key={`playlist-${song.id}-${index}`}
                    className="flex items-center gap-3 p-2 rounded-lg opacity-60"
                  >
                    {song.albumArt ? (
                      <img
                        src={song.albumArt}
                        alt=""
                        width={40}
                        height={40}
                        className="rounded object-cover bg-gray-700"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const placeholder = e.currentTarget.nextElementSibling;
                          if (placeholder) {
                            (placeholder as HTMLElement).style.display = 'block';
                          }
                        }}
                      />
                    ) : null}
                    <div
                      className="w-10 h-10 rounded bg-gray-700 flex-shrink-0"
                      style={{ display: song.albumArt ? 'none' : 'block' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">
                        {song.title}
                      </p>
                      <p className="text-gray-400 text-xs truncate">
                        {song.artist}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400">
                      {formatDuration(song.duration)}
                    </span>
                  </div>
                ))}
                {remainingPlaylistQueue.length > 10 && (
                  <p className="text-xs text-gray-500 text-center py-2">
                    +{remainingPlaylistQueue.length - 10} more songs
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!currentSong && upNextQueue.length === 0 && remainingPlaylistQueue.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-gray-400">No songs in queue</p>
              <p className="text-sm text-gray-500 mt-2">
                Add songs to your queue to see them here
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
