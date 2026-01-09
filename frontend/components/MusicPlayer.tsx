'use client';

import { useState, useRef, useEffect } from 'react';
import {
  PlayIcon,
  PauseIcon,
  ForwardIcon,
  BackwardIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  HeartIcon,
  HandThumbDownIcon,
} from '@heroicons/react/24/solid';
import {
  ArrowPathIcon as ArrowPathOutlineIcon,
  ArrowsRightLeftIcon as ArrowsRightLeftOutlineIcon,
  HeartIcon as HeartOutlineIcon,
  HandThumbDownIcon as HandThumbDownOutlineIcon,
} from '@heroicons/react/24/outline';
import { Song, RepeatMode } from '@/lib/types';
import { formatDuration } from '@/lib/mockData';

interface MusicPlayerProps {
  currentSong: Song | null;
  isPlaying: boolean;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  playbackVersion: number;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRepeatToggle: () => void;
  onShuffleToggle: () => void;
  onLike: (songId: string) => void;
  onDislike: (songId: string) => void;
  onSongEnd?: () => void;
}

export default function MusicPlayer({
  currentSong,
  isPlaying,
  repeatMode,
  shuffleEnabled,
  playbackVersion,
  onPlayPause,
  onNext,
  onPrevious,
  onRepeatToggle,
  onShuffleToggle,
  onLike,
  onDislike,
  onSongEnd,
}: MusicPlayerProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(70);
  const [isMuted, setIsMuted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const onSongEndRef = useRef(onSongEnd);
  const isPlayingRef = useRef(isPlaying);
  const repeatModeRef = useRef(repeatMode);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Keep the ref updated with the latest callback
  useEffect(() => {
    onSongEndRef.current = onSongEnd;
  }, [onSongEnd]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  // Load audio source when song changes or playback version changes
  useEffect(() => {
    if (!audioRef.current || !currentSong) return;

    const audio = audioRef.current;
    const streamUrl = `/api/library/stream/${currentSong.hashId}`;

    console.log('Loading audio:', streamUrl, 'version:', playbackVersion);

    audio.pause();
    audio.src = streamUrl;
    audio.load();
    setCurrentTime(0);
    setDuration(0);
    setIsBuffering(true);

    // Set up one-time listener for when metadata is loaded
    const handleLoadedMetadata = () => {
      console.log('Audio metadata loaded, duration:', audio.duration);
      setDuration(audio.duration || 0);
      setIsBuffering(false);

      if (isPlayingRef.current) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.error('Playback failed:', error);
            setIsBuffering(false);
          });
        }
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [currentSong?.hashId, playbackVersion]);

  // Handle play/pause
  useEffect(() => {
    if (!audioRef.current) return;

    const audio = audioRef.current;

    if (isPlaying) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.error('Playback failed:', error);
        });
      }
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  // Handle volume and mute
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = isMuted ? 0 : volume / 100;
  }, [volume, isMuted]);

  // Set up audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleDurationChange = () => {
      const newDuration = audio.duration || 0;
      console.log('Duration changed:', newDuration);
      setDuration(newDuration);
    };

    const handlePlaying = () => {
      console.log('Audio is playing');
      setIsBuffering(false);
    };

    const handleEnded = () => {
      console.log('Audio ended');
      if (repeatModeRef.current === 'once') {
        console.log('Repeating song (once mode)');
        audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.error('Repeat playback failed:', error);
          });
        }
      } else if (onSongEndRef.current) {
        onSongEndRef.current();
      }
    };

    const handleCanPlay = () => {
      console.log('Audio can play');
      setIsBuffering(false);
    };

    const handleWaiting = () => {
      console.log('Audio waiting/buffering');
      setIsBuffering(true);
    };

    const handlePause = () => {
      console.log('Audio paused');
    };

    const handleSeeking = () => {
      console.log('Audio seeking');
      setIsBuffering(true);
    };

    const handleSeeked = () => {
      console.log('Audio seeked');
      setIsBuffering(false);
    };

    const handleError = (e: Event) => {
      console.error('Audio error:', e);
      const audioElement = e.target as HTMLAudioElement;
      if (audioElement.error) {
        console.error('Error code:', audioElement.error.code);
        console.error('Error message:', audioElement.error.message);
      }
      setIsBuffering(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('seeking', handleSeeking);
    audio.addEventListener('seeked', handleSeeked);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('seeking', handleSeeking);
      audio.removeEventListener('seeked', handleSeeked);
      audio.removeEventListener('error', handleError);
    };
  }, [currentSong]);

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentSong || !audioRef.current) return;

    const audio = audioRef.current;
    const newTime = parseFloat(e.target.value);

    // Only allow seeking if audio is ready
    if (audio.readyState >= 2) { // HAVE_CURRENT_DATA or greater
      console.log('Seeking to:', newTime);
      audio.currentTime = newTime;
      setCurrentTime(newTime);
    } else {
      console.warn('Audio not ready for seeking, readyState:', audio.readyState);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handlePrevious = () => {
    if (!audioRef.current) {
      onPrevious();
      return;
    }

    // If more than 3 seconds into the song, restart it instead of going to previous
    if (currentTime > 3) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    } else {
      onPrevious();
    }
  };

  const handleLike = () => {
    if (currentSong) {
      onLike(currentSong.id);
    }
  };

  const handleDislike = () => {
    if (currentSong) {
      onDislike(currentSong.id);
    }
  };

  if (!currentSong) {
    return (
      <div className="h-24 bg-gray-900 border-t border-gray-800 flex items-center justify-center text-gray-500">
        Select a song to start playing
      </div>
    );
  }

  const isLiked = currentSong.liked || false;
  const isDisliked = currentSong.disliked || false;

  return (
    <>
      {/* Hidden audio element for actual playback */}
      <audio ref={audioRef} preload="auto" />

      <div className="h-24 bg-gray-900 border-t border-gray-800 px-4 flex items-center justify-between">
      {/* Song Info with Like/Dislike */}
      <div className="flex items-center gap-4 w-1/4">
        {currentSong.albumArt ? (
          <img
            src={currentSong.albumArt}
            alt=""
            width={56}
            height={56}
            className="rounded object-cover bg-gray-800"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const placeholder = e.currentTarget.nextElementSibling;
              if (placeholder) {
                (placeholder as HTMLElement).style.display = 'block';
              }
            }}
          />
        ) : null}
        <div
          className="w-14 h-14 rounded bg-gray-800 flex-shrink-0"
          style={{ display: currentSong.albumArt ? 'none' : 'block' }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">{currentSong.title}</p>
          <p className="text-gray-400 text-xs truncate">{currentSong.artist}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleLike}
            className={`transition-colors ${
              isLiked ? 'text-pink-500' : 'text-gray-400 hover:text-pink-500'
            }`}
            title={isLiked ? 'Unlike' : 'Like'}
          >
            {isLiked ? (
              <HeartIcon className="w-5 h-5" />
            ) : (
              <HeartOutlineIcon className="w-5 h-5" />
            )}
          </button>
          <button
            onClick={handleDislike}
            className={`transition-colors ${
              isDisliked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'
            }`}
            title={isDisliked ? 'Remove dislike' : 'Dislike'}
          >
            {isDisliked ? (
              <HandThumbDownIcon className="w-5 h-5" />
            ) : (
              <HandThumbDownOutlineIcon className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Player Controls */}
      <div className="flex flex-col items-center gap-2 w-2/4">
        <div className="flex items-center gap-4">
          {/* Shuffle Button */}
          <button
            onClick={onShuffleToggle}
            className={`transition-colors ${
              shuffleEnabled ? 'text-pink-500' : 'text-gray-400 hover:text-white'
            }`}
            title={shuffleEnabled ? 'Shuffle on' : 'Shuffle off'}
          >
            {shuffleEnabled ? (
              <ArrowsRightLeftIcon className="w-4 h-4" />
            ) : (
              <ArrowsRightLeftOutlineIcon className="w-4 h-4" />
            )}
          </button>

          {/* Previous Button */}
          <button
            onClick={handlePrevious}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <BackwardIcon className="w-5 h-5" />
          </button>

          {/* Play/Pause Button */}
          <button
            onClick={onPlayPause}
            disabled={isBuffering}
            className="bg-white text-black rounded-full p-2 hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBuffering ? (
              <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <PauseIcon className="w-5 h-5" />
            ) : (
              <PlayIcon className="w-5 h-5" />
            )}
          </button>

          {/* Next Button */}
          <button
            onClick={onNext}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <ForwardIcon className="w-5 h-5" />
          </button>

          {/* Repeat Button */}
          <button
            onClick={onRepeatToggle}
            className={`relative transition-colors ${
              repeatMode !== 'off' ? 'text-pink-500' : 'text-gray-400 hover:text-white'
            }`}
            title={
              repeatMode === 'off'
                ? 'Repeat off'
                : repeatMode === 'once'
                ? 'Repeat once'
                : 'Repeat all'
            }
          >
            {repeatMode !== 'off' ? (
              <ArrowPathIcon className="w-4 h-4" />
            ) : (
              <ArrowPathOutlineIcon className="w-4 h-4" />
            )}
            {repeatMode === 'once' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold">
                1
              </span>
            )}
          </button>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-2 w-full">
          <span className="text-xs text-gray-400 w-10 text-right">
            {formatDuration(Math.floor(currentTime))}
          </span>
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleProgressChange}
            disabled={duration === 0}
            className="flex-1 progress-slider disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ '--progress-width': `${progress}%` } as React.CSSProperties}
          />
          <span className="text-xs text-gray-400 w-10">
            {formatDuration(Math.floor(duration))}
          </span>
        </div>
      </div>

      {/* Volume Control */}
      <div className="flex items-center gap-2 w-1/4 justify-end">
        <button onClick={toggleMute} className="text-gray-400 hover:text-white transition-colors">
          {isMuted || volume === 0 ? (
            <SpeakerXMarkIcon className="w-5 h-5" />
          ) : (
            <SpeakerWaveIcon className="w-5 h-5" />
          )}
        </button>
        <input
          type="range"
          min="0"
          max="100"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="w-6 volume-slider"
          style={{ '--volume-width': `${isMuted ? 0 : volume}%` } as React.CSSProperties}
        />
      </div>
    </div>
    </>
  );
}
