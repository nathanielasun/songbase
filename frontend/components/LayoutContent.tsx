'use client';

import { ReactNode, useState, useMemo } from 'react';
import { MusicPlayerProvider, useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { PlaylistProvider, usePlaylist } from '@/contexts/PlaylistContext';
import { UserPreferencesProvider, useUserPreferences } from '@/contexts/UserPreferencesContext';
import MusicPlayer from './MusicPlayer';
import Sidebar from './Sidebar';
import Queue from './Queue';
import Toast from './Toast';
import CreatePlaylistModal from './CreatePlaylistModal';
import { QueueListIcon } from '@heroicons/react/24/outline';

function PlayerWrapper() {
  const {
    currentSong,
    isPlaying,
    repeatMode,
    shuffleEnabled,
    playbackVersion,
    togglePlayPause,
    playNext,
    playPrevious,
    toggleRepeat,
    toggleShuffle,
    handleSongEnd,
    // Playback tracking
    trackPlayStart,
    trackPause,
    trackResume,
    trackSeek,
    trackSongComplete,
    trackSongEnd,
  } = useMusicPlayer();

  const { likeSong, dislikeSong, isLiked, isDisliked } = useUserPreferences();

  // Enrich current song with preference state
  const enrichedCurrentSong = useMemo(() => {
    if (!currentSong) return null;
    return {
      ...currentSong,
      liked: isLiked(currentSong.id),
      disliked: isDisliked(currentSong.id),
    };
  }, [currentSong, isLiked, isDisliked]);

  return (
    <MusicPlayer
      currentSong={enrichedCurrentSong}
      isPlaying={isPlaying}
      repeatMode={repeatMode}
      shuffleEnabled={shuffleEnabled}
      playbackVersion={playbackVersion}
      onPlayPause={togglePlayPause}
      onNext={playNext}
      onPrevious={playPrevious}
      onRepeatToggle={toggleRepeat}
      onShuffleToggle={toggleShuffle}
      onLike={likeSong}
      onDislike={dislikeSong}
      onSongEnd={handleSongEnd}
      onTrackPlayStart={trackPlayStart}
      onTrackPause={trackPause}
      onTrackResume={trackResume}
      onTrackSeek={trackSeek}
      onTrackComplete={trackSongComplete}
      onTrackEnd={trackSongEnd}
    />
  );
}

function ToastWrapper() {
  const { toastMessage, clearToast } = useMusicPlayer();

  if (!toastMessage) return null;

  return <Toast message={toastMessage} onClose={clearToast} />;
}

function LayoutContentInner({ children }: { children: ReactNode }) {
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { playlists, createPlaylist } = usePlaylist();

  const handleCreatePlaylist = () => {
    setIsCreateModalOpen(true);
  };

  const handleCreateSubmit = (name: string, description?: string) => {
    createPlaylist(name, description);
  };

  return (
    <div className="h-screen flex flex-col bg-black text-white">
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar playlists={playlists} onCreatePlaylist={handleCreatePlaylist} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>

        {/* Queue Toggle Button */}
        <button
          onClick={() => setIsQueueOpen(!isQueueOpen)}
          className="fixed bottom-32 right-6 z-30 bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-full shadow-lg transition-colors"
          title="Toggle Queue"
        >
          <QueueListIcon className="w-6 h-6" />
        </button>

        {/* Queue Panel */}
        <Queue isOpen={isQueueOpen} onToggle={() => setIsQueueOpen(!isQueueOpen)} />
      </div>
      <PlayerWrapper />
      <ToastWrapper />

      {/* Modals */}
      <CreatePlaylistModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateSubmit}
      />
    </div>
  );
}

export default function LayoutContent({ children }: { children: ReactNode }) {
  return (
    <UserPreferencesProvider>
      <PlaylistProvider>
        <MusicPlayerProvider>
          <LayoutContentInner>{children}</LayoutContentInner>
        </MusicPlayerProvider>
      </PlaylistProvider>
    </UserPreferencesProvider>
  );
}
