'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import MusicPlayer from '@/components/MusicPlayer';
import SongList from '@/components/SongList';
import PlaylistView from '@/components/PlaylistView';
import { Song, Playlist } from '@/lib/types';
import { mockSongs, mockPlaylists } from '@/lib/mockData';

type ViewMode = 'library' | 'playlists';

export default function Home() {
  const [songs] = useState<Song[]>(mockSongs);
  const [playlists, setPlaylists] = useState<Playlist[]>(mockPlaylists);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('library');

  const handleSongClick = (song: Song) => {
    if (currentSong?.id === song.id) {
      setIsPlaying(!isPlaying);
    } else {
      setCurrentSong(song);
      setIsPlaying(true);
      const songIndex = songs.findIndex((s) => s.id === song.id);
      setQueue(songs);
      setCurrentIndex(songIndex);
    }
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleNext = () => {
    if (queue.length === 0) return;
    const nextIndex = (currentIndex + 1) % queue.length;
    setCurrentIndex(nextIndex);
    setCurrentSong(queue[nextIndex]);
    setIsPlaying(true);
  };

  const handlePrevious = () => {
    if (queue.length === 0) return;
    const prevIndex = currentIndex === 0 ? queue.length - 1 : currentIndex - 1;
    setCurrentIndex(prevIndex);
    setCurrentSong(queue[prevIndex]);
    setIsPlaying(true);
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

  return (
    <div className="h-screen flex flex-col bg-black text-white">
      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar playlists={playlists} onCreatePlaylist={() => handleCreatePlaylist()} />

        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-gradient-to-b from-gray-900 to-black">
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
        </main>
      </div>

      {/* Music Player */}
      <MusicPlayer
        currentSong={currentSong}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrevious={handlePrevious}
      />
    </div>
  );
}
