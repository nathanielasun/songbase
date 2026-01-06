'use client';

import { useState, useCallback, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import MusicPlayer from '@/components/MusicPlayer';
import SongList from '@/components/SongList';
import PlaylistView from '@/components/PlaylistView';
import { Song, Playlist, RepeatMode } from '@/lib/types';
import { mockSongs, mockPlaylists } from '@/lib/mockData';

type ViewMode = 'library' | 'playlists';

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function Home() {
  const [songs, setSongs] = useState<Song[]>(mockSongs);
  const [playlists, setPlaylists] = useState<Playlist[]>(mockPlaylists);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [originalQueue, setOriginalQueue] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('library');
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [shuffleEnabled, setShuffleEnabled] = useState(false);

  const handleSongClick = (song: Song) => {
    if (currentSong?.id === song.id) {
      setIsPlaying(!isPlaying);
    } else {
      const newQueue = shuffleEnabled ? shuffleArray(songs) : songs;
      const songIndex = newQueue.findIndex((s) => s.id === song.id);

      setCurrentSong(song);
      setIsPlaying(true);
      setQueue(newQueue);
      setOriginalQueue(songs);
      setCurrentIndex(songIndex);
    }
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleNext = useCallback(() => {
    if (queue.length === 0) return;

    const nextIndex = (currentIndex + 1) % queue.length;
    setCurrentIndex(nextIndex);
    setCurrentSong(queue[nextIndex]);
    setIsPlaying(true);
  }, [queue, currentIndex]);

  const handlePrevious = () => {
    if (queue.length === 0) return;
    const prevIndex = currentIndex === 0 ? queue.length - 1 : currentIndex - 1;
    setCurrentIndex(prevIndex);
    setCurrentSong(queue[prevIndex]);
    setIsPlaying(true);
  };

  const handleSongEnd = useCallback(() => {
    if (repeatMode === 'once') {
      // Song will restart automatically since currentTime resets to 0
      // Just keep playing
      return;
    } else if (repeatMode === 'all') {
      // Move to next song
      if (queue.length === 0) return;
      const nextIndex = (currentIndex + 1) % queue.length;
      setCurrentIndex(nextIndex);
      setCurrentSong(queue[nextIndex]);
      setIsPlaying(true);
    } else {
      // Repeat off - play next or stop at end
      if (currentIndex < queue.length - 1) {
        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);
        setCurrentSong(queue[nextIndex]);
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
      }
    }
  }, [repeatMode, currentIndex, queue]);

  const handleRepeatToggle = () => {
    const modes: RepeatMode[] = ['off', 'all', 'once'];
    const currentModeIndex = modes.indexOf(repeatMode);
    const nextMode = modes[(currentModeIndex + 1) % modes.length];
    setRepeatMode(nextMode);
  };

  const handleShuffleToggle = () => {
    const newShuffleState = !shuffleEnabled;
    setShuffleEnabled(newShuffleState);

    if (queue.length > 0) {
      if (newShuffleState) {
        const currentSongInQueue = queue[currentIndex];
        const shuffledQueue = shuffleArray(queue);
        const newIndex = shuffledQueue.findIndex((s) => s.id === currentSongInQueue.id);
        setQueue(shuffledQueue);
        setCurrentIndex(newIndex);
      } else {
        const currentSongInQueue = queue[currentIndex];
        const newIndex = originalQueue.findIndex((s) => s.id === currentSongInQueue.id);
        setQueue(originalQueue);
        setCurrentIndex(newIndex);
      }
    }
  };

  const handleLike = (songId: string) => {
    setSongs((prevSongs) =>
      prevSongs.map((song) =>
        song.id === songId
          ? { ...song, liked: !song.liked, disliked: false }
          : song
      )
    );

    if (currentSong?.id === songId) {
      setCurrentSong((prev) =>
        prev ? { ...prev, liked: !prev.liked, disliked: false } : null
      );
    }

    console.log(`Song ${songId} liked status toggled (stub - will interface with backend)`);
  };

  const handleDislike = (songId: string) => {
    setSongs((prevSongs) =>
      prevSongs.map((song) =>
        song.id === songId
          ? { ...song, disliked: !song.disliked, liked: false }
          : song
      )
    );

    if (currentSong?.id === songId) {
      setCurrentSong((prev) =>
        prev ? { ...prev, disliked: !prev.disliked, liked: false } : null
      );
    }

    console.log(`Song ${songId} disliked status toggled (stub - will interface with backend)`);
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
        </main>
      </div>

      {/* Music Player */}
      <MusicPlayer
        currentSong={currentSong}
        isPlaying={isPlaying}
        repeatMode={repeatMode}
        shuffleEnabled={shuffleEnabled}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onRepeatToggle={handleRepeatToggle}
        onShuffleToggle={handleShuffleToggle}
        onLike={handleLike}
        onDislike={handleDislike}
        onSongEnd={handleSongEnd}
      />
    </div>
  );
}
