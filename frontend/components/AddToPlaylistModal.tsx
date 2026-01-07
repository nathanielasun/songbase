'use client';

import { XMarkIcon, CheckIcon, PlusCircleIcon } from '@heroicons/react/24/outline';
import { Song, Playlist } from '@/lib/types';

interface AddToPlaylistModalProps {
  isOpen: boolean;
  song: Song | null;
  playlists: Playlist[];
  onClose: () => void;
  onAddToPlaylist: (playlistId: string, song: Song) => void;
  onCreateNew: () => void;
}

export default function AddToPlaylistModal({
  isOpen,
  song,
  playlists,
  onClose,
  onAddToPlaylist,
  onCreateNew,
}: AddToPlaylistModalProps) {
  if (!isOpen || !song) return null;

  const handleAddToPlaylist = (playlistId: string) => {
    onAddToPlaylist(playlistId, song);
  };

  const isSongInPlaylist = (playlist: Playlist) => {
    return playlist.songs.some((s) => s.id === song.id);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-gray-900 rounded-lg shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white">Add to Playlist</h2>
            <p className="text-sm text-gray-400 mt-1 truncate">{song.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors flex-shrink-0 ml-4"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Create New Playlist Button */}
        <div className="p-4 border-b border-gray-800 flex-shrink-0">
          <button
            onClick={() => {
              onCreateNew();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
          >
            <PlusCircleIcon className="w-6 h-6 text-pink-500" />
            <span className="font-semibold text-white">Create New Playlist</span>
          </button>
        </div>

        {/* Playlist List */}
        <div className="flex-1 overflow-y-auto p-4">
          {playlists.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400">No playlists yet</p>
              <p className="text-sm text-gray-500 mt-2">Create your first playlist to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {playlists.map((playlist) => {
                const isAdded = isSongInPlaylist(playlist);
                return (
                  <button
                    key={playlist.id}
                    onClick={() => !isAdded && handleAddToPlaylist(playlist.id)}
                    disabled={isAdded}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-md transition-colors ${
                      isAdded
                        ? 'bg-gray-800/50 cursor-not-allowed'
                        : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex-1 text-left">
                      <p className="font-medium text-white truncate">{playlist.name}</p>
                      <p className="text-sm text-gray-400">
                        {playlist.songs.length} {playlist.songs.length === 1 ? 'song' : 'songs'}
                      </p>
                    </div>
                    {isAdded && (
                      <CheckIcon className="w-5 h-5 text-pink-500 flex-shrink-0 ml-2" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-md transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
