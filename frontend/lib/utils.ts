import { Song } from './types';

/**
 * Format a duration in seconds to MM:SS format
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format a Date object to a readable string
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Calculate the total duration of an array of songs
 */
export function getTotalDuration(songs: Song[]): number {
  return songs.reduce((total, song) => total + (song.duration || 0), 0);
}
