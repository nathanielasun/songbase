'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { Song, RepeatMode } from '@/lib/types';

// Playback tracking types
interface PlayContext {
  type: 'radio' | 'playlist' | 'album' | 'artist' | 'search' | 'queue' | 'for-you' | 'liked';
  id: string;
  name?: string;
}

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
  playContext: PlayContext | null;
  currentSessionId: string | null;
  playSong: (song: Song, songList?: Song[], context?: PlayContext) => void;
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
  // Playback tracking methods
  trackPlayStart: (positionMs: number) => void;
  trackPause: (positionMs: number) => void;
  trackResume: (positionMs: number) => void;
  trackSeek: (positionMs: number) => void;
  trackSongComplete: (positionMs: number) => void;
  trackSongEnd: (positionMs: number, reason: string) => void;
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

  // Playback tracking state
  const [playContext, setPlayContext] = useState<PlayContext | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Keep ref in sync with state for use in beforeunload
  useEffect(() => {
    sessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // Handle page unload - send beacon to end session
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionIdRef.current) {
        const payload = JSON.stringify({
          session_id: sessionIdRef.current,
          final_position_ms: 0, // We don't have access to exact position here
          reason: 'page_close',
        });
        navigator.sendBeacon('/api/play/end', payload);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Playback tracking methods
  const trackPlayStart = useCallback(async (positionMs: number) => {
    if (!currentSong) return;

    // End previous session if exists
    if (currentSessionId) {
      try {
        await fetch('/api/play/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: currentSessionId,
            final_position_ms: positionMs,
            reason: 'next_song',
          }),
        });
      } catch (e) {
        console.error('Failed to end previous session:', e);
      }
    }

    try {
      const response = await fetch('/api/play/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sha_id: currentSong.hashId,
          context_type: playContext?.type,
          context_id: playContext?.id,
          position_ms: positionMs,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentSessionId(data.session_id);
      }
    } catch (e) {
      console.error('Failed to start play session:', e);
    }
  }, [currentSong, currentSessionId, playContext]);

  const trackPause = useCallback(async (positionMs: number) => {
    if (!currentSessionId) return;

    try {
      await fetch('/api/play/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSessionId,
          event_type: 'pause',
          position_ms: positionMs,
        }),
      });
    } catch (e) {
      console.error('Failed to track pause:', e);
    }
  }, [currentSessionId]);

  const trackResume = useCallback(async (positionMs: number) => {
    if (!currentSessionId) return;

    try {
      await fetch('/api/play/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSessionId,
          event_type: 'resume',
          position_ms: positionMs,
        }),
      });
    } catch (e) {
      console.error('Failed to track resume:', e);
    }
  }, [currentSessionId]);

  const trackSeek = useCallback(async (positionMs: number) => {
    if (!currentSessionId) return;

    try {
      await fetch('/api/play/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSessionId,
          event_type: 'seek',
          position_ms: positionMs,
        }),
      });
    } catch (e) {
      console.error('Failed to track seek:', e);
    }
  }, [currentSessionId]);

  const trackSongComplete = useCallback(async (positionMs: number) => {
    if (!currentSessionId) return;

    try {
      await fetch('/api/play/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSessionId,
          final_position_ms: positionMs,
        }),
      });
      setCurrentSessionId(null);
    } catch (e) {
      console.error('Failed to track song complete:', e);
    }
  }, [currentSessionId]);

  const trackSongEnd = useCallback(async (positionMs: number, reason: string) => {
    if (!currentSessionId) return;

    try {
      await fetch('/api/play/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSessionId,
          final_position_ms: positionMs,
          reason,
        }),
      });
      setCurrentSessionId(null);
    } catch (e) {
      console.error('Failed to track song end:', e);
    }
  }, [currentSessionId]);

  const playSong = useCallback((song: Song, songList?: Song[], context?: PlayContext) => {
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

      // Set play context for tracking
      if (context) {
        setPlayContext(context);
      } else {
        setPlayContext(null);
      }
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
        playContext,
        currentSessionId,
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
        trackPlayStart,
        trackPause,
        trackResume,
        trackSeek,
        trackSongComplete,
        trackSongEnd,
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
