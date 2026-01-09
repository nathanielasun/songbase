'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Song, RepeatMode } from '@/lib/types';

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface MusicPlayerContextType {
  currentSong: Song | null;
  isPlaying: boolean;
  queue: Song[];
  currentIndex: number;
  upNextQueue: Song[];
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  toastMessage: string | null;
  playbackVersion: number;
  playSong: (song: Song, songList?: Song[]) => void;
  togglePlayPause: () => void;
  playNext: () => void;
  playPrevious: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  handleSongEnd: () => void;
  likeSong: (songId: string) => void;
  dislikeSong: (songId: string) => void;
  addToQueue: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  playFromQueue: (index: number) => void;
  clearToast: () => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined);

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [originalQueue, setOriginalQueue] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [upNextQueue, setUpNextQueue] = useState<Song[]>([]);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [playbackVersion, setPlaybackVersion] = useState(0);

  const playSong = useCallback((song: Song, songList?: Song[]) => {
    if (currentSong?.id === song.id) {
      setIsPlaying(!isPlaying);
    } else {
      const newQueue = songList || [song];
      const shuffledQueue = shuffleEnabled ? shuffleArray(newQueue) : newQueue;
      const songIndex = shuffledQueue.findIndex((s) => s.id === song.id);

      setCurrentSong(song);
      setIsPlaying(true);
      setQueue(shuffledQueue);
      setOriginalQueue(newQueue);
      setCurrentIndex(songIndex);
      setPlaybackVersion(prev => prev + 1);
    }
  }, [currentSong, isPlaying, shuffleEnabled]);

  const togglePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const playNext = useCallback(() => {
    // If repeat once is enabled, restart the current song
    if (repeatMode === 'once' && currentSong) {
      setPlaybackVersion(prev => prev + 1);
      setIsPlaying(true);
      return;
    }

    // Check if there are songs in the "Up Next" queue
    if (upNextQueue.length > 0) {
      const nextSong = upNextQueue[0];
      setUpNextQueue(prev => prev.slice(1));
      setCurrentSong(nextSong);
      setIsPlaying(true);
      setPlaybackVersion(prev => prev + 1);
      return;
    }

    // Otherwise, play from the main queue
    if (queue.length === 0) return;

    const nextIndex = (currentIndex + 1) % queue.length;
    setCurrentIndex(nextIndex);
    setCurrentSong(queue[nextIndex]);
    setIsPlaying(true);
    setPlaybackVersion(prev => prev + 1);
  }, [queue, currentIndex, upNextQueue, repeatMode, currentSong]);

  const playPrevious = useCallback(() => {
    if (queue.length === 0) return;
    const prevIndex = currentIndex === 0 ? queue.length - 1 : currentIndex - 1;
    setCurrentIndex(prevIndex);
    setCurrentSong(queue[prevIndex]);
    setIsPlaying(true);
    setPlaybackVersion(prev => prev + 1);
  }, [queue, currentIndex]);

  const handleSongEnd = useCallback(() => {
    if (repeatMode === 'once') {
      // Song will restart automatically since currentTime resets to 0
      return;
    }

    // Check if there are songs in the "Up Next" queue
    if (upNextQueue.length > 0) {
      const nextSong = upNextQueue[0];
      setUpNextQueue(prev => prev.slice(1));
      setCurrentSong(nextSong);
      setIsPlaying(true);
      return;
    }

    if (repeatMode === 'all') {
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
  }, [repeatMode, currentIndex, queue, upNextQueue]);

  const toggleRepeat = useCallback(() => {
    const modes: RepeatMode[] = ['off', 'all', 'once'];
    const currentModeIndex = modes.indexOf(repeatMode);
    const nextMode = modes[(currentModeIndex + 1) % modes.length];
    setRepeatMode(nextMode);
  }, [repeatMode]);

  const toggleShuffle = useCallback(() => {
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
  }, [shuffleEnabled, queue, currentIndex, originalQueue]);

  const likeSong = useCallback((songId: string) => {
    // Update current song if it's the one being liked
    setCurrentSong((prev) =>
      prev && prev.id === songId
        ? { ...prev, liked: !prev.liked, disliked: false }
        : prev
    );

    // Update in queue
    setQueue((prevQueue) =>
      prevQueue.map((song) =>
        song.id === songId
          ? { ...song, liked: !song.liked, disliked: false }
          : song
      )
    );

    console.log(`Song ${songId} liked status toggled (stub - will interface with backend)`);
  }, []);

  const dislikeSong = useCallback((songId: string) => {
    // Update current song if it's the one being disliked
    setCurrentSong((prev) =>
      prev && prev.id === songId
        ? { ...prev, disliked: !prev.disliked, liked: false }
        : prev
    );

    // Update in queue
    setQueue((prevQueue) =>
      prevQueue.map((song) =>
        song.id === songId
          ? { ...song, disliked: !song.disliked, liked: false }
          : song
      )
    );

    console.log(`Song ${songId} disliked status toggled (stub - will interface with backend)`);
  }, []);

  const addToQueue = useCallback((song: Song) => {
    setUpNextQueue((prev) => [...prev, song]);
    setToastMessage(`Added "${song.title}" to queue`);
    console.log(`Added "${song.title}" to queue`);
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setUpNextQueue((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearQueue = useCallback(() => {
    setUpNextQueue([]);
  }, []);

  const playFromQueue = useCallback((index: number) => {
    const song = upNextQueue[index];
    if (song) {
      setCurrentSong(song);
      setIsPlaying(true);
      setUpNextQueue((prev) => prev.filter((_, i) => i !== index));
      setPlaybackVersion(prev => prev + 1);
    }
  }, [upNextQueue]);

  const clearToast = useCallback(() => {
    setToastMessage(null);
  }, []);

  return (
    <MusicPlayerContext.Provider
      value={{
        currentSong,
        isPlaying,
        queue,
        currentIndex,
        upNextQueue,
        repeatMode,
        shuffleEnabled,
        toastMessage,
        playbackVersion,
        playSong,
        togglePlayPause,
        playNext,
        playPrevious,
        toggleRepeat,
        toggleShuffle,
        handleSongEnd,
        likeSong,
        dislikeSong,
        addToQueue,
        removeFromQueue,
        clearQueue,
        playFromQueue,
        clearToast,
      }}
    >
      {children}
    </MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext);
  if (context === undefined) {
    throw new Error('useMusicPlayer must be used within a MusicPlayerProvider');
  }
  return context;
}
