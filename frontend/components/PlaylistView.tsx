'use client';

import { useState } from 'react';
import { Playlist } from '@/lib/types';
import { TrashIcon, PencilIcon } from '@heroicons/react/24/outline';

interface PlaylistViewProps {
  playlists: Playlist[];
  onCreatePlaylist: (name: string) => void;
  onDeletePlaylist: (id: string) => void;
  onRenamePlaylist: (id: string, newName: string) => void;
}

export default function PlaylistView({
  playlists,
  onCreatePlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
}: PlaylistViewProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleCreate = () => {
    if (newPlaylistName.trim()) {
      onCreatePlaylist(newPlaylistName.trim());
      setNewPlaylistName('');
      setIsCreating(false);
    }
  };

  const handleRename = (id: string) => {
    if (editName.trim()) {
      onRenamePlaylist(id, editName.trim());
      setEditingId(null);
      setEditName('');
    }
  };

  const startEditing = (playlist: Playlist) => {
    setEditingId(playlist.id);
    setEditName(playlist.name);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold text-white">Your Playlists</h1>
        <button
          onClick={() => setIsCreating(true)}
          className="px-6 py-2 bg-pink-500 text-white rounded-full hover:bg-pink-600 transition-colors font-semibold"
        >
          Create Playlist
        </button>
      </div>

      {/* Create Playlist Form */}
      {isCreating && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-xl font-semibold text-white mb-4">New Playlist</h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="Playlist name"
              className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
              onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <button
              onClick={handleCreate}
              className="px-6 py-2 bg-pink-500 text-white rounded-md hover:bg-pink-600 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => {
                setIsCreating(false);
                setNewPlaylistName('');
              }}
              className="px-6 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Playlists Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {playlists.map((playlist) => (
          <div
            key={playlist.id}
            className="bg-gray-800 rounded-lg p-6 hover:bg-gray-700 transition-colors group"
          >
            <div className="flex items-start justify-between mb-4">
              {editingId === playlist.id ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleRename(playlist.id)}
                  onKeyPress={(e) => e.key === 'Enter' && handleRename(playlist.id)}
                  className="flex-1 px-2 py-1 bg-gray-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-pink-500"
                  autoFocus
                />
              ) : (
                <h3 className="text-xl font-semibold text-white truncate flex-1">
                  {playlist.name}
                </h3>
              )}
              <div className="flex gap-2 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startEditing(playlist)}
                  className="p-1 hover:bg-gray-600 rounded"
                >
                  <PencilIcon className="w-4 h-4 text-gray-400 hover:text-white" />
                </button>
                <button
                  onClick={() => onDeletePlaylist(playlist.id)}
                  className="p-1 hover:bg-gray-600 rounded"
                >
                  <TrashIcon className="w-4 h-4 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            </div>
            {playlist.description && (
              <p className="text-gray-400 text-sm mb-4">{playlist.description}</p>
            )}
            <p className="text-gray-400 text-sm">{playlist.songs.length} songs</p>
          </div>
        ))}
      </div>

      {playlists.length === 0 && !isCreating && (
        <div className="text-center py-16">
          <p className="text-gray-400 text-lg">No playlists yet. Create one to get started!</p>
        </div>
      )}
    </div>
  );
}
