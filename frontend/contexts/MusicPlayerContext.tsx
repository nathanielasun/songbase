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
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  playSong: (song: Song, songList?: Song[]) => void;
  togglePlayPause: () => void;
  playNext: () => void;
  playPrevious: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  handleSongEnd: () => void;
  likeSong: (songId: string) => void;
  dislikeSong: (songId: string) => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined);

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [originalQueue, setOriginalQueue] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [shuffleEnabled, setShuffleEnabled] = useState(false);

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
    }
  }, [currentSong, isPlaying, shuffleEnabled]);

  const togglePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const playNext = useCallback(() => {
    if (queue.length === 0) return;

    const nextIndex = (currentIndex + 1) % queue.length;
    setCurrentIndex(nextIndex);
    setCurrentSong(queue[nextIndex]);
    setIsPlaying(true);
  }, [queue, currentIndex]);

  const playPrevious = useCallback(() => {
    if (queue.length === 0) return;
    const prevIndex = currentIndex === 0 ? queue.length - 1 : currentIndex - 1;
    setCurrentIndex(prevIndex);
    setCurrentSong(queue[prevIndex]);
    setIsPlaying(true);
  }, [queue, currentIndex]);

  const handleSongEnd = useCallback(() => {
    if (repeatMode === 'once') {
      // Song will restart automatically since currentTime resets to 0
      return;
    } else if (repeatMode === 'all') {
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

  return (
    <MusicPlayerContext.Provider
      value={{
        currentSong,
        isPlaying,
        queue,
        currentIndex,
        repeatMode,
        shuffleEnabled,
        playSong,
        togglePlayPause,
        playNext,
        playPrevious,
        toggleRepeat,
        toggleShuffle,
        handleSongEnd,
        likeSong,
        dislikeSong,
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
