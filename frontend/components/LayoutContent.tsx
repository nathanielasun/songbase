'use client';

import { ReactNode } from 'react';
import { MusicPlayerProvider, useMusicPlayer } from '@/contexts/MusicPlayerContext';
import MusicPlayer from './MusicPlayer';
import Sidebar from './Sidebar';
import { mockPlaylists } from '@/lib/mockData';

function PlayerWrapper() {
  const {
    currentSong,
    isPlaying,
    repeatMode,
    shuffleEnabled,
    togglePlayPause,
    playNext,
    playPrevious,
    toggleRepeat,
    toggleShuffle,
    likeSong,
    dislikeSong,
    handleSongEnd,
  } = useMusicPlayer();

  return (
    <MusicPlayer
      currentSong={currentSong}
      isPlaying={isPlaying}
      repeatMode={repeatMode}
      shuffleEnabled={shuffleEnabled}
      onPlayPause={togglePlayPause}
      onNext={playNext}
      onPrevious={playPrevious}
      onRepeatToggle={toggleRepeat}
      onShuffleToggle={toggleShuffle}
      onLike={likeSong}
      onDislike={dislikeSong}
      onSongEnd={handleSongEnd}
    />
  );
}

export default function LayoutContent({ children }: { children: ReactNode }) {
  const handleCreatePlaylist = () => {
    console.log('Create playlist (stub - will interface with backend)');
  };

  return (
    <MusicPlayerProvider>
      <div className="h-screen flex flex-col bg-black text-white">
        <div className="flex-1 flex overflow-hidden">
          <Sidebar playlists={mockPlaylists} onCreatePlaylist={handleCreatePlaylist} />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
        <PlayerWrapper />
      </div>
    </MusicPlayerProvider>
  );
}
