'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
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
  const [volume, setVolume] = useState(70);
  const [isMuted, setIsMuted] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const onSongEndRef = useRef(onSongEnd);

  const duration = currentSong?.duration || 0;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Keep the ref updated with the latest callback
  useEffect(() => {
    onSongEndRef.current = onSongEnd;
  }, [onSongEnd]);

  useEffect(() => {
    if (isPlaying && currentSong) {
      const interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration - 1) {
            if (onSongEndRef.current) {
              onSongEndRef.current();
            }
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCurrentTime(0);
    }
  }, [isPlaying, currentSong, duration]);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !currentSong) return;
    const bounds = progressRef.current.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const percentage = x / bounds.width;
    setCurrentTime(Math.floor(percentage * duration));
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
    <div className="h-24 bg-gray-900 border-t border-gray-800 px-4 flex items-center justify-between">
      {/* Song Info with Like/Dislike */}
      <div className="flex items-center gap-4 w-1/4">
        {currentSong.albumArt && (
          <Image
            src={currentSong.albumArt}
            alt={currentSong.title}
            width={56}
            height={56}
            className="rounded"
          />
        )}
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
            onClick={onPrevious}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <BackwardIcon className="w-5 h-5" />
          </button>

          {/* Play/Pause Button */}
          <button
            onClick={onPlayPause}
            className="bg-white text-black rounded-full p-2 hover:scale-105 transition-transform"
          >
            {isPlaying ? (
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
          <div
            ref={progressRef}
            onClick={handleProgressClick}
            className="flex-1 h-1 bg-gray-700 rounded-full cursor-pointer group"
          >
            <div
              className="h-full bg-white rounded-full relative group-hover:bg-pink-500 transition-colors"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <span className="text-xs text-gray-400 w-10">
            {formatDuration(duration)}
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
          className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer volume-slider"
        />
      </div>
    </div>
  );
}
