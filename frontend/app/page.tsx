'use client';

import { useState } from 'react';
import SongList from '@/components/SongList';
import PlaylistView from '@/components/PlaylistView';
import { Song, Playlist } from '@/lib/types';
import { mockSongs, mockPlaylists } from '@/lib/mockData';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';

type ViewMode = 'library' | 'playlists';

export default function Home() {
  const { currentSong, isPlaying, playSong } = useMusicPlayer();
  const [songs] = useState<Song[]>(mockSongs);
  const [playlists, setPlaylists] = useState<Playlist[]>(mockPlaylists);
  const [viewMode, setViewMode] = useState<ViewMode>('library');

  const handleSongClick = (song: Song) => {
    playSong(song, songs);
  };

  const handleCreatePlaylist = (name?: string) => {
    const playlistName = name || `My Playlist #${playlists.length + 1}`;
    const newPlaylist: Playlist = {
      id: `p${Date.now()}`,
      name: playlistName,
      songs: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setPlaylists([...playlists, newPlaylist]);
  };

  const handleDeletePlaylist = (id: string) => {
    setPlaylists(playlists.filter((p) => p.id !== id));
  };

  const handleRenamePlaylist = (id: string, newName: string) => {
    setPlaylists(
      playlists.map((p) =>
        p.id === id ? { ...p, name: newName, updatedAt: new Date() } : p
      )
    );
  };

  const handleAddToPlaylist = (song: Song) => {
    console.log('Add to playlist:', song);
  };

  const handleDownloadSong = (song: Song) => {
    console.log('Download song:', song.title, '(stub - will interface with backend)');
  };

  return (
    <div className="bg-gradient-to-b from-gray-900 to-black min-h-full pb-32">
      {/* Header */}
      <div className="p-8 pb-0">
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setViewMode('library')}
            className={`px-6 py-2 rounded-full font-semibold transition-colors ${
              viewMode === 'library'
                ? 'bg-white text-black'
                : 'bg-gray-800 text-white hover:bg-gray-700'
            }`}
          >
            Library
          </button>
          <button
            onClick={() => setViewMode('playlists')}
            className={`px-6 py-2 rounded-full font-semibold transition-colors ${
              viewMode === 'playlists'
                ? 'bg-white text-black'
                : 'bg-gray-800 text-white hover:bg-gray-700'
            }`}
          >
            Playlists
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'library' ? (
        <div className="p-8 pt-4">
          <h1 className="text-4xl font-bold mb-8">Your Library</h1>
          <SongList
            songs={songs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onSongClick={handleSongClick}
            onAddToPlaylist={handleAddToPlaylist}
            onDownload={handleDownloadSong}
          />
        </div>
      ) : (
        <PlaylistView
          playlists={playlists}
          onCreatePlaylist={handleCreatePlaylist}
          onDeletePlaylist={handleDeletePlaylist}
          onRenamePlaylist={handleRenamePlaylist}
        />
      )}
    </div>
  );
}
